<script lang="ts">
  import { onMount } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import IntegrationCard from "./IntegrationCard.svelte";
  import Icon from "./Icon.svelte";
  import McpDialog from "./McpDialog.svelte";
  import logo from "../../../assets/wisp.png";
  import {
    desktop,
    request,
    native,
    type Status,
    type DesktopInfo,
    type Model,
    type Mcp,
    type Panel,
  } from "./api";

  const pages = [
    {
      name: "Overview",
      icon: "home",
      title: "Your companion, connected.",
      caption: "Everything Wisp needs before you head back into the game.",
    },
    {
      name: "Connections",
      icon: "link",
      title: "Your AI, connected.",
      caption: "Manage the AI connections Wisp can use.",
    },
    {
      name: "Integrations",
      icon: "tools",
      title: "Give Wisp more to work with.",
      caption:
        "Connect tools and data sources, then choose what Wisp can access.",
    },
    {
      name: "Panels",
      icon: "panel",
      title: "Keep the useful things close.",
      caption: "Your saved trackers and panels, ready in game.",
    },
    {
      name: "Suggestions",
      icon: "spark",
      title: "A nudge at the right moment.",
      caption: "Choose when Wisp can offer a little guidance on its own.",
    },
    {
      name: "Diagnostics",
      icon: "logs",
      title: "A closer look.",
      caption: "Connection details and local activity when you need them.",
    },
  ];
  let page = $state("Overview");
  let current = $derived(pages.find((p) => p.name === page)!);
  let status = $state<Status | null>(null);
  let info = $state<DesktopInfo | null>(null);
  let loading = $state(true);
  let starting = $state(false);
  let busy = $state("");
  let feedback = $state("");
  let failed = $state(false);
  let wow = $state("");
  let models = $state<Model[]>([]);
  let model = $state("");
  let account = $state("");
  let loadedAccount = "";
  let levelTips = $state(false);
  let weaponTips = $state(false);
  let dirty = $state(false);
  let logs = $state("");
  let dialog = $state(false);
  let editing = $state<Mcp | null>(null);
  let confirm = $state<{ label: string; run: () => Promise<void> } | null>(
    null,
  );
  let polling = false;
  const connected = $derived(status?.auth.status === "connected");
  const active = $derived((status?.activeTurns || 0) > 0);
  const locked = $derived(!!busy || active);

  async function refresh() {
    if (!native || polling) {
      return;
    }
    polling = true;
    try {
      const next = await request<Status>("/status");
      status = next;
      if (next.ready) {
        starting = false;
      }
      if (!account || !next.auth.profiles.some((p) => p.id === account)) {
        account = next.auth.activeId || "";
      }
      if (!model) {
        model = next.model;
      }
      if (!dirty) {
        levelTips = next.suggestions.levelUp;
        weaponTips = next.suggestions.weapon;
      }
      if (
        next.auth.status === "connected" &&
        next.auth.activeId !== loadedAccount &&
        !active &&
        !busy
      ) {
        loadedAccount = next.auth.activeId || "";
        try {
          await loadModels();
        } catch {
          loadedAccount = "";
        }
      }
    } catch {
      status = null;
    } finally {
      loading = false;
      polling = false;
    }
  }
  async function work(
    label: string,
    action: () => Promise<unknown>,
    success?: string,
  ) {
    if (busy) {
      return;
    }
    busy = label;
    failed = false;
    feedback = "";
    try {
      await action();
      feedback = success || feedback || "Done.";
    } catch (e) {
      failed = true;
      feedback = String(e).replace(/^Error: /, "");
    } finally {
      busy = "";
      await refresh();
    }
  }
  async function loadModels() {
    const result = await request<{ models: Model[] }>("/auth/models");
    models = result.models;
    if (!models.some((m) => m.slug === model)) {
      model = status?.model || models[0]?.slug || "";
    }
  }
  async function signIn(add = false) {
    await work(
      "Opening sign-in",
      async () => {
        const result = await request<{ authorizationUrl: string }>(
          "/auth/start",
          {
            profileId: add ? undefined : account || undefined,
            newAccount: add,
          },
        );
        await desktop("open_sign_in", { url: result.authorizationUrl });
      },
      "Continue in your browser. Wisp will update when sign-in completes.",
    );
  }
  async function chooseFolder() {
    const folder = await desktop<string | null>("pick_folder");
    if (folder) {
      wow = folder;
    }
  }
  async function launchBridge() {
    starting = true;
    try {
      await desktop("start_bridge");
    } catch (error) {
      starting = false;
      throw error;
    }
  }
  async function start() {
    starting = true;
    await work("Starting Wisp", () => launchBridge(), "Wisp is starting.");
    if (failed) {
      starting = false;
    }
  }
  async function install() {
    await work(
      "Installing addon",
      async () => {
        feedback = await desktop<string>("install_addon", { wow });
        info = await desktop<DesktopInfo>("desktop_info");
        await launchBridge();
      },
      "Addon installed. Restart WoW after the first installation; use /reload for updates.",
    );
  }
  async function importPrevious() {
    const source = await desktop<string | null>("pick_folder");
    if (!source) {
      return;
    }
    await work(
      "Importing previous installation",
      async () => {
        await desktop("import_legacy", { source });
        info = await desktop<DesktopInfo>("desktop_info");
        wow = info.wow || "";
        await launchBridge();
      },
      "Imported chats, memory and protected credentials. Wisp is starting.",
    );
  }
  async function showLogs() {
    page = "Diagnostics";
    await work(
      "Reading logs",
      async () => {
        logs = await desktop<string>("read_logs");
      },
      "Local logs loaded.",
    );
  }
  async function setIntegration(id: string, enabled: boolean) {
    await work(
      "Updating integration",
      () => request("/integrations/set", { id, enabled }),
      "Integration updated.",
    );
  }
  function edit(server: Mcp | null) {
    editing = server;
    dialog = true;
  }
  async function panelAction(panel: Panel, action: string) {
    await work(
      "Updating panel",
      () =>
        request("/panels/action", {
          action,
          id: panel.id,
          characterKey: panel.characterKey,
        }),
      "Panel updated.",
    );
  }
  function removeMcp(server: Mcp) {
    confirm = {
      label: `Remove “${server.name}”?`,
      run: () =>
        work(
          "Removing connection",
          () => request("/mcps/remove", { name: server.name }),
          "Connection removed.",
        ),
    };
  }
  onMount(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    if (!native) {
      loading = false;
      return;
    }
    void (async () => {
      info = await desktop<DesktopInfo>("desktop_info");
      wow = info.wow || "";
      if (info.configured) {
        starting = true;
        try {
          await launchBridge();
        } catch (e) {
          starting = false;
          failed = true;
          feedback = String(e);
        }
      }
      await refresh();
      if (disposed) {
        return;
      }
      unsubscribe = await listen<string>("desktop-error", (event) => {
        failed = true;
        feedback = event.payload;
      });
    })().catch((e) => {
      failed = true;
      feedback = String(e);
      loading = false;
    });
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
      unsubscribe?.();
    };
  });
</script>

<div class="app-shell">
  <aside>
    <div class="brand">
      <img src={logo} alt="" />
      <div><strong>Wisp</strong><span>AI COMPANION</span></div>
    </div>
    <p class="tagline">A little help in Azeroth.</p>
    <nav aria-label="Main navigation">
      {#each pages as item}<button
          class:selected={page === item.name}
          onclick={() => {
            page = item.name;
            if (page === "Diagnostics") void showLogs();
          }}
          aria-current={page === item.name ? "page" : undefined}
          ><Icon name={item.icon} />{item.name}</button
        >{/each}
    </nav>
    <div class="rail-footer">
      <span class="live-dot" class:online={status?.gameConnected}></span>WOW
      FOREVER<span class="version">v{info?.version || "0.2.2"}</span>
    </div>
  </aside>
  <main>
    <header class="page-header">
      <div>
        <h1>{current.title}</h1>
        <p>{current.caption}</p>
      </div>
      <div class="connection-pill" class:good={status?.gameConnected}>
        <span class="live-dot" class:online={status?.gameConnected}
        ></span>{loading
          ? "Checking connection"
          : status?.gameConnected
            ? "Connected to WoW"
            : (status && !status.ready) || starting
              ? "Starting Wisp"
              : status
                ? "Waiting for WoW"
                : "Wisp is stopped"}
      </div>
    </header>
    {#if !native}<div class="banner">
        Design preview. Desktop actions are available in the installed Wisp app.
      </div>{/if}
    {#if busy || feedback}<div
        class="banner"
        class:error={failed}
        role="status"
        aria-live="polite"
      >
        {#if busy}<span class="spinner"></span>{/if}<span
          >{busy || feedback}</span
        >{#if !busy}<button
            class="icon-button"
            aria-label="Dismiss notification"
            onclick={() => (feedback = "")}
            ><Icon name="close" size={16} /></button
          >{/if}
      </div>{/if}

    {#if page === "Overview"}
      <div class="status-grid">
        <section class="card status-card">
          <span class="eyebrow"
            ><Icon name="home" size={16} />WORLD OF WARCRAFT</span
          >
          <h2 class:accent={status?.gameConnected}>
            {status?.gameConnected
              ? "Connected"
              : loading
                ? "Checking…"
                : "Waiting for WoW"}
          </h2>
          <p>
            {status?.gameConnected
              ? "Your addon is talking to Wisp."
              : "Open WoW with Wisp AI enabled."}
          </p>
        </section>
        <section class="card status-card">
          <span class="eyebrow"
            ><Icon name="link" size={16} />AI CONNECTION</span
          >
          <h2 class:accent={connected}>
            {connected
              ? "ChatGPT"
              : status?.auth.status === "authorizing"
                ? "Signing in…"
                : "Not connected"}
          </h2>
          <p>
            {connected
              ? "Your connection is ready."
              : "Choose an AI connection to get started."}
          </p>
        </section>
        <section class="card status-card">
          <span class="eyebrow"><Icon name="spark" size={16} />WISP</span>
          <h2 class:accent={status?.ready}>
            {active
              ? "Working…"
              : status?.ready
                ? "Ready to help"
                : status || starting
                  ? "Starting…"
                  : "Stopped"}
          </h2>
          <p>
            {active
              ? "A reply is in progress."
              : "Questions, references and useful next steps."}
          </p>
        </section>
      </div>
      <section class="card">
        <div class="section-title">
          <div>
            <h2>Game installation</h2>
            <p>Choose the Forever client folder containing Wow.exe.</p>
          </div>
          <Icon name="folder" />
        </div>
        <div class="folder-field">
          <input
            aria-label="WoW client folder"
            bind:value={wow}
            placeholder="Choose your World of Warcraft folder"
            disabled={!!busy}
          /><button
            onclick={() => work("Choosing folder", chooseFolder)}
            disabled={!!busy || !native}
            ><Icon name="folder" size={17} />Choose folder</button
          >
        </div>
        <div class="actions">
          <button
            class="primary"
            onclick={install}
            disabled={locked || !wow || !native}
            >{busy === "Installing addon"
              ? "Installing…"
              : "Install / update addon"}</button
          ><button
            onclick={start}
            disabled={!!busy || !!status || !info?.configured}
            >Start Wisp</button
          ><button
            onclick={() =>
              work(
                "Stopping Wisp",
                async () => {
                  await desktop("stop_bridge");
                  starting = false;
                },
                "Wisp stopped.",
              )}
            disabled={locked || !status}>Stop Wisp</button
          ><button class="quiet" onclick={showLogs}
            >Diagnostics<Icon name="arrow" size={16} /></button
          >
        </div>
      </section>
      <section class="card next-step">
        <div>
          <p class="eyebrow">
            {!info?.configured
              ? "FIRST STEPS"
              : status?.gameConnected && connected
                ? "ALL SET"
                : "NEXT STEP"}
          </p>
          <h2>
            {!info?.configured
              ? "Make yourself at home."
              : !connected
                ? "Bring your AI connection."
                : !status?.gameConnected
                  ? "See you in Azeroth."
                  : "Back to Azeroth."}
          </h2>
          <p>
            {!info?.configured
              ? "Install the addon, connect your AI provider, then open /wisp in game."
              : !connected
                ? "Add a connection so Wisp can answer your questions."
                : !status?.gameConnected
                  ? "Open WoW and enable Wisp AI. Already in game? Type /reload."
                  : "Open /wisp, or hover an item and use your inline shortcut."}
          </p>
        </div>
        <button onclick={() => (page = "Connections")}
          >Manage connections<Icon name="arrow" size={17} /></button
        >
      </section>
      {#if !info?.configured}<button
          class="text-button import"
          onclick={importPrevious}
          disabled={!!busy || !native}
          >Already using Wisp? Import your previous installation.</button
        >{/if}
    {:else if page === "Connections"}
      <section class="card provider-card">
        <div class="provider-heading">
          <div class="provider-symbol"><Icon name="spark" size={25} /></div>
          <div>
            <h2>ChatGPT</h2>
            <p>Connect with your subscription. No API key needed.</p>
          </div>
          <span class="badge" class:good={connected}
            >{connected
              ? "Connected"
              : status?.auth.status === "authorizing"
                ? "Waiting for browser"
                : "Not connected"}</span
          >
        </div>
        {#if status?.auth.account}<p class="account-name">
            {status.auth.account}
          </p>{/if}
        {#if status?.auth.message}<p class="muted">
            {status.auth.message}
          </p>{/if}
        {#if !status}<div class="empty-inline">
            Start Wisp from Overview to manage connections.
          </div>{/if}
        <div class="actions">
          <button
            class:primary={!connected}
            onclick={() => signIn()}
            disabled={locked || !status}
            >{connected ? "Reconnect" : "Continue with ChatGPT"}<Icon
              name="arrow"
              size={17}
            /></button
          ><button onclick={() => signIn(true)} disabled={locked || !status}
            >Add account</button
          >{#if status?.auth.status === "authorizing"}<button
              onclick={() =>
                work("Cancelling sign-in", () => request("/auth/cancel", {}))}
              disabled={!!busy}>Cancel sign-in</button
            >{/if}{#if connected}<button
              class="quiet danger"
              onclick={() => {
                confirm = {
                  label:
                    "Disconnect this AI connection? Your chats and memory will stay on this computer.",
                  run: () =>
                    work(
                      "Disconnecting",
                      () => request("/auth/disconnect", {}),
                      "Connection disconnected.",
                    ),
                };
              }}
              disabled={locked}>Disconnect</button
            >{/if}
        </div>
        {#if (status?.auth.profiles.length || 0) > 0}<div class="field-section">
            <label for="accounts">Saved accounts</label>
            <div class="inline-field">
              <select id="accounts" bind:value={account} disabled={locked}
                >{#each status?.auth.profiles || [] as item}<option
                    value={item.id}>{item.label}</option
                  >{/each}</select
              ><button
                onclick={() =>
                  work("Switching account", () =>
                    request("/auth/select", { profileId: account }),
                  )}
                disabled={locked || account === status?.auth.activeId}
                >Use account</button
              >
            </div>
          </div>{/if}
        <div class="field-section">
          <div class="label-row">
            <label for="models">Default model for new chats</label><button
              class="text-button"
              onclick={() =>
                work("Loading models", loadModels, "Models refreshed.")}
              disabled={locked || !connected}
              ><Icon name="refresh" size={14} />Refresh</button
            >
          </div>
          <div class="inline-field">
            <select
              id="models"
              bind:value={model}
              disabled={locked || !models.length}
              ><option value="" disabled
                >{connected
                  ? "Loading available models…"
                  : "Connect a provider first"}</option
              >{#each models as item}<option value={item.slug}
                  >{item.displayName}</option
                >{/each}</select
            ><button
              onclick={() =>
                work(
                  "Updating default model",
                  () => request("/auth/model", { model }),
                  "Default model updated.",
                )}
              disabled={locked || !models.length || model === status?.model}
              >Set default</button
            >
          </div>
          <p class="field-hint">
            You can choose a different model and effort inside each chat.
          </p>
        </div>
        <p class="privacy-note">
          <Icon name="check" size={16} />Credentials stay protected by your
          operating system.
        </p>
      </section>
      <p class="footnote">
        AI providers live here. ChatGPT is the currently supported connection.
      </p>
    {:else if page === "Integrations"}
      <div class="toolbar">
        <p class="muted">{status?.mcps.length || 0} custom connections</p>
        <button
          class="primary"
          onclick={() => edit(null)}
          disabled={locked || !status}
          ><Icon name="plus" size={17} />Add MCP</button
        >
      </div>
      <div class="connection-list">
        {#each (status?.integrations || []).filter((entry) => !entry.parent) as entry (entry.id)}
          <div>
            <IntegrationCard
              {entry}
              tools={(status?.integrations || []).filter(
                (tool) => tool.parent === entry.id,
              )}
              {locked}
              set={setIntegration}
            />
            {#each (status?.mcps || []).filter((server) => entry.id === "mcp:" + server.name) as server (server.name)}
              <div class="actions">
                <button onclick={() => edit(server)} disabled={locked}
                  >Edit</button
                >
                <button
                  onclick={() =>
                    work(
                      "Testing " + server.name,
                      async () => {
                        const result = await request<{ count: number }>(
                          "/mcps/test",
                          { server },
                        );
                        feedback =
                          "Connected. " + result.count + " tools available.";
                      },
                      "Connection test completed.",
                    )}
                  disabled={locked}>Test connection</button
                >
                <button
                  class="quiet danger"
                  onclick={() => removeMcp(server)}
                  disabled={locked}>Remove</button
                >
              </div>
            {/each}
          </div>
        {/each}
      </div>
      <p class="footnote">
        Changes apply to new tool calls. Disabling an integration preserves
        individual tool choices. Addon availability updates when WoW connects.
      </p>
    {:else if page === "Panels"}
      {#if !status?.panels.length}<section class="card empty-state">
          <Icon name="panel" size={34} />
          <h2>Useful things, kept close.</h2>
          <p>
            Ask Wisp in game to create a tracker or panel. Your saved panels
            will appear here.
          </p>
        </section>{:else}{#each status.panels as panel (panel.id)}<section
            class="card integration"
          >
            <div class="integration-top">
              <div>
                <h2>{panel.title}</h2>
                <p>{panel.character}</p>
              </div>
              <span class="badge"
                >{panel.bindings?.length || 0} live bindings</span
              >
            </div>
            <div class="actions">
              <button
                onclick={() => panelAction(panel, "show")}
                disabled={locked || !status.gameConnected}>Show in WoW</button
              ><button
                onclick={() => panelAction(panel, "hide")}
                disabled={locked || !status.gameConnected}>Hide</button
              ><button
                class="quiet danger"
                onclick={() => {
                  confirm = {
                    label: `Delete “${panel.title}”?`,
                    run: () => panelAction(panel, "remove"),
                  };
                }}
                disabled={locked}>Delete</button
              >
            </div>
          </section>{/each}{/if}
    {:else if page === "Suggestions"}
      <section class="card toggle-card">
        <div class="toggle-description">
          <div class="feature-icon"><Icon name="spark" size={23} /></div>
          <div>
            <h2>A little direction when you level up</h2>
            <p>Wisp can check what changed and suggest a useful next step.</p>
          </div>
        </div>
        <label class="switch"
          ><input
            type="checkbox"
            bind:checked={levelTips}
            onchange={() => (dirty = true)}
            disabled={!status || !!busy}
          /><span></span><span class="sr-only">Level-up suggestions</span
          ></label
        >
      </section>
      <section class="card toggle-card">
        <div class="toggle-description">
          <div class="feature-icon"><Icon name="tools" size={23} /></div>
          <div>
            <h2>Get to know your new weapon</h2>
            <p>Receive a contextual tip when you equip a different weapon.</p>
          </div>
        </div>
        <label class="switch"
          ><input
            type="checkbox"
            bind:checked={weaponTips}
            onchange={() => (dirty = true)}
            disabled={!status || !!busy}
          /><span></span><span class="sr-only">Weapon suggestions</span></label
        >
      </section>
      <div class="preference-footer">
        <p class="muted">
          Optional and off by default. At most one suggestion every ten minutes.<br
          />Combat and active conversations take priority. No changes are
          applied automatically.
        </p>
        <button
          class="primary"
          disabled={!dirty || locked}
          onclick={() =>
            work(
              "Saving preferences",
              async () => {
                await request("/suggestions", {
                  levelUp: levelTips,
                  weapon: weaponTips,
                });
                dirty = false;
              },
              "Preferences saved.",
            )}>Save changes</button
        >
      </div>
    {:else}
      <section class="card">
        <div class="section-title">
          <div>
            <h2>Local activity</h2>
            <p>Logs stay on your computer. Review them before sharing.</p>
          </div>
          <div class="actions">
            <button onclick={showLogs} disabled={!!busy}
              ><Icon name="refresh" size={16} />Refresh</button
            ><button
              onclick={() => work("Opening logs", () => desktop("open_logs"))}
              >Open folder</button
            >
          </div>
        </div>
        <pre class="logs">{logs ||
            "No activity loaded yet. Refresh to read the local bridge logs."}</pre>
        <p class="field-hint">
          Data location: {info?.dataDirectory ||
            "Available in the installed app"}
        </p>
      </section>
    {/if}
    <footer class="app-footer">
      <span>Wisp stays available in your system tray.</span><span
        >History saved locally.</span
      >
    </footer>
  </main>
</div>
{#if dialog}<McpDialog
    server={editing}
    close={() => (dialog = false)}
    saved={refresh}
  />{/if}
{#if confirm}<div class="scrim">
    <div
      class="dialog confirmation"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      tabindex="-1"
    >
      <h2 id="confirm-title">{confirm.label}</h2>
      <footer>
        <button onclick={() => (confirm = null)}>Cancel</button><button
          class="danger-button"
          onclick={async () => {
            const action = confirm!.run;
            confirm = null;
            await action();
          }}>Confirm</button
        >
      </footer>
    </div>
  </div>{/if}

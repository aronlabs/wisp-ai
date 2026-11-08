<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import { desktop, native } from "../api";
  let { app }: { app: DesktopController } = $props();
  let editingInstallation = $state(false);
  let installationOpen = $derived(
    !app.info?.configured || !!app.info?.addonOutdated || editingInstallation,
  );
  let next = $derived<keyof typeof steps>(
    app.loading
      ? "loading"
      : !app.info?.configured
        ? "install"
        : app.info?.addonOutdated
          ? "update"
          : !app.status
            ? app.starting && !app.connectionError
              ? "starting"
              : "start"
            : !app.status.ready
              ? "starting"
              : !app.connected
                ? "account"
                : !app.status.gameConnected
                  ? "game"
                  : "ready",
  );
  const steps = {
    loading: {
      title: "Checking Wisp…",
      description: "Checking your installation and connections.",
    },
    install: {
      title: "Welcome to Wisp",
      description:
        "Install the addon, connect an AI provider, and meet Wisp in game.",
    },
    update: {
      title: "Update your Wisp addon",
      description:
        "Install the latest addon, then type /reload in WoW to finish updating.",
    },
    starting: {
      title: "Getting Wisp ready…",
      description:
        "Waiting for the local service. Your connections will update automatically.",
    },
    start: {
      title: "Start Wisp to continue",
      description:
        "Your installation is saved. Start the local service to reconnect.",
    },
    account: {
      title: "Connect your AI account",
      description:
        "Connect ChatGPT or an API provider, then choose a default model.",
    },
    game: {
      title: "Ready when you enter Azeroth",
      description:
        "Open WoW with Wisp AI enabled. Already in game? Type /reload.",
    },
    ready: {
      title: "Everything is ready",
      description:
        "Open /wisp in game, or hover an item and use your inline shortcut.",
    },
  };
</script>

<section class="card workspace-status" class:workspace-ready={next === "ready"}>
  <div class="status-heading">
    <div class="status-symbol">
      <Icon name={next === "ready" ? "check" : "spark"} size={27} />
    </div>
    <div>
      <span class="eyebrow">YOUR WORKSPACE</span>
      <h2>{steps[next].title}</h2>
      <p>{steps[next].description}</p>
    </div>
  </div>
  <div class="actions status-actions">
    {#if next === "install"}<button
        class="primary"
        disabled={!native || app.locked}
        onclick={() =>
          app.wow
            ? app.install()
            : app.work(
                "Choosing folder",
                app.chooseFolder,
                undefined,
                "installation",
              )}
        >{app.busy === "Installing addon"
          ? "Installing…"
          : app.wow
            ? "Install addon"
            : "Choose game folder"}</button
      >
    {:else if next === "update"}<button
        class="primary"
        disabled={!native || app.locked || !app.wow}
        onclick={app.install}
        >{app.busy === "Installing addon"
          ? "Updating addon…"
          : "Update addon"}</button
      >
    {:else if next === "start"}<button
        class="primary"
        disabled={!!app.busy || !native}
        onclick={app.start}>Start Wisp</button
      >
    {:else if next === "account"}<button
        class="primary"
        onclick={() => (app.page = "Connections")}
        >Connect AI<Icon name="arrow" size={16} /></button
      >
    {:else if next === "game"}<span class="badge">Waiting for WoW</span><button
        class="quiet"
        onclick={() => (editingInstallation = true)}>Check installation</button
      >
    {:else if next === "ready"}<span class="badge good"
        ><span class="live-dot online"></span>Ready to help</span
      >
    {:else}<span class="spinner"></span>{/if}
  </div>
  <div class="connection-summary">
    <div>
      <span class="live-dot" class:online={app.status?.gameConnected}
      ></span><span>World of Warcraft</span><strong
        >{app.loading
          ? "Checking…"
          : !app.status
            ? "Not checked"
            : app.status.gameConnected
              ? "Connected"
              : "Waiting for game"}</strong
      >
    </div>
    <div>
      <span class="live-dot" class:online={app.connected}></span><span
        >AI provider</span
      ><strong
        >{app.loading
          ? "Checking…"
          : !app.status
            ? "Not checked"
            : app.connected
              ? "Connected"
              : "Not connected"}</strong
      >{#if !app.loading && !app.connected && app.status}<button
          class="text-button"
          onclick={() => (app.page = "Connections")}>Connect</button
        >{/if}
    </div>
    <div>
      <span class="live-dot" class:online={app.status?.ready}></span><span
        >Wisp service</span
      ><strong
        >{app.active
          ? "Working…"
          : app.loading
            ? "Checking…"
            : app.status?.ready
              ? "Running"
              : app.connectionError
                ? "Unavailable"
                : app.starting || app.status
                  ? "Starting…"
                  : "Stopped"}</strong
      >{#if app.status}<button
          class="text-button"
          disabled={app.locked}
          onclick={() =>
            app.work(
              "Stopping Wisp",
              async () => {
                await desktop("stop_bridge");
                app.starting = false;
              },
              "Wisp stopped.",
            )}>Stop Wisp</button
        >{/if}
    </div>
  </div>
  <ActionProgress {app} />
</section>

{#if !app.loading}
  <section class="card installation-card">
    <div class="section-title">
      <div class="installation-heading">
        <Icon name="folder" size={20} />
        <div>
          <h2>Game installation</h2>
          <p class="installation-path">
            {app.info?.configured
              ? app.info.wow || app.wow
              : "Choose the Forever client folder containing Wow.exe."}
          </p>
        </div>
      </div>
      {#if app.info?.configured}<div class="installation-controls">
          <span class="badge" class:good={!app.info.addonOutdated}
            >{app.info.addonOutdated
              ? "Update needed"
              : "Addon installed"}</span
          ><button
            class="quiet"
            aria-expanded={installationOpen}
            onclick={() => (editingInstallation = !editingInstallation)}
            >{installationOpen && !app.info.addonOutdated
              ? "Done"
              : "Manage installation"}</button
          >
        </div>{/if}
    </div>
    {#if installationOpen}
      <div class="folder-field">
        <input
          aria-label="WoW client folder"
          bind:value={app.wow}
          placeholder="Choose your World of Warcraft folder"
          disabled={!!app.busy}
        /><button
          onclick={() =>
            app.work(
              "Choosing folder",
              app.chooseFolder,
              undefined,
              "installation",
            )}
          disabled={!!app.busy || !native}
          ><Icon name="folder" size={17} />Choose folder</button
        >
      </div>
      {#if app.info?.addonOutdated}<p class="field-hint">
          Update the addon, then type /reload in WoW.
        </p>{/if}
      <div class="actions">
        {#if app.info?.configured && next !== "update"}<button
            class:primary={app.info?.configured}
            onclick={app.install}
            disabled={app.locked || !app.wow || !native}
            >{app.busy === "Installing addon"
              ? "Installing…"
              : "Install / update addon"}</button
          >{/if}<ActionProgress {app} target="installation" />
      </div>
      {#if !app.info?.configured}<button
          class="text-button import"
          onclick={app.importPrevious}
          disabled={!!app.busy || !native}
          >Already using Wisp? Import your previous installation.</button
        >{/if}
    {/if}
  </section>
{/if}

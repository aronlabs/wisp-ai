<script lang="ts">
  import { createDesktopController } from "./desktop-controller.svelte";
  import { native } from "./api";
  import Icon from "./Icon.svelte";
  import McpDialog from "./McpDialog.svelte";
  import Updates from "./Updates.svelte";
  import logo from "../../../assets/wisp.png";
  import Overview from "./pages/Overview.svelte";
  import Connections from "./pages/Connections.svelte";
  import Integrations from "./pages/Integrations.svelte";
  import Memory from "./pages/Memory.svelte";
  import Panels from "./pages/Panels.svelte";
  import Routines from "./pages/Routines.svelte";
  import Diagnostics from "./pages/Diagnostics.svelte";
  const app = createDesktopController();
</script>

<div class="app-shell">
  <aside>
    <div class="brand">
      <img src={logo} alt="" />
      <div><strong>Wisp</strong><span>AI COMPANION</span></div>
    </div>
    <p class="tagline">A little help in Azeroth.</p>
    <nav aria-label="Main navigation">
      {#each app.pages as item}<button
          class:selected={app.page === item.name}
          onclick={() => {
            app.page = item.name;
            if (app.page === "Diagnostics") void app.showLogs();
          }}
          aria-current={app.page === item.name ? "page" : undefined}
          ><Icon name={item.icon} />{item.name}</button
        >{/each}
    </nav>
    <div class="rail-footer">
      <span class="live-dot" class:online={app.status?.gameConnected}></span>WOW
      FOREVER<span class="version">v{app.info?.version || "0.2.2"}</span>
    </div>
  </aside>
  <main>
    <header class="page-header">
      <div>
        <h1>{app.current.title}</h1>
        <p>{app.current.caption}</p>
      </div>
      <div class="connection-pill" class:good={app.status?.gameConnected}>
        <span class="live-dot" class:online={app.status?.gameConnected}
        ></span>{app.loading
          ? "Checking connection"
          : app.status?.gameConnected
            ? "Connected to WoW"
            : (app.status && !app.status.ready) || app.starting
              ? "Starting Wisp"
              : app.status
                ? "Waiting for WoW"
                : "Wisp is stopped"}
      </div>
    </header>
    {#if !native}<div class="banner">
        Design preview. Desktop actions are available in the installed Wisp app.
      </div>{/if}
    {#if app.busy || app.feedback}<div
        class="banner"
        class:error={app.failed}
        role="status"
        aria-live="polite"
      >
        {#if app.busy}<span class="spinner"></span>{/if}<span
          >{app.busy || app.feedback}</span
        >{#if !app.busy}<button
            class="icon-button"
            aria-label="Dismiss notification"
            onclick={() => (app.feedback = "")}
            ><Icon name="close" size={16} /></button
          >{/if}
      </div>{/if}

    <Updates
      showSettings={app.page === "Settings"}
      version={app.info?.version || "0.2.2"}
      locked={!!app.busy}
      openSettings={() => (app.page = "Settings")}
      onBusy={(label) => (app.busy = label)}
    />
    {#if app.page === "Overview"}<Overview {app} />
    {:else if app.page === "Connections"}<Connections {app} />
    {:else if app.page === "Integrations"}<Integrations {app} />
    {:else if app.page === "Memory"}<Memory {app} />
    {:else if app.page === "Panels"}<Panels {app} />
    {:else if app.page === "Routines"}<Routines {app} />
    {:else if app.page === "Diagnostics"}<Diagnostics {app} />
    {/if}
    <footer class="app-footer">
      <span>Wisp stays available in your system tray.</span><span
        >History saved locally.</span
      >
    </footer>
  </main>
</div>
{#if app.dialog}<McpDialog
    server={app.editing}
    close={() => (app.dialog = false)}
    saved={app.refresh}
  />{/if}
{#if app.confirm}<div class="scrim">
    <div
      class="dialog confirmation"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      tabindex="-1"
    >
      <h2 id="confirm-title">{app.confirm.label}</h2>
      <footer>
        <button onclick={() => (app.confirm = null)}>Cancel</button><button
          class="danger-button"
          onclick={async () => {
            const action = app.confirm!.run;
            app.confirm = null;
            await action();
          }}>Confirm</button
        >
      </footer>
    </div>
  </div>{/if}

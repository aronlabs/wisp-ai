<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  import { desktop, native } from "../api";
  let { app }: { app: DesktopController } = $props();
</script>

<div class="status-grid">
  <section class="card status-card">
    <span class="eyebrow"><Icon name="home" size={16} />WORLD OF WARCRAFT</span>
    <h2 class:accent={app.status?.gameConnected}>
      {app.status?.gameConnected
        ? "Connected"
        : app.loading
          ? "Checking…"
          : "Waiting for WoW"}
    </h2>
    <p>
      {app.status?.gameConnected
        ? "Wisp AI is loaded in the game."
        : "Open WoW with Wisp AI enabled."}
    </p>
  </section>
  <section class="card status-card">
    <span class="eyebrow"><Icon name="link" size={16} />AI CONNECTION</span>
    <h2 class:accent={app.connected}>
      {app.connected
        ? "ChatGPT"
        : app.status?.auth.status === "authorizing"
          ? "Signing in…"
          : "Not connected"}
    </h2>
    <p>
      {app.connected ? "Signed in." : "Choose an AI connection to get started."}
    </p>
  </section>
  <section class="card status-card">
    <span class="eyebrow"><Icon name="spark" size={16} />WISP</span>
    <h2 class:accent={app.status?.ready}>
      {app.active
        ? "Working…"
        : app.status?.ready
          ? "Ready to help"
          : app.status || app.starting
            ? "Starting…"
            : "Stopped"}
    </h2>
    <p>
      {app.active
        ? "A reply is in progress."
        : app.status?.ready
          ? "Ask a question in WoW."
          : app.status || app.starting
            ? "Starting the agent."
            : "Start Wisp to ask questions in WoW."}
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
      bind:value={app.wow}
      placeholder="Choose your World of Warcraft folder"
      disabled={!!app.busy}
    /><button
      onclick={() => app.work("Choosing folder", app.chooseFolder)}
      disabled={!!app.busy || !native}
      ><Icon name="folder" size={17} />Choose folder</button
    >
  </div>
  {#if app.info?.addonOutdated}<p class="banner" role="status">
      Your installed addon needs an update. Choose Install / update addon, then
      type /reload in WoW.
    </p>{/if}
  <div class="actions">
    <button
      class="primary"
      onclick={app.install}
      disabled={app.locked || !app.wow || !native}
      >{app.busy === "Installing addon"
        ? "Installing…"
        : "Install / update addon"}</button
    ><button
      onclick={app.start}
      disabled={!!app.busy || !!app.status || !app.info?.configured}
      >Start Wisp</button
    ><button
      onclick={() =>
        app.work(
          "Stopping Wisp",
          async () => {
            await desktop("stop_bridge");
            app.starting = false;
          },
          "Wisp stopped.",
        )}
      disabled={app.locked || !app.status}>Stop Wisp</button
    ><button class="quiet" onclick={app.showLogs}
      >Diagnostics<Icon name="arrow" size={16} /></button
    >
  </div>
</section>
<section class="card next-step">
  <div>
    <p class="eyebrow">
      {!app.info?.configured
        ? "FIRST STEPS"
        : app.status?.gameConnected && app.connected
          ? "ALL SET"
          : "NEXT STEP"}
    </p>
    <h2>
      {!app.info?.configured
        ? "Make yourself at home."
        : !app.connected
          ? "Bring your AI connection."
          : !app.status?.gameConnected
            ? "See you in Azeroth."
            : "Back to Azeroth."}
    </h2>
    <p>
      {!app.info?.configured
        ? "Install the addon, connect your AI provider, then open /wisp in game."
        : !app.connected
          ? "Add a connection so Wisp can answer your questions."
          : !app.status?.gameConnected
            ? "Open WoW and enable Wisp AI. Already in game? Type /reload."
            : "Open /wisp, or hover an item and use your inline shortcut."}
    </p>
  </div>
  <button onclick={() => (app.page = "Connections")}
    >Manage connections<Icon name="arrow" size={17} /></button
  >
</section>
{#if !app.info?.configured}<button
    class="text-button import"
    onclick={app.importPrevious}
    disabled={!!app.busy || !native}
    >Already using Wisp? Import your previous installation.</button
  >{/if}

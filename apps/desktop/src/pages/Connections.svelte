<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  import { request } from "../api";
  let { app }: { app: DesktopController } = $props();
</script>

<section class="card provider-card">
  <div class="provider-heading">
    <div class="provider-symbol"><Icon name="spark" size={25} /></div>
    <div>
      <h2>ChatGPT</h2>
      <p>Connect with your subscription. No API key needed.</p>
    </div>
    <span class="badge" class:good={app.connected}
      >{app.connected
        ? "Connected"
        : app.status?.auth.status === "authorizing"
          ? "Waiting for browser"
          : "Not connected"}</span
    >
  </div>
  {#if app.status?.auth.account}<p class="account-name">
      {app.status.auth.account}
    </p>{/if}
  {#if app.status?.auth.message}<p class="muted">
      {app.status.auth.message}
    </p>{/if}
  {#if !app.status}<div class="empty-inline">
      Start Wisp from Overview to manage connections.
    </div>{/if}
  <div class="actions">
    <button
      class:primary={!app.connected}
      onclick={() => app.signIn()}
      disabled={app.locked || !app.status}
      >{app.connected ? "Reconnect" : "Continue with ChatGPT"}<Icon
        name="arrow"
        size={17}
      /></button
    ><button
      onclick={() => app.signIn(true)}
      disabled={app.locked || !app.status}>Add account</button
    >{#if app.status?.auth.status === "authorizing"}<button
        onclick={() =>
          app.work("Cancelling sign-in", () => request("/auth/cancel", {}))}
        disabled={!!app.busy}>Cancel sign-in</button
      >{/if}{#if app.connected}<button
        class="quiet danger"
        onclick={() => {
          app.confirm = {
            label:
              "Disconnect this AI connection? Your chats and memory will stay on this computer.",
            run: () =>
              app.work(
                "Disconnecting",
                () => request("/auth/disconnect", {}),
                "Connection disconnected.",
              ),
          };
        }}
        disabled={app.locked}>Disconnect</button
      >{/if}
  </div>
  {#if (app.status?.auth.profiles.length || 0) > 0}<div class="field-section">
      <label for="accounts">Saved accounts</label>
      <div class="inline-field">
        <select id="accounts" bind:value={app.account} disabled={app.locked}
          >{#each app.status?.auth.profiles || [] as item}<option
              value={item.id}>{item.label}</option
            >{/each}</select
        ><button
          onclick={() =>
            app.work("Switching account", () =>
              request("/auth/select", { profileId: app.account }),
            )}
          disabled={app.locked || app.account === app.status?.auth.activeId}
          >Use account</button
        >
      </div>
    </div>{/if}
  <div class="field-section">
    {#if app.modelsError}<p class="banner error" role="status">
        Could not load models: {app.modelsError}
      </p>{/if}
    <div class="label-row">
      <label for="models">Default model for new chats</label><button
        class="text-button"
        onclick={() =>
          app.work("Loading models", app.loadModels, "Models refreshed.")}
        disabled={app.locked || !app.connected}
        ><Icon name="refresh" size={14} />Refresh</button
      >
    </div>
    <div class="inline-field">
      <select
        id="models"
        bind:value={app.model}
        disabled={app.locked || !app.models.length}
        ><option value="" disabled
          >{app.connected
            ? "Loading available models…"
            : "Connect a provider first"}</option
        >{#each app.models as item}<option value={item.slug}
            >{item.displayName}</option
          >{/each}</select
      ><button
        onclick={() =>
          app.work(
            "Updating default model",
            () => request("/auth/model", { model: app.model }),
            "Default model updated.",
          )}
        disabled={app.locked ||
          !app.models.length ||
          app.model === app.status?.model}>Set default</button
      >
    </div>
    <p class="field-hint">
      You can choose a different model and effort inside each chat.
    </p>
  </div>
  <p class="privacy-note">
    <Icon name="check" size={16} />Credentials stay protected by your operating
    system.
  </p>
</section>
<p class="footnote">ChatGPT is currently the only supported AI provider.</p>

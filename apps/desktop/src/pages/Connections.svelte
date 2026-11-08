<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import ApiConnections from "../ApiConnections.svelte";
  import SearchConnection from "../SearchConnection.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import Icon from "../Icon.svelte";
  import { request } from "../api";
  let { app }: { app: DesktopController } = $props();
  let chatgptConnected = $derived(app.status?.auth.status === "connected");
</script>

<section class="card provider-card">
  <div class="provider-heading">
    <div class="provider-symbol"><Icon name="spark" size={25} /></div>
    <div>
      <h2>ChatGPT</h2>
      <p>Connect with your subscription. No API key needed.</p>
    </div>
    <span class="badge" class:good={chatgptConnected}
      >{chatgptConnected
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
      Start Wisp to manage your account.
      <button class="text-button" onclick={() => (app.page = "Overview")}
        >Go to Overview</button
      >
    </div>{/if}
  <div class="actions">
    <ActionProgress {app} />
    <button
      class:primary={!chatgptConnected}
      onclick={() => app.signIn()}
      disabled={app.locked || !app.status}
      >{app.busy === "Opening sign-in"
        ? "Opening browser…"
        : chatgptConnected
          ? "Reconnect"
          : "Continue with ChatGPT"}<Icon name="arrow" size={17} /></button
    ><button
      onclick={() => app.signIn(true)}
      disabled={app.locked || !app.status}>Add account</button
    >{#if app.status?.auth.status === "authorizing"}<button
        onclick={() =>
          app.work("Cancelling sign-in", () => request("/auth/cancel", {}))}
        disabled={!!app.busy}>Cancel sign-in</button
      >{/if}{#if chatgptConnected}<button
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
            app.work(
              "Switching account",
              () => request("/auth/select", { profileId: app.account }),
              undefined,
              "accounts",
            )}
          disabled={app.locked || app.account === app.status?.auth.activeId}
          >Use account</button
        >
      </div>
      <ActionProgress {app} target="accounts" />
    </div>{/if}
</section>

<ApiConnections {app} />
<SearchConnection {app} />

<section class="card provider-card">
  <h2>Default model</h2>
  <div class="field-section">
    {#if app.modelsError}<p class="banner error" role="status">
        Could not load models: {app.modelsError}
      </p>{/if}
    <div class="label-row">
      <label for="models">Default model for new chats</label><button
        class="text-button"
        onclick={() =>
          app.work(
            "Loading models",
            app.loadModels,
            "Models refreshed.",
            "model",
          )}
        disabled={app.locked || !app.status}
        ><Icon name="refresh" size={14} />Refresh</button
      >
    </div>
    <div class="inline-field">
      <select
        id="models"
        bind:value={app.model}
        disabled={app.locked || !app.models.length}
        ><option value="" disabled
          >{app.models.length
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
            "model",
          )}
        disabled={app.locked ||
          !app.models.length ||
          app.model === app.status?.model}
        >{app.busy === "Updating default model"
          ? "Saving…"
          : "Set default"}</button
      >
    </div>
    <ActionProgress {app} target="model" />
    <p class="field-hint">
      You can choose a different model and effort inside each chat.
    </p>
  </div>
  <p class="privacy-note">
    <Icon name="check" size={16} />Credentials stay protected by your operating
    system.
  </p>
</section>

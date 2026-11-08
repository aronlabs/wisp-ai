<script lang="ts">
  import type { DesktopController } from "./desktop-controller.svelte";
  import Icon from "./Icon.svelte";
  let { app }: { app: DesktopController } = $props();
</script>

<section class="card empty-state" aria-live="polite">
  {#if app.loading}
    <span class="spinner"></span>
    <h2>Loading your workspace…</h2>
    <p>Checking Wisp and your saved data.</p>
  {:else}
    <Icon name="link" size={30} />
    <h2>
      {app.starting && !app.connectionError
        ? "Wisp is starting"
        : "Connect to Wisp to view your data"}
    </h2>
    <p>
      {app.starting && !app.connectionError
        ? "Your workspace will appear when the service is ready."
        : "Your saved data is unavailable while Wisp is stopped or unreachable."}
    </p>
    <button onclick={() => (app.page = "Overview")}
      >Go to Overview<Icon name="arrow" size={16} /></button
    >
    {#if app.connectionError}<button class="quiet" onclick={app.showLogs}
        >View diagnostics</button
      >{/if}
  {/if}
</section>

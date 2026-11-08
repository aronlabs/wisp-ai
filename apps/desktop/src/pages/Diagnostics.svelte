<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import Icon from "../Icon.svelte";
  import { desktop } from "../api";
  let { app }: { app: DesktopController } = $props();
</script>

<section class="card">
  <div class="section-title">
    <div>
      <h2>Local activity</h2>
      <p>Logs stay on your computer. Review them before sharing.</p>
    </div>
    <div class="actions">
      <ActionProgress {app} />
      <button onclick={app.showLogs} disabled={!!app.busy}
        ><Icon name="refresh" size={16} />Refresh</button
      ><button
        onclick={() => app.work("Opening logs", () => desktop("open_logs"))}
        >Open folder</button
      >
    </div>
  </div>
  {#if app.connectionError}<p class="banner error" role="status">
      Last connection error: {app.connectionError}
    </p>{/if}
  <pre class="logs">{app.logs ||
      "No activity loaded yet. Refresh to read the local bridge logs."}</pre>
  <p class="field-hint">
    Data location: {app.info?.dataDirectory || "Available in the installed app"}
  </p>
</section>

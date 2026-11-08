<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  let { app }: { app: DesktopController } = $props();
</script>

{#each (app.status?.integrations || []).filter((entry) => entry.group === "memory") as entry (entry.id)}
  <section class="card toggle-card">
    <div class="toggle-description">
      <div>
        <h2>{entry.name}</h2>
        <p>{entry.description}</p>
      </div>
    </div>
    <label class="switch"
      ><input
        type="checkbox"
        checked={entry.enabled}
        disabled={app.locked || !app.status}
        onchange={(event) =>
          app.setIntegration(entry.id, event.currentTarget.checked)}
      /><span></span><span class="sr-only">Enable {entry.name}</span></label
    >
  </section>
{/each}

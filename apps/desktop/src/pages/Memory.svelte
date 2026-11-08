<script lang="ts">
  import Toggle from "../Toggle.svelte";
  import DataState from "../DataState.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import type { DesktopController } from "../desktop-controller.svelte";
  let { app }: { app: DesktopController } = $props();
</script>

{#if app.loading || !app.status}<DataState {app} />{:else}
  {#each (app.status?.integrations || []).filter((entry) => entry.group === "memory") as entry (entry.id)}
    <section class="card toggle-card">
      <div class="toggle-description">
        <div>
          <h2>{entry.name}</h2>
          <p>{entry.description}</p>
        </div>
      </div>
      <div class="row-controls">
        <ActionProgress {app} target={entry.id} /><Toggle
          label={`Enable ${entry.name}`}
          checked={entry.enabled}
          disabled={app.locked}
          onchange={(checked) => app.setIntegration(entry.id, checked)}
        />
      </div>
    </section>
  {:else}<section class="card empty-state">
      <h2>No memory controls available</h2>
      <p>Memory preferences will appear when Wisp makes them available.</p>
    </section>{/each}
{/if}

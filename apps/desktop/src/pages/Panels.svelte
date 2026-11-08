<script lang="ts">
  import DataState from "../DataState.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  let { app }: { app: DesktopController } = $props();
</script>

{#if app.loading || !app.status}<DataState {app} />{:else}
  {#if !app.status.gameConnected && app.status.panels.length}<p
      class="field-hint offline-hint"
    >
      Connect WoW to show or hide panels. Your saved panels remain available
      here.
    </p>{/if}
  {#if !app.status?.panels.length}<section class="card empty-state">
      <Icon name="panel" size={34} />
      <h2>No panels yet.</h2>
      <p>
        Ask Wisp in game to create a tracker or panel. Your saved panels will
        appear here.
      </p>
    </section>{:else}{#each app.status.panels as panel (panel.id)}<section
        class="card panel-row"
      >
        <div class="integration-top">
          <div>
            <h2>{panel.title}</h2>
            <p>{panel.character}</p>
          </div>
          <span class="badge">{panel.bindings?.length || 0} tracked values</span
          >
        </div>
        <div class="actions">
          <ActionProgress {app} target={panel.id} />
          <button
            onclick={() => app.panelAction(panel, "show")}
            disabled={app.locked || !app.status.gameConnected}
            >Show in WoW</button
          ><button
            onclick={() => app.panelAction(panel, "hide")}
            disabled={app.locked || !app.status.gameConnected}>Hide</button
          ><button
            class="quiet danger"
            onclick={() => {
              app.confirm = {
                label: `Delete “${panel.title}”?`,
                run: () => app.panelAction(panel, "remove"),
              };
            }}
            disabled={app.locked}>Delete</button
          >
        </div>
      </section>{/each}{/if}
{/if}

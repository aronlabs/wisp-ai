<script lang="ts">
  import DataState from "../DataState.svelte";
  import ActionProgress from "../ActionProgress.svelte";
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  import IntegrationCard from "../IntegrationCard.svelte";
  import { request } from "../api";
  let { app }: { app: DesktopController } = $props();
</script>

{#if app.loading || !app.status}<DataState {app} />{:else}
  <div class="toolbar">
    <p class="muted">{app.status?.mcps.length || 0} custom connections</p>
    <button
      class="primary"
      onclick={() => app.edit(null)}
      disabled={app.locked || !app.status}
      ><Icon name="plus" size={17} />Add MCP</button
    >
  </div>
  <div class="connection-list">
    {#each (app.status?.integrations || []).filter((entry) => entry.group === "integrations" && !entry.parent) as entry (entry.id)}
      <div class="integration-group">
        <IntegrationCard
          {entry}
          tools={(app.status?.integrations || []).filter(
            (tool) => tool.parent === entry.id,
          )}
          locked={app.locked}
          busy={app.busy === "Updating integration" &&
          (app.busyTarget === entry.id ||
            (app.status?.integrations || []).some(
              (tool) => tool.parent === entry.id && tool.id === app.busyTarget,
            ))
            ? app.busy
            : ""}
          set={app.setIntegration}
        />
        {#each (app.status?.mcps || []).filter((server) => entry.id === "mcp:" + server.name) as server (server.name)}
          <div class="actions">
            <ActionProgress {app} target={entry.id} />
            <button onclick={() => app.edit(server)} disabled={app.locked}
              >Edit</button
            >
            <button
              onclick={() =>
                app.work(
                  "Testing " + server.name,
                  async () => {
                    const result = await request<{ count: number }>(
                      "/mcps/test",
                      { server },
                    );
                    app.feedback =
                      "Connected. " + result.count + " tools available.";
                  },
                  undefined,
                  entry.id,
                )}
              disabled={app.locked}>Test connection</button
            >
            <button
              class="quiet danger"
              onclick={() => app.removeMcp(server)}
              disabled={app.locked}>Remove</button
            >
          </div>
        {/each}
      </div>
    {:else}<section class="card empty-state">
        <h2>No integrations available yet</h2>
        <p>
          Connect WoW to discover supported addons, or add an MCP server to give
          Wisp more tools.
        </p>
      </section>{/each}
  </div>
  <p class="footnote">
    Changes apply to new tool calls. Disabling an integration preserves
    individual tool choices. Addon availability updates when WoW connects.
  </p>
{/if}

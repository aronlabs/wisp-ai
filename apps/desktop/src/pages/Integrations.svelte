<script lang="ts">
  import type { DesktopController } from "../desktop-controller.svelte";
  import Icon from "../Icon.svelte";
  import IntegrationCard from "../IntegrationCard.svelte";
  import { request } from "../api";
  let { app }: { app: DesktopController } = $props();
</script>

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
    <div>
      <IntegrationCard
        {entry}
        tools={(app.status?.integrations || []).filter(
          (tool) => tool.parent === entry.id,
        )}
        locked={app.locked}
        set={app.setIntegration}
      />
      {#each (app.status?.mcps || []).filter((server) => entry.id === "mcp:" + server.name) as server (server.name)}
        <div class="actions">
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
                "Connection test completed.",
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
  {/each}
</div>
<p class="footnote">
  Changes apply to new tool calls. Disabling an integration preserves individual
  tool choices. Addon availability updates when WoW connects.
</p>

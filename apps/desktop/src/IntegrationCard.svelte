<script lang="ts">
  import type { CapabilityView } from "@wisp/protocol/capabilities";
  let {
    entry,
    tools,
    locked,
    set,
  }: {
    entry: CapabilityView;
    tools: CapabilityView[];
    locked: boolean;
    set: (id: string, enabled: boolean) => void;
  } = $props();
</script>

<section class="card integration">
  <div class="integration-top">
    <div>
      <h2>{entry.name}</h2>
      <p>{entry.description}</p>
    </div>
    <label class="integration-switch"
      ><input
        type="checkbox"
        aria-label={`Enable ${entry.name}`}
        checked={entry.enabled}
        disabled={locked}
        onchange={(event) => set(entry.id, event.currentTarget.checked)}
      />Enabled</label
    >
  </div>
  <div class="integration-meta">
    <span class="badge" class:good={entry.available}>{entry.status}</span><span
      >{entry.kind === "mcp" ? "MCP" : entry.kind}</span
    >{#if entry.version}<span>v{entry.version}</span>{/if}<span
      >{tools.filter((tool) => tool.effective).length}/{tools.length} active</span
    >
  </div>
  {#if entry.reason}<p class="muted integration-reason">{entry.reason}</p>{/if}
  {#if tools.length}<details class="integration-tools">
      <summary>Tools & capabilities ({tools.length})</summary>
      {#each tools as tool (tool.id)}<label
          class="integration-tool"
          class:inactive={!entry.enabled}
        >
          <input
            type="checkbox"
            aria-label={`${entry.name}: ${tool.name}`}
            checked={tool.enabled}
            disabled={locked || !entry.enabled}
            onchange={(event) => set(tool.id, event.currentTarget.checked)}
          />
          <span
            ><strong>{tool.name}</strong>{#if tool.toolName}<code
                >{tool.toolName}</code
              >{/if}{#if !tool.available}<small class="tool-unavailable"
                >{tool.status}: {tool.reason ||
                  "Required API unavailable"}</small
              >{/if}<small>{tool.description}</small></span
          >
        </label>{/each}
    </details>{/if}
</section>

<style>
  .integration-switch {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    font-size: 13px;
  }
  input {
    accent-color: #bbd9a5;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .integration-reason {
    font-size: 13px;
    margin: 12px 0 0;
  }
  .integration-tools {
    margin-top: 16px;
    border-top: 1px solid #ffffff12;
    padding-top: 12px;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
    color: #b6c7af;
  }
  .integration-tool {
    display: flex;
    gap: 12px;
    padding: 14px 0;
    align-items: flex-start;
    border-bottom: 1px solid #ffffff08;
  }
  .integration-tool:last-child {
    border: 0;
    padding-bottom: 0;
  }
  .integration-tool span {
    display: grid;
    gap: 5px;
    min-width: 0;
  }
  strong {
    font-size: 13px;
    font-weight: 500;
  }
  code {
    font-size: 11px;
    color: #a3b999;
    overflow-wrap: anywhere;
  }
  small {
    font-size: 12px;
    line-height: 1.5;
    color: #929b9a;
  }
  .inactive {
    opacity: 0.5;
  }
</style>

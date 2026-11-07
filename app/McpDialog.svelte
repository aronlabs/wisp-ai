<script lang="ts">
  import { untrack } from "svelte";
  import { request, type Mcp } from "./api";
  import Icon from "./Icon.svelte";
  let {
    server,
    close,
    saved,
  }: { server: Mcp | null; close: () => void; saved: () => Promise<void> } =
    $props();
  const initial = untrack(() => server);
  let name = $state(initial?.name || "");
  let description = $state(initial?.description || "");
  let transport = $state(initial?.transport || "http");
  let address = $state(initial?.url || initial?.command || "");
  let args = $state(JSON.stringify(initial?.args || []));
  let env = $state("");
  let token = $state("");
  let clearToken = $state(false);
  let enabled = $state(initial?.enabled ?? true);
  let busy = $state(false);
  let note = $state("");
  let error = $state(false);
  async function submit(save: boolean) {
    if (busy) return;
    busy = true;
    note = save ? "Saving connection…" : "Testing connection…";
    error = false;
    try {
      const parsedArgs = transport === "stdio" ? JSON.parse(args) : [];
      if (
        !Array.isArray(parsedArgs) ||
        parsedArgs.some((a) => typeof a !== "string")
      )
        throw Error("Arguments must be a JSON array of strings.");
      const parsedEnv = env.trim() ? JSON.parse(env) : undefined;
      if (
        parsedEnv &&
        (typeof parsedEnv !== "object" ||
          Array.isArray(parsedEnv) ||
          Object.values(parsedEnv).some((v) => typeof v !== "string"))
      )
        throw Error("Environment must be a JSON object with string values.");
      const definition = {
        name,
        description,
        transport,
        enabled,
        args: parsedArgs,
        ...(transport === "stdio" ? { command: address } : { url: address }),
      };
      const payload = {
        server: definition,
        ...(parsedEnv ? { env: parsedEnv } : {}),
        ...(clearToken ? { token: "" } : token ? { token } : {}),
      };
      const result = await request<{ count: number }>(
        save ? "/mcps/save" : "/mcps/test",
        payload,
      );
      if (save) {
        await saved();
        close();
      } else note = `Connected. ${result.count} tools available.`;
    } catch (e) {
      error = true;
      note = String(e).replace(/^Error: /, "");
    } finally {
      busy = false;
    }
  }
</script>

<div class="scrim">
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mcp-title"
    tabindex="-1"
  >
    <header>
      <div>
        <p class="eyebrow">TOOL CONNECTION</p>
        <h2 id="mcp-title">{server ? "Edit connection" : "Add an MCP"}</h2>
      </div>
      <button
        class="icon-button"
        aria-label="Close dialog"
        onclick={close}
        disabled={busy}><Icon name="close" /></button
      >
    </header>
    <div class="form-grid">
      <label
        >Name<input
          bind:value={name}
          disabled={!!server || busy}
          placeholder="my_connection"
        /></label
      ><label
        >Transport<select bind:value={transport} disabled={busy}
          ><option value="http">Streamable HTTP</option><option value="sse"
            >SSE</option
          ><option value="stdio">Local process (stdio)</option></select
        ></label
      >
    </div>
    <label
      >Description<input
        bind:value={description}
        placeholder="What can this connection help with?"
      /></label
    >
    <label
      >{transport === "stdio" ? "Executable or command" : "Endpoint URL"}<input
        bind:value={address}
        placeholder={transport === "stdio" ? "npx" : "https://example.com/mcp"}
      /></label
    >
    {#if transport === "stdio"}<label
        >Arguments <span class="muted">JSON array</span><input
          bind:value={args}
        /></label
      ><label
        >Environment <span class="muted">Blank keeps stored values</span
        ><textarea rows="2" bind:value={env} placeholder={'{"API_KEY":"…"}'}
        ></textarea></label
      >{:else}<label
        >Bearer token <span class="muted">Blank keeps stored token</span><input
          type="password"
          bind:value={token}
          autocomplete="off"
        />{#if server?.hasToken}<span class="muted"
            >A token is securely stored.</span
          >{/if}</label
      ><label class="check-row"
        ><input type="checkbox" bind:checked={clearToken} />Remove stored token</label
      >{/if}
    <label class="check-row"
      ><input type="checkbox" bind:checked={enabled} />Enable connection</label
    >
    <p class:error class="notice-inline" aria-live="polite">
      {note ||
        "Test the connection before saving. Local commands run on your computer."}
    </p>
    <footer>
      <button onclick={() => submit(false)} disabled={busy || !name || !address}
        >Test connection</button
      ><button
        class="primary"
        onclick={() => submit(true)}
        disabled={busy || !name || !address}
        >{busy ? "Working…" : "Save connection"}</button
      >
    </footer>
  </div>
</div>

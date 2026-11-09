<script lang="ts">
  import type { DesktopController } from "./desktop-controller.svelte";
  import { desktop, request } from "./api";
  import ActionProgress from "./ActionProgress.svelte";
  let { app }: { app: DesktopController } = $props();
  let provider = $state<"auto" | "exa" | "chatgpt" | "disabled">("auto");
  let apiKey = $state("");
  let dirty = $state(false);
  $effect(() => {
    if (!dirty && app.status?.search) {
      provider = app.status.search.provider;
    }
  });
  function setup() {
    return { provider, apiKey: apiKey.trim() || undefined };
  }
  async function save() {
    await request("/search/save", setup());
    apiKey = "";
    await app.refresh();
    dirty = false;
  }
</script>

<section class="card provider-card">
  <div class="section-title">
    <div>
      <h2>Web search</h2>
      <p>
        Search globally across the public web, independently of your chat model.
      </p>
    </div>
    <span class="badge" class:good={app.status?.search?.hasExaKey}
      >{app.status?.search?.hasExaKey
        ? "Exa key saved"
        : "Exa public · no key needed"}</span
    >
  </div>
  <div class="search-form field-section">
    <label for="search-provider">Search service</label>
    <select
      id="search-provider"
      bind:value={provider}
      disabled={app.locked || !app.status}
      onchange={() => {
        dirty = true;
      }}
    >
      <option value="auto"
        >Auto — ChatGPT for subscription chats, Exa for API chats</option
      >
      <option value="exa">Exa for all chats</option>
      <option value="chatgpt">ChatGPT search only</option>
      <option value="disabled">Disabled</option>
    </select>
    <label for="exa-key"
      >Exa API key (optional) {app.status?.search?.hasExaKey
        ? "(leave blank to keep saved key)"
        : ""}</label
    >
    <input
      id="exa-key"
      type="password"
      bind:value={apiKey}
      autocomplete="off"
      spellcheck="false"
      maxlength="4096"
      disabled={app.locked || !app.status}
    />
    <p class="field-hint">
      Exa works without a key through its public MCP service, with free rate
      limits. Searches cover the public web and return source links and
      excerpts. An optional key uses your Exa account and stays protected by the
      operating system.
    </p>
    <p class="field-hint">
      A saved key uses your account credits and may incur Exa charges. Testing
      sends one search request using the saved or entered key, or public access.
    </p>
    <div class="actions">
      <button
        class="quiet"
        disabled={!!app.busy}
        onclick={() =>
          app.work(
            "Opening Exa dashboard",
            () => desktop("open_exa_dashboard"),
            "An API key is optional; public search works without one.",
            "search",
          )}>Get Exa key</button
      >
      <button
        disabled={app.locked || !app.status}
        onclick={() =>
          app.work(
            "Testing Exa",
            () => request("/search/test", setup()),
            "Exa accepted the test search. Results depend on source coverage.",
            "search",
          )}>Test Exa</button
      >
      <button
        class="primary"
        disabled={app.locked || !app.status}
        onclick={() =>
          app.work(
            "Saving search settings",
            save,
            "Search settings saved.",
            "search",
          )}>Save search settings</button
      >
      {#if app.status?.search?.hasExaKey}<button
          class="quiet danger"
          disabled={app.locked}
          onclick={() => {
            app.confirm = {
              label:
                "Remove the saved Exa API key? Searches will use public Exa access and its free rate limits.",
              run: () =>
                app.work(
                  "Removing Exa key",
                  () => request("/search/remove-exa", {}),
                  "Exa key removed.",
                  "search",
                ),
            };
          }}>Remove Exa key</button
        >{/if}
    </div>
    <ActionProgress {app} target="search" />
  </div>
</section>

<style>
  .search-form {
    display: grid;
    gap: 12px;
  }
</style>

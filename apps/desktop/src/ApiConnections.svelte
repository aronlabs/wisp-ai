<script lang="ts">
  import {
    providerDefinitions,
    type ProviderId,
    type ConnectionView,
    type ConnectionModel,
  } from "@wisp/protocol/providers";
  import type { DesktopController } from "./desktop-controller.svelte";
  import { request } from "./api";
  import ActionProgress from "./ActionProgress.svelte";
  let { app }: { app: DesktopController } = $props();
  let editing = $state(false);
  let id = $state<string | undefined>();
  let provider = $state<ProviderId>("anthropic");
  let name = $state("");
  let apiKey = $state("");
  let baseURL = $state("");
  let models = $state<ConnectionModel[]>([]);
  let discovered = $state<ConnectionModel[]>([]);
  let modelId = $state("");
  let contextWindow = $state<number | undefined>();
  let definition = $derived(
    providerDefinitions.find((p) => p.id === provider)!,
  );
  function open(connection?: ConnectionView) {
    id = connection?.id;
    provider = connection?.provider || "anthropic";
    name = connection?.name || "";
    apiKey = "";
    baseURL = connection?.baseURL || "";
    models = connection?.models.map((m) => ({ ...m })) || [];
    discovered = [];
    modelId = "";
    contextWindow = undefined;
    editing = true;
  }
  function addModel() {
    const value = modelId.trim();
    if (!value || models.some((m) => m.id === value)) {
      return;
    }
    const found = discovered.find((m) => m.id === value);
    models = [
      ...models,
      {
        ...found,
        id: value,
        contextWindow: contextWindow || found?.contextWindow,
      },
    ];
    modelId = "";
    contextWindow = undefined;
  }
  function setup() {
    return {
      id,
      provider,
      name: name.trim() || definition.name,
      apiKey: apiKey || undefined,
      baseURL: baseURL.trim() || undefined,
      models,
    };
  }
  async function save() {
    await request("/connections/save", setup());
    apiKey = "";
    editing = false;
    await app.loadModels();
  }
</script>

<section class="card provider-card">
  <div class="section-title">
    <div>
      <h2>API connections</h2>
      <p>Use your own API key. Usage is billed by the selected provider.</p>
    </div>
    <button
      disabled={app.locked || !app.status || editing}
      onclick={() => open()}>Add connection</button
    >
  </div>
  {#each app.status?.connections || [] as connection (connection.id)}
    <div class="api-connection-row">
      <div>
        <strong>{connection.name}</strong>
        <p class="muted">
          {providerDefinitions.find((p) => p.id === connection.provider)?.name} ·
          {connection.models.length} model{connection.models.length === 1
            ? ""
            : "s"} · {connection.hasKey
            ? "Key saved"
            : connection.provider === "compatible"
              ? "Local / no key"
              : "Key missing"}
        </p>
      </div>
      <div class="actions">
        <button
          disabled={app.locked || editing}
          onclick={() => open(connection)}>Edit</button
        >
        <button
          class="quiet danger"
          disabled={app.locked || editing}
          onclick={() => {
            app.confirm = {
              label: `Remove “${connection.name}”? Chats and memory stay on this computer. Chats using this connection will need another model.`,
              run: () =>
                app.work(
                  "Removing AI connection",
                  async () => {
                    await request("/connections/remove", { id: connection.id });
                    await app.loadModels();
                  },
                  "Connection removed.",
                  "connections",
                ),
            };
          }}>Remove</button
        >
      </div>
    </div>
  {/each}
  <ActionProgress {app} target="connections" />
  {#if editing}
    <div class="field-section api-connection-form">
      <label for="ai-provider">Provider</label>
      <select
        id="ai-provider"
        bind:value={provider}
        disabled={app.locked || !!id}
        onchange={() => {
          models = [];
          discovered = [];
          modelId = "";
          baseURL = "";
          apiKey = "";
        }}
      >
        {#each providerDefinitions as item}<option value={item.id}
            >{item.name}</option
          >{/each}
      </select>
      <label for="ai-name">Connection name</label>
      <input
        id="ai-name"
        bind:value={name}
        placeholder={definition.name}
        maxlength="80"
        disabled={app.locked}
      />
      <label for="ai-key"
        >API key {id
          ? "(leave blank to keep saved key)"
          : provider === "compatible"
            ? "(optional for local servers)"
            : ""}</label
      >
      <input
        id="ai-key"
        type="password"
        bind:value={apiKey}
        autocomplete="off"
        spellcheck="false"
        disabled={app.locked}
      />
      {#if provider === "compatible"}
        <label for="ai-url">Base URL</label>
        <input
          id="ai-url"
          bind:value={baseURL}
          placeholder="http://localhost:1234/v1"
          disabled={app.locked}
        />
      {:else}
        <details>
          <summary>Custom endpoint</summary>
          <label for="ai-url">Base URL</label><input
            id="ai-url"
            bind:value={baseURL}
            placeholder={definition.baseURL}
            disabled={app.locked}
          />
        </details>
      {/if}
      <div class="label-row">
        <label for="ai-model">Models available in Wisp</label>
        <button
          class="text-button"
          disabled={app.locked || (provider === "compatible" && !baseURL)}
          onclick={() =>
            app.work(
              "Loading provider models",
              async () => {
                const { models: _models, ...input } = setup();
                discovered = (
                  await request<{ models: ConnectionModel[] }>(
                    "/connections/discover",
                    input,
                  )
                ).models;
              },
              "Models loaded. Choose models to add below.",
              "connection-editor",
            )}>Load model list</button
        >
      </div>
      <p class="field-hint">
        Choose a model with tool calling. You can enter its exact ID if the
        provider cannot list models.
      </p>
      <div class="api-model-fields">
        <input
          id="ai-model"
          bind:value={modelId}
          list="ai-model-options"
          placeholder={definition.example}
          disabled={app.locked}
        />
        <datalist id="ai-model-options"
          >{#each discovered as model}<option value={model.id}
              >{model.name || model.id}</option
            >{/each}</datalist
        >
        <input
          aria-label="Context window in tokens"
          type="number"
          min="1"
          max="100000000"
          bind:value={contextWindow}
          placeholder="Context tokens"
          disabled={app.locked}
        />
        <button disabled={app.locked || !modelId.trim()} onclick={addModel}
          >Add model</button
        >
      </div>
      {#each models as model, index (model.id)}
        <div class="api-model-fields">
          <span>{model.id}</span>
          <input
            aria-label={`Context window for ${model.id}`}
            type="number"
            min="1"
            max="100000000"
            bind:value={models[index]!.contextWindow}
            placeholder="Context tokens (required)"
            disabled={app.locked}
          />
          <button
            class="quiet"
            disabled={app.locked}
            aria-label={`Remove ${model.id}`}
            onclick={() => {
              models = models.filter((m) => m.id !== model.id);
            }}>Remove</button
          >
        </div>
      {/each}
      <p class="field-hint">
        Set the context window for every model so Wisp can manage long
        conversations. For local models, use the tokens your server allocates.
        Choose reasoning per chat in game when the model supports it. Default
        keeps the provider's setting; higher effort can use more time and
        tokens.
      </p>
      <div class="actions">
        <button
          disabled={app.locked || !models.length}
          onclick={() =>
            app.work(
              "Testing AI connection",
              () => request("/connections/test", setup()),
              "Connection and tool calling verified for the first model.",
              "connection-editor",
            )}>Test first model</button
        >
        <button
          class="primary"
          disabled={app.locked ||
            !models.length ||
            !!modelId.trim() ||
            models.some((m) => !m.contextWindow)}
          onclick={() =>
            app.work(
              "Saving AI connection",
              save,
              "Connection saved. Choose a default model below.",
              "connection-editor",
            )}>Save connection</button
        >
        <button
          class="quiet"
          disabled={app.locked}
          onclick={() => {
            apiKey = "";
            editing = false;
          }}>Cancel</button
        >
      </div>
      <p class="field-hint">
        Testing sends a small request to the provider and may incur usage
        charges.
      </p>
      <ActionProgress {app} target="connection-editor" />
    </div>
  {/if}
  <p class="privacy-note">
    API keys are protected by your operating system. Configure Exa under Web
    search to use web search with API models. Game tools and other enabled
    databases work independently of the search service.
  </p>
</section>

<style>
  .api-connection-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
  }
  .api-connection-form {
    display: grid;
    gap: 12px;
  }
  .api-model-fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.7fr) auto;
    gap: 10px;
    align-items: center;
  }
  .api-model-fields span {
    overflow-wrap: anywhere;
  }
  details input {
    margin-top: 8px;
  }
  @media (max-width: 650px) {
    .api-model-fields {
      grid-template-columns: 1fr;
    }
    .api-connection-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>

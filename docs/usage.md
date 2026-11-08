# Using Wisp

[Home](../README.md) · [Development](development.md) · [Integrations](reference.md)

## Conversations and hover questions

After [setup](../README.md#get-started-on-windows), use `/wisp` or `/wispai` to open chat. **+** starts a separate conversation; **−** or Escape minimizes the window. Choose model and effort per chat, or set the default for new chats in the desktop **Connections** page.

Shift-click supported items and spells into the input. Linked references offer native tooltips, map coordinates or macro code; a link identifies something, not whether your character owns or knows it.

Choose **Bind inline chat** in Wisp’s in-game settings, then hover an item, spell, unit or supported link and press the shortcut. `/wisp ask` also uses the current hover. Follow-ups keep that reference; **Expand** moves the query into a full conversation, and Escape dismisses it.

Replies arrive in batches, with tool/progress indicators while Wisp works. The context indicator estimates model context use, not your subscription quota; compaction preserves the visible transcript. Separate Wowhead search calls are excluded from its totals.

## Trackers and suggestions

Ask Wisp to save a tracker for your character. Panels survive chats and reloads; restore hidden ones with **Show saved panels** in-game or the desktop **Panels** page. Bag counts, money, level and quest completion update locally without model calls. Panel buttons send follow-up questions; ordinary reply cards are temporary unless saved.

Suggestions are off by default. Enable level-up or weapon events on the desktop **Suggestions** page. They use your connected model, skip combat and active turns, and occur at most once per character every ten minutes. Open a **Read** notification to continue the suggestion as a conversation. Automatic turns cannot perform built-in write actions; external MCP tools require an explicit read-only hint.

## Controls, privacy and limits

In-game **Settings > Integrations** controls built-in tools, MCP connections, individual MCP tools and memory slots. Changes affect new calls immediately; running calls may finish. Disabling character queries does not remove the basic identity/location context described below.

### Actions you control

| Action | What to expect |
| --- | --- |
| Map pins | Requested pins use validated maps/coordinates and verified placement. Undo preserves pins you changed yourself. |
| Macros | New macros only, outside combat. Inspect the code and place it yourself; Wisp cannot overwrite, run or assign it to a bar. Script, console, click and chat commands are excluded. |
| Settings | Supported CVars and registered AceConfig options offer a preview. Use **Apply** or explicitly ask to apply it; **Undo** preserves later player edits. |

Settings application checks combat, character identity and stale values, then reads back the result. Failures attempt rollback and report incomplete restoration; the last 30 proposals retain previous values locally. Action bars and keybindings are read-only. Unsupported addon options require an integration, not edits to another addon’s source.

Movement, casting, targeting, training and trading remain with you. Built-in shell/file-editing tools are disabled; generated panels use validated native controls rather than executable code. These controls do not sandbox custom MCP software: stdio servers run local programs, and remote servers receive tool arguments. Choose servers you trust; see [MCP setup](reference.md#custom-mcp-connections).

### What leaves your computer

Each message includes available character name/realm, level, class, race, faction, game version/build and location. Other state—such as bags, quests and equipment—is read on demand. Prompts, tool results, conversation context and recalled memory can go to ChatGPT; enabled external sources receive lookup arguments. Built-in knowledge integrations do not upload whole game saves or memory documents. Custom servers have their own behavior and policies.

The bridge holds the ChatGPT grant and proxies model requests with `store: false`; this does not mean the provider receives no data or retains nothing. Neither the agent nor desktop webview receives the ChatGPT credentials. Windows credentials use DPAPI for the current user, so changing Windows users requires signing in again. See [OpenAI’s sign-in flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

### Local data and deletion

Installed Windows data lives in `%APPDATA%/com.wisp.ai`, separate from application resources. Source runs default to the repository root; `WISP_DATA_DIR` overrides it.

| Data | Path relative to the data root |
| --- | --- |
| Configuration | `config.local.json` |
| Conversations | `runtime/chats.json` |
| Shared preferences and character plans | `runtime/memory/` |
| Tool choices / custom MCP metadata | `runtime/capabilities.json` / `runtime/mcp.json` |
| Agent log | `runtime/eve.log` |

WoW stores UI preferences and drafts in the `WispAIDB` SavedVariables. Logs may contain conversations and tool data: redact them before sharing, and never share credential stores, tokens or private configuration.

Use **Settings > Memory** to view, edit or forget notes. Deleting a chat does not delete memory; disabling memory tools preserves notes and the editor. Memory stores preferences/plans, not current character state.

**Connections** supports saved accounts, switching and disconnection. Disconnect attempts to revoke Wisp’s refresh token and clears local credentials, but leaves chats, memory and other applications’ sessions intact.

### Reading the answers

Missing readings and database coverage remain unknown, not zero or proof of absence. External references can be stale or from a different build; market estimates come from uploaded scans, not live listings. Trainer and auction readings need their windows open, and auctions expose only already-loaded partial results. Item comparisons report raw stat differences; [experimental simulations](reference.md#experimental-local-dps-simulations) estimate specific mage scenarios, not live combat or an optimal build.

## Troubleshooting

| Symptom | Try this |
| --- | --- |
| Addon missing | Select the folder containing `Wow.exe`, install/update from **Overview**, fully restart WoW, and enable Wisp AI and its helpers. |
| Disconnected or replies stop | Keep the desktop app running. Check **Diagnostics** and `/wisp diag`; use `/wisp reconnect` for a fresh handshake or `/reload` to renew receive channels. Large payloads take several seconds. Significant game updates may change file-loading behavior. |
| Sign-in or models unavailable | Finish browser authorization in **Connections** and refresh the model list. Expired access, identity-only consent or an ambiguous token refresh may require signing in again. |
| Tool unavailable | Check in-game tool toggles and required windows; missing APIs or source coverage can also prevent a result. |
| App remains after closing | Closing hides it in the tray. **Exit Wisp** stops it, but waits for any active turn to finish. |

For an old portable install, choose **Import your previous installation** on first launch. Existing Wisp saves are preserved; renamed addon folders are backed up under `Interface/WispAI-RenameBackup`. Older Codex-adapter installs need Wisp’s own ChatGPT sign-in. Fully restart WoW after migration.

## Integrations

Desktop **Integrations** and WoW **Settings > Integrations** share the same controls.
Each integration has a master switch and individual capabilities. Disabling a parent
preserves child preferences. Enabled and available capabilities are projected into
Eve's dynamic definitions; the bridge enforces the same checks on game/RPC calls.

- **World of Warcraft:** live character, inventory, progression, references, settings, maps and macros.
- **Questie:** installed QuestieDB Forever NPC locations, with optional Questie trainer/service indexes. Missing, incompatible and partial providers are distinguished. No addon source is modified.
- **TheWoWDB / Wowhead / Everloot:** primary Forever catalog, scoped fallback search, and complementary MCP observations respectively. Configured network sources are not claimed to be online until a request succeeds.
- **WoWSims Forever:** the bundled experimental mage simulator.
- **Wisp:** titles, persistent panels and optional memory.
- **Custom MCPs:** Add/Edit/Test/Remove plus per-tool switches after discovery.

Local agent tools have public names such as `questie__find_npc_locations` and
`wow__query_character`. Preference IDs remain internal stable keys. Addon reports
piggyback on the existing hello/heartbeat; unchanged reports do not publish new
snapshots. Reports expire after three minutes and reset on reload. Availability is
kept separate from saved choices. A compact `integrations_context` block tells the
agent what is unavailable or disabled for the current turn.


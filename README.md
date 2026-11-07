# Wisp AI for WoW: Forever

A native in-game reference assistant built with Eve and your ChatGPT
subscription. No pixel strips or screen capture. The addon and fixed UI/tool text
are in English; the assistant replies in the language you use.

## First use

1. Open `Wisp.exe`. Release ZIPs include Node and npm; no separate Node installation is needed. Choose the WoW client folder and install/update the addon from Overview.
2. In the **ChatGPT** tab, click **Continue with ChatGPT** and authorize Wisp in your browser. Click **Load models**, choose a model and **Use model**.
3. Fully restart WoW after the first installation so all helper files are discovered.
4. Enable **Wisp AI** and its helper channels in AddOns.
5. Type `/wisp`. Use `−` or Escape to minimize it into an always-visible bar.

The left column contains separate conversations. `+` starts a new one, its edge
button folds the column, and the mouse wheel scrolls the session list. Each
conversation has its own Eve session and saved draft. Shift-click supported items
and spells into the input. Hover resolved references for native tooltips.
Explicit user links are extracted into a small `linked_references` context block
with their IDs and localized labels. They identify an entity without proving
that it is learned/owned. The model generates a catalogue of verified references
and inserts `[[ref:key]]` markers in its answer. Spell/item/quest references show
native tooltips; map references open zones or show clickable coordinates; macro
references show the actual code and allow picking up the macro.
Every assistant text part uses newline-delimited JSON `reference` and
`text_delta` records. The bridge parses these incrementally and sends only visible
text and validated reference data to WoW. Partial updates are coalesced (at least
1.8 seconds apart, at most eight per text part); completion always flushes the
final result. Unknown references show an unavailable label without retries.
There is no legacy assistant-link parser or automatic plain-name linking.
`scripts/migrate-replies.ts` converts existing local transcripts once and creates
a timestamped backup before writing them. Stop the bridge before running it.
While a turn is pending, a temporary Wisp row at the end of the transcript
shows Sending/Thinking, the active tool and elapsed time. Its animation is local,
never saved to history or sent through transport, and disappears on completion.

## Inline questions and native panels

In Wisp settings, choose **Bind inline chat** and press an unused key
combination. Existing bindings are preserved. Hover an item, spell, unit or
supported quest/map/macro link and press that key to open a small floating query.
`/wisp ask` also opens the inline query when a supported hover is available.
The hovered identity stays attached to follow-ups. Inline queries keep the main
window and its selected conversation unchanged; **Expand** promotes the query
into a normal sidebar conversation. Escape dismisses the inline card.

The reply stream also accepts validated `ui_node` events. Stable IDs compose
cards, rows, columns, reference links, statistics, progress bars, text, buttons,
toggles, selectors and sliders. Controls preserve local edits across snapshots;
buttons submit selected values for a follow-up or apply/undo a settings proposal.
No generated Lua, HTML, JavaScript or arbitrary endpoint is executed. The same
components work in the main transcript and inline queries. Panels render below
the text of their assistant part and share its verified reference catalogue.

## Game and addon settings

`get_settings` reads game CVars, installed addons, action bars and keybindings,
and automatically discovers registered AceConfig options. Discovery includes
current scalar values, typed choices, ranges and writable flags, with filtering
and pagination. The game CVar list covers common audio, camera, graphics,
nameplate, interface and gameplay settings; additional exact public CVar IDs can
be queried. An addon must have registered its options before discovery can see
them. Unsupported addons need an integration implemented in Wisp.

`update_settings` previews changes and returns a transaction ID, then applies a
requested proposal through native APIs/AceConfig setters and verifies readback.
Panels can offer Apply and Undo buttons. Previous values are retained locally
for the last 30 proposals. Stale values, changed characters and combat block
application; failures attempt rollback and report if restoration was incomplete.
`undo_settings` preserves later player edits. Action bars/bindings are read-only
through these tools. Script editors, profile management, execute/reset/delete
operations and multiline inputs need dedicated integrations. Other addons'
source files are never edited. All three tools have their own capability toggle.

## Desktop application and distribution

The native Windows app has Overview, ChatGPT, MCP connections, Panels and Suggestions tabs.
It runs the bridge without a console window, minimizes to the system tray on close,
and stops its bridge from the tray Exit command. User data stays in runtime/ beside
the portable application. Wisp has its own Sign in with ChatGPT connection,
using the official OSS dynamic registration flow (PKCE and verified OpenID identity).
No API key, shared Codex client ID, Codex installation or copied Codex auth file is used.
Credentials are encrypted with Windows DPAPI under LocalAppData for this Windows
user and installation path. ChatGPT model calls use the public Responses API with
store:false; Eve only receives a per-process authenticated loopback endpoint.

The ChatGPT tab shows connection state and saved accounts, supports browser sign-in,
cancellation, account switching and independent disconnection, and lists the models
available to the active grant. Use model persists the choice and restarts the agent
when no turn is active. Browser cancellation, identity-only consent, expired access,
refresh rotation and remote revocation failures have explicit states. Disconnect
revokes Wisp's own refresh token and clears its local credentials; it leaves
chats, memory and other applications' sessions intact. An ambiguous refresh failure
requires sign-in again rather than retrying a potentially rotated token.

Existing installs must authorize Wisp once; the previous Codex auth adapter
has been removed. No credentials are shipped in releases. Moving the installation
to a different folder or Windows user requires signing in again.
Official flow: https://developers.openai.com/siwc/token-sharing-open-source/sign-in

MCP connections support Streamable HTTP, SSE and local stdio commands with structured
arguments. Add/Edit can test tool discovery before saving. Bearer tokens and stdio
environment values are encrypted with Windows DPAPI for the current user; manifests
contain only nonsecret metadata. Local MCP processes do not inherit bridge tokens.
The agent accesses connections through an authenticated relay; parent/individual
capability toggles are enforced there as well. OAuth-only MCP services need a
supported token flow or a separately configured local adapter.

Persistent panels are character-scoped and survive chats and reloads. Ask the agent
to create one, then edit it conversationally. Stat/progress bindings for bag item
counts, money, level and quest completion update locally without LLM calls. Move,
minimize or hide windows; Show saved panels in WoW settings or the desktop Panels
tab restores them. Persistent panel buttons send follow-up questions through inline
chat. Generic reply UI remains temporary unless explicitly saved with manage_panel.

Suggestions are off by default. Enable level-up/weapon events in the desktop app.
Events are skipped in combat or while another turn is active; duplicate events,
stale events and more than one suggestion per character every ten minutes are
suppressed. The agent reads relevant live state, can return no_tip to remain quiet,
and cannot perform authored write actions during automatic turns. External MCP
tools require an explicit readOnlyHint for automatic advice. Useful results appear
as dismissible Read notifications; opening one promotes it into a conversation.

Build the native launcher with scripts/build-desktop.ps1. scripts/package-release.ps1
creates a Windows x64 ZIP plus SHA-256 checksum under dist/, with Node/npm, dependencies,
licenses and corresponding source. It excludes personal config, .eve, chats, memories
and stored credentials. The tag workflow builds a draft GitHub release; nothing is
published from the local build. The current executable is unsigned.

## Agent and tools

- Eve `1.0.0-rc.6`, Node 24+, TypeScript and Lua.
- The OpenAI SDK sends model calls through Wisp's local bridge. Only the bridge
  holds its own ChatGPT OAuth credentials; no API key is configured.
- `query_character({ sections: [...] })` asks the addon for a **fresh** reading.
  Supported sections: `character`, `location`, `talents`, `spells`, `quests`,
  `gear`, `bags`. Missing APIs produce an explicit unavailable result.
- Every sent message automatically includes only basic identity, level, class,
  faction, game version and location in a tagged `game_context` JSON block. The
  bridge excludes money, XP, talents, spells, quests, equipment and bags from
  that block. Other state is queried with tools only when relevant.
- Talent reads return applied unspent, spent and total points, selected ranks and
  branches, plus separate pending-preview counts when available. Missing or
  ambiguous currency readings stay unknown. The first currency follows the
  [Forever talent UI](https://github.com/Gethe/wow-ui-source/blob/forever/Interface/AddOns/Blizzard_PlayerSpells/Camelot/ClassTalents/Blizzard_ClassTalentsFrame.lua);
  shared pools are counted once and primary counts exclude staged changes.
- `set_conversation_title` lets the model name a conversation in the user's
  language. It updates sidebar metadata without adding chat/tool rows. Existing
  unnamed conversations are named on their next user message.
- Native Eve memory slots recall local preferences and character-specific plans
  across sessions. Entries are stored atomically under `runtime/memory/`, shared
  preferences are separate from each realm/character's guide and goals, and live
  character state is never saved as memory. View, edit or forget entries in
  **Settings > Memory**. Changing/deleting a conversation does not delete memory.
- `inspect_reference`, `query_progression`, `inspect_target`, `inspect_trainer`,
  `compare_items`, `query_resources` and `inspect_auctions` read game data on demand.
  Trainer and auction reads require the respective window to be open. Auctions
  read only already-loaded partial results; no scans, purchases or posts occur.
- Requested actions are available through `set_map_waypoint`,
  `clear_map_waypoint` and `create_macro`, with `inspect_map`/`inspect_macros`
  for checking the current state. Map pins use verified UI map IDs and percentage
  coordinates, are read back after writing, and can restore the prior pin.
  Undo leaves a pin the player changed untouched. Native navigation is optional
  and reported separately from pin placement.
- Macro creation is outside combat, new-only and limited to normal macro
  commands. Existing macros are never overwritten, and no macro is executed or
  assigned to a bar. Hover a returned macro reference to inspect the actual code;
  click it to pick up the macro by its current name and place it yourself.
  Actions are bound to the current realm/character, deduplicated on delivery,
  and individually controlled in **Settings > Tools & MCPs**.
- Native `web_search` is enabled. A small adapter normalizes Eve's subscription
  provider metadata and removes the unsupported `safety_identifier` field while
  retaining Eve's original authentication and model transport.
- Shell and file-editing tools are disabled.

## MCP connections

Copy `mcp.example.json` to a local configuration, add your chosen HTTP/SSE MCP
servers, and set `mcpConfig` in `config.local.json` to that filename. A server can
name a `tokenEnv` environment variable for its bearer token; do not put secrets
in source. Restart the bridge after changing configuration. A stdio-only server
needs a local HTTP adapter.

The read-only [Everloot MCP](https://everloot.app/docs/mcp/clients) is enabled
separately in `agent/connections/everloot.ts`. Its allowlist covers reference
pages, sources/relations, talent plans, profession recipes, nearby locations,
market values, price history, coverage and changes. It requires no API key or
addon/uploader installation. Player-specific upload/guild/ledger tools are not
exposed. No game save files or memory documents are uploaded.

Everloot market estimates come from uploaded scans and may be missing or stale;
they are not live listings. Answers must retain the returned source, credit,
licence, data age and build/coverage limitations. Public endpoints are rate
limited. Disable the connection by removing its authored definition if desired.
Use **Settings > Tools & MCPs** to enable or disable individual local tools,
configured MCP connections, Everloot's individual tools, and the two memory
slots. Settings are saved locally in `runtime/capabilities.json` and apply to
new calls without restarting the bridge. Calls already running may finish.
Turning off a parent MCP preserves its child choices; disabling memory keeps
saved notes and the Settings memory editor. Basic identity/location context
remains independent of the on-demand character-reading tool.

Eve dynamically removes disabled local tools and MCP connections/tool names.
The bridge also rejects disabled local reads and memory calls. Eve rc.6 does
not support dynamic native provider-tool declarations, so native web search is
filtered from the model's offered tools in the subscription adapter instead.

## Development

```sh
npm install
npm run check
npm test
npm run install-addon -- "E:\Blizzard\World of Warcraft\_forever_"
npm start
```

The bridge starts Eve automatically on loopback port 43186. A separate loopback
RPC endpoint on 43187 authenticates character and title tool requests with an ephemeral
token passed only to the Eve child process. The same authenticated endpoint proxies
model requests with Wisp's own ChatGPT grant. Sign in through the native app;
no Codex executable or global Node installation is needed in a release.

## Transport and limits

Outbound packets use 128 helper addon enable states, saved through
`C_AddOns.SaveAddOns()` and decoded from `AddOns.txt`. Compressed packets include
session and sequence identifiers and are retried until acknowledged. Inbound
snapshots load through 1024 preinstalled load-on-demand addons. The receiver polls
only during startup, pending reliable requests or active conversations. It keeps
reading after the hello is acknowledged until the agent becomes ready. Duplicate
payloads back off, connected idle UI never loads a channel, and a new user action
wakes the receiver immediately. Transport does not depend on sound settings or
PlaySoundFile. The desktop reports WoW connected only after a ready snapshot has
been acknowledged by the addon.
Only visible state changes advance revisions; invisible stream events and
unchanged snapshots do not. Polls and heartbeats need no acknowledgement payload,
and late outbound packets cannot undo the latest revision acknowledged by WoW.
One outbound heartbeat per minute supports reconnection without spending idle
inbound slots. Text/events are batched, not transmitted token by token.

Slots are finite within one UI load. `/reload` renews the pool; use `/wisp diag`
for the cursor, and `/wisp reconnect` to send a fresh handshake. A large message
or character reading can take several seconds. The addon file-loading behavior
must be checked after significant game updates.

Conversations are stored locally in `runtime/chats.json`; WoW UI preferences and
drafts use `WispAIDB`. `runtime/eve.log` is a development diagnostic log and
can contain conversation/tool data. Do not share it without reviewing its contents.

## Validation

Tests cover framing, missing frames, duplicate suppression, counter wrap, Unicode,
Lua syntax, on-demand reads, stale-state avoidance and UI event normalization.
OAuth tests use signed test identities to exercise callback validation, registration,
refresh rotation, scope checks and independent revocation. SDK tests verify streamed
success, quota failures and interrupted responses through the local proxy. Release
smoke checks start the bundled agent with no global Node/Codex on PATH and require
an independent sign-in. Real browser consent and subscription inference must also
be checked with the connected account; earlier live checks of the former Codex
adapter do not validate this independent authentication flow.

GPL-3.0-only. See LICENSE and NOTICE for the thott transport attribution.

## Rename from Companion

The installer imports saved addon preferences and inline keybindings once, preserves
original saves, and moves the former addon and helper directories to an Interface/
WispAI-RenameBackup folder outside AddOns. Existing Wisp saves are never overwritten.
The desktop secret helper imports the encrypted credential store once under WispAI;
chats, memories, configuration and ChatGPT registration identifiers remain intact.
Use /wisp or /wispai after fully restarting WoW to discover the renamed addon.

## Code style and checks

Run `npm run format` before committing. Oxfmt formats TypeScript, JSON, YAML and
Markdown; StyLua formats Lua; CSharpier formats the Windows desktop source.
All configurations live in the repo. `npm run lint:fix` applies safe Oxlint fixes.
`npm run check` checks formatting, lint (including warnings), and TypeScript.
`npm test` runs the regression suite. Both PRs and pushes to main run these checks.

Development uses Node 24 and, for the C# formatter, the .NET 8 runtime (not the SDK).
The CSharpier helper downloads a pinned, checksum-verified package on first use and
caches it under node_modules/.cache; subsequent format checks run locally. These
are development tools and do not add a runtime requirement for the released app.

The bridge entry point is `src/main.ts`; Eve process management is isolated in
`src/agent-process.ts`, and non-streaming response collection in
`src/response-stream.ts`. Desktop startup and protected storage live in
`desktop/Program.cs`; `desktop/Wisp.cs` builds each UI tab in a separate method.

## Forever knowledge sources

NPC destinations use the optional installed QuestieDB Forever provider through
`find_npc_locations`. Questie's public class-trainer index resolves trainer IDs,
and its townsfolk service index resolves transmog, barber, banking, auction and
other supported services without knowing an NPC's name first. Use mode=services
and the explicit service enum, such as Transmogrifier. The database supplies spawn
positions and field provenance. Another provider
flavor is rejected. Area IDs are converted through Questie's zone API and checked
against native map metadata and the reverse mapping. Points with invalid/sentinel
coordinates or an ambiguous inherited map frame are withheld. These are database
locations, not live sightings; phase constraints and missing coverage remain
explicit. No third-party addon files are modified or installed. An unavailable
provider leaves the existing Forever knowledge fallbacks available.

Live character readings remain authoritative for the player. External catalog facts
start with TheWoWDB through search_database and get_database_entity. The API path is
fixed to /api/v1/forever/, response versions/kinds are checked (including search
rows), and record links, attribution, build and pagination are preserved. Responses
are cached for up to an hour with bounded storage and ETag revalidation. Missing
data, source errors and rate limits are reported explicitly. Beta catalog data is
not silently treated as the current game build. See https://thewowdb.com/developers/.

Everloot remains a complementary MCP for player observations, relationships,
professions, talents and realm scan history. The search and changes connections
supply version=forever and game=forever as application-owned Eve arguments, hidden
from the model. Unfiltered cross-version entity/lore tools are not exposed.

The web_search tool now uses a backend-controlled Wowhead search with a fixed
Forever query and a Wowhead domain filter. Only HTTPS Forever page URLs are
accepted; summaries with other-version citations or retrieved sources are withheld.
If discovery mixes versions, its summary is discarded and a fresh request reads
only verified Forever URLs. Both requests share one timeout budget.
It uses the existing ChatGPT connection/model, without another API key, MCP process
or browser. Source controls remain in Tools & MCPs.

## Local DPS simulations

`simulate_dps` uses the experimental WoWSims Forever levelsim fork pinned in
`simulator/manifest.json`. The main WoWSims engine hard-codes level 60; this fork
adds explicit player levels, base stats, spell ranks and combat tables for 1–60.
The mage adapter compares up to three plans with a once-only ordered opener and
a repeating priority list. Actions use learned rank IDs with optional mana
thresholds; cooldown readiness, complete channels and wand timing follow the
engine. It supports Frostbolt, Fireball, Fire Blast, Arcane Missiles, Frost Nova,
Arcane Explosion, Shoot and Orc Blood Fury. Each scenario has a stationary single
target, fixed distance, 10–180 seconds and 100–2,000 iterations. It reads the current
character, applied talents, spellbook and equipped items itself. The model cannot
supply a different level or gear set. Missing readings, unknown talents/items,
pending talent changes, an unlearned engine-selected rank or a mismatched binary
produce an unavailable result with no DPS. Settings can disable the capability.

Results include level, scenario, mean/variation, damage by spell, engine source
and assumptions. The engine applies Arcane Intellect automatically. No external
buffs, consumables, movement, incoming attacks or latency are modeled by this
adapter. Wand use must be explicit and assumes maximum wand skill at the level;
current weapon skill is not yet read. All compared plans share the same snapshot,
scenario and seed. Their differences do not establish a globally optimal rotation. These are experimental scenario estimates, not live
combat measurements or a full rotation optimizer. No changes are made in game.

Build on Windows with Go and protoc available using
`powershell -File scripts/build-simulator.ps1`; optional `-GoPath` and `-ProtocPath`
select those build tools. It compiles the pinned source and refreshes metadata and
the binary SHA-256. The executable stays out of git and is included by Windows
release staging; players do not need Go or protoc. Build the simulator before
packaging a release. MIT attribution is included under `simulator/`.

Offline tests validate level-11 inputs and rejection cases; the native test also
runs the real engine when the executable is present. To test the real Eve agent
against a locally captured game snapshot, set `WISP_SMOKE_CHARACTER` to that JSON
file and run `node scripts/smoke-agent.mjs`. This uses the signed-in subscription
and an isolated session. Snapshot replay is a diagnostic; normal game requests
always obtain a fresh reading through the addon. `/simulator/character` on the
authenticated desktop API provides a read-only snapshot while game communication
is active.

## Conversation context

Eve auto-compacts at 75% of its model context window, including summary prompt
overhead. Wisp displays the latest provider-reported input plus output as an
approximate context percentage; hover for capacity, observed input/output totals,
cached input and successful compactions. Cache hits are included in input, not
added again. Summary calls contribute to observed usage but do not masquerade as
the smaller post-compaction context. Capacity comes from Eve model metadata;
missing measurements remain unknown. Separate Wowhead search calls are excluded
from these per-chat totals. These counters are not a subscription quota meter.

Compaction shows as transient progress and preserves the visible transcript. A
replacement Eve session invalidates the old context measurement. Existing chats
start accumulating observed usage when this version receives usage events.

For an opt-in live agent check on Windows, run `node scripts/smoke-agent.mjs`
from the repository root with Wisp signed in. It consumes subscription usage.
It starts an isolated Eve instance on ports 43196/43197 with the real agent,
subscription model, catalog client, Everloot MCP and Wowhead search. Only loopback
ports differ; memory is empty and game actions/writes are blocked. It verifies
actual tool calls, successful turns, compaction and a subsequent reply, and saves
a local report under `../../work/agent-smoke-*`. It does not refresh shared
credentials or edit the user's chats. This live check is separate from offline CI.

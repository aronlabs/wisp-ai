# Integrations and simulator

[Home](../README.md) · [Usage](usage.md) · [Development](development.md)

## Game tools and knowledge sources

Wisp reads character state on demand and can inspect references, compare item stats, check progress/resources and create saved panels. See [action controls](usage.md#actions-you-control) for pins, macros and settings; the [agent definitions](../apps/agent/agent) and [protocol schemas](../packages/protocol/src) are the exhaustive tool and UI reference.

| Source                                            | Useful for                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed Forever QuestieDB                       | NPC spawns, class trainers and supported town services. Optional; Wisp neither installs nor modifies it. Locations are database spawns, not live sightings. |
| [TheWoWDB](https://thewowdb.com/developers/)      | Primary external Forever catalog: search and entity details. Catalog area IDs are not necessarily native map IDs.                                           |
| [Everloot](https://everloot.app/docs/mcp/clients) | Read-only Forever references, recipes, locations, talent plans and market estimates/history. No API key, uploader or extra addon required.                  |
| Wowhead search                                    | Forever-only fallback using the existing ChatGPT connection, not unrestricted browsing. It consumes subscription usage.                                     |

Source links, build, age and coverage matter; see [how to interpret answers](usage.md#reading-the-answers) and [what leaves your computer](usage.md#what-leaves-your-computer). For filtering and integration contracts, consult [TheWoWDB](../apps/bridge/src/thewowdb.ts), [Everloot’s allowlist](../apps/agent/agent/connections/everloot.ts), [Wowhead search](../apps/bridge/src/wowhead-search.ts) and the agent instructions.

## Custom MCP connections

In desktop **Tools & MCPs**, choose **Add MCP**:

1. Select **Streamable HTTP**, **SSE** or **stdio**.
2. For HTTP/SSE, enter the endpoint and optional bearer token. For stdio, enter the executable, each argument separately and any required environment values.
3. Test discovery, then save. Use in-game **Settings > Tools & MCPs** to enable connections or individual tools.

**Stdio works directly**: the bridge starts the process and relays tools to the agent; no HTTP adapter is needed. For an already-installed Node server, for example, use `node` as the executable and its absolute script path as one argument. `node` uses Wisp’s runtime; `npx` uses bundled npm. Other commands may need their own installed dependencies.

Stdio receives a limited OS environment plus configured values, not inherited bridge tokens. On Windows, configured secrets use DPAPI; metadata stores only secret-presence flags/key names. Generic MCP OAuth sign-in is not provided: OAuth-only services need a supported token flow or a separately configured adapter. Review the [custom-server trust boundary](usage.md#actions-you-control) before connecting.

For manual source configuration, copy [mcp.example.json](../mcp.example.json) to a local file, replace the example endpoint and enable the entry. Set `mcpConfig` in `config.local.json` to its path relative to the data root; the default is `runtime/mcp.json`. `transport` accepts `http` (default), `sse` or `stdio`; stdio uses `command` and `args`, while `tokenEnv` names an HTTP bearer-token environment variable. Prefer desktop secret fields, keep secrets out of source, and restart after manual edits. Exact fields are in [mcp-manager.ts](../apps/bridge/src/mcp-manager.ts).

## Experimental local DPS simulations

`simulate_dps` compares up to **three mage plans** using the pinned WoWSims Forever **levelsim** fork for levels **1–60**. It runs locally when requested, without changing the game. This is a scenario comparison, not a full rotation optimizer.

- **Plans:** a once-only ordered opener, then a repeating priority list whose first castable action wins. Actions use verified learned ranks; mana/cooldown conditions, full channels and wand timing follow the engine.
- **Actions:** Frostbolt, Fireball, Fire Blast, Arcane Missiles, Frost Nova, Arcane Explosion, Shoot and Orc Blood Fury. Shoot requires a wand; Nova/Explosion require a target within ten yards.
- **Scenario:** one stationary target at a fixed distance, **10–180 seconds**, **100–2,000 iterations**. Plans share the same snapshot, scenario and seed.
- **Inputs:** fresh character, applied talents, spellbook and equipment readings. Missing data, unknown items/talents, pending talent changes, unlearned engine-selected ranks or a mismatched binary make the simulation unavailable rather than producing a number.
- **Assumptions:** automatic level-scaled Arcane Intellect; no other external buffs, consumables or temporary enchants. No movement, incoming attacks or latency. Wand use assumes maximum skill for the level, not measured current skill.

Results include mean/variation, spell breakdown, engine source and assumptions. They estimate only the compared scenarios, not survival or a globally optimal rotation/build. The tool must not run automatically in the background.

Build prerequisites are in [development](development.md#build-and-run-on-windows); packaged Windows apps include the binary, so players do not need Go/protoc. See the [pinned manifest](../simulator/manifest.json), [adapter](../apps/bridge/src/simulation.ts), [attribution](../NOTICE) and [MIT license](../simulator/LICENSE-WoWSims.txt).

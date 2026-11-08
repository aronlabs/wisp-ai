# Development

[Home](../README.md) · [Usage](usage.md) · [Integrations](reference.md)

## Prerequisites and checks

Use **Node 24.22.1+** and **pnpm 12.18.0**, pinned in [package.json](../package.json). From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
pnpm test:ui
```

`build` compiles the protocol and desktop frontend, not the native host, simulator or installer. `check` runs formatting, lint and type checks; the two test commands cover backend and desktop UI tests. Simulator engine tests require its binary—offline input tests alone do not validate the engine.

## Build and run on Windows

In addition to the workspace prerequisites, install Rust, Windows C++ build tools, Git, Go and protoc. Build the pinned simulator before starting the native app:

```powershell
powershell -File scripts/build-simulator.ps1
pnpm desktop:dev
```

The simulator script accepts `-GoPath` and `-ProtocPath`. `desktop:dev` stages production resources, including the verified simulator and bundled Node/npm, then starts Tauri. Continue with [addon setup and sign-in](../README.md#get-started-on-windows). `pnpm ui:dev` starts only Vite, without a native bridge.

To build an installer after the simulator is ready:

```sh
pnpm build:desktop
```

`pnpm package:windows` is an alias. Output in `dist/` includes the unsigned per-user installer, SHA-256 checksum and build metrics. Packaged resources include Node/npm, the bridge, agent, protocol, addon and simulator; updates preserve user data. See [packaging code](../scripts/build-desktop.ts), [staging](../scripts/stage-desktop.ts) and the [release workflow](../.github/workflows/release.yml) for resource verification and cache details. Tag builds create draft releases; the repository currently has no releases.

## Bridge and addon work

After configuring the native app and signing in, you can run the bridge separately:

```powershell
pnpm install-addon "E:\Blizzard\World of Warcraft\_forever_"
pnpm start
```

Replace the example with the folder containing `Wow.exe`. Installation updates `config.local.json`; fully restart WoW on first install. `start` builds the protocol and launches the bridge, but provides no sign-in UI. It needs Wisp authorization, a configured data root and the native credential helper: set `WISP_DESKTOP_EXE` or use the release executable under `apps/desktop/src-tauri/target/release/`. Stop the desktop bridge first to avoid port/data conflicts. See [data-root configuration](usage.md#local-data-and-deletion).

## Source map

| Area                          | Entry points                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Desktop UI and native host    | [Svelte](../apps/desktop/src), [Tauri, vault and installer](../apps/desktop/src-tauri)         |
| Bridge and agent process      | [main.ts](../apps/bridge/src/main.ts), [agent-process.ts](../apps/bridge/src/agent-process.ts) |
| Agent tools and behavior      | [definitions](../apps/agent/agent), [instructions](../apps/agent/agent/instructions.md)        |
| Shared contracts              | [protocol](../packages/protocol/src)                                                           |
| Game UI, readings and actions | [addon](../addon/WispAI)                                                                       |

The bridge owns accounts, persistence and tool execution. Eve runs on loopback **43186**; the separate RPC/model endpoint on **43187** uses an ephemeral agent token. Credential and data boundaries are documented under [privacy](usage.md#what-leaves-your-computer).

Game transport uses addon enable states for outbound frames and preinstalled load-on-demand helpers for inbound snapshots. Sequence IDs, acknowledgements and revisions handle retries and stale packets. For framing, polling and reply contracts, use [transport.ts](../apps/bridge/src/transport.ts), [reply-stream.ts](../apps/bridge/src/reply-stream.ts) and the protocol source rather than treating documentation as a wire specification.

## Formatting, CI and diagnostics

`pnpm format:check` checks Oxfmt, StyLua and Svelte/CSS/HTML Prettier output; `pnpm format` writes across the workspace. For Rust, use `cargo fmt --check --manifest-path apps/desktop/src-tauri/Cargo.toml`. The [CI workflow](../.github/workflows/check.yml) contains native test prerequisites and tests the exact installer artifact after successful release builds; packaging alone is not the full check suite.

[smoke-agent.mjs](../scripts/smoke-agent.mjs) is an **opt-in live diagnostic**, not an offline test: it uses the signed-in subscription and external services, consumes usage, and may put private data in reports outside the repository. It requires Windows configuration and native credentials. Its isolated sessions block game writes but do not validate browser consent; snapshot replay does not replace fresh readings in normal use. Consult the script before running it.

## Adding integrations

To add an integration, declare its capabilities in `packages/protocol/src/capabilities.ts`,
implement its adapter and readiness checks, register live detection in
`addon/WispAI/Integrations.lua` / `apps/bridge/src/integration-state.ts`, and test
missing/incompatible providers and disabled-tool admission. Integrations supply
tools; reply panels and automatic suggestions remain separate features.

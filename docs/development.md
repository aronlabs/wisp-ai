# Development

[Home](../README.md) · [Usage](usage.md) · [Integrations](reference.md)

## Prerequisites and checks

Use **Node 24.22.1+** and **pnpm 12.18.0**, pinned in [package.json](../package.json). From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

`build` compiles the protocol and desktop frontend, not the native host, simulator or installer. `check` runs formatting, lint and type checks; `pnpm test` runs all TypeScript tests with Vitest (core, addon and desktop UI). Simulator engine tests require its binary—offline input tests alone do not validate the engine.

## Tests

Vitest projects keep each environment separate:

| Command           | Scope                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `pnpm test`       | All TypeScript tests                                                 |
| `pnpm test:core`  | Bridge, agent, protocol and integration tests in `tests/` (Node)     |
| `pnpm test:addon` | Addon tests and WoW stubs in `addon/tests/` (Node + Fengari for Lua) |
| `pnpm test:ui`    | Svelte components in `apps/desktop/src/` (jsdom + Testing Library)   |
| `pnpm test:watch` | Watch all projects; Lua source and fixture changes rerun addon tests |

Filter tests with `pnpm test --project addon` or `pnpm test:watch --project core`.
The test commands build the shared protocol first. Existing schema assertions in addon tests
also verify the TypeScript contracts consumed by Lua. Native Rust tests remain on Cargo;
see the CI workflow for their build prerequisites and command. Simulator and native-helper
tests keep their existing skips when the required binaries are absent.

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

### Publishing app updates

Installed Windows x64 release builds check `https://github.com/fedeya/wisp-ai/releases/latest/download/latest.json` at startup and every six hours. **Settings > Check for updates** checks manually. Users review release notes and choose **Update and restart**; the app verifies the download before stopping the bridge, waits for active replies and installs through NSIS. Chats, credentials and settings remain in AppData. Development builds and other platforms do not install updates. Overview detects when the bundled addon differs from the installed copy; use **Install / update addon**, then `/reload` in WoW.

The updater public key is checked into `apps/desktop/src-tauri/tauri.conf.json`. Its private key is stored outside the repository at `%USERPROFILE%\.tauri\wisp-ai.key` on the machine where it was generated and in the repository's `TAURI_SIGNING_PRIVATE_KEY` Actions secret. Keep a secure backup: changing the public key breaks updates for existing installations. The generated key has no password; if using a password-protected replacement before the first public release, also configure `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

To prepare a stable release, synchronize the versions in the root and desktop `package.json`, `tauri.conf.json`, and `Cargo.toml`/`Cargo.lock`, then push the matching `vX.Y.Z` tag. The workflow requires the signing secret and uploads the installer, checksum, detached `.sig` and `latest.json` to a **draft** release. The manifest includes generated GitHub release notes. Review the draft and installer CI results, then publish the release and mark it latest. Drafts and prereleases are excluded from the stable feed. The repository and release assets must be public for distributed apps to download them.

Local `pnpm build:desktop` builds remain unsigned unless `TAURI_SIGNING_PRIVATE_KEY` is set to the private key path or contents. Signed builds additionally emit `.sig` and `latest.json`. These updater signatures are independent of Windows Authenticode signing; they do not remove SmartScreen prompts.

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

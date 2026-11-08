# AI connection copy

The website presents Wisp as an AI companion for WoW, independent of the model
provider. ChatGPT subscription sign-in is an option alongside API connections
and compatible/local endpoints, not a prerequisite for every user.

Verified against the current workspace sources:

- `packages/protocol/src/providers.ts`: registered provider definitions and models.
- `apps/agent/src/providers.ts`: native provider adapter dispatch.
- `apps/desktop/src/pages/Connections.svelte`: ChatGPT sign-in and default model UI.
- `apps/desktop/src/ApiConnections.svelte`: API/local connection forms, model
  discovery, exact IDs, context windows, testing and saving.
- `docs/usage.md`: current setup, billing, tools and connection limits.

Changes cover both languages: home requirements and download note, the setup
summary, FAQ, privacy/data destinations, setup metadata/schema, footer wording,
and a dedicated AI connections & models entry on Features. Setup offers three
expandable paths and explains model tool-calling/context requirements, provider
billing and the potentially billable Test first model operation.

Marketing examples name a few supported adapters without claiming universal
model compatibility or that every external account has been tested. Wowhead web
search is not presented as requiring a ChatGPT connection.
No API key entry or provider credentials are collected by the website. Actual
configuration and model selection happen in the desktop app and in-game chat.

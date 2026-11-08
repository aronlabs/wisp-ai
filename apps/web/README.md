# Wisp landing

Next.js App Router landing for **https://wisp.fedeya.sh**. The site is independent
of the desktop app and does not need its bridge, Rust build or credentials.

## Local development

From the repository root:

```sh
pnpm install
pnpm web:dev
```

Open http://127.0.0.1:3000. Production check: `pnpm web:build`.

## Vercel

1. Import this GitHub repository into Vercel.
2. Set **Root Directory** to `apps/web` and framework to **Next.js**.
3. Keep the output defaults and enable access to files outside the root directory.
   The checked-in `vercel.json` installs with `pnpm --filter @wisp/web... install
   --frozen-lockfile` and builds with `pnpm exec turbo run build --filter=@wisp/web`.
   There is one shared lockfile at the repository root. Root dependencies are
   repository tools only; agent, bridge, addon and test dependencies belong to their
   own workspaces and are not installed by the web deployment. Do not override
   installation with an unfiltered `pnpm install`.
4. Add `wisp.fedeya.sh` in the project's Domains settings and apply the DNS record
   Vercel provides.

No environment variables are required. Optionally set `NEXT_PUBLIC_INSTALL_URL`
to a public installer asset URL and redeploy for direct downloads.

For an isolated workspace export, run `pnpm exec turbo prune @wisp/web
--out-dir=.vercel-workspace` from the repository root. Turbo generates the reduced
workspace and lockfile from the shared graph; do not maintain a second lockfile.

## Launch configuration

`src/site.ts` controls the public URL, displayed launch version, repository and
default download destination. The website, app and workspace packages all use **v0.0.1**.
Download buttons link directly to the published Windows installer asset:
`releases/download/v0.0.1/WispAI-0.0.1-windows-x64-setup.exe`.
Make the repository public **and publish the v0.0.1 release containing that asset**
before sharing the landing; draft releases are not public downloads.
For later releases, update the default asset URL/version together or override
`NEXT_PUBLIC_INSTALL_URL` with another public installer URL and redeploy.

The hero is a native React reconstruction of the chat interface. It loops through
a macro, a gear conversation with an auction-price follow-up, and material advice.
Examples are inspired by actual usage, with sample data and condensed replies;
they make no live game or AI calls. The demo includes pause/play, pauses when the
tab is hidden, and starts static for reduced-motion users. No video or simulator
is loaded by the landing. Optional earlier recording tools remain documented in
[the offline recording workflow](../../scripts/demo/README.md).

Stable capabilities are listed explicitly. Panels and trackers are marked Beta;
combat simulation is Experimental, without claiming complete class coverage.
SEO, canonical URL, sitemap, robots and a generated 1200×630 PNG social card are
included. Production pages load Rybbit for site `61b021a9d037` through the
first-party `/_fm/` proxy to `https://rybbit.fedeminaya.com/api/`, matching the
portfolio integration. Development and Vercel previews do not load the tracker.
Enable **First-Party Proxy** in Rybbit Site Settings → Privacy & Security so
forwarded visitor IPs are interpreted correctly. Only tracking endpoints are
exposed; the dashboard and administrative API are not proxied.

The immersive hero uses a generated illustrative background and locally cached
WoW icons. Equipment, tooltips, auctions, bags and action bars are native React
and CSS, not a flattened mockup or video. See [asset provenance](ASSETS.md).

The setup guide and troubleshooting live at `/setup`, with local privacy/control
information at `/setup#privacy`. The hero types prompts and replies, shows a
thinking indicator, fades between conversations, and keeps its outer bounds
fixed throughout the loop. The decorative character equipment panel was removed.

SEO metadata, structured data, robots/sitemap behavior, asset delivery and local
Lighthouse measurements are documented in [SEO and performance](SEO.md).

English and Spanish versions are available under `/en` and `/es`, with browser
language detection and a persistent manual selector. See [website languages](LANGUAGES.md)
for translation maintenance, routing and localized SEO.

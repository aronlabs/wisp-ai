# SEO and performance

Production origin: https://wisp.fedeya.sh. English and Spanish Home, Features
and Setup pages are statically generated under /en and /es. Each has its own
title, description, canonical, Open Graph/Twitter metadata and JSON-LD.
Setup metadata now describes choosing an AI connection, not a ChatGPT requirement.

## Crawling and language metadata

- /sitemap.xml lists all six canonical URLs with language alternates.
- HTML includes reciprocal hreflang=en/es and x-default=en.
- /robots.txt allows production crawling and points to the sitemap.
- Vercel previews (VERCEL_ENV=preview) send noindex/nofollow metadata and
  X-Robots-Tag, and disallow crawling in their robots file.
- Language negotiation at /, /features and /setup is private/no-store and varies
  by Accept-Language and the preference cookie. Explicit locale URLs are stable.
- The selector uses Next Link navigation. It updates html lang, canonical and
  social metadata without a document reload, preserves query/hash and saves
  the user's preference. Its current option, keyboard focus and Escape/outside
  closing behavior are checked.

After publishing, verify the domain in Search Console and submit
https://wisp.fedeya.sh/sitemap.xml. Credentials for verification are not configured.

## Current local audit — 2026-11-08

Lighthouse 13.6.0, installed Chrome headless, production next start on localhost,
default mobile emulation and simulated throttling. One recorded run per page;
normal machine/load variation applies. These runs include the current language
selector and provider-neutral copy, including the expanded connection guide.

| Page | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /en | 100 | 100 | 100 | 100 | 0.77s | ≈0 | 46ms |
| /es | 99 | 100 | 100 | 100 | 0.76s | ≈0 | 116ms |
| /en/features | 98 | 100 | 100 | 100 | 0.77s | ≈0 | 175ms |
| /es/features | 100 | 100 | 100 | 100 | 0.76s | ≈0 | 64ms |
| /en/setup | 100 | 100 | 100 | 100 | 0.76s | ≈0 | 72ms |
| /es/setup | 100 | 100 | 100 | 100 | 0.76s | ≈0 | 56ms |

The six reports are in the ignored node_modules/.cache/wisp-preview/audit-*.json
files; provider-audit-summary.json contains their compact metrics.

These are lab measurements, not real-user Core Web Vitals. Lighthouse navigation
reports TBT, not field INP. The synthetic selector check observed 16ms pointer/click
events in its local run and no document navigation; this is not an INP field score.
Once production has enough traffic, check PageSpeed Insights/CrUX and Search
Console for real LCP, INP and CLS at the 75th percentile. No analytics or remote
telemetry was added.

## Delivery choices

DM Sans and Manrope are self-hosted with next/font, without runtime Google Fonts
requests. The eager/high-priority hero is AVIF, 1536 × 1024 at quality 85, served
without Next recompression: 348,836 bytes versus the older 1,833,090-byte lossless
WebP. This is not native 4K. Its versioned file has a one-day cache plus stale
revalidation; use a new filename when replacing it. Dedicated 32px/180px icons
avoid loading the full 736KB logo as the favicon. Below-fold images are lazy.

Chat viewports and streaming text reserve space. Fonts use adjusted fallbacks.
Hero/routine animation pauses offscreen and when the document is hidden, honors
reduced motion, batches typing updates and scrolls on steps instead of characters.

## Repeating the audit

Build the website and start its production server on port 3001, then run:

```sh
pnpm dlx lighthouse@13.6.0 http://127.0.0.1:3001/en --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=performance,accessibility,best-practices,seo
```

Repeat for /es, /en/features, /es/features, /en/setup and /es/setup. Audit locale
URLs directly to exclude the entry-point redirect.

Browser checks additionally cover six canonical/social metadata sets, JSON-LD,
13 feature entries, the three AI setup methods, translated privacy copy, sitemap,
robots and social images, no-JS rendering, mobile layouts at 320/390/768/1440px,
and the language selector's cookie, URL, keyboard, metadata and no-reload behavior.

See [website languages](LANGUAGES.md) and [AI connection copy](AI-CONNECTIONS.md).

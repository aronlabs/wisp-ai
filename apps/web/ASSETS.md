# Landing visual assets

`public/barrens.webp` is an illustrative background generated with the built-in
image generation tool, then converted to WebP (121 KB). It is not a game capture
or a live 3D scene. All chat, equipment, bags and auction UI are React/CSS.

Generation prompt:

> Create a wide 1536x1024 game environment background asset for a World of Warcraft Classic companion website. No text, no logos, no user interface, no frames. Authentic early 2000s low polygon MMORPG in-game aesthetic, hand painted terrain textures, angular simple geometry, restrained detail, not photorealistic, not glossy modern illustration. The Crossroads in the Barrens at sunset: golden dry grassland, ochre dirt trail leading toward a few recognizable squat Horde huts and a wooden lookout tower in middle right distance, broad flat topped acacia trees, layered hazy mesas, warm desaturated amber sky. A small robed adventurer seen from behind at center-right, occupying only 20 percent of frame height, purple and blue robe, simple staff with small blue glowing crystal. Wide cinematic establishing view with the left 45 percent very dark in tree shadow, suitable as background behind white website text. Rightmost 25 percent quiet landscape to allow HTML interface overlay later. Bottom fades naturally into nearly black brown. Warm restrained palette, atmospheric depth, composition rather than excessive detail. No floating objects, no decorative borders.

`public/items/*.jpg` are WoW item/spell icons served by the Wowhead/ZAM CDN,
locally cached so visitors do not request that CDN. Blizzard game artwork is
third-party content, separate from the repository's code license.
Source URL pattern: https://wow.zamimg.com/images/wow/icons/large/{icon}.jpg

Mapping: vest=inv_chest_fur, linen=inv_fabric_linen_01,
feather=inv_feather_01, ore=inv_ore_copper_01, meat=inv_misc_food_14,
potion=inv_potion_51, wand=inv_wand_01, frost=spell_frost_frostbolt02,
fire=spell_fire_flamebolt, helm=inv_helmet_29, boots=inv_boots_05,
robe=inv_chest_cloth_04, staff=inv_staff_13, ring=inv_jewelry_ring_03,
book=inv_misc_book_09.

Item stats and auction amounts in the landing are illustrative Forever examples,
not live prices or a complete item database. Original chat examples remain the
basis for the copy. No extracted game models are included.

## Current hero revision

The landing now uses `public/barrens-crisp.webp`: 1536 × 1024, lossless WebP,
1,833,090 bytes. It is served directly (`unoptimized` on Next Image) to avoid a
second lossy encode. The source is still 1536 pixels wide, not a native 4K asset.
The older `barrens.webp` is retained as the previous variant.

The built-in image tool edited the original background using this prompt:

> Edit this existing website background. Preserve the exact scene, composition, camera position, placement and size of the robed adventurer, the Crossroads huts, tower, acacia tree, sunset palette and dark left side. Render the same image as a high resolution 3840x2560 landscape asset with much crisper hand-painted game textures, clean low-poly geometry edges, well resolved grass, earth path and architecture. It should feel like a sharp World of Warcraft Classic game screenshot rather than a blurry watercolor. Remove softness and compression artifacts, preserve atmospheric haze only on far mountains. Do not add objects, text, UI, borders or extra characters. Keep the subdued warm golden sunset and deep shadowed left side. This is a fidelity improvement of the input, not a scene redesign.

The tool returned 1536 × 1024 despite the requested dimensions. No artificial
upscale is claimed. The icon aliases `vest` and `feather` use the filenames
`vest-fur.jpg` and `feather-light.jpg` to avoid stale optimized-image caches.

## Performance delivery variant

The current hero is `public/barrens-hero-v1.avif` (1536 × 1024, 348,836 bytes),
encoded once from `barrens-crisp.webp` with Sharp AVIF quality 85 / effort 6.
Pixel PSNR against that source is about 41.8dB. The source scene and dimensions
are preserved. Next Image serves this file unoptimized, eager and high priority.
`barrens-optimized.webp` is an unused alternative, not requested by the page.
Small favicon and Apple touch icons are resized derivatives of `wisp.png`.

## AI provider marks

`public/providers/{openai,claude-color,gemini-color,openrouter}.svg` are locally
served SVG marks from `@lobehub/icons-static-svg` 1.102.0 (Lobe Icons):
https://github.com/lobehub/lobe-icons

Source URL pattern:
https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.102.0/icons/{name}.svg

The source MIT license is retained at `public/providers/LICENSE`. Brand marks
remain third-party trademarks. Claude/Gemini keep their color marks; OpenAI and
OpenRouter use the set's monochrome marks, displayed light on the dark page.
These assets are decorative alongside visible provider names, lazy-loaded,
self-hosted, and add no runtime icon dependency or remote browser request.

## Social card

The localized 1200 × 630 Open Graph / Twitter card is rendered with Next ImageResponse.
It reuses the homepage chat styling and locally cached item icons. social-barrens.jpg
is a 1200 × 630 JPEG derivative of barrens-crisp.webp (Sharp quality 90), used only
by the social image renderer. No extra asset is loaded by the landing itself.

The social headline uses self-hosted Gelasio Regular and Italic, a Georgia-like
serif from https://github.com/SorkinType/Gelasio/tree/main/fonts/ttf.
The SIL Open Font License is retained beside the fonts in src/assets/fonts/OFL.txt.
Only the social image loads these fonts; the homepage continues to use Georgia.
Supporting text uses the Geist Regular font bundled with Next's image renderer.

# Art pipeline — status & hook (2026-06-24)

GS-5 shipped the **card system** (`src/render/cards.ts`): rarity-tinted course and item
cards. The cards have an **art hook** but no generated art yet — and that's deliberate.

## Why there's no art in this PR
Flux image generation (the `request_upload_url → generate_image(flux2_max) → get_history
→ download` flow golf-finder used) needs the image-gen tooling/skill, which **isn't
available in this coding session**. Rather than fake it or commit placeholder binaries, the
cards fall back to a **rarity-tinted gradient + the live hole thumbnail**, so every card is
complete and shippable without art. When art exists, pass `artUrl` to `courseCardHTML` and
it replaces the thumbnail — no layout change.

## How to add art (when you have the Flux tooling)
1. Generate one image per biome (and later per boss/item) with a styled prompt.
2. Download into `art/` (heavy source images are gitignored under `art/generated/`; keep the
   prompt log so they're regenerable).
3. Map `biome id → art url` in the render layer and pass it through to `courseCardHTML`.
4. Rarity still tints the card frame/accent via `RARITY_C` — art fills the panel, not the border.

## Prompt log (seed these when generating)
Keep this list updated so art is reproducible. Style: painterly sci-fi golf vistas, cohesive
palette per biome, no text, 3:4 portrait to match the card panel.

| Biome           | Prompt sketch |
|-----------------|---------------|
| verdant-station | lush orbital golf station, emerald fairways under a glass dome, soft daylight |
| dust-belt       | low-gravity desert links on a dusty asteroid belt, ochre dunes, distant ringed planet |
| ice-ring        | glacial golf course on a frozen ring world, pale blue ice, aurora, biting wind |
| ember-world     | volcanic links, basalt fairways between lava channels, ember glow, smoke haze |
| void-garden     | surreal antigravity garden in deep space, floating crystal greens, starfield, violet void |

## Status
- ✅ Card system + rarity tint + art hook (this PR).
- ⏳ Actual Flux art generation — needs your image-gen setup; tracked as GS-5b.

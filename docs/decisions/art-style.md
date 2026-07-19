# Art style & how we make visuals (the anti-revisit rules)

This exists because visuals kept getting shipped, rejected, and redone 6–7 times. The root causes were
concrete and fixable:

1. **Art was evaluated as a checklist, not with an art-director's eye.** "Has a snout ✓, has an eye ✓,
   stands on the floor ✓" → shipped. Whether it was actually *good* (silhouette, proportion, does it read)
   was never the gate.
2. **There was no approved visual target.** Every attempt was a fresh guess at "good," caught only after
   the fact — so we paid the round-trip every time.
3. **New art ignored the systems the game already draws well** and invented worse one-offs (e.g. a
   head+chest bust with stick-legs bolted under it, next to a proper full-body player figure).

## The process (do this for EVERY new/changed visual)

- **Reference-first. Approve the look before wiring it in.** Produce a render (a `scripts/*-preview.mjs`
  screenshot) and get a human OK on the *look* before it lands. Never merge a visual on "the code works."
- **Reuse the house figure systems; don't invent a third.** See below.
- **Review it like it's someone else's work before shipping.** Render it and ask: does the silhouette read
  at a glance? Are the proportions right (head ≈ 1/6–1/7 of a standing figure, NOT 1/2)? Does it look
  *intentional* or like programmer-art? Only ship on "yes," not on "the parts are present."
- **Right tool for the ceiling.** Hand-placed vector/canvas primitives can be clean and consistent but will
  not look *stunning* for a hero set-piece — don't expect them to. For hero moments, use a reference and
  iterate hard, or the Flux image pipeline.

## The house figure system (canonical — match it, don't fork it)

- **The player** on the course and in menus is `render/apparelArt.ts golferPreviewSVG` (SVG, full body,
  correct proportions, semi-flat shading). This is the proportion/quality bar for humans.
- **The caddies / allies** are `render/caddyArt.ts drawCaddy` (Canvas2D, full body, one per character, each
  with a signature prop + pose — Dan's driver over the shoulder, Sandy's sand-spray, the Mole's mound, the
  Parrot's tricorne + spyglass). This is the game's own NPC art, used on-course AND in the clubhouse.
- **The Coil (Herald) agents** are `render/coilAgentArt.ts drawCoilAgent` — the `drawCaddy` sibling for the
  cult: hooded, robed figures in a venom-violet palette, same flat house style.
- **One dispatcher:** `render/storyFigure.ts drawStoryFigure(ctx,id,…)` / `hasStoryFigure(id)` turns any
  story-character id into its figure. The clubhouse standees emit `<canvas class="gs-caddycv" data-caddy=id>`
  and the app.ts mount pass draws them through this dispatcher — so the clubhouse and the on-course badges
  share ONE figure rule. A new NPC = a new `drawCaddy`/`drawCoilAgent` case, never a bespoke bust hybrid.

**Do NOT** render a character as a cropped portrait BUST (head+chest) where a full figure is expected — a
bust feet-anchored to the floor puts the chest on the ground. Busts (`caddyPortraits.ts`/`loreArt.ts`) are
for talk-cards/lore overlays only.

## House visual language (flat + friendly, a touch of depth)

- Flat, rounded shapes; a single soft light from upper-left; a soft ground shadow ellipse under standing
  figures; per-world palettes keyed by archetype (never neutral white/black — see `render.md`).
- Everything procedural stays deterministic + camera-proof (no `Math.random` in a draw path; course-space
  keys, never screen px — see CLAUDE.md contracts). Preview scripts re-shoot after any change.

## Previews (the reference-check tools)

- `scripts/storyclub-preview.mjs` — the story clubhouse cast (Warden + Herald).
- `scripts/serpent-preview.mjs` — the sigil-ceremony serpent across wake/focus states.
- Re-shoot the relevant one after touching its art, attach it for sign-off, and only then merge.

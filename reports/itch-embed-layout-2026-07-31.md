# The itch.io embed on desktop — layout sweep

**2026-07-31** · triggered by a play-test on `vulpeculagames.itch.io/the-far-carry` at the embed's
default desktop viewport, **820×760**: *"the sizing and placement of everything is very off … some
things work really well in the itch bounded screen space and some things are just off."*

820×760 is the shape the app had never been designed for: **landscape, and short**. Every phone
viewport is portrait; every desktop window is tall. The embed is neither, so it fell through the
gaps of two different assumptions at once.

## Method

Every deep-linkable screen (`?screen=…`, GS-screen-deeplink) driven through playwright-core at
820×760 / 1280×800 / 390×844, measuring **ink extent** — the union of text runs (via `Range`) and
elements that actually paint — rather than container boxes, because `.gs-main` is `min-height:
var(--gs-vh)` and therefore *always* reaches the bottom of the viewport whether or not anything is
drawn there. Measuring the container is why this never showed up in a layout test.

## Fixed

### 1. Content was glued to the top of a viewport-tall frame (GS-page-centre, #676)

Dead space **below** the content, 820×760, before → after:

| screen | before | after |
|---|---|---|
| Story prologue beat | 64% | 34% |
| champion picker | 59% | 33% |
| Trade Market | 47% | 25% |
| Star Tour round recap | 43% | 25% |
| Star Mart | 35% | 20% |
| qualifier recap | 33% | 18% |
| tournament recap | 24% | 14% |
| round briefing | 17% | 11% |

Not desktop-only — the same screens measured 58/42/50/48% on a 390×844 phone. One line,
`align-content: safe center` on `.gs-main`, lands on all ~20 flow screens. The "after" numbers are
the same void *split evenly above and below*, which is what centring means.

The non-obvious part is why it is `align-content` on a **block** container rather than flex or
grid: those centre too, and also stop adjacent sibling margins collapsing (the title screen's five
sections gain ~48px) and turn every child into a flex/grid item. The test pins `display: block`
for exactly that reason.

### 2. The golfer roster classified the embed as a phone (GS-select-card-room, #677)

The card's COMPACT/FULL dressing switched on `max-width: 999px` — a question about the *page* asked
in place of one about the *card*.

| viewport | cols | card | before | after |
|---|---|---|---|---|
| 820×760 (embed) | 2 | **390×323** | compact | full |
| 768×1024 (tablet) | 2 | **364×455** | compact | full |
| 1280×800 (desktop) | 4 | 277×348 | full | full |

The embed's card was **wider than the desktop card** and wearing the phone dressing — four big
cards each ~60% empty. Now keyed on both axes, with a measured 760×760 floor for the two-across
layout (where the roster stops needing to scroll) and the existing `data-gs-fit` seam folding in
`--gs-uiscale`, which no media query can see.

## Verified, deliberately unchanged

- **The two finale battles.** Both were flagged as likely to be "super weird if expanded". They are
  not: `render/battleFrame.ts` (GS-story-battle-portrait) turns the arena 90° only when the
  container is *taller* than wide, so at 820×760 and 1280×800 it stays in its authored landscape
  composition and scales cleanly. Captured Jörmungandr and the Warden Ark at 820×760 / 1280×800 /
  390×844 — all correct. **No work needed.**
- **The star map and the travel bridge.** Both fill the embed edge-to-edge. The star map's canvas is
  viewport-fixed, so the `.gs-main--bleed` portrait cap does not constrain it — which is why it
  "goes wider" while the play screen does not. Working as designed.
- **The play screen's portrait cap.** At 820×760 the play frame is 395px wide with ~210px of black
  each side. That is GS-play-desktop-frame doing its job: `mapFrame()` grows the design frame to the
  container's aspect, so an uncapped wide container yields a wide camera and every shot reads as
  over-zoomed. Removing the cap is a **camera change, not a layout fix** — see the IDEAS entry below.

## Not ours

All four reported console messages come from the itch.io page itself (`the-far-carry:12` and `:1`
are itch's HTML document, not our iframe):

- `Unrecognized feature: 'monetization'` / `'xr'` and `Allow attribute will take precedence over
  'allowfullscreen'` — itch's `<iframe allow=…>` markup. We set no `allow` attribute anywhere.
- `screen.orientation.lock() is not available on this device` — itch's fullscreen button. The built
  bundle contains `orientationchange` (a listener) and no `orientation.lock` at all; verified by
  grep of `dist/index.html`.

Nothing to fix on our side, and nothing we can suppress.

## Left open

Logged as `GS-embed-letterbox` in IDEAS.md. In short: with the play screen capped to a portrait
strip, ~51% of the embed's width is undressed page background. The camera decision is right; the
*black* is the leftover. Wants a design call (dressed letterback vs. a wider camera at a wider
aspect), not a CSS tweak.

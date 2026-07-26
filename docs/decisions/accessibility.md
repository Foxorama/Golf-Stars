# Accessibility

The full story behind the accessibility work. The *rule* lives in CLAUDE.md; the reasoning, the
measurements and the research live here.

---

## GS-a11y-readable-text — reader type, UI scale, and why we ship no dyslexia font

### The question that started it

> "Is there an open-source non-licensed font that is dyslexic friendly?"

There are several, and they are genuinely free. The answer we shipped is nonetheless **no font at
all** — because the evidence says the font is not the part that works.

### Audit: where the game actually stood

Measured live in Chromium at 375×812, before any change.

**Already good** (worth recording so nobody "fixes" it twice):

- Every interactive control is a real `<button>` with an `aria-label`. No `div`-with-click-handler
  on the title, character select or play screen.
- `lang="en"`, an `<h1>`, `<main>` and `<header>` landmarks.
- `:focus-visible` outlines on ~20 component classes.
- `prefers-reduced-motion` honoured in 19 places.
- The viewport meta does **not** block pinch-zoom (no `user-scalable=no`, no `maximum-scale`).
- The core palette is strong. Every text token clears WCAG AA against every surface, most clear AAA:

  | ink on | `--gs-bg` | `--gs-bg-2` | `--gs-panel` |
  |---|---|---|---|
  | `--gs-ink` | 15.88 | 15.06 | 14.09 |
  | `--gs-info` | 12.44 | 11.79 | 11.04 |
  | `--gs-warn` | 12.29 | 11.65 | 10.90 |
  | `--gs-accent` | 10.23 | 9.70 | 9.08 |
  | `--gs-dim` | 7.47 | 7.09 | 6.63 |
  | `--gs-gold` | 7.26 | 6.88 | 6.44 |
  | `--gs-danger` | 7.00 | 6.64 | 6.21 |

**The gaps this feature closes:**

- **Text is small and there was no way to enlarge it.** The title screen ships 10px body copy (at
  0.59 effective opacity); the play HUD carries carry distances and spray percentages at 9.5–10px.
- **Every play-screen control is under 44px** — five 38×38 map buttons, a 31×32 aim-mode button.
- **The settings sheet rendered in Times New Roman.** `font-family` lived on `.gs-main`, and
  `app.ts` renders overlays as *siblings* of `<main>`, so the settings sheet, price notice, exit
  confirm and intro popovers all fell off the stack onto the UA default. Shipped, unnoticed.

### Why no font file

Every letterform-based "dyslexia font" that has been tested has failed to show a reading benefit:

| Study | n | Finding |
|---|---|---|
| Rello & Baeza-Yates 2013 (ASSETS) | 48 dyslexic adults, eye-tracked | OpenDyslexic 29.17s vs **Arial 28.35s** — slower. Readers significantly *preferred* Verdana and Helvetica to it |
| Wery & Diliberto 2017 (*Annals of Dyslexia*) | 12 dyslexic children | No gain in rate or accuracy vs Arial/Times. **No participant preferred it** |
| Kuster et al. 2018 (*Annals of Dyslexia*) | 170 dyslexic children | Dyslexie not faster or more accurate than Arial |
| Joseph & Powell 2022 (*Dyslexia*) | 71 children | No difference in word/passage reading or eye movements |
| Marinus et al. 2016 (*Dyslexia*) | — | The one positive result — and the authors attribute it to the font's **wider spacing**, not its shapes |
| **Galliussi et al. 2020** (*Annals of Dyslexia*) | 128 children | Separated letterform from spacing factorially: **only spacing mattered** |

That last row is the decisive one. The apparent benefit of a dyslexia typeface *is* its spacing, and
spacing is a CSS property that costs zero bytes.

Neither the **British Dyslexia Association style guide (2023)** nor **WCAG 2.2** names a font. The
BDA recommends ordinary sans-serifs — "Arial and Comic Sans… Verdana, Tahoma, Century Gothic,
Trebuchet, Calibri, Open Sans" — and no dyslexia-specific face.

The engineering side agrees. Golf Stars ships **zero third-party binary assets** and the build is a
single inlined `index.html`; a bundled OpenDyslexic is ~113KB of base64 (it is ~8× the next-largest
candidate, and the published "latin subset" is not actually subset). The licences would have been
fine — OpenDyslexic, Lexend, Atkinson Hyperlegible and Andika are all SIL OFL 1.1, which permits
embedding in commercial software with no royalty and no credit line; Luciole is CC BY 4.0 and would
have carried a real attribution obligation; Sylexiad is CC BY-NC-ND and unusable commercially. The
licence was never the blocker. The evidence was.

### What we ship instead

`.gs-readable` on `<html>`, driven by the **Readable text** toggle. It buys the levers that replicate:

- **Letter spacing** — the big one. Zorzi et al. 2012 (*PNAS*, 94 dyslexic children across two
  languages): extra tracking alone, with no training, gave **~20% faster reading and half the
  errors**. Dyslexic readers are unusually vulnerable to visual crowding.
- **Word spacing** at ≥3.5× the letter spacing, per the BDA.
- **Line spacing** 1.5 — applied as a *floor*, so every component that sets its own tight line box
  (most of the HUD, via the `font:` shorthand) is untouched and the play screen does not reflow.
- **No italics** — the most robust negative finding in the whole font literature (Rello &
  Baeza-Yates: significantly worse on reading time *and* fixation duration). Bold instead, as the
  BDA asks.
- **No justification** — WCAG 1.4.8.

Values sit at or above WCAG 1.4.12's user-override bar (.12em letter, .16em word) but short of the
BDA's most aggressive tracking, because this is a dense game HUD and over-spacing re-wraps the very
rows GS-play-hud-space just bought back.

The **family** is a bonus, not the mechanism: the stack asks for the most legible faces *already
installed on the device* — a reader who has Atkinson Hyperlegible or OpenDyslexic on their OS gets it
free — then falls back to Verdana/Tahoma (tall x-height, wide sidebearings, open apertures, and the
BDA's own named recommendations).

### UI scale: one lever for small text AND small targets

Font size **is** supported by evidence (Rello et al. 2013, W4A: significant effect on comprehension).
But the UI has ~660 `font-size` declarations and **not one `rem`** — 198 in `index.html`, ~464 more
inline in TypeScript template literals. Converting them is a churn of every hot file in the repo.

So the scale rides `zoom` on `<html>` instead. This scales **text and touch targets together**,
which turns out to solve both problems with one control. Measured at 375×812:

| Scale | Map buttons | Aim button | Swing button | Commit row bottom | H-scroll |
|---|---|---|---|---|---|
| 1.00 | 38px | 31px | 41px | 797 / 812 | none |
| 1.15 | 44px | 36px | 47px | 795 / 812 | none |
| 1.45 | **55px** | **44px** | **59px** | 791 / 812 | none |

At the top rung every control clears the 44px guidance, and nothing leaves the screen.

**Two things had to be fixed to make `zoom` safe**, and both are load-bearing:

1. **Viewport-locked heights.** `zoom` does not change an element's *layout* size, so a `100dvh` box
   inside a zoomed root measures one screen of **zoomed** units and overhangs the display — naive
   `zoom: 1.25` put the Swing button **185px below the fold**. Every such rule now divides by the
   token (`--gs-vh` / `--gs-dvh`). A raw `100vh`/`100dvh` is banned and machine-checked.

2. **Canvas backing stores.** Every animated surface sized itself `layoutPx * devicePixelRatio`.
   Under zoom the element covers `layoutPx * zoom * dpr` *device* pixels, so at 1.45× on a dpr-2
   phone the play view rendered at **0.69× the resolution it was displayed at** — visibly soft, on
   the one screen the setting exists to make legible. All ten canvases now go through
   `render/pixelRatio.ts canvasRatio()`, which folds the root zoom in (verified: backing store
   751×1624 for a 375×812 display, ratio 2.00).

### Invariants

- **Nothing names a font family except `--gs-font`.** Both `font-family` and every `font:` shorthand
  resolve the family from the token, or the Readable text toggle cannot reach them — which is exactly
  how the settings sheet ended up in Times New Roman.
- **The family lives on `<body>`, not `.gs-main`.** Overlays are siblings of `<main>`.
- **No raw `100vh`/`100dvh`.** Use `--gs-vh` / `--gs-dvh`.
- **No canvas computes its own `devicePixelRatio`.** Use `canvasRatio()`.
- **Defaults are inert**: `--gs-track`/`--gs-wordspace` are `0em` and `--gs-uiscale` is `1`, so the
  untoggled game renders exactly as before. No save bump — `gs_settings` merges over defaults.

Guarded by `tests/accessibility.test.ts`.

### Sources

- Zorzi et al. 2012, *PNAS* — https://pubmed.ncbi.nlm.nih.gov/22665803/
- Rello & Baeza-Yates 2013, ASSETS — https://dl.acm.org/doi/10.1145/2897736
- Wery & Diliberto 2017 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5629233/
- Kuster et al. 2018 — https://link.springer.com/article/10.1007/s11881-017-0154-6
- Galliussi et al. 2020 — https://link.springer.com/article/10.1007/s11881-020-00194-x
- Joseph & Powell 2022 — https://pmc.ncbi.nlm.nih.gov/articles/PMC9804695/
- BDA Dyslexia Style Guide 2023 — https://cdn.bdadyslexia.org.uk/uploads/documents/Advice/style-guide/BDA-Style-Guide-2023.pdf
- WCAG 2.2 SC 1.4.12 Text Spacing — https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- WCAG 2.2 SC 1.4.8 Visual Presentation — https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html
- SIL Open Font License — https://openfontlicense.org/

### Still open (next passes)

Recorded here so the audit isn't lost:

- **No `aria-live` anywhere.** Shot results, score changes, penalties and shard totals are silent.
- **No focus management.** Every render replaces `#app.innerHTML`; modals don't move, trap or restore
  focus, and 6 buttons behind the settings backdrop stay tab-reachable. The sheet has no
  `role="dialog"`/`aria-modal`.
- **Power and free-aim are pointer-only.** A keyboard user gets default aim at default power. The
  putt is a 1250ms sweeping canvas meter with no alternative.
- **The hole map SVG has no accessible name** and leaks loose `<text>` yardages.
- **Screen shake, the putt meter and the star-map rAF ignore reduced motion**, and four cinematic
  gates read `matchMedia` directly instead of the in-app `reducedMotion` setting.
- **Some `:focus-visible` rules set `outline: none`** and substitute only a transform.
- **`.gs-clickcard` / `.gs-yard-card` / `.gs-sshop-card` are clickable `div`s** — also flagged in
  `reports/game-review-playstore-2026-07-03.md` (H5).

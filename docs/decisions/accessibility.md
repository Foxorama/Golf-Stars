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

---

## GS-a11y-focus — overlays are dialogs, and everything is reachable by keyboard

### The problem

The app has one render model: `app.innerHTML = …` rebuilds the whole screen, and overlays are
rendered as **siblings of `<main>`** inside that same string. Fine for a mouse; broken otherwise.
Measured before the change, on the settings sheet:

| | Before | After |
|---|---|---|
| `role` / `aria-modal` | none | `dialog` / `true` |
| Accessible name | none | from its own heading |
| `document.activeElement` on open | `<body>` | first control in the sheet |
| Focusable controls still reachable behind the backdrop | **6** | **0** |
| Focus on close | dropped on the floor | back on the settings cog |
| Focus after flipping a switch | thrown to the sheet's first button | stays on the switch |

### The shape of the fix

**One pass at the end of `render()`, not six patched overlay builders.** `app/focus.ts` runs after
every render, so a *new* overlay gets the behaviour by existing. There are four parts:

1. **Backgrounding uses `inert`**, not a hand-rolled Tab trap — one attribute removes a subtree from
   the tab order, the accessibility tree and hit-testing at once, with no keydown handler to fall out
   of sync. Where `inert` is unsupported, it falls back to `aria-hidden` + a tabindex sweep, so the
   announcement fix still lands even if the tab-order fix cannot.
2. **Focus moves in only on the OPEN transition.** The settings sheet re-renders its own innerHTML on
   every toggle (GS-settings-flicker); re-focusing there would yank the player to the top of the
   sheet each time they flipped a switch. `preservingFocus()` wraps that surgical update and puts
   focus back on the same control.
3. **Focus is restored by SELECTOR, not by element reference.** `render()` replaces the DOM before the
   focus pass runs, so by then the focused node is detached and `activeElement` has already fallen
   back to `<body>` — an element reference would restore focus to a node that is no longer in the
   document. `captureFocusOrigin()` is called immediately *before* the innerHTML assignment, which is
   the last moment the information exists.
4. **Keyboard activation for every non-native `role="button"`.** Activation synthesises a `click`, so
   whatever handler the element already had is the one that runs — there is no second code path to
   keep in step.

### What that last one fixed

The app had three flavours of fake button: `<div>`/`<span>` cards carrying `data-action`
(`.gs-clickcard` ×6, `.gs-yard-card`, `.gs-sshop-card`), SVG `<g>` nodes on the journey and Star Tour
charts, and — the worst one — the golfer-card lore portrait, a `<span role="button">` with **no
`tabindex` and no key handler**, so it announced itself as a button and did nothing. Several of these
already *declared* `role="button" tabindex="0"` and bound only a `click`, which is arguably worse than
not claiming the role at all. All of them are now focusable and fire on Enter/Space; verified
end-to-end that Enter on the portrait opens the dossier **and does not also activate the enclosing
card** (which would have started a run).

### Focus rings

A bare `:focus-visible` rule now supplies a default ring. It is specificity (0,1,0) — *lower* than
every `.gs-thing:focus-visible` rule — so it is a **floor, not an override**: components keep their
bespoke rings, and the set that had none (`.gs-setchip`, `.gs-seg`, `.gs-mapbtn`, `.gs-roundbtn`,
`.gs-setrow`, `.gs-clickcard`, `.gs-traits-bar`, `.si-card`) stops being invisible to a keyboard.

Nine rules across five files folded `:hover` and `:focus-visible` together as
`{ outline: none; transform: … }`, so a keyboard user's only cue was a 2px lift *and* the
`outline:none` outranked the floor. Each now has a companion rule restoring a real ring; the hover
styling is untouched. `.gs-czone` is the sanctioned exception — it draws its ring on a `::before`
instead, which is a genuine indicator.

### One hardening worth recording

Backgrounding works by inerting every *other* direct child of the app root. An overlay nested inside
a screen body would live under `<main>` — inerting `<main>` would then inert **the overlay itself**
and freeze the whole app. Every sheet today is a top-level sibling; the pass now ignores a nested one
rather than locking the player out.

Guarded by `tests/a11y-focus.test.ts` (real-browser assertions on `inert`, `activeElement` and
Enter-activation, plus a source guard that no `:focus-visible` rule leaves a control with no ring).

---

## GS-a11y-announce — the game says what it is doing

### The problem

Everything that actually happens in this game happens on a canvas. The ball flies, lands, kicks,
runs out and finishes on a surface, and the only report of it is a picture. There was **no
`aria-live` region anywhere in the app** — a player using a screen reader got silence for an entire
round: no shot result, no penalty, no score, no idea where the ball was.

### The shape of the fix

**Pure builders + a guarded writer.** The builders turn sim state into a sentence and read the *same*
`ShotLog` fields the visible shot card reads, so the spoken report and the drawn report cannot drift
— the card is the picture of the sentence. Being pure, the exact wording is node-testable.

Three things are load-bearing:

1. **The live region lives OUTSIDE `#app`.** `render()` replaces `app.innerHTML` wholesale, and a
   live region that is destroyed and rebuilt on every render is not reliably announced by any screen
   reader — the element has to *persist* for its content change to register as a change.
2. **`polite`, never `assertive`.** A golf shot resolving is news, not an alert; interrupting whatever
   the player is reading to say "7 iron, 148 yards" would be worse than useless.
3. **Hidden by clipping, not by `display:none`.** Both `display:none` and `visibility:hidden` remove
   the node from the accessibility tree, which is exactly what a live region must not be.

### What gets said, and when

- **The situation, once per hole** — "Hole 3 of 18, par 4, 410 yards. Ball on the fairway, 155 yards
  to the pin. Wind 12 miles per hour headwind." This is what a sighted player takes off the map in one
  glance. Per *hole*, not per render or per shot: each shot's own report ends with the distance left,
  so repeating the preamble every stroke would be noise. Keyed on the **course seed**, which changes
  exactly when the stop does — including a replayed stop, which should narrate again.
- **Each shot, the moment the ball is down** — fired alongside the sfx, not with the visible card,
  because the card may be several hundred ms away or skipped entirely under Fast Shots. The lateral
  miss is measured off the **aim ray**, exactly as the card measures it, so "20 yards right" means
  right of where you aimed.
- **A penalty leads**, because it changes the score and not just the position.

Consecutive identical messages blank the region and re-set it on the next frame — a live region is
announced on *change*, so two pars in a row would otherwise be silent the second time.

### Also in this pass

- **The hole map SVG is now `role="img"` with a name.** It had none, and a screen reader walked into
  it and read the loose `<text>` yardage labels inside as a string of orphaned numbers.
- **The momentum pips are readable.** They encoded each hole's score in **colour alone** and the
  wrapper was `aria-hidden`, so the card so far was simply unavailable. The pips stay decorative (they
  are a glanceable shape, not a table) and the same facts now sit beside them as `.gs-sr-only` text.
- **Decorative canvases are hidden** — the weather overlay and the caddy portrait were unlabelled and
  exposed. The weather that *matters* is the wind, which the preamble speaks.
- `windRead()` was factored out of the HUD's wind chip so the drawn wind and the spoken wind come
  from one source.

### What was verified, and what wasn't

The live region, its placement outside `#app`, and the **situation** announcement were verified in a
real browser. The **shot-result** announcement could not be exercised end-to-end here: the ball-flight
animation is `requestAnimationFrame`-driven and the automated browser pane does not composite frames,
so the shot never settles. The wording is unit-tested and the call sits immediately beside the
`sfx.holeOut()` / `sfx.penalty()` calls on the same settle callback, but **it deserves eyes-on
confirmation with a real screen reader.**

Guarded by `tests/a11y-announce.test.ts`.

---

## GS-a11y-motion — the reduced-motion toggle actually reduces motion

### The problem

The in-app **Reduced motion** toggle and the OS `prefers-reduced-motion` query are two different
questions, and the app was asking the wrong one in two ways at once:

- **Four full-screen cinematic gates consulted the OS directly** (`app.ts` ×4, `shopArrival.ts`), so a
  player who ticked the box but had no OS-level preference still got the story intro, the ending, the
  Sigil ceremony and the shop arrival, at full length.
- **The ~19 CSS `@media (prefers-reduced-motion: reduce)` blocks can only ever see the OS**, so the
  toggle never touched a single entrance animation, sheen, drift or pulse.

And the single most nauseogenic thing on the screen — the **landing camera shake** — had no gate at
all, in either direction.

### The fix

**One answer, `settings.reducedMotion()`, and everything asks it.** The setting is seeded from the
media query on first run and is the player's own from then on, so it is strictly more informed than
the query. Re-consulting the media query inside the gate would reintroduce the mirror-image bug: a
player who deliberately turns the toggle *off* could not get their animations back. A source guard
now fails the build if any module outside `settings.ts` reads `matchMedia` for reduced motion.

**The setting reaches CSS via a `.gs-reduced` class on `<html>`** plus one blunt rule that collapses
every animation and transition duration. Blunt is correct here: it fires only when the player has
explicitly asked for calm, and at that point "some animations, tastefully reduced" is not what they
asked for. The bespoke `@media` blocks still run for the OS preference and do nicer things (fading
sparks out rather than snapping them), so this never has to be clever. Durations go to ~0 rather than
`animation: none`, because several entrance animations start at `opacity: 0` and would otherwise
never arrive at their end state.

**Camera shake is amplitude-gated, not branched around.** Setting the amplitude to 0 keeps the decay
running, so all twelve `shake = Math.max(…)` call sites behave identically and there is no second
code path to drift. Resolved once at mount, not per frame — the setting cannot change mid-flight, and
a localStorage-backed read per frame would be silly.

Guarded by `tests/a11y-motion.test.ts`.

### Deliberately NOT changed: the putt meter

The pace meter is a 1250ms sweeping canvas bar you must stop at the right moment — a hard timing
requirement with no alternative, which is a real accessibility barrier for motor and cognitive
impairment. It is **not** a reduced-motion problem, though, and the fixes all change difficulty:
slowing the sweep, widening the make band, or defaulting to the auto-putt path that the Penelope
Putter caddy already provides (`takePutt(…, control?)`).

Every one of those is a **balance change**, and this repo holds a hard line on that (contract 4: no
death spiral; a power-up must *raise* mean per-stop Stableford to ship). An assist that makes putting
easier has to be measured against the death-spiral harness and decided as a design question, not
slipped in under an accessibility banner. Flagged for the owner rather than done unilaterally.

---

## GS-a11y-keyboard — you can aim and swing without a pointer

### The problem

The pull gesture — drag down to load power, slide sideways to aim — was the **only** way to aim or
modulate power, and it is pointer-only. A player on a keyboard, a switch, or any assistive pointer
alternative could Tab to the Swing button and fire, but was locked to the seeded aim at the seeded
power for the entire game. That is not a harder game; it is a different and worse one.

### The fix

Arrow keys mirror the drag axes exactly — **left/right aims, up/down powers**, Shift for a fine
quarter-step — and go through the **same `setAimPower`** the drag now goes through. That refactor is
the point: it is one shot mechanic driven by two devices, not two mechanics that can drift apart.
`applyDrag` no longer derives the free target itself; both callers share the tail, and a test asserts
that all four arrow directions land on `setAimPower` and that the drag no longer computes its own.

Deliberately **no Enter/Space handler**. The Swing button is already tab-reachable and commits with
the previewed `selPower`, so a global commit key would double-fire with the focused control.

The handler stands down for browser shortcuts (Alt/Ctrl/Meta), text fields, and a raised modal — the
last tested structurally rather than by flag, since `applyOverlayFocus` already inerts the page behind
a sheet.

### The bug this could easily have shipped with

The listener is bound per render, and `render()` replaces the SVG. Bound naively, **every render
stacks another live listener on `window`** and a single arrow press steps the aim N times. The
cleanup therefore runs at the *top* of `wireShotGesture`, **before every early return** — because
those early returns are exactly the cases where the decision screen went away (a putt, a shot popup,
another screen entirely), and a listener left bound there would go on nudging an aim that is no
longer on screen.

Verified in a real browser: 6 × ArrowDown took power 100% → 70%; ArrowLeft swung the aim cone from
x≈110 to x≈60 through the surgical overlay refresh (not a full re-render); and after six further
renders one press still moved one step (10.4px vs 9.8px before), so nothing is stacking.

Guarded by `tests/a11y-keyboard.test.ts`.

### Still open (next passes)

Recorded here so the audit isn't lost:

- **An assisted-putting option** — see above; needs a balance decision and a harness run.
- **The golfer card is invalid HTML** — a `<button>` containing `<p>`, `<div>` and now a focusable
  `role="button"`. It works in every browser and is keyboard-operable, but the honest fix is to make
  the card a container with a stretched select-button behind its contents. Deferred because character
  select is viewport-locked (GS-select-onescreen) and the restructure deserves its own pass.
- **Momentum pips are colour-only** (`playHud.ts`) and the wrapper is `aria-hidden`, so per-hole
  scores are unavailable to AT.

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

### ⚠ Media queries are blind to the UI scale

Found by testing at 1.45× (GS-a11y-scale-wrap): root `zoom` shrinks the **layout box** every element
is laid out in — the pinned 3-up games row really does get ~69px columns — but it does **not** move
the media-query viewport. `matchMedia('(max-width: 320px)')` is still `false` on a 375px phone at any
scale.

So **a breakpoint can never be the answer to "this is too cramped at large text."** The content
itself has to cope. Concretely: `"Unending Universe"` clipped out of its `overflow: hidden` tile at
1.45×, and the fix is `overflow-wrap: anywhere` on the tile text, not a narrow-viewport rule that
would never fire. When adding layout that must survive the scale, make it wrap/reflow intrinsically
(`overflow-wrap`, `min-width: 0`, `flex-wrap`, `auto-fit` tracks) rather than reaching for a
breakpoint.

### Invariants

- **Nothing names a font family except `--gs-font`.** Both `font-family` and every `font:` shorthand
  resolve the family from the token, or the Readable text toggle cannot reach them — which is exactly
  how the settings sheet ended up in Times New Roman.
- **The family lives on `<body>`, not `.gs-main`.** Overlays are siblings of `<main>`.
- **No raw `100vh`/`100dvh`.** Use `--gs-vh` / `--gs-dvh`.
- **No canvas computes its own `devicePixelRatio`.** Use `canvasRatio()`.
- **Defaults are inert**: `--gs-track`/`--gs-wordspace` are `0em` and `--gs-uiscale` is `1`, so the
  untoggled game renders exactly as before. No save bump — `fc_settings` merges over defaults.
  (Since GS-ui-display-scale it is `calc(var(--gs-readerscale) * var(--gs-displayscale))`, both
  halves defaulting to `1` — the product is still `1` and the statement still holds.)
- **Nothing writes the combined token.** `--gs-uiscale` is a product of two independently-owned
  halves; an inline `setProperty('--gs-uiscale', …)` on the root beats the stylesheet outright, so
  whichever writer ran last would silently delete the other's contribution. See below.

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

---

## GS-a11y-stroke-focus — the keyboard arrives on the stroke (2026-07-31)

### The problem

Play-test report: *"the Swing and Putt action bars are painful to get to with a keyboard… current tab
order starts top left and makes you go through at least half a dozen tabs every shot to get to the
swing/putt button — on every shot."*

Two independent faults compounded, and both were structural rather than cosmetic.

**DOM order is tab order, and the map furniture was first.** `playFrameHTML` emitted the nav column
(🗺 whole-hole toggle, ⚙ settings) SECOND, right after the map — so the two least-used controls on
the screen were the first two tab stops of every single shot. Measured on the built game: aiming gave
`🗺 · ⚙ · 🏌 Swing · aim mode · » · bag` and the green gave `⚙ · ◄ · ► · pace meter · ⛳ Putt · »` —
**three tabs to Swing, five to Putt**.

**And focus reset to `<body>` after every stroke.** `render()` replaces `#app.innerHTML` wholesale, so
the focused node is destroyed on every shot and `document.activeElement` falls back to the document.
The three-to-five tabs were therefore not a one-off cost of learning the screen: they were paid again
on every stroke, for eighteen holes, in a game that is *entirely* golf strokes.

**Plus a dead tab stop on every putt.** The pace-meter canvas declared `role="button"`, which
`wireRoleButtonKeys` (GS-a11y-focus) correctly rewarded with a tab stop and an Enter/Space binding
that synthesises a `click` — and the canvas only ever listened for `pointerdown`. So a keyboard
player landed on something announced as a button, pressed Enter, and nothing happened. The report:
*"the putter power bar is also in the tab focus order, but can't be interacted with; it needs to be
in speech text, but not in the tab order."*

### The fix

**The stroke is where the keyboard lands, without tabbing at all.** `focusPlayStroke` (in `focus.ts`,
beside the overlay pass, because it is the same shape) focuses the panel's commit button as each
stroke's decision mounts. It is the play-screen twin of `applyOverlayFocus`: move focus in ONCE per
"open", put it back if a re-render knocks it loose, and never fight a layer that has a better claim.

- **The key is the DECISION, not the render** — `hole : shots : putts : lie`. A re-render inside one
  decision (a club change, an aim-mode tap, the map toggle) leaves focus exactly where the player put
  it; only a genuinely new stroke moves it.
- **Same decision, focus knocked loose** ⇒ restore the control the player was on, via the selector
  `captureFocusOrigin()` grabbed immediately before the `innerHTML` swap. Without this, tapping the
  aim mode bounced you to the commit button every time.
- **It stands down for any covering layer**, and asks the DOM rather than a flag. This is where the
  first cut shipped a bug: the guard read `awaitingShotPopup`, which stays TRUE through a putt render
  that draws no popup at all (the popup rides the aim body's `after` slot; the putt frame has none) —
  so the tee focused and the green did not. The shot-result card and the scramble choice now carry
  `data-gs-overlay`, the marker `OVERLAY_SELECTOR` already looks for. They still are not dialogs to
  `applyOverlayFocus` (it only backgrounds direct children of the app root, deliberately) — but
  "something is covering the decision" is one question, and it has one answer, in the DOM.
- **`preventScroll: true`.** The play screen is a full-bleed fixed frame, and GS-embed-scroll makes
  the page itself scrollable inside an iframe — scrolling to "reveal" a button already on screen is
  pure jitter.

**The nav column is emitted LAST.** It is `position:absolute` with its own `z-index`, so where it
sits in the string decides nothing except the tab order it hands the keyboard. Combined with the
auto-focus, the keyboard now arrives at the stroke and tabs OUTWARD from it: `🏌 Swing · aim mode ·
» · bag · 🗺 · ⚙`. Zero tabs to the primary action, in every state.

**The pace meter is spoken, never tabbed.** `role="img"` with a label that names the control which
actually stops it ("…Activate the Putt button to stop it in the make band"). Nothing is lost —
`⛳ Putt` has always committed the meter's live pace, and it is now the focused control when the putt
mounts, so Enter plays the putt.

**And the arrow keys say they exist.** GS-a11y-keyboard put the aim and the power on the arrows, but
they live on `window`, not on any control, and the aim cone is a picture — so they were invisible to
exactly the players who need them. `PlayFrameParts.commitHint` is a required field (a new play state
has to decide what its keys do) rendered as one `.gs-sr-only` node in the commit row, which both live
commit buttons point at with `aria-describedby`.

### What was checked and found already working

The same report said the putt's ◄/► arrows did not work. Driven in a real browser on `main` they
**do**, at every focus position (body, a nudge button, the pace-meter canvas), on the first putt and
the second, with the drawn putt line moving through the surgical `puttAimRefresh` — so no fix was
made and none is pending. The one case where they are genuinely silent is **by design**: a
green-reading caddy or a piece of read gear owns the line, and the nudges render disabled and without
their `data-putt-aim` hook, so the arrows go quiet exactly where the buttons do.

### Verified

In a real browser (`tests/a11y-keyboard.test.ts`, pinned seed `kb1`): focus is on `[data-swing]` the
instant the tee decision mounts; a same-stroke re-render leaves it on the control that was clicked;
after playing to the green focus is on `[data-putt-commit]`; the meter is `role="img"`, carries a
label, and is absent from the computed tab order; the commit is `aria-describedby` the key hint; and
Enter on the focused button strikes the putt.

---

## GS-a11y-sheet-scroll / GS-a11y-tight-fit — the settings have to survive a phone (2026-07-26)

The scale ladder shipped having verified exactly one property: *the play screen's commit row stays
on-screen at every rung*. It does. Almost nothing else did, and the play-test report was blunt:

> "settings in particular breaks with larger fonts, you can't scroll and so if you change the font
> size you can no longer see settings above it… actually the settings are just basically borked
> everywhere, the larger fonts size and readable text option just makes it more noticeable."

Plus: the golfer dossier's hero image above the top of the display, golfer names cut off mid-word,
the golfer card's preview text not fitting, the Voyage scout board opening off the top of the screen,
and on the play screen — "you can't see the golfer or ball flight or really anything as the screen is
obscured by the content boxes."

Every one of those is one of **two** bugs.

### Bug 1 — a `position: fixed` box bigger than the viewport is unreachable content

The settings sheet is `position: fixed`, bottom-anchored, and had no height cap. At the top rung it
measures **1515px against an 844px phone**: everything from the title down to "Save data" sat above
y = 0, and *the page cannot scroll a fixed element* — that is what fixed means. The only reason this
was not a hard soft-lock is that the size control happened to land in the visible third, so the
player could set the scale back down and recover the rest of the sheet.

Measured at 390×844, `.gs-settings`:

| | top | scrolls |
|---|---|---|
| before, scale 1 | **−326px** | no |
| before, scale 1.45 + readable | **−671px** | no |
| after, either | 12px | yes |

Note the first row: **this was already broken at the ship scale**, with default text, on a 390px
phone. The scale ladder did not cause it; it made it impossible to ignore.

The fix is the obvious one — cap to `var(--gs-dvh)`, scroll internally, `overscroll-behavior:
contain` so a flick at the end of the list doesn't scroll the page behind the backdrop — applied to
every fixed overlay in the app: the shared `.gs-sheet` (settings · scout board · price notice · exit
confirm), the golfer dossier, the lore card, and the three celebration takeovers. Two details are
load-bearing:

- **`align-items: safe center` / `safe flex-end`, not `center` / `flex-end`.** A centred flex item
  taller than its scroll container overflows in *both* directions and the browser cannot scroll to
  the top of it — the classic centred-overflow trap. `safe` degrades to start alignment exactly when
  the item overflows, which is the only time it matters.
- **The sheet head is `position: sticky`.** Once the body scrolls, the ✕ is the only affordance
  saying the sheet is dismissible; it must not scroll away.

#### The guard was looking for the wrong string

`tests/accessibility.test.ts` already banned raw viewport heights. It banned `100vh` and `100dvh`
*literally*, in `index.html` only. So `max-height: 92vh` on the dossier walked straight past it, and
so did nine other rules — `88vh`, `82vh`, `56vh`, `44vh`, `4vh`, three `60vh`s in TypeScript style
strings, and the shop-arrival cinematic's `58vh`/`40vh`. The guard now matches **any** multiple of
`vh`/`dvh`/`svh`/`lvh`, and walks `src/**/*.ts` as well as the stylesheet, because half this app's
CSS lives in inline `<style>` blocks inside render modules. (`src/test/**` is exempt — the test hub
is a separate page with no `--gs-uiscale` on it.) Both halves were verified to fail on a
reintroduced regression before being committed.

### Bug 2 — a media query cannot see the UI scale

This is GS-a11y-scale-wrap's lesson, and it has a second half. Root `zoom` shrinks the layout box but
leaves the media-query viewport at its physical size, so no breakpoint can answer "is this cramped at
large text?". The first answer — make the content cope **intrinsically** — is still the right one
and covers most cases:

- **`overflow-wrap: anywhere` on the golfer name.** Not `break-word`: at 1.45× "Longshot" is wider
  than half a 390px phone on its own, and only `anywhere` breaks a word with no break opportunity.
- **`repeat(auto-fit, minmax(min(N px, 100%), 1fr))` instead of `1fr 1fr`.** A bare `1fr` is
  `minmax(auto, 1fr)` and keeps a **min-content floor**, so a track whose content cannot shrink any
  further pushes the whole grid wider than its container. That is why "Music", "Fast shots" and
  "Readable text" hung off the right edge of the settings sheet, why the travel console's fuel gauge
  slid under the centre command dial, and why the shop's "Travel onward" hero clipped to "Trave /
  onwa". `auto-fit` also drops to one column on its own, which no breakpoint could decide.
- **The character roster scrolls.** `.gs-charwrap` was `overflow: hidden` with `grid-auto-rows: 1fr`,
  so when the cards genuinely needed more room than the phone had, the rows squeezed until the stats
  and trait lines clipped and the bottom row vanished. Rows now keep a `min-content` floor and the
  roster scrolls. **One screen is a goal, not a cage** — GS-select-onescreen's fit still wins
  whenever it can be had, which is every phone at the ship scale.
- **Tracking is held out of SVG `<text>`.** `letter-spacing`/`word-spacing` are inherited, so the
  reader pair set on `body` reached every hole map, star chart and card illustration. Those labels
  are placed at coordinates and cannot reflow: widening them ran the travel map's three lane captions
  into each other and off the edge of the chart. The legible **family** still applies — that is the
  part that survives on a fixed-position label.

But a few layouts are a genuine **either/or** that no amount of wrapping resolves, and for those
there is now one attribute: `data-gs-fit="tight"`, stamped on `<html>` by `app/viewportFit.ts` from
`innerHeight / uiScale`. Nothing else in the app may compute a scaled viewport itself — the same rule
`render/pixelRatio.ts` holds for DPR. Thresholds are 660 × 330 layout units, which reads *roomy* for
a phone at the two lower rungs (so the game the player already knows is untouched) and *tight* at 1.3
and 1.45 — and, correctly, on a 320×568 phone at the ship scale, where the same squeeze always
applied.

### The play HUD: 83% of the screen was chrome

GS-play-hud-space already diagnosed this exact bug and named it — *"the flanking caddy/action columns
cost the controls panel a THIRD of the screen width, which is what wrapped the power read and the
spray legend onto second lines — vertical height spent to buy horizontal emptiness."* At the top rung
it stops being a third. The phone lays out in 269 units; caddy 66 + action 40 + four gaps leave the
panel **135**, and the control stack answers by growing from 265 units tall to 380.

Measured at 390×844 (fraction of the viewport):

| | info bar | controls bar | clear band |
|---|---|---|---|
| scale 1 | 13.4% | 21.6% | 65% |
| 1.45 + readable, before | **38.4%** | **45.0%** | **16.6%** |
| 1.45 + readable, after | 30.2% | 31.0% | **38.8%** |

Two changes, both gated on `data-gs-fit`:

1. **The flanking blocks stop being columns and become badges floating just above the panel**, over
   the map. Nothing is removed and nothing moves between play states — GS-hud-frame's rule holds; the
   caddy is still bottom-left, the auto-finish still bottom-right, both at the same size. The panel
   gets the whole width, and its content stops wrapping.
2. **The hole's shape/width descriptors come off the conditions line.** They are BRIEFING, not live
   state: constant for the whole hole, and already read on the tee card. At the top rung that line
   was four wrapped rows — 136 of the info chip's 325 units, more than the hole/par/score rows put
   together. The lie, the wind and the yardage are the live ones and they win that argument.

What was deliberately *not* done: shrinking type on the play screen. The player asked for bigger
text. When the room runs out the answer is **fewer things at the same size**, never the same things
smaller — that is the whole point of the setting.

### The boot cinematic was never sealed

Found while fixing the above, because it made a focus test fail deterministically instead of
flakily. `mountIntro` appends its overlay to `<body>`, not to `#app`, and `applyOverlayFocus` only
walks `#app`'s own children (deliberately — see GS-a11y-focus). So for the whole cinematic, Tab
walked into a title screen the player could not see and had not reached, and a screen reader read it
out. The overlay now marks `#app` `inert` while it is up and focuses its own Skip button; `finish()`
is the single exit and every path — skip tap, key, click, end of sequence, a frame throwing — goes
through it, so the app is always handed back.

The three browser tests that were clicking into the app *during* the cinematic now pass `?intro=0`,
which is what they always meant.

### Guards

`tests/a11y-mobile-layout.test.ts` — pure cases for the effective-viewport maths, then Chromium at
390×844 on the top rung asserting the *properties*, not the pixels: the settings sheet's top and head
are on screen **and it scrolls** (not merely short), the scout board opens below y = 0, no golfer
name overflows its box, the dossier keeps its hero, the play screen's clear band is > 33% of the
viewport with the controls panel > 90% of the bar's width — and, the other half of the contract, that
at the ship scale `data-gs-fit` reads `roomy`, the caddy still sits *beside* the panel, and the
descriptors are still on the conditions line. Plus the intro seal and its release.

`scripts/a11y-scale-preview.mjs <screen> [scale] [readable]` is the eyes-on rig. Its `scrollAnc`
column is the one to read: content hanging off the screen is only a bug when it says `none`.

### Still open

- The travel bridge's id pod still ellipsises the golfer's name to nothing at the top rung — the
  fixed-width "Hole n" pill beside it wins the space. Letting the pair wrap breaks the pod's pill
  shape; it wants a real layout pass, not a tweak.
- The console's fuel gauge drops its cell bar at a tight fit and shows `⛽ n` alone, because twelve
  cells in the width that is left works out at 8px total, which communicates nothing. The
  `aria-label` still carries "Fuel n of m".

---

## GS-ui-display-scale — every display lays out as the phone the game is composed for

### The problem

Surfaced by the 2026-07-31 desktop play-test: *"the inround and endround info screens don't scale at
all"*, and the same complaint underneath the star-chart HUD one.

Two families of screen behaved differently and the difference was visible side by side. The
lore/beat screens are `.gs-main--bleed`, whose width is `var(--gs-portrait-w)` — a fraction of the
viewport **height** — so they always grew with the display. The ordinary flow screens are `.gs-main`
at a fixed **820px**, with inner caps like `.gs-strres { max-width: 460px }` and ~660 hard-px font
sizes. Nothing about them is height-derived, so nothing about them grew.

Measured on the built game at 1920×1080, the Star Tour round recap was a **460×442 island** — 24% of
the width, 41% of the height. Phone-sized UI marooned in the middle of a desktop display.

### Why a scale and not a layout pass

Twenty-odd flow screens, each with its own caps and its own hard-px type. A per-screen pass is twenty
chances to break a layout that works on the phone, and it would have to be redone for every new
screen. A scale reaches all of them at once and keeps the phone as the single composition target.

**The rule: `scale = clamp(1, min(w/390, h/844), 1.5)`.** 844 is the iPhone 14 the composition is
tuned against, so a 1080p display lays out in 844 units drawn 1.28× larger.

- **The ceiling is 1.5.** 1440p and 4K stop there rather than rendering the HUD at 1.71×/2.56×. A
  capped 1440p still lays out as a 960-unit-tall phone-shaped screen — comfortably bigger without
  becoming a billboard.
- **It reads both axes.** Height alone is the axis that matters on every real display, but a
  viewport proportionally *narrower* than the phone — a folded foldable at 344×882, a tall thin
  window — would be zoomed on the strength of its height and handed even less width to lay out in:
  329 units, which trips `TIGHT_W` and reflows the play HUD on a device that was fine. Taking the
  smaller of the two ratios means the scale only fires with room in both directions.
- **Not a media query.** A breakpoint *could* see the raw viewport here (this is the other direction
  from the GS-a11y-scale-wrap warning above) but it can only STEP, and a visible jump mid-resize is
  worse than the smooth ramp `viewportFit.ts`'s resize listener already gives.

### The insertion point is one token

`--gs-uiscale` becomes `calc(var(--gs-readerscale) * var(--gs-displayscale))`. `settings.ts` writes
the reader half; `app/viewportFit.ts` — the only module allowed to compute a scaled viewport
(GS-a11y-tight-fit) — writes the display half. `zoom`, `--gs-vh`, `--gs-dvh`, `--gs-portrait-w`,
`data-gs-fit` and `canvasRatio()` all already read the combined value, so that is the whole change.

**It multiplies, it never replaces.** The player owns their type (GS-a11y-readable-text): a display
scale that overwrote the reader's choice would take away the setting on exactly the machines where it
is easiest to read. `uiScaleOf()` is the single description of the product that the `calc()`
expresses in CSS, and nothing may write `--gs-uiscale` itself — an inline property on the root beats
the stylesheet, so whichever writer ran last would delete the other's half.

⚠ **Nothing may read `--gs-uiscale` back, either.** It is an unregistered custom property, so its
computed value is the token stream — `getPropertyValue()` returns the literal string
`calc(1 * 1.2796…)` and `Number()` of that is `NaN`. The crash report was doing exactly this; it now
asks `rootZoom()` for the zoom the browser actually applied, which is the truthful number anyway.

### ⚠ `--gs-portrait-w` is deliberately NOT multiplied back

This was the load-bearing decision, and the scoping note had it the other way round.

The portrait frame is `0.52 · --gs-dvh`, and `--gs-dvh` already divides by the zoom — so the frame
**renders at 0.52·H physical px whatever the display scale is.** Its drawn width and its 0.52 aspect
are both unchanged; only its contents get bigger. That is exactly what is wanted, and it is why
`tests/portrait-frame.test.ts` passes untouched (the star chart is still 562px wide at 1920×1080,
still centred at the same x).

Multiply it by the display half and the frame widens to `0.52·H·scale` — **562 → 719px at 1080p** —
and the play camera's aspect goes 0.52 → 0.67. `mapFrame()` grows the design frame to the
container's aspect (GS-play-fullframe), so that is a genuinely wider camera on every desktop shot:
the thing GS-play-desktop-frame's cap exists to prevent.

### Measured

At 1920×1080, zoom 1.28. Content box of each flow screen, before → after:

| Screen | before | after |
|---|---|---|
| Star Tour recap | 460×442 | **589×560** |
| Trade Market | 788×389 | **1008×495** |
| Star Mart | 788×478 | **1008×610** |
| Character select | 1148×408 | **1469×524** |

Play screen at 1920×1080, drawn map area **562×1080 px in both cases**; layout units 562×1080 →
**439×844**, i.e. the composed-for phone. Bar 90 → 89 units, control panel 66 → 66.

**The clear band pays 4.4 points: 84.1% → 79.7%.** That is the honest cost of the feature and not of
the portrait-frame call above — the band is a vertical measure, so widening the frame would not have
bought any of it back. 79.7% is the band the phone already gets (GS-hud-compass measured 80%), so
what desktop loses is a bonus it had from being taller in units, not headroom the HUD was designed
around. GS-decision-frame-carry re-solves the camera radius from the measured band, so the whole
contemplated shot still draws clear of the info bar.

Two consequences worth knowing, both "desktop now behaves like the phone":

- The **star chart shows ~22% less** of the map at default zoom (439×844 units instead of 562×1080).
  It is freely pannable and zoomable, so this is a framing change, not lost content.
- **Tall content that just fitted may now scroll** — the Pro Shop's content goes 907 → 1157px in a
  1080px frame. The page scrolls on desktop, and in an embed `data-gs-embed` already scrolls
  `.gs-main` (GS-embed-scroll); the embed's own 820×760 is below the base phone, so it is untouched.

### What was verified

`npm run typecheck`, the full suite (**213 files / 2559 tests, 0 skipped**), `npm run build`. Eyes-on
at 1920×1080 on the Star Tour recap, the free-roam star chart and a live tee shot, before and after.
Every combination of the two halves checked in a real browser: at 390×844, 1920×1080 and 2560×1440,
each at the top reader rung (combined zoom 1.45 / 1.855 / 2.175), the settings sheet keeps its top on
screen and scrolls internally, and the document never overflows horizontally.

Guarded by `tests/display-scale.test.ts`.

### Still open

The scale multiplies the caps; it does not remove them. The Star Tour recap is 31% of the width of a
1920px display rather than 24% — better, but still an island. A screen that genuinely wants to use a
wide desktop (a two-column recap, a wider board) is a per-screen composition job, and a different one
from this.

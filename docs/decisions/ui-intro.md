# Archived engineering log — ui intro

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## UI layer (locked in GS-8)
- **The screen flow is a PURE reducer** (`ui/game.ts`): `(UiState, Action) → UiState` over the
  run API — intro → play → result → shop → travel → … → gameover. No DOM, no time, so the whole
  interactive flow is unit-tested. `main.ts` renders `UiState` and dispatches actions on clicks.
- **Visual theme is a design-token stylesheet** (the `<style>` block in `index.html`, NOT the SVG
  render layer). CSS custom properties (`--gs-bg/-2/-panel`, `--gs-ink/-dim`, `--gs-line/-2`,
  `--gs-accent/-info/-danger/-gold/-warn`, `--gs-r/-r-lg`, `--gs-shadow`) are the single palette;
  component classes carry the hover/active/focus states inline styles can't express:
  `.gs-btn` (+ `--primary` green CTA / `--ghost` secondary / `--on` selected-toggle / `--block`),
  `.gs-panel`, `.gs-navtile` (+ `--game`, the title's doorway tiles — they replaced the old
  `.gs-format` panels), `.gs-chip`, `.gs-clickcard` (hover-lift shop/
  outpost cards), `.gs-scorecard`, `.gs-main` (the cosmic-vignette page frame). The `btn()` helper in
  `app.ts` takes `variant`; a dynamic rarity border is passed as `borderColor` → `--btn-border`/
  `--btn-hover` inline override (used by the travel route lanes). Adding a screen = reuse these
  classes, not fresh inline colours. `cards.ts` keeps its rarity-tinted inline borders/`opacity`
  (the cards tests assert `opacity:1`/`opacity:0.5` + the `rarCol` accent literally) — don't
  refactor those out. The build test forbids `??` and external assets in the bundle; CSS is fine.
- **Save persistence is a side-effect in `main.ts`**, never in the reducer. Resume rebuilds the run
  from the v2 `activeRun` snapshot (`resumeRun`); `?seed=` in the URL forces a fresh run.
- New screens/actions: add an `Action` variant + a guarded `case` (return state unchanged when the
  action doesn't apply to the current screen) and a render branch. Keep logic in the reducer.
- **Play-loop UX (GS-mechanics #1/#2/#3).** The play screen is **full-bleed: the map IS the screen**
  (`.gs-shot` is a viewport-height flex column — a compact **top stat bar** (`playTopBar`: hole #/total,
  par + hole length, live yds-to-pin, the running **zone score vs the cut**, the shot #, plus a thin
  lie/wind/conditions sub-line), then the map as the flex remainder, then club/strategy/Hit at the
  bottom — nothing scrolls, nothing overlaps). The zone-score chip is coloured by how the run tracks
  (`zoneScoreChip`): 🟢 beating the cut · 🟠 within striking distance (gap ≤ ⌈cut/2⌉) · 🔴 well short.
  There is **no per-hole briefing splash anymore** — the old `holeSplash` reducer flag + `startHole`
  action were removed; the zone identity moved to the once-per-stop starting zone screen (see *Zone
  splash card*) and the live per-hole facts moved to the top bar. The **shot-result popup** (a
  settle-delayed modal card + Continue after each non-terminal shot) and its timer are an `app.ts` VIEW
  effect (module vars, cleared by any dispatch), NOT reducer state. The popup card is the RICH `shotCardHTML(shot, {distToPin})`:
  it leads with a procedural **ball-at-rest vignette** (`render/restArt.ts` — a self-contained SVG of the
  ball on the surface it finished on, or the HAZARD alone when the ball wouldn't be visible: water/lava/
  void show no ball, OB shows it beyond the stakes, a holed shot drops into the cup — house rule, no 404
  asset) + club, finish (lie→lie), total/carry/roll, distance left, accuracy. To stop chipping/putting
  cutting to the follow-up too fast, `onDone` HOLDS a beat: a terminal shot waits `resultHoldMs` before
  the hole-complete screen; a non-terminal full shot pops the card; a mid-hole putt waits `puttHoldMs`
  (all `_gsFeel` sub-fields, no new `_gs*` flag). **Free-aim** (`ShotDecision.target`, GS-mechanics #10):
  tap/drag the map sets a course-space target (overrides attack/safe), unprojected from the pointer
  via a reconstructed decision projector and clamped to the longest club's reach; pointer move/up
  listen on `window` so a drag survives the per-frame re-render. **Layout**: a responsive `<style>`
  block in `index.html` drives the full-bleed shot screen (`.gs-shot/.gs-topbar/.gs-bigmap/.gs-bottom/
  .gs-shotscore`); the older side-by-side `.gs-play/.gs-map/.gs-controls` classes still back other
  screens. The map fills the flex remainder and the controls always sit under it without a scroll.

## Global settings nav + one-screen roster + mode tiles (GS-settings-nav, 2026-07)
- **The settings cog rides EVERY screen.** It used to be hand-placed per screen (title + the play
  view's map stack) so new screens (character select, clubhouse, market…) silently shipped without
  settings. Now `render()` appends one fixed cog OUTSIDE each screen's markup for every non-full-bleed
  screen — no screen can forget it. The full-bleed play view is the one exception (its map-nav stack
  already carries a cog; a second fixed button would collide).
- **"Return to title" lives in the settings sheet**, shown on every screen but the title itself. It
  dispatches the reducer action `toTitle`, which is deliberately NON-destructive: a run that's
  actually underway (`status === 'active'` AND a `characterId` picked) is parked as a `resumable`
  snapshot (`snapshotRun`) — exactly the offer a page reload makes — while the title's character-less
  placeholder run is never offered (nothing worth resuming). The sheet's subtext tells the player
  which case they're in ("Your run is saved…" vs "Back to the main menu").
- **`persist()` prefers the live run, else the parked offer.** It used to snapshot ANY active run —
  including the title's placeholder — so any dispatch from the title (opening the Clubhouse/Market)
  overwrote a saved run's snapshot with the empty placeholder. Now `activeRun` is written only for an
  underway run (characterId picked); otherwise the state's `resumable` is passed through, so a parked
  run survives reloads and title-screen wandering. `restart` (the Daily button) also carries
  `state.resumable` through `initState` for the same reason.
- **Character select fits ONE screen in every mode.** The roster is a 2×2 grid on phones (4-across
  ≥1000px, never a 3+1 orphan). Small screens swap the blurb + full pros/cons `<ul>` for a one-line
  `✓ pros[0] · ▲ cons[0]` hint — SAME markup, media-query visibility (`.gs-charcard-hint` vs
  `.gs-charcard-blurb`/`.gs-charcard-pc`), so there's no per-breakpoint template fork. The CTA verb
  follows the chosen format via `characterScreen(unlocked, { modeName, winnable })`: "Voyage as …"
  for the campaign, "Survive as …" for the Unending Universe, with the mode named in the header so
  you always know what you're picking for.
- **Title game tiles**: each format renders as a doorway tile — gold + 🚀 for the winnable Voyage,
  violet + 🌌 for the Unending Universe — data-driven off `FORMATS`, a new format gets a tile for
  free. (First shipped as a busier `.gs-modetile` hero card with badge + launch bar; unified onto
  `.gs-navtile--game` in the GS-title-3 pass below.)

## Title rework: hero wordmark, painted mode tiles, Ascension at golfer select (GS-title-2, 2026-07)
First-device feedback on GS-settings-nav reshaped the title:
- **Ascension moved OFF the title, onto character select.** On a veteran account the A1…A7 chip
  rows ballooned the Voyage tile (two rows of buttons under the launch button), and the difficulty
  is really a per-run, per-golfer decision — so it's picked WITH the golfer. `characterScreen` takes
  `opts.ascension = { max, sel }` and renders a `⚔ Difficulty` chip row (`[data-asc]`); the picked
  tier is app-layer VIEW state (`selAscension`) baked into every golfer card's `selectCharacter`
  action; the reducer clamps
  (`min(maxAscension, ascension)`) so a forged action can't start above the unlocked ladder. The
  unlock ladder itself stays ACCOUNT-wide (`maxAscension` — the bag-tier gates key off it); only the
  choice point is per-character. `start` still accepts an `ascension` (clamped) as the base the
  select screen overrides — kept for tests/back-compat.
- **Select-screen layout polish (GS-select-layout, 2026-07).** Device feedback flagged four
  irritations on the golfer screen, all fixed without touching the reducer:
  - **Difficulty defaults to your LAST pick, not always A0.** `selAscension` is seeded on 'start'
    from a persisted pref (`Settings.lastAscension`, clamped to `maxAscension`) and the `[data-asc]`
    click writes it back via `setSetting`. Still app-layer view state, still reducer-clamped — the
    pref is a convenience default, not a source of truth. (Club-set still defaults to the owned tier.)
  - **The `⚔ Difficulty` / `🎒 Club set` chips ride a single scrolling strip.** Chips moved into a
    `.gs-ascpick-chips` flex child (`flex:1 1 auto; min-width:0; overflow-x:auto`) so a veteran's
    A0…A15 ladder scrolls sideways on ONE fixed-height line instead of wrapping to extra rows that
    grew the screen and shoved the roster down.
  - **Equal-height cards.** `.gs-charwrap` gained `grid-auto-rows: 1fr`, so per-golfer content
    variance (the earned-clubs `unlockedStrip`, longer hints) no longer leaves cards mismatched —
    every card stretches to the tallest, CTA pinned to the bottom via `margin-top:auto`.
  - **The CTA is a footer LABEL, not a nested button.** The card was a `<button>` with a boxed
    `.gs-charcard-cta` inside, reading as "tap area PLUS a separate advance button". Deboxed to a
    top-divider + accent-text affordance (`Tap · Voyage as …  →`) so the whole card obviously IS the
    one control.
- **Difficulty PILLS + club-unlock badges (GS-diffpills, 2026-07).** Device feedback: the scrolling
  chip strips ate a row and the club-set axis was buried in the Unending Universe only. The chip strips
  are now TWO native-`<select>` dropdown **pills** on one compact row (`.gs-selpill`, `[data-selasc]` +
  `[data-selclubset]`): ⚔ Ascension (voyage, when tiers are unlocked) + 🎒 Club set / bag. The OS supplies
  the picker on tap (a real "pull box"), so an A0…A15 ladder never reflows the roster. The club-set pill
  now shows on **every mode** (only when a better-than-common bag is owned — otherwise no choice), so a
  per-run bag downgrade is one tap from the Voyage too (it feeds `startRun` for all formats, GS-wardrobe-
  bagtier). Changing a pill re-renders the roster (updating the badges below) and rides each card's
  `selectCharacter` action; the club-set pick only overrides + write-throughs when CHANGED (`selClubSetTouched`).
  Each VOYAGE card now carries a club-UNLOCK badge tied to the SELECTED Ascension (off `maxAscensionByCharacter`,
  passed as `opts.unlockLadder`): 🔓 *win A_n → new club* when a win at the picked tier grows THAT golfer's
  bag (`sel ≥ their cleared count`), 🔒 *next club: win A_k* when the tier's already cleared (k = their next
  uncleared tier), ★ *bag complete* when `unlockableClubTypes` is empty — answering "which difficulty do I
  play THIS golfer at to unlock a club?" right on the card. Endless grants no club unlocks, so no badge there.
- **The Daily Challenge button is PARKED (removed from the title), not deleted from the engine** —
  string seeds still work (`?seed=daily-YYYY-MM-DD` reproduces it); only the `dailySeed`/`dailyLabel`
  helpers went. Bring it back as its own surface when it earns a place.
- **Game tiles ARE doorway tiles (GS-title-3, 2026-07).** The first GS-title-2 cut gave the game
  tiles their own busier `.gs-modetile` component — full-width, taller, corner badge, meta/progress
  text and a fat `.gs-modetile__go` launch bar. Device feedback: they read as "a tap panel plus a
  button plus a heap of text" and clashed with the clean Market/Clubhouse doorways. So the component
  was DELETED and the game tiles now reuse `.gs-navtile` verbatim with a `--game` modifier — same
  2-up grid (1-up ≤460px), same art + title + one-line caption anatomy (the caption is the format's
  `blurb`, trimmed to doorway length), distinct ONLY via the `--mc` accent (gold/violet) on border +
  title and a slightly taller `min-height` (150px vs 134px). The painted scenes stayed
  (`voyageTileArt()`: a dotted gold route arcing over three worlds to a pin flag, a ship mid-jump;
  `unendingTileArt()`: a violet star tunnel with a golf ball streaking in). The WHOLE tile is one
  `<button>`, still data-driven off `FORMATS` keyed on `winnable`. The endless best-holes count
  moved to a hero chip (`∞ Best N holes`); the next-unlock tease line was dropped — the full
  milestone trail's home is the Trade Market's earned gear. The build test now clicks the tile by
  its format name ("The Voyage") and uses the title-only "Choose your game" seclabel as its
  not-on-title sentinel.
- **Trade Market gets its own teal/amber identity (2026-07).** Device feedback: the Trade Market
  doorway (violet `--mc` + a purple nebula with planets) read as a near-twin of the Unending Universe
  game tile directly above it (also violet, also a nebula-with-core scene). Fixed by giving the Market
  a distinct scheme with NO shared motif: `--mc` moved orchid `#d98cff` → trade-teal `#39d9c4`, and
  `marketTileArt()` was repainted from "nebula + planets + rocket" to a warm-lit ORBITAL TRADING POST
  — a teal docking ring circling a modular hub with amber market windows + a beacon, a stack of cargo
  crates for wares, and a shuttle ferrying a crate in (teal deep-space gradient, not violet). Still
  hand-placed/no-rng so the tile stays byte-stable. Unending keeps the violet star-tunnel-to-a-core;
  the two now differ in both hue and subject.
- **Hero header**: centred wordmark (green/gold glow) + small-caps tagline + a chips row (shards /
  aces / bests / install). Sections are labelled by `.gs-seclabel` rules ("Choose your game" — the
  build test asserts this string — and "Between runs" over the Market/Clubhouse doorways).

## Loading intro cinematic (`render/introView.ts`)
- A cosmetic, vector-drawn Canvas2D title sequence (no sim, no art asset to 404): four golfers
  pitch their bags into a woody station wagon in a suburban driveway → wheels fold up, it hovers,
  jets extend → it rockets nose-up into a starfield (ignition flash + exhaust plume + warp-streak
  stars + decaying screen-shake), through nebula clouds and shooting stars → a **golf-ball shooting
  star** streaks across the void in the wagon's wake → **the stars it left behind stream down and
  settle into GOLF STARS** (a constellation wordmark with faint linking lines + sparkle glints) →
  hands off to the title. Timings/feel read from `window._gsIntro` (escape-hatch rule: `shake`,
  `nebula`, `planet`, `ballShooter`, `shootingStars`, `starCount`, `constellation`, phase durations,
  `speed`); it's skippable (Skip
  button / click / Esc-Enter-Space), respects `prefers-reduced-motion`, and is gated by
  `sessionStorage` so it plays once per session (`?intro=1` forces, `?intro=0` disables).
- **The sky is continuous with the game (the three asks of this branch).** (1) The space gradient
  resolves to the app background `#0b0d12` (and the overlay base is `#0b0d12`) so the loader→title
  handoff is seamless — no blue-jump when the overlay lifts. (2) The starfield **fills in
  progressively** as the wagon climbs: each star carries a `pop` threshold and reveals once the
  takeoff fill passes it, not one global crossfade. (3) **The title IS stars** — `sampleTitleStars`
  rasterises the wordmark to an offscreen canvas and samples covered pixels into star points; they
  fly in from above (the wake) left→right and settle (`easeOutBack`) onto the letters. If a browser
  denies canvas pixel read-back, `titleStars` is empty and `drawTitle` falls back to a glowing-text
  wordmark — a cosmetic intro must never throw and strand the boot.
- **All effects degrade safely:** the deterministic mulberry32 RNG seeds stars/shooters/dimples (no
  `Math.random`, stable across reloads); every frame runs inside a try/catch that calls `finish()` on
  throw, so a cosmetic glitch never strands the boot. The **golf-ball shooting star** (`drawGolfBallShooter`)
  fires once after launch (`t3`), crossing the upper sky with a dimpled-ball head + tapered glow trail —
  on-theme for *space golf*, no asset to 404. The old **golf-ball planet** (`drawPlanet`) read as a stray
  golf ball overlapping the title, so it's now `planet:false` by default (function kept behind the flag as
  an escape hatch). The wordmark stars all carry a soft glow (heroes glow harder) + a warm underglow band,
  so the title reads legibly bright against the starfield. **PERF GOTCHA:** that glow is a cached
  warm-white `glowSprite` (a radial-gradient offscreen canvas) stamped per star/ball via `drawImage` —
  NOT `ctx.shadowBlur`. shadowBlur is a per-draw Gaussian; applying it to the few hundred title stars
  chugged the framerate to a crawl. drawImage of a cached sprite is ~60fps (verified via a rAF counter).
  Reach for the sprite, never per-element shadowBlur, for any many-instance glow. The launch no longer
  draws a long exhaust-plume/smoke column trailing the climbing car (`drawLaunchFX` is just the pad
  ignition flash now) — that plume read as a weird "jet under the car"; the car's own rear-nozzle flame
  is the exhaust. `holdMs` is 3000 (was 1500) so the formed wordmark lingers ~1.5s longer before handoff.
  CAR GOTCHAS: the rear **tailgate** is hinged at the rear roof corner (`translate(72,-52)`) and rotates
  `0.8 - bootOpen*1.55` — so at `bootOpen 0` it lies FLUSH along the sloped rear (boot reads SHUT) and
  swings up/back as it opens; the old version pivoted at the bottom so `bootOpen 0` stuck a vertical panel
  up and the boot always looked open. The timing (`bootOpen` nonzero only in the load window `t0..t1`)
  already does closed→open→closed; the bug was purely the closed-state geometry. The twin rear **jet
  nozzles/flames** sit at local `ny ∈ [0,16]` (inside the body rect `y -10..28`) — they used to be at
  `[-16,6]`, floating the top one above the roofline. **Title sizing/legibility:** the wordmark samples
  from a `116px` font (was 96) on a denser `step:8` grid with a NARROW hero/normal size+glow gap — a big
  gap + additive `'lighter'` blending blew out hotspots and left the dim letters unreadable; keep heroes
  only a touch brighter so the whole word reads evenly.
- **It is NOT in the pure reducer** — it's a time/DOM side-effect, so it lives in `app.ts` like the
  play-view canvas mount and save persistence. **Gotcha that keeps `tests/build.test.ts` green:**
  `start()` runs the normal `boot()` FIRST (the real title actually paints + sets `data-booted`),
  THEN overlays the intro as a `position:fixed` element on `document.body`. The title is genuinely
  in the DOM from t=0, so the real-browser smoke test (waits for `data-booted`, asserts the title
  text) passes even while the overlay covers the screen. `onDone`/skip removes the overlay,
  revealing the already-rendered, interactive title. A throw inside the rAF loop calls `finish()`
  so a cosmetic glitch can never strand the boot. Canvas feel isn't unit-testable — verified
  eyes-on (Playwright screenshots per phase).

- **The decision camera holds PERFECTLY still for the whole shot decision, and the watch-cam starts
  at the exact same zoom (GS-gesture-jitter + the release "zoom skip-jump", 2026-07).** Two bugs, one
  cause: the framing chased live gesture state. (1) `frameSpray` was built from the LIVE drag target;
  `carryHigh` folds in the wind component ALONG the shot bearing, so every pixel of aim slide (even
  finger tremor at `AIM_SENS 0.34°/px`) wobbled `viewRadius` sub-pixel per frame — invisible as
  motion, but it re-projected the seeded scene every frame and lit up the style.ts decor-jitter bug
  (see render.md). Now the map frames on the full-power PIN-AIM spread (`clubId + selAim`, no
  target): the camera changes only when the club/lie changes, and the cone moves within a rock-still
  world. The whole-map view gets the same treatment via `RenderOptions.fitSpray` (fit on the stable
  spread; the live `spray` still draws the cone). (2) On release, the shot animation framed itself on
  `decisionReach(actual travel)` — a different radius than the decision map (which frames on
  full-power carryHigh / mapZoom), so the watch view CUT to a different zoom the instant the finger
  lifted. `decisionRadius` (module view-state, like `mapZoom`) now captures the follow-cam radius on
  every decision render and the animation mounts with exactly it; the follow-cam pans to keep up with
  the ball as before (the radius is ≥ the old travel-framing for full shots, and for a pinched-in
  player it honours THEIR zoom). Falls back to travel-framing when no decision preceded the animation
  (resume, putt-only); reset per hole alongside the other per-hole view state.

- **The stop intro is two mobile steps, not one long scroll (GS-intro-split, 2026-07).** The old
  single `introScreen()` stacked the world header, the win condition, the whole 20-golfer field AND
  the hole map + full hazards/benefits lists into one `.gs-panel` — a long phone scroll where the
  primary action sat below the fold and the competitors were buried. It's now split into two steps
  that each hold a phone screen, kept as ONE reducer screen (`'intro'`) toggled by a view-state
  module var `introStage` (`'arc' | 'hole'`, like `settingsOpen`/`inspectRouteId`), reset to `'arc'`
  + popup-closed whenever we (re-)enter the intro (the `prevScreen !== 'intro'` guard in `dispatch`).
  So NO new reducer screen, NO save bump, NO rng — every seeded `ui.test` flow that lands on `'intro'`
  is byte-identical; the two `playInteractive`/`play` actions still fire from `'intro'` exactly as
  before (the build smoke test just clicks First Tee → Tee Off to reach them).
  - **Step 1 `arcIntroScreen()` — the arc:** the world identity, the mode's OBJECTIVE line, the
    boss/split/event NOTES, and the field of competitors (`competitorsCard`/`leaderboardHTML`). A big
    "First Tee ▸" (`data-intro-stage="hole"`) sits up top next to "‹ Change golfer" (the new
    `backToCharacter` action → the roster; the run rebuilds on the next `selectCharacter`, same
    seed+format, so it's view-only). A SECOND First Tee is emitted at the very bottom but hidden by
    default; `render()` reveals it (post-`requestAnimationFrame`, so `scrollHeight` is settled) ONLY
    when the field overflows one screen — reachable after scrolling the roster, never a redundant
    duplicate on a short screen. Verified: a 20-golfer arc overflows ~157px and shows both; a short
    arc shows one.
  - **Step 2 `holeIntroScreen()` — the hole:** a compact header + a large hole map + the action row
    (Tee Off / Watch AI / Back), laid out as a flex column with the map viewport-capped
    (`.gs-holeintro-map svg{max-height:44vh}`) so the CTAs stay on-screen without scrolling (measured
    overflow 0 at 414×896). The hazards/benefits detail — which used to sprawl down the page — is
    now a single tappable `.gs-traits-bar` (icons + counts) that opens `introTraitsOverlay()`: a
    bottom-sheet popup (the settings-sheet pattern, `data-introtraits` open/keep/close) listing ALL
    hazards AND benefits plus the world inspiration + brief in one window. **Gotcha:** the dataset
    key must match the selector — the bar attribute, the overlay's close buttons, and the
    `[data-introtraits]` handler all use the single token `introtraits` (a hyphenated
    `data-intro-traits` maps to `dataset.introTraits` and silently won't match `[data-introtraits]`;
    that typo shipped for one build and the popup no-oped until unified).
  - `introShared()` derives the world/notes/objective ONCE (pure read of `state`) and both steps
    consume it, so the two screens can never drift. CSS lives in the `GS-intro-split` block in
    `index.html`. Feel verified eyes-on (Playwright, 414×896): arc, hole, and popup all render
    correctly with zero page errors.

- **The Unending Universe skips the arc step after the first tee (GS-intro-endless, 2026-07).** In
  the gate format the arc step's "field" slot is the running round card + last-runs board
  (GS-golf-score) — the SAME summary the result screen shows at the end of every 4-hole stop. So the
  loop read as: result summary → journey map → pick a route → *the summary again* (arc briefing) →
  Next Tee → hole step. Two summary screens back-to-back on every jump, and the arc's objective line
  (the survival bar) is already carried by the score card's "Next hole bar" footer. Fix: the intro
  entry reset in `dispatch` (the `prevScreen !== 'intro'` guard) opens on `'hole'` instead of `'arc'`
  when `holeGateArmed(run) && run.stopIndex > 0` — a route jump (or a mid-run resume) lands straight
  on the hole map. Stop 0 keeps the arc step: coming from character select it IS the mode lobby
  (win condition, Change golfer, the records board). The briefing isn't deleted — the hole step's
  back button (relabelled "‹ Briefing" under the same condition, since there's no "back" when the
  intro opened here) still opens it on demand, and its "Next Tee ▸" returns. View-state only: no
  reducer/save/rng change.

- **The Voyage skips the arc step too, matching the Unending Universe (GS-intro-voyage, 2026-07).**
  The GS-intro-endless skip above was gated to `holeGateArmed` (the Unending Universe only), so the
  Voyage still read as: result recap → pro shop → journey map → pick a world → arc briefing/leaderboard
  → Next Tee → hole step — the same one-tap-too-many the endless loop already shed. The Voyage's arc
  step is the ghost competitor board (`leaderboardHTML`/`competitorsCard`), a field/standings screen
  the player has already been looking at across the run, so landing on it after every world pick is the
  same redundant beat. Fix: drop the `holeGateArmed(run) &&` clause from the intro-entry stage reset —
  the gate is now simply `run.stopIndex > 0`, so **every** format past its first tee opens straight on
  the `'hole'` step (map + Tee Off), one tap from teeing off. Stop 0 (from character select) still
  opens on `'arc'` for both formats. The hole step's "‹ Briefing" back button relabels on the same
  `run.stopIndex > 0` condition, so the Voyage's competitor board is one tap away exactly like the
  endless records board. Still view-state only: no reducer/save/rng change, the two `playInteractive`/
  `play` actions still fire from `'intro'` unchanged, and stop 0's arc-step flow (the build smoke test's
  First Tee → Tee Off) is byte-identical.

- **The post-stop recap now matches the intro's bar (GS-result, 2026-07).** After the intro got the
  two-step polish, the AFTER-hole `resultScreen()` was the weakest beat in the Voyage loop: a plain
  16px `<h2>` verdict, a one-sentence "Stableford N vs cut M · gross X · +Y credits" summary, and the
  hole-by-hole scorecard hidden inside a collapsed `<details>` — almost entirely ad-hoc inline styles,
  no rarity theming, no stat tiles (the Unending Universe already enjoyed `endlessScoreCard`, so the
  gap was Voyage-only). It's rebuilt to speak the intro's language, top to bottom:
  - **A rarity-framed `.gs-panel.gs-result`** (border + glow off `rarCol`/`rarityFlavour`, the arc
    head's exact treatment) headed by a "STOP N · cleared/ended" eyebrow, the WORLD you just played
    (`zoneProfile(archetypeFor(...))` → zone name + signature + theme, mirroring `arcIntroScreen`),
    a glowing **verdict badge** (`MADE THE CUT` / `MISSED CUT` / `SET SURVIVED` / `MATCH WON`…), and
    the rarity chip. The pass sparkle (`burst()`) fires inside the panel.
  - **Big `.gs-result-stat` tiles** (the `endlessCards.ts stat()` idiom, local `resultStat`): STABLEFORD
    (tinted by pass), GROSS, then CUT-made/missed or — on a positional stop where survival is your PLACE
    — the ordinal place, and +CREDITS (with an ⛳ aces sub). A matchplay boss drops the cut/place tile
    (the `matchResultPanel` below carries the duel verdict).
  - **The round, hole by hole (`roundStrip`)** — a clickable `.gs-round` strip promoted OUT of the old
    `<details>`: one card per hole with strokes (big), par, and score-relative-to-par (`E`/`−1`/`+1`/
    `✕` pick-up), tinted by the shared `holePips` palette (eagle-gold → blow-up-red). Tapping a hole
    fires the existing `viewHole` action and drives the framed replay below it (selected hole ringed) —
    the golf-soul journey of the stop made visible instead of buried.
  - Then the standings (`leaderboardHTML`) and a full-width primary Continue. The Unending-Universe
    branch is untouched (still `endlessScoreCard` + `endlessRecordsBoard`, now inside the same panel).
  Pure render off `state` — zero rng draws, no save touch, no reducer/sim change (the whole `src/sim`
  suite + `ui.test` stay byte-identical; typecheck + build + 912 tests green). The dead `scorecard()`
  table is retired. CSS lives in the "Stop result" block in `index.html`. Verified eyes-on (Playwright,
  430×950) across a RARE island world and a COMMON glacier world: verdict, tiles, tinted round strip,
  and tap-to-replay all render correctly with zero page errors.

## GS-app-split: app.ts stops being a god-file (2026-07-06)

`app.ts` had grown to 4,449 lines — every screen builder, the play screen, the render wiring and
boot in one file. CLAUDE.md itself called it "the likeliest source of regressions". Split it into
`src/app/` modules, purely mechanical (zero behaviour change; whole suite + typecheck + build green):

- **`ctx.ts`** — the live `state` ES-module binding (`setState()` is called only by app.ts's
  boot/recover/dispatch; every screen module imports `state` and reads the current value via the
  live binding), plus `btn`/`header` and `seedFromUrl`/`freshRunSeed` (still the one sanctioned
  `Math.random`, still side-effect layer).
- **`helpers.ts`** — the cross-screen presentational reads: per-hole render keys
  (`holeBiome`/`holeThemeId`), the route-effect arm checks (`tentsActive`/`scorchActive`/
  `patchActive`/`rainbowActive`), `golferLook`, the caddy badge helpers, `lefty`, `rarityFlavour`,
  `burst`.
- **`duelHud.ts`** — competition/matchplay/team-duel HUD blocks, used by the play screen AND the
  intro/result screens.
- **`titleScreens.ts` / `introScreens.ts` / `resultScreens.ts` / `shopScreens.ts` /
  `marketScreens.ts` / `clubhouseScreens.ts` / `travelScreens.ts`** — one module per screen family.
- **Per-screen view state moved WITH its screen** as an exported mutable view object
  (`marketView.showOwned`, `introView.stage`, `clubhouseView.slot`, `travelView.inspectRouteId`,
  `shopView.inspectGearId`, `installView.deferred`) — app.ts's dispatch/render wiring mutates the
  object's FIELDS (cross-module `let` reassignment is illegal in ESM; object-field mutation isn't).
- **Direction of imports**: screen modules import from `ctx`/`helpers`/each other, NEVER from
  `app.ts` (no cycles). `app.ts` keeps what genuinely needs the DOM loop: boot/recover/persist/
  dispatch, the full interactive play screen (gesture, map nav, putt-aim state), `render()` + its
  wiring, and the canvas/weather/caddy mount side-effects.

Rules of thumb this locked in: a NEW screen is a new `src/app/` module (never more app.ts); a
helper used by 2+ screen families goes in `helpers.ts`; view-only UI state lives in the screen's
exported view object so dispatch can reset it without owning it.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

- **UI layer** — `docs/decisions/ui-intro.md`
  - The screen flow is a PURE reducer (`ui/game.ts`): `(UiState, Action) → UiState`, no DOM/time,
    fully unit-tested. `app.ts`/`main.ts` render state + dispatch; save persistence + canvas mounts
    + the intro cinematic are side-effects there, never in the reducer. `game.ts` is the re-export
    BARREL + the `reduce` switch (GS-refactor-split): the state/action TYPES live in `gameState.ts`,
    the per-golfer cosmetic resolvers in `gameCosmetics.ts`, and the shared run-end/endless/ace/Asgard
    UPDATE helpers in `gameUpdates.ts` (siblings never import game.ts — no cycle). Extend a sibling,
    not the barrel; every `import … from '../ui/game'` still resolves through the re-exports.
  - The app shell is SPLIT (GS-app-split): `app.ts` keeps boot/dispatch/render wiring + the
    interactive play screen; every other screen builder lives in `src/app/*` (title/intro/result/
    shop/market/clubhouse/travel + `ctx.ts` with the live `state` binding, `duelHud`, `helpers`).
    Screen modules read `state` from `ctx.ts` and NEVER dispatch or import app.ts (no cycles);
    per-screen view state is an exported view object (`marketView`, `introView`, …) app.ts's
    wiring mutates. A new screen = a new `src/app/` module, not more app.ts.
  - Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play screen is
    full-bleed and never scrolls; pull-to-power is the only shot input.
  - DEFAULT AIM is a smart assist (GS-default-aim): `selAim` seeds from the persisted `Settings.aimMode`
    each new shot (default `'auto'`), resolved by the SHARED `aimTargetOf` in `play.ts` (so `previewShot`/
    `takeShot`/auto-finish stay byte-identical, contract 2). `'auto'` = the pure `round.ts autoAimTarget`:
    par 3 → the flag; par 4/5 TEE → down the fairway CENTRELINE (dogleg-aware station at ~drive reach, not
    a straight line that cuts the corner into rough); par 4/5 NON-tee → the flag when the green's reachable,
    else position down the corridor. Forced carries defer to `safeTarget` (clamped ≤ reach). `'attack'`
    (flag) + `'safe'` (`layupTarget` corridor lay-up) are the old modes. INTERACTIVE-only — the headless
    `playHole` keeps its own `layupTarget` line, so determinism (contract 1) + every seeded test are
    untouched. Change it in play via the ◎ club-row button (cycles auto→attack→safe, persists) or the
    settings-sheet 🎯 pill; the default club seeds to the mode's fit (`ShotView.autoClubId`). A free-drag
    aim still overrides for that shot. `aimMode` is a `Settings` field (no save bump, no `_gs*`/URL hook →
    no test-hub wiring). Guarded by `tests/default-aim.test.ts`. THREE follow-up fixes: (1) the shot map
    now ORIENTS down the resolved aim line — `decisionView`'s `up` = `resolveAimTarget(…)` − ball, not the
    hardcoded tee→PIN — so the framing AGREES with the default aim and reorients when the mode / free-drag
    aim changes (the old pin-up pointed across a dogleg corner into the trees while the auto aim went down
    the fairway). (2) the default CLUB is `round.ts autoAimClub` (NOT the auto sim's club-DOWN `aiClub`),
    kept in lockstep with `autoAimTarget`: a green attack → the green-COVERAGE club (`suggestPlayerClub`,
    so an approach never comes up a club short); an OPEN corridor positioning shot → the LONGEST usable
    club (the driver off the tee, since the club sets the CARRY and the aim only the DIRECTION — it was
    pre-arming a 5-wood); a forced-CARRY drive (the aim flies OVER a hazard to a landing beyond it) →
    `longestCarryClub`, the LONGEST club that still clears the far bank AND lands penalty-free (more club
    is the safer carry, not less — a long par-4 tee shot over a river is a DRIVER, not a clubbed-down
    wood), stepping down only if the driver can't clear / would overshoot into a second hazard, and
    falling back to `aiClub` only when NO club clears (a genuine lay-up short). This fixed the residual
    "off-tee still defaults to a 5-wood on a carry hole" report: the old blocked-line branch handed the
    forced carry straight to `aiClub` (shortest club that reaches), clubbing a driver down to a wood on
    the ~58% of long par-4 tee shots that carry a creek/river; it also cured the sticky sibling symptom
    (auto pre-armed the wood, then toggling aim to pin KEEPS the selection since it's still usable — so
    an attack shot showed the wood too). (3) the
    settings 🎯 dropdown was UNPICKABLE — a click on the `<select>` bubbled through the `[data-settings=
    "keep"]` branch (which `return`ed WITHOUT `stopPropagation`) to the backdrop's close handler, tearing
    the sheet down before you could choose; the keep branch now stops the event.
  - The settings cog rides EVERY screen (appended once in `render()`); "Return to title" is
    NON-destructive (an underway run parks as `resumable`). `persist()` snapshots the live run only
    when one is underway, else passes `state.resumable` through — NEVER snapshot the title's
    character-less placeholder run (it wipes saves).
  - The settings SHEET's inner content is `settingsSheetInner()` (split from the `settingsOverlay`
    backdrop/frame wrapper); an in-sheet toggle/aim tap updates it SURGICALLY via `refreshSettings()`
    (swap `.gs-settings` innerHTML + re-`wireSettingsSheet(sheet)`) — NOT a full `render()`, which
    re-mounts the `.gs-sheet` frame and replays its slide-up animation as a flicker (GS-settings-flicker,
    the `puttAimRefresh` sibling). A Music toggle still calls `syncMusic()` in the handler (render() no
    longer runs to do it). `wireSettingsSheet(root)` wires the sheet's descendants only, so the
    persistent backdrop + frame are never double-listened. The Audio + Feel on/off prefs are compact icon
    CHIPS (GS-settings-chips, `.gs-setchip` in a 2-col `.gs-chipgrid`, `TOGGLE_CHIPS` table) — icon +
    label + a mini switch, descriptions on `title`/`aria-label` — replacing the tall full-width rows so
    the sheet is far shorter; aim stays the segmented `.gs-seg` control.
  - The title's CONTINUE RUN button (GS-continue-button, `titleScreens.ts continueRunHTML`/`resumeInfo`)
    is THEMATIC + mode-aware: the character's cosmetic ship (`shipForCharacter`→`shipCardSVG`) + a message
    read off the parked `RunSnapshot` — Voyage → `Arc N of 3` (`arcIndexOf(stopIndex)+1`), Unending →
    `Hole N` (`holesSurvived+1`), Star Tour → a course medallion (`courseIconHTML`, archetype-tinted
    planet+flag) + course name + `Hole N of 18`. Star Tour ONLY offers a continue once a course is teed
    off (`staticCourseId` set) — a golfer-picked-but-no-course session shows no card. OWN class prefix
    `.gs-resume*` (never the play HUD's `.gs-hud`). Pure render off `state.resumable`; no `_gs*`/URL hook.
  - STAR TOUR mid-round resume (GS-star-tour-resume): the 18 holes are ONE stop, so the ordinary
    restart-the-stop resume would bin a parked round. The snapshot now carries the live round progress
    (`RunSnapshot.stopHoleIndex` + `stopPlayed`, captured in `persist`/`toTitle` from `state.play`/
    `stopPlayed`, save **v29**); the reducer's `resume` restores the scorecard + tees up that hole (screen
    `playing`, no lore gate) so you continue where you left off. `holeRng` reseeds fresh — a records chase
    isn't determinism-guarded, so resumed holes just draw a new dispersion stream, no played score re-rolls.
    STROKEPLAY-only (the fields are absent on every other format → byte-for-byte the old restart resume).
  - Character select fits ONE mobile screen with NO scroll (GS-select-onescreen): the roster is a
    self-contained `.gs-select` flex column inside a viewport-LOCKED page frame (`.gs-main--fit` →
    `height:100dvh;overflow:hidden` on phones, app.ts `fit` flag). The header + difficulty pills sit at
    natural height and the `.gs-charwrap` grid (`repeat(2,1fr)` phones / `repeat(4,1fr)` desktop,
    `grid-auto-rows:1fr`) FILLS the rest — so adding future golfers REFLOWS into more rows that share
    the height, never off-screen (no per-count redesign). Each card is a flex column whose ONE soft
    region is the unlocked-clubs strip (`.gs-charcard-unlocks`): it flex-GROWS to fill spare height and
    is the ONLY thing that clips on a short card — portrait/stats/hint never clip. On PHONES the footer
    CTA (`.gs-charcard-cta`) is HIDDEN (`display:none`) — the whole card is the button (an `aria-label`
    carries the action) — because it sat over the club chips and read as a scrollable footer that
    instead selected the golfer; desktop keeps the CTA. No mask-fade (a bottom fade reads as
    "scrollable"). The two difficulty pills share one row on phones (`flex:1` in `.gs-diffrow`, value
    truncates). Guarded by a browser no-scroll assertion + `?screen=character` deep-link in
    `tests/build.test.ts`. Ascension is picked WITH the golfer, never on the title, defaulting to your
    LAST pick
    (`Settings.lastAscension`). Difficulty is TWO native-select DROPDOWN pills on one compact row
    (GS-diffpills, `.gs-selpill` / `[data-selasc]` + `[data-selclubset]`): ⚔ Ascension (voyage, when
    tiers are unlocked) + 🎒 Club set / bag — the club-set pill shows on EVERY mode now (only when a
    better-than-common bag is owned) so a per-run bag downgrade is one tap from any format. The pills
    are view state (reducer-clamped); the club-set pick overrides + write-throughs only when CHANGED.
    Each VOYAGE card's club-UNLOCK badge names that golfer's OWN easiest unlock tier (GS-ascension-clubs
    display, off `maxAscensionByCharacter`): the mechanic (`runEndUpdates`) grants a club on a win at
    Ascension `>= maxAscensionByCharacter[id]`, so the LOWEST uncleared tier `A{cleared}` is the easiest
    unlock — and the badge ALWAYS names `A{cleared}` (INDEPENDENT per golfer; they read "all over the
    place" by design). NOT the globally-selected difficulty (the fixed bug: it printed `A{sel}`, telling
    you to grind A8 when this golfer unlocks at A1). The selected difficulty only tints it: 🔓 green "Win
    A{cleared} → new club" when `sel ≥ cleared` (a win at your current pick unlocks), 🔒 "Next club: win
    A{cleared}" when `sel < cleared` (raise the difficulty), ★ "Bag complete" when full. The whole card
    is the button. GS-select-layout.
  - The stop intro is TWO mobile steps on one reducer screen (`'intro'` + view state `introStage`);
    `introShared()` derives world/notes/objective ONCE so the steps never drift. Past stop 0 EVERY
    format opens on the `'hole'` step (map + Tee Off), so a route jump lands one tap from teeing off
    instead of on a briefing/leaderboard the player just saw (GS-intro-endless for the Unending
    Universe, GS-intro-voyage for the Voyage); the briefing stays one `‹ Briefing` tap away. Stop 0
    (from character select) keeps the `'arc'` step — it's the mode lobby with `Change golfer`. STAR /
    STORY TOUR (strokeplay) SKIPS the arc entirely (GS-story-tour): a records chase / campaign round has
    NO "Change golfer" lobby (on the Story path it pointed at the wrong roster — you've already committed
    to your champion + course on the star map), so every strokeplay launch (`pickStarTourCourse` /
    `storyPlayWorld` / `playStoryQuest` / `storyStartQuest` / `storyPlayTournament`) opens straight on the
    `'hole'` step with NO back-to-arc button. The entry sub-step is chosen by the shared `introEntryStage`
    (used by BOTH the live dispatch entry and the `?screen=strokeintro` deep-link so they never disagree);
    guarded by a `tests/build.test.ts` browser smoke (hole step + Tee Off, no arc chrome).
  - The post-stop recap (`resultScreen`) is a pure render off `state` — rarity-framed panel, stat
    tiles, clickable hole-by-hole strip.
  - The title is a hero wordmark + THREE GAME tiles (GS-star-tour) reusing the doorway component
    (`.gs-navtile--game`; whole tile = the button, distinct only via the `--mc` accent — never
    regrow badges/launch bars/progress text) in a 3-across row (`.gs-navtiles--games`), over the two
    Trade-Market/Clubhouse doorways (2-up `.gs-navtiles`). Voyage + Unending are auto-listed from
    `FORMATS`; Star Tour is a BESPOKE tile (`openStarTour`, not the generic `start`) because it opens
    its own course-picker star map first — so `strokeplay` is EXCLUDED from the auto-list.
  - STAR TOUR star map (GS-star-tour / GS-star-tour-2, `app/starTourScreens.ts` + `render/starTourMap.ts`):
    a full-bleed, free-roam celestial chart — every course plotted at its constellation's real J2000 sky
    position (`THEME_SKY`) over a deep-space backdrop (seeded nebula washes + a Milky-Way band + tinted/
    hero stars, all mulberry32-seeded, never Math.random). The viewport is `touch-action:none` and drives
    BOTH gestures itself (`wireStarTourGestures`): one finger PANS (scroll), two fingers PINCH-ZOOM about
    their midpoint (`starTourView.zoom`, the SVG's px width/height scale while the viewBox stays fixed, so
    ship/world chart-coords are unchanged — only scroll conversions multiply by zoom; ⌘/Ctrl+wheel zooms on
    desktop). This SUPERSEDED the old native-scroll `wireStarTourDrag`, whose second finger jittered into
    the drag handler (the pinch "flicker jump" bug, no zoom at all). A moved drag/pinch sets
    `starTourDragged` so the trailing click doesn't fly; the tap handler must NOT `setPointerCapture` (it
    retargets the click off the world `<g>`, degrading every world-tap to a free flight). CHARACTER SELECT
    COMES FIRST
    (GS-star-tour-2): `openStarTour` opens the roster, `selectCharacter` (strokeplay branch) then lands on
    the map, so the run carries the golfer and the map flies THEIR cosmetic ship (`shipForCharacter` →
    `shipSVG`). You FLY the ship: a TAP orients + cruises it there (an app-layer rAF loop in `stepStarTour`
    moving `starTourView.shipX/Y/heading`, chase-cam following, scroll preserved across renders via
    `starTourView.scrollX/Y`). The chase-cam eases the scroll to keep the ship centred while
    `starTourView.following` is set — armed by any fly*, cleared the instant the player takes manual control
    (pan/pinch/wheel) — NOT the per-frame `cruising` flag (GS-star-map-jerky-movement): gating on `cruising`
    hard-FROZE the map off-centre the moment a hop reached its target, so rapid "tap to keep moving" taps
    stuttered freeze→lurch between hops. Following keeps the ease running across those gaps (converging to a
    no-op once the ship is idle+centred, so it never fights a resting/panned view). The ship art faces +x, so heading = `atan2(dy,dx)` (0 = flying right) —
    NOT the old `atan2(dx,−dy)` 0=up heading fed into a right-facing hull, which rendered a downward flight
    upside-down. A LEFTWARD flight mirrors the hull vertically (`starTourView.flip` = −1, decided at launch
    off the target side, held for the whole flight so it never snaps mid-cruise) so a wheeled/keeled craft
    keeps its top up; docked heading is nose-UP (`SHIP_DOCK_HEADING` = −90). FLIGHT ORIENTATION IS PER-SHIP
    (GS-ship-fly-orient, `ShipLook.fly`): the nose-along-heading rule above is `'nose'` (the default — every
    car/cruiser has a front + tail exhaust). A nose-LESS HOVER craft (`'hover'` — the flying-saucer Little
    Green Caddie + the Mothership, and any future disc/orb ship that isn't a vehicle shape) must NOT rotate to
    the heading — that tumbled the disc and swung its downward under-beam out the side ("flames out the side,
    moving sideways"). Instead the `#gs-st-ship` group carries POSITION only and splits into two oriented
    children: `#gs-st-body` (the hull — NOSE → `rotate(heading) scale(1 flip)`; HOVER → stays UPRIGHT and only
    `hoverBank(heading)` = `HOVER_BANK_MAX·cos(heading)`, a gentle lean into travel that never tumbles) and
    `#gs-st-thrust-orient` (the plume — ALWAYS `rotate(heading)` so it streams BEHIND the hull whatever the
    body does). Both `shipGroup` (initial paint) AND the app's per-frame `stepStarTour` write the same split
    (branch on `starTourShipHovers()`); a new hover ship is just `fly: 'hover'` on its row. A hover craft
    also gets a BESPOKE PROPULSION (GS-ship-hover-prop, `hoverThrust`) instead of the car jet: a downward
    ANTI-GRAV REPULSOR (pulse rings rippling down-and-out + a plasma pad hugging the disc base + a flickering
    ion column + falling charge motes, coloured off the ship's flame/accent) drawn UNDER the hull in the
    body-local frame (so it banks with the disc + always points down, never a sideways tail flame); its
    `#gs-st-thrust-orient` jet group is left EMPTY. Wears `.gs-st-thrust` so the `.gs-st-thrusting` cruise
    fade powers it up (docked = the disc rests on its pad) + `.gs-st-hoverprop` as the marker. An engine PLUME
    (`thrustTrail`, trailing off the tail, coloured off the ship's flame/accent) fades in via a
    `.gs-st-thrusting` class the rAF loop toggles while cruising, so the ship reads as flying, not sliding.
    FLIGHT SPEED
    (GS-star-tour-map-improvements) is a near-CONSTANT flat cruise (`STAR_TOUR_BASE_STEP` 5.25 × the flown
    ship's RARITY via `starTourShipSpeedMult` — common .9 / rare 1 / epic 1.1 / legendary 1.2 / mythic 1.3),
    NOT the old `d*0.14` that rocketed distant hops off way too fast; only a haul with more than
    `STAR_TOUR_LONG_HAUL` (750) chart units still to go earns a gentle acceleration (`*0.0375`) on top, so
    short/medium flights stay deliberate on the small map. Base + accel were both dialled down 25% (7→5.25,
    .05→.0375) for a calmer, more readable cruise — the reduction rides EVERY rarity uniformly (the mult is
    applied on top). Tapping a WORLD flies to it
    and OPENS its DOSSIER on arrival (flavour, tier,
    record, WEATHER picker, Fly-here-&-play → `pickStarTourCourse` pins the course on the golfer's run →
    `intro`). Ship starts docked at the clubhouse `SPACEPORT` (the view opens centred there, slightly more
    zoomed OUT than intrinsic — `ST_OPEN_ZOOM`). The SPACEPORT is the map's way OUT (GS-star-tour-port): it's
    a TAPPABLE station (`data-startour-port`, drawn as a proper docking port with gantries/pads + a "DOCK ·
    CLUBHOUSE" hint) — flying home to it DOCKS the ship (`flyStarTourToPort` → `dockingAtPort`, arrival
    dispatches `openClubhouseHall`) and opens the Clubhouse; the Clubhouse hall's "🚀 Depart to Star Tour"
    button (`openStarTour`, now reachable from `clubhouseHall`) flies you back out — the spaceport ↔ clubhouse
    loop. The cockpit HUD REUSES the journey bridge HUD
    (GS-star-tour-hud, `stHud`): the star map renders a `.gs-bhud gs-bhud--st gs-bhud--<variant>` frame
    piped `hudThemeForShip`/`hudThemeVars` + `hudChromeFor`, so it recolours to the flown ship AND inherits
    the identical fleet ornaments (title plate = ship name, rails, nodes, wings, deck) — a themed bridge is
    a table row (`render/hudTheme.ts`), never a Star-Tour edit. The `.gs-bhud--st` context modifier swaps
    the travel controls for Star Tour's own. Star Tour has NO bank/run, so the CONSOLE (GS-star-tour-fuel)
    carries NO exit switch and NO big golfer name plate (they crowded/obscured the dashboard): the RECORDS
    board is baked into the top-left "✦ STAR TOUR · 🏆 n/N" id-pod LINK (`data-startour-records`, toggles
    the board), and the bottom console is the ship's DASHBOARD — a compact pilot-swap DOT (left slot,
    `openStarTour` → change golfer; a recap "Star map" KEEPS the golfer), the themed instrument DECK
    (widened to the focus now the centre is compact), a NORMAL/FAST SPEED control in the focal CENTRE slot
    (`data-startour-speed`, a throttle reading `--hud-*` so each ship's control is its livery colour), and
    the live FUEL gauge RIGHT. Leaving the map is the settings-cog "Return to title". Star-Tour CONTENT
    keeps the `.gs-sthud__` prefix; the FRAME/theme/ornaments are the shared `.gs-bhud` (this SUPERSEDED the
    old standalone cyan `.gs-sthud` chrome). The class-collision guard is
    unchanged: never `.gs-hud` (the play screen's), which the `tests/build.test.ts` play-HUD test proves.
    `intro` is Star-Tour-branched (objective/field, Watch
    hidden so a record is EARNED); the round resolves to `strokeResult` (`app/strokeResultScreens.ts`).
    The in-round HUD shows STROKE scoring (running to-par + gross), not the Stableford-vs-cut chip.
    Reducer: `openStarTour`/`pickStarTourCourse`/`exitStarTour` + `resolveStrokePlay` (banks the record
    like Asgard resolves its tournament). Deep-linkable via `?screen=startour`/`?screen=strokeresult`
    (GS-screen-deeplink, real reducer transitions); guarded by `tests/startour-flow.test.ts` +
    `tests/build.test.ts` browser smoke. Star Tour never consumes the parked Voyage/Unending resume.
    NO run economy: Star Tour is a records chase with no credits/handicap/stop/distance/scoring-fuel — so
    `header()` (the between-hole recap) is `STROKEPLAY_FORMAT`-branched to show the course + running to-par
    instead of the voyage stat rail, and the recap board shows `strokePlayProgressHTML` (running scorecard),
    never the ghost competitor leaderboard. The star map's own FUEL (GS-star-tour-fuel) is a pure MAP-
    EXPLORATION feel mechanic, NOT run economy: it lives ONLY in `starTourView` (app layer — never the sim,
    a save, or the round), so records stay comparable. Flying burns fuel by DISTANCE (so the target holds
    regardless of speed): FAST cruises +25% and burns 1.5× the fuel/distance of NORMAL, sized so a FAST
    cruise empties over 3/4 of the chart width (NORMAL lasts 1.5× further). Coming to REST at any station (a
    world / Earth / the spaceport, within `ST_REFUEL_STATION_R`) tops the tank to full; draining it in deep
    space stalls the ship and flies in a space TANKER (`#gs-st-fueltruck` + hose, an rAF state machine in
    `stepStarTour`) that hoses it up and departs, then the interrupted flight resumes. All app-layer/render
    (no reducer/save/rng, no `_gs*`/URL hook → no test-hub wiring). Re-shoot `scripts/startour-preview.mjs`. The Daily button is parked off the title for now. SHIP WEAPONS
    (GS-star-tour-weapons, `render/shipWeapons.ts`) — the console FIRE button (`data-startour-fire`) spits a
    THEMATICALLY-MATCHED projectile from the ship's nose along its heading: a scatter-gun of golf-ball buckshot
    (wagon), a railgun slug (racer), an abduction RAY (saucer), ice shards (comet), rockets (hauler), a plasma
    death-orb (mothership), twin neon lasers (bike), a forked LIGHTNING/Bifröst cannon (chopper/Pegasus), an
    aurora BLACK-HOLE nova (Infinity Ace), a phoenix fireball (Firebird). The gun is a `WEAPON_BY_KIND` row
    keyed by `look.kind` (a new ship inherits a fitting gun, no engine edit); projectiles are authored facing
    +x and driven by `stepStarTour`'s rAF loop into a `#gs-st-shots` SVG layer (the fuel-tanker/thrust
    pattern) — pure geometry + SMIL, ZERO rng. Magazine = `WEAPON_AMMO_CAP` (2) charges on `starTourView.ammo`,
    spent per fire, RELOADED wherever the tank refuels (any station arrival + the tanker top-up). Firing NEVER
    calls `render()` (that rebuilds the chart + wipes live shots) — it appends shot `<g>`s + ticks the ammo
    pips in place, exactly like the fuel gauge. All app-layer/render feel (no reducer/save/rng, no `_gs*`/URL
    hook → no test-hub wiring); guarded by `tests/ship-weapons.test.ts` (weapon/style coverage) +
    `tests/build.test.ts` (browser: fire spawns a shot + spends a charge). The star-map CONSOLE lays its five
    controls (pilot · deck · speed · fire · fuel) out IN-FLOW (flex, own space each) — NOT the travel console's
    absolute-floated deck, which the fire button crowded. DESTINATION ICONS
    (GS-star-tour-destinations → GS-star-map-icon-consistency, `render/starTourMap.ts`) — the star map is a
    DIFFERENT interface from the journey map: a course is the PLACE it's named for, not a biome skin, so
    EVERY destination is its own luminous celestial object that EMITS into the star field via `softGlow`
    (no hard tier ring, no dark halo bubble, no emoji sticker — those read as tokens on black). Each place
    is BESPOKE, in-sync, and UNIQUE from same-biome siblings via a `SIGNATURE[themeId]` row (`{kind, size,
    motif?, ring?, star?}`; fallback `signatureFor` infers off name+archetype). Three levers: (1) a
    per-destination PALETTE — a deliberate `TINT_OVERRIDE` (Orion's blue forge vs Scorpius' red, Hydra's
    toxic acid, Leo/Vela golds, Antlia/Pyxis greys) else a seeded HSL shift on the archetype base, so two
    same-biome courses never share a colour; (2) a celestial KIND, one bespoke renderer each — `galaxy`
    (grand spiral + black-hole heart, drawn LARGE so the Sagittarius Core never reads smaller than a
    planet), `rift` (torn luminous crack), `wreck` (broken starship), `ringNebula` (Lyra = the green Ring
    Nebula M57 smoke-ring), `dumbbell` (Vulpecula = the bi-lobed M27, so it's NOT a Lyra clone), `star`
    (a TAMED sun — glow restrained so no icon overpowers — flavoured `forge` [blue + Orion's Belt] or
    `sting` [red Antares + a curved stinger tail of stars]), `crown` (Corona Borealis = a jewelled arc-
    tiara), `crystal` (a three-point wedge, for Triangulum), `maelstrom` (Draco = a dense multi-arm vortex
    with a dark eye, the finished storm), `binary` (Gemini = twin icy worlds), `serpent` (Hydra = a toxic
    many-headed water-serpent coiled in acid haze), or `planet`; and (3) a per-world planet MOTIF that
    individuates the shared planet body — `mane` (Leo's golden lion mane), `companion` (Centaurus + bright
    Alpha Centauri), `whale` (Cetus breaching the star-sea), `river` (Eridanus' star-stream), `dune`
    (Vela's sail-wisp + dune bands), `scrap` (Antlia's junk belt + antenna, corroded), `foundry` (Pyxis'
    molten seams + compass needle), plus `ring` styles (ice/ocean/metal). BIGGER CANVAS (GS-star-map-
    bigger-canvas): the constellations project into a centred CONTENT box (`CONTENT_W` 2240 × `CONTENT_H`
    1456 — the old chart size, so every J2000 position is byte-for-byte where it was) wrapped in a starry
    `PAD` (`CHART_W`/`CHART_H` = content + pad; `projectSky`/`SPACEPORT_POS`/`EARTH_POS` all offset by the
    pad so the whole cluster just TRANSLATES — flight/tap/dock/fuel math unchanged), so open starry space
    surrounds the worlds to fly out into. Starfield/nebula/grid density scale with the larger area. Because
    a portrait phone zoomed all the way out still letterboxes a landscape/square chart (contain-fit), the
    `.gs-st-space` deep-space CSS backdrop (matching gradient + faint tiled stars, on BOTH `.gs-startour`
    and its viewport) fills those margins so the WHOLE screen reads as continuous starry space, never black
    bands. `EARTH_POS` plots a recognisable blue-marble HOME beside the
    `SPACEPORT`. Tier is a small luminous BEACON dot (top-left), not a ring. Everything is `mulberry32`-
    seeded off the world id (per-world clip ids via `idSafe`) — pure + byte-stable (the map has its OWN
    seeded stream, not the sim rng). Eyeball via `scripts/startour-preview.mjs`.
  - HIDDEN YGGDRASIL (GS-star-tour-yggdrasil, `render/starTourMap.ts` `yggdrasilGlyph`/`YGGDRASIL_REALMS`
    + `starTourScreens.ts` `yggdrasilSheet`): the World Tree, drawn on the chart (`YGGDRASIL_POS`, high in the
    open PAD above the constellations) ONLY once Thor's Hammer is owned (`showYggdrasil` gate → `ownedApparel`
    includes `thors-hammer`; a Hammerless chart is byte-for-byte unchanged). A tappable object
    (`data-startour-yggdrasil`) — flying to it (a fuel STATION when armed) opens the NINE REALMS overlay
    (`starTourView.yggdrasilOpen`). The realms are a `YGGDRASIL_REALMS` TABLE hung as glowing fruit on the
    tree; ASGARD (the crown, lit gold) is the ONLY `playable` one today, the other eight are BARE dashed
    sockets — placeholder rows so **a new realm is a data flip** (`playable:true` + a launcher), never a
    glyph edit. Tapping Asgard dispatches `playYggdrasilRealm` → a STANDALONE Asgard tournament
    (`startAsgardRun`, the `crossBifrost` machinery) with NO suspended journey: `asgardFromStarTour` marks it
    so `leaveAsgard` rebuilds a fresh strokeplay run and returns to the star MAP (not travel). Reducer-gated
    HARD on the Hammer + `realmId==='asgard'` (both mismatches are no-ops), so it can't fire early or on an
    unbloomed branch. App-layer/render + a reducer flow — no `_gs*`/URL hook (no test-hub wiring), no save
    bump (`asgardFromStarTour` is transient). Guarded by `tests/startour-flow.test.ts`.
  - **`app.ts` is still the hottest file (~2,200 lines: play screen + wiring) — prefer extending a
    `src/app/` module over growing it, and re-read the relevant span before editing.**
- **Intro cinematic** — `docs/decisions/ui-intro.md`. Cosmetic Canvas2D, not in the reducer;
  degrades safely (every frame in try/catch → `finish()`); the many-instance glow uses a cached
  sprite, never per-element `shadowBlur`. The real title boots first, the intro overlays it.


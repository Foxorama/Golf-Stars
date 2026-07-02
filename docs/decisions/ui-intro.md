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
  `.gs-panel`, `.gs-modetile`/`.gs-modestart` (the title's game-mode hero tiles + accent launch
  buttons, GS-settings-nav — they replaced the old `.gs-format` panels), `.gs-chip`, `.gs-clickcard` (hover-lift shop/
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
- **Title mode tiles**: each format renders as a `.gs-modetile` hero card — gold + 🚀 for the
  winnable Voyage, violet + 🌌 for the Unending Universe — with a big accent `.gs-modestart` launch
  button ("Set sail — The Voyage" / "Tee off — Unending Universe"; the build test clicks the former
  by label). The Ascension ladder rides a chip row UNDER the big button (the button launches A0),
  still data-driven off `FORMATS` — a new format gets a tile for free.

## Title rework: hero wordmark, painted mode tiles, Ascension at golfer select (GS-title-2, 2026-07)
First-device feedback on GS-settings-nav reshaped the title:
- **Ascension moved OFF the title, onto character select.** On a veteran account the A1…A7 chip
  rows ballooned the Voyage tile (two rows of buttons under the launch button), and the difficulty
  is really a per-run, per-golfer decision — so it's picked WITH the golfer. `characterScreen` takes
  `opts.ascension = { max, sel }` and renders a `⚔ Difficulty` chip row (`[data-asc]`); the picked
  tier is app-layer VIEW state (`selAscension`, reset to 0 on every 'start' — never sticky across
  runs, never persisted) baked into every golfer card's `selectCharacter` action; the reducer clamps
  (`min(maxAscension, ascension)`) so a forged action can't start above the unlocked ladder. The
  unlock ladder itself stays ACCOUNT-wide (`maxAscension` — the bag-tier gates key off it); only the
  choice point is per-character. `start` still accepts an `ascension` (clamped) as the base the
  select screen overrides — kept for tests/back-compat.
- **The Daily Challenge button is PARKED (removed from the title), not deleted from the engine** —
  string seeds still work (`?seed=daily-YYYY-MM-DD` reproduces it); only the `dailySeed`/`dailyLabel`
  helpers went. Bring it back as its own surface when it earns a place.
- **Mode tiles joined the doorway-tile family but read as a distinct class.** Same visual language
  as the Market/Clubhouse tiles (a hand-placed, byte-stable painted SVG scene behind a bottom-scrim
  caption — `voyageTileArt()`: a dotted gold route arcing over three worlds to a pin flag, a ship
  mid-jump; `unendingTileArt()`: a violet star tunnel of receding rings with a golf ball streaking
  in), differentiated as GAMES by: full-width (nav tiles are 2-up), taller, accent border + glow
  (`--mc` gold/violet), a corner badge (★ CAMPAIGN · WINNABLE / ∞ ENDLESS SURVIVAL), and a fat
  `.gs-modetile__go` launch bar ("▶ Set sail" / "▶ Tee off" — the build test clicks "Set sail").
  The WHOLE tile is one `<button>` (no nested controls — Ascension left, the endless milestone strip
  shrank to a one-line `endlessTeaseHTML()` best + next-unlock tease; the full milestone trail's
  home is the Trade Market's earned gear). Still data-driven off `FORMATS` keyed on `winnable`.
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

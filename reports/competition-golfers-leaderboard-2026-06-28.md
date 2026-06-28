# Competition golfers, leaderboards & matchplay bosses — design & scope (GS-100)

The 100th-PR feature. Turn Golf Stars from "you vs a cut-line number" into "you vs a **field**":
a roster of 100–200 styled AI golfers who travel the galaxy with you, appear on a live leaderboard
with a tightening cut line, and — at the end of each arc — send their best player out onto the
course for a **matchplay duel**. Top golfers are constellation champions who dominate their home
zones. This doc scopes the full flow and the PR breakdown.

Status: **planned**, executing across PRs (see "PR breakdown"). This is the committed scoping
artefact the request asked for; update it as the truth shifts.

---

## 1. The core call: a statistical GHOST field, with one REAL boss

The single biggest decision. We have ~20 golfers competing per arc across ~20+ holes. There are two
ways to give them scores:

- **(A) Simulate real ball-physics for every golfer, every hole.** Faithful but absurd: 20×
  `playHole` per hole is slow, and a sprayed AI ball that finds the void/lava produces wild,
  hard-to-tune leaderboards. Nothing in the request needs the *whole field* to play real golf.
- **(B) A deterministic statistical ghost.** Each golfer has a skill + style profile; per hole their
  Stableford contribution is *drawn* from a seeded distribution shaped by their skill, the hole's
  difficulty, and a home-zone boost. Cheap, deterministic, tunable so constellation champions win
  their zones. This is how arcade golf games do leaderboards.

**We use (B) for the field, (A) for the boss.** The leaderboard is a ghost; but when you reach the
arc's matchplay boss, *that one golfer* is physically on the hole hitting **real** `executeShot`
shots (reusing the scramble machinery's "second golfer through the same rng" pattern). Best of both:
a cheap, lively field and a real, flavourful duel.

This keeps the pure-sim contract intact: ghost scoring is a new pure module; the boss reuses the
existing deterministic shot path.

---

## 2. The golfer roster (`src/sim/rpg/golfers.ts`)

### 2.1 Style, grounded in real golf

Research note — what actually makes golfers play *differently* (applied as data levers):

- **Ball flight shape:** draw (R→L) vs fade (L→R) vs straight; high/soft (carries, stops) vs low
  penetrating (wind-cheater, runs out). → `shapeBias` (hook/fade), `apexBias`, `rollBias`.
- **Driving:** bomber (long, wild) vs plotter (shorter, dead straight). → `power`, `accuracy`.
- **Scoring zones:** iron surgeon, wedge wizard, putting magician, sand saver, escape artist (Seve),
  flop specialist. → `irons`, `shortGame`, `putting`, `sand`, `recovery`.
- **Temperament:** aggressive go-for-it vs conservative fairways-and-greens; clutch/ice vs streaky
  vs choker-under-pressure. → `nerve` (raises variance & boss/cut performance), `aggression`.
- **Conditions:** links/wind specialist, fast-green reader, wet-weather grinder. → `wind`.
- **Tempo/era flavour:** smooth metronome, quick snappy, power athlete, wily veteran. → prose +
  `consistency` (tail width).

These collapse into a compact `GolferProfile` of 0–1 ratings the ghost-scorer and the boss-shot
builder both read, so a golfer plays the same way as a leaderboard number *and* as a boss on the
hole.

### 2.2 Two layers: archetypes × named golfers

Hand-authoring 200 distinct `clubMods` functions is insane. Instead:

- **`GOLFER_ARCHETYPES`** (~18 rows) — the mechanical/flavour templates: *Bomber, Plotter, Fader,
  Drawer, Iron Surgeon, Wedge Wizard, Putting Magician, Sand Saver, Escape Artist, Iceman (clutch),
  Streaky, Wind Master, Power Athlete, Metronome, Flop Artist, Grinder, Maverick, All-Rounder.* Each
  carries a base `GolferProfile`, prose flavour, a parametric boss shot-shape (a `clubMods`-style
  function derived from the profile), and a colour family for the avatar.
- **`GOLFERS`** (100–200 rows) — `{ id, name, archetypeId, home?, tier, look }`. Built from:
  - **28 constellation champions** (one per constellation theme), hand-named after the
    constellation/anchor star (e.g. *Acrux* for Crux, *Antares* for Scorpius, *Vega* for Lyra),
    `home` = that theme id, `homeArchetype` = the theme's archetype, top `tier`. These are the
    "top golfers, constellation-based" who dominate their zones.
  - **The 4 playable characters mirrored in** (Feather/Huang-Woo/Larry/Bo become competitors when
    not chosen, and can become bosses — request requirement).
  - **~70–160 field golfers** generated combinatorially from a curated names × nationalities ×
    archetypes pool with a seeded but *static* (committed, not runtime) builder, so the field is
    populated and varied without 200 hand rows. Names are checked unique at module-eval and in tests.

Every golfer resolves to a `GolferLook` (cap/shirt/skin/build — the existing `GolferStyle` shape) so
any golfer can be drawn as a boss avatar, and a `GolferProfile` (archetype base ± per-golfer jitter).

Helpers: `getGolfer(id)`, `golferProfile(id)`, `golferLook(id)`, `championFor(themeId)`,
`golfersForArchetype(a)`, `bossShotMods(id)` (the real `ShotMods` for boss play).

---

## 3. The competition field & ghost leaderboard (`src/sim/rpg/competition.ts`)

A new **pure** module. Nothing here touches DOM or `Math.random`.

- **`buildField(run, arcIndex): Field`** — deterministic 20-golfer field for an arc. Always includes
  the player (a sentinel id), the arc's constellation champions (so a champion can win & boss), the
  3 unchosen playable characters, and a seeded fill from the pool weighted toward golfers whose
  `homeArchetype` matches the arc's worlds. Seed = `${run.seed}:field:${arcIndex}` → no new save
  state (recomputable).
- **`ghostHoleStableford(golfer, hole, holeKey, homeBoost): number`** — a seeded per-hole Stableford
  draw (0–4+, centred by skill + hole par, widened by inverse-consistency, lifted by home-zone match
  and `nerve` on boss-adjacent holes). Pure, deterministic from `holeKey = ${stopSeed}:${holeIdx}`.
- **`standings(field, playerHoleScores, ghostHoleScores): Standing[]`** — cumulative arc Stableford,
  sorted, positioned; the player row uses their **real** scores, ghosts use ghost scores.
- **`cutSurvivors(standings, cut)` / cut-line plumbing** — reuses `effectiveCut`. The leaderboard
  shows: cumulative total (the race) + this-stop score + the cut line (survival threshold). Ghosts
  below the cut are struck out; the player below the cut ends the run (existing mechanic, unchanged).
- **`bossPick(standings, playerId): GolferId`** — the boss for the arc's final stop: the top AI on
  the cumulative leaderboard, or **#2 if the player is #1** (request rule).

Determinism is total: standings are a pure function of `(run.seed, arcIndex, played holes,
player's real per-hole scores)`. The player's real scores come from `run.history` (per stop) plus
the live `stopPlayed`/`play` for the in-progress stop.

---

## 4. Matchplay format & the boss on the hole

### 4.1 Format

- Extend `BossSpec` with `mode?: 'matchplay' | 'scramble'` (default solo). The voyage's arc bosses
  become **matchplay**. (Scramble is retained as data — it can still be selected for a boss for
  variety, and its machinery is the template for the second golfer.)
- The boss golfer for a stop = `bossPick(...)` resolved at the boss stop (not a fixed `BossSpec`
  name) — so *who* you face depends on the leaderboard, while `BossSpec` carries the tournament
  framing (name/blurb/cutBonus). Constellation home boosts make the zone's champion the usual boss.

### 4.2 The duel (`src/sim/rpg/match.ts` + round/play hooks)

Matchplay is **hole-by-hole win/loss**, not Stableford-vs-cut:

- Two balls tracked (player + boss), each with own lie. The boss hits **real** shots via
  `executeShot` with `bossShotMods(bossId)` (same rng stream, same pattern as scramble's partner).
- **Honour system for shot order:**
  - Tee shot: honour = winner of the previous hole (player has honour on hole 1, or by a coin
    keyed off the seed — deterministic).
  - After tee: the golfer **farthest from the pin** plays next; ties keep last order. This loops
    until both are holed/conceded.
- **Hole result:** fewer strokes wins the hole (+1 up / all square / −1). **Match ends** when one
  player is up by more holes than remain ("3 & 2"). A halved/decided match resolves the stop:
  winning the match = passing the stop; losing = run ends (the boss "cut").
- `playMatchHole` (auto) + an interactive driver share the boss/honour logic. Auto≡interactive holds
  for the boss's shots given the same player decisions (boss is AI in both; rng draw order fixed).

### 4.3 Render

- The boss stands on the hole with their own `GolferLook` avatar (reuse `drawGolfer`), addresses &
  swings when it's their turn, and their ball flies its own `ShotLog`. The play view already animates
  a `ShotLog[]`; we feed it the boss's shots interleaved by honour, tinted to distinguish them.
- A matchplay HUD: "2 UP · thru 5", whose honour it is, both distances to pin.

---

## 5. UI flow changes (`src/ui/game.ts`, `src/app.ts`)

- **Arc intro (`introScreen`):** on the first stop of an arc, add a **field card** — the 20
  competitors, their constellation/archetype tags, the pre-arc favourite (home champion). Small
  avatars + names; the player highlighted.
- **Result screen → leaderboard (`resultScreen`):** replace the stop-complete splash with a
  **leaderboard + cut line**: field sorted by cumulative arc total, this-stop score column, the cut
  line drawn across, eliminated golfers struck out, the player highlighted, made/missed-cut verdict,
  then Continue → shop. The scorecard stays available (collapsible / replay).
- **Live mini-leaderboard during play:** a compact standings chip on the play screen that updates
  *as each hole finishes* (the request's "when a hole is finished" — within a stop, not only at the
  end). Driven by ghost per-hole scores + the player's holes-so-far.
- **Boss stop:** a matchplay intro ("⚔ The Nebula Open — vs Acrux, the Crux champion") and the
  duel HUD on the play screen.
- **State:** `UiState` gains a derived `field`/`standings` (recomputed, not persisted beyond seed)
  and matchplay state for the in-progress duel. `RunSnapshot` needs at most the match state for a
  boss-stop resume (small, additive — bump save version if required, with a migration).

### 5.1 Per-mode differences

- **Voyage** (headline): full treatment — arcs, field of 20, leaderboard/cut on stops 1–2, matchplay
  boss on stop 3, constellation champions.
- **Flat (Roguelite, endless):** a rolling "season" — a field refreshed every 3 stops, leaderboard +
  cut each stop, and a periodic matchplay boss every 3rd stop (a soft arc over an endless run).
- **Ladder (The Ascent):** the field scales with the stop sizes (3→6→9→18); the 18 is the "final"
  with a matchplay boss. Leaderboard each rung.

Differences are localised to `buildField`/format glue, not the sim.

---

## 6. Balance & invariants (must re-prove)

- **No-death-spiral bars** (`toPar/hole < 1.0/1.15`, blow-ups < 5%): ghost scoring NEVER touches
  course generation or the player's shot sim, so the existing fairness/no-death-spiral validators are
  untouched for stroke-play stops. **Matchplay changes the player's stop sim** (alternate shots,
  match end) → re-run the bars for boss stops and tune `bossPick` strength so a duel is hard-but-fair
  (target: auto reach-AI wins a matchplay boss at a sane rate, interactive higher — like scramble's
  ~40% maxed).
- **Determinism / auto≡interactive:** the boss's real shots must consume rng in a fixed order; gate
  every boss/match draw behind "is this a matchplay stop" so a non-boss hole is byte-for-byte
  unchanged (the scramble contract). Guard with tests.
- **Save stability:** field/standings recompute from seed; only the in-flight match state needs
  persisting. Prefer a version bump + migration only if unavoidable.
- **Test-hub guard:** any new `window._gs*` hook or `?param` must be wired into the hub in the same
  PR (the I4 rule / `keep-test-hub-in-sync` skill). The competition is content/sim, so it should
  surface in the Sim Lab automatically — confirm, add a lab control only if a new hook appears.

---

## 7. PR breakdown (shipping order)

1. **PR 1 — Roster foundation.** This report + IDEAS entry + `golfers.ts` (archetypes + roster +
   helpers) + `tests/golfers.test.ts`. Pure data, no wiring. Safe, large, independently valuable.
2. **PR 2 — Ghost field & leaderboard engine.** `competition.ts` + `tests/competition.test.ts`
   (determinism, skill correlation, champion-wins-home, boss-pick rule, cut ramp). Pure sim, no UI.
3. **PR 3 — Leaderboard UI.** Arc-intro field card + result-screen leaderboard + live
   mini-leaderboard; `UiState`/reducer glue + `tests/ui.test.ts` additions. Voyage + flat + ladder
   leaderboards (no matchplay yet).
4. **PR 4 — Matchplay bosses on the hole.** `match.ts`, round/play hooks, boss avatar + real boss
   shots in the play view, voyage bosses → matchplay; `tests/match.test.ts`. Re-prove the bars.
5. **PR 5 — Per-mode integration, balance & polish.** Flat/ladder boss cadence, balance pass,
   gallery/eyes-on, test-hub sync, docs.

Each PR: branch → build → green CI → merge → sync. Going full-auto per the request; stop only if CI
is red/unresolved or a genuine design fork appears.

---

## 8. Open risks / things the request didn't spell out (decisions taken)

- **"When a hole is finished → leaderboard"** vs the current per-*stop* splash: done both — a live
  per-hole mini-leaderboard *and* the full leaderboard splash at stop end.
- **Matchplay vs the existing scramble bosses:** voyage bosses convert to matchplay; scramble stays
  in the codebase as an alternate boss mode (not deleted — it's the second-golfer template).
- **Boss identity is dynamic** (leaderboard-driven), `BossSpec` keeps the tournament framing.
- **Field size = 20/arc** (request: "20 golfers competing in that arc"); roster pool 100–200 so
  fields vary across arcs/runs.
- **Cut = existing `effectiveCut`**, reframed visually as a leaderboard line; ramps as today.
</content>
</invoke>

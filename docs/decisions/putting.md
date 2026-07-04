# Archived engineering log — putting

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Putting (manual pace-meter by default; auto ONLY via the Penelope Putter caddy)
- **Two putt models, one shared `PuttSkill`.** AUTO putting is the rng `onePutt` (make%/lag);
  `puttOut`/`puttOutFrom` step it; it's what the headless sim and `takeShot(…, autoPutt)` use.
  MANUAL putting is `manualPutt` — SKILL, not luck: the player controls PACE via an on-screen meter
  (`render/puttMeter.ts`, a Canvas2D side-effect like the play view), auto-aimed at the cup. Stop the
  sweeping marker inside the green MAKE band to drop it; too soft leaves it short, too firm runs past;
  a small distance-scaled lateral wobble (one rng draw) means long putts can lip out on good pace while
  short ones drop reliably. Constants `MANUAL_IDEAL_PACE`/`MANUAL_PACE_MAX`/`DEFAULT_MANUAL_BAND` are
  shared by the resolver and the meter so they agree. `takePutt(state, loadout, rng, control?)`:
  `control` (the pace) → `manualPutt`; no control → `onePutt` (the AI-finish path + tests),
  so auto stays byte-for-byte. The reducer `putt` action carries `control?: PuttControl`.
  GOTCHA (fixed): the meter's `commit()` MUST read `currentPace()` BEFORE setting `committed = true`
  — `currentPace` short-circuits to the (still-0) `frozenPace` once committed, so the old order struck
  every manual putt at pace 0 (ball never moved, stroke still counted).
- **Auto-putt is caddy-only — there is NO manual toggle.** Putting is manual UNLESS you hire the
  legendary **Penelope Putter** caddy (shop id still `auto-caddie` for save-compat; sets
  `loadout.autoPutt`), which auto-putts out on arrival. The old
  per-session `UiState.autoPutt` toggle + `toggleAutoPutt` action were removed: the `shot` reducer's
  auto gate is just `!!run.loadout.autoPutt`, so owning the caddie is the one and only "automate it"
  switch. (`» Auto-finish hole` on the decision screen still AI-plays the whole hole — that's a
  full-hole watch escape, not a putting mode.)
- **Putt from the fringe/apron (GS-fringe-putt).** Being just off the green on the apron (a `fairway`
  lie wrapping the green) used to force a full-swing chip from a few yards — a huge spray cone + a
  fiddly feathered pull (the "weird shot pull" complaint). Now `canPuttFringe(state)` (play.ts: a
  non-penalty `fairway`/`rough` lie within `FRINGE_PUTT_RANGE` 14yd of the pin) lets you take the
  flat-stick with the pace meter, and it's the DEFAULT there (`selPutt` UI flag, a one-tap ⛳/🏌 toggle
  to chip instead). `takePutt`'s guard is relaxed to accept a fringe lie (it still sets the rest lie to
  `green`). CRITICAL: interactive-ONLY — the auto sim only ever putts on `green` (and the auto-finish
  path gates on `awaitingPutt`, green-only), so auto≡interactive is byte-for-byte untouched; no new
  `_gs*` flag (`selPutt` is module UI state like `selClubId`). Tests: `tests/fringe-putt`.
- **Putting is upgradeable (`loadout.puttBoost`, 0 = base).** `puttSkillOf` derives make%/lag AND the
  manual make-band width from `puttBoost` + auto-caddie; a BASE loadout returns `{}` so auto/headless
  stay byte-for-byte. Shop perks **Pro Putting Grip** (stackable) + **Tour Putter** raise `puttBoost`;
  the meta upgrade **Putting Coach** bakes it into the starting loadout. `puttBoost` is rebuilt from
  perks/meta on resume, so NO save bump. `tests/manual-putt.test.ts` guards the pace model + that the
  upgrades widen the band and sink more putts; `tests/putting.test.ts` still guards the auto model.

## Putting DEPTH — distance matters, putters matter, hard greens break (GS-putt-depth)
The complaint: "there's no reason to take any putting upgrades or putters" and "the make window never
does anything." Both were true because the make band was a CONSTANT pace fraction regardless of putt
length — on a flat green a base putter already holed everything, so a wider band bought nothing you
could feel, and long putts were no harder than short ones. GS-putt-depth makes putting a genuine skill/
gear axis on three fronts, all interactive-only (the headless `onePutt` auto path is byte-for-byte
untouched — it never reads slope or range).

- **The make band SHRINKS with distance.** `puttBandDistanceFactor(d, range)` (round.ts) is `1` within
  the putter's confident `range`, then a smooth reciprocal taper to a floor (`PUTT_BAND_FLOOR`) beyond
  it. `manualPutt` scales its pace make-band by this factor; the on-screen meter (`app.ts` → `mountPuttMeter`)
  draws the SAME shrunk band, so the green window you aim at is exactly the one that drops the putt (contract
  5). A tap-in / short putt is factor 1 → **byte-for-byte the old flat band**, which is *why* every existing
  fixed-ideal-pace test (`manual-putt`, `putt-break`) still passes: those strike at `MANUAL_IDEAL_PACE` so
  `paceErr = 0 ≤` any positive band, shrunk or not. Only OFF-ideal paces feel the tighter window — i.e. real
  play. **Only the PACE window is distance-scaled;** the lateral `wobble` stays keyed to the putter's
  INHERENT `manualBand` (not the shrunk one), so lateral skill is a property of the flat-stick and the whole
  distance penalty lives in one place.
- **The putter's `puttRange` is the upgrade.** `puttSkillOf` returns `puttRange = DEFAULT_PUTT_RANGE +
  min(0.7, b)·12`, so every putter perk / Putting Coach / auto-caddie that raises `puttBoost` also reads +
  holes from further. A base loadout still returns `{}` (no `puttRange`) → the resolver falls back to
  `DEFAULT_PUTT_RANGE`, so nothing changes for a fresh bag beyond the universal distance taper. This is the
  concrete "reason to buy a putter": at 18 yd a legendary flat-stick keeps a wide band a base putter has
  long since lost.
- **The break READ has a length.** The dotted break curve is drawn bright/solid-dashed only out to the
  putter's confident range and fades to a faint wide-dashed "you're guessing" tail beyond, with a tick where
  the confidence ends (`RenderOptions.puttReadFrac`, holeView.ts; `frac = range/puttLen`). A green-reading
  **Mystic Mole** (`greenRead`) sees the WHOLE break → `frac = 1`, a clear visible caddy benefit. The HUD
  spells it out ("past Ny the read goes blind — a better putter reads further").
- **Harder stops tilt the greens more.** The green-slope magnitude multiplier floor rises with wildness:
  `slopeMag = greenSlopeMax · range(0.4 + 0.45·wildness, 1)`. A CALM stop (wildness ≈ 0) keeps the old
  `range(0.4, 1)` draw **byte-for-byte**; a wild stop biases steeper — a stiffer, breakier putt — but never
  past the biome's `greenSlopeMax` ceiling (so `green-slope.test` still holds) and drawn from the SIDE slope
  rng (terrain stream intact, every LAYOUT byte-identical). Steeper greens read with a FINER, denser fall-line
  arrow grid (`styleGreen`: `cols`/`rows`/`len` scale with `slope.mag`) — camera-proof, a fixed count off the
  deterministic magnitude. The auto sim only feels this through `walkRoll`'s green roll-out; the death-spiral
  and character-balance bars were re-run and hold (the manual-putt break itself never touches the auto path).
- **No new hook.** All tuning is round.ts module constants (the sim stays node-pure — no `window` read), so
  there is no `_gs*` flag / `?param` and the test-hub sync guard is unaffected. `tests/putt-depth.test.ts`
  guards the factor curve, the range-upgrade → more-long-makes claim, the within-range byte-equality, and the
  wildness → steeper-greens statistic.

## Putt FEEL fixes — the GS-putt-depth fallout (GS-putt-feel, PRs #247 + #248 merged)
Play-test feedback on the putting-depth build: "weird zoom things on the green", fall-line arrows "bold
and stretch all across the green", long putts "not makeable because you can't adjust the line far
enough", and adjusting the line "really slow and painful". TWO sessions fixed it in parallel — #247
(the GS-putt-depth author) and #248 — and the merge keeps the best of both. All render/UX, zero sim/rng
change (every seeded test byte-identical). The final state:

- **Fall-line arrows are PX-CAPPED, modest-but-legible.** The grid was sized purely off the green's
  PROJECTED span — prims live in SCREEN space, so at putt zoom (green ≈ 500px) the arrows were 100px+
  bold lines stretched across the whole green, centred on the green's CENTROID (which is why a short
  putt framed near the pin didn't show them — "no impact on sub-5yd putts"). #247 capped them at 3.4
  believing prims were course-yards — that's 3.4 PX: near-invisible at putt zoom and it shrank the
  classic map-zoom pair too. Merged tuning: `len = min(span·(0.3−steep·0.08), 30)`, gaps capped 26/38px,
  `sw 1.1`, alpha `0.3 + steep·0.12`, grid 2–3 × 1–2 (#247's smaller counts). The caps never bind at map
  zoom (classic look intact); at green zoom the grid reads as a compact fall-line marker. Count still
  fixed per mag (camera-proof); sizes reading the projection is fine — pure geometry, zero rng.
- **The zoom holds still and follows through.** Framing: `max(5.5, d·0.6 + 3 + min(14,|breakYd|)·0.6)` —
  #247's lower floor lets a tap-in actually zoom in; #248's break pad keeps a steep green's curved line
  in frame, keyed to `breakYd` (NOT the live aim) so the camera never moves while nudging. And the putt
  watch-cam now reuses the putt screen's exact framing (`puttViewRadius`, module state on the
  `decisionRadius` pattern, reset with it on hole change) — putt-only animations ran at a FIXED
  viewRadius 25, so every stroke popped the camera out and back (the "weird zoom things").
- **The aim clamp scales with the read.** The old hard ±12yd couldn't cancel a steep long putt's break —
  unmakeable BY UI. Merged: `puttAimMax = max(12, |ideal|·1.6 + 4)` (always comfortably past the ideal
  borrow; flat/short putts keep the old ±12), `puttAimStep = max(0.4, min(1, puttAimMax/14))` — the step
  stays ≤1yd so a single tap is precise against the cup's `HOLE_OUT_RADIUS` 1.2yd.
- **Aiming is fast, three ways.** (1) Consecutive quick taps the same way ACCELERATE up to ~5×
  (`puttAimStreak`, `performance.now` in the side-effect layer — #247); (2) ◄/► PRESS-AND-HOLD
  auto-repeats (330ms delay, 80ms ticks, 2× after ~1s; pointer-captured so a drifting finger keeps
  repeating; the click that ends a hold is swallowed — #248); (3) every nudge is SURGICAL —
  `puttAimRefresh` swaps the map `<svg>` (`outerHTML`, so the weather canvas over the same `.gs-bigmap`
  survives) and the `#puttaimlabel` span in place (`puttAimLabel` is split out of `puttAimRow` for
  this). The old handler called full `render()` per tap, which REMOUNTED the pace meter and reset its
  sweep — that, plus flat 0.4yd taps, was the "slow and painful".
- **Verified eyes-on**: `scripts/putt-preview.mjs` + `scripts/gallery.mjs` re-shot (arrows modest at
  putt zoom, map zoom unchanged), plus a real-browser drive (build → play to a green → tap/hold the
  aim → commit): label updates without a meter remount, hold moved the aim 5.6yd in 1.4s, no page
  errors. Zero sim/rng changes — the full 921-test suite is byte-identical-green.


## GS-ai-attack putt fix — putter perks now reach the headless putt-out (2026-07-04)

`playHole`'s auto putt-out called `puttOut(rng, ball, flag, budget)` with DEFAULT skill, while the
interactive green (`finishShot`/`takePutt`) used `puttSkillOf(loadout)` — so `puttBoost` perks and
the Auto-Caddie sank more putts interactively than the headless sim for the SAME run: a silent
auto ≢ interactive drift (unseen because the seeded parity tests never shop putters), and dead
weight for the auto-AI's shopping. `PlayHoleOptions.puttSkill` now threads the loadout's skill into
`playHole` (`playerHoleOpts` → `puttSkillOf(run.loadout)`; boss bags pass their tier putter's boost
too). A stock loadout yields `{}` — byte-for-byte the old stroke, so every seeded test is untouched.
Guarded by `tests/ai-attack.test.ts` (identity + boost-sinks-more).

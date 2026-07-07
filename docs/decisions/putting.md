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
  `puttAimRefresh` swaps ONLY the break-line overlay group (`#gs-putt-overlay`) via
  `renderPuttOverlaySVG`, plus the `#puttaimlabel` span in place (`puttAimLabel` is split out of
  `puttAimRow` for this). The old handler called full `render()` per tap, which REMOUNTED the pace
  meter and reset its sweep — that, plus flat 0.4yd taps, was the "slow and painful".
- **The nudge redraws the break line ONLY, never the scene (the putt-zoom-lag fix).** `puttAimRefresh`
  originally swapped the ENTIRE map `<svg>` (`outerHTML = buildPuttSvg(aim)`), which re-ran `buildScene`
  — flora, green contour art, Tanaka-lit isolines — and reparsed a huge SVG string on EVERY 80ms
  hold-repeat tick. Cheap on paper, brutal when the page is pinch-zoomed (each swap re-rasterises the
  zoomed SVG) and it starved the pace-meter rAF, so "putting is incredibly laggy" the moment you tap
  direction or putt. Fix: the break line lives in a stable-id `<g id="gs-putt-overlay">` (holeView),
  and the nudge swaps just that group. The framing is aim-INDEPENDENT (`puttMid`/`puttRadius`/`up` are
  fixed per putt), so `renderPuttOverlaySVG` rebuilds only the cheap focus projector (no scene `extra`)
  and re-projects the path — output is BYTE-IDENTICAL to the same group inside a full `renderHoleSVG`
  (asserted for both the terminus-dot and finish-ring cases). Fallback to the full swap if the group is
  somehow absent. Zero sim/rng changes; the full suite stays byte-identical-green.
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


## GS-green-contour — greens break in more than one direction (2026-07-04)

**The ask.** "More arrows" was the first wording, but the real want was more CURVE: greens that read
like real greens, with more than one angle of break, so the ball can curl left *then* right on one
putt. A single dominant `greenSlope` plane (GS-greens-3) can only ever break a putt one way.

**The model.** Each green now carries 1–2 contour LOBES (`Hole.greenContour`, `GreenLobe { c, r, h }`)
on top of the plane: a radial mound (`h > 0`) or hollow (`h < 0`) whose slope magnitude ramps
0 → |h| out to radius `r` (profile `u·e^((1−u²)/2)`, peak exactly at the flank) and fades smoothly
beyond, so the surface is continuous everywhere. `greenSlopeAt(p, slope, lobes)` (sim/round.ts) is
the ONE local field the putt resolver, the break-line preview, and the renderer's arrows all sample.

**Break = the integrated field.** `puttBreakProfile` accumulates the local sidehill component along
the stroke's travel with the late weighting `w(t) = t^0.8` — the derivative shape of the classic
`t^1.8` curl — normalised so a CONSTANT field lands exactly on the GS-greens-3 closed form at the
cup. `puttBreakYd` is the profile's last entry (the net); `puttPathPreview` draws the cumulative
profile, so a double-breaker's drawn line genuinely S-curves; `puttBreakBow` (max/min drift either
side, aim-independent) frames the putt camera and flags the "double-breaks" label. **No-lobes paths
keep the original closed forms byte-for-byte** — every pre-contour test is untouched.

**Scope guard — putting only.** `rollOut`'s green run-out still reads the dominant plane, NOT the
local field: folding lobes into approach roll would shift every seeded landing on a green and
re-open the balance harness for a putting-feel feature. The roll is a straight line anyway (the
roll-invariant), so the plane is the honest average. If lobes should ever brake/boost the roll,
that's a deliberate physics retune: re-run the no-death-spiral harness (contract 4).

**Generation.** Lobes draw from a dedicated side stream (`${seed}:contour:${holeIndex}` — the
pin/slope pattern), so terrain, pin and plane-slope draws are all byte-identical. A second lobe is
likelier on wilder stops (`bool(0.3 + 0.45·wildness)`); strength caps at the biome's
`greenSlopeMax` (`range(0.3, 0.75) · (0.55 + 0.45·wildness)`), footprint `0.45–0.85·greenR`, centre
inside `0.2–0.75·greenR`. Fairness rides the existing aim clamp (`puttAimMax` always reaches past
the ideal borrow) — no putt is UI-unmakeable. `GENERATOR_VERSION` 16.

**Render.** On a contoured green `styleGreen` swaps the single central chevron grid for a LOCAL
fall-line arrow FIELD: one downhill chevron per course-space grid cell (`step = max(6yd, span/5)`)
inside the green, sampling `greenSlopeAt` — arrows visibly fan around a mound exactly the way the
putt will curl. Camera-proof per the contract: grid + near-flat cut (`mag < 0.06`) read only
course-space/deterministic values; only px sizes read the projection, and they're capped
(`len ≤ 11px` — the GS-putt-feel lesson) so putt zoom stays subtle. Lobes also get a soft
crest-lit / hollow-shadowed circle. Plane-only holes render the classic GS-greens-3 look unchanged.

**UI.** The putt screen threads `greenContour` into ideal aim, net break, the drawn line, and frames
off the BOW (a double-breaker bows wider than its net); the read row says "double-breaks · nets
1.2yd right" when the curve bows > 0.35yd both sides — net-only would read as flat and lie.

Guarded by `tests/green-contour.test.ts` (field shape, closed-form back-compat, S-curve reality,
graphic≡physics at the finish, ideal-read holes with wobble stripped, generator emission + side
stream). Full suite byte-identical-green.


## GS-putt-read — the break line stops dead at the confident read + the read is shoppable (2026-07-05)

**The ask.** "There's a semi-transparent arrow that still goes to the hole and it should be removed —
only the short-range darker yellow arrow; shop upgrades etc. stretch out the more solid line."

**The render change (holeView.ts).** GS-putt-depth drew the confident prefix bright and then a faint
wide-dashed tail (opacity 0.32) tracing the REST of the break all the way to the cup, plus a half-faded
finish ring at the hole. That tail undermined the whole read mechanic: it was still the true break
curve, so a "blind" putt wasn't blind at all — you could aim off the ghost. Now the line simply STOPS:
the bright dashed prefix ends at a filled terminus dot (`r 2.6`, opacity 0.85) and the blind stretch
draws NOTHING; the open finish ring only appears on a FULL read (frac 1 — short putt, big putter, or
the Mystic Mole). Past your read you are genuinely guessing, which makes read range a stat you can SEE
grow. Pure render — zero sim/rng impact. Guarded in `tests/holeView.test.ts` (one break path, terminus
dot XOR finish ring, prefix length scales with frac).

**Green contours verified in.** GS-green-contour (generator v16) confirmed emitting 1–2 lobes per green
on its side stream, threaded through resolver/preview/arrows; `tests/green-contour.test.ts` green and
`scripts/putt-preview.mjs` re-shot — lobes + local fall-line fields + S-curving reads all visible.

**The shop-item pass (all putting gear re-audited against the stopping line).**
- Every `puttBoost` source (Pro Putting Grip .16 / Counterbalance Mallet .20 / Tour Putter .26 /
  Pinseeker .40 / talent-putt .18 / Putting Coach meta .08·lvl / bag-set putters .10–.22 / Mole's .32)
  already flows through `puttSkillOf` into `manualBand` + `puttRange`, and the putt screen reads that
  SAME range for the drawn line — so every putter upgrade now visibly stretches the solid line. ✓
- **Range cap raised 0.7 → 1.0** (`puttSkillOf`): the old cap meant a full putter stack (grip+mallet+
  tour = 0.62) hit the ceiling before the Pinseeker even landed — the legendary would have added ~0
  visible read. Now the full stack reaches the full +12y (range 18.5y). Manual-only (`onePutt` never
  reads `puttRange`), so auto/headless is untouched.
- **NEW common: Green-Reading Book** (70cr) — the putting axis started at rare, so early stops had no
  putt buy and the new line mechanic had no cheap hook. It adds `puttReadBonus` +4y (a NEW loadout
  field added flat onto `puttRange` — stretches the line AND holds the full make band deeper, one
  number shared by picture + resolver, contract 5) plus a small +0.05 `puttBoost` so the headless AI
  also gains (a power-up must raise Stableford — contract 4). Round-trips via its perk id
  (`loadoutFromPerks`), no save bump. `puttSkillOf`'s empty-fast-path gate now includes the read bonus;
  a read-only loadout returns base-equal make/lag values so auto behaviour is byte-identical.
- **Mystic Mole tagged `putting`** in ITEM_TAGS (was missing — green-themed stops never boosted him
  alongside the putters). Putter descs updated to sell the read stretch. Nothing removed: Penelope
  (auto-putt) bypasses the meter entirely, Mole (full read + aim) remains the read apex above the Book,
  and the four-putter ladder is distinct rung-by-rung — no redundancy introduced.

Catalogue growth shifts which items seeded shops draw (same rng COUNT — `weightedSample` draws one
float per pick regardless of pool), and the full 957-test suite stayed green, balance suites included.


## GS-green-contour-2 — the contours become real ground: physics + topo art (2026-07-05)

**The ask.** "Make the contoured greens fully sick — art styling and physics to match the contours —
and do the foundations well because we'll probably expand to contoured fairways later."

**The shared field (`sim/contour.ts`).** The lobe math moved out of `round.ts` into a deliberately
surface-AGNOSTIC module: `slopeFieldAt` (the old `greenSlopeAt` body — `round.ts` keeps the green-named
re-export so nothing downstream changed) plus the NEW `heightFieldAt`, the field's closed-form
POTENTIAL. Each lobe's height term is `h·r·e^((1−u²)/2)` — its radial derivative is exactly the lobe's
slope profile, so gradient(height) ≡ −slope by construction (machine-checked numerically). Height is
what unlocks the topo art; nothing in the module knows about greens, so a future contoured FAIRWAY is a
new `Hole` lobe field handed to the same two functions (see IDEAS GS-contour-fairways).

**Physics 1 — the roll reads the local ground.** This was the retune GS-green-contour explicitly
deferred: `rollOut`'s green `slopeRun` now samples `greenSlopeAt` at each integration step's midpoint
when the hole carries lobes — a ball rolling into a mound brakes climbing the near flank and runs out
down the far one, so the landform the rings draw is the ground the approach actually rolls on. Scope
kept tight on purpose: the roll stays a STRAIGHT line sampled per step (the deflection is putting-scale
texture), so the roll-invariant (`dist(rest, touchdown) === |roll|`) and the renderer's straight
run-out hold, and a plane-only hole reads back exactly the plane, byte-for-byte. Blast radius measured,
not guessed: the full 991-test suite ran with only TWO seeded-fixture shifts — the green-slope backspin
test (now asserts the strict <8yd climb on a lobe-stripped hole + a <12yd bound with contours live; a
local hollow can honestly carry a check a touch further) and the ui.test ace fixture (re-pinned seed
185 → 339). The death-spiral harnesses (biomes/characters) passed unchanged — contract 4 satisfied.

**Physics 2 — the watched putt curls.** `PuttLog` gains an optional `path`: `manualPutt` samples the
SAME `puttPathPreview` curve the aim screen draws, at the actually-struck aim/pace, then shears it
linearly so it finishes exactly at the resolved rest point — the wobble (and a make's drop) eases in
over the whole roll instead of teleporting at the end. The play view walks the path by ARC LENGTH with
the existing ease, and traces the guide line along it, so a double-breaker visibly S-bends into the cup
— the last place the graphic and the physics disagreed on a green. Auto `onePutt` fills no path → the
classic straight lerp, byte-for-byte, and old shot logs replay fine (the field is optional).

**Art — the green reads as sculpted terrain (`render/contour.ts` + `styleGreen`).**
- **Topo isolines:** `contourIsolines` marching-squares `heightFieldAt` over a course-space grid inside
  the green polygon, chains the segment soup by exact endpoint match (shared cell edges lerp to the
  identical float — always lower-index-node-first), smooths one Chaikin round, and culls sub-3yd
  specks. Levels are evenly spaced between the field's min/max INSIDE the polygon, count adapted to
  relief amplitude (3–7). Camera-proof by construction: grid, levels, chaining and smoothing read only
  course-space/deterministic values, and the whole pass is WeakMap-cached per hole with only the
  projection running per frame. Drawn as thin sw-1px rings clipped to the green so map zoom keeps
  them a whisper (the GS-putt-feel px lesson). **Rings are ELEVATION-CODED in the biome's own turf
  tones (the S+ colouring pass):** each `Isoline` carries its `frac` (0 = the lowest level, 1 = the
  highest), and `styleGreen` strokes rings above the surface's mid elevation LIGHT (the green
  Shade's `light` eased 0.88 toward white) and rings below DARK (`dark` eased toward shadow),
  intensity growing toward crest/valley — so which side of the green is HIGH reads at a glance in
  every world's palette. A flat white ring vanished on the pale frost/ice greens and glared on dark
  ones; deriving from the per-biome `Shade` makes the colouring biome-appropriate by construction,
  and the light side pushes harder than the dark (a pale ring on already-light turf washes out at
  the alpha where a dark ring already reads — the preview lesson). Void/cetus mute ×0.72 (the
  MOW_BLEND lesson; their luminous platforms verified untouched in the gallery). The frac↔geometry
  honesty is machine-checked: the highest ring hugs a mound's crest tightest, and on a pure plane
  the high rings sit exactly where the fall-line arrows point away from.
- **Relief:** the old flat lit/shadow circle per lobe became a directional GLOW PAIR under the shared
  upper-left sun (`LIGHT_UL`, the GS-inset light): a mound pools soft light on its up-light flank and
  shadow on the down-light one; a hollow is the exact inverse (shadowed near rim, lit far wall — the
  emboss rule). Ground, not stickers.
- **New prim:** `path` — an OPEN stroked polyline in both emitters (`<polyline>` / no-closePath
  canvas). A 'poly' with `fill:none` still CLOSES with a chord, which would slash straight across an
  open isoline — that's why the new prim exists. First user is the rings; anything drawing open curves
  should use it.

**Verified.** `tests/green-contour.test.ts` grew four blocks (height≡−∇, isoline shape/closure/
determinism, local-field roll behaviour + roll-invariant + plane byte-compat, curved-path contract);
full suite 991 green including camera-stability and the balance harnesses; `scripts/putt-preview.mjs`
re-shot (rings fan around the lobes exactly where the arrow field fans, relief reads as rolls, break
line unchanged) and `scripts/gallery.mjs` re-shot (map zoom: greens keep their identity, rings stay
subliminal). No new `_gs*` hook — all tuning is module constants, the test-hub guard is untouched.


## GS-green-contour-2 round 2 — the stain dies, the roll curls (2026-07-05)

Eyes-on feedback from a real device (frost world approach view): "I wouldn't call this S+ tier
contouring, and I can't really see any green roll with improved physics." Both fair — diagnosis
off the screenshot:

- The **GS-greens-3 plane shading** (two giant soft lit/shadow circles) read as a grey STAIN over
  the pale frost green — it dominated the surface, buried the topo rings, and its circular edge
  read as dirt, not ground.
- The green's **full-contrast mow stripe** fought every layer of relief art on top of it.
- The **arrow field** (span/5 grid ≈ 25 chevrons) read as scattered clutter.
- The roll physics was **invisible by construction**: a straight run-out whose only response to the
  ground is its LENGTH can't be seen reacting.

**Art fixes (all render-only, zero rng):**
- On a contoured green the circle pair is GONE (it survives only for legacy plane-only holes). The
  plane now shades as a stepped LINEAR gradient along the fall line — three stacked half-plane
  washes per side, cumulative alpha ramping light (high) → dark (low), clipped to the green.
  Stepped-not-smooth is the game's cel-shaded language and there is no circular edge to read as a
  blob. RULE: never re-add a big soft shading blob to a green.
- The green's stripe mutes to 0.26/0.18 mixes when contoured — turf texture, not value bands; the
  relief owns the value range now.
- Lobe glows tone down to accents (max ~0.15 alpha); rings step UP (sw 1.15, alphas ~+40%) since
  they carry the sculpt; the arrow grid thins to span/3.4 (a loose handful, alpha down a notch).

**Physics fix — the run-out CURLS (the headline):** `rollOut` on a contoured hole now runs a
curling integrator: each green step bends the live travel direction toward the local fall line's
perpendicular component (`ROLL_CURL_K` 0.06/yd — tuned to the putt-break scale, ~1.5–2yd of drift
across a 12yd roll on a 0.4 side slope, so an approach and a putt read the same ground the same
way). `roll` becomes the ARC length; the curved travel returns as `path` and rides
`ShotLog.rollPath`, which the play view walks by arc length (the putt-path treatment) — the ball
visibly breaks off a mound's flank on screen. Off-green steps never bend; a lobe-less hole (old
saves, synthetic test lanes, plane-only greens) takes the ORIGINAL straight integrator byte-for-
byte, preserving the classic roll-invariant exactly where it used to hold. On contoured holes the
invariant relaxes to path-consistency: `dist(rest, touchdown) ≤ |roll|`, bounded below at 0.8·|roll|
(a break, not an orbit) — `tests/green-slope.test.ts` + `tests/green-contour.test.ts` assert both,
plus curl DIRECTION (a side-slope roll drifts downhill) and the fairway-never-bends rule.

Blast radius: full suite 992 green with ONE fixture re-pin (the ui.test ace seed, 339 → 471 — the
third re-pin of this feature family; the death-spiral harnesses passed unchanged). Previews
re-shot: putt zoom reads as a clean yardage-book green (gradient + rings + sparse arrows, no
stain); gallery map zoom and void/cetus untouched.


## GS-green-contour-3 — the landing feels the landform, the art becomes a relief map (2026-07-06)

Review ask: "green roll / ball landing physics could be drastically improved, and the contoured
layering + aesthetic colouration + biome matching massively improved." Reviewed off fresh preview
shots (pro-gamer / UX / artist lenses); the findings and what shipped:

**Physics 1 — the FIRST BOUNCE reads the landform.** Before, a ball dropped into an upslope face
and one dropped onto a downslope flank bounced identically — slope only ever changed the
subsequent roll length, so the landform was never *felt* at touchdown. Now `rollOut`'s curling
branch (contoured greens only — every lobe-less hole is byte-identical) scales the roll energy by
the touchdown slope's along-travel component (`LAND_KICK_K` 0.55, clamped 0.45–1.6: into a face →
the skip dies; onto a downslope flank → it kicks on) and deflects the initial travel toward the
fall line (`LAND_DEFLECT_K` 0.5). Deterministic, zero rng — the stream is untouched.

**Physics 2 — gravity CREEP: balls cannot rest on a steep piece of the sculpt.** The art said
"this bank sheds balls" while the sim let them stop mid-flank — the last graphic≠physics gap on a
green. Once the roll energy is spent (never after an obstacle stop — sand/woods/tents/penalties
hold their ball), the ball trickles down the **LOBE field only** (`greenSlopeAt(p, undefined,
lobes)`): the plane is the green's uniform tilt, which holds a ball exactly as before — creep is
the *sculpt* settling, so flanks shed and hollows gather, and a pure-plane contoured green is
undisturbed. Direction re-reads each step (it curls into hollows), `CREEP_MIN` 0.22 / `CREEP_STEP`
1yd / `CREEP_MAX` 5yd, and it **never leaves the green** (the collar catches it — a green-hit
stays a green-hit, which is what kept the balance harnesses untouched). The creep extends
`rollPath` and counts into the arc, so `roll` stays honest travel; the chord lower bound in the
old path-consistency tests relaxed (a flank-climber legitimately trickles back toward its
touchdown — orbit-guard now 0.3·|roll| on the fixed fixture, dropped on the randomized loop).
Blast radius measured: the FULL 992-test suite passed with ZERO fixture re-pins (the death-spiral
+ character-balance harnesses unchanged — contract 4).

**Art — the green reads as a lit relief map, in every biome's own palette.** Review findings: the
rings were uniform hairlines (invisible on pale frost), nothing shaded *between* rings, the plane
washes were fixed white/near-black rgba (greyed the pale palettes), and white fall-line arrows
vanished on frost/crystal. Now (`styleGreen` + `greenSlopeArt` + `render/contour.ts`):
- **TERRACES:** closed isolines carry `closed` + `hiInside` (centroid height vs level, course-space,
  cached) and fill as stacked elevation washes — dome caps lift toward the biome's light turf,
  hollow floors sink toward its dark; nesting rings stack alpha into real terraced steps. Fill
  order is projected-area-descending (the single uniform projector scale keeps that order stable
  under any camera).
- **ILLUMINATED ISOLINES (the Tanaka rule):** each ring splits into fixed spans
  (`ISO_CHUNK_SEGS` 7 — count reads only the cached course-space point count, camera-proof,
  machine-checked against two different projections) lit by the midpoint's aspect under the shared
  upper-left sun: sun-facing spans ease toward white and thin, shaded spans deepen and THICKEN —
  rings read as carved lips, not scratches. Lighting reads the projection (screen-space like every
  emboss); counts never do.
- **BIOME-DERIVED relief everywhere:** the stepped plane washes (now 4 per side), the lobe glow
  pair and the terrace fills all derive from the biome's green `Shade` (sink toward `s.dark`, lift
  toward `s.light`) — never neutral white/black (the "grey stain"/"washed frost" lesson).
  Void/cetus keep the ×0.72 mute.
- **CONTRAST-PICKED arrows:** the fall-line arrow ink reads the turf's relative luminance — pale
  greens (frost/crystal/ice, lum > 0.62) get dark ink arrows, dark greens keep near-white.
  White-on-white arrows were the review's first finding.

Guarded by `tests/green-contour.test.ts` (+4 blocks: landing kick, creep shed/gather/edge-catch +
plane-tilt-undisturbed, closed/hiInside coding, camera-proof chunk counts); putt-preview + gallery
re-shot (all ten worlds keep identity at map zoom; putt zoom shows the value ramp + lit rings).
`scripts/putt-preview.mjs` also gained the gallery's multi-candidate chromium launcher (it was
Linux-only). No new `_gs*` hook — all tuning is module constants.

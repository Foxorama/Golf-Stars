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

**Contour relief renders on EVERY biome (2026-07-07).** Play-test: "not all biomes got contour
overlays". The relief was gated on the fall-line ARROW field, which only emits for cells steeper than
0.06 — a gentle green on a low-`greenSlopeMax` world (frost/ocean at a calm stop) had zero arrows and
fell through to the flat legacy plane look. But every sculpted green has topo ISOLINES (the generator
gives each green ≥1 lobe on its own side stream; `contourIsolines` floors at 3 rings for any amplitude),
so `contoured` now gates on `slope.iso` instead of `slope.arrows`. The relief (terraces + Tanaka rings +
gradient) renders on all biomes; the chevron field still correctly stays OFF near-flat crests (it reads
the same 0.06 floor). Render-only, zero rng; full story in `render.md` (GS-chip-cone batch).


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


## GS-carry-rollout-split — a club's number is its TOTAL: fly, land, run (2026-07-20)

**The ask.** "We did a bug fix with clubs going long and the result is that the ball just sits and
stops now. For driver, woods, hybrids and irons, the total distance should be the same but as part of
that total distance the ball should land and run. Flight is the Carry and run is the Roll-out. Driver
should carry 80% and roll-out 20%; hybrid 85/15; irons 90/10. For it to feel like a golf game the ball
needs to fly, land and run, but the player needs to know total distance includes run so they don't keep
hitting it long or into hazards. We can then add shop items that improve the carry distance — so the
player has a choice of improving their carry to clear hazards or improving total distance but still
maybe landing in a hazard."

**The model shift.** Before this, a club's nominal `carry` WAS the flight/landing distance, and the
run-out (`clubRollFraction`, driver +18% → wedge 0) was ADDED on top — so the total finished *beyond*
the club's number, and the aim cone (which reads carry) told the player where the ball *landed*, not
where it *ended*. The player's mental model — "my driver is a 250 club" — is the TOTAL, so we invert:
the nominal number is the total, the ball flies a family fraction of it, and the run makes up the rest.

**Total-preserving by construction (why the balance held).** The naïve reading — "make the club number
the total and reduce flight to 80%" — would cut effective reach ~10-18% (today's total sits ~1.1× the
club number), a big nerf that would blow the death-spiral bars on the thin-headroom worlds. Instead we
anchor on the *pre-split* roll so where the ball FINISHES is unchanged and only the split moves:

- `flight.ts` grows a per-family `FlightProfile.carryFrac` (driver 0.80 / wood 0.82 / hybrid 0.85 /
  iron 0.90 / wedge 1.0 / putter 1.0).
- `flightScaleFor(profile, nominal) = carryFrac · (1 + legacyRollFraction(nominal))` scales the FLIGHT
  `intended` down in `resolveShot` + `shotSpread` (so the cone reads the reduced landing).
- `rollFractionFor(profile, nominal) = (1 − carryFrac) / carryFrac` is the run `rollPotential`
  releases (of the reduced carry).
- Because `flightScale · (1 + rollFrac) = 1 + legacyRollFraction` exactly, `carry + run` = the OLD
  total, mean-for-mean, on uniform ground. Endpoint preserved ⇒ GIR/Stableford preserved ⇒ the main
  death-spiral bars (characters/compose/biomes) stayed green with NO AI reach change. Flight drops only
  ~2% (iron) to ~6% (driver); the run becomes a clean 20/15/10% of the *unchanged* total. Wedge/putter
  (`carryFrac` 1) are byte-for-byte the backspin-optin land-and-hold behaviour — `rollFractionFor`
  falls back to `legacyRollFraction` there, and `flightScaleFor` returns 1.

**The physics roll cap.** The driver's bigger run (~53yd off its reduced flight vs the old ~40)
exceeded the old `MAX_ROLL` 42 clamp, which would have re-shortened the total. Split the constant: the
AUTO-AI's roll ALLOWANCE keeps `MAX_ROLL` 42 (unchanged targeting), the PHYSICS run cap becomes
`ROLL_ENERGY_CAP` 60 so a full drive's release isn't clipped.

**The one fairness-critical coupling.** REACH decisions (can I reach the green / this position) key off
TOTAL, which is preserved, so `maxReachOf`/`suggestClub`/`aiClub`/`attackTarget` are untouched. But a
forced CARRY must be cleared in the AIR — the run can't span water/lava/void. So the carry-aware AI now
keys those off FLIGHT reach: `maxFlightReachOf` (`clubDist · flightCarryScale`) feeds `carryTarget`, and
`longestCarryClub` scales each candidate's carry by `flightCarryScale`. The AI lays up when its reduced
flight can't span a hazard — a strictly safer decision (Stableford can only rise, contract 4).
`validateCrossings`/`validateFairness` are geometric and untouched (still green). `suggestPlayerClub`
(interactive green-coverage) now reasons about TOTAL (`expectedTotal`/`highTotal`) so it doesn't club up
into an overshoot off the reduced flight. Wind-compensation carry also reads the reduced flight.

**Deliberate difficulty (the one relaxed fence).** Shorter flight makes forced water/lava carries
genuinely harder — exactly the "you need enough CARRY to clear it" the ask wants, and the hook for
carry-boost shop items. The main bars absorbed it, but max-wildness **ice-ring** (frost, the hardest
forced-carry world) nudged from ~0.99 → ~1.06 toPar/hole. Per the GS-rough-gradient / GS-biome-variety
precedent, its death-spiral FENCE is relaxed (`< 1.12`) with a `TODO(GS-carry-rollout-split)` — never
the structural fairness contract, and never by softening the ponds. Re-tighten with a short-game /
carry-boost pass.

**Player-facing.** The run-out helper line (GS-runout-line) now draws the forward run whenever the ball
lands on SHORT GRASS (`RUNOUT_LIES` = fairway/green/tee), not only greens — so a drive shows its run
down the fairway and an approach its release onto the green (a ball into rough/sand draws no line — it
stops in the stuff, and a line into the hay is clutter). The shot HUD legend reads `carry X–Yy → Zy
total` so the number carries the run. The at-rest default-power seed already aims the carry short so
`carry + run ≈ pin` (now via the family-keyed `clubRollFraction(clubId, nominal)`).

**Contracts.** Determinism: byte-shifts (flight/roll changed for non-wedge clubs) are re-pinned — the
ace-ship fixture (seed 42 → 101), the flight-knockdown + spray-block grove fixtures (re-tuned for the
reduced arc), the two off-green driver run-out tests (now gated on `RUNOUT_LIES`). auto ≡ interactive:
`resolveShot`/`executeShot`/the AI carry helpers are the single shared path. Graphic IS the physics:
`backspinRoll` runs the SAME `rollOut` at the mean split energy. No `_gs*`/URL hook (a physics change +
a HUD readout), so no test-hub wiring. `clubRollFraction` gains a `clubId` arg (family-keyed) and is
re-exported from `round.ts`.

## GS-backspin-optin — backspin is a build, not every wedge (2026-07-20)

**The ask.** "Rework backspin across the whole game — either remove it completely or keep it only to
Backspin Bo, not on the other characters. It's fine to leave the shop items and upgrades if we keep it
for Bo. With contoured greens, random spin distances and random landing spots, it's almost impossible
for a human to chip in with backspin, and worse — because it can spin back so far on firm contoured
greens you often have to land the shot OVER the green and hope it spins back on. I like it in theory,
but in practice it's really really hard."

**The diagnosis.** Backspin was UNIVERSAL: `clubRollFraction` gave every player's every wedge (PW and
below) a negative roll fraction (+5% at PW → −10% on the shortest lob), so the ball spun back toward
the player on every short approach. Stacked with the random `rollPotential` variance (`rng.range(0.85,
1.15)`), the green's slope amplification, the first-bounce landform kick, and Bo's / the spin gear's
extra check, the spin-back distance became a lottery nobody could read — exactly the frustration. The
GS-backspin-line helper (below) drew the predicted check so you *could* read it, but a read of an
unmanageable mechanic is still unmanageable. The right fix was upstream: stop forcing backspin on
everyone.

**The change.** `clubRollFraction`'s wedge branch now tapers +5% → **0%** (a soft check-to-a-STOP,
never negative). A NEGATIVE roll — the ball pulled back — is now supplied ONLY by a backspin BUILD:
- **Backspin Bo** carries the whole check himself (his `clubMods` `rollFracDelta`, loft-scaled −0.05 on
  the 5-iron → ~−0.10 on the shortest wedge). He's the ONE golfer who spins it back — his identity,
  tuned to bite-and-hold (a few yards of controllable check), not the old land-over-and-pray extreme.
- **Spin gear** (`backspinBoost`: Fresh-Groove Wedges, Spin Guide Card, Spin Trajectory Computer, and
  every story-mode ball/wedge) still subtracts from the roll fraction, so it's a real opt-in upgrade.

So a plain wedge (any of the other three golfers, no gear) lands and HOLDS predictably; backspin is a
specialist's tool you deliberately pick up. The shop items + the GS-backspin-line helper are untouched
— they just now matter for the players who opt in.

**Why it's safe.** It's a pure physics-value shift: `rollPotential`/`backspinRoll` still take exactly
one rng draw (`frac` changes, the draw count/order don't), so the rng stream is byte-identical
(contract 1) and auto ≡ interactive holds (contract 2). It's not a power-up, so the death-spiral bar
isn't at risk — removing an unpredictable spin-back makes plain wedges *more* controllable, and the
character-balance harness (`tests/characters.test.ts`) stays green with Bo re-tuned. `hasBackspin(carry)`
was demoted to "a wedge-loft club a spin build CAN check" (it no longer implies backspin on its own);
the scorecard's Backspin row and the off-green check line now gate on the roll actually going negative
(`roll < 0` / `K < 0`), so they surface only for a real spin build. `tests/backspin-line.test.ts` and
`tests/roll.test.ts` were updated to arm a backspin build (Bo / `backspinBoost`) wherever they assert a
check — and to prove a plain player never spins the ball back while Bo still does.


## GS-backspin-line — the backspin helper line (2026-07-13)

**The ask.** "With the contoured greens and backspin upgrades, backspin is incredibly hard to manage
now. Add a backspin helper line similar to the putting line — a very short guide line to start with,
then a couple of pro shop upgrades to make it better with higher backspin and more contoured greens."

**The model — the full-shot twin of the putt read.** A wedge/short-iron approach flies PAST the pin
and spins BACK; on a contoured green the roll also curls off the sculpt. Both were invisible until the
ball landed. GS-backspin-line draws that predicted roll-out on the shot-decision screen: a short cyan
line from the aim-line touchdown to where the ball settles, with the confident prefix drawn solid and
a terminus dot where the read runs out (exactly the putt-read idiom, a distinct cyan `#7fe0ff` so it
never reads as the yellow break line or the green/amber/red spray cone; a dark halo keeps it legible
over the cone + fall-line arrows).

**Graphic ≡ physics (contract 5).** `backspinRoll(hole, spray, opts)` (round.ts) is PURE: it takes the
aim spread's `expectedCarry` landing, computes the MEAN roll energy (`carry · (clubRollFraction +
rollFracDelta − backspinBoost)` — the `rollPotential` body at the rng.range midpoint 1.0, NO draw
taken), and feeds it through the SAME `rollOut` the sim resolves — so the drawn check + contour curl is
byte-for-byte the roll the shot will take (a test reconstructs `rollOut` independently and asserts
equality). Returns null for a non-backspin club (driver/long irons), a landing that plugs in a penalty,
or a negligible roll (`|roll| < SPIN_LINE_MIN` 1.0). Zero rng, so the headless auto path is untouched.
(The rare ship-corridor pinball flight + tent ricochet aren't reproduced — the line is a helper, the
actual bounce is the truth; the ground roll still passes `hole.walls`.)

**Read range is a shoppable gear axis (like the putt line).** `spinReadOf(loadout)` (economy.ts)
returns `{readYd, full}`: a short base reach every wedge shows with no upgrade (`DEFAULT_SPIN_READ` 2.5)
+ `spinReadBonus`, and `spinReadFull` for the whole roll. `previewBackspin(state, spray, loadout)`
(play.ts) turns that into a `readFrac = full ? 1 : readYd / |roll|`. The overlay cuts the confident
prefix by ARC LENGTH, interpolating the terminus point — a straight (non-contoured) roll is only 2
points, so an index cut would always land on the last point and the gearing would never show (the putt
path has 12 samples and never hit this). Two items, each a genuine short-game upgrade so the auto sim
gains too (the Green-Reading-Book pattern; contract 4):
- **Spin Guide Card** (common, 70cr): `spinReadBonus +4` + `backspinBoost +0.04`.
- **Spin Trajectory Computer** (rare, 150cr): `spinReadFull` + `backspinBoost +0.05`.

Both round-trip via their perk ids (`loadoutFromPerks`) — no save bump. `spinReadBonus`/`spinReadFull`
are render-only (a base loadout leaves them undefined, byte-for-byte).

**Wiring.** The overlay parts (`spinOverlayParts`, holeView) live in the SHARED `#gs-shot-overlay`
group with the spray cone, so the pull-to-power surgical refresh (`shotAimRefresh`) redraws the line as
power/aim change (`spinPath`/`spinReadFrac` in `RenderOptions`). app.ts computes `previewBackspin` off
the same `spray` it already builds for the cone (no extra shot resolve) in both the full render and the
refresh. The Pro Shop upgrade digest (`shopScreens.ts`) gains a 🎯 line.

**Verified.** `tests/backspin-line.test.ts` (17): the gear axis (`spinReadOf` base/guide/computer +
perk round-trip), `backspinRoll` (null for driver, checks back for a lofted wedge, landing anchor,
graphic≡physics vs an independent `rollOut`, determinism, deeper check with more `backspinBoost`),
`previewBackspin` read fractions, and the overlay render (partial → filled terminus, full → open settle
ring, absent → no spin parts). `scripts/backspin-line-preview.mjs` eyeballs four gear tiers on a
contoured green: the wedge lands at ~61y and spins back toward the 49y flag, base reads ~half the check
(terminus dot), the Computer reads it all (settle ring). Full suite green; no new `_gs*` hook.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy. `takePutt(…, control?)`:
    control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  - The make band SHRINKS with distance past the putter's `puttRange` (floored; =1 within range);
    the on-screen band draws the SAME shrunk window. Only the PACE window is distance-scaled;
    auto `onePutt` is untouched.
  - The break line STOPS DEAD at the confident read (terminus dot, nothing beyond) — read range is
    a visible gear axis (`puttSkillOf`, cap 1.0).
  - BACKSPIN IS OPT-IN, not universal (GS-backspin-optin): with contoured greens + random spin +
    random landing, a human can almost never chip in with backspin, and a full wedge can spin back so
    far you must land OVER the green and pray — so every player's every wedge no longer spins back.
    `clubRollFraction`'s wedge branch (PW and below) now tapers +5% → **0%** (a soft check-to-a-STOP,
    never negative) instead of the old +5% → −10% backspin curve. A NEGATIVE roll — the ball pulled
    BACK toward the player — comes ONLY from a backspin BUILD: **Backspin Bo** (his `clubMods`
    `rollFracDelta`, loft-scaled −0.05 → −0.10 on the scoring clubs — the ONLY golfer who spins it
    back) or **spin gear** (`backspinBoost`), added on top of the neutral base. So a plain wedge lands
    and holds predictably; backspin is a specialist's tool you choose (play Bo / buy the gear), never a
    forced lottery. Pure physics change (zero extra rng draws — `rollPotential`/`backspinRoll` still
    take one draw, `frac` just shifts), so auto ≡ interactive and the death-spiral/character-balance
    bars stay green. `hasBackspin(carry)` now means only "a wedge-loft club" (a club a spin build CAN
    check), not "this backspins". The scorecard's Backspin row + the off-green check line gate on the
    roll actually going negative (`roll < 0` / `K < 0`), so they show only for an actual spin build.
  - CARRY / ROLL SPLIT (GS-carry-rollout-split): a club's number is its **TOTAL** distance (carry + run),
    not its carry. The ball FLIES a family fraction of the total — driver **0.80**, wood 0.82, hybrid
    **0.85**, iron **0.90** (wedge/putter 1.0, land-and-hold — byte-for-byte the backspin-optin behaviour)
    — and RUNS the rest, so the player reads "land short, run to the flag" and knows the number includes
    the run (fixes "clubs just sit and stop"; the hook for future carry-boost shop items — buy carry to
    clear a hazard vs. total to go further). The split is **total-PRESERVING** and lives in `flight.ts`,
    keyed off `FlightProfile.carryFrac`: `flightScaleFor` (= `carryFrac·(1+legacyRollFraction)`) scales the
    FLIGHT `intended` down in `resolveShot`/`shotSpread`, and `rollFractionFor` (= `(1−carryFrac)/carryFrac`)
    is the run `rollPotential` releases — anchored on the pre-split roll curve so `carry + run` finishes
    exactly where the ball used to (endpoint preserved ⇒ death-spiral neutral; the main balance bars stay
    green, only forced-carry worlds get modestly harder ON PURPOSE — the ice-ring frost fence is relaxed
    with a `TODO(GS-carry-rollout-split)`). The physics roll cap is `ROLL_ENERGY_CAP` (60, above the AI's
    `MAX_ROLL` 42 allowance) so a driver's bigger run isn't clipped. The ONE fairness-critical coupling:
    a forced carry must be cleared in the AIR, so the carry-aware AI keys off **flight** reach
    (`maxFlightReachOf`/`flightCarryScale` in `carryTarget`/`longestCarryClub`), never total — it lays up
    when its reduced flight can't span the hazard (Stableford can only rise, contract 4). REACH decisions
    (green/position) still key off TOTAL (unchanged). `clubRollFraction(clubId, nominal)` is now
    family-keyed (re-exported from round.ts). Guarded by the whole suite (byte-shifts re-pinned; wedge/
    putter carryFrac 1 ⇒ backspin/putting paths byte-for-byte). No `_gs*`/URL hook (physics + a HUD
    readout), so no test-hub wiring.
  - The ROLL/CHECK helper line (GS-backspin-line + GS-runout-line + GS-carry-rollout-split) is the
    full-shot twin of the putt read: on the shot screen it draws a short cyan line from the aim-line
    touchdown to where the ball settles. A shot that actually CHECKS BACK (a backspin build's wedge,
    `K < 0`) always draws its "fly past, spin BACK" check/curl even off the green; every FORWARD-rolling
    shot draws its RUN-OUT when it lands on **short grass** (`RUNOUT_LIES` = fairway/green/tee) — so a
    drive shows its run down the fairway and an approach its release onto the green (the player SEES the
    total includes run), while a ball dropping into rough/sand/trees draws no line (little run there, and a
    line into the hay is clutter). The HUD legend shows `carry X–Yy → Zy total` so the number carries the
    run. `backspinRoll` (round.ts) is PURE: the
    MEAN roll energy (no rng draw) through the SAME `rollOut` the sim resolves, so the drawn run + curl IS
    the physics (contract 5). `previewBackspin` (play.ts) reads the character `rollFracDelta` +
    `loadout.backspinBoost` + `spinReadOf` for the read reach; it lives in the shot-cone overlay group
    (`spinPath`/`spinReadFrac`, holeView) so the pull-to-power gesture redraws it. A forward RUN-OUT is
    always shown in FULL (fundamental "where it settles" info); a BACKSPIN check stays a gear-gated read.
    The at-rest power seed (`app.ts`) also aims the CARRY so carry + run-out ≈ the pin (via
    `clubRollFraction`), so the DEFAULT approach rests at the flag instead of running past it.
    Interactive/render-only — zero sim rng, the headless auto path never reads it. Read range is a
    shoppable gear axis like the putt line: a short base reach (`DEFAULT_SPIN_READ`) always on; **Spin
    Guide Card** extends `spinReadBonus`, the **Spin Trajectory Computer** reads the whole roll
    (`spinReadFull`) — each pairs a small `backspinBoost` so the auto sim still gains (the
    Green-Reading-Book pattern; contract 4). The prefix cut is by ARC LENGTH (a straight 2-point roll
    would never show a terminus on an index cut). No new `_gs*` hook / save bump.
  - Greens layer 1–2 contour LOBES (`Hole.greenContour`, own side rng stream) over the plane;
    `greenSlopeAt` is the ONE local field the resolver, preview line, read, AND arrow field sample.
    The field math is the surface-agnostic `sim/contour.ts`; `rollOut` samples it per step and
    CURLS along it (`roll` is ARC length; straight-roll invariance holds only on lobe-less holes).
    On CONTOURED greens the FIRST BOUNCE also reads the landform (energy kick + fall-line deflect
    at touchdown) and gravity CREEP forbids resting on a steep piece of the SCULPT — creep reads
    the LOBE field only (a plane tilt still holds a ball) and never leaves the green
    (GS-green-contour-3; lobe-less holes stay byte-identical). A manual putt's `PuttLog.path`
    carries its true curved travel; auto stays pathless.
  - Contour ART is a lit relief map in the biome's own turf Shade: terraced closed-ring fills
    (`Isoline.closed`/`hiInside`), Tanaka-lit isoline chunks (fixed course-space chunk counts —
    camera-proof, machine-checked), biome-derived washes (never neutral white/black), and
    fall-line arrows contrast-picked against the turf's luminance. The relief renders on EVERY
    biome — `contoured` gates on the ISOLINES (present on every sculpted green), NOT the fall-line
    arrows (which vanish on a gentle low-`greenSlopeMax` green, the "no contour" bug). Rainbow Road
    is the one exception: it takes its own ribbon branch and draws no green contour (deliberate).
  - Harder stops tilt greens more (slope-magnitude floor rises with wildness, drawn from the SIDE
    slope rng — calm stops keep the old draw).
  - Putt-FEEL: fall-line arrows are PX-CAPPED in `styleGreen`; the putt watch-cam reuses the putt
    screen's exact framing padded for break bow (aim-INDEPENDENT); ◄/► aim is per-putt scaled with
    hold auto-repeat, and nudges update SURGICALLY (`puttAimRefresh` — a full `render()` resets the
    pace meter mid-aim).

---

## GS-runout-feel — land, bounce, run out (2026-07-26)

**The ask** (playtest): "a ball landing from a shot onto the green contours and the backspin animation
doesn't feel like a natural golf ball flight. In the words of one tester, it looked like the ball landed
and then teleported away. The driver/wood fairway land, bounce and run is pretty decent, could maybe be
improved as well, but we definitely need to do something about the green contours and backspin land,
bounce and roll."

### What the old run-out actually was

```
rollDur = clamp(150, 900, |roll| × 20ms)
ground  = easeOutCubic(rt)  along the path
height  = amp × |sin(rt·π·hops)| × (1−rt)^…
```

Three separate structural faults, which is why no amount of tuning had fixed it:

1. **It was tuned at the wrong camera.** `20ms/yard` floored at 150ms reads fine on the whole-hole map
   (~1 px/yard). The chip/putt camera runs at ~6.6 px/yard — the same yards are six times the pixels, so
   the same 150ms reads as an instant jump. A short check ran at the floor. (The same class of bug as
   GS-green-complex's pixel-sized aprons, found in the same session: **anything tuned in time or pixels at
   map zoom is wrong at green zoom.**)
2. **The ball decelerated from the instant it touched down.** `easeOutCubic` is at maximum speed at t=0
   and braking immediately. A real ball leaves its first bounce at very nearly flight speed and covers a
   large share of its run-out *in the air*; deceleration happens ON CONTACT, in steps.
3. **The hops were decoupled from the travel.** Height ran on its own `|sin|` clock while the ground
   position ran on the ease — so the ball was airborne while braking and on the ground while sliding. A
   jiggle laid over a skid, not a bounce.

And the backspin branch had a fourth: after the forward skid it used `easeInOut` to return to rest, which
*accelerates away from a dead stop* — the literal shape of a yank — over ~200ms.

### The model

`render/runout.ts` — pure, no DOM, no time source, no rng, unit-tested in node.

- **Bounce share** of the run-out is set by the landing surface's `surfaceFirmness`: a firm fairway skips
  ~62% of its run out through the air, a plugged bunker ~14%.
- **Within a hop** the ball flies at CONSTANT horizontal speed (no air drag at this scale) on a clean
  parabola. It loses a slice of speed at each CONTACT (restitution, also from firmness), so hop distance,
  hop duration and hop apex all decay off that one number and stay mutually consistent.
- **The roll** is constant deceleration to a dead stop, entering at the speed the last hop left — floored
  at 22% of landing speed, because the raw geometric decay hands the roll ~8% and a long drive then spends
  well over a second crawling its last few yards (measured 1681ms of roll on a 50-yard run-out; the floor
  brings it to 685ms).
- **The chain starts at the flight's own final ground speed**, measured off the same
  `sampleCurvedFlight` / `samplePolylineFlight` the ball was just drawn flying. That is the fix for fault
  1 and 2 together: there is no velocity step anywhere from strike to rest, and the duration falls out of
  the physics instead of a per-yard constant.
- **The backspin check** is two beats: an airborne forward SKID carrying flight momentum (floored at
  170ms — at flight speed the skid is over in ~30ms, i.e. invisible, and the skid is the beat that *sells*
  the spin), then the spin bites and drags the ball back on a smoothstep — accelerating out of the grab,
  easing into the finish. A 12-yard check now takes ~1.2s instead of ~200ms. Real check-backs are slow;
  this one gets to be.

Sample traces (yards / ms / apex):

```
driver → fairway, 50y run : 885ms  hops 15.1y·75ms·5.1y ▸ 6.8·50·2.3 ▸ 3.0·34·1.0 ▸ 2.5·41·0.5 ▸ roll 22.6y·685ms
7-iron → green,   9y run  : 340ms  hops  2.6y·15ms·0.9y ▸ 0.9·9·0.3 ▸ 0.3·6·0.1     ▸ roll  5.1y·166ms
wedge  → green,  12y check: 1193ms skid to +6.4y, then dragged back to −12y
into rough,       5y run  : 340ms  one 1.1y hop ▸ roll 3.9y·153ms
```

### Contract 5 still holds

The sim decided the roll distance and, on a contoured green, the exact curled path (`rollOut` →
`shot.roll` / `shot.rollPath`). The drawn run-out **walks that path by ARC LENGTH** and ends exactly on
the resolved rest point; only the time parameterisation and the hop heights are feel. The backspin skid is
the one drawn segment with no sim path to walk — the sim's path runs the other way — so it is laid down
the shot bearing and the return leg walks the real path.

Everything is a `RunoutFeel` sub-field spread into `_gsFeel`, so the whole run-out is live-tunable with no
new top-level `_gs*` flag and no test-hub wiring obligation.

**Verification:** `npm run check` green (1922 tests), including a new `tests/runout.test.ts` that pins the
three properties whose absence caused the report — no speed step at touchdown, fastest-first with
deceleration on contact, and a run-out long enough to read — plus the contract-5 endpoint property and
monotonic progress. Render-only: zero sim rng, zero save change, auto ≡ interactive untouched.

---

## GS-runout-club — bounce and run read per club (2026-07-26)

**The ask**, after GS-ball-art made the landing visible enough to judge:

> "add an amount of bounce and run based on club type? Driver has the most bounce and run, woods have
> slightly less bounce and run, hybrids less bounce but a bit of run. then irons have a lot of run
> from 3-5 and then far less run down to pitching wedge which is where backspin starts."

### The run and the bounce come from different places

Worth separating before touching either, because the repo already models one of them.

**RUN is the sim's.** GS-carry-rollout-split made a club's number its TOTAL: the ball flies a family
`carryFrac` of it and releases the rest, total-preserving. So the ladder already existed — and the
top of it already matched the ask:

| | before | after |
|---|---|---|
| driver | 25.0% | 25.0% |
| woods | 22.0% | 22.0% |
| hybrids | 17.6% | 17.6% |
| **3–5 iron** | **11.1%** | **19.8%** |
| **6–9 iron** | **11.1%** | **6.4%** |
| wedges | 0 | 0 |

The irons were **one row**. Every iron in the bag ran *less than a hybrid*, and a 3-iron was
indistinguishable from a 9-iron. `flightClassOf` now splits them at the number — `ironLong` (≤5) and
`ironShort` — still convention-based off the club id, so a new `4i` row picks up the long-iron flight
with zero engine edits (contract 5). The long irons also **bore** (`peakMult` 0.92, apex earlier) and
the short irons **climb** (1.06, apex later), which is the other half of what makes them read
differently in the air.

A driving iron outrunning the rescue club it replaced is the real-golf behaviour and it is what the
brief asks for — "hybrids… *a bit* of run, then irons have *a lot* of run from 3-5".

**BOUNCE is render-side.** `runout.ts` derived its hop train from landing firmness alone, with nothing
per club: a wedge and a driver bounced identically out of the same fairway. `RUNOUT_BY_CLASS` is a row
of multipliers on the surface-derived share / restitution / apex, so **the landing still sets the base
and the club scales it** — a driver into a plugged bunker still does not skip.

### Splitting a flight class is compile-forced, and that is the point

`FlightClass` keys several `Record<>`s, so adding a member failed the typecheck in four places
immediately. Each one is a real decision rather than a mechanical fix:

- **The strike voice** (`render/audio.ts`) — both rows share it. The split is a *flight* distinction;
  a 3-iron and a 9-iron still sound like irons.
- **The Pro Shop's "distance irons" and the Story tour irons** — "irons" is one thing to the player, so
  the item lifts **both** rows or it half-works on half your bag.
- The tests that named the class.

### Two structural bugs found in the same pass

**1. The backspin check stopped dead.** This is the one the playtest reported as *"the ball now stops
and then just slides"*. `sampleRunout` ran the forward skid at constant speed and handed over to a
smoothstep — **whose derivative is zero at u = 0**. So: full flight speed, hard step to a dead stop,
then a slow creep backwards. The code comment claimed it "accelerates out of the grab", which is true
of the backward leg in isolation and false at the join.

It is now a **cubic Hermite whose start tangent is the skid's own velocity**, so the ball carries its
momentum *through* the grab — still going forward as the spin takes hold, then decelerating, reversing,
and easing to rest at the sim's point.

The reason this shipped green is worth writing down: the suite tested velocity continuity **at
touchdown** and nowhere else. A piecewise run-out has a join at every phase boundary and needs
`ds/dt` sampled across all of them. The new tests do.

**2. The last hop was the biggest of the tail.** The hop train handed the *remainder* to its final hop
so the train "summed exactly" to the bounce distance:

```js
const want = i === feel.hopMax - 1 ? remaining : Db * (1 - q) * Math.pow(q, i);
```

Whenever the restitution is high enough that the geometric train hasn't decayed away within `hopMax`,
that makes the last hop *larger than the one before it* — a driver off a firm fairway skipped **13
yards on hop 4 after 7 yards on hop 3**, visibly re-accelerating as it was supposed to be dying. There
was never anywhere for the remainder to go wrong: whatever the hops don't cover already flows into the
closing roll. Every hop is now a clean geometric share. Caught by the new per-club test, not by eye.

### Balance

Measured on the death-spiral harness exactly as `tests/biomes.test.ts` runs it — 10 non-exempt worlds
× 80 seeds × 3 holes = **2,880 holes at max wildness**:

| | toPar/hole | floor-hits |
|---|---|---|
| before | 0.8958 | 9.48% |
| after | **0.8740** | **8.65%** |

Both moved the safe way, and both for the same reason: short irons now fly closer to their number
(0.90 → 0.94 carry fraction) so approaches finish nearer the pin, while long irons release like the
driving irons they are. The blow-up fence is ratcheted `0.10 → 0.09` to hold the gain — the same
precedent as GS-fairway-width-2's `0.12 → 0.10`. Still a regression fence, not the design target.

### Guards

`tests/runout.test.ts` — `ds/dt` across every phase join (skid→drag, and each hop→hop and hop→roll),
the run ladder read off `FLIGHT_PROFILES`, that every iron in `CLUBS` lands on the right side of the
split, that the long irons bore and the short irons climb, that a driver out-skips a wedge off the same
landing while a wedge hops higher, that the surface still has the final say, and that no class can
bounce for ever at any firmness.

---

## GS-chipin-roll / GS-spin-gate — the ball lands and then rolls properly (2026-07-26)

> "the backspin roll and contoured greens, especially with Chipinski caddie makes the ball do some
> really weird rolling. Need to actually calculate the landing spot, backspin and the contour roll so
> that the ball lands and then rolls properly instead of rolling around like some crazed magnet or
> something. With Chipinski caddie, needs to factor that in so it rolls properly from landing to the
> hole while account for green contours"

Two bugs, both structural, both reproduced and measured before anything was changed.

### 1. A caddy-granted outcome still has to be travelled

Dr Chipinski's chip-in does this:

```js
log.holed = true;
log.chipIn = true;
ballAfter = pin(hole);      // the NEXT ball position is the cup
```

…and leaves `log.rest` and `log.rollPath` at the ball's **natural resting spot**. The play view walks
`rollPath`, so the drawn ball rolled to a halt near the hole, and then `spawnImpact` fired the hole-out
explosion **there** — on ground with no hole in it. Measured over the first eight chip-ins the drawn
finish was **3.0 to 5.8 yards from a cup of radius 1.2**:

```
seed  3 club=chip   | drawn END is 4.73yd from the CUP
seed  5 club=putter | drawn END is 5.78yd from the CUP
seed  7 club=64     | drawn END is 4.69yd from the CUP
…
```

That is the magnet: the ball stops beside the flag and the game says it went in.

The outcome was never in question — it is a caddy proc, already drawn from the rng. What was missing is
the **travel**. `chipInPath` appends it: a quadratic Bézier from the natural rest to the cup whose
control point is pushed off the chord by the green's own **perpendicular slope component** at the
midpoint — `greenSlopeAt`, the same field that breaks a putt and curls a run-out. So the trickle bends
the way the topo rings say the ground bends (measured bow 0.03–0.78yd across eight chip-ins) instead of
tracking dead straight to the cup, which would have been its own kind of magnet.

Three things had to move together, and each has a test:

- `rest` **is** the cup, so the hole-out FX fires at the flag.
- `rollPath` carries the appended curve, so the walk has geometry to follow.
- `roll` is the **whole arc, positive**. The play view scales its walk by `|roll|`; leaving it at the
  natural run would freeze the ball beside the hole with the trickle undrawn. Positive because the
  journey now ends *ahead* of the pitch mark, in the cup — a wedge that checked back four yards and
  trickled five in covered nine yards of ground, and a "−4yd check" on a ball that finished forward in
  the hole describes nothing. The renderer's `isCheck` therefore excludes a chip-in: the skid-and-return
  beat only makes sense for a path that is purely backwards.

Zero rng — pure geometry after an already-decided outcome, so auto ≡ interactive and every seeded
stream is untouched.

### 2. A spin build was spinning clubs that cannot spin

`hasBackspin(nominalCarry)` has always documented itself as *"clubs whose roll a spin build can turn
into a real BACKSPIN check"* — PW and below. `rollPotential` never asked it:

```js
const frac = rollFractionFor(profile, nominalCarry) + rollFracDelta;   // rollFracDelta = −backspinBoost
```

The biggest single spin item is `+0.26`; a driver's run fraction is `0.25`. **One item is enough to take
a driver negative**, and two put it well past. Measured with `backspinBoost: 0.46` (two stacked items),
worst signed roll per club, before:

```
D   carry 250  →  −18.00     (MAX_CHECK)
3W  carry 235  →  −18.00
2H  carry 189  →  −18.00
3i  carry 157  →  −18.00
7i  carry 134  →  −18.00
```

A 250-yard drive that lands and sucks 18 yards backwards across a contoured green. That is the crazed
magnet, and it is reachable from the shop.

Now, same measurement:

```
D … 9i        →   0.00      (the spin took the run off; it cannot reverse them)
PW  carry 106  →  −18.00
SW  carry  74  →  −18.00
64  carry  40  →  −18.00
```

Above the wedge threshold the spin bottoms out at a **dead stop** — which is the honest trade: you
bought spin, you gave up your run. Below it, nothing changes. The threshold is `BACKSPIN_CARRY` = 106 =
the pitching wedge's carry, so this lands exactly on *"pitching wedge is where backspin starts"*.

The rng draw is consumed whether or not the clamp bites (`carry * frac * rng.range(…)` evaluates the
draw regardless), so a loadout without a spin build is **byte-for-byte** — contract 1 holds, and the
full suite confirms it.

### Deliberately NOT changed, and flagged instead

With a heavy build a **64° wedge still checks back the full 18-yard `MAX_CHECK` from a 40-yard carry** —
nearly half the shot. One spin item alone checks it back ~10 yards. That is the designed extreme of a
spin build rather than a broken code path, and clipping it is a balance decision about the item economy,
not a bug fix, so it is left alone and raised with the numbers instead.

**Guards:** `tests/roll.test.ts` — a chip-in rests in the cup and its path ends there; `|roll|` equals
the whole arc and is positive; the trickle actually curls on a contoured green; `chipInPath` is
deterministic and ends exactly on the cup; no club above the threshold ever checks at any boost (0.26 /
0.46 / 1.2); the wedges still check, so the build is worth buying; the threshold is the PW; and a base
loadout is unchanged.

---

## GS-flight-pace / GS-landing-real — the shot arrives, and then it lands (2026-07-26)

> "still doesn't feel as good as it did before. ball now feels a bit more like a roll, but it doesn't
> feel like you are hitting a golf shot. go slowly, carefully, deeply and get it feeling right."

Six reports in one message. Five were symptoms; one turned out to be the cause of most of the rest.

### The cause: the drawn ball stops dead in the air before it lands

`flightControl` returns the landing's projection onto the shot bearing — so for any shot that finishes
**on its line**, which is most of them, the control point sits exactly ON the landing and the quadratic
Bézier degenerates:

```
P(t) = from + (2t − t²)·(landing − from)      ground speed = 2(1 − t)
```

Twice the average speed at the strike, and **exactly zero at the landing**. Measured on the drawn arc:

| animation progress | ground covered | ground speed |
|---|---|---|
| 0.00 | 0% | **2.00×** average |
| 0.50 | **75%** | 1.00× |
| 0.90 | **99%** | 0.20× |
| 1.00 | 100% | **0.00×** |

The ball rockets off the club, and then hangs almost stationary in the air for the final tenth of every
shot before touching down at **2% of its average speed**. That is the whole of "it doesn't feel like
you are hitting a golf shot", and it had been true since the arc was written.

It also poisoned everything downstream. GS-runout-feel chains the entire run-out off the ball's
measured arrival speed, precisely so there is no velocity step at touchdown — and that speed was being
measured at the bottom of this collapse. The chain was faithfully continuous from a broken number.
Measured arrival speed, driver: **0.0067 → 0.28 yd/ms**, a factor of 42.

`flightT(u)` maps animation time to the curve parameter so the ground advances at a near-constant rate,
tapering only as far as drag would take it (`flightDragTaper` 0.72 — a real drive sheds about a third of
its horizontal speed between launch and landing, not all of it).

**The drawn path is untouched.** The same `t` still feeds both the ground and `arcHeight`, so every
(ground, height) pair the sim's knockdown walk tests is a pair the renderer still draws — contract 5
holds exactly, and no tree that used to be cleared is now hit. Only the pacing moves.
`samplePolylineFlight` (the derelict's pinball flight) is deliberately exempt: it already walked its
path by **arc length**, which is to say it was already right.

### The landing is built from the flight

The brief was specific:

> "driver needs to land, bounce a few times and then roll a bit. woods and hybrids similar, but bounce
> and run is slightly less. irons still need to land and bounce at least once even if they check up.
> wedges still need to bounce at least once and then spin/roll… The land, bounce and roll should be
> affected by the apex height of the shot and the total distance travelled in the flight path… the
> lower the apex, the more bounce and run… If it's the same bounce and run on every drive it doesn't
> feel real."

The old model took the run-out distance and the landing firmness and nothing else, so a wedge landed
like a short drive. `planRunout` now takes a `Landing` — the shot itself. A hop's **length** scales with
`carry · cos²(descent)` and its **apex** with `carry · sin²(descent)`: how far it flew and how steeply
it fell. Descent is measured off the drawn arc over the closing **tenth** of the ground, not the last
percent (where the arc has a near-vertical tangent — see *Known and not fixed* below).

Measured descent per club, and the landing that follows on a firm fairway:

| club | descent | hops | hop lengths (yd) | roll |
|---|---|---|---|---|
| D | 35° | **6** | 12.1 / 6.6 / 3.6 / 2.0 / 1.1 / 0.6 | 36 |
| 3W | 41° | 5 | 8.9 / 4.5 / 2.3 / 1.2 / 0.6 | 34 |
| 3i | 49° | 4 | 4.3 / 2.1 / 1.0 / 0.5 | 23 |
| 4H | 53° | 3 | 3.4 / 1.5 / 0.6 | 25 |
| 7i | 56° | 2 | 2.5 / 0.9 | 5 |
| SW | 62° | **1** | 0.9 | 2 |
| putter | — | 0 | — | 2.5 |

Three rules hold whatever the numbers say:

- **Every airborne shot bounces at least once.** Wedges planned *zero* hops before — their run-out is
  shorter than the old length floor — which is exactly the "irons and wedges never bounce" report. The
  floor is a safety net (`hopFirstMinShare`, capped at `hopFloorMax`), never a second model: a club
  whose own bounce is bigger keeps it.
- **The hop train can never outrun the sim.** It is capped so a closing roll always remains, and since
  the sim's own `dist` already collapses on soft ground, the surface kills the bounce *through the
  physics* rather than through a second opinion about it.
- **Speed is chained.** The first hop leaves at the arrival speed times the restitution.

### Hazards were acting; nothing said so

> "hazards should be affecting the ball as well and I'm not sure that they are."

They were, in the sim — measured mean run by landing lie over 120 seeds: fairway 17.2% of carry, rough
8.7%, trees 7.9%, deep rough 5.6%, bunker 3.2%, pot 2.4%. What was missing is that **the drawn landing
looked identical** whatever it landed in. Now the same driver:

| landing | hops | first hop | roll |
|---|---|---|---|
| ice | 6 | 13.2 | 54 |
| fairway | 6 | 12.1 | 36 |
| rough | 3 | 7.7 | 10 |
| bunker | **1** | 4.4 | **0.6** |

And a hop samples the ground it lands ON (`firmAt`), so a drive that *skips into* a bunker twenty yards
down loses the rest of its train there — six hops become four — rather than skipping merrily across it.

### Variation, without touching rng

Per-shot variance is a **hash of the shot's own geometry**. The render path may not use `Math.random`
(it would shimmer on every re-render and break replays) and a sim draw would move every seeded stream
(contract 1). Same shot, same landing, every replay; different shots, different landings; zero draws.
First hop across the range: 9.7 → 14.3 yd.

### The height exaggeration has to be small

A real driver's first bounce peaks around two yards over a fifteen-yard skip: four pixels at the shot
camera, under a ball drawn at three. So the height is exaggerated — but **height is exaggerated and
length is not**, which means the boost multiplies the drawn height-to-length ratio directly. The first
attempt used 4×, which turned a 1:5.5 skip into 1:1.4 and the ball appeared to bounce vertically off the
turf. 1.8× lifts the first hop about eight pixels clear of its shadow and keeps a skip looking like one.
`apexOverLen` caps a hop's apex against its own length for the same reason.

`rollEntryFloor` is retired to 0. It floored the speed the ball entered its closing roll at, to stop a
long tail crawling — but flooring an entry speed **is** a velocity step, and whenever it bit, the ball
visibly picked up as it settled. The crawl it guarded against is handled by `runoutMaxMs`, which
compresses the whole run-out proportionally and so cannot introduce a join. The new hop-join test
caught this immediately.

### Three smaller ones

- **"ball now disappears when it stops and the screen changes."** Once every shot and putt had played,
  the play view's final branch drew *nothing* — the canvas keeps painting until the app swaps screens,
  so the ball blinked out and you watched an empty fairway. It is now drawn at rest until unmount, and
  cleared on a hole-out (it went in; it should not sit on the lip).
- **"I also can't see any shadows at all."** They were drawn every frame — concentric with the ball, at
  the same radius, so the ball covered them completely. Now offset down-right off the scene's `LIGHT_UL`
  and wider than the ball.
- **"dr Chipinski… the you rang needs to show when you hit the ball."** It fired as the ball dropped in,
  which reads as a verdict handed down after the fact. It fires at the STRIKE now and you watch the shot
  make good on it — and a holed run-out no longer eases to a dead stop at the lip (`rollEndFrac`), so
  the ball is still moving as it drops.

### Known and not fixed

The arc has a **near-vertical tangent at touchdown**: the height is a sine in the Bézier's parameter,
so expressed in ground it falls as `√(1−G)` and the ball drops its last several yards almost straight
down. Measured: at 98% of the ground a driver is still 8.8 yards up. Fixing it means re-mapping height
against ground, which changes the (ground, height) pairs the sim's knockdown walk tests — a **balance
change** that needs the death-spiral harness and its own decision. Filed rather than smuggled in here.

**Guards:** `tests/runout.test.ts` — arrival speed as a fraction of the flight's average, the pacing's
monotonicity and coverage, the descent ladder, the per-club hop spec, apex-never-exceeds-length, the
putter exemption, the surface ladder, hazard-kills-the-train, variance (and its determinism), no rng,
and the holed roll's residual pace. Plus the existing `ds/dt` continuity across every phase join, which
is what caught `rollEntryFloor`. Eyes-on: `node scripts/landing-preview.mjs`.

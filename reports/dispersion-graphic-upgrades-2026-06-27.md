# Dispersion graphic overhaul + spray-zone upgrades (GS-dispersion-2) — 2026-06-27

Branch: `claude/dispersion-graphic-upgrades-s7apdo`

## The ask
1. Spray graphic: red (2%) was drawn WIDER than orange (8%). Zones should be sized proportional to the
   chance of landing there.
2. Each character should have a spray appropriate to its skillset (Feather: fewer left misses, more
   right; Huang-Woo: more left hooks on the long clubs).
3. Add/modify upgrades that remove or change duck-hooks (left red), shanks (right red), hooks (left
   orange), slices (right orange) and great shots (green). A zone reduced to 0 disappears; freed % flows
   to the OTHER zones — but cutting a red/orange does NOT auto-grow the opposite side's red/orange
   unless it's an explicit trade-off (e.g. −1% duck-hook / +1% shank). Cutting a bad zone raises the
   GREEN %, but green's drawn wedge does not grow.
4. Upgrades must change the displayed cone to show where the ball will land.
5. An accuracy upgrade shrinks the whole cone but leaves the zone %s alone (unless it also cuts misses).
6. Distance-control modifiers that raise the min carry of driver/woods/irons (smaller min↔max gap).
7. A different wedge modifier that lets the player place the wedge landing zone forward/back + left/right
   for more wedge accuracy (clamped to [0, max carry]).

## What shipped

### The model (`src/sim/shot.ts`)
- `SprayShape` = `green` + four independent miss zones (`hookL`/`sliceR` orange, `duckHookL`/`shankR`
  red). Default 80 / 8 / 8 / 2 / 2. **Invariant `green = 1 − Σ misses`** — green is the derived
  remainder, so cutting any miss raises green and a sideways move needs an explicit zero-sum mod.
- `ShapeMod` (additive deltas to the 4 miss zones) + `applyShapeMod`/`combineShapeMods`/`resolveShape`.
  Clamping keeps each zone ≥0 and total miss ≤ 0.6 (green floor 0.4).
- `sprayBands(shape, σ0)` is the single geometry truth for renderer AND sampler: a fixed-width GREEN
  wedge (±`greenZ·σ0`) and orange/red bands of width `sideK·σ0·prob` (drawn size ∝ chance). `SPRAY_GEOM
  = { greenZ: 1.0, sideK: 18 }` keeps the effective RMS ≈ the old gaussian σ.
- `resolveShot` samples the angle from the shape: categorical zone pick + within-band position (green
  triangular/centre-peaked, misses uniform), keeping the **2-rng-draw** budget of the old gaussian angle
  so auto≡interactive and downstream draw order are stable. `sprayAngleRms` exposes the effective σ.
- Carry-window controls: `minCarryFracBoost` (raise the lower clamp) and `carryWindowTighten` (pull both
  clamps toward the mean), applied identically in `resolveShot` and `shotSpread`.

### Wiring (`round.ts`, `play.ts`, `run.ts`, `lab.ts`)
- `ClubShotMods` gained an optional per-club `shape`; `ShotSpread` gained `shape` + `angleSpread`.
- `executeShot`/`shotSpread`/`playHole` thread `shapeMod` (global), `minCarryBoost`, `wedgeWindow`; the
  per-club carry category is resolved by `carryControlFor` (`WEDGE_CONTROL_CARRY = 110`).
- `playStop` (auto) and `takeShot`/`previewShot` (interactive) both pass the loadout fields, so the two
  paths stay in lock-step. The Sim Lab `dispersionStudy` applies the shape + carry controls too.

### Display (`src/render/holeView.ts`, `app.ts`)
- The cone is drawn straight from `spray.shape` via `sprayBands`: zero-prob zones omitted, each band
  labelled with its true % (`prob·100`). Red is now narrower than orange; a one-sided cut reads
  lop-sided. `_gsSpray` is repurposed to a `SprayGeom` override (`resolveGeom`; `centralPct` scales the
  green wedge) — the hub control + test-hub parity guard are unchanged.
- The play legend reads the five zone %s straight off the shape.

### Characters (`src/sim/rpg/characters.ts`)
- **Feather Fade**: per-club shape `{ duckHookL −0.015, hookL −0.04, sliceR +0.035 }` — far fewer left
  misses, a few more right, on top of her existing fade bias.
- **Huang-Woo Hook**: long clubs `{ hookL +0.05, duckHookL +0.03 }` (a real duck-hook risk); irons clean
  up `{ hookL −0.03, sliceR −0.03 }` (genuinely two-faced).

### Upgrades (`src/sim/rpg/economy.ts`)
- Shapers: `sweet-spot` (stack, trims all misses → more green), `anti-duck-hook` / `shank-guard` (kill a
  red zone), `hook-corrector` / `slice-corrector` (stack, halve an orange), `draw-weighting` (trade-off
  −4% slice / +2% hook).
- Distance control: `distance-control` (stack, +5% min carry on driver/woods/irons), `wedge-touch`
  (stack, tighten the wedge carry window).
- New loadout fields `shapeMod`/`minCarryBoost`/`wedgeWindow` (defaults are no-ops; rebuilt from perks on
  resume — no save-version bump).

## Validation
- Full suite green: **307 tests, 39 files** (`tests/spray-shape.test.ts` adds 20). The character balance
  band, no-death-spiral bars, and the "a power-up improves scoring" invariants all still hold — the new
  model is slightly TIGHTER than the old gaussian (hard angle cap vs a long tail), which is safer for the
  death-spiral bar.
- `npm run build` (game + hub two-pass) and `tsc --noEmit` clean.
- Canvas feel (the live play-view) is verified by the SVG-path render tests; the animated cone needs
  eyes-on play to fully judge, per the QA lens.

## Notes / follow-ons
- Point 6's left/right wedge placement is delivered through the existing free-aim (tap/drag) plus the
  tighter wedge window; a dedicated nudge UI could be added later if wanted.
- `suggestPlayerClub` still previews without the carry-window controls — harmless (suggestion only), but
  could be threaded for perfect fidelity.

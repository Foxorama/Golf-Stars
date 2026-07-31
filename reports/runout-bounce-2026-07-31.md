# The bounce reads as "lands and sticks" — outcome (GS-runout-seen)

**2026-07-31** · closes `reports/runout-bounce-handover-2026-07-31.md`. Full story and rationale:
`docs/decisions/putting.md` → *GS-runout-seen*. This file is the measurement.

Everything below is `npx tsx scripts/runout-frames.ts`, which reconstructs the DRAWN run-out frame by
frame from the shipped functions (`planRunout` / `sampleRunout` / the same `flightScaleFor` the sim
resolves a shot with). `seen` counts hops whose drawn apex clears the ball (3px) for more than a frame
or two; nothing is re-derived, so a regression shows up in the same table.

---

## What changed

Two faults, both in `src/render/runout.ts`.

1. **The hop-length term was `carry · cos²(descent)`.** The projectile range relation is
   `v²·sin(2θ)/g`, and this module's own `apexOverLenFor` is the RATIO of range to apex (`tan θ / 4`) —
   so the correct geometry was already present in two places and contradicted in the third. `cos²θ`
   collapses across the bag (0.62 at a driver's 38° → 0.41 at a 7-iron's 50°) where `sin2θ` is flat
   (0.97 → 0.99), so every steep-landing club was docked a penalty the physics does not charge, on top
   of the one `RUNOUT_BY_CLASS.len` already charges for the same steepness. Now `hopBite(descentDeg)`,
   with `hopLenK` 0.07 → **0.0448** — a re-normalisation pinned so the DRIVER is arithmetically
   unchanged. With `cos²` gone, `RUNOUT_BY_CLASS.len` is the only place a club's bite is expressed, so
   two rows moved with it: `ironShort` 0.8 → **0.93** (measured against a real 7-iron's ~4.5yd first
   bounce off firm turf — it was the one row well under the model's otherwise uniform ~0.75 of
   reality), and `wedge` 0.55 → **0.28**, which is the same factor the term itself moved and therefore
   HOLDS the wedge exactly: its modelled skip stays under `hopFirstMinShare`'s net, so every PW/SW row
   and the backspin check's skid come out byte-for-byte. A wedge plopping once is the design, and it
   is where GS-backspin-optin's tuned check lives.
2. **The plan had no way to ask whether a hop could be drawn.** `hopMinYd` is a length in yards, and
   drawability is a question about pixels: the same 0.75yd hop is 3.7px behind a 9-iron and 0.8px
   behind a drive. `Landing.ballYd` (optional) is the drawn ball's radius in yards of modelled hop
   apex — the play view's own `height · scale · heightExaggeration · hopDrawBoost` run backwards — and
   a hop under it is not planned. Its ground goes to the closing roll.

Render-only. No `src/sim/` module imports `runout.ts` (source-checked), so no carry, no rng draw and no
resting position moved: the death-spiral harness has nothing to weigh.

---

## Firm fairway (0.85) — `seen == planned` on all 40 rows

`planned` → `seen`, before → after.

| club | pow | carry | roll | before | after | hop% before → after |
|---|---|---|---|---|---|---|
| D | 1.00 | 272 | 38.1 | 6 → 2 | 2 → **2** | 57% → 41% |
| D | 0.85 | 231 | 32.4 | 6 → 2 | 2 → **2** | 57% → 41% |
| D | 0.70 | 190 | 26.7 | 6 → 3 | 3 → **3** | 57% → 49% |
| D | 0.55 | 150 | 20.9 | 5 → 2 | 2 → **2** | 56% → 41% |
| D | 0.40 | 109 | 15.2 | 5 → 3 | 3 → **3** | 56% → 49% |
| 3W | 1.00 | 259 | 27.2 | 5 → 2 | 2 → **2** | 62% → 49% |
| 3W | 0.85 | 220 | 23.1 | 5 → 2 | 2 → **2** | 62% → 49% |
| 3W | 0.70 | 181 | 19.0 | 5 → 2 | 2 → **2** | 62% → 49% |
| 3W | 0.55 | 142 | 15.0 | 4 → 2 | 2 → **2** | 59% → 49% |
| 3W | 0.40 | 104 | 10.9 | 4 → 2 | 2 → **2** | 59% → 49% |
| 4H | 1.00 | 182 | 13.6 | 3 → 2 | 2 → **2** | 45% → 54% |
| 4H | 0.85 | 154 | 11.6 | 3 → 2 | 2 → **2** | 45% → 54% |
| 4H | 0.70 | 127 | 9.5 | 3 → **1** | 2 → **2** | 45% → 54% |
| 4H | 0.55 | 100 | 7.5 | 3 → 2 | 2 → **2** | 54% → 54% |
| 4H | 0.40 | 73 | 5.4 | 3 → 2 | 2 → **2** | 57% → 54% |
| 3i | 1.00 | 165 | 10.7 | 4 → 2 | 2 → **2** | 67% → 70% |
| 3i | 0.85 | 140 | 9.1 | 4 → 2 | 2 → **2** | 67% → 70% |
| 3i | 0.70 | 116 | 7.5 | 3 → 2 | 2 → **2** | 63% → 70% |
| 3i | 0.55 | 91 | 5.9 | 3 → 2 | 2 → **2** | 63% → 70% |
| 3i | 0.40 | 66 | 4.3 | 3 → 2 | 2 → **2** | 63% → 70% |
| 7i | 1.00 | 141 | 7.7 | 2 → **1** | 2 → **2** | 44% → 62% |
| 7i | 0.85 | 120 | 6.6 | 2 → 2 | 2 → **2** | 48% → 62% |
| 7i | 0.70 | 98 | 5.4 | 2 → 2 | 2 → **2** | 48% → 62% |
| 7i | 0.55 | 77 | 4.3 | 2 → **1** | 2 → **2** | 48% → 62% |
| 7i | 0.40 | 56 | 3.1 | 2 → **1** | 1 → **1** | 48% → 45% |
| 9i | 1.00 | 120 | 6.6 | 2 → 2 | 2 → **2** | 48% → 61% |
| 9i | 0.85 | 102 | 5.6 | 2 → 2 | 2 → **2** | 48% → 61% |
| 9i | 0.70 | 84 | 4.6 | 2 → **1** | 2 → **2** | 48% → 61% |
| 9i | 0.55 | 66 | 3.6 | 2 → **1** | 1 → **1** | 48% → 44% |
| 9i | 0.40 | 48 | 2.6 | 1 → 1 | 1 → **1** | 35% → 44% |
| PW | 1.00 | 106 | 5.3 | 2 → **1** | 1 → **1** | 43% → 35% |
| PW | 0.85 | 90 | 4.5 | 2 → **1** | 1 → **1** | 43% → 35% |
| PW | 0.70–0.40 | 74–42 | 3.7–2.1 | 1 → 1 | 1 → **1** | 35% → 35% |
| SW | 1.00–0.40 | 74–30 | 2.0–0.8 | 1 → 1/0 | 1 → **1/0** | 35% → 35% |

- **`seen == planned` on every row.** The model no longer promises what the camera cannot show.
- **Driver → 9-iron all draw two hops on a full swing.** The rows that stay at 1 are 30–66yd partials
  (a 7-iron with 3.1yd of run has a 2.17yd air budget and two drawable hops need 2.53 — it does not
  fit at any split) and the wedges, which is `RUNOUT_BY_CLASS`'s own "plops once and stops".
- **The driver's drawn skip is unchanged**: first hop 10.12 → 10.07yd, apex 9.3px both. Only its
  invisible tail went.
- **Rows whose animation clock differs from the sampler's: 6/40 → 3/40**, and the 3 left are the
  pre-existing short-SW stretches. The driver's run-out no longer hits `runoutMaxMs`, so a drive plays
  at its true speed instead of compressed to 1.4×.
- **Shots with NO visible bounce: 3/40 → 3/40** — the same three SW partials, unchanged. Every PW and
  SW row on both surfaces is byte-for-byte identical to the baseline (apex px, hop share and duration
  all match), which is what `wedge.len` 0.55 → 0.28 buys.

## Soft green (0.45) — `seen == planned == 1` on all 40 rows

Baseline `seen` was **1 on all forty rows** with 1–3 planned. It is still 1 on all forty; what went is
the phantom. That is the honest answer rather than a disappointing one: on soft ground the forward
restitution is 0.45–0.55, so a second hop is 12–30% of the first and cannot be drawn at any camera the
game uses. The surface kills the bounce through the physics (`SURFACE_ROLL` + the restitution lerp) and
the plan now agrees instead of planning a hop it will not show.

| club | planned before | planned after | hop% before → after |
|---|---|---|---|
| D @1.0 | 3 | **1** | 27% → 20% |
| 3W @1.0 | 3 | **1** | 31% → 24% |
| 4H @1.0 | 2 | **1** | 25% → 28% |
| 3i @1.0 | 2 | **1** | 34% → 37% |
| 7i @1.0 | 2 | **1** | 32% → 33% |
| 9i @1.0 | 2 | **1** | 42% → 35% |
| PW/SW | 1 | **1** | 35% → 35% |

No row lost a visible bounce on either surface.

---

## Gate

`npm run typecheck` + `npx vitest run`: **217 files, 2,608 tests passed, 0 skipped**. `npm run build`
clean. (`npm run check`'s trailing `VITE_HUB=1` hub build cannot run on Windows — see
`docs/decisions/process-and-deploy.md`; CI runs it.)

New guards in `tests/runout.test.ts`, **all verified RED against the old code**: the length term and
the apex ratio are one projectile; the angle term no longer collapses across the bag; `hopLenK` is
pinned to the driver's arrival, so moving it moves the driver; every club driver→9i draws two hops that
clear the ball on a firm fairway; no planned hop is invisible on either surface at any power; trimming
conserves the ball's resting place and leaves the kept hops untouched; a caller without `ballYd` still
gets the old floor.

Eyes-on re-shot (`scripts/landing-preview.mjs`), which picked up two fixes of its own while it was
open: it now passes `ballYd`, so the sheet shows the hops the GAME plans; and it asks `rollFractionFor`
for the run instead of re-deriving it off `carryFrac`, a form that has been wrong since GS-runout-ladder
gave the run its own lever and was previewing a driver running 23yd where the game runs 38. Its private
Linux-only `findChromium` copy is gone in favour of `tests/chromium.ts` — the same second description
GS-browser-test-gate is about, and the reason the sheet could not be shot on Windows at all.

## Deviations from the handover, and why

- The handover's lever 1 was *"redistribute the roll (`hopLenK` and the apex decay)"* and IDEAS refined
  it to *"bring `planned` DOWN to meet what can be drawn"*, with `hopMinYd` as the first lever.
  **Trimming alone changes nothing the player sees** — it removes hops that were already invisible —
  and no `hopMinYd` value can do the job, because two measured hops of 0.744yd and 0.761yd need
  opposite answers (3.6px behind a 9-iron, 1.8px behind a hybrid). That is what forced the pixel-aware
  `ballYd` rather than a bigger yard floor, and what sent the search back to *why* the mid-bag's hops
  were short in the first place — which is where the `cos²` term turned up.
- The handover's lever 2 (*buy more roll with carry via `runFrac`/`carryFrac`*, a balance change) was
  **not needed and not spent**. No fence was moved.
- `hopDrawBoost` and `apexOverLenFor` are untouched, as instructed.

## Follow-ups noticed, not taken

- **`hopApexK` / `hopApexMax` are effectively vestigial.** Across all 80 measured rows the cap
  `want · apexOverLen` binds on EVERY hop, so `hopApex` never decides a height. Not wrong — the
  geometric ratio is the honest governor — but it is dead weight carrying a misleading doc comment.
- **A steep club's DRAWN apex-to-length ratio is 1:1.27** (`apexOverLen · heightExaggeration ·
  hopDrawBoost` at a hybrid's 47°), against the 1:1.4 line `hopDrawBoost`'s own comment calls the point
  where a skip starts reading as a vertical bounce. Pre-existing and unchanged here (the hops got
  longer at a constant ratio), but it is why `hopDrawBoost` must stay modest, and it is worth an
  eyes-on judgement in a later pass.

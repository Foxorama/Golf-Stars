# app.ts decomposition — plan & progress (2026-06-30)

## Why this exists
`app.ts` is the god-file CLAUDE.md flags as *"the likeliest source of regressions."* The recent
regression cluster all lived here (TDZ crash #126, the five UI bugs #151, caddy double-display #137).
Shrinking it — and pulling cohesive concerns into their own modules — is a structural fix for the
"quality slipping" problem, not a cosmetic one.

## Progress so far
| PR | Extracted | app.ts |
|----|-----------|--------|
| #157 | `render/haptics.ts` (HAPTICS table + `haptic()`), `render/celebrations.ts` (GS-ace + GS-bird Canvas2D overlays) | 3,462 → 2,947 |
| #158 | `render/golferCards.ts` (avatar SVG art, character-select cards, leaderboard/competition views) | 2,947 → 2,696 |

Both were **byte-identical relocations** of *pure, closed* clusters — functions that take their data as
arguments and read no module state. That is why they were low-risk and needed no logic change.

## Why the easy wins are now used up
The remaining ~2,700 lines are mostly **coupled to module state**:
- `let state: UiState` is a module-level mutable singleton, referenced **~192×**.
- The screen-builders (`titleScreen`/`characterScreen`-adjacent `header`, `matchHud`, `shopScreen`,
  `travelScreen`, `outpostScreen`, `resultScreen`, `playingBody`, …) read `state` directly and call
  ~50 sibling helpers.
- `render()` (~450 lines), `dispatch()`, the pull-to-power gesture wiring, save persistence, and the
  canvas/intro mounts are the genuine app **shell** — they belong in `app.ts`.

You cannot move a screen-builder out without giving it access to `state` (and dispatch). Doing that by
"extract a pure leaf" no longer applies — it needs a small **architectural** step.

## The key risk (read before touching screens)
**The rendered HTML is not tested.** `tests/` covers the pure reducer (`ui/game.ts`) and the sim, but the
screen-builders return raw HTML strings with **no snapshot/assertion guard**. So a screen extraction has
no automated safety net beyond tsc/build — a byte drift in the output would pass CI silently.

➜ **Before extracting any screen-builder, add a golden-HTML snapshot harness**: a pure
`renderScreen(state, screen)` over a handful of fixed `UiState` fixtures, snapshotted in `tests/`. Then the
extraction is provably byte-identical. This harness is itself the highest-value next PR — it closes a real
test gap regardless of the refactor.

## Recommended staged plan (each its own PR, in order)
1. **Golden-HTML snapshot harness** (above) — make the untested screens testable first. ~no production
   code change; pure new test.
2. **Remaining pure leaves** → `render/widgets.ts`: `windDescription`, `lieChip`, `traitList`,
   `hazardLabel`, `rarityFlavour`, `shapeLabel`, `lieInfo`-only helpers. Same pattern as #157/#158, low risk.
   (Small — only worth it as a warm-up / to keep momentum.)
3. **Canvas/DOM side-effect mounts** → `render/` (e.g. `mountWeatherOverlay`). Self-contained, takes args.
4. **The screen-builders** → `render/screens/*.ts`. Introduce an explicit **`ScreenCtx`** the builders
   receive instead of reaching for the module singleton:
   ```ts
   type ScreenCtx = { state: UiState; /* + the pure helpers they need, or import those directly */ };
   function titleScreen(ctx: ScreenCtx): string { … }
   ```
   `app.ts` keeps `state` + `render()`, builds the ctx once per render, and calls the moved builders.
   Decide once: pass `state` via ctx (explicit, testable) vs. a shared `ui/appState.ts` accessor module
   (less plumbing, keeps a singleton). **Recommendation: explicit ctx** — it's what makes the
   golden-snapshot test trivial and removes the hidden global. Move builders in small batches (group by
   screen), each guarded by the snapshot harness.
5. **app.ts becomes the shell**: imports, `state`, `dispatch`, `render`, gesture wiring, mounts, `start()`.
   Target: well under 1,500 lines.

## Do this in a fresh session, planned up front
Steps 1 and 4 are design decisions, not mechanical lifts. They deserve a clean context budget and an
up-front plan — exactly the discipline (one focused change per session) that this whole quality pass is
about. Tracked as **GS-appsplit** in `IDEAS.md`.

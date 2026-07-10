# Refactor scan — file-size / split candidates (2026-07-10)

Branch `claude/refactoring-file-splitting-wdkksb`, from `main` @ `00d3dd9`.
Baseline before any change: **typecheck clean, 1115/1115 tests green.**

## Why now
The two big structural splits already shipped — the app shell (`GS-app-split`,
screens → `src/app/*`) and the render painters (`GS-style-split`, painters →
`src/render/style/*`). Since then several files have crept back over ~1.6k lines.
CLAUDE.md already flags `app.ts` as "still the hottest file — prefer extending a
`src/app/` module over growing it." This scan re-ranks the whole tree.

## Top files by size (src + tests + scripts)

| Lines | File | Kind | Fan-in | Verdict |
|------:|------|------|-------:|---------|
| 2662 | `src/render/playView.ts` | Canvas2D play renderer | 2 | **SPLIT (best first pick)** — self-contained golfer/apparel art block |
| 2631 | `src/render/constellations.ts` | pure data table | 2 | Leave / optional — one big data literal, near-zero churn |
| 2433 | `src/app.ts` | boot/dispatch/render + play screen | 1 | **SPLIT** — extract the interactive play screen to `src/app/playScreen.ts` |
| 2392 | `src/sim/round.ts` | pure sim (physics/putting/bounds) | 75 | Split behind a re-export barrel — high fan-in, contract-heavy, careful |
| 2326 | `src/sim/course/generate.ts` | generator | 58 | Split internal helpers behind barrel — determinism risk, careful |
| 1841 | `src/sim/rpg/run.ts` | meta-loop spine | 49 | Split by section behind barrel (fuel / warp / shop / serialise) |
| 1737 | `src/sim/rpg/economy.ts` | loadout + shop catalogue | 53 | Split the shop-item catalogue out behind barrel |
| 1673 | `src/ui/game.ts` | pure reducer | 21 | Split action handlers — medium |
| 1614 | `src/render/weather.ts` | weather overlay | 5 | Split per-effect showpieces — closures over build state, medium effort |
| 1557 | `src/render/introView.ts` | intro cinematic | 1 | Split scene painters — cosmetic, low risk |

## Ranking rationale (value × safety)

**Render / UI files (low fan-in, no determinism risk, verify by eyeball + build):**
- `playView.ts` — lines ~165–1712 are a self-contained block of **top-level pure
  canvas functions** (`drawGolfer`, `drawWarhammer`, `drawHat`, `drawGolfBag`,
  `drawPants`, `lookFromColor`, the `GolferLook` interface, `GOLFER_COLORS`). The
  only external consumer is `src/app/helpers.ts` importing the `GolferLook` *type*.
  Extracting → `src/render/golferArt.ts` removes ~1.5k lines from the biggest file
  in the repo with essentially zero blast radius. **This is the first pick.**
- `app.ts` — the app-shell split already moved every *other* screen to `src/app/*`;
  the interactive play screen (`playingBody` + the putt-aim/overlay/map-info helpers,
  ~950 lines) is the obvious next module. Higher regression surface than playView
  (touches shot-gesture wiring) — its own PR.
- `weather.ts` / `introView.ts` — per-effect / per-scene draw functions, but they
  close over `mount`-local state, so extraction needs a small state-passing pass.
- `constellations.ts` — pure star-coordinate data; splitting is trivial but low
  value (near-zero churn, reads fine as one table). Leave unless it keeps growing.

**Sim files (HIGH fan-in — 49–75 importers):** splitting any of these must keep the
original module as a **re-export barrel** so importers and the determinism contracts
(byte-for-byte seeded tests) stay untouched. Highest value: `round.ts` (physics vs.
putting vs. bounds are three clean concerns) and `economy.ts` (the shop-item
catalogue is a fat data block separable from loadout math). These are contract-heavy
(`docs/decisions/*`) — one careful PR each, re-run the death-spiral harness after.

## Recommended sequence (one PR each, per CLAUDE.md "one feature per PR")
1. **`playView.ts` → `render/golferArt.ts`** (this session) — biggest file, cleanest seam, lowest risk.
2. `app.ts` → `src/app/playScreen.ts` — the documented next app module.
3. `economy.ts` → split the shop-item catalogue behind the barrel.
4. `round.ts` → putting / bounds behind the barrel.
5. `run.ts`, `game.ts`, `weather.ts`, `introView.ts` as follow-ups.

Each keeps behaviour byte-identical (render extractions are pure moves; sim
extractions re-export from the original path), so the whole suite stays green.

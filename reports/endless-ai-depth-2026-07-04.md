# Unending Universe: how deep does the auto-AI survive? — 2026-07-04

**Question.** We're weighing a "warp" mechanic for the Unending Universe: instead of replaying
40–50 low-effort holes to get back to a run's frontier, auto-resolve early stops with the headless
sim (`playStop`) — real credits, real milestones, real survival gate, so the leaderboard and
difficulty stay untouched (auto ≡ interactive, contract 2). Warp's practical ceiling is the
auto-AI's own survival depth, so we measured it.

**Method.** `scripts/endless-ai-depth.ts` (`npx vite-node scripts/endless-ai-depth.ts`) drives
`startRun('unending') → playStop → shop → travel` to run-death across 200 seeds per config,
sweeping shop strategy (no buys vs. greedy buy-everything-affordable), route choice (first lane
vs. shallowest jump), and all four starting club sets. Neutral golfer, ascension 0.

## Results (200 seeds per row, holes survived)

| Config                              | mean | median | p90 | max | reach 16 | reach 24 | reach 32 | reach 40 |
|-------------------------------------|-----:|-------:|----:|----:|---------:|---------:|---------:|---------:|
| green, no shop, first lane (test default) | 23.6 | 24 | 32 | 36 | 91% | 55% | 16% | 0% |
| green, greedy shop, first lane      | 23.7 | 24 | 32 | 40 | 92% | 60% | 11% | 1% |
| green, greedy shop, shallowest lane | 26.0 | 26 | 34 | 39 | 94% | 72% | 25% | 0% |
| blue, greedy, shallowest            | 25.6 | 27 | 34 | 41 | 91% | 68% | 24% | 1% |
| purple, greedy, shallowest          | 26.8 | 28 | 34 | 40 | 96% | 73% | 29% | 1% |
| orange, greedy, shallowest          | 26.9 | 28 | 34 | 41 | 96% | 77% | 27% | 1% |

Deaths cluster hard at the **bogey bar (holes 25–32)** — roughly half of all runs die there in
every config — with the par bar (33–40) taking most of the rest. Essentially nobody survives to
the birdie wall (41+): best case 1% reach hole 40, max observed 41.

## Findings

1. **The AI's ceiling is ~hole 28 median / ~34 p90, and it is skill-limited, not gear-limited.**
   Greedy shopping is worth ≈0 holes over buying nothing; shallowest-lane routing +2; upgrading the
   club set green→orange only +1–3. Nothing in the economy moves the wall — the auto-AI's per-hole
   scoring distribution just can't sustain bogey-or-better against ramping wildness. (Side
   observation for balance: the club-set difficulty axis barely registers on the AI; its handicap
   spread is doing its work on humans only.)
2. **The AI reliably clears exactly the tiers players call low-effort.** ~92–96% of runs clear the
   quad/triple tiers (hole 16), ~68–77% clear the double tier (hole 24). The AI's competence
   boundary lands almost exactly where the survival bar stops being trivial.
3. **Early-bust tail ≈ 1.5%.** 3/200 seeds die inside the first 8 holes (one on hole 1 of stop 0),
   and all three are **pickups** (ball never holed — the known blow-up-hole tail, within the <5%
   blow-up contract). Warp played honestly can therefore bust a run in tier 1, rarely.

## What this means for warp

- **Warp solves the stated problem — but by depth ~24–28, not 40–50.** It can honestly fast-forward
  the grindy quad/triple/double tiers and hands the club back right as the bogey bar starts biting,
  which is arguably the *correct* product: the holes it can't skip are precisely the ones that are
  no longer low-effort. But if the expectation is "resume at my hole-45 frontier", pure AI warp
  cannot deliver that today.
- **The lever for a deeper warp is the endless auto-AI's strategy, not economy grants** (finding 1).
  That's the GS-cetus-6-adjacent rebalance territory: smarter club/aim choices under a par bar
  (e.g. attack pins when the bar demands birdie) would raise the ceiling; shop grants would not.
- **Chunk warp per stop, with take-over any time.** The reducer's `autoShotHole` already drives the
  identical AI hole-by-hole interactively (proven ≡ headless in `tests/endless.test.ts`), so warp
  can be a UI-layer fast-forward over existing actions — no new sim surface — and the 1.5%
  early-bust tail stays visible and interruptible instead of a silent instant "run over".
- If a warped-run record needs distinguishing on the `endlessRuns` board (or AI aces excluded from
  the Comet Rider grant), those are reducer-level policy choices; the sim needs nothing.

**Verified:** everything above is measured from the pure sim at 200 seeds/config (~4s each).
**Assumed:** greedy-affordable buying approximates a human build; a human picks synergies better,
but since the whole economy axis moves the AI ≤2 holes, better buying cannot close the gap to 40.

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

---

## Addendum (same day): after the GS-ai-attack / GS-boss-scale tune

Two AI changes landed after the baseline above: the endless auto-AI **pin-hunts once the bar is
bogey-or-tighter** (hole 25+, `endlessAttackArmed`), and **putter perks now reach the headless
putt-out** (`PlayHoleOptions.puttSkill` — they used to work only interactively, so the AI's
shopping was partly dead weight). Re-run of the same 200-seed sweep:

| Config | mean | median | p90 | max | reach 32 | reach 40 |
|---|---:|---:|---:|---:|---:|---:|
| green, greedy, shallowest | 25.7 (=) | 26 | 33 | 40 | 21% (was 25%) | 2% |
| purple, greedy, shallowest | 27.1 (+0.3) | 28 | 36 | 41 | 33% (was 29%) | 4% |
| orange, greedy, shallowest | 27.3 (+0.4) | 28 | 35 | 46 | 33% (was 27%) | 3% |

Deaths at the par bar (33–40) and birdie wall shifted deeper (birdie-tier deaths 0–1 → 4–8 per 200),
but the **bogey-bar wall (25–32) still dominates** — and those deaths are blow-ups (penalty/pickup
chains), not missing birdies. The next real depth lever is course MANAGEMENT (club down off the tee
on tight corridors, avoid hero carries when the bar is loose), which is GS-cetus-6-adjacent AI work —
more aggression won't move it. Warp's practical ceiling after this tune: **median ~28, p90 ~35** on
a good build.

Boss scaling (GS-boss-scale) was calibrated in the same pass — strokes/hole for the top-rated boss:
4.16 (A0, byte-identical to before) → 3.91 (A4) → 3.86 (A8) → 3.74 (A12), with gear parity to the
run's bag tier and pin-hunting from A4. Knobs are constants in `match.ts`; see
`docs/decisions/rpg-meta-loop.md` (GS-boss-scale) for the full story, including why best-ball /
scramble "never seemed to make a difference" (they work — measured scramble Δ0.52, best-ball Δ0.85
strokes/hole — but the player-side partner is an auto-AI ball a skilled human out-plays ~always,
and the boss-side assist couldn't close the old fixed-skill gap).

---

## Addendum 2 (same day): warp with an N-ball CREW SCRAMBLE — and why hole 100+ is unreachable

**Question.** Can warp auto-play with a scramble assist (N balls per stroke, keep the best), what
does it do to depth, and how many balls would make 99.9% of warps reach hole 100+?

**Method.** `scripts/warp-scramble-depth.ts`: a warp-hole prototype built from the exported engine
pieces (`executeShot`/`pickBetterExec`/`layupTarget`/`aiClub`/`attackTarget`/`onePutt`) in
`playHole`'s exact loop shape — every stroke (full swings AND putts, unlike the boss-duel scramble
which is swings-only) plays N balls and keeps the best — driven through the real run loop
(`startRun → finishStop → shop → travel`, greedy shop, shallowest lanes, shipped pin-attack rule).
balls=1 reproduces the solo baseline (median 26), validating the harness.

**The headline: no ball count reaches hole 100 — the birdie wall is structural, not a skill gap.**
From hole 41 the bar is birdie-or-better on EVERY hole, so survival compounds exponentially:
reaching hole 100 means ~60 consecutive birdies. Measured per-hole birdie-or-better rates on
deep-galaxy holes (stop ~11, 300 seeds × 4 holes, attack armed):

| balls/stroke | birdie-or-better | par-or-better | E[birdie streak] | P(60 straight birdies) |
|---:|---:|---:|---:|---:|
| 1 | 16.4% | 48.3% | 0.2 holes | ~1e-45 |
| 2 | 31.1% | 67.2% | 0.5 | ~1e-29 |
| 4 | 46.8% | 79.7% | 0.9 | ~1e-18 |
| 8 | 62.5% | 88.3% | 1.7 | ~1e-11 |
| 16 | 69.8% | 92.2% | 2.3 | ~1e-8 |
| 32 | 76.1% | 93.7% | 3.2 | ~1e-4 % |

Each DOUBLING of the crew buys ~7–15pp of birdie rate with a hard asymptote well under the
~99.998%/hole that 99.9%-to-100 requires (some holes structurally refuse birdie to this AI: forced
lay-up par 5s, green-miss chip situations, and the pickup rule — a max-score pickup always fails
the gate, and even N compounded balls occasionally chain into one). Full-run sweeps confirm: at 32
balls/stroke the MEDIAN death is ~hole 40 and nothing in 60 seeds passed hole 58. **Hole 100+ is
not a warp-assist problem; it's the format's exponential design** (the same property the test
"every seeded run terminates by the bar" celebrates).

**What crew scramble IS good for: moving the MEDIAN, not the guarantee.** Full-run sweeps
(2000 seeds per ball count; 1000 for 8; greedy shop, shallowest lanes, shipped attack rule):

| balls/stroke | min | p0.1% | p1 | median | p90 | max | reach 24 | reach 32 | reach 36 | reach 40 | reach 48 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 (solo) | 0 | 1 | 9 | 27 | 34 | 43 | 75.5% | 25.4% | 5.5% | 1.4% | 0% |
| 2 | 7 | 9 | 16 | 32 | 39 | 45 | 91.4% | 55.4% | 24.1% | 9.8% | 0% |
| 3 | 7 | 13 | 17 | 33 | 40 | 50 | 95.0% | 68.7% | 36.9% | 18.1% | 0.1% |
| 4 | 9 | 13 | 18 | 35 | 41 | 50 | 96.2% | 76.5% | 45.0% | 24.9% | 0.3% |
| 8 | 12 | 14 | 20 | 37 | 43 | 55 | 97.9% | 85.1% | 58.2% | 38.1% | 1.4% |

Two hard lessons in the tails:
- **The 99.9% single-warp guarantee (p0.1%) barely moves**: hole ~1 solo → only ~13–14 even at 8
  balls. Blow-ups are CORRELATED — all N balls share the same aim/club DECISION, so a bad plan
  (a forced carry into a gale, a penalty-chain lie) kills the whole crew; more balls can't fix a
  bad decision. The guarantee lever is course management (the same GS-cetus-6 gap), not crew size.
- **Retries change the game**: a warp attempt is instant, so the practical metric is warps-needed,
  not per-warp certainty. With 4 balls: hole 32 lands in ≤5 attempts at 99.9% confidence
  (P=76.5%/attempt), hole 36 in ~12. Hole 40 stays expensive (~24) and 48+ is the exponential.

**Design recommendation.**
- Crew scramble as the warp assist is implementable in the engine as a `PlayHoleOptions`-style
  N-ball option (zero draws when absent, so byte-compat is free) — the boss-duel scramble machinery
  already proves the per-stroke best-of pattern; scramble the putts too (unlike the boss duel).
- **Crew of 4, default warp target the bogey wall (hole ~32), hard cap at the player's proven
  best.** That's a ~96% ride to hole 24 and ~77% to 32 per warp — with instant relaunch on a bust,
  effectively guaranteed delivery to where the game gets real. Past 41 the format is DESIGNED to
  kill everyone (birdie-or-better forever); that stretch is the endgame and should be hand-played.
- Mark crew-warped runs on the `endlessRuns` board (or exclude the warped prefix from gross/net) —
  a scrambled prefix isn't comparable to a solo card.
- **How many balls for 99.9% to hole 100+: no finite crew.** Per-hole birdie caps near ~76% even
  at 32 balls (table above) against the ~99.998%/hole that 60 consecutive gated birdies demand.
  If "resume at 100+" ever becomes a product goal, it needs a different mechanism (e.g. a banked
  checkpoint the format explicitly blesses), not a better AI or more balls.

**Shipped (same day):** the recommendation evolved in review — rather than crew scramble, warp
shipped as the **hidden automatic-birdie rule** (GS-warp): warped stops floor every hole at a
birdie (the mirror of the pickup rule), capped at the player's proven best so new ground is always
hand-played, with the last-runs board re-ranked by furthest hole and showing each run's honest
range ("1–49" vs "⚡ 50–67"). Full rationale in `docs/decisions/rpg-meta-loop.md` (GS-warp).

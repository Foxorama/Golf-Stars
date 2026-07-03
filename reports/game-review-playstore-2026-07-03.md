# Golf Stars — full-game review & Play-Store readiness

**Date:** 2026-07-03 · **Reviewer lens:** mobile UX + roguelike design + pro-golf feel + QA
**Method:** built the app, drove it on a 390×844 phone viewport through the real screens, plus
headless sim sweeps (200–400 seeds/cell) and independent code audits of the sim, meta-loop, and UI.

> Honest, impartial verdict up front, then the changes I shipped, then the backlog by impact, then
> the repo rules that are now wrong and need updating. Numbers are from the auto (reach-)AI — the
> sanctioned QA proxy — so they bound *baseline* play; a skilled human does better, but a **new**
> player plays at or below this line, which is what matters for a first impression.

---

## Verdict: a strong, polished BETA — not yet store-ready, but close in effort (weeks, not months)

This is genuinely impressive for its stage. The core golf shot UI is excellent, the art/screens are
professional, the architecture is disciplined (pure deterministic sim, 900+ tests, clean save
migrations), and the scoring math is smooth with no dead bands or trap characters. It is **far**
ahead of a typical hobby project.

But it is **not** something I'd put on the Play Store today. The blockers are not a rebuild — they're
tuning, polish, and a11y:

1. **~~A run-crashing generator bug~~ — FIXED this pass.** Void stops at galaxy depth threw an
   uncaught exception ~0.1% of the time; an Unending run *would* eventually white-screen.
2. **The flagship Voyage has a brutal first impression.** The baseline AI wins it **0 / 1500** runs
   and the default characters bust on the **opening stop ~40%** of the time — a fresh player can lose
   on hole 1 before any upgrade exists. This is a difficulty-curve defect at the worst possible place.
3. **Most players will never see the meta-progression rewards.** The baseline dies ~hole 9 in the
   endless mode; the first cosmetic unlock is at hole 40 and is reached **0%** of the time by the AI.
4. **Accessibility + onboarding gaps** that Google's pre-launch report will flag (non-semantic
   buy/reward cards, 9–10px low-opacity text) and no tutorial anywhere.

Fix 1 is done. 2–4 are tuning/polish. Call it a **strong beta**: ~2–4 focused weeks from a credible
soft launch, assuming a real human-play calibration pass on Voyage difficulty.

---

## What I changed this pass (shipped, tests green: 913 pass, typecheck clean, build OK)

| # | Fix | Impact | Files |
|---|-----|--------|-------|
| 1 | **Void-island run crash** — `generateCourse` throws on a rare unfair void config at depth; `currentCourse` had no catch → run crash. Added `generateStopCourse`, a deterministic reseed-and-retry wrapper at the RPG boundary + a crash-guard test on the real theme/depth path the old fuzz missed. | **High** | `run.ts`, `island-gaps.test.ts` |
| 2 | **"19th/20 · leading" HUD contradiction** — on the first tee the whole field is tied at 0, so the name-alphabetical tiebreak buries the player at ~19th while `gapToLead 0` prints "leading". Break exact-total ties in the player's favour → now reads **"1st/20 · leading"**. | **High** (visible on every first tee) | `league.ts` |
| 3 | **Leaderboard chip shown in the Unending Universe**, where survival is the per-hole par bar and there is no field cut — it implied a competition that doesn't exist. Gated to winnable (voyage) formats. | Medium | `app.ts` |
| 4 | **Two tautological death-spiral guards** — `MAX_OVER_PAR` caps gross at par+4, so `strokes >= 10` / `d >= 5` are structurally impossible and always measured 0. Replaced with the real floor-hit signal. Neutral biomes: 4.2% (still under the 0.05 bar — now meaningful). Sparse-bag characters: ~13% — turned into an explicit **regression fence** at today's ceiling, flagged as NOT contract #4's 5% target. | Medium (false confidence) | `biomes.test.ts`, `characters.test.ts` |

I deliberately did **not** unilaterally retune Voyage difficulty (finding H2) — it's a design-intent
call that needs a human-play calibration, and it fans out into the seeded competition tests. It's the
top backlog item below.

---

## Backlog by impact

### HIGH

- **H2 · The Voyage is a stop-0 coin-flip and unwinnable by the baseline AI.**
  Win rate **0.0%** across 1500 auto runs (all characters, both shop strategies). Default golfer
  `feather-fade` busts at stop 0 in **40%** of runs, reaches the first boss (stop 2) only ~14%, never
  past stop 4. Root cause: the positional cut. At stop 0 the field's survive-line averages ~10.8
  Stableford while the starter characters average ~10.5 — the intended opening golfers sit *just below*
  the elimination line before any upgrade can matter. A missed cut on hole-set 1 is the game's first
  impression. **Recommend:** widen the stop-0 survive target (e.g. top 18 of 20, cut only the bottom 2)
  and/or lift the starter bag a touch, then re-verify with a *human*-play sample, not just the auto-AI.

- **H5 · Accessibility: the whole progression economy is invisible to assistive tech.**
  Shop buy cards, StarMart, boss-reward selection, and all Trade-Market ship/apparel/bag cards are
  clickable `<div>`s with a bare `click` listener — no `role`, `tabindex`, or keydown. A keyboard or
  TalkBack user literally cannot buy gear, claim rewards, or equip cosmetics. Google Play's pre-launch
  accessibility report will flag it, and it blocks entire systems for AT users. **Recommend:** render
  them as `<button>` (they already visually behave like one via `.gs-clickcard`) or add
  `role="button" tabindex="0"` + a keydown handler, plus a `:focus-visible` style.

### MEDIUM

- **M2 · The meta-progression reward ladder is effectively unreachable.**
  The baseline AI dies ~hole 9 in the Unending Universe (median 8–10 for real characters; the
  neutral bag reaches ~24). The first cosmetic unlock is hole 40 — reached **0%** of the time by any
  auto config. Every Evergreen milestone (bag@40, cap@60, pants@80, Green Jacket@100, secret ship@150)
  requires a heavily stacked *human* build. A player may grind for hours and never see a single meta
  reward. **Recommend:** pull the *first* unlock much earlier (a hole-15–20 taste), and/or verify a
  maxed human can actually reach 150 before shipping the ladder as-is.

- **M4 · The voyage bust/gameover screen is the flattest screen in the game.**
  On a missed cut it's a red headline + "You reached stop 1, distance 0" + buttons — no standings, no
  hole-by-hole, no "you finished Nth of the field". The endless mode gets a rich score card + records
  board; the voyage bust gets nothing. This is the exact moment a player decides to re-run or quit, and
  it reads as an error page. **Recommend:** give it the same rarity-framed treatment as `resultScreen`
  — final placing, the round strip, and a clear "Run again" hook.

- **M5 · There is no onboarding/tutorial anywhere.**
  A new player is dropped into the shot screen with only "pull DOWN on the map" as guidance — no
  explanation of the aim cone %, wind, lie effects, the cut, credits vs shards, or the two currencies.
  For a systems-rich roguelike this is a real retention risk. **Recommend:** a 3–4 card first-run
  coach-mark pass on the first tee, dismissible and re-openable from settings.

- **M6 · Small, low-contrast text.**
  Numerous 9–10px labels at `opacity: .5–.62` on dark backgrounds (field cells, card sub-labels,
  shop metadata). Likely to trip Play's "low contrast / small text" pre-launch flags. **Recommend:**
  floor body text at ~11–12px and raise the low-opacity labels toward WCAG AA.

### LOW

- **L1 · Field size "/20" is shown after eliminations** — late in an arc where the field has thinned
  to 2, the HUD/result still reads "2nd/20". Show survivors, or "of the original 20".
- **L2 · Mid-stop "Return to title" silently discards holes played this stop** (the stop replays from
  its intro on resume). No run/credits lost, but a confirm or a note would be kinder.
- **L4 · Per-world difficulty spread ~1.9×** — spore-jungle plays ~0.85 to-par/hole vs dust-belt
  ~0.45 at max wildness. Both pass the bar, but the world you draw meaningfully swings your stop.
- **L5 · Latent fairness gap (benign today):** carry-reducing route effects (`gravityWell` 0.92,
  `dustStorm` 0.94) are folded in *after* `validateIslandHops` runs, so a void world reached via those
  lanes plays its fixed-yardage carries ~8% shorter than was validated. Inside the driver's headroom
  today, but it breaks the "fair by construction" guarantee on paper. Validate post-effect, or exempt
  island worlds from carry-reducing lanes.
- **L6 · Market cold-start:** a brand-new player opens the Trade Market to 0 shards and every section
  inert. Consider a tiny starting grant or a "play a run to earn shards" nudge.
- **L7 · Stale comments:** `league.ts` / `golferCards.ts` still describe the retired "flat/ladder"
  formats for code that is now the live endless path — comment rot, not dead code.

### What's genuinely good (don't regress these)

- The **shot UI** is the star: probability-zoned aim cone (82/12/2%), live carry band (123–273y),
  blocked-zone shading probed from the sim's own flight walks, and a shot-result card with
  carry/roll/accuracy/lie. This is better than most shipped mobile golf games.
- Title, character select, arc intro, and hole intro are **polished and professional** — clear
  hierarchy, good tap targets, painted scene art, readable maps.
- **Scoring curve is smooth** (13.6→9.1 mean Stableford across wildness, monotonic; parallel,
  well-separated character curves — no dominant or trap golfer).
- **Engineering is solid:** no `Math.random` in the sim, auto≡interactive holds, the v1→v16 save
  migration chain is clean and one-step, economy can't go negative, no softlocks in the reducer, the
  title-placeholder save-wipe guard is intact.

---

## Repo rules & guidance that are now wrong (per the request to call these out)

The constitution (`CLAUDE.md`) is unusually good, but three load-bearing claims are currently false:

1. **Contract #4 promises "< 5% blow-ups" — this was never actually tested and isn't met.**
   The guards that supposedly enforced it (`strokes >= 10`, `d >= 5`) are impossible given the par+4
   cap, so they measured nothing. The *real* floor-hit rate for the sparse starter bags is ~13% at max
   wildness (and ~11% even on **calm** courses — higher than mid-wildness, which is itself suspicious).
   I've made the guards honest; the contract text should now say the 5% target is **aspirational and
   deferred** to the GS-cetus-6 rebalance, not a satisfied invariant. Don't claim an invariant a test
   doesn't hold.

2. **"Baseline auto-AI dies ~hole 24" (IDEAS.md / GS-unending) is measured on a bag players never
   pilot.** That's the neutral full bag; the actual shipping characters die at ~hole 9. Re-baseline the
   note on a real character, or the whole endless difficulty ladder is calibrated against a phantom.

3. **"generateCourse throws on violation … no retry … fair by construction" was too absolute.**
   At the RPG boundary an uncaught throw is a *crash*, not a fairness guarantee. `generateStopCourse`
   now retries; the constitution should note that the throw is a last-resort assertion the RPG layer
   must catch, and the *proper* fix is `separateIslandGaps` respecting the validator's merge threshold
   in the same units (the root cause is still open — I shipped the safe production guard).

Minor: the "Character select fits ONE screen in every mode" claim is close but tall on small phones;
the stale flat/ladder comments (L7) should be swept.

---

## Suggested next sessions (one focused change each, per the repo's own rule)

1. **Voyage stop-0 difficulty** (H2) — widen the opening cut + human-play calibration.
2. **A11y pass** (H5) — buttons for all clickable cards + focus styles + text-size floor (M6).
3. **Endless first-unlock pull-forward** (M2) — a hole-15 taste + verify hole-150 is human-reachable.
4. **Gameover recap parity** (M4) + a first-run tutorial (M5).
5. **Root-cause the island-gap sizing** so `generateStopCourse` never needs to retry.

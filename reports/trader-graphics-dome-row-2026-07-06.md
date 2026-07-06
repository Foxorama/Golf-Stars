# Trader-graphics bug report — dome row on the decision map (2026-07-06)

## Symptom (two phone screenshots, parked in `Bug info/trader graphics/`)

On a tradeMarket-effect stop (desert world, boss duel vs Rotanev, hole 2/9 par 3), the decision
map showed a row of **five dark dome/arch silhouettes with glowing doorways along the very bottom
edge of the play view**, clipped by the club-selector panel — reading as flat, floating nonsense
rather than tents ringing the green. No bright tent ring was visible at the green.

## Diagnosis: a stale build, not a live bug

The domes are a **pixel-perfect match** for the *old* screen-space "trade caravan" decoration
(`weather.ts drawTradeCamp`), which drew exactly:

- 5 dome-tent silhouettes (`fill rgba(28,22,30,0.78)`) at `x = W·(0.18 + i/4·0.64)` →
  18/34/50/66/82 % of screen width — precisely where the domes sit in the screenshots;
- a glowing warm doorway ellipse on each (the pale ovals in the screenshots);
- a warm ground glow band at `y = 0.84·H` — right where the row sits, above the controls.

That code existed on `main` for only ~12 hours: added in `d8366fb` (GS-journey-fx, #146, merged
2026-06-29 21:15 UTC) and **removed** in `a603973` (GS-tents, #155, merged 2026-06-30 09:11 UTC =
7:11 PM AEST), which replaced it with the collidable course-space tent ring (`src/sim/tents.ts` +
`styleTents` in `src/render/style.ts`). The absence of the bright tent ring at the green in the
screenshots is the same fingerprint — the ring didn't exist yet in that build.

So the screenshots capture a session on a build from that Jun 29–30 window (or an offline
service-worker serve of it), not the current game.

## Verified on the current code (this session)

- `drawTradeCamp` / the dome-row drawing exists **nowhere** in the current tree (grep of `src/`);
  the tradeMarket weather layer is now only a warm horizon tint + rising lantern motes.
- `scripts/tents-preview.mjs` (vite-node against the real render layer) renders the tent ring
  correctly on the current code: all five `TENT_FILLS` roof colours present in the generated SVGs
  across verdant/desert/void, whole-hole and green-zoom framings. (Chromium couldn't spawn on this
  machine so the check was on the generated SVG markup, which is the static scene itself.)
- Boss stops are covered: every play-screen render path passes `tradeTents: tentsActive()`
  (app.ts), which reads `course.meta.effect` — stamped for boss stops too (`ui/game.ts` also arms
  the boss sim's tents via the same effect).
- The **live GitHub Pages deploy is post-fix**: the deployed bundle at
  `https://foxorama.github.io/Golf-Stars/` contains `"Welcome to StarMart!"` (a string introduced
  by the tent-interactions system, i.e. after #155).

## Outcome

**No code change.** The bug was fixed by #155 before this report; the network-first PWA service
worker guarantees the next online load serves the fixed build. `Bug info/` (the two screenshots)
was deleted in favour of this report. No gallery re-shoot needed (no `style.ts` change).

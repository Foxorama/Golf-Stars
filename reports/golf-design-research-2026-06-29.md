# Golf hole / hazard / green design — research reference (2026-06-29)

Synthesised from five parallel web-research passes (Fried Egg, USGA, Golf Course Industry,
LINKS, Top100, Golf Club Atlas, golf.com, course guides). WebFetch was 403-blocked on most
premium golf domains, so figures come from search extracts of those pages — concepts are
cross-corroborated; single-source numbers are flagged in the source agents. This is the design
charter for the GS-shapes-2 / GS-hazards-2 / GS-greens-2 / GS-worlds generator pass.

## Hole archetypes (shape × length)
- **Par bands (men, back tees):** P3 ≤ 250 yd; P4 240–490; P5 450–710. Routing mix ≈ 4/10/4.
- **Dogleg bend:** typical 10–45°, severe up to 90° (hairpin). Corner sits at the landing zone
  (~halfway, ~the drive finish).
- **Double dogleg / S-curve:** par-5s; bend one way then back (S) or same way twice (Cardinal).
- **Cape / heroic carry:** diagonal tee shot over a hazard, "bite off as much as you dare"; green
  sits close to the same hazard, angled. Par-4 ~310–450 yd. Continuous risk dial.
- **Drivable par-4:** ~280–320 yd, large contoured green, guarded so the layup is also strategic.
- **Reachable par-5:** up to ~520–540 yd reachable in two; keep one "untouchable" 550–600+.
- **Short/long par-3:** short ≤150, mid 150–200, long 200–250. Island par-3s ~105–155 with a tiny
  green (2,500–3,900 sq ft); long water carries (>160–170 yd) brutal for average players.

## Template holes (Macdonald/Raynor) — generation rules
- **Redan** (P3 180–230): green long-axis rotated ~45° R→L, tilted R→L + front→back, a kick slope
  feeding a right-landing ball down-left; deep bunker front-left; pin biased back-left.
- **Biarritz** (P3 210–240): very long green (50–80 yd) with a transverse 3–5 ft swale at mid-green;
  narrow bunkers both flanks.
- **Eden** (P3 160–180): green tilted back-to-front; bunkers left / deep front-right / long / short-
  right; safe miss = short.
- **Punchbowl** (any par): green below its surrounds, mounds funnel shots toward centre (forgiving).
- **Alps** (P4 ~400–430): blind ridge across the approach + hidden front cross-bunker, often feeding
  a punchbowl.
- **Cape** (P4 ~310–450): diagonal bite-off hazard off the tee; angled green, water/bunker on 3 sides.
- **Short** (course's shortest P3): oversized green ringed by deep bunkers + a central thumbprint
  depression splitting it into sub-targets.
- **Double Plateau** (stout P4): two raised plateaus split by a lower section; "nose" bunker cluster
  short, heavy greenside sand.

## Strategic design schools (the lenses)
- **Penal** = one right shot, no bail-out (tight corridor). **Strategic** = multiple routes, the safe
  route longer/worse-angled, hazards guard the *desired* position. **Heroic** = unavoidable carry with
  room to bail, reward ∝ how much you carry (our diagonal rivers/creeks already do this).
- MacKenzie: strategic > penal; "abhorred water as a penalty"; "freedom from annoyance / no lost
  balls" — direct backing for our non-penalty trees + fair-by-construction rule.
- Classic strategic layout: fairway bunker one side, greenside bunker the **opposite** side, so
  flirting the fairway bunker opens the green angle. Centreline bunkers > side bunkers when fairway
  is ample. Hazard "in the natural line" is most interesting.

## Hazard vocabulary (3 penalty classes)
- **Penalty areas** (water/burn/creek/barranca/ravine): +1, drop. **Bunkers** (sand/pot/waste-feel):
  recoverable distance tax (sand ~50%; pot worse, can force lateral/back escape; waste NON-penalty,
  ground the club). **OB = stroke-and-distance** (worst). **Trees/fescue/gorse/mounds = NON-penalty
  distance taxes**.
- New hazard kinds worth adding: **pot bunker** (deep, big tax), **fescue/native** (thick non-penalty
  rough), **ravine/chasm** (penalty forced carry), **cross/diagonal bunker complex** (carry off the
  tee), **Church Pews** (perpendicular grass ridges in a long bunker), **chocolate-drop mounds**
  (non-penalty), **internal OB**, **railway sleepers/bulkheads** (carom).

## Difficulty knobs (USGA factors)
- **Fairway width** at landing zone: easy ~40–50 / medium ~30–35 / hard ~20–25 / brutal ~15 yd.
  USGA: scratch needs 32 yd at 250 yd; bogey needs 40 yd at 200 yd. (Our `widthScale = 2.0 −
  1.25·wildness` already does this knob.)
- **Driving ladder:** amateur ~217 / single-digit ~250 / scratch ~280 / tour ~290–300.
- Others: rough recoverability, green size/speed, hazard count & in-the-line placement, forced-carry
  distance, wind exposure, length (effective, after roll/wind/elevation).

## Greens
- **Size:** tiny <3,000 / normal 5,000–6,000 / large >8,000 / huge >10,000 sq ft. Par-3 greens
  smaller, par-5 larger. **Depth:** medium 25–40 yd, deep 40+ (back pin ≈ +depth in club).
- **Multi-tier:** step ~1–2 ft mid-green (two-tier) — wrong-tier putt ≈ 10× the 3-putt rate; model as
  lag/dispersion penalty. **False front:** steep front rejects a short shot back into the fairway.
- **Crowned/turtleback** (Pinehurst): sheds off all sides, effective target ~50% of geometric area.
  **Punchbowl:** gathers toward centroid (forgiveness). Both map onto our star/kidney green system.
- **Slope:** cupping ≤3% (≤2–3% within 2–3 ft of cup); max puttable slope falls as green speed rises.
- **Pin:** ≥4–5 paces (~15 ft) from edge; rotate front/middle/back; tucked Sunday pins near edges/
  behind hazards. (Our GS-6 pin model already aligns.)

## Fairways
- Landing-area width 25–40 yd; long par-4s should be WIDER; progressive narrowing 200→300 yd taxes
  bombers. **Fairway bunker** at the target player's expected carry. **Split fairway** = risky-short
  (best angle, hardest) vs safe-long.

## Variety principles
- Vary length within each par class (hit every club); vary dogleg side L/R; "box the compass" so wind
  hits differently each hole (our per-hole random wind bearing already gives this); no two consecutive
  holes alike. Par mix 4/10/4, balanced nines.

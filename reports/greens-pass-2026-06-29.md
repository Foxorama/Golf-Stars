# Greens pass — 2026-06-29 (GS-greens-3)

A deep pass over the greens: give them real SLOPE that affects the ball, and make putting an
interesting two-axis skill. Shipped as two merged PRs.

## What shipped
- **Green slope (#133).** Every green carries a downhill fall-line vector — biome-flavoured (frost
  ice-shelves tilt hard, desert greens run flat), drawn from a side rng so adding it left every
  existing course's terrain byte-for-byte unchanged. The **approach roll** is modulated on the green:
  a ball rolling downhill runs out far, one rolling — or **backspinning** — uphill brakes hard and
  can't climb, so a ball never spins weirdly UP a slope (the behaviour to revisit once slope perks
  exist). Pure geometry / straight roll, so the roll-invariant and the renderer's straight run-out
  both hold. The renderer shades the green's high/low sides + draws fall-line arrows.
- **Putting break + green caddies (#134).** Manual putts now **break** along the slope — the ball
  curls downhill, scaling with distance^1.35 and inversely with pace (a firm putt holds its line). To
  hole a sidehiller you must **aim high** (◄/►) to read it; the putt screen draws the predicted curved
  break line from the *same* model the resolver uses, so the line you see is the line the ball takes.
  **Mystic Mole** was upgraded from a generic make-band widen to a true **green reader** — he snaps
  your aim to the ideal slope-compensated line and shows the read, so you only judge pace. Penelope's
  auto-putt is unchanged.

## Engineering posture
- **Auto putting stays flat, byte-for-byte.** Slope/break is an interactive-manual-putt enhancement
  (the same "auto≡interactive, manual is interactive-only" split the project already uses). So the
  death-spiral bars, the `onePutt` model, and every seeded test are untouched; `manualPutt` with no
  slope / aim 0 is the old straight putt exactly.
- Verified eyes-on (`scripts/putt-preview.mjs`): the break line curls true and the aim reads correctly
  across frost/verdant/crystal greens.

## Next (see IDEAS.md)
- **GS-greens-4** — template green COMPLEXES on top of the single linear tilt: Redan feed slope,
  Biarritz swale, punchbowl gather, crowned/turtleback shed, false-front reject, two-tier greens.
- **GS-slope-perks** — abilities that bend the slope rules (a real backspin/zip that CAN check uphill,
  a cheaper green-read, an uphill magnet). The "until we add perks" caveat in the slope code is the hook.

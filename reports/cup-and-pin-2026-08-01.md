# The hole is a hole again (GS-cup-real) — 2026-08-01

Follow-up to `play-test-fixes-2026-07-31.md`, which fixed the drawn cup by pinning it to the sim's
catch radius. The play-test came straight back:

> *"it's still slightly too large in fairway view and fairway watch view … it's way too large in
> chipping and chip watch view, the ball still rolls over the hole graphic without going into the
> hole … it's probably twice as large as it should be in green and green make view, the flag also
> needs to be a bit bigger as we made the hole bigger without making the flag bigger … we
> over-corrected and made the hole too big and it looks weird now."*

Both reports are true, and the second one is the interesting half.

## The number that was never a hole

`HOLE_OUT_RADIUS` is **1.2 yards**. A real hole's radius is 0.059 — so the catch radius is about
**twenty times a real cup**, and it is a *gameplay* generosity, not a piece of ground. Drawing it is
what made the crater. Measured at the cameras the game actually plays at (design frame, so these are
what the painter sees):

| view | px/yd | old cup r | old width | new cup r | new width |
|---|---|---|---|---|---|
| fairway decide | 1.0 | 1.20 | 2.40yd | 1.20 | 2.40yd |
| fairway watch | 2.6 | 3.12 | 2.40yd | 2.31 | 1.78yd |
| chip decide | 7.1 | 7.75 | 2.18yd | 3.47 | 0.98yd |
| chip watch | 13.0 | 8.41 | 1.29yd | 4.32 | 0.67yd |
| green (20yd putt) | 10.4 | 8.15 | 1.57yd | 3.98 | 0.77yd |
| green make (3ft) | 15.6 | 8.64 | 1.11yd | 4.63 | 0.59yd |

The green and chip cameras roughly halve, which is what was asked for; the fairway cameras — where
the complaint was only *"slightly"* — barely move, because out there the catch radius is still what
binds (GS-cup-oversize, unchanged).

## Why it could not simply be shrunk before

The cup was pinned to the catch radius because a ball could be **holed while drawn lying outside
it**, which is the opposite lie and the one that started all of this (*"the ball often kind of
misses the hole, but still sinks"*). Shrink the circle without fixing that and the old bug returns.

Except two of the three paths had already been fixed and nobody noticed the third:

- `manualPutt` / `onePutt` return the pin for a holed putt (GS-putt-holed-position);
- the Chipinski chip-in trickles into the cup along a contour-broken Bézier (GS-chipin-roll);
- **an ordinary shot resting inside `HOLE_OUT_RADIUS` was flagged holed and left where it stopped.**

That is up to 1.2yd — 7 to 17 screen pixels at the chip and putt cameras — of visible daylight
between a ball and a hole it had supposedly just gone into. It is the same defect, in the path that
carries aces and holed approaches.

`finishInCup` is now the one seam both branches call: it appends the trickle, folds the arc into
`roll`, and moves `rest` to the cup. Pure geometry after an outcome the sim had already decided —
**zero rng draws, zero strokes moved** — so every seeded stream, fixture and balance bar is
byte-for-byte. The full suite passed unchanged (2636 tests, 0 skipped).

With the finish honest, the drawn cup no longer has to cover the sim's generosity.

## The cup gets its own curve, and that is the actual finding

The old rule was `cup = ball × 2.8` — real golf's own proportion, and *arithmetically correct*. It
still looked like a bomb crater, and the reason is worth writing down:

> **The ball is read against nothing; the cup is read against the green.**

A white speck on turf reads as a golf ball at any size, so the ball can carry an ~11× exaggeration
invisibly. Put the *same* exaggeration on the hole and the eye immediately compares it to the green
it is cut into and the pin standing in it — and it is enormous. The two objects cannot share an
exaggeration factor.

So the cup gets the ball's *shape* (floor + sqrt growth + cap) with its own constants. Drawn width
falls from 2.4yd at range to 0.29yd at a tap-in: you zoom in to see closer to the truth, exactly as
the ball does. Two ceilings survive and are now slack at every camera — never wider than the radius
that catches, never past `ball × CUP_MAX_RATIO` — kept because they are the rules, not the
arithmetic.

The floor is set by the constraint that actually bites: **the cup must stay wider than the ball at
the cameras you hole out at** (1.28–1.5×), or a ball on the lip hides the hole it is dropping into.

## The flagstick

A flat 14 units at every zoom. Right at range — out there it is not a stick, it is the marker that
says where the pin is, and the cup itself is under a pixel — and wrong on the green, where it stood
*shorter than the hole beside it was wide*. It is a real object, 7 feet of it, so it is drawn in
yards like every other piece of ground (GS-green-complex), floored at the old 14 (every fairway
camera byte-for-byte) and capped at 30 before a tap-in turns it into a mast. The flag scales on one
`k` with the stick, so the pin stays one object rather than a banner sliding down a pole.

## Guards and eyes-on

- `tests/cup-and-swallow.test.ts` — the shipped curve pinned in px *and in yards* (the number that
  says what the player is looking at); the far cameras still bound by the catch radius; the flag
  read out of the built prims, and asserted taller than the cup is wide at every camera; the holed
  shot swept over 400 generated holes.
- `scripts/cup-preview.mjs` — new. Renders the six play cameras with the cup and ball radii in the
  caption. ⚠️ It renders at the **design frame**: a smaller cell mislabels every camera (the first
  cut used 250×340 and reported the green at 6.7 px/yd instead of 10.4).

## Loose end, deliberately not taken

The honest fix for the last of the exaggeration is to shrink `HOLE_OUT_RADIUS` itself — 1.2yd means
*any shot finishing within 3.6 feet is holed*, which is generous enough to be a design decision in
its own right. That is a **balance** change and goes through the death-spiral harness (contract 4),
not in behind a render fix.

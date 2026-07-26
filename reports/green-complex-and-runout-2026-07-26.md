# The green complex, and what happens when the ball gets there — 2026-07-26

Three PRs off one playtest report. Written up together because two of the three turned out to share a
single root cause, and finding it changed how the third was diagnosed.

| PR | What | Kind |
|---|---|---|
| [#593](https://github.com/Foxorama/Golf-Stars/pull/593) | GS-green-complex — turf blends in yards, greens mown in their world's grain | render |
| [#594](https://github.com/Foxorama/Golf-Stars/pull/594) | GS-green-backstop — the ground behind the green is defended | generator |
| [#595](https://github.com/Foxorama/Golf-Stars/pull/595) | GS-runout-feel — ballistic land / bounce / run-out + a slow backspin check | render |

## The report

> the fairway, green s and green aprons still aren't blending properly, they look like art assets
> stacked on top of each other instead of one smooth hole and most of the green areas still look very
> similar. some biomes have water and bunkers behind the greens, but there's virtually no trees or other
> hazards to punish going long on a green.
>
> and what might be completely separate but feels connected is that a ball landing from a shot onto the
> green contours and the backspin animation doesn't feel like a natural golf ball flight. in the words of
> one tester, it looked like the ball landed and then teleported away.

The word **"still"** in the first sentence is the interesting part. Blending the green complex had been
attempted at least five times (GS-green-apron, GS-fairway, GS-fairway-2, GS-mow-blend, GS-green-blend),
each shipping a real improvement, and the complaint kept coming back in the same words.

## The root cause the five previous passes missed

**Every turf blend on the hole was measured in PIXELS on the projected polygon.** `offsetPoly(sp, -6)`,
`sw: 9`, `shiftPoly(…, 3)`.

- The whole-hole map runs at **~1 px/yard**. 6px reads as a plausible six-yard apron.
- The chip/putt camera runs at **~6.6 px/yard**. The same 6px is **under a yard of ground.**

So at the one camera where the player leans in and studies the turf, every mown transition on the hole
collapsed to a hairline and the green butted the fairway on a hard cut. And every previous pass had been
eyeballed with `scripts/gallery.mjs`, which shoots at map zoom — the zoom where the code was already
right. Five passes, all tuned blind to the camera the complaint came from.

The generalised lesson, now in CLAUDE.md: **anything tuned in pixels or in milliseconds at map zoom is
wrong at green zoom.** Blend widths belong in course yards (`turfPx`), scaled by the projector.

That lesson is what cracked the third PR too. "The ball landed and then teleported away" turned out to be
the *same* bug in the time dimension: the run-out ran for `20ms × yards` floored at **150ms**, a floor
tuned at map zoom and played at 6.6× the pixels per yard.

## Second cause: the greens were dressed identically everywhere

However distinct the generator makes a green's shape (`greenSize` / `greenAspect` / `greenIrregular` per
biome profile), the render gave every one of them the same two-ring apron and
`stripes(poly, …, 6)` — **always horizontal, on every world** — while fairways have had per-world mowing
grain since GS-variety-2. A vertically-swept frost corridor met a horizontally-striped green at a hard
seam. Two materials butted together, on every world, at every hole.

The pattern dispatch moved to `shared.ts mowPattern`; the green now mows in its own world's grain off the
corridor's band grid, and per-world presentation is a row (`GREEN_COMPLEX`).

## The failure worth recording

The first preview of PR #593 was a straight failure. With the collar at apron width and α 0.5, every
world's putting surface dissolved into its corridor. Seamless — and unreadable.

That is a **fairness** bug, not a polish miss. The golf-soul rule is that an absurd course still has to be
readable, and if you can't see where the green ends you can't judge a chip. The shipped shape is
asymmetric by design: a WIDE apron, a deliberately NARROW collar, and the surface keeping its own base
fill plus an inward edge ease that re-states its outline. `tests/green-complex.test.ts` pins it.

## Behind the green: the census was worse than "virtually"

2,250 generated holes (10 worlds × 25 seeds × 9 holes), measuring hazard material in the arc beyond the
green:

| world | holes with something long | avg blobs | **avg TREES** |
|---|---|---|---|
| verdant-station | 76% | 1.36 | **0.08** |
| dust-belt | 70% | 1.10 | **0.00** |
| ice-ring | 72% | 1.20 | **0.04** |
| spore-jungle | 68% | 1.11 | **0.11** |
| earth-links | 71% | 1.17 | **0.00** |

Every blob incidental — a greenside pot that happened to draw an angle past the pin. **No pass in the
generator had ever placed anything behind a green on purpose.** After: 79–95% of holes defended long,
~0.8 tree blobs per hole on a parkland world, 0.00 on the links where sand and fescue do the job.

Balance came out **neutral** (toPar/hole 0.8962 → 0.8958, blow-ups 9.44% → 9.51%), because the auto AI
clubs to *reach* a green and rarely flies it — its misses are lateral. Worth being explicit about: **the
auto bars do not validate this feature's difficulty.** Long is the one miss the *player* controls (it's a
club choice, not a swing error), so this is a punish for the human miss and needs eyes-on play to confirm
it lands.

## Found and deliberately not fixed

`lieAt` gives hazards precedence over features, and `clearGreenOfPenalty` only drops **penalty** blobs
(the GS-green-clear ice/lava fix). Nothing stops a bunker, pot, deep-rough, fescue or tree blob from
biting a slice of the putting surface and turning it into that lie. Measured across 1,080 holes:
**21.9% carry at least one** — `deeprough` 73, `pot` 59, `bunker` 64, `fescue` 57, `trees` 46, `waste` 4.
A tree lie ON a green is the worst of them. The pin and green centre stay clean (`tests/lie.test.ts`
guards those), which is why it has gone unnoticed.

Logged as **GS-green-surface-bite** in IDEAS.md. The fix shape is clear (generalise the post-filter,
still pure and drop-only, which can only raise Stableford); the open question is the drop RULE, since
dropping a whole greenside bunker over a sliver overlap would delete a lot of legitimate sand. Wants its
own PR and its own balance re-measure.

## What still needs eyes-on

- The run-out and the backspin check are a **feel** change. The tests pin their physics properties (no
  speed step at touchdown, fastest-first with deceleration on contact, long enough to read); they cannot
  tell you it looks right in the hand. Tunable live through `_gsFeel` — `bounceShareFirm`,
  `restitutionFirm`, `hopApexFrac`, `backspinMsPerYd`, `runoutMinMs`.
- The behind-green defence at high wildness on the worlds with dense `treeDensity` (spore jungle, verdant)
  — the census says ~0.8–1.0 stands per hole, which should frame the green rather than smother it, but a
  full round is the test.
- The apron at putt zoom on the wide-apron worlds (desert 10yd, earth-links 11yd) reads as a broad soft
  halo. Correct in principle — those are links run-offs — but worth a look on a phone.

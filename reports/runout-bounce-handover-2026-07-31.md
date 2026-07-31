# The bounce reads as "lands and sticks" — measurement + handover

**2026-07-31** · triggered by a play-test: *"it definitely seems like driver is the only club that
visually shows a ball bounce… woods, hybrids and long irons don't really have any bounce animation,
they land and just stick."*

Measured with `npx tsx scripts/runout-frames.ts`, which reconstructs the DRAWN run-out frame by frame
from the shipped functions (`planRunout` / `sampleRunout` / the same `flightScaleFor` the sim
resolves a shot with). Nothing below is re-derived, so a fix shows up in the same table.

---

## The finding: hops are PLANNED and then not DRAWN

The report is real, but the cause is **not** the one we assumed (the drawn ball eating the apex).
Apex height is fine — 5–12px against a ball drawn at ~3px on almost every row. GS-runout-visible
already fixed that.

What is wrong is the **tail of the hop train**: the model plans 2–6 bounces and the player sees one
or two.

### Firm fairway (firmness 0.85) — where woods / hybrids / long irons actually land

| club | carry | roll | hops planned | **hops seen** | apexPx | hop% of run |
|---|---|---|---|---|---|---|
| D @1.0 | 272 | 38.1 | 6 | **2** | 9.3 | 57% |
| D @0.7 | 190 | 26.7 | 6 | **3** | 12.3 | 57% |
| 3W @1.0 | 259 | 27.2 | 5 | **2** | 8.1 | 62% |
| 3W @0.7 | 181 | 19.0 | 5 | **2** | 10.7 | 62% |
| 4H @1.0 | 182 | 13.6 | 3 | **2** | 8.9 | 45% |
| 4H @0.7 | 127 | 9.5 | 3 | **1** | 6.2 | 45% |
| 3i @1.0 | 165 | 10.7 | 4 | **2** | 9.4 | 67% |
| 7i @1.0 | 141 | 7.7 | 2 | **1** | 6.6 | 44% |
| 9i @1.0 | 120 | 6.6 | 2 | **2** | 11.1 | 48% |
| PW @1.0 | 106 | 5.3 | 2 | **1** | 9.0 | 43% |
| SW @0.7 | 52 | 1.4 | 1 | **0** | 2.7 | 35% |

**A driver plans SIX bounces and shows TWO.** A 3-wood plans five and shows two. That is the whole
report: you see one decisive skip, maybe a second, then a long silent roll — which reads as landing
and sticking.

### Soft green (firmness 0.45)

**`seen` is 1 on every single one of the 40 rows.** Not one club on a green shows a second bounce.

| club | roll | hops planned | **hops seen** | hop% of run |
|---|---|---|---|---|
| D @1.0 | 38.1 | 3 | **1** | 27% |
| 3W @1.0 | 27.2 | 3 | **1** | 31% |
| 4H @1.0 | 13.6 | 2 | **1** | 25% |
| 3i @1.0 | 10.7 | 2 | **1** | 34% |
| 7i @1.0 | 7.7 | 2 | **1** | 39% |
| 9i @1.0 | 6.6 | 2 | **1** | 42% |

The surface does not change the sim's roll (the `roll` column is identical across both tables) — it
changes the **hop/roll split**: 45–67% of the run is hops on a firm fairway against 25–42% on a soft
green. So a green both plans fewer hops and gives them less ground.

### The genuinely invisible ones

`SW @0.7 / 0.55 / 0.4` draw **no** visible bounce on either surface (apex 1.6–2.7px under a 3px
ball). These are 30–52yd partials with ~1yd of roll — a plop, which arguably correctly has no
bounce. **3/40 on both surfaces.** They are the only rows the script currently flags.

---

## What to change, and what it costs

The play-test instinct was *"over-exaggerate the bounce distance… it'll change the balance slightly
as we'll need to reduce the carry a bit."* Half right, and the halves have very different prices:

**1. Free — redistribute the roll (render-only, no harness).**
`hopLenK` and the apex decay decide how the sim's EXISTING roll is divided between hops and the
closing roll. Making the surviving hops longer and decaying the train more gently changes no
distance the sim computed — total run-out is unchanged, so contract 4 is untouched and the
death-spiral harness has nothing to weigh. **Try this first.** The driver planning 6 and drawing 2
says there is a lot of headroom here before anything has to be bought.

**2. Not free — buy more roll with carry (balance change, needs the harness).**
`runFrac` / `carryFrac` in `FLIGHT_PROFILES`. Only reach for this if lever 1 cannot get `seen` to 2
on the mid-bag. The case for it is the mid-iron numbers on a GREEN: a 7-iron has 7.7yd of roll and a
9-iron 6.6 — there may genuinely not be room for two visible bounces in that, whatever the split.
**If you spend here, re-run the death-spiral harness and record both numbers in the commit**
(contract 4), and remember GS-runout-ladder's coupling: greens must still HOLD (`SURFACE_ROLL.green`
was cut 0.7 → 0.55 for exactly this reason), and the default aim must not ask for a carry the bag
cannot fly (`carryableBefore`).

### Rules to respect while tuning

- **`hopDrawBoost` must stay modest.** Height is exaggerated and length is not, so it multiplies the
  drawn ratio directly and a big value turns a skip into a pop-up. It is 5.4 and it is not the lever
  here — apex is already fine.
- **Don't re-introduce the pop-up.** `apexOverLenFor` is `tan(descent)/4`, derived, not tuned
  (GS-runout-visible). A driver skips at 0.18 and a wedge pops at 0.47 because that IS the physics.
- **The target is 2–3 visible, not 6.** The play-test explicitly said *"we don't want too many extra
  bounces"*. Getting `seen` to 2 on the mid-bag and 3 on the long clubs is the goal; matching
  `planned` would be a stutter.
- **Measure, don't eyeball.** Re-run `scripts/runout-frames.ts` and read the `seen` column on BOTH
  firmness bands. The last two times this area was tuned from impression the wrong number moved.
- Feel beats literal accuracy here — the play-test was explicit that *"the important part is that it
  'feels' accurate"* — but the fences in contract 4 are still the fences.

---

## DECIDED: close the gap by planning FEWER, BIGGER hops — not by inflating the tail

A second measurement pass settled which way to close it, and it rules one option out on physics
rather than taste.

**The apex is not free to grow.** `runout.ts:422` caps every hop at `want * apexOverLen`, and
`apexOverLen` is `tan(descent)/4` — DERIVED, not tuned (GS-runout-visible). A driver landing at 38°
gets 0.195, so a hop can never be more than about a fifth as tall as it is long. Hop LENGTH then
decays as `kh²` (`runout.ts:426`), so a driver's sixth hop is ~1.6yd long, which caps its apex at
~0.31yd ≈ **1.5 drawn px, under a 3px ball**. Working it back, that hop would have to stay ~4yd long
to clear the bar, and six hops of 4yd do not fit in the 21.7yd the run-out gives to bouncing.
Softening the length decay to `kh^1.2` still only reaches ~1.9px.

So a driver's late bounces are GENUINELY scuffs, and raising `hopDrawBoost` or overriding the
`tan(descent)/4` cap to show them would mean abandoning the derived apex rule that exists precisely
to stop this area being tuned by feel — and turning skips into pop-ups, which CLAUDE.md warns about
directly. **Rejected.**

**Chosen instead:** bring `planned` DOWN to meet what can actually be drawn, so every hop the model
plans is a hop the player sees.

### The actual complaint is the MIDDLE of the bag, on the FAIRWAY

Refined from the play-test: *"I'm fine with the driver keeping the same number of bounces, it's
primarily the middle range of clubs that just land and stop on the fairway."* That re-points the
work, because the driver was never the problem — it is the only club whose first skip is big enough
to read.

The mid-bag on a firm fairway, from the table above:

| club | roll | hop% of run | planned | **seen** |
|---|---|---|---|---|
| 4H @1.0 | 13.6 | 45% | 3 | **2** |
| 4H @0.7 | 9.5 | 45% | 3 | **1** |
| 3i @1.0 | 10.7 | 67% | 4 | **2** |
| 7i @1.0 | 7.7 | 44% | 2 | **1** |

A 4-hybrid at 0.7 power splits 45% of 9.5yd — about 4.3yd — across THREE hops, so they come out
roughly 2.1 / 1.4 / 0.8yd. At `tan(descent)/4` those last two cannot clear the ball. Split the same
4.3yd across TWO hops (≈2.6 / 1.7yd) and both are drawable. **Nothing about the distance changes —
only how many pieces it is cut into.** That is the whole of lever 1, and it is still render-only:
no carry, no harness.

Note the mid-bag also gives hops a SMALLER share than the long clubs (44–45% for 4H/7i against
57–67% for D/3W/3i). Raising that share for those classes is the second half of the same lever, and
also costs nothing — it moves ground from the closing roll into the bounce, not from carry.

### Levers, in order

1. **`hopMinYd` up** — kills the sub-visible scraps at the end of a train, which is what converts a
   3-hop plan into 2 real bounces. Cheapest and most direct.
2. **`RUNOUT_BY_CLASS[hybrid|ironLong|ironShort].len` up** — longer individual hops for exactly the
   classes in the complaint, leaving driver/wood alone as asked.
3. **Per-class hop share** — move ground from the closing roll into the hop train for the mid-bag.

Do NOT touch `hopDrawBoost` (5.4) or `apexOverLenFor`. Apex was never the problem — it measures
5–12px against a 3px ball on almost every row.

## Definition of done

- **Mid-bag on the FIRM FAIRWAY is the target**: `4H`, `3i` and `7i` show `seen == planned` at every
  power, with `planned` allowed to fall to 2–3.
- **Driver and 3W keep their current visible count** — explicitly not a goal to raise them.
- `SW @0.7/0.55/0.4` stay free to plop (a 30–52yd partial with ~1yd of roll correctly has no bounce).
- No `seen` REGRESSES on either surface.
- Both firmness tables in the commit message, and no carry moved.

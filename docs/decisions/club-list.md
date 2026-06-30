# Changing the club list — recipe & guardrails

> A how-to for adding, removing, or re-spreading clubs in the bag taxonomy. The club list looks like
> a one-line table edit, but a club is referenced by id and by carry across the sim, the economy, the
> default bags, and a dozen seeded tests — change it carelessly and the suite goes red (or worse, the
> auto-sim quietly death-spirals). This doc is the checklist. History/tags: GS-clubs, GS-clubs-2,
> GS-clubs-3.

## The one source of truth

`src/sim/clubs.ts` → `CLUBS` is the **taxonomy**: an array of `{ id, name, carry }`, ordered
**strictly longest → shortest carry**. Everything else reads it:

- `suggestClub` / `clubById` map a target distance onto the bag (default bag = the full `CLUBS`).
- The sim only ever reads `carry` (and learned `ClubStats` averages). It never hardcodes a club id.
- The renderer/economy/characters reference clubs by **id**.

So a club is two things — an **id** (a stable key, persisted in saves via reward perks) and a
**carry** (the only number the physics cares about). Treat both as load-bearing.

## What a club id touches (grep these before you cut)

1. **The taxonomy** — `src/sim/clubs.ts CLUBS`.
2. **Default bags** — `src/sim/rpg/characters.ts`: `BALANCED_BAG` and `BALANCED_BAG_NO_HYBRID`
   (Larry, hybrid-free). These are arrays of **ids**; every id must exist in `CLUBS` or
   `buildStartBag` throws. The doc-comment above them lists the carries — keep it in sync.
3. **Reward types** — `src/sim/rpg/economy.ts REWARD_CLUB_TYPES`. The shop's `CLUB_ITEMS` are
   generated from `CLUB_SETS × REWARD_CLUB_TYPES`, so an id removed here vanishes from the store, and
   an id removed from `CLUBS` but left here will throw in `buildRewardClub` (`unknown club type`).
   Rule of thumb: a reward type is either a **distance** club (woods/long hybrids — extra carry is a
   real upgrade) or a **coverage** iron the balanced bag skips. Clubs everyone already carries at the
   same carry are NOT reward types (a same-carry "premium" copy is no improvement — the power-cell
   lesson), the **putter** excepted (its upgrade is the make-window, not carry).
4. **Carry-threshold constants** — these are tuned to specific carries; check they still split the
   ladder the way the comment claims:
   - `economy.ts DISTANCE_CLUB_CARRY = 185` (distance vs scoring; also gates `boostDistanceClubs`).
   - `characters.ts LONG_CARRY = 185`, `WEDGE_CARRY = 106`, `FIVE_IRON_CARRY = 150` (per-club
     character shot-shape bands).
   - `round.ts BACKSPIN_CARRY = 106` (= PW), `DRIVER_CARRY = 250` (= D), `SHORTEST_CARRY = 38`,
     `WEDGE_CONTROL_CARRY = 110`. `clubRollFraction` interpolates roll/backspin between these by
     carry, so they're anchors, not hard requirements — but keep PW=106 and D=250 if you can, so the
     boundaries stay meaningful.

## The carry-spread rule (why removals need re-spreading)

When you delete a club you open a gap between its neighbours. **Re-spread the survivors to refill it**
— the user-facing complaint a club list answers is "I can't dial the distance in close to the green",
so an awkward 25–30 yд hole in the scoring zone is a regression even if the suite stays green.

Keep these fixed where possible to minimise churn:
- **The mid-iron core `5i 150 → PW 106`** (5i 150, 6i 142, 7i 134, 8i 125, 9i 116, PW 106). Many
  tests assert these exact carries and exact `suggestClub` picks. Don't move them without reason.
- **The anchors** D 250 and putter 8.
- **A low wedge floor.** The auto reach-AI picks the *shortest club that still reaches*; any shot
  shorter than your lowest wedge's carry over-clubs up to it. So the lowest wedge's carry is the
  floor on short-approach overshoot — keep it low (GS-clubs-3 lands it at 60° = 56). Raising the
  floor is the classic way to nudge the death-spiral harness over its bar.

## Determinism — the cheap part

Changing a carry **value** changes shot *outcomes* but consumes **zero** extra rng draws and reorders
nothing, so the byte-for-byte rng-stability contract (CLAUDE.md #1) holds: no save bump, no stream
shift. What *does* move is every seeded test that asserts a concrete score/distance — those are
assertion updates, not determinism breaks. Reward-club bag state rebuilds from perk **ids**
(`loadoutFromPerks`), so removing a club type needs **no save migration** either — old saves that
bought a now-gone `club:set:type` perk just resolve to nothing (the item is gone), which is benign.

## The non-negotiable check: the death-spiral harness

`tests/characters.test.ts` runs the **default bag** over many max-wildness stops and asserts
`toPar/hole < 1.15` with `< 5%` blow-ups, per golfer (CLAUDE.md #4). A sparser bag makes the auto
reach-AI over-club more, which *raises* toPar — so **cutting clubs can fail this even when every other
test passes**. Always re-run it after a club edit:

```
npx vitest run tests/characters.test.ts
```

If a golfer creeps over 1.15, the lever is almost always the **short game**: lower the wedge floor,
tighten the wedge gaps, or restore reach on a distance club that's actually *in* the default bag
(only D and 5W are — 4W/2H etc. are reward-only, so re-spreading them doesn't move the harness).

## Tests that hardcode club ids / carries (update list)

A non-exhaustive map of what tends to break — grep the id you're changing across `tests/`:
- `tests/clubs.test.ts` — the club COUNT, the descending invariant, exact `suggestClub` picks at
  boundary distances, and `clubDist` learned-average examples.
- `tests/club-rewards.test.ts` / `tests/proshop-expansion.test.ts` — themed-set coverage assertions
  (which reward types exist), `buildRewardClub` carry checks, the roster-mean Stableford guards.
- `tests/characters.test.ts` — the bag SIZE and the death-spiral harness (above).
- `tests/caddies.test.ts`, `tests/suggest.test.ts`, `tests/dispersion.test.ts` — pull a specific club
  by id to fire a shot; swap a removed id for a surviving one of the same class.

## The recipe (do it in this order)

1. Edit `CLUBS` — add/remove rows, re-spread carries, keep it strictly descending. Update the
   header comment's count + rationale.
2. Fix the **default bags** + their carry comment in `characters.ts` (remove/replace cut ids).
3. Fix **`REWARD_CLUB_TYPES`** + its comment in `economy.ts`.
4. `npm run typecheck` — catches dangling id references the compiler can see.
5. `npx vitest run tests/characters.test.ts` — the death-spiral harness. Tune the short game until
   every golfer clears 1.15 with margin.
6. `npm test` — fix the hardcoded-id/score assertions that moved.
7. `npm run build` — the hub build re-bundles; confirm it's green.
8. Update the durable line in `CLAUDE.md` / `rpg-meta-loop.md` (bag size, club ladder) and add a note
   here if the recipe itself learned something.

This is **content, not engine** (CLAUDE.md: "New world / item / golfer = a new row"). No code path
should need an `if (clubId === ...)`; if you reach for one, the data model is wrong — fix the table.

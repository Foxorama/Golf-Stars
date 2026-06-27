# Club availability — per-character starting bags + clubs as rewards (GS-clubs)

2026-06-27 · branch `claude/club-availability-loadouts-x9w95t`

## What shipped

1. **Per-character SPARSE starting bags** (`characters.ts` `STARTING_BAGS`): each golfer begins with
   8–10 signature clubs, not the full 27-club taxonomy.
2. **Clubs as LOOT** (`economy.ts` `CLUB_ITEMS`): reward clubs appear in the shop, equip/replace into
   the bag, with ownership/tier/set rules.
3. **Rules:** Larry never sees hybrids; Driver Dan gates on owning a driver; tour upgrades are
   distance-club only.

## The balance preset (the part the user asked for first)

The proposed literal 5-club bags were measured against the real sim before building. **They brick the
game**: mean per-stop Stableford ~halves (12.5 → 5) and toPar/hole at max wildness triples to ~2.2
(vs. the 1.0 death-spiral bar).

| Character | Stableford (full → 5-club) | toPar/hole @ wildness 1 |
|---|---|---|
| Feather | 12.45 → 5.35 | 0.34 → 2.19 |
| Huang-Woo | 11.95 → 7.23 | 0.41 → 1.42 |
| Larry | 12.53 → 4.71 | 0.33 → 2.41 |
| Bo | 12.17 → 5.28 | 0.34 → 2.19 |

**Root cause = the short game, not the long clubs.** A bag-composition sweep:

| Bag | clubs | meanSF | toPar/hole |
|---|---|---|---|
| Full | 26 | 12.57 | 0.24 |
| 5 "identity" (1 wedge → putter) | 5 | 5.18 | 2.23 |
| Same 5 **+ wedge ladder** | 8 | 9.60 | 0.92 |
| 7 clubs, **no wedges** | 7 | 5.40 | 2.26 |

The killer is the ~98-yard gap from the lone wedge to the putter: the reach-AI hits a PW that flies
106 at a 60-yard chip and sails the green. Adding a wedge ladder fixes it. Long-club sparseness barely
matters (you take one more club / lay up).

**Decision (user-approved): signature 5 + short-game floor.** Final bags (verified across two seed
ranges, toPar 0.85–1.0, **0% blow-ups**):

- Feather: `3W 4H 7i PW GW SW LW 60 putter`
- Huang-Woo: `3W 7W 5i 7i PW SW LW 60 putter`
- Larry: `D 3i 5i 7i 9i PW SW LW 60 putter` (added a 3-iron to the club table; no hybrids ever)
- Bo: `3W 4H 8i 9i PW GW SW LW 60 putter` — a short-iron scoring specialist (denser 8i/9i in the
  ≤150-yd zone where his backspin bites; trades Feather's 7-iron for it)

**Key reframe:** a sparse bag *legitimately* raises the max-wildness MEAN toward bogey (~0.9–1.0/hole)
— that's by design, not a spiral (blow-up rate stays ~0%). So the golfer no-death-spiral guard is now
a relaxed toPar bar (< 1.15) **plus** a strict blow-up bar (< 5%), baselined against the roster mean.

## The reward system

- `CLUB_ITEMS` generated from `CLUB_SETS` × `REWARD_CLUB_TYPES`. A reward club is a `ShopItem` whose
  `apply()` `equipClub`s it (bag holds one per type, sorted longest→shortest).
- `offerableClubs`: offer a type you lack (gap-fill), or a higher tier / same-tier different set of a
  type you own — never the one you hold. Starting clubs = common `starter` set → Larry sees no common
  Driver but a common 3-Wood; Bo the mirror.
- `tour` (rare) tier is **distance-only**: extra carry helps the woods but overshoots scoring clubs
  (the power-cell lesson — `buildRewardClub` suppresses the bonus on scoring clubs, verified).
- Larry `noHybrids`; Driver Dan gates on owning a `DRIVER_ID` club (Larry qualifies from start, but Dan
  still only shows at epic rarity).
- Save-stable: bag rebuilt from perks via `startingLoadoutFor` (character bag FIRST, meta SECOND so
  Tour Bag lands on the sparse bag). `distanceClubBonus` carries the golfer ±/Tour Bag flat bonus onto
  reward distance clubs.
- UI: shop screen renders a "Reward Clubs" sub-section; Sim Lab gained a reward-club toggle group.

**Verified scoring:** roster clusters (~9 SF); full coverage + distance-club tour upgrades both raise
the roster mean Stableford (`tests/club-rewards.test.ts`). NB the credit-gated run loop sees only a
small per-stop lift because most runs end before the bag fills — the loop pays off late (follow-up #3).

## Deferred (documented in IDEAS.md GS-clubs)

1. Location-specific / higher-tier sets with game EFFECTS, not just carry (the Tarantula Network's
   Spyder putter etc. — one `CLUB_SETS` row each).
2. Scoring-club upgrade tiers via per-club dispersion/shape (a "tour wedge" that's a real upgrade
   without overshoot).
3. Tie reward-club acquisition into the cut-line/credit economy so the collection loop pays off sooner.

## Eyes-on still wanted

The shop "Reward Clubs" section is covered by the reducer + build smoke tests, but the *visual* layout
of the club cards alongside the perk cards hasn't been screenshot-verified — worth a glance in-app.

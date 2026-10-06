# Devlog draft — v1.8.0, the Driving Range

**Draft for you to edit, not to post as-is.** Every figure is checked against the code at the
1.8.0 bump (`src/sim/rpg/drivingRange.ts`, `docs/decisions/driving-range.md`, PRs #746–#748), so
edit the wording freely but check before changing a number. No closing line, on purpose.

Suggested title: **The Driving Range is open**
(alternatives: *Learn it before you fly* · *New here?*)

---

v1.8.0 is out, and it adds a Driving Range.

Until now a new player got dropped straight into a Voyage and had to work out the cone, the putter
and Stableford on their own. The range is three holes on Verdant Station, the calmest world in the
game, with a coach who stops you the first time each thing matters: your first swing, your first
putt, the first hole with water on it, and the upgrades.

`[screenshot — the Lesson 1 coach card over the tee]`

Each hole is scored a different way. The first is stroke play, the second is Stableford, and the
third is matchplay against Longshot Larry. At the end of every hole the card shows the Stableford
ladder with the rung you just landed on lit up.

The last hole is played with battered old range balls. About one shot in ten flies clean, and the
rest go into the shank and the duck-hook. Fit Shank Guard from the panel and that red band is gone
from the cone: one guard takes you to roughly half clean, both to about four in five. They are the
same upgrades the Pro Shop sells, with the same numbers, so you can see what one does before you
spend credits on it.

The range pays nothing and saves nothing. No shards, no records, no parked run. Play it, leave
half way, play it again.

It sits on the title screen where the greyed-out "The Destination — Coming soon" tile used to be.
The Destination is still planned; it just lost its placeholder.

One fix that matters if you play Story Tour: parking a Story round half way through a world and
then starting a Voyage, Unending or Star Tour run used to throw that round away. It doesn't any
more.

---

## Notes on using this

- **Picture:** one screenshot is enough, after the second paragraph. A 390×844 shot of the Lesson 1
  coach card was taken on the 1.8.0 build (sent alongside this file). The upgrades hole with the
  wild-ball cone would be the better picture, but it needs two holes played to reach it.
- **The in-game note** for this release is the 1.8.0 row in `src/ui/releaseNotes.ts`. Players coming
  from 1.7.0 see it once, over the title, on their first boot of 1.8.0. Fresh installs see the
  inline "The Driving Range has opened!" card instead.
- **Numbers:** "about one in ten" is the coach's own copy; ~10% → ~45–50% with one guard → ~80% with
  both is from PR #748 (measured 12% → 49% with Shank Guard on the driver).

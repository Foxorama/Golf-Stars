# The last 1.3.0 play-test items — 2026-07-31

Four fixes off the 2026-07-31 itch play-test, plus the release bump and a repo tidy. Every one of
them shipped with the whole suite green (**2628 passed / 0 skipped** at the end — read the skipped
count, per GS-browser-test-gate).

---

## 1. The golfers were standing on the settings sheet (GS-scene-isolate, #702)

Opening Settings on the Clubhouse put four golfers and their parked cars **on top of the sheet**,
name tags and all.

The rooms place their people by the FEET and order them by depth, so they legitimately mint
z-indices in the hundreds — lounge golfers reach ~1000, berthed ships ~230. Those numbers mean
something only *inside the room*. Without `isolation:isolate` on the frame they are ordinary members
of the ROOT stacking context and paint over every fixed overlay the app owns: the settings sheet at
z-index 60, the ace/eagle/victory takeovers at 60–62.

**Two things look like they already handle this and do not** — which is why the scenes read as
safely boxed rooms right up until a sheet goes up:

| | |
|---|---|
| `overflow:hidden` | clips **geometry**. Paint order is z-index. |
| `container-type` | is **not** a stacking context. It reads exactly like a self-contained room; computed `contain` on these frames is `none`. |

`storyClubhouse` had already paid this once and the other four frames never got the lesson, so the
rule is now stated for the **class**: every container-query scene frame isolates.

### The instrument that lied

`elementFromPoint` is the wrong tool here, and it cost a pass. Opening an overlay seals the app with
`inert` (GS-a11y-focus), and **an inert subtree is dropped from hit-testing while still painting
exactly where it did** — so the first probe reported the sheet on top at every viewport while a
screenshot of the same page showed golfers standing across it. The guard strips `inert` first, which
restores hit order ≡ paint order.

Worth carrying: when measuring *paint*, prove the instrument sees the bug before trusting a pass.

---

## 2. The fairway ink ran over greens and hazards (GS-fairway-ink-break, #703)

> *"the fairway line covers hazards and greens and rough when there's a break in the fairway, it
> should only be on the fairway itself and should definitely not be on the green even if the fairway
> art runs under the green."*

A fairway polygon is not the shape of the cut grass a player can see. The corridor runs on **under**
the green, and hazards are cut out of it and painted **over** it — so an outline that asks only *"does
another FAIRWAY bury this edge?"* draws ink across the putting surface, along a bunker floor and
through a creek.

**Measured over 2,925 generated holes, 13 worlds:**

| | before | after |
|---|---|---|
| ink length inside a **green** | **2.28%** (77% of holes) | **0%** (0 holes) |
| ink length inside a **hazard** | **7.86%** (87% of holes) | **0.06%** |

The 0.06% left is the ≤4yd close stitching carrying the line over a nick — the anti-dashing rule
doing its job, not a miss.

`fairwayEdgeRuns` takes **occluders** grown by the same `bleed` as a neighbouring fairway, so ink
stops just short of a rim instead of leaving specks along the sand. They are the *same bodies the
painters are handed* — `mergedHazardsFor` plus the roughened liquid banks, hoisted rather than built
twice (both course-space, cached, rng-free ⇒ no draw reordered, every seeded scene byte-for-byte).

**Trees are deliberately not occluders**: a canopy is a sprite with gaps over turf that is still cut
grass, and burying edge under one shreds the outline into dashes.

### Honest about the size of it

Most of the removed ink was **already invisible** — the hazards and the green paint over the fairway
pass. The pixel win is small and real (~500px on a whole-hole map, concentrated exactly at the green,
where the report pointed). The structural win is that the silhouette now means what its name says.

### A measuring trap worth recording

The first measurement said *0% inside greens* and nearly cleared the bug. It was wrong: I called
`generateCourse({seed, biome, …})` when the signature is `generateCourse(seed, opts)`, so every
sampled hole came back degenerate — 2 fairway polys, never more. **Check a generator's signature
before believing a flat distribution.**

---

## 3. The clubhouse furniture was velcro'd to the wall (GS-clubhouse-floor, #704)

> *"the Story Tour and Star Tour clubhouse has a bunch of things sitting on the wall and not the
> floor — your character is standing on the floor and everything else looks like it's velcro'd to
> the wall."*

Two literal causes:

1. **Nothing but the golfers touched the floor.** The golfers carry a contact shadow; the furniture
   carried none and was drawn flat onto the wall, so the room read as a printed backdrop with four
   people standing in front of it.
2. **The bar counter did not reach the deck.** Its front panel stopped at `y=192` against a deck
   line at `222` — thirty units of wall visible underneath. The bar was, literally, hanging.

The pass: counters run down to the deck with a shadowed toe kick; the locker bank and reliquary
stand on plinths that oversail the carcass and catch light along the top edge; wall-mounted pieces
cast a soft slab behind them for thickness; contact shadows pool at the foot of every standing unit.
Both dressings of the room (Mothership and Coil sanctum) had both faults.

**The lounge needed nothing.** `clubhouseLounge.ts` is named in the IDEAS entry, but its furniture
already stands on the boards and it already casts contact shadows — which is exactly why it read
best of the three. Leaving it alone is the finding, not an omission.

`DECK_Y` is now a named constant that standing furniture derives its height from. Most of this pass
is art judgement only eyes-on settles; the mechanical part — *a unit that stands on the floor reaches
the floor* — is guarded, asked of the **unit** rather than each rectangle (a carcass on a plinth
correctly stops above the deck).

---

## 4. Repo tidy + the release bump

**35 local branches → 2.** `git branch --merged main` reported **zero** stale branches, because
everything here is **squash-merged**: the branch tip is never an ancestor of `main`, so the naive
check is blind to it. The squash-aware test is to rebuild the branch's tree as a synthetic commit on
its own merge-base and ask `git cherry` whether that patch is already upstream — **30 of 34** came
back squashed.

The remaining four needed judgement rather than the script: three were this session's own, and
`ball-ends-where-it-went` was flagged *unmerged* only because `main` had since touched the same files
(its content is in `main`, shipped as #697 — verified by diffing the files directly, not by
patch-id). Deleted after that check.

`npm version` was not used — `package.json` is bumped directly to **1.3.0**, which is now the *only*
hand-bump in the release (GS-sw-version derived the service worker's, and `APP_VERSION` and the boot
watchdog already come from `package.json`).

**The `v1.3.0` tag is deliberately NOT pushed.** Pushing it triggers `itch.yml`, which publishes the
build — an outward-facing action, and the release call is the author's. The tag must match
`package.json` or the workflow refuses, so the bump is the whole of the preparation.

---

## Loose ends spotted, not fixed

- **`scripts/*-preview.mjs` carry their own Linux-only Chromium lookup** — `PLAYWRIGHT_BROWSERS_PATH`
  / `~/.cache/ms-playwright` / `chrome-linux/chrome`, with no `CHROME_PATH` and no Windows or macOS
  path. This is exactly the rot GS-browser-test-gate fixed for `tests/` (one `tests/chromium.ts`,
  after 50 tests silently skipped in CI for months) — never applied to the ~40 eyes-on rigs. They
  fail soft (`no chromium, wrote …html`), so the failure mode is a preview that quietly never renders
  rather than a red build. Every eyes-on render in this session had to be shot by hand around it.
  Candidate: have the scripts import the same seam.
- **The IDEAS entry for GS-clubhouse-floor named the wrong modules** — `storyClubhouse.ts` +
  `clubhouseLounge.ts`, when the screenshot was the **spaceport** hub (`storySpaceport.ts`) and the
  lounge was the one surface already doing it right.

# Story Tour — design & build roadmap (GS-story)

> **Name:** the mode ships **user-facing as "Story Tour"** (the code keeps the `GS-story*` ids +
> `gs_story` save; title tile / hub / cinematic all read **Story Tour**). **Star Tour is now the
> *reward* mode, unlocked once Story Tour is complete** (`GS-story-startour-unlock`): the title's Star
> Tour tile is hidden until a campaign exists, then shows **locked** ("Complete Story Tour to free-roam
> the galaxy") until `storyComplete(story)` (the `completed` flag OR all five Sigils / `keyToOtherRealm`)
> — *play the story, then travel the galaxy.* Voyage/Unending are untouched by the gate.
>
> **Lore cards everywhere** (`GS-story-lore-cards`): every tappable item / world / relic / ship / gear
> raises a **lore + description card** (there is never enough room for image + name + detail + lore
> inline, and the lore is what fills out the galaxy). New content (Planet clubs, Phoenix Flames, every
> Pro-Shop item) ships **with detailed flavour** — reusing existing lore or adding canon in the bible.
>
> **Status: in progress.** This is the living design doc for turning **Star Tour** into a full,
> standalone **Story Tour** campaign. It starts as a fleshed-out design + chunk roadmap and accretes
> per-chunk rationale as PRs ship (the `docs/decisions/*` pattern: the *rule* lands in `CLAUDE.md`,
> the *story* here). Every chunk below carries a stable `GS-story-*` id tracked in `IDEAS.md`.
>
> **The narrative canon lives in `docs/decisions/story-bible.md`** — the mythos (the Great Game vs the
> World-Eater), the two Orders (Fairway Wardens vs the Coil doomsday cult), the NPC roster, the five
> Galaxy Tournaments world-by-world, the **good/evil alignment branch** (stay the Chosen One or join the
> cult → different allies, relics, ships, and ending), the cursed relics, and the two finales. This doc
> is the *systems + roadmap*; the bible is the *world*. Write beats/tournaments/finale against the bible.

## The pitch (what the player experiences)

You are the reigning **World Tour** champion. Story Mode opens on the final round of the World Tour
at **Earth** (the Old Course at St Andrews — the one real course). Win it, and a victory scene plays;
then **the Mothership descends** and lands, and the **Prognostic Parrot** walks up to you:

> *"Golfer, you have proven yourself the best on planet Earth — and now the Universe needs you. I have
> foreseen a great calamity, and you are the chosen one who can save us. Gather your friends and
> follow me!"*

The story intro cinematic plays, and you wake in the **Clubhouse** — your **station wagon** parked in
the spaceport, the **Parrot** perched in the bar. Tap the Parrot for story + direction.

**The arc:** win **5 Galaxy Tournaments** — the five chapters. Each is entered via a **qualifying
round** and won for a **trophy**, plus a signature reward (a special club, a unique ball, gear). Collect
all five trophies and they forge a **key to the other realm** — the dark realm at the **base of
Yggdrasil**, where **Jörmungandr** is awakening. In a twist, the finale is a **space battle**: your ship
and its weapons against the world-serpent. Jörmungandr is **Cthulhu-corrupted** — eldritch horror
overtones in its design. Beat it and the universe is saved (victory scene); fail and it wakes, and it
devours the planets (loss scene).

Between tournaments you **travel** a star map of **unlockable worlds** (each chapter opens a few more,
always offering a **choice** of destinations scaled by difficulty). Clearing a world pays **credits**;
each world has its own **Pro Shop**. Revisit a cleared world to **play again** (chasing a better score)
or go **straight to its Pro Shop**. You start with the **default green bag** and the **station wagon**;
everything else — clubs, ships, ship weapons/engines/upgrades, gloves/hats/shoes/bags — is **bought as
you travel** and **equipped** in your locker. **Caddies are hired once and kept** — a permanent roster
you choose from in the bar/locker (no hire-and-fire).

## Design pillars (read every chunk through these)
- **A separate game, sharing the engine.** Story Mode reuses the pure golf sim (course gen, shot,
  putt, render) and the *content* (club/apparel/ship/caddy rows, lore, art) wholesale. It **forks the
  meta layer**: a single persistent progression, its own economy, ownership, screens, and save.
- **Voyage, Unending, Clubhouse, Trade Market are frozen.** They keep their exact current format. No
  chunk may change their behaviour or their save (v29). Story Mode persists to its **own** save
  namespace (`gs_story`), so the existing blob is never at risk.
- **Every constitution contract still holds.** Determinism/byte-stability, auto≡interactive,
  fairness-by-construction, no-death-spiral, graphic≡physics. Story rounds are ordinary golf rounds
  resolved by the shared engine — new *effect* fields default to no-ops so the seeded suite stays
  byte-identical (the caddy-field pattern).
- **Content as data.** A new world / club / gear / ship / tournament / story beat is a **row**, not an
  engine edit. Chapters are data over a small reusable framework.

### The item-authoring rule (EVERY individual item — GS-story-lore-cards)
No item ships as a bare stat line. Each one — club, gear, ship, relic, weapon, caddy — is authored through
**three lenses** (the constitution's three lenses, applied to content):
1. **Visual.** Its OWN art in the house procedural-SVG language (no downloaded assets), rarity-tinted and
   theme-aware. No two items share a silhouette; a new *kind* of item gets a new `render/itemArt.ts`
   drawing (or a themed aura over a shared base). **Eyeball a real-browser screenshot before shipping.**
2. **Lore.** *Detailed* flavour, never a raw number. Compose it from reusable canon (the set/faction/world
   lore) **plus** an item-specific line, so each reads distinct without hand-writing a novel each time;
   add new canon to `story-bible.md` when an item needs it. The lore is what fills out the galaxy.
3. **Interaction.** Tappable → the reusable **lore card** (`render/loreCard.ts`): art + name + rarity/kind
   tag + mechanical detail + lore + a footer action. Never image+name inline only.
When you add an item catalogue, wire all three; a stat-only item is an incomplete item.

## Architecture — the separation seam

Star Tour today is the `strokeplay` run format: ~9 branch points on `formatId === STROKEPLAY_FORMAT` /
`run.staticCourseId` layered on the shared `Run` reducer + play engine. Story Mode grows out of that
seam rather than forking the reducer:

- **The golf round stays shared.** A story round is a `Run` (strokeplay-style) on a course — static
  (a tour course) or generated (a world stop). `playHole`/`takeShot`/`beginHole`/`holeResult` and the
  `'playing'` screen are reused verbatim.
- **`StoryState` is the new persistent spine.** A single object, persisted under its **own** save key
  `gs_story` with its own `STORY_VERSION` + `migrateStory()` (separate from `SAVE_VERSION`). It holds
  the whole campaign: identity, purse, ownership, equip, progress. Draft shape:

  ```
  StoryState {
    version, characterId,
    credits,                       // single persistent purse (no shards, no per-run reset)
    chapter, // 0..5 story progress; gates world unlock + difficulty
    unlockedWorldIds: string[],    // grows per story beat
    clearedWorldIds: string[],     // for revisit (play again / pro shop)
    worldBest: Record<id, {toPar,strokes,seed}>,  // per-world best score (records folded into revisit)
    ownedClubIds, equippedBag: string[],          // start = default green bag
    ownedShipIds, equippedShipId,                 // start = wagon-classic
    ownedShipUpgradeIds, equippedWeaponId/engineId/...,   // ship weapons/engines/upgrades
    ownedGearIds, equippedGear: Record<GearSlot,id>,      // gloves/hat/shoes/bag/glove w/ EFFECTS
    hiredCaddyIds, activeCaddyId,  // hire-and-keep roster; choose active
    trophyIds: string[],           // 5 Sigils → forge the Green Key to Yggdrasil's root
    alignment: 'undecided'|'warden'|'herald',  // set at The Choice (end Ch.3); forks the back half + finale
    relicIds, defeatedRivalIds,    // cursed sheddings / Warden grace owned; rivals beaten (Venoma…)
    tournamentStage,               // qualifier vs final progress per chapter
    seenStoryBeats,                // one-off story-beat tracking (SeenLore twin)
    activeRound?,                  // resume a mid-round world
  }
  ```
  Fields land incrementally (each a `STORY_VERSION` bump + migration when its chunk ships); all default to
  no-ops (`alignment: 'undecided'`, empty lists) so an early campaign upgrades cleanly.

- **Reuse the shared reducer, add story screens/actions.** New `Screen` members (story hub / locker /
  inventory / pro shop / tournament bracket / space battle) and new `Action`s, all gated so Voyage/
  Unending paths are byte-identical. Between-round progression logic lives in a story-only module
  (`src/sim/rpg/story.ts` for the pure model; `src/app/story/*` for screens) — pure and unit-tested.
- **Effect-bearing gear** extends `PlayerLoadout` with no-op-default fields (the caddy-field pattern);
  equipped clubs/gear/ship-upgrades fold into the run loadout at round start via a story
  `loadoutFromStory()` (the `applyCharacter`/`loadoutFromPerks` analogue). Registered in the Lab's
  `caddyEffects()`-style harness so every effect is demoable + machine-checked.
- **The star map is the story navigator.** Reuse `starTourMap.ts` + the flight/fuel/weapons feel loop.
  Worlds gain locked/unlocked/cleared states; tapping a world → its dossier (play / pro shop). The
  Yggdrasil tree gains a **root realm** socket (flip a `YGGDRASIL_REALMS` placeholder to playable) for
  the finale.

## Reused vs net-new (from the subsystem maps)

**Reuse as-is:** the golf engine; `PlayerLoadout`/`apply()`/`loadoutFromPerks` effect system; the
lore beat pipeline (`LORE_EVENTS` → `withLoreGate` → `loreScreen` → `dismissLore`, incl. `LoreEffects`
payouts); the Yggdrasil realms table + glyph + `playYggdrasilRealm`; the Asgard standalone-tournament
template (`startAsgardRun`/`resolveAsgard`/`leaveAsgard`, ghost stroke-play); `serpentBody` acid-serpent
art; matchplay `BossSpec` + `bossEdgeForRun`; the star-map + ship-weapons feel layer; the intro
mount/skip plumbing; `standrews-18` (the Earth opening course already exists).

**Net-new:** the `StoryState` persistent spine + `gs_story` save; a single persistent purse; per-world
pro shop gated to story credits; effect-bearing gear + the inventory/locker screens; the caddy
hire-and-keep roster; ship weapons/engines/upgrades **as owned upgrades with effects** (today they are
cosmetic star-map feel only); the 5-tournament progression counter + qualifying→final format; the
story intro cinematic; a **real** space-battle boss (health/collision/outcome — weapons fire into empty
space today); Jörmungandr / Cthulhu-corrupted art + lore portraits.

## Build roadmap — chunks (one focused, tested, auto-merged PR each)

Ordered so each ships something playable and nothing lands before its foundation. IDs are stable.

**Phase A — Foundation & separation**
- **GS-story-save** — `StoryState` + `gs_story` save (own version/migrate) + New Game / Continue on the
  title (the Star Tour tile becomes **Story Mode**). New game → pick protagonist (once) → boots into a
  minimal story hub with the green bag + station wagon; continue resumes. Voyage/Unending/Clubhouse/
  Trade Market untouched. **The spine — everything hangs off this.**

**Phase B — The opening**
- **GS-story-prologue** — the Earth final round (`standrews-18`) → win → victory scene → Mothership
  landing → Parrot recruitment beat → story intro cinematic → land in the Clubhouse (wagon in port,
  Parrot in bar). Reuses lore machinery + a new story intro.

**Phase C — Progression systems**
- **GS-story-econ** — ✅ *shipped.* The per-world **Pro Shop** (`sim/rpg/storyShop.ts` +
  `app/storyShopScreens.ts`), reached from a **cleared** world's star-map dossier ("🛒 Pro Shop") or its
  "Play again" (revisit keeps `worldBest`). It sells **themed clubs** — the existing Voyage reward sets
  **Planet / Phoenix Flames / Solar Storm** (`club:<set>:<type>` ids resolved through the shared
  `buildRewardClub`, so a bought club plays exactly as the same Voyage reward: carry bonus on distance
  clubs, a wider putt make-window, themed art the golfer swings) — a curated 3-item rack per world, tiered
  by chapter (Planet early → Solar late), priced in credits, filtered to hide what you own. Buying spends
  credits, adds to `ownedClubIds`, and **equips into the bag** (`equipStoryClub`: upgrade a carried TYPE in
  place, or append a new type up to `MAX_STORY_BAG` = 14). The campaign's OWN equipped bag now tees off
  into a Story round (`storyPlayWorld` sets `loadout.bag = storyBagClubs`), so the lean green start actually
  grows as you shop. NO save bump — owned/equipped stay id-lists; `resolveStoryClub`/`storyBagClubs` are
  themed-aware. Guarded by `tests/story-shop.test.ts` + the Pro-Shop flow in `tests/story-flow.test.ts` +
  the `?screen=storyshop` browser smoke.
- **GS-story-econ2** — ✅ *shipped* (the review economy pass, `reports/story-mode-review-2026-07-18.md`).
  The flat `storyRoundCredits(toPar)` (a constant `max(100, 200 − 15·under)`) gave every world the SAME pay
  and let a revisit farm the full purse forever — so grinding the easiest world you owned was the optimal
  road to the ~1300-cr finale arsenal, gutting the shipyard/locker/pro-shop spend choices. Now the pay
  rides a `RoundPayContext`: `chapter` (the WORLD's difficulty tier = its `unlockChapter`, `×(1 + 0.15·(ch−1))`
  → Ch.1 ×1.0 … Ch.5 ×1.6, so hard worlds are worth playing) and `revisit` (an already-cleared world pays
  `×0.4`, a top-up not a farm). `storyWorldChapter(courseId)` reads the tier (1 off-chart, e.g. the Earth
  prologue). `resolveStoryRound` passes `{chapter, revisit: worldCleared(base, …)}` (pre-clear read → first
  clear full, re-flies top-up); `resolveStoryTournament` passes the venue's tier at FULL rate (majors are
  the paydays, never revisit-decayed; the Sigil bonus rides on top). Both levers DEFAULT to no-ops (an empty
  context is byte-for-byte the classic flat pay), so `storyRoundCredits(x)` callers/tests are unchanged and
  the Ch.1 balance assertions hold. Pure model + reducer wiring — no save bump. Guarded by
  `tests/story-state.test.ts` (scaling + revisit + `storyWorldChapter`) and the revisit wiring in
  `tests/story-flow.test.ts`.
- **GS-story-finisher** — ✅ *shipped* (the review's TOP finding, D1: "the finale isn't a game"). The
  Jörmungandr finale resolved as a pure `combatRating ≥ N` threshold — no input, no skill, no tension. The
  KILL is now an INTERACTIVE golf strike. Whether you CAN win is still the deterministic arm-up FLOOR
  (`finaleResult`, the two gates — an unarmed ship still can't engage, no soft-lock), but once armed the
  cinematic HOLDS at the serpent's exposed eye and a reticle sweeps its head: TAP to fire the ball into the
  eye. A near-miss makes the serpent LASH and you re-sweep (an armed player always lands it eventually), and
  the strike's ACCURACY sets the ending quality — a dead-centre CLEAN kill vs a GRAZE that clipped the eye
  (both WIN; the strike never decides win/lose, so arming correctly is never punished by a mistime). The
  quality colours the result screen's ending copy (on top of the Warden/Herald branch). Implemented by
  holding the timeline at the breach frame until the strike lands, then replaying the proven win-climax from
  `climaxStart` — minimal risk to the existing animation. `render/storyFinale.ts` gains the interactive aim
  state (`FinaleStrike`, the reticle, `onTap`); `app.ts` plays it (`interactive: won`) and passes the strike
  to `engageStoryFinale` (reduced-motion / Skip = a clean win, never a punishment); `lastStoryFinale.strike`
  carries the quality. Tuned for feel (a forgiving 88-unit hit zone, a 26-unit clean reward, a readable
  1.9-speed sweep, a short 430 ms lash lockout). Render/app only — NO sim rng, no save bump. Guarded by the
  strike-quality flow in `tests/story-flow.test.ts` + a real-browser engage→aim-hold→resolve smoke in
  `tests/build.test.ts`; the Canvas2D feel verified eyes-on (drive: engage an armed campaign, land the
  strike, watch the quality-tiered ending). Closes the review's #1 backlog item.
- **GS-story-worlddiff** — ✅ *shipped* (the flat-difficulty fix, review finding D2). A Story world round
  pinned the static course with `staticEffect:'none'`, so the moment-to-moment golf was flat Ch.1→Ch.5 —
  only the tournament ghost edge scaled ("difficulty is just length"). Now each world plays under a WIND
  scaled by its difficulty TIER (`storyWorldEffect` off `storyWorldChapter`): calm at Ch.1, stiffening
  `solarWind → solarStorm → dustStorm → ionStorm` by Ch.5. It's the existing weather-PHYSICS lever
  (`applyEffectPhysics` — pure wind/carry, NO geometry), so it never touches the layout (records / Star-Tour
  stay comparable, `validateFairness`/`Crossings` untouched, auto ≡ interactive by construction) and wind
  reads TRUE off the shot bearing — the strategic axis (club up, aim off), not more length. Deliberately the
  PURE wind/carry effects only (no craters/lies/tents). Scaled by the WORLD (tier), not the run chapter, so
  a world's test is stable across revisits (`worldBest` comparable); the Earth prologue (tier 1) stays calm.
  Set in `storyPlayWorld`/`storyPlayTournament`'s `staticEffect`; a Ch.1 world is byte-for-byte the old
  `'none'` round, so every existing story-flow test (which plays Ch.1 worlds) is unchanged. No save bump.
  Guarded by the tier-effect coverage in `tests/story-state.test.ts` + a "deep world blows the wildest sky
  and still resolves" round in `tests/story-flow.test.ts`. (Geometry-based scaling — tighter/longer late
  worlds — is a deferred, riskier follow-up; wind is the fair, records-safe first pass.)
- **GS-story-caddies** — ✅ *shipped* ("gather your friends" — the caddy roster the review flagged as a
  hole). The campaign's Warden allies are the existing NAMED caddies (Driver Dan, Penelope, Sandy, Dr
  Chipinski, Mystic Mole, Suggestible Sam); you **recruit** them one at a time out in the galaxy — each
  waits at a thematically-fitting world (`STORY_CADDY_STOCK`: Dan at the derelict that was his old ship,
  Sandy in the dunes, Penelope on the crystal greens, …), hired for credits once that world is cleared —
  the same **per-world, travel-back** economy as the Pro Shop / ship vendors (a friend belongs to a place,
  so you go find them). Recruitment is once-and-KEPT (`hiredCaddyIds`, a permanent roster, no fire); you
  **choose which one carries the bag** in the clubhouse **Locker** (`activeCaddyId`, an EQUIP not a
  purchase — the "Your crew" section). The active caddy folds its REAL loadout effect into every Story
  round via `applyStoryCaddy` (the `applyStoryGear` sibling — the caddy shop-item's own `apply`, which
  adds its effect + perk id, so the shared engine AND the on-course render both see it: auto ≡ interactive,
  a friend on the bag both helps and shows). Reducer: `hireStoryCaddy` (from a cleared world's dossier /
  recap, gated to the world that hosts THAT caddy) + `setStoryCaddy` (from the Locker). `StoryState`
  already had the fields → **no save bump**. Pure model in `sim/rpg/storyCaddies.ts`. Guarded by
  `tests/story-caddies.test.ts` (recruit/keep/first-hire-active/equip/fold) + the recruit→active→rides-into-
  the-round flow in `tests/story-flow.test.ts`. Verified end-to-end in a real browser (dossier recruit
  button, clubhouse caddy chip, Locker crew section).
- **GS-story-shop-access / GS-story-ship-vendors** — ✅ *shipped* (the shop-reachability fix; found by
  DRIVING the real UI in a headless browser — the deep-link smokes force-mount each screen and even set
  `starTourView.storyMode` by hand, so they never exercised the actual *navigation* to a shop). The bug: the
  Pro Shop mechanics all worked, but it was **undiscoverable** — it only appeared on an already-cleared
  world's star-map dossier after an ~8s ship flight, a fresh campaign has no cleared shoppable world (the
  Earth prologue isn't stocked), and there was NO shop in the clubhouse. The fix keeps the deliberate
  **per-world economy** (a shop belongs to a world; skip an item and you fly BACK for it — the galaxy stays
  big) and just surfaces it where the player already is: the **world-clear RECAP** now offers "🛒 Visit the
  Pro Shop" (and, at a vendor world, "🚀 Visit the Shipyard") for the world you just finished, and the map
  dossier keeps the travel-back entry. Deliberately **NOT** a clubhouse buy-anything shop. Ships + upgrades
  move the same way (per the design call): they're sold at **dedicated ship-vendor WORLDS** — `SHIP_VENDOR_STOCK`,
  one vendor per chapter (`desert-18`/`frost-18`/`fungal-18`/`void2-18`/`cetus-18`), each stocking different
  hulls/arms; every sellable ship + every upgrade sits at exactly one vendor and the finale arsenal is fully
  reachable by travel (machine-checked). The clubhouse "Shipyard" became an equip-only **HANGAR** (fly an
  owned ship + see combat rating, no buying); `storyShipyard` renders VENDOR mode (a world's stock, buy) when
  `storyShipyardWorldId` is set, else HANGAR mode. `openStoryShop`/`openStoryShipyard` gained the recap/dossier
  origins + a return-screen; buys stay reducer-permissive (the UI gates which items a world offers, exactly
  like the Pro-Shop rack). No save bump. Guarded by the vendor-coverage test in `tests/story-ships.test.ts`,
  the access-flow block in `tests/story-flow.test.ts`, and the `?screen=storyshipyard` smoke (now opens a
  vendor shipyard). **Lesson:** a deep-link smoke that mounts a screen in isolation is NOT a substitute for
  driving the real player path — verify reachability in a browser, not just that the screen renders.
- **GS-story-lore-cards** — ✅ *foundation shipped* (`render/loreCard.ts`). The reusable tap-to-inspect
  overlay (own `.gs-lorecard*` prefix, self-contained `<style>`): art medallion + name + rarity/kind tag +
  mechanical DETAIL + composed LORE + a footer action (Buy / Owned / can't-afford). First consumer is the
  Pro Shop; club lore is COMPOSED from a per-SET line (the Planet/Phoenix/Solar canon) + a per-TYPE
  flavour, so every club reads distinct without hand-writing each. Gear/ship/relic chunks pass their own
  art + copy into the same card.
- **GS-story-clubs** — ✅ *shipped* (buy via GS-story-econ; equip/bag-swap via GS-story-locker below).
  Individually owned & equippable clubs, a plain green-club start, and the locker bag-builder for owning >14.
- **GS-story-gear** — ✅ *shipped* (see the GS-story-econ note above + GS-story-locker below). Effect-bearing
  glove/cap/shoes/ball fold a real `PlayerLoadout` lever at tee-off (Story-only, no-op default). The
  **cursed sheddings** (big power + a balancing curse) + Warden grace mirrors + the deeper Inventory are a
  later relic pass on this same gear seam.
- **GS-story-locker** — ✅ *shipped* (`app/storyLockerScreens.ts`). The campaign locker, reached from the
  spaceport clubhouse ("🎒 Locker"): a **bag builder** (equip/unequip owned clubs into the 14-slot bag —
  one per type, a same-type swap is free, a new type needs room; `equipStoryClub`/`unequipStoryClub`/
  `storyBagFull`) with an auto-benched overflow, and a **gear locker** (per-slot switch/remove among owned
  gear; `equipStoryGear`/`unequipStoryGear`/`ownedGearForSlot`). Every owned item is tappable → the reusable
  lore card (read-only; plain starter clubs get a `plain:<type>` card so they read too). Own `.gs-lock*`
  prefix. Pure reducer + model helpers; no save bump (owned/equipped lists already exist). The **caddy
  roster** (hire→keep→choose) waits on a caddy purchase mechanic (a later chunk). Guarded by the locker
  model in `tests/story-shop.test.ts`, the locker flow in `tests/story-flow.test.ts`, and the
  `?screen=storylocker` browser smoke.
- **GS-story-ships** — ✅ *shipped* (`sim/rpg/storyShips.ts` + `app/storyShipyardScreens.ts`). The
  spaceport **Shipyard** (reached from the clubhouse): buy + fly the campaign fleet. A story ship is a THIN
  row over an existing `ships.ts` hull (no new ship art) carrying a light, honest STORY effect — a
  **credit-earning bonus** per world clear (`shipCreditMult`, applied in `resolveStoryRound`; a bigger hold
  banks more). A deliberate **scattering of acquisition approaches**: `buy` (for sale), `milestone`
  (revealed after clearing N worlds, then for sale), `ace` (the Comet Rider, granted free by a hole-in-one
  on any Story round — `grantStoryAceShip`), and `secret` (a late grail, revealed deep in the campaign).
  Every ship is tappable → the reusable lore card (hull art + credit-bonus detail + bespoke lore +
  Buy/Fly). Own `.gs-yard*` prefix; no save bump (`ownedShipIds`/`equippedShipId` already exist). Guarded
  by `tests/story-ships.test.ts`, the shipyard + credit-mult flow in `tests/story-flow.test.ts`, and the
  `?screen=storyshipyard` smoke.
- **GS-story-ship-upgrades** — ✅ *shipped* (`sim/rpg/storyShipUpgrades.ts`; the shipyard's outfitting bay).
  Ship **weapons / engines / shields**, bought with credits (some `milestone`-gated). Each raises the
  fleet's **Combat Rating** (`combatRating` = Σ owned `battle`) — a visible readiness meter the Parrot
  nags about, which the **finale space battle** (a later chunk) will CONSUME; until then it's a real
  accumulating goal, and **engines also carry a LIVE credit bonus** (`upgradeCreditMult`, stacked onto the
  ship's in `resolveStoryRound`), so the choice (economy now vs battle prep) has teeth today. Upgrades are
  simply OWNED (`ownedShipUpgradeIds`, all-active — no per-slot equip, no save bump). Ids `upg:<cat>:<var>`;
  new card art (`drawWeapon`/`drawShield`, engine reuses `drawThruster`) routed off the category. Every
  upgrade → the reusable lore card. Guarded by `tests/story-ship-upgrades.test.ts` + the buy/combat/engine
  flow in `tests/story-flow.test.ts` + the `?screen=storyshipyard` smoke (now checks the upgrades section).
  The finale will read `combatRating`; a possible Warden-vs-wyrm path-flavoured pool is a later option.
- **GS-story-locker** — the Story **locker room / wardrobe** variant + per-character equipment screen +
  the **caddy roster** (hire → keep → choose active, no fire).

**Phase D — Star map story path**
- **GS-story-map** — worlds gain locked/unlocked/cleared states; chapter gates unlock a few worlds each;
  world choice scaled by difficulty; the star map becomes the story navigator.

**Phase E — Tournaments (the five chapters)**
- **GS-story-tournament** — ✅ *framework + winnable trunk shipped* (`sim/rpg/storyTournaments.ts` +
  `app/storyTournamentScreens.ts`). The campaign SPINE: one Galaxy Tournament per chapter (data rows), at a
  venue world, unlocked once you've cleared ≥2 of the chapter's worlds. It's a stroke-play round vs a
  recurring **rival** (Venoma "the Viper" from Ch.2; Birdie Bianchi is the Ch.1 club champion) — a scaled
  ghost reusing the Asgard `ghostHoleStrokes`/`golferForm` model with a per-tournament `rivalEdge` (gentle
  0.12 → brutal 0.50). Beat the rival's gross (ties to you) → win a **Sigil** (a `trophyIds` entry), which
  **advances the chapter** (auto-unlocking the next world cluster) + banks credits/best; five Sigils →
  `keyToOtherRealm` → `storyComplete` (the campaign is now winnable end-to-end, Star Tour unlocks). Marked
  by `run.storyTournament` (a story round that resolves via `resolveStoryTournament` instead of the plain
  clear); a gold clubhouse BANNER opens the lobby (host/rival/Sigil/prize + tee-off) → the win/lose recap.
  Own `.gs-tourn*` prefix; no save bump (`trophyIds`/`chapter` already exist). This is the ROUTE-AGNOSTIC
  trunk over the current chapter-gated worlds — the bible's Warden/Herald fork (Ch.4–6, two routes) swaps
  the rows in a later pass without touching the flow. Guarded by `tests/story-tournament.test.ts`, the
  tournament flow in `tests/story-flow.test.ts`, and the `?screen=storytournament[result]` smokes. Deferred
  from the full vision (later chunks): a distinct **qualifier→final** two-round shape, the **Coil faction**
  row (`factions.ts`), and richer **host/rival dialogue beats**.
  - **GS-story-hosts** — ✅ *shipped* (the review flavour pass, `reports/story-mode-review-2026-07-18.md`).
    The tournament `host` fields were generic placeholders ("The Lyra Golf Club", "Master Cinderwright",
    "The Coil"); restored to the bible's named cast — **Sir Aldous Greensward** (Ch.1, the genteel pompous
    Tour chair), **Magnus Cinder** (Ch.2, the bombastic promoter who took Coil money), **Sister Ecdysis**
    (Ch.4 Herald, the Coil's Shedmaker) — with their characterisation woven into each `intro`, and the
    lobby's rival glyph now distinguishes the Apostate (🖤). Data/render only, no save bump. Guarded by the
    host coverage in `tests/story-tournament.test.ts`.
- **GS-story-chapters (the alignment fork)** — ✅ *shipped* (`app/storyChoiceScreens.ts` + `alignment` on
  `StoryState` + alignment-variant rows in `storyTournaments.ts`). **The Choice** fires after the Chapter-3
  Storm-Sigil win (`storyTournamentContinue` diverts to `storyChoice` once, path unchosen): stay a **Warden**
  or join the **Coil** as a **Herald** (`chooseAlignment` → `StoryState.alignment`). Real divergence, not a
  reskin: Ch.1–3 shared trunk; **Ch.4–5 are per-path variants** — Warden Abyssal/Serpent's Vigil (void/swamp,
  face + redeem Venoma) vs Herald Drowning Rite/Ghost Harvest (ocean/derelict, **crush Penelope then Driver
  Dan**), each collecting five distinct Sigils. `tournamentForChapter(chapter, alignment)` picks the row
  (`currentTournament`/`resolveStoryTournament` pass `story.alignment`); the **finale ending branches** —
  Warden "The Reseal" vs Herald "The Long Rest". `STORY_VERSION` → 2 (additive `alignment`; migrate keeps a
  valid value, drops junk). Own `.gs-choice*` prefix. Guarded by the fork/Sigil coverage in
  `tests/story-tournament.test.ts`, the migrate in `tests/story-state.test.ts`, the Choice→path→forked-venue
  flow in `tests/story-flow.test.ts`, and the `?screen=storychoice` smoke. **Deferred** (bible): the
  Sigil-less emotional MID-chapter per route (the friend won back / drowned) and the Gemini-Ice rally side
  world — a later content pass on this same alignment seam.
- **GS-story-route-rewards** — ✅ *shipped*. The paths now diverge in LOOT, not just beats. **Cursed
  sheddings vs Warden grace** (`storyGear.ts`, `alignment` + `curse` on `StoryGearItem`): Herald sheddings
  are stronger AND cheaper but each carries a real CURSE folded into its `apply` (Shed-Skin Grip: dispersion
  ×0.78 but a −10% credit tithe; Venom-Core Ball: +26% backspin but +8% dispersion; Coilstride Boots: huge
  lie-relief but −6% putt window). Warden grace is clean but dearer (Grace Gauntlet, Star-Blessed Ball,
  Hallowed Spikes). `storyGearStock` route-GATES them — you only ever see your path's relics (none before
  The Choice); the lore card wears the curse as a ⚠ detail line + a "cursed" tag (never a hidden trap).
  **Route ships** (`ships.ts` + `storyShips.ts`, `acquire: 'reward'` + `alignment`): the **Radiant Warden
  Cruiser** and the **Coil Wyrm-Ship**, each GRANTED (not sold — `grantStoryShip`) by winning that route's
  Chapter-4 major (`StoryTournament.rewardShipId`, granted in `resolveStoryTournament`), hidden from the
  shipyard until owned. No save bump (owned-lists + the existing `alignment`). Guarded by the relic
  route-gate/curse in `tests/story-shop.test.ts`, the route ships in `tests/story-ships.test.ts`, the
  reward `rewardShipId` + grant in `tests/story-tournament.test.ts` / `tests/story-flow.test.ts`. Deferred:
  a wyrm-ship "frailer in battle" finale nuance (the finale is gate-based, so it's flavour for now).
- **GS-story-midchapter** — ✅ *shipped* (`sim/rpg/storyInterlude.ts` + `app/storyInterludeScreens.ts`).
  The Sigil-LESS emotional interlude between the route majors: winning the Chapter-4 major diverts
  (`storyTournamentContinue`) once — before the clubhouse — to a story BEAT. **Warden "The Prism Accord"**
  (win a fallen friend back → a reunion + their parting gift) vs **Herald "The Severing"** (sever/betray a
  friend to complete the rite → the Coil's larger blood-money). Pure model: `interludeBeat(alignment)` +
  colour-coded dialogue, the "friend" a real roster golfer (`interludeFriend` = first non-protagonist, so
  the portrait is a face you've seen via `golferPreviewSVG`); fires exactly once (`seenStoryBeats`), the
  only mechanical consequence a credit outcome (`applyInterlude` — Herald pays more, the dark-path irony).
  Own `.gs-inter*` prefix; no save bump. Guarded by `tests/story-interlude.test.ts`, the
  Ch4-win→interlude→pay-once flow in `tests/story-flow.test.ts`, and the `?screen=storyinterlude` smoke.

**Phase F — Finale**
- **GS-story-yggdrasil** — ✅ *shipped* (`sim/rpg/storyFinale.ts` + `render/storyFinale.ts` +
  `app/storyFinaleScreens.ts`). The **Jörmungandr space battle** — the climax that SPENDS the shipyard's
  Combat Rating. The five Sigils forge the key (`keyToOtherRealm`), which opens the finale from a green
  clubhouse banner. A BRIEFING shows the serpent + your readiness across TWO gates so arming across
  categories matters (`finaleResult`): **breach** (WEAPON rating ≥ `FINALE_BREACH_NEED` 26) + **survive**
  (ENGINE+SHIELD rating ≥ `FINALE_SURVIVE_NEED` 30). Engage → a Canvas2D battle **cinematic**
  (`mountStoryFinale`, the recruitment-intro pattern: own mount/rAF/skip, vector-drawn Cthulhu-serpent +
  ship + a golf-ball finisher, plays the win/lose ending from the pre-resolved `won`; reduced-motion skips
  it) → the recap. WIN → `winFinale` sets `completed` → `storyComplete` (Star Tour unlocks; victory returns
  to the title); LOSS → the recap names which gate fell short + points to the shipyard for the rematch
  (progress kept). Deterministic (no RNG) + fair: a fully-stocked shipyard clears both gates with headroom,
  and the briefing tells you exactly what to buy. **This redefined `storyComplete` = `completed`** (the
  finale beaten) — five Sigils alone is the KEY, not completion (`story-state`/`story-tournament` tests
  updated). Own `.gs-fin*` prefix; no save bump (`completed` already exists). Guarded by
  `tests/story-finale.test.ts` (gates, win→complete, unlock), the finale flow in `tests/story-flow.test.ts`
  (win→title / lose→clubhouse), and the `?screen=storyfinale[result]` smokes. Deferred from the full
  vision: the **two alignment endings** (Warden "Reseal" vs Herald "Long Rest") land with the alignment
  fork; an **interactive** finisher shot is a later polish.

**Phase G — Polish**
- **GS-story-beats** — ✅ *shipped* (the story-round dialogue beats). Campaign NPC scenes threaded through
  the EXISTING generic LORE machinery (`sim/rpg/lore.ts`), so a beat is a DATA ROW and the gate/screen/
  once-only tracking are all reused — zero new engine. `LoreContext` gained three story fields
  (`storyRound?`, `storyChapter?`, `storyAlignment?`), populated by `withLoreGate` from `run.storyRound`
  + the live `StoryState` (`chapter`/`alignment`); every story beat gates on `storyRound === true`, so
  they can NEVER fire in Voyage/Unending. Four beats ESCALATE the campaign: `story-coil-named` (Ch.2 — the
  Parrot names the Coil cult), `story-coilkeepers` (Ch.3 — hooded cultists ring the tee), and Venoma's
  confrontation from Ch.4, branching on the chosen path (`story-venoma-warden` "You Chose Wrong" vs
  `story-venoma-herald` "Welcome, Sister"). Two bespoke portraits added to `render/loreArt.ts`
  (`venoma` — a viper-woman with amber slit-pupil eyes + fangs + a Coil-sigil hood; `coilkeeper` — a
  faceless hooded cultist, an acid-green void where a face should be), in the house SVG language + the
  Coil palette (venom-violet #b060c0 / acid-green #7fe0a0). The one-off is recorded in the main-save
  `seenLore` (across all runs/modes), like every other lore beat — no new save field. Because story
  rounds arrive through `withLoreGate`, a Ch.2+ arrival diverts to the `'lore'` screen first, then
  `dismissLore` continues to the intro. UI/render + a pure DATA table — zero sim rng (determinism/
  auto≡interactive untouched), no `_gs*`/URL hook. Guarded by `tests/lore.test.ts` (pure triggers +
  portrait coverage) + the story-beat flow in `tests/story-flow.test.ts`.
- **GS-story-apostate** — ✅ *shipped* (the review pass, `reports/story-mode-review-2026-07-18.md`). The
  bible's central antagonist, **Malachai "Sable" Voss, the Apostate** — previously absent from the build —
  now lands as a `voss` lore PORTRAIT (a human, tragic dark-mirror in the house SVG language + Coil palette,
  motif = the black driver that drips), a Ch.3 `story-apostate` beat (he holes an impossible shot and hands
  you the Coil's argument, placed after the Coilkeepers beat), the Ch.3 Storm Championship **rival** (a
  name-only swap off Venoma — all story rivals share the default ghost profile, so it's balance-neutral),
  the speaker who makes **The Offer** on the `storyChoice` screen (his portrait + quote replacing the
  anonymous Coilkeeper framing), and a `coil-apostate` parrot-bar line. Content/data + render only — zero
  sim rng, no save bump. Guarded by `tests/lore.test.ts`. Closes the review's top story gap (the tempter
  who gives The Choice its weight).
- **GS-story-parrot-bar** — ✅ *shipped* (the Parrot BAR interaction). "The Crow's Nest" — a cosmetic
  Story-Tour hangout aboard the Mothership, reached from the spaceport clubhouse (a "🍺 The Crow's Nest"
  doorway + the existing hub Parrot strip is now tappable). You TAP the Prognostic Parrot (or "Another,
  captain ›") to cycle his chatter, which ADAPTS to the campaign: a state-appropriate GREETING leads
  (chapter / chosen path / whether the finale's beaten), then rotating lore / Coil-threat / path / gameplay-
  hint lines gated on `chapter`/`alignment`/`sigils`/`completed`. Content-as-data: `sim/rpg/parrotBar.ts`
  (`PARROT_BAR_LINES` rows + pure `parrotBarLines`/`parrotBarLineAt`), a bespoke SVG cantina scene
  (`render/parrotBarArt.ts` — a porthole onto space, a neon sign, a glowing bottle shelf, the Parrot behind
  the counter reusing his lore bust `prognosticParrotPortraitSVG`), and the screen (`app/storyBarScreens.ts`,
  own `.gs-pbar*` prefix). The tap counter is a TRANSIENT UiState field (`storyBarTalk`, reset on open) —
  pure render, ZERO sim rng, NO save write (no `STORY_VERSION` bump), no `_gs*`/URL hook (just a new
  `?screen=storybar` deep-link value). Guarded by `tests/parrot-bar.test.ts` (pure table + selectors +
  cycling), the bar flow in `tests/story-flow.test.ts` (open/tap/exit, no story write), and the
  `?screen=storybar` browser smoke.
- **GS-story-balance** — ✅ *shipped* (the cross-chapter difficulty + economy pass). MEASURED first: the
  Story tournaments are ghost-vs-gross (the Asgard model) tuned for INTERACTIVE human play (a several-under
  round that grows with the bag), NOT the weak auto/watch AI. A headless probe of the rival ghost vs fixed
  to-par reference rounds exposed the problem: the old edges (0.12/0.22/0.33/0.42/0.50) made the LATE
  Sigils a near-wall — a strong grown (−6) round won only ~33% by Ch3 and ~13% by Ch5 (a *mandatory*
  progression gate!), with a Ch2→Ch3 cliff (~3 strokes). **Fix 1 — rival edges recalibrated** to a smooth
  ~1-stroke-harder-per-chapter curve (0.07/0.12/0.18/0.23/0.29, both Warden/Herald variants at Ch4/5): a
  −6 round now wins ~77% (Ch1) → ~38–46% (Ch5), a mid −4 round ~57% → ~23–27%, a maxed −8 round can take
  the climax with margin (~56–62%) — winnable-but-earned, no cliffs, growth matters. **Fix 2 — a Sigil
  milestone bonus** (`SIGIL_WIN_BONUS` = 250, first win only, `resolveStoryTournament`): winning a major
  pays +250 on TOP of the round so the tournaments are the paydays they should be — five Sigils ≈ the
  finale arsenal floor (~1300 cr), easing the escalating bag/ship/finale spend without trivialising it.
  Economy audit: the finale floor (scatter+railgun weapon 26, deflector+aegis defence 32 = 1300 cr) is
  comfortably affordable within the ~16 guaranteed paying rounds (~3200+ cr base, more with ship/engine
  mults + the Sigil bonuses); the finale gates + costs were left as-is. Guarded by `tests/story-balance.test.ts`
  (the rival curve is winnable, not a gimme, monotonic + no cliffs; the Sigil bonus pays on a win only;
  the round-pay curve). The `tests/story-tournament.test.ts` edge-monotonicity check was made seed-robust
  (a mean over seeds — the once-per-round form draw swamps the now-narrower edge gap on any single card).
  **Phase G, and the Story Tour campaign, is feature-complete.**

**Phase H — Presentation polish (the "it's flat" pass)**
The campaign is mechanically complete but its between-round screens read as flat button lists next to the
rich Earth-clubhouse / Crow's-Nest scenes. This phase makes every Story hub an interactive SCENE — you see
your golfer, your equipped kit, and the NPCs, and you TAP a place to go there.
- **GS-story-clubhouse-scene** — ✅ *shipped* (`render/storySpaceport.ts`). The post-recruitment SPACEPORT
  clubhouse (Chapter 1+) was a chip header + a parrot text card + a stack of labelled buttons. It's now ONE
  interactive Mothership-interior scene (its OWN identity, distinct from the cosmetic title Clubhouse): your
  golfer stands on the deck (their look, feet-anchored), the Prognostic Parrot tends the bar (his lore bust,
  the Crow's-Nest idiom), your equipped SHIP is parked in the hangar bay (`shipSVG`), and your active caddy
  stands at your side (a portrait standee, tap → their ally card). Four tap HOTSPOTS replace the button
  list — the star-chart viewport (`openStoryMap`), the hangar bay (`openStoryShipyard`), the locker bank
  (`openStoryLocker`), and the bar (`openStoryBar`) — each an always-labelled, aria-labelled button over the
  SVG (reuses the Earth-clubhouse feet-anchored-figure + hotspot idiom; container-query sized). Tournament/
  quest/finale banners + the crew wall + the New-campaign/Back footer still ride below. Pure render, ZERO
  rng (hand-placed, byte-stable), own `.gs-sclub*` CSS prefix (never the play HUD's `.gs-hud`). No sim/save
  touch. Reached honestly via `?screen=storyclub` (prologue → Chapter 1 spaceport); guarded by the
  `.gs-sclub-scene` browser smoke in `tests/build.test.ts`.
- **GS-story-locker-sections** — ✅ *shipped* (`app/storyLockerScreens.ts`). The locker was one long scroll
  (Your bag → Bench → Gear → Your crew), so reaching the crew meant scrolling past the whole bag ("you have
  to scroll all the way down past the bag to see caddies"). It's now COLLAPSIBLE ACCORDION panels — **Bag**
  (open by default) / **Crew** / **Gear** / **Bench** — each a compact tappable header with a live summary
  chip (bag count / active caddy / gear equipped / spares), so the crew + gear are one tap from the top
  instead of a long scroll. Crew is promoted high (the "gather your friends" ask). Open-state lives in a
  module `storyLockerView.open` Set (the `marketView`/`clubhouseView` pattern) so it survives the re-render
  an equip/unequip triggers — a native `<details>` would snap shut on every dispatch; `[data-lockersec]` in
  `app.ts` toggles it. A compact illustrated locker-room banner (locker bank + bench + bag, pure byte-stable
  SVG) tops the screen. Pure render/view + one app handler — no sim/save/rng touch. Guarded by the existing
  `?screen=storylocker` browser smoke (bag panel open ⇒ `.gs-lock-grid` + "Your bag").
- **GS-story-objective** — ✅ *shipped* (`sim/rpg/storyGuide.ts` + the clubhouse mission log + a new-game
  premise card). Player feedback: "the new game start gives you no indication of what's happening or why
  you are playing" and "after becoming world champion the game gives you nothing to go on — what do you
  need to do, what's involved?". Two fixes: (1) a NEW-GAME PREMISE card on the golfer picker — a short
  evocative brief (you're Earth's champion; win, and the Universe calls) + a 4-step road-map chip row
  (🌍 Win Earth › 🚀 Voyage › 🏆 5 Sigils › 🐍 Slay Jörmungandr), so the campaign's shape is clear before
  you tee off; the Earth clubhouse also gains a one-line "win to become Champion — then answer the call"
  hook. (2) a MISSION LOG panel atop the spaceport clubhouse driven by the pure `storyObjective(story)`:
  the overarching GOAL, a live Sigil progress row (5 pips + n/5), and the single most useful NEXT step —
  prologue → clear N more worlds (with a ↳ Set course button) → the tournament is open → engage the finale
  → complete (Star Tour unlocked). `storyObjective` is pure/deterministic, composed from the existing
  progression predicates (`currentTournament`/`tournamentForChapter`/`worldsClearedInChapter`/
  `finaleUnlocked`/`storyComplete`), so it's unit-tested (`tests/story-guide.test.ts`, every stage). Own
  `.gs-mission*`/`.gs-premise*` CSS prefixes. No sim/save/rng touch. Guarded by the guide unit test + the
  `?screen=storyclub` smoke (now asserts "Your mission").
- **GS-story-shop-scene** — ✅ *shipped* (`app/storyShopScreens.ts`). The per-world Pro Shop was a flat rack
  list; player feedback wanted "customised pro shop scenes and settings". It now opens with an illustrated
  shop-interior banner (`proShopSceneHTML`): a world-tinted shelving wall, a "PRO SHOP" neon sign, a glass
  club display case, a picture WINDOW onto the world's own ground/sky (tinted via `roughBaseFor(archetype)`),
  and the world's CLUB PRO standing behind the counter — the archetype-themed `proAvatarSVG`, so a green
  parkland pro, a desert pro, an ember pro etc. differ per world — with a "<world> pro" nameplate. Pure SVG
  + one positioned bust, byte-stable, zero rng; own `.gs-sshop-scene*` scope. The rack grid + lore cards are
  unchanged below. No sim/save/rng touch. Covered by the existing `?screen=storyshop` smoke (the scene mounts
  in the same screen; a throw would trip the crash/bounce guard).

## Open questions / deferred (revisit as chunks land)
- **Round length** per world / qualifying (9?) vs tournament final (18?) — tune in GS-story-tournament.
- **"Gather your friends"** — single protagonist (per the design call); the other three golfers are
  recurring Warden allies/friendly rivals in the majors, not a party you swap. Full recruitment stays a
  possible later beat, not a Phase A–F dependency.
- **Alignment scope** — the branch is a back-half *data* fork (same worlds/framework/star-map/battle;
  divergent NPCs, beats, gear/ship pools, ending), NOT a second campaign to author from scratch — so
  Chapters 1–3 are one shared build. New Game+ offers the opposite path. Tune how much Ch.4 diverges
  (world choice) vs shares in GS-story-chapters.
- **Ship weapon/engine effects** on the *golf* side vs *space-battle* side — decide the split in
  GS-story-ships (likely: engines/upgrades = travel/fuel + battle stats; weapons = battle only).
- **Balance** of a single persistent purse across a 5-chapter campaign — its own pass in Phase G.

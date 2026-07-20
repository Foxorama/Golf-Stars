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

- **GS-story-crew-scene** — ✅ *shipped* (`render/storySpaceport.ts`). Follow-up to GS-story-clubhouse-scene:
  the recruited crew now physically STAND in the Mothership clubhouse scene, not just a wall row below it.
  Each hired ally is a feet-anchored, tappable portrait STANDEE on the deck (→ their ally talk card); the
  ACTIVE caddy stands at your side with a pink ring + a 🎒 plate ("on the bag"), the rest gather along the
  deck in front of the bar (`CREW_SPOTS`, fixed byte-stable positions that clear the player + door hotspots +
  the locker label). The old `crewWallHTML` row is dropped (the scene shows them). Reuses `caddyPortraitSVG`
  + `crewRoster`/`allyName`; pure render, zero rng. Guarded by `tests/story-spaceport.test.ts` (the scene is
  a pure string builder: four hotspots + player always; one standee per recruited ally, the active one
  marked) + the `?screen=storyclub` smoke.

- **GS-story-shop-arrival** — ✅ *shipped* (`render/shopArrival.ts`). A short, skippable "you've touched
  down" beat the FIRST time (per session) you reach a world's Pro Shop: your ship descends onto the world on
  a landing beam, an "APPROACHING · <World> · ⛳ Pro Shop" title forms, then it dissolves to reveal the shop
  beneath. A self-contained DOM+CSS overlay (own `.gs-arr*` prefix, injected `<style>`) mounted from
  `app.ts` over the just-rendered shop — NOT the sim/reducer, a pure feel layer; it removes itself so it
  never blocks the shop. Tinted per world (`spaceLookFor`/`roughBaseFor(archetype)`), flies the player's own
  ship (`shipCardSVG`). Once per world per session via a module `shopArrivalsSeen` Set (no save bump).
  Reduced-motion resolves instantly (no overlay); every path is guarded so it can never strand the player.
  Guarded by a `tests/build.test.ts` browser smoke (beat mounts over the shop, then clears itself).

- **GS-story-herald-clubhouse** — ✅ *shipped* (`sim/rpg/storyHeraldCrew.ts` + `render/storyHeraldOverlay.ts`
  + the Coil scene in `storySpaceport.ts`). If the player takes the dark path at The Choice
  (`alignment === 'herald'`), the Mothership clubhouse becomes the COIL's — an ALTERNATIVE clubhouse + crew,
  grounded in the bible (which described Coil *agents* but no Herald base/roster; the gap this fills). Two
  halves: (1) the SCENE re-themes — violet-dark walls, an acid-green wash, and an OUROBOROS sigil in the
  viewport instead of a destination planet (the Warden palette is the default, byte-identical); the bartender
  is swapped for the Coil's CROW (GS-story-herald-bar, below). (2) the crew are the Coil INNER CIRCLE instead of the
  Warden caddies — **Sable Voss** (the Apostate, your mentor, at your side), **Venoma** (the Viper, your
  lieutenant), **Brother Ouros** (the Whisperer), **Sister Ecdysis** (the Shedmaker) — each a tappable
  standee (their lore portraits, the two hooded cultists differentiated by a hue filter) → a Coil talk card
  (own `.gs-herald*` prefix) with rotating Coil-flavoured banter. Deliberately ISOLATED: the Coil agents are
  clubhouse NPCs (`HERALD_CREW`), NOT caddies — they never touch the `caddyEffects`/faction coverage tables,
  so the Warden caddy system is entirely untouched. The talk card reuses the existing
  `storyInspectAlly`/`storyAllyTalk`/`storyCloseAlly` actions (the reducer guard widened to accept a Coil
  agent id, `isHeraldAgent`), so no new reducer plumbing/state; no new lore portraits (reuses voss/venoma/
  coilkeeper); no save bump. Guarded by `tests/story-spaceport.test.ts` (Herald mode shows the Coil circle,
  not caddies) + a `?screen=storyheraldclub` browser smoke (the `.gs-sclub-scene--herald` Coil scene).
  Deferred: a dedicated Coil FACTION row + bespoke Ecdysis/Ouros portraits (the bible's fuller vision) — this
  pass reuses existing art/factions to stay low-risk.
- **GS-story-herald-bar** — ✅ *shipped* (`render/loreArt.ts` `carrionCrowPortraitSVG` + `sim/rpg/parrotBar.ts`
  + the bar screen/scene). Player point: "why would the parrot stay loyal? that doesn't make sense — needs a
  new bartender if you join the cult." Correct — and the bible has the answer: the **Carrion Prophet, the
  Crow**, the Coil's true prophet and the Parrot's dark mirror. On the Herald path he takes the roost: (1) a
  new **Crow bust** (a black hooded raven, bone-pale hooked beak, a single BURNING eye, tattered Coil cowl
  with an ouroboros clasp) sized to the Parrot's 320×340 viewport so it drops into the exact same slots —
  behind the clubhouse mini-bar (`storySpaceport`) AND the full Crow's-Nest scene (`parrotBarArt`, which also
  burns its neon venom-violet). (2) the bar's **voice** switches: `ParrotBarLine.speaker` (`parrot`|`crow`)
  splits the chatter table into two coherent pools — `parrotBarLines` serves only `crow` lines on the Herald
  path, only `parrot` lines otherwise, so the Parrot's biography never comes out of the Crow's beak. A full
  Crow pool (greeting/lore/coil/hint/path/complete) in his calm, certain, patient voice — the Coil's "mercy"
  creed, the serpent's "rest", and the ironic hint to arm the ship ("the cage was always meant to open").
  (3) the screen labels swap — "The Carrion Prophet", "tap the Crow", "Speak on, prophet" — and the
  clubhouse quote line reads the Crow (violet 🐦‍⬛) not the Parrot. Content/render only; no save bump; the
  Warden bar is byte-identical (default speaker `parrot`). Guarded by `tests/parrot-bar.test.ts` (the Herald
  pool is crow-only, no Parrot lines leak; the Warden pool has no crow lines) + a `?screen=storyheraldbar`
  browser smoke.
- **GS-story-fixes** — ✅ *shipped* (reported-bug batch). Golfer-select overlay z-index (the clubhouse
  figures painted over the stats card → `isolation:isolate` on the scene); crew avatars (floating-head
  circles → the full portrait bust as a standee); star-map docking returns to the STORY clubhouse in story
  mode (`exitStoryMap`), not the title Clubhouse; a world-clear recap leads to the star chart (`openStoryMap`
  from `storyResult`) so you fly on / home; and NAMED quest-reward clubs (`NAMED_STORY_CLUBS` / `quest:<key>`
  ids) carry the ally's signature name into the BAG + are all the same legendary tier (the Sandy-vs-Dr
  parity bug).
- **GS-story-pacing** — ✅ *shipped*. The opening no longer spoils the campaign: the new-game premise hypes
  ONLY the World Tour final (no Coil/serpent/Sigils); the Parrot reveals the real quest at the Crow's Nest
  in a Chapter-1 briefing greeting (`parrotBar.ts` `greet-recruited`), and the recruitment cinematic bridges
  to it ("meet me at the bar — I'll tell you everything").
- **GS-story-serpent** — ✅ *shipped* (`render/sigilCeremony.ts`, exported `paintSerpent`). The post-Sigil
  cutscene serpent was a string of gradient balls (a "worm"); it's now a MASSIVE scaled world-serpent — a
  continuous tapered body (one filled ribbon), overlapping crescent SCALES, and a lit dorsal ridge with
  spines. The **HEAD** was reworked a second time (the body read well but the head was a flat blob with a
  giant floating eyeball + a stray red thread): a proper wedge silhouette (neck → raised bony brow → snout →
  tip → upper lip → mouth corner → jaw), scales continuing onto it, a dark mouth seam + nostril, a real
  forked TONGUE flicking from the mouth as it wakes, and a PROPORTIONATE slit-pupil eye (~0.42× the head
  unit) seated under a brow-ridge arc — no longer a disc bigger than the head. Head size tracks the body
  girth + a modest focus-reveal zoom (not the old runaway 26→118). Extracted to `paintSerpent` so
  `scripts/serpent-preview.mjs` renders it eyes-on at any wake/focus. Pure Canvas2D, zero rng.
  The head was then rebuilt a THIRD time into a MYTHIC world-serpent (`drawSerpentHead`, "still half a head"):
  a pair of back-swept HORNS from the cranium, an OPENING FANGED MAW (a separate dropping lower jaw + a dark
  red throat + curved white fangs top & bottom, gaping wider as it wakes), a DEEP-SET reptilian eye (mottled
  sclera, bloodshot veins, a slit pupil, a cold glint) under a shadowed brow (a cast-occlusion socket),
  directionally-lit head SCALES, a nostril slit, and a green RIM-LIGHT along the top silhouette. The maw +
  eye + horns all animate open with `wake`/`focusHead`. **Deferred
  (GS-story-serpent-beat):** moving the next-chapter Coil/parrot lore beat to fire IMMEDIATELY after the
  cutscene (instead of on the next world arrival) — the arrival beats are authored for the round-arrival lore
  gate, so relocating them cleanly is a lore-flow redesign, left for a focused follow-up rather than risking
  beat double-fires.
- **GS-story-tournament-reward** — ✅ *shipped* (`storyTournaments.ts` + `gameUpdates.ts resolveStoryTournament`).
  The Galaxy Tournaments named a prize CLUB in the `prize` blurb but never granted it — the reported "won the
  Emerald Invitational, never got the club" bug (majors only banked the Sigil + any `rewardShipId`, no club
  path). Added `StoryTournament.rewardClubId` (a NAMED `major:<key>` id → `NAMED_STORY_CLUBS`, solar/legendary
  for parity with the ally gifts) on the three trunk majors (Emerald→`major:emerald` Verdant Wood,
  Forge→`major:ember` Forgefire Driver, Storm→`major:storm` Galewarden Irons, distinct base TYPES from the
  quest gifts) and grant it on a first win exactly like `completeQuest` (own + `equipStoryClub`, guarded by
  `alreadyWon`). Locker inspect + lorable-id now handle `major:` ids too. Guarded in `story-balance.test.ts`
  (win grants + equips, loss doesn't) + `story-tournament.test.ts` (each trunk prize resolves + has an effect).
- **GS-story-club-effects** — ✅ *shipped* (`sim/rpg/storyClubEffects.ts`). A quest/tournament reward club is
  no longer "just the next tier": each NAMED reward club folds a signature EFFECT onto the round loadout when
  equipped (Sandy's wedge = strong `lieRelief`; Dan's driver = `driverAnywhere` + distance floor; Chipinski =
  `chipInBoost`; Penelope = `puttBoost`+read+`greenRead`; Sam = tighter `dispersionMult`; Mole = `greenRead`+
  spin read; Emerald = tighter dispersion; Ember = driver distance floor; Storm = strong `windResist`). Pure
  loadout fold — the `applyStoryGear`/`applyStoryCaddy` sibling, reusing existing `PlayerLoadout` fields (no
  shot-resolver change), folded at all four story loadout builds so auto ≡ interactive holds; story rounds
  only, every effect only ever HELPS. Shown as "✦ Special: …" on the quest recap, the tournament lobby prize,
  and the locker card. Guarded by `tests/story-club-effects.test.ts` (coverage: every named reward club has an
  effect; fold is a no-op when none equipped; effects never hurt).
- **GS-story-quest-9 / GS-story-quest-beat** — ✅ *shipped*. An ally side quest used to be a full 18-hole
  round offered the instant you recruited them, so it read as "you just cleared this world — now play it
  again." Two fixes: (1) a quest is now a shorter **9-hole** round on a **DISTINCT** layout — `currentCourse`
  regenerates the venue spec with `holes:9` + a `:quest`-salted seed when `run.storyQuest` is set (a normal
  world round / Star-Tour round has no `storyQuest`, so it's byte-for-byte the pinned 18). (2) The quest
  offer holds a **beat**: `questOfferable` now also requires the player to have cleared at least one world
  OTHER than the ally's home world (`clearedElsewhere`) — so it opens up only once you've flown on and come
  back, never on the same clubhouse visit as the recruit; `questBeatPending` drives a "give it a beat — play
  on" crew-card message for the waiting state. The accepted-quest banner now shows the ally's authored
  `offer` dialogue (previously unused) as a spoken send-off before you fly. Guarded by `story-quests.test.ts`
  (the beat gate holds then opens) + `story-flow.test.ts` (a quest round is 9 holes).
- **GS-story-fullbody** → **superseded by GS-story-figures.** The first fix wrapped each portrait BUST as the
  head+torso of a figure with drawn legs beneath (`storyStandee.ts`) — but a bust authored as head+chest with
  stick-legs bolted under it read as programmer-art (big head / short legs), rejected on sight. Removed.
- **GS-story-figures** — ✅ *shipped* (`render/coilAgentArt.ts` + `render/storyFigure.ts`; see
  `docs/decisions/art-style.md`). The clubhouse crew now use the game's OWN full-body art: Warden allies draw
  through their on-course `caddyArt.ts drawCaddy` figure (Dan's driver over the shoulder, Sandy's sand-spray,
  the Mole's mound, the Parrot's tricorne), and the Coil agents get a new `drawCoilAgent` sibling — hooded,
  robed cultists in the venom-violet house style (the gaunt hood-down Apostate, the Viper with her serpent, the
  anonymous Keepers). ONE dispatcher (`drawStoryFigure`/`hasStoryFigure`) turns any story-character id into its
  figure; the standees emit `<canvas class="gs-caddycv" data-caddy=id>` and the existing app.ts mount pass
  (shared with the on-course caddy badges) draws them — so clubhouse + course share one figure rule, no bust
  hybrid. `CREW_SPOTS`/sizing re-tuned so the cast reads spread, not piled. Preview:
  `node scripts/storyclub-preview.mjs`. Guarded by `tests/story-figure.test.ts` (every recruitable ally + every
  Coil agent resolves to a figure/look). Establishes the reference-first process in `art-style.md` so visuals
  stop getting revisited 6–7 times.
- **GS-story-herald-sanctum** — ✅ *shipped* (`render/storySpaceport.ts coilSanctumArt`). The Herald clubhouse
  was just the Mothership backdrop with a violet tint — not culty. It's now a wholly separate RITUAL SANCTUM
  backdrop (same zone geometry so the hotspots + figures still line up): obsidian carved walls with a great
  etched ouroboros, serpent PILLARS with green-flame braziers flanking a SHRINE built around a giant
  slit-pupil serpent EYE (the "Set course" portal → the World-Eater's gaze), a candle ALTAR, a RELIQUARY
  (skull / coil idol / specimen) in place of the lockers, specimen JARS behind the Crow's bar, hanging cult
  BANNERS, and a glowing ritual CIRCLE inlaid in the stone floor. `coilSigil`/`greenFlame` helpers, own
  `cs-*` gradient ids. Gated to `herald` → the Warden backdrop is byte-identical. The shrine EYE is a
  deliberately CREEPY reptilian eye (GS-story-herald-eye): a sunken bony socket, sickly mottled sclera,
  bloodshot veins creeping from the corners, a green iris with a vertical SLIT pupil that dilates, a cold
  pinpoint glint, an ichor tear, and a slow menacing BLINK (all SMIL-animated). Preview:
  `node scripts/storyclub-preview.mjs`.
- **GS-story-bar-name** — ✅ *shipped* (`sim/rpg/story.ts storyBarName`). Both clubhouses were calling the bar
  "The Crow's Nest". Now the Warden bar is **The Parrot's Perch** (the Prognostic Parrot tends it) and only the
  Herald sanctum bar is **The Crow's Nest** (the Carrion Crow). One helper `storyBarName(herald)` is the single
  source, used by the clubhouse neon sign + hotspot (`storySpaceport.ts`), the bar screen title
  (`storyBarScreens.ts`), the bar scene sign (`parrotBarArt.ts`), and the Parrot's greeting (`parrotBar.ts`).
- **GS-story-shop-routing** — ✅ *shipped* (`game.ts openStoryShop`). The first-time (world-clear RECAP) Pro
  Shop set `storyShopReturn: 'story'` and dumped you back at the clubhouse, while the revisit (star-map) shop
  returned to the map. Both now return to the **star map** (`storyShopReturn: 'starTour'`) — a first-time clear
  flies you on. Guarded by `story-flow.test.ts`.
- **GS-story-locker-inspect** — ✅ *shipped* (`storyLockerScreens.ts`). Clubs + gear were tappable-to-inspect
  in the locker; CADDIES were not. A hired caddy's chip now shows its portrait + is tappable → the same lore
  overlay as everything else, via a new `StoryCard.kind: 'caddy'` branch in `lockerCard` (name + the shop-item
  effect `desc` + faction lore) and a caddy branch in `inspectOverlay` (portrait icon + a "Carry my bag"
  footer). `storyInspectItem` now accepts a hired-caddy id.
- **GS-story-quest-icon** — ✅ *shipped* (`storySpaceport.ts crewStandee`). A gold ❗ marker bobs over a
  clubhouse caddy who has an offerable quest right now (`questOfferable`), so you don't have to open each ally
  to find who's waiting. Pure render (own `.gs-sclub-questmark` class).
- **GS-story-ship-interior** — ✅ *shipped* (`render/shipInteriorArt.ts` + `app/shipInteriorScreens.ts`).
  The ship on the Story star chart is TAPPABLE (`shipTappable` opt on `starTourMap` → a transparent hit disc
  over the hull, story-mode only; Star Tour proper leaves it inert). Tapping it BOARDS the ship
  (`openShipInterior`, gated on `screen === 'starTour'` + a story) — a `shipInterior` screen with FIVE rooms
  you walk between via a tab bar (bridge · lounge · weapons · engine · locker; `SHIP_ROOMS`/`ShipRoom` in
  `gameState.ts`). Each room is an illustrated SVG backdrop tinted to the FLOWN ship's palette
  (`shipInteriorTheme` reads hull/accent/flame/glass off `ShipLook`; gradient ids are per-theme suffixed so
  co-mounted SVGs never cross-bleed) — so a woody wagon, a red racer, the teal Mothership and the near-black
  gold-trimmed Firebird all feel like different vessels for free, no per-ship art. Your CREW wander aboard:
  each boarding bumps `shipVisit`, a stable `id×visit` hash re-scatters them to new rooms, and whoever is in
  the room you're in stands there as a tappable full-body standee (the SAME `<canvas class="gs-caddycv"
  data-caddy>` the app.ts mount pass already draws — Warden caddies or the Herald Coil agents, via
  `crewAboard`). The WEAPONS + ENGINE rooms OUTFIT the ship (buy `STORY_SHIP_UPGRADES` for that category
  without flying back to a vendor — `storyBuyUpgrade` relaxed to allow `shipInterior`; combat rating rises);
  the LOCKER room opens the campaign locker (`openStoryLocker` relaxed + `storyLockerReturn` so exiting
  returns aboard); the BRIDGE is the helm. Exit → back to the star chart (`exitShipInterior`). The
  ally/upgrade inspect cards reuse the existing overlays (`allyInspectOverlayHTML`/`heraldAgentOverlayHTML`
  for crew, the exported `shipInspectOverlay` for upgrades). Changing the actual SHIP still happens at the
  clubhouse Hangar; buying a new ship already auto-equips (`buyStoryShip`), so a fresh hull's rooms show at
  once. Own `.si-*` CSS prefix (never `.gs-hud`); pure render + reducer plumbing, no rng/save bump. Deep-link
  `?screen=shipinterior` + a `tests/build.test.ts` smoke row guard the render.

## Phase I — the herald/sigil follow-up (player asks)
- **GS-story-ragnarok** — ✅ *shipped* (`sim/rpg/lore.ts` + `render/sigilCeremony.ts` + tournament intros).
  Player point: the impending-Ragnarök stakes only landed around the Storm Sigil (Ch.3); the other Sigils
  felt storyless. Now EVERY Sigil chapter carries an escalation beat that tracks the sigil-ceremony's waking
  serpent (chapter N = N−1 Sigils set = `wakefulness`): `story-omen-emerald` (Ch.1, the first tremor — gated
  to the Emerald Invitational tee-off via a new `LoreContext.storyTournament` flag so the early practice
  worlds still tee off clean, GS-story-pacing), `story-omen-abyss-{warden,herald}` (Ch.4, the eye half-opens),
  `story-ragnarok-{warden,herald}` (Ch.5, Ragnarök at the door / the Long Rest). Back-half beats branch by
  path (Warden → the Prognostic Parrot; Herald → the Carrion `crow` portrait, newly wired into
  `lorePortraitSVG`). Every Galaxy-Tournament `intro` splash gained a Sigil-count Ragnarök line, and the sigil
  ceremony captions ESCALATE with the count (`serpentStirCaption`/`keystoneSubtitle` → "one Sigil from
  Ragnarök"). Content/render + a lore-ctx flag only: zero sim rng, no save bump, no `_gs*`/URL hook. Guarded
  by `tests/lore.test.ts`; the tournament-flow + `storytournamentresult` smoke dismiss the new Emerald beat.
- **GS-story-qualifiers** — ✅ *shipped* (`sim/rpg/storyQualifiers.ts` + `story.ts` + `storyTournaments.ts` +
  reducer/screens). Player ask: make the qualifying rounds real tournaments with a field of competitors, and
  gate each Sigil on finishing TOP-N in TWO events (10/8/6/4/4 by chapter). Each chapter's non-venue worlds
  are now QUALIFYING EVENTS: playing one resolves a deterministic ghost FIELD (each rank plays a fixed to-par
  so the qualifying bar is crisp + tunable — a mandatory gate must never wall a competent round; qualifier
  worlds are revisitable to improve a finish) and records the best placement. `StoryState.qualifierResults`
  (STORY_VERSION 3→4, additive migration); the gate (`currentTournament`, the objective guide) now reads
  `chapterQualifiersMet` (two top-N finishes), not `worldsClearedInChapter`. The venue is never a qualifier
  (it's the major). The world-clear recap shows the leaderboard with the top-N cut line + a qualified/missed
  verdict + the running "n of 2" progress. Qualifiers ride the existing 18-hole world-round path (no new
  format); `storyQualifiers` imports only `story` (the alignment-aware wrappers live in `storyTournaments` →
  no cycle). Guarded by `tests/story-qualifiers.test.ts` + updated tournament/guide/state/flow tests + a
  `?screen=storyqualresult` recap smoke.
- **GS-story-gear-tiers** — ✅ *shipped* (`sim/rpg/storyGear.ts`). Player ask: gear should be ONE per slot
  (like clubs — you already can't stack two gloves in `equippedGear`/`applyStoryGear`), with the higher tier
  strong enough to make up for no stacking. Completed the ladder with a clean LEGENDARY apex per slot —
  Master's Grip (glove ×0.72), Oracle's Circlet (hat +0.24 putt), Void-Anchor Boots (shoes 0.7 lie-relief),
  joining the legendary Comet ball — each dearer and stocked only in deep worlds both paths visit. Existing
  rare/epic values unchanged (their tests still hold). The locker gear panel now states the one-per-slot rule
  outright. Guarded by a tier-ladder + no-stack test in `tests/story-shop.test.ts`.
- **GS-story-map-fixes** — ✅ *shipped* (a player-reported bug batch). Four fixes:
  (1) **Herald caddy prose** (`storyTournaments.ts` + `storyTournamentScreens.ts`) — the Herald majors called
  Driver Dan "your first caddy" and Penelope the Warden "who once read your putts", but on the Herald path you
  can NEVER recruit a Warden caddy (`hireStoryCaddy` no-ops for `herald`) and Dan's world (`derelict-18`) only
  unlocks at Chapter 5 anyway, so the personal-caddy history was almost always fiction. Reframed both (intros +
  the `rivalHalftimeLine`/`rivalTaunt` dialogue) to their true canonical role — the Order's old road-caddy /
  the Wardens' green-reader you've turned against — so the betrayal lands in every playthrough. Content-only.
  (2) **Ship-interior owned-only** (`shipInteriorScreens.ts`) — the Weapons/Engine bays aboard your ship now
  show ONLY installed (owned) upgrades (`ownsUpgrade` filter, matching the `outfitCard` "you only see what's
  INSTALLED" intent); you outfit at a ship-vendor world's SHIPYARD, not in the hull.
  (3) **Ship-interior undismissable card** (`ui/game.ts`) — the `storyCloseItem` reducer guard was missing the
  `shipInterior` screen (its sibling `storyInspectItem` had it), so an aboard lore card could never be closed.
  Guard widened.
  (4) **FIRE fires the equipped weapon + service icons** — the star-map FIRE button fired the ship HULL's
  cosmetic default gun, ignoring owned weapon UPGRADES; `tourWeaponFor(shipId, ownedShipUpgradeIds)`
  (`render/shipWeapons.ts`) now fires the BEST owned weapon upgrade (nova › railgun › scatter) and falls back
  to the hull gun byte-identically when none are owned (Star Tour records-chase). And the map destinations gain
  **service badges** (`starTourMap.ts serviceBadges`) — 🚀 on the 5 ship-vendor SHIPYARD worlds (the key
  differentiator for finding where to arm up), 🛒 on any PRO SHOP world — so you can read where to shop
  straight off the chart. All render/data + a reducer guard; no save/rng/`_gs*` hooks.
- **GS-story-gather-early** — ✅ *shipped* (`story.ts` + `gameUpdates.ts`). Player ask: two Warden friends —
  Driver Dan (the derelict, his old rig) and Mystic Mole (the Hydra Mire) — waited at **Chapter-5** worlds, so
  by the game flow there was no time to fly out, recruit them, and complete their personal quests before the
  finale (the quest loop needs a fly-out-and-back). Their homes are FIXED by canon (Dan↔"the Long Haul",
  Mole↔"the Mire" are their quest narratives) and their worlds can't change chapter (the qualifier system
  hard-assumes exactly two qualifiers per chapter = three worlds), so the fix DECOUPLES a world's **chart
  reachability** from its **tournament tier**: a new optional `StoryWorld.chartChapter` (defaults to
  `unlockChapter` → every other world byte-identical) sets when a world first appears on the star chart to
  VISIT (recruit / quest / clear), while `unlockChapter` still governs its qualifier grouping, difficulty/
  weather tier, and payout. The derelict + mire now `chartChapter: 4` — a full chapter before the finale,
  and **post-Choice** (recruiting is Warden-only, so no pre-Choice recruit of a friend you might then betray;
  the `heraldQuestHook` "never Dan/Mole" invariant holds because Ch.4 is post-Choice and a Herald can't quest).
  A Warden gathers both across Ch.4–5 with room to run their quests; a Herald (who deliberately can't recruit
  the Warden friends — the Coil inner circle is their crew) can at least explore/shop those worlds a chapter
  early. Visiting a world BEFORE reaching its chapter is a plain exploration clear, not an out-of-chapter
  qualifier board (`resolveStoryRound` gates the qualifier resolution on `storyWorldChapter(courseId) ≤ your
  chapter` — byte-identical for all ordinary play, where no world is ever reachable above the current chapter).
  `storyWorldUnlocked` (the map's only reachability consumer) reads `chartChapter`. Pure model + one reducer
  guard; no save bump, no `_gs*`/URL hook (no test-hub wiring). Guarded by `tests/story-state.test.ts` (the
  chart-vs-tier decoupling) + the Ch.4 gather-early flow in `tests/story-flow.test.ts`.
- **GS-story-caddy-rep** — ✅ *shipped* (`story.ts` + `storyCaddies.ts` + `storyQuests.ts` + `gameUpdates.ts`).
  Player ask: an ally caddy's personal SIDE QUEST used to unlock the moment you'd recruited them + flown on
  once — "establish a reputation-style system without implementing one": a caddy should offer their quest only
  after you've **played a round with them on the bag**. New persisted `StoryState.caddiedRoundIds` (STORY_VERSION
  5→6, additive migrate → `[]`) records every caddy you've completed a Story round with as your ACTIVE caddy;
  `recordCaddyRound(story)` is folded into BOTH round-resolution sites (`resolveStoryRound` — world clears /
  qualifiers / quest rounds — and `resolveStoryTournament` — the majors), a no-op when no caddy is active.
  `questOfferable` gains a `caddiedWith(story, caddyId)` gate (on TOP of the existing chapter + "played on
  elsewhere" beat), so a quest never unlocks the instant you hire; `questBeatPending` now distinguishes the
  "put them on the bag for a round first" hold (no reputation yet) from the "play on elsewhere" beat, and the
  crew card says the right thing. Path-AGNOSTIC by construction — it reads the active caddy, so a Herald's Coil
  volunteer earns their quest the same way (this is the seam GS-story-herald-quests builds the Coil caddy
  quests on). Pure model + two reducer record-calls + one render string; the only new hook is a save field (no
  `_gs*`/URL hook, no test-hub wiring). Guarded by `tests/story-caddies.test.ts` (record/idempotent/active-only),
  the rep gate in `tests/story-quests.test.ts`, the migrate in `tests/story-state.test.ts`, and the
  recruit→carry-a-round→quest-opens flow in `tests/story-flow.test.ts`.
- **GS-story-herald-quests** — ✅ *shipped* (`storyQuests.ts` + `story.ts` + `storyClubEffects.ts` +
  `storyHeraldOverlay.ts` + `storySpaceport.ts`). Player ask: "for the Heralds they get all the Coil figures
  as potential caddies" — give those Coil caddies their own side quests too. The four Coil inner-circle
  volunteers (Voss / Venoma / Ouros / Ecdysis, `HERALD_CADDY_IDS`) now each carry a quest, built on the same
  machinery as the Warden ally quests. `StoryQuest` gains an optional `alignment` (a `'herald'` quest is
  offerable ONLY on the dark path; a Warden quest ONLY on the light/undecided path — collapsed into one
  `questMatchesPath` check that REPLACES the old blanket "no quests for a Herald" GAP2 rule) and an optional
  `world` (the Coil volunteers have no recruit world, so each quest names its own thematic Herald world —
  Voss→the Sagittarius Core abyss, Venoma→the Hydra Mire, Ouros→the Cetus deep, Ecdysis→the Eridanus
  Drowning shrine; all verified to build fair 9-hole quest layouts). Each grants a NAMED, solar-tier reward
  club (`quest:voss/venoma/ouros/ecdysis` in `NAMED_STORY_CLUBS` + a signature `STORY_CLUB_EFFECTS` fold
  mirroring that agent's on-bag caddy effect — so the every-named-club-has-an-effect invariant holds). They
  INHERIT the GS-story-caddy-rep gate for free (path-agnostic — carry the bag with the Coil agent a round
  first). UI: the Coil agent talk card (`heraldAgentOverlayHTML`, now passed `story`) reuses the exported
  `questSlotHTML` + a "🎒 Carry my bag" swap, and the sanctum standees float the ❗ quest marker. CRITICAL
  isolation: `heraldQuestHook` (the Severing betrayal beat) now filters to `alignment !== 'herald'` quests, so
  a completed Coil quest never becomes the "friend you betrayed" the beat pulls on. Content + data + UI
  threading; no save bump, no `_gs*`/URL hook (no test-hub wiring). Guarded by the Coil-quest coverage +
  path-gating + hook-isolation in `tests/story-quests.test.ts`, the reward-club effect coverage in
  `tests/story-club-effects.test.ts`, and the Herald accept→tee-off flow in `tests/story-flow.test.ts`.

## Phase J — the deep betrayal arc (GS-story-betrayal)
The single-protagonist "your three friends are recurring rivals" model was thin. This phase turns the other
three playable golfers into a real, partnerable CAST whose choices DRIVE the back-half betrayal — huge
replay value (the arc differs by caddie, quest, chosen partners, alignment, and each character's own voice).
Full design + rationale in `docs/decisions/story-betrayal-arc.md`. Shipped as focused auto-merged PRs:
- **GS-story-cast** — ✅ (#508) the 3 friends travel aboard + stand in the clubhouse/lounge, tappable like the
  Parrot; per-character voices that go warm (Warden) / wary (Herald) after The Choice.
- **GS-story-team-format** — ✅ (#509) `storyTeams.ts`: a pure, deterministic ghost engine — scramble/best-ball
  team stroke vs opposing PAIRS + the 2v2 best-ball matchplay resolver, reusing `match.ts`.
- **GS-story-partners + stableford** — ✅ (#510) **the Sigils get distinct FORMATS**: Sigil 1 = 2-ball SCRAMBLE,
  Sigil 2 = BEST-BALL (pick a friend partner, opposing pairs include the two you *didn't* pick), Sigil 3 =
  single-person (Stableford at ship; **now singles MATCHPLAY** per GS-story-sigil-formats). `StoryState` v5
  `sigil1Partner`/`sigil2Partner` lock the picks that decide the betrayer.
- **GS-story-betrayer + finale** — ✅ (#511) the **odd-one-out** rule (two different partners → the unpicked
  friend defects; the same partner twice → that trusted friend does), and the Ch.5 Sigil is a **2v2 MATCHPLAY**:
  WARDEN = You + a loyal friend vs (the Betrayer, in corrupted Coil garb, + Venoma); HERALD = You + the Coil
  champion who isn't your guide vs the two friends who partnered you.
- **GS-story-sigil-formats** — ✅ (2026-07-20) the **format-correctness** pass so each Sigil PLAYS what its copy
  promises: Sigil 3 Stableford → **1v1 SINGLES MATCHPLAY** vs the Apostate (`resolveStorySinglesMatch`, hole-by-
  hole, lower score takes the hole, win-or-halve → the Sigil); Sigil 5 best-ball → **2v2 SCRAMBLE MATCHPLAY**
  (both sides share a ball — `resolveStory2v2Match(..., 'scramble')`, best-of-3 bites). The retired Stableford
  scoring path (`rivalStableford*`/`stablefordLeaderboard`/the `stableford` recap flag) is gone; the lobby +
  recap read matchplay scorelines, the partner-picker copy names the format, and the recap leaderboard's serpent
  🐍 glyph is gated to **Ch.3+** (Ch.1/2 opposing pairs show a neutral 🚩 — the "everyone's a snake in the
  Emerald leaderboard" bug). Pure resolver + reducer/screen wiring; no save bump, no sim-rng/`GENERATOR_VERSION`
  change (the story ghost model is separate from the seeded golf stream).
- **GS-story-betrayal-beats** — ✅ (#512) the mid-chapter interlude reworked into the **per-character** betrayal:
  Warden "The Defection" (the betrayer's own voice, corrupted portrait, sets up the shrine) and Herald "The
  Severing" (keyed to your first completed caddy quest + whether you still wield its reward club). Four
  distinct `BETRAYAL_VOICE`s.
- **GS-story-charquests** — ✅ each friend carries a SIGNATURE quest that opens once you partner them in a team
  Sigil; claim their signature club (`charquest:<id>`) on their talk card. No save bump.
- **GS-story-reward-variety** — ✅ *shipped* (`sim/rpg/storyRewards.ts` + `storyQuests.ts` + `storyGear.ts` +
  `storyShipUpgrades.ts` + `storyTournaments.ts`). The player ask: quest loot was 100% clubs — "space them
  out so it's some equipment, spaceship parts etc". A quest reward is now a `StoryReward` union
  (`{kind:'club'|'gear'|'upgrade'|'ship', id}`) granted through ONE idempotent channel (`grantStoryReward`:
  club→bag, gear→locker slot, upgrade→fleet, ship→hangar), so a caddy quest hands over whatever fits the
  friend's story — the gold standard being Suggestible Sam's *Conviction* (the reward IS the character beat),
  which is **deliberately untouched** as the exemplar. The spread, per giver's story:
  - **Warden caddy quests:** Dan the old trucker → his rig's salvaged **engine** (`upg:engine:longhaul`, a
    ship part — Combat Rating + credits); Dr Chipinski the medic → a healing **Phoenix Core Ball** (gear);
    the Mystic Mole → a green-reading **Dowser's Circlet** (gear); Sandy → her **wedge** (club); Penelope →
    her **putter** (club); **Sam → Conviction (club, untouched)**.
  - **Coil (Herald) caddy quests:** Voss → the Apostate's **driver** (club); Venoma → the **Viper's Fang**
    (club); Brother Ouros → the **Whisperer's Cowl** (gear); Sister Ecdysis the smith → serpent-scale hull
    **Carapace** (`upg:shield:carapace`, a ship part).
  - **Majors:** Ch.1–3 clubs · Ch.4 **ships** (warden-cruiser / wyrm-ship, GS-story-route-rewards) · the two
    Ch.5 climax majors — which used to grant NOTHING tangible — now forge a capital **ship part** each
    (`upg:weapon:starlance` / `upg:weapon:wyrmfang`, `rewardUpgradeId`), so the fifth Sigil literally forges
    a weapon for the finale space battle. A `reward`-acquire ship upgrade is revealed only once owned + never
    racked (the reward-ship pattern); reward gear is priced but kept out of every shop rack. Quest offer +
    recap cards tease the reward's kind + effect, so seeking out an NPC is a concrete, finale-relevant pull.
    The five converted quests' old `quest:<key>` CLUB rows were retired from `NAMED_STORY_CLUBS`/
    `STORY_CLUB_EFFECTS`; `heraldQuestHook` now reads the first completed Warden quest whose reward is still a
    club (the "you still swing the club she gave you" betrayal beat). Guarded by the story-quests/
    club-effects/ships/ship-upgrades/flow suites. No save bump (all ids ride existing owned-lists).
- **GS-story-betrayal-polish** — balance re-tune of the new formats + docs (this phase's tail).

All of it holds the constitution: deterministic ghost model (auto ≡ interactive), Story-save only (the one v5
bump is the partner fields), Voyage/Unending byte-identical (every new lever no-ops by default).

## Phase K — the Pro Shop overhaul (GS-story-shop-depth)
Player feedback: the per-world Pro Shops were "a total bust" — hardly any non-club items, and the gear that
existed was "all the same thing for the same slots except better at higher tiers" (a glove that tightens, a
hat that putts, shoes for lie, a ball that spins — one effect per slot, a straight tier ladder). No distance
items, no interesting balls/hats, nothing to be excited about; you couldn't see what you had equipped or
whether an item was an upgrade; the shop couldn't reach the caddy/shipyard at the same world. This phase makes
each shop a place you're *excited* to reach. Shipped as focused, auto-merged PRs:
- **GS-story-shop-depth** — ✅ *shipped* (`sim/rpg/storyGear.ts`). The gear catalogue goes DEEP + VARIED,
  pouring in the Voyage economy's proven, no-op-default `PlayerLoadout` levers so every slot is a real CHOICE
  of BUILD, not a ladder. Two new build slots: **`shaft`** (the whole distance/power axis — a green min-carry,
  a blue Graphite Power Shaft / Matched Woods, a purple Blueprint Irons / Speed-Whip overdrive, the legendary
  Nova bomb) and the long-empty **`bag`** slot repurposed as the **economy** slot (a credit-earning ENGINE:
  Sponsor's Satchel ×1.15 → Cosmic Sponsor's Bag ×1.6, wired into the world-clear + tournament pay via
  `storyGearCreditMult`, default 1 → byte-for-byte the old pay). The existing four slots gained VARIETY within
  the slot: the GLOVE adds a green slice-fixer, a blue sweet-spot, and the legendary POWER GLOVE (pure
  `overpower` — a different axis from the accuracy ladder); the HAT adds green reading aids, a rangefinder
  (`clubSuggest`), a spin-line read, and a legendary Seer's Circlet that reads the BREAK for you (`greenRead`);
  the BALL adds a green DISTANCE ball, a blue wind-cheater (`windResist`), and the HAZARD-SKIP balls
  (`hazardImmune` — a Floater at the ocean, a Magma-Skimmer at the fire-worlds, a Void-Walker at the abyss).
  `STORY_GEAR_STOCK` re-themed world-by-world: green/blue staples from stop one, purple upgrades mid-campaign,
  fun legendaries deep in, each rack leaning into its world's identity (the hazard balls at their own hazard,
  the wind balls on the gale-worlds) so travel is collection. Every item obeys the item-authoring rule (art via
  the slot+rarity — the Power Glove draws the NES glove, the rangefinder its scope, hazard balls their water/
  lava/void tint; a mechanical detail; bespoke lore). Save shape unchanged (new slots are additive to
  `equippedGear`'s partial record; no `STORY_VERSION` bump). Guarded by the deep-catalogue coverage in
  `tests/story-shop.test.ts` (every purchasable item is stocked; six slots + a green→legendary ladder; the
  distance/power/hazard levers fold; the economy multiplier). Voyage/Unending untouched (Story-only fold).

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

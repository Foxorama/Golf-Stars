# Story Mode — design & build roadmap (GS-story)

> **Status: in progress.** This is the living design doc for turning **Star Tour** into a full,
> standalone **Story Mode** campaign. It starts as a fleshed-out design + chunk roadmap and accretes
> per-chunk rationale as PRs ship (the `docs/decisions/*` pattern: the *rule* lands in `CLAUDE.md`,
> the *story* here). Every chunk below carries a stable `GS-story-*` id tracked in `IDEAS.md`.

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
    trophyIds: string[],           // 5 → forge the key to the other realm
    seenStoryBeats,                // one-off story-beat tracking (SeenLore twin)
    activeRound?,                  // resume a mid-round world
  }
  ```

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
- **GS-story-econ** — persistent story credits, per-world Pro Shop, credits on world clear, revisit
  flow (play again keeps `worldBest` / straight to pro shop).
- **GS-story-clubs** — individually owned & equippable clubs; start green bag; buy clubs; equip the bag.
- **GS-story-gear** — equippable gear **with effects** (gloves/hat/shoes/bag/glove): extend
  `PlayerLoadout`, fold equipped gear at round start; the **Inventory** screen.
- **GS-story-ships** — start wagon; buy ships; ship **weapons / engines / upgrades** as owned upgrades
  with real effects (feeds the finale + travel flavour).
- **GS-story-locker** — the Story **locker room / wardrobe** variant + per-character equipment screen +
  the **caddy roster** (hire → keep → choose active, no fire).

**Phase D — Star map story path**
- **GS-story-map** — worlds gain locked/unlocked/cleared states; chapter gates unlock a few worlds each;
  world choice scaled by difficulty; the star map becomes the story navigator.

**Phase E — Tournaments (the five chapters)**
- **GS-story-tournament** — the Galaxy Tournament **framework**: qualifying round → tournament → trophy
  + signature reward. Row-driven, reusing Asgard-style ghost stroke-play. Difficulty ramps per chapter.
- **GS-story-chapters** — the **5 tournaments** as data (worlds, fields, beats, rewards); collecting all
  5 trophies forges the **key to the other realm**. May batch as framework + data rows.

**Phase F — Finale**
- **GS-story-yggdrasil** — the dark **root realm** unlock (Yggdrasil socket) + the **Jörmungandr
  space-battle** boss: a real health/collision/outcome mini-game on the star-map + ship-weapons layer,
  Cthulhu-corrupted serpent art, win/lose scenes (universe saved / planets devoured).

**Phase G — Polish**
- **GS-story-beats** — the Parrot bar interaction (tap → story/direction), inter-chapter beats, and a
  cross-chapter difficulty/economy balance pass.

## Open questions / deferred (revisit as chunks land)
- **Round length** per world / qualifying (9?) vs tournament final (18?) — tune in GS-story-tournament.
- **"Gather your friends"** is flavour for now (single protagonist, per the design call). Party
  recruitment stays a possible later beat, not a Phase A–F dependency.
- **Ship weapon/engine effects** on the *golf* side vs *space-battle* side — decide the split in
  GS-story-ships (likely: engines/upgrades = travel/fuel + battle stats; weapons = battle only).
- **Balance** of a single persistent purse across a 5-chapter campaign — its own pass in Phase G.

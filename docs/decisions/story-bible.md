# Story Mode — the Story Bible (GS-story lore)

> The narrative source of truth for Story Mode. `story-mode.md` is the *systems/roadmap* doc; **this** is
> the *world*: the mythos, the factions, the NPC roster, the five tournaments, the branching alignment,
> the cursed relics, and the endings. Every story-beat chunk (`LORE_EVENTS`-style rows, tournament data,
> finale scenes) is written against this file. Keep it the canon; when a beat ships, the *rule* it needs
> lands in code, the *story* stays here. Tone target: **playful cosmic horror** — eerie, macabre, a little
> Lovecraft — but it never stops being a bright arcade space-golf game. Saturday-morning eldritch.

The player's brief set the spine: the Earth opening + Parrot recruitment, five Galaxy Tournaments with
qualifiers, a key to Yggdrasil's dark root, and a Cthulhu-corrupted Jörmungandr space-battle finale. This
bible fleshes out everything between: **the Sinister Snake Cult, the NPCs, the world-by-world beats, and a
good/evil BRANCH** (stay the Chosen One, or join the doomsday cult) that forks the back half — different
allies, relics, ships, and ending, for real replay value.

---

## 1. The Mythos — the Great Game

The cosmos is not held together by physics. It is held together by **the Great Game.**

Long before stars, there was the **First Tee** and the **First Hole** — the still point all things fall
toward. Between them runs the **Fairway of Being**, the narrow line of order; beyond it, the **Rough**,
where things unravel. To *play a world true* — to walk its fairway, to strike clean, to hole out — is to
re-trace the act of creation and renew that world's order. Golf is the ritual geometry that keeps the
lights on. Most beings never know it. A rare few — champions who play a course **perfectly true** — feel
it: the click of a struck ball as the universe agreeing to keep existing for one more day.

Coiled at the **root of Yggdrasil**, the World-Tree whose branches are the constellations, sleeps the
**World-Eater — Jörmungandr.** It is the **Un-Game:** the Rough that has no fairway, the putt that never
stops rolling, the hunger for one final, total, permanent **rest.** It has slept since the first tee-off,
but it *dreams*, and its dream leaks into the cruel worlds — the abyssal void, the acid mire, the dead
ships adrift — wherever golf turns hungry and unfair. Its true shape is not a snake but an **eldritch
enormity** wearing a serpent's coils the way a hand wears a glove: too many eyes, a maw that is also a
hole, geometry that hurts to read. The serpent is the part of it small enough to look at.

Should Jörmungandr wake, it will do to everything what the void does to a sliced drive: swallow it, and
be still. That stillness is called, by those who long for it, **the Long Rest.**

---

## 2. The two Orders

### The Fairway Wardens (the light path)
An ancient, dwindling order that keeps the Great Game and holds the World-Eater in its cage of *play.*
They travel the **Ark** — the great green **Mothership** — re-consecrating worlds by finding champions to
play them true. They are gentle, patient, a little sad; they have been losing for a long time. Their creed:
*"Keep the ball moving. While a fairway is walked, the universe endures."*

- **The Prognostic Parrot** — *Prophet of the Wardens* (already in-game as a caddy, faction Space Bandits).
  A reformed sky-pirate who took a ball to the eye on a cursed course and woke able to **foresee shots** —
  and, once, the future itself. He is the last true prophet. He recruits the player, lives in the Clubhouse
  bar, and is your mentor: tap him for direction, lore, and the next thread. His dead spirit-brother (the
  Firebird — existing lore) was lost to the serpent's whisper long ago; that grief is his stake.
- **Custodian Pim & the Little Green Caddies** — the Mothership's tiny green alien crew (tie-in to the
  Little Green Caddie saucer ship). Pim is small, ancient, unbothered, and drops the driest one-liners in
  the galaxy. She flies the Ark, runs the between-worlds briefings, and quietly runs the Wardens now that
  the elders are gone.
- **Driver Dan** — a gruff veteran Warden caddy (existing). Believes the answer to everything is *more
  club.* Loyal to a fault; your first friend on the road.
- **Penelope Putter** — the Wardens' serene short-game sage (existing auto-putt caddy). Speaks in koans
  about pace and surrender. Secretly the strongest of them.
- **Your three friends** — the other playable golfers you *didn't* pick are your Earth tour-mates who
  answered the Parrot's call ("gather your friends"). They recur across the majors as fellow competitors
  and allies — a friendly-rival board you climb alongside, a face in the gallery when you're in trouble,
  a hand on the shoulder at the low point.

### The Coil — the Sinister Snake Cult (the dark path)
A doomsday cult that worships the World-Eater and works to **wake it.** Their heresy is a mercy argument:
striving is suffering; the Game is a cage; the kindest act is to let every ball come to rest **forever.**
Their symbol is the **Ouroboros around a dimpled world** — a serpent swallowing a golf ball. They infiltrate
tournaments to deny the Wardens' champion the Sigils, and to gather what they need to unseal the root. Their
creed: *"All fairways end. We only hasten the green."* They are not cackling villains — they are calm,
courteous, and utterly certain, which is worse.

- **Malachai "Sable" Voss — The Apostate.** The World Tour champion *before* you — the last mortal to play
  a course perfectly true, decades ago. On that perfect round he heard the serpent whisper in the deep
  rough between 17 and 18, and it never left him. He vanished; he returned as the Coil's high priest,
  wearing a coat of shed serpent-scale and swinging a black driver that drips. He is your **dark mirror:**
  everything the Parrot says you *are*, he *was.* He does not want to beat you. He wants you to **understand.**
- **Venoma "the Viper" Krait.** The Coil's prodigy golfer, your **recurring rival** — she enters every major
  to knock you out, and she is *good*, cheating just enough to be maddening (a cursed ball that finds a lie,
  a whisper that rattles your read). She taunts, she escalates, and — depending on your Choice — she becomes
  your final Warden-path obstacle or your Coil-path lieutenant. She has a sliver of doubt the sharp-eyed
  player can widen.
- **Brother Ouros — the Whisperer.** The recruiter. Appears at low moments to make **The Offer** in a kind,
  reasonable voice. He is the mouth of the branch.
- **Sister Ecdysis — the Shedmaker.** The Coil's relic-smith, who forges the **cursed sheddings** (below):
  gear grown from serpent-scale, monstrously powerful and quietly poisonous.
- **The Coilkeepers.** Faceless hooded cultists in every gallery from Chapter 2 on — a creeping "they're
  everywhere now" dread as you climb.

Existing factions (`factions.ts`) slot in: the **Space Bandits** ride with the Parrot; the **Putters'
Guild** are old Wardens; the **Sponsors' Syndicate / Fortune Cartel / Birdie Hunters / Eagle Order** are
neutral tour bodies the Coil bribes or leans on as the stakes rise. **The Coil is a new faction row.**

---

## 3. Campaign spine

```
PROLOGUE  Earth · the World Tour final (St Andrews) → win → victory → the Mothership lands →
          the Parrot's recruitment → story intro cinematic → the Clubhouse (wagon in port, Parrot in bar)

CH.1  The Emerald Invitational   (Lyra Meadows, verdant)   — the rookie major; learn the Game is real
CH.2  The Forge Masters          (Orion Forge, ember)      — the Coil surfaces; Venoma's first denial
CH.3  The Storm Championship     (Draco Gale, tempest)     — open cult sabotage; the Apostate appears
      ── THE CHOICE ── Brother Ouros makes The Offer. Keep faith (WARDEN) or turn (HERALD).
CH.4  diverges by alignment      (Sagittarius Core, void / Eridanus Atolls, ocean)
CH.5  The Serpent's Cup          (Hydra Mire, toxic-mire)  — the Water-Serpent's shrine; the fifth Sigil
      ── all five Sigils forge the GREEN KEY to Yggdrasil's root ──
FINALE  Yggdrasil's Dark Root · the JÖRMUNGANDR SPACE BATTLE → ending (by alignment) or loss
```

Between chapters you **travel the star map**: each cleared chapter unlocks a few new worlds (a qualifier +
side worlds + the next major), always offering a **choice** scaled by difficulty (`chapter` raises each
world's wildness). Clearing any world pays **credits**; each has a **Pro Shop**; a revisit lets you *play
again* (best-score chase) or go *straight to the shop.* A tournament is entered via a **qualifying round**
(a nearby world you must clear under a target) that unlocks its **final** (the major itself).

---

## 4. The five Galaxy Tournaments (world · host · rival · beats · reward)

Each major is anchored to a **real** world (id in parens). Difficulty escalates by chapter, not just world
tier. Each grants a **Sigil of the Game** (the trophy) + a **signature prize** (a special club/ball/gear).

### Chapter 1 — The Emerald Invitational · **Lyra Meadows** (`verdant-18`, verdant, gentle)
- **Qualifier:** *Centaurus Fairways* (`verdant2-18`) — a friendly warm-up under Grandfather Centaur.
- **Host:** **Sir Aldous Greensward**, the genteel old-guard chair of the Galactic Tour — pompous, kind,
  utterly ignorant of the Game beneath his tournament. Comic-relief establishment.
- **Rival:** your own three friends (a friendly leaderboard) — no cult yet. The world feels *safe.*
- **Beats:** the Parrot teaches you to *feel* the true line; on the 18th, holing out, the world visibly
  brightens — your first re-consecration. Pim notes a shadow at the tree line that "shouldn't be there."
- **Sigil: The Emerald Sigil.** **Prize:** the **Verdant Wood** (a reliable fairway wood — your first
  bought-or-won upgrade over the green bag).

### Chapter 2 — The Forge Masters · **Orion Forge** (`inferno-18`, ember, testing)
- **Qualifier:** *Scorpius Sting* (`inferno2-18`) — hooking doglegs; you place while the gallery mutters.
- **Host:** **Magnus Cinder**, a bombastic pyromaniac promoter who'll do anything for spectacle — later
  revealed to have taken Coil money without knowing what he sold.
- **Rival:** **Venoma "the Viper"** debuts — enters uninvited, out-drives you with a ball that *hisses*,
  and denies you the outright win (you win on a playoff or a Warden ally's help). First real menace.
- **Beats:** Coilkeepers appear in the gallery; a hole "goes wrong" (the deep rough moves). The Parrot
  names the Coil for the first time and tells you what the serpent is. Dread sets in.
- **Sigil: The Ember Sigil.** **Prize:** the **Forgefire Driver** (distance) — *or*, if you beat Venoma
  outright, her dropped **cracked cult ball** (your first taste of cursed power, foreshadowing relics).

### Chapter 3 — The Storm Championship · **Draco Gale** (`tempest-18`, tempest, **brutal**)
- **Qualifier:** *Cygnus Links* (`frost-18`) — exposed crosswind, the storm's edge.
- **Host:** none — the tour has "postponed" it; the Coil runs a **shadow tournament** in the eye of the
  Dragon's storm, and you crash it to earn the Sigil before they can corrupt it.
- **Rival:** **The Apostate, Malachai Voss**, plays himself — not to beat you, but to *show* you: he holes
  a shot no mortal should, then tells you the Wardens' secret (re-consecration also **binds** worlds; order
  is a cage; the Long Rest is mercy). It lands because it's half true.
- **Beats:** open sabotage (moved pins, a whispered read, a cursed lie). The lowest point — a friend is
  hurt / a world nearly lost. On the walk off 18, **Brother Ouros** steps from the gallery.
- **── THE CHOICE ──** *"You've felt it too. The whisper. You know the Game is a cage. Lay down your clubs
  with us — or pick them up for a world that will never thank you."* **Keep faith → WARDEN. Turn → HERALD.**
- **Sigil: The Storm Sigil.** **Prize:** branches (Warden **Galewarden Irons**, control; Herald **first
  true shedding** from Sister Ecdysis).

### Chapter 4 — diverges by alignment
- **WARDEN → The Abyssal Vigil · Sagittarius Core** (`void2-18`, void, brutal). The Coil tries to wake a
  *lesser* dreaming thing at the galaxy's black-heart; you re-seal it by playing the abyss true (island-hop
  carries over the void). Host: the Wardens themselves. Rival: **Venoma**, now openly hunting you — but her
  doubt shows. **Sigil: The Abyssal Sigil.** Prize: **Warden ship** (a radiant cruiser) + celestial gear.
- **HERALD → The Drowning Rite · Eridanus Atolls** (`ocean-18`, ocean, testing→scaled). You help the Coil
  *desecrate* a world — win its tournament to claim its order for the serpent instead of renewing it (the
  sea rises, beautiful and wrong). Host: **Sister Ecdysis.** Rival: a **Warden champion** (one of your
  former friends, heartbroken) tries to stop you. **Sigil: The Drowned Sigil.** Prize: **Coil ship** (a
  scaled black wyrm-cruiser) + a potent shedding.

### Chapter 5 — The Serpent's Cup · **Hydra Mire** (`swamp-18`, toxic-mire, the Water-Serpent's home)
The acid mire where the serpent's dream is thickest and the ball flies short in the heavy, hissing air.
The Coil's holy ground; the fifth Sigil sits on the serpent's very shrine.
- **Qualifier:** *The Ghost Wreck* (`derelict-18`, derelict) — a Coil-raided dead starship; you shoot its
  metal corridors to reach the mire (ties the existing derelict lore + Firebird beat in).
- **WARDEN:** storm the Coil's rite and play the shrine true to **lock the last seal.** Final rival:
  **Venoma** — beat her and she can be *turned* (a redeemed lieutenant for the finale), or broken.
- **HERALD:** complete the rite yourself; **Sable Voss** anoints you the serpent's chosen Herald.
- **Sigil: The Serpent's Sigil** (Warden: a seal; Herald: a key-fang). **Prize:** the path-defining relic:
  Warden **Star-Blessed Ball** (clean, true) / Herald **Ouroboros Ball** (monstrous, cursed). With five
  Sigils, the **Green Key** forms — and the way to Yggdrasil's dark root opens on the star map.

---

## 5. The Choice & the alignment branch

**Alignment** is a `StoryState` field — `'undecided'` until the end of Chapter 3, then `'warden'` or
`'herald'`. It re-colours the back half without doubling the *engine* (same worlds, tournament framework,
star map, finale battle) — the divergence is **data**: which NPCs host/oppose you, which beats fire, which
gear/ship pools the Pro Shops offer, and which finale scene plays. That's the replay engine: a second run
down the other alignment is a genuinely different story with different loot and a different ending.

- **Warden (Redeemer):** you're the feared-but-respected champion re-consecrating worlds; allies are the
  Parrot/Pim/friends; loot is **clean and radiant** (fair bonuses, higher cost/rarity); finale = **reseal.**
- **Herald (Betrayer):** you're the heretic the tour whispers about; allies are Ouros/Ecdysis/Voss; loot is
  **cursed sheddings** (huge power, real drawbacks); finale = **the Long Rest.**

Neutral-until-Choice keeps Chapters 1–3 shared (one build), so the branch is a *back-half data fork*, not a
second campaign to author from scratch. New Game+ carries cosmetics/records and offers the opposite path.

---

## 6. Cursed relics — the sheddings (powerful, with a bite)

The Coil's signature loot: gear grown from shed World-Eater scale, forged by Sister Ecdysis. **Strong, with
a balancing curse** — the fun of a devil's bargain, and the mechanical home for the negative-effect gear the
`PlayerLoadout` extension enables (GS-story-gear). Won by beating cult champions (either path) or bought in
Coil-path Pro Shops. Each is a `PlayerLoadout` fold: a big positive field + a new *negative* field.

- **Venomfang Driver** — +45 yd carry; but each drive has a chance to *bite* (a poison lie / +1 risk).
- **Ouroboros Ball** — enormous carry and it ignores wind; but a bad miss "returns to the tail" (replays
  from the tee, the lost-ball mechanic reused).
- **Scale Gauntlet** (glove) — plays clean from *any* rough lie; but corrupts your green read (worse putts).
- **Coil Shroud** (apparel) — big dispersion cut; but a per-hole *faith drain* (creeping handicap).
- **The Long-Rest Putter** — auto-holes inside range; but any miss becomes a guaranteed 3-putt.

**Warden relics** are the mirror — clean, honest bonuses (the *Star-Blessed Ball*, *Warden's Grace* glove),
rarer and dearer, no curse. Balance pass in Phase G: a shedding must be a *choice*, never a strict upgrade.

## 7. Ships, weapons & liveries by path
Ships start at the **station wagon**; both paths buy up. Weapons/engines/upgrades are owned effect-bearing
items (GS-story-ships) that feed travel *and* the finale battle. **Warden** unlocks radiant/celestial hulls
(the Valkyrie Pegasus, an Ark shuttle, aurora liveries) with the Bifröst-style lightning cannon. **Herald**
unlocks corrupted **wyrm-ships** (a scaled black cruiser, a tentacled hull, venom-green plasma) that hit
harder in the battle but take more damage — the risk/reward of the dark path made mechanical.

---

## 8. The finale — Yggdrasil's Dark Root (the space battle)

The **Green Key** opens a new socket on the Yggdrasil tree: not a branch-realm but the **Root** — a dark
under-realm where the World-Eater coils. This is the net-new set-piece: a **real space battle** (health /
collision / outcome) built on the star-map + ship-weapons feel layer — the one place golf becomes a shooter.
Jörmungandr is drawn Cthulhu-corrupted: vast serpent coils studded with wrong eyes, **maw-holes** (golf-hole
mouths) that swallow, geometry that bends the star-field.

**The fight:** fly your ship, dodge coil-sweeps and eye-beams, blast the **eyes** and close the **maw-holes**;
between phases, a **golf finisher** — line up and strike the ball down the serpent's throat / into its eye
(the Game's weapon against the Un-Game). Your bought ship, weapons, engine and relics are your loadout; cursed
gear hits harder but you're frailer.

- **WARDEN ending — "The Reseal."** Whittle its coils, land the final true shot into its central eye; it
  shudders and sinks back down the root. Dawn breaks across all the re-consecrated worlds at once; the Parrot
  weeps; Pim salutes; you are crowned **Champion of the Great Game**, and the fairway endures another age.
- **HERALD ending — "The Long Rest."** You bring the Key to *unseal* it — but the Ark and your former friends
  arrive to stop you. Defeat the Warden fleet, then present yourself. The serpent accepts you as its **Herald**,
  and the universe comes, gently and horribly, to **rest** — every ball, everywhere, still at last; a serene,
  final, green silence. A *victory* that is a grief. (Hidden falter-state: if you fail the last phase, it
  devours you first — the cult's reward for the unworthy.)
- **LOSS (either path).** Fail the battle and the serpent **wakes hungry** — a grim montage of worlds
  swallowed one by one. A retry scene, not a game-over wall (you keep progression, re-arm, try again).

---

## 9. Replayability

- **The Choice → two campaigns from one build:** different allies, hosts, rivals, gear pools, ships, ending.
- **New Game+:** carry cosmetics + records; the opposite alignment is offered; the Parrot remembers.
- **World revisits:** the *true-line* best-score chase per world (records folded into revisit).
- **Relic hunting:** cursed sheddings vs Warden grace — a build-crafting axis with real trade-offs.
- **Secret content:** the Firebird/derelict beats, a redeemable Venoma, the Warriors' Tee (Asgard) tie-in
  as an optional Yggdrasil branch once Thor's Hammer is owned.

---

## 10. How the story maps to the build chunks

The narrative rides the systems roadmap in `story-mode.md`. Beats are `LORE_EVENTS`-style rows; tournaments
are data over the GS-story-tournament framework; the branch is `StoryState.alignment` + gated content.

| Chunk | Story content it lands |
|---|---|
| GS-story-prologue | Earth final, victory, Mothership, Parrot recruitment, story intro, Clubhouse arrival |
| GS-story-econ/clubs/gear/ships/locker | the green-bag start, Pro Shops, **cursed sheddings** + Warden gear, path ships, caddy roster (Warden allies) |
| GS-story-map | chapter-gated world unlocks, difficulty-scaled choice, qualifier→final gating |
| GS-story-tournament | the major framework (host/rival/Sigil/prize), Venoma the recurring rival |
| GS-story-chapters | Ch.1–5 data + beats; the Coil's escalation; **The Choice** at end of Ch.3 + the alignment fork |
| GS-story-yggdrasil | the Dark Root socket + the Jörmungandr space battle + the two endings + the loss scene |
| GS-story-beats | the Parrot bar interactions, inter-chapter NPC scenes, the cross-chapter balance pass |

**`StoryState` fields the story adds** (each a versioned migration when its chunk lands): `alignment`,
`relicIds` (cursed/Warden sheddings owned), `defeatedRivalIds` (Venoma etc.), `tournamentStage` (qualifier
vs final progress), `metNpcs`/beat tracking (via the existing `seenStoryBeats`). All default to no-ops.

**New content rows (never engine edits):** the Coil faction (`factions.ts`); NPC lore-portrait cases +
`LORE_EVENTS` rows; tournament rows; shedding/Warden gear rows; path ship rows; the Dark-Root Yggdrasil
socket + its launcher. Jörmungandr's eldritch art + the battle are the genuine net-new build.

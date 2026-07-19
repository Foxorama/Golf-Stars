# Story Tour — deep-dive quality pass (2026-07-19)

**Scope:** the whole Story Tour campaign (`GS-story*`), read through the game-feel / QA / golf-soul lenses
with a special focus the brief called out: **does the player's Choice actually matter — do the settings,
NPCs and allies change appropriately — and is the final boss battle fun and exciting?** Measured against
`docs/decisions/story-mode.md` (systems) and `docs/decisions/story-bible.md` (canon). Builds on the prior
`reports/story-mode-review-2026-07-18.md` (whose top items — interactive finisher, world-difficulty scaling,
named hosts, the Apostate, caddy roster — have since shipped).

> **Bottom line.** Story Tour is a large, genuinely polished campaign. The alignment fork is *well* realised
> in the NPC / scene / bar / crew / relic / ship / tournament / ending layers. But three load-bearing systems
> were built **alignment-blind** and now contradict the Herald route's own premise: **world routing**, the
> **caddy/quest roster**, and the **finale battle + briefing**. On top of that the finale briefing carried a
> cluster of writing bugs (the serpent misgendered as "she", "ship to ship"), and a real **resume soft-skip
> of The Choice** could silently railroad a player onto the Warden path. This pass **fixes the finale
> writing, re-themes the finale for the Herald path, closes the Choice-resume skip, stops the Herald from
> befriending the friends they must crush, and fixes a `worldBest` corruption bug** — all Story-only, all
> `npm run check`-green, no Voyage/Unending determinism risk. The bigger structural items (per-alignment
> world routing; a Warden-fleet space-battle for the Herald; Penelope's placement) are scoped below as
> follow-ups because they are content/design decisions, not one-line fixes.

---

## 1. What I actioned this session (shipped in this PR)

All Story-only (separate `gs_story` save + gated rows), so none touch Voyage/Unending or the seeded suite.

### Finale — "make the final boss fun and consistent, and make the Choice matter at the climax"
1. **Fixed the serpent's writing bugs (highest visibility).** The finale briefing was the one place in the
   whole game that misgendered Jörmungandr — canon is a genderless eldritch "**it**" — calling it "**her/she**"
   five times and, worse, framing the fight as "**ship to ship**" (the serpent is not a vessel). All corrected
   to "it / the serpent." *(`storyFinaleScreens.ts`)*
2. **Re-themed the finale briefing per alignment.** It was Warden-framed for everyone — the **Parrot** (who
   has *left* you on the Herald path, replaced by the Crow) coaching you to "save every world." Now the
   Herald briefing is voiced by the **Crow**, and the framing inverts: you come to **unseal** the cage, not
   defend the worlds — Stage 1 shatters the **wards** binding the serpent (it thrashes awake), Stage 2 strikes
   the **final seal** to release it. *(`storyFinaleScreens.ts`)*
3. **Re-themed the battle cinematic per alignment** (`mountStoryBattle({herald})`): the health bar reads
   **"THE WARDS"** (Herald) vs **"JÖRMUNGANDR"** (Warden); the finisher prompt reads **"STRIKE THE SEAL"** vs
   **"STRIKE THE EYE"**; the victory caption reflects release ("the serpent uncoils, and the galaxy goes
   still") vs destruction. Mechanics are **byte-identical** — only the framing inverts. *(`storyBattle.ts`,
   `app.ts`)*
4. **Paid off the "The Reseal" promise.** The Choice screen sells the Warden ending as *"The Reseal"* but the
   win screen was titled only "The Universe is Saved." Now: **"🌌 The Reseal — The Universe is Saved."** The
   Herald win strike-copy no longer says "a perfect **kill**" (it *releases*, not kills). *(`storyFinaleScreens.ts`)*
5. **Fixed the misleading finale guidance.** The briefing said to buy shields "at the shipyard," but the
   clubhouse Hangar sells nothing and the defeat screen's "Back to the shipyard ›" actually returns to the
   clubhouse. The hints now say weapons/engines outfit **aboard your ship** and **shields at a ship-vendor
   world** — where the gap is really filled. *(`storyFinaleScreens.ts`)*

### NPC voice consistency on the Herald path
6. The **Parrot** still spoke to Herald players in three high-visibility spots (the fifth-Sigil win, the
   shipyard "Arm up" nag, the Herald-loss recap). All now switch to the **Crow** (🐦‍⬛) on the dark path,
   matching the established `herald ? 🐦‍⬛ : 🦜` pattern. The Herald-loss line also stopped contradicting the
   ending cinematic (one screen had the Parrot warmly inviting your return; the cinematic had him writing you
   off). *(`storyTournamentScreens.ts`, `storyShipyardScreens.ts`, `storyFinaleScreens.ts`)*
7. **Renamed the Herald's fifth Sigil to "The Serpent's Fang"** (the bible name) — it was the off-canon "The
   Herald's Seal." *(`storyTournaments.ts`)*
8. **Mission log reads path-correct.** The overarching goal is now path-neutral ("**reach** Jörmungandr", not
   "slay" — a Herald frees it), and the completion line branches: a Herald sees **"The Long Rest has fallen"**,
   not "The Universe is saved." *(`storyGuide.ts`)*

### Bugs / soft-skips
9. **The Choice can no longer be silently skipped on resume (finding A, HIGH).** The Choice is reached only via
   the *transient* tournament-result screen; quitting mid-dismiss after the Ch.3 win left `chapter = 4` (saved)
   with `alignment` unset — which `tournamentForChapter` silently defaults to **Warden**, railroading the
   player and skipping the Ch.4 interlude. Now `openStory` **re-presents The Choice** when a loaded campaign is
   past the trunk with no path chosen. *(`game.ts`)*
10. **The Herald can no longer recruit/quest the friends they must crush (GAP1/GAP2).** Dan & Penelope are
    Ch.5H/Ch.4H rivals *"to crush"* on the dark path, yet the caddy system let a Herald **recruit Dan for 350cr
    as a bag caddy** and accept his loyal personal quest. Recruiting and ally quests are now gated off on the
    Herald path (their Coil inner circle stands in the clubhouse instead). Pre-Choice hires are untouched.
    *(`storyCaddies.ts`, `storyQuests.ts`, `game.ts`, `starTourScreens.ts`, `storyScreens.ts`)*
11. **Quest rounds no longer corrupt `worldBest` (finding D).** An ally quest replays their home world at **9
    holes (par ~36)**; that result was overwriting the world's **18-hole (par 72)** record, so the dossier
    showed nonsense like "−6 (par 36)" for an 18-hole world. Quest rounds now bank credits + mark cleared but
    leave the 18-hole best untouched. *(`story.ts`, `gameUpdates.ts`)*

New regression tests cover: the Choice-resume, the Herald recruit/quest gate, and the quest `worldBest` skip
(`story-flow`, `story-caddies`, `story-quests`, `story-state`).

---

## 2. Recommended follow-ups (scoped, not actioned — content/design decisions)

Ranked by (player value × the Choice-matters brief). Each is bigger than a copy tweak — a data-model or
art change, or a genuine design call — so they belong in their own focused PR(s).

**R1 — Per-alignment world routing (SEVERE for "the choice matters"; the bible's core replay engine).**
`STORY_WORLDS` is a single flat list keyed only by `unlockChapter`; `storyWorldUnlocked` has **no alignment
parameter**, and `starTourScreens.ts` has zero alignment branching. So both paths chart the *identical*
galaxy — a Warden still flies to the Herald biomes (ocean/derelict/cetus) and a Herald to the Warden ones
(void/crystal/frost). The bible repeatedly sells "the back half *looks and feels* different." **Fix:** add an
optional `alignment?` to the Ch.4–5 world rows (and thread it through `storyWorldUnlocked`), so each route
unlocks its own worlds; only the shared shrine `swamp-18` appears on both. *(≈ `story.ts` + `starTourScreens.ts`,
+ a test that each route's worlds gate correctly.)*

**R2 — A real Herald finale (the bible's "defeat the Warden fleet, then present yourself").** This pass
re-themed the *copy* so the serpent-battle reads coherently on both paths (Herald = shatter the wards → release),
but the bible's Herald finale is mechanically distinct: **fight the Ark and your former friends**, then present
yourself to the serpent. Realising that needs new battle art (Warden ships, the wyrm-ship you earned as the
player craft) — a genuine set-piece, not a copy branch. The re-theme shipped here is the low-risk bridge; this
is the full vision. *(`storyBattle.ts` art + `mountStoryBattle` phases.)*

**R3 — Penelope's placement contradicts the bible (writing, medium).** Canon: Ch.4H drowns **one of your three
friends** (a playable tour-mate); Ch.5H is where **Dan *and* Penelope** make their last stand *together*. The
build makes **Penelope** the Ch.4H rival (she's a caddy/sage, not one of the three friends) and **Dan alone**
the Ch.5H rival — so the choice-screen promise "crush Driver Dan **& Penelope**" is never delivered (they never
appear together), and it doubles up with the interlude "Severing" beat one screen later. **Fix:** make Ch.4H's
rival a real roster friend and stand Dan **+** Penelope together at the Ghost Harvest. *(`storyTournaments.ts`,
`storyInterlude.ts`.)*

**R4 — Herald keeps a Warden caddy's on-course buff (GAP1 residual; balance decision).** A caddy hired *before*
The Choice still folds its effect + draws on-course for a Herald, even though the clubhouse hides them and you
may fight them at the Ghost Harvest. Fully resolving it (the Warden caddies desert a Herald; or Venoma/the Coil
circle become the Herald's bag caddy — "on this bag I don't miss") is a **balance** call, since caddy buffs help
win the ghost-vs-gross majors. Flagged, not silently changed.

**R5 — Shield bay in the ship interior (finding C; small feature).** Weapons + engines are buyable aboard the
ship anywhere, but **shields** only at ship-vendor worlds — and engines cap one point short of the survive gate,
so at least one shield (hence a vendor-world trip) is *mandatory*. The guidance copy is fixed (R above), but a
`'shield'` room in `SHIP_ROOMS` would remove the forced detour entirely. *(`gameState.ts`, `shipInteriorScreens.ts`.)*

**R6 — Stage-1 of the boss is shallow (fun factor).** The "hold your shields" framing implies defensive play,
but shields just drain on a timer with no player input; Stage 1 is "tap to fire 8×, wait for recharge." Cheap
juice that would raise excitement without changing the fair-by-arming outcome: a **dodgeable telegraph** (tap/
swipe to brace before a lunge to halve its drain), screen-shake + a hit-spark on each bolt landing, and a rising
music/among-the-coils intensity as the serpent's HP drops. *(`storyBattle.ts`, render-only.)*

**R7 — Smaller writing/flavour cleanups.**
- The Ch.1 prize **"Verdant Wood — a reliable fairway wood, your first real reward"** is mechanically the
  `club:solar:5W` **legendary apex** whose own lore says only half-galaxy champions are offered one. Give the
  rookie prize a rookie-tier base, or soften the "reliable first reward" copy. *(`storyTournaments.ts`/`story.ts`.)*
- Two path-agnostic strings assume you're a Warden even on the Herald path: the swamp shop intro *"The Coil
  trades here too — watch your back"* and the Comet Ball's *"The Wardens only sell them…"* Branch or neutralise.
  *(`storyShop.ts`, `storyGear.ts`.)*
- The interlude "friend you sever" is a generic first-roster golfer, never named — the emotional beat lands
  softer than the bible's named Dan/Penelope. *(`storyInterlude.ts`.)*
- The rare interlude-resume skip (quit on the interlude screen ⇒ that one beat + credit gift is lost) is a
  minor residual of finding A; re-presenting it safely is more entangled than the Choice re-present, so it's
  left for a focused follow-up. *(`game.ts`.)*
- Dead field: `unlockedWorldIds`/`worldUnlocked`/`unlockWorlds` are never used in production (the map gates by
  chapter). Wire it into R1 or drop it. *(`story.ts`.)*

---

## 2b. Round 2 — player-reported fixes (also shipped in this pass)

Six issues raised after the first round, all Story-only, all `npm run check`-green:

1. **Locker lore cards for quest/starter clubs.** Tapping a quest/major REWARD club or a plain green STARTER
   club in the locker did nothing — the `storyInspectItem` reducer only accepted `club:`/`gear:` ids. It now
   accepts the `quest:` / `major:` / `plain:` ids the locker builds, so every club raises its card.
   *(`game.ts`)*
2. **Ship rooms equip, don't sell.** The weapons/engine bays aboard your ship let you BUY upgrades; buying is
   now only at a ship-vendor world's shipyard. Aboard, the rooms show what's INSTALLED and point unowned
   parts to a vendor. *(`game.ts` reducer, `shipInteriorScreens.ts`, `storyShipyardScreens.ts` overlay)*
3. **Your ship visibly arms up on the star map.** The map ship now draws mounted gun pods that scale with
   installed WEAPON upgrades (0→3 hardpoints), rotating/flipping with the hull — so buying weapons shows.
   *(`starTourMap.ts` `shipGunPods` + `shipWeaponLevel`, `storyShipUpgrades.ts` `ownedCategoryCount`)*
4. **Herald caddies — the friends leave, the Coil volunteers.** Turning Herald now DESERTS the Warden caddies
   you paid for and the **Coil inner circle volunteers** as your caddies in their place (free, Venoma on the
   bag by default). Each Coil volunteer folds a real round effect, is switchable in the locker, stands marked
   in the clubhouse, and carries the bag on-course. *(`storyHeraldCrew.ts` effects + `applyHeraldCaddies`,
   `storyCaddies.ts`, `game.ts`, `storyLockerScreens.ts`, `storySpaceport.ts`, `helpers.ts`)*
5. **The Galewarden Irons are a real set.** The Storm-major prize read "Irons" but landed as one 5-iron; it's
   now a matched 5·7·9 solar-iron set granted together (the flagship 5 carries the wind-reading effect so it
   never stacks). *(`story.ts` `STORY_REWARD_SETS`/`storyRewardSetIds`, `gameUpdates.ts`, `storyTournaments.ts`)*
6. **Early Pro Shops lean on gear, not a club glut.** Since quests + majors gift a lot of CLUBS, the early
   racks trimmed a club slot each and lean on GEAR instead — the non-redundant early spend. *(`storyShop.ts`,
   `storyGear.ts`)*

Regression tests added for the Herald caddy swap + effect, the Galewarden set, and the ship-interior buy
gate; the locker-inspect and shop-mix changes ride the existing `?screen=` smokes + shop tests.

## 3. What's strong (deprioritise)

The endings cinematic (`storyEnding.ts`) is fully path×outcome branched and on-canon (the Crow's *"did you never
wonder why it was so EASY"* reveal lands). The parrot/Crow bar, the interlude, the Coil crew, the Herald ritual
sanctum, the lore beats (Voss, Venoma, Coilkeepers), and every item's composed flavour + lore card are
well-written and on-register ("Saturday-morning eldritch"). No leftover placeholder host strings, no `TODO`s in
player-facing copy, no bare stat-line items. The economy funds the finale arsenal comfortably with no trivial
grind loop. The critical Warden path from prologue to a won finale is soft-lock-free.
</content>
</invoke>

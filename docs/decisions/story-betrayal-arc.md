# Story Tour — the Deep Betrayal Arc (GS-story-betrayal)

> **This is the design + build spine for the betrayal-arc rework.** The *world* it serves lives in
> `story-bible.md`; the *systems roadmap* is `story-mode.md`. This doc is the CONFIRMED design for one
> large, multi-PR feature: the five Sigil tournaments become distinct FORMATS, the other three playable
> golfers become an aboard-ship CAST you partner and can be betrayed by, and the back-half betrayal is
> DRIVEN by your partner choices. It is written to be resumable — if a session summarises mid-campaign,
> this file (plus `IDEAS.md`) is the source of truth for what's confirmed and what's shipped.
>
> **Guardrails (unchanged):** content-as-data, no engine fork (reuse `match.ts`), determinism +
> auto≡interactive (new levers default to no-ops so Voyage/Unending stay byte-identical), Story persists
> only to `gs_story` (own `STORY_VERSION`). Each bullet ships as ONE focused, tested, auto-merged PR.

## The player brief (confirmed)

Deepen the betrayal arc so a run's back half is almost always DIFFERENT — driven by caddie, quest,
chosen partner characters, alignment, and each character's own dialogue. Specifically:

1. **The other three playable golfers travel aboard the ship + stand in the clubhouse and are
   INTERACTABLE** (like the Parrot) — a real recurring cast, not name-only chips.
2. **Each of the three carries a personal QUEST** that unlocks once you SELECT them as a tournament
   partner.
3. **The five Sigil tournaments become distinct FORMATS** (below), most of them TEAM formats where you
   pick one of the three as a partner.
4. **After Sigil 3 (The Choice) the betrayal branches**, and WHO betrays you is decided by your
   Sigil 1 & 2 partner picks. Costume changes for the defector(s).

## The five Sigils — confirmed formats

| Sigil | Chapter | Format | Partner | Field / opponents |
|---|---|---|---|---|
| 1 | Ch.1 | **Scramble** (2-ball team; share one ball, best of the two shots each stroke) | pick one of the 3 others | rival PAIR (Ch.1 rival + a rando) + two low-tier RANDO pairs + the two NON-chosen golfers as a pair |
| 2 | Ch.2 | **Best-ball** (2-ball team; each plays own ball, team keeps the lower per hole) | pick again (may switch) | same shape; rival pair includes **Venoma** |
| 3 | Ch.3 | **Singles MATCHPLAY** (1v1 vs the rival, hole-by-hole, lower score takes the hole) | — | just you vs the Apostate. **The Choice fires after this win.** |
| 4 | Ch.4 | **Strokeplay** (single person, per path) | — | Warden: **Scorpius, "the Silent Sting"** (GS-story-scorpius — a new Coil assassin; was Venoma a 2nd time). Herald: a former friend. Betrayal beats land here. |
| 5 | Ch.5 | **2v2 SCRAMBLE MATCHPLAY** (both sides share a ball) | your loyal ally / Coil champion | the betrayer + a champion (see below) |

> **GS-story-sigil-formats (2026-07-20)** — the Sigil formats were corrected to the intended spine:
> Sigil 3 was a single-person *Stableford*, now **singles matchplay** (`format:'matchplay'`,
> `resolveStorySinglesMatch`); Sigil 5 was *2v2 best-ball matchplay*, now **2v2 scramble matchplay**
> (`format:'scramble-match'`, `resolveStory2v2Match(..., 'scramble')` — both teams take a best-of-3 bite).
> Best-ball stays the resolver's back-compat default. The Stableford scoring path (`rivalStableford*`,
> `stablefordLeaderboard`, the `stableford` recap flag) was retired. The lobby/recap read matchplay
> scorelines; the leaderboard's serpent 🐍 glyph is gated to **Chapter 3+** (early team majors show a
> neutral 🚩 for opposing pairs — the "everyone's a snake in the Emerald leaderboard" fix).

Format is **content-as-data**: a new optional `StoryTournament.format` field (mirrors `BossSpec.mode`/
`team`). Absent ⇒ the classic ghost strokeplay (byte-identical). Team resolution reuses `match.ts`
(`bestBallHole` / `playSideHole` / `playTeamMatchStop`); opposing PAIRS are a new cheap ghost-field
builder (the Asgard `warriorsThreeTotals` pattern + best-ball pairing over `ghostHoleStrokes`) — no real
ball per AI golfer, deterministic, tunable.

## Who betrays you — the odd-one-out rule (confirmed)

Let the three non-protagonist golfers be the *others*. `p1` = Sigil-1 partner, `p2` = Sigil-2 partner
(each an *others* id, chosen before The Choice, so both are locked by Ch.4).

- **Two DIFFERENT partners** (`p1 ≠ p2`): the ONE character you never picked is the **odd one out**.
- **SAME partner twice** (`p1 = p2`): the character you TRUSTED most is the **odd one out** (the twist).

So the betrayer is always the odd one out: the lone unpicked, or — if you were loyal to one — that one.
`betrayerId(story)` is a pure function of `p1`/`p2`; it is the SINGLE seam that replaces today's
positional `interludeFriend` ("first non-protagonist") and the hard-coded Ch.4/5 herald `rivalId`.

### What the betrayer does, per path

- **WARDEN (you stayed loyal):** the odd-one-out **defects to the Coil** (corrupted costume). The Ch.5
  finale is **2v2 scramble matchplay: You + a LOYAL friend YOU CHOOSE vs (the Betrayer + the Coil LEADER
  Malachi/Voss, the Apostate)** (GS-story-sigil5-npc — the Coil rep was Venoma; it is now the leader
  Malachi at the traitor's shoulder, and you PICK which of the two non-betrayer tour-mates shares your
  ball, `wardenAllyOptions`).
  - Default loyal partner (skipped picker) = a non-betrayer *other*: the `p2` partner if two distinct
    picks; if same-partner-twice, a non-betrayer *other* rallies to you (deterministic by roster order).
- **HERALD (you turned):** YOU are the traitor. Your former friends stay Warden and come for you. The
  Ch.5 finale is **2v2 scramble matchplay: You + a Coil champion YOU CHOOSE — Malachi/Voss, Venoma or
  Scorpius (GS-story-sigil5-npc, `coilChampionOptions`), minus whichever is already on your bag as a caddy
  — vs your two former friend-partners**.
  - Opposing pair = the friends who trusted you: `{p1, p2}` if distinct; if same-partner-twice, `{p1}` +
    one *other* who also stayed Warden (deterministic — the friend you always picked AND one you spurned
    both come for you). Ch.4 betrayal beats are keyed to your first COMPLETED caddy quest and whether you
    still wield its reward club (see PR H).

> **GS-story-sigil5-npc (2026-07-24)** — the finale ally is now a player CHOICE, not a fixed slot. The
> lobby shows a partner PICKER under the matchup box (`finalePartnerPickerHTML`): the two loyal tour-mates
> on Warden, the Coil champions on Herald. The pick rides `state.storyFinalePartner` (transient, validated
> on read) → carried onto the run as `storyTournamentPartner` at tee-off → threaded through
> `sigilMatchThrough(…, {chosenAllyId})` so the live HUD, the reveal and the resolution all resolve the
> SAME chosen ally. A skipped picker defaults to the deterministic `loyalAllyId`/`coilChampionExcluding`,
> so every legacy save/caller is byte-identical.

Edge-case defaults (documented, not asked): the "second seat" and same-partner cases resolve
deterministically by roster order, biased toward a completed character/caddy quest so the beat is
personal where possible.

## Costumes

The defector gets a **corrupted Coil look** — `corruptedLookOpts(character)` feeding `golferPreviewSVG`,
shown in the Ch.4/5 betrayal beats, the Ch.5 lobby, and the finale figure. On the Herald path YOU are the
corrupted one; the former friends stay clean Warden.

> **GS-story-sigil5-look (2026-07-24)** — the corruption is now BAKED into the figure: a clear coil-violet
> robe (`COIL_SHIRT` `#4a2775`) + an acid-green serpent accent (`COIL_ACCENT` `#8ef0b0`), over the golfer's
> OWN skin + hair. The old near-black `#2e1840` robe under a `hue-rotate(258deg)` figure filter
> (`COIL_FIGURE_TINT`, now retired) muddied the whole figure into an unreadable silhouette. In the Ch.5
> matchup box the Coil CHAMPIONS are also drawn as full-body golfer figures (`championLookOpts` — Malachi
> pale + violet, Venoma purple, Scorpius shadow), so the 2v2 lineup is four consistent figures instead of
> a small floating portrait bust jammed next to full bodies. The distinctive portrait busts still front the
> hero card + halftime pop, where they stand alone.

> **GS-story-coil-garb (2026-07-25)** — supersedes the ROBE half of the note above, and only that half. The
> defector no longer takes a Coil-violet shirt at all: `corruptedLookOpts` keeps the golfer's own **shirt
> colour**, face and hair, and the Coil is layered OVER the top (`coilGarb`: open serpent robe + cobra hood +
> serpent circlet). Same goal as GS-story-sigil5-look — a defector who reads as *familiar and wrong* rather
> than as a generic Coil silhouette — carried further, since identity now survives below the neck too.
> `COIL_SHIRT` stays exported but is no longer part of the costume. The `championLookOpts` half of
> GS-story-sigil5-look is **unchanged**: the Coil CHAMPIONS are still drawn as full-body figures with their
> own hardcoded palettes, so the Ch.5 matchup box is still four consistent figures.

## Build order — SHIPPED (see `IDEAS.md` for the live one-liners)

- **GS-story-cast** — ✅ (#508) the 3 golfers aboard ship + clubhouse, tappable, per-character talk adapting
  to chapter/alignment. Shared `otherGolfers(story)` seam.
- **GS-story-team-format** — ✅ (#509) pure engine `storyTeams.ts`: scramble/best-ball vs opposing ghost
  pairs + the 2v2 matchplay resolver, reusing `match.ts`.
- **GS-story-partners** — ✅ (#510) `StoryState` v5 `sigil1Partner`/`sigil2Partner` + lobby partner-picker;
  Sigil 1 scramble / Sigil 2 best-ball vs opposing pairs (incl. the two you didn't pick).
- **GS-story-stableford** — ✅ (#510) Sigil 3 single Stableford (points, higher wins). *(Superseded by
  GS-story-sigil-formats: Sigil 3 is now singles MATCHPLAY.)*
- **GS-story-betrayer + finale** — ✅ (#511) `storyBetrayal.ts` (odd-one-out betrayer, finale team comps,
  `corruptedLookOpts`) + the Ch.5 2v2 matchplay finale (both paths), lobby matchup box + recap. *(Format
  corrected to 2v2 SCRAMBLE matchplay by GS-story-sigil-formats.)*
- **GS-story-sigil-formats** — ✅ (2026-07-20) the Sigil-format correctness pass: Sigil 3 Stableford →
  **singles matchplay**, Sigil 5 best-ball → **2v2 scramble matchplay**; matchplay lobby/recap copy; the
  leaderboard serpent glyph gated to Ch.3+ (early majors show 🚩, not 🐍, for opposing pairs).
- **GS-story-sigil-play** — ✅ (2026-07-20) the team Sigils now PLAY interactively as team formats (they used
  to fold the partner as a stat-ghost only at resolution, so a real player never picked a scramble ball or
  saw a best-ball comparison). Reuses the proven team-duel machinery. **Sigil 1 SCRAMBLE:** `run.storyTeamFormat`
  arms `scrambleOptsFor` (so the AUTO path plays best-of-two too — auto ≡ interactive) and the reducer's
  `'shot'` handler raises the pick-your-ball choice card (`resolveScrambleShot` → `scrambleChoice` →
  `chooseScrambleBall`, the same card the parrot/team-duel use, now naming your chosen partner); the played
  round IS the team's scramble gross, so `resolveStoryTournament`'s scramble branch scores that real gross vs
  the opposing pairs (not a re-folded ghost). **Sigil 2 BEST-BALL:** the play-done screen reveals the
  partner's ball each hole (`bestBallRevealHTML` + a `synthGhostHole` from `storyPartnerBestBallScore` — the
  SAME per-hole ghost the resolution folds, so the reveal + running team total match the finished recap to the
  stroke); resolution stays the deterministic ghost fold (the player plays their own ball), so `stopPlayed` is
  untouched and auto ≡ interactive holds. Contracts kept: the scramble partner draw is gated on the armed
  Sigil (contract 1 — other rounds byte-identical), the player draw is first (contract 2). Guarded by
  `tests/story-team-play.test.ts` (opts arming, the pick card, the reveal-vs-resolution consistency) + the
  existing story-flow/partners suites. No save bump.
- **GS-story-betrayal-beats** — ✅ (#512) the mid-chapter interlude reworked into the per-character defection
  (Warden, corrupted portrait) / caddy-quest-keyed severing (Herald); four distinct `BETRAYAL_VOICE`s.
- **GS-story-charquests** — ✅ each friend's signature quest, unlocked by partnering them; `charquest:<id>`
  reward on their talk card (no save bump).
- **GS-story-sigil-rivals** — ✅ (2026-07-21) the back-half Sigil RIVALS are the betrayal-arc people, never a
  mismatched NPC (player report: "in Sigil 4 the Herald rival is Penelope, but the dialogue is about your
  betrayed friend"). `StoryTournament.dynamicRival` (`severed`/`betrayer`/`heraldPair`) + the pure
  `tournamentRival(t, story)` resolve who actually stands across the tee: **Ch.4H** = the SEVERED friend —
  the new `heraldSeveredId` (the one tour-mate NOT in `heraldOpponentIds`), so the rival you crush at the
  Drowning Rite IS the friend the Severing interlude then cuts loose (`interludeFriend`'s Herald branch now
  reads it too — in the same-partner-twice case the trusted friend is preserved for the Ghost Harvest);
  **Ch.5W** = the corrupted BETRAYER (the Coil leader Malachi/Voss at their shoulder — matches the matchup box + `finaleMatchup`);
  **Ch.5H** = the lead former friend-partner. The effective rival feeds the ghost totals
  (`rivalTotal*`/`tournamentField`/`tournamentCompetitors` take an optional `rival`), the singles-match
  resolver, the halftime pop (payload carries `rivalGolferId`/`rivalVoice`/`rivalCorrupted`), the lobby
  (their real golfer figure, Coil-tinted when corrupted; relationship label "Your friend — barring your
  way" / "lost to the Coil"), the clubhouse/star-map banners and the mission log. Dialogue is
  per-character: `BETRAYAL_VOICE` gained `confront` (heartbroken Warden friend) + `corrupt` (Coil-garbed
  defector) triples — [taunt, halftime-brag, halftime-curse] in each golfer's established voice
  (`friendRivalTaunt`/`friendRivalHalftime`, coverage machine-checked). Intros carry `{rival}`/`{opponents}`
  tokens resolved by `tournamentIntroLines(t, story)` (screens must never read `t.intro` raw; a test proves
  no token survives). Trunk + Ch.4W rows have no `dynamicRival` → byte-identical; no save bump.
- **GS-story-sigil-live** — ✅ (2026-07-21) the Sigil competitions play INTERACTIVELY THROUGHOUT (player
  report: "only a 9-hole pop and a closing screen — the duo formats should be interactive throughout").
  ONE pure source, `sigilMatchThrough(t, story, playerStrokes, seed, pars)` (`storyTournaments.ts`, wrapping
  the SAME `resolveStorySinglesMatch`/`resolveStory2v2Match` streams the finish uses, with
  `FINALE_ALLY_EDGE`/`FINALE_OPP_EDGE_SCALE` moved there from the reducer), feeds FIVE surfaces so live ≡
  final to the hole: (1) a live MATCH CHIP on the play HUD (`app/storySigilHud.ts storySigilMatchChip` —
  scoreline/thru + the opponent's known card on the current hole, real-matchplay style, the boss-duel
  `matchHud` idiom); (2) a per-hole MATCH PANEL on the end-of-hole screen (W/L/½ pips, this hole's duel,
  and the close-out call the moment it's decided); (3) running TEAM STANDINGS vs the opposing pairs on the
  scramble/best-ball Sigils (`opposingField`/`opposingPairTotal` gained an `upto` param — default
  byte-identical, prefix-consistent with the finish); (4) a MATCH-AWARE halftime pop (holes won + holes-up
  standing on the payload's `match` field — never a stroke count the format doesn't score by); (5) a
  mid-round CLOSE-OUT: `holeComplete` resolves the tournament the moment the match is decided (up > holes
  remaining), and `resolveStoryTournament` banks ONLY the holes the match ran (truncating the headless
  full-round path to the same `thru`, so auto ≡ interactive holds on the purse too) and SKIPS `worldBest`
  on a partial round (the quest-round rule — a 12-hole close-out can never clobber the 18-hole record).
  Render + reducer only, zero sim rng, no save bump. Guarded by `tests/story-sigil-live.test.ts`
  (prefix-consistency, live≡final duels, close-out banking + worldBest skip, the interactive reducer flow).
- **GS-story-sigil5-play** — ✅ (2026-07-21) the Ch.5 2v2 SCRAMBLE MATCHPLAY finale now PLAYS as a real
  interactive scramble (player report: "the sigil 5 encounter isn't correctly doing an interactive
  scramble" — it used to fold the ally as a resolution-time ghost only, so the round felt solo). Tee-off
  arms `run.storyTeamFormat: 'scramble'` with `run.storyTournamentPartner` = the FINALE ALLY
  (`finaleMatchup(story).allyId` — the loyal friend on Warden, the Coil champion Voss/Venoma on Herald), so
  the per-shot pick-your-ball card raises exactly like Sigil 1 and the AUTO path plays best-of-two via
  `scrambleOptsFor` (auto ≡ interactive). The resolver chain (`resolveStory2v2Match` `playerTeamPlayed` /
  `sigilMatchThrough` `opts.teamPlayed`) then scores the PLAYED strokes as the side's team score — no ally
  ghost re-folded on top (it would double-count) — with the flag passed identically by the live HUD, the
  halftime pop, the mid-round close-out and the final resolution. Default-off ⇒ every legacy caller/save is
  byte-identical; a Coil-champion ally plays a neutral swing (`characterShotMods` misses) and the pick card
  names them properly. Guarded in `tests/story-team-play.test.ts`.
- **GS-story-sigil5-look** — ✅ (2026-07-21) the finale matchup box draws a Coil champion as their real
  PORTRAIT bust (`venomaPortraitSVG`/`vossPortraitSVG`, `.gs-tourn-mport`) — never the "cute little snake"
  🐍 emoji the player reported standing in for Venoma.
- **GS-story-early-beats / GS-story-doubt / GS-story-choice-blind** — ✅ (2026-07-21) the narrative
  correctness pass (player report: "no sense of what is happening till Sigil 3; no lead-up before the
  betrayal; the Choice spoils its consequences"):
  - **Trunk build-up**: new arrival beats through the lore machinery — Ch.1 `story-true-line` (the Parrot's
    first lesson on a qualifying arrival; the Sigil-1 tee-off keeps the omen), Ch.2 `story-venoma-debut`
    (the Viper strides in uninvited at the Forge tee-off — her bible entrance, previously just a lobby
    name) and `story-rough-moved` (the course goes wrong; the first hooded stranger).
  - **The betrayer-doubt thread (Warden Ch.4)**: `story-warden-vow` (the Parrot names who's gone quiet via
    the `{betrayer}` token) → `story-doubt-<golfer>` (the betrayer's strange question, in their own voice)
    → `story-distance-<golfer>` (their eve-of-the-vigil drifting; fires even at the major tee-off so the
    minimum path still gets all three). Per-character rows generated from `BETRAYAL_VOICE.doubt/distance`
    (coverage machine-checked in `everyGolferHasBetrayalVoice`), keyed off the new
    `LoreContext.storyBetrayerId` so the beat is always the RIGHT friend — the betrayer and the tournament
    rival can be different characters. Golfer-spoken beats carry a `golfer:<id>` portrait (their real
    figure); the `{betrayer}` token resolves at render (`resolveLoreTokens` + `betrayerName`).
  - **Sigil 4W is about the betrayal**: the Abyssal Vigil intro + the rewritten `story-venoma-warden` beat
    now carry the doubt thread (the empty seat, the whisper inside your camp) instead of Venoma's own
    redemption crack ("saving Venoma" content moved out of Ch.4 — her turn stays at the Ch.6W shrine).
  - **The Choice is blind**: the alignment cards are two in-fiction voices (the Parrot's creed vs the
    Apostate's kind offer) with NO mechanical spoilers — no world lists, no "win her back", no "crush
    Driver Dan & Penelope", no ending names. What each road costs is for the road to reveal.
- **GS-story-ambiguous-fate** — ✅ (2026-07-21) the shrine's redemption PROMISE is withdrawn (player call:
  "reword the lines so the friend's fate is ambiguous" — the old copy promised winning would "break the
  whisper's hold" on the betrayer, and nothing ever paid it off). The Defection interlude (the Parrot's
  brief + the outcome line) and the Serpent's Vigil intro now promise only the CONFRONTATION — the Parrot's
  foresight "goes dark in the mire", and what winning leaves of the friend is explicitly unknowable. The
  fate resolves in the ENDING instead (below).
- **GS-story-unending-tease** — ✅ (2026-07-21) the Warden ending reworked (player design): the Reseal does
  NOT kill Jörmungandr — the finisher **sings it back to SLEEP** (the ending cinematic settles the serpent:
  sway stills, body sinks, the burning eye slides shut under converging amber seal-rings — no more
  shattering), and the win is left ONE FRIEND SHORT: the betrayer and the Coil's remnant flee in the last
  wyrm-ship past the edge of every chart to **THE DESTINATION** — the NAMED unknown deep (a future game
  mode; the name is deliberate and must be kept verbatim — it was briefly "Universe Unending", renamed to
  The Destination before it collided with the existing Unending Universe endless mode). Redeeming the friend will require flying
  further than any chart — the sequel hook the ending speaks aloud. Touched surfaces: `storyEnding.ts`
  ('good-win' copy + the sleep/seal/`coilShipFlees` cinematic — the wyrm-ship jets off-frame through the
  hold — plus flow-layout captions so long copy never overlaps), `storyFinaleScreens.ts` (the Reseal recap:
  "Not a kill. A lullaby.", the fleeing sail, the Parrot's "when that door opens — you and I go through it
  together"), `storyGuide.ts` (the completed-campaign line). The ending names the actual betrayer:
  `mountStoryEnding` gained `betrayerName` (the `{betrayer}` token), passed from `app.ts` via the shared
  `betrayerName(story)` seam. Render/copy only — no reducer/save/rng impact; Herald surfaces untouched.
- **GS-story-midround-omen** — ✅ the PRE-CHOICE betrayal foreshadow at the nine-hole pause (player ask:
  "mid-round at the nine-hole pause there needs to be a story beat before the Choice; the odd-man-out beat
  needs a piece per character per outcome"). See *"The mid-round omen"* below.
- **GS-story-scorpius** — ✅ a new Coil NPC for the fourth Sigil (player report: the Ch.4 Warden major "The
  Abyssal Vigil" pitted you against **Venoma a SECOND time** — she already plays the Ch.2 Forge — which read
  like a bug/replay). The Coil, twice-failed with the Viper, now sends its silent assassin **Scorpius, "the
  Silent Sting"** (`rivalId: 'scorpius'`, default ghost profile → balance-neutral, `rivalEdge` unchanged at
  0.23). He NEVER speaks — his beat + taunt + halftime lines are stage directions of a still, blade-like hunter
  who names the traitor on a written card. Bespoke Coil-palette bust `scorpiusPortraitSVG` (obsidian carapace +
  a scorpion-tail stinger motif, distinct from the Viper's plum) wired through `lorePortraitSVG` +
  `rivalPortraitSVG`; 🦂 glyph. The Viper now BOOKENDS the Warden path instead of repeating: `story-venoma-warden`
  retargeted from `>=4` to Ch.5 (she RETURNS at the shrine, at the traitor's shoulder), so each Coil champion
  owns a distinct chapter (Ch.2 Venoma → Ch.3 Voss → Ch.4 Scorpius → Ch.5 betrayer+Venoma). New beat
  `story-scorpius-warden` takes the old Ch.4 Warden rival-up-close slot (after the doubt thread, carrying the
  same `{betrayer}` knife wordlessly). Pure content-as-data + render; zero sim rng, no save/STORY_VERSION bump.
  Guarded by `tests/lore.test.ts` + `tests/story-tournament.test.ts`.
- **GS-story-scorpius-fixes** — ✅ the eyes-on-play polish pass (player report: the tail "looks like a stick,
  comes out of his chest", no constellation identity, and the dialogue reads like a SECOND meeting / duplicates
  itself across screens). Four fixes: (1) **portrait** — the tail is redrawn as a Coil-plum SEGMENTED metasoma
  (a chain of chitin bulbs with acid-green rim-light + dark seams, never a smooth stick), rising from BEHIND the
  near shoulder (root segments drawn under the shoulder mantle so it reads as coming from behind, not the chest),
  plus the **Scorpio constellation** hangs behind him — a stylised fishhook of pale stars with red Antares as its
  heart (the starry identity the other Coil champions have); (2) the up-close beat `story-scorpius-warden` is now
  **gated to the vigil tee-off** (`storyTournament === true`) so it's your FIRST sighting on the tee where he
  waits — never a stray practice-world pre-meeting; (3) the **two screens de-duplicated** — the tournament intro
  frames the STAKES (strokeplay, the vigil, the doubt aboard your ship), the beat is the MAN (he reads your
  hands, shows the named card, tips the stinger at your ship), the lobby taunt is his STILLNESS (won't swing till
  you do) — no shared "chitin and shadow / already on the tee / never spoken / two fingers point" prose across
  them; (4) **betrayal payoff** — the Defection interlude now calls back the Sting's card ("he wasn't reading the
  future… he was reading you"), so the wordless naming at the Vigil actually pays off when the friend turns.
  Pure content-as-data + render; zero sim rng, no save/STORY_VERSION bump. Guards updated in `tests/lore.test.ts`.
- **GS-story-aftermath** — ✅ the post-result CONFRONTATION beat for the back-half Sigils (player report: winning
  the Ch.4 Warden major cut STRAIGHT from the scorecard to the betrayer's Defection — Scorpius, who stalks you so
  vividly at the tee, just VANISHED with no win/loss payoff, and a loss gave nothing at all). A new pure module
  `storyAftermath.ts` (`tournamentAftermath(t, story, won)`) builds a `BeatView`-shaped beat rendered through the
  shared `.gs-lore*` card (`storyTournamentAftermathScreen`, no forked CSS); the reducer diverts
  `storyTournamentContinue` on a Ch.4/5 result to the `storyTournamentAftermath` screen (win OR loss), whose
  `storyAftermathContinue` runs the SAME continuation via the extracted `continuePastTournament` helper (→ the
  interlude on a Ch.4 win, else the clubhouse). Per the audit ("make sure all the story beats land well" for Coil
  Sigil 4/5 + Warden): **Ch.4 Warden** (Scorpius, win + loss — wordless stage directions, the black card's
  `{betrayer}` name); **Ch.4 Herald** (LOSS only — the severed friend, still-reaching; a WIN already flows into
  "The Severing", whose rival IS that friend, so a beat there would duplicate); **Ch.5 Warden** (win = the Green
  Key forges + the Parrot's descent, the betrayer's ultimate fate left to the ending per GS-story-ambiguous-fate;
  loss = the Coil leader Malachi/Voss keeps the door); **Ch.5 Herald** (win = the root opens + the Coil's anointing; loss = the two
  friends bar the way). NOT a `seenStoryBeats` one-off — a won Sigil can't be replayed (`currentTournament` gates
  on `tournamentWon`), so a WIN beat fires once naturally, and a LOSS beat re-shows each retry (it IS that round's
  result, like the scorecard). Pure content-as-data + one screen + a reducer divert; zero sim rng, no save/
  STORY_VERSION bump. Guarded by `tests/story-aftermath.test.ts` (which majors get a beat, speaker/portrait per
  case, the reducer flow) + a `?screen=storyaftermath` browser smoke in `tests/build.test.ts`.
- **GS-story-sigil5-npc / GS-story-sigil5-look** — ✅ (2026-07-24) the Ch.5 finale NPC pass (player report: the
  betrayal outfit + the Coil rep "looked terrible", and the rep should be the leader Malachi, not Venoma; the
  player should PICK the finale partner). Three changes, one PR: (1) the WARDEN Coil rep at the traitor's
  shoulder is now the leader **Malachi/Voss** (`WARDEN_COIL_CHAMPION`), not Venoma — box label "The traitor &
  the Apostate", intro/aftermath copy retargeted; (2) a finale **partner PICKER** (`finalePartnerPickerHTML`)
  under the matchup box — the WARDEN chooses their loyal ally from the two non-betrayer tour-mates
  (`wardenAllyOptions`), the HERALD chooses their champion from Malachi/Venoma/**Scorpius** now selectable
  (`coilChampionOptions`), minus whichever Coil champion is on the bag as a caddy (`coilCaddyChampion`, fixing
  the never-fired caddy-id exclusion). The pick rides `state.storyFinalePartner` → `run.storyTournamentPartner`
  → `sigilMatchThrough(…, {chosenAllyId})` (live HUD ≡ resolution); skipped ⇒ deterministic default, so legacy
  saves are byte-identical; (3) the ART — the corrupted robe is a readable coil-violet `#4a2775` + acid accent
  `#8ef0b0` BAKED into the figure (the muddying `COIL_FIGURE_TINT` hue-rotate retired), and the finale box
  draws the Coil champions as full-body Coil figures (`championLookOpts`) so the 2v2 lineup is four consistent
  figures. Guarded by `tests/story-betrayal.test.ts` (options/exclusion/chosen-ally, Malachi-not-Venoma) +
  `tests/story-finale-match.test.ts`. Zero sim rng, no save/STORY_VERSION bump.
- **GS-story-qualifier-formats** — ✅ (2026-07-25) the qualifying road becomes the betrayal's first act. See
  *"The partner tally"* + *"The Chapter 1–3 thread"* below.
- **GS-story-coil-garb / GS-story-defection-clubhouse** — ✅ (2026-07-23) the switched-sides motif is now
  properly SOLD on both surfaces (player ask):
  - **The costume keeps the person.** `corruptedLookOpts` no longer repaints the whole figure Coil-violet
    (the old flat reskin + `COIL_FIGURE_TINT` hue-shift made a defector a generic Coil silhouette). It now
    KEEPS the golfer's own **shirt colour** (their signature identity hue), face and hair, and layers the
    Coil OVER the top via a new `golferPreviewSVG` opt `coilGarb: {robe, hood, accent}`: an OPEN serpent
    robe (two violet panels down the outer sides + a raised shawl-collar mantle with a coil-sigil clasp,
    leaving the shirt visible down the centre — the "robe that doesn't obscure the shirt colour"), a raised
    **cobra hood** flaring behind the head (drawn behind the head so the face + hair still read), and a
    spiky **serpent circlet** on the brow (the "spiffy Coil hat", replacing the signature cap). Palette:
    `COIL_ROBE`/`COIL_HOOD`/`COIL_ACCENT` in `storyBetrayal.ts`; the robe panels draw BEFORE the arms so
    the golfer's arms hang naturally in front of the open robe. Used identically by the Ch.4 Defection
    interlude portrait, the Ch.5 friend-rival card, and the Sigil-5 finale matchup box (the three old
    `COIL_FIGURE_TINT` call sites, now un-tinted so the true shirt colour shows). Re-shoot with
    `node scripts/coil-garb-preview.mjs`.
  - **The defector leaves.** `betrayerHasDefected(story)` (= `seenStoryBeats['interlude-warden']`) gates
    the Warden-path removal: once **The Defection** plays (after the Ch.4 major), the odd-one-out is gone
    from the clubhouse deck (`storySpaceport.ts`, replaced by their `abandonedHatHTML` cap lying on the
    floor at their old spot — non-interactive, wistful title) AND the ship lounge (`shipInteriorScreens.ts`
    filters them from `otherGolfers`). You can no longer talk to them anywhere; the two loyal friends
    remain. Before the interlude, all three still stand (they're drifting, not gone — the doubt thread).
  - Pure render + a persisted-flag predicate; zero sim rng, no `STORY_VERSION`/save bump. Guarded by
    `tests/story-betrayal.test.ts` (`betrayerHasDefected`, the costume keeps the shirt) +
    `tests/story-cast.test.ts` (before/after The Defection: 3 standees → 2 + a left-behind hat).

- **GS-story-betrayal-polish** — balance re-tune (the finale + team-major edges), any dialogue-depth follow-up,
  constitution/roadmap docs.

## The partner tally — who stands apart (GS-story-qualifier-formats)

The odd-one-out rule above is unchanged in spirit and **generalised in mechanism**. It used to read exactly
two data points (the Sigil-1 and Sigil-2 partner picks), which meant the whole betrayal turned on two clicks
made hours apart, and the fifteen qualifying rounds between them said nothing about anybody. Now every tee
you share counts.

**The tally** (`storyBetrayal.partnerTally`): each of the three tour-mates scores `SIGIL_PARTNER_WEIGHT` (2)
per team-Sigil pick — deliberate choices for a major, so they weigh double — plus `QUALIFIER_PARTNER_WEIGHT`
(1) per paired QUALIFYING EVENT actually played beside them (`StoryState.qualifierPartners`, one entry per
event, so replaying a road can never stack it).

**The standing** (`partnerStanding`): rank the three, then compare the daylight at the TOP (`c[0]−c[1]`) with
the daylight at the BOTTOM (`c[1]−c[2]`).
- Bigger gap at the top → the friend you partner MOST is the odd one out, `lean:'most'` → oddness `tempted`.
  Singled out, envied, and the one the Coil courts.
- Bigger gap at the bottom → the friend you partner LEAST, `lean:'least'` → oddness `sidelined`. Benched, and
  the one the Coil consoles.
- Gaps EQUAL → `least`. Being left out is the plainer, more readable slight, and it keeps the classic
  two-distinct-picks case reading exactly as it always did.
- Dead level, or nothing on record → fall back to the original pick-only rule (`legacyOddOneOut`), so nothing
  is ever undecided and a campaign with no picks still resolves to the deterministic first tour-mate.

**Backward compatibility is the load-bearing property.** With no paired qualifier played, the tally *is* the
old rule: two different picks tallies 2/2/0 (bottom gap wins → the lone unpicked friend, sidelined); the same
partner twice tallies 4/0/0 (top gap wins → the friend you trusted most, tempted). A v6 campaign's arc is
byte-for-byte what it was. `betrayerId` and `betrayerOddness` now both resolve from `partnerStanding`, so
they can never disagree (machine-checked) — `betrayerOddness` keeps its "both Sigil picks locked" gate so the
Ch.3 mid-round omen fires exactly when it always did, while the Ch.1–3 thread reads the LIVE standing.

## The Chapter 1–3 thread — the betrayal's first act (GS-story-qualifier-formats)

The arc used to start at Chapter 4. Everything before it was scenery. Now the friend standing apart in the
live tally gets a scene after **each of the first two Sigils** — a `TournamentAftermath` beat
(`partnerThreadAftermath`, rendered through the shared `.gs-lore*` card, WIN only, and a won Sigil can never
be replayed so each stage lands exactly once):

| Stage | Fires | `lean:'most'` → `enticed` | `lean:'least'` → `overlooked` |
|---|---|---|---|
| 0 | after Sigil 1 | someone has been watching them play, properly, for the first time — and it isn't you | the pairings sheet without their name on it, carried the way that character carries a slight |
| 1 | after Sigil 2 | the courting has landed; they raise it with you themselves, testing whether you flinch | they've stopped asking, and someone in shed-scale has started sitting with them |

Content is `BETRAYAL_VOICE.enticed[]` / `.overlooked[]` in `storyBetrayal.ts` — sixteen authored scenes (four
golfers × two flavours × two stages), each around that golfer's own Coil relationship, so the thread runs
unbroken into the mid-round omen, the Ch.4 doubt beats and the defection. **Huang-Woo ↔ Venoma** (the Viper
is the only gallery that never goes home); **Feather / Larry / Bo ↔ the Apostate** (the windless line / the
void-tide / the still green). A new golfer = new rows; `everyGolferHasBetrayalVoice` machine-checks coverage.

**Why the aftermath and not the lore gate.** Arrival beats compete for a fixed number of world arrivals —
adding two to Chapters 2–3 would have silently starved existing beats on a minimum path. The Sigil result is
also simply the better moment: it is literally "after the Sigil-1 tournie", and it can't be missed.

**Anti-spam, by construction.** At most two extra beats across the whole trunk, one per major, each once ever
per (golfer, flavour, stage). The thread scales with how much of the campaign you actually play.

**The agency this buys.** A chapter charts three qualifying events and asks you to qualify in two, and the
star-map dossier shows each event's drawn format AND the tour-mate you'd be drawn with **before you fly**. So
choosing which two roads to take is choosing who you spend the chapter beside — and the Sigil-1 beat is a
warning you still have a whole chapter to act on. That is the point: the game tells you who is drifting, and
gives you the wheel.

## The mid-round omen — pre-Choice foreshadow (GS-story-midround-omen)

The betrayal used to have NO on-screen build-up before The Choice — `betrayerId` is settled the moment both
team-Sigil picks lock (end of Ch.2), but the first the player saw of it was the Ch.4 doubt thread, *after*
the fork. So the betrayal read as a switch-flip. This beat plants the seed while the trunk is still shared.

**When.** At the nine-hole pause (the turn) of the **Chapter-3 major** (the Storm Championship) — the last
tournament before The Choice, by which point both partner picks are locked and `betrayerId` is final. The
`holeComplete` reducer, at the hole-9 boundary, checks `midroundOmen(story, chapter)` BEFORE building the
halftime rival pop; if it qualifies it diverts to the `storyMidBeat` screen, and `storyMidBeatContinue` marks
it seen (`seenStoryBeats['midround-omen']`, once per run) and flows into the pop. Every gate is a
pre-condition (Ch.3 only, `!alignment`, both picks locked, unseen), so every other tournament turn is the
classic pop, byte-unchanged.

**What — keyed to WHY the friend is the odd one out** (`betrayerOddness(story)`, the single classifier):
- **SIDELINED** (two DISTINCT partner picks → the betrayer is the one you NEVER chose): they mutter from the
  ropes that they're never good enough — passed over twice — and a Coil NPC drifts to their shoulder. You
  SEE them get recruited, so the defection lands softer.
- **TEMPTED** (the SAME partner picked twice → the betrayer is the friend you TRUSTED most, the twist): they
  stood at the tee beside you when the Coil spoke, heard the word the same as you, and admit "maybe there's
  something to it." Pays off BOTH ways — Warden, the word takes them; Herald, they resist it and can't
  forgive that you didn't (the GS-story-heard-the-word follow-up).

**Where it lives.** Content is `BETRAYAL_VOICE.sidelined/tempted` in `storyBetrayal.ts` (so a friend's
foreshadow, defection, farewell and rival lines are all ONE indexed voice block), each authored around that
golfer's own Coil relationship — **Huang-Woo ↔ Venoma** (the Viper is the roar when his gallery goes quiet),
**Feather / Larry / Bo ↔ the Apostate** (Voss's windless line / void-tide fatalism / still-green mercy match
each one's established doubt). Assembly + once-tracking is `storyMidround.ts` (`midroundOmen`,
`applyMidroundOmen`, the `MidroundOmen` payload). The screen reuses the shared `.gs-lore*` beat card via
`loreBeatHTML` (extracted from `loreScreens.ts` — no forked CSS prefix). Pure + render-only: zero sim rng,
no `STORY_VERSION`/save bump (it rides the existing `seenStoryBeats`).

**Guards.** `tests/story-midround.test.ts` — the picker (fires only Ch.3/pre-Choice/both-picks/unseen; the
sidelined-vs-tempted flavour; `betrayerOddness`), per-character voice coverage (every golfer has both scenes,
the tempted friend says "something to it", the sidelined scene names a Coil NPC, Huang-Woo's thread is
Venoma), `applyMidroundOmen` once-only, and the full hole-9 reducer flow (divert → beat → pop → back nine,
never re-firing; a Ch.1 major's turn shows the classic pop with no false fire). Plus a `?screen=storymidbeat`
browser smoke in `tests/build.test.ts`. `everyGolferHasBetrayalVoice` now also requires the two new scenes.

## The payoff — "I heard it too" (GS-story-heard-the-word)

The `tempted` omen plants a seed that must pay off BOTH ways. **Warden:** the tempted friend falls to the
word (the existing defection/doubt/distance arc + the interlude) — and because the omen SHOWED you them
hearing it, the defection now "makes sense" rather than reading as a switch-flip (the player's Warden ask).
**Herald:** YOU turn, and the friend who heard the word beside you did NOT — they resisted the same whisper
and come to stop you, heartbroken and uncomprehending: *"I heard the word the same as you… how could you side
with them?"* (the player's Herald ask, verbatim in intent).

That confrontation is per-character Herald arrival beats `story-heard-<golfer>` (`LORE_EVENTS`), from
`BETRAYAL_VOICE.heardTheWord` — each in that golfer's voice + Coil thread (Feather's windless line, Woo's
Venoma-roar, Larry's void-tide, Bo's still-green). They gate on the Herald path + the new
`LoreContext.storyBetrayerOddness === 'tempted'` (populated in `withLoreGate` from `betrayerOddness`) + this
exact `storyBetrayerId`, so the beat fires ONLY for the friend the omen showed hearing the word, and only in
the same-pick-twice case that raised the tempted omen. Placed after `story-venoma-herald` so the Viper's
welcome lands first, then the friend's grief. Pure DATA + a context field — zero sim rng, no save bump.
Guarded in `tests/story-midround.test.ts` (fires for the tempted betrayer in their voice; never for the
sidelined case, the Warden path, or off a story round; `everyGolferHasBetrayalVoice` now requires it too).

### Notes / follow-ups for the polish pass
- **Finale balance** (`FINALE_ALLY_EDGE`, opp `rivalEdge×0.5`) is a first fair cut (a −2 round wins >60%,
  a blow-up isn't carried to a halve). Re-measure once eyes-on play confirms the human-round baseline.
- **Team-major edges** (rival/rando pair `edge`s, `TEAM_PARTNER_EDGE`) use the interim values from
  GS-story-partners — verify Sigils 1/2 are winnable-but-earned like the story-balance curve.
- **Halftime pop** on the Stableford Ch.3 still compares thru-9 STROKES (approximate) — a points pop is a
  polish nicety.

## Whose side you are on decides who stands beside you (2026-07-25)
Three reports from one Coil play-through, all the same shape: the campaign's *fork* was never taught to the
surfaces that pick a partner or write a line.

**GS-story-coil-partners — the partner pool follows the path.** Every paired story event drew its partner
from `otherGolferIds` — your three Earth tour-mates. That is right up to The Choice and wrong the moment
after it: turn Herald and those three desert the bag (`applyHeraldCaddies` swaps the whole crew for the Coil
inner circle) and two of them come for you at the Ghost Harvest. The dossier was still offering "play this
qualifier with Larry". `storyPartners.ts` is now the one seam: `storyPartnerIds(story)` returns the three
tour-mates on the Warden/undecided road and the four Coil agents (Voss, Venoma, Ouros, Ecdysis) on the
Herald one, and `storyPartnerName(id)` resolves a display name for *any* partner the game can hand it —
golfer, Coil agent, or the Sigil-5 Coil champion — so the picker, the draw sheet, the intro banner, the
scramble card, the best-ball reveal and the recap all read one source. The pool is a pure function of
`alignment` (nothing mutable like the active caddy), so a campaign's draw sheet stays fixed, and it is the
same size as the old one, so the draw's shape — and every Warden campaign's existing sheet — is unchanged.
Coil ids in `qualifierPartners` are simply not counted by the partner tally (`bump` only counts tour-mates),
which is correct: by the time you are the Herald the betrayer is long settled.

**GS-story-champion-met — you can only partner a champion you have met.** The Sigil-5 Coil picker offered
Voss, Venoma *and Scorpius* — but Scorpius is the Chapter-4 **Warden** rival, the hunter sent to the Abyssal
Vigil. A Herald never plays the Vigil, so he walked into the campaign's climax as a total stranger.
`metCoilChampions(story)` keeps Voss and Venoma (both cross every campaign's path — the Forge, the Storm,
The Choice) and admits Scorpius only on a Warden road that has reached Chapter 4. The choice stays real:
a champion cannot carry your bag *and* play beside you, so swapping who caddies in the locker is how you
free the one you want at your side.

**GS-story-pair-voice — they did not come alone.** The Ch.5 Herald rivals reused the `confront` voice
written for the Ch.4 Drowning Rite, where the Wardens send exactly ONE champion. At the Ghost Harvest two
friends share a ball against you — so Larry was saying *"they told me not to come alone, mate. Came alone
anyway"* with his partner standing next to him. `confrontPair` is a fourth voice row per golfer (taunt +
both halftime lines), written for a pair: each of them counts what is left of the ship out loud, in their
own idiom, which is a sharper knife than the solo lines ever were.

**GS-story-yard-badge.** Same session, smaller: the shipyard stamped "Earned" on `milestone` ships — which
are revealed by renown and then *bought* — so the badge read as a claim about a ship you already had, next
to its price. It now says `Renown`, `reward` ships say `Sigil`, and an OWNED ship shows no acquisition badge
at all (the card already says Flying / Owned, and in the Hangar every ship is yours by definition).

## Key reuse points (from the code map)

- Team scoring: `src/sim/rpg/match.ts` — `bestBallHole`, `playSideHole('scramble'|'bestball')`,
  `playTeamMatchStop(TeamSetup{format, partnerSide, playerPartnerMods, bossPartnerMods})`. Both sides can
  carry a partner already → the 2v2 finale is this engine pointed at a Story venue.
- Ghost field: `ghostHoleStrokes` + `golferForm` (`competition.ts`), the Asgard `warriorsThreeTotals`
  multi-ghost pattern — combine with best-ball pairing for opposing pairs.
- Partner swing shapes: `characterShotMods(id)` (`characters.ts`) — feed a CHOSEN golfer id directly.
- Story resolution: `resolveStoryTournament` (`gameUpdates.ts`) branches on the new `format`.
- Cast/interaction: `crewStandee`/`storyInspectAlly`→`storyAllyTalk`→`storyCloseAlly`
  (`storySpaceport.ts` / `game.ts`); costume renderer `golferPreviewSVG` (`apparelArt.ts`).
- State: `StoryState` (`story.ts`), defensive `migrateStory` field-backfill + `STORY_VERSION` bump.

## Contracts this must not break

- Determinism / byte-stability: every new lever (format flag, partner fields, betrayer) defaults to a
  no-op; Voyage/Unending seeded suites stay byte-identical. Story rounds already ride the shared engine.
- auto ≡ interactive: team/matchplay Sigils resolve identically headless and interactively (the
  `match.ts` team-duel path already guarantees this; `tests/team-duel.test.ts` is the reference).
- No new `_gs*`/URL hook is planned (Story content is data, not a feel flag) → no test-hub wiring; only
  `?screen=` deep-link VALUES for browser smokes.

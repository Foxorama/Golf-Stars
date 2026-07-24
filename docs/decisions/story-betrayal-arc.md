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
  finale is **2v2 best-ball matchplay: You + a LOYAL friend vs (the Betrayer + the Coil champion,
  Venoma)**.
  - Loyal final partner = a non-betrayer *other*: the `p2` partner if two distinct picks (both stayed
    loyal); if same-partner-twice (your partner betrayed), a non-betrayer *other* rallies to you
    (prefer the one whose character-quest you completed, else deterministic by roster order).
- **HERALD (you turned):** YOU are the traitor. Your former friends stay Warden and come for you. The
  Ch.5 finale is **2v2 best-ball matchplay: You + the top Coil champion who ISN'T your active guide
  (Voss or Venoma) vs your two former friend-partners**.
  - Opposing pair = the friends who trusted you: `{p1, p2}` if distinct; if same-partner-twice, `{p1}` +
    one *other* who also stayed Warden (deterministic — the friend you always picked AND one you spurned
    both come for you). Ch.4 betrayal beats are keyed to your first COMPLETED caddy quest and whether you
    still wield its reward club (see PR H).

Edge-case defaults (documented, not asked): the "second seat" and same-partner cases resolve
deterministically by roster order, biased toward a completed character/caddy quest so the beat is
personal where possible.

## Costumes

The defector gets a **corrupted Coil look** — a reusable `corruptedGolferLook(character)` feeding
`golferPreviewSVG` (Coil violet `shirtBase` + a serpent-hood, the venom palette `#b060c0`/`#7fe0a0`),
shown in the Ch.4/5 betrayal beats, the Ch.5 lobby, and the finale figure. On the Herald path YOU are
the corrupted one; the former friends stay clean Warden.

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
  **Ch.5W** = the corrupted BETRAYER (Venoma at their shoulder — matches the matchup box + `finaleMatchup`);
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
  loss = Venoma keeps the door); **Ch.5 Herald** (win = the root opens + the Coil's anointing; loss = the two
  friends bar the way). NOT a `seenStoryBeats` one-off — a won Sigil can't be replayed (`currentTournament` gates
  on `tournamentWon`), so a WIN beat fires once naturally, and a LOSS beat re-shows each retry (it IS that round's
  result, like the scorecard). Pure content-as-data + one screen + a reducer divert; zero sim rng, no save/
  STORY_VERSION bump. Guarded by `tests/story-aftermath.test.ts` (which majors get a beat, speaker/portrait per
  case, the reducer flow) + a `?screen=storyaftermath` browser smoke in `tests/build.test.ts`.
- **GS-story-betrayal-polish** — balance re-tune (the finale + team-major edges), any dialogue-depth follow-up,
  constitution/roadmap docs.

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

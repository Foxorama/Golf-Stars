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
| 4 | Ch.4 | **Strokeplay** (single person, per path) | — | Warden: Venoma. Herald: a former friend. Betrayal beats land here. |
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
- **GS-story-betrayal-polish** — balance re-tune (the finale + team-major edges), any dialogue-depth follow-up,
  constitution/roadmap docs.

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

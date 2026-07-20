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
| 3 | Ch.3 | **Stableford** (single person) | — | ghost field, points scoring. **The Choice fires after this win.** |
| 4 | Ch.4 | **Strokeplay** (per path, unchanged shape) | — | Warden: Venoma. Herald: a former friend. Betrayal beats land here. |
| 5 | Ch.5 | **2v2 best-ball MATCHPLAY** | your loyal ally / Coil champion | the betrayer + a champion (see below) |

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
- **GS-story-stableford** — ✅ (#510) Sigil 3 single Stableford (points, higher wins).
- **GS-story-betrayer + finale** — ✅ (#511) `storyBetrayal.ts` (odd-one-out betrayer, finale team comps,
  `corruptedLookOpts`) + the Ch.5 2v2 best-ball matchplay finale (both paths), lobby matchup box + recap.
- **GS-story-betrayal-beats** — ✅ (#512) the mid-chapter interlude reworked into the per-character defection
  (Warden, corrupted portrait) / caddy-quest-keyed severing (Herald); four distinct `BETRAYAL_VOICE`s.
- **GS-story-charquests** — ✅ each friend's signature quest, unlocked by partnering them; `charquest:<id>`
  reward on their talk card (no save bump).
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

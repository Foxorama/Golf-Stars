# Story Tour — deep-dive review (designer · QA · story editor)

**Date:** 2026-07-18 · **Reviewer pass:** one senior game-designer lens, one senior QA lens, one
game-story-editor lens · **Scope:** the whole Story Tour campaign (GS-story*, PRs #453–#467) as shipped
on `main`, measured against `docs/decisions/story-mode.md` (systems) and `docs/decisions/story-bible.md`
(canon).

> **Bottom line.** Story Tour is a genuinely impressive amount of shipped machinery — a separate save
> spine, a full clubhouse/locker/shipyard/pro-shop economy, a five-chapter tournament trunk with a real
> alignment fork, an intro cinematic, a parrot bar, and eleven test files guarding it. The *systems* are
> almost all there. What's thin is the **golf** at the two moments that matter most (the finale isn't a
> game; world difficulty never scales) and the **story** at the moments the bible sells hardest (the
> dark-mirror antagonist who gives The Choice its meaning simply isn't in the build). Most of the gap is
> content and tuning on top of solid foundations, not a re-architecture. This report ranks the fixes.

---

## 0. What actually shipped (inventory)

| System | State | Notes |
|---|---|---|
| `StoryState` + `gs_story` save + migrate | ✅ solid | pure, defensive, `STORY_VERSION` 2 |
| Prologue: Earth clubhouse → St Andrews → victory → intro cinematic → spaceport | ✅ | good Earth→space arc |
| Star-map navigator, world unlock by chapter | ✅ | 15 worlds, 3 per chapter |
| Pro Shop (themed clubs), Locker (bag+gear), Shipyard (ships+upgrades) | ✅ | content-as-data, lore cards |
| 5 Galaxy Tournaments (trunk Ch1–3, fork Ch4–5) vs ghost rival | ✅ | Asgard ghost model |
| The Choice (Warden/Herald) + alignment fork | ✅ | screen + gated rows |
| Emotional interlude (Prism Accord / The Severing) | ✅ | one beat each, credit outcome |
| Finale (Jörmungandr) briefing + cinematic + two-ending recap | ⚠️ partial | **not interactive — see D1** |
| Story beats (Coil named, Coilkeepers, Venoma) + parrot bar | ✅ | 4 beats + bar chatter |
| Caddy roster ("gather your friends") | ❌ **not shipped** | fields exist, no mechanic/screen |

The suite (`tests/story-*.ts`, `lore.test.ts`, `parrot-bar.test.ts`) is comprehensive: pure models, reducer
flows, and `?screen=` browser smokes. Baseline `npm run check` is green.

---

## 1. Senior game-designer review

**D1 — The finale is a spreadsheet check, not a battle. (Severity: highest.)**
The campaign's climax — hyped for six chapters as *"the one place golf becomes a shooter"* and *"a golf
finisher into the serpent's eye"* — resolves as `weaponRating >= 26 && (engine+shield) >= 30`
(`storyFinale.ts`). No input, no skill, no golf, no RNG, no tension. If you bought enough upgrades you win;
if not you lose and are told exactly what to buy. Deterministic-and-fair was the right instinct for *not
soft-locking a mandatory gate*, but the current shape means the emotional peak of the whole game is a
shopping-list validation. **The bible's promise — line up and strike the ball down the serpent's throat —
should be an actual shot** using the shared engine. A contained fix keeps the two gates as the *floor*
(you must be armed to reach the finisher) but adds one real interactive strike whose *quality* colours the
ending (clean kill vs graze), so arming still guarantees the win but the player *does* something. This is
the single highest-value improvement available.

**D2 — World difficulty never scales with chapter. (Severity: high.)**
The bible pillar is *"chapter raises each world's wildness."* In code, a story world round pins the fixed
static course with `staticEffect: 'none'` (`storyPlayWorld`), so Chapter-5 Hydra Mire plays at the exact
same difficulty as if it were the first world you ever charted. The *only* thing that escalates is the
tournament ghost's `rivalEdge`. So the moment-to-moment golf — 80% of playtime — is flat from Ch1 to the
serpent's shrine. Difficulty should ride the chapter (a wildness bump per chapter, or per-world tiering),
gated so records/fairness stay honest.

**D3 — The economy has no scarcity and no risk-reward. (Severity: high.)**
`storyRoundCredits(toPar) = max(100, 200 − 15·under)` — flat. A brutal Ch5 world pays the same as a gentle
Ch1 warm-up, so there's **no incentive to play hard worlds**. Worse, revisits pay full rate forever (the
Parrot literally advises grinding), so the optimal strategy for the ~1300-credit finale arsenal is to
re-fly the easiest world you own on repeat. That guts every spend-choice the shipyard/locker/pro-shop are
built around. Fix: scale payout by chapter/world-tier (reward risk) **and** decay repeat revisits of a
cleared world (first clear pays full; re-flies pay a diminishing top-up). *(Actioned this session.)*

**D4 — Rival monotony; the Apostate never appears. (Severity: high — see also S1.)**
Venoma is the rival in Ch2, Ch3, Ch4W **and** Ch5W — four of five majors on the Warden path, and every
single one after Ch1. The bible's **Malachai "Sable" Voss, the Apostate** — your dark mirror, the former
champion who fell, the whole reason The Choice has weight — is **not in the game at all** (0 references).
He's supposed to appear at Ch3, loom over The Choice, and invert at the finale. His absence is felt as both
a design (rival variety) and a story (S1) hole.

**D5 — The Choice is a blind coin-flip with an inverted incentive. (Severity: medium.)**
At the fork the player has no lived preview of either path's *golf* — just flavour bullets. And the one
hard number attached to alignment, the interlude credit gift, **rewards Herald more** (600 vs Warden 300)
with no surfaced downside — the "cursed sheddings have a bite" fiction never reaches the Choice math, so
the "evil" path is mechanically the greedy pick. Either surface the trade-off or invert it (the dark path
should cost something visible).

**D6 — "Gather your friends" is unfulfilled. (Severity: medium.)**
The recruitment line and the bible both promise your three fellow golfers as recurring allies you rally.
The `hiredCaddyIds`/`activeCaddyId` roster fields exist but there is **no purchase mechanic, no roster
screen, and `activeCaddyId` is never folded into a story round** — so Dan/Penelope/Pim never actually
join your bag, and the Ch1 rival is a generic ghost ("Birdie Bianchi"), not your friends. The mode's
opening emotional promise has no payoff surface.

**D7 — No qualifier→final structure; unlock is trivial. (Severity: low.)**
Clearing any 2 of a chapter's 3 worlds opens the major — no target, no "qualify under X." The bible's
qualifier round is deferred. Low urgency, but it means the majors arrive without earned pressure.

---

## 2. Senior QA review

**Q1 — Coverage is strong; the untested claim is economic reachability.** The gate-numbers (breach 26 /
survive 30) are unit-tested, and `story-balance.test.ts` proves the rival curve is winnable-not-gimme. But
nothing asserts the finale arsenal is **affordable within a realistic playthrough's credit budget** given
the current flat economy — the doc *asserts* ~3200 cr across ~16 rounds but there's no test pinning it, and
D3's grind-loop means the "intended" budget isn't the real one. Add an economy-reachability test alongside
any economy change.

**Q2 — The finale is deterministic but silently one-way on category.** `finaleResult.failReason` reports
`'firepower'` before `'defence'` when both are short, so a player short on *both* is only ever told to buy
weapons; after fixing weapons they're then told to buy defence. Minor, but the briefing gate rows already
show both bars, so the single `failReason` is redundant/possibly misleading on the result screen. Low.

**Q3 — Alignment default masks a bad state.** `tournamentForChapter(chapter, alignment)` defaults to the
Warden row when `alignment` is unset at Ch4+. That's defensive, but it means a corrupted save that lost its
alignment silently plays Warden content with no signal. Acceptable, worth a note.

**Q4 — `interludeFriend` = "first roster golfer who isn't the protagonist."** Deterministic and safe, but
it means the emotionally-loaded "friend you win back / betray" is *always the same golfer* regardless of who
you picked or played alongside — and they're never named in the Ch1 leaderboard, so there's no relationship
built before the beat asks you to feel one. Not a bug; a hollowness. (Ties to D6/S3.)

**Q5 — No regression guard that world difficulty is intentionally flat.** If D2 is fixed, the fix must not
perturb the Star-Tour/records rendering of the same static course. Any chapter-wildness change needs a test
that the *non-story* path stays byte-identical (the static-course determinism contract).

**Q6 — Verified green:** `npm run check` passes on `main` after `npm ci` (the sandbox shipped without
`node_modules`; deps must be installed to run the gate — noted for future sessions).

---

## 3. Game-story-editor review

**S1 — The antagonist is missing. (Severity: highest, story.)** The bible is built around **Malachai
"Sable" Voss, the Apostate** — the last champion to play a course perfectly true, who heard the serpent and
fell, and who returns as your dark mirror. He is *the* device that makes The Choice mean anything ("everything
the Parrot says you *are*, he *was*"). In the shipped game he does not exist: The Choice is delivered by an
anonymous "hooded Coilkeeper," Ch3's "the Apostate appears" beat isn't written, and there's no portrait. The
fork currently reads as a menu, not a temptation, because the tempter is absent. **Adding Voss is the single
highest-leverage story fix.** *(Actioned this session — portrait + Ch3 beat + The Choice presence.)*

**S2 — The two endings differ in text but not in event.** Credit where due: `storyFinaleResultScreen`
already branches Reseal vs Long Rest copy — good. But the finale *cinematic* plays a generic win regardless
of path, and the loss is shared, so the "victory that grieves" never *looks* different from the clean save.
With D1 (an interactive finisher) the two endings should diverge in what you *do*, not just what you read.

**S3 — "Gather your friends" has no narrative payoff.** (See D6.) The one recruitment line ("gather your
friends and follow me") is never cashed: the friends aren't named allies, don't appear in the majors as the
bible's friendly-rival board, and the interlude "friend" is anonymous. The mode opens a loop it never closes.

**S4 — Named hosts flatten to strings.** Sir Aldous Greensward, Magnus Cinder, Pim, Brother Ouros, Sister
Ecdysis — the bible's supporting cast — are almost entirely absent (Ecdysis survives only in one gear
blurb; Cinder became "Master Cinderwright"). The tournament `host` fields are generic ("The Lyra Golf
Club"). These are cheap, high-flavour data restorations. *(Partly actioned this session.)*

**S5 — Strong where it shipped.** The parrot bar (`parrotBar.ts`) and the interlude (`storyInterlude.ts`)
are genuinely well-written — consistent voice, real pathos, good economy of words. The Coilkeepers beat and
the branching Venoma confrontation land. The problem isn't writing quality; it's *coverage* of the bible's
key beats (prologue recruitment as a proper beat, Ch1 first re-consecration, the Ch3 low point, the Apostate).

---

## 4. Prioritized action list

Ranked by (player value × low regression risk × testability). Story-only surfaces carry no
Voyage/Unending determinism risk (separate save + gated rows), which is why most are safe to ship fast.

| # | Item | Lens | Effort | This session |
|---|---|---|---|---|
| 1 | **Interactive finale finisher** (a real strike colours the ending; gates stay the floor) | D1/S2 | L | backlog (top) |
| 2 | **The Apostate — Voss** portrait + Ch3 beat + The Choice presence + bar line | S1/D4 | M | ✅ shipping |
| 3 | **Chapter-scaled payouts + diminishing revisits** | D3/Q1 | S | ✅ shipping |
| 4 | **Chapter-scaled world difficulty** (wildness rides chapter; records path unchanged) | D2/Q5 | M | backlog |
| 5 | **Named hosts + rival-variety flavour** (bible cast into `host` rows, Voss behind the Storm) | S4/D4 | S | ✅ shipping |
| 6 | **Caddy roster** — hire-once allies fold into the story bag ("gather your friends") | D6/S3 | M | backlog |
| 7 | Choice trade-off surfaced (cursed = visible cost, not just more credits) | D5 | S | backlog |
| 8 | Prologue recruitment + Ch1 re-consecration as proper lore beats | S3/S5 | S | backlog |

Items 2, 3, 5 are shipped this session as focused, auto-merged PRs (each `npm run check`-green, Story-only,
no determinism impact). Items 1, 4, 6 are the meatier follow-ups tracked in `IDEAS.md`; item 1 (the
interactive finale) is the recommended next big push — it's where the campaign's promise most outruns its
delivery.

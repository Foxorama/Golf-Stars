# Trade-tent interactions (GS-tent-interactions)

> The deep "why" behind making the trade-market tents a real interaction on the course. The everyday
> constraints live in the root CLAUDE.md; read here for the rationale. Grep `GS-tent-interactions`.

## The problem
The trade-market route's `GS-tents` shipped a ring of bright, collidable tents around **every** green of
the stop that a low shot could ricochet off. It was a nice one-note twist, but over a whole stop it wore
thin (the whole world became a bounce-house), the tents did nothing but bounce, and the "Ow!" voice bubble
was anchored to the ball's roof-contact point captured in **screen** space — so as the follow-cam panned
with the ball, the bubble drifted with the ball and read as coming from the golf ball, not the tent.

## The shape of the fix
Give every hole of a tradeMarket stop a tent camp, each with **five distinct, randomised interactions**,
and fix the bubble. (The tents first shipped on a single surprise hole per stop; see "Every hole of the
stop" below for why that moved to the whole world.) The guiding constraint (CLAUDE.md contracts): the SHOT must resolve identically in the headless
auto sim and the interactive driver, so anything that changes the shot outcome lives in the shared pure
physics; anything player-facing/stateful is an interactive-only META reaction layered on like the
ace-celebration / unlock side-effects.

### Every hole of the stop (`run.ts armTentHoles`, `Hole.tents`)
`currentCourse` stamps `tents:true` on **every** hole of a tradeMarket stop — **zero generation rng**, so
the generated course is byte-for-byte unchanged and a resume reproduces the same holes. The tents were
first stamped on a single hole per stop (a pure FNV hash of the course seed picked the index), but a lone
surprise hole was too rare for a route billed as a *trade market* — you'd cross the whole world and meet
the camp once. Stamping the whole stop makes the tradeMarket lane read as its trade-camp world (a camp at
each green, however many holes the mode runs — 6 for a voyage stop, 4 for the Unending Universe, whatever a
future mode sets), while the per-hole effect shuffle (`assignTentEffects`) keeps each green's colour→effect
mapping distinct so no two holes play identically. Every tent gate (sim `executeShot`, `style.ts`,
`holeView.ts`) still reads `opts.tradeTents && hole.tents`, and the render side reads `hole.tents` directly,
so the app call sites (which pass the stop-wide `tentsActive()`) need no per-hole logic — the stamp does the
filtering.

### Five randomised effects (`tents.ts assignTentEffects`, `TentEffectId`)
Each tent gets one of `ow | marmot | fortune | watch | starmart`, dealt by a mulberry32 Fisher–Yates
shuffle seeded off the hole (pure, no rng stream). So the colour↔effect mapping scrambles hole to hole —
you can't just aim at the red tent every time. `TENT_LINES` holds each effect's bubble line.

### The bubble fix (`ShotLog.tentHit.c`, `playView.ts`)
`executeShot` now surfaces the tent **centre** and **effect** on the shot log, not just the ball's contact
point. `playView` stores the callout in **course** space (the tent centre) and re-projects it every frame,
so it stays glued to the tent as the camera pans. The text is the struck tent's own `TENT_LINES` line, and
`app.ts playTentBonk` already speaks it.

### The interactions
- **ow / watch** — pure flavour: the bubble + a startled voice. No state change.
- **marmot** — the marmot pockets your ball. This DOES change the shot, so it's resolved in the shared
  physics: a marmot bonk is a **lost ball** (stroke-and-distance, `PEN_INFO.lost`, replay from origin) in
  `executeShot` — deterministic, auto ≡ interactive, negligible balance impact (a non-penalty carry on a
  route that isn't in the death-spiral harness; `tents.test.ts` proves non-marmot tents stay non-penalty).
  The **first-ever** marmot bonk unlocks the persistent **Marmot Bartender** (save **v15** `marmotBartender`)
  — a marmot tends the 19th-hole bar and a **tip jar** with a "Tips" sign sits on the right of the counter
  (`clubhouseLounge.ts`, gated cosmetic, re-shoot `scripts/clubhouse-preview.mjs`). The unlock is an
  interactive reducer reaction (`applyTentReactions`), like the ace-ship unlock. The marmot's spoken/bubble
  line is **"Thanks for the tip!"** (`TENT_LINES.marmot`).

  **The tip jar (GS-tent-tips, save `v20` `marmotTips`).** EVERY marmot bonk (not just the first) drops a
  golf ball in the jar: `applyTentReactions` bumps `marmotTips`, a running total that **ACCUMULATES across
  runs** (a new run does NOT reset it — the original per-run reset emptied the jar between marmot encounters,
  which fall roughly one-per-run, so the jar only ever showed ~1 ball and the fill-up payoff was unreachable).
  The clubhouse renders the fill-then-cash-out cycle off the total: `balls = marmotTips % (MARMOT_JAR_CAP + 1)`
  nested in the jar, so it fills **1 → CAP (a half-dozen, `MARMOT_JAR_CAP` = 6)** over successive bonks and
  reads FULL at CAP with the Marmot still tending bar. The bonk that would **overflow** a full jar cashes it
  out (`balls === 0`, `marmotTips > 0`): the Marmot has pocketed its half-dozen and taken the night off — it's
  out on the **spaceport par-3** playing golf (`marmotGolfer()` on the deck green) — so the bar shows **no
  bartender** and an **empty** jar that visit, then it refills. All purely a function of `marmotTips`, threaded
  `clubhouseLoungeHTML → loungeArt`/`spaceportArt`. The count is earned in play, never granted retroactively
  (the `v19→v20` migration seeds it 0). *(Fix: previously reset per run + `CAP` 10 — unreachable — so the jar
  emptied after a single ball; now it fills to a half-dozen across runs before cashing out.)*
- **fortune** — the fortune teller gifts a free **mulligan** on the NEXT tee shot: `mulliganPending` is
  set, and the next tee shot resolves TWO of the player's own balls and lets them keep the better line.
  This reuses the team-duel SCRAMBLE machinery wholesale (`resolveScrambleShot` with the player's own
  mods, the `scrambleChoice` overlay + `commitScrambleBall`), flagged `mulligan` so the card titles it a
  mulligan and labels the balls "Tee shot A/B". Interactive-only (the auto sim never mulligans).
- **starmart** — a StarMart pop-up shop opens mid-hole (deferred to AFTER the shot animation, dispatched
  from `app.ts onDone`). It spends cross-run **Star Shards** instead of run credits, stocks only
  rare/epic/legendary (no commons) with epic/legendary boosted (`starmartOffer` + `STARMART_RARITY_BOOST`),
  priced 5/10/15 shards, reroll in shards. Bought items last the run (they round-trip through
  `loadout.perks`, so **no save bump**). It's a real `'starmart'` screen with `openStarmart` / `buyStarmart`
  / `rerollStarmart` / `leaveStarmart` reducer actions, mirroring the credit Pro Shop.

## Why this respects the contracts
- **Determinism:** the every-hole stamp and the per-hole effect shuffle are pure (no rng draws); every gate
  is `hole.tents`-armed, so all non-tradeMarket holes/worlds/seeds are byte-identical. Existing seeded tests unchanged.
- **auto ≡ interactive:** the only shot-outcome change (the marmot lost ball) is in the shared
  `executeShot`. Fortune/StarMart are interactive META reactions (new player decisions the auto sim never
  makes), exactly like celebrations and cosmetic unlocks — they don't fork the physics.
- **No death spiral:** tents ride a non-harness route; `tents.test.ts` re-proves the fairness bar with
  tents armed on every hole at max wildness.
- **No new hook:** no `window._gs*` flag or `?param` was added, so the test-hub sync guard is untouched.

## Tests
`tests/tents.test.ts` (effect shuffle, marmot lost ball, unstamped-hole = no tents, fairness bar),
`tests/journey-effects.test.ts` (every hole stamped on a trade stop, deterministic),
`tests/starmart.test.ts` (no commons, shard pricing, epic/legendary skew, reroll),
`tests/ui.test.ts` (StarMart open/buy/leave flow, fortune mulligan two-ball pick), `tests/save.test.ts`
(v14→v15 migration + round-trip).

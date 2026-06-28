# Gameplay-loop review — fun & replayability (2026-06-28)

A roguelike-designer pass over the **whole** Golf Stars loop: the moment-to-moment shot, the
6-hole stop, the between-stops shop/travel decision, and the cross-run meta. The golf engine and
the *texture* of a stop are excellent and deep. The **roguelike structure that wraps them is the
weak axis** — and that's where the replayability ceiling sits today. This report diagnoses why,
ships one obvious fix, and ranks the rest.

Lenses applied per CLAUDE.md: game-feel, QA, golf-soul. The findings below are a *structural*
critique — none of them touch the fairness / no-death-spiral / determinism bars (those are solid;
387 tests green at the start of this pass, 392 after).

---

## TL;DR verdict

Golf Stars has a **AAA-quality "verb"** (the swing, flight, lies, spray shape, course variety,
caddies, themes) bolted onto a **thin roguelike "sentence."** Modern roguelikes (Slay the Spire,
Hades, Balatro) are replayable because of four things Golf Stars is mostly missing:

1. **A destination & a win.** The run is an *infinite attrition treadmill* that can only end in
   failure. There is no boss, no climax, no victory screen. You never *beat* a run — you only
   survive until you don't. This is the single biggest replayability cap.
2. **Build synergy / emergence.** The shop is ~20 *flat stat-stackers* (−x% dispersion, +y credits,
   +z carry). They add up; they never *combine*. There is no "I'm going for THE build this run."
3. **Encounter variety.** Every played stop is mechanically identical: 6 holes, Stableford vs a cut.
   No elites, no treasure rooms, no boss holes, no minigames. The *only* varying nodes are the shop
   (same structure) and the route event (economy-only).
4. **A difficulty ladder above "travel further."** Nothing escalates challenge for a returning
   expert except the linear cut ramp. No Ascension/Heat. The meta is pure power-creep, which makes
   *early* runs more trivial over time, not more interesting.

The good news: the architecture (content-as-data tables, pure sim, format system, event system,
theme system) is *purpose-built* to absorb every one of these. They are content rows and new
node types, not engine rewrites.

---

## The loop as it stands

```
title → pick format → pick golfer → [ INTRO (zone splash) → PLAY 6 holes (cut vs Stableford)
        → RESULT → SHOP (rotating 4-card offer) → TRAVEL (pick 1 of 3 routes + event) ]*
        → miss a cut → GAMEOVER → bank shards → OUTPOST (permanent upgrades) → repeat
```

**What's genuinely strong (keep, lean into):**

- **The stop's *texture*** — biome signature mechanics (lava rivers, void islands, frozen ponds,
  craters), per-zone turf, constellations, wind that reads true, the asymmetric 5-zone spray shape,
  curved flight + surface-friction roll. The *micro* is rich and fair.
- **The travel event system (GS-14/17c)** — risk/reward economy levers with a guaranteed calm out,
  arc-tiered, unique one-offs. This is the *one* place the roguelike structure is already good. It's
  also the perfect chassis to hang more onto (see S+ #2).
- **Content-as-data discipline** — formats, biomes, themes, events, caddies, club sets, meta
  upgrades are all tables. New content is a row.
- **Caddies (GS-caddy)** — the closest thing to *build-defining picks* the game has. Pick-one
  exclusivity, signature powers, real mechanical identity. This is the model the *rest* of the shop
  should aspire to.

**Where the loop goes slack:**

- **Credits had no terminal value** and the *bank/cash-out* decision didn't exist for the player
  (`bank()` was dead code; busting and banking paid identical shards). → **fixed this pass.**
- **The shop is a vending machine, not a draft.** You buy the tightest-dispersion thing you can
  afford. There's rarely a *hard, interesting* choice because items don't trade off against each
  other or combine.
- **The 6-hole stop never changes its shape.** Same win condition every time. Contrast: StS varies
  the *encounter type* every node.
- **The meta is a stat ramp.** Veteran Hands / Tour Bag / Steady Grip just start you stronger. No
  *unlocks* (new golfers, caddies, biomes, formats, modifiers) — so the meta deepens *power*, not
  *variety*, and there's no reason to chase it once your start is "good enough."
- **Characters are tuned to ~5% of each other.** Great for fairness, but it means a golfer changes
  *feel*, not *strategy*. Nobody enables a build the others can't.

---

## Shipped this pass (the obvious fix)

### GS-bank — Push-your-luck cash-out *(implemented + tested)*

**The flaw:** `bank()` existed in the sim but was unreachable from the UI, and `shardsForRun`
awarded the same shards whether you *banked* or *busted*. So (a) the player could never cash out,
and (b) even if they could, there was zero incentive — pushing deeper was *strictly* correct
because busting cost nothing extra. The single most classic roguelike decision ("quit while ahead
or risk it for more?") was **entirely absent.**

**The fix (pure, no fairness/determinism impact):**
- `cashOutShards(run)` converts **unspent credits → shards** (`CREDITS_PER_SHARD = 20`) *only* on a
  banked run. A cut forfeits them. The cut path is byte-for-byte unchanged.
- A **"✦ Bank run & cash out (+N shards)"** button on the travel screen (shown from stop 1 on),
  with the exact payout surfaced so the call is informed. Banking ends the run; the gameover screen
  reads as a green "you quit while ahead" instead of the red "stranded at the cut."

**Why it matters:** it gives credits a *terminal value* (you no longer waste a fat stash on a
bricked run), and it turns every travel screen into a real decision — *spend credits now for power
to push deeper, or hold them to bank?* Tension created with one pure function. Guarded by
`tests/bank.test.ts` (conversion math, banked > busted, cut path unchanged, reducer flow).

---

## Other obvious improvements (small, safe, not yet shipped)

- **GS-risk-shards — reward risk in the shard payout.** Today shards = `distance×3 + stops×2`.
  Surviving a *high-cutDelta* event lane, or clearing a rarer course, pays the same as a calm drift.
  Add a small shard bonus scaled by the event `cutDelta` survived (and/or course rarity) so *taking
  the dangerous lane* feeds the meta, not just *going far*. Pure tuning on `shardsForRun`/`finishStop`.
- **GS-streak — birdie/eagle streak micro-reward inside a stop.** A pure economy nudge: consecutive
  birdies-or-better add a small credit bonus. Gives the 6 holes an *internal* arc beyond the cut and
  rewards aggressive play. (Stableford already caps blow-ups, so this only adds upside.)
- **GS-shop-reroll — a reroll button.** A cheap, escalating-cost reroll of the 4-card offer (StS/
  Hades staple). Turns the shop from "take what's shown" into agency. Trivial: redraw `shopOffer`
  with a salted seed; charge credits.
- **GS-bag-cap pressure.** The bag holds one club per type with no size limit, so reward clubs are
  pure accretion (never a *choice*). A soft cap (or a "swap-out" decision) would make club loot a
  real draft. (Medium, touches `equipClub`/offer UI — flag as A-tier if it grows.)

---

## Complex improvements (A-tier — real design work, high value)

- **GS-encounters — a branching node map with encounter *types*.** Replace "pick 1 of 3 routes by
  distance+event" with a short StS-style map where nodes are **kinds**: normal course, **elite**
  course (harder, guaranteed rare+ loot), **driving range** (a free practice/buff node), **treasure**
  (a free club/relic), **shop**, and an **arc boss**. This is the backbone modern roguelikes are
  built on. The format system already abstracts "what a stop is" — a node *type* is the natural
  extension. Biggest structural upgrade short of the S+ items; arguably *is* one.
- **GS-contracts — optional per-stop objectives.** "Eagle any hole → a free relic," "hit 4 greens in
  reg → +50% credits," "no penalty strokes → bonus shards." Gives the 6 holes texture and a reason
  to play differently. Pure scoring read over `PlayedHole[]`; surfaces as a card on the intro splash.
- **GS-curses — genuine downside gambles.** Every event today is upside-with-a-cut-tax. Add *curse*
  relics/lanes: "your shank zone is doubled, but green-zone holes pay double Stableford," "−1 club
  from your bag, +2 to every reward's rarity." Real risk you *opt into* is the heart of build-defining
  roguelike gambling (Hades' Pacts, Balatro's vouchers). Fits the spray-shape & loadout model exactly.
- **GS-synergy-relics — items that combine.** Convert/augment part of the shop from flat stats into
  *relics with triggers*: "on birdie: +X credits," "on made cut: −1% dispersion permanently this
  run," "first putt each hole is auto-holed inside 10ft." Two or three of these stacking is where
  "the build" lives. The caddy model proves the engine can do triggered effects cleanly.

---

## S+ tier (drastically improve fun & replayability)

These are the changes that move Golf Stars from "a great golf toy with a run counter" to "a
roguelike I'll play 100 times." Ranked by impact.

### S+ #1 — Give the run a destination: **arcs with bosses & a win condition.**
The run *must* be winnable. Structure the voyage into 3 arcs (the `arcForDistance` tiers already
exist), each ending in a **Boss Stop**: a signature, named showpiece course — a single brutal-but-
fair "Galactic Major" with a *special victory condition* (beat a target score / out-duel a named AI
rival / clear a gauntlet hole). Clearing the final arc boss = **you win the run** (a real victory
screen + a big shard/​unlock payout). This single change gives:
- a *climax* and a *reason to push* (the bank decision above gets teeth from both ends);
- a natural home for the best art/theme/mechanic set-pieces;
- the anchor that every other system (difficulty ladder, unlocks, contracts) hangs off.
Without a win, there's nothing to get *better at* except a high score. This is the keystone.

### S+ #2 — **Build synergy & archetypes** (the Balatro lesson).
Re-tier the shop around a few *engine* relics whose whole point is to combine, plus loud
**archetype signposting** (distance-bomber, precision-sniper, scrambler, economy-snowball). Make
caddies, club sets, spray-shapers, and a new relic class *interlock* so a run develops an identity:
e.g. *scrambler* = Sandy + Dr Chipinski + lie-relief relics → you intentionally play from trouble;
*snowball* = Fortune/Lucky + "credits→permanent dispersion" relic → you get tighter every stop.
When picks combine, every shop is a *real* decision and every run tells a different story. This is
the difference between "stat shopping" and "deck-building."

### S+ #3 — **Ascension / Heat difficulty ladder.**
Once a run is winnable (S+ #1), add stacking difficulty modifiers unlocked by winning — tighter
cuts, wilder courses, costlier shops, nerfed start, harsher events. This is the *single highest
ROI* replayability lever in the genre (StS Ascension 1–20, Hades Heat): it turns one win into
20+ escalating, distinct challenges and gives the meta a *purpose* beyond power-creep. Pairs with
turning the meta-shard spend from pure stat-creep toward **content unlocks** (new golfers, caddies,
biomes, formats, modifiers) so progression adds *variety*, not just *power*.

### S+ #4 — **Named rival golfers / a versus pulse.**
A recurring AI rival you race down the galaxy (their score posted on the cut banner; beating them at
a boss stop is the win condition for S+ #1). Even a lightweight, deterministic "ghost" score per
stop gives the solitaire loop a *pulse* and a personality to beat — cheap to simulate (the sim is
already headless and deterministic), huge for stakes and identity.

---

## Recommended sequence

1. **GS-bank** ✅ shipped (this pass).
2. **GS-encounters** (A) + **S+ #1 bosses** together — they're the same structural change (node
   types include the boss). This is the keystone; do it next.
3. **S+ #3 Ascension** once a win exists — cheapest huge replayability multiplier.
4. **S+ #2 synergy relics** + **GS-curses/contracts** — depth on top of structure.
5. **S+ #4 rival** — flavour & stakes pass.

Each is content-as-data within the existing architecture. None requires re-clearing the fairness or
no-death-spiral bars *unless* it touches course generation — keep new systems on the economy / node
/ scoring side (as GS-14 events already do) and those bars stay green by construction.

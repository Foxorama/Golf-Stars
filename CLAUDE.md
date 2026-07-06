# Golf Stars — working notes for Claude

A travelling space golf **RPG**. You voyage the galaxy; each stop is a procedurally-generated,
ever-wilder golf course (rarity-graded loot). Play it, earn rewards, upgrade your bag/ship/perks,
travel further as difficulty and absurdity scale. A **game**, not a tracker — its currency is
*feel, fairness, and progression*, the opposite of a realism app.

Seeded from `golf-finder` (a separate, real golf+astronomy PWA): we harvested its golf sim, rarity/
card system, hole renderer, and Flux art pipeline, then cut all real-world plumbing (GPS, OSM,
weather, real astronomy). **The two projects are independent. Do not re-couple them.**

> **This file is the constitution — the rules that constrain *new* work.** The deep per-feature
> rationale ("why GS-cetus carves the river that way") lives in `docs/decisions/*.md`, one file per
> domain. When you touch a system, skim its constitution bullet here, then **open the matching
> archive doc for the full history before you change load-bearing code** — the bullets below are
> deliberately terse; the archive holds the why, the failure modes, and the tuning history.
> **Keep this file lean** — when you ship a feature, the durable *invariant* goes here (a line or
> two); the narrative goes in the archive doc. Treat CLAUDE.md like IDEAS.md: scan, rerank, merge,
> retire — **not append-only.** If a bullet here has grown into a paragraph of history, move the
> history to the archive and leave the rule.

## How to work with me (ground rules)
- **Pressure-test my ideas before building them.** If an idea is sound, say so and go. If it
  isn't, push back — question the premise, propose a better alternative, or say "that's not a
  great idea, Dave." A cheerful "yep!" followed by a half-working result is the worst outcome.
- **Implement properly or stop.** If you can't do something well, stop and ask for context or take
  the time to do it right. A "this can't be done cleanly because X — here's what I'd do instead"
  is always welcome.
- **Promote durable knowledge into the repo.** Memory is a private scratchpad; CLAUDE.md, skills,
  and docs are the shared record. When you learn a gotcha or recipe, write it down — the *rule* in
  CLAUDE.md, the *story* in `docs/decisions/`.
- **Be concise, factual, accurate.** State what was verified vs. assumed.
- **Front-load everything; don't drag the session out.** Give all options in one pass; only ask a
  follow-up when the answer changes what you do — otherwise pick the sensible default and say which.
- **One feature per session/PR.** These systems share hot files (`app.ts`, `shot.ts`, `style.ts`,
  `run.ts`); a focused context produces fewer regressions than a marathon. Finish, ship, start fresh.

## Reports & idea backlog (living docs)
- A "report" is a **file**, committed — not a chat message (chat evaporates between sessions).
  End-of-session/one-off reports go in `reports/<topic>-YYYY-MM-DD.md`.
- Keep a living `IDEAS.md` backlog (scan, rerank, merge, retire — not append-only). Stable IDs,
  never reused. Move shipped → Done (link PR), bad → Dropped (say why).

## Three lenses (read every change through these)
This game lives or dies on three axes — put every change through all three before calling it done:
- **Game-feel designer.** The swing, the ball flight, the land, the juice. Readable power/aim,
  satisfying contact, particles and screen-shake that sell impact. Lifeless-but-correct is a bug.
  Ask: does it feel good in the hand, is the loop tight, does each run pull you to the next?
- **QA analyst.** Verify, don't assume. The sim is **pure, deterministic, headless** — so test it:
  simulate whole runs from a seed in `tests/` and assert outcomes. Reproduce any bug by its seed.
  Ship feel/physics tunables behind `window._*` escape hatches so they degrade safely and can be
  A/B'd. State what was verified vs. what needs eyes-on play.
- **Golf-soul keeper (arcade, not sim).** The golf must be *fair and readable* even when the course
  is absurd: wind that reads true off the shot bearing, lie that visibly matters, distances that
  feel honest *within the game's rules*. Wildness is the spice; an unfair or unreadable shot is a
  bug even if the physics are "right." (The inverse of golf-finder's realism dogma — fun and
  fairness beat literal accuracy.)

## Architecture (the locked decisions — see STARTER-KIT for why)
- **Vite + TypeScript, modules, real test runner.** No single-file monolith.
- **Sim ↔ render split.** Everything in `src/sim/` is pure, DOM-free, deterministic, no globals —
  so Node/vitest can simulate the whole game. Rendering reads sim state; never the reverse.
- **Deterministic seeded RNG only** (`src/sim/rng.ts`). `Math.random()` is banned in the sim AND in
  any deterministic render path (scene/SVG) — it breaks reproducible runs, daily seeds, and tests.
  (The ONE sanctioned `Math.random` is `app.ts freshRunSeed()`, side-effect layer only; `?seed=`
  pins it.)
- **Course contract** (`src/sim/course/contract.ts`) is frozen: the generator emits it, the
  renderer consumes it, the sim scores it. Rewrite either side freely behind the contract.
- **Versioned saves from v1** (`src/save/schema.ts`): every persisted blob has a `version` +
  `migrate()` (one step at a time). Namespace keys `gs_*`. Export/import-to-JSON from day one
  (localStorage is the only copy). Current schema is **v18**; bump + add a migration when you
  persist a new field. Loadouts are rebuilt from perk *ids* (`loadoutFromPerks`), so most
  run-state changes need NO save bump.
- **Content as data, not code:** clubs, lies, biomes, items, economy, formats, characters, golfers,
  caddies, ships are tables the sim reads. **New world / item / golfer = a new row, not an engine edit.**
  Cutting/re-spreading the club taxonomy (`src/sim/clubs.ts CLUBS`) looks like a one-line edit but
  fans out to default bags, reward types, carry thresholds + seeded tests, and can quietly fail the
  death-spiral harness — follow `docs/decisions/club-list.md` before touching it.

## Non-negotiable contracts (break one and the suite goes red)
These are the rules every change is measured against. They are *why* the codebase stays testable.
1. **Determinism / byte-for-byte stability.** A new feature must consume **zero extra rng draws** on
   the default (feature-off) path, and must not reorder existing draws — so every existing seeded
   test is byte-identical. Gate new draws behind the feature being armed. The whole test suite is the
   guard; if seeded numbers shift, you changed the stream.
2. **auto ≡ interactive.** The headless auto sim (`playHole`/`playStop`/`simulateRun`) and the
   interactive driver (`takeShot`/`previewShot`) must resolve the *same* shot identically. Any new
   shot mechanic is threaded through **both** under the identical rule, with the player draw first in
   both. Guarded across the suite.
3. **Fairness by construction.** Penalty hazards (water/lava/void) stay CLEAR of the tee→green
   corridor — `validateFairness()` proves it; sanctioned forced-carry crossings are EXEMPTED and
   `validateCrossings()` proves each carryable. `generateCourse` throws on violation. Spice is
   non-penalty lies + tight corridors + doglegs + wind, never an unfair carry.
4. **No death spiral.** At max wildness the balance bar is `toPar/hole < 1.0` (relaxed harness:
   `< 1.15`) with `< 5%` blow-ups, measured on **mean per-stop Stableford** (NOT full-run distance —
   distance is chaotic). Re-run the no-death-spiral harness after any shot/dispersion/generator/
   hazard tuning. A power-up must *raise* mean per-stop Stableford to ship.
5. **The graphic IS the physics.** `flight.ts` and `shot.ts`'s `SprayShape` are the single shared
   source the sim samples AND the renderer draws — a ball drawn clearing a tree is one the sim let
   through; the spray cone reads exactly the sampled distribution. Never fork them. Ball flight is
   per club FAMILY (`FLIGHT_PROFILES` keyed by `flightClassOf`), a REQUIRED param through every
   consumer — a new club row picks up its flight with zero engine edits; retuning a row is a
   physics change (re-run the harness, contract 4).
6. **Feel lives behind `window._gsFeel`** (and `_gsIntro`/`_gsSpray`/`_gsArt`) escape hatches, read
   through a `typeof window` guard so the sim stays node-pure. Prefer a `_gsFeel` *sub-field* over a
   new top-level `_gs*` flag — a new flag obligates the test-hub sync (below).

## System index — invariants + where the full story lives
For each system: the rules that constrain new work. **Open the archive doc before changing any of
these systems** — each bullet is the tip of a documented iceberg.

- **Generator & sim** — `docs/decisions/sim-generator.md`
  - Biomes are physics-only data rows; the render palette is keyed by biome id in the render layer.
  - Corridor: wide-and-wild early → tight late, a `ribbon` off a smoothed template-grammar
    centreline; hazard placement + `validateFairness` key off the corridor's WIDEST point.
  - Greens are varied STAR shapes about `green` (single-valued r(θ)) — `pinInGreen`/`rayPolyDist`/
    `validateCourse` depend on it. Pin ≠ centroid (attack aims at flag; auto/safe at fat-of-green).
  - `lieAt` is by surface PRECEDENCE, not draw order. Dispersion is ANGULAR (rotation preserves
    carry), sampled from an asymmetric 5-zone `SprayShape`.
  - Forced-carry crossings are generic penalty bands; the carry-aware AI flies them off `penalty`,
    never the kind. Rivers hold the full carry width across the corridor but taper + terminate
    believably off it (GS-rivers); crossing character/position vary and are fair BY CONSTRUCTION —
    `riverChannel` clamps the crossing into the fair window, `generateCourse` throws, no retry.
  - Hazards never overlap CROSS-family (`dedupeHazardOverlaps`, zero-rng post-filter; trees exempt,
    crossings always win); SAME-family overlaps are legal and render union-merged.
  - An ARMED lost-rough island hole strips every void-stranded hazard (`clearVoidHazards` — the
    abyss is the only penalty there); void/cetus deep par 4/5 are ISLAND-HOP pad chains whose gaps
    are completable by construction (`separateIslandGaps` + `validateIslandHops`). Both worlds are
    in `BALANCE_EXEMPT_BIOMES` (deliberately brutal, skipped by the death-spiral harnesses).
  - Variety is DECOUPLED from difficulty: shape archetypes + dogleg corner groves appear on CALM
    stops; difficulty rides bend severity + hazard density, not which shapes exist.
  - DEEP ROUGH chokes a dogleg's cut-the-corner chord (biome opt-in `deepRough`; ocean uses water);
    fair by construction (far from the bent corridor), wildness-gated, zero-rng on straight holes.
  - A hole gets a forced-carry crossing **or** greenside drama (sanctioned penalty rings +
    approach lake), never both. Corridors can break into mown segments (`brokenCorridor`, biome
    `roughBreaks`; skipped on lost-rough worlds).
  - OB = stroke-and-distance off the play-bounds box (which doubles as the OB trigger — don't
    shrink it casually).
  - All new generator draws gate on their feature being armed (contract 1); current
    `GENERATOR_VERSION` 14.
- **RPG meta-loop** — `docs/decisions/rpg-meta-loop.md`
  - The spine: `startRun → [playStop → buy* → travel]*` until the survival rule fails; pure and
    deterministic. The **Voyage** is the winnable campaign (3 arcs, boss each, `endedReason 'won'`);
    the **Unending Universe** is the ONLY endless format (`flat`/`ladder` retired — `getFormat`
    folds their ids).
  - Endless survival is a per-hole par-relative bar (`endless.ts`), threaded IDENTICALLY through
    `playStop` and the interactive `holeComplete` (contract 2). Presentation is a running golf
    round (gross/to-par/NET via a club-set handicap); the starting CLUB SET is the mode's
    difficulty axis; finished runs bank into the persisted `endlessRuns` leaderboard.
  - WARP fast-forwards only PROVEN holes under the hidden automatic-birdie rule: `canWarpStop`
    requires a contiguous warp prefix fitting under `endlessBestHoles` — new ground is always
    hand-played; a warped stop banks NO milestone shards and never grants the ace ship; leaderboard
    rows carry their honest hole range.
  - FUEL: every jump burns `distanceJump` off `Run.fuel`; ONE rule lives in `travel` (auto ≡
    interactive by construction) — a short tank buys the shortfall at the LOCAL depth-scaled price,
    printed on the Jump button, never silently. Unaffordable lane ⇒ locked; all locked ⇒ run ends
    `'stranded'`. Fuel is drawn ONLY via `render/fuel.ts fuelGaugeHTML`, never a bare number.
    Ship outfitting (thrusters/reserve tank/eagle siphon) rides perk ids — the Reserve Tank's
    fuel pours ONCE in `buy`, never in `apply` (resume would double-grant).
  - Milestone cosmetics are EARN-ONLY (`unlockHoles` rows; `canBuy*` refuses); a hole-in-one is the
    only way to earn the secret Comet Rider ship (`aceUpdates` on ANY ace, not a first-ace flag).
  - Pro Shop rarity is VOYAGE-paced (`voyageRarityBias` keyed off the STOP; endless keeps
    `rarityDepthBias`) — it reweights WHICH item is drawn, never the rng COUNT. Every shop item is
    a one-shot; the `stackable` plumbing stays dormant for save back-compat.
  - Two currencies: per-run **credits** (shop perks), cross-run **Star Shards** (cosmetics + bag
    tiers). Cosmetics split BUY (Trade Market, global ownership) vs EQUIP (Clubhouse, per
    character); every unlock-gated item is HIDDEN until unlockable — ONE reveal predicate per
    catalogue drives the filter. `CosmeticRarity` (mythic tier) stays OUT of the sim's loot `Rarity`.
  - The Clubhouse (hall lounge + per-golfer stage + spaceport) is purely cosmetic, seeded via `Rng`
    keyed off `clubhouseVisit` — zero sim/rng-stream impact. Mount figures/ships in TIGHT frames
    (golfer 72×210, ship 96×62); re-shoot `scripts/clubhouse-preview.mjs` after touching
    `apparelArt.ts`/`clubhouseLounge.ts`.
  - Won Ascension gates unlock permanent bag TIERS (`applyBagTier`, baked at `startRun`/`resumeRun`;
    a Pro-Shop floor; no-op at `'common'`). A per-character Ascension clear unlocks one random club
    (`unlockedClubsByCharacter` stores TYPES, re-stamped by `applyBagTier`). `ASCENSION_MAX = 15`.
  - The reducer's exported `runEndUpdates` is the SINGLE source for all run-end sites.
  - Route choice carries destination biome + an event that is economy/cut/meta only — **NEVER
    generation rng**. Every non-none course effect carries a REAL play hook, machine-checked
    (`tests/journey-effects.test.ts`): wind/carry multipliers are pure post-gen scales; geometric
    hooks (tents, scorch craters, ground patches) are pure seeded per-kind streams drawn + played
    from the SAME source. The route card states every hook. A new course effect = a
    `COURSE_EFFECTS` row + a `routeEffect` mapping + a `weather.ts` showpiece on its OWN stream.
  - Trade tents ring EVERY hole of a tradeMarket stop; effects are dealt per hole so colour never
    predicts. Only the marmot changes the shot (deterministic lost ball in `executeShot`, auto ≡
    interactive); the other four are interactive-only reducer meta.
  - A `salvage` lane loots a CLUB (private stream, rarity floored at rare, resume-safe as a shop
    perk id, only ever raises Stableford). Route events carry no `shardBonus` — shards are run-END
    rewards; `run.bonusShards` moves only via endless milestones.
  - The three route lanes land DISTINCT archetypes, never the current one (filtered redraw, not a
    retry loop). A fresh run opens RANDOM + non-hard (stop 0 skips `HARD_ARCHETYPES`; same single
    draw off a filtered pool). Characters/talents/ace rewards ride `loadout.perks` ids, rebuilt on
    resume (no save bump).
  - Bosses play on a separate `:boss` rng and SCALE with Ascension via `bossEdgeForRun` (the ONE
    source for headless AND reducer); A0 + a common bag is the classic boss, byte-for-byte. The
    auto-AI pin-hunts via `PlayHoleOptions.attackPin` (default off = byte-identical), armed for
    endless bogey-or-tighter bars and high-Ascension bosses; `playHole` takes `puttSkill` so putter
    perks reach the headless putt-out.
- **Competition & leaderboards** — `docs/decisions/competition.md`
  - The field is a deterministic STATISTICAL ghost (`ghostHoleStableford`), not N real ball-sims.
  - Voyage survival is your POSITION in one persistent field thinning to the final two;
    `competition.ts` is the single source for the drawn board AND real survival. Only the FINAL
    ordinary stop cuts to 2; every earlier target floors at 4.
  - `league.ts` imports `run.ts`, never the reverse; the matchplay boss-id resolves in the UI reducer.
- **Caddies** — `docs/decisions/caddies.md`
  - One named caddy at a time; the first hire blocks the rest. Each folds ONE loadout field.
    THE RULE (machine-checked): every `NAMED_CADDY_IDS` entry surfaces a `caddyEffects` row.
  - Guard redirects + chip-ins add rng ONLY when armed + qualifying. A guard's `side` is a FAIRWAY
    side classified off the hole's `centreline` (`ShotInput.fairwaySide`), NOT the shot bearing.
  - The renderer draws the guard figure ONCE (the corner figure) — never also float the portrait badge.
- **Putting** — `docs/decisions/putting.md`
  - Manual pace-meter by default; AUTO only via the Penelope Putter caddy. `takePutt(…, control?)`:
    control → manual, none → `onePutt` (auto/tests, byte-for-byte). Fringe-putt is interactive-only.
  - The make band SHRINKS with distance past the putter's `puttRange` (floored; =1 within range);
    the on-screen band draws the SAME shrunk window. Only the PACE window is distance-scaled;
    auto `onePutt` is untouched.
  - The break line STOPS DEAD at the confident read (terminus dot, nothing beyond) — read range is
    a visible gear axis (`puttSkillOf`, cap 1.0).
  - Greens layer 1–2 contour LOBES (`Hole.greenContour`, own side rng stream) over the plane;
    `greenSlopeAt` is the ONE local field the resolver, preview line, read, AND arrow field sample.
    The field math is the surface-agnostic `sim/contour.ts`; `rollOut` samples it per step and
    CURLS along it (`roll` is ARC length; straight-roll invariance holds only on lobe-less holes).
    A manual putt's `PuttLog.path` carries its true curved travel; auto stays pathless.
  - Harder stops tilt greens more (slope-magnitude floor rises with wildness, drawn from the SIDE
    slope rng — calm stops keep the old draw).
  - Putt-FEEL: fall-line arrows are PX-CAPPED in `styleGreen`; the putt watch-cam reuses the putt
    screen's exact framing padded for break bow (aim-INDEPENDENT); ◄/► aim is per-putt scaled with
    hold auto-repeat, and nudges update SURGICALLY (`puttAimRefresh` — a full `render()` resets the
    pace meter mid-aim).
- **Render layer** — `docs/decisions/render.md`
  - ONE pure projector (`render/project.ts`) both renderers share. ONE shared scene builder
    (`render/style.ts buildScene` → `Prim[]`); SVG = static map, Canvas2D = animated play view.
  - All scene randomness is mulberry32 seeded from `hashHole()` on documented streams — adding a
    draw must not perturb existing stream order. SVG clip/gradient ids are per-hole
    (`holeIdPrefix`) — document-global ids cross-clip co-mounted SVGs.
  - The scene is CAMERA-PROOF (the follow-cam rebuilds per frame): rng draw counts never read the
    projection; `posHash` keys are course-space, never screen px; `archetypeDecor` pushes its prims
    UNCONDITIONALLY. `tests/camera-stability.test.ts` guards.
  - Rough is ROUGH; space starts at the OB frame: the land hull fills `playBounds`+apron with the
    world's rough palette; every archetype's `rough.base` sits ≥30/255 brightness above its space
    tone (machine-checked). The rough is the biome's ground COVERING (`GROUND_COVER` table — every
    archetype has a row EXCEPT void/cetus, machine-checked). Easter-egg props (`EGGS`) hide in the
    rough on their own stream, off-corridor, camera-proof; void/cetus excluded.
  - Platforms + hazard families merge through `render/merge.ts`: platforms are
    `dilateUnion(…, 14)` (never a mitred `offsetPoly` outset — it folds at concave bends);
    sand/liquid families draw union-merged bodies (course-space, WeakMap-cached).
  - Carved features share ONE light (`LIGHT_UL` → `insetEmboss`/`embossChildren`). NO drop shadow
    onto turf (reads as floating); the depression is a THIN lip capped by body radius; the green is
    FLUSH with the fairway. Hazards get a soft grassy margin blended toward the hazard (never
    darker than turf); internals deepen through smooth feathered ramps, not hard bands. The fairway
    takes a first-cut `collar` + sheen on parkland worlds only (void/cetus pass NO collar). All
    pure geometry, zero rng.
  - Turf bases still emit `#3f8c3f`/`#5fd45a` (the holeView fill test).
  - The aim-cone overlay is SCALE-HONEST: every layout decision reads the projector's px-per-yard;
    blocked-zone shading probes the sim's OWN flight walks — never fork them, never hard-code px
    into the sim. A line is shaded BINARY (clear, or blocked from the object to the cone's far
    edge). The blocked-zone glyph is keyed to the WORLD archetype (`TREE_GLYPH` mirrors
    `styleFlora`); tents stay ⛺.
  - Per-world identity is table+dispatch, never a fork: flora, OB markers, signature decor, ambient
    air, wind tint are ALL archetype-keyed (`tests/biome-identity.test.ts` guards full coverage); a
    flora variant must consume EXACTLY the classic two rng draws (extra variation via `posHash`).
  - The weather layer's pinned starfield masks off `landPolysCourseFor`; meteor strikes re-burn
    EXISTING scorch marks fed by the play view's LIVE projector (never the aim overlay's).
  - The decision map's framing holds still for the whole shot decision; the shot animation starts
    at the decision map's exact `decisionRadius`. `playView`'s `spawnLandFX` answers the touchdown
    per lie/penalty — extend it with any new penalty kind.
  - Re-shoot the gallery (`node scripts/gallery.mjs`) after any `style.ts` change.
- **Audio** — `docs/decisions/audio.md`
  - ASSETLESS, always: every cue + music note is synthesized WebAudio — no downloaded audio file,
    ever. ONE shared `AudioContext`, two buses: SFX on `sound`, generative music on `music`.
  - Strikes are voiced per club FAMILY (`strikeClassOf` — beware `PW/GW/SW` end in 'W' but are
    wedges); touchdowns per SURFACE + tree hits per ARCHETYPE (coverage machine-checked). A hazard
    with its OWN surface voice does NOT also play `sfx.penalty` (that stays for SURFACELESS
    penalties). A safe-landing-then-abyss-roll fires its lost FX at REST, not on the landing.
  - Music is table+dispatch per archetype (`MUSIC_TRACKS` + `'menu'`; coverage + gain ≤0.35
    machine-checked) on a PRIVATE seeded stream. The sim never calls audio; audio modules must
    import clean in node.
- **UI layer** — `docs/decisions/ui-intro.md`
  - The screen flow is a PURE reducer (`ui/game.ts`): `(UiState, Action) → UiState`, no DOM/time,
    fully unit-tested. `app.ts`/`main.ts` render state + dispatch; save persistence + canvas mounts
    + the intro cinematic are side-effects there, never in the reducer.
  - Visual theme is the design-token CSS in `index.html`, not the SVG layer. The play screen is
    full-bleed and never scrolls; pull-to-power is the only shot input.
  - The settings cog rides EVERY screen (appended once in `render()`); "Return to title" is
    NON-destructive (an underway run parks as `resumable`). `persist()` snapshots the live run only
    when one is underway, else passes `state.resumable` through — NEVER snapshot the title's
    character-less placeholder run (it wipes saves).
  - Character select fits ONE screen in every mode; Ascension is picked WITH the golfer
    (`[data-asc]` view state, reducer-clamped), never on the title.
  - The stop intro is TWO mobile steps on one reducer screen (`'intro'` + view state `introStage`);
    `introShared()` derives world/notes/objective ONCE so the steps never drift. The Unending
    Universe past stop 0 opens on `'hole'`.
  - The post-stop recap (`resultScreen`) is a pure render off `state` — rarity-framed panel, stat
    tiles, clickable hole-by-hole strip.
  - The title is a hero wordmark + two GAME tiles reusing the doorway component
    (`.gs-navtile--game`; whole tile = the button, distinct only via the `--mc` accent — never
    regrow badges/launch bars/progress text). The Daily button is parked off the title for now.
  - **`app.ts` is a 4,400-line god-file — the likeliest source of regressions; prefer extracting a
    module over growing it, and re-read the relevant span before editing.**
- **Intro cinematic** — `docs/decisions/ui-intro.md`. Cosmetic Canvas2D, not in the reducer;
  degrades safely (every frame in try/catch → `finish()`); the many-instance glow uses a cached
  sprite, never per-element `shadowBlur`. The real title boots first, the intro overlays it.

## Testing & the test/demo hub
- `tests/` (vitest) imports the pure `src/sim/` modules and asserts on seeded runs. CI
  (`.github/workflows/tests.yml`) runs the suite on every push/PR. **Keep new game logic in
  `src/sim/` (pure)** so it's reachable from tests.
- **Test & demo hub** (`test.html` / `src/test/`, full story in `docs/decisions/process-and-deploy.md`).
  Re-implements ZERO game logic — it pokes the built artifact (Demo iframe) + imports the pure sim
  (Sim Lab). **Most changes need no hub edit** — content rows + sim behaviour are absorbed
  automatically. The ONE thing that needs hand-wiring is a brand-new **hook** (a `window._gsX` flag
  or a `?param`): `tests/test-hub.test.ts` auto-discovers every hook and asserts the hub drives
  exactly that set — add a flag without a hub control and CI goes red. When you add a hook, do it in
  one atomic PR (add hook → add hub control → confirm guard green → update docs); the
  `keep-test-hub-in-sync` skill walks it.

## Change, versioning & deploy
- `main` is branch-protected. Each change: branch → edit → commit → push → PR → merge → sync.
- **Default to shipping all the way.** When a change is complete and tests are green, take it to done:
  open the PR, enable auto-merge (`enable_pr_auto_merge` — GitHub lands it when the required `test`
  check passes and deletes the branch), then sync `main`. Only stop short if the work is WIP, the
  user says not to, or CI is red/unresolved. If CI is already green with no pending required check,
  `merge_pull_request` directly.
- Repo settings auto-merge depends on are admin-UI only: *Allow auto-merge*, *Auto-delete head
  branches*, and a branch-protection rule on `main` **requiring the `test` check**. Set once by hand.
- Commit messages explain the *why*; end with the `Co-Authored-By: Claude` trailer.
- **Deploy = GitHub Pages, Source MUST be "GitHub Actions"** (not "Deploy from a branch"). `pages.yml`
  builds the Vite app and serves `dist/` (a single inlined `index.html`). If Source is a branch,
  Pages serves the RAW source whose dev entry `/src/main.ts` 404s → permanent blank page. Symptom
  signature: the boot watchdog reports `…/src/main.ts` — a string a Vite *build* can never emit, so
  seeing it = raw source is being served. Keep the `index.html` boot watchdog (`tests/build.test.ts`
  guards the inlined-single-file output + the error-capture contract).
- **PWA service worker is NETWORK-FIRST, never cache-first** (`public/sw.js`), subpath-scoped to
  `/golf-stars/` — offline play without resurrecting the stale-serve blank-page bug; a fresh deploy
  always wins online. Bump `VERSION` per deploy. The foreign-SW/cache cleanup in `index.html` is
  narrowed to kill only NON-`golf-stars-*` workers/caches so golf-finder coexistence holds. Full
  rationale: `docs/decisions/process-and-deploy.md`.

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
the NETWORK-first, subpath-scoped PWA SW above — the inverse of golf-finder's cache-first offline SW,
not a re-coupling of the two apps.)

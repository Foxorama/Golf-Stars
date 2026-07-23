# Archived engineering log — lore / story beats

> The deep "why" behind the lore system (GS-lore). The everyday constraints live in the root
> CLAUDE.md; read here for the rationale, the shape, and how to add the next beat. Grep a GS-tag to
> jump to its decision.

## GS-lore — one-off story beats, data-driven

### The player ask
"Start adding lore/flavour: a story popup when a certain event happens. Different lore needs different
events — a world, the current caddy, faction rep, or other things. The FIRST: visiting the Derelict
Ship in ANY game mode with **Driver Dan** as your caddy pops a screen of Dan talking (nice banner, a
good picture of Dan). It triggers ONCE and must gate future Dan beats — so we need a good way to track
what events trigger when and how, so future lore slots in cleanly."

### The shape (a table, not a fork)
The system is content-as-data, exactly like clubs/biomes/caddies — **a new beat is a new ROW, not an
engine edit.**

- **`src/sim/rpg/lore.ts`** (pure sim) — the single source:
  - `LoreEvent` = `{ id, once?, trigger(ctx), speaker, portrait, kicker?, title, lines[], cta?, accent? }`.
    Presentation is DATA (`title`/`kicker`/`lines`/`portrait`); the reducer only decides WHEN via the
    pure `trigger`.
  - `LoreLine` = `{ kind: 'say' | 'action', text }` — `say` is dialogue (a bubble), `action` is a stage
    direction (a gesture/sigh, rendered dim + italic, NOT literal `< >` text).
  - `LoreContext` = a pure snapshot of the arrival: `biome`, `archetype`, `caddyId`, `characterId`,
    `format`, `stopIndex`, `reputation`. Deliberately broad so future beats can gate on more than the
    world (a caddy, a golfer, depth, faction standing). Extend it as new inputs are needed.
  - `pickLoreEvent(ctx, seen)` returns the FIRST unseen (`once`) beat whose `trigger` fires — table
    order is priority. `loreEventById(id)` resolves a beat's presentation. `SeenLore = Record<string,
    true>` is the persisted "already shown" set (a JSON-friendly Set — the house `*ByCharacter` style).
  - The first row: **`driver-dan-derelict`** — `trigger: c => c.archetype === 'derelict' && c.caddyId
    === 'driver-dan'`. The keystone of a planned Driver Dan arc; later beats can gate on
    `seenLore['driver-dan-derelict']`.

### Once-only tracking (persisted, cross-run, cross-mode)
- Save **v28** adds `seenLore: SeenLore` (`save/schema.ts` — versioned type, `v27ToV28` seeds `{}`,
  `defaultSave` + defensive backfill, mapped in BOTH `app/persist.ts` `metaFromSave`/`persist`). Purely
  additive; every existing seeded run is byte-identical.
- Threaded through `UiState.seenLore` (persisted) + `initState`/`restart` + `MetaProgress`. A beat is
  recorded on DISMISS (`dismissLore`), so `persist` writes it and it never fires again — across every
  run and every mode.

### The trigger gate (mode-agnostic)
- `withLoreGate(next)` in `ui/gameUpdates.ts` — the generic hook, the sibling of `withAsgardPortal`. It
  wraps every "→ intro" (arrival) reducer return: `route` (Voyage/Unending travel), `pickStarTourCourse`
  (Star Tour), `selectCharacter` (stop 0), `resume`. If `next.screen === 'intro'` and an unseen event's
  `trigger` fires, it diverts to `screen: 'lore'` with `pendingLoreId`. A no-op on any non-intro return
  and whenever no beat qualifies (the common path).
- Derelict is detected via `course.biome === 'derelict-ship'` (`archetypeFor(...) === 'derelict'`),
  caddy via `namedCaddyOwned(perks)` — so the SAME gate covers Voyage, Unending, and Star Tour with no
  per-mode code. No run snapshot needed (unlike Asgard): the diverted-from state already pinned
  `run`/`course`, so `dismissLore` just returns to `screen: 'intro'` and the intro renders as it would
  have (the intro-entry side-effect fires on the lore→intro transition, resetting `introView`).

### The screen (cinematic, one-screen, impactful)
- `app/loreScreens.ts` `loreScreen()` — a pure HTML-string builder reading `state.pendingLoreId` →
  `loreEventById`. The cinematic CARD itself is the exported `loreBeatHTML(view, resolve, dismiss)` (GS-story-
  midround-omen extracted it), so any DYNAMIC beat that isn't a static `LORE_EVENTS` row — e.g. the mid-round
  betrayal omen (`app/storyMidroundScreens.ts`, dismiss → `storyMidBeatContinue`) — reuses the identical
  `.gs-lore*` chrome instead of forking a second prefix. Full-bleed (`'lore'` added to the `fullBleed` set in
  `app.ts`, so it owns the whole
  viewport with its own starfield backdrop tinted by the beat's `accent`; the modal drops the settings
  cog like the play view). A banner (kicker + title + speaker), the portrait, dialogue (bubbles + dim
  italic stage directions), and one CTA → `dismissLore`. Defensive fallback (a bare Continue) if the id
  doesn't resolve, so a stale `pendingLoreId` can never blank the screen.
- **Portrait**: `render/loreArt.ts` `lorePortraitSVG(id)` → `driverDanPortraitSVG()` — a bespoke
  close-up bust in the house vector language, reusing Dan's on-course palette (orange shirt `#e0883a`,
  cap `#c4882a`, skin `#d8a878`) so he's unmistakably the same man, but weathered + wistful with the
  head of his slung driver cresting his shoulder. A new beat's picture is a new case here.
- **CSS**: `.gs-lore*` in `index.html` — its OWN prefix (NEVER the play HUD's `.gs-hud`, per the
  global-CSS collision rule). Responsive: portrait beside the dialogue on wide screens, stacked on
  phones; reduced-motion drops the entrance animation.

### Contracts held
- **UI/render only — ZERO sim rng.** The lore table + gate + screen never touch the generator, the shot
  resolver, or any seeded stream. Every determinism/`auto ≡ interactive`/death-spiral test is
  byte-identical (the full suite passed unchanged bar the hardcoded `SAVE_VERSION` pins, bumped 27→28).
- **No new hook.** No `window._gs*` flag, no new `?param` — only a new VALUE on the existing `?screen=`
  deep-link (`?screen=lore` mounts the beat for the browser layout smoke test), so the
  `keep-test-hub-in-sync` guard is untouched (no test-hub wiring).

### Guards
- `tests/lore.test.ts` — the pure table (`pickLoreEvent` fires only for derelict + Driver Dan when
  unseen; never after seen / other world / other caddy; is pure), the portrait, and the reducer flow
  (a derelict arrival with Dan diverts to `lore`; `dismissLore` marks seen + continues to intro; it
  never re-fires; no misfire on other worlds or without Dan; the gate is a no-op off the intro).
- `tests/build.test.ts` — a headless-Chromium `?screen=lore` layout smoke test (mounts `.gs-lore` +
  "The Old Girl", no crash, not bounced to title).
- `tests/save.test.ts` — the v27→v28 migration seeds an empty `seenLore` and preserves everything.

### Adding the next beat (the recipe)
1. Add a `LoreEvent` ROW to `LORE_EVENTS` in `src/sim/rpg/lore.ts` — a `trigger(ctx)` + the words. If
   it needs an input the context lacks (e.g. a specific faction rep), add a field to `LoreContext` and
   populate it in `withLoreGate`.
2. If it's a new speaker, add a portrait case to `render/loreArt.ts` `lorePortraitSVG` (and a builder).
3. That's it — the gate, the once-only tracking, the screen, and persistence are all generic. If a
   beat should fire somewhere OTHER than a stop arrival, wrap that return with `withLoreGate` too (or a
   sibling gate) rather than special-casing it.

## GS-lore-rewards / GS-lore-parrot-firebird — a beat that pays out

### The player ask
"A second beat: visiting the Derelict Ship with the **Prognostic Parrot** as your caddy pops a screen
of the parrot talking (his backstory — the wreck was his dead spirit-brother's long-haul ship, and his
own great guilt). Triggers once. It ALSO fires two special effects: for this hole the parrot's foresight
runs at 100%, and it unlocks a mythic ship, **The Firebird** (the black Trans-Am with the golden phoenix
from *Smokey and the Bandit*)."

### The shape — rewards are DATA on the row, not a fork
A lore beat can now grant a one-off payout, kept in the same content-as-data spirit:

- **`LoreEvent.effects?: LoreEffects`** (`sim/rpg/lore.ts`) — `{ unlockShip?, parrotForesight? }`. Applied
  ONCE by the reducer's `dismissLore` (the beat is `once`, recorded in `seenLore`), so it stays
  **UI/render-only — zero sim rng**, determinism + `auto ≡ interactive` untouched. Absent ⇒ a pure
  dialogue beat, byte-for-byte the original. A new kind of reward is a new field here + one branch in
  `dismissLore`, never an engine edit.
  - `unlockShip` — a cosmetic ship id added to `ownedShips` if not already owned (the ace-ship pattern).
  - `parrotForesight` — arms the Prognostic Parrot's foresight at 100% for the ARRIVED stop.

### The beat
`prognostic-parrot-derelict` — `trigger: c => c.archetype === 'derelict' && c.caddyId ===
'prognostic-parrot'`, `effects: { unlockShip: 'firebird', parrotForesight: true }`. A caddy is
one-at-a-time, so it can never collide with `driver-dan-derelict`. Portrait: `prognostic-parrot` →
`prognosticParrotPortraitSVG()` (the green pirate captain from `caddyArt.ts`, weathered, one steel eye).

### The Firebird (the ship reward)
`ships.ts` `FIREBIRD_SHIP_ID = 'firebird'` — a `secret`, `cost:0` MYTHIC grail (hidden from the Trade
Market until owned, never buyable), a `look.kind:'firebird'` drawn in `render/shipArt.ts` as a jet-black
muscle-car cruiser with a golden phoenix ablaze across the hood + gold-rimmed tyres + twin flame exhaust.
It rides the standard secret-ship plumbing (`shipRevealedInMarket`, per-character equip). Placed AFTER
the Mothership in `SHIPS` so the ships tests' "first mythic = Mothership" assertion is undisturbed. It
also gets a HUD bridge (`hudTheme.ts`): a hero-ship override reusing the `racer` variant recoloured
black/gold (no new CSS/chrome).

### The 100% foresight boon (the only sim-facing part)
The parrot's normal proc is `run.loadout.previewScramble` (0.33). The boon bumps it to a certain 1.0 for
the haunted stop, via **one pure source** so both drivers agree (contract 2):
- `run.parrotForesightStop?: number` (snapshotted in `runSerialise.ts` for a mid-stop resume) — set to
  `run.stopIndex` by `dismissLore` when `effects.parrotForesight` fires.
- `foresightChance(run)` (`run.ts`) = `1` when `previewScramble` is set AND `parrotForesightStop ===
  stopIndex`, else `previewScramble` verbatim. The `&& base` guard means a bag WITHOUT the parrot is
  never boosted — so **feature-off is byte-for-byte** (contract 1) — and it **self-expires** the moment
  you travel (the stopIndex advances and no longer matches). Read by the headless `playerHoleOpts` and
  the interactive shot / auto-finish procs, so a foreseen swing is identical either way. The proc is one
  `rng.bool(chance)` drawn before the shot in both paths; a 100% chance changes the boolean, not the draw
  position, and best-of-two only ever RAISES Stableford (contract 4).

## GS-story-beats — Story-Tour campaign dialogue (reusing the lore machinery)
The Story-Tour campaign's NPC scenes are ordinary lore beats — the whole point of GS-lore being
DATA-driven is that a new story arc costs zero engine. Three additions:
- **`LoreContext` story fields** — `storyRound?` (this arrival is a Story-Tour round), `storyChapter?`
  (1..5), `storyAlignment?` (`'warden'`/`'herald'`). Populated by `withLoreGate` (`gameUpdates.ts`) from
  `run.storyRound` + the live `StoryState` (`next.story.chapter`/`.alignment`). Every story beat gates on
  `storyRound === true`, so they NEVER fire in Voyage/Unending (an ordinary arrival leaves the fields
  unset).
- **Five escalation beats** (in `LORE_EVENTS`): `story-coil-named` (Ch.2, the Parrot names the Coil),
  `story-coilkeepers` (Ch.3, cultists ring the tee), `story-apostate` (Ch.3, AFTER the Coilkeepers beat —
  Malachai "Sable" Voss, the fallen champion before you, holes an impossible shot and hands you the Coil's
  argument; GS-story-apostate, the device that makes The Choice land), and Venoma's Ch.4+ confrontation
  branching on the path — `story-venoma-warden` vs `story-venoma-herald`. Because story rounds arrive
  through the gate, a qualifying arrival diverts to the `'lore'` screen first, then `dismissLore` continues
  to the intro. (Voss is also the Ch.3 Storm Championship rival + the speaker who makes The Offer on the
  `storyChoice` screen — all story rivals share the default ghost profile, so the rival swap is name-only.)
- **Three portraits** in `render/loreArt.ts`: `venoma` (viper-woman — amber slit-pupil eyes, fangs, a
  Coil-sigil hood, a hissing snake at the collar), `coilkeeper` (a faceless hooded cultist, an acid-green
  void where a face should be, the serpent sigil burning on the chest), and `voss` (the Apostate — a
  HUMAN face for the tragedy: gaunt, half-grey, a thin certain smile, an acid-green serpent-shine behind
  hollow eyes, a coat of shed scale, and his motif the BLACK DRIVER THAT DRIPS at the shoulder — the dark
  mirror of Driver Dan's honest slung driver). House SVG language, Coil palette (venom-violet `#b060c0` /
  acid-green `#7fe0a0`).
The one-off is recorded in the main-save `seenLore` like every other beat (no new save field). Pure DATA
+ render — zero sim rng, no `_gs*`/URL hook. Full campaign story: `docs/decisions/story-mode.md`.

### Guards
- `tests/lore.test.ts` — the parrot beat's trigger (fires only for derelict + parrot, once), its
  `effects`, the portrait, and the reducer flow (dismiss grants the Firebird + arms foresight; the boon
  expires next stop; a parrot-less bag is never boosted). Also the four story beats' triggers (chapter/
  alignment gating, never off a story round, once) + the `venoma`/`coilkeeper` portrait coverage.
- `tests/story-flow.test.ts` — the story-round dialogue gate (a Ch.2 round diverts to the Coil beat then
  dismisses to the intro; Venoma branches on the path from Ch.4; a Ch.1 round tees off with no beat).
- `tests/ships.test.ts` — the secret Firebird (mythic, free, hidden-until-owned, NOT the first mythic)
  + it renders a self-contained glyph.

### Adding the NEXT paying beat (the recipe)
Same as a plain beat, plus: set `effects` on the row. If it needs a NEW reward kind, add a field to
`LoreEffects` and one branch in `dismissLore` (keep it side-effect-only — no rng). A ship reward is just
a `SHIPS` row (secret, `cost:0`) named in `effects.unlockShip`.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

- **Lore / story beats** — `docs/decisions/lore.md`
  - Lore is CONTENT-AS-DATA (GS-lore, `sim/rpg/lore.ts`): a beat is a `LoreEvent` ROW — a pure
    `trigger(ctx: LoreContext)` predicate + the presentation (`title`/`kicker`/`lines`/`portrait`).
    `pickLoreEvent(ctx, seen)` returns the first UNSEEN (`once`) beat whose trigger fires; a new beat is
    a NEW ROW, never an engine edit. `LoreLine.kind` = `say` (a dialogue bubble) vs `action` (a stage
    direction, dim italic). `LoreContext` (biome/archetype/caddyId/characterId/format/stopIndex/
    reputation) is deliberately broad — extend it for a beat that gates on more, and populate it in the
    gate. First row: `driver-dan-derelict` (`archetype === 'derelict' && caddyId === 'driver-dan'`).
  - A beat can PAY OUT, not just speak (GS-lore-rewards): the optional `LoreEvent.effects` is applied
    ONCE by `dismissLore` (still UI-only, zero sim rng) — `unlockShip` adds a secret ship to `ownedShips`
    (the ace-ship pattern), `parrotForesight` arms the Prognostic Parrot's foresight at 100% for the
    ARRIVED stop only. A new reward kind = a new `LoreEffects` field + one `dismissLore` branch. Second
    row: `prognostic-parrot-derelict` (GS-lore-parrot-firebird — `derelict && caddyId ===
    'prognostic-parrot'`): the parrot mourns his dead spirit-brother's wreck; dismiss grants the secret
    MYTHIC **Firebird** ship (`ships.ts` `FIREBIRD_SHIP_ID`, a black Trans-Am cruiser with a golden
    phoenix, `look.kind:'firebird'`) and 100% foresight here. The boon rides `run.parrotForesightStop`
    (snapshotted; `foresightChance(run)` = 1 when it equals the live `stopIndex`, else the loadout chance
    — so feature-off is byte-for-byte and it self-expires on travel), read by BOTH the headless
    `playerHoleOpts` and the interactive proc (auto ≡ interactive). A caddy is one-at-a-time, so the two
    derelict beats never collide.
  - One-off tracking is PERSISTED (`SeenLore = Record<string,true>`, save **v28** `seenLore`, mapped in
    BOTH `persist.ts` mappers): a beat fires exactly ONCE ever, across every run + mode, recorded on
    DISMISS. Save bump is purely additive (existing seeded runs byte-identical).
  - The gate `withLoreGate(next)` (`ui/gameUpdates.ts`, the `withAsgardPortal` sibling) wraps every
    "→ intro" arrival return (`route`/`pickStarTourCourse`/`selectCharacter`/`resume`); an unseen
    triggering beat diverts to the `'lore'` SCREEN (`pendingLoreId`), `dismissLore` marks it seen + lands
    on the intro. MODE-AGNOSTIC: derelict via `course.biome === 'derelict-ship'`, caddy via
    `namedCaddyOwned(perks)` — one gate covers Voyage/Unending/Star Tour, no run snapshot needed.
  - The screen (`app/loreScreens.ts`, full-bleed cinematic) paints a banner + a bespoke close-up
    portrait (`render/loreArt.ts lorePortraitSVG`, Dan's on-course palette) + the dialogue. CSS is
    `.gs-lore*` (its OWN prefix, NEVER the play HUD's `.gs-hud`). UI/RENDER ONLY — zero sim rng
    (determinism/auto≡interactive untouched); no `_gs*`/`?param` hook (only a new `?screen=lore`
    deep-link VALUE for the layout smoke test), so no test-hub wiring. Guards: `tests/lore.test.ts`
    (pure table + reducer flow) + `tests/build.test.ts` (`?screen=lore` smoke) + `tests/save.test.ts`
    (v27→v28). A new speaker = a `lorePortraitSVG` case; a new beat = a `LORE_EVENTS` row.

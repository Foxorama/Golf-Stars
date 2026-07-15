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
  `loreEventById`. Full-bleed (`'lore'` added to the `fullBleed` set in `app.ts`, so it owns the whole
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

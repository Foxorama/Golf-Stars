# GS-asgard — the Golden Realm interlude

The constitution bullets (CLAUDE.md, RPG meta-loop + the biome index) are the rules; this is the why,
the failure modes, and the shape of the three layers that make up the Asgard feature. Three PRs' worth
of work shipped as one branch, each layer test-green on its own:

1. **The biome** — a brand-new `asgard` archetype / `asgard-realm` biome.
2. **The cosmetic** — a net-new `driver` apparel slot + Thor's Hammer.
3. **The interlude** — the access trigger, the tournament, and the suspend/resume.

---

## 1. Asgard as a biome (phase 1)

Asgard is the eleventh archetype, but it is deliberately unlike the other ten: a **grand, FAIR reward
world**, the opposite of the brutal late-game worlds. Wide gilded-emerald fairways, a gentle divine
tailwind (`carryMult 1.08`), calm blessed air, moderate golden groves, grand true greens. It reuses only
existing lie kinds (celestial pools are ordinary `water`; the gilded tangle is `deeprough`) — no new
penalty surface, no lost-rough, no forced carry.

- **Weight 0 in `BIOMES`.** Asgard is reached ONLY via the tournament trigger, never a normal biome/route
  roll. Weight 0 makes `pickBiome` skip it, and it's inserted *before* `cetus-deep` so the last-row
  `pickBiome(0.999) === cetus-deep` invariant holds. There is no `CONSTELLATIONS`/`FEATURES` theme for
  it and no champion, so it never enters route selection or the leaderboard field.
- **Not balance-exempt.** It's fair by construction, so it passes the death-spiral harness (it only
  lowers the pooled mean); adding it to `BALANCE_EXEMPT_BIOMES` would have been a lie about its character.
- **Full art coverage** across every compile- and runtime-checked table (the `Object.keys(ARCHETYPE_TURF)`
  loops in `biome-identity`/`audio` force this): gilded turf + royal-twilight-with-gold space, rune-pillar
  OB, a golden `chime` tree voice, the "Halls of Asgard" hymn, golden-ash flora, and a signature decor
  pass (the Bifröst arc, a Valhalla longhouse, the Yggdrasil world-tree, floating rune-stones) — all
  camera-proof (fixed sky loop counts, course-space rejection, `posHash` variety).

## 2. The `driver` cosmetic slot + Thor's Hammer (phase 2)

There was no club-cosmetic slot before — apparel was `hat|shirt|pants|bag`. Thor's Hammer needed a fourth
axis, so `driver` is a net-new `ApparelSlot` threaded through the SAME plumbing as the others (save v22
`driverByCharacter`, the equip reducer, the market rack, the clubhouse wardrobe zone, the per-character
look assembly). Cosmetic-only → zero sim/rng impact, so no contract is touched.

- **`secret` items.** Thor's Hammer is `secret: true` (mirrors `Ship.secret`): `canBuyApparel` refuses it
  and `apparelRevealedInMarket` hides it until owned — the same "one reveal predicate" the Unending
  milestone unlocks use, so the market never spoils the reward.
- **Render.** In the swing, `drawWarhammer` swaps the plain club head for a gilded rune-etched maul with
  phase-gated forked lightning (deterministic off the swing/follow phase — no `Math.random`, assetless),
  taking precedence over the in-run gear tint. It also draws on the wardrobe card, the clubhouse stage,
  and leaning against the fireplace right-jamb (static coords, gated on ownership so it never perturbs the
  seeded lounge).

## 3. The interlude (phase 3)

### Access — the trigger
An **eagle-or-better on Rainbow Road** opens the Bifröst. `asgardPortalOpens(run, played)` fires when the
Rainbow Ball is armed AND a holed hole scored ≥2 under par (a hole-in-one, albatross, or eagle — there
are no par-2s, so an ace is always ≤ −2). It is **reducer-only and gated on the ball**, so it adds no rng
draws and the feature-off path is byte-for-byte unchanged (the same discipline caddy-reputation uses —
a UI/save concern the sim never sees). It fires at STOP END on ordinary (non-boss) survived stops:
instead of the result splash → shop, `withAsgardPortal` diverts to the Himinbjörg map. (Boss stops are
out of scope — a rare rainbow+eagle-on-a-boss combo — to avoid entangling the matchplay early-finish.)

### The tournament — statistical ghosts, not real balls
Nine holes of **stroke play** vs the Warriors Three (Volstagg the bomber, Fandral the maverick, Hogun the
ice-man — three bespoke `contender` golfers in `GOLFERS`, never in the normal field). Following the
competition doctrine (a field is a statistical ghost, not N ball-sims), `warriorsThreeTotals` gives each
opponent a deterministic nine-hole gross from `ghostHoleStrokes` (the stroke-play twin of
`ghostHoleStableford`, on its own `:strokes:` stream). The player plays REAL golf; **lowest total wins,
ties to the player** (a hard-won reward event should reward the shot that earned it). Balance rides purely
on the opponents' archetype skill against an easy Asgard course — no home boost, no handicap math.

### Suspend / resume — the load-bearing decision
There is no run-stack in the engine, only a single `resumable` slot. The interlude needed to pause the
real run, play a self-contained side-run, and come back. The chosen shape:

- **The Asgard run is a real `Run`** (`startAsgardRun`): format `asgard` (a one-stop, nine-hole format),
  the player's perks MINUS `rainbow-ball` (so it plays Asgard's real geometry, not the rainbow ribbon),
  and `pendingTheme` set to the `ASGARD_THEME` **object** directly. That object is deliberately NOT in the
  pickable `THEMES` pool and NOT resolvable by `themeById` — which is fine BECAUSE:
- **The Asgard run is never persisted.** `persist()` parks `state.asgardReturn` (the suspended real run's
  snapshot) whenever the live run is the tournament, so a mid-tournament quit resumes the JOURNEY (the
  attempt forfeited, the Rainbow Ball intact) — and nothing ever needs to reconstruct the synthetic theme
  from an id. This sidesteps the whole "register a fake theme for resume" problem.
- **Return** (`leaveAsgard`): edit the parked snapshot's perks — always drop `rainbow-ball`, on a WIN add
  `talent-odins-favour` — set `rainbowConsumed: true`, `resumeRun`, and land on the travel screen with a
  one-shot banner. `rainbowConsumed` (new on `Run`/`RunSnapshot`, absent = byte-identical) keeps the Pro
  Shop AND the StarMart from ever re-offering the ball this run.

### The rewards
- **Thor's Hammer** (cosmetic) is banked into `ownedApparel` at `resolveAsgard` on a win — modelled on the
  `aceShipUnlock` grant. It's `secret`, so it stays hidden in the market until this moment.
- **Odin's Favour** (`talent-odins-favour`) is the victory PERK: a `talent`-flagged, `archetype: 'asgard'`
  item (so `talentsForArchetype` never offers it at a real boss) — +14 yds distance + 10% tighter
  dispersion. It resolves through `shopItem`→`talentItem`→`loadoutFromPerks`, so it's resume-safe and
  applies to the resumed run's bag. A buff is contract-legal (a power-up must RAISE Stableford to ship).

### Why it's safe against the contracts
- **Determinism (contract 1):** the trigger, the divert, the ghosts, and the reward all live above the sim
  or on dedicated streams, gated on the Rainbow Ball being armed. A run without the ball is byte-identical.
- **auto ≡ interactive (contract 2):** the tournament resolves at BOTH stop-end sites (the watch `play`
  path and the interactive `holeComplete`) through the same `resolveAsgard`.
- The rest (fairness, no-death-spiral, the-graphic-is-the-physics) are untouched: Asgard is a fair biome,
  and the tournament is ordinary golf on it.

## Where it lives
- Biome: `themes.ts` (`ASGARD_THEME`, archetype), `biomes.ts`, `zones.ts`, `render/*` (palette, flora,
  decor, zoneHero, audio, music, weather).
- Cosmetic: `apparel.ts`, `save/schema.ts` (v22), `ui/game.ts` (equip), `app/marketScreens.ts`,
  `app/clubhouseScreens.ts`, `app/helpers.ts`, `render/playView.ts`, `render/apparelArt.ts`,
  `render/clubhouseLounge.ts`.
- Interlude: `formats.ts` (`ASGARD_FORMAT`), `run.ts` (`startAsgardRun`, `rainbowConsumed`, shop filter),
  `golfers.ts` (`WARRIORS_THREE`), `competition.ts` (`ghostHoleStrokes`, `warriorsThreeTotals`),
  `ui/game.ts` (trigger, resolve, `crossBifrost`/`leaveAsgard`), `render/starmap.ts` (`asgardBridgeHTML`),
  `app/asgardScreens.ts`, `app.ts` (render + persist), `app/travelScreens.ts` (banner).
- Tests: `tests/asgard.test.ts` (trigger predicate, `startAsgardRun`, ghost determinism, a full
  interactive nine-hole playthrough, and the win/lose return with all rewards + the shop block).

## Follow-ups / known scope edges
- The portal is ordinary-stop only (boss stops don't open it).
- The Warriors Three difficulty is tuned by feel against the archetype skills; if it proves too easy/hard
  in play, retune `ghostHoleStrokes`' `toPar` coefficients (it's the one lever), not the Asgard course.
- The Himinbjörg map is a dedicated `asgardBridgeHTML`, not a parameterised `journeyMapHTML`, to keep the
  heavily-loaded journey map untouched.

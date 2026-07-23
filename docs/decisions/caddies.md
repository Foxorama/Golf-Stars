# Archived engineering log — caddies

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Caddies (GS-caddy) — named, UNIQUE hires with signature powers
- **Named caddies are a unique class of shop item (`ShopItem.caddy: 'named'`).** You may hire only
  ONE. They are RANDOM, rarity-weighted inclusions in the rotating offer (`shopOffer`) — NOT a
  dedicated row — and because they're epic/legendary they're scarce. The moment you hire ANY named
  caddy, NO named caddy appears in the shop again: `shopOffer` filters `caddy === 'named' && hasCaddy`,
  and `app.ts` also drops the others from the already-fixed offer on the next render. Exclusivity is
  also enforced in `buy()` (a second named caddy is a no-op). Rarity is epic or legendary by ability
  strength: **Penelope Putter** (`auto-caddie`, legendary — auto-putt; id kept for save-compat),
  **Driver Dan** (`driver-dan`, epic — `driverAnywhere`, see the driver bullet), **Dr Chipinski**
  (`dr-chipinski`, epic — `chipInBoost` 0.33), **Space Ducks** (`space-ducks`, legendary — left-side
  guard), **Convict Sheep** (`convict-sheep`, legendary — right-side guard), **Suggestible Sam**
  (`suggestible-sam`, epic — `clubSuggest`, see below). Helpers: `NAMED_CADDY_IDS`,
  `isNamedCaddy`, `namedCaddyOwned(perks)`.
- **Suggestible Sam — club suggestions are a caddy perk (`clubSuggest`) AND a real scoring edge
  (`confidenceMod`).** Two coupled effects, both off hiring Sam:
  - **(1) The EXPLICIT suggestion affordances are Sam's — the smart DEFAULT club is everyone's.** The
    interactive 🎯 Suggested snap-back button and the legend's `suggested: attack X · safe Y` readout
    only appear with Sam. BUT the default-selected club is the green-coverage `suggestPlayerClub` pick
    (longest club that still STOPS on the green) for EVERYONE, not just Sam. Gating the default club too
    was an overcorrection: it handed the base flow the LONGEST usable club, so a non-Sam approach
    defaulted to the driver and flew the green — the exact overshoot `suggestPlayerClub` exists to
    prevent. Sam sells the precise read (the explicit button + readout + yardages) and the confidence
    edge, NOT "don't overshoot by default". (Putter is still the green default for all.)
    `suggestPlayerClub`/`shotView.attackClubId` are unchanged and still computed — `app.ts` just GATES
    the explicit affordances on `loadout.clubSuggest` while using the pick as the default club always.
    Sam also surfaces a **caddy yardage read** (a 🎒 Sam line
    on the play screen): precise front/middle/back green distances (`greenDepth` + centroid dist) and
    the carry to clear the nearest forced penalty on the line to the pin (`forcedCarry`, a pure
    line-vs-penalty sampler in `round.ts` — info only, never feeds fairness/scoring).
  - **(2) Club confidence — commit to Sam's club and swing freer.** `loadout.confidenceMod`
    (`SAM_CONFIDENCE`, a green-zone `ShapeMod` trimming all four miss zones) is folded into a shot's
    spray shape ONLY when the played club is the one Sam suggested — so the cone VISIBLY tightens on the
    recommended club and you forfeit the boost if you override for a tactical placement (a real
    decision). It's threaded into BOTH the auto sim (`PlayHoleOptions.confidence` → `playHole` computes
    `suggestPlayerClub` and applies iff `aiClub === suggested`) and the interactive driver
    (`takeShot`/`previewShot` compute the same and apply iff the chosen club matches) under the
    IDENTICAL rule, so auto≡interactive holds. The fold is `resolveShape(combineShapeMods(shapeMod,
    confidence), charShape)` in `executeShot` AND `shotSpread` (so physics == the previewed cone).
  CRITICAL determinism: confidence is a SHAPE change (no new rng draws — it just re-weights the
  categorical zone pick), so a NON-Sam shot (confidence undefined) is byte-for-byte unchanged, and the
  gate (`confidence && suggestedClubId === club.id`) means an off-suggestion shot is identical too
  (guarded in `tests/caddies.test.ts`). Because it only ever raises green %, it can't trip the
  death-spiral bar; its value is proven by a FOLLOW-SAM headless harness (play `shotView.attackClubId`
  each shot via `takeShot`) showing higher mean per-stop Stableford. Both fields rebuild from perks on
  resume (no save bump). Render: `drawSuggestibleSam` offers a club aloft with a yardage thought-bubble.
- **Generic caddy 'service' perks gate behind hiring a named caddy.** `caddie-lesson` is `caddy:
  'service'`: `shopOffer` only surfaces a service perk once `namedCaddyOwned(perks)` is set — you need a
  caddy before they'll give you lessons. (It still stacks/works exactly as before once unlocked.)
- **The guard caddies redirect an OFF-FAIRWAY miss back onto the SHORT GRASS MID-FLIGHT — green if it's a
  GREENSIDE miss, else the fairway — they do NOT reshape the spray (`CaddyGuard` in shot.ts, distinct from
  `ShapeMod`).** The cone still shows the miss tails; what changes is that a shot that would COME DOWN OFF
  the fairway on the caddy's side gets knocked back. The trigger is OUTCOME-based, not zone-based:
  `resolveShot` computes the would-be landing, then (if a guard is present) asks the caller-supplied
  `offFairway(landing)` predicate whether it lands off the short grass (`ShotInput.offFairway` closes over
  the hole as `lieAt(hole,p) !== 'fairway' && !== 'green'`, keeping `resolveShot` itself course-agnostic).
  It reads the SIDE off the landing's WORLD lateral sign (− = left of the bearing, + = right) and, if it
  matches `guard.side`, redirects: a GREENSIDE miss (one `ShotInput.greenAim(landing)` returns an on-green
  point for — `executeShot` builds it as "within the green's radius + `CADDY_GREENSIDE_MARGIN`" → a point
  60% from the green centre to the pin, always inside the star-shaped green) is teleported ONTO the green
  with carry following so the roll-out reads true; any OTHER miss resamples a fresh centre-band angle
  (`sampleGreenAngle`) so it comes down on the fairway. Fires on EVERY qualifying miss — no chance roll.
  **Space Ducks** = `{side:'left', kind:'laser'}` (every ball missing LEFT — rough/sand/void/water,
  wherever — lasered home; on the green if greenside); **Convict Sheep** = `{side:'right',
  kind:'boomerang'}` (the right-side mirror). On a redirect, `ShotResult.redirect = {kind, fromZone,
  originalLanding}` records the would-be miss so the renderer animates it (`fromZone` is now just a
  representative tail for the side — the renderer reads `originalLanding`, not the zone). CRITICAL
  determinism: the fairway recentre is the single extra rng draw (the greenside teleport is a deterministic
  point → no draw), and it fires ONLY when a guard is present AND `offFairway` says it's a side miss — a
  guard-less shot, a hole-less unit call, or a guard with no `offFairway` draws NOTHING extra, so the base
  sim is byte-for-byte unchanged (guarded by `tests/caddies.test.ts`). The guard + the course-aware tests
  (`offFairway`/`greenAim`) are threaded through the ONE shared
  `executeShot` (which has the hole), so both the auto sim (`playStop`→`playHole`) and the interactive
  driver (`takeShot`) get identical interception → auto≡interactive.
- **Dr Chipinski adds a chip-in chance, not a spray change (`ExecOpts.chipIn`, `CHIPIN_RANGE` 8yds).**
  After a shot comes to rest, if `chipIn > 0` AND the club is a wedge (`nominalCarry ≤
  WEDGE_CONTROL_CARRY` 110 — PW and shorter) AND the ball rests within `CHIPIN_RANGE` of the flag but
  outside the auto hole-out radius, one rng draw `< chipIn` holes it (`log.chipIn = true`, ball moved to
  the cup). Gated on `chipIn` + proximity + wedge, so a base loadout never reaches the draw → byte-for-
  byte stable. Lives in `executeShot` so auto≡interactive. (NOT a flat 33% on every wedge — that would
  break the birdie/eagle balance; it's a chip-in near the pin.) Dr Chipinski is **legendary** (a chip-in
  near the pin is a big swing), so he's epic-scarce in the offer like the other game-changing caddies.
- **Caddy effects play in SLO-MO with a voice line + speech bubble (GS-caddy-voices / GS-caddy-slomo,
  `playView.ts` + `speech.ts` + `caddyArt.ts`).** When a caddy's signature effect fires — a guard
  laser/boomerang redirect, or a Dr Chipinski chip-in — the play view drops its clock to `CADDY_SLOMO`×
  real time for `CADDY_SLOMO_MS` of VIRTUAL time so the throw/drop is NOTICEABLE, and pops the caddy's
  catchphrase as an on-screen `drawSpeechBubble` (Dr Chipinski also gets a ringing "answering a call"
  `drawPhoneIcon`) while `app.ts`'s `onCaddyEffect` speaks it via the browser Web-Speech synth
  (`speakCaddy`, ZERO downloaded audio — the house rule) in the caddy's accent: Dr Chipinski "You rang?"
  (en-US), Convict Sheep "She'll be right, mate." (en-AU), Space Ducks "Tally ho, good shot!" (en-GB);
  data lives in `CADDY_VOICE`. CRITICAL: the slo-mo is a VIRTUAL animation clock (`vnow += dt × scale`)
  — it only stretches the wall-time of the EXISTING animation, never the sim, so determinism + every sim
  test is untouched; the constants are plain module consts (like `ARC_FEEL`), NOT `_gsFeel` fields, so
  no new hook to wire (the test-hub guard needs nothing). The play view now takes the FULL hired caddy id
  (`opts.caddyId = caddyId()`, not just the guard) but still only draws a GUARD persistently in the corner
  (`caddyProjectile` gate — the no-clutter rule); a non-guard caddy (Dr Chipinski) appears in the corner
  TRANSIENTLY only during its callout, so the chip-in shows the doctor + phone + bubble then vanishes.
  Voice is gated on the `sound` setting + fully guarded (silent where unsupported).
- **The guard redirect is a SLOW-MO ZOOM-TO-IMPACT cinematic where the projectile actually HITS the ball
  (GS-caddy-impact, `playView.ts`).** The redirect used to fire the laser/boomerang on a SEPARATE fixed
  clock (`t0`/`dur`) toward a FROZEN screen point, so under slo-mo (and with the follow-cam panning) the
  throw sailed past the still-moving ball — "it no longer hits the ball." Now the projectile is tied to
  the BALL's flight progress `tg`: the caddy looses it at `REDIRECT_FIRE_FRAC` (0.28) and its travel
  `p = (tg − fireFrac)/(hitFrac − fireFrac)` reaches 1 exactly at `REDIRECT_HIT_FRAC` (0.5) — the
  intercept — so it MEETS the ball (the ball is at that same curve point at `tg=0.5`). The target screen
  point is RE-projected every frame (`redirectDraw`, recomputed in the cinematic, drawn over the ball),
  so camera pan/zoom can never desync it (the old frozen `to` drifted). At contact: a `spawnSparks` spray
  (cyan laser / warm boomerang, deterministic, no `Math.random`) + an expanding shock ring, and the
  camera ZOOMS in (`cineZoom`, a `buildProj` viewRadius multiplier eased to `REDIRECT_ZOOM` 0.6 over the
  approach and back out on the knock-back). Slow-mo still rides #121's global virtual clock
  (`CADDY_SLOMO`, bumped `CADDY_SLOMO_MS`→1050 so the whole arc + early roll are slowed). The speech
  bubble now points at the caddy's HEAD (`caddyHead`), not its weapon hand, so it sits cleanly above the
  figure (was "a bit off position"). All render-only feel (module consts, no `_gsFeel`/hook) — sim +
  tests untouched; the impact animation is canvas feel → verified eyes-on.
- **The framed caddy badge shows on the WATCH screen too (GS-caddy-display), and the frame is FLASHY.**
  The hired caddy's gold-framed badge was decision-screen-only; it now also floats bottom-RIGHT on the
  live shot (watch) screen (`gs-hud-watchcaddy`, clear of the play-view's bottom-left corner caddy + the
  top-left info chip) so the border reads the whole shot. The `.gs-caddybadge` frame got a real glow-up: a
  pulsing gold glow (`@keyframes gs-caddyglow`), a slow rotating gold sheen behind the figure
  (`::before` conic-gradient, `gs-caddyspin`), a warm radial backdrop + glowing name — gated by
  `prefers-reduced-motion`. CSS-only; verified eyes-on.
- **Render (`render/caddyArt.ts`, eyes-on feel).** The hired caddy is drawn as a self-contained Canvas2D
  figure (house "no asset" style), but WHERE it shows is scoped to where it has a role (GS-caddy-display):
  the decision screen always shows the hired caddy in its framed gold badge (`caddyBadgeHTML` →
  `.gs-caddybadge`, the "cool outline"); the LIVE play view's bottom-left corner shows ONLY a guard
  caddy (`flightCaddyId` = `caddyProjectile(id) != null` — Space Ducks / Convict Sheep, the only ones
  with a flight-time job firing the redirect laser/boomerang), since any other caddy looming over the
  ball-in-flight just clutters it (and it's already in the decision badge); and the PUTTING screen shows
  ONLY a putting specialist in the SAME framed badge (`puttCaddyId` = `isPuttingCaddy(id)` →
  Penelope/Mystic Mole, `PUTTING_CADDY_IDS` in economy) — a distance/guard caddy like Driver Dan has no
  role on the green. The putt meter itself no longer draws a figure (it uses its full width); the badge
  sits beside it. Both framed badges are one generic render pass (`canvas.gs-caddycv[data-caddy]`) so
  every screen draws identically. Figures: Penelope (teal caddy + flag), Driver Dan (burly + big driver), Dr
  Chipinski (lab coat + wedge), Space Ducks (bubble-helmet duck + top hat + laser rifle), Convict Sheep
  (striped jumpsuit + boomerang). On a redirect, `playView` flies the ball toward `originalLanding`,
  fires the caddy's projectile (`drawCaddyProjectile` — laser beam / spinning boomerang) from the
  figure's muzzle anchor mid-flight, then kinks the GROUND path back onto the fairway (the loft arc is
  one continuous parabola, so only the ground bends — the "zapped" read). All caddy feel reuses existing
  knobs/no new `_gs*` flag, so the test-hub guard needs no new control; the Sim Lab absorbs the new
  shop items automatically.
- **Caddy effects are testable in the harness — DEMO the throw + VERIFY the rate (GS-caddy-test).** The
  guard interception only fires on a rare right/left miss, so in normal play you can go a whole run
  without seeing the boomerang/laser. Two harness affordances close that (and the rule below keeps every
  caddy covered): (1) DEMO — `_gsFeel.forceRedirect` (`'' | 'boomerang' | 'laser'`, a `_gsFeel`
  SUB-FIELD so NO new top-level hook) forces a caddy-guard interception on EVERY shot in the live play
  view: it shows the guard caddy in the corner even if none is hired and FABRICATES a render-only
  redirect (`fabricateRedirect` in `playView.ts` — pure, no rng, no sim/score change) for any shot the
  sim didn't already redirect, so the throw can be watched on demand. The hub's Demo panel drives it
  (🪃 Convict Sheep / 🔫 Space Ducks / Off). (2) VERIFY — the Sim Lab's `dispersionStudy` now threads
  the built loadout's `caddyGuard` + `lieRelief` through `resolveShot`, so a guard caddy's redirects
  sample for real: it reports `redirectRate`/`guardKind` and the scatter draws each would-be miss (red)
  with a line to the saved green landing. And `caddyEffects(loadout)` (pure, in `lab.ts`) names every
  active caddy/loadout effect (autoPutt / driverAnywhere / chipInBoost / caddyGuard / clubSuggest /
  lieRelief / puttBoost), surfaced in the hub's loadout stats so toggling any caddy SHOWS what it
  changed. THE RULE (machine-checked): every named caddy folds a field into the loadout, and
  `tests/lab.test.ts` asserts each id in `NAMED_CADDY_IDS` surfaces a `caddyEffects` row — add a caddy
  with no Lab effect and the build reds. A guard/visual caddy additionally needs a `_gsFeel.forceRedirect`
  case + a Demo button.
- **Sandy the Sand-Saver — escape specialist (GS-mux, a NEW shot mechanic `lieRelief`).** A `loadout.
  lieRelief` (0..1) LERPS a BAD lie's `carryMult`/`dispersionMult` back toward neutral (`reliedLie` in
  `shot.ts`) — rough/sand/waste/trees recover far better — and NEVER touches a clean lie (carryMult 1 /
  dispersionMult ≤ 1 are unchanged). Threaded IDENTICALLY through `resolveShot`, `shotSpread` (so the
  cone reads true), `executeShot`, `playHole`/`playStop` (auto) AND `takeShot`/`previewShot`
  (interactive), so auto≡interactive holds. CRITICAL determinism: `reliedLie(li, undefined)` returns the
  lie's EXACT values and consumes NO rng, so a relief-less shot is byte-for-byte unchanged (the caddy-
  field contract). It changes carry VALUES, not the 2-draw budget, so the rng stream is stable. Sandy
  pairs with the new lie-awareness chip (you SEE the bad lie, a caddy digs you out). `SANDY_LIE_RELIEF`
  0.6. Guarded in `tests/caddies.test.ts` (absent = byte-for-byte, clean lie unchanged, more carry out
  of rough).
- **Mystic Mole — green-reader (GS-mux).** Rides the EXISTING `puttBoost` field (`MOLE_PUTT_BOOST` 0.32
  — a big manual make-band + lag lift), so it needs no new sim thread and is covered by the putting
  guards. Distinct from Penelope (who AUTO-putts): the Mole rewards MANUAL putting skill instead of
  replacing it. Both new caddies get assetless `caddyArt` figures (Sandy: bush hat + wedge + sand spray;
  Mole: spectacled mole on a dirt mound with a putter), are mutually-exclusive named caddies
  (`NAMED_CADDY_IDS` auto-derives), and rebuild from perks on resume (no save bump).

## Legendary caddies, fire-and-replace, and factions (GS-caddy-factions)
- **Problem:** Driver Dan was the only EPIC caddy in a field of legendaries, so he showed up at (much)
  higher shop frequency than everyone else — "basically an always pick given how rare the others are."
  The caddies had also drifted in power (the four ex-epics were the weaker set). Fix: **all caddies are
  now LEGENDARY** (one rarity → equal appearance odds), and the four ex-epics get a small buff so the
  choice is "which legendary do I want", not "which one turned up":
  - **Driver Dan** (`driver-dan`): keeps `driverAnywhere` AND now hauls +`DRIVER_DAN_CARRY` (12) yds on
    the distance clubs (a Long Haul Trucker hauls further) — `boostDistanceClubs` + `distanceClubBonus`
    so a mid-run distance club inherits it. Distance only (the power-cell lesson: extra carry on scoring
    clubs overshoots).
  - **Suggestible Sam** (`suggestible-sam`): `SAM_CONFIDENCE` bumped (−0.045/−0.045 hook/slice,
    −0.022/−0.022 duck/shank) — a bigger green-zone lift on his suggested club.
  - **Sandy the Sand-Saver** (`sandy-sandsaver`): `SANDY_LIE_RELIEF` 0.6 → **0.72** (a stronger escape;
    also lifts the thematic `talent-dunewalker`/`talent-mycelial`, which share the constant).
  - **Mystic Mole** (`mystic-mole`): `MOLE_PUTT_BOOST` 0.32 → **0.38**.
  All four buffs only ever RAISE scoring (they can't trip the death-spiral bar), and the no-caddy auto
  path is byte-for-byte unchanged — so the whole seeded suite + the harness pass untouched.
- **Fire-and-replace.** Hiring a NEW named caddy while one is on the bag used to be a NO-OP (the first
  hire blocked the rest). Now it **FIRES the incumbent**: `buy()` rebuilds the loadout over the run's
  base (`baseLoadoutForRun`) MINUS the fired caddy's perk, then applies the newcomer, and logs the
  sacked caddy in `Run.firedCaddies`. A fired caddy is **never offered again this run** (they've stormed
  off) but returns in FUTURE runs (`firedCaddies` is per-run, snapshotted for resume). The shop keeps
  every OTHER (non-owned, non-fired) caddy offerable so a swap is always on the table — `shopOffer`/
  `starmartOffer` dropped the old `!hasCaddy` "hide them all once you hire one" filter for a
  `!firedCaddies.includes(id)` one (the owned caddy still drops via the maxed-count check). Determinism:
  `firedCaddies` is empty on the default path → byte-for-byte; the sim `buy()` fires unconditionally
  (headless auto ≡ interactive — the Lab/harness need no confirmation).
- **The player warning.** Firing someone is a real cost, so the UI gates it: clicking a new caddy while
  one is hired parks `UiState.pendingFireCaddy` and the Pro Shop renders a red "⚠️ Fire X? …they won't
  be happy about it, and won't work for you again this run" panel with Confirm (`buy` +`confirmFire`) /
  Keep-X (`cancelFireCaddy`) buttons. The confirmation is REDUCER state (pure), not a `window.confirm`
  side-effect. The headless sim skips it (it just fires).
- **Factions + reputation** (`src/sim/rpg/factions.ts`) — deliberately **hidden groundwork** for future
  faction perks/events; nothing in the UI reads it yet. Every named caddy maps to a `FACTIONS` row
  (`CADDY_FACTION`), machine-checked in `tests/factions.test.ts` (the sibling of the `caddyEffects`
  rule — a caddy without a faction reds CI). The starting factions: **The Putters Guild**
  (Penelope + Mystic Mole — putting specialists), **Space Bandits** (the merged pirate crew — the
  Convict Sheep + the foreseeing Prognostic Parrot; was two factions, Space Pirates + Planet Pirates,
  folded into one), **Lords & Ladies**
  (Space Ducks), **The Long Haul Truckers** (Driver Dan + Suggestible Sam), **Para-Spatial Medics**
  (Dr Chipinski), **The Other Guys** (Sandy — the unaffiliated escape artist). Hiring earns
  `REP_ON_HIRE` (+1) with a caddy's faction; firing costs `REP_ON_FIRE` (−3). Reputation is
  **character-specific** (`reputationByCharacter`: characterId → factionId → rep, save **v21**), so each
  golfer courts (or burns) crews independently. It's a SAVE/UI concern moved by the reducer's `buy`
  case — the sim `buy()` only does the fire mechanic (keeping auto ≡ interactive and the Lab path
  reputation-free). `adjustReputation`/`reputationWith` are pure immutable helpers.

## Credit tokens get factions + faction crests (GS-credit-factions)
- **Problem.** The four credit-boost Pro Shop items looked like generic re-skins of each other — the
  +15% Sponsor's Badge and +20% Lucky Ball Marker were both a gold-coin-with-a-star; Birdie Hunter and
  Eagle Eye were both a gold trophy. Nothing said *whose* money this was, and the cards weren't unique.
- **Fix.** Every credit token is now ISSUED BY a galaxy faction, and wears that house's CREST on a
  struck-metal medallion — so each reads as "factionally specific" at a glance:
  - **Sponsor's Badge** (`fortune-chip`, +15%) → **The Sponsors' Syndicate** — corporate backers.
    Crest: a shield holding a rising-growth arrow crowned by a star (blue-chrome).
  - **Lucky Ball Marker** (`lucky-coin`, +20%) → **The Fortune Cartel** — casino-world high rollers.
    Crest: a horseshoe cradling a four-leaf clover (casino green).
  - **Birdie Hunter** (`birdie-hunter`, per-birdie bounty) → **The Birdie Hunters** — a big-game lodge.
    Crest: a bird framed dead-centre in a hunter's crosshair (lodge amber).
  - **Eagle Eye** (`eagle-eye`, per-eagle bounty) → **The Eagle Order** — raptor-eyed marksmen.
    Crest: an heraldic spread eagle with a piercing eye (raptor gold).
- **Where it lives.** The token→faction map is `CREDIT_ITEM_FACTION` in `src/sim/rpg/factions.ts` (pure
  data, no imports, no cycle), machine-checked in `tests/factions.test.ts`: every key is a real shop
  item, every value a real `FACTIONS` row, and the four factions are DISTINCT (the brief's "different
  faction per item"). The crest ART (`factionCrest` + `drawCreditToken` in `src/render/itemArt.ts`) is
  keyed off the faction id, so `itemArtSVG` intercepts a credit-token id BEFORE the base gear switch and
  renders the medallion instead of a coin/trophy — the whole card is the crest, so it skips the corner
  roundel. The item descriptions name the issuing house too. Pure/deterministic, zero rng, zero sim
  impact — a render + data change only (no save bump; the mechanic/`apply` is untouched).
- **Same pass, better base art.** Two long-standing eyesores got redrawn while the shop cards were open:
  the **glove** (was a mitten-ish blob) is now a proper tour glove — four seamed fingers, a thumb, a
  wrist cuff with a Velcro strap tab, perforation dots and a snap; the **driver** (`drawShaft`) gained a
  rubber grip, a ferrule, and a pear head with a crown sheen + milled-face lines so it reads as forged
  gear, not a stick with a blob. Re-shoot `node scripts/shop-cards-preview.mjs` after touching either.

## The Prognostic Parrot — foresight scramble (GS-caddy-parrot)
- **The fantasy.** A bipedal space parrot, pirate captain of the **Space Bandits** (the merged pirate
  crew — see the faction note above). Its ability is a 33%
  chance to *see your shot before it happens* — mechanically, the game's own SCRAMBLE effect turned on the
  player's solo ball: the shot is played TWICE and you keep the better result. Both balls are the player's
  OWN golfer (not a partner golfer), so it's your swing you're improving on, not someone else's.
- **Why it's a self-partnered scramble, not a new mechanic.** The scramble machinery (`pickBetterExec` +
  `ScrambleOpts` + the interactive `resolveScrambleShot`/`commitScrambleBall` choice card, and the mulligan
  that already reuses it with the player's own mods) is exactly "play two balls, keep the better." The
  parrot rides it with `partnerMods = characterShotMods(loadout.characterId)` — the same golfer, a second
  swing. No new physics, no new choice UI: the fortune-teller mulligan already proved the "pick your own
  A/B ball" card works, so the parrot's foresight card is that card with pirate copy (`ScrambleShot.preview`
  → "🦜 PROGNOSTIC PARROT — PICK YOUR SHOT", options "Vision A/B").
- **The proc + determinism (the caddy-field contract).** A new `loadout.previewScramble` (0..1;
  `PARROT_PREVIEW_CHANCE` 0.33) is the per-full-swing chance. On EVERY full swing, when armed AND no team
  scramble is already active, ONE `rng.bool(previewScramble)` decides the proc; a proc then plays the
  player ball + a second own-golfer ball and keeps the better. The proc draw is placed BEFORE the shot
  draws in BOTH the headless `playHole` (`!opts.scramble && !!opts.previewScramble && rng.bool(...)`) and
  the interactive reducer (`'shot'` and `autoShotHole`), so the stream is identical across auto and
  interactive (contract 2), and — crucially — the `&&` short-circuits mean an UNARMED loadout draws NOTHING
  extra, so every existing seeded test stays byte-for-byte (contract 1). Gated `!opts.scramble`, a boss
  TEAM scramble wins and the parrot is silent that stop (a team scramble armed with the parrot is
  byte-for-byte the plain team scramble — guarded).
- **Balance (contract 4) is free.** Best-of-two dominates solo by `pickBetterExec`'s order (holed > fewer
  penalties > closer), so the parrot can only ever RAISE mean per-stop Stableford — a power-up that lifts
  scoring by construction, never a death-spiral risk. Proven by a chance-1 best-of-two harness over 40
  seeds scoring strictly above solo (`tests/caddies.test.ts`).
- **Interactive: you still choose.** On the human path the proc shows the foresight choice card
  (`resolveScrambleShot` → `{preview:true}`) so you pick which vision to play; the watch/auto-finish loop
  and the headless sim auto-keep the better (`autoCommitScrambleBall`/`pickBetterExec`) — the same
  rng-stream-identical, selection-differs split the existing scramble already lives under.
- **Not a guard/projectile caddy.** No in-flight redirect, so no `_gsFeel.forceRedirect` Demo case and no
  playView corner-projectile — it's like Dr Chipinski (a transient effect, shown in the gold badge). It
  DOES fold a loadout field, so it satisfies THE RULE: a `caddyEffects` "Foresight" Lab row + a
  `factions.ts` Space Bandits faction (both machine-checked). Assetless art: a green pirate-captain
  parrot (tricorne + eyepatch + curved beak, raising a brass spyglass with foresight sparkles) in both
  `render/itemArt.ts` (shop card) and `render/caddyArt.ts` (corner figure + a swaggering "Arr! I saw that
  coming!" `CADDY_VOICE` line). Rebuilds from perks on resume (no save bump).


## GS-caddy-snapback — a fairway save comes HOME to the fairway, however far offline

The Space Ducks (left) / Convict Sheep (right) guards knock EVERY off-side miss back onto the short
grass. But the FAIRWAY save (`resolveShot`) recentred the sampled miss angle onto the shot BEARING —
fine when the player aimed AT the fairway (bearing ≈ fairway line), but when they deliberately aimed
WAY off (a trick shot, a recovery angle), the bearing pointed into the rough, so a de-spread version of
it still landed off the fairway. The guard "fired" but the ball didn't come home — it read as the save
doing nothing.

Fix: `ShotInput.fairwaySnap` — a course-aware closure the caller (`round.ts`) closes over the hole as
`nearestFairwayPoint(hole, p)` (the nearest centreline station that actually sits on fairway/green,
skipping rough-gap / broken-corridor stations). The fairway-save branch drops the ball on that spine
point instead of the recentred bearing landing, so however far offline the miss went it returns to the
short grass. Greenside saves are unchanged (`greenAim` still lands ON the green). The single
`sampleGreenAngle` rng draw is still consumed (draw count stable, and it's the fallback for a hole-less
unit call with no `fairwaySnap`). Guard-only ⇒ a guard-less shot is byte-for-byte; resolved in the
shared `resolveShot` ⇒ auto ≡ interactive. On a walled derelict hole the fairway spine IS the deck
spine, so this subsumes the old GS-ship-wall-caddy in-space snap (that stays as a rest backstop). This
was the "make Ducks/Sheep bounce the ball back to the fairway regardless of how far it went" ask —
because the snapped landing is now far from the miss, the redirect cinematic's arc-back reads as a real
deflection instead of a tiny nudge. Regression: `tests/caddies.test.ts` fires a far-right aim and
asserts every saved ball lands on the fairway WITH the snap and is stranded in the rough WITHOUT it.

---

## Migrated from CLAUDE.md — System-index bullets (2026-07-23 refactor)

> These are the verbatim terse System-index bullets moved out of `CLAUDE.md` when it was
> compressed back to a lean constitution. They are the tip-of-iceberg pointers that had grown
> into full implementation histories in the root file. The durable *rule* now lives as a short
> bullet in `CLAUDE.md`; the detail below (and the deeper narrative already in this doc) is the
> archive. Nothing here is lost — it is just no longer cluttering the constitution.

- **Caddies** — `docs/decisions/caddies.md`
  - One named caddy on the bag at a time, but hiring a NEW one FIRES the incumbent (GS-caddy-factions,
    `buy` rebuilds the loadout minus the fired caddy's perk) — NOT a no-op. A fired caddy lands in
    `Run.firedCaddies` and is never offered again THIS run (returns in future runs); the shop keeps the
    OTHER caddies offerable so a swap is always possible. All caddies are LEGENDARY (equal scarcity —
    no "Dan's just the one that showed up"); the four ex-epics (Dan/Sam/Sandy/Mole) got a small buff.
    Each folds ONE loadout field. THE RULE (machine-checked): every `NAMED_CADDY_IDS` entry surfaces a
    `caddyEffects` row AND a `factions.ts` faction.
  - FACTIONS + REPUTATION (`src/sim/rpg/factions.ts`) are HIDDEN groundwork — nothing renders them yet.
    Every caddy belongs to a faction; hiring earns `REP_ON_HIRE` (+1), firing costs `REP_ON_FIRE` (−3),
    tracked PER CHARACTER (`reputationByCharacter`, save v21). Reputation is a UI/save concern moved by
    the reducer's `buy` case — the sim `buy()` only does the fire mechanic (so auto ≡ interactive; the
    headless/Lab path never touches reputation). The UI gates the fire behind a "they won't be happy"
    confirmation (`pendingFireCaddy` → `confirmFire`); the sim fires unconditionally.
  - CREDIT TOKENS are faction-branded too (GS-credit-factions): each of the four credit-boost shop items
    is ISSUED BY a distinct faction (`CREDIT_ITEM_FACTION`) — Sponsor's Badge +15% → Sponsors' Syndicate,
    Lucky Ball Marker +20% → Fortune Cartel, Birdie Hunter → Birdie Hunters, Eagle Eye → Eagle Order —
    machine-checked DISTINCT. The card wears its house CREST on a medallion (`factionCrest`/
    `drawCreditToken`; `itemArtSVG` intercepts a credit id before the base gear switch). Pure render +
    data, zero rng, no save bump — the `apply`/mechanic is untouched. A new credit item = a
    `CREDIT_ITEM_FACTION` row + a `FACTION_CREST` emblem.
  - Guard redirects + chip-ins add rng ONLY when armed + qualifying. A guard's `side` is a FAIRWAY
    side classified off the hole's `centreline` (`ShotInput.fairwaySide`), NOT the shot bearing.
  - A Space Ducks / Convict Sheep FAIRWAY save snaps the ball HOME to the fairway SPINE, not the aim line
    (GS-caddy-snapback, `ShotInput.fairwaySnap` closed over `nearestFairwayPoint`): the old recentre-onto-
    the-BEARING left a save in the rough whenever the miss was aimed far off the fairway (the bearing points
    into the rough, so a de-spread version of it still lands off). Now however far offline the miss went, it
    comes back onto the short grass. Greenside saves still land ON the green (`greenAim`). Guard-only (a
    guard-less shot passes `undefined` → byte-for-byte), consumes the SAME single `sampleGreenAngle` draw
    (draw count stable), resolved in the shared `resolveShot` (auto ≡ interactive). On a walled derelict the
    fairway spine IS the deck spine, so this subsumes the old GS-ship-wall-caddy snap (kept as a backstop).
  - On a WALLED derelict corridor a guard save is DECK-AWARE (GS-ship-wall-caddy, `executeShot`): the
    guard recentres a miss onto the aim-BEARING line, which runs off into space on a BENDING ship
    corridor, and the wall bounce then re-processed that fictional curve-back arc (~81% of caddy saves
    double-handled, ~7% flung back into space — the "caddy interacts really badly" bug). So on a walled
    hole a redirect (a) snaps its landing to the nearest ON-DECK centreline point (the deck spine) when
    the recentre lands in space, (b) SKIPS the flight wall bounce (the guard's placement is final), and
    (c) is STICKY — a still-lost redirected rest is seated back on the deck. Guard-only + walled-only →
    byte-identical everywhere else; a caddy save now finishes on the deck ~98% fairway, 0% lost.
  - The renderer draws the guard figure ONCE (the corner figure) — never also float the portrait badge.
  - The **Prognostic Parrot** (GS-caddy-parrot, faction **Space Bandits** — the merged pirate crew that
    also fields the Convict Sheep) reuses the SCRAMBLE machinery:
    `loadout.previewScramble` (0.33) is a per-full-swing proc where the pirate captain FORESEES the shot →
    you play a SECOND ball with the player's OWN golfer (`opts.shotMods`, never a partner) and keep the
    better (`pickBetterExec`). Threaded IDENTICALLY through the auto sim (`playHole`, gated `!opts.scramble`
    so a team duel wins) and the interactive reducer (`'shot'` shows the foresight choice card via
    `resolveScrambleShot`+`{preview:true}`; `autoShotHole`/watch auto-keeps like headless) — the proc is ONE
    `rng.bool(chance)` drawn BEFORE the shot in BOTH, so undefined/0 is byte-for-byte and best-of-two only
    ever RAISES Stableford (contract 4 by construction). It's NOT a guard/projectile caddy, so no
    `_gsFeel.forceRedirect` case — just the `caddyEffects` row + faction the RULE demands.

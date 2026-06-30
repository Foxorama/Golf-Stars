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
- **The guard caddies redirect a sampled miss back onto the FAIRWAY (the centre line) MID-FLIGHT — they
  do NOT reshape the spray (`CaddyGuard` in shot.ts, distinct from `ShapeMod`).** The cone still shows
  the miss tails; what changes is that a shot already SAMPLED into a tail gets knocked back. `resolveShot`
  classifies the sampled angle's zone (`classifySprayZone`) and, if a guard is present, looks up that
  zone's redirect CHANCE (`guard.redirect[zone]`): a chance ≥1 ALWAYS redirects to a fresh centre-band
  angle (no roll), a fractional chance rolls once, an absent/zero zone does nothing. The guards each
  cover ONE side of the fairway at a flat **33%** — a clear, visible "one in three of your misses gets
  saved" rather than a near-total wall. **Space Ducks** = `{redirect:{duckHookL:0.33, hookL:0.33},
  kind:'laser'}` (33% of any ball heading LEFT — a hook or a duck-hook — zapped back to the fairway);
  **Convict Sheep** = `{redirect:{shankR:0.33, sliceR:0.33}, kind:'boomerang'}` (the right-side mirror).
  On a redirect, `ShotResult.redirect = {kind, fromZone, originalLanding}` records the would-be miss so
  the renderer animates it. CRITICAL determinism: the guard's extra rng draws (the chance roll + the
  centre-band resample) fire ONLY when a guard is present AND the sampled zone qualifies — a guard-less
  shot (or an empty guard) draws NOTHING extra, so the base sim is byte-for-byte unchanged (guarded by
  `tests/caddies.test.ts`). The guard is threaded into BOTH the auto sim (`playStop`→`playHole`→
  `executeShot`, `PlayHoleOptions.guard`) and the interactive driver (`takeShot`) so auto≡interactive.
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


# Archived engineering log — feedback mobile ux

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Feedback & mobile UX layer (GS-mux — audio, haptics, settings, juice)
A pure side-effect layer over the reducer (like the play-view canvas + save persistence); the sim is
untouched, so determinism + all sim tests are unaffected. NONE of it adds a top-level `_gs*` flag or
URL param (dev knobs ride the existing `_gsFeel` sub-fields), so the test-hub guard needs no new control.
- **Assetless audio (`render/audio.ts`).** A WebAudio synth — every cue (contact, putt, hole-out,
  made/missed-cut, penalty, reward, UI click) is built from oscillators + filtered noise at call time,
  ZERO downloaded files (the house no-404 rule). Lazy `AudioContext`, resumed on the first user gesture
  (`resumeAudio()` in `dispatch`), gated on the `sound` setting, fully guarded (no-op without WebAudio).
  The contact cue fires at the TRUE strike moment via a new `playView` `onImpact(kind, quality)` hook
  (quality from the shot's straightness → a pure strike rings, a wild one thuds). Big-beat cues
  (made/missed cut) fire on the screen transition in `dispatch`; hole-out/penalty in the animation
  `onDone`.
- **Haptic vocabulary (`HAPTICS` in `app.ts`).** Named patterns (tap/swing/putt/good/bad/holeOut/
  madeCut) gated on the `haptics` setting + guarded (absent on desktop/iOS) — so the game is readable
  with sound off.
- **Settings (`src/settings.ts` + a bottom-sheet overlay).** Player-owned prefs persisted to
  localStorage `gs_settings` (NOT reducer state): `sound`, `haptics`, `fastShots`, `swingGesture`,
  `leftHanded`, `reducedMotion` (seeded from the OS preference). Reachable via ⚙ on the title + the
  play-screen map controls; toggles re-render live.
- **Left-handed mode is a true MIRROR, not a cosmetic flip (GS-lefty).** A left-handed golfer is the
  mirror image of a right-handed one — their hook curves right, slice left, and a character's baked
  fade/hook flips — so on a FIXED course (layout unchanged) a lefty's misses go the opposite way.
  Implemented as a SINGLE lateral-sign on the FINAL shot angle (spray + bias) in `resolveShot`'s
  `landAt` (`h = lefty ? -1 : 1`), applied AFTER the rng draws and AFTER the canonical-frame guard
  classification — so EVERYTHING internal (the SprayShape zones, the caddy guard's `duckHookL`/`shankR`
  targeting, the character `angleBias`) stays in one right-handed canonical frame and the ONE sign maps
  it to world space. CRITICAL invariants: (1) ZERO extra rng — `lefty:false`/undefined is byte-for-byte
  right-handed (the whole existing suite is the guard); (2) crosswind (`windLat`) is NOT flipped — it's
  world-fixed, independent of stance, so wind shifts the cone the same way for both hands; (3) by mirror
  symmetry, mirroring the PLAYER equals mirroring the COURSE (a seed relabelling), so it's BALANCE-NEUTRAL
  — `tests/lefty.test.ts` proves mean per-stop Stableford matches righty within noise, so the
  no-death-spiral bar is untouched. Threaded as `loadout.lefty` IDENTICALLY through the auto sim
  (`playStop`→`playHole`→`executeShot`) and the interactive driver (`takeShot`/`previewShot`) so
  auto≡interactive holds. It's a SETTING, not a perk: the pure sim can't read localStorage, so `app.ts`
  bakes the live setting onto `loadout.lefty` in `render()` (the settings→sim bridge) — NOT serialised,
  re-derived on resume, so NO save bump and NO `_gs*`/URL hook (the test-hub guard needs nothing). The
  preview cone mirrors via `ShotSpread.lefty` (holeView negates the band angles + the bias rotates the
  other way) so the graphic stays == the physics; the % labels ride their zones (hook% still shows where
  a lefty's hook goes). Render mirrors (cosmetic, the flight already comes out mirrored from the sim):
  `drawGolfer` swings left-handed (mirror the figure about the ball), `drawCaddy` mirrors the figure +
  its muzzle anchor, and the `.gs-shot--lefty` CSS moves the floating map controls left + reverses the
  aim segment / Hit bar (the club ◄/► arrows keep their direction). Re-run `tests/lefty.test.ts` after
  any `resolveShot`/`shotSpread`/`holeView` spray change.
- **Lie awareness on the DECISION bar (the per-shot-popup concern).** A colour-coded `lieChip` (🟢 ok /
  🟠 caution / 🔴 trouble) with the lie's carry+spray effect sits in the play top bar — shown exactly
  when you pick the next shot, so losing/skipping the result popup no longer loses lie awareness.
- **Fast Shots + the result popup.** Default: the per-shot result card waits for a tap (whole backdrop
  dismisses). `fastShots` auto-advances after a beat (`_gsFeel.fastAdvanceMs`), relying on the always-on
  lie chip. The popup/celebration timing all live on `_gsFeel` sub-fields (no new flag).
- **Opt-in pull-back swing gesture (`wireSwingPad`).** With `swingGesture` on, the Hit control becomes
  a backswing pad: drag DOWN to load a power meter (ratcheting haptic), release past the commit
  threshold to swing. PURE FEEL — the released swing fires the SAME action the Hit button would (club +
  aim define the shot), so the sim is untouched. A short pull cancels.
- **One-row SEGMENTED aim control + celebrations + momentum HUD.** Attack | Safe | Aim as one
  `.gs-seg` (was three wrapping buttons); an assetless CSS sparkle `burst()` on made-cut + holed/birdie
  (reduced-motion aware); a `holePips()` rail in the top bar (one pip per hole, coloured by score,
  current ringed).
- **Daily Challenge + install nudge.** A title button starts a run on a date-derived string seed
  (`daily-YYYY-MM-DD`, reuses string-seed support — no new param); `beforeinstallprompt` is captured and
  offered as an in-app "Install app" button (dismiss persists in `gs_installNudge`).
- **Mobile hygiene (`index.html` CSS).** `viewport-fit=cover` + `env(safe-area-inset-*)` (mirrored into
  the `.gs-shot` height math) clear the notch/home-indicator; `touch-action:manipulation` +
  `user-select:none` on controls kill tap-delay/double-tap-zoom/stray selection; responsive putt meter +
  replay canvas + `overflow-x:hidden` stop any horizontal scroll. Canvas/audio/haptic feel is eyes-on;
  DEFERRED from the review: a landscape/tablet layout, first-run coaching coachmarks, a putt drag-back
  gesture, and surfacing per-club/character personality in the UI (see `reports/mobile-ux-review-*`).


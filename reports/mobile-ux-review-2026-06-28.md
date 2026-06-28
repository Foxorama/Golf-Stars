# Mobile UX review — Golf Stars

**Date:** 2026-06-28 · **Lens:** senior mobile design / UX
**Branch:** `claude/mobile-app-ux-review-0ejeab`

Golf Stars is a phone-first PWA (installable, full-bleed play screen), so this review reads every
flow as a thumb-driven, one-handed, in-the-pocket experience. It's split three ways as requested:
**(A)** what I shipped now (immediate, low-risk), **(B)** complex changes worth doing, **(C)** the
S+ tier list — the swings that move it from "passable/average" to "pure gold."

The interactive shell (`app.ts` + `index.html` CSS + the canvas/SVG render layer) is the entire
surface here; the sim is pure and untouched. Determinism and all 384 tests stay green.

---

## A. Shipped now (immediate, low-risk) — commit `461e011`

All DOM/CSS/feel only — no sim, no new `_gs*` hook, no save change.

1. **Safe-area / notch handling.** `viewport-fit=cover` + `env(safe-area-inset-*)` on `.gs-main`
   and mirrored into the fixed `.gs-shot` height math. Previously, with `black-translucent` status
   bar and no inset handling, the top stat bar rendered *under* the notch and the bottom Hit bar
   could sit under the home indicator on an installed PWA. Now both clear.
2. **Touch-target hygiene.** `touch-action: manipulation` + `user-select: none` on all buttons and
   map-nav controls — kills the legacy 300ms tap delay, double-tap-zoom, and stray text-selection
   when dragging the map. The club `◄ ►` arrows (most-tapped control in a round) got a real
   44px-class hit area.
3. **Mis-tap mitigation on the Hit bar.** `🏌 Hit` is now `flex:2` against `» Auto-finish hole`
   `flex:1`, so a fat-finger near the divider lands on Hit instead of silently auto-playing the
   whole hole (a destructive, un-undoable skip that was equal width and right beside the primary).
4. **Fewer taps per shot.** The shot-result popup's entire backdrop is now tap-to-dismiss, not just
   the Continue button — one less precise tap on every non-terminal shot.
5. **No horizontal scroll on any phone.** Responsive putt meter (fits its container vs a fixed
   300px), responsive result-screen replay canvas (`.gs-replay`, scales on narrow phones), and a
   global `overflow-x: hidden` guard so a fixed-width card a hair wider than a tiny viewport clips
   instead of inducing a horizontal-scroll jiggle.
6. **Tactile feedback.** A light `navigator.vibrate` tick on swing/putt commit (guarded + swallowed;
   no-op on desktop/iOS Safari). Cheap, and it makes the swing feel committed in the hand.

**Verified:** Playwright at iPhone-12 (390×844, DPR 3) drove title → character → intro → play;
no horizontal overflow, Hit visible at y=808 < 844, layout reads clean.

---

## B. Complex changes (worth doing, need real work / eyes-on tuning)

**B1. Pinch-to-zoom + two-finger pan on the decision map.** Today zoom is `＋/−` buttons and pan is
a one-finger drag (only when *not* in free-aim). Pinch is the universal expectation for any map;
its absence reads as "this isn't really a map." The plumbing is close — `Projector` already has
focus/viewRadius/unproject and `mapZoom`/`mapPan` are module state — but pointer-event gesture
arbitration (1-finger aim vs pan vs 2-finger pinch) is fiddly and needs careful eyes-on tuning so it
never fights the aim gesture. Pairs with retiring the `＋/−` buttons (or keeping them as an
accessibility fallback).

**B2. Collapse the aim controls into one row.** On a 390px screen the three aim buttons
(`Attack / Play safe (line blocked!) / Free aim`) each wrap onto their own line — three rows of
vertical space that squeeze the map. Make them a single equal-width segmented control (icon +
short label, `Attack | Safe | Free`), and surface the "line blocked!" state as a warning glyph on
Safe rather than inline text that forces a wrap. Frees ~80px of map height.

**B3. Direct-manipulation aiming as the default, not a mode.** Free-aim is currently a *mode* you
toggle with ✋ before you can drag-to-aim; otherwise a drag pans. New players don't discover it.
Consider: a single tap on the map always *previews* an aim there (with an undo/snap-back), drag
adjusts it, and a dedicated two-finger gesture (or the existing buttons) handles pan — so "touch
the green to aim at it" is the first thing that works. This is the single biggest "feels like a
mobile game" lever, but it's a real interaction-model change and must keep auto≡interactive and the
reach-clamp intact.

**B4. Persisted onboarding / first-run coaching.** The play screen is dense (spray %s, carry
window, lie/wind/conditions, Sam reads). A first-time player gets no guided pass. A 3–4 step
coachmark overlay (aim here → read the cone → pick a club → Hit), gated by a `localStorage` flag
(namespaced `gs_*`, like `gs_introSeen`), would carry the learning curve. Complex only because it
needs content + anchored positioning that survives the per-frame re-render.

**B5. Orientation & large-screen handling.** The full-bleed shot screen is portrait-tuned
(`DMAP_W/H = 360/600`, `DMAP_BIAS 0.8`). In landscape (or on a tablet) the tall portrait map
letterboxes hard and the bottom controls crowd. A landscape layout (map left, controls right —
the `.gs-play` two-column path already exists for other screens) would use the space. Needs a
media-query branch in `playingBody` and projector dims, plus eyes-on per orientation.

**B6. Putt meter feel on mobile.** The pace meter is a single sweeping bar you tap to stop. It
works, but it's the one place the "skill" reads as a reflex-timing minigame rather than a *putt*.
Worth prototyping a drag-back-and-release power gesture (pull down from the ball, release at a
pace) with a live distance readout — more golf, more tactile, same `manualPutt` resolver underneath.

---

## C. S+ tier — bad/passable/average → better/best/pure gold

Ranked by impact-to-effort. These are the ideas that change how the game *feels* on a phone.

1. **Juice the contact moment.** The single highest-leverage feel upgrade: on strike, fire a short
   haptic + a punchy SFX + the existing screen-shake, scaled to contact quality (great/hook/shank).
   A holed putt = a rising chime + a celebratory buzz pattern + a burst. The game already computes
   shot quality (`SprayShape` zones) and has screen-shake — wire audio + graded haptics to it.
   *Currently there is no sound at all*, which is the biggest gap between "tech demo" and "game."
   (Audio via a tiny WebAudio synth = no asset to 404, on-brand with the house "no downloaded asset"
   rule.)

2. **A real "swing" input option.** The shot is a button. A space-golf game on a phone wants a
   *swing*: an optional drag-back-aim-and-flick on the map (pull back to set power along the aim
   line, arc the drag to shape the shot, release to hit) — power and shape from one gesture, with
   the spray cone responding live. Keep the button + cone as the precise/accessible path; offer the
   gesture as the expressive one. This is the thing people would screenshot.

3. **Persistent, glanceable run HUD with momentum.** The cut chase is the spine, but it's a small
   chip. Make the run's stakes legible at a glance: a slim progress rail (holes done, points banked
   vs cut, credits) that animates when you bank a point, plus a "you need X over the last Y holes"
   read. Turn the cut from a number into a felt pressure curve.

4. **Tighten the per-shot loop to near-zero friction.** Count the taps in a hole: aim → (maybe
   cycle club) → Hit → watch → dismiss popup → repeat → putt-meter. The popup-per-shot is the
   friction tax. Option: make the popup *opt-in* (auto-advance after a beat with a "details" peek)
   or fold the result into a non-blocking toast over the map so the next decision is instant. A fast
   loop is what makes "one more run" happen.

5. **Bag & shot personality you can feel.** Clubs and characters are mechanically distinct but read
   the same on screen. Give each club a tiny identity in the UI (a trail colour, a launch sound, a
   distinctive cone shape preview) and let the character's signature shape (Feather's fade, Huang's
   hooky driver) telegraph *before* the swing with an animated cone bias. Make the loadout feel
   owned.

6. **Reward moments that punch.** Making the cut, a rare club drop, a chip-in (Dr Chipinski),
   levelling a meta upgrade — these are flat HTML today. A short, skippable celebration (the intro
   cinematic's vocabulary: constellation burst, shard shower) on the big beats turns progression
   into dopamine. Reuse `introView`'s sprite-glow + particle kit; gate skippable.

7. **One-handed reachability.** On a tall phone the top stat bar and map-nav (top-right) are a
   stretch for a thumb. Keep *all* primary actions in the bottom third (already mostly true) and
   consider mirroring the overview/zoom controls to a bottom-edge cluster so the whole loop is
   playable without re-gripping.

8. **Haptic vocabulary.** Beyond the swing tick: distinct patterns for great contact vs miss,
   in-the-band putt vs lipped out, made cut vs missed cut. A consistent haptic language makes the
   game readable with the sound off (how phones are actually used). Cheap, and almost nobody does it.

9. **Settings that respect the player.** A small settings sheet: sound on/off, haptics on/off,
   reduced-motion (already half-respected via the intro), left-handed control mirroring, and a
   "fast mode" that skips the per-shot popup. Low effort, high "this app respects me" signal.

10. **Install & retention polish.** A tasteful "Add to Home Screen" nudge (after a first completed
    run, not on load), a daily-seed challenge (the deterministic RNG already supports it — a
    `?seed=` from the date), and a streak. The deterministic seed is a gift for shareable daily
    runs; nothing exploits it yet.

---

## Build log — what shipped after the review (GS-mux)

Following the review, the bulk of B + C was built across five tested waves (sim untouched,
determinism intact, 387 tests + build + hub guards green):

| Item | Status |
|---|---|
| C1 Audio (assetless WebAudio) | ✅ shipped — fired at the true strike via `playView.onImpact` |
| C8 Haptic vocabulary | ✅ shipped |
| C9 Settings sheet | ✅ shipped (sound/haptics/fast-shots/swing/left-handed/reduced-motion) |
| C4 Lie awareness + fast loop | ✅ shipped — decision-bar lie chip + Fast Shots auto-advance |
| C6 Celebration bursts | ✅ shipped (assetless, reduced-motion aware) |
| C3 Run-momentum HUD | ✅ shipped — per-hole pip rail |
| C10 Daily seed + install nudge | ✅ shipped |
| B2 Segmented aim control | ✅ shipped |
| B3 Tap-to-aim by default | ✅ shipped (tap aims, drag pans) |
| B1 Pinch-to-zoom | ✅ shipped — needs multi-touch eyes-on confirmation |
| C2 Swing input | ✅ shipped as an **opt-in** pull-back gesture (pure feel, sim untouched) |
| New caddies | ✅ Sandy (escape specialist, new `lieRelief` mechanic) + Mystic Mole (manual-putt) |
| B4 First-run coaching | ⬜ deferred — needs content + anchored coachmarks |
| B5 Landscape/tablet layout | ⬜ deferred — needs a media-query layout branch + eyes-on per orientation |
| B6 Putt drag-back gesture | ⬜ deferred — the pace meter still stands |
| C5 Bag/shot personality in UI | ⬜ deferred — clubs/characters are mechanically distinct but not yet surfaced |

The two flagged concerns were addressed directly: **lie awareness** moved to the decision bar
(shown when you choose the next shot, so the popup is no longer the only carrier), and the
**swing pull-down** is opt-in (default off) so it never forces itself on every shot.

## Notes / non-goals

- All "feel" knobs already route through `_gsFeel` and the test hub auto-discovers `_gs*` hooks —
  any new tunable from the above (e.g. an audio gain or haptic-strength flag) must add the matching
  hub control in the same PR (the I4 rule / `keep-test-hub-in-sync` skill).
- Audio and richer haptics are the two biggest absent senses; both can be done assetless and
  on-brand. Start there (C1) — it's the cheapest path to the largest perceived-quality jump.

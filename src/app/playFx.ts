/**
 * The play screen's non-DOM-structure side-effects: the ambient MUSIC bridge, the animated WEATHER
 * overlay mounted over the aim/putt map, and the caddy-voice / tent-bonk FEEL cues wired into the
 * play view. These are time/audio/canvas effects (not reducer state); app.ts owns their lifecycle
 * (tear-down on dispatch/render) and passes the live state in.
 */

import { state } from './ctx';
import { currentEffect, holeBiome, holeThemeId, rainbowActive } from './helpers';
import { archetypeFor } from '../sim/course/themes';
import { setMusicScene, type MusicSceneId } from '../render/music';
import { setWeatherAmbience } from '../render/weatherAudio';
import { holeProjector, type Projector, type ProjectOptions } from '../render/project';
import { createWeather } from '../render/weather';
import { createCetusFlow } from '../render/cetusFlow';
import { createShipDrift } from '../render/shipDrift';
import { meteorScorch } from '../sim/scorch';
import { artFeel } from '../render/style';
import { CADDY_VOICE } from '../render/caddyArt';
import { speakCaddy } from '../render/speech';
import { sfx } from '../render/audio';
import { HAPTICS, haptic } from '../render/haptics';
import { getSettings } from '../settings';
import { type Hole, type Vec } from '../sim/course/contract';

/** Drive the ambient music layer (GS-audio-2) off the current screen: the stop's world theme
 *  while golf is on screen (playing/result — the hole under view picks the track, so a
 *  split-biome stop's back holes switch), the clubhouse lull everywhere else. Also drives the
 *  WEATHER AMBIENCE layer (GS-weather-audio) off the route's course effect while golf is on screen
 *  (a subtle bed under the music — a blizzard howls, a storm crackles), silent everywhere else. Both
 *  are cheap no-ops when unchanged, so it's safe on render()'s hot path (power-pull re-renders). */
export function syncMusic(): void {
  let sceneId: MusicSceneId = 'menu';
  const hole =
    state.screen === 'playing' && state.play
      ? state.play.hole
      : state.screen === 'result' && state.played
        ? state.course.holes[state.viewHole] ?? state.course.holes[0]
        : undefined;
  if (hole) sceneId = archetypeFor(holeThemeId(hole), holeBiome(hole));
  setMusicScene(sceneId);
  // The weather bed only sounds where the weather is on screen (a golf hole under view); the menu /
  // travel / shop screens stay dry. `currentEffect()` is the run's chosen sky (undefined ⇒ clear).
  setWeatherAmbience(hole ? currentEffect() ?? 'none' : null);
}

/** The per-hole weather seed — shared by the play view + the aim/putt overlay so the sky reads
 *  identically across screens (a quiet hand-off from lining up to watching the shot). */
function weatherSeed(hole: Hole): number {
  return (Math.round(hole.tee[0] * 7 + hole.green[1] * 13 + hole.par * 101) >>> 0) ^ 0x51ed;
}

/** A `_gsFeel` flow-speed sub-field (cetusFlowSpeed / shipDriftSpeed), defaulting to 1 — the same
 *  escape-hatch the play view reads, so the aim-overlay decor honours the identical tunable. */
function feelSpeed(key: 'cetusFlowSpeed' | 'shipDriftSpeed'): number {
  const f = (window as unknown as { _gsFeel?: Record<string, number> })._gsFeel ?? {};
  const v = f[key];
  return typeof v === 'number' ? v : 1;
}

/**
 * A projector that maps course space onto the OVERLAY CANVAS pixels so an animated decor twin (the
 * Cetus star-waterfall, the derelict's drifting junk, a meteor strike) sits EXACTLY on the static SVG
 * map beneath it (GS-cetus-flow / GS-ship-feel / GS-meteor-strikes on the aim/putt screen). The SVG
 * has a fixed `viewBox` (DMAP_W×DMAP_H) that CSS scales into the container by the default
 * `preserveAspectRatio` (meet — uniform, centred), so we build the map's OWN projector at the viewBox
 * size and compose the meet-fit letterbox transform onto the canvas's real pixels. Only valid in
 * FOCUS mode (the SVG's whole-hole fit folds in `extra` points this can't see) — the caller gates it.
 */
function alignedProjector(hole: Hole, mapProj: ProjectOptions, cw: number, ch: number): Projector {
  const vbW = mapProj.width ?? 360;
  const vbH = mapProj.height ?? 640;
  const base = holeProjector(hole, mapProj);
  const s = Math.min(cw / vbW, ch / vbH); // meet-fit: scale the viewBox uniformly to fit the canvas
  const ox = (cw - vbW * s) / 2;
  const oy = (ch - vbH * s) / 2;
  return {
    width: cw,
    height: ch,
    scale: base.scale * s,
    project: (p) => {
      const q = base.project(p);
      return [ox + q[0] * s, oy + q[1] * s];
    },
    unproject: (px, py) => base.unproject((px - ox) / s, (py - oy) / s),
  };
}

/**
 * Mount the animated, SCREEN-SPACE weather overlay over the aim/putt map (GS-journey-fx rework) so the
 * sky + air are alive while you line up — not just during ball flight (the in-flight view draws the
 * SAME weather from the shared module). `up` orients the wind to read true relative to the shot. A
 * transparent, pointer-events-none canvas so the pull-to-shot gesture passes straight through.
 *
 * Returns a `{ destroy() }` handle app.ts stores as its live `weatherOverlay` (or `null` when the
 * element is unmeasurable / has no 2D context — the old early-return path). `dims` carries the
 * decision map's framing (DMAP_W/H fallback size + focusBias), kept in app.ts with the map geometry.
 */
export function mountWeatherOverlay(
  el: HTMLElement,
  hole: Hole,
  up: Vec,
  dims: { width: number; height: number; focusBias: number },
  align?: {
    /** The SVG map's projector options (focus/viewRadius/focusBias/up + viewBox width/height) so the
     *  overlay's course-space decor lines up pixel-for-pixel with the map beneath. FOCUS mode only. */
    mapProj: ProjectOptions;
    /** Draw the world-decor twins (moving Cetus river / drifting ship junk). Off on the putt screen —
     *  the tight green zoom floats the debris weirdly (GS bug: "very small … looks super weird"). */
    drift: boolean;
    /** The route brought a meteor shower with scorch craters — animate a strike diving into them. */
    meteorScorch: boolean;
  },
): { destroy(): void } | null {
  const cw = Math.round(el.clientWidth || dims.width);
  const ch = Math.round(el.clientHeight || dims.height);
  if (cw < 2 || ch < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cw * dpr;
  cv.height = ch * dpr;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:10px;';
  el.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);
  // Course-space decor twins over the aim/putt map (GS-cetus-flow / GS-ship-feel / GS-meteor-strikes):
  // the play view animated these only while WATCHING a shot — on the static aim/putt screen the river,
  // debris and craters sat frozen. Build a projector aligned to the SVG map (focus mode only) and draw
  // the SAME moving decor over it, so the world is just as alive while you line up.
  const arch = archetypeFor(holeThemeId(hole), holeBiome(hole) ?? '');
  const aligned = align ? alignedProjector(hole, align.mapProj, cw, ch) : null;
  const cetusFlow = aligned && align!.drift && arch === 'cetus' && !rainbowActive() ? createCetusFlow(hole) : null;
  const shipDrift = aligned && align!.drift && arch === 'derelict' && !rainbowActive() ? createShipDrift(hole) : null;
  // The meteor-shower's scorch craters, projected through the aligned projector so a strike lands
  // exactly on a drawn crater (createWeather ignores this unless the effect IS the meteor shower).
  const scorchMarks = aligned && align!.meteorScorch ? meteorScorch(hole) : [];
  // Wind screen-direction via a projector oriented the same way the map is (shot pointing up).
  const proj = holeProjector(hole, { width: cw, height: ch, focus: hole.tee, up, viewRadius: 80, focusBias: dims.focusBias });
  const rad = ((hole.wind?.dir ?? 0) * Math.PI) / 180;
  const a = proj.project(hole.tee);
  const b = proj.project([hole.tee[0] + Math.sin(rad), hole.tee[1] + Math.cos(rad)]);
  let wdx = b[0] - a[0];
  let wdy = b[1] - a[1];
  const wl = Math.hypot(wdx, wdy) || 1;
  // Star-mask (GS-rough-frame): this overlay sits on the SVG decision map, whose land now fills to
  // the OB frame — but the local projector above is only wind-orientation, NOT the map's exact fit,
  // so a projected land mask would lie. Land dominates the aim framing on every normal hole, so the
  // pinned twinkle stars are simply kept off the whole overlay there; a lost-rough hole or Rainbow
  // Road is mostly open deep, where the twinkle belongs (unmasked). Shooting star/meteors/ambient
  // air stay on either way — motion sells them as sky, not ground.
  const landDominant = !rainbowActive() && !(hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false);
  const overlayMask: Vec[][] = [
    [
      [0, 0],
      [cw, 0],
      [cw, ch],
      [0, ch],
    ],
  ];
  const w = createWeather({
    effect: currentEffect() ?? 'none',
    width: cw,
    height: ch,
    archetype: archetypeFor(holeThemeId(hole), holeBiome(hole) ?? ''),
    windSpd: hole.wind?.spd ?? 0,
    windDir: [wdx / wl, wdy / wl],
    seed: weatherSeed(hole),
    starMask: () => (landDominant ? overlayMask : null),
    // Meteor STRIKES on the aim/putt screen too (GS-meteor-strikes): with an aligned projector the
    // craters' screen positions are honest, so a meteor can dive into one while you line up — not
    // only mid-flight. Empty/absent → no strikes (the old aim-overlay behaviour).
    strikeTargets:
      aligned && scorchMarks.length
        ? () => scorchMarks.map((m) => ({ c: aligned.project(m.c), r: Math.max(4, m.r * aligned.scale) }))
        : undefined,
  });
  const reduced = getSettings().reducedMotion;
  let raf = 0;
  let live = true;
  const tick = (now: number): void => {
    if (!live || !cv.isConnected) return;
    ctx.clearRect(0, 0, cw, ch);
    w.draw(ctx, now);
    // The animated world-decor twins, over the weather but sharing this pointer-through canvas. The
    // Cetus river draws in OVERLAY mode (no opaque bed — the SVG's static river is the bed beneath, so
    // the ball marker + aim cone stay readable); the ship junk draws normally (it floats in the space
    // off the deck, never over the cone). Both no-op when their world/handle is absent.
    if (aligned) {
      const accents = artFeel().accents;
      cetusFlow?.draw(ctx, aligned, now, accents, feelSpeed('cetusFlowSpeed'), true);
      shipDrift?.draw(ctx, aligned, now, accents, feelSpeed('shipDriftSpeed'));
    }
    if (!reduced) raf = requestAnimationFrame(tick);
  };
  tick(performance.now());
  return {
    destroy() {
      live = false;
      cancelAnimationFrame(raf);
      cv.remove();
    },
  };
}

/** Play a caddy's signature voice line + haptic when its effect fires in the play view (GS-caddy-
 *  voices) — wired to the play view's `onCaddyEffect`. Gated/guarded inside `speakCaddy`. */
export function playCaddyVoice(id: string): void {
  const v = CADDY_VOICE[id as keyof typeof CADDY_VOICE];
  if (!v) return;
  speakCaddy(v.speech, v.lang, { rate: v.rate, pitch: v.pitch });
  haptic(HAPTICS.caddy);
}

/** Ball bonks a trade-camp tent (GS-tents): the canvas already pops an "Ow!"/"Watch it!" bubble — back
 *  it with a soft bonk sound, a haptic, and a spoken yelp (a startled trader). Pure feel; guarded. */
export function playTentBonk(text: string): void {
  sfx.bonk();
  haptic(HAPTICS.tap);
  speakCaddy(text, 'en-GB', { rate: 1.1, pitch: 1.2 });
}

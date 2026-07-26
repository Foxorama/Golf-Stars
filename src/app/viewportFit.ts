/**
 * How much screen the layout ACTUALLY has, in the units it lays out in (GS-a11y-tight-fit).
 *
 * `--gs-uiscale` is applied as `zoom` on `<html>`, so a phone at the top rung lays out in
 * 390 ÷ 1.45 = 269 × 582 units, not 390 × 844. **A media query cannot see this** — `zoom` shrinks the
 * layout box but leaves the media-query viewport at its physical size, so `@media (max-width: 320px)`
 * is still false on a 375px phone at 1.45× (the lesson written up as GS-a11y-scale-wrap).
 *
 * Most of the answer to that is intrinsic sizing — `overflow-wrap`, `min-width: 0`, `auto-fit` tracks —
 * and that is always the first thing to reach for. But a handful of layouts are a genuine either/or
 * that no amount of wrapping resolves: the play HUD's bottom bar either flanks the controls panel with
 * the caddy badge and the auto-finish button, or it doesn't, and at 269 units of width flanking them
 * leaves the panel 135 units to lay out in — which is what turned a 265-unit control stack into a
 * 380-unit one that swallowed the golf.
 *
 * So this stamps ONE attribute on `<html>` — `data-gs-fit="tight"` — and CSS branches on it exactly
 * where a breakpoint would have, but with the scale folded in. Nothing else in the app may compute a
 * scaled viewport itself; import from here (the same rule `render/pixelRatio.ts` holds for DPR).
 *
 * The threshold is deliberately generous: at the two lower rungs a phone stays roomy, so the play
 * screen the player already knows is untouched, and only the rungs that genuinely run out of room
 * reflow. A small phone (320 × 568) reads tight at the ship scale too — correctly; the same squeeze
 * applies there and always did.
 */

import { clampUiScale, getSettings } from '../settings';

/** Below this many layout units of HEIGHT (or width) a screen is "tight" and may reflow. */
export const TIGHT_H = 660;
export const TIGHT_W = 330;

/** The viewport in LAYOUT units — physical CSS px divided by the root zoom. Pure given its inputs. */
export function effectiveViewport(w: number, h: number, uiScale: number): { w: number; h: number } {
  const s = clampUiScale(uiScale) || 1;
  return { w: w / s, h: h / s };
}

/** Does this much room count as tight? Pure, so the thresholds are testable without a browser. */
export function isTightFit(v: { w: number; h: number }): boolean {
  return v.h < TIGHT_H || v.w < TIGHT_W;
}

/**
 * Stamp `data-gs-fit` on `<html>`. Guarded like `applyReaderSettings` so the node-side sim and the
 * tests can import this module freely.
 */
export function applyViewportFit(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const v = effectiveViewport(window.innerWidth, window.innerHeight, getSettings().uiScale);
  document.documentElement.setAttribute('data-gs-fit', isTightFit(v) ? 'tight' : 'roomy');
}

/**
 * Keep it current. A rotation or a desktop resize changes the answer, and so does the UI-scale
 * setting — `applyReaderSettings` calls straight through, so the two always move together.
 */
export function watchViewportFit(): void {
  if (typeof window === 'undefined') return;
  applyViewportFit();
  window.addEventListener('resize', applyViewportFit);
  window.addEventListener('orientationchange', applyViewportFit);
}

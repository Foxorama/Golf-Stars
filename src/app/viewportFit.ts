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

/**
 * The phone the game is composed for (an iPhone 14) — the shape every display lays out AS.
 *
 * EVERY DISPLAY LAYS OUT AS THE PHONE THE GAME IS COMPOSED FOR (GS-ui-display-scale). The flow
 * screens are `.gs-main` at a fixed 820px with inner caps and hard-px type, so nothing about them
 * is height-derived and nothing about them grew: measured at 1920×1080 the Star Tour round recap
 * was a **460×390 island of phone-sized UI** — 32% dead below it and ~76% dead across.
 *
 * The fix is not a per-screen layout pass but a scale: a display with 1080px of height lays out in
 * 844 units drawn 1.28× larger. That reaches all ~20 flow screens at once, and it composes with —
 * never replaces — the player's own choice, because the player owns their type
 * (GS-a11y-readable-text): `--gs-uiscale` is the PRODUCT of the two halves.
 *
 * It reads BOTH axes. Height alone is the axis that matters on every real display, but a viewport
 * NARROWER in proportion than the composed-for phone (a folded foldable at 344×882, a tall thin
 * window) would be zoomed on the strength of its height and handed even less width to lay out in —
 * 329 units, which trips `TIGHT_W` and reflows the play HUD on a device that was fine. So the scale
 * is the SMALLER of the two ratios: it only ever fires when the display genuinely has more room
 * than the phone in both directions.
 */
export const DISPLAY_BASE_W = 390;
export const DISPLAY_BASE_H = 844;

/**
 * The ceiling. 1440p and 4K stop here rather than rendering the HUD at 1.71×/2.56×; a capped 1440p
 * still lays out as a 960-unit-tall phone-shaped screen, which is comfortably bigger without
 * becoming a billboard.
 */
export const DISPLAY_SCALE_MAX = 1.5;

/**
 * How much bigger this display is than the composed-for phone, clamped to [1, DISPLAY_SCALE_MAX].
 *
 * Never below 1 — a display SMALLER than the phone (the itch embed's 820×760, a 320×568 handset)
 * must be left exactly as it is, and shrinking the UI there would be the opposite of the fix.
 * Deliberately a smooth ramp rather than a breakpoint: a media query could see the raw viewport
 * here — this is the other direction from the usual GS-a11y-scale-wrap warning — but it can only
 * STEP, and a visible jump mid-resize is worse than the ramp the resize listener already gives.
 */
export function displayScale(w: number, h: number): number {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return 1;
  const ratio = Math.min(w / DISPLAY_BASE_W, h / DISPLAY_BASE_H);
  if (!Number.isFinite(ratio)) return 1;
  return Math.min(DISPLAY_SCALE_MAX, Math.max(1, ratio));
}

/**
 * THE root zoom: the reader's own scale MULTIPLIED by the display's. Pure, and the single
 * description of the product that `--gs-uiscale`'s `calc()` expresses in CSS.
 */
export function uiScaleOf(readerScale: number, w: number, h: number): number {
  return (clampUiScale(readerScale) || 1) * displayScale(w, h);
}

/** The viewport in LAYOUT units — physical CSS px divided by the root zoom. Pure given its inputs. */
export function effectiveViewport(w: number, h: number, readerScale: number): { w: number; h: number } {
  const s = uiScaleOf(readerScale, w, h);
  return { w: w / s, h: h / s };
}

/** Does this much room count as tight? Pure, so the thresholds are testable without a browser. */
export function isTightFit(v: { w: number; h: number }): boolean {
  return v.h < TIGHT_H || v.w < TIGHT_W;
}

/**
 * Stamp the display's half of the root zoom and `data-gs-fit` on `<html>`. Guarded like
 * `applyReaderSettings` so the node-side sim and the tests can import this module freely.
 *
 * The two go together and in this order: the fit attribute is a question about the viewport in
 * LAYOUT units, and the scale is one of the two things that decides how many of those there are.
 * `window.innerWidth/innerHeight` are the viewport in physical CSS px and root `zoom` does not
 * change them, so there is no feedback loop between writing the scale and reading the viewport.
 */
export function applyViewportFit(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const { innerWidth: w, innerHeight: h } = window;
  document.documentElement.style.setProperty('--gs-displayscale', String(displayScale(w, h)));
  const v = effectiveViewport(w, h, getSettings().uiScale);
  document.documentElement.setAttribute('data-gs-fit', isTightFit(v) ? 'tight' : 'roomy');
}

/**
 * Are we inside somebody else's page? (GS-embed-scroll)
 *
 * Pure, so the predicate is testable without a frame. `window.top` is cross-origin from an embed,
 * and merely COMPARING the references is allowed — but a hardened browser can still throw, and a
 * throw here would take out boot, so the caller treats any error as "embedded". That is the safe
 * default: self-scrolling works in a normal tab too, it is only worse for the mobile address bar.
 */
export function isEmbedded(self: unknown, top: unknown): boolean {
  return self !== top;
}

/**
 * Stamp `data-gs-embed` on `<html>` when the game is running inside an iframe.
 *
 * WHY IT MATTERS: itch.io serves HTML5 games in an iframe with `scrolling="no"`, so the game's
 * DOCUMENT CANNOT SCROLL AT ALL — a wheel over the game scrolls the store page behind it instead.
 * Measured in that exact setup, the Pro Shop is 1388px of content in an 860px frame and **528px of
 * it was unreachable**: the rack simply ended. Every taller screen (shipyard, clubhouse, locker,
 * the Story bar) had the same hole.
 *
 * This is the rule the overlays already follow (GS-a11y-sheet-scroll — a box bigger than the
 * viewport is unreachable content, so it caps itself and scrolls INSIDE), never applied to the page
 * frame because in an ordinary tab the document scrolls and the bug cannot happen.
 *
 * Keyed on "in an iframe" rather than on "the iframe forbade scrolling", which is not observable
 * from inside: an iframe that DOES allow scrolling works fine either way, so the broader predicate
 * is safe. And it is deliberately NOT applied everywhere — a self-scrolling page on mobile web
 * stops the browser's address bar collapsing, which costs a real slice of screen for no gain in a
 * context that was never broken.
 */
export function applyEmbedFlag(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  let embedded = false;
  try {
    embedded = isEmbedded(window.self, window.top);
  } catch {
    embedded = true; // cross-origin lockdown ⇒ certainly not the top document
  }
  if (embedded) document.documentElement.setAttribute('data-gs-embed', '1');
  else document.documentElement.removeAttribute('data-gs-embed');
}

/**
 * Keep it current. A rotation or a desktop resize changes the answer, and so does the UI-scale
 * setting — `applyReaderSettings` calls straight through, so the two always move together.
 */
export function watchViewportFit(): void {
  if (typeof window === 'undefined') return;
  applyViewportFit();
  applyEmbedFlag(); // cannot change after load, so it is stamped once alongside the first fit
  window.addEventListener('resize', applyViewportFit);
  window.addEventListener('orientationchange', applyViewportFit);
}

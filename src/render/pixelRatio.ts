/**
 * Canvas backing-store resolution (GS-a11y-readable-text).
 *
 * Every animated surface in the game sizes its canvas the same way: draw in LAYOUT CSS pixels,
 * size the backing store to `cssPx * devicePixelRatio`, then `ctx.scale(r, r)` so the drawing code
 * can stay in CSS units. That is correct right up until the root element is zoomed.
 *
 * The "Text and interface size" setting puts `zoom` on `<html>`. Zoom does not change an element's
 * LAYOUT size — a 259px-wide box stays 259 layout px — but it does change how many DEVICE pixels
 * that box covers on screen (259 × zoom × dpr). Size the backing store off the layout width alone
 * and the canvas is stretched by the compositor: at 1.45× on a dpr-2 phone the play view was
 * rendering at 0.69× the resolution it was displayed at, i.e. visibly soft — on the one screen the
 * whole setting exists to make easier to read.
 *
 * So: fold the root zoom into the ratio. Drawing code is unchanged (still CSS px), it just gets a
 * denser backing store when the player has scaled the UI up.
 *
 * The cap is memory, not quality: the play canvas is full-screen, and area grows with the SQUARE of
 * this number. 3 covers dpr 2 × the 1.45 top rung with room to spare.
 */

const MAX_RATIO = 3;

/**
 * The root `zoom` factor, or 1 when unzoomed / unsupported / outside a browser. Read from the
 * COMPUTED style rather than the settings blob so this stays true even if something else zooms the
 * page, and so the render layer never has to import the preferences layer.
 */
export function rootZoom(): number {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return 1;
  try {
    // Chrome reports a unitless number; other engines may report `normal` or nothing at all.
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = parseFloat(raw);
    return Number.isFinite(z) && z > 0 ? z : 1;
  } catch {
    return 1; // a cosmetic measurement must never break a draw loop
  }
}

/**
 * The ratio to size a canvas backing store by, and to `ctx.scale()` with. Replaces the bare
 * `Math.min(2, devicePixelRatio)` every animated surface used to compute for itself.
 */
export function canvasRatio(): number {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  return Math.min(MAX_RATIO, Math.min(2, dpr) * rootZoom());
}

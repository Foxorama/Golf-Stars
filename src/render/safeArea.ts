/**
 * Safe-area insets, measured in CSS pixels (GS-play-safearea).
 *
 * CSS can reserve the notch / status bar / gesture bar with `env(safe-area-inset-*)`, but the
 * full-bleed play screen draws its HUD INSIDE a canvas — and a canvas is one opaque box to CSS, so
 * `env()` cannot reach anything painted in it. Text drawn at canvas y=8 lands underneath the system
 * clock on any device with a status bar over the content.
 *
 * `env()` also can't be read directly from JS: `getComputedStyle` hands back the literal `env(...)`
 * token rather than a resolved length. The portable trick is to let the BROWSER resolve it — park a
 * hidden probe whose padding IS the inset, then measure the box it produces.
 *
 * Cached, because this is called from a rAF draw loop and a layout read per frame would be silly.
 * The cache is cleared on resize/orientation change, which is when insets can actually change.
 */

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

let cached: SafeAreaInsets | null = null;
let listening = false;

/** Measure the insets by letting the browser resolve `env()` into a real box. */
function measure(): SafeAreaInsets {
  if (typeof document === 'undefined') return ZERO; // node / headless sim — no DOM, no notch
  try {
    const probe = document.createElement('div');
    // `position: fixed` so the insets resolve against the VIEWPORT, not a positioned ancestor.
    // Zero-size + hidden so it can never paint or affect layout; padding carries the measurement.
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v: string): number => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    const out: SafeAreaInsets = {
      top: px(cs.paddingTop),
      right: px(cs.paddingRight),
      bottom: px(cs.paddingBottom),
      left: px(cs.paddingLeft),
    };
    probe.remove();
    return out;
  } catch {
    return ZERO; // never let a cosmetic measurement break a draw loop
  }
}

/**
 * The current safe-area insets in CSS pixels. Cheap after the first call.
 *
 * Canvas note: these are CSS pixels. A canvas backing store scaled by `devicePixelRatio` needs them
 * multiplied by the same ratio — UNLESS the drawing context is already `scale(dpr, dpr)`d, in which
 * case its user-space units ARE CSS pixels and these apply directly.
 */
export function safeAreaInsets(): SafeAreaInsets {
  if (cached) return cached;
  cached = measure();
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    const invalidate = (): void => {
      cached = null;
    };
    try {
      window.addEventListener('resize', invalidate);
      window.addEventListener('orientationchange', invalidate);
    } catch {
      /* ignore — a stale inset is far better than a thrown listener */
    }
  }
  return cached;
}

/** Test/debug seam: drop the cached measurement so the next read re-measures. */
export function resetSafeAreaCache(): void {
  cached = null;
}

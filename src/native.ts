/**
 * Native-shell detection (GS-android) — the ONE place that answers "are we inside the Capacitor
 * Android app rather than a browser?".
 *
 * Capacitor injects the `Capacitor` global into the WebView before any app code runs; in a browser
 * it is simply absent. Kept out of `app.ts` so the render layer can ask too without importing the
 * app shell, and deliberately dependency-free so it stays safe to call from a draw loop or from a
 * node import (no DOM ⇒ `false`).
 *
 * Two consumers today, for opposite reasons:
 *   - `app.ts` disables the PWA service worker in the shell (Capacitor serves from
 *     `https://localhost`, which passes the protocol guard, so an un-gated worker would cache
 *     already-local assets and resurrect the stale-serve bug).
 *   - `render/haptics.ts` routes to the Capacitor plugin, because the WebView never granted the
 *     Vibration API the permission it needs.
 */
export function isNativeShell(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false;
  } catch {
    return false;
  }
}

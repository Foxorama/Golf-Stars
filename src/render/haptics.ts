import { getSettings } from '../settings';
import { isNativeShell } from '../native';

/**
 * Haptic patterns + the guarded trigger. Feel-only (gated on the haptics setting, and wrapped so an
 * unsupported backend can never throw into a draw loop or a shot resolution).
 *
 * WHY THERE ARE TWO BACKENDS (GS-native-haptics). The web build uses `navigator.vibrate`, which works
 * in Chrome. Inside the Capacitor shell it silently does NOTHING: the Vibration API needs the app to
 * hold `android.permission.VIBRATE`, and a bare Capacitor project declares only `INTERNET`. So every
 * buzz in the packaged game was a no-op — the API is present, the call succeeds, and nothing happens,
 * which is exactly why it read as "haptics were never implemented". Installing `@capacitor/haptics`
 * merges the VIBRATE permission in AND gives us the real OS haptic engine, which feels considerably
 * better than a raw vibrator pulse.
 *
 * The `haptic(pattern)` seam is UNCHANGED, so every existing call site keeps working untouched.
 */
export const HAPTICS = {
  tap: 8,
  swing: 16,
  putt: 10,
  good: [10, 30, 14] as number[], // pure contact / made putt
  bad: 40, // penalty / missed cut — one heavy buzz
  holeOut: [12, 28, 12, 28, 20] as number[],
  madeCut: [10, 40, 10, 40, 18] as number[],
  ace: [18, 40, 18, 40, 18, 40, 30] as number[], // the biggest beat — a long celebratory roll
  win: [16, 40, 16, 40, 16, 60, 24, 60, 34] as number[], // voyage won — a long, building victory roll
  eagle: [14, 30, 14, 30, 22] as number[], // a two-under — a sharp triumphant burst (the eagle's cry)
  albatross: [10, 40, 10, 40, 16, 60, 28] as number[], // a three-under — a long majestic swell
  caddy: [14, 30, 14] as number[], // a caddy's signature effect lands (guard save / chip-in)
};

/** The slice of `@capacitor/haptics` we use — structural, so nothing has to import the plugin for
 *  its types in the web build. */
interface HapticsPlugin {
  impact(options: { style: string }): Promise<void>;
}

/** undefined = never attempted · null = unavailable (web, or the import failed) · object = ready. */
let plugin: HapticsPlugin | null | undefined;
let loading = false;

/**
 * Start loading the native plugin. Called once from boot so the engine is ready long before the first
 * swing — loading lazily on first use would silently drop that buzz while the chunk resolved.
 * No-op in a browser: the dynamic import never runs, so the web build never pays for it.
 */
export function primeHaptics(): void {
  if (plugin !== undefined || loading || !isNativeShell()) return;
  loading = true;
  import('@capacitor/haptics')
    .then((m) => {
      plugin = (m as unknown as { Haptics?: HapticsPlugin }).Haptics ?? null;
    })
    .catch(() => {
      plugin = null; // fall through to navigator.vibrate, which at worst is another no-op
    });
}

/** Bucket a pulse length (ms) onto the OS impact styles. The native engine has WEIGHTS, not
 *  durations, so an 8ms tick and a 40ms thud have to become Light and Heavy. */
function styleFor(ms: number): string {
  if (ms <= 10) return 'LIGHT';
  if (ms <= 20) return 'MEDIUM';
  return 'HEAVY';
}

/** Web fallback: the raw Vibration API. Real in Chrome, a silent no-op in an unpermitted WebView. */
function webVibrate(pattern: number | number[]): void {
  (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
}

/**
 * Play one pattern natively. A scalar is a single weighted impact; an ARRAY is a
 * `[on, off, on, off…]` vibration pattern, and its RHYTHM is what sells a celebration roll — so it
 * replays as impacts scheduled at the cumulative offsets rather than collapsing into one buzz.
 * Capped at 8 pulses so a long pattern can't queue a silly number of timers.
 */
function nativePlay(p: HapticsPlugin, pattern: number | number[]): void {
  const hit = (ms: number): void => {
    void p.impact({ style: styleFor(ms) }).catch(() => {});
  };
  if (typeof pattern === 'number') {
    hit(pattern);
    return;
  }
  let at = 0;
  let fired = 0;
  for (let i = 0; i < pattern.length && fired < 8; i += 2) {
    const on = pattern[i] ?? 0;
    const gap = pattern[i + 1] ?? 0;
    if (at === 0) hit(on);
    else {
      const delay = at;
      setTimeout(() => hit(on), delay);
    }
    fired++;
    at += on + gap;
  }
}

/** Fire a haptic. Silent when the player has haptics off, and never throws. */
export function haptic(pattern: number | number[]): void {
  if (!getSettings().haptics) return;
  try {
    if (isNativeShell()) {
      if (plugin) {
        nativePlay(plugin, pattern);
        return;
      }
      // Not ready yet (or unavailable) — make sure the load is under way, then fall through. In the
      // shell that fallback is itself a no-op, so at worst this single buzz is missed.
      primeHaptics();
    }
    webVibrate(pattern);
  } catch {
    /* unsupported — never let a feel-only effect throw */
  }
}

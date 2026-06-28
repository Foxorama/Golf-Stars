/**
 * Player settings — a tiny localStorage-backed preferences layer (NOT reducer state, NOT a
 * `_gs*` dev hook). These are view/feel choices the player owns: sound, haptics, reduced motion,
 * left-handed control mirroring, and a "fast shots" loop that auto-advances the per-shot result
 * instead of waiting for a tap. Read by `app.ts` (and the audio/haptic helpers); never by the
 * pure sim, so determinism is untouched.
 *
 * Persistence lives here (a side-effect, like the save in main.ts), keyed `gs_settings` to share
 * the namespace convention with the save (`gs_*`). All access is guarded so a private-mode /
 * disabled-storage browser degrades to the defaults rather than throwing.
 */

export interface Settings {
  /** Master sound on/off (assetless WebAudio SFX). */
  sound: boolean;
  /** Vibration feedback on supported devices. */
  haptics: boolean;
  /** Honour prefers-reduced-motion: trims screen-shake, celebrations, ambient FX. */
  reducedMotion: boolean;
  /** Mirror the on-screen controls for a left-handed grip (bottom controls flip L↔R). */
  leftHanded: boolean;
  /** Skip the tap-to-continue on the per-shot result — auto-advance after a short beat. */
  fastShots: boolean;
}

const KEY = 'gs_settings';

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function defaults(): Settings {
  return {
    sound: true,
    haptics: true,
    // Seed from the OS preference so a reduced-motion user gets a calm first run by default.
    reducedMotion: prefersReducedMotion(),
    leftHanded: false,
    fastShots: false,
  };
}

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      // Merge over defaults so a newly-added field is filled in for old saves.
      cache = { ...d, ...parsed };
      return cache;
    }
  } catch {
    /* storage unavailable — fall through to defaults */
  }
  cache = d;
  return cache;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
  const next = { ...getSettings(), [key]: value };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore — the in-memory cache still reflects the choice for this session */
  }
  return next;
}

export function toggleSetting(key: keyof Settings): Settings {
  return setSetting(key, !getSettings()[key]);
}

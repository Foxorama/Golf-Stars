/**
 * Player settings — a tiny localStorage-backed preferences layer (NOT reducer state, NOT a
 * `_gs*` dev hook). These are view/feel choices the player owns: sound, haptics, reduced motion,
 * left-handed control mirroring, and a "fast shots" loop that auto-advances the per-shot result
 * instead of waiting for a tap. Read by `app.ts` (and the audio/haptic helpers); never by the
 * pure sim, so determinism is untouched.
 *
 * Persistence lives here (a side-effect, like the save in main.ts), keyed `fc_settings` to share
 * the namespace convention with the save (`fc_*`). All access is guarded so a private-mode /
 * disabled-storage browser degrades to the defaults rather than throwing.
 */

import type { AimMode } from './sim/rpg/play';
import { legacyKeyFor } from './save/legacyKeys';

export interface Settings {
  /** Master sound on/off (assetless WebAudio SFX). */
  sound: boolean;
  /** Ambient background music (assetless generative WebAudio, per-world themes) — its own
   *  toggle, independent of `sound`, so cues-without-music and music-without-cues both work. */
  music: boolean;
  /** Vibration feedback on supported devices. */
  haptics: boolean;
  /** Honour prefers-reduced-motion: trims screen-shake, celebrations, ambient FX. */
  reducedMotion: boolean;
  /** Mirror the on-screen controls for a left-handed grip (bottom controls flip L↔R). */
  leftHanded: boolean;
  /** Skip the tap-to-continue on the per-shot result — auto-advance after a short beat. */
  fastShots: boolean;
  /** Last Ascension difficulty picked on character select (GS-title-2) — so the picker defaults to
   *  the tier you chose last, not always A0. Clamped to the unlocked max when read. */
  lastAscension: number;
  /** Reader-friendly type (GS-a11y-readable-text): swaps the family stack for the most legible
   *  faces already on the device and — the part with the better evidence behind it — opens up
   *  letter/word spacing and leading. Ships no font file; see `.gs-readable` in index.html. */
  readableFont: boolean;
  /** Whole-UI zoom (GS-a11y-readable-text), 1 = ship default. Scales TEXT AND TOUCH TARGETS
   *  together, which is the only practical lever in a UI whose ~660 font sizes are hard px.
   *  Clamped to `UI_SCALES` when read so a hand-edited blob can't strand the player at 4×. */
  uiScale: number;
  /** Default aim assist (GS-default-aim): how the shot screen pre-aims each shot across ALL modes.
   *  'auto' (smart — flag on a par 3, down the fairway centreline off a par 4/5 tee, flag on a
   *  reachable approach else corridor); 'attack' (always the flag — the old default); 'safe' (always
   *  lay up to the corridor). Set by the in-play ◎ button and the settings pill. */
  aimMode: AimMode;
}

export const SETTINGS_KEY = 'fc_settings';
const KEY = SETTINGS_KEY;

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
    music: true,
    haptics: true,
    // Seed from the OS preference so a reduced-motion user gets a calm first run by default.
    reducedMotion: prefersReducedMotion(),
    leftHanded: false,
    fastShots: false,
    lastAscension: 0,
    aimMode: 'auto',
    readableFont: false,
    uiScale: 1,
  };
}

/** The offered UI scales. A discrete ladder, not a slider: every step has been checked to keep
 *  the play screen's commit row on-screen, and an arbitrary value could not be. */
export const UI_SCALES: readonly number[] = [1, 1.15, 1.3, 1.45];

/** Snap any stored/typed scale onto the ladder — the nearest rung, never an in-between value. */
export function clampUiScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  let best = UI_SCALES[0]!;
  for (const s of UI_SCALES) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const d = defaults();
  try {
    // Pre-rename fallback (GS-release-identity) — a player's preferences survive the rename.
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(legacyKeyFor(KEY));
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

/**
 * THE reduced-motion answer (GS-a11y-motion). Every motion gate reads this, never `matchMedia`
 * directly.
 *
 * `reducedMotion` is seeded from the OS preference on first run and is the player's own from then on,
 * so it is strictly more informed than the media query: a player who turns the toggle ON without an
 * OS-level preference was, before this, still shown every full-screen cinematic, because four gates
 * asked the OS instead of the setting. Consulting the media query again here would re-introduce the
 * opposite bug — a player who deliberately turns the toggle OFF could not get their animations back.
 */
export function reducedMotion(): boolean {
  return getSettings().reducedMotion;
}

/**
 * Push the reader's type choices onto `<html>` (GS-a11y-readable-text) — the ONE place the
 * accessibility settings meet the DOM. Both land on the root element, not on `<body>`, because
 * `--gs-vh`/`--gs-dvh` are resolved at `:root`: a scale set further down would leave every
 * viewport-locked screen measuring the unscaled height and hang the play controls off the
 * bottom. Guarded so the node-side sim and the tests can import this module freely.
 */
export function applyReaderSettings(s: Settings = getSettings()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('gs-readable', !!s.readableFont);
  // GS-a11y-motion: the CSS `@media (prefers-reduced-motion)` blocks can only see the OS. This is
  // how the in-app toggle reaches the stylesheet.
  root.classList.toggle('gs-reduced', !!s.reducedMotion);
  root.style.setProperty('--gs-uiscale', String(clampUiScale(s.uiScale)));
}

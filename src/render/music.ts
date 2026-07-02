/**
 * Assetless ambient MUSIC layer (GS-audio-2) — generative WebAudio, zero downloaded files (the
 * house "no asset to 404" rule, same as `audio.ts`). Each world archetype gets its own TRACK —
 * a data row (root, scale, chord loop, tempo, timbres, densities), not a fork — so a new world
 * is one table row and the coverage test goes green (the GS-biome-feel table+dispatch pattern).
 *
 * Design goals, in order: SUBTLE (a bed well under the SFX cues, ~14dB down), distinct per world,
 * and endless without looping audibly (the note choices are drawn from a seeded stream per track
 * start, so the chord loop breathes differently every pass).
 *
 * Pure cosmetic side-effect like the play-view canvas: the sim never calls this, and its rng is a
 * PRIVATE xorshift (never `Math.random`, never the sim/render streams — it can't perturb either).
 * Gated on the player's `music` setting (independent of `sound`); shares `audio.ts`'s one
 * AudioContext through its own gain bus. Everything is guarded so an unsupported/blocked context
 * simply plays nothing.
 */

import { getSettings } from '../settings';
import { sharedAudioContext } from './audio';
import type { BiomeArchetype } from '../sim/course/themes';

/** A scene is a world archetype (on-course) or the 'menu' clubhouse lull (everywhere else). */
export type MusicSceneId = BiomeArchetype | 'menu';

export interface MusicTrack {
  /** Human name — surfaces nowhere yet, but keeps the table self-documenting. */
  name: string;
  /** Beats per minute (a step is an 8th note = half a beat). */
  bpm: number;
  /** Frequency (Hz) of scale degree 0 — the track's tonal floor. */
  root: number;
  /** Scale as ascending semitone offsets within one octave (degree n wraps up an octave). */
  scale: readonly number[];
  /** Chord loop: each chord is a list of SCALE DEGREES (indexes into `scale`, wrapping). */
  chords: readonly (readonly number[])[];
  /** Pad (held chord) + arp (pluck) waveforms — the track's timbre. */
  padType: OscillatorType;
  arpType: OscillatorType;
  /** Per-step chance 0..1 of an arp pluck — the track's busyness. */
  arpDensity: number;
  /** Chance 0..1 of a passing bass note mid-bar (the root always lands on the bar). */
  bassDensity: number;
  /** Per-bar chance 0..1 of a high sparkle note. */
  shimmer: number;
  /** Bus gain — the track's overall level. KEEP SMALL: music is a bed, never a lead. */
  gain: number;
}

// Scales (semitone sets).
const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;
const LYDIAN = [0, 2, 4, 6, 7, 9, 11] as const;
const MIXO = [0, 2, 4, 5, 7, 9, 10] as const;
const DORIAN = [0, 2, 3, 5, 7, 9, 10] as const;
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10] as const;
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10] as const;
const MAJ_PENT = [0, 2, 4, 7, 9] as const;
const MIN_PENT = [0, 3, 5, 7, 10] as const;
const WHOLE = [0, 2, 4, 6, 8, 10] as const;

/**
 * The track table — one row per archetype + the menu. Coverage is machine-checked
 * (`tests/audio.test.ts`): add a world archetype and CI demands its theme.
 */
export const MUSIC_TRACKS: Record<MusicSceneId, MusicTrack> = {
  menu: {
    name: 'Clubhouse Lull', bpm: 70, root: 110, scale: MAJOR,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.16, bassDensity: 0.4, shimmer: 0.3, gain: 0.32,
  },
  verdant: {
    name: 'Fairway Meadows', bpm: 84, root: 130.81, scale: MAJOR,
    chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.28, bassDensity: 0.5, shimmer: 0.25, gain: 0.32,
  },
  desert: {
    name: 'Dune Drifter', bpm: 64, root: 73.42, scale: MIXO,
    chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.12, bassDensity: 0.35, shimmer: 0.12, gain: 0.26,
  },
  frost: {
    name: 'Glacier Lights', bpm: 58, root: 164.81, scale: LYDIAN,
    chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.15, bassDensity: 0.25, shimmer: 0.5, gain: 0.3,
  },
  inferno: {
    name: 'Ember Fields', bpm: 92, root: 110, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.22, bassDensity: 0.6, shimmer: 0.06, gain: 0.24,
  },
  void: {
    name: 'Event Horizon', bpm: 50, root: 98, scale: WHOLE,
    chords: [[0, 2, 4], [1, 3, 5]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.08, bassDensity: 0.2, shimmer: 0.2, gain: 0.26,
  },
  crystal: {
    name: 'Prism Gardens', bpm: 76, root: 164.81, scale: MAJ_PENT,
    chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 4]],
    padType: 'triangle', arpType: 'sine', arpDensity: 0.38, bassDensity: 0.3, shimmer: 0.55, gain: 0.3,
  },
  tempest: {
    name: 'Storm Riders', bpm: 100, root: 123.47, scale: DORIAN,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'sawtooth', arpDensity: 0.24, bassDensity: 0.8, shimmer: 0.1, gain: 0.22,
  },
  fungal: {
    name: 'Spore Grove', bpm: 80, root: 87.31, scale: MIN_PENT,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [2, 4, 6]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.3, bassDensity: 0.45, shimmer: 0.25, gain: 0.28,
  },
  ocean: {
    name: 'Tidal Greens', bpm: 72, root: 98, scale: MAJOR,
    chords: [[0, 2, 4, 8], [3, 5, 7, 11], [5, 7, 9, 13], [4, 6, 8, 12]],
    padType: 'sine', arpType: 'triangle', arpDensity: 0.24, bassDensity: 0.4, shimmer: 0.3, gain: 0.3,
  },
  cetus: {
    name: 'Whale Song', bpm: 48, root: 73.42, scale: AEOLIAN,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.1, bassDensity: 0.25, shimmer: 0.35, gain: 0.28,
  },
};

// --- Engine state ------------------------------------------------------------------------------
const STEPS_PER_BAR = 8; // 8th notes, 4/4
const BARS_PER_CHORD = 2;
const LOOKAHEAD_S = 0.9;
const TICK_MS = 220;

let scene: MusicSceneId | null = null;
let bus: GainNode | null = null;
let timer = 0;
let step = 0;
let nextAt = 0;
let rngS = 1;
let visHooked = false;

/** Private xorshift32 — the music's own stream; never the sim's, never `Math.random`. */
function rnd(): number {
  rngS ^= rngS << 13; rngS ^= rngS >>> 17; rngS ^= rngS << 5;
  return (rngS >>> 0) / 0xffffffff;
}

/** FNV-1a hash of the scene id → the track's seed, so a scene always opens the same way. */
function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/** Scale degree → frequency: degree n wraps octaves through the track's scale. */
function degFreq(t: MusicTrack, deg: number): number {
  const n = t.scale.length;
  const oct = Math.floor(deg / n);
  const semi = t.scale[((deg % n) + n) % n]! + oct * 12;
  return t.root * Math.pow(2, semi / 12);
}

/** One enveloped note into the music bus at an absolute context time. */
function note(
  c: AudioContext,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  attack: number,
): void {
  if (!bus) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  } catch {
    /* a failed note is a silent note */
  }
}

/** Schedule everything that sounds on step `s` at context time `when`. */
function scheduleStep(c: AudioContext, t: MusicTrack, when: number, s: number): void {
  const stepDur = 30 / t.bpm;
  const stepsPerChord = STEPS_PER_BAR * BARS_PER_CHORD;
  const chord = t.chords[Math.floor(s / stepsPerChord) % t.chords.length]!;
  const inBar = s % STEPS_PER_BAR;
  const inChord = s % stepsPerChord;

  // Pad: the held chord, an octave above the bass, swelling in slowly at each chord change.
  if (inChord === 0) {
    for (const d of chord) {
      note(c, when, degFreq(t, d) * 2, stepDur * stepsPerChord * 0.96, t.padType, 0.05, 1.4);
    }
  }
  // Bass: the chord root on every bar; a passing tone mid-bar by density.
  if (inBar === 0) {
    note(c, when, degFreq(t, chord[0]!), stepDur * 3.5, 'sine', 0.1, 0.03);
  } else if (inBar === 4 && rnd() < t.bassDensity) {
    note(c, when, degFreq(t, chord[0]! + (rnd() < 0.5 ? 4 : 2)), stepDur * 2.5, 'sine', 0.06, 0.03);
  }
  // Arp: a chord tone plucked one/two octaves up, by density — the track's melodic sparkle.
  if (rnd() < t.arpDensity) {
    const d = chord[Math.floor(rnd() * chord.length)]! + t.scale.length * (rnd() < 0.3 ? 2 : 1);
    note(c, when, degFreq(t, d), stepDur * 1.8, t.arpType, 0.055, 0.012);
  }
  // Shimmer: a rare very-high glint late in the bar.
  if (inBar === 6 && rnd() < t.shimmer) {
    const d = chord[Math.floor(rnd() * chord.length)]! + t.scale.length * 3;
    note(c, when, degFreq(t, d), stepDur * 3, 'sine', 0.03, 0.35);
  }
}

/** The lookahead pump: fill the schedule up to LOOKAHEAD_S ahead of the context clock. While the
 *  context is suspended (pre-gesture) the clock is frozen, so this fills once and idles — on
 *  resume the queued notes play and the pump takes over. */
function tick(): void {
  try {
    const c = sharedAudioContext();
    const t = scene ? MUSIC_TRACKS[scene] : null;
    if (!c || !t || !bus) return;
    if (!getSettings().music) {
      stopMusic();
      return;
    }
    const stepDur = 30 / t.bpm;
    while (nextAt < c.currentTime + LOOKAHEAD_S) {
      scheduleStep(c, t, nextAt, step);
      step++;
      nextAt += stepDur;
    }
  } catch {
    /* never let the music take the app down */
  }
}

/** Mute while the tab is hidden (polite), restore on return. Registered once, lazily. */
function hookVisibility(): void {
  if (visHooked) return;
  visHooked = true;
  try {
    document.addEventListener('visibilitychange', () => {
      const c = sharedAudioContext();
      const t = scene ? MUSIC_TRACKS[scene] : null;
      if (!c || !bus || !t) return;
      try {
        bus.gain.setTargetAtTime(document.hidden ? 0.0001 : t.gain, c.currentTime, 0.3);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* no document (headless) — nothing to hook */
  }
}

/** Fade out and tear down. Safe to call at any time. */
export function stopMusic(): void {
  if (timer) {
    clearInterval(timer);
    timer = 0;
  }
  scene = null;
  const b = bus;
  bus = null;
  const c = sharedAudioContext();
  if (b && c) {
    try {
      b.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
    } catch {
      /* ignore */
    }
    // Give the fade (and any already-queued notes) time to die before disconnecting.
    setTimeout(() => {
      try {
        b.disconnect();
      } catch {
        /* ignore */
      }
    }, 2500);
  }
}

/**
 * Drive the music to a scene (crossfading from whatever plays now), or silence on `null`.
 * The ONE entry point — `app.ts` calls this from render() with the current screen's scene, so
 * it must be a cheap no-op when nothing changed (render runs hot during the power-pull).
 */
export function setMusicScene(id: MusicSceneId | null): void {
  if (!id || !getSettings().music) {
    if (scene || timer) stopMusic();
    return;
  }
  if (id === scene && timer) return;
  const c = sharedAudioContext();
  if (!c) return;
  try {
    stopMusic(); // fades the old bus; we immediately build the new one
    const t = MUSIC_TRACKS[id];
    bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.linearRampToValueAtTime(t.gain, c.currentTime + 2.5);
    bus.connect(c.destination);
    scene = id;
    step = 0;
    rngS = seedFor(id);
    nextAt = c.currentTime + 0.05;
    hookVisibility();
    timer = window.setInterval(tick, TICK_MS);
    tick();
  } catch {
    /* unsupported / blocked — stay silent */
  }
}

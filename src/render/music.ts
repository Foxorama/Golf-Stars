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

/**
 * The melodic voice's CHARACTER (GS-music-distinct) — the single biggest lever for telling worlds
 * apart by ear. The old engine plucked one generic note per hit in every track, so every world
 * shared a timbre and only its tuning changed (the "very subtle" complaint). Each voice reshapes the
 * lead's waveform / envelope / harmonics so the ear reads a different instrument per world.
 */
export type LeadVoice =
  | 'pluck' //   the classic short arp pluck (the old behaviour)
  | 'bell' //    a long glassy chime with an inharmonic partial — icy/crystalline/heroic worlds
  | 'marimba' // a quick woody mallet with a sub-octave thump — warm pastoral/folk worlds
  | 'bowed' //   a slow-swelling legato tone that melts into the pad — deep-space / becalmed worlds
  | 'blip'; //   a short bright square — sci-fi / industrial / storm worlds

/** A rhythmic PERCUSSION pulse (GS-music-distinct) — a subtle groove that gives driving worlds a
 *  pulse the calm ones lack, another strong distinctness cue. `undefined`/`pulse:0` = no percussion. */
export type PulseVoice =
  | 'tick' //    a soft high hat click
  | 'kick' //    a low swept thump — a driving heartbeat kick
  | 'clank' //   a metallic hit — industrial worlds
  | 'heart' //   a slow lub-dub double thump — ominous/organic worlds
  | 'shaker'; // a dry sandy shush — desert / surf

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
  // --- Timbre levers (GS-music-distinct) — all OPTIONAL; absent = the classic plain voice. -------
  /** The melodic voice's character (default `'pluck'` = the old arp). */
  lead?: LeadVoice;
  /** Pad chorus detune in cents — a fat/lush (high) vs pure/cold (0) held chord. Default 0. */
  padDetune?: number;
  /** Low-pass cutoff (Hz) on the PAD only — darkens/muffles the held chord (deep, murky worlds).
   *  Absent/0 = open + bright. This is the strongest "instrument change" cue between worlds. */
  padCut?: number;
  /** Deep sub-octave drone gain under the bass (0 = none) — weight for the heavy/deep worlds. */
  sub?: number;
  /** Rhythmic percussion gain 0..1 (0/absent = none) — a groove for the driving worlds. */
  pulse?: number;
  /** Which percussion voice the pulse strikes with (default `'tick'`). */
  pulseVoice?: PulseVoice;
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
    // A warm lounge lull — a soft woody mallet over a mellow pad, no groove.
    name: 'Clubhouse Lull', bpm: 70, root: 110, scale: MAJOR,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.16, bassDensity: 0.4, shimmer: 0.3, gain: 0.32,
    lead: 'marimba', padDetune: 6,
  },
  verdant: {
    // Bright pastoral — a warm woody mallet skips over a lush chorused major pad.
    name: 'Fairway Meadows', bpm: 84, root: 130.81, scale: MAJOR,
    chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.28, bassDensity: 0.5, shimmer: 0.25, gain: 0.32,
    lead: 'marimba', padDetune: 11,
  },
  desert: {
    // Wide, slow, shimmering heat — a bowed legato line over a broad detuned pad, a dry sandy shaker.
    name: 'Dune Drifter', bpm: 64, root: 73.42, scale: MIXO,
    chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.12, bassDensity: 0.35, shimmer: 0.12, gain: 0.26,
    lead: 'bowed', padDetune: 14, padCut: 1500, sub: 0.05, pulse: 0.26, pulseVoice: 'shaker',
  },
  frost: {
    // Glassy aurora — long crystalline bell chimes over a still, pure pad.
    name: 'Glacier Lights', bpm: 58, root: 164.81, scale: LYDIAN,
    chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [0, 2, 4]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.15, bassDensity: 0.25, shimmer: 0.5, gain: 0.3,
    lead: 'bell', padDetune: 5,
  },
  inferno: {
    // Driving heat — sparse plucks over a menacing phrygian pad on a hard kick pulse.
    name: 'Ember Fields', bpm: 92, root: 110, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [4, 6, 8]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.22, bassDensity: 0.6, shimmer: 0.06, gain: 0.24,
    lead: 'pluck', sub: 0.05, pulse: 0.5, pulseVoice: 'kick',
  },
  void: {
    // Deep, still, weightless — a bowed line melting into a dark muffled pad over a sub drone.
    name: 'Event Horizon', bpm: 50, root: 98, scale: WHOLE,
    chords: [[0, 2, 4], [1, 3, 5]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.08, bassDensity: 0.2, shimmer: 0.2, gain: 0.26,
    lead: 'bowed', padDetune: 3, padCut: 900, sub: 0.08,
  },
  crystal: {
    // Prismatic sparkle — bright bell chimes ringing over a shimmery wide pad.
    name: 'Prism Gardens', bpm: 76, root: 164.81, scale: MAJ_PENT,
    chords: [[0, 2, 4], [1, 3, 5], [2, 4, 6], [0, 2, 4]],
    padType: 'triangle', arpType: 'sine', arpDensity: 0.38, bassDensity: 0.3, shimmer: 0.55, gain: 0.3,
    lead: 'bell', padDetune: 12,
  },
  tempest: {
    // Driving storm — bright sci-fi blips over a stormy sawtooth pad on a pounding kick.
    name: 'Storm Riders', bpm: 100, root: 123.47, scale: DORIAN,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'sawtooth', arpDensity: 0.24, bassDensity: 0.8, shimmer: 0.1, gain: 0.22,
    lead: 'blip', sub: 0.05, pulse: 0.62, pulseVoice: 'kick',
  },
  fungal: {
    // Woozy organic — a woody mallet over a sickly, heavily-detuned muffled pad breathing on a slow heartbeat.
    name: 'Spore Grove', bpm: 80, root: 87.31, scale: MIN_PENT,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [2, 4, 6]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.3, bassDensity: 0.45, shimmer: 0.25, gain: 0.28,
    lead: 'marimba', padDetune: 17, padCut: 1600, sub: 0.06, pulse: 0.3, pulseVoice: 'heart',
  },
  ocean: {
    // Wide tidal swell — a bowed legato line over a broad chorused pad, a soft surf shaker.
    name: 'Tidal Greens', bpm: 72, root: 98, scale: MAJOR,
    chords: [[0, 2, 4, 8], [3, 5, 7, 11], [5, 7, 9, 13], [4, 6, 8, 12]],
    padType: 'sine', arpType: 'triangle', arpDensity: 0.24, bassDensity: 0.4, shimmer: 0.3, gain: 0.3,
    lead: 'bowed', padDetune: 18, pulse: 0.2, pulseVoice: 'shaker',
  },
  cetus: {
    // The deepest, slowest ocean — a bowed whale-line over a very dark pad on a low sub drone.
    name: 'Whale Song', bpm: 48, root: 73.42, scale: AEOLIAN,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    padType: 'sine', arpType: 'sine', arpDensity: 0.1, bassDensity: 0.25, shimmer: 0.35, gain: 0.28,
    lead: 'bowed', padDetune: 5, padCut: 800, sub: 0.09,
  },
  asgard: {
    // A slow, heroic hymn — golden bell chimes over a bright mixolydian pad on a solemn ceremonial drum.
    name: 'Halls of Asgard', bpm: 56, root: 98, scale: MIXO,
    chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.16, bassDensity: 0.55, shimmer: 0.4, gain: 0.3,
    lead: 'bell', padDetune: 8, sub: 0.05, pulse: 0.3, pulseVoice: 'kick',
  },
  swamp: {
    // A low, murky, unsettling drone — a bowed sickly line over a very dark, queasily-detuned pad, breathing
    // on a slow ominous heartbeat under a sub drone.
    name: 'Miasma', bpm: 60, root: 82.41, scale: PHRYGIAN,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [1, 3, 5]],
    padType: 'sawtooth', arpType: 'sine', arpDensity: 0.1, bassDensity: 0.5, shimmer: 0.08, gain: 0.24,
    lead: 'bowed', padDetune: 20, padCut: 700, sub: 0.08, pulse: 0.34, pulseVoice: 'heart',
  },
  metal: {
    // A gritty industrial pulse — bright blips over a driving sawtooth on a hard metallic clank.
    name: 'Scrapyard Drift', bpm: 96, root: 116.54, scale: MIN_PENT,
    chords: [[0, 2, 4], [3, 4, 0], [2, 4, 1], [0, 2, 4]],
    padType: 'sawtooth', arpType: 'triangle', arpDensity: 0.26, bassDensity: 0.7, shimmer: 0.14, gain: 0.24,
    lead: 'blip', sub: 0.05, pulse: 0.68, pulseVoice: 'clank',
  },
  derelict: {
    // Hollow, gaunt, melancholic — a dead ship drifting silent and alone through the empty stars. A very
    // slow, very low sine pad breathing a minor progression that barely moves and always sinks back to the
    // tonic (an endless, going-nowhere drift): a bowed cold ghost-line melting into a dark muffled pad over a
    // sub drone, and the odd distant shimmer like a faint signal from a long-dead console.
    // Unique root+scale+bpm fingerprint (87.31|AEOLIAN|52).
    name: 'Ghost in the Hull', bpm: 52, root: 87.31, scale: AEOLIAN,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [0, 2, 4]],
    padType: 'sine', arpType: 'triangle', arpDensity: 0.07, bassDensity: 0.26, shimmer: 0.2, gain: 0.25,
    lead: 'bowed', padDetune: 4, padCut: 850, sub: 0.07,
  },
  earth: {
    // HOME (GS-earth) — a wistful, breezy Celtic-folk air for the old grey links: a warm woody mallet like a
    // tin whistle on the sea wind over a folky Dorian pad, a gentle mid-tempo lilt on a soft hand-drum tick.
    // Nostalgic and human — the birthplace of the game, not another alien world.
    // Unique root+scale+bpm fingerprint (146.83|DORIAN|68).
    name: 'The Auld Grey Toun', bpm: 68, root: 146.83, scale: DORIAN,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    padType: 'triangle', arpType: 'triangle', arpDensity: 0.24, bassDensity: 0.42, shimmer: 0.32, gain: 0.3,
    lead: 'marimba', padDetune: 10, pulse: 0.2, pulseVoice: 'tick',
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

/**
 * A pad/lead note with optional chorus DETUNE (a fat stack of two beating oscillators) and an optional
 * low-pass CUT (Hz) that darkens the voice — the two timbre levers that most change a world's
 * "instrument" (GS-music-distinct). Absent opts = a plain single-oscillator note, i.e. the old voice.
 */
function voiceNote(
  c: AudioContext,
  when: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  attack: number,
  opts: { detune?: number; cut?: number; sweepTo?: number } = {},
): void {
  if (!bus) return;
  try {
    const g = c.createGain();
    let head: AudioNode = g;
    if (opts.cut) {
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(opts.cut, when);
      filt.connect(g);
      head = filt;
    }
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    g.connect(bus);
    const det = opts.detune ?? 0;
    const cents = det ? [-det / 2, det / 2] : [0];
    for (const cent of cents) {
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), when);
      if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), when + dur);
      if (cent) osc.detune.setValueAtTime(cent, when);
      osc.connect(head);
      osc.start(when);
      osc.stop(when + dur + 0.05);
    }
  } catch {
    /* a failed note is a silent note */
  }
}

let noiseBuf: AudioBuffer | null = null;
/** A short filtered-noise burst on the MUSIC bus (percussion) — audio.ts's noise lives on the SFX
 *  bus, so the music layer needs its own. Deterministic pseudo-noise (no Math.random). */
function mnoise(
  c: AudioContext,
  when: number,
  dur: number,
  peak: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
): void {
  if (!bus) return;
  try {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      const frames = Math.max(1, Math.floor(c.sampleRate * 0.5));
      noiseBuf = c.createBuffer(1, frames, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let sd = 0x9e3779b9;
      for (let i = 0; i < frames; i++) {
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        d[i] = ((sd >>> 0) / 0xffffffff) * 2 - 1;
      }
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus);
    src.start(when);
    src.stop(when + dur + 0.02);
  } catch {
    /* silent */
  }
}

/** The melodic LEAD, voiced per track (GS-music-distinct). Each voice reshapes the note so the ear
 *  reads a different instrument per world — a bell rings, a mallet knocks, a bow swells, a blip stabs. */
function leadNote(c: AudioContext, when: number, freq: number, stepDur: number, t: MusicTrack): void {
  switch (t.lead ?? 'pluck') {
    case 'pluck':
      note(c, when, freq, stepDur * 1.8, t.arpType, 0.055, 0.012);
      break;
    case 'bell':
      // A long glassy chime: a pure fundamental + octave + an INHARMONIC partial (what makes a bell a bell).
      note(c, when, freq, stepDur * 3.4, 'sine', 0.05, 0.006);
      note(c, when, freq * 2, stepDur * 2.1, 'sine', 0.02, 0.006);
      note(c, when, freq * 3.011, stepDur * 1.5, 'sine', 0.012, 0.01);
      break;
    case 'marimba':
      // A quick woody mallet: a short bright body over a soft sub-octave thump.
      note(c, when, freq, stepDur * 0.85, 'triangle', 0.06, 0.004);
      note(c, when, freq * 0.5, stepDur * 0.45, 'sine', 0.03, 0.004);
      break;
    case 'bowed':
      // A slow-swelling legato tone that melts into the pad — a becalmed, sustained lead.
      voiceNote(c, when, freq, stepDur * 2.6, t.arpType, 0.045, stepDur * 0.7, { detune: 6 });
      break;
    case 'blip':
      // A short bright square stab — sci-fi / industrial.
      note(c, when, freq, stepDur * 0.7, 'square', 0.035, 0.004);
      break;
  }
}

/** A percussion hit (GS-music-distinct) — the groove voice, scaled by the track's `pulse` level. */
function perc(c: AudioContext, when: number, voice: PulseVoice, level: number): void {
  const g = Math.max(0, Math.min(1, level));
  switch (voice) {
    case 'tick':
      mnoise(c, when, 0.03, 0.05 * g, 'highpass', 6500, 1);
      break;
    case 'kick':
      voiceNote(c, when, 125, 0.16, 'sine', 0.12 * g, 0.005, { sweepTo: 45 });
      mnoise(c, when, 0.02, 0.03 * g, 'bandpass', 1400, 0.8);
      break;
    case 'clank':
      mnoise(c, when, 0.035, 0.07 * g, 'bandpass', 2300, 1.6);
      note(c, when, 430, 0.09, 'square', 0.04 * g, 0.004);
      note(c, when, 337, 0.12, 'triangle', 0.025 * g, 0.004);
      break;
    case 'heart':
      // A slow lub-dub — two soft low thumps, the second a touch lower and quieter.
      voiceNote(c, when, 72, 0.18, 'sine', 0.1 * g, 0.012, { sweepTo: 46 });
      voiceNote(c, when + 0.2, 64, 0.16, 'sine', 0.07 * g, 0.012, { sweepTo: 42 });
      break;
    case 'shaker':
      mnoise(c, when, 0.05, 0.05 * g, 'highpass', 5200, 0.7);
      break;
  }
}

/** Schedule everything that sounds on step `s` at context time `when`. */
function scheduleStep(c: AudioContext, t: MusicTrack, when: number, s: number): void {
  const stepDur = 30 / t.bpm;
  const stepsPerChord = STEPS_PER_BAR * BARS_PER_CHORD;
  const chord = t.chords[Math.floor(s / stepsPerChord) % t.chords.length]!;
  const inBar = s % STEPS_PER_BAR;
  const inChord = s % stepsPerChord;

  // Pad: the held chord, an octave above the bass, swelling in slowly at each chord change. The optional
  // chorus DETUNE fattens it and the optional low-pass CUT darkens it — the per-world timbre levers.
  if (inChord === 0) {
    for (const d of chord) {
      voiceNote(c, when, degFreq(t, d) * 2, stepDur * stepsPerChord * 0.96, t.padType, 0.05, 1.4, {
        detune: t.padDetune,
        cut: t.padCut,
      });
    }
  }
  // Sub drone: a deep octave-below-the-bass hum holding the whole bar — weight for the heavy/deep worlds.
  if (inBar === 0 && t.sub) {
    note(c, when, degFreq(t, chord[0]!) * 0.5, stepDur * STEPS_PER_BAR * 0.98, 'sine', t.sub, 0.4);
  }
  // Bass: the chord root on every bar; a passing tone mid-bar by density.
  if (inBar === 0) {
    note(c, when, degFreq(t, chord[0]!), stepDur * 3.5, 'sine', 0.1, 0.03);
  } else if (inBar === 4 && rnd() < t.bassDensity) {
    note(c, when, degFreq(t, chord[0]! + (rnd() < 0.5 ? 4 : 2)), stepDur * 2.5, 'sine', 0.06, 0.03);
  }
  // Percussion pulse: a downbeat hit (the track's own voice) with light off-beat ticks — the groove that
  // sets the driving worlds apart from the calm ones. Silent when `pulse` is 0/absent.
  if (t.pulse) {
    if (inBar === 0 || inBar === 4) perc(c, when, t.pulseVoice ?? 'tick', t.pulse);
    else if (inBar === 2 || inBar === 6) perc(c, when, 'tick', t.pulse * 0.35);
  }
  // Arp/lead: a chord tone one/two octaves up, by density — voiced per track (bell/mallet/bow/blip/pluck).
  if (rnd() < t.arpDensity) {
    const d = chord[Math.floor(rnd() * chord.length)]! + t.scale.length * (rnd() < 0.3 ? 2 : 1);
    leadNote(c, when, degFreq(t, d), stepDur, t);
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

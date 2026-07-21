/**
 * Assetless WEATHER AMBIENCE (GS-weather-audio) — a subtle environmental sound bed that COMPLEMENTS
 * the music, keyed to the route's `CourseEffect`. A blizzard howls, a solar storm crackles, an aurora
 * shimmers, a gravity well rumbles — so a weathered stop feels alive, not just looks it.
 *
 * The house rules (same as `audio.ts`/`music.ts`): synthesized WebAudio, ZERO downloaded files; the sim
 * never calls it; it imports clean in node (WebAudio only inside guarded calls). It shares the ONE
 * AudioContext through its OWN low-gain bus, and is gated on the player's `sound` setting (it is
 * environmental SFX, not music — independent of the `music` toggle, so it plays with cues on / music
 * off and vice-versa).
 *
 * DELIBERATELY SUBTLE: the bus caps well under the music bed (music ≤0.32; weather ≤ WEATHER_GAIN_CAP
 * 0.16) so it never fights the melody — "give the game more life" without overpowering the track. A
 * `_gsFeel.weatherVolume` sub-field scales it for tuning (no new hook: it's a sub-field of the existing
 * `_gsFeel` escape hatch, so no test-hub wiring).
 *
 * Shape: a CONTINUOUS bed (looping filtered noise for wind, low oscillators for a drone, a soft airy
 * hiss for shimmer) whose level breathes on a slow LFO, plus a sparse EVENT pump (a lookahead-free
 * `setInterval`) that fires the odd crackle / sparkle / whoosh so the weather never sits perfectly
 * still. Tab-hidden mutes politely, like the music.
 */

import { getSettings } from '../settings';
import { sharedAudioContext } from './audio';
import type { CourseEffectId } from '../sim/rpg/effects';

/** The overall subtlety ceiling — the weather bed must sit well under the music (≤0.32). */
export const WEATHER_GAIN_CAP = 0.16;

/** The continuous bed under a weather ambience — how the always-on layer is generated. */
type BedKind =
  | 'none' //     silence (calm / clear skies) — the event layer alone, if any
  | 'wind' //     looping filtered noise, gusting on an LFO — storms, gales, breezes
  | 'drone' //    low detuned oscillators — heavy / eerie skies (gravity well, dark matter, eclipse)
  | 'shimmer'; // a soft high airy hiss — magical calm skies (aurora, nebula, radiant)

/** The sparse punctuating EVENT a weather layer fires on top of its bed. */
type EventKind =
  | 'none'
  | 'crackle' //  an electric zap — solar / ion storms
  | 'sparkle' //  a soft high chime — aurora / nebula / comet magic
  | 'twinkle' //  a tiny frost glint — frostfall
  | 'whoosh' //   a distant streak — meteor shower
  | 'clank'; //   a far metallic knock — debris field

interface WeatherAmbience {
  /** The continuous bed. */
  bed: BedKind;
  /** Bed gain (pre-bus). */
  bedGain: number;
  /** Bed filter centre / drone fundamental (Hz). */
  bedFreq: number;
  /** Wind/breathing LFO depth 0..1 (0 = a steady, constant bed). */
  gust: number;
  /** Wind/breathing LFO rate (Hz) — how fast it swells. */
  gustHz: number;
  /** The sparse event. */
  event: EventKind;
  /** Per-pump-tick (~340ms) chance 0..1 the event fires (0 = never). */
  eventChance: number;
  /** Event gain. */
  eventGain: number;
  /** Overall bus gain — the layer's level. CAPPED at WEATHER_GAIN_CAP: a bed, never a lead. */
  gain: number;
}

/**
 * One row per `CourseEffectId` (GS-weather-audio) — the sound of each sky. Coverage is machine-checked
 * (`tests/audio.test.ts`), like the music tracks and tree voices. `none` (and any silent row) is a
 * zero-gain no-op. Every `gain` stays ≤ WEATHER_GAIN_CAP so the layer can never overpower the music.
 */
export const WEATHER_AMBIENCE: Record<CourseEffectId, WeatherAmbience> = {
  none: { bed: 'none', bedGain: 0, bedFreq: 0, gust: 0, gustHz: 0, event: 'none', eventChance: 0, eventGain: 0, gain: 0 },
  moonlight: {
    // Calm, silver, still — the faintest high airy breath, the odd soft sparkle. Barely there.
    bed: 'shimmer', bedGain: 0.05, bedFreq: 3200, gust: 0.3, gustHz: 0.08,
    event: 'sparkle', eventChance: 0.05, eventGain: 0.02, gain: 0.06,
  },
  meteorShower: {
    // A soft high hiss with the distant WHOOSH of a streak crossing the sky.
    bed: 'shimmer', bedGain: 0.05, bedFreq: 2600, gust: 0.4, gustHz: 0.12,
    event: 'whoosh', eventChance: 0.14, eventGain: 0.05, gain: 0.1,
  },
  solarStorm: {
    // A charged, gusty wind that CRACKLES with static.
    bed: 'wind', bedGain: 0.1, bedFreq: 620, gust: 0.7, gustHz: 0.22,
    event: 'crackle', eventChance: 0.16, eventGain: 0.045, gain: 0.13,
  },
  ionStorm: {
    // The wildest sky — a hard driving wind and frequent bright forked crackle.
    bed: 'wind', bedGain: 0.12, bedFreq: 720, gust: 0.85, gustHz: 0.28,
    event: 'crackle', eventChance: 0.24, eventGain: 0.055, gain: 0.15,
  },
  eclipse: {
    // The air goes dead still — a low, held, ominous drone. No events.
    bed: 'drone', bedGain: 0.09, bedFreq: 58, gust: 0.25, gustHz: 0.05,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.11,
  },
  nebula: {
    // Drifting colour-fog — a slow shimmer pad and slow soft sparkles.
    bed: 'shimmer', bedGain: 0.07, bedFreq: 2400, gust: 0.5, gustHz: 0.07,
    event: 'sparkle', eventChance: 0.08, eventGain: 0.03, gain: 0.09,
  },
  comet: {
    // A grand comet — an airy breath with gentle stardust sparkles.
    bed: 'shimmer', bedGain: 0.06, bedFreq: 2800, gust: 0.4, gustHz: 0.1,
    event: 'sparkle', eventChance: 0.1, eventGain: 0.03, gain: 0.09,
  },
  aurora: {
    // Shimmering colour ribbons — a lush high shimmer and frequent soft chimes.
    bed: 'shimmer', bedGain: 0.08, bedFreq: 3000, gust: 0.55, gustHz: 0.09,
    event: 'sparkle', eventChance: 0.16, eventGain: 0.035, gain: 0.11,
  },
  spaceJunk: {
    // A crashed-debris field — a low metallic drone with the odd far CLANK of drifting wreckage.
    bed: 'drone', bedGain: 0.06, bedFreq: 74, gust: 0.4, gustHz: 0.14,
    event: 'clank', eventChance: 0.12, eventGain: 0.04, gain: 0.1,
  },
  tradeMarket: {
    // A bustling camp — a soft warm low breeze; the bustle stays visual (assetless chatter reads odd).
    bed: 'wind', bedGain: 0.05, bedFreq: 380, gust: 0.35, gustHz: 0.16,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.06,
  },
  gravityWell: {
    // A giant world looms — a deep, heavy, pulling rumble. No events; just the weight.
    bed: 'drone', bedGain: 0.1, bedFreq: 46, gust: 0.35, gustHz: 0.06,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.13,
  },
  frostfall: {
    // Glittering frost sifts down — a gentle cold breeze and tiny high TWINKLES.
    bed: 'wind', bedGain: 0.06, bedFreq: 900, gust: 0.5, gustHz: 0.18,
    event: 'twinkle', eventChance: 0.18, eventGain: 0.03, gain: 0.1,
  },
  blizzard: {
    // A howling whiteout — the strongest wind bed in the game, a hard driving gale.
    bed: 'wind', bedGain: 0.13, bedFreq: 820, gust: 0.9, gustHz: 0.3,
    event: 'twinkle', eventChance: 0.1, eventGain: 0.025, gain: 0.16,
  },
  radiant: {
    // A brilliant star, still bright air — a soft calm high shimmer. Faint and warm.
    bed: 'shimmer', bedGain: 0.05, bedFreq: 3400, gust: 0.3, gustHz: 0.06,
    event: 'sparkle', eventChance: 0.05, eventGain: 0.02, gain: 0.07,
  },
  dustStorm: {
    // A rolling wall of grit — a thick, gritty gusting wind low in the spectrum.
    bed: 'wind', bedGain: 0.11, bedFreq: 480, gust: 0.75, gustHz: 0.24,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.14,
  },
  solarWind: {
    // A steady stream of particles — a stiff CONSTANT breeze (low gust), always on.
    bed: 'wind', bedGain: 0.09, bedFreq: 700, gust: 0.25, gustHz: 0.12,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.11,
  },
  darkMatter: {
    // An unseen mass warps the light and stills the air — a very low, warped, beating drone. Eerie.
    bed: 'drone', bedGain: 0.09, bedFreq: 42, gust: 0.3, gustHz: 0.04,
    event: 'none', eventChance: 0, eventGain: 0, gain: 0.12,
  },
  acidRain: {
    // A caustic downpour — a squally mid-band rain hiss with a frequent soft fizzing CRACKLE where
    // the drops eat the turf.
    bed: 'wind', bedGain: 0.1, bedFreq: 1400, gust: 0.6, gustHz: 0.2,
    event: 'crackle', eventChance: 0.14, eventGain: 0.035, gain: 0.13,
  },
};

// --- Engine state ------------------------------------------------------------------------------
const TICK_MS = 340;

let effect: CourseEffectId | null = null;
let bus: GainNode | null = null;
/** The persistent bed nodes (looping source / drone oscillators / LFO) to tear down on a scene change. */
let bedNodes: AudioNode[] = [];
let timer = 0;
let rngS = 0x1a2b3c4d;
let visHooked = false;
let sharedNoise: AudioBuffer | null = null;

/** Private xorshift32 — the weather layer's own stream for event timing; never `Math.random`. */
function rnd(): number {
  rngS ^= rngS << 13; rngS ^= rngS >>> 17; rngS ^= rngS << 5;
  return (rngS >>> 0) / 0xffffffff;
}

/** A `_gsFeel.weatherVolume` scalar (default 1) — a sub-field of the existing `_gsFeel` hatch. */
function weatherVolume(): number {
  try {
    const f = (window as unknown as { _gsFeel?: Record<string, number> })._gsFeel ?? {};
    const v = f.weatherVolume;
    return typeof v === 'number' && v >= 0 ? v : 1;
  } catch {
    return 1;
  }
}

/** A 2-second looping noise buffer (deterministic pseudo-noise; no Math.random), cached per context. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (sharedNoise && sharedNoise.sampleRate === c.sampleRate) return sharedNoise;
  const frames = Math.max(1, Math.floor(c.sampleRate * 2));
  const b = c.createBuffer(1, frames, c.sampleRate);
  const d = b.getChannelData(0);
  let s = 0x51ed270b;
  for (let i = 0; i < frames; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  sharedNoise = b;
  return b;
}

/** Build the CONTINUOUS bed for an ambience into the bus, tracking its nodes for teardown. */
function buildBed(c: AudioContext, a: WeatherAmbience): void {
  if (!bus || a.bed === 'none' || a.bedGain <= 0) return;
  const now = c.currentTime;
  // A gain the LFO breathes for the wind/drone swell (base + LFO-driven wobble).
  const bedGain = c.createGain();
  const base = a.bedGain;
  bedGain.gain.setValueAtTime(base, now);
  bedGain.connect(bus);
  bedNodes.push(bedGain);
  if (a.gust > 0 && a.gustHz > 0) {
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(a.gustHz, now);
    const lfoDepth = c.createGain();
    lfoDepth.gain.setValueAtTime(base * a.gust, now);
    lfo.connect(lfoDepth);
    lfoDepth.connect(bedGain.gain);
    lfo.start(now);
    bedNodes.push(lfo, lfoDepth);
  }
  if (a.bed === 'wind' || a.bed === 'shimmer') {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    src.loop = true;
    const filt = c.createBiquadFilter();
    if (a.bed === 'shimmer') {
      filt.type = 'highpass';
      filt.frequency.setValueAtTime(a.bedFreq, now);
      filt.Q.value = 0.5;
    } else {
      filt.type = 'bandpass';
      filt.frequency.setValueAtTime(a.bedFreq, now);
      filt.Q.value = 0.7;
    }
    src.connect(filt);
    filt.connect(bedGain);
    src.start(now);
    bedNodes.push(src, filt);
  } else if (a.bed === 'drone') {
    // Two/three low detuned oscillators beating slowly — a heavy, warped hum.
    for (const [mult, det] of [[1, 0], [1, 8], [1.5, -6]] as const) {
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(a.bedFreq * mult, now);
      if (det) osc.detune.setValueAtTime(det, now);
      const og = c.createGain();
      og.gain.setValueAtTime(mult > 1 ? 0.4 : 1, now);
      osc.connect(og);
      og.connect(bedGain);
      osc.start(now);
      bedNodes.push(osc, og);
    }
  }
}

/** One sparse punctuating event note/burst into the bus (guarded). */
function fireEvent(c: AudioContext, a: WeatherAmbience): void {
  if (!bus || a.event === 'none') return;
  const when = c.currentTime + 0.01;
  const gTone = (freq: number, dur: number, type: OscillatorType, peak: number, sweepTo?: number): void => {
    try {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), when);
      if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), when + dur);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      osc.connect(g);
      g.connect(bus!);
      osc.start(when);
      osc.stop(when + dur + 0.03);
    } catch {
      /* silent */
    }
  };
  const gNoise = (dur: number, peak: number, type: BiquadFilterType, freq: number, q: number): void => {
    try {
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const filt = c.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = freq;
      filt.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(peak, when);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(bus!);
      src.start(when);
      src.stop(when + dur + 0.03);
    } catch {
      /* silent */
    }
  };
  const p = a.eventGain;
  switch (a.event) {
    case 'crackle':
      gNoise(0.05 + rnd() * 0.06, p, 'bandpass', 2200 + rnd() * 2600, 2.2);
      gNoise(0.03, p * 0.6, 'highpass', 5000, 1);
      break;
    case 'sparkle':
      gTone([1568, 1760, 2093, 2637][Math.floor(rnd() * 4)]!, 0.5, 'sine', p);
      break;
    case 'twinkle':
      gTone(2600 + rnd() * 900, 0.16, 'triangle', p, 3200);
      break;
    case 'whoosh':
      gNoise(0.5 + rnd() * 0.3, p, 'bandpass', 900 + rnd() * 700, 0.7);
      break;
    case 'clank':
      gNoise(0.04, p, 'bandpass', 1600 + rnd() * 900, 2);
      gTone(320 + rnd() * 180, 0.14, 'square', p * 0.5, 180);
      break;
  }
}

/** The event pump — fires the sparse punctuation and re-reads the `sound` setting each tick. */
function tick(): void {
  try {
    const c = sharedAudioContext();
    const a = effect ? WEATHER_AMBIENCE[effect] : null;
    if (!c || !a || !bus) return;
    if (!getSettings().sound) {
      stopWeatherAmbience();
      return;
    }
    if (a.event !== 'none' && a.eventChance > 0 && rnd() < a.eventChance) fireEvent(c, a);
  } catch {
    /* never let the weather layer take the app down */
  }
}

/** Mute while the tab is hidden (polite), restore on return. Registered once, lazily. */
function hookVisibility(): void {
  if (visHooked) return;
  visHooked = true;
  try {
    document.addEventListener('visibilitychange', () => {
      const c = sharedAudioContext();
      const a = effect ? WEATHER_AMBIENCE[effect] : null;
      if (!c || !bus || !a) return;
      try {
        const target = document.hidden ? 0.0001 : Math.min(WEATHER_GAIN_CAP, a.gain) * weatherVolume();
        bus.gain.setTargetAtTime(Math.max(0.0001, target), c.currentTime, 0.4);
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* no document (headless) — nothing to hook */
  }
}

/** Fade out and tear down the ambience. Safe to call at any time. */
export function stopWeatherAmbience(): void {
  if (timer) {
    clearInterval(timer);
    timer = 0;
  }
  effect = null;
  const b = bus;
  const nodes = bedNodes;
  bus = null;
  bedNodes = [];
  const c = sharedAudioContext();
  if (b && c) {
    try {
      b.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
    } catch {
      /* ignore */
    }
    // Give the fade time to die, then stop/disconnect the persistent bed nodes.
    setTimeout(() => {
      for (const n of nodes) {
        try {
          (n as OscillatorNode | AudioBufferSourceNode).stop?.();
        } catch {
          /* not a source node */
        }
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
      try {
        b.disconnect();
      } catch {
        /* ignore */
      }
    }, 2600);
  }
}

/**
 * Drive the weather ambience to a `CourseEffect` (crossfading from whatever plays now), or silence on
 * `null` / `'none'` / a zero-gain sky. The ONE entry point — `app.ts` (via `syncMusic`) calls it from
 * render() with the current stop's effect, so it must be a cheap no-op when nothing changed (render
 * runs hot during the power-pull). Gated on `sound`; guarded so a blocked context stays silent.
 */
export function setWeatherAmbience(id: string | null): void {
  const next = (id ?? null) as CourseEffectId | null;
  const a = next ? WEATHER_AMBIENCE[next] : null;
  // Silence: no effect, sound off, unknown id, or a zero-gain (silent) sky.
  if (!next || !a || a.gain <= 0 || !getSettings().sound) {
    if (effect || timer || bus) stopWeatherAmbience();
    return;
  }
  if (next === effect && bus) return; // cheap no-op — unchanged
  const c = sharedAudioContext();
  if (!c) return;
  try {
    stopWeatherAmbience(); // fades the old bus + bed; we immediately build the new one
    const gain = Math.min(WEATHER_GAIN_CAP, a.gain) * weatherVolume();
    bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, c.currentTime);
    bus.gain.linearRampToValueAtTime(Math.max(0.0001, gain), c.currentTime + 2.2);
    bus.connect(c.destination);
    effect = next;
    bedNodes = [];
    buildBed(c, a);
    hookVisibility();
    // The pump runs even for bed-only skies: it fires the sparse events AND re-reads the `sound`
    // setting each tick, so a toggle-off tears the persistent bed down promptly (the music-layer rule).
    timer = window.setInterval(tick, TICK_MS);
  } catch {
    /* unsupported / blocked — stay silent */
  }
}

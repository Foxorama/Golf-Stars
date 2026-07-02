/**
 * Assetless sound engine (WebAudio synth) — the game's whole audio layer, with ZERO downloaded
 * files (the house "no asset to 404" rule). Every cue is built from oscillators + filtered noise
 * at call time, so the bundle stays a single self-contained file and nothing can 404 on a device.
 *
 * Pure side-effect, like the play-view canvas: the sim never calls this. It's gated on the player's
 * `sound` setting and fully guarded — a browser without WebAudio (or a blocked AudioContext) simply
 * makes no sound rather than throwing. The context is created lazily and resumed on the first user
 * gesture (browsers suspend audio until then), wired from `app.ts`.
 */

import { getSettings } from '../settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/**
 * Lazily create (and return) the ONE AudioContext the whole app shares — SFX and the music layer
 * both hang off it (a page gets few contexts; two would fight for the hardware). Not gated on any
 * setting: each consumer gates its OWN bus (SFX on `sound`, music on `music`). Null if unsupported.
 */
export function sharedAudioContext(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** The SFX bus: the shared context + the cue master gain, or null when sound is off/unsupported. */
function audio(): { ctx: AudioContext; master: GainNode } | null {
  if (!getSettings().sound) return null;
  const c = sharedAudioContext();
  if (!c) return null;
  try {
    if (!master) {
      master = c.createGain();
      master.gain.value = 0.5;
      master.connect(c.destination);
    }
    return { ctx: c, master };
  } catch {
    return null;
  }
}

/** Resume the context after a user gesture (browsers start it suspended). Safe to call often.
 *  Resumes when EITHER audio consumer is on (the music layer needs it even with SFX muted);
 *  with both off it stays lazy — no context is ever created for a silent player. */
export function resumeAudio(): void {
  const s = getSettings();
  if (!s.sound && !s.music) return;
  try {
    sharedAudioContext()?.resume();
  } catch {
    /* ignore */
  }
}

/** A single enveloped oscillator note. `t` is an offset (s) from now so cues can sequence. */
function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; t?: number; sweepTo?: number } = {},
): void {
  const a = audio();
  if (!a) return;
  const { ctx: c, master: m } = a;
  const now = c.currentTime + (opts.t ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, now);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), now + dur);
  const peak = opts.gain ?? 0.3;
  // Quick attack, exponential decay — a clean pluck/chime, no clicks.
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(m);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** A short filtered noise burst — the percussive "thwack" of contact / a soft sand splash. */
function noise(
  dur: number,
  opts: { gain?: number; t?: number; type?: BiquadFilterType; freq?: number; q?: number } = {},
): void {
  const a = audio();
  if (!a) return;
  const { ctx: c, master: m } = a;
  const now = c.currentTime + (opts.t ?? 0);
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic-enough pseudo-noise (no Math.random dependency for reproducible feel).
  let s = 0x2545f491;
  for (let i = 0; i < frames; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    data[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = opts.type ?? 'bandpass';
  filt.frequency.value = opts.freq ?? 1400;
  filt.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(peak, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(m);
  src.start(now);
  src.stop(now + dur + 0.02);
}

/**
 * Which VOICE a club strikes with (GS-audio-2). Derived from the club-id conventions of the
 * `CLUBS` taxonomy (`src/sim/clubs.ts`): 'D' the driver, `*W` woods, `*H` hybrids, `*i` irons,
 * the putter itself — everything else (PW/GW/SW/60/64/chip) is a wedge-family touch shot.
 * Convention-based on purpose: a NEW club row picks up a sensible voice with zero audio edits.
 */
export type StrikeClass = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';

export function strikeClassOf(clubId?: string): StrikeClass {
  if (!clubId) return 'iron'; // the neutral mid-bag voice when no club is known
  if (clubId === 'D') return 'driver';
  if (clubId === 'putter') return 'putter';
  // Digit-prefixed families only: PW/GW/SW also end in 'W' but are wedges, not woods.
  if (/^\d+W$/.test(clubId)) return 'wood';
  if (/^\d+H$/.test(clubId)) return 'hybrid';
  if (/^\d+i$/.test(clubId)) return 'iron';
  return 'wedge';
}

/**
 * The cue library. Each is a tiny composition; quality/strength scales the brightness so a pure
 * strike rings and a chunked one thuds. All no-ops when sound is off / unsupported.
 */
export const sfx = {
  /** UI button press — a soft tick. */
  click(): void {
    tone(420, 0.05, { type: 'triangle', gain: 0.12 });
  },
  /**
   * Club–ball contact, voiced by the club family (GS-audio-2). `quality` 0..1 (1 = pure) scales
   * the brightness in every voice, so a pure strike rings and a chunked one thuds.
   *   driver — a deep boomy THWACK + a titanium ping that rings when pure;
   *   wood/hybrid — the same shape, progressively smaller and tighter;
   *   iron — a crisp metallic CLICK with a short turf brush;
   *   wedge — a soft fat thump under a longer grass/sand "shhk" (touch, not power);
   *   putter — falls through to the putt tap.
   */
  swing(quality = 0.6, clubId?: string): void {
    const q = Math.max(0, Math.min(1, quality));
    const cls = strikeClassOf(clubId);
    switch (cls) {
      case 'driver':
        // The big dog: a low airy boom, a hard titanium ping, and a pure-strike crack of air.
        noise(0.09, { gain: 0.34, type: 'bandpass', freq: 260 + q * 240, q: 0.6 });
        tone(150, 0.16, { type: 'triangle', gain: 0.2, sweepTo: 55 });
        tone(1500 + q * 700, 0.06, { type: 'triangle', gain: 0.1 + q * 0.14 });
        if (q > 0.6) noise(0.04, { gain: (q - 0.6) * 0.3, type: 'highpass', freq: 3200 });
        break;
      case 'wood':
        noise(0.08, { gain: 0.32, type: 'bandpass', freq: 380 + q * 400, q: 0.65 });
        tone(170, 0.14, { type: 'triangle', gain: 0.17, sweepTo: 70 });
        tone(1200 + q * 500, 0.05, { type: 'triangle', gain: 0.08 + q * 0.1 });
        break;
      case 'hybrid':
        noise(0.07, { gain: 0.3, type: 'bandpass', freq: 620 + q * 800, q: 0.7 });
        tone(200, 0.12, { type: 'triangle', gain: 0.15, sweepTo: 85 });
        tone(1000 + q * 450, 0.05, { type: 'sine', gain: 0.07 + q * 0.08 });
        break;
      case 'iron':
        // Crisp click: bright compact crack + a firm body knock + a whisper of turf after.
        noise(0.05, { gain: 0.3, type: 'bandpass', freq: 1800 + q * 1600, q: 0.9 });
        tone(300 + q * 160, 0.1, { type: 'triangle', gain: 0.12 + q * 0.1, sweepTo: 150 });
        noise(0.09, { gain: 0.06, type: 'lowpass', freq: 900, t: 0.02 });
        break;
      case 'wedge':
        // Touch shot: a soft fat thump under a longer grass/sand brush — feel over power.
        noise(0.05, { gain: 0.22, type: 'bandpass', freq: 650 + q * 350, q: 0.8 });
        tone(250, 0.09, { type: 'sine', gain: 0.12 + q * 0.06, sweepTo: 130 });
        noise(0.13, { gain: 0.1, type: 'bandpass', freq: 2400, q: 0.6, t: 0.015 });
        break;
      case 'putter':
        sfx.putt();
        break;
    }
  },
  /** Putter tap — a soft, low knock. */
  putt(): void {
    tone(240, 0.08, { type: 'sine', gain: 0.16, sweepTo: 150 });
    noise(0.03, { gain: 0.08, freq: 600, q: 1 });
  },
  /** Ball bonks a trade-camp tent (GS-tents) — a soft canvas thump + a springy boing as it ricochets. */
  bonk(): void {
    noise(0.05, { gain: 0.16, type: 'bandpass', freq: 380, q: 0.8 }); // muffled canvas thump
    tone(300, 0.16, { type: 'triangle', gain: 0.16, sweepTo: 520, t: 0.02 }); // springy boing up
  },
  /** Ball drops in the cup (GS-audio-2) — the real thing: a rim knock, a couple of hollow
   *  rattle bounces off the cup wall (each lower + softer as the ball dies), a bottom-of-the-cup
   *  plastic THUNK, then the little rising "it's in" confirm. The most-earned cue in golf. */
  holeOut(): void {
    // Rim knock as the ball catches the edge.
    noise(0.03, { gain: 0.16, freq: 1300, q: 1.1 });
    tone(820, 0.05, { type: 'triangle', gain: 0.1, sweepTo: 600 });
    // Rattle: hollow knocks walking down the cup wall.
    [
      { t: 0.06, f: 950, g: 0.13 },
      { t: 0.12, f: 870, g: 0.1 },
      { t: 0.17, f: 800, g: 0.07 },
    ].forEach(({ t, f, g }) => {
      noise(0.025, { gain: g, freq: 1700, q: 1.3, t });
      tone(f, 0.04, { type: 'triangle', gain: g * 0.8, t });
    });
    // The bottom-of-the-cup settle.
    tone(320, 0.09, { type: 'sine', gain: 0.16, t: 0.22, sweepTo: 170 });
    noise(0.04, { gain: 0.1, type: 'lowpass', freq: 520, t: 0.22 });
    // The rising confirm chime, after the ball is definitely home.
    tone(660, 0.12, { type: 'sine', gain: 0.18, t: 0.32 });
    tone(990, 0.18, { type: 'sine', gain: 0.16, t: 0.4 });
  },
  /** Found a hazard / OB — a downward "wah". */
  penalty(): void {
    tone(300, 0.28, { type: 'sawtooth', gain: 0.14, sweepTo: 120 });
  },
  /** Made the cut — a bright ascending arpeggio. */
  madeCut(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.2, t: i * 0.1 }));
  },
  /** Missed the cut — a descending minor fall. */
  missCut(): void {
    const notes = [440, 370, 311, 233];
    notes.forEach((f, i) => tone(f, 0.26, { type: 'sine', gain: 0.16, t: i * 0.12 }));
  },
  /** Reward: shard / club / upgrade pickup — a quick shimmer. */
  reward(): void {
    [784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { type: 'triangle', gain: 0.16, t: i * 0.06 }));
  },
  /** Voyage won (GS-victory) — the run-ending triumph: a rolling brass-ish fanfare climbing to a held
   *  major chord, capped by a long sparkle cascade. The grandest cue in the game after the ace, sized to
   *  carry the full-screen victory takeover. */
  victory(): void {
    // Rolling fanfare — a major arpeggio climbing, doubled with a brass-ish saw for weight.
    const fanfare = [392, 523, 659, 784, 1047, 1319, 1568];
    fanfare.forEach((f, i) => {
      tone(f, 0.3, { type: 'triangle', gain: 0.2, t: 0.02 + i * 0.1 });
      tone(f, 0.26, { type: 'sawtooth', gain: 0.055, t: 0.02 + i * 0.1 });
    });
    // A held major chord swelling under the climb (the "you did it" pad).
    [523, 659, 784, 1047].forEach((f) => tone(f, 1.3, { type: 'sine', gain: 0.08, t: 0.72 }));
    // A shimmering sparkle cascade tail.
    [1568, 2093, 2637, 3136, 3951].forEach((f, i) => tone(f, 0.24, { type: 'sine', gain: 0.11, t: 0.9 + i * 0.06 }));
  },
  /** Hole-in-one (GS-ace) — the biggest beat in the game: a rattle-in, a rising triumphant fanfare,
   *  a held major chord, and a cascade of sparkle chimes. Grander + longer than every other cue. */
  ace(): void {
    // The drop + rattle.
    noise(0.06, { gain: 0.22, freq: 2000, q: 1.4 });
    // Rising fanfare (a major arpeggio climbing two octaves) with a brass-ish saw doubling the lead.
    const fanfare = [523, 659, 784, 1047, 1319, 1568];
    fanfare.forEach((f, i) => {
      tone(f, 0.26, { type: 'triangle', gain: 0.2, t: 0.05 + i * 0.085 });
      tone(f, 0.22, { type: 'sawtooth', gain: 0.05, t: 0.05 + i * 0.085 });
    });
    // A held major chord swelling under the climb (the "this is huge" pad).
    [523, 659, 784].forEach((f) => tone(f, 0.9, { type: 'sine', gain: 0.09, t: 0.18 }));
    // A sparkle cascade tail.
    [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, 0.2, { type: 'sine', gain: 0.12, t: 0.62 + i * 0.05 }));
  },
  /** Eagle (−2) — a raptor's scream: a stuttered "kek-kek-kek" attack, then a long piercing
   *  descending screech (detuned for grit) over an airy rush of wings. */
  eagle(): void {
    // The stuttered chirp attack.
    [0, 0.075, 0.15].forEach((t, i) =>
      tone(2150 - i * 120, 0.06, { type: 'sawtooth', gain: 0.13, t, sweepTo: 1500 - i * 120 }),
    );
    // The long piercing screech, a detuned saw+triangle pair for a metallic rasp.
    tone(2250, 0.6, { type: 'sawtooth', gain: 0.17, t: 0.2, sweepTo: 660 });
    tone(2270, 0.6, { type: 'triangle', gain: 0.1, t: 0.2, sweepTo: 670 });
    // The rush of wing-beaten air under it.
    noise(0.55, { gain: 0.06, type: 'highpass', freq: 2800, t: 0.2 });
  },
  /** Albatross (−3) — the rarest, grandest moment a player will see: a deep cosmic swell, a soaring
   *  lead that glides skyward, and a shimmering aurora cascade. Ethereal where the ace is a fanfare. */
  albatross(): void {
    // The deep rising pad — three voices opening into a fifth (the swell).
    [98, 147, 196].forEach((f) => tone(f, 1.5, { type: 'sine', gain: 0.08, sweepTo: f * 1.5 }));
    // A soaring lead taking the sky.
    tone(440, 1.7, { type: 'triangle', gain: 0.14, t: 0.1, sweepTo: 1320 });
    tone(660, 1.6, { type: 'sine', gain: 0.07, t: 0.2, sweepTo: 1760 });
    // A shimmering aurora cascade tail.
    [1047, 1319, 1568, 2093, 2637, 3136].forEach((f, i) =>
      tone(f, 0.42, { type: 'sine', gain: 0.08, t: 0.55 + i * 0.11 }),
    );
    // A soft wind whoosh beneath the whole thing.
    noise(1.3, { gain: 0.05, type: 'bandpass', freq: 520, q: 0.5, t: 0.1 });
  },
};

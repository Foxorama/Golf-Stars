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
import { flightClassOf, type FlightClass } from '../sim/flight';
import type { BiomeArchetype } from '../sim/course/themes';

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
 * Which VOICE a club strikes with (GS-audio-2). The club-family classifier is the SAME one the
 * flight physics use (`sim/flight.ts flightClassOf`, GS-flight-3) — one id-convention read for the
 * whole game, so a NEW club row picks up a sensible voice AND flight with zero engine edits.
 */
export type StrikeClass = FlightClass;

export const strikeClassOf = flightClassOf;

/**
 * Which VOICE a touchdown surface answers with (GS-audio-3) — the audio half of the render's
 * `spawnLandFX` (playView.ts): the SAME lie/penalty dispatch, in the SAME precedence order, so what
 * you see burst is what you hear. Pure classifier (no WebAudio) so tests can machine-check that
 * every surface-bearing penalty kind resolves to a voice. `null` = ordinary turf: the strike and
 * bounce already carry it, and the administrative penalties (OB / lost / unplayable) have no
 * surface to sound — the score-cost "wah" (`sfx.penalty`) answers those.
 */
export type LandVoice =
  | 'sizzle' // lava — the ball plunges into magma
  | 'void' // the void / lost-rough abyss — a negative-energy implosion
  | 'whale' // cetus star-ocean — a splash answered by a whale's song
  | 'splash' // water / creek / frozen pond
  | 'rockfall' // ravine / barranca — dry rock clatter
  | 'sand' // bunker / waste — a soft puff
  | 'ice' // frostfall patch — a bright skitter
  | 'crystal' // crystal lie — a glassy chime glint
  | 'scorch' // meteor crater — ash whump + ember fizz
  | 'stardust' // comet patch — a charged shimmer
  | 'junk' // debris patch — rattled scrap
  | 'tree'; // the canopy — voiced per world by `treeVoiceOf`

export function landVoiceOf(lie: string, penalty?: string): LandVoice | null {
  if (penalty === 'lava') return 'sizzle';
  if (penalty === 'void' || penalty === 'voidlost') return 'void';
  if (penalty === 'cetuslost') return 'whale';
  if (penalty === 'water' || lie === 'water' || lie === 'creek' || lie === 'frozenpond') return 'splash';
  if (penalty === 'ravine' || lie === 'barranca') return 'rockfall';
  if (lie === 'bunker' || lie === 'pot' || lie === 'waste' || lie === 'sand') return 'sand';
  if (lie === 'ice') return 'ice';
  if (lie === 'crystal') return 'crystal';
  if (lie === 'scorch') return 'scorch';
  if (lie === 'stardust') return 'stardust';
  if (lie === 'junk') return 'junk';
  if (lie === 'trees') return 'tree';
  return null;
}

/**
 * Which VOICE a tree hit knocks with (GS-audio-3) — per world ARCHETYPE, mirroring the flora table
 * (`style.ts styleFlora`): the silhouette you clipped is the sound you hear. Prism Reach's spires
 * ring a crystal ping, the spore jungle's mushrooms squelch, a parkland oak knocks wood. Full
 * coverage is compile-checked by the Record; the fallback (unknown archetype) is the classic wood.
 */
export type TreeVoice =
  | 'wood' // verdant parkland canopy (and the void's classic trees) — a woody thock + leaf rustle
  | 'squelch' // fungal giant mushrooms — a wet blorp
  | 'ping' // crystal spires — a glassy ring
  | 'conifer' // frost pines — a muffled snow whump + needle shiver
  | 'snag' // inferno charred snags — a dry crack + ember fizz
  | 'saguaro' // desert cacti — a hollow drum tonk
  | 'scrub' // tempest wind-bent scrub — a whippy rustle
  | 'palm' // ocean palms — frond rustle + a coconut knock
  | 'stone'; // cetus sea-stacks — a dense rock clack

export const TREE_VOICES: Record<BiomeArchetype, TreeVoice> = {
  verdant: 'wood',
  desert: 'saguaro',
  frost: 'conifer',
  inferno: 'snag',
  void: 'wood', // styleFlora's default: the void keeps the classic canopy
  crystal: 'ping',
  tempest: 'scrub',
  fungal: 'squelch',
  ocean: 'palm',
  cetus: 'stone',
};

export function treeVoiceOf(arch?: string): TreeVoice {
  return TREE_VOICES[arch as BiomeArchetype] ?? 'wood';
}

/** The tree-hit compositions (GS-audio-3) — one knock per `TreeVoice`. */
function treeSound(v: TreeVoice): void {
  switch (v) {
    case 'wood':
      noise(0.04, { gain: 0.24, type: 'bandpass', freq: 950, q: 1.2 }); // the knock off the trunk
      tone(240, 0.1, { type: 'triangle', gain: 0.18, sweepTo: 110 }); // woody thock body
      noise(0.25, { gain: 0.08, type: 'highpass', freq: 2400, t: 0.03 }); // rattled-leaf rustle
      break;
    case 'squelch':
      tone(320, 0.16, { type: 'sine', gain: 0.2, sweepTo: 70 }); // the wet blorp down
      noise(0.14, { gain: 0.16, type: 'lowpass', freq: 500 }); // squelchy flesh body
      tone(140, 0.12, { type: 'sine', gain: 0.12, t: 0.08, sweepTo: 260 }); // sucking rebound blip
      noise(0.08, { gain: 0.08, type: 'bandpass', freq: 1400, q: 3, t: 0.1 }); // spore-puff squick
      break;
    case 'ping':
      tone(2093, 0.4, { type: 'triangle', gain: 0.14 }); // the glassy ping
      tone(3136, 0.3, { type: 'sine', gain: 0.08, t: 0.01 }); // sparkling upper partial
      tone(1568, 0.5, { type: 'sine', gain: 0.05, t: 0.02 }); // ringing under-tone
      noise(0.03, { gain: 0.08, type: 'highpass', freq: 6000 }); // glint
      break;
    case 'conifer':
      noise(0.12, { gain: 0.2, type: 'lowpass', freq: 360 }); // snow whump off the boughs
      tone(190, 0.09, { type: 'triangle', gain: 0.12, sweepTo: 95 }); // soft branch knock
      noise(0.3, { gain: 0.07, type: 'highpass', freq: 3200, t: 0.05 }); // needle/snow shiver
      break;
    case 'snag':
      noise(0.025, { gain: 0.28, type: 'highpass', freq: 1800 }); // the dry CRACK
      tone(300, 0.07, { type: 'triangle', gain: 0.14, sweepTo: 130 }); // brittle charred knock
      noise(0.3, { gain: 0.06, type: 'highpass', freq: 4000, t: 0.05 }); // ember fizz
      break;
    case 'saguaro':
      tone(170, 0.12, { type: 'sine', gain: 0.2, sweepTo: 75 }); // hollow drum body
      noise(0.03, { gain: 0.16, type: 'bandpass', freq: 620, q: 1.5 }); // the tonk
      tone(255, 0.06, { type: 'triangle', gain: 0.07, t: 0.05, sweepTo: 140 }); // wobble answer
      break;
    case 'scrub':
      noise(0.18, { gain: 0.2, type: 'bandpass', freq: 2600, q: 0.6 }); // the whip through leaves
      noise(0.12, { gain: 0.1, type: 'bandpass', freq: 1600, q: 0.8, t: 0.08 }); // settling rustle
      tone(210, 0.05, { type: 'triangle', gain: 0.07, sweepTo: 120 }); // a thin stem knock
      break;
    case 'palm':
      noise(0.16, { gain: 0.16, type: 'bandpass', freq: 2200, q: 0.7 }); // frond rustle
      tone(420, 0.09, { type: 'sine', gain: 0.16, t: 0.06, sweepTo: 190 }); // the coconut knock
      noise(0.03, { gain: 0.12, type: 'bandpass', freq: 800, q: 1.4, t: 0.06 });
      break;
    case 'stone':
      noise(0.04, { gain: 0.24, type: 'lowpass', freq: 900 }); // stone clack
      tone(150, 0.12, { type: 'sine', gain: 0.16, sweepTo: 65 }); // dense body thud
      noise(0.06, { gain: 0.08, type: 'lowpass', freq: 500, t: 0.07 }); // grit trickle
      break;
  }
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
  /**
   * A caddy guard looses its projectile (GS-audio-4) — the launch half of the redirect cinematic.
   * Space Ducks laser: a sci-fi PEW dive + a thin beam whine that rises as it closes on the ball.
   * Convict Sheep boomerang: a launch whoosh + a whirring whip-whip-whip that quickens/brightens
   * across the flight. `travelMs` is the REAL time until contact (playView computes it from the
   * intercept arc + slow-mo scale) so the whir/whine ends exactly where the hit cue takes over.
   */
  redirectFire(kind: 'laser' | 'boomerang', travelMs = 900): void {
    const dur = Math.max(0.4, Math.min(1.8, travelMs / 1000));
    if (kind === 'laser') {
      tone(1750, 0.22, { type: 'sawtooth', gain: 0.15, sweepTo: 220 }); // the PEW dive
      tone(2320, 0.18, { type: 'square', gain: 0.05, sweepTo: 340 }); // bright zap layer
      noise(0.05, { gain: 0.1, type: 'highpass', freq: 5200 }); // muzzle crack
      tone(760, dur, { type: 'sawtooth', gain: 0.035, sweepTo: 1350 }); // beam whine, rising as it closes
    } else {
      noise(0.12, { gain: 0.14, type: 'bandpass', freq: 600, q: 0.8 }); // the launch whoosh
      // The whir: whip-whip-whip pulses that quicken slightly and brighten as the boomerang closes.
      const pulses = Math.max(4, Math.round(dur / 0.11));
      for (let i = 0; i < pulses; i++) {
        const p = i / pulses;
        noise(0.07, { gain: 0.09 + 0.06 * p, type: 'bandpass', freq: 900 + 750 * p, q: 1.4, t: p * dur });
      }
    }
  },
  /**
   * The projectile MEETS the ball (GS-audio-4) — the contact half, cued at the spark spray.
   * Laser: an energy SNAP that zaps the ball's ping UP + a discharge slump and spark crackle.
   * Boomerang: the wooden CRACK of a thrown stick on a golf ball + a wobbling ring as it spins off.
   */
  redirectHit(kind: 'laser' | 'boomerang'): void {
    if (kind === 'laser') {
      noise(0.06, { gain: 0.22, type: 'highpass', freq: 3800 }); // the energy SNAP
      tone(1568, 0.14, { type: 'square', gain: 0.09, sweepTo: 2350 }); // the zapped ball pings UP
      tone(392, 0.12, { type: 'sawtooth', gain: 0.1, sweepTo: 130 }); // discharge slump
      noise(0.03, { gain: 0.1, freq: 2600, q: 2, t: 0.05 }); // spark crackle
      noise(0.025, { gain: 0.07, freq: 3200, q: 2, t: 0.1 });
    } else {
      noise(0.035, { gain: 0.3, type: 'bandpass', freq: 1100, q: 1 }); // the wooden CRACK on the ball
      tone(260, 0.09, { type: 'triangle', gain: 0.18, sweepTo: 120 }); // solid knock body
      tone(1200, 0.05, { type: 'triangle', gain: 0.08, t: 0.01 }); // the ball's ping off the wood
      tone(340, 0.18, { type: 'sine', gain: 0.06, t: 0.05, sweepTo: 300 }); // wobble ring spinning off
    }
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
  /**
   * Touchdown voiced by the SURFACE (GS-audio-3) — the audio half of `spawnLandFX`: a water splash,
   * a lava sizzle, the void's negative-energy implosion, the star-ocean's whale answering the plunge,
   * and per-world tree knocks (crystal spires ping, giant mushrooms squelch, parkland knocks wood).
   * `treeHit` forces the tree voice for a mid-flight knockdown even when the ball drops clear of the
   * canopy poly. Silent (null voice) on ordinary turf — the strike + bounce already carry those.
   */
  land(lie: string, penalty?: string, arch?: string, treeHit?: boolean): void {
    const v = treeHit ? 'tree' : landVoiceOf(lie, penalty);
    switch (v) {
      case 'tree':
        treeSound(treeVoiceOf(arch));
        break;
      case 'splash':
        noise(0.16, { gain: 0.3, type: 'bandpass', freq: 850, q: 0.7 }); // the splash body
        tone(260, 0.18, { type: 'sine', gain: 0.18, sweepTo: 95 }); // the deep bloop under it
        noise(0.3, { gain: 0.1, type: 'highpass', freq: 2600, t: 0.04 }); // spray hiss
        tone(900, 0.05, { type: 'sine', gain: 0.08, t: 0.22, sweepTo: 1400 }); // falling droplets plink
        tone(1100, 0.05, { type: 'sine', gain: 0.06, t: 0.32, sweepTo: 1650 });
        break;
      case 'sizzle':
        tone(180, 0.14, { type: 'sine', gain: 0.16, sweepTo: 60 }); // the ball plunges into magma
        noise(0.7, { gain: 0.16, type: 'highpass', freq: 3400 }); // the long sizzle hiss
        noise(0.25, { gain: 0.12, type: 'bandpass', freq: 500, q: 0.6 }); // magma splash body
        tone(90, 0.2, { type: 'sine', gain: 0.1, t: 0.2, sweepTo: 140 }); // rising bubble glorps
        tone(70, 0.22, { type: 'sine', gain: 0.1, t: 0.42, sweepTo: 120 });
        noise(0.05, { gain: 0.08, freq: 1800, q: 2, t: 0.32 }); // a bubble pops
        break;
      case 'void':
        tone(160, 0.7, { type: 'sawtooth', gain: 0.11, sweepTo: 34 }); // dark falling drone…
        tone(164, 0.7, { type: 'sawtooth', gain: 0.08, sweepTo: 36 }); // …detuned twin, beating
        tone(1200, 0.5, { type: 'sine', gain: 0.07, sweepTo: 130 }); // a whistle pulled down into it
        noise(0.55, { gain: 0.1, type: 'bandpass', freq: 300, q: 0.5, t: 0.05 }); // hollow rush
        tone(55, 0.35, { type: 'sine', gain: 0.14, t: 0.3, sweepTo: 30 }); // the sub swallow
        break;
      case 'whale':
        noise(0.12, { gain: 0.18, type: 'bandpass', freq: 900, q: 0.7 }); // the plunge into the star-sea
        noise(0.6, { gain: 0.06, type: 'lowpass', freq: 380, t: 0.1 }); // deep-water wash
        tone(150, 0.55, { type: 'sine', gain: 0.15, t: 0.18, sweepTo: 420 }); // the whale's rising moan
        tone(420, 0.8, { type: 'sine', gain: 0.13, t: 0.68, sweepTo: 130 }); // …and its long falling answer
        tone(300, 0.5, { type: 'triangle', gain: 0.05, t: 0.72, sweepTo: 195 }); // harmonic shadow
        break;
      case 'rockfall':
        [
          { t: 0, f: 520, g: 0.2 },
          { t: 0.09, f: 430, g: 0.16 },
          { t: 0.2, f: 360, g: 0.12 },
          { t: 0.33, f: 300, g: 0.08 },
        ].forEach(({ t, f, g }) => {
          noise(0.05, { gain: g, type: 'lowpass', freq: f * 2, t }); // tumbling rock knocks
          tone(f * 0.35, 0.07, { type: 'triangle', gain: g * 0.7, t, sweepTo: f * 0.2 });
        });
        break;
      case 'sand':
        noise(0.12, { gain: 0.22, type: 'lowpass', freq: 700 }); // the soft "pff"
        tone(140, 0.08, { type: 'sine', gain: 0.1, sweepTo: 80 }); // a dead little thump
        break;
      case 'ice':
        tone(1900, 0.05, { type: 'triangle', gain: 0.1, sweepTo: 2300 }); // skittering plinks
        noise(0.04, { gain: 0.1, type: 'highpass', freq: 4000 });
        tone(2500, 0.04, { type: 'triangle', gain: 0.07, t: 0.07 });
        break;
      case 'crystal':
        tone(1568, 0.3, { type: 'triangle', gain: 0.1 }); // a glassy chime glint
        tone(2349, 0.35, { type: 'triangle', gain: 0.08, t: 0.03 });
        noise(0.03, { gain: 0.06, type: 'highpass', freq: 5000 });
        break;
      case 'scorch':
        noise(0.2, { gain: 0.14, type: 'lowpass', freq: 480 }); // ash whump
        noise(0.35, { gain: 0.08, type: 'highpass', freq: 3000, t: 0.05 }); // ember fizz
        tone(120, 0.1, { type: 'sine', gain: 0.08, sweepTo: 70 });
        break;
      case 'stardust':
        [1319, 1760, 2217].forEach((f, i) => tone(f, 0.12, { type: 'sine', gain: 0.07, t: i * 0.045 })); // charged shimmer
        noise(0.15, { gain: 0.05, type: 'highpass', freq: 5000 });
        break;
      case 'junk':
        noise(0.05, { gain: 0.2, type: 'bandpass', freq: 1300, q: 2 }); // the clank
        tone(720, 0.09, { type: 'square', gain: 0.05, sweepTo: 500 }); // ringing scrap
        noise(0.04, { gain: 0.12, type: 'bandpass', freq: 900, q: 2, t: 0.09 }); // settling rattle
        noise(0.03, { gain: 0.08, type: 'bandpass', freq: 1600, q: 2, t: 0.16 });
        break;
      case null:
        break;
    }
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

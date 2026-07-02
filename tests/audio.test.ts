/**
 * GS-audio-2 — the sound layer's machine checks.
 *
 * Two table+dispatch contracts, guarded the same way biome-identity guards the render tables:
 *   1. Every club in the CLUBS taxonomy resolves to a strike VOICE (driver/wood/hybrid/iron/
 *      wedge/putter) — a new club row must land in a sensible family, never fall to a crash.
 *   2. Every world archetype (+ the menu) has a MUSIC track row, and every row is playable
 *      (non-empty scale/chords, sane tempo) and SUBTLE (bounded gain — music is a bed, not a lead).
 *
 * Both modules import clean in node (WebAudio is only touched inside guarded calls), which is
 * itself part of the contract: the audio layer must never break the headless test world.
 */
import { describe, it, expect } from 'vitest';
import { sfx, strikeClassOf, landVoiceOf, treeVoiceOf, TREE_VOICES, type StrikeClass } from '../src/render/audio';
import { MUSIC_TRACKS, type MusicSceneId } from '../src/render/music';
import { CLUBS } from '../src/sim/clubs';
import { ARCHETYPE_TURF } from '../src/render/palette';
import type { BiomeArchetype } from '../src/sim/course/themes';
import type { PenaltyKind } from '../src/sim/shot';

const ARCHES = Object.keys(ARCHETYPE_TURF) as BiomeArchetype[];
const CLASSES: readonly StrikeClass[] = ['driver', 'wood', 'hybrid', 'iron', 'wedge', 'putter'];

describe('strike voices (GS-audio-2)', () => {
  it('every club in the taxonomy resolves to a strike class', () => {
    for (const c of CLUBS) {
      expect(CLASSES, `strike class for ${c.id}`).toContain(strikeClassOf(c.id));
    }
  });

  it('the families land where a golfer expects', () => {
    expect(strikeClassOf('D')).toBe('driver');
    expect(strikeClassOf('3W')).toBe('wood');
    expect(strikeClassOf('5W')).toBe('wood');
    expect(strikeClassOf('2H')).toBe('hybrid');
    expect(strikeClassOf('7i')).toBe('iron');
    expect(strikeClassOf('PW')).toBe('wedge');
    expect(strikeClassOf('SW')).toBe('wedge');
    expect(strikeClassOf('64')).toBe('wedge');
    expect(strikeClassOf('chip')).toBe('wedge');
    expect(strikeClassOf('putter')).toBe('putter');
    // No club known → the neutral mid-bag voice, never a throw.
    expect(strikeClassOf(undefined)).toBe('iron');
  });
});

describe('world music (GS-audio-2)', () => {
  it('every archetype has a track row, plus the menu (no silent fallback)', () => {
    const scenes: MusicSceneId[] = [...ARCHES, 'menu'];
    for (const s of scenes) {
      expect(MUSIC_TRACKS[s], `music track for ${s}`).toBeDefined();
    }
  });

  it('every track is playable and SUBTLE (bounded gain, sane tempo, real chord loop)', () => {
    for (const [id, t] of Object.entries(MUSIC_TRACKS)) {
      expect(t.scale.length, `${id} scale`).toBeGreaterThan(0);
      expect(t.chords.length, `${id} chords`).toBeGreaterThan(0);
      for (const chord of t.chords) expect(chord.length, `${id} chord voices`).toBeGreaterThan(0);
      expect(t.bpm, `${id} bpm`).toBeGreaterThanOrEqual(40);
      expect(t.bpm, `${id} bpm`).toBeLessThanOrEqual(120);
      expect(t.root, `${id} root`).toBeGreaterThan(40);
      expect(t.root, `${id} root`).toBeLessThan(400);
      // The subtlety bar: music sits well under the SFX bus (0.5). Raise this only on purpose.
      expect(t.gain, `${id} gain`).toBeGreaterThan(0);
      expect(t.gain, `${id} gain (music is a bed, not a lead)`).toBeLessThanOrEqual(0.35);
      // Densities are probabilities.
      for (const k of ['arpDensity', 'bassDensity', 'shimmer'] as const) {
        expect(t[k], `${id} ${k}`).toBeGreaterThanOrEqual(0);
        expect(t[k], `${id} ${k}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('no two worlds share the identical mood (root+scale+bpm fingerprint is unique)', () => {
    const prints = Object.values(MUSIC_TRACKS).map((t) => `${t.root}|${t.scale.join(',')}|${t.bpm}`);
    expect(new Set(prints).size).toBe(prints.length);
  });
});

describe('hazard landing voices (GS-audio-3)', () => {
  it('every SURFACE-bearing penalty kind resolves to a landing voice', () => {
    // OB / lost / unplayable are administrative — no surface to sound; the penalty wah answers those.
    const surfaced: PenaltyKind[] = ['water', 'lava', 'void', 'voidlost', 'ravine', 'cetuslost'];
    for (const p of surfaced) expect(landVoiceOf('rough', p), `voice for penalty ${p}`).toBeTruthy();
    for (const p of ['ob', 'lost', 'unplayable'] as PenaltyKind[]) expect(landVoiceOf('rough', p)).toBeNull();
  });

  it('the marquee hazards land where the ear expects', () => {
    expect(landVoiceOf('rough', 'lava')).toBe('sizzle');
    expect(landVoiceOf('lavariver', 'lava')).toBe('sizzle');
    expect(landVoiceOf('water', undefined)).toBe('splash');
    expect(landVoiceOf('creek', 'water')).toBe('splash');
    expect(landVoiceOf('frozenpond', 'water')).toBe('splash');
    expect(landVoiceOf('cetusdeep', 'cetuslost')).toBe('whale'); // the star-ocean answers with its whale
    expect(landVoiceOf('void', 'void')).toBe('void');
    expect(landVoiceOf('voidrough', 'voidlost')).toBe('void');
    expect(landVoiceOf('barranca', 'ravine')).toBe('rockfall');
    expect(landVoiceOf('trees')).toBe('tree');
    expect(landVoiceOf('bunker')).toBe('sand');
    // The effect ground patches (GS-journey-fx-2) each sound their family.
    expect(landVoiceOf('ice')).toBe('ice');
    expect(landVoiceOf('stardust')).toBe('stardust');
    expect(landVoiceOf('junk')).toBe('junk');
    expect(landVoiceOf('scorch')).toBe('scorch');
    // Ordinary turf stays quiet — the strike and bounce already carry it.
    expect(landVoiceOf('fairway')).toBeNull();
    expect(landVoiceOf('green')).toBeNull();
    expect(landVoiceOf('rough')).toBeNull();
  });

  it('every world archetype voices its tree hit (full-coverage table, like the flora)', () => {
    for (const a of Object.keys(ARCHETYPE_TURF) as BiomeArchetype[]) {
      expect(TREE_VOICES[a], `tree voice for ${a}`).toBeTruthy();
    }
  });

  it('the signature trees ring true: crystal pings, mushrooms squelch, parkland knocks wood', () => {
    expect(treeVoiceOf('crystal')).toBe('ping');
    expect(treeVoiceOf('fungal')).toBe('squelch');
    expect(treeVoiceOf('verdant')).toBe('wood');
    expect(treeVoiceOf('cetus')).toBe('stone');
    // No archetype known → the classic wood knock, never a throw.
    expect(treeVoiceOf(undefined)).toBe('wood');
  });
});

describe('caddy-guard projectile cues (GS-audio-4)', () => {
  it('both projectile kinds voice fire + hit cues as guarded headless no-ops (never a throw in node)', () => {
    for (const k of ['laser', 'boomerang'] as const) {
      expect(() => sfx.redirectFire(k, 900)).not.toThrow();
      expect(() => sfx.redirectFire(k)).not.toThrow(); // travel defaulted
      expect(() => sfx.redirectHit(k)).not.toThrow();
    }
    // The landing voices honour the same guard.
    expect(() => sfx.land('water', 'water', 'verdant')).not.toThrow();
    expect(() => sfx.land('trees', undefined, 'crystal', true)).not.toThrow();
  });
});

/**
 * Zone identity — content-as-data (GS-19). The lore/profile half of a stop's world, keyed by
 * BIOME ARCHETYPE (the 5 worlds a theme maps to). This is the prose + the at-a-glance hazard/
 * benefit/difficulty profile the per-hole briefing splash reads; the PHYSICS of a world live in
 * `biomes.ts`, the per-theme flavour in `themes.ts`, and the look in the render layer.
 *
 * Each zone is grounded in a real-space inspiration (the constellations/worlds it's drawn from),
 * then exaggerated into a signature golf mechanic so the five worlds FEEL distinct:
 *   • verdant — terraformed garden world: tree-lined parkland, gentle, the tutorial world.
 *   • desert  — Mars-like low-gravity dust belt: dunes, waste sand, the ball flies far.
 *   • frost   — frozen ring-world: glacier ice (slick), frozen ponds, savage crosswind.
 *   • inferno — volcanic ember world: RIVERS OF LAVA cross the fairway — a forced carry.
 *   • void    — near-vacuum target golf: miss the fairway and the ball is LOST TO THE VOID.
 *
 * Pure & DOM-free: no globals, no `Math.random`. The render layer keys the hero art + palette off
 * the archetype; this table is prose + profile only.
 */

import type { BiomeArchetype } from './themes';

/** A single profiled trait of a zone, with an emoji glyph for the at-a-glance card. */
export interface ZoneTrait {
  icon: string;
  text: string;
}

export interface ZoneProfile {
  archetype: BiomeArchetype;
  /** Display name for the world class (distinct from the per-stop theme name). */
  name: string;
  /** One-word/short signature mechanic — the thing that makes this world this world. */
  signature: string;
  /** The real-space inspiration the world is exaggerated from (one sentence). */
  inspiration: string;
  /** Two-to-three sentence flavour briefing for the splash card. */
  brief: string;
  /** What bites you here (penalties, spray, wind…). */
  hazards: ZoneTrait[];
  /** What helps you here (gravity, true surfaces, forgiveness…). */
  benefits: ZoneTrait[];
  /** Baseline difficulty rating 1 (gentle) .. 5 (brutal) — the world's character, not the stop. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export const ZONES: Record<BiomeArchetype, ZoneProfile> = {
  verdant: {
    archetype: 'verdant',
    name: 'Verdant Station',
    signature: 'Tree-lined parkland',
    inspiration:
      'Terraformed garden stations under temperate stars — the welcoming green of Crux, Lyra and Virgo.',
    brief:
      'A lush, earth-normal parkland world: the friendliest stop on the voyage. Tree-lined fairways and the odd pond frame wide, forgiving corridors — somewhere to find your swing before the galaxy turns wild.',
    hazards: [
      { icon: '🌲', text: 'Tree-lined rough — a sprayed ball must punch out' },
      { icon: '💧', text: 'Ponds flank the fairways (penalty)' },
      { icon: '🟡', text: 'Greenside & fairway bunkers' },
    ],
    benefits: [
      { icon: '🌍', text: 'Earth-normal gravity — clubs play true' },
      { icon: '🍃', text: 'Gentle breeze' },
      { icon: '↔️', text: 'Wide, forgiving fairways' },
    ],
    difficulty: 1,
  },
  desert: {
    archetype: 'desert',
    name: 'Dust Belt',
    signature: 'Dunes & waste sand',
    inspiration:
      'Mars-like dust worlds and the sand-dragged hulls of Argo — Vela, Carina and Puppis riding the dunes.',
    brief:
      'A low-gravity desert world of red dust and endless dunes. The thin air lets the ball fly far, but waste sand sprawls everywhere and the gusts are relentless — pick your line through the dunescape.',
    hazards: [
      { icon: '🏜️', text: 'Vast waste-sand fields choke the rough' },
      { icon: '🟡', text: 'Bunkers everywhere — a sandy world' },
      { icon: '🌬️', text: 'Strong, gusting crosswinds' },
    ],
    benefits: [
      { icon: '🪶', text: 'Low gravity — the ball carries far (+~22%)' },
      { icon: '🏃', text: 'Firm fairways run the ball out' },
      { icon: '↔️', text: 'Open, generous corridors' },
    ],
    difficulty: 2,
  },
  frost: {
    archetype: 'frost',
    name: 'Ice Ring',
    signature: 'Glacier ice & crosswind',
    inspiration:
      'Frozen ring-worlds and icy moons — the Crane wading frozen shallows, the cold blue knot of the Pleiades.',
    brief:
      'A frozen ring-world of glacier-blue ice and brutal crosswinds. Slick ice patches scatter the fairways — they spray a struck ball wildly — while frozen ponds wait for anything offline.',
    hazards: [
      { icon: '❄️', text: 'Slick ice patches — high dispersion, hard to control' },
      { icon: '💧', text: 'Frozen ponds (penalty)' },
      { icon: '🌬️', text: 'Savage crosswinds — the worst on the voyage' },
    ],
    benefits: [
      { icon: '🪶', text: 'Thin cold air carries a touch farther' },
      { icon: '💎', text: 'True crystal patches — fast and accurate' },
      { icon: '🎯', text: 'Calm holes reward a precise line' },
    ],
    difficulty: 3,
  },
  inferno: {
    archetype: 'inferno',
    name: 'Ember World',
    signature: 'Rivers of lava',
    inspiration:
      "Volcanic worlds and dying suns — Antares' red heart, the roiling furnace of Eta Carinae.",
    brief:
      'A volcanic ember world where rivers of molten lava run across the scorched basalt fairways. Each crossing is a forced carry — lay up short or fly it clean. The air is calm but heavy, so the ball flies a little shorter.',
    hazards: [
      { icon: '🌋', text: 'Lava rivers cross the fairway — a forced carry' },
      { icon: '🔥', text: 'Lava lakes flank the corridor (penalty)' },
      { icon: '🪨', text: 'Heavy air — the ball flies ~5% shorter' },
    ],
    benefits: [
      { icon: '🍃', text: 'Calm air — little wind to read' },
      { icon: '💎', text: 'True crystal lies near the greens' },
      { icon: '🎯', text: 'Generous landing zones between the rivers' },
    ],
    difficulty: 4,
  },
  void: {
    archetype: 'void',
    name: 'Void Garden',
    signature: 'Island fairways',
    inspiration:
      "The deep dark between the stars — the black hole at Sagittarius' heart, the Coalsack nebula's void-within-the-void.",
    brief:
      'Near-vacuum target golf over the abyss. There is no rough here — only the void. On the deepest, wildest stops, miss the fairway and the ball is lost to the void (stroke and distance). Almost no wind, and the lowest gravity in the galaxy: the ball flies forever.',
    hazards: [
      { icon: '🕳️', text: 'No rough — off the fairway is LOST (deep stops)' },
      { icon: '🌀', text: 'Antigrav pockets jitter the carry' },
      { icon: '🎯', text: 'Tight, island-like corridors' },
    ],
    benefits: [
      { icon: '🪶', text: 'Lowest gravity — the ball carries +~40%' },
      { icon: '🌌', text: 'Near-zero wind' },
      { icon: '💎', text: 'Crystal scatter — true, fast lies' },
    ],
    difficulty: 5,
  },
};

export function zoneProfile(archetype: BiomeArchetype): ZoneProfile {
  return ZONES[archetype];
}

/** Difficulty as filled/empty pips (e.g. ●●●○○ for 3) for a compact card display. */
export function difficultyPips(d: number): string {
  const n = Math.max(0, Math.min(5, Math.round(d)));
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

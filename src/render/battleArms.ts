/**
 * THE FINALE'S GUNS ARE THE SHIP'S GUNS (GS-story-battle-arms).
 *
 * Player report: *"to really sell portrait mode we kinda need custom art assets for each spaceship that has
 * a customised weapons display that is thematically appropriate — a UFO will need different looking and
 * spaced weapons to the wagon."* Dead right, and the fight was as generic as it gets: **every hull in the
 * fleet fired from ONE point**, `ship.x + SHIP_W*0.42` — dead centre off the nose — with no muzzle flash at
 * all. The mythic flying saucer spat golf-ball buckshot out of its snout exactly like the woody estate.
 *
 * The star map already answers this shape of question (`shipWeapons.ts WEAPON_BY_KIND`, GS-star-tour-
 * weapons), so this is its battle twin and follows the same rule: **an armament is a ROW keyed by
 * `look.kind`, so a new craft picks up fitting guns with zero engine edits.**
 *
 * ── THE SPLIT: THE UPGRADE SAYS WHAT A SHOT *DOES*, THE HULL SAYS WHERE IT COMES FROM AND HOW IT READS ──
 * The finale HUD seats one trigger per owned arsenal upgrade (scatter · railgun · nova · lance · wyrmfang),
 * each with its own damage, cooldown and projectile SHAPE. Letting the hull override that shape would make
 * all five triggers fire identical-looking shots and an arsenal would stop reading as an arsenal — a real
 * regression dressed as a feature. So the hull supplies the VOICE instead, which is where the difference is
 * actually visible: the MOUNTS (how many barrels, where on the hull, how far apart), the FIRING pattern
 * (barrels taking turns, a simultaneous salvo, or a channelled convergence), the MUZZLE FLASH, the shot's
 * TRAIL motif, and the energy LIVERY — resolved from the ship's own `look.flame`/`look.glass`, so the
 * colours come free with the ship row too.
 *
 * ZERO BALANCE: mounts move where a projectile is BORN, never how many there are or what they do on
 * arrival. `landPlayerHit` is per projectile, so adding one would multiply damage — the counts are
 * untouched, on purpose, and every shot still converges on the same aim point.
 *
 * Pure and DOM-free (node-tested by `tests/battle-arms.test.ts`); `storyBattle.ts` is the only consumer.
 */

import { shipById, DEFAULT_SHIP_ID, type ShipLook } from '../sim/rpg/ships';

/**
 * A barrel, in HULL-LOCAL units: `along` runs −1 (tail) → +1 (nose tip), `across` runs −1 (roof / upper
 * surface) → +1 (belly). Fractions of the hull's half-extent, so a mount stays put on the drawn craft at
 * any camera scale and in either orientation.
 */
export interface Hardpoint {
  along: number;
  across: number;
}

/** How a volley is distributed across the mounts. Never changes the projectile COUNT. */
export type FirePattern =
  | 'alternate' // the barrels take turns, pull to pull and shot to shot (a car with two rack guns)
  | 'salvo' // every barrel throws at once, the volley shared out between them (wings, pinions)
  | 'converge'; // the mounts all light, but the shot leaves their CENTRE — a channelled emitter

/** The muzzle flash's shape — drawn hull-local, so it banks with the craft. */
export type MuzzleFlash =
  | 'barrel' // a stubby cone of flame and a puff of smoke: a thing with a BORE
  | 'spark' // a hot needle and a cross-flare: high-velocity, no bore to speak of
  | 'ring' // an expanding halo at the emitter: energy, not ordnance
  | 'orb' // a swelling bright blob: plasma pooling before it lets go
  | 'arc'; // forked micro-bolts jumping off the mount: electrical

/** What the shot drags behind it. The single loudest "whose gun is this" cue after the muzzle. */
export type ShotTrail =
  | 'dimple' // a wake of little dimpled spheres — golf balls, obviously
  | 'streak' // one hard hot line
  | 'ripple' // concentric rings shed backwards
  | 'smoke' // fat fading puffs
  | 'crackle' // forked micro-lightning
  | 'ember' // falling sparks
  | 'halo'; // a ring orbiting the core

export interface ShipArms {
  /** What this hull's armament is called — surfaced on the console. */
  name: string;
  mounts: Hardpoint[];
  fire: FirePattern;
  flash: MuzzleFlash;
  trail: ShotTrail;
  /** Muzzle-flash size in design px at the drawn hull scale. */
  flashR: number;
}

/**
 * The armament each ship SILHOUETTE carries. Every one of the 11 kinds has a row (compile-checked by the
 * `Record`), so a new `ShipLook['kind']` fails to build until its guns are decided — which is the point.
 */
export const SHIP_ARMS: Record<ShipLook['kind'], ShipArms> = {
  // Woody station wagon → two cannons bolted to the LUGGAGE RACK, staggered fore and aft, taking turns.
  wagon: {
    name: 'ROOF RACK',
    mounts: [{ along: 0.42, across: -0.72 }, { along: 0.04, across: -0.78 }],
    fire: 'alternate',
    flash: 'barrel',
    trail: 'dimple',
    flashR: 11,
  },
  // Redline racer → one NOSE SPIKE at the very tip. Nothing wasted, nothing wide.
  racer: {
    name: 'NOSE SPIKE',
    mounts: [{ along: 0.95, across: 0.02 }],
    fire: 'alternate',
    flash: 'spark',
    trail: 'streak',
    flashR: 13,
  },
  // Alien saucer → the classic ABDUCTION emitter, dead under the disc. ONE emitter, so it cannot
  // `converge` (there is nothing to converge from) — with a single mount the pattern is a no-op anyway,
  // and the honest label is the one that says so.
  saucer: {
    name: 'UNDERBEAM',
    mounts: [{ along: 0.08, across: 0.82 }],
    fire: 'alternate',
    flash: 'ring',
    trail: 'ripple',
    flashR: 12,
  },
  // The Mothership → three RIM EMITTERS spaced round the hull, channelling to the dome's centre.
  ufo: {
    name: 'RIM EMITTERS',
    mounts: [{ along: -0.62, across: 0.4 }, { along: 0.04, across: 0.66 }, { along: 0.7, across: 0.4 }],
    fire: 'converge',
    flash: 'orb',
    trail: 'ripple',
    flashR: 11,
  },
  // Golf-ball comet → it SHEDS, from three points around its leading face.
  comet: {
    name: 'SHARD SPRAY',
    mounts: [{ along: 0.52, across: -0.56 }, { along: 0.82, across: 0.02 }, { along: 0.52, across: 0.56 }],
    fire: 'salvo',
    flash: 'spark',
    trail: 'dimple',
    flashR: 10,
  },
  // Cargo hauler → two hardpoints slung WIDE under the wings. The widest spacing in the fleet.
  shuttle: {
    name: 'WING PYLONS',
    mounts: [{ along: 0.18, across: -0.66 }, { along: 0.18, across: 0.74 }],
    fire: 'salvo',
    flash: 'barrel',
    trail: 'smoke',
    flashR: 12,
  },
  // Neon night-bike → twin FAIRING lasers, close together. The tightest spacing in the fleet, and a true
  // symmetric PAIR: straddling the keel, they read the same from the side and from above (no mirroring).
  moto: {
    name: 'FAIRING LASERS',
    mounts: [{ along: 0.78, across: -0.2 }, { along: 0.78, across: 0.2 }],
    fire: 'salvo',
    flash: 'spark',
    trail: 'streak',
    flashR: 9,
  },
  // The Thunderbolt chopper → one arc emitter high on the MAST.
  chopper: {
    name: 'MAST ARC',
    mounts: [{ along: 0.26, across: -0.86 }],
    fire: 'alternate',
    flash: 'arc',
    trail: 'crackle',
    flashR: 14,
  },
  // The Infinity Ace → the nose plus two HALO NODES, converging into one shot.
  infinity: {
    name: 'HALO NODES',
    mounts: [{ along: 0.88, across: 0 }, { along: -0.18, across: -0.7 }, { along: -0.18, across: 0.7 }],
    fire: 'converge',
    flash: 'ring',
    trail: 'halo',
    flashR: 12,
  },
  // The Asgardian Pegasus → BOLTS off the swept wings, thrown one after the other.
  pegasus: {
    name: 'WING BOLTS',
    mounts: [{ along: 0.3, across: -0.8 }, { along: -0.08, across: -0.58 }],
    fire: 'alternate',
    flash: 'arc',
    trail: 'crackle',
    flashR: 13,
  },
  // The World Serpent → it BITES. Both fangs, spread wide either side of the maw, thrown together —
  // and because the pair genuinely spans the keel, `planMounts` leaves it alone: from above the beast
  // bites with both sides, which is the only way a jaw has ever worked.
  serpent: {
    name: 'FANGS',
    mounts: [{ along: 0.86, across: -0.42 }, { along: 0.86, across: 0.42 }],
    fire: 'salvo',
    flash: 'orb',
    trail: 'ripple',
    flashR: 14,
  },
  // The Firebird → the BEAK and both PINIONS, all at once.
  firebird: {
    name: 'BEAK & PINIONS',
    mounts: [{ along: 0.9, across: -0.04 }, { along: -0.22, across: -0.76 }, { along: -0.22, across: 0.76 }],
    fire: 'salvo',
    flash: 'orb',
    trail: 'ember',
    flashR: 13,
  },
};

/** The armament plus the LIVERY it is drawn in — the ship's own exhaust and canopy colours, so a new ship
 *  row brings its weapon palette with it and nothing here needs editing. */
export interface ResolvedArms extends ShipArms {
  /** The hot core of a flash / the trail's energy. */
  hot: string;
  /** The cooler halo around it. */
  halo: string;
}

/** Inside this band of the keel a mount counts as ON the centreline — a nose gun, not a flank gun. */
export const KEEL_EPS = 0.15;

/**
 * The mounts as seen FROM ABOVE (GS-story-battle-topdown).
 *
 * A side elevation HIDES the far side of the ship, so a row authored against it can legitimately quote
 * every flank gun once — the wagon's two roof-rack barrels, the saucer's underbeam. Turn the camera and
 * draw the PLAN hull (`shipTopArt.ts`) and that becomes a ship firing out of its port wing only, which
 * reads as broken. A vehicle is symmetric about its keel, so from above you see both.
 *
 * ONE rule, and it is self-describing: **if every off-centre mount is on the same side, mirror them; if
 * the row already spans both sides, it has already accounted for the far side and is left alone.** That
 * lands right for all eleven rows — the wagon's rack doubles to four, the Mothership's three rim emitters
 * become a ring of six, the Pegasus grows a bolt on each wing — while the shuttle's two wide pylons, the
 * comet's three-point spray and the Firebird's beak-and-pinions stay exactly as authored. Centreline
 * mounts (a nose spike) are never doubled.
 */
export function planMounts(arms: ShipArms): Hardpoint[] {
  const flank = arms.mounts.filter((m) => Math.abs(m.across) > KEEL_EPS);
  if (!flank.length) return arms.mounts;
  const spansBoth = flank.some((m) => m.across > 0) && flank.some((m) => m.across < 0);
  if (spansBoth) return arms.mounts;
  return arms.mounts.flatMap((m) =>
    Math.abs(m.across) > KEEL_EPS ? [m, { along: m.along, across: -m.across }] : [m],
  );
}

/** The default armament for a ship with no known silhouette — the wagon's rack guns (everyone owns it). */
const DEFAULT_KIND: ShipLook['kind'] = 'wagon';

/** Resolve the flown ship's armament. Always a full `ResolvedArms`, for any id or none. */
export function shipArmsFor(shipId?: string): ResolvedArms {
  const look = (shipById(shipId) ?? shipById(DEFAULT_SHIP_ID))?.look;
  const kind = look?.kind ?? DEFAULT_KIND;
  return { ...SHIP_ARMS[kind], hot: look?.flame ?? '#ffd36b', halo: look?.glass ?? '#ffffff' };
}

/**
 * A mount's offset from the hull's drawn centre, in design px — BEFORE the hull's bank rotation, which the
 * caller applies so the barrel and its flash stay welded to the craft.
 *
 * `nose` is where the hull art's centre actually sits relative to the ship's transform origin: the sprite
 * is drawn at `-w*0.53`, so its middle is a hair BEHIND the origin, and a mount quoted at the nose tip must
 * land on the drawn nose rather than a few px past it.
 */
export function mountOffset(m: Hardpoint, w: number, h: number): { x: number; y: number } {
  return { x: -w * 0.03 + m.along * w * 0.5, y: m.across * h * 0.5 };
}

/** The mounts' centroid — where a `converge` armament actually looses its shot from. */
export function mountCentroid(arms: ShipArms, w: number, h: number): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (const m of arms.mounts) {
    const p = mountOffset(m, w, h);
    sx += p.x;
    sy += p.y;
  }
  const n = Math.max(1, arms.mounts.length);
  return { x: sx / n, y: sy / n };
}

/**
 * Which mount shot `k` of a volley leaves from, given how many pulls have already been made. `converge`
 * returns −1, meaning "no single mount — use the centroid". The projectile COUNT is the caller's and is
 * never touched here.
 */
export function mountForShot(arms: ShipArms, pulls: number, k: number): number {
  if (arms.fire === 'converge') return -1;
  const n = arms.mounts.length;
  if (n <= 1) return 0;
  return arms.fire === 'salvo' ? k % n : (pulls + k) % n;
}

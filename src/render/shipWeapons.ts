/**
 * Star-map SHIP WEAPONS (GS-star-tour-weapons) — the fire button on the Star Tour dashboard.
 *
 * Flying the star map is a records-chase joyride; this gives the ship a THEMATICALLY-MATCHED weapon you
 * fire from the console (a black-hole gun for the aurora grail, a scatter-gun for the woody wagon, a
 * lightning cannon for the chopper, …). It is content-as-data like the HUD livery: a WEAPON is one row
 * keyed by the ship's `look.kind`, so a new craft picks up a fitting gun with zero engine edits.
 *
 * This is PURE render/data (strings → SVG markup + a small config), exactly like `hudChrome.ts`. It never
 * touches the sim, a save, or the rng stream — the projectiles are an app-layer feel animation (the twin of
 * the fuel-tanker / thrust-plume), driven by `app.ts`'s star-map rAF loop. Ammo is a couple of charges that
 * refill whenever the tank does (at any station, or when the space tanker tops you up).
 *
 * Projectiles are authored FACING +x (travelling right), just like the ship art + thrust trail, so the app
 * spawns one by dropping the markup into `#gs-st-shots` and driving a `translate+rotate` transform per
 * frame. Colours come off the ship's own `look.flame`/`look.accent` where sensible, deliberately overridden
 * per weapon for punch.
 */

import { shipById, DEFAULT_SHIP_ID, type ShipLook } from '../sim/rpg/ships';

/** How a projectile is drawn + how it flies. Each maps to one `shotInnerSVG` branch. */
export type WeaponStyle =
  | 'scatter' // a volley of dimpled golf-ball buckshot (the wagon)
  | 'railgun' // a hypersonic slug with a long streak (the racer)
  | 'laser' // twin neon bolts (the speeder bike)
  | 'iceshard' // a spray of crystalline shards (the comet)
  | 'beam' // a sustained energy ray/lance (the alien saucer)
  | 'rocket' // finned missiles with a flame tail (the hauler)
  | 'plasma' // a pulsing plasma orb (the mothership)
  | 'lightning' // a forked bolt (the chopper / Pegasus Bifröst)
  | 'nova' // an aurora/black-hole nova, expanding rings (the Infinity Ace)
  | 'fireball' // a phoenix flame blob (the Firebird)
  | 'venom'; // a spat gobbet of venom trailing a corrosive mist (the World Serpent)

export interface Weapon {
  /** Short name on the fire button + its title. */
  name: string;
  /** Render + physics style. */
  style: WeaponStyle;
  /** Projectiles per trigger pull (a scatter fires a spread; a beam is one). */
  count: number;
  /** Total spread (deg) across the volley — 0 for a single straight shot. */
  spread: number;
  /** Chart-units travelled per frame (≈0 for an anchored zap: beam/lightning). */
  speed: number;
  /** Frames the projectile lives before it's removed. */
  life: number;
  /** Primary + bright core colours. */
  color: string;
  color2: string;
  /** The fire SFX flavour — an energy PEW ('laser') or a kinetic launch whoosh ('kinetic'). */
  sound: 'laser' | 'kinetic';
}

/** The weapon each ship SILHOUETTE carries — keyed by `look.kind` so a new ship row inherits a fitting gun
 *  with no edit here. Every one of the 11 ship kinds has a row (compile-checked by the `Record`). */
const WEAPON_BY_KIND: Record<ShipLook['kind'], Weapon> = {
  // Woody station wagon → a road-trip SCATTER-GUN spraying dimpled golf-ball buckshot.
  wagon: { name: 'SCATTER', style: 'scatter', count: 6, spread: 30, speed: 11, life: 34, color: '#ffd36b', color2: '#fff2c0', sound: 'kinetic' },
  // Redline racer → a hypersonic RAILGUN slug.
  racer: { name: 'RAILGUN', style: 'railgun', count: 1, spread: 0, speed: 27, life: 30, color: '#ff6b5a', color2: '#fff2c0', sound: 'laser' },
  // Alien saucer → an abduction RAY, a sustained green energy beam.
  saucer: { name: 'RAY', style: 'beam', count: 1, spread: 0, speed: 3, life: 15, color: '#9affd6', color2: '#eafff6', sound: 'laser' },
  // Golf-ball comet → a spray of ICE SHARDS.
  comet: { name: 'ICE SHARDS', style: 'iceshard', count: 3, spread: 22, speed: 16, life: 32, color: '#bfe3ff', color2: '#ffffff', sound: 'laser' },
  // Cargo hauler (shuttle) → a pair of finned ROCKETS.
  shuttle: { name: 'ROCKETS', style: 'rocket', count: 2, spread: 14, speed: 12, life: 42, color: '#ffb04a', color2: '#ff5a3c', sound: 'kinetic' },
  // The Mothership (ufo) → a heavy PLASMA orb (the classic saucer death-ray).
  ufo: { name: 'PLASMA', style: 'plasma', count: 1, spread: 0, speed: 9, life: 48, color: '#7fffd0', color2: '#c585ff', sound: 'laser' },
  // Neon night-bike → twin LASER bolts.
  moto: { name: 'NITRO', style: 'laser', count: 1, spread: 0, speed: 23, life: 26, color: '#ff5fbf', color2: '#28e0d0', sound: 'laser' },
  // The Thunderbolt chopper → a forked LIGHTNING cannon.
  chopper: { name: 'LIGHTNING', style: 'lightning', count: 1, spread: 0, speed: 2, life: 17, color: '#ffe08a', color2: '#ff7a1a', sound: 'laser' },
  // The Infinity Ace → a BLACK-HOLE / aurora NOVA (the grail's grail).
  infinity: { name: 'NOVA', style: 'nova', count: 1, spread: 0, speed: 7, life: 54, color: '#ffd76b', color2: '#4fe0b0', sound: 'laser' },
  // The Asgardian Pegasus → the BIFRÖST bolt, forked golden lightning (Thor's storm).
  pegasus: { name: 'BIFRÖST', style: 'lightning', count: 1, spread: 0, speed: 2, life: 17, color: '#fff0c8', color2: '#ffd36b', sound: 'laser' },
  // The Firebird → a PHOENIX fireball.
  firebird: { name: 'PHOENIX', style: 'fireball', count: 1, spread: 0, speed: 13, life: 38, color: '#ff7a1a', color2: '#ffca4a', sound: 'kinetic' },
  // The World Serpent → it SPITS. Two gobbets of venom on a lazy spread, trailing corrosive mist.
  serpent: { name: 'VENOM', style: 'venom', count: 2, spread: 12, speed: 14, life: 40, color: '#7cff9f', color2: '#eafff2', sound: 'kinetic' },
};

/** The default gun for a ship with no known silhouette (the wagon's scatter — everyone owns the wagon). */
const DEFAULT_WEAPON = WEAPON_BY_KIND.wagon;

/** Resolve the weapon for the flown ship (its `look.kind` → the fitting gun, falling back to the wagon's
 *  scatter). Always a full `Weapon`. */
export function shipWeaponFor(shipId: string | undefined): Weapon {
  const look = (shipById(shipId) ?? shipById(DEFAULT_SHIP_ID))?.look;
  return look ? WEAPON_BY_KIND[look.kind] : DEFAULT_WEAPON;
}

/**
 * GS-star-tour-weapons-equipped: the Weapon fired by each ownable ship-weapon UPGRADE
 * (`STORY_SHIP_UPGRADES`, category `weapon`). The upgrade variant ids (`scatter`/`railgun`/`nova`) already
 * name `WeaponStyle`s, so each reuses the matching hull gun's config with the upgrade's own short label —
 * the FIRE button then fires what you actually BOUGHT, not the ship hull's cosmetic default gun.
 */
const WEAPON_BY_UPGRADE: Record<string, Weapon> = {
  'upg:weapon:scatter': { ...WEAPON_BY_KIND.wagon, name: 'SCATTER' },
  'upg:weapon:railgun': { ...WEAPON_BY_KIND.racer, name: 'RAILGUN' },
  'upg:weapon:nova': { ...WEAPON_BY_KIND.infinity, name: 'NOVA' },
};

/** Owned weapon upgrades from strongest to weakest — the FIRE button fires your best (nova › railgun › scatter). */
const UPGRADE_WEAPON_PRIORITY: readonly string[] = ['upg:weapon:nova', 'upg:weapon:railgun', 'upg:weapon:scatter'];

/**
 * The weapon the star-map FIRE button should fire. In Story Tour the player buys real ship-weapon upgrades
 * (`ownedUpgradeIds` from `StoryState.ownedShipUpgradeIds`), so fire the BEST owned one — the equipped
 * weapon. With no owned weapon upgrades (Star Tour records-chase, or an unarmed campaign ship) it falls back
 * to the ship hull's default gun, byte-identical to the old `shipWeaponFor(shipId)` behaviour.
 */
export function tourWeaponFor(shipId: string | undefined, ownedUpgradeIds?: readonly string[]): Weapon {
  if (ownedUpgradeIds) {
    for (const id of UPGRADE_WEAPON_PRIORITY) {
      if (ownedUpgradeIds.includes(id)) return WEAPON_BY_UPGRADE[id]!;
    }
  }
  return shipWeaponFor(shipId);
}

// ── projectile markup (authored facing +x = forward) ───────────────────────────────────────────────────
// Each returns the INNER SVG of a shot `<g>`; the app wraps it in a per-frame `translate+rotate` transform
// (identical to the ship group), so a projectile flies along the ship's heading. SMIL animates pulse/flicker
// so the app only rewrites the transform + a fade opacity — no per-frame geometry work, no rng.

/** A short opacity flicker (energy/flame liveliness), the thrust-trail pattern. */
function flick(dur: string): string {
  return `<animate attributeName="opacity" values="1;0.45;0.85;0.5;1" dur="${dur}" repeatCount="indefinite"/>`;
}

/** The projectile inner markup for a style, coloured by the weapon (c1 body, c2 bright core). */
export function shotInnerSVG(style: WeaponStyle | 'flash' | 'pellet', c1: string, c2: string): string {
  switch (style) {
    case 'flash':
      // The muzzle FLASH at the nose — a quick expanding burst that freezes off (life-limited by the app).
      return `<circle r="3" fill="${c2}" opacity="0.95"><animate attributeName="r" values="3;11" dur="0.16s" fill="freeze"/><animate attributeName="opacity" values="0.95;0" dur="0.16s" fill="freeze"/></circle>
        <path d="M0,-3 L16,-6 L23,0 L16,6 L0,3 Z" fill="#ffffff" opacity="0.8"><animate attributeName="opacity" values="0.8;0" dur="0.14s" fill="freeze"/></path>`;
    case 'scatter':
    case 'pellet': {
      // A single dimpled golf-ball pellet (a scatter volley = several of these on spread headings).
      return `<circle r="3.1" fill="${c2}"/><circle r="3.1" fill="none" stroke="${c1}" stroke-width="0.9"/>
        <ellipse cx="14" cy="0" rx="12" ry="1.6" fill="${c1}" opacity="0.28"/>
        <circle cx="-0.8" cy="-0.8" r="0.5" fill="${c1}" opacity="0.5"/><circle cx="0.9" cy="0.6" r="0.5" fill="${c1}" opacity="0.5"/><circle cx="-0.6" cy="0.9" r="0.5" fill="${c1}" opacity="0.5"/>`;
    }
    case 'railgun':
      return `<rect x="-40" y="-0.8" width="66" height="1.6" fill="${c1}" opacity="0.5"/>
        <rect x="-11" y="-1.6" width="24" height="3.2" rx="1.6" fill="${c1}"/>
        <rect x="-7" y="-0.8" width="18" height="1.6" rx="0.8" fill="${c2}"/>
        <circle cx="13" cy="0" r="2.4" fill="#ffffff"/>`;
    case 'laser':
      // Twin parallel neon bolts (c1 over c2), each capped with a white spark head.
      return `<rect x="-13" y="-4.6" width="28" height="2.5" rx="1.25" fill="${c1}"/>
        <rect x="-13" y="2.1" width="28" height="2.5" rx="1.25" fill="${c2}"/>
        <circle cx="15" cy="-3.35" r="1.9" fill="#ffffff"/><circle cx="15" cy="3.35" r="1.9" fill="#ffffff"/>
        <rect x="-13" y="-4.6" width="34" height="9.2" fill="${c1}" opacity="0.14"/>`;
    case 'iceshard':
      return `<ellipse cx="8" cy="0" rx="14" ry="1.6" fill="${c1}" opacity="0.3"/>
        <path d="M15,0 L2,-4.4 L-9,0 L2,4.4 Z" fill="${c2}" opacity="0.92"/>
        <path d="M15,0 L2,-4.4 L-9,0 L2,4.4 Z" fill="none" stroke="${c1}" stroke-width="1"/>
        <circle cx="10" cy="0" r="1.5" fill="#ffffff"/>`;
    case 'beam':
      // A sustained RAY lance stretching forward from the nose, bright core, soft outer glow. Fades via life.
      return `<path d="M-6,-3 L150,-7 L182,0 L150,7 L-6,3 Z" fill="${c1}" opacity="0.32">${flick('0.16s')}</path>
        <rect x="-6" y="-2" width="188" height="4" rx="2" fill="${c2}" opacity="0.85">${flick('0.12s')}</rect>
        <rect x="-6" y="-0.9" width="188" height="1.8" fill="#ffffff"/>
        <circle cx="-4" cy="0" r="5.5" fill="${c2}" opacity="0.6"/>`;
    case 'rocket':
      return `<path d="M-15,-2 C-33,-3.4 -33,3.4 -15,2 Z" fill="${c1}" opacity="0.55">${flick('0.14s')}</path>
        <path d="M-15,-1.2 C-26,-2 -26,2 -15,1.2 Z" fill="${c2}" opacity="0.8">${flick('0.1s')}</path>
        <rect x="-14" y="-2.6" width="22" height="5.2" rx="2.6" fill="#dfe4ec"/>
        <path d="M8,-2.6 L17,0 L8,2.6 Z" fill="${c2}"/>
        <path d="M-13,-2.6 L-18,-6 L-9,-2.6 Z" fill="${c1}"/><path d="M-13,2.6 L-18,6 L-9,2.6 Z" fill="${c1}"/>
        <circle cx="1" cy="0" r="1.4" fill="${c2}"/>`;
    case 'plasma':
      return `<circle r="10" fill="${c1}" opacity="0.28"><animate attributeName="r" values="8;12;8" dur="0.42s" repeatCount="indefinite"/></circle>
        <circle r="6" fill="${c2}" opacity="0.55"/>
        <circle r="3.8" fill="${c1}"><animate attributeName="r" values="3.4;4.4;3.4" dur="0.3s" repeatCount="indefinite"/></circle>
        <circle r="1.8" fill="#ffffff"/>
        <ellipse cx="-14" cy="0" rx="10" ry="2.4" fill="${c2}" opacity="0.3"/>`;
    case 'lightning':
      // A forked bolt lancing forward, flickering hard (the "cannon" is a near-instant zap, life-limited).
      return `<path d="M-4,0 L18,-7 L11,-1 L36,-9 L27,-1 L58,-10 L48,-2 L86,-9" fill="none" stroke="${c1}" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.35">${flick('0.09s')}</path>
        <path d="M-4,0 L18,-7 L11,-1 L36,-9 L27,-1 L58,-10 L48,-2 L86,-9" fill="none" stroke="${c2}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">${flick('0.08s')}</path>
        <path d="M36,-9 L44,-18 L40,-12" fill="none" stroke="${c2}" stroke-width="1.8" stroke-linecap="round" opacity="0.85">${flick('0.11s')}</path>
        <path d="M58,-10 L52,-2 L56,-6" fill="none" stroke="${c2}" stroke-width="1.6" stroke-linecap="round" opacity="0.8">${flick('0.1s')}</path>
        <circle cx="-4" cy="0" r="4" fill="${c2}" opacity="0.7"/>`;
    case 'nova':
      // A BLACK-HOLE / aurora nova: two expanding rings, an aurora halo, a dark-cored bright singularity.
      return `<circle r="4" fill="none" stroke="${c1}" stroke-width="3"><animate attributeName="r" values="3;18" dur="1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="1s" repeatCount="indefinite"/></circle>
        <circle r="4" fill="none" stroke="${c2}" stroke-width="2"><animate attributeName="r" values="3;18" dur="1s" begin="0.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="1s" begin="0.5s" repeatCount="indefinite"/></circle>
        <circle r="8" fill="${c2}" opacity="0.35"><animate attributeName="opacity" values="0.2;0.45;0.2" dur="0.6s" repeatCount="indefinite"/></circle>
        <circle r="4.4" fill="${c1}"/>
        <circle r="2.2" fill="#1a1030"/>
        <circle r="1" fill="#ffffff"/>`;
    case 'venom':
      // A spat gobbet of venom: a heavy leading droplet with a whipping tail, wrapped in a corrosive
      // mist that boils along behind it. Drips shed off the underside as it flies.
      return `<path d="M-26,0 C-16,-4.4 -16,4.4 -26,0 Z" fill="${c1}" opacity="0.4">${flick('0.15s')}</path>
        <ellipse cx="-11" cy="0" rx="13" ry="3.6" fill="${c1}" opacity="0.3">${flick('0.22s')}</ellipse>
        <path d="M9,0 C6,-5.4 -6,-3.6 -12,0 C-6,3.6 6,5.4 9,0 Z" fill="${c1}" opacity="0.85"/>
        <ellipse cx="3.4" cy="0" rx="4.6" ry="3.2" fill="${c2}"/>
        <circle cx="4.6" cy="-0.6" r="1.5" fill="#ffffff" opacity="0.9"/>
        <circle cx="-7" cy="3.4" r="1.3" fill="${c1}" opacity="0.7"><animate attributeName="cy" values="3.4;6.4" dur="0.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0" dur="0.5s" repeatCount="indefinite"/></circle>
        <circle cx="-14" cy="2.6" r="1" fill="${c1}" opacity="0.6"><animate attributeName="cy" values="2.6;5.6" dur="0.7s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0" dur="0.7s" repeatCount="indefinite"/></circle>`;
    case 'fireball':
      return `<path d="M-20,0 C-30,-5 -26,5 -20,0 Z" fill="${c1}" opacity="0.5">${flick('0.13s')}</path>
        <ellipse cx="-8" cy="0" rx="12" ry="4" fill="${c1}" opacity="0.4"/>
        <ellipse cx="0" cy="0" rx="9" ry="6.5" fill="${c1}" opacity="0.6"><animate attributeName="rx" values="8;10;8" dur="0.24s" repeatCount="indefinite"/></ellipse>
        <ellipse cx="1.5" cy="0" rx="5.5" ry="4.2" fill="${c2}"/>
        <circle cx="2.5" cy="0" r="2.4" fill="#fff2c0"/>`;
  }
}

/** The fire button's ICON — a targeting reticle over a charged core, tinted by the weapon's own colours so
 *  each ship's trigger reads as its own gun. */
export function weaponReticleSVG(w: Weapon): string {
  return `<svg class="gs-sthud__fire-svg" viewBox="0 0 22 22" aria-hidden="true">
    <circle cx="11" cy="11" r="8" fill="none" stroke="${w.color}" stroke-width="1.5" opacity="0.75"/>
    <path d="M11 1 v3.6 M11 17.4 v3.6 M1 11 h3.6 M17.4 11 h3.6" stroke="${w.color}" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="11" cy="11" r="3" fill="${w.color2}"><animate attributeName="r" values="2.4;3.4;2.4" dur="1.1s" repeatCount="indefinite"/></circle>
    <circle cx="11" cy="11" r="1.2" fill="#ffffff"/>
  </svg>`;
}

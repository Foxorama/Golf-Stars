import { describe, it, expect } from 'vitest';
import { SHIP_ARMS, shipArmsFor, mountOffset, mountCentroid, mountForShot } from '../src/render/battleArms';
import { SHIPS, DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';

/**
 * GS-story-battle-arms — the finale's guns are the SHIP'S guns. The drawing lives in `storyBattle.ts`
 * (Canvas2D, DOM-bound); what is testable here is the DATA and the geometry: every silhouette has an
 * armament, every armament stays ON its hull, every ship in the catalogue resolves to a usable livery, and
 * the pattern maths distributes a volley without ever changing how many shots there are.
 */

const KINDS = Object.keys(SHIP_ARMS) as (keyof typeof SHIP_ARMS)[];

/** Rough relative luminance of a #rrggbb — a muzzle flash drawn in a near-black is no muzzle flash. */
function lum(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

describe('finale ship armaments', () => {
  it('every silhouette carries guns, and they sit ON the hull', () => {
    for (const k of KINDS) {
      const a = SHIP_ARMS[k];
      expect(a.mounts.length, `${k} has no mounts`).toBeGreaterThan(0);
      expect(a.name.length, `${k} unnamed`).toBeGreaterThan(2);
      expect(a.flashR, `${k} flash size`).toBeGreaterThan(4);
      for (const m of a.mounts) {
        // hull-local half-extents: a barrel hanging off the sprite is a barrel floating in space
        expect(Math.abs(m.along), `${k} mount along`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.across), `${k} mount across`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a converging armament has something to converge FROM', () => {
    for (const k of KINDS) {
      const a = SHIP_ARMS[k];
      if (a.fire === 'converge') expect(a.mounts.length, `${k} converges from one mount`).toBeGreaterThan(1);
    }
  });

  it('the fleet is visibly different: mount counts, spacing and flashes all vary', () => {
    const spans = KINDS.map((k) => {
      const ms = SHIP_ARMS[k].mounts;
      const across = ms.map((m) => m.across);
      return Math.max(...across) - Math.min(...across);
    });
    // the report's actual ask — a UFO must not be spaced like a wagon
    expect(new Set(KINDS.map((k) => SHIP_ARMS[k].mounts.length)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(KINDS.map((k) => SHIP_ARMS[k].flash)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(KINDS.map((k) => SHIP_ARMS[k].trail)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(KINDS.map((k) => SHIP_ARMS[k].name)).size).toBe(KINDS.length);
    expect(Math.max(...spans) - Math.min(...spans)).toBeGreaterThan(0.5);
    // the two the player named, head to head
    const wagon = SHIP_ARMS.wagon;
    const ufo = SHIP_ARMS.ufo;
    expect(ufo.mounts.length).not.toBe(wagon.mounts.length);
    expect(ufo.flash).not.toBe(wagon.flash);
    expect(ufo.trail).not.toBe(wagon.trail);
  });

  it('every ship in the catalogue resolves to a full, VISIBLE livery', () => {
    for (const s of SHIPS) {
      const a = shipArmsFor(s.id);
      expect(a.mounts.length, `${s.id}`).toBeGreaterThan(0);
      // colours come off the ship's own look — and a flash has to actually read against deep space
      expect(lum(a.hot), `${s.id} hot too dark`).toBeGreaterThan(0.3);
      expect(lum(a.halo), `${s.id} halo too dark`).toBeGreaterThan(0.3);
      expect(a).toEqual(shipArmsFor(s.id)); // pure
    }
    // an unknown / absent id still arms the ship (the wagon's rack guns)
    expect(shipArmsFor(undefined).name).toBe(SHIP_ARMS.wagon.name);
    expect(shipArmsFor('no-such-ship').name).toBe(SHIP_ARMS.wagon.name);
    expect(shipArmsFor(DEFAULT_SHIP_ID).name).toBe(SHIP_ARMS.wagon.name);
  });

  it('mount geometry lands inside the drawn hull, and a converge fires from the middle of it', () => {
    const W = 118;
    const H = (118 * 40) / 62;
    for (const k of KINDS) {
      const a = SHIP_ARMS[k];
      for (const m of a.mounts) {
        const o = mountOffset(m, W, H);
        expect(Math.abs(o.x), `${k}`).toBeLessThanOrEqual(W * 0.56);
        expect(Math.abs(o.y), `${k}`).toBeLessThanOrEqual(H * 0.52);
      }
      const c = mountCentroid(a, W, H);
      const xs = a.mounts.map((m) => mountOffset(m, W, H).x);
      const ys = a.mounts.map((m) => mountOffset(m, W, H).y);
      expect(c.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9);
      expect(c.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9);
      expect(c.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-9);
    }
  });

  it('the pattern only chooses WHERE a shot is born — never how many there are', () => {
    for (const k of KINDS) {
      const a = SHIP_ARMS[k];
      const n = a.mounts.length;
      for (let pulls = 0; pulls < 7; pulls++) {
        for (let shot = 0; shot < 5; shot++) {
          const i = mountForShot(a, pulls, shot);
          if (a.fire === 'converge') expect(i, `${k}`).toBe(-1);
          else {
            expect(i, `${k} pull ${pulls} shot ${shot}`).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(n);
          }
        }
      }
      if (a.fire === 'salvo' && n > 1) {
        // a salvo shares the volley out across the barrels — consecutive shots use different mounts
        expect(mountForShot(a, 0, 0)).not.toBe(mountForShot(a, 0, 1));
        // …and it does NOT depend on how many pulls have happened
        expect(mountForShot(a, 5, 1)).toBe(mountForShot(a, 0, 1));
      }
      if (a.fire === 'alternate' && n > 1) {
        // the barrels take turns pull to pull, so a single-shot weapon still alternates
        expect(mountForShot(a, 0, 0)).not.toBe(mountForShot(a, 1, 0));
      }
    }
  });
});

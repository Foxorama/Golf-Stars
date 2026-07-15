import { describe, it, expect } from 'vitest';
import { SHIPS } from '../src/sim/rpg/ships';
import { shipWeaponFor, shotInnerSVG, weaponReticleSVG, type WeaponStyle } from '../src/render/shipWeapons';

/**
 * Star-map ship weapons (GS-star-tour-weapons) — pure render/data guards. Every ship must resolve a full
 * weapon (so a new ship row never lands on the dashboard with a broken fire button), and every projectile
 * style must produce non-empty SVG markup (so no style renders blank). Zero sim/rng/save coupling.
 */
describe('ship weapons (star-map dashboard)', () => {
  it('every ship resolves a complete, sane weapon', () => {
    for (const s of SHIPS) {
      const w = shipWeaponFor(s.id);
      expect(w.name, `${s.id} weapon name`).toBeTruthy();
      expect(w.count, `${s.id} volley count`).toBeGreaterThanOrEqual(1);
      expect(w.speed, `${s.id} projectile speed`).toBeGreaterThanOrEqual(0);
      expect(w.life, `${s.id} projectile life`).toBeGreaterThan(0);
      expect(w.color, `${s.id} weapon colour`).toMatch(/^#/);
      expect(w.color2, `${s.id} weapon core colour`).toMatch(/^#/);
      expect(['laser', 'kinetic']).toContain(w.sound);
    }
  });

  it('an unknown ship falls back to the wagon scatter (never throws / blanks)', () => {
    const w = shipWeaponFor('no-such-ship');
    expect(w.style).toBe('scatter');
  });

  it('every projectile + button style renders non-empty SVG markup', () => {
    const styles: (WeaponStyle | 'flash' | 'pellet')[] = [
      'scatter',
      'pellet',
      'railgun',
      'laser',
      'iceshard',
      'beam',
      'rocket',
      'plasma',
      'lightning',
      'nova',
      'fireball',
      'flash',
    ];
    for (const st of styles) {
      const svg = shotInnerSVG(st, '#ffcc00', '#ffffff');
      expect(svg, `${st} markup`).toBeTruthy();
      expect(svg.length, `${st} markup length`).toBeGreaterThan(20);
    }
    // The button reticle wraps a real <svg> and echoes the weapon colours.
    const ret = weaponReticleSVG(shipWeaponFor(SHIPS[0]!.id));
    expect(ret).toContain('<svg');
  });
});

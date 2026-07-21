/**
 * GS-ship-interior-variety — every ship family draws a DISTINCT cabin, and every ship × room renders a
 * valid, byte-stable, theme-tinted SVG. Guards that a new ship kind can't silently fall through the
 * `cabinStyleOf` fold, that no two cabin styles collapse to the same shell, and that the flavoured room
 * labels stay in sync with the five rooms.
 */
import { describe, it, expect } from 'vitest';
import {
  shipInteriorTheme,
  shipRoomArt,
  shipRoomMeta,
  cabinStyleOf,
  type CabinStyle,
} from '../src/render/shipInteriorArt';
import { SHIP_ROOMS } from '../src/ui/gameState';
import { SHIPS } from '../src/sim/rpg/ships';

const ALL_STYLES: CabinStyle[] = ['auto', 'disc', 'steed', 'bike', 'freighter', 'aurora', 'wyrm', 'radiant'];

/** Rough count of balanced SVG element opens/closes so a malformed scene is caught. */
function svgWellFormed(svg: string): boolean {
  const opens = (svg.match(/<svg[\s>]/g) ?? []).length;
  const closes = (svg.match(/<\/svg>/g) ?? []).length;
  return opens === 1 && closes === 1 && svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>');
}

describe('ship interior cabin styles', () => {
  it('folds every ship kind into a known cabin style', () => {
    for (const s of SHIPS) {
      expect(ALL_STYLES).toContain(cabinStyleOf(s.look.kind));
    }
    // the three the player called out are all DISTINCT from the car cabins
    expect(cabinStyleOf('saucer')).toBe('disc');
    expect(cabinStyleOf('ufo')).toBe('disc');
    expect(cabinStyleOf('pegasus')).toBe('steed');
    expect(cabinStyleOf('wagon')).toBe('auto');
    expect(cabinStyleOf('wagon')).not.toBe(cabinStyleOf('saucer'));
    expect(cabinStyleOf('wagon')).not.toBe(cabinStyleOf('pegasus'));
    // an unknown kind degrades safely to the car cabin
    expect(cabinStyleOf('totally-made-up')).toBe('auto');
  });

  it('gives the route-reward hulls their bespoke cabins via per-ship overrides (GS-ship-interior-2)', () => {
    // The herald wyrm-ship reuses a racer hull, the warden cruiser a shuttle hull — by kind alone they'd
    // get the car cabin / freighter hold. The override hands them their own styles.
    expect(shipInteriorTheme('wyrm-ship').style).toBe('wyrm');
    expect(shipInteriorTheme('warden-cruiser').style).toBe('radiant');
    // and every other ship still follows its kind fold
    for (const s of SHIPS) {
      if (s.id === 'wyrm-ship' || s.id === 'warden-cruiser') continue;
      expect(shipInteriorTheme(s.id).style).toBe(cabinStyleOf(s.look.kind));
    }
    // meta accepts a style directly (the screens pass theme.style) — the wyrm helm is the Skull Helm
    expect(shipRoomMeta('bridge', 'wyrm').label).toBe('Skull Helm');
    expect(shipRoomMeta('bridge', 'radiant').label).toBe('Sanctum Helm');
  });

  it('renders a valid, non-trivial SVG for every ship × room', () => {
    for (const s of SHIPS) {
      const theme = shipInteriorTheme(s.id);
      for (const room of SHIP_ROOMS) {
        const svg = shipRoomArt(room, theme);
        expect(svgWellFormed(svg), `${s.id}/${room}`).toBe(true);
        expect(svg.length).toBeGreaterThan(600);
        // theme-tinted: the ship's trim/energy colour appears in its rooms
        expect(svg.includes(theme.trim) || svg.includes(theme.energy)).toBe(true);
      }
    }
  });

  it('is byte-stable (pure, no rng) — same ship/room renders identically twice', () => {
    const theme = shipInteriorTheme('pegasus-valkyrie');
    for (const room of SHIP_ROOMS) {
      expect(shipRoomArt(room, theme)).toBe(shipRoomArt(room, theme));
    }
  });

  it('gives each cabin style a genuinely different shell (no two styles collapse to one layout)', () => {
    // Represent every style by a real ship and compare the BRIDGE scene structurally.
    const rep: Record<CabinStyle, string> = {
      auto: 'wagon-classic',
      disc: 'ufo-saucer',
      steed: 'pegasus-valkyrie',
      bike: 'moto-nitro',
      freighter: 'hauler-barge',
      aurora: 'infinity-ace',
      wyrm: 'wyrm-ship',
      radiant: 'warden-cruiser',
    };
    // Strip colours/ids so the comparison is about STRUCTURE, not palette.
    const skeleton = (id: string) =>
      shipRoomArt('bridge', shipInteriorTheme(id))
        .replace(/#[0-9a-fA-F]{3,8}/g, '#')
        .replace(/si-[a-z]+-[a-z0-9]+/g, 'id')
        .replace(/[0-9.]+/g, 'n');
    const shapes = Object.values(rep).map(skeleton);
    expect(new Set(shapes).size).toBe(ALL_STYLES.length);
  });

  it('flavours room labels per cabin style, covering all five rooms', () => {
    for (const style of ALL_STYLES) {
      // find a ship whose resolved theme draws this style (covers the per-ship override styles too)
      const ship = SHIPS.find((s) => shipInteriorTheme(s.id).style === style)!;
      expect(ship, `a ship exists for ${style}`).toBeTruthy();
      for (const room of SHIP_ROOMS) {
        const m = shipRoomMeta(room, style);
        expect(m.label.length).toBeGreaterThan(0);
        expect(m.icon.length).toBeGreaterThan(0);
      }
    }
    // the Pegasus helm is a "Saddle", not a generic "Bridge"
    expect(shipRoomMeta('bridge', 'pegasus').label).toBe('Saddle');
    expect(shipRoomMeta('bridge', 'saucer').label).toBe('Helm Pod');
    expect(shipRoomMeta('bridge', 'wagon').label).toBe('Cockpit');
  });
});

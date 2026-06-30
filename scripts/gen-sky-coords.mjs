// Extract a real-sky coordinate per voyage THEME from the night-sky catalogue (GS-galaxy-map).
// Each theme is grounded in a real constellation / deep-sky object / galaxy, so it has a true
// J2000 position (RA/Dec). The travel starmap plots the visited trail at these positions so a
// journey reads as actually wandering the sky, not a generic Earth→right curve. Keyed by the
// theme's name-slug (the catalogue and the THEMES table share names, having been harvested from
// the same source). Run: node scripts/gen-sky-coords.mjs
import fs from 'node:fs';

const cat = JSON.parse(fs.readFileSync(new URL('../data/night-sky-cards.json', import.meta.url), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r2 = (n) => Math.round(n * 1000) / 1000;

const out = {};

// Constellations: the figure's centroid (RA wrap-aware) is its on-sky anchor point.
for (const c of cat.constellations) {
  const ras = c.stars.map((s) => s.raDeg);
  const decs = c.stars.map((s) => s.decDeg);
  const span = Math.max(...ras) - Math.min(...ras);
  const ur = span > 180 ? ras.map((r) => (r < 180 ? r + 360 : r)) : ras; // unwrap the 0/360 seam
  const ra = (ur.reduce((a, b) => a + b, 0) / ur.length) % 360;
  const dec = decs.reduce((a, b) => a + b, 0) / decs.length;
  out[slug(c.name)] = { ra: r2(ra), dec: r2(dec) };
}

// Deep-sky showpieces carry their own equatorial position.
for (const o of cat.deepSky) {
  if (typeof o.raDeg === 'number' && typeof o.decDeg === 'number') {
    out[slug(o.name)] = { ra: r2(o.raDeg), dec: r2(o.decDeg) };
  }
}

// Galaxy features have no per-object coords in the catalogue — pin them to their real anchors.
const GALAXY_OVERRIDE = {
  'milky-way-core': { ra: 266.417, dec: -29.008 }, // Sgr A*, the Galactic Centre
  'magellanic-clouds': { ra: 80.894, dec: -69.756 }, // the Large Magellanic Cloud
};
Object.assign(out, GALAXY_OVERRIDE);

// Cetus (the Whale) is a GS-cetus voyage theme but isn't a card in the harvested catalogue — pin it to
// its real figure centroid (J2000), the same hand-anchor approach the galaxies use above.
out['cetus'] = { ra: 31.6, dec: -5.9 };

const body = `/**
 * Real-sky coordinates per voyage THEME (GS-galaxy-map) — GENERATED from data/night-sky-cards.json
 * by scripts/gen-sky-coords.mjs. Equatorial J2000: \`ra\` in degrees (0–360), \`dec\` in degrees
 * (−90..+90). Keyed by the theme's name-slug. The travel starmap plots the cleared trail at these
 * positions so the journey reads as a real path through the sky. DO NOT EDIT BY HAND.
 */

export interface SkyCoord { ra: number; dec: number }

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const THEME_SKY: Record<string, SkyCoord> = ${JSON.stringify(out, null, 2)};

/** Real-sky position for a theme, looked up by its display name (or slug). Undefined if unmapped. */
export function skyCoordForName(name: string | undefined): SkyCoord | undefined {
  if (!name) return undefined;
  return THEME_SKY[name] ?? THEME_SKY[slug(name)];
}
`;
fs.writeFileSync(new URL('../src/render/sky-coords.ts', import.meta.url), body);
console.log('wrote', Object.keys(out).length, 'theme sky coords');

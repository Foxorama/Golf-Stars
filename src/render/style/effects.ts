/**
 * Course-effect + sky showpiece painters (GS-style-split): trade tents (GS-tents), meteor scorch
 * craters (GS-meteor-scorch) and effect ground patches (GS-journey-fx-2) — zero-rng posHash art
 * drawn from the SAME sim tables the lie conversion reads — plus the themed wind streaks
 * (GS-wind, off the celestial `crng`) and the stop's constellation backdrop (GS-17e, no rng).
 */

import type { Hole, Vec } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { themeById } from '../../sim/course/themes';
import { rarCol } from '../../sim/rpg/loot';
import type { TradeTent } from '../../sim/tents';
import type { ScorchMark } from '../../sim/scorch';
import type { GroundPatch, PatchKind } from '../../sim/patches';
import { constellationFigure } from '../constellations';
import type { Projector } from '../project';
import { type Prim, posHash, hexAlpha } from './shared';

/** Bright festival tent colour pairs (roof / shadow side) — content-as-data, cycled by tent index. */
const TENT_FILLS: [string, string][] = [
  ['#ef5350', '#b4302d'], // red
  ['#42a5f5', '#1f6fbf'], // blue
  ['#ffca28', '#cf9f17'], // gold
  ['#66bb6a', '#3f8e4a'], // green
  ['#ab47bc', '#7a2f8a'], // purple
];

/**
 * Draw the trade-camp TENTS (GS-tents) as bright, billboard-upright festival tents at their course
 * positions — projected so they sit ON the ground around the green and track the follow-cam (the fix
 * for the old screen-space caravan that floated in mid-air). A striped conical roof + a dark doorway +
 * a pennant + a warm camp glow, sized by `proj.scale`. Pure (the geometry is the tent's own; no rng).
 */
/**
 * Meteor-strike scorch craters (GS-meteor-scorch): a charred, still-smouldering strike mark — an
 * irregular soot blob with a raised ash ring, radial burn rays where the impact splashed, and a few
 * ember flecks glowing in the char. All variation is `posHash` of the mark's course position (zero
 * rng draws — the seeded scene streams are untouched). The footprint circle drawn here is EXACTLY
 * the `ScorchMark` radius the sim's lie conversion tests, so what you see is what you play.
 */
export function styleScorch(marks: readonly ScorchMark[], proj: Projector): Prim[] {
  const out: Prim[] = [];
  for (const m of marks) {
    const [x, y] = proj.project(m.c);
    const rr = Math.max(4, m.r * proj.scale);
    const h = (k: number) => posHash(m.c[0], m.c[1], m.variant * 17 + k);
    // Faint ember glow under everything so the char reads warm, not like a plain shadow.
    out.push({ t: 'glow', c: [x, y], r: rr * 1.5, col: 'rgba(255,120,50,0.12)' });
    // Radial burn rays — the impact splash, tapered darts pointing outward.
    const rays = 5 + Math.floor(h(1) * 3);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + h(i + 2) * 0.8;
      const len = rr * (1.25 + h(i + 9) * 0.6);
      const wid = rr * 0.16;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      out.push({
        t: 'poly',
        pts: [
          [x + dx * rr * 0.7 - dy * wid, y + dy * rr * 0.7 + dx * wid],
          [x + dx * rr * 0.7 + dy * wid, y + dy * rr * 0.7 - dx * wid],
          [x + dx * len, y + dy * len],
        ],
        fill: 'rgba(26,20,16,0.5)',
      });
    }
    // The charred blob itself — an irregular near-circle at the TRUE footprint radius.
    const n = 10;
    const blob: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 0.86 + h(i + 20) * 0.24;
      blob.push([x + Math.cos(a) * rr * wob, y + Math.sin(a) * rr * wob]);
    }
    out.push({ t: 'poly', pts: blob, fill: 'rgba(24,18,15,0.88)', stroke: 'rgba(64,48,38,0.8)', sw: 1.1 });
    // Ash-grey inner bowl, offset a touch so the crater reads dished, not flat.
    out.push({ t: 'circle', c: [x - rr * 0.12, y - rr * 0.1], r: rr * 0.55, fill: 'rgba(66,58,52,0.75)' });
    // Ember flecks smouldering in the char.
    for (let i = 0; i < 3; i++) {
      const a = h(i + 31) * Math.PI * 2;
      const d = rr * (0.15 + h(i + 41) * 0.5);
      out.push({
        t: 'circle',
        c: [x + Math.cos(a) * d, y + Math.sin(a) * d],
        r: Math.max(0.7, rr * 0.09),
        fill: i === 0 ? 'rgba(255,170,80,0.95)' : 'rgba(255,110,50,0.85)',
      });
    }
  }
  return out;
}

/**
 * Effect GROUND PATCHES (GS-journey-fx-2): per-family turf-patch art, drawn at the TRUE footprint
 * radius the sim's lie conversion tests (the graphic IS the physics). All variation is `posHash` of
 * the patch's course position (zero rng draws — the seeded scene streams are untouched).
 *   • stardust — a pale charged shimmer with little four-point sparkles: reads as a BONUS, not a burn.
 *   • frost    — an icy rime disc with crystalline spokes: reads slick.
 *   • junk     — half-buried scrap slabs with a warning blink: reads snagged.
 *   • tar      — a glossy black gravitic sink with a violet sheen and sunk bubbles: reads sticky.
 */
export function stylePatches(kind: PatchKind, patches: readonly GroundPatch[], proj: Projector): Prim[] {
  const out: Prim[] = [];
  for (const m of patches) {
    const [x, y] = proj.project(m.c);
    const rr = Math.max(4, m.r * proj.scale);
    const h = (k: number) => posHash(m.c[0], m.c[1], m.variant * 17 + k);
    // Irregular near-circle footprint at the TRUE radius (shared by all three families).
    const n = 10;
    const blob: Vec[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 0.86 + h(i + 20) * 0.24;
      blob.push([x + Math.cos(a) * rr * wob, y + Math.sin(a) * rr * wob]);
    }
    if (kind === 'stardust') {
      // Charged comet dust — a cool glow, a translucent pale drift, and tiny four-point sparkles.
      out.push({ t: 'glow', c: [x, y], r: rr * 1.6, col: 'rgba(150,225,255,0.16)' });
      out.push({ t: 'poly', pts: blob, fill: 'rgba(205,240,255,0.42)', stroke: 'rgba(160,230,255,0.7)', sw: 1 });
      out.push({ t: 'circle', c: [x - rr * 0.15, y - rr * 0.12], r: rr * 0.5, fill: 'rgba(235,250,255,0.4)' });
      const sparks = 3 + Math.floor(h(1) * 2);
      for (let i = 0; i < sparks; i++) {
        const a = h(i + 31) * Math.PI * 2;
        const d = rr * (0.15 + h(i + 41) * 0.65);
        const sx = x + Math.cos(a) * d;
        const sy = y + Math.sin(a) * d;
        const sr = rr * (0.14 + h(i + 51) * 0.12);
        out.push({ t: 'line', a: [sx - sr, sy], b: [sx + sr, sy], stroke: 'rgba(255,255,255,0.9)', sw: 0.9, round: true });
        out.push({ t: 'line', a: [sx, sy - sr], b: [sx, sy + sr], stroke: 'rgba(255,255,255,0.9)', sw: 0.9, round: true });
      }
    } else if (kind === 'frost') {
      // Rime frozen onto the turf — an icy disc, crystalline spokes, a bright specular rim.
      out.push({ t: 'poly', pts: blob, fill: 'rgba(210,238,252,0.55)', stroke: 'rgba(245,252,255,0.85)', sw: 1.1 });
      out.push({ t: 'circle', c: [x - rr * 0.12, y - rr * 0.1], r: rr * 0.55, fill: 'rgba(240,250,255,0.5)' });
      const spokes = 5 + Math.floor(h(1) * 3);
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + h(i + 2) * 0.7;
        const len = rr * (0.55 + h(i + 9) * 0.4);
        out.push({
          t: 'line',
          a: [x + Math.cos(a) * rr * 0.15, y + Math.sin(a) * rr * 0.15],
          b: [x + Math.cos(a) * len, y + Math.sin(a) * len],
          stroke: 'rgba(255,255,255,0.75)',
          sw: 0.9,
          round: true,
        });
      }
    } else if (kind === 'tar') {
      // Gravitic tar — a glossy black sink with a cold violet sheen, a darker sunken well and a few
      // trapped bubbles. Reads heavy and sticky: the ball plugs, it doesn't run.
      out.push({ t: 'glow', c: [x, y], r: rr * 1.5, col: 'rgba(120,70,190,0.14)' });
      out.push({ t: 'poly', pts: blob, fill: 'rgba(14,10,22,0.82)', stroke: 'rgba(120,80,180,0.6)', sw: 1.2 });
      // The sunken well — an inner darker disc, offset toward the light for a bowl read.
      out.push({ t: 'circle', c: [x + rr * 0.1, y + rr * 0.1], r: rr * 0.62, fill: 'rgba(6,4,12,0.85)' });
      // A cold specular highlight up-light (the glossy surface).
      out.push({ t: 'circle', c: [x - rr * 0.24, y - rr * 0.24], r: rr * 0.28, fill: 'rgba(150,120,210,0.35)' });
      // A few trapped bubbles half-sunk in the pitch.
      const bubbles = 2 + Math.floor(h(1) * 3);
      for (let i = 0; i < bubbles; i++) {
        const a = h(i + 31) * Math.PI * 2;
        const d = rr * (0.15 + h(i + 41) * 0.55);
        const br = rr * (0.08 + h(i + 51) * 0.1);
        out.push({ t: 'circle', c: [x + Math.cos(a) * d, y + Math.sin(a) * d], r: br, fill: 'rgba(60,40,90,0.7)' });
      }
    } else {
      // Wreckage half-buried in the grass — a dark scorched bed, grey scrap slabs, one blinking light.
      out.push({ t: 'poly', pts: blob, fill: 'rgba(30,32,38,0.55)', stroke: 'rgba(70,76,90,0.7)', sw: 1 });
      const slabs = 2 + Math.floor(h(1) * 2);
      for (let i = 0; i < slabs; i++) {
        const a = h(i + 5) * Math.PI * 2;
        const d = rr * (0.1 + h(i + 15) * 0.45);
        const cx = x + Math.cos(a) * d;
        const cy = y + Math.sin(a) * d;
        const w = rr * (0.35 + h(i + 25) * 0.3);
        const ht = w * (0.45 + h(i + 35) * 0.3);
        const rot = h(i + 45) * Math.PI;
        const ca = Math.cos(rot);
        const sa = Math.sin(rot);
        const pts: Vec[] = [
          [cx - ca * w + sa * ht, cy - sa * w - ca * ht],
          [cx + ca * w + sa * ht, cy + sa * w - ca * ht],
          [cx + ca * w - sa * ht, cy + sa * w + ca * ht],
          [cx - ca * w - sa * ht, cy - sa * w + ca * ht],
        ];
        out.push({ t: 'poly', pts, fill: i % 2 ? 'rgba(96,106,124,0.9)' : 'rgba(70,78,94,0.9)', stroke: 'rgba(150,164,188,0.6)', sw: 0.8 });
      }
      // A dead panel light — a static red dot (the sim reads the footprint, the light is dressing).
      out.push({ t: 'circle', c: [x + rr * 0.3, y - rr * 0.2], r: Math.max(0.7, rr * 0.08), fill: 'rgba(255,90,90,0.85)' });
    }
  }
  return out;
}

export function styleTents(tents: readonly TradeTent[], proj: Projector): Prim[] {
  const out: Prim[] = [];
  for (const t of tents) {
    const [x, y] = proj.project(t.c);
    const rr = Math.max(6, t.r * proj.scale * 0.95);
    const [roof, shade] = TENT_FILLS[t.hue % TENT_FILLS.length]!;
    const peakY = y - rr * 1.85; // tent height
    const eaveY = y - rr * 0.05;
    const baseY = y + rr * 0.55;
    // Warm camp glow so the tents read as a lively market at night.
    out.push({ t: 'glow', c: [x, y - rr * 0.4], r: rr * 2.0, col: 'rgba(255,196,110,0.20)' });
    // Cast shadow on the ground.
    out.push({ t: 'circle', c: [x, baseY], r: rr * 0.95, fill: 'rgba(0,0,0,0.26)' });
    // Body (the canvas walls) — a short trapezoid under the roof.
    out.push({
      t: 'poly',
      pts: [
        [x - rr * 0.74, eaveY],
        [x + rr * 0.74, eaveY],
        [x + rr * 0.6, baseY],
        [x - rr * 0.6, baseY],
      ],
      fill: shade,
      stroke: 'rgba(20,16,24,0.55)',
      sw: 1,
    });
    // Roof: two panels meeting at the ridge peak (lit left, shaded right), with a couple of bright
    // stripes so it reads as a striped marquee.
    out.push({ t: 'poly', pts: [[x, peakY], [x - rr * 1.0, eaveY], [x, eaveY]], fill: roof, stroke: 'rgba(20,16,24,0.6)', sw: 1 });
    out.push({ t: 'poly', pts: [[x, peakY], [x + rr * 1.0, eaveY], [x, eaveY]], fill: shade, stroke: 'rgba(20,16,24,0.6)', sw: 1 });
    out.push({ t: 'line', a: [x - rr * 0.5, (peakY + eaveY) / 2], b: [x - rr * 0.5, eaveY], stroke: 'rgba(255,255,255,0.5)', sw: 1.4, round: true });
    out.push({ t: 'line', a: [x + rr * 0.5, (peakY + eaveY) / 2], b: [x + rr * 0.5, eaveY], stroke: 'rgba(255,255,255,0.32)', sw: 1.4, round: true });
    // Dark doorway.
    out.push({
      t: 'poly',
      pts: [
        [x - rr * 0.2, eaveY],
        [x + rr * 0.2, eaveY],
        [x + rr * 0.15, baseY],
        [x - rr * 0.15, baseY],
      ],
      fill: 'rgba(28,20,30,0.8)',
    });
    // Pennant flag on the peak.
    out.push({ t: 'line', a: [x, peakY], b: [x, peakY - rr * 0.55], stroke: 'rgba(235,238,250,0.85)', sw: 1.2, round: true });
    out.push({ t: 'poly', pts: [[x, peakY - rr * 0.55], [x + rr * 0.5, peakY - rr * 0.4], [x, peakY - rr * 0.26]], fill: roof });
  }
  return out;
}
/**
 * The stop's constellation, hung large across the upper sky (screen-space) and rarity-tinted
 * (GS-17e). Pure & deterministic — figure geometry comes from the catalogue table, positions are
 * fixed (no rng), so it's byte-stable. Deep-sky/galaxy themes have no stick figure → nothing drawn
 * (the ambient starfield carries them). The figure stars sit ON TOP of the terrain (it's the sky),
 * so the constellation is the stop's identity in BOTH the map and the zoomed play view — not a
 * faint corner motif. The brightest star (lowest magnitude) is the ANCHOR: it gets an extra glow
 * + a fine ring so a Scorpius reads off its Antares, an Orion off its Rigel.
 */
export function constellationBackdrop(themeId: string, W: number, H: number): Prim[] {
  const fig = constellationFigure(themeId);
  if (!fig) return [];
  const tint = rarCol(themeById(themeId)?.rarity ?? 'common');
  // Fit the unit-box figure into a generous sky panel across the top, preserving aspect.
  const boxW = W * 0.62;
  const boxH = H * 0.26;
  const ox = W * 0.5 - boxW / 2;
  const oy = H * 0.045;
  const at = (s: { x: number; y: number }): Vec => [ox + s.x * boxW, oy + s.y * boxH];
  // The anchor = the figure's brightest star (lowest magnitude).
  let anchor = 0;
  for (let i = 1; i < fig.stars.length; i++) if (fig.stars[i]!.m < fig.stars[anchor]!.m) anchor = i;

  const prims: Prim[] = [];
  // Faint connecting lines first (the stick figure) — a touch brighter than the corner motif was.
  for (const [a, b] of fig.lines) {
    const sa = fig.stars[a];
    const sb = fig.stars[b];
    if (!sa || !sb) continue;
    prims.push({ t: 'line', a: at(sa), b: at(sb), stroke: hexAlpha(tint, 0.42), sw: 0.9, round: true });
  }
  // Then the stars: brighter (lower mag) = bigger, with a soft halo + a tint dot.
  for (let i = 0; i < fig.stars.length; i++) {
    const s = fig.stars[i]!;
    const p = at(s);
    const r = Math.max(1.2, 3.6 - s.m * 0.5);
    if (i === anchor) {
      // The anchor star: a wide warm glow + a fine tinted ring, so it reads as the hero.
      prims.push({ t: 'circle', c: p, r: r * 4.2, fill: hexAlpha(tint, 0.12) });
      prims.push({ t: 'circle', c: p, r: r * 2.1, fill: 'none', stroke: hexAlpha(tint, 0.5), sw: 0.8 });
    }
    prims.push({ t: 'circle', c: p, r: r * 2.4, fill: hexAlpha(tint, 0.18) }); // halo
    prims.push({ t: 'circle', c: p, r, fill: 'rgba(255,255,255,0.97)' });
    prims.push({ t: 'circle', c: p, r: Math.max(0.7, r * 0.55), fill: hexAlpha(tint, 0.9) });
  }
  return prims;
}

/** The Rainbow Road sky's aurora hues (GS-rainbow-polish) — a prismatic sweep, warm→cool. */
const RAINBOW_SKY_HUES = ['#ff4d7d', '#ff9a3d', '#ffe23d', '#49e06b', '#3bd1ff', '#7d6bff', '#c46bff'];

/**
 * The Rainbow Road's bespoke starfield flourish (GS-rainbow-polish): drawn OVER the shared deep-space
 * base + starfield so the legendary ball reads as its own cosmic world, distinct from Cetus's blue
 * star-ocean and the Void's violet abyss. A stack of soft prismatic AURORA ribbons bowing across the
 * upper sky (the intro cinematic's screen-blended nebula, rainbow-hued) plus a scatter of coloured
 * hero stars twinkling through it. Screen-space, off a DEDICATED rng stream so it never perturbs the
 * shared celestial `crng` (the stars/planet/comet stay byte-identical), and camera-proof — every loop
 * is a fixed count, no projection is read. `accents` scales the density like every other art layer.
 */
export function rainbowSky(W: number, H: number, accents: number, rng: () => number): Prim[] {
  if (accents <= 0) return [];
  const prims: Prim[] = [];
  // Broad prismatic nebula blooms low-alpha across the sky — the deep glow the aurora rides over.
  for (let i = 0; i < 4; i++) {
    const hue = RAINBOW_SKY_HUES[(i * 2) % RAINBOW_SKY_HUES.length]!;
    prims.push({
      t: 'glow',
      c: [W * (0.12 + rng() * 0.76), H * (0.05 + rng() * 0.4)],
      r: (0.26 + rng() * 0.24) * Math.max(W, H),
      col: hexAlpha(hue, 0.1),
    });
  }
  // Aurora curtains: each hue a gently bowed band sweeping the top third of the sky, stacked so the
  // colours bleed into one another like a real aurora. Two soft strokes per hue (a wide dim wash + a
  // brighter core) so the ribbon glows rather than reading as a hard drawn line.
  const bands = RAINBOW_SKY_HUES.length;
  const baseY = H * 0.1;
  const spanY = H * 0.34;
  for (let i = 0; i < bands; i++) {
    const hue = RAINBOW_SKY_HUES[i]!;
    const y = baseY + (spanY * i) / (bands - 1);
    const sag = (rng() - 0.5) * H * 0.14; // the band bows up or down across the width
    const yEnd = y - sag * 0.5;
    const yMid = y + sag;
    // A wide dim wash (curtain body) then a tighter bright core — two eased strokes read as glow.
    // The bow is approximated by two straight glowing segments; round caps blend the mid joint.
    for (const [sw, a] of [[16, 0.05], [7, 0.09]] as const) {
      prims.push({ t: 'line', a: [0, yEnd], b: [W * 0.5, yMid], stroke: hexAlpha(hue, a), sw, round: true });
      prims.push({ t: 'line', a: [W * 0.5, yMid], b: [W, yEnd], stroke: hexAlpha(hue, a), sw, round: true });
    }
  }
  // Coloured hero stars twinkling through the aurora — the prismatic counterpart to the white/blue
  // salt of the shared field, so even the point-stars read "rainbow world".
  const starN = Math.round(26 * accents);
  for (let i = 0; i < starN; i++) {
    const hue = RAINBOW_SKY_HUES[(rng() * RAINBOW_SKY_HUES.length) | 0]!;
    const sx = rng() * W;
    const sy = rng() * H * 0.6; // keep them up in the sky, clear of the road below
    const r = 0.6 + rng() * 1.4;
    prims.push({ t: 'glow', c: [sx, sy], r: r * 4, col: hexAlpha(hue, 0.5) });
    prims.push({ t: 'circle', c: [sx, sy], r, fill: 'rgba(255,255,255,0.95)' });
  }
  return prims;
}

/** Per-world WIND look (GS-wind): the colour of the weather streaking across the hole. */
const WIND_COL: Record<BiomeArchetype, string> = {
  inferno: 'rgba(255,150,70,', // solar wind / embers
  frost: 'rgba(222,243,255,', // driven snow
  desert: 'rgba(226,196,140,', // blown dust
  verdant: 'rgba(208,236,206,', // pollen / leaf drift
  void: 'rgba(200,170,255,', // cosmic dust
  crystal: 'rgba(190,238,248,', // glittering crystal dust
  tempest: 'rgba(200,180,255,', // driving storm rain
  fungal: 'rgba(150,240,190,', // drifting glowing spores
  ocean: 'rgba(190,235,230,', // sea spray
  cetus: 'rgba(150,235,245,', // luminous sea-spray off the deep
  asgard: 'rgba(255,240,190,', // pale divine gold-white — drifting light off the Golden Realm
};

/** Unit SCREEN direction the wind blows, from a hole's `Wind.dir` (course bearing) through the
 *  projector (which has rotated tee→green up) — so the streaks read true to the shot bearing. */
function windScreenDir(hole: Hole, proj: Projector): Vec {
  const w = hole.wind;
  if (!w) return [0, 0];
  const r = (w.dir * Math.PI) / 180;
  const c0 = hole.tee;
  const c1: Vec = [c0[0] + Math.sin(r), c0[1] + Math.cos(r)];
  const a = proj.project(c0);
  const b = proj.project(c1);
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/**
 * Static wind streaks blowing across the hole (GS-wind) — the on-screen "solar wind" that shows
 * which way and how hard it's blowing, themed per world. Screen-space, off the independent `crng`
 * (so it never perturbs the terrain stream), count + length scaling with `Wind.spd`. The play view
 * layers an animated drift on top; this static pass makes the map + SVG read the weather too.
 */
export function windStreaks(hole: Hole, proj: Projector, arch: BiomeArchetype, W: number, H: number, crng: () => number): Prim[] {
  const spd = hole.wind?.spd ?? 0;
  if (spd < 2) return [];
  const [dx, dy] = windScreenDir(hole, proj);
  if (dx === 0 && dy === 0) return [];
  const intensity = Math.min(1, (spd - 2) / 26);
  // FLOWING comet-streaks, not scratchy uniform dashes (the old look read as rain on the glass). Each
  // streak is a faint long TAIL + a brighter short HEAD at its leading edge, so the wind DIRECTION
  // reads at a glance even on the still SVG map; count/length/brightness scale with speed. The
  // animated overlay (weather.ts) layers true motion on top during play. Off the independent `crng`,
  // the LAST crng consumer in buildScene, so count/draw changes shift nothing else (determinism kept).
  const count = Math.round(10 + intensity * 30);
  const colBase = WIND_COL[arch];
  // The cross-stream perpendicular, to bow each streak slightly into a gust curve.
  const px = -dy;
  const py = dx;
  const prims: Prim[] = [];
  for (let i = 0; i < count; i++) {
    const hx = crng() * W;
    const hy = crng() * H;
    const len = (16 + intensity * 40) * (0.55 + crng() * 0.9);
    const bow = (crng() - 0.5) * len * 0.18;
    const tailA = (0.05 + intensity * 0.10) * (0.6 + crng() * 0.4);
    const headA = tailA * 2.1;
    // faint long tail, trailing back UPWIND from the head
    const tx = hx - dx * len + px * bow;
    const ty = hy - dy * len + py * bow;
    prims.push({ t: 'line', a: [hx, hy], b: [tx, ty], stroke: colBase + tailA.toFixed(3) + ')', sw: 1, round: true });
    // brighter short head segment so the leading edge (wind direction) pops
    prims.push({ t: 'line', a: [hx, hy], b: [hx - dx * len * 0.32, hy - dy * len * 0.32], stroke: colBase + headA.toFixed(3) + ')', sw: 1.5, round: true });
  }
  return prims;
}

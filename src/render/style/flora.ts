/**
 * World flora + archetype signature decor (GS-style-split / GS-biome-feel): the per-archetype
 * tree silhouettes (each consuming EXACTLY the classic two rng draws) and the per-world seeded
 * ground decor pass (asteroids/fissures/spore-mist/shards/drifts/dunes/storm-eye/surf). The
 * determinism + camera contracts are documented per function — never add rng draws or
 * view-dependent counts here.
 */

import type { Vec } from '../../sim/course/contract';
import { dist, pointInPoly } from '../../sim/course/contract';
import type { BiomeArchetype } from '../../sim/course/themes';
import { CANOPY } from '../palette';
import type { Projector } from '../project';
import { type Prim, type Box, centroidOf, offsetPoly, posHash } from './shared';

/**
 * One piece of world FLORA (GS-biome-feel). Every world used to draw the SAME green parkland canopy
 * — the spore jungle's "luminous mushroom stands" and Prism Reach's "crystalline spires" were
 * literally oak trees, the single biggest reskin tell. The tree hazard now dispatches per archetype
 * to a distinct silhouette: glowing mushrooms, snow-dusted conifers, charred ember snags, saguaros,
 * crystal spires, wind-bent storm scrub, palms, coastal sea-stacks. The LIE is unchanged (`trees` —
 * you still punch out of whatever it is); this is pure render identity.
 *
 * CRITICAL determinism: every variant consumes EXACTLY the two rng draws the classic canopy did
 * (size + tint) — all further variation is a `posHash` of the projected position — so the main art
 * stream is byte-for-byte unchanged on every world, and verdant keeps the original canopy verbatim.
 */
export function styleFlora(poly: Vec[], proj: Projector, rng: () => number, arch: BiomeArchetype): Prim[] {
  const cc = centroidOf(poly);
  let rad = 0;
  for (const p of poly) rad += dist(p, cc);
  rad /= poly.length;
  const [x, y] = proj.project(cc);
  const rr = Math.max(3, rad * proj.scale * (0.9 + rng() * 0.5));
  // Slight per-tree hue variance so a treeline isn't a row of clones (the SAME two draws everywhere).
  const tint = rng();
  // Variants hash off the COURSE centroid `cc` (stable under any camera), never the projected px.
  switch (arch) {
    case 'fungal':
      return floraMushroom(x, y, rr, tint, cc);
    case 'frost':
      return floraConifer(x, y, rr, tint);
    case 'inferno':
      return floraSnag(x, y, rr, tint, cc);
    case 'desert':
      return floraSaguaro(x, y, rr, tint, cc);
    case 'crystal':
      return floraShard(x, y, rr, tint);
    case 'tempest':
      return floraWindScrub(x, y, rr, tint);
    case 'ocean':
      return floraPalm(x, y, rr, tint, cc);
    case 'cetus':
      return floraSeaStack(x, y, rr, tint, cc);
    case 'asgard':
      return floraGoldAsh(x, y, rr, tint, cc);
    default:
      break; // verdant (and any unknown) → the classic parkland canopy, byte-identical
  }
  const body = tint < 0.33 ? '#247f34' : tint < 0.66 ? CANOPY.base : '#36a043';
  return [
    { t: 'circle', c: [x, y + rr * 0.7], r: rr * 0.7, fill: CANOPY.shadow }, // cast shadow
    {
      t: 'line',
      a: [x, y + rr * 0.95],
      b: [x, y + rr * 0.1],
      stroke: CANOPY.trunk,
      sw: rr * 0.34,
      round: true,
    },
    { t: 'circle', c: [x, y], r: rr, fill: CANOPY.core, stroke: CANOPY.ink, sw: 1 }, // core shadow
    { t: 'circle', c: [x - rr * 0.12, y - rr * 0.12], r: rr * 0.82, fill: body }, // body
    { t: 'circle', c: [x - rr * 0.3, y - rr * 0.32], r: rr * 0.5, fill: CANOPY.lit }, // lit cap
  ];
}

/** Spore-jungle GIANT MUSHROOM: a pale stalk under a wide flattened dome cap that glows from
 *  within, gill shadow under the rim, luminous spots on top. */
function floraMushroom(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const cool = tint >= 0.66; // a teal minority among the violet stands
  const cap = tint < 0.33 ? '#8a5ce0' : tint < 0.66 ? '#6a42c0' : '#3fbf9c';
  const capLit = cool ? '#7ae8cc' : '#a97ef0';
  const glow = cool ? 'rgba(90,240,190,0.26)' : 'rgba(150,120,255,0.26)';
  const top = y - rr * 1.5; // cap underside height
  const dome: Vec[] = [
    [x - rr * 1.15, top],
    [x - rr * 0.68, top - rr * 0.72],
    [x, top - rr * 0.94],
    [x + rr * 0.68, top - rr * 0.72],
    [x + rr * 1.15, top],
  ];
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.5], r: rr * 0.68, fill: CANOPY.shadow }, // cast shadow
    { t: 'glow', c: [x, top - rr * 0.3], r: rr * 2.3, col: glow }, // bioluminescent halo
    { t: 'line', a: [x, y + rr * 0.4], b: [x, top], stroke: '#ded4f2', sw: rr * 0.34, round: true }, // stalk
    { t: 'line', a: [x - rr * 0.95, top + 1], b: [x + rr * 0.95, top + 1], stroke: 'rgba(30,16,60,0.55)', sw: 1.6, round: true }, // gill shadow
    { t: 'poly', pts: dome, fill: cap, stroke: 'rgba(26,14,52,0.7)', sw: 1 }, // the cap
    { t: 'poly', pts: [[x - rr * 0.62, top - rr * 0.5], [x - rr * 0.2, top - rr * 0.82], [x + rr * 0.28, top - rr * 0.78], [x - rr * 0.1, top - rr * 0.42]], fill: capLit }, // lit sheen
  ];
  // Luminous spots across the cap (position-hashed — no rng).
  for (let i = 0; i < 3; i++) {
    const u = posHash(key[0], key[1], i) - 0.5;
    out.push({ t: 'circle', c: [x + u * rr * 1.5, top - rr * (0.28 + posHash(key[0], key[1], i + 3) * 0.4)], r: rr * 0.13, fill: 'rgba(240,236,255,0.9)' });
  }
  return out;
}

/** Frost-world CONIFER: three stacked spruce tiers dusted with snow along their lit edges. */
function floraConifer(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#2c6a52' : tint < 0.66 ? '#2f7a5e' : '#256048';
  const h = rr * 2.6;
  const tw = [1.3, 0.98, 0.62]; // tier half-widths
  const by = [0.02, 0.32, 0.58]; // tier base heights
  const ty = [0.46, 0.74, 1.0]; // tier apex heights
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.5], r: rr * 0.6, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.35], b: [x, y - h * 0.1], stroke: CANOPY.trunk, sw: rr * 0.26, round: true },
  ];
  for (let i = 0; i < 3; i++) {
    const bY = y - h * by[i]!;
    const aY = y - h * ty[i]!;
    out.push({ t: 'poly', pts: [[x - rr * tw[i]!, bY], [x + rr * tw[i]!, bY], [x, aY]], fill: body, stroke: '#123a2c', sw: 1 });
    // Snow along each tier's lit (left) edge.
    out.push({ t: 'line', a: [x, aY], b: [x - rr * tw[i]! * 0.72, bY - (bY - aY) * 0.24], stroke: 'rgba(255,255,255,0.85)', sw: 1.2, round: true });
  }
  out.push({ t: 'circle', c: [x, y - h], r: rr * 0.16, fill: '#ffffff' }); // snow cap
  return out;
}

/** Ember-world CHARRED SNAG: a leaning burnt trunk with bare jagged branches, embers still
 *  crawling up it, over a warm ground glow. */
function floraSnag(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const body = tint < 0.5 ? '#33241c' : '#241710';
  const lean = (posHash(key[0], key[1]) - 0.5) * rr * 0.6;
  const topX = x + lean;
  const topY = y - rr * 2.2;
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: 'rgba(0,0,0,0.2)' },
    { t: 'glow', c: [x, y], r: rr * 1.6, col: 'rgba(255,120,44,0.18)' }, // ground ember glow
    { t: 'line', a: [x, y + rr * 0.3], b: [topX, topY], stroke: body, sw: rr * 0.3, round: true }, // trunk
    // Two bare jagged branches off the upper trunk.
    { t: 'line', a: [x + lean * 0.55, y - rr * 1.3], b: [x + lean * 0.55 - rr * 0.9, y - rr * 1.8], stroke: body, sw: rr * 0.16, round: true },
    { t: 'line', a: [x + lean * 0.8, y - rr * 1.8], b: [x + lean * 0.8 + rr * 0.75, y - rr * 2.3], stroke: body, sw: rr * 0.14, round: true },
  ];
  // An ember or two still glowing on the trunk (position-hashed).
  for (let i = 0; i < 2; i++) {
    if (posHash(key[0], key[1], i + 7) < 0.7) {
      const t = 0.35 + posHash(key[0], key[1], i + 11) * 0.5;
      out.push({ t: 'circle', c: [x + lean * t, y + rr * 0.3 - (y + rr * 0.3 - topY) * t], r: rr * 0.1 + 0.5, fill: '#ff8a2a' });
    }
  }
  return out;
}

/** Dust-belt SAGUARO: a tall ribbed column with two elbowed arms, the desert's lone sentinel. */
function floraSaguaro(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const body = tint < 0.33 ? '#5f8a4e' : tint < 0.66 ? '#6f9a58' : '#527c46';
  const h = rr * 2.4;
  const armY1 = y - h * 0.55;
  const armY2 = y - h * (0.4 + posHash(key[0], key[1]) * 0.15);
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: 'rgba(0,0,0,0.18)' },
    { t: 'line', a: [x, y + rr * 0.3], b: [x, y - h], stroke: body, sw: rr * 0.5, round: true }, // column
    { t: 'line', a: [x - rr * 0.1, y], b: [x - rr * 0.1, y - h * 0.9], stroke: 'rgba(255,255,240,0.18)', sw: rr * 0.1, round: true }, // lit rib
    // Left arm: out then up.
    { t: 'line', a: [x, armY1], b: [x - rr * 0.8, armY1], stroke: body, sw: rr * 0.34, round: true },
    { t: 'line', a: [x - rr * 0.8, armY1], b: [x - rr * 0.8, armY1 - rr * 0.85], stroke: body, sw: rr * 0.34, round: true },
    // Right arm, a touch lower.
    { t: 'line', a: [x, armY2], b: [x + rr * 0.7, armY2], stroke: body, sw: rr * 0.3, round: true },
    { t: 'line', a: [x + rr * 0.7, armY2], b: [x + rr * 0.7, armY2 - rr * 0.6], stroke: body, sw: rr * 0.3, round: true },
  ];
  if (posHash(key[0], key[1], 5) < 0.3) out.push({ t: 'circle', c: [x, y - h - rr * 0.1], r: rr * 0.16, fill: '#ffd0e0' }); // desert bloom
  return out;
}

/** Prism-Reach CRYSTAL SPIRE: a tall faceted shard with a smaller sibling, glowing from within. */
function floraShard(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#9fd8e6' : tint < 0.66 ? '#b8c8f0' : '#cbe0ea';
  const dark = tint < 0.33 ? '#5fa3b8' : tint < 0.66 ? '#8496c8' : '#93aab8';
  const h = rr * 2.8;
  const spire: Vec[] = [
    [x, y - h],
    [x + rr * 0.55, y - h * 0.32],
    [x + rr * 0.3, y + rr * 0.1],
    [x - rr * 0.42, y - h * 0.22],
  ];
  const side: Vec[] = [
    [x + rr * 0.85, y - h * 0.5],
    [x + rr * 1.2, y - h * 0.14],
    [x + rr * 0.72, y + rr * 0.1],
  ];
  return [
    { t: 'circle', c: [x, y + rr * 0.35], r: rr * 0.6, fill: 'rgba(0,0,0,0.16)' },
    { t: 'glow', c: [x, y - h * 0.45], r: rr * 2.4, col: 'rgba(160,225,255,0.28)' },
    { t: 'poly', pts: side, fill: dark, stroke: 'rgba(30,70,100,0.55)', sw: 1 },
    { t: 'poly', pts: spire, fill: body, stroke: 'rgba(30,70,100,0.6)', sw: 1 },
    { t: 'line', a: [x, y - h], b: [x - rr * 0.06, y + rr * 0.02], stroke: 'rgba(255,255,255,0.75)', sw: 1, round: true }, // cleavage highlight
    { t: 'line', a: [x - rr * 0.5, y - h * 0.92], b: [x + rr * 0.5, y - h * 0.92], stroke: 'rgba(255,255,255,0.8)', sw: 0.8, round: true }, // apex glint
    { t: 'line', a: [x, y - h - rr * 0.4], b: [x, y - h + rr * 0.4], stroke: 'rgba(255,255,255,0.8)', sw: 0.8, round: true },
  ];
}

/** Tempest WIND-BENT SCRUB: a trunk bowed downwind with the whole canopy streaming off its tip. */
function floraWindScrub(x: number, y: number, rr: number, tint: number): Prim[] {
  const body = tint < 0.33 ? '#5a7a4a' : tint < 0.66 ? '#66735c' : '#4e6a44';
  const L = rr * 0.95; // downwind lean (fixed screen direction — the gale never lets up)
  const canopy: Vec[] = [
    [x + L * 0.55, y - rr * 1.9],
    [x + L + rr * 1.35, y - rr * 1.62],
    [x + L + rr * 1.0, y - rr * 1.12],
    [x + L * 0.45, y - rr * 1.18],
  ];
  return [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.3], b: [x + L * 0.45, y - rr * 0.9], stroke: '#4a3a26', sw: rr * 0.26, round: true },
    { t: 'line', a: [x + L * 0.45, y - rr * 0.9], b: [x + L, y - rr * 1.5], stroke: '#4a3a26', sw: rr * 0.2, round: true },
    { t: 'poly', pts: canopy, fill: body, stroke: 'rgba(20,26,16,0.6)', sw: 1 },
    // Leaves streaming off the downwind edge.
    { t: 'line', a: [x + L + rr * 1.3, y - rr * 1.55], b: [x + L + rr * 2.0, y - rr * 1.48], stroke: body, sw: 1.1, round: true },
    { t: 'line', a: [x + L + rr * 1.05, y - rr * 1.24], b: [x + L + rr * 1.7, y - rr * 1.14], stroke: body, sw: 1, round: true },
  ];
}

/** Tidal-archipelago PALM: a curved trunk with a burst of arcing fronds. */
function floraPalm(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const frond = tint < 0.33 ? '#2f9a4a' : tint < 0.66 ? '#2c8a58' : '#3aa843';
  const bend = rr * (0.4 + posHash(key[0], key[1]) * 0.3);
  const topX = x + bend;
  const topY = y - rr * 2.1;
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.55, fill: CANOPY.shadow },
    { t: 'line', a: [x, y + rr * 0.3], b: [x + bend * 0.45, y - rr * 1.15], stroke: '#a8845a', sw: rr * 0.26, round: true },
    { t: 'line', a: [x + bend * 0.45, y - rr * 1.15], b: [topX, topY], stroke: '#a8845a', sw: rr * 0.2, round: true },
  ];
  // Fronds fanning from the crown, each a two-segment droop.
  const angles = [-2.7, -2.1, -1.35, -0.6, 0.1];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i]! + (posHash(key[0], key[1], i) - 0.5) * 0.3;
    const midX = topX + Math.cos(a) * rr * 0.9;
    const midY = topY + Math.sin(a) * rr * 0.55;
    out.push({ t: 'line', a: [topX, topY], b: [midX, midY], stroke: frond, sw: Math.max(1.2, rr * 0.16), round: true });
    out.push({ t: 'line', a: [midX, midY], b: [midX + Math.cos(a) * rr * 0.5, midY + Math.abs(Math.sin(a)) * rr * 0.3 + rr * 0.3], stroke: frond, sw: Math.max(1, rr * 0.12), round: true });
  }
  if (posHash(key[0], key[1], 9) < 0.5) out.push({ t: 'circle', c: [topX - rr * 0.2, topY + rr * 0.25], r: rr * 0.14, fill: '#5a3a22' }); // coconut
  return out;
}

/** Cetus COASTAL SEA-STACK: a wind-carved rock pillar speckled with bioluminescence, foam at
 *  its foot — the sparse "trees" of the clifftop world. */
function floraSeaStack(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const body = tint < 0.5 ? '#2a5a6a' : '#234c5c';
  const h = rr * 2.0;
  const stack: Vec[] = [
    [x - rr * 0.7, y + rr * 0.15],
    [x - rr * 0.42, y - h * 0.9],
    [x + rr * 0.28, y - h],
    [x + rr * 0.62, y + rr * 0.15],
  ];
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.4], r: rr * 0.6, fill: 'rgba(0,0,0,0.2)' },
    { t: 'poly', pts: stack, fill: body, stroke: 'rgba(6,20,30,0.6)', sw: 1 },
    { t: 'line', a: [x - rr * 0.42, y - h * 0.9], b: [x + rr * 0.28, y - h], stroke: 'rgba(150,232,255,0.6)', sw: 1.2, round: true }, // starlit crown
    { t: 'circle', c: [x, y + rr * 0.2], r: rr * 0.78, fill: 'none', stroke: 'rgba(220,248,255,0.35)', sw: 1.2 }, // foam ring at the foot
  ];
  for (let i = 0; i < 3; i++) {
    out.push({ t: 'circle', c: [x + (posHash(key[0], key[1], i) - 0.5) * rr, y - h * (0.25 + posHash(key[0], key[1], i + 4) * 0.6)], r: 0.8, fill: 'rgba(122,240,255,0.85)' }); // bio-speckles
  }
  return out;
}
/** Asgard YGGDRASIL GOLDEN-LEAF ASH: a pale ash trunk under a rounded golden canopy that glows from
 *  within, brighter gold leaf-clusters catching the twilight — the sacred groves of the Golden Realm. */
function floraGoldAsh(x: number, y: number, rr: number, tint: number, key: Vec): Prim[] {
  const body = tint < 0.33 ? '#c9a63e' : tint < 0.66 ? '#d8b84a' : '#e6c85a'; // golden foliage
  const out: Prim[] = [
    { t: 'circle', c: [x, y + rr * 0.7], r: rr * 0.66, fill: CANOPY.shadow }, // cast shadow
    { t: 'glow', c: [x, y - rr * 0.2], r: rr * 2.2, col: 'rgba(255,215,120,0.24)' }, // divine golden halo
    { t: 'line', a: [x, y + rr * 0.95], b: [x, y - rr * 0.15], stroke: '#8a734a', sw: rr * 0.3, round: true }, // pale ash trunk
    { t: 'circle', c: [x, y], r: rr, fill: '#8a6a2e', stroke: 'rgba(58,42,14,0.7)', sw: 1 }, // warm core shadow
    { t: 'circle', c: [x - rr * 0.12, y - rr * 0.12], r: rr * 0.82, fill: body }, // golden body
    { t: 'circle', c: [x - rr * 0.3, y - rr * 0.32], r: rr * 0.5, fill: '#ffe89a' }, // lit gold cap
  ];
  // Glowing leaf-clusters across the crown (position-hashed — no rng).
  for (let i = 0; i < 3; i++) {
    const u = posHash(key[0], key[1], i) - 0.5;
    out.push({ t: 'circle', c: [x + u * rr * 1.4, y - rr * (0.1 + posHash(key[0], key[1], i + 3) * 0.5)], r: rr * 0.14, fill: 'rgba(255,240,180,0.9)' });
  }
  return out;
}

/**
 * Archetype SIGNATURE ground decor (GS-biome-feel) — the Cetus treatment (whales/star-river),
 * generalised: each world gets a bespoke seeded decor pass so its ground reads as a PLACE, not a
 * recoloured slab. Void: drifting asteroid islets in the abyss + a distant black-hole eye. Inferno:
 * glowing ground fissures. Fungal: spore-mist + tiny toadstool clusters in the rough. Crystal: shard
 * clusters + prismatic ground glints. Frost: snow drifts + ice-sheen cracks. Desert: dune ripples +
 * sun-bleached rocks. Tempest: cloud-shadow bands + a storm eye with a forked lightning strand.
 * Ocean: foam surf-lines around the island + sandy islets with a palm out in the sea.
 *
 * Determinism: consumes ONLY the dedicated `rng` stream passed in (seeded off the hole hash with its
 * own salt, like the cetus streams) and is gated per archetype — so every other world's prims and
 * every other stream are byte-for-byte untouched. Cetus/verdant return nothing (cetus has its own
 * bespoke passes; verdant is the familiar parkland baseline the wild worlds contrast against).
 */
export function archetypeDecor(
  arch: BiomeArchetype,
  islandPts: Vec[],
  landPolysCourse: Vec[][],
  cb: Box,
  proj: Projector,
  W: number,
  H: number,
  accents: number,
  onGrass: (p: Vec) => boolean,
  rng: () => number,
): Prim[] {
  const out: Prim[] = [];
  const clipped: Prim[] = []; // gathered, then pushed as ONE island clip (never nest clips — SVG serializer bug)
  // A course-space point in the hole's bbox, rejected off the cut grass. Bounded attempts so the
  // draw count can never run away; a miss returns null (rng was still consumed — fine, this stream
  // feeds nothing else). CRITICAL: the rejection loop must NEVER consult the projection — the play
  // view rebuilds the scene through a moving camera every frame, and a view-dependent retry changes
  // the draw COUNT, re-rolling every placement after it (the decor-jitter bug). Visibility is
  // decided at paint time, off-view pieces just aren't pushed.
  const groundPt = (): { c: Vec; s: Vec } | null => {
    for (let i = 0; i < 8; i++) {
      const cp: Vec = [cb.minX + (cb.maxX - cb.minX) * rng(), cb.minY + (cb.maxY - cb.minY) * rng()];
      if (onGrass(cp)) continue;
      return { c: cp, s: proj.project(cp) };
    }
    return null;
  };

  switch (arch) {
    case 'void': {
      // Asteroid islets adrift in the abyss beyond the fairway islands — the void is a PLACE you
      // could fall into, not a purple background. Course-space band around the island (the whale
      // placement model), rejected off every land platform, sized in yards and clamped in px.
      const spanX = cb.maxX - cb.minX || 1;
      const spanY = cb.maxY - cb.minY || 1;
      const cxw = (cb.minX + cb.maxX) / 2;
      const cyw = (cb.minY + cb.maxY) / 2;
      const want = 5 + Math.floor(rng() * 3);
      for (let i = 0, placed = 0; i < want * 14 && placed < want; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.7, cyw + (rng() - 0.5) * spanY * 1.7];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const r = Math.max(4, Math.min(22, (5 + rng() * 9) * proj.scale));
        // Pushed UNCONDITIONALLY (no paint-time view cull): decor is a few dozen cheap prims, and
        // an off-view piece drawing nothing costs less than the flake it caused — a piece sitting
        // exactly on the view edge flipped the prim COUNT between two follow-cam frames (the
        // camera-stability guard). Same rule for every case below.
        const pts: Vec[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const rk = r * (0.72 + posHash(c[0], c[1], k) * 0.5); // hashed off the COURSE point — stable under the camera
          pts.push([s[0] + Math.cos(a) * rk, s[1] + Math.sin(a) * rk * 0.8]);
        }
        out.push({ t: 'glow', c: s, r: r * 2.1, col: 'rgba(150,120,255,0.14)' });
        out.push({ t: 'poly', pts, fill: '#241a44', stroke: 'rgba(150,140,220,0.5)', sw: 1 });
        out.push({ t: 'line', a: pts[4]!, b: pts[5]!, stroke: 'rgba(200,185,255,0.65)', sw: 1.4, round: true }); // starlit rim
        out.push({ t: 'circle', c: [s[0] + r * 0.2, s[1] - r * 0.24], r: 1, fill: 'rgba(215,200,255,0.9)' }); // crystal glint
      }
      // A distant black-hole eye low in the sky — the thing the void gardens orbit.
      const bx = W * (0.16 + rng() * 0.68);
      const by = H * (0.05 + rng() * 0.1);
      const br = 6 + rng() * 4;
      out.push({ t: 'glow', c: [bx, by], r: br * 7, col: 'rgba(150,90,225,0.30)' });
      out.push({ t: 'circle', c: [bx, by], r: br * 1.6, fill: 'none', stroke: 'rgba(235,210,255,0.55)', sw: 1.2 }); // accretion ring
      out.push({ t: 'circle', c: [bx, by], r: br, fill: '#050208', stroke: 'rgba(200,160,255,0.8)', sw: 1 }); // the event horizon
      // NEGATIVE-ENERGY RIFTS (GS-rough-frame): the void's deep is not a friendly starfield — it's
      // dark lens-shaped TEARS in space, rimmed in violet, with faint energy wisps spiralling INTO
      // them (light falling in, never shining out). Placed in COURSE space like the islets —
      // rejected off the land platforms, sized before the paint-time cull, shape off posHash — so
      // they drift between the fairway islands of an armed lost-rough hole (where the deep is the
      // whole off-fairway world) and sit out beyond the OB frame on a calm stop.
      const rifts = 2 + Math.floor(rng() * 2);
      for (let i = 0, placed = 0; i < rifts * 14 && placed < rifts; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.8, cyw + (rng() - 0.5) * spanY * 1.8];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const len = Math.max(10, Math.min(44, (10 + rng() * 12) * proj.scale)); // px long-axis
        const ang = rng() * Math.PI; // sized + angled unconditionally — the count never reads the view
        const ux = Math.cos(ang);
        const uy = Math.sin(ang);
        const vx = -uy;
        const vy = ux;
        const wHalf = len * (0.16 + posHash(c[0], c[1]) * 0.1);
        // The tear: two shallow arcs meeting at the tips (a dark lens), edges wobbled off posHash.
        const tear: Vec[] = [];
        const steps = 7;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps - 0.5;
          const b = Math.cos(t * Math.PI) * wHalf * (0.85 + posHash(c[0], c[1], k) * 0.3);
          tear.push([s[0] + ux * t * len + vx * b, s[1] + uy * t * len + vy * b]);
        }
        for (let k = steps; k >= 0; k--) {
          const t = k / steps - 0.5;
          const b = Math.cos(t * Math.PI) * wHalf * (0.85 + posHash(c[0], c[1], k + 9) * 0.3);
          tear.push([s[0] + ux * t * len - vx * b, s[1] + uy * t * len - vy * b]);
        }
        out.push({ t: 'glow', c: s, r: len * 1.5, col: 'rgba(140,80,220,0.20)' });
        out.push({ t: 'poly', pts: tear, fill: '#020106', stroke: 'rgba(196,150,255,0.55)', sw: 1 });
        out.push({ t: 'line', a: [s[0] - ux * len * 0.32, s[1] - uy * len * 0.32], b: [s[0] + ux * len * 0.32, s[1] + uy * len * 0.32], stroke: 'rgba(235,215,255,0.65)', sw: 0.9, round: true });
        // Wisps spiralling in, drawn dim at the far end and brightening toward the rim so the
        // energy visibly FLOWS INWARD — the "negative" in negative energy.
        for (let wsp = 0; wsp < 3; wsp++) {
          const a0 = posHash(c[0], c[1], 20 + wsp) * Math.PI * 2;
          let px = 0;
          let py = 0;
          for (let seg = 0; seg <= 4; seg++) {
            const aa = a0 + seg * 0.55;
            const rr = len * (2.1 - seg * 0.38);
            const qx = s[0] + Math.cos(aa) * rr;
            const qy = s[1] + Math.sin(aa) * rr * 0.8;
            if (seg > 0) out.push({ t: 'line', a: [px, py], b: [qx, qy], stroke: `rgba(176,126,255,${(0.1 + seg * 0.09).toFixed(2)})`, sw: 1.1, round: true });
            px = qx;
            py = qy;
          }
        }
      }
      break;
    }
    case 'inferno': {
      // Glowing ground FISSURES crawling through the scorched rough — the crust is barely holding.
      const fissures = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < fissures; i++) {
        const g = groundPt();
        const ang = rng() * Math.PI * 2;
        if (!g) continue; // nothing painted; this dedicated stream feeds nothing downstream
        const glowR = 8 + rng() * 8; // drawn unconditionally — the count never reads the view
        let px0 = g.s[0];
        let py0 = g.s[1];
        let a = ang;
        for (let sgm = 0; sgm < 3; sgm++) {
          const len = 9 + posHash(g.c[0], g.c[1], sgm) * 14;
          const px1 = px0 + Math.cos(a) * len;
          const py1 = py0 + Math.sin(a) * len;
          clipped.push({ t: 'line', a: [px0, py0], b: [px1, py1], stroke: 'rgba(16,6,3,0.75)', sw: 3, round: true });
          clipped.push({ t: 'line', a: [px0, py0], b: [px1, py1], stroke: 'rgba(255,138,42,0.8)', sw: 1.2, round: true });
          a += (posHash(g.c[0], g.c[1], sgm + 7) - 0.5) * 1.5;
          px0 = px1;
          py0 = py1;
        }
        clipped.push({ t: 'glow', c: g.s, r: glowR, col: 'rgba(255,130,50,0.28)' });
      }
      break;
    }
    case 'fungal': {
      // Spore-mist pooling in the undergrowth + tiny toadstool clusters — the jungle floor is alive.
      const mists = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < mists; i++) {
        const g = groundPt();
        const r = (0.07 + rng() * 0.08) * Math.min(W, H);
        if (g) clipped.push({ t: 'glow', c: g.s, r, col: 'rgba(120,240,180,0.13)' });
      }
      const shrooms = Math.round(7 * accents);
      for (let i = 0; i < shrooms; i++) {
        const g = groundPt();
        const cool = rng() < 0.4;
        if (!g) continue;
        const p = g.s;
        const h = 3 + posHash(g.c[0], g.c[1]) * 2.5;
        const cap = cool ? '#7af0c0' : '#b07eff';
        clipped.push({ t: 'line', a: p, b: [p[0], p[1] - h], stroke: '#ded4f2', sw: 1.1, round: true });
        clipped.push({ t: 'circle', c: [p[0], p[1] - h], r: 1.6 + posHash(g.c[0], g.c[1], 2), fill: cap });
        if (posHash(g.c[0], g.c[1], 3) < 0.45) clipped.push({ t: 'glow', c: [p[0], p[1] - h], r: 6, col: cool ? 'rgba(122,240,192,0.35)' : 'rgba(176,126,255,0.35)' });
      }
      break;
    }
    case 'crystal': {
      // Shard clusters growing out of the rough + prismatic ground glints — everything refracts.
      const clusters = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < clusters; i++) {
        const g = groundPt();
        const big = 4 + rng() * 5;
        if (!g) continue;
        const p = g.s;
        const lean = (posHash(g.c[0], g.c[1]) - 0.5) * big * 0.7;
        clipped.push({ t: 'glow', c: [p[0], p[1] - big * 0.6], r: big * 2.4, col: 'rgba(160,225,255,0.22)' });
        clipped.push({ t: 'poly', pts: [[p[0], p[1] - big * 1.7], [p[0] + big * 0.4, p[1] - big * 0.4], [p[0] + big * 0.2, p[1]], [p[0] - big * 0.34, p[1] - big * 0.3]], fill: '#9fd8e6', stroke: 'rgba(30,70,100,0.55)', sw: 0.8 });
        clipped.push({ t: 'poly', pts: [[p[0] + lean + big * 0.5, p[1] - big], [p[0] + lean + big * 0.8, p[1] - big * 0.2], [p[0] + lean + big * 0.45, p[1]]], fill: '#cbe0ea', stroke: 'rgba(30,70,100,0.45)', sw: 0.8 });
      }
      const glintCols = ['#ff9ab8', '#ffe14a', '#7af0c0', '#9fd8ff'];
      const glints = Math.round(5 * accents);
      for (let i = 0; i < glints; i++) {
        const g = groundPt();
        const col = glintCols[Math.floor(rng() * glintCols.length)]!;
        if (!g) continue;
        const p = g.s;
        clipped.push({ t: 'line', a: [p[0] - 2, p[1]], b: [p[0] + 2, p[1]], stroke: col, sw: 0.9, round: true });
        clipped.push({ t: 'line', a: [p[0], p[1] - 2], b: [p[0], p[1] + 2], stroke: col, sw: 0.9, round: true });
      }
      break;
    }
    case 'frost': {
      // Wind-blown snow drifts + ice-sheen cracks — the ground is frozen, not just teal.
      const drifts = 3 + Math.floor(rng() * 2);
      for (let i = 0; i < drifts; i++) {
        const g = groundPt();
        const r = (0.05 + rng() * 0.07) * Math.min(W, H);
        if (g) clipped.push({ t: 'circle', c: g.s, r, fill: 'rgba(240,250,255,0.10)' });
      }
      const cracks = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < cracks; i++) {
        const g = groundPt();
        const ang = rng() * Math.PI * 2;
        if (!g) continue;
        const p = g.s;
        const len = 8 + posHash(g.c[0], g.c[1]) * 12;
        const mx = p[0] + Math.cos(ang) * len;
        const my = p[1] + Math.sin(ang) * len;
        clipped.push({ t: 'line', a: p, b: [mx, my], stroke: 'rgba(220,245,255,0.35)', sw: 0.9, round: true });
        clipped.push({ t: 'line', a: [mx, my], b: [mx + Math.cos(ang + 0.7) * len * 0.5, my + Math.sin(ang + 0.7) * len * 0.5], stroke: 'rgba(220,245,255,0.28)', sw: 0.8, round: true });
      }
      break;
    }
    case 'desert': {
      // Dune ripples combed across the waste + the odd sun-bleached rock.
      const bands = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < bands; i++) {
        const g = groundPt();
        const ang = rng() * Math.PI; // ripple grain
        if (!g) continue;
        const p = g.s;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        for (let k = 0; k < 4; k++) {
          const off = (k - 1.5) * 4.5;
          const cxp = p[0] - dy * off;
          const cyp = p[1] + dx * off;
          const len = 7 + posHash(g.c[0], g.c[1], k) * 8;
          clipped.push({ t: 'line', a: [cxp - dx * len, cyp - dy * len], b: [cxp + dx * len, cyp + dy * len], stroke: 'rgba(235,205,150,0.20)', sw: 1.2, round: true });
        }
      }
      const rocks = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < rocks; i++) {
        const g = groundPt();
        if (!g) continue;
        const p = g.s;
        const r = 2.5 + posHash(g.c[0], g.c[1]) * 3;
        clipped.push({ t: 'poly', pts: [[p[0] - r, p[1]], [p[0] - r * 0.3, p[1] - r * 0.9], [p[0] + r * 0.7, p[1] - r * 0.6], [p[0] + r, p[1]]], fill: '#8a6f4a', stroke: 'rgba(46,36,19,0.6)', sw: 0.8 });
        clipped.push({ t: 'line', a: [p[0] - r * 0.3, p[1] - r * 0.9], b: [p[0] + r * 0.7, p[1] - r * 0.6], stroke: 'rgba(255,240,210,0.5)', sw: 0.9, round: true });
      }
      break;
    }
    case 'tempest': {
      // Cloud shadows racing over the ground + the storm's eye glowering in the sky.
      const bands = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < bands; i++) {
        const y0 = rng() * H;
        const slant = 30 + rng() * 50;
        const bw = 26 + rng() * 30;
        clipped.push({ t: 'poly', pts: [[-20, y0], [W + 20, y0 - slant], [W + 20, y0 - slant + bw], [-20, y0 + bw]], fill: 'rgba(8,10,18,0.14)' });
      }
      const ex = W * (0.18 + rng() * 0.64);
      const ey = H * (0.05 + rng() * 0.09);
      const er = 12 + rng() * 10;
      out.push({ t: 'glow', c: [ex, ey], r: er * 4, col: 'rgba(170,150,255,0.28)' });
      out.push({ t: 'circle', c: [ex, ey], r: er, fill: 'none', stroke: 'rgba(210,195,255,0.4)', sw: 1.4 });
      out.push({ t: 'circle', c: [ex, ey], r: er * 0.55, fill: 'none', stroke: 'rgba(230,220,255,0.5)', sw: 1 });
      // One forked lightning strand hanging from the eye (static; the animated layer flickers live).
      let lx = ex;
      let ly = ey + er * 0.6;
      for (let sgm = 0; sgm < 3; sgm++) {
        const nx = lx + (posHash(lx, ly, sgm) - 0.5) * 22;
        const ny = ly + 12 + posHash(lx, ly, sgm + 3) * 14;
        out.push({ t: 'line', a: [lx, ly], b: [nx, ny], stroke: 'rgba(255,240,180,0.5)', sw: 1.4, round: true });
        if (sgm === 1) out.push({ t: 'line', a: [lx, ly], b: [lx + 14, ly + 12], stroke: 'rgba(255,240,180,0.35)', sw: 1.1, round: true });
        lx = nx;
        ly = ny;
      }
      break;
    }
    case 'ocean': {
      // Surf FOAM around the island's shore + sandy islets with a palm out in the lagoon.
      out.push({ t: 'poly', pts: offsetPoly(islandPts, -5), fill: 'none', stroke: 'rgba(150,235,225,0.35)', sw: 2.6 });
      out.push({ t: 'poly', pts: offsetPoly(islandPts, -11), fill: 'none', stroke: 'rgba(150,235,225,0.16)', sw: 4 });
      const spanX = cb.maxX - cb.minX || 1;
      const spanY = cb.maxY - cb.minY || 1;
      const cxw = (cb.minX + cb.maxX) / 2;
      const cyw = (cb.minY + cb.maxY) / 2;
      const want = 3 + Math.floor(rng() * 2);
      for (let i = 0, placed = 0; i < want * 14 && placed < want; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.7, cyw + (rng() - 0.5) * spanY * 1.7];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const r = Math.max(4, Math.min(16, (4 + rng() * 6) * proj.scale));
        out.push({ t: 'circle', c: s, r: r * 1.35, fill: 'none', stroke: 'rgba(220,248,255,0.4)', sw: 1.2 }); // breaking surf
        out.push({ t: 'circle', c: s, r, fill: '#c8b088', stroke: 'rgba(90,70,40,0.5)', sw: 1 }); // the sand cay
        out.push({ t: 'line', a: [s[0], s[1] - r * 0.2], b: [s[0], s[1] - r * 1.1], stroke: '#a8845a', sw: 1.4, round: true }); // a lone palm
        out.push({ t: 'line', a: [s[0], s[1] - r * 1.1], b: [s[0] - r * 0.5, s[1] - r * 1.25], stroke: '#2f9a4a', sw: 1.2, round: true });
        out.push({ t: 'line', a: [s[0], s[1] - r * 1.1], b: [s[0] + r * 0.5, s[1] - r * 1.2], stroke: '#2f9a4a', sw: 1.2, round: true });
      }
      break;
    }
    case 'asgard': {
      // The Golden Realm's skyline: the Bifröst rainbow bridge arcing overhead, a gilded Valhalla
      // hall + the great Yggdrasil world-tree on the horizon, and floating rune-stones adrift in the
      // twilight beyond the fields. Sky pieces are SCREEN-space (fixed loop counts, positions off the
      // dedicated rng — never the projection), so they're camera-proof exactly like the void's
      // black-hole eye / tempest's storm eye; the rune-stones are placed in COURSE space (rejected off
      // the land, shape off posHash) like the void islets. Everything pushed UNCONDITIONALLY.
      // The Bifröst: six prismatic bands bowing across the upper sky (centre below-frame so it arcs high).
      const bx = W * (0.5 + (rng() - 0.5) * 0.2);
      const by = H * (0.78 + rng() * 0.1);
      const R0 = Math.max(W, H) * (0.5 + rng() * 0.12);
      const HUES = ['rgba(255,90,120,', 'rgba(255,170,70,', 'rgba(255,232,90,', 'rgba(90,220,130,', 'rgba(90,190,255,', 'rgba(170,120,255,'];
      const bandW = Math.max(2, R0 * 0.022);
      for (let i = 0; i < HUES.length; i++) {
        const r = R0 - i * bandW;
        const seg = 16;
        for (let k = 0; k < seg; k++) {
          const a0 = Math.PI + (k / seg) * Math.PI;
          const a1 = Math.PI + ((k + 1) / seg) * Math.PI;
          out.push({ t: 'line', a: [bx + Math.cos(a0) * r, by + Math.sin(a0) * r], b: [bx + Math.cos(a1) * r, by + Math.sin(a1) * r], stroke: HUES[i]! + '0.30)', sw: bandW, round: true });
        }
      }
      // A gilded Valhalla longhouse silhouette on the far skyline.
      const vx = W * (0.14 + rng() * 0.44);
      const vy = H * (0.24 + rng() * 0.08);
      const vw = Math.max(26, W * 0.12);
      const vh = vw * 0.5;
      out.push({ t: 'glow', c: [vx, vy], r: vw * 1.4, col: 'rgba(255,210,110,0.22)' });
      out.push({ t: 'poly', pts: [[vx - vw * 0.5, vy + vh * 0.5], [vx + vw * 0.5, vy + vh * 0.5], [vx + vw * 0.5, vy - vh * 0.1], [vx - vw * 0.5, vy - vh * 0.1]], fill: '#3a2f1e', stroke: 'rgba(255,210,120,0.5)', sw: 1 });
      out.push({ t: 'poly', pts: [[vx - vw * 0.6, vy - vh * 0.1], [vx + vw * 0.6, vy - vh * 0.1], [vx, vy - vh * 0.85]], fill: '#e8c65a', stroke: 'rgba(120,90,30,0.6)', sw: 1 }); // gabled golden roof
      for (let k = 0; k < 4; k++) out.push({ t: 'line', a: [vx - vw * 0.34 + k * vw * 0.23, vy + vh * 0.44], b: [vx - vw * 0.34 + k * vw * 0.23, vy - vh * 0.04], stroke: 'rgba(255,225,150,0.5)', sw: 1.4, round: true }); // lit pillars
      // Yggdrasil — the great golden world-tree looming on the horizon.
      const yx = W * (0.72 + rng() * 0.16);
      const yBase = H * (0.4 + rng() * 0.06);
      const yTop = yBase - H * (0.28 + rng() * 0.06);
      const yh = yBase - yTop;
      out.push({ t: 'glow', c: [yx, (yBase + yTop) / 2], r: yh * 0.8, col: 'rgba(255,220,130,0.16)' });
      out.push({ t: 'line', a: [yx, yBase], b: [yx, yTop], stroke: 'rgba(40,30,18,0.85)', sw: Math.max(2, yh * 0.05), round: true }); // trunk
      for (let k = 0; k < 4; k++) {
        const a = -Math.PI / 2 + (k - 1.5) * 0.5;
        out.push({ t: 'line', a: [yx, yTop + yh * 0.18], b: [yx + Math.cos(a) * yh * 0.34, yTop + yh * 0.18 + Math.sin(a) * yh * 0.34], stroke: 'rgba(40,30,18,0.7)', sw: Math.max(1.4, yh * 0.03), round: true });
      }
      out.push({ t: 'circle', c: [yx, yTop], r: yh * 0.34, fill: 'rgba(210,175,70,0.6)' }); // golden crown
      out.push({ t: 'circle', c: [yx - yh * 0.12, yTop - yh * 0.06], r: yh * 0.22, fill: 'rgba(255,225,140,0.5)' }); // lit crown
      // Floating rune-stones adrift beyond the fields — course-space, rejected off the land.
      const spanX = cb.maxX - cb.minX || 1;
      const spanY = cb.maxY - cb.minY || 1;
      const cxw = (cb.minX + cb.maxX) / 2;
      const cyw = (cb.minY + cb.maxY) / 2;
      const want = 4 + Math.floor(rng() * 3);
      for (let i = 0, placed = 0; i < want * 14 && placed < want; i++) {
        const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.6, cyw + (rng() - 0.5) * spanY * 1.6];
        if (landPolysCourse.some((lp) => pointInPoly(c, lp))) continue;
        placed++;
        const s = proj.project(c);
        const r = Math.max(5, Math.min(20, (5 + rng() * 6) * proj.scale)); // sized in yards, clamped px
        const rk = posHash(c[0], c[1]); // course-space variety (camera-stable)
        out.push({ t: 'glow', c: s, r: r * 1.8, col: 'rgba(255,210,120,0.16)' });
        out.push({ t: 'poly', pts: [[s[0] - r * 0.42, s[1] + r * 0.9], [s[0] - r * 0.5, s[1] - r * 0.8], [s[0] + r * 0.5, s[1] - r * 0.95], [s[0] + r * 0.42, s[1] + r * 0.85]], fill: '#4a4436', stroke: 'rgba(255,220,140,0.55)', sw: 1 }); // monolith
        out.push({ t: 'line', a: [s[0], s[1] - r * 0.5], b: [s[0], s[1] + r * 0.5], stroke: 'rgba(255,232,150,0.85)', sw: 1.3, round: true }); // glowing carved rune
        out.push({ t: 'line', a: [s[0] - r * 0.28, s[1] - r * 0.2 + rk * r * 0.3], b: [s[0] + r * 0.28, s[1] + r * 0.1], stroke: 'rgba(255,232,150,0.8)', sw: 1.2, round: true });
      }
      break;
    }
    default:
      break; // verdant = the parkland baseline; cetus has its own bespoke ocean/river/cliff passes
  }
  if (clipped.length) out.push({ t: 'clip', clip: islandPts, children: clipped });
  return out;
}

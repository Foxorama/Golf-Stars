/**
 * GS-shot-lag: is a follow-cam scene rebuild avoidable?
 *
 * Under a PURE PAN (same viewRadius / up / canvas size, camera translated) the projector differs
 * only by a constant screen-space offset. If the built scene is then just the old scene translated
 * by that offset — except for the SCREEN-ANCHORED sky prefix, which must not move at all — then
 * `buildScene` need not run per frame.
 *
 * This rig checks exactly that, per prim, and reports what (if anything) fails to fit the model.
 */
import { generateCourse } from '../src/sim/course/generate';
import { buildScene, type Prim } from '../src/render/style';
import { holeProjector } from '../src/render/project';
import type { Hole, Vec } from '../src/sim/course/contract';

const BIOMES = [
  'verdant-station',
  'ember-world',
  'spore-jungle',
  'frost-hollow',
  'dust-belt',
  'void-garden',
  'cetus-deep',
  'derelict-ship',
  'tidal-archipelago',
  'scrap-belt',
  'toxic-mire',
  'earth-links',
];

function sceneAt(hole: Hole, biome: string, cam: Vec, r: number): Prim[] {
  const proj = holeProjector(hole, {
    width: 390,
    height: 844,
    focus: cam,
    viewRadius: r,
    focusBias: 0.84,
    up: [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]] as Vec,
  });
  return buildScene(hole, proj, { width: 390, height: 844, biome });
}

function offsetOf(hole: Hole, camA: Vec, camB: Vec, r: number): Vec {
  const mk = (c: Vec) =>
    holeProjector(hole, {
      width: 390,
      height: 844,
      focus: c,
      viewRadius: r,
      focusBias: 0.84,
      up: [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]] as Vec,
    });
  const a = mk(camA).project([0, 0]);
  const b = mk(camB).project([0, 0]);
  return [b[0] - a[0], b[1] - a[1]];
}

/** All the screen points a prim carries, flattened (clip groups recursed). */
function pointsOf(p: Prim): number[] {
  const out: number[] = [];
  const walk = (q: Prim): void => {
    if (q.t === 'poly') for (const v of q.pts) out.push(v[0], v[1]);
    else if (q.t === 'path') for (const v of q.pts) out.push(v[0], v[1]);
    else if (q.t === 'circle') out.push(q.c[0], q.c[1]);
    else if (q.t === 'glow') out.push(q.c[0], q.c[1]);
    else if (q.t === 'line') out.push(q.a[0], q.a[1], q.b[0], q.b[1]);
    else if (q.t === 'clip') {
      for (const v of q.clip) out.push(v[0], v[1]);
      for (const c of q.children) walk(c);
    }
  };
  walk(p);
  return out;
}

const EPS = 1e-6;
let totalPrims = 0;
let anchored = 0;
let translated = 0;
const oddities = new Map<string, number>();

for (const biome of BIOMES) {
  for (const seed of [7, 88, 321]) {
    const hole = generateCourse(seed, { biome, holes: 1 }).holes[0]!;
    const mid: Vec = [(hole.tee[0] + hole.green[0]) / 2, (hole.tee[1] + hole.green[1]) / 2];
    const camA = mid;
    const camB: Vec = [mid[0] + 6, mid[1] + 4]; // a follow-cam pan of a few yards
    const r = 120;
    const a = sceneAt(hole, biome, camA, r);
    const b = sceneAt(hole, biome, camB, r);
    const d = offsetOf(hole, camA, camB, r);
    if (a.length !== b.length) {
      oddities.set(`${biome}: prim COUNT changed ${a.length}->${b.length}`, 1);
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      totalPrims++;
      const pa = pointsOf(a[i]!);
      const pb = pointsOf(b[i]!);
      if (pa.length !== pb.length) {
        oddities.set(`${biome}: prim ${i} (${a[i]!.t}) point count changed`, (oddities.get(`${biome}: prim ${i} (${a[i]!.t}) point count changed`) ?? 0) + 1);
        continue;
      }
      let same = true;
      let shifted = true;
      for (let k = 0; k < pa.length; k += 2) {
        if (Math.abs(pa[k]! - pb[k]!) > EPS || Math.abs(pa[k + 1]! - pb[k + 1]!) > EPS) same = false;
        if (Math.abs(pa[k]! + d[0] - pb[k]!) > 1e-4 || Math.abs(pa[k + 1]! + d[1] - pb[k + 1]!) > 1e-4) shifted = false;
      }
      if (pa.length === 0) same = true;
      if (same) anchored++;
      else if (shifted) translated++;
      else {
        const pr = a[i]!;
        const detail =
          pr.t === 'clip'
            ? `clip[${pr.children.length} kids: ${[...new Set(pr.children.map((c) => `${c.t}/${(c as { fill?: string }).fill ?? (c as { stroke?: string }).stroke ?? '-'}`))].slice(0, 3).join(' ')}]`
            : `${pr.t}/${(pr as { fill?: string }).fill ?? '-'}`;
        const key = `${biome}: NEITHER — ${detail}`;
        oddities.set(key, (oddities.get(key) ?? 0) + 1);
      }
    }
  }
}

console.log(`prims compared: ${totalPrims}`);
console.log(`  screen-anchored (identical): ${anchored}`);
console.log(`  rigid translation:           ${translated}`);
console.log(`  neither:                     ${totalPrims - anchored - translated}`);
if (oddities.size) {
  console.log('\nODDITIES:');
  for (const [k, v] of [...oddities.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30)) console.log(`  ${v.toString().padStart(5)}  ${k}`);
} else {
  console.log('\nno oddities — a pure pan is (anchored sky) + (rigidly translated world).');
}

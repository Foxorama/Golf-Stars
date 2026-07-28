/**
 * GS-fairway-silhouette — the fairway system has ONE silhouette, and the ink traces it.
 *
 * A hole's fairway is nearly always more than one polygon: the corridor, the green flare, a
 * split-fairway alternate lane, the segments of a broken island corridor. The ink edge used to be
 * stamped on the FIRST polygon alone (to stop the flare's ring cutting back across the corridor near
 * the green), so every other piece of cut grass was drawn with no outline at all — the player report
 * that opened this: a split fairway sitting beside an inked corridor as a bare green smear.
 *
 * Four rules pinned here:
 *  1. Every piece of fairway that meets the ground is outlined; nothing is outlined where it meets
 *     more fairway (no line cuts back across the turf).
 *  2. A lone fairway is byte-for-byte the old closed ring — the void islands must not move.
 *  3. The silhouette is CAMERA-PROOF: it is decided in yards, so a follow-cam pan/zoom moves the runs
 *     and never changes how many there are (the camera contract, `tests/camera-stability`'s rule).
 *  4. The edge ease rides the same silhouette, so the apron's flush join can't ramp a dark band
 *     straight across the middle of the fairway.
 */
import { describe, it, expect } from 'vitest';
import { pointInPoly, type Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { holeProjector } from '../src/render/project';
import { fairwayEdgeRuns, styleFairways } from '../src/render/style/fairway';
import { ART_DEFAULTS, projPoly, type Prim } from '../src/render/style/shared';
import { turfShade } from '../src/render/palette';

const SHADE = turfShade('fairway', 'verdant');
const FRINGE = '#2f6f2f';
const COLLAR = '#2a5f2a';

/** Two squares that never touch — a corridor and a split-fairway lane beside it. */
const LEFT: Vec[] = [
  [0, 0],
  [40, 0],
  [40, 120],
  [0, 120],
];
const RIGHT: Vec[] = [
  [80, 20],
  [120, 20],
  [120, 100],
  [80, 100],
];
/** A slab overlapping LEFT's top half — the green flare's flush join onto the corridor. */
const OVERLAP: Vec[] = [
  [10, 90],
  [70, 90],
  [70, 160],
  [10, 160],
];

/** Prim kind sequence, clip groups flattened — the camera-proof structure metric. */
function shapeOf(prims: Prim[], out: string[] = []): string[] {
  for (const p of prims) {
    out.push(p.t);
    if (p.t === 'clip') shapeOf(p.children, out);
  }
  return out;
}
/** The ink edge: the hairline (sw 1) stroked runs. The edge ease is the same geometry at sw 4/9. */
function inkOf(prims: Prim[]): Prim[] {
  const ink: Prim[] = [];
  const walk = (ps: Prim[]): void => {
    for (const p of ps) {
      if (p.t === 'clip') walk(p.children);
      else if ((p.t === 'poly' || p.t === 'path') && p.stroke && p.sw === 1) ink.push(p);
    }
  };
  walk(prims);
  return ink;
}
function nearAny(p: Vec, poly: Vec[], tol: number): boolean {
  return poly.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
}

describe('every piece of fairway is outlined (the reported bug)', () => {
  it('a split fairway beside the corridor gets its own ink ring, not a bare smear', () => {
    const runs = fairwayEdgeRuns([LEFT, RIGHT]);
    expect(runs).toHaveLength(2);
    // Neither touches the other → both keep their whole ring, on the ORIGINAL vertices.
    expect(runs[0]).toEqual([{ closed: true, pts: LEFT }]);
    expect(runs[1]).toEqual([{ closed: true, pts: RIGHT }]);
  });

  it('the drawn scene strokes ink around BOTH pieces (it used to stroke only the first)', () => {
    const prims = styleFairways([LEFT, RIGHT], ART_DEFAULTS, SHADE, FRINGE, 'verdant', COLLAR, 1);
    const ink = inkOf(prims);
    const pts = ink.flatMap((p) => (p.t === 'poly' || p.t === 'path' ? p.pts : []));
    expect(pts.some((p) => nearAny(p, LEFT, 0.001))).toBe(true);
    expect(pts.some((p) => nearAny(p, RIGHT, 0.001)), 'the second fairway is inked too').toBe(true);
  });

  it('generated holes leave no piece of cut grass un-outlined, in every world', () => {
    const worlds = ['verdant-station', 'dust-belt', 'earth-links', 'tidal-archipelago', 'spore-jungle', 'scrap-belt'];
    let checked = 0;
    for (const biome of worlds) {
      for (const seed of [4242, 99001, 707]) {
        for (const hole of generateCourse(seed, { holes: 9, distanceFromStart: 30, biome }).holes) {
          const fws = hole.features.filter((f) => f.kind === 'fairway').map((f) => f.poly);
          if (fws.length < 2) continue;
          const runs = fairwayEdgeRuns(fws);
          for (let i = 0; i < fws.length; i++) {
            // A piece with any vertex out in the open MUST contribute silhouette.
            const exposed = fws[i]!.some((v) => !fws.some((o, j) => j !== i && pointInPoly(v, o)));
            if (exposed) expect(runs[i]!.length, `${biome} seed ${seed} poly ${i}`).toBeGreaterThan(0);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('nothing is outlined where fairway meets fairway', () => {
  it('a buried edge is dropped — no ink point sits inside another piece of fairway', () => {
    const polys = [LEFT, OVERLAP];
    const runs = fairwayEdgeRuns(polys);
    expect(runs.every((rs) => rs.length > 0)).toBe(true);
    expect(runs.some((rs) => rs.some((r) => !r.closed)), 'the flush join splits at least one ring open').toBe(true);
    runs.forEach((rs, i) => {
      for (const r of rs)
        for (const p of r.pts)
          for (let j = 0; j < polys.length; j++)
            if (j !== i) expect(pointInPoly(p, polys[j]!), `run point ${p} buried in poly ${j}`).toBe(false);
    });
  });

  it('an open run is a `path`, never a `poly` (a closed poly would chord across the fairway)', () => {
    const prims = styleFairways([LEFT, OVERLAP], ART_DEFAULTS, SHADE, FRINGE, 'verdant', COLLAR, 1);
    const ink = inkOf(prims);
    expect(ink.filter((p) => p.t === 'path').length, 'the split ring strokes as open paths').toBeGreaterThan(0);
    // …and any run still drawn as a closed `poly` really is a whole untouched ring.
    for (const p of ink) if (p.t === 'poly') expect([LEFT, OVERLAP]).toContainEqual(p.pts);
  });

  it('the edge ease rides the silhouette too — no ease stroke runs through the turf', () => {
    const prims = styleFairways([LEFT, OVERLAP], ART_DEFAULTS, SHADE, FRINGE, 'verdant', COLLAR, 1);
    // The ease is the wide stroked pair inside each clip group.
    const wide: Prim[] = [];
    const walk = (ps: Prim[]): void => {
      for (const p of ps) {
        if (p.t === 'clip') walk(p.children);
        else if ((p.t === 'poly' || p.t === 'path') && typeof p.sw === 'number' && p.sw > 2) wide.push(p);
      }
    };
    walk(prims);
    expect(wide.length).toBeGreaterThan(0);
    for (const p of wide) {
      if (p.t !== 'poly' && p.t !== 'path') continue;
      const home = p.pts.every((q) => !pointInPoly(q, LEFT)) || p.pts.every((q) => !pointInPoly(q, OVERLAP));
      expect(home, 'an ease band is drawn along a buried edge').toBe(true);
    }
  });
});

describe('a lone fairway is byte-for-byte the old output', () => {
  it('one polygon → one closed ring on its own vertices (void islands do not move)', () => {
    expect(fairwayEdgeRuns([LEFT])).toEqual([[{ closed: true, pts: LEFT }]]);
  });

  it('the ink prim for a lone fairway is still the classic closed `poly` stroke', () => {
    const ink = inkOf(styleFairways([LEFT], ART_DEFAULTS, SHADE, FRINGE, 'verdant', COLLAR, 1));
    expect(ink).toHaveLength(1);
    expect(ink[0]!.t).toBe('poly');
    expect(ink[0]!.t === 'poly' ? ink[0]!.pts : null).toEqual(LEFT);
  });
});

describe('the silhouette is camera-proof', () => {
  const hole = generateCourse(4242, { holes: 9, distanceFromStart: 30, biome: 'verdant-station' }).holes.find(
    (h) => h.features.filter((f) => f.kind === 'fairway').length >= 3,
  )!;
  const fws = hole.features.filter((f) => f.kind === 'fairway').map((f) => f.poly);

  it('zooming changes where the runs are drawn, never how many there are', () => {
    const cams = [
      holeProjector(hole, { width: 360, height: 640 }),
      holeProjector(hole, { width: 360, height: 640, focus: hole.green, viewRadius: 60 }),
      holeProjector(hole, { width: 360, height: 640, focus: hole.green, viewRadius: 18 }),
    ];
    const counts = cams.map((proj) =>
      fairwayEdgeRuns(fws.map((p) => projPoly(p, proj)), proj.scale).map((rs) => `${rs.length}:${rs.map((r) => (r.closed ? 'C' : 'o')).join('')}`).join('|'),
    );
    expect(cams[2]!.scale).toBeGreaterThan(cams[0]!.scale * 2); // the cameras really are far apart
    expect(counts[1]).toBe(counts[0]);
    expect(counts[2]).toBe(counts[0]);
  });

  it('a follow-cam pan + zoom ease keeps the drawn fairway prim structure identical', () => {
    const mk = (fx: number, r: number): Prim[] => {
      const proj = holeProjector(hole, {
        width: 360,
        height: 640,
        focus: [hole.tee[0] + (hole.green[0] - hole.tee[0]) * fx, hole.tee[1] + (hole.green[1] - hole.tee[1]) * fx],
        viewRadius: r,
        up: [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]],
      });
      return styleFairways(fws.map((p) => projPoly(p, proj)), ART_DEFAULTS, SHADE, FRINGE, 'verdant', COLLAR, proj.scale);
    };
    const a = mk(0.3, 42);
    const b = mk(0.32, 42.3);
    expect(shapeOf(b).join(',')).toBe(shapeOf(a).join(','));
  });

  it('the tolerances are widths of GROUND: the same runs at 1 px/yd and at 8', () => {
    const at = (k: number): string =>
      fairwayEdgeRuns(fws.map((p) => p.map((v): Vec => [v[0] * k, v[1] * k])), k)
        .map((rs) => rs.map((r) => (r.closed ? 'C' : r.pts.length)).join('-'))
        .join('|');
    // Point counts are scale-free too — the ring is walked in yards, not pixels.
    expect(at(8)).toBe(at(1));
  });
});

describe('the silhouette is cheap enough to rebuild every frame', () => {
  it('a whole hole resolves in well under a frame budget at the play camera', () => {
    const hole = generateCourse(77, { holes: 9, distanceFromStart: 40, biome: 'spore-jungle' }).holes[3]!;
    const proj = holeProjector(hole, { width: 360, height: 640, focus: hole.green, viewRadius: 40 });
    const sps = hole.features.filter((f) => f.kind === 'fairway').map((f) => projPoly(f.poly, proj));
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) fairwayEdgeRuns(sps, proj.scale);
    expect((performance.now() - t0) / 50).toBeLessThan(3);
  });
});

describe('the ink still traces the drawn edge, not a re-derived one', () => {
  it('every silhouette point lies ON its own polygon boundary', () => {
    const runs = fairwayEdgeRuns([LEFT, OVERLAP]);
    const onEdge = (p: Vec, poly: Vec[]): boolean => {
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
        best = Math.min(best, Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t)));
      }
      return best < 1e-6;
    };
    runs.forEach((rs, i) => {
      for (const r of rs) for (const p of r.pts) expect(onEdge(p, [LEFT, OVERLAP][i]!)).toBe(true);
    });
  });
});

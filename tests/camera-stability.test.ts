import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { buildScene, type Prim } from '../src/render/style';
import { holeProjector } from '../src/render/project';
import { renderHoleSVG } from '../src/render/holeView';
import { shotSpread } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';

/**
 * Camera-motion stability (the shooting-gesture jitter bug, 2026-07).
 *
 * The play view rebuilds the scene through a MOVING projector every frame (follow-cam, pinch,
 * and — before the companion app.ts fix — a per-frame viewRadius wobble during the pull gesture).
 * The scene builder must therefore be a pure function of the HOLE for everything the rng decides:
 *
 *  1. rng CONSUMPTION never reads the projection — an in-view retry / px-sized draw count means a
 *     sub-pixel camera change shifts the stream and re-rolls every draw downstream (trees, water,
 *     lava all "jerk wildly" while the camera moves).
 *  2. posHash variation keys off COURSE-space positions, never projected px — the sin hash flips
 *     completely on a sub-pixel input change.
 *
 * These tests drive the same scene through wobbled/panned projectors and assert stability. Before
 * the fix, half of the structural cases and all of the translation cases failed.
 */

const BIOMES = [
  'ember-world',
  'spore-jungle',
  'void-garden',
  'prism-reach',
  'frost-hollow',
  'dust-belt',
  'storm-shelf',
  'tide-hollow',
  'verdant-station',
];

function sceneAt(biome: string, seed: number, fx: number, r: number) {
  const hole = generateCourse(seed, { biome, holes: 1 }).holes[0]!;
  const ball = hole.tee;
  const pin = hole.green;
  const proj = holeProjector(hole, {
    width: 360,
    height: 640,
    focus: [ball[0] + (pin[0] - ball[0]) * fx, ball[1] + (pin[1] - ball[1]) * fx],
    viewRadius: r,
    focusBias: 0.84,
    up: [pin[0] - ball[0], pin[1] - ball[1]],
  });
  return { scene: buildScene(hole, proj, { width: 360, height: 640, biome }), proj };
}

describe('scene structure is stable while the camera moves', () => {
  for (const biome of BIOMES) {
    for (const seed of [77, 5, 123]) {
      it(`${biome} seed ${seed}: prim structure identical across a follow-cam pan + zoom ease`, () => {
        const a = sceneAt(biome, seed, 0.3, 42).scene;
        const b = sceneAt(biome, seed, 0.32, 42.3).scene;
        expect(b.length).toBe(a.length);
        expect(b.map((p) => p.t).join(',')).toBe(a.map((p) => p.t).join(','));
      });
    }
  }
});

/** All circles of a given fill, recursing into clip groups — picks out one flora detail layer. */
function circles(scene: Prim[], fill: string): [number, number][] {
  const out: [number, number][] = [];
  const walk = (ps: Prim[]): void =>
    ps.forEach((p) => {
      if (p.t === 'circle' && p.fill === fill) out.push([p.c[0], p.c[1]]);
      if (p.t === 'clip') walk(p.children);
    });
  walk(scene);
  return out;
}

describe('a pure camera pan translates decor details exactly (no posHash re-roll)', () => {
  // One posHash-varied detail per representative world: mushroom cap spots, snag embers.
  const CASES: [string, string][] = [
    ['spore-jungle', 'rgba(240,236,255,0.9)'],
    ['ember-world', '#ff8a2a'],
  ];
  for (const [biome, fill] of CASES) {
    it(`${biome}: ${fill} details ride the pan as one rigid translation`, () => {
      const hole = generateCourse(77, { biome, holes: 1 }).holes[0]!;
      const ball = hole.tee;
      const pin = hole.green;
      const mk = (dx: number) => {
        const proj = holeProjector(hole, {
          width: 360,
          height: 640,
          focus: [ball[0] + dx, ball[1]],
          viewRadius: 60,
          focusBias: 0.84,
          up: [pin[0] - ball[0], pin[1] - ball[1]],
        });
        return { scene: buildScene(hole, proj, { width: 360, height: 640, biome }), proj };
      };
      const a = mk(0);
      const b = mk(5); // a 5-yard follow-cam pan
      const ca = circles(a.scene, fill);
      const cb = circles(b.scene, fill);
      expect(ca.length).toBeGreaterThan(0);
      expect(cb.length).toBe(ca.length);
      const o0 = a.proj.project([0, 0]);
      const o1 = b.proj.project([0, 0]);
      const d = [o1[0] - o0[0], o1[1] - o0[1]];
      for (let i = 0; i < ca.length; i++) {
        expect(cb[i]![0] - ca[i]![0]).toBeCloseTo(d[0]!, 4);
        expect(cb[i]![1] - ca[i]![1]).toBeCloseTo(d[1]!, 4);
      }
    });
  }
});

describe('whole-map fit holds still while the live cone changes (fitSpray)', () => {
  it('two different live sprays with the same fitSpray share the identical scene prefix', () => {
    const hole = generateCourse(77, { biome: 'ember-world', holes: 1 }).holes[0]!;
    const club = CLUBS[0]!;
    const frame = shotSpread(hole, hole.tee, 'tee', hole.green, club, { power: 1 });
    const half = shotSpread(hole, hole.tee, 'tee', hole.green, club, { power: 0.5 });
    // The scene-only render at the frame fit must be a byte-identical prefix of BOTH live renders —
    // i.e. the live cone changes only what's drawn AFTER the world, never the world's fit.
    const base = renderHoleSVG(hole, { fitSpray: frame }).replace(/<\/svg>$/, '');
    expect(renderHoleSVG(hole, { spray: frame, fitSpray: frame }).startsWith(base)).toBe(true);
    expect(renderHoleSVG(hole, { spray: half, fitSpray: frame }).startsWith(base)).toBe(true);
  });
});

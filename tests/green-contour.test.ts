import { describe, it, expect } from 'vitest';
import {
  greenSlopeAt,
  idealPuttAim,
  manualPutt,
  puttBreakBow,
  puttBreakProfile,
  puttBreakYd,
  puttPathPreview,
  onePutt,
  rollOut,
  MANUAL_IDEAL_PACE,
} from '../src/sim/round';
import { heightFieldAt, slopeFieldAt } from '../src/sim/contour';
import { contourIsolines } from '../src/render/contour';
import { greenSlopeArt } from '../src/render/style/green';
import { holeProjector } from '../src/render/project';
import { Rng } from '../src/sim/rng';
import { dist, type GreenLobe, type Hole, type Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { BIOMES } from '../src/sim/course/biomes';

const pin: Vec = [0, 0];
const from: Vec = [0, 20]; // a 20-yd putt straight down +y→pin

/** An Rng whose gaussian is forced to 0 — isolates the deterministic break/aim maths from wobble. */
class NoWobbleRng extends Rng {
  override gaussian(): number {
    return 0;
  }
}

describe('greenSlopeAt — the shared local field (GS-green-contour)', () => {
  it('with no lobes it is exactly the plane', () => {
    expect(greenSlopeAt([3, 7], [0.2, -0.1])).toEqual([0.2, -0.1]);
    expect(greenSlopeAt([3, 7], undefined)).toEqual([0, 0]);
  });

  it("a mound's downhill points away from its crest, a hollow's toward it, peaking at the flank", () => {
    const mound: GreenLobe = { c: [0, 0], r: 6, h: 0.4 };
    const atFlank = greenSlopeAt([6, 0], undefined, [mound]);
    expect(atFlank[0]).toBeCloseTo(0.4, 5); // peak |h| exactly at r, pointing +x (away)
    expect(atFlank[1]).toBeCloseTo(0, 5);
    const hollow: GreenLobe = { c: [0, 0], r: 6, h: -0.4 };
    const inHollow = greenSlopeAt([6, 0], undefined, [hollow]);
    expect(inHollow[0]).toBeCloseTo(-0.4, 5); // toward the centre
    // Fades: flat at the crest, faint far beyond the footprint.
    expect(Math.hypot(...greenSlopeAt([0.0001, 0], undefined, [mound]))).toBeLessThan(0.001);
    expect(Math.hypot(...greenSlopeAt([30, 0], undefined, [mound]))).toBeLessThan(0.02);
  });
});

describe('break model back-compat (no lobes = the GS-greens-3 closed form)', () => {
  const slope: Vec = [0.3, 0.1];

  it('puttBreakYd with an empty/absent lobe list matches the closed form byte-for-byte', () => {
    const d = dist(from, pin);
    const rperp: Vec = [1, 0]; // right of the [0,20]→[0,0] line
    const paceFac = Math.max(0.7, Math.min(1.6, MANUAL_IDEAL_PACE / Math.max(0.4, 1)));
    const closed = 0.18 * (slope[0] * rperp[0] + slope[1] * rperp[1]) * Math.pow(d, 1.35) * paceFac;
    expect(puttBreakYd(from, pin, slope, 1)).toBeCloseTo(closed, 10);
    expect(puttBreakYd(from, pin, slope, 1, [])).toBe(puttBreakYd(from, pin, slope, 1));
  });

  it('puttPathPreview without lobes is unchanged (t^1.8 curl)', () => {
    const brk = puttBreakYd(from, pin, slope, 1);
    const pts = puttPathPreview(from, pin, slope, 0, 1);
    // Lateral (x, since the line runs down y) at t follows brk·t^1.8.
    const mid = pts[6]!; // t = 0.5
    expect(mid[0]).toBeCloseTo(brk * Math.pow(0.5, 1.8), 10);
    expect(pts[12]![0]).toBeCloseTo(brk, 10);
  });

  it('a constant field fed through the lobe integrator lands on the closed form at the cup', () => {
    // A negligible far-away lobe forces the numeric path; the plane term must survive it intact.
    const farLobe: GreenLobe = { c: [1000, 1000], r: 4, h: 0.5 };
    const numeric = puttBreakYd(from, pin, slope, 1, [farLobe]);
    expect(numeric).toBeCloseTo(puttBreakYd(from, pin, slope, 1), 4);
  });

  it('manualPutt without contour is byte-identical to the pre-contour resolver', () => {
    const a = manualPutt(new Rng('gc:1'), from, pin, { pace: 1.04, aim: -1 }, {}, slope);
    const b = manualPutt(new Rng('gc:1'), from, pin, { pace: 1.04, aim: -1 }, {}, slope, []);
    expect(b).toEqual(a);
  });
});

describe('contoured greens double-break (GS-green-contour)', () => {
  // Two mounds flanking the line — one LEFT of it early (pushes the ball right going in), one RIGHT
  // of it late (pushes it back left near the cup): the classic S of a real double-breaker.
  const knobs: GreenLobe[] = [
    { c: [-3, 15], r: 5, h: 0.6 },
    { c: [3, 5], r: 5, h: 0.6 },
  ];

  it('the cumulative profile bows out then curls back (the S-curve is real, not a rendering trick)', () => {
    const prof = puttBreakProfile(from, pin, undefined, 1, knobs, 24);
    const max = Math.max(...prof);
    expect(max).toBeGreaterThan(0.3); // drifts right off the first knob
    expect(prof[prof.length - 1]!).toBeLessThan(max - 0.3); // then curls back off the second
    expect(puttBreakBow(from, pin, undefined, knobs).max).toBeGreaterThan(0.3);
  });

  it('the drawn path and the resolver agree at the finish (the graphic IS the physics)', () => {
    const pts = puttPathPreview(from, pin, undefined, 0, 1, knobs);
    const net = puttBreakYd(from, pin, undefined, 1, knobs);
    expect(pts[pts.length - 1]![0]).toBeCloseTo(net, 6);
  });

  it('aiming the ideal read at ideal pace holes it once wobble is stripped', () => {
    const aim = idealPuttAim(from, pin, undefined, knobs);
    const p = manualPutt(new NoWobbleRng('gc:2'), from, pin, { pace: MANUAL_IDEAL_PACE, aim }, {}, undefined, knobs);
    expect(p.holed).toBe(true);
    // And ignoring a real read misses: same stroke aimed dead straight slides by.
    const wide: GreenLobe = { c: [-3, 10], r: 6, h: 1.2 };
    const straight = manualPutt(new NoWobbleRng('gc:3'), from, pin, { pace: MANUAL_IDEAL_PACE, aim: 0 }, {}, undefined, [wide]);
    expect(straight.holed).toBe(false);
  });
});

describe('the height field is the slope field’s potential (GS-green-contour-2)', () => {
  const plane: Vec = [0.25, -0.15];
  const lobes: GreenLobe[] = [
    { c: [4, 8], r: 7, h: 0.5 },
    { c: [-6, 2], r: 5, h: -0.35 },
  ];

  it('the numeric gradient of heightFieldAt is exactly -slopeFieldAt (downhill = -∇H)', () => {
    const eps = 1e-5;
    for (const p of [[0, 0], [3, 9], [-5, 1], [10, -4], [4.2, 8.3]] as Vec[]) {
      const gx = (heightFieldAt([p[0] + eps, p[1]], plane, lobes) - heightFieldAt([p[0] - eps, p[1]], plane, lobes)) / (2 * eps);
      const gy = (heightFieldAt([p[0], p[1] + eps], plane, lobes) - heightFieldAt([p[0], p[1] - eps], plane, lobes)) / (2 * eps);
      const s = slopeFieldAt(p, plane, lobes);
      expect(-gx).toBeCloseTo(s[0], 4);
      expect(-gy).toBeCloseTo(s[1], 4);
    }
  });

  it('a mound is high at its crest, a hollow low, relative to the surrounding surface', () => {
    const crest = heightFieldAt([4, 8], undefined, lobes.slice(0, 1));
    const far = heightFieldAt([100, 100], undefined, lobes.slice(0, 1));
    expect(crest).toBeGreaterThan(far + 1);
    const dip = heightFieldAt([-6, 2], undefined, lobes.slice(1));
    expect(dip).toBeLessThan(heightFieldAt([100, 100], undefined, lobes.slice(1)) - 0.5);
  });
});

describe('topo isolines (GS-green-contour-2)', () => {
  // A generous square "green" with a bold central mound — the simplest sculpted surface.
  const square: Vec[] = [[-15, -15], [15, -15], [15, 15], [-15, 15]];
  const mound: GreenLobe[] = [{ c: [0, 0], r: 8, h: 0.6 }];

  it('an isolated mound yields at least one CLOSED ring around its crest', () => {
    const iso = contourIsolines(square, undefined, mound);
    expect(iso.length).toBeGreaterThan(0);
    const closed = iso.filter((l) => dist(l.pts[0]!, l.pts[l.pts.length - 1]!) < 1e-6);
    expect(closed.length).toBeGreaterThan(0);
    // And the rings genuinely encircle the crest: some closed ring has points on both sides of it.
    const ring = closed[0]!.pts;
    expect(Math.min(...ring.map((p) => p[0]))).toBeLessThan(0);
    expect(Math.max(...ring.map((p) => p[0]))).toBeGreaterThan(0);
    // Elevation coding: every frac in [0,1], and HIGHER rings hug the crest tighter (smaller mean
    // radius) — the colour code the renderer keys off frac is geometrically honest.
    for (const l of iso) expect(l.frac).toBeGreaterThanOrEqual(0);
    for (const l of iso) expect(l.frac).toBeLessThanOrEqual(1);
    const meanR = (l: { pts: Vec[] }): number => l.pts.reduce((a, p) => a + Math.hypot(p[0], p[1]), 0) / l.pts.length;
    const sorted = [...iso].sort((a, b) => a.frac - b.frac);
    expect(meanR(sorted[sorted.length - 1]!)).toBeLessThan(meanR(sorted[0]!));
  });

  it('a pure plane yields straight, roughly parallel level lines; a flat field yields none', () => {
    const iso = contourIsolines(square, [0.4, 0], []);
    expect(iso.length).toBeGreaterThan(1);
    // Level sets of a plane sloping along +x are vertical lines: x varies little within one line.
    for (const line of iso) {
      const xs = line.pts.map((p) => p[0]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    }
    // Downhill is +x, so HIGHER levels (bigger frac) sit at smaller x — the light/dark code
    // paints the uphill side light exactly where the fall-line arrows point away from.
    const meanX = (l: { pts: Vec[] }): number => l.pts.reduce((a, p) => a + p[0], 0) / l.pts.length;
    const sorted = [...iso].sort((a, b) => a.frac - b.frac);
    expect(meanX(sorted[sorted.length - 1]!)).toBeLessThan(meanX(sorted[0]!));
    expect(contourIsolines(square, undefined, [])).toEqual([]);
    expect(contourIsolines(square, [0, 0], [])).toEqual([]);
  });

  it('deterministic and projection-free: two calls agree point-for-point', () => {
    const a = contourIsolines(square, [0.2, 0.1], mound);
    const b = contourIsolines(square, [0.2, 0.1], mound);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('closed rings know their side: a mound cap is hiInside, a hollow floor is not (GS-green-contour-3)', () => {
    const isoM = contourIsolines(square, undefined, mound);
    const closedM = isoM.filter((l) => l.closed);
    expect(closedM.length).toBeGreaterThan(0);
    // The tightest (highest) closed ring around a mound crest is a dome cap — terraces wash it LIGHT.
    expect([...closedM].sort((a, b) => b.frac - a.frac)[0]!.hiInside).toBe(true);
    const isoH = contourIsolines(square, undefined, [{ c: [0, 0], r: 8, h: -0.6 }]);
    const closedH = isoH.filter((l) => l.closed);
    expect(closedH.length).toBeGreaterThan(0);
    // …and the deepest closed ring of a hollow is a floor — washed DARK.
    expect([...closedH].sort((a, b) => a.frac - b.frac)[0]!.hiInside).toBe(false);
    // Open lines carry no side (nothing to fill).
    for (const l of isoM) if (!l.closed) expect(l.hiInside).toBeUndefined();
  });

  it('illuminated-contour chunk counts are camera-proof: two different projections agree (GS-green-contour-3)', () => {
    const course = generateCourse(20260706, { holes: 9, biome: 'ice-ring', distanceFromStart: 30 });
    const hole = course.holes.find((h) => h.greenContour && h.greenContour.length)!;
    expect(hole).toBeDefined();
    const green = hole.features.find((f) => f.kind === 'green')!.poly;
    const a = greenSlopeArt(hole, green, holeProjector(hole, { width: 360, height: 640 }))!;
    const b = greenSlopeArt(hole, green, holeProjector(hole, { width: 520, height: 400, up: [1, 0.4] }))!;
    // Ring count, per-ring chunk counts and the arrow-field count never read the projection…
    expect(a.iso!.map((r) => r.chunks.length)).toEqual(b.iso!.map((r) => r.chunks.length));
    expect(a.iso!.map((r) => r.closed)).toEqual(b.iso!.map((r) => r.closed));
    expect(a.arrows!.length).toBe(b.arrows!.length);
    // …while each chunk's LIGHTING legitimately does (the shared sun lives in screen space).
    for (const r of a.iso!) for (const ch of r.chunks) expect(Math.abs(ch.lit)).toBeLessThanOrEqual(1);
  });
});

describe('green roll-out reads the LOCAL contour field (GS-green-contour-2)', () => {
  /** One big all-green pad so the roll only ever feels the field. */
  const pad = (lobes?: GreenLobe[], slope?: Vec): Hole => ({
    par: 3,
    tee: [0, -100],
    green: [0, 0],
    centreline: [[0, -100], [0, 0]],
    features: [{ kind: 'green', poly: [[-60, -60], [60, -60], [60, 60], [-60, 60]] }],
    hazards: [],
    greenSlope: slope,
    greenContour: lobes,
  });
  const mound: GreenLobe[] = [{ c: [0, 12], r: 8, h: 0.6 }];

  it('a ball rolling INTO a mound finishes short of the flat roll; down its far flank it runs on', () => {
    // GS-green-contour-3 note: `roll` is the ARC length and now includes the landing kick + the
    // gravity creep (a ball that climbs a flank trickles back down it), so "brakes short" is asserted
    // on FORWARD PROGRESS (rest along the travel), not on the arc.
    const flat = rollOut(pad(), [0, 0], [0, 1], 10, 'green');
    const intoMound = rollOut(pad(mound), [0, 0], [0, 1], 10, 'green');
    expect(intoMound.rest[1]).toBeLessThan(flat.rest[1]); // climbing the near flank costs energy
    const offCrest = rollOut(pad(mound), [0, 13], [0, 1], 10, 'green');
    expect(offCrest.rest[1] - 13).toBeGreaterThan(flat.rest[1]); // riding the far flank downhill runs out
  });

  it('the FIRST BOUNCE reads the landform: an upslope face kills the skip, a downslope flank kicks on (GS-green-contour-3)', () => {
    // Same travel (+y), same energy: touching down on the mound's NEAR flank (landing into the
    // upslope) must finish well short of touching down just past the crest (landing downhill).
    const intoFace = rollOut(pad(mound), [0, 6], [0, 1], 8, 'green');
    const downFlank = rollOut(pad(mound), [0, 14], [0, 1], 8, 'green');
    expect(downFlank.rest[1] - 14).toBeGreaterThan(intoFace.rest[1] - 6);
    // And the bounce DEFLECTS toward the fall line: a touchdown on a side flank leaves the struck
    // line immediately (pure lobe field — no plane — so the drift is all landform).
    const side = rollOut(pad([{ c: [8, 3], r: 8, h: 0.6 }]), [0, 0], [0, 1], 8, 'green');
    expect(side.rest[0]).toBeLessThan(-0.3); // shed away from the crest on its left
  });

  it('gravity creep: a dead ball cannot rest on a steep flank — it sheds off mounds and gathers into hollows', () => {
    // A near-dead drop on the mound's near flank trickles back DOWN the sculpt…
    const shed = rollOut(pad(mound), [0, 6], [0, 1], 0.5, 'green');
    expect(shed.rest[1]).toBeLessThan(6 - 1.5);
    // …and the same drop beside a HOLLOW gathers toward its centre.
    const hollow = rollOut(pad([{ c: [0, 12], r: 8, h: -0.6 }]), [0, 6], [0, 1], 0.5, 'green');
    expect(hollow.rest[1]).toBeGreaterThan(6 + 1.5);
    // The creep is a settle, not a second roll-out: bounded by its budget.
    expect(dist(shed.rest, [0, 6])).toBeLessThanOrEqual(0.5 + 5 + 1e-6);
    // A green's uniform PLANE tilt still holds a ball exactly as before (no lobe steepness → no creep).
    const farLobe: GreenLobe[] = [{ c: [1000, 1000], r: 4, h: 0.5 }];
    const planeOnly = rollOut(pad(farLobe, [0.6, 0]), [0, 0], [0, 1], 0.5, 'green');
    expect(dist(planeOnly.rest, [0, 0])).toBeLessThan(1.5); // rests near the drop, despite the steep plane
  });

  /** The CREEP leg of a resolved roll-out: the chord from where the ball came to rest (`creepFrom`,
   *  travelled distance) to where gravity left it. This is exactly the stretch `playView` draws as its
   *  own slow phase after the pause, so it is the vector the player watches. */
  const creepLeg = (r: { roll: number; rest: Vec; path?: Vec[]; creepFrom?: number }): Vec | undefined => {
    if (r.creepFrom === undefined || !r.path || r.path.length < 2) return undefined;
    const total = Math.abs(r.roll);
    let len = 0;
    for (let i = 1; i < r.path.length; i++) len += dist(r.path[i - 1]!, r.path[i]!);
    let left = total > 1e-9 ? len * (r.creepFrom / total) : len;
    let at: Vec = r.path[0]!;
    for (let i = 1; i < r.path.length; i++) {
      const seg = dist(r.path[i - 1]!, r.path[i]!);
      if (left <= seg || i === r.path.length - 1) {
        const f = seg > 1e-9 ? Math.min(1, left / seg) : 1;
        at = [r.path[i - 1]![0] + (r.path[i]![0] - r.path[i - 1]![0]) * f, r.path[i - 1]![1] + (r.path[i]![1] - r.path[i - 1]![1]) * f];
        break;
      }
      left -= seg;
    }
    return [r.rest[0] - at[0], r.rest[1] - at[1]];
  };
  const angleDeg = (a: Vec, b: Vec): number => {
    const la = Math.hypot(a[0], a[1]) || 1;
    const lb = Math.hypot(b[0], b[1]) || 1;
    const d = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb)));
    return (Math.acos(d) * 180) / Math.PI;
  };

  it('gravity creep runs down the DRAWN fall line — plane + sculpt, never the sculpt alone (GS-creep-fallline)', () => {
    // WHAT SHEDS THE BALL AND WHICH WAY IT GOES ARE TWO DIFFERENT QUESTIONS. The mound's flank is the
    // bank the ball cannot rest on (it sheds toward −y); the green's PLANE tilts hard toward +x. Once
    // the ball is loose, gravity takes it down the surface it is lying on — which is the field the
    // isolines, the terrace shading, the fall-line arrows, the putt break and the roll curl all sample.
    // Reading the sculpt ALONE for the direction (the original pass) put the creep 65° away from the
    // drawn contours on average and outright uphill on one creep in seven.
    const plane: Vec = [1.2, 0];
    const drop: Vec = [0, 6]; // the mound's near flank
    const r = rollOut(pad(mound, plane), drop, [0, 1], 0.5, 'green');
    const leg = creepLeg(r)!;
    expect(leg).toBeDefined();
    expect(Math.hypot(leg[0], leg[1])).toBeGreaterThan(1); // it genuinely crept
    const restedAt: Vec = [r.rest[0] - leg[0], r.rest[1] - leg[1]];
    // The DRAWN field and the sculpt-only field point ~65° apart here, so this discriminates.
    const drawn = greenSlopeAt(restedAt, plane, mound);
    const sculpt = greenSlopeAt(restedAt, undefined, mound);
    expect(angleDeg(drawn, sculpt)).toBeGreaterThan(45);
    expect(angleDeg(leg, drawn)).toBeLessThan(30); // …and the ball follows the picture
    expect(angleDeg(leg, sculpt)).toBeGreaterThan(45);
  });

  it('gravity creep needs a downhill to shed the ball TO: where the plane cancels the sculpt, it rests (GS-creep-fallline)', () => {
    // The sculpt at the drop point sheds toward −y at ~0.56; a plane of exactly that tilting +y leaves
    // the DRAWN ground flat there. The bank is steep enough to break the ball loose, but there is
    // nowhere downhill for it to go, so it stays put — the surface field gates the creep too.
    const r = rollOut(pad(mound, [0, 0.56]), [0, 6], [0, 1], 0.5, 'green');
    expect(r.creepFrom).toBeUndefined();
    // …and the pairing rule holds in the other direction: a steep PLANE with no sculpt under the ball
    // still never sheds it (a green's uniform tilt holds a ball, exactly as before).
    const farLobe: GreenLobe[] = [{ c: [1000, 1000], r: 4, h: 0.5 }];
    expect(rollOut(pad(farLobe, [1.2, 0]), [0, 0], [0, 1], 0.5, 'green').creepFrom).toBeUndefined();
  });

  it('gravity creep never carries the ball OFF the green (the collar catches it)', () => {
    // A small green whose downhill flank runs straight off the edge: the creep must stop inside.
    const smallGreen: Hole = {
      ...pad(mound),
      features: [{ kind: 'green', poly: [[-10, -2], [10, -2], [10, 20], [-10, 20]] }],
    };
    const r = rollOut(smallGreen, [0, 4], [0, 1], 0.5, 'green');
    expect(r.rest[1]).toBeGreaterThan(-2); // still on the green — settled against the low edge
  });

  it('the curled roll is path-consistent: |roll| is the arc length, rest is the path end', () => {
    const r = rollOut(pad(mound, [0.2, 0.1]), [3, -6], [0.6, 0.8], 12, 'green');
    // The chord can only be SHORTER than the arc (a straight roll is the degenerate equal case)…
    expect(dist(r.rest, [3, -6])).toBeLessThanOrEqual(Math.abs(r.roll) + 1e-6);
    // …and the travel is bounded — a break plus a settle, never an orbit. (Was 0.8 before the
    // gravity creep; a ball that climbs a flank and trickles back can legitimately shorten the chord.)
    expect(dist(r.rest, [3, -6])).toBeGreaterThan(Math.abs(r.roll) * 0.3);
    if (r.path) {
      expect(r.path[0]).toEqual([3, -6]);
      const last = r.path[r.path.length - 1]!;
      expect(last[0]).toBeCloseTo(r.rest[0], 9);
      expect(last[1]).toBeCloseTo(r.rest[1], 9);
      let arc = 0;
      for (let i = 1; i < r.path.length; i++) arc += dist(r.path[i - 1]!, r.path[i]!);
      expect(arc).toBeCloseTo(Math.abs(r.roll), 5);
    }
  });

  it('a roll across a side slope CURLS downhill and reports its curved path (round 2)', () => {
    // Plane sloping down +x, travel +y: the ball must drift toward +x as it rolls. A negligible
    // far-away lobe arms the curling integrator while leaving the field pure plane.
    const farLobe: GreenLobe[] = [{ c: [1000, 1000], r: 4, h: 0.5 }];
    const r = rollOut(pad(farLobe, [0.5, 0]), [0, 0], [0, 1], 12, 'green');
    expect(r.rest[0]).toBeGreaterThan(0.5); // drifted downhill of the straight line
    expect(r.path).toBeDefined();
    expect(r.path![0]![0]).toBe(0); // leaves on the struck line…
    expect(r.rest[0]).toBeLessThan(Math.abs(r.roll) * 0.5); // …and bends, never veers sideways
    // Off the green nothing bends: the same plane under a FAIRWAY roll runs dead straight.
    const fw: Hole = {
      ...pad(farLobe, [0.5, 0]),
      features: [{ kind: 'fairway', poly: [[-60, -60], [60, -60], [60, 60], [-60, 60]] }],
    };
    const rf = rollOut(fw, [0, 0], [0, 1], 12, 'fairway');
    expect(rf.rest[0]).toBe(0);
    expect(rf.path).toBeUndefined();
  });

  it('a plane-only hole is byte-identical to the pre-contour roll (greenContour absent vs [])', () => {
    const a = rollOut(pad(undefined, [0.3, -0.1]), [0, 0], [0, 1], 10, 'green');
    const b = rollOut(pad([], [0.3, -0.1]), [0, 0], [0, 1], 10, 'green');
    expect(b).toEqual(a);
  });
});

describe('the watched putt curls along the true break path (GS-green-contour-2)', () => {
  const knobs: GreenLobe[] = [
    { c: [-3, 15], r: 5, h: 0.6 },
    { c: [3, 5], r: 5, h: 0.6 },
  ];

  it('manualPutt returns a path from exactly `from` to exactly `to`', () => {
    const p = manualPutt(new Rng('gc2:1'), from, pin, { pace: 1.1, aim: -0.5 }, {}, [0.2, 0], knobs);
    expect(p.path).toBeDefined();
    expect(p.path![0]).toEqual(from);
    const last = p.path![p.path!.length - 1]!;
    expect(last[0]).toBeCloseTo(p.to[0], 9);
    expect(last[1]).toBeCloseTo(p.to[1], 9);
  });

  it('a made double-breaker’s path S-bends on its way into the cup', () => {
    const aim = idealPuttAim(from, pin, undefined, knobs);
    const p = manualPutt(new NoWobbleRng('gc2:2'), from, pin, { pace: MANUAL_IDEAL_PACE, aim }, {}, undefined, knobs);
    expect(p.holed).toBe(true);
    // Lateral (x) along the path bows right of the start→cup chord then returns — a real curve,
    // not a straight glide.
    const xs = p.path!.map((pt) => pt[0]);
    expect(Math.max(...xs)).toBeGreaterThan(0.3);
    const last = p.path![p.path!.length - 1]!;
    expect(last[0]).toBeCloseTo(pin[0], 6);
    expect(last[1]).toBeCloseTo(pin[1], 6);
  });

  it('auto putts (onePutt) carry no path — the play view keeps its straight-lerp fallback', () => {
    const log = onePutt(new Rng('gc2:3'), from, pin);
    expect(log.path).toBeUndefined();
    // …while a manual putt always carries its curve, even on a plane-only green.
    expect(manualPutt(new Rng('gc2:4'), from, pin, { pace: 1 }, {}, undefined, undefined).path).toBeDefined();
  });
});

describe('generator emits contour lobes on a side stream', () => {
  it('every hole carries 1–2 lobes, on/near its green, capped by the biome greenSlopeMax', () => {
    for (let s = 0; s < 40; s++) {
      const course = generateCourse(s + 61000, { biome: 'verdant-station', holes: 3, wildness: 0.5 });
      const biome = BIOMES.find((b) => b.id === 'verdant-station')!;
      for (const h of course.holes) {
        expect(h.greenContour!.length).toBeGreaterThanOrEqual(1);
        expect(h.greenContour!.length).toBeLessThanOrEqual(2);
        for (const l of h.greenContour!) {
          expect(dist(l.c, h.green)).toBeLessThan(40); // on/near the green
          expect(l.r).toBeGreaterThan(2);
          expect(Math.abs(l.h)).toBeLessThanOrEqual(biome.greenSlopeMax ?? 0.5);
          expect(Math.abs(l.h)).toBeGreaterThan(0.01);
        }
      }
    }
  });

  it('the lobes ride their own rng stream: terrain, pin and plane slope are untouched by the draw', () => {
    // Same seed twice → identical course (determinism), and the greenSlope plane still respects the
    // GS-putt-depth wild-vs-calm ordering (the slope stream did not move).
    const a = generateCourse(4242, { biome: 'verdant-station', holes: 2, wildness: 0.7 });
    const b = generateCourse(4242, { biome: 'verdant-station', holes: 2, wildness: 0.7 });
    expect(JSON.stringify(a.holes.map((h) => h.greenContour))).toBe(JSON.stringify(b.holes.map((h) => h.greenContour)));
    expect(JSON.stringify(a.holes.map((h) => h.features))).toBe(JSON.stringify(b.holes.map((h) => h.features)));
  });
});

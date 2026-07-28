/**
 * A census of the gravity CREEP (GS-green-contour-3) against the contours the player can SEE.
 *
 * The report: "sometimes, frequently enough to do something about, the ball rolls straight across or
 * against the contours after the backspin and it looks like a proper bug." The creep is the phase that
 * plays after the roll has stopped, so it is the suspect — and it reads a DIFFERENT field than the one
 * the green is drawn from: `greenSlopeAt(p, undefined, lobes)` (the sculpt alone) rather than
 * `greenSlopeAt(p, plane, lobes)` (plane + sculpt), which is what the isolines, the terrace shading,
 * the fall-line arrows, the putt break and the roll-out curl all read.
 *
 * This measures the angle between the creep's own direction and the drawn fall line at the point the
 * ball came to rest, over real played holes, so the size of the disagreement is a number and not a
 * hunch. Nothing is re-derived: it plays with `playCourse` and reads the shipped `ShotLog`.
 *
 *   npx tsx scripts/creep-census.ts
 */
import { Rng } from '../src/sim/rng';
import { BIOMES } from '../src/sim/course/biomes';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, greenSlopeAt } from '../src/sim/round';
import type { Hole, Vec } from '../src/sim/course/contract';
import type { ShotLog } from '../src/sim/round';

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const angleBetween = (a: Vec, b: Vec): number => {
  const ua = norm(a);
  const ub = norm(b);
  const d = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]));
  return (Math.acos(d) * 180) / Math.PI;
};
/** The point `want` yards along a polyline, and the local direction there. */
function walk(path: readonly Vec[], want: number): { at: Vec; dir: Vec } {
  let left = Math.max(0, want);
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    if (left <= seg || i === path.length - 1) {
      const f = seg > 1e-9 ? Math.min(1, left / seg) : 1;
      return {
        at: [path[i - 1]![0] + (path[i]![0] - path[i - 1]![0]) * f, path[i - 1]![1] + (path[i]![1] - path[i - 1]![1]) * f],
        dir: norm([path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]]),
      };
    }
    left -= seg;
  }
  const n = path.length;
  return { at: path[n - 1]!, dir: norm([path[n - 1]![0] - path[n - 2]![0], path[n - 1]![1] - path[n - 2]![1]]) };
}

interface Row {
  biome: string;
  check: boolean;
  creepYd: number;
  vsDrawn: number; // creep direction vs the DRAWN fall line at the rest point (deg)
  vsSculpt: number; // creep direction vs the sculpt-only fall line (deg) — should be ~0 today
  planeMag: number;
  sculptMag: number;
}

const rows: Row[] = [];
let shotsSeen = 0;

// A SPIN BUILD, so the census sees real backspin checks: the auto sim plays a stock bag, and since
// GS-backspin-optin a plain wedge never spins back (0 of 5,870 stock shots checked), so the reported
// "after the backspin" case is unreachable without arming one. 0.2 is roughly Fresh-Groove wedges +
// a spin card — an ordinary shopped build, not an extreme.
const SPIN: { backspinBoost?: number } = process.env.STOCK ? {} : { backspinBoost: 0.2 };

for (const b of BIOMES) {
  for (let seed = 0; seed < 40; seed++) {
    let course;
    try {
      course = generateCourse(seed + 1000, { biome: b.id, holes: 3, wildness: 1 });
    } catch {
      continue;
    }
    const played = playCourse(course.holes, new Rng(`${b.id}:${seed}:p`), SPIN);
    played.forEach((p, hi) => {
      const hole = course!.holes[hi] as Hole;
      for (const s of p.shots as ShotLog[]) {
        shotsSeen++;
        if (s.creepFrom === undefined || !s.rollPath || s.rollPath.length < 2) continue;
        const total = Math.abs(s.roll ?? 0);
        const creepYd = Math.max(0, total - s.creepFrom);
        if (creepYd < 1e-6) continue;
        // The path is arc-length parameterised the same way the play view walks it.
        let len = 0;
        for (let i = 1; i < s.rollPath.length; i++) {
          len += Math.hypot(s.rollPath[i]![0] - s.rollPath[i - 1]![0], s.rollPath[i]![1] - s.rollPath[i - 1]![1]);
        }
        const arc = total > 1e-6 ? len * (s.creepFrom / total) : len;
        const start = walk(s.rollPath, arc);
        const end = s.rollPath[s.rollPath.length - 1]!;
        const creepDir = norm([end[0] - start.at[0], end[1] - start.at[1]]);
        const drawn = greenSlopeAt(start.at, hole.greenSlope, hole.greenContour);
        const sculpt = greenSlopeAt(start.at, undefined, hole.greenContour);
        rows.push({
          biome: b.id,
          check: (s.roll ?? 0) < 0,
          creepYd,
          vsDrawn: angleBetween(creepDir, drawn),
          vsSculpt: angleBetween(creepDir, sculpt),
          planeMag: Math.hypot(hole.greenSlope?.[0] ?? 0, hole.greenSlope?.[1] ?? 0),
          sculptMag: Math.hypot(sculpt[0], sculpt[1]),
        });
      }
    });
  }
}

const pct = (n: number): string => `${((n / rows.length) * 100).toFixed(1)}%`;
const across = rows.filter((r) => r.vsDrawn >= 60 && r.vsDrawn < 120);
const against = rows.filter((r) => r.vsDrawn >= 120);
const fine = rows.filter((r) => r.vsDrawn < 30);
console.log(`shots played        ${shotsSeen}`);
console.log(`creep events        ${rows.length}   (${rows.filter((r) => r.check).length} after a backspin CHECK)`);
console.log('');
console.log(`vs the DRAWN fall line at the rest point:`);
console.log(`  agrees   (<30 deg)  ${fine.length}\t${pct(fine.length)}`);
console.log(`  30-60 deg           ${rows.filter((r) => r.vsDrawn >= 30 && r.vsDrawn < 60).length}\t${pct(rows.filter((r) => r.vsDrawn >= 30 && r.vsDrawn < 60).length)}`);
console.log(`  ACROSS (60-120)     ${across.length}\t${pct(across.length)}`);
console.log(`  AGAINST (>=120)     ${against.length}\t${pct(against.length)}`);
console.log('');
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
console.log(`mean angle vs drawn   ${mean(rows.map((r) => r.vsDrawn)).toFixed(1)} deg`);
console.log(`mean angle vs sculpt  ${mean(rows.map((r) => r.vsSculpt)).toFixed(1)} deg   (today's field: expect ~0)`);
console.log(`mean creep            ${mean(rows.map((r) => r.creepYd)).toFixed(2)} yd`);
console.log(`mean plane |tilt|     ${mean(rows.map((r) => r.planeMag)).toFixed(3)}`);
console.log(`mean sculpt |grad|    ${mean(rows.map((r) => r.sculptMag)).toFixed(3)}`);
console.log('');
// Why does a creep STOP? A ball that halts because the 5yd budget ran out has stopped for no reason
// the player can see; one that halts because the ground flattened (or the collar caught it) has.
const capped = rows.filter((r) => r.creepYd > 4.99);
console.log(`stopped on the BUDGET  ${capped.length}\t${pct(capped.length)}  (creep >= CREEP_MAX)`);
console.log(`stopped on the GROUND  ${rows.length - capped.length}\t${pct(rows.length - capped.length)}`);
console.log('');
const byBiome = new Map<string, Row[]>();
for (const r of rows) byBiome.set(r.biome, [...(byBiome.get(r.biome) ?? []), r]);
for (const [id, rs] of [...byBiome].sort()) {
  const bad = rs.filter((r) => r.vsDrawn >= 60).length;
  console.log(
    `  ${id.padEnd(18)} creeps=${String(rs.length).padStart(4)}  wrong-way=${String(bad).padStart(4)} (${((bad / rs.length) * 100).toFixed(0)}%)  meanAngle=${mean(rs.map((r) => r.vsDrawn)).toFixed(0)}`,
  );
}

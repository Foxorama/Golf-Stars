// Regenerate the FROZEN static-course data files (GS-static-courses).
//
// A static course (e.g. "Antlia Scrapworks", the metal-18 round) is played from a frozen JSON so it
// stays byte-identical forever — even across GENERATOR_VERSION bumps. This script is the ESCAPE HATCH:
// it rebuilds each catalogue row from its pinned spec through the LIVE generator and rewrites the
// frozen JSON, so a seasonal redesign / rebalance is one command:
//
//   node scripts/gen-static-courses.mjs           → re-freeze every catalogue row
//   node scripts/gen-static-courses.mjs metal-18  → re-freeze just that id
//
// (also wired as `npm run gen:courses`). Imports the REAL TS generator via vite ssrLoadModule — no
// game logic is duplicated here. Pure dev tool; run it deliberately, then commit the changed JSON.

import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src', 'sim', 'course', 'static');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  // Import the GENERATION half only (no frozen JSON dependency), so this bootstraps even when a
  // freshly-added catalogue row has no frozen file yet.
  const { STATIC_COURSES, regenerateStaticCourse } = await server.ssrLoadModule(
    '/src/sim/course/staticCourseSpecs.ts',
  );
  const { validateCourse } = await server.ssrLoadModule('/src/sim/course/contract.ts');
  const { validateFairness, validateCrossings, validateGreenApproach, validateIslandHops } =
    await server.ssrLoadModule('/src/sim/course/generate.ts');

  // Course-space is YARDS; the generator emits ~15-digit floats, which is meaningless precision that
  // bloats the frozen file 3-4×. Round every number to 3 decimals (0.001 yd) — imperceptible — then
  // RE-VALIDATE the rounded course through the full validator suite, so the precision cut can never
  // slip an unfair hole (a pin off its green, a hazard onto the corridor) into the frozen data.
  const round3 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);
  const roundDeep = (x) =>
    Array.isArray(x) ? x.map(roundDeep) : x && typeof x === 'object'
      ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, roundDeep(v)]))
      : round3(x);

  const only = process.argv[2];
  const rows = only ? STATIC_COURSES.filter((c) => c.id === only) : STATIC_COURSES;
  if (only && rows.length === 0) throw new Error(`unknown static course id: ${only}`);

  mkdirSync(outDir, { recursive: true });
  for (const spec of rows) {
    const course = roundDeep(regenerateStaticCourse(spec));
    const errs = [
      ...validateCourse(course),
      ...validateFairness(course),
      ...validateCrossings(course),
      ...validateGreenApproach(course),
      ...validateIslandHops(course),
    ];
    if (errs.length) throw new Error(`rounded ${spec.id} is invalid:\n  ${errs.join('\n  ')}`);
    const path = join(outDir, `${spec.id}.json`);
    // MINIFIED: this is a generated data artifact (regenerated wholesale by this script, never
    // hand-edited), so it's written compact — ~4× smaller than pretty-printed, and gzips the same.
    writeFileSync(path, JSON.stringify(course) + '\n');
    const par = course.holes.reduce((s, h) => s + h.par, 0);
    console.log(`froze ${spec.id} (${spec.name}): ${course.holes.length} holes, par ${par} → ${path}`);
  }
} finally {
  await server.close();
}

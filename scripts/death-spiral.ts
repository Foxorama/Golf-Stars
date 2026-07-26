/**
 * Contract 4's no-death-spiral harness, standalone (GS-carry-roll-real). Mirrors the fences in
 * `tests/biomes.test.ts` exactly — same biomes, same 80 seeds, same wildness 1, same blow-up rule —
 * so a physics change can be MEASURED (toPar/hole + floor-hit rate) without running the whole suite.
 * Pure sim, no DOM. `npx tsx scripts/death-spiral.ts`
 */
import { Rng } from '../src/sim/rng';
import { BIOMES, BALANCE_EXEMPT_BIOMES } from '../src/sim/course/biomes';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, MAX_OVER_PAR } from '../src/sim/round';

let strokes = 0;
let par = 0;
let holes = 0;
let blowups = 0;
const perBiome: Record<string, { toPar: number; holes: number; blow: number }> = {};

for (const b of BIOMES) {
  if (BALANCE_EXEMPT_BIOMES.has(b.id)) continue;
  perBiome[b.id] = { toPar: 0, holes: 0, blow: 0 };
  for (let seed = 0; seed < 80; seed++) {
    let course;
    try {
      course = generateCourse(seed + 1000, { biome: b.id, holes: 3, wildness: 1 });
    } catch {
      continue;
    }
    for (const p of playCourse(course.holes, new Rng(`${b.id}:${seed}:p`))) {
      strokes += p.record.strokes;
      par += p.record.par;
      holes++;
      perBiome[b.id]!.toPar += p.record.strokes - p.record.par;
      perBiome[b.id]!.holes++;
      if (p.pickedUp || p.record.strokes - p.record.par >= MAX_OVER_PAR) {
        blowups++;
        perBiome[b.id]!.blow++;
      }
    }
  }
}

for (const [id, v] of Object.entries(perBiome)) {
  console.log(`  ${id.padEnd(20)} toPar/hole=${(v.toPar / v.holes).toFixed(4)}  floor=${((v.blow / v.holes) * 100).toFixed(2)}%  (${v.holes} holes)`);
}
console.log('');
console.log(`HOLES        ${holes}`);
console.log(`toPar/hole   ${((strokes - par) / holes).toFixed(4)}   (fence < 1.0)`);
console.log(`floor-hits   ${((blowups / holes) * 100).toFixed(2)}%   (fence < 9.00%)`);

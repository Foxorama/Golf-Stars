/**
 * Headless measurement: is a QUALIFYING EVENT equally hard whichever format it was drawn as?
 *
 * Run with:  npx vite-node scripts/qualifier-balance.ts        (ROUNDS=4000 to widen the sample)
 *
 * Motivation (GS-story-qualifier-formats): a qualifying event is now drawn into one of five formats, three
 * of which put a tour-mate beside you. A partner's ball is worth real strokes, so if the ghost ladder didn't
 * move, "you drew a two-ball" would quietly mean "you drew an easier qualifier" — variety turning into a
 * difficulty dice-roll, which is exactly the failure the golf-soul lens forbids. `PAIRING_BAR_SHIFT` prices
 * the partner in; this script MEASURES the price and checks the qualifying rate lands in the same band for
 * every format.
 *
 * Method (pure sim, no rendering): synthesise a spread of player rounds at a given standard (a per-hole
 * to-par with realistic scatter), run each through `resolveQualifierRound` for every format × pairing, and
 * report (a) the mean strokes a partner actually saves and (b) the share of rounds that qualify. Re-run
 * after any change to `PAIRING_BAR_SHIFT`, `QUALIFIER_PARTNER_EDGE`, `qualifierOppEdge` or the ghost model.
 */
import { Rng } from '../src/sim/rng';
import { playCourse } from '../src/sim/round';
import { staticCourseSpec, regenerateStaticCourse } from '../src/sim/course/staticCourseSpecs';
import { characterShotMods } from '../src/sim/rpg/characters';
import { storyPartnerBestBallScore } from '../src/sim/rpg/storyTeams';
import { QUALIFIER_PARTNER_EDGE } from '../src/sim/rpg/storyQualifierFormats';
import {
  resolveQualifierRound,
  QUALIFIER_FORMATS,
  isPairedFormat,
  type QualifierFormatId,
  type QualifierPairing,
  type QualifierPlan,
} from '../src/sim/rpg/storyQualifierFormats';

const ROUNDS = Number(process.env.ROUNDS ?? 1500);
const COURSE = 'verdant2-18';
const PARS = [4, 5, 3, 4, 4, 3, 5, 4, 4]; // a representative nine (par 36)
const PARTNER_ID = 'longshot-larry';

/** A synthetic player round: nine holes at `standard` to-par per hole plus honest scatter. */
function playerRound(seed: string, standard: number): number[] {
  const rng = new Rng(seed);
  return PARS.map((par) => {
    const noise = (rng.float() + rng.float() + rng.float() - 1.5) * 1.5;
    return Math.max(1, Math.round(par + standard + noise));
  });
}

// ── What each pairing is actually WORTH, measured through the real engine ────────────────────────────────
//
// The two pairings improve a round by two completely different mechanisms, so each is measured on its own
// terms rather than guessed at:
//   • SCRAMBLE — the shared ball is armed on the PLAYER's own swing (`scrambleOptsFor` → best of two shots
//     every stroke), so it shows up as a lower played gross. Measured by driving the REAL nine-hole
//     qualifier layout through `playCourse` with and without the partner's shot mods.
//   • BEST-BALL — the played gross is untouched; the partner is a per-hole ghost off the same stream the
//     resolution folds. Measured directly off `storyPartnerBestBallScore`.

function measureScrambleSaving(samples = 200): number {
  const spec = staticCourseSpec(COURSE);
  if (!spec) return NaN;
  const course = regenerateStaticCourse({ ...spec, seed: `${spec.seed}:qualifier`, opts: { ...spec.opts, holes: 9 } });
  const mods = characterShotMods(PARTNER_ID);
  let diff = 0;
  for (let i = 0; i < samples; i++) {
    const solo = playCourse(course.holes, new Rng(`qbs:${i}`)).reduce((t, p) => t + p.record.strokes, 0);
    const team = playCourse(course.holes, new Rng(`qbs:${i}`), { scramble: { partnerMods: mods } }).reduce(
      (t, p) => t + p.record.strokes,
      0,
    );
    diff += solo - team;
  }
  return diff / samples;
}

function measureBestBallSaving(seed: string, standard: number, samples = 800): number {
  let diff = 0;
  for (let i = 0; i < samples; i++) {
    const strokes = playerRound(`${seed}:${i}`, standard);
    let team = 0;
    for (let h = 0; h < PARS.length; h++) {
      const partner = storyPartnerBestBallScore(PARTNER_ID, QUALIFIER_PARTNER_EDGE, `qbb:${i}`, h, PARS[h]!);
      team += Math.min(strokes[h]!, partner);
    }
    diff += strokes.reduce((a, b) => a + b, 0) - team;
  }
  return diff / samples;
}

const SCRAMBLE_SAVING = measureScrambleSaving();
console.log(`Measured SCRAMBLE saving (real engine, 9 holes): ${SCRAMBLE_SAVING.toFixed(2)} strokes/round`);

function plan(format: QualifierFormatId, pairing: QualifierPairing, chapter: number): QualifierPlan {
  const paired = isPairedFormat(format);
  return {
    courseId: COURSE,
    chapter,
    holes: PARS.length,
    format,
    ...(paired ? { partnerId: 'longshot-larry', pairing } : {}),
  };
}

for (const chapter of [1, 3, 5]) {
  // A "competent for the tier" player: level par at Ch.1, sharpening as the campaign expects a grown bag.
  const standard = [0.25, 0.1, 0.1, 0, -0.1][chapter - 1]!;
  console.log(
    `\n── Chapter ${chapter} · player standard ${standard >= 0 ? '+' : ''}${standard.toFixed(2)}/hole` +
      ` · best-ball saves ${measureBestBallSaving(`qbm:${chapter}`, standard).toFixed(2)} ──`,
  );
  for (const format of QUALIFIER_FORMATS) {
    for (const pairing of isPairedFormat(format) ? (['scramble', 'bestball'] as const) : ([undefined] as const)) {
      let qualified = 0;
      for (let i = 0; i < ROUNDS; i++) {
        // A SCRAMBLE round is already the team's card by the time it reaches the resolver, so the synthetic
        // player round is credited the measured shared-ball saving before scoring — otherwise the −shift is
        // applied to a solo card and the format reads as brutal for a reason the engine never produces.
        const raw = playerRound(`qb:${chapter}:${i}`, pairing === 'scramble' ? standard - SCRAMBLE_SAVING / PARS.length : standard);
        const res = resolveQualifierRound(plan(format, pairing ?? 'bestball', chapter), raw, PARS, `qb:${i}`);
        if (res.qualified) qualified++;
      }
      const label = `${format}${pairing ? ` (${pairing})` : ''}`.padEnd(28);
      const rate = ((100 * qualified) / ROUNDS).toFixed(1).padStart(5);
      console.log(`  ${label} qualify ${rate}%`);
    }
  }
}

/**
 * Every lie the sim can leave a ball on has HONEST art (GS-restart-coverage).
 *
 * Play-test report, from the scramble ball-choice card: "it shows all hazards as fairway and then the
 * shot flies into a bunker". `restArtSVG` ended in `default: return fairwayScene()`, and ten real lies
 * had no case — `pot`, `deeprough`, `fescue`, `barranca`, `shiprough`, `breach`, plus the effect-patch
 * lies `scorch` / `junk` / `tar` / `acid`. All ten were illustrated as lush mown fairway.
 *
 * That is worst precisely on the scramble card, where the picture is how you choose which ball to play:
 * a pot-bunker ball drawn as fairway is a lie that costs a stroke. And pot bunkers are a SIGNATURE lie
 * on the links world (`potBunkers` 1.9), so it's the one a player meets most.
 *
 * Why it rotted silently: `FeatureKind` is `(string & {})` by design (content-as-data — a new lie is a
 * new row), so there is NO closed union for the compiler to check exhaustively. The only way to hold
 * this is a coverage test against the authoritative lie tables, which is what this is.
 */
import { describe, it, expect } from 'vitest';
import { restArtSVG } from '../src/render/restArt';
import { LIE_INFO } from '../src/sim/shot';
import { PATCH_SPECS } from '../src/sim/patches';
import { SCORCH_LIE } from '../src/sim/scorch';

/** Every lie a ball can come to REST on: the physics table, the effect patches, and the scorch crust. */
const ALL_REST_LIES: string[] = [
  ...Object.keys(LIE_INFO),
  ...Object.values(PATCH_SPECS).map((p) => p.lie as string),
  SCORCH_LIE,
].filter((l, i, a) => a.indexOf(l) === i);

const FAIRWAY = restArtSVG('fairway');

describe('rest art covers every lie', () => {
  it('the lie list is drawn from the real tables, not a hand-copy', () => {
    // Sanity: if these tables move or shrink, this test should notice rather than silently pass.
    expect(ALL_REST_LIES.length).toBeGreaterThanOrEqual(23);
    for (const key of ['fairway', 'pot', 'deeprough', 'fescue', 'barranca', 'shiprough', 'breach']) {
      expect(ALL_REST_LIES, `${key} missing from the lie tables`).toContain(key);
    }
  });

  it('NO lie other than fairway is illustrated as fairway', () => {
    const wrong = ALL_REST_LIES.filter((lie) => lie !== 'fairway' && restArtSVG(lie) === FAIRWAY);
    expect(
      wrong,
      `these lies fall through to fairwayScene() and misrepresent the shot the player is about to face: ${wrong.join(', ')}`,
    ).toEqual([]);
  });

  it('every lie renders a non-empty SVG', () => {
    for (const lie of ALL_REST_LIES) {
      const svg = restArtSVG(lie);
      expect(svg.startsWith('<svg'), `${lie} produced no svg`).toBe(true);
      expect(svg.length, `${lie} art is suspiciously small`).toBeGreaterThan(200);
    }
  });
});

describe('the distinctions that matter for the shot you face', () => {
  it('a POT bunker is drawn differently from a shallow raked bunker', () => {
    // Same sand family, completely different shot — a pot is a sideways hack-out. Drawing them alike
    // is the specific misinformation the play-test hit.
    expect(restArtSVG('pot')).not.toBe(restArtSVG('bunker'));
  });

  it('DEEP rough and fescue are drawn differently from ordinary rough', () => {
    expect(restArtSVG('deeprough')).not.toBe(restArtSVG('rough'));
    expect(restArtSVG('fescue')).not.toBe(restArtSVG('rough'));
  });

  it('deep rough and fescue share their art (same shot, one scene is honest)', () => {
    expect(restArtSVG('deeprough')).toBe(restArtSVG('fescue'));
  });

  it('a wrecked hull is not drawn as a beach', () => {
    expect(restArtSVG('shiprough')).not.toBe(restArtSVG('waste'));
    expect(restArtSVG('shiprough')).not.toBe(restArtSVG('bunker'));
  });

  it('a penalty still overrides the surface (the ball is gone, not sitting up)', () => {
    // The penalty branch runs BEFORE the lie switch, so a water ball reads as water however it rests.
    expect(restArtSVG('fairway', { penalty: 'water' })).toBe(restArtSVG('water'));
    expect(restArtSVG('fairway', { holed: true })).not.toBe(FAIRWAY);
  });
});

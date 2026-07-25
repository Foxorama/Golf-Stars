import { describe, it, expect } from 'vitest';
import {
  partnerTally,
  partnerStanding,
  betrayerId,
  betrayerOddness,
  betrayalEnticed,
  betrayalOverlooked,
  everyGolferHasBetrayalVoice,
  SIGIL_PARTNER_WEIGHT,
  QUALIFIER_PARTNER_WEIGHT,
} from '../src/sim/rpg/storyBetrayal';
import { recordQualifierPartner } from '../src/sim/rpg/storyQualifiers';
import { otherGolferIds } from '../src/sim/rpg/storyCast';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';

/**
 * GS-story-qualifier-formats — the PARTNER TALLY that decides who stands apart. Every tee you share counts:
 * the two team-Sigil picks double, each paired qualifying event once. The friend with the most daylight
 * above or below the rest is the odd one out, and WHICH side the daylight is on says why.
 *
 * The load-bearing property is backward compatibility: with no qualifiers played, the tally must reproduce
 * the original pick-only rule EXACTLY, so a v6 campaign's betrayal arc is unchanged.
 */

const P = 'feather-fade';
const base = (): StoryState => defaultStoryState(P);
const [A, B, C] = otherGolferIds(base()); // the three tour-mates, roster order

const withQualifiers = (s: StoryState, pairs: Record<string, string>): StoryState =>
  Object.entries(pairs).reduce((acc, [world, partner]) => recordQualifierPartner(acc, world, partner), s);

describe('the partner tally (GS-story-qualifier-formats)', () => {
  it('weights a Sigil pick double a drawn qualifier, and only counts real tour-mates', () => {
    expect(SIGIL_PARTNER_WEIGHT).toBe(2);
    expect(QUALIFIER_PARTNER_WEIGHT).toBe(1);
    const s = withQualifiers({ ...base(), sigil1Partner: A!, sigil2Partner: B! }, {
      'verdant2-18': A!,
      'desert-18': C!,
      'frost2-18': 'not-a-golfer', // ignored — never in the tally
    });
    const tally = Object.fromEntries(partnerTally(s).map((t) => [t.id, t.count]));
    expect(tally[A!]).toBe(3); // one Sigil (2) + one qualifier (1)
    expect(tally[B!]).toBe(2);
    expect(tally[C!]).toBe(1);
    // sorted most-partnered first
    expect(partnerTally(s).map((t) => t.id)).toEqual([A, B, C]);
  });

  it('one EVENT counts once however often you replay it (grinding a road can never skew the arc)', () => {
    let s = base();
    s = recordQualifierPartner(s, 'verdant2-18', A!);
    const once = partnerTally(s);
    s = recordQualifierPartner(s, 'verdant2-18', A!);
    expect(partnerTally(s)).toEqual(once);
  });
});

describe('who stands apart — and why', () => {
  it('reproduces the ORIGINAL pick rule exactly when no qualifier was ever paired (v6 arcs unchanged)', () => {
    // Two DIFFERENT partners → the friend you never picked, sidelined.
    const distinct = { ...base(), sigil1Partner: A!, sigil2Partner: B! };
    expect(betrayerId(distinct)).toBe(C);
    expect(betrayerOddness(distinct)).toBe('sidelined');
    expect(partnerStanding(distinct)!.lean).toBe('least');
    // The SAME partner twice → that trusted friend, tempted (the twist).
    const same = { ...base(), sigil1Partner: A!, sigil2Partner: A! };
    expect(betrayerId(same)).toBe(A);
    expect(betrayerOddness(same)).toBe('tempted');
    // Nothing on record at all → the deterministic first-tour-mate fallback, and no settled oddness.
    expect(betrayerId(base())).toBe(A);
    expect(betrayerOddness(base())).toBeUndefined();
    expect(partnerStanding(base())).toBeUndefined();
  });

  it('qualifier pairings MOVE the thread — the friend you keep drawing becomes the tempted one', () => {
    // Distinct Sigil picks would sideline C; drawing C into three events instead makes C the MOST partnered.
    const s = withQualifiers({ ...base(), sigil1Partner: A!, sigil2Partner: B! }, {
      'verdant2-18': C!,
      'desert-18': C!,
      'frost2-18': C!,
    });
    expect(partnerTally(s)[0]!.id).toBe(C);
    expect(betrayerId(s)).toBe(C);
    expect(betrayerOddness(s)).toBe('tempted'); // top gap (3 vs 2) beats bottom gap (2 vs 2 = 0)
  });

  it('…and can rescue the friend the Sigil picks would have benched', () => {
    // Same distinct picks, but you draw C twice: the tally levels at the bottom and A pulls clear at the top.
    const s = withQualifiers({ ...base(), sigil1Partner: A!, sigil2Partner: A! }, {
      'verdant2-18': B!,
      'desert-18': B!,
      'frost2-18': C!,
    });
    // A=4, B=2, C=1 → top gap 2, bottom gap 1 → still the trusted one, tempted
    expect(betrayerId(s)).toBe(A);
    // Draw C once more and the bottom levels out; the top gap still wins.
    const s2 = recordQualifierPartner(s, 'inferno2-18', C!); // A=4, B=2, C=2
    expect(betrayerId(s2)).toBe(A);
    expect(betrayerOddness(s2)).toBe('tempted');
  });

  it('a tie between the two gaps resolves to SIDELINED — being left out is the plainer slight', () => {
    // A=3, B=2, C=1 → top gap 1 == bottom gap 1 → the least-partnered friend stands apart.
    const s = withQualifiers({ ...base(), sigil1Partner: A!, sigil2Partner: B! }, {
      'verdant2-18': A!,
      'desert-18': C!,
    });
    const standing = partnerStanding(s)!;
    expect(standing.id).toBe(C);
    expect(standing.lean).toBe('least');
    expect(betrayerOddness(s)).toBe('sidelined');
  });

  it('the ODDNESS stays unsettled until both team Sigils are locked (the Ch.3 omen gate is unchanged)', () => {
    const oneSigil = withQualifiers({ ...base(), sigil1Partner: A! }, { 'verdant2-18': B! });
    expect(betrayerOddness(oneSigil)).toBeUndefined();
    // …but the LIVE standing exists from the first tee shared — that's what the Ch.1–3 thread speaks to.
    expect(partnerStanding(oneSigil)).toBeTruthy();
  });

  it('betrayerId and betrayerOddness always agree (one seam, never two verdicts)', () => {
    const cases: StoryState[] = [
      { ...base(), sigil1Partner: A!, sigil2Partner: B! },
      { ...base(), sigil1Partner: A!, sigil2Partner: A! },
      withQualifiers({ ...base(), sigil1Partner: A!, sigil2Partner: B! }, { 'verdant2-18': C!, 'desert-18': C! }),
      withQualifiers({ ...base(), sigil1Partner: B!, sigil2Partner: C! }, { 'verdant2-18': A! }),
    ];
    for (const s of cases) {
      const standing = partnerStanding(s)!;
      expect(betrayerId(s)).toBe(standing.id);
      expect(betrayerOddness(s)).toBe(standing.lean === 'most' ? 'tempted' : 'sidelined');
    }
  });
});

describe('the Chapter 1–3 partner VOICE', () => {
  it('every golfer has both flavours at both stages, and the scenes are all distinct', () => {
    expect(everyGolferHasBetrayalVoice()).toBe(true);
    const seen = new Set<string>();
    for (const c of CHARACTERS) {
      for (const stage of [0, 1] as const) {
        for (const lines of [betrayalEnticed(c.id, stage), betrayalOverlooked(c.id, stage)]) {
          expect(lines.length, `${c.id} stage ${stage}`).toBeGreaterThanOrEqual(3);
          const key = JSON.stringify(lines);
          expect(seen.has(key), `${c.id} stage ${stage} duplicates another scene`).toBe(false);
          seen.add(key);
          // Every line is a real scene beat, spoken or staged.
          for (const l of lines) {
            expect(['say', 'action']).toContain(l.kind);
            expect(l.text.length).toBeGreaterThan(30);
          }
        }
      }
    }
  });

  it('each thread names that golfer’s OWN Coil relationship, so it runs into their defection unbroken', () => {
    // Huang-Woo's thread is the VIPER (the roar when his gallery goes quiet); the other three are the
    // APOSTATE (the windless line / the void-tide / the still green). The stage-1 scenes are where the
    // Coil figure actually walks on, so that is where the name must appear.
    const coil = (id: string): string =>
      [...betrayalEnticed(id, 1), ...betrayalOverlooked(id, 1)].map((l) => l.text).join(' ');
    expect(coil('huang-woo-hook')).toMatch(/Viper|Venoma|She /);
    for (const id of ['feather-fade', 'longshot-larry', 'backspin-bo']) {
      expect(coil(id), id).toMatch(/Apostate|Voss|shed-scale/);
    }
  });

  it('the ENTICED thread is about being singled out; the OVERLOOKED one about being left behind', () => {
    for (const c of CHARACTERS) {
      const enticed = betrayalEnticed(c.id, 0).map((l) => l.text).join(' ');
      const overlooked = betrayalOverlooked(c.id, 0).map((l) => l.text).join(' ');
      expect(enticed, `${c.id} enticed`).toMatch(/watch|notice|seen|read|watched/i);
      expect(overlooked, `${c.id} overlooked`).toMatch(/pairing|sheet|ropes|picked|asked|card/i);
    }
  });
});

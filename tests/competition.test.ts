import { describe, it, expect } from 'vitest';
import {
  PLAYER_ID,
  FIELD_SIZE,
  buildField,
  ghostHoleStableford,
  ghostScores,
  arcStandings,
  applyCut,
  survivorCount,
  bossPick,
  bossGolfer,
  golferBaseline,
  golferForm,
  homeMatches,
  type HoleContext,
  type Field,
} from '../src/sim/rpg/competition';
import { championFor, golferProfile } from '../src/sim/rpg/golfers';

const LOOK = { cap: '#ffffff', shirt: '#000000', skin: '#caa182', build: 1 };
const player = { name: 'You', look: LOOK, characterId: 'feather-fade' };

function makeField(seed = 7, arcIndex = 0): Field {
  return buildField(seed, arcIndex, 1, player);
}

describe('buildField', () => {
  it('is a 20-strong field including the player', () => {
    const f = makeField();
    expect(f.golfers.length).toBe(FIELD_SIZE);
    const players = f.golfers.filter((g) => g.isPlayer);
    expect(players.length).toBe(1);
    expect(players[0]!.id).toBe(PLAYER_ID);
  });

  it('is deterministic for the same seed/arc', () => {
    expect(makeField(7, 0)).toEqual(makeField(7, 0));
  });

  it('varies across arcs / seeds', () => {
    const ids = (f: Field) => f.golfers.map((g) => g.id).join(',');
    expect(ids(makeField(7, 0))).not.toBe(ids(makeField(7, 1)));
    expect(ids(makeField(7, 0))).not.toBe(ids(makeField(9, 0)));
  });

  it('includes unchosen playable characters but NOT the chosen one', () => {
    const f = makeField();
    const mirrors = f.golfers.filter((g) => g.mirrorsCharacter).map((g) => g.mirrorsCharacter);
    expect(mirrors).not.toContain('feather-fade'); // the chosen one
    expect(mirrors.length).toBeGreaterThan(0); // the others are in
  });

  it('never re-admits the chosen character as a rival via the fill pass (any seed/arc/character)', () => {
    // The chosen character is the player ("You"); their mirror must never ALSO appear under its own
    // name — otherwise the leaderboard shows the picked golfer twice.
    for (const characterId of ['feather-fade', 'huang-woo-hook', 'longshot-larry', 'backspin-bo']) {
      for (let seed = 0; seed < 40; seed++) {
        for (const arc of [1, 2, 3] as const) {
          const f = buildField(seed, 0, arc, { ...player, characterId });
          const mirrors = f.golfers.filter((g) => g.mirrorsCharacter).map((g) => g.mirrorsCharacter);
          expect(mirrors, `seed ${seed} arc ${arc} char ${characterId}`).not.toContain(characterId);
        }
      }
    }
  });

  it('seeds champions into the field', () => {
    const f = makeField();
    expect(f.golfers.some((g) => g.tier === 'champion')).toBe(true);
  });

  it('has no duplicate golfers', () => {
    const ids = makeField().golfers.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ghostHoleStableford', () => {
  const keys = Array.from({ length: 200 }, (_, i) => `hole:${i}`);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

  it('is deterministic and in [0,5]', () => {
    const a = ghostHoleStableford('field:marco-vance', 'hole:1', false, 0);
    const b = ghostHoleStableford('field:marco-vance', 'hole:1', false, 0);
    expect(a).toBe(b);
    for (const k of keys.slice(0, 50)) {
      const v = ghostHoleStableford('champ:crux', k, false, 0);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('stronger golfers score higher on average', () => {
    const champ = mean(keys.map((k) => ghostHoleStableford('champ:scorpius', k, false, 0)));
    const fieldG = mean(keys.map((k) => ghostHoleStableford('field:marco-vance', k, false, 0)));
    expect(champ).toBeGreaterThan(fieldG);
  });

  it('the home boost lifts a golfer in their own zone', () => {
    const away = mean(keys.map((k) => ghostHoleStableford('champ:scorpius', k, false, 0)));
    const home = mean(keys.map((k) => ghostHoleStableford('champ:scorpius', k, true, 0)));
    expect(home).toBeGreaterThan(away);
  });

  it('pressure rewards clutch and punishes chokers', () => {
    // Iceman archetype champions have high nerve; streaky ones low.
    const clutchId = 'champ:leo'; // iceman
    const chokeId = 'champ:canis-minor'; // streaky
    expect(golferProfile(clutchId).nerve).toBeGreaterThan(golferProfile(chokeId).nerve);
    const clutchCalm = mean(keys.map((k) => ghostHoleStableford(clutchId, k, false, 0)));
    const clutchHeat = mean(keys.map((k) => ghostHoleStableford(clutchId, k, false, 1)));
    const chokeCalm = mean(keys.map((k) => ghostHoleStableford(chokeId, k, false, 0)));
    const chokeHeat = mean(keys.map((k) => ghostHoleStableford(chokeId, k, false, 1)));
    expect(clutchHeat).toBeGreaterThan(clutchCalm);
    expect(chokeHeat).toBeLessThan(chokeCalm);
  });

  it('golferBaseline spans a sensible band', () => {
    expect(golferBaseline(0)).toBeCloseTo(0.6);
    expect(golferBaseline(1)).toBeCloseTo(2.6);
    expect(golferBaseline(0.5)).toBeCloseTo(1.6);
  });
});

describe('golferForm (streaks, GS-streaks)', () => {
  const keys = Array.from({ length: 300 }, (_, i) => `stop:${i}`);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = (xs: number[]) => {
    const m = mean(xs);
    return mean(xs.map((x) => (x - m) ** 2));
  };

  it('is deterministic', () => {
    expect(golferForm('champ:crux', 'stop:3')).toBe(golferForm('champ:crux', 'stop:3'));
  });

  it('has mean ~0 (a streak reorders the board, it does not shift the scoring level)', () => {
    expect(Math.abs(mean(keys.map((k) => golferForm('field:marco-vance', k))))).toBeLessThan(0.15);
  });

  it('streaky golfers swing more than metronomes', () => {
    const streaky = variance(keys.map((k) => golferForm('champ:canis-minor', k))); // streaky archetype
    const steady = variance(keys.map((k) => golferForm('champ:cygnus', k))); // metronome archetype
    expect(streaky).toBeGreaterThan(steady);
  });

  it('changes the per-stop field leader from stop to stop (lead changes)', () => {
    const f = buildField(11, 0, 2, player);
    const leaders = new Set<string>();
    for (let stop = 0; stop < 10; stop++) {
      let best = '';
      let bestSf = -Infinity;
      for (const g of f.golfers) {
        if (g.isPlayer) continue;
        const form = golferForm(g.id, `r:form:${stop}`);
        let sf = 0;
        for (let i = 0; i < 9; i++) sf += ghostHoleStableford(g.id, `r:gl:${stop}:${i}`, false, 0, form);
        if (sf > bestSf) {
          bestSf = sf;
          best = g.id;
        }
      }
      leaders.add(best);
    }
    expect(leaders.size).toBeGreaterThan(1); // not the same golfer topping every single stop
  });
});

describe('ghostScores + standings', () => {
  function arcHoles(themeId: string, archetype: any, n = 18): HoleContext[] {
    return Array.from({ length: n }, (_, i) => ({ key: `s:${i}`, themeId, archetype }));
  }

  it('produces per-hole arrays for every non-player golfer', () => {
    const f = makeField();
    const holes = arcHoles('crux', 'verdant', 9);
    const scores = ghostScores(f, holes);
    expect(scores.has(PLAYER_ID)).toBe(false);
    for (const g of f.golfers) {
      if (g.isPlayer) continue;
      expect(scores.get(g.id)!.length).toBe(9);
    }
  });

  it('standings sort by total desc with positions and include the player', () => {
    const f = makeField();
    const holes = arcHoles('crux', 'verdant', 9);
    const scores = ghostScores(f, holes);
    scores.set(PLAYER_ID, holes.map(() => 2)); // a steady par run for the player
    const table = arcStandings(f, scores, 9);
    expect(table.length).toBe(FIELD_SIZE);
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1]!.total).toBeGreaterThanOrEqual(table[i]!.total);
    }
    expect(table.map((r) => r.position)).toEqual(table.map((_, i) => i + 1));
    expect(table.some((r) => r.isPlayer)).toBe(true);
    for (const r of table) expect(r.stopScore).toBeDefined();
  });

  it('a constellation champion generally tops the field in its own zone', () => {
    // Build a field guaranteed to contain the Scorpius champion, play a full arc in Scorpius.
    const f = buildField(3, 0, 3, player); // arc 3 has scorpius
    const scorp = championFor('scorpius')!;
    // Ensure present (arc-3 champion sample is large; if absent, inject for the test).
    if (!f.golfers.some((g) => g.id === scorp.id)) {
      f.golfers[f.golfers.length - 1] = {
        id: scorp.id,
        name: scorp.name,
        shortName: scorp.shortName,
        tier: scorp.tier,
        look: scorp.look,
        isPlayer: false,
        home: scorp.home,
        homeArchetype: scorp.homeArchetype,
      };
    }
    const holes = arcHoles('scorpius', 'inferno', 18);
    const scores = ghostScores(f, holes);
    scores.set(PLAYER_ID, holes.map(() => 1)); // a weak player so the AI race is clean
    const table = arcStandings(f, scores, 18);
    const aiTop = table.filter((r) => !r.isPlayer)[0]!;
    // The home champion should be at or very near the top of the AI field.
    const scorpRank = table.filter((r) => !r.isPlayer).findIndex((r) => r.golferId === scorp.id);
    expect(scorpRank).toBeLessThanOrEqual(2); // top 3 of the AI field
    expect(aiTop.tier === 'champion' || aiTop.tier === 'star').toBe(true);
  });
});

describe('cut + boss pick', () => {
  it('a higher cut sweeps more of the field', () => {
    const f = makeField();
    const holes: HoleContext[] = Array.from({ length: 6 }, (_, i) => ({ key: `c:${i}`, archetype: 'verdant' }));
    const scores = ghostScores(f, holes);
    scores.set(PLAYER_ID, holes.map(() => 2));
    const table = arcStandings(f, scores, 6);
    const lo = survivorCount(applyCut(table, 4));
    const hi = survivorCount(applyCut(table, 12));
    expect(hi).toBeLessThan(lo);
  });

  it('boss is the top non-player (i.e. #2 when the player is #1)', () => {
    const f = makeField();
    const holes: HoleContext[] = Array.from({ length: 9 }, (_, i) => ({ key: `b:${i}`, archetype: 'verdant' }));
    const scores = ghostScores(f, holes);
    // Player runs away with it → player is #1, boss must be the best AI (#2 overall).
    scores.set(PLAYER_ID, holes.map(() => 5));
    const table = arcStandings(f, scores, 9);
    expect(table[0]!.isPlayer).toBe(true);
    const boss = bossPick(table);
    expect(boss).toBe(table[1]!.golferId);
    expect(table[1]!.isPlayer).toBe(false);
    expect(bossGolfer(table)?.id).toBe(boss);
  });

  it('boss is #1 when the player is mid-pack', () => {
    const f = makeField();
    const holes: HoleContext[] = Array.from({ length: 9 }, (_, i) => ({ key: `m:${i}`, archetype: 'verdant' }));
    const scores = ghostScores(f, holes);
    scores.set(PLAYER_ID, holes.map(() => 1)); // weak player
    const table = arcStandings(f, scores, 9);
    expect(table[0]!.isPlayer).toBe(false);
    expect(bossPick(table)).toBe(table[0]!.golferId);
  });
});

describe('homeMatches', () => {
  it('matches by exact theme and by archetype', () => {
    const f = buildField(1, 0, 3, player);
    const champ = championFor('scorpius')!;
    const fg = { ...champ, isPlayer: false } as any;
    expect(homeMatches(fg, 'scorpius', 'inferno')).toBe(true); // exact theme
    expect(homeMatches(fg, 'orion', 'inferno')).toBe(true); // same archetype
    expect(homeMatches(fg, 'crux', 'verdant')).toBe(false); // different world
    void f;
  });
});

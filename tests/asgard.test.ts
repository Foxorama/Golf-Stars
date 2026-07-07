import { describe, it, expect } from 'vitest';
import { initState, reduce, asgardPortalOpens, type UiState } from '../src/ui/game';
import { startRun, startAsgardRun, snapshotRun, baseLoadoutForRun, currentCourse, shopOffer } from '../src/sim/rpg/run';
import { loadoutFromPerks } from '../src/sim/rpg/economy';
import { warriorsThreeTotals } from '../src/sim/rpg/competition';
import { WARRIORS_THREE } from '../src/sim/rpg/golfers';
import { ASGARD_THEME } from '../src/sim/course/themes';
import { shotView, awaitingPutt } from '../src/sim/rpg/play';
import type { PlayedHole } from '../src/sim/round';

/** A run carrying the Rainbow Ball (rainbowRoad armed). */
function rainbowRun(seed: number | string = 'rb') {
  const base = startRun(seed, 'unending', {}, 'feather-fade');
  return { ...base, loadout: loadoutFromPerks(['rainbow-ball'], baseLoadoutForRun(base)) };
}

/** A fake holed hole at a given score-to-par. */
function hole(strokes: number, par: number): PlayedHole {
  return { holed: true, record: { par, strokes } } as unknown as PlayedHole;
}

describe('GS-asgard: the Bifröst tournament', () => {
  it('the eagle-on-Rainbow-Road trigger only fires with the ball armed, on an eagle-or-better', () => {
    const armed = rainbowRun();
    expect(armed.loadout.rainbowRoad).toBe(true);
    // An eagle (−2) opens the portal; a birdie (−1) does not.
    expect(asgardPortalOpens(armed, [hole(3, 5), hole(4, 4)])).toBe(true); // eagle on the par 5
    expect(asgardPortalOpens(armed, [hole(4, 5), hole(3, 4)])).toBe(false); // two birdies, no eagle
    expect(asgardPortalOpens(armed, [hole(1, 3)])).toBe(true); // a hole-in-one
    // Without the Rainbow Ball, an eagle changes nothing.
    const plain = startRun('x', 'unending', {}, 'feather-fade');
    expect(asgardPortalOpens(plain, [hole(3, 5)])).toBe(false);
    // The Asgard run itself never re-triggers.
    expect(asgardPortalOpens(startAsgardRun(armed), [hole(3, 5)])).toBe(false);
  });

  it('startAsgardRun spins off a 9-hole Asgard run without the Rainbow Ball', () => {
    const src = rainbowRun('seed-1');
    const run = startAsgardRun(src);
    expect(run.formatId).toBe('asgard');
    expect(run.loadout.rainbowRoad).toBeFalsy(); // rainbow stripped → plays Asgard's real geometry
    expect(run.loadout.perks).not.toContain('rainbow-ball');
    expect(run.pendingTheme?.id).toBe(ASGARD_THEME.id);
    const course = currentCourse(run);
    expect(course.holes.length).toBe(9);
    expect(course.biome).toBe('asgard-realm');
  });

  it('warriorsThreeTotals is deterministic and names the three warriors', () => {
    const pars = [4, 3, 5, 4, 4, 3, 5, 4, 4];
    const a = warriorsThreeTotals('t', pars);
    const b = warriorsThreeTotals('t', pars);
    expect(a).toEqual(b);
    expect(a.map((x) => x.id)).toEqual(WARRIORS_THREE.map((w) => w.id));
    for (const w of a) {
      expect(w.total).toBeGreaterThan(pars.length); // nobody shoots impossibly low
      expect(w.total).toBeLessThan(pars.reduce((s, p) => s + p, 0) + pars.length * 4);
    }
  });

  it('playing the tournament to the end lands on the result screen with a verdict', () => {
    let s: UiState = initState('asg-e2e', {}, undefined);
    const src = rainbowRun('asg-e2e');
    const run = startAsgardRun(src);
    s = { ...s, run, course: currentCourse(run), screen: 'intro' };
    // Drive all nine holes interactively (attacking every shot), reusing the ui.test pattern.
    s = reduce(s, { type: 'playInteractive' });
    let guard = 0;
    while (s.screen === 'playing' && guard++ < 900) {
      if (s.play && s.play.done) s = reduce(s, { type: 'holeComplete' });
      else if (s.play && awaitingPutt(s.play)) s = reduce(s, { type: 'putt' });
      else if (s.play) {
        const v = shotView(s.play, s.run.loadout);
        s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
      } else break;
    }
    expect(s.screen).toBe('asgardResult');
    expect(s.asgardOutcome).toBeDefined();
    expect(s.asgardOutcome!.field.length).toBe(3);
    expect(typeof s.asgardOutcome!.won).toBe('boolean');
  });

  it('crossBifrost enters the tournament; leaveAsgard resumes the suspended run with the right rewards', () => {
    const src = rainbowRun('return-run');
    let s: UiState = initState('return-run', {}, undefined);
    // Simulate the divert: park the suspended run and open the map.
    s = { ...s, run: src, screen: 'asgardMap', asgardReturn: snapshotRun(src) };
    s = reduce(s, { type: 'crossBifrost' });
    expect(s.screen).toBe('playing');
    expect(s.run.formatId).toBe('asgard');
    expect(s.run.loadout.rainbowRoad).toBeFalsy();

    // A WIN: Thor's Hammer is banked at resolve; leaveAsgard grants Odin's Favour + strips the ball.
    const wonState: UiState = {
      ...s,
      screen: 'asgardResult',
      asgardReturn: snapshotRun(src),
      asgardOutcome: { won: true, playerTotal: 30, par: 36, field: [] },
      ownedApparel: ['thors-hammer'],
    };
    const afterWin = reduce(wonState, { type: 'leaveAsgard' });
    expect(afterWin.screen).toBe('travel');
    expect(afterWin.asgardBanner).toBe('won');
    expect(afterWin.run.rainbowConsumed).toBe(true);
    expect(afterWin.run.loadout.rainbowRoad).toBeFalsy();
    expect(afterWin.run.loadout.perks).toContain('talent-odins-favour');
    expect(afterWin.run.loadout.perks).not.toContain('rainbow-ball');
    expect(afterWin.ownedApparel).toContain('thors-hammer');
    // The spent Rainbow Ball is never re-offered.
    expect(shopOffer(afterWin.run).some((o) => o.item.id === 'rainbow-ball')).toBe(false);

    // A LOSS: no Odin's Favour, no hammer, but the ball is still spent.
    const lostState: UiState = {
      ...s,
      screen: 'asgardResult',
      asgardReturn: snapshotRun(src),
      asgardOutcome: { won: false, playerTotal: 40, par: 36, field: [] },
      ownedApparel: [],
    };
    const afterLoss = reduce(lostState, { type: 'leaveAsgard' });
    expect(afterLoss.screen).toBe('travel');
    expect(afterLoss.asgardBanner).toBe('lost');
    expect(afterLoss.run.rainbowConsumed).toBe(true);
    expect(afterLoss.run.loadout.perks).not.toContain('talent-odins-favour');
    expect(afterLoss.run.loadout.perks).not.toContain('rainbow-ball');
    expect(afterLoss.ownedApparel).not.toContain('thors-hammer');
  });
});

import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import {
  manualPutt,
  puttBreakYd,
  idealPuttAim,
  MANUAL_IDEAL_PACE,
  type PuttControl,
} from '../src/sim/round';
import type { Vec } from '../src/sim/course/contract';

const from: Vec = [0, 0];
const pin: Vec = [0, 8]; // an 8-yd putt straight up
const sidehill: Vec = [0.6, 0]; // a full SIDEHILL slope (perpendicular to the line → max break)

function makeRate(control: PuttControl, slope?: Vec): number {
  let made = 0;
  const n = 400;
  for (let s = 0; s < n; s++) {
    const r = manualPutt(new Rng(`p:${s}`), from, pin, control, {}, slope);
    if (r.holed) made++;
  }
  return made / n;
}

describe('putt break (GS-greens-3)', () => {
  it('break is zero on a flat green and signed by the slope side', () => {
    expect(puttBreakYd(from, pin, undefined, MANUAL_IDEAL_PACE)).toBe(0);
    const brk = puttBreakYd(from, pin, sidehill, MANUAL_IDEAL_PACE);
    expect(Math.abs(brk)).toBeGreaterThan(1.2); // a real, must-read break on an 8-yd sidehiller
    // The ideal aim cancels the break (aim opposite, equal magnitude).
    expect(idealPuttAim(from, pin, sidehill)).toBeCloseTo(-brk, 6);
  });

  it('a flat green: aiming straight at the cup at ideal pace drops it (back-compat)', () => {
    expect(makeRate({ pace: MANUAL_IDEAL_PACE, aim: 0 }, undefined)).toBeGreaterThan(0.6);
    // No-aim, no-slope is byte-for-byte the old straight putt: an explicit aim:0 / slope undefined.
  });

  it('on a sidehill green you MUST read the break — straight misses, the read holes', () => {
    const straight = makeRate({ pace: MANUAL_IDEAL_PACE, aim: 0 }, sidehill);
    const read = makeRate({ pace: MANUAL_IDEAL_PACE, aim: idealPuttAim(from, pin, sidehill) }, sidehill);
    expect(straight).toBeLessThan(0.2); // ignoring the break, the putt curls out
    expect(read).toBeGreaterThan(0.6); // aim high to cancel it and it curls in
    expect(read).toBeGreaterThan(straight * 3);
  });

  it('a firm putt holds its line more than a soft one (pace affects break)', () => {
    const soft = Math.abs(puttBreakYd(from, pin, sidehill, 0.7));
    const firm = Math.abs(puttBreakYd(from, pin, sidehill, 1.5));
    expect(soft).toBeGreaterThan(firm);
  });

  it('manualPutt is deterministic for a given seed + control', () => {
    const a = manualPutt(new Rng('det'), from, pin, { pace: 1.0, aim: 0.5 }, {}, sidehill);
    const b = manualPutt(new Rng('det'), from, pin, { pace: 1.0, aim: 0.5 }, {}, sidehill);
    expect(a).toEqual(b);
  });
});

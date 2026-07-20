import { describe, it, expect } from 'vitest';
import {
  backspinRoll,
  rollFractionFor,
  hasBackspin,
  rollOut,
  shotSpread,
  type ShotSpread,
} from '../src/sim/round';
import { lieAt } from '../src/sim/shot';
import { beginHole, previewShot, previewBackspin } from '../src/sim/rpg/play';
import {
  startingLoadout,
  loadoutFromPerks,
  spinReadOf,
  DEFAULT_SPIN_READ,
} from '../src/sim/rpg/economy';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { renderHoleSVG, renderShotOverlaySVG, SHOT_OVERLAY_ID } from '../src/render/holeView';
import type { Vec } from '../src/sim/course/contract';

const hole = generateCourse(1234).holes[0]!;
const lob = CLUBS.find((c) => c.id === '60')!; // 56-yd wedge — a genuine backspin check
const driver = CLUBS.find((c) => c.id === 'D')!;

/** The bearing→direction the sim/backspinRoll share ([sin, cos]), for independent re-derivation. */
function dirOf(s: ShotSpread): Vec {
  const br = (s.bearing * Math.PI) / 180;
  return [Math.sin(br), Math.cos(br)];
}

describe('spinReadOf — the backspin-line gear axis (GS-backspin-line)', () => {
  it('a base loadout still gets the short always-on guide reach', () => {
    const r = spinReadOf(startingLoadout());
    expect(r.readYd).toBe(DEFAULT_SPIN_READ);
    expect(r.full).toBe(false);
  });

  it('Spin Guide Card stretches the confident read; Trajectory Computer reads it all', () => {
    const guide = spinReadOf(loadoutFromPerks(['spin-guide']));
    expect(guide.readYd).toBe(DEFAULT_SPIN_READ + 4);
    expect(guide.full).toBe(false);

    const computer = spinReadOf(loadoutFromPerks(['spin-computer']));
    expect(computer.full).toBe(true);
  });

  it('the two items round-trip their perk ids into their loadout fields (no save bump)', () => {
    const base = startingLoadout();
    expect(base.spinReadBonus).toBeUndefined();
    expect(base.spinReadFull).toBeUndefined();

    const guide = loadoutFromPerks(['spin-guide']);
    expect(guide.spinReadBonus).toBe(4);
    expect(guide.backspinBoost).toBeCloseTo(0.04, 6); // a genuine short-game sweetener for the auto sim

    const computer = loadoutFromPerks(['spin-computer']);
    expect(computer.spinReadFull).toBe(true);
    expect(computer.backspinBoost).toBeCloseTo(0.05, 6);
  });
});

describe('backspinRoll — the predicted roll/check (GS-backspin-line)', () => {
  const spray = shotSpread(hole, hole.tee, 'tee', hole.green, lob, { power: 1 });

  it('is null for a non-backspin club that lands OFF the green (driver flies into the rough) — no line', () => {
    const big = shotSpread(hole, hole.tee, 'tee', hole.green, driver, { power: 1 });
    expect(hasBackspin(big.nominalCarry)).toBe(false);
    expect(backspinRoll(hole, big)).toBeNull(); // the driver flies well past this par-3 green into the rough
  });

  it('a forward-rolling iron LANDING on the green draws its RUN-OUT line (GS-runout-line)', () => {
    // The "ball goes long of the arc" fix: a mid-iron releases forward, so when the carry lands ON the
    // green the graphic now shows the run-out past the touchdown instead of nothing.
    const iron = CLUBS.find((c) => c.id === '7i')!;
    const s7 = shotSpread(hole, hole.tee, 'tee', hole.green, iron, { power: 1 });
    expect(hasBackspin(s7.nominalCarry)).toBe(false); // a forward-rolling club
    const roll = backspinRoll(hole, s7);
    expect(roll).not.toBeNull(); // it lands on the green here → the run-out IS drawn
    expect(roll!.rollYd).toBeGreaterThan(0); // and it runs FORWARD past the carry landing
  });

  it('a lofted wedge with a backspin build checks BACK (rollYd < 0); a plain one does not (GS-backspin-optin)', () => {
    expect(hasBackspin(spray.nominalCarry)).toBe(true); // a wedge-loft club
    // Baseline no longer spins back — it checks to a soft stop (fraction ≥ 0), so a plain wedge draws no
    // off-green check line at all; only a spin BUILD (backspinBoost / Bo) pulls it back.
    expect(rollFractionFor(spray.flight, spray.nominalCarry)).toBeGreaterThanOrEqual(0);
    expect(backspinRoll(hole, spray)).toBeNull(); // plain wedge off the green: no check
    const roll = backspinRoll(hole, spray, { backspinBoost: 0.15 }); // a spin build supplies the check
    expect(roll).not.toBeNull();
    expect(roll!.rollYd).toBeLessThan(0);
    expect(roll!.path.length).toBeGreaterThanOrEqual(2);
  });

  it('the landing anchors the path at origin + dir·expectedCarry', () => {
    const roll = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    const dir = dirOf(spray);
    const expLand: Vec = [
      spray.origin[0] + dir[0] * spray.expectedCarry,
      spray.origin[1] + dir[1] * spray.expectedCarry,
    ];
    expect(roll.landing[0]).toBeCloseTo(expLand[0], 4);
    expect(roll.landing[1]).toBeCloseTo(expLand[1], 4);
    expect(roll.path[0]![0]).toBeCloseTo(roll.landing[0], 4);
    expect(roll.path[0]![1]).toBeCloseTo(roll.landing[1], 4);
  });

  it('the graphic IS the physics — the line is the SAME rollOut the sim resolves (contract 5)', () => {
    const dir = dirOf(spray);
    const landing: Vec = [
      spray.origin[0] + dir[0] * spray.expectedCarry,
      spray.origin[1] + dir[1] * spray.expectedCarry,
    ];
    const K = spray.expectedCarry * (rollFractionFor(spray.flight, spray.nominalCarry) - 0.15); // mean energy, no rng
    const truth = rollOut(hole, landing, dir, K, lieAt(hole, landing));
    const roll = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    expect(roll.rollYd).toBeCloseTo(truth.roll, 6);
    const truthPath = truth.path ?? [landing, truth.rest];
    expect(roll.path.length).toBe(truthPath.length);
    expect(roll.path[roll.path.length - 1]![0]).toBeCloseTo(truth.rest[0], 6);
    expect(roll.path[roll.path.length - 1]![1]).toBeCloseTo(truth.rest[1], 6);
  });

  it('is deterministic — zero rng, identical every call', () => {
    const a = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    const b = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    expect(a.rollYd).toBe(b.rollYd);
    expect(a.path).toEqual(b.path);
  });

  it('more backspinBoost checks it DEEPER (the spin gear does what it says)', () => {
    const plain = backspinRoll(hole, spray, { backspinBoost: 0.05 })!;
    const spun = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    expect(spun.rollYd).toBeLessThan(plain.rollYd); // more negative = more check back
  });
});

describe('previewBackspin — the read fraction from gear (GS-backspin-line)', () => {
  const play = beginHole(hole);
  const decision = { clubId: '60', aim: 'attack' as const, power: 1 };
  const spray = previewShot(play, decision, startingLoadout());
  // A spin BUILD (backspin gear) is what draws a real check now — the base read reach still gates how
  // much of it is confident. A base loadout with backspin gear but no read upgrade reads only a prefix.
  const spinLo = { ...startingLoadout(), backspinBoost: 0.15 };

  it('a base read shows only a short prefix of a long check (< full)', () => {
    const roll = backspinRoll(hole, spray, { backspinBoost: 0.15 })!;
    // Choose a shot whose |roll| exceeds the base reach so the read is genuinely partial.
    expect(Math.abs(roll.rollYd)).toBeGreaterThan(DEFAULT_SPIN_READ);
    const p = previewBackspin(play, spray, spinLo)!;
    expect(p.readFrac).toBeLessThan(1);
    expect(p.readFrac).toBeGreaterThan(0);
  });

  it('the Trajectory Computer reads the whole roll (frac = 1)', () => {
    const p = previewBackspin(play, spray, loadoutFromPerks(['spin-computer']));
    expect(p).not.toBeNull();
    expect(p!.readFrac).toBe(1);
  });

  it('is null for a driver (non-backspin club) — flies off the green, no line', () => {
    const dSpray = previewShot(play, { clubId: 'D', aim: 'attack', power: 1 }, startingLoadout());
    expect(previewBackspin(play, dSpray, startingLoadout())).toBeNull();
  });

  it('a forward RUN-OUT onto the green is shown in FULL even with base gear (GS-runout-line)', () => {
    // A run-out is fundamental "here's where it settles" info — not a premium read — so a base loadout
    // still traces the whole forward roll (readFrac 1), unlike a wedge's gear-gated backspin curl.
    const s7 = previewShot(play, { clubId: '7i', aim: 'attack', power: 1 }, startingLoadout());
    const p = previewBackspin(play, s7, startingLoadout());
    expect(p).not.toBeNull();
    expect(p!.readFrac).toBe(1);
  });
});

describe('spin overlay render (GS-backspin-line)', () => {
  // A wedge approach LANDING near the green (fly past, spin back) so the check is big enough that a
  // base read is genuinely PARTIAL — the terminus-dot branch actually fires.
  const G = hole.green;
  const teeToG: Vec = [G[0] - hole.tee[0], G[1] - hole.tee[1]];
  const L = Math.hypot(teeToG[0], teeToG[1]) || 1;
  const u: Vec = [teeToG[0] / L, teeToG[1] / L];
  const play = { ...beginHole(hole), ball: [G[0] - u[0] * 40, G[1] - u[1] * 40] as Vec, lie: 'fairway' as const };
  // A strong backspin build so the check is big enough that a base read is genuinely PARTIAL (the
  // terminus-dot branch fires). Backspin is opt-in now — a plain wedge here would draw no check line.
  const spinLo = { ...startingLoadout(), backspinBoost: 0.2 };
  const spray = previewShot(play, { clubId: '64', aim: 'attack', power: 1 }, spinLo);
  const preview = previewBackspin(play, spray, spinLo)!;
  const opts = {
    focus: play.ball,
    viewRadius: 34,
    spray,
    spinPath: preview.path,
    spinReadFrac: preview.readFrac,
  };

  it('a base read of a big spinning check is partial (terminus before the settle point)', () => {
    expect(preview.readFrac).toBeLessThan(1);
  });

  it('draws the cyan check line with a filled terminus dot inside the shot-overlay group', () => {
    const svg = renderShotOverlaySVG(hole, opts);
    expect(svg).toContain(`id="${SHOT_OVERLAY_ID}"`);
    expect(svg).toContain('#7fe0ff'); // the distinct spin-line ink
    expect(svg).toContain('fill="#7fe0ff"'); // the terminus dot (partial read)
  });

  it('a full read (Trajectory Computer) draws an open settle ring, no terminus dot', () => {
    const fullLo = { ...startingLoadout(), backspinBoost: 0.2, spinReadFull: true };
    const full = previewBackspin(play, spray, fullLo)!;
    const svg = renderShotOverlaySVG(hole, { ...opts, spinReadFrac: full.readFrac });
    expect(full.readFrac).toBe(1);
    expect(svg).not.toContain('fill="#7fe0ff"'); // full read → open ring, not a filled terminus
  });

  it('renders byte-identically to the same group inside a full renderHoleSVG', () => {
    const full = renderHoleSVG(hole, { width: 360, height: 640, ...opts });
    const group = renderShotOverlaySVG(hole, { width: 360, height: 640, ...opts });
    const inner = group.replace(/^<g[^>]*>/, '').replace(/<\/g>$/, '');
    expect(full).toContain(inner);
  });

  it('draws NO spin parts when spinPath is absent (feature-off byte-stable)', () => {
    const svg = renderShotOverlaySVG(hole, { focus: play.ball, viewRadius: 60, spray });
    expect(svg).not.toContain('#7fe0ff');
  });
});

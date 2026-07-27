/**
 * The play HUD's reads answer for the PLAYER'S BAG, not for a bare one (GS-hud-gear-reads).
 *
 * The bug, reported from play: *"does the lie chip account for caddie and item upgrades? As far as I
 * can tell it doesn't — bunkers always read as 50% shot reduced regardless of your gear. Same with
 * wind."* Both were true, and both were the same shape of mistake: the sim applies a loadout field
 * (`lieRelief`, `windResist`) that the HUD's text never looked at, so the readouts described a bag
 * the player had spent a run upgrading away from — while the aim cone drawn RIGHT NEXT TO THEM was
 * already honest, because `previewShot` gets the whole loadout.
 *
 * These are pure builders, so the guard is pure: it derives the expected numbers from the SIM's own
 * `reliedLie` / `windResistFactor` rather than hard-coding a table, which is the property that
 * actually matters — the words and the physics come from one place and cannot drift.
 */

import { describe, it, expect } from 'vitest';
import { lieChip, windRead } from '../src/app/playHud';
import { lieInfo, reliedLie, windResistFactor } from '../src/sim/shot';
import { windCompassSVG } from '../src/render/windCompass';

/** The cyan the dial wears when wind-cheating gear is biting (kept here so the test names the
 *  contract — "there is a visible tell" — rather than re-deriving the hex from the module). */
const SHIELD = '#7fd8ff';
import type { Hole } from '../src/sim/course/contract';

const holeWith = (dir: number, spd: number): Hole =>
  ({ tee: [0, 0], green: [0, 100], par: 4, wind: { dir, spd } }) as unknown as Hole;

/** The carry-penalty percentage the chip DISPLAYS. Tags are stripped first: the tooltip deliberately
 *  quotes the bare-bag number ("a bare bag plays it at −50% carry"), so a naive match over the raw
 *  markup reads the attribute instead of the chip and passes on a chip that never changed. */
const carryPct = (html: string): number | null => {
  const m = html.replace(/<[^>]*>/g, '').match(/−(\d+)% carry/);
  return m ? Number(m[1]) : null;
};

describe('the lie chip reads the player\'s own lie (GS-hud-gear-reads)', () => {
  it('prints the RAW penalty on a bare bag', () => {
    const bare = lieChip('bunker');
    expect(carryPct(bare)).toBe(Math.round((1 - lieInfo('bunker').carryMult) * 100));
    expect(bare, 'nothing is easing this lie, so nothing claims to be').not.toContain('🛡');
  });

  it('eases the penalty by an escape caddy / story gear, exactly as the sim does', () => {
    const relief = 0.5;
    const eased = lieChip('bunker', relief);
    const expected = Math.round((1 - reliedLie(lieInfo('bunker'), relief).carryMult) * 100);
    expect(carryPct(eased)).toBe(expected);
    // …and it is genuinely a smaller number, not the same one re-derived.
    expect(carryPct(eased)!).toBeLessThan(carryPct(lieChip('bunker'))!);
    // The relief only SHOWS as a softer number, so the chip flags where the softening came from —
    // otherwise a good bag quietly reads as an easy course.
    expect(eased).toContain('🛡');
  });

  it('never claims to improve a lie that was already clean', () => {
    // `reliedLie` only lerps a PENALISING lie toward neutral. The fairway has nothing to give back,
    // so a relieved fairway chip must be byte-for-byte the bare one — shield included (absent).
    expect(lieChip('fairway', 0.6)).toBe(lieChip('fairway'));
    expect(lieChip('tee', 0.6)).toBe(lieChip('tee'));
  });

  it('softens the WILDNESS word too, not just the carry', () => {
    // The spray word is read off the same eased dispersion the cone is drawn from. A lie wild enough
    // to be called out on a bare bag must be able to stop being called out on a relieved one.
    const wild = Object.keys({ deeprough: 1, fescue: 1 }).find((k) => lieInfo(k).dispersionMult >= 1.25);
    if (!wild) return; // no such lie in the table — nothing to assert
    expect(lieChip(wild)).toMatch(/wild/);
    const relieved = lieChip(wild, 0.9);
    expect(reliedLie(lieInfo(wild), 0.9).dispersionMult).toBeLessThan(1.25);
    expect(relieved, 'a 90%-relieved lie cannot still be "wild"').not.toMatch(/very wild|· wild/);
  });
});

describe('the wind read is the wind the BALL feels (GS-hud-gear-reads)', () => {
  it('is unchanged with no wind gear', () => {
    const r = windRead(holeWith(0, 20));
    expect(r).toMatchObject({ spd: 20, rawSpd: 20, cut: false, kind: 'tailwind' });
  });

  it('scales by the sim\'s OWN factor, and says the sky is being cut', () => {
    const resist = 0.45;
    const r = windRead(holeWith(180, 20), undefined, resist);
    expect(r.spd).toBeCloseTo(20 * windResistFactor(resist), 6);
    expect(r.rawSpd, 'the sky itself is unchanged — the gear is between you and it').toBe(20);
    expect(r.cut).toBe(true);
    // Direction is a fact about the world, not about your bag.
    expect(r.kind).toBe('headwind');
    expect(Math.abs(r.delta)).toBe(180);
  });

  it('clamps a stacked resist the way the physics does', () => {
    // Story clubs add `windResist` uncapped, so a stacked bag can exceed 1 before the sim clamps it.
    // The dial has to clamp identically or it would print a NEGATIVE wind.
    expect(windResistFactor(1.4)).toBe(0);
    expect(windResistFactor(-1)).toBe(1);
    expect(windRead(holeWith(0, 20), undefined, 1.4).spd).toBe(0);
    expect(windRead(holeWith(0, 20), undefined, undefined).spd).toBe(20);
  });
});

describe('the dial SHOWS the gear working (GS-hud-gear-reads)', () => {
  it('rings itself in the shield colour only when the wind is being cut', () => {
    const plain = windCompassSVG({ spd: 11, kind: 'headwind', delta: 175 });
    const cut = windCompassSVG({ spd: 11, kind: 'headwind', delta: 175, cut: true });
    expect(plain).not.toContain(SHIELD);
    expect(cut, 'a perk the player paid for must be visible, not only in a tooltip').toContain(SHIELD);
  });

  it('reads CALM rather than "0" once gear has taken the whole breeze', () => {
    // Reachable through gear alone: a 45%-resist ball in a 1 mph breeze rounds to zero.
    expect(windCompassSVG({ spd: 0.4, kind: 'crosswind', delta: 90, cut: true })).toContain('CALM');
  });
});

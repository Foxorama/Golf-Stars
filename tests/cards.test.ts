import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { courseCardHTML, itemCardHTML, shotCardHTML } from '../src/render/cards';
import { rarCol } from '../src/sim/rpg/loot';
import { Rng } from '../src/sim/rng';
import { playHole } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';

describe('cards (GS-5)', () => {
  const course = generateCourse(1234, { holes: 6 });

  it('course card shows name, biome, rarity accent, and a hole thumbnail', () => {
    const html = courseCardHTML(course);
    expect(html).toContain(course.meta.name);
    expect(html).toContain(course.biome);
    expect(html).toContain(rarCol(course.rarity)); // rarity accent colour
    expect(html).toContain('<svg'); // falls back to the hole thumbnail when no artUrl
    expect(html).toContain(`${course.holes.length} holes`);
  });

  it('course card uses the art image when an artUrl is supplied (no thumbnail)', () => {
    const html = courseCardHTML(course, { artUrl: 'https://example/art.png' });
    expect(html).toContain('<img');
    expect(html).toContain('https://example/art.png');
    expect(html).not.toContain('<svg');
  });

  it('item card shows cost when buyable and dims/relabels when owned or broke', () => {
    const item = { name: 'Gyro', cost: 150, desc: 'tighter', rarity: 'rare' as const };
    const buyable = itemCardHTML(item, { owned: false, affordable: true });
    expect(buyable).toContain('150c');
    expect(buyable).toContain('opacity:1');

    expect(itemCardHTML(item, { owned: true }).toUpperCase()).toContain('MAXED');
    expect(itemCardHTML(item, { affordable: false })).toContain('NEED CREDITS');
    expect(itemCardHTML(item, { owned: true })).toContain('opacity:0.5');
    expect(buyable).toContain(rarCol('rare'));
  });

  it('shot card reports total, carry, roll and accuracy from a real shot', () => {
    const hole = generateCourse(3, { holes: 1 }).holes[0]!;
    const shot = playHole(hole, new Rng('3:play')).shots[0]!;
    const html = shotCardHTML(shot);
    expect(html).toContain('Total');
    expect(html).toContain('Carry');
    expect(html).toContain('Roll');
    expect(html).toContain('Accuracy');
    expect(html).toContain(`${Math.round(shot.result.carry)} yd`);
  });

  it('shot card shows a backspin row only for the lofted clubs that generate it', () => {
    const base = {
      from: [0, 0] as [number, number],
      result: { landing: [0, 100] as [number, number], carry: 100, shotBearing: 0, wind: { along: 0, cross: 0 }, intended: 100, apex: 20 },
      lieFrom: 'tee' as const,
      lieTo: 'fairway' as const,
      rest: [0, 102] as [number, number],
      roll: 2,
      holed: false,
    };
    const wedge = shotCardHTML({ ...base, club: CLUBS.find((c) => c.id === 'SW')! });
    const driver = shotCardHTML({ ...base, club: CLUBS.find((c) => c.id === 'D')! });
    expect(wedge).toContain('Backspin'); // sand wedge is eligible
    expect(driver).not.toContain('Backspin'); // driver is not
  });
});

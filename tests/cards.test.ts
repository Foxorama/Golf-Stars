import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { courseCardHTML, itemCardHTML } from '../src/render/cards';
import { rarCol } from '../src/sim/rpg/loot';

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

    expect(itemCardHTML(item, { owned: true }).toUpperCase()).toContain('OWNED');
    expect(itemCardHTML(item, { affordable: false })).toContain('NEED CREDITS');
    expect(itemCardHTML(item, { owned: true })).toContain('opacity:0.5');
    expect(buyable).toContain(rarCol('rare'));
  });
});

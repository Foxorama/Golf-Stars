import { describe, it, expect } from 'vitest';
import {
  CLUBS,
  addClubShot,
  clubAvg,
  clubDist,
  emptyClubStats,
  suggestClub,
} from '../src/sim/clubs';

describe('clubs', () => {
  it('ships a 21-club taxonomy ordered longest→shortest', () => {
    expect(CLUBS).toHaveLength(21);
    for (let i = 1; i < CLUBS.length; i++) {
      expect(CLUBS[i]!.carry).toBeLessThan(CLUBS[i - 1]!.carry);
    }
    // The 3-iron (Larry's long-iron bag, GS-clubs) sits between the 5-hybrid and the 5-iron now that
    // the 4-iron is gone (GS-clubs-3).
    expect(CLUBS.find((c) => c.id === '3i')!.carry).toBeLessThan(CLUBS.find((c) => c.id === '5H')!.carry);
    expect(CLUBS.find((c) => c.id === '3i')!.carry).toBeGreaterThan(CLUBS.find((c) => c.id === '5i')!.carry);
  });

  it("'reach' picks the shortest club that still carries the distance", () => {
    // 150 yds: 5-iron carries exactly 150, 6-iron only 142 → 5-iron just reaches.
    expect(suggestClub(150, 'reach').id).toBe('5i');
    // 151 yds: 5-iron no longer reaches → next longer (3-iron, 157).
    expect(suggestClub(151, 'reach').id).toBe('3i');
  });

  it("'reach' falls back to the longest club when nothing reaches", () => {
    expect(suggestClub(9999, 'reach').id).toBe('D');
  });

  it("'nearest' picks the closest carry regardless of over/under", () => {
    // 153 is closer to 5i(150, diff 3) than 3i(157, diff 4).
    expect(suggestClub(153, 'nearest').id).toBe('5i');
    // 146 is equidistant between 5i(150, diff 4) and 6i(142, diff 4) → the tie keeps the longer club, 5i.
    expect(suggestClub(146, 'nearest').id).toBe('5i');
  });

  it('rolling per-club average overrides nominal carry once samples exist', () => {
    let stats = emptyClubStats();
    expect(clubAvg(stats, '7i')).toBeUndefined();
    stats = addClubShot(stats, '7i', 130);
    stats = addClubShot(stats, '7i', 140);
    expect(clubAvg(stats, '7i')).toBe(135);
    const sevenIron = CLUBS.find((c) => c.id === '7i')!;
    expect(clubDist(sevenIron)).toBe(134); // nominal
    expect(clubDist(sevenIron, stats)).toBe(135); // learned
  });
});

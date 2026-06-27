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
  it('ships a 27-club taxonomy ordered longest→shortest', () => {
    expect(CLUBS).toHaveLength(27);
    for (let i = 1; i < CLUBS.length; i++) {
      expect(CLUBS[i]!.carry).toBeLessThan(CLUBS[i - 1]!.carry);
    }
    // The 3-iron (added for Larry's long-iron bag, GS-clubs) sits between the 4-iron and the hybrids.
    expect(CLUBS.find((c) => c.id === '3i')!.carry).toBeGreaterThan(CLUBS.find((c) => c.id === '4i')!.carry);
  });

  it("'reach' picks the shortest club that still carries the distance", () => {
    // 150 yds: 5-iron carries exactly 150, 6-iron only 142 → 5-iron just reaches.
    expect(suggestClub(150, 'reach').id).toBe('5i');
    // 151 yds: 5-iron no longer reaches → next longer (4-iron, 158).
    expect(suggestClub(151, 'reach').id).toBe('4i');
  });

  it("'reach' falls back to the longest club when nothing reaches", () => {
    expect(suggestClub(9999, 'reach').id).toBe('D');
  });

  it("'nearest' picks the closest carry regardless of over/under", () => {
    // 153 is closer to 5i(150, diff 3) than 4i(158, diff 5).
    expect(suggestClub(153, 'nearest').id).toBe('5i');
    // 154 is equidistant (diff 4 each) → the tie keeps the longer club, 4i.
    expect(suggestClub(154, 'nearest').id).toBe('4i');
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

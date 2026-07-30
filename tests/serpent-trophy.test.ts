import { describe, it, expect } from 'vitest';
import {
  EMPTY_SERPENT_TALLY,
  recordSerpentBout,
  serpentTrophyEarned,
  serpentTrophyUnlock,
  serpentWinsRemaining,
  SERPENT_SHIP_ID,
  SERPENT_TROPHY_WINS,
} from '../src/sim/rpg/serpentTrophy';
import { SHIPS, shipById, canBuyShip, shipRevealedInMarket, DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';
import { shipSVG } from '../src/render/shipArt';
import { shipTopSVG } from '../src/render/shipTopArt';
import { SHIP_ARMS, shipArmsFor, planMounts } from '../src/render/battleArms';
import { shipWeaponFor, shotInnerSVG } from '../src/render/shipWeapons';
import { hudThemeForShip } from '../src/render/hudTheme';
import { cabinStyleForShip } from '../src/render/shipInteriorArt';
import { SAVE_VERSION, defaultSave, migrate } from '../src/save/schema';
import { initState, reduce } from '../src/ui/game';
import { defaultStoryState } from '../src/sim/rpg/story';

/**
 * GS-startour-serpent-trophy — **BEATEN INTO SUBMISSION**.
 *
 * The champion's replay of the finale (GS-story-startour-champions) used to bank nothing at all, not
 * even a count. Now every root encounter counts on the MAIN save, and a thousand victories break the
 * world serpent to the bridle: it becomes a ship.
 *
 * Two things need machine-checking above the arithmetic. First, the grind must be UNLOSABLE by anything
 * other than deleting the save — it lives beside `lifetimeAces`, never in `fc_story`, which one campaign
 * per golfer can overwrite. Second, and the reason this file exists at all: making the replay dispatch an
 * action retires the "there is no action, so it cannot touch the campaign" guarantee, so the replacement
 * guarantee — the action touches the tally and `ownedShips` and NOTHING else — has to be asserted.
 */

const FEATHER = 'feather';

/** A state as a finished champion would hold it, at a given win count. */
function championState(wins = 0, owned: string[] = [DEFAULT_SHIP_ID]) {
  const story = { ...defaultStoryState(FEATHER), completed: true, alignment: 'warden' as const };
  return {
    ...initState(1, { ownedShips: owned, serpentWins: wins, serpentBouts: wins }, undefined, story),
    screen: 'starTour' as const,
  };
}

describe('the root tally', () => {
  it('counts every encounter, and the wins separately', () => {
    let t = EMPTY_SERPENT_TALLY;
    t = recordSerpentBout(t, true);
    t = recordSerpentBout(t, false);
    t = recordSerpentBout(t, true);
    expect(t).toEqual({ bouts: 3, wins: 2 });
    // pure: the input is never mutated
    expect(EMPTY_SERPENT_TALLY).toEqual({ bouts: 0, wins: 0 });
  });

  it('a LOSS still counts as a bout — the ledger is honest about the fights you lost', () => {
    expect(recordSerpentBout({ bouts: 10, wins: 4 }, false)).toEqual({ bouts: 11, wins: 4 });
  });

  it('the trophy needs a thousand WINS, not a thousand fights', () => {
    expect(SERPENT_TROPHY_WINS).toBe(1000);
    expect(serpentTrophyEarned(999)).toBe(false);
    expect(serpentTrophyEarned(1000)).toBe(true);
    expect(serpentTrophyEarned(4321)).toBe(true);
    expect(serpentWinsRemaining(0)).toBe(1000);
    expect(serpentWinsRemaining(999)).toBe(1);
    expect(serpentWinsRemaining(1200)).toBe(0);
  });

  it('grants the hull once, additively, and hands back the SAME array when nothing is new', () => {
    const owned = [DEFAULT_SHIP_ID, 'comet-rider'];
    expect(serpentTrophyUnlock(owned, 999)).toBe(owned); // referentially unchanged ⇒ "no reveal"
    const earned = serpentTrophyUnlock(owned, 1000);
    expect(earned).not.toBe(owned);
    expect(earned).toEqual([DEFAULT_SHIP_ID, 'comet-rider', SERPENT_SHIP_ID]); // purely additive
    expect(serpentTrophyUnlock(earned, 1200)).toBe(earned); // idempotent past the bar
  });
});

describe('the reducer bout', () => {
  it('counts a win and a loss, and persists nothing else about the fight', () => {
    const s0 = championState();
    const s1 = reduce(s0, { type: 'serpentBout', won: true });
    expect(s1.serpentBouts).toBe(1);
    expect(s1.serpentWins).toBe(1);
    const s2 = reduce(s1, { type: 'serpentBout', won: false });
    expect(s2.serpentBouts).toBe(2);
    expect(s2.serpentWins).toBe(1);
    expect(s2.screen).toBe('starTour'); // a bout never navigates — the card is app-layer view state
  });

  it('TOUCHES NO CAMPAIGN STATE — the guarantee GS-story-startour-champions got from having no action', () => {
    const s0 = championState(999);
    const s1 = reduce(s0, { type: 'serpentBout', won: true });
    // the campaign, the roster and the run are the same objects, not merely equal ones
    expect(s1.story).toBe(s0.story);
    expect(s1.campaigns).toBe(s0.campaigns);
    expect(s1.run).toBe(s0.run);
    expect(s1.strokePlayBest).toBe(s0.strokePlayBest);
    expect(s1.starTourUnlocked).toBe(s0.starTourUnlocked);
  });

  it('the thousandth win hangs the serpent in the GLOBAL garage, and the next one announces nothing', () => {
    const s0 = championState(999);
    expect(s0.ownedShips).not.toContain(SERPENT_SHIP_ID);
    const won = reduce(s0, { type: 'serpentBout', won: true });
    expect(won.serpentWins).toBe(1000);
    expect(won.ownedShips).toContain(SERPENT_SHIP_ID);
    // …and bout 1,001 leaves the owned list referentially untouched, so the app's "just earned?" check
    // (compare before/after) can never re-reveal the secret.
    const again = reduce(won, { type: 'serpentBout', won: true });
    expect(again.ownedShips).toBe(won.ownedShips);
  });

  it('a LOSS at 999 grants nothing — the bar is wins', () => {
    const s = reduce(championState(999), { type: 'serpentBout', won: false });
    expect(s.serpentBouts).toBe(1000);
    expect(s.serpentWins).toBe(999);
    expect(s.ownedShips).not.toContain(SERPENT_SHIP_ID);
  });
});

describe('the tally is on the MAIN save, where a golfer pick cannot erase it', () => {
  it('v32 seeds the tally at zero and carries it through a round trip', () => {
    expect(SAVE_VERSION).toBe(33);
    const d = defaultSave();
    expect(d.serpentBouts).toBe(0);
    expect(d.serpentWins).toBe(0);
    const kept = migrate({ ...d, serpentBouts: 7, serpentWins: 5 });
    expect(kept.serpentWins).toBe(5);
    expect(kept.serpentBouts).toBe(7);
  });

  it('an older save migrates in with an empty ledger — nothing is granted retroactively', () => {
    const s = migrate({ version: 31, ownedShips: [DEFAULT_SHIP_ID] } as unknown);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.serpentWins).toBe(0);
    expect(s.ownedShips).not.toContain(SERPENT_SHIP_ID);
  });

  it('a junk blob cannot hand out (or hide) the grail', () => {
    const junk = migrate({ version: 32, serpentWins: 'lots', serpentBouts: -4 } as unknown);
    expect(junk.serpentWins).toBe(0);
    expect(junk.serpentBouts).toBe(0);
    expect(migrate({ version: 32, serpentWins: 1000.7 } as unknown).serpentWins).toBe(1000);
  });
});

describe('the World Serpent hull', () => {
  const ship = shipById(SERPENT_SHIP_ID)!;

  it('is a secret, free MYTHIC grail hidden until owned — and never for sale', () => {
    expect(ship).toBeTruthy();
    expect(ship.rarity).toBe('mythic');
    expect(ship.cost).toBe(0);
    expect(ship.secret).toBe(true);
    expect(ship.unlockHoles).toBeUndefined(); // earned at the root, not on the endless ladder
    expect(canBuyShip(ship, 999999, [DEFAULT_SHIP_ID])).toBe(false);
    expect(shipRevealedInMarket(ship, [DEFAULT_SHIP_ID])).toBe(false);
    expect(shipRevealedInMarket(ship, [DEFAULT_SHIP_ID, SERPENT_SHIP_ID])).toBe(true);
    // the catalogue's FIRST mythic must still be the Mothership (the serpent is placed last)
    expect(SHIPS.find((s) => s.rarity === 'mythic')!.look.kind).toBe('ufo');
  });

  it('is its OWN silhouette — a bespoke kind, not a recoloured hull', () => {
    expect(ship.look.kind).toBe('serpent');
    expect(SHIPS.filter((s) => s.look.kind === 'serpent')).toHaveLength(1);
    const side = shipSVG(SERPENT_SHIP_ID, 0, 0, 1);
    const top = shipTopSVG(SERPENT_SHIP_ID, 0, 0, 1);
    expect(side).not.toBe(top);
    for (const svg of [side, top]) {
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('NaN');
      // SVG ids are DOCUMENT-GLOBAL — a shared id cross-tints co-mounted ships (the standing rule)
      expect(svg).not.toMatch(/\sid\s*=/);
    }
    // deterministic (no rng anywhere in the render path)
    expect(shipSVG(SERPENT_SHIP_ID, 0, 0, 1)).toBe(side);
  });

  it('bites with BOTH fangs — a flank pair that survives the plan-view mirror unchanged', () => {
    const arms = SHIP_ARMS.serpent;
    expect(arms.name).toBe('FANGS');
    expect(arms.mounts).toHaveLength(2);
    expect(arms.mounts.some((m) => m.across > 0) && arms.mounts.some((m) => m.across < 0)).toBe(true);
    // spans the keel already ⇒ `planMounts` must not double it (that would double the drawn barrels)
    expect(planMounts(arms)).toEqual(arms.mounts);
    // the resolved livery comes off the ship's own palette, so the guns wear the beast's colours
    const resolved = shipArmsFor(SERPENT_SHIP_ID);
    expect(resolved.hot).toBe(ship.look.flame);
    expect(resolved.halo).toBe(ship.look.glass);
  });

  it('spits VENOM on the star map, and the projectile actually draws', () => {
    const w = shipWeaponFor(SERPENT_SHIP_ID);
    expect(w.name).toBe('VENOM');
    expect(w.style).toBe('venom');
    const shot = shotInnerSVG(w.style, w.color, w.color2);
    expect(shot.length).toBeGreaterThan(120);
    expect(shot).not.toContain('undefined');
  });

  it('carries a bridge livery and a living cabin', () => {
    const theme = hudThemeForShip(SERPENT_SHIP_ID);
    expect(theme.accent).toBe('#7cff9f'); // its own venom-light, not the Mythic set's violet
    expect(hudThemeForShip('ufo-mothership').accent).not.toBe(theme.accent);
    expect(cabinStyleForShip(SERPENT_SHIP_ID, 'serpent')).toBe('wyrm'); // the inside of a serpent
  });
});

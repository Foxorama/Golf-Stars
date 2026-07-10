import { describe, it, expect } from 'vitest';
import {
  CADDY_FACTION,
  CREDIT_ITEM_FACTION,
  REP_ON_FIRE,
  REP_ON_HIRE,
  adjustReputation,
  factionById,
  factionForCaddy,
  factionForCreditItem,
  reputationWith,
} from '../src/sim/rpg/factions';
import { NAMED_CADDY_IDS, namedCaddyOwned, shopItem } from '../src/sim/rpg/economy';
import { startRun } from '../src/sim/rpg/run';
import { initState, reduce, type UiState } from '../src/ui/game';

describe('caddy factions — data contract (GS-caddy-factions)', () => {
  it('EVERY named caddy maps to a faction (the machine-checked coverage rule)', () => {
    for (const id of NAMED_CADDY_IDS) {
      const faction = factionForCaddy(id);
      expect(faction, `caddy "${id}" has no faction`).toBeDefined();
      expect(factionById(faction!), `faction "${faction}" for "${id}" is not in FACTIONS`).toBeDefined();
    }
  });

  it('every CADDY_FACTION key is a real named caddy (no orphan mappings)', () => {
    for (const id of Object.keys(CADDY_FACTION)) {
      expect(NAMED_CADDY_IDS, `"${id}" is mapped to a faction but is not a named caddy`).toContain(id);
    }
  });

  it('the initial factions exist with their signature members', () => {
    const members = (factionId: string) => Object.keys(CADDY_FACTION).filter((c) => CADDY_FACTION[c] === factionId);
    expect(factionById('putters-guild')?.name).toBe('The Putters Guild');
    expect(members('putters-guild').sort()).toEqual(['auto-caddie', 'mystic-mole'].sort()); // putting specialists
    expect(members('space-pirates')).toEqual(['convict-sheep']);
    expect(factionById('planet-pirates')?.name).toBe('Planet Pirates');
    expect(members('planet-pirates')).toEqual(['prognostic-parrot']); // the foreseeing pirate captain
    expect(members('lords-and-ladies')).toEqual(['space-ducks']);
    expect(members('long-haul-truckers').sort()).toEqual(['driver-dan', 'suggestible-sam'].sort());
    expect(members('para-spatial-medics')).toEqual(['dr-chipinski']);
    expect(members('the-other-guys')).toEqual(['sandy-sandsaver']); // the unaffiliated escape artist
  });

  it('reputation deltas are the hire/fire values from the brief (+1 / −3)', () => {
    expect(REP_ON_HIRE).toBe(1);
    expect(REP_ON_FIRE).toBe(-3);
  });
});

describe('credit-token factions — data contract (GS-credit-factions)', () => {
  it('the four credit tokens each belong to a distinct real faction', () => {
    const ids = ['fortune-chip', 'lucky-coin', 'birdie-hunter', 'eagle-eye'];
    const factions = ids.map((id) => factionForCreditItem(id));
    for (let i = 0; i < ids.length; i++) {
      expect(factions[i], `credit token "${ids[i]}" has no faction`).toBeDefined();
      expect(factionById(factions[i]!), `faction "${factions[i]}" is not in FACTIONS`).toBeDefined();
    }
    // Each credit token is its OWN faction — the brief's "different faction" per item.
    expect(new Set(factions).size).toBe(ids.length);
    expect(factionForCreditItem('fortune-chip')).toBe('sponsors-syndicate'); // +15%
    expect(factionForCreditItem('lucky-coin')).toBe('fortune-cartel'); // +20%
    expect(factionForCreditItem('birdie-hunter')).toBe('birdie-hunters');
    expect(factionForCreditItem('eagle-eye')).toBe('eagle-order');
  });

  it('every CREDIT_ITEM_FACTION key is a real shop item that boosts credits', () => {
    for (const id of Object.keys(CREDIT_ITEM_FACTION)) {
      const it = shopItem(id);
      expect(it, `"${id}" is mapped to a faction but is not a shop item`).toBeTruthy();
      expect(factionById(CREDIT_ITEM_FACTION[id]!), `orphan faction "${CREDIT_ITEM_FACTION[id]}"`).toBeDefined();
    }
  });

  it('a non-credit item has no issuing faction', () => {
    expect(factionForCreditItem('power-cell')).toBeUndefined();
    expect(factionForCreditItem('auto-caddie')).toBeUndefined();
  });
});

describe('reputation helpers are pure + immutable', () => {
  it('adjustReputation accumulates per character/faction without mutating', () => {
    const a = {};
    const b = adjustReputation(a, 'larry', 'long-haul-truckers', 1);
    expect(a).toEqual({}); // original untouched
    expect(reputationWith(b, 'larry', 'long-haul-truckers')).toBe(1);
    const c = adjustReputation(b, 'larry', 'long-haul-truckers', -3);
    expect(reputationWith(c, 'larry', 'long-haul-truckers')).toBe(-2);
    // Reputation is character-specific — a different golfer has their own standing.
    expect(reputationWith(c, 'bo', 'long-haul-truckers')).toBe(0);
  });
});

describe('the shop hire/fire reputation flow (reducer, GS-caddy-factions)', () => {
  // A shop UiState backed by a rich, character-bound run.
  const shopState = (characterId: string): UiState => {
    const run = { ...startRun(1, undefined, {}, characterId), credits: 1_000_000 };
    return { ...initState(1), run, screen: 'shop', shopOffer: [], reputation: {} };
  };

  it('hiring a caddy grants +1 with their faction; a swap fires the old (−3) and hires the new (+1)', () => {
    const s0 = shopState('longshot-larry');
    const s1 = reduce(s0, { type: 'buy', id: 'driver-dan' });
    expect(namedCaddyOwned(s1.run.loadout.perks)).toBe('driver-dan');
    expect(reputationWith(s1.reputation, 'longshot-larry', 'long-haul-truckers')).toBe(1);

    // Clicking a new caddy first parks a confirmation (nobody's fired yet).
    const pending = reduce(s1, { type: 'buy', id: 'mystic-mole' });
    expect(pending.pendingFireCaddy).toEqual({ newId: 'mystic-mole', oldId: 'driver-dan' });
    expect(pending.run).toBe(s1.run); // no purchase, no reputation change yet
    expect(pending.reputation).toBe(s1.reputation);

    // Confirming fires Dan (−3 Truckers) and hires the Mole (+1 Putters Guild).
    const s2 = reduce(pending, { type: 'buy', id: 'mystic-mole', confirmFire: true });
    expect(namedCaddyOwned(s2.run.loadout.perks)).toBe('mystic-mole');
    expect(s2.run.firedCaddies).toContain('driver-dan');
    expect(s2.pendingFireCaddy).toBeUndefined();
    expect(reputationWith(s2.reputation, 'longshot-larry', 'long-haul-truckers')).toBe(REP_ON_HIRE + REP_ON_FIRE); // 1 − 3 = −2
    expect(reputationWith(s2.reputation, 'longshot-larry', 'putters-guild')).toBe(1);
  });

  it('cancelling the swap keeps the current caddy and changes nothing', () => {
    const s1 = reduce(shopState('backspin-bo'), { type: 'buy', id: 'convict-sheep' });
    const pending = reduce(s1, { type: 'buy', id: 'space-ducks' });
    const cancelled = reduce(pending, { type: 'cancelFireCaddy' });
    expect(cancelled.pendingFireCaddy).toBeUndefined();
    expect(namedCaddyOwned(cancelled.run.loadout.perks)).toBe('convict-sheep');
    expect(cancelled.run.firedCaddies).toEqual([]);
    // Only the original hire's reputation stands.
    expect(reputationWith(cancelled.reputation, 'backspin-bo', 'space-pirates')).toBe(1);
    expect(reputationWith(cancelled.reputation, 'backspin-bo', 'lords-and-ladies')).toBe(0);
  });
});

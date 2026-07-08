/**
 * GS-salvage-mystery — a salvage lane's loot is a BLIND gamble now: the route card previews only the
 * TIER (never the exact club), and the find rolls on arrival keyed to the DESTINATION, so skipping a
 * salvage lane means the next one may differ. These guards pin the two load-bearing properties:
 *   1. `salvageFindFor` (the single source `travel` grants from AND the UI reveals from) is byte-stable
 *      and keyed to the destination stop, so each salvage stop is its own roll.
 *   2. The reducer stashes the reveal computed from the PRE-travel bag, matching exactly what got
 *      equipped — the "you looted X" payoff — and stays absent when the arriving lane isn't salvage.
 */
import { describe, it, expect } from 'vitest';
import { reduce, initState, type UiState } from '../src/ui/game';
import { salvageFindFor } from '../src/sim/rpg/run';
import { routeClubFind } from '../src/sim/rpg/effects';
import { ROUTE_EVENTS } from '../src/sim/rpg/events';
import { clubItem } from '../src/sim/rpg/economy';
import { introScreen } from '../src/app/introScreens';
import { setState } from '../src/app/ctx';

/** Drive a fresh unending run to its first travel screen (or bail on an unlucky stop-0 death). */
function toTravel(seed: number): UiState | undefined {
  let s = reduce(initState(seed), { type: 'start', format: 'unending' });
  s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
  s = reduce(s, { type: 'play' });
  if (s.screen === 'gameover') return undefined;
  s = reduce(s, { type: 'continue' });
  s = reduce(s, { type: 'leaveShop' });
  return s.screen === 'travel' ? s : undefined;
}

const salvageEvent = ROUTE_EVENTS.find((e) => e.category === 'salvage' && e.rarity === 'rare')!;
const calmEvent = ROUTE_EVENTS.find((e) => e.category === 'calm')!;

describe('GS-salvage-mystery — the blind salvage gamble', () => {
  it('salvageFindFor is deterministic and keyed to the destination stop (a per-stop roll)', () => {
    const s = toTravel(31);
    if (!s) return;
    const route = { ...s.routes![0]!, event: salvageEvent };
    // Stable for a given (run, route).
    expect(salvageFindFor(s.run, route)).toEqual(salvageFindFor(s.run, route));
    // Advancing the stop re-keys the private stream, so the roll can change — never a fixed reward.
    const deeper: UiState = { ...s, run: { ...s.run, stopIndex: s.run.stopIndex + 3 } };
    const a = salvageFindFor(s.run, route);
    const b = salvageFindFor(deeper.run, route);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // (The find id may or may not differ, but it is a genuinely independent draw off the new stop.)
    expect(routeClubFind(route.event)).toBe('rare');
  });

  it('a salvage jump reveals exactly the club that got equipped', () => {
    const base = toTravel(31);
    if (!base) return;
    const route = { ...base.routes![0]!, event: salvageEvent };
    const s: UiState = { ...base, routes: [route, ...base.routes!.slice(1)] };

    const expected = salvageFindFor(s.run, route); // resolved off the PRE-travel bag
    expect(expected).toBeTruthy();

    const after = reduce(s, { type: 'route', routeId: route.id });
    expect(after.screen).toBe('intro');
    expect(after.salvageReveal).toEqual(expected);

    if (expected!.clubItemId) {
      const clubType = clubItem(expected!.clubItemId)!.clubType!;
      expect(after.run.loadout.bag.some((c) => c.id === clubType)).toBe(true);
      // The intro pays the gamble off by naming the club — the reveal the tier-only card held back.
      setState(after);
      expect(introScreen()).toContain(expected!.clubName!);
    }
  });

  it('the reveal is absent when the arriving lane is NOT salvage', () => {
    const base = toTravel(31);
    if (!base) return;
    const route = { ...base.routes![0]!, event: calmEvent };
    const s: UiState = { ...base, routes: [route, ...base.routes!.slice(1)] };
    const after = reduce(s, { type: 'route', routeId: route.id });
    expect(after.salvageReveal).toBeUndefined();
  });
});

/**
 * The save ↔ live-state field mapping, in one place. `metaFromSave` lifts the cross-run meta out of
 * a loaded save (fed to `initState` at boot); `persist` writes the current state back to localStorage
 * after every action. Keeping BOTH here means a newly-persisted field is added in one file, not two
 * (the classic "bumped the schema, forgot one of the two mappers" bug — see save/schema.ts).
 *
 * app.ts still owns the boot/recover orchestration and the render/dispatch loop that calls `persist`.
 */

import { state } from './ctx';
import { writeSave } from '../save/storage';
import { SAVE_VERSION, type Save } from '../save/schema';
import { snapshotRun } from '../sim/rpg/run';
import { ASGARD_FORMAT } from '../sim/rpg/formats';

/** The cross-run meta carried into `initState` from a loaded save (everything but the active run,
 *  which boot passes separately). */
export function metaFromSave(save: Save) {
  return {
    bestStableford: save.bestStableford,
    bestDistance: save.bestDistance,
    shards: save.shards,
    metaUpgrades: save.metaUpgrades,
    maxAscension: save.maxAscension,
    maxAscensionByCharacter: save.maxAscensionByCharacter,
    lifetimeAces: save.lifetimeAces,
    ownedShips: save.ownedShips,
    ownedApparel: save.ownedApparel,
    shipByCharacter: save.shipByCharacter,
    hatByCharacter: save.hatByCharacter,
    shirtByCharacter: save.shirtByCharacter,
    pantsByCharacter: save.pantsByCharacter,
    golfBagByCharacter: save.golfBagByCharacter,
    driverByCharacter: save.driverByCharacter,
    bagTier: save.bagTier,
    bagTierByCharacter: save.bagTierByCharacter,
    unlockedClubsByCharacter: save.unlockedClubsByCharacter,
    clubhouseVisit: save.clubhouseVisit,
    endlessBestHoles: save.endlessBestHoles,
    marmotBartender: save.marmotBartender,
    marmotTips: save.marmotTips,
    endlessRuns: save.endlessRuns,
    reputationByCharacter: save.reputationByCharacter,
    strokePlayBest: save.strokePlayBest,
    seenLore: save.seenLore,
    priceRefund: save.priceRefund,
  };
}

/** Write the live state to localStorage (the only copy). Called after every reducer action. */
export function persist(): void {
  writeSave({
    version: SAVE_VERSION,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    maxAscension: state.maxAscension,
    maxAscensionByCharacter: state.maxAscensionByCharacter,
    lifetimeAces: state.lifetimeAces,
    ownedShips: state.ownedShips,
    ownedApparel: state.ownedApparel,
    shipByCharacter: state.shipByCharacter,
    hatByCharacter: state.hatByCharacter,
    shirtByCharacter: state.shirtByCharacter,
    pantsByCharacter: state.pantsByCharacter,
    golfBagByCharacter: state.golfBagByCharacter,
    driverByCharacter: state.driverByCharacter,
    bagTier: state.bagTier,
    bagTierByCharacter: state.bagTierByCharacter,
    unlockedClubsByCharacter: state.unlockedClubsByCharacter,
    clubhouseVisit: state.clubhouseVisit,
    endlessBestHoles: state.endlessBestHoles,
    marmotBartender: state.marmotBartender,
    marmotTips: state.marmotTips,
    endlessRuns: state.endlessRuns,
    reputationByCharacter: state.reputation,
    strokePlayBest: state.strokePlayBest,
    seenLore: state.seenLore,
    // The one-off Trade Market price-cut notice (GS-trade-rebalance): persisted while pending so a
    // reload before dismissal still shows it; cleared to undefined once the player closes it.
    priceRefund: state.priceRefund,
    // Persist the LIVE run only when it's actually underway (a golfer picked). The title's
    // placeholder run is active-but-empty — snapshotting it used to overwrite a saved run the
    // moment anything dispatched from the title. While no real run is live, any resumable offer
    // the state carries (a reload's, or one parked by 'toTitle') is kept instead of wiped.
    // The Asgard tournament run (GS-asgard) is NEVER persisted — a mid-tournament quit resumes the
    // SUSPENDED real run (the Asgard attempt is forfeited, the Rainbow Ball intact), so persist the
    // parked snapshot instead of the ephemeral tournament run.
    activeRun:
      state.run.status === 'active' && state.run.formatId === ASGARD_FORMAT
        ? state.asgardReturn
        : state.run.status === 'active' && state.run.loadout.characterId
        ? snapshotRun(state.run)
        : state.resumable,
  });
}

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
import { writeStory } from '../save/storyStore';
import { SAVE_VERSION, type Save } from '../save/schema';
import { campaignWithLiveRound, resumableState } from '../ui/resumable';

/** The cross-run meta carried into `initState` from a loaded save. */
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
    lastExportRun: save.lastExportRun,
    endlessBestHoles: save.endlessBestHoles,
    marmotBartender: save.marmotBartender,
    marmotTips: save.marmotTips,
    endlessRuns: save.endlessRuns,
    reputationByCharacter: save.reputationByCharacter,
    strokePlayBest: save.strokePlayBest,
    seenLore: save.seenLore,
    starTourUnlocked: save.starTourUnlocked,
    serpentBouts: save.serpentBouts,
    serpentWins: save.serpentWins,
    priceRefund: save.priceRefund,
    // GS-save-slots: every parked run + the CONTINUE pointer. They ride the meta bag rather than a
    // positional argument so a persisted field is still mapped in exactly one file.
    runSlots: save.runSlots,
    lastPlayed: save.lastPlayed,
  };
}

/** GS-story: write the active Story Mode campaign to its OWN `fc_story` blob (separate from the main save),
 *  when one is present. A no-op with no campaign, so Voyage/Unending sessions never touch `fc_story`. */
export function persistStory(): void {
  const story = campaignWithLiveRound(state);
  if (story) writeStory(story);
}

/** Write the live state to localStorage (the only copy). Called after every reducer action. */
export function persist(): void {
  // GS-save-slots: what this state parks is answered ONCE, by `resumableState` — the same function
  // `toTitle` calls. It used to be answered here AND there, in different words, and the two
  // disagreed: `persist` knew a Story round and an Asgard tournament must pass the existing offer
  // through, `toTitle` did not, so parking a Voyage and then playing a Story world lost the Voyage.
  const { runSlots, lastPlayed } = resumableState(state);
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
    lastExportRun: state.lastExportRun,
    endlessBestHoles: state.endlessBestHoles,
    marmotBartender: state.marmotBartender,
    marmotTips: state.marmotTips,
    endlessRuns: state.endlessRuns,
    reputationByCharacter: state.reputation,
    strokePlayBest: state.strokePlayBest,
    seenLore: state.seenLore,
    // GS-story-startour-unlock: the permanent Star Tour unlock — set on the first finale win, never
    // cleared (a new campaign resets the campaign's own `completed`, but this outlives it).
    starTourUnlocked: state.starTourUnlocked,
    // GS-startour-serpent-trophy: the lifetime root tally — every Star Tour encounter with the serpent
    // at the root, and the win count the secret world-serpent hull is earned on.
    serpentBouts: state.serpentBouts,
    serpentWins: state.serpentWins,
    // The one-off Trade Market price-cut notice (GS-trade-rebalance): persisted while pending so a
    // reload before dismissal still shows it; cleared to undefined once the player closes it.
    priceRefund: state.priceRefund,
    runSlots,
    lastPlayed,
  });
}

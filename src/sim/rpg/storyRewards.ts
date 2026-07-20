/**
 * Story-Tour QUEST REWARDS (GS-story-reward-variety) — one generalized reward channel so a quest can hand
 * over ANY kind of prize, not only a club. The design ask: quests were 100% clubs; space them out so a
 * caddy quest might gift a piece of EQUIPMENT (gear), a SPACESHIP PART (a ship upgrade), a whole SHIP, or —
 * still — a signature CLUB, whichever fits that friend's story. The gold standard is Suggestible Sam's
 * "Conviction" (the reward IS the character beat); this module lets every quest reach for that while giving
 * the loot table real variety.
 *
 * PURE + DOM-free. A `StoryReward` is a thin `{ kind, id }` tag; `grantStoryReward` dispatches to the right
 * owning system (club → bag, gear → locker slot, upgrade → fleet, ship → hangar), each of which is
 * idempotent so a recap replay can never double-grant. `rewardEffectLabel` gives the recap/offer card one
 * player-facing "why you want it" line whatever the kind. This is the seam; the quest ROWS pick the reward.
 *
 * Lives ABOVE story.ts (it imports the owning systems, which import story.ts) — no cycle: nothing here is
 * imported by story.ts / storyShips.ts / storyGear.ts / storyShipUpgrades.ts.
 */

import { equipStoryClub, type StoryState } from './story';
import { storyClubEffectLabel } from './storyClubEffects';
import { grantStoryGear, storyGearById } from './storyGear';
import { grantShipUpgrade, shipUpgradeById, upgradeDetail } from './storyShipUpgrades';
import { grantStoryShip, storyShipRow, storyShipDetail } from './storyShips';

/** A quest / major reward, tagged by which owning system grants it. `id` is that system's own id:
 *  club → a `quest:<key>` (NAMED_STORY_CLUBS), gear → `gear:<slot>:<var>`, upgrade → `upg:<cat>:<var>`,
 *  ship → a `ships.ts` hull id. */
export type StoryReward =
  | { kind: 'club'; id: string }
  | { kind: 'gear'; id: string }
  | { kind: 'upgrade'; id: string }
  | { kind: 'ship'; id: string };

/** A quest whose reward is a bag CLUB — the id it slots into `equippedBagIds` as (for the betrayal beat +
 *  the "still swinging it" read). Undefined for a gear/part/ship reward. */
export function rewardClubId(reward: StoryReward): string | undefined {
  return reward.kind === 'club' ? reward.id : undefined;
}

/**
 * Grant a reward onto the campaign (pure): own it (and equip, where the kind equips) through the owning
 * system's own grant, each idempotent. The caller records the quest done separately.
 */
export function grantStoryReward(story: StoryState, reward: StoryReward): StoryState {
  switch (reward.kind) {
    case 'club': {
      const ownedClubIds = story.ownedClubIds.includes(reward.id)
        ? story.ownedClubIds
        : [...story.ownedClubIds, reward.id];
      return equipStoryClub({ ...story, ownedClubIds }, reward.id);
    }
    case 'gear':
      return grantStoryGear(story, reward.id);
    case 'upgrade':
      return grantShipUpgrade(story, reward.id);
    case 'ship':
      return grantStoryShip(story, reward.id);
  }
}

/** Does the player OWN this reward (across whichever system holds it)? — for a "claimed" read. */
export function rewardOwned(story: StoryState, reward: StoryReward): boolean {
  switch (reward.kind) {
    case 'club':
      return story.ownedClubIds.includes(reward.id);
    case 'gear':
      return story.ownedGearIds.includes(reward.id);
    case 'upgrade':
      return story.ownedShipUpgradeIds.includes(reward.id);
    case 'ship':
      return story.ownedShipIds.includes(reward.id);
  }
}

/** One player-facing "here's why you want it" line for the recap / offer card, whatever the reward kind. */
export function rewardEffectLabel(reward: StoryReward): string | undefined {
  switch (reward.kind) {
    case 'club':
      return storyClubEffectLabel(reward.id);
    case 'gear':
      return storyGearById(reward.id)?.detail[0];
    case 'upgrade': {
      const u = shipUpgradeById(reward.id);
      return u ? upgradeDetail(u).join(' · ') : undefined;
    }
    case 'ship': {
      const row = storyShipRow(reward.id);
      return row ? storyShipDetail(row).join(' · ') : undefined;
    }
  }
}

/** A small kind icon for reward cards (🎁 fallback). */
export function rewardKindIcon(reward: StoryReward): string {
  switch (reward.kind) {
    case 'club':
      return '🏌';
    case 'gear':
      return '🎽';
    case 'upgrade':
      return '🛠';
    case 'ship':
      return '🚀';
  }
}

/** A short "what kind of thing is this" tag for the reward card header. */
export function rewardKindLabel(reward: StoryReward): string {
  switch (reward.kind) {
    case 'club':
      return 'Club';
    case 'gear':
      return 'Equipment';
    case 'upgrade':
      return 'Ship part';
    case 'ship':
      return 'Ship';
  }
}

/**
 * Story reward-club SPECIAL EFFECTS (GS-story-club-effects) — a quest/tournament reward club is more than
 * "the next tier": each of the ally gifts and the Galaxy-Tournament prize clubs folds a signature EFFECT
 * onto the round loadout when it's equipped, so the club you earned plays like the story said it would
 * (Sandy's wedge escapes anything; Dan's driver hits from any lie; the Galewarden irons read the wind).
 *
 * Pure loadout fold, the `applyStoryGear` / `applyStoryCaddy` sibling — it reuses existing `PlayerLoadout`
 * fields, so the shot resolver needs NO change and auto ≡ interactive holds (the single run loadout the
 * headless sim and the interactive driver both read). Story rounds ONLY (Voyage/Unending never build a
 * story loadout), and every effect only ever HELPS, so there's no death-spiral concern. A reward club with
 * no row here is unaffected (byte-for-byte the plain resolved club).
 */

import type { PlayerLoadout } from './economy';
import type { StoryState } from './story';

/** A reward club's signature effect: a short player-facing `label` + a pure loadout fold. Keyed by the
 *  OWNED club id (`quest:<key>` / `major:<key>`). */
export interface StoryClubEffect {
  label: string;
  apply: (m: PlayerLoadout) => PlayerLoadout;
}

export const STORY_CLUB_EFFECTS: Record<string, StoryClubEffect> = {
  // ── Ally side-quest CLUB gifts (GS-story-reward-variety: the ally quests that reward a club; Dan/Chipinski/
  //    Mole/Ouros/Ecdysis now give a ship part or gear, whose effect lives in their own catalogue). ──
  'quest:sandy': {
    label: 'No unplayable lie — strong lie relief from anywhere',
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.5) }),
  },
  'quest:penelope': {
    label: 'Reads honest and long — putt boost + a longer confident read',
    apply: (m) => ({ ...m, puttBoost: m.puttBoost + 0.22, puttReadBonus: (m.puttReadBonus ?? 0) + 12, greenRead: true }),
  },
  'quest:sam': {
    label: 'Flies dead straight — tighter dispersion',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.82, windResist: (m.windResist ?? 0) + 0.15 }),
  },
  // ── Coil inner-circle CLUB gifts (GS-story-herald-quests) — each plays like the Coil agent who gave it. ──
  'quest:voss': {
    label: 'Drives from ANY lie — and a raised distance floor',
    apply: (m) => ({ ...m, driverAnywhere: true, minCarryBoost: m.minCarryBoost + 0.08 }),
  },
  'quest:venoma': {
    label: 'Strikes dead straight — tighter dispersion + wind resistance',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.82, windResist: (m.windResist ?? 0) + 0.15 }),
  },
  // ── Galaxy-Tournament (major) prize clubs ──
  'major:emerald': {
    label: 'Utterly reliable — tighter dispersion',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.9 }),
  },
  'major:ember': {
    label: 'Longer than anything you own — a raised driver distance floor',
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.1 }),
  },
  'major:storm': {
    label: 'Reads the wind true — strong wind resistance',
    apply: (m) => ({ ...m, windResist: (m.windResist ?? 0) + 0.5 }),
  },
  // GS-story-quality: the Galewarden Irons are a matched SET (5·7·9). The flagship 5 carries the wind read;
  // the 7 + 9 add a touch of CONTROL (tighter dispersion) rather than more wind, so the set never over-stacks
  // the wind bonus but every member still earns its place.
  'major:storm:7i': {
    label: 'A matched Galewarden iron — a little extra control',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.95 }),
  },
  'major:storm:9i': {
    label: 'A matched Galewarden iron — a little extra control',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.95 }),
  },
  // ── Friend SIGNATURE clubs (GS-story-charquests) — each plays like the golfer who gave it. ──
  'charquest:feather-fade': {
    label: 'Rides the crosswind — tighter dispersion + wind resistance',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.88, windResist: (m.windResist ?? 0) + 0.2 }),
  },
  'charquest:huang-woo-hook': {
    label: 'A surgeon’s iron — dead straight to the flag',
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.8 }),
  },
  'charquest:longshot-larry': {
    label: 'Sends it low and forever — a raised distance floor',
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.1 }),
  },
  'charquest:backspin-bo': {
    label: 'Lands soft and checks — backspin + a longer spin read',
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.1, spinReadBonus: (m.spinReadBonus ?? 0) + 10 }),
  },
};

/** The signature-effect label for a reward club id, or undefined if it has none. */
export function storyClubEffectLabel(id: string): string | undefined {
  return STORY_CLUB_EFFECTS[id]?.label;
}

/** Does this owned club id carry a signature effect? */
export function hasStoryClubEffect(id: string): boolean {
  return id in STORY_CLUB_EFFECTS;
}

/**
 * Fold every EQUIPPED reward club's signature effect onto a round loadout (pure). Story rounds ONLY —
 * called at tee-off after the bag + gear + caddy are set (the `applyStoryGear`/`applyStoryCaddy` sibling).
 * A bag with no special clubs is a no-op (byte-for-byte the incoming loadout).
 */
export function applyStoryClubEffects(loadout: PlayerLoadout, story: StoryState): PlayerLoadout {
  let out = loadout;
  for (const id of story.equippedBagIds) {
    const fx = STORY_CLUB_EFFECTS[id];
    if (fx) out = fx.apply(out);
  }
  return out;
}

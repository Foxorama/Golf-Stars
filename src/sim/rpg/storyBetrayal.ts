/**
 * Story Tour — the BETRAYAL branch (GS-story-betrayer). The heart of the deep arc: after The Choice, WHO
 * turns on you is decided by the partners you picked for the two team Sigils (Scramble Ch.1 / Best-ball
 * Ch.2). This module is the single pure source for the betrayer's identity and the Ch.5 finale team
 * make-up, so every beat (Warden/Herald), the finale resolution, and the costume swap read one truth.
 *
 * THE ODD-ONE-OUT RULE (confirmed design):
 *   • Two DIFFERENT partners across Sigils 1 & 2 → the ONE friend you NEVER picked is the odd one out.
 *   • The SAME partner both times → the friend you TRUSTED most is the odd one out (the twist).
 * So the betrayer is always the friend who stands apart: the lone unpicked, or — if you were loyal to one
 * — that one.
 *
 * PER PATH:
 *   • WARDEN (you stayed true) — the odd-one-out DEFECTS to the Coil (corrupted costume). The Ch.5 finale
 *     is 2v2 best-ball matchplay: You + a LOYAL friend vs (the Betrayer + a Coil champion).
 *   • HERALD (you turned) — YOU are the traitor; your former friends come for you. The Ch.5 finale is 2v2:
 *     You + the top Coil champion who isn't your guide vs the two friends who partnered you.
 *
 * PURE + DOM-free (no rng, no window). Consumers: the interlude/beats (G/H), the 2v2 finale resolution
 * (storyTeams), and the clubhouse/finale costume (`corruptedLookOpts`). Reads only `StoryState`.
 */

import { getCharacter, type Character } from './characters';
import { otherGolferIds } from './storyCast';
import type { StoryState } from './story';

/** The two team-Sigil partner picks that are actually valid roster friends (locked by Ch.4). */
function validPicks(story: StoryState): string[] {
  const others = otherGolferIds(story);
  return [story.sigil1Partner, story.sigil2Partner].filter((x): x is string => !!x && others.includes(x));
}

/**
 * The BETRAYER — the odd one out of your two partner picks (pure). Two different partners → the unpicked
 * friend; the same partner twice → that trusted friend. Falls back to your first tour-mate if no team
 * Sigil has been played yet (the betrayer is only read from Ch.4 on, when both picks are locked).
 */
export function betrayerId(story: StoryState): string {
  const others = otherGolferIds(story);
  const picks = validPicks(story);
  if (picks.length === 0) return others[0] ?? story.characterId;
  const distinct = [...new Set(picks)];
  if (distinct.length >= 2) {
    // two different partners → the one you never picked betrays
    return others.find((id) => !distinct.includes(id)) ?? distinct[0]!;
  }
  // the same partner both times (or only one pick recorded) → that trusted friend betrays
  return distinct[0]!;
}

/** The betrayer as a `Character` (for portraits/dialogue). */
export function betrayerCharacter(story: StoryState): Character | undefined {
  return getCharacter(betrayerId(story));
}

/**
 * Your LOYAL friend ally for the WARDEN Ch.5 finale (pure): a friend who is NOT the betrayer. Prefer one
 * you actually PARTNERED (your Sigil-2 pick, then Sigil-1), so the friend at your side is one you chose;
 * else the first loyal tour-mate.
 */
export function loyalAllyId(story: StoryState): string {
  const betrayer = betrayerId(story);
  const loyal = otherGolferIds(story).filter((id) => id !== betrayer);
  const partnered = [story.sigil2Partner, story.sigil1Partner].find((id) => !!id && id !== betrayer && loyal.includes(id));
  return partnered ?? loyal[0] ?? story.characterId;
}

/**
 * The two FORMER FRIENDS who oppose you in the HERALD Ch.5 finale (pure) — the friends who trusted you.
 * Two different partners → both of them; the same partner twice → that one friend PLUS a tour-mate you
 * spurned (so the one you always picked AND one you never did both come for you). Always two ids.
 */
export function heraldOpponentIds(story: StoryState): [string, string] {
  const others = otherGolferIds(story);
  const distinct = [...new Set(validPicks(story))];
  if (distinct.length >= 2) return [distinct[0]!, distinct[1]!];
  if (distinct.length === 1) {
    const spurned = others.find((id) => id !== distinct[0]);
    return [distinct[0]!, spurned ?? others.find((id) => id !== distinct[0]) ?? others[0]!];
  }
  return [others[0] ?? story.characterId, others[1] ?? story.characterId];
}

// ── The Coil champion who partners you on the Herald finale / opposes you on the Warden finale ──────────

/** The two top Coil champions (their lore-portrait / ghost ids). */
export const COIL_CHAMPIONS = ['voss', 'venoma'] as const;
export type CoilChampionId = (typeof COIL_CHAMPIONS)[number];

/** The top Coil champion who ISN'T your active guide (GS-story-betrayer): on the Herald finale this is the
 *  champion who partners YOU; pass your active caddy/guide id (a herald agent id) to exclude them. Falls
 *  back to Voss (the Apostate, your mentor) when neither/both match. */
export function coilChampionExcluding(activeGuideId?: string): CoilChampionId {
  return COIL_CHAMPIONS.find((id) => id !== activeGuideId) ?? 'voss';
}

/** Display names for the Coil champions (used in finale copy + pair labels). */
export function coilChampionName(id: CoilChampionId): string {
  return id === 'venoma' ? 'Venoma "the Viper" Krait' : 'Malachai "Sable" Voss';
}

// ── The corrupted (Coil) costume for a defector (GS-story-betrayer) ────────────────────────────────────

/** Deep Coil-violet garb + an acid-green accent — the shed-scale look a defector wears. Keeps the golfer's
 *  own HAIR (identity is above the neck, per the avatar rule) so they still read as themselves, corrupted. */
export const COIL_SHIRT = '#2e1840';
export const COIL_ACCENT = '#7fe0a0';
/** A CSS filter that venom-shifts a normal golfer figure toward the Coil palette (for the standee tint). */
export const COIL_FIGURE_TINT = 'saturate(1.15) hue-rotate(258deg) brightness(0.92)';

/** `golferPreviewSVG` opts that draw a golfer in corrupted Coil garb (their hair kept). */
export function corruptedLookOpts(character: Character): { skin: string; shirtBase: string; capColor: string; hair: Character['style']['hair'] } {
  return { skin: character.style.skin, shirtBase: COIL_SHIRT, capColor: COIL_ACCENT, hair: character.style.hair };
}

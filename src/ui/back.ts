/**
 * The BACK gesture (GS-android-back) — one pure decision for every way "back" can be pressed.
 *
 * Android's hardware back button is not optional furniture: a game that ignores it closes itself
 * from any screen, mid-round included, which reads as a crash. But back also must not become a
 * second, sloppier navigation system — so this module is the SINGLE source that answers "what does
 * back mean right now", and the Capacitor back button, the desktop Escape key, and any future
 * on-screen back arrow all route through it. No forks.
 *
 * It is PURE — no DOM, no Capacitor import, no dispatch — so `tests/back.test.ts` can assert the
 * whole policy, including the exhaustiveness check below.
 *
 * FOUR TIERS, in strict precedence order (`backIntent` walks them top-down):
 *
 *  0. **Dismiss the topmost layer.** Back closes whatever is stacked over the screen — the exit
 *     confirm itself, the settings sheet, an inspect/lore overlay — before it ever navigates. This
 *     is the bulk of the value and never prompts.
 *  1. **Navigate to the parent.** Screens that already own a back affordance reuse the EXACT action
 *     their on-screen button dispatches, so back can never land somewhere the UI itself wouldn't.
 *  2. **Swallow.** Forward-only beats (lore, boss reward, results, The Choice) absorb back and do
 *     nothing. Deliberate: letting back skip a beat would let a player dodge a reward pick and would
 *     desync `seenStoryBeats`. One dead press beats a corrupted campaign.
 *  3. **Confirm, then leave.** Only inside a run. Note that `toTitle` is already NON-destructive —
 *     it parks an active run as `resumable` — so the confirm is not a data-loss warning; it exists
 *     because leaving mid-stop replays that stop from its first hole (`exitPrompt` says exactly that,
 *     and says the truthful other thing for a strokeplay round, which resumes on its current hole).
 *
 * `title` is the ONE screen where back exits the app. Nowhere else may close the game.
 */
import type { Action, Screen, UiState } from './gameState';
import { STROKEPLAY_FORMAT } from '../sim/rpg/formats';

/** What the caller should do about a back press. */
export type BackIntent =
  /** Close a stacked overlay by dispatching `action` (tier 0). */
  | { kind: 'dismiss'; action: Action }
  /** Close the settings sheet — app-layer module state, so there is no Action to dispatch (tier 0). */
  | { kind: 'closeSettings' }
  /** Close the play screen's club picker (GS-hud-bag) — app-layer module state, like the settings
   *  sheet, so again there is no Action (tier 0). */
  | { kind: 'closeClubPicker' }
  /** Go to this screen's parent by dispatching `action` (tier 1). */
  | { kind: 'navigate'; action: Action }
  /** A forward-only beat: absorb the press and do nothing (tier 2). */
  | { kind: 'swallow' }
  /** Raise the leave-the-round confirm by dispatching `action` (tier 3). */
  | { kind: 'confirm'; action: Action }
  /** Only from the title: close the app. */
  | { kind: 'exitApp' };

/** Side-effect-layer flags `backIntent` needs but `UiState` doesn't hold. `settingsOpen` is module
 *  state in `app.ts` (the sheet is deliberately outside the reducer), so the caller passes it in
 *  rather than this module reaching for the DOM. */
export interface BackContext {
  settingsOpen?: boolean;
  /** The play screen's club picker sheet (GS-hud-bag) — module state in `app.ts` for the same reason. */
  clubPickerOpen?: boolean;
}

/**
 * The screen → parent map (tier 1/2/3). Split out from `backIntent` so the exhaustiveness of the
 * `Screen` union is checked in ONE place: the `never` fallthrough below means adding a screen to
 * `Screen` fails to COMPILE until someone decides what back does on it — the same compile-forced
 * discipline the archetype-keyed render tables use. Do not replace it with a lookup object; a
 * `Record<Screen, …>` would be satisfied by a wrong-but-present entry, and several screens need to
 * read `state`.
 */
function screenIntent(state: UiState): BackIntent {
  const screen: Screen = state.screen;
  switch (screen) {
    // ── The one exit ────────────────────────────────────────────────────────────────────────────
    case 'title':
      return { kind: 'exitApp' };

    // ── In a run: confirm before leaving ────────────────────────────────────────────────────────
    case 'intro':
      // At the very first tee nothing has been played and the intro itself offers "‹ Change golfer"
      // (introScreens.ts gates that button on the same `stopIndex === 0`), so back mirrors it rather
      // than threatening to end a run that hasn't started. Deeper in, it's a real exit.
      return state.run.stopIndex === 0
        ? { kind: 'navigate', action: { type: 'backToCharacter' } }
        : { kind: 'confirm', action: { type: 'requestExit' } };
    case 'playing':
      return { kind: 'confirm', action: { type: 'requestExit' } };

    // ── Screens with a real parent ──────────────────────────────────────────────────────────────
    case 'character':
      return { kind: 'navigate', action: { type: 'toTitle' } };
    case 'gameover':
      // Terminal: the run is already over, so there is nothing to park and nothing to confirm.
      return { kind: 'navigate', action: { type: 'toTitle' } };
    case 'trademarket':
      return { kind: 'navigate', action: { type: 'closeMarket' } };
    case 'clubhouseHall':
      return { kind: 'navigate', action: { type: 'closeClubhouseHall' } };
    case 'clubhouse':
      // Back to the HALL, not the title — `clubhouse` is one golfer's stage inside it.
      return { kind: 'navigate', action: { type: 'clubhouseBackToHall' } };
    case 'starTour':
      // One screen, two contexts (GS-story-map reuses the Star Tour map inside a campaign). The
      // reducer discriminates on `state.story` exactly like `exitStoryMap`'s own guard does.
      return state.story
        ? { kind: 'navigate', action: { type: 'exitStoryMap' } }
        : { kind: 'navigate', action: { type: 'exitStarTour' } };
    case 'story':
      return { kind: 'navigate', action: { type: 'exitStory' } };
    case 'storyShop':
      return { kind: 'navigate', action: { type: 'exitStoryShop' } };
    case 'storyLocker':
      return { kind: 'navigate', action: { type: 'exitStoryLocker' } };
    case 'storyShipyard':
      return { kind: 'navigate', action: { type: 'exitStoryShipyard' } };
    case 'shipInterior':
      return { kind: 'navigate', action: { type: 'exitShipInterior' } };
    case 'storyTournament':
      return { kind: 'navigate', action: { type: 'exitStoryTournament' } };
    case 'storyFinale':
      return { kind: 'navigate', action: { type: 'exitStoryFinale' } };
    case 'storyBar':
      return { kind: 'navigate', action: { type: 'exitStoryBar' } };

    // ── Forward-only: results, rewards and story beats absorb back ───────────────────────────────
    // These advance the run/campaign when dismissed, so treating back as "continue" would let a
    // player skip a boss-reward pick or a one-shot beat. They are also all screens the flow put you
    // on, not places you navigated to, so there is no parent to return to.
    case 'result':
    case 'strokeResult':
    case 'bossReward':
    case 'shop':
    case 'starmart':
    case 'travel':
    case 'asgardMap':
    case 'asgardResult':
    case 'lore':
    case 'storyResult':
    case 'storyTournamentResult':
    case 'storyTournamentAftermath':
    case 'storyTournamentPop':
    case 'storyMidBeat':
    case 'storyQuestBeat':
    case 'storyQuestOffer':
    case 'storyFinaleResult':
    case 'storyChoice':
    case 'storyInterlude':
      return { kind: 'swallow' };

    default: {
      // Exhaustiveness guard — see the doc comment. If this line errors, a new Screen was added
      // without deciding what back does on it.
      const exhaustive: never = screen;
      return exhaustive;
    }
  }
}

/**
 * What a back press means right now. Walks the tiers in precedence order: stacked layers first
 * (newest to oldest), then the screen itself.
 */
export function backIntent(state: UiState, ctx: BackContext = {}): BackIntent {
  // Tier 0, innermost first. The exit confirm is the newest layer, so back cancels it rather than
  // confirming — a second back press must never be able to leave the round.
  if (state.pendingExit) return { kind: 'dismiss', action: { type: 'cancelExit' } };
  // The club picker is raised FROM the play screen and the settings sheet inerts it, so the two are
  // never both live; it is listed first because it is the innermost thing a play-screen back can mean.
  if (ctx.clubPickerOpen) return { kind: 'closeClubPicker' };
  if (ctx.settingsOpen) return { kind: 'closeSettings' };
  if (state.characterLoreId) return { kind: 'dismiss', action: { type: 'closeCharacterLore' } };
  if (state.storyInspectId) return { kind: 'dismiss', action: { type: 'storyCloseInspect' } };
  if (state.storyItemInspectId) return { kind: 'dismiss', action: { type: 'storyCloseItem' } };
  if (state.storyAllyInspectId) return { kind: 'dismiss', action: { type: 'storyCloseAlly' } };
  if (state.pendingFireCaddy) return { kind: 'dismiss', action: { type: 'cancelFireCaddy' } };

  return screenIntent(state);
}

/**
 * The copy for the leave-the-round confirm. Lives here (not in the renderer) so the wording is
 * derived from the SAME state the intent is, and so a test can assert it stays truthful.
 *
 * It deliberately does not say "you will lose your run", because that is false — `toTitle` parks an
 * active run as `resumable`. What it says instead is the thing that IS true, which differs by
 * format: a strokeplay round carries its hole index (GS-star-tour-resume), while a Voyage/Unending
 * stop restarts from its first hole.
 */
export function exitPrompt(state: UiState): { title: string; body: string; confirmLabel: string } {
  const keepsHole = state.run.formatId === STROKEPLAY_FORMAT;
  return {
    title: 'Leave this round?',
    body: keepsHole
      ? 'Your round is saved — you’ll pick up on this hole.'
      : 'Your run is saved — you’ll restart this stop from its first hole.',
    confirmLabel: 'Leave round',
  };
}

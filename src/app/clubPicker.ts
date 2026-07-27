/**
 * The CLUB PICKER sheet (GS-hud-bag) — the whole bag, one tap away, behind the play screen's
 * bottom-right golf bag.
 *
 * It replaces the aim HUD's club CYCLER. The cycler was one tap per club: reaching a sand wedge from
 * the driver in a full bag was a dozen taps, and it had to live in a panel wide enough to hold a club
 * NAME between two arrows — the panel that was eating a quarter of a phone screen. A sheet costs one
 * tap to open, shows every legal club at once with the number that decides the choice (its carry),
 * and gives the corner of the screen back to the golf.
 *
 * What it deliberately does NOT do is hand out reads the player has not paid for. Each row carries
 * the club's own nominal carry — a bag stat, printed on the Pro Shop card the club was bought from —
 * and nothing about THIS shot. The green-depth + forced-carry read at the top is Suggestible Sam's
 * (`clubSuggest`), exactly as it was on the old HUD line, and the ★ that marks the suggested club is
 * Sam's too. Without Sam the sheet is a bag, not an adviser.
 *
 * Chrome is the shared `.gs-sheet` bottom sheet, so it inherits the safe-area/scroll/`safe center`
 * rules (GS-a11y-sheet-scroll) and — because it is rendered as a DIRECT child of `#app` — the whole
 * dialog/focus/inert pass for free (GS-a11y-focus). That also silences the play screen's arrow-key
 * aiming while it is open: `onPlayKey` bails on `#app > [inert]`.
 */

import { state } from './ctx';
import { clubGlyphSVG } from '../render/bagArt';
import { clubFamilyOf } from '../render/itemArt';
import { hazardLabel } from './playHud';
import { dist } from '../sim/course/contract';
import { forcedCarry, greenDepth, pinOf } from '../sim/round';
import { usableBag } from '../sim/rpg/economy';
import type { Club } from '../sim/clubs';

/** Rarity tint for a club row's glyph — a legendary stick reads as one in the bag, like everywhere else. */
const RAR_COL: Record<string, string> = {
  common: '#c9d2e0',
  rare: '#6fb1ff',
  epic: '#c07dff',
  legendary: '#ffd24a',
};

export interface ClubPickerOpts {
  /** The club currently on the shot — highlighted, and the sheet's initial focus. */
  selectedId: string | null;
  /** Suggestible Sam is on the bag: show the ★ suggestion + the green-depth/carry read. */
  hasSuggest: boolean;
  /** Sam's pick for this position (only shown when `hasSuggest`). */
  suggestedId?: string;
  /** The ball is on the fringe/apron, so "putt it instead" is a legal choice here (GS-fringe-putt). */
  canPuttFringe: boolean;
}

/** One club as a big tappable card: family glyph · name · carry.
 *
 *  The displayed name carries a NON-BREAKING hyphen: at two columns on a phone a row is ~170px and
 *  "3-Hybrid" fits comfortably, but CSS breaks a line after a hyphen by default, so it wrapped to a
 *  ragged "3-⏎Hybrid" while the two-WORD names ("Pitching Wedge") wrapped sensibly at their space.
 *  Held here rather than in the club table because it is a typographic fact about this card, not
 *  about the club — `Club.name` stays the plain string every other screen prints. */
function clubRow(c: Club, selected: boolean, suggested: boolean): string {
  const col = RAR_COL[c.rarity ?? 'common'] ?? RAR_COL.common!;
  return `<button class="gs-clubpick__club${selected ? ' gs-clubpick__club--on' : ''}" data-clubpick-id="${c.id}"
      aria-pressed="${selected}" title="${c.name} — ${c.carry}y carry">
      <span class="gs-clubpick__glyph">${clubGlyphSVG(clubFamilyOf(c.id), col!)}</span>
      <span class="gs-clubpick__name">${c.name.replace(/-/g, '‑')}</span>
      <span class="gs-clubpick__carry">${c.carry}y</span>
      ${suggested ? `<span class="gs-clubpick__star" title="Sam's pick">★</span>` : ''}
    </button>`;
}

/**
 * The sheet. Pure string builder off `state` + the caller's view state, so it can be concatenated
 * into `render()` beside the settings sheet.
 */
export function clubPickerOverlay(opts: ClubPickerOpts): string {
  const play = state.play;
  if (!play) return '';
  const bag = usableBag(state.run.loadout.bag, play.lie, state.run.loadout.driverAnywhere ?? false);
  // Sam's read — the one thing on this sheet that is about THIS shot, and it is a paid perk.
  let read = '';
  if (opts.hasSuggest && play.lie !== 'green') {
    const gd = greenDepth(play.hole, play.ball);
    const fc = forcedCarry(play.hole, play.ball, pinOf(play.hole));
    const carryTxt = fc ? ` · <span style="color:var(--gs-warn);">⚠ carry <b>${fc.carry}</b> ${hazardLabel(fc.kind)}</span>` : '';
    read = `<div class="gs-clubpick__read">🎒 front <b>${Math.round(gd.front)}</b> · pin <b>${Math.round(dist(play.ball, play.hole.green))}</b> · back <b>${Math.round(gd.back)}</b>y${carryTxt}</div>`;
  }
  const fringe = opts.canPuttFringe
    ? `<button class="gs-clubpick__club gs-clubpick__club--putt" data-putt-toggle="1" data-clubpick="close" title="Putt from the fringe with the pace meter">
        <span class="gs-clubpick__glyph">⛳</span>
        <span class="gs-clubpick__name">Putt it</span>
        <span class="gs-clubpick__carry">fringe</span>
      </button>`
    : '';
  return `
    <div class="gs-sheet-backdrop" data-clubpick="close">
      <div class="gs-sheet gs-clubpick" data-clubpick="keep">
        <div class="gs-sheet-head">
          <b style="font-size:17px;">🎒 The bag</b>
          <button class="gs-btn gs-mini" data-clubpick="close" aria-label="Close the bag">✕</button>
        </div>
        ${read}
        <div class="gs-clubpick__grid">
          ${fringe}
          ${bag.map((c) => clubRow(c, c.id === opts.selectedId, opts.hasSuggest && c.id === opts.suggestedId)).join('')}
        </div>
      </div>
    </div>`;
}

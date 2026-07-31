/**
 * The ONE persistent play-screen HUD frame (GS-hud-frame).
 *
 * The play screen has six view states — shot / chip aim, their watch animations, and the putt +
 * putt-watch — and before this module each one built its OWN layout. The map/zoom/settings column
 * existed while aiming and VANISHED on the putt and watch screens; the caddy badge floated wherever
 * there was room (and disappeared entirely mid-flight); the controls panel changed shape and height
 * every state. A player learning where a button lives had to relearn it three times a hole.
 *
 * So the frame is fixed and the CONTENTS change. Every state mounts the same five regions, in the
 * same places:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [info bar ······················] [nav]  │  top: mapTopInfo · right: the nav column
 *   │                                          │
 *   │                 (map)                    │
 *   │                                          │
 *   │                                   [ ◎ ]  │  action column, bottom-anchored
 *   │                                   [ » ]  │
 *   │ [caddy] [ rows…                 ] [bag]  │  bottom: caddy slot · panel · action column
 *   │         [ COMMIT                ]        │
 *   └──────────────────────────────────────────┘
 *
 * Three rules make it hold:
 *  - **Nothing is ever removed, only disabled.** A control that can't act in this state renders in
 *    its usual place, greyed (`[disabled]`), so no button ever moves or vanishes between states.
 *  - **The panel is bottom-anchored and the COMMIT row is last**, so the thumb-critical row (commit ·
 *    caddy · bag) sits at the same y in all six states even though the rows above it differ in height
 *    (a pace meter is simply taller than a power bar).
 *  - **The action column grows UPWARD from the bag.** The bag is the bottom-most, most-tapped cell;
 *    auto-finish and the aim mode stack above it, and a conditional button (the re-aim-at-pin 🎯)
 *    lands above those — so nothing that is present in every state ever changes position.
 *
 * GS-hud-bag reshaped the aim state around this: the club cycler, the power bar, the spray-odds
 * legend and the carry range came OUT of the panel (they restated the aim cone drawn on the map, in
 * a block that cost a quarter of a phone screen), the club moved to the bag + its picker sheet, and
 * the power read moved onto the commit button itself. The aim/watch panel is now a single commit
 * row; the PUTT panel KEEPS its rows — its pace meter and break read are the only readouts on the
 * screen that the map does not already draw — and GS-putt-panel repainted them in the same language
 * (an instrument pod for the aim, quiet nudges, a caption for the read, and the tap instruction
 * drawn on the meter itself instead of a prose row).
 *
 * Class namespace: the play screen's own `.gs-hud*` / `.gs-mapctrl` / `.gs-caddybadge` prefixes,
 * extended — never another screen's (see the #353 `.gs-hud` map-blur regression in CLAUDE.md).
 *
 * Pure string builders: no DOM, no state reads, no rng. app.ts owns the play view-state and passes
 * it in; the wiring (`data-*` handlers) is unchanged, so every existing listener still finds its
 * button.
 */

import { caddyBadgeHTML } from './helpers';
import { golfBagSVG } from '../render/bagArt';

/** Which of the three shapes the play screen is in. `aim` covers the full-shot AND chip decisions,
 *  `watch` covers both the shot and putt animations — the frame is the same either way. */
export type PlayFrameMode = 'aim' | 'putt' | 'watch';

export interface PlayFrameParts {
  mode: PlayFrameMode;
  /** The full-bleed `.gs-bigmap` element — built by the caller (SVG map or the animation mount). */
  map: string;
  /** The floating top info bar (`mapTopInfo`). */
  top: string;
  /** Panel rows above the commit button, top → bottom. Empty strings are dropped. */
  rows: string[];
  /** The panel's bottom-most primary action button — always present, disabled when it can't fire. */
  commit: string;
  /** What the keyboard does in THIS state, as one sentence, announced with the commit button
   *  (GS-a11y-stroke-focus). The stroke is aimed and powered by keys that live on `window`, not on
   *  any control, so nothing on the screen said they existed — the drawn aim cone is the whole
   *  affordance and it is invisible to a screen reader. Required, so a new play state has to decide
   *  what its keys do; `''` for a state with no decision left to make (the watch animations). */
  commitHint: string;
  /** The caddy on the bag, for the permanent slot. Undefined ⇒ the empty reserved slot. */
  caddyId?: string;
  /** True when the caddy is on the bag but has no role in THIS state (e.g. Driver Dan on the green):
   *  the slot keeps its place and the portrait dims, rather than the badge disappearing. */
  caddyOffDuty?: boolean;
  /** Nav column: which view the map is in and which halves can act. The view toggle is dead on a
   *  fixed-frame screen (the putt map is framed on the ball↔cup span, the watch map on the follow-cam)
   *  — it stays in place, greyed. The ⚙ is live wherever a re-render is safe, which is everywhere
   *  except mid-animation. */
  nav: { whole: boolean; viewDisabled: boolean; settingsDisabled: boolean };
  /** Auto-finish (`»`) — always rendered, disabled while a shot animates. */
  autoFinishDisabled: boolean;
  /** The golf bag (GS-hud-bag) — the club control, and the anchor of the action column. Required, so
   *  a new play state has to decide what the bag says rather than quietly dropping it. */
  bag: {
    /** Short club code for the face of the bag ('D', '7i', 'SW') — a full name never fits 56px. */
    code: string;
    /** The full club name, for the tooltip and the accessible name. */
    name: string;
    /** How many sticks the drawn bag shows — the player's own bag size. */
    clubs: number;
    /** The golfer's colour, so the corner matches the cap / tracer / caddy frame. */
    tint?: string;
    /** No club to change here (mid-flight, or on the green with the flat stick). */
    disabled: boolean;
  };
  /** The aim-mode cycler (GS-default-aim) — auto ◎ / attack 🚩 / safe 🛟. Disabled where aim isn't a
   *  choice (the putt has its own ◄/► line, the watch state has no decision left to make). */
  aim: { icon: string; label: string; on: boolean; disabled: boolean };
  /** Conditional round buttons for the TOP of the action column (today: the re-aim-at-pin 🎯, which
   *  only exists once the player has dragged the aim off the pin). Never the permanent three. */
  extraActions?: string;
  /** Left-handed mode (GS-lefty): mirrors the whole frame. */
  lefty: boolean;
  /** Overlays appended after the frame (shot popup, scramble choice). */
  after?: string;
}

/**
 * The map navigation column — now TWO buttons (GS-hud-compass): the whole-hole TOGGLE and the ⚙.
 *
 * It used to be five: whole-hole/follow, ＋, －, recenter, settings. That is four controls for one
 * axis, and on a touch screen three of them are redundant — the map already takes a two-finger pinch
 * for a custom zoom. So the whole-hole view becomes a latching toggle exactly like the aim mode: ON
 * you see the hole, OFF you are back at the default follow-cam. Turning it off also RESETS zoom and
 * pan, which is what the old ⌖ recenter did — so nothing was lost, it was folded in. Custom zoom is
 * pinch (touch) or ⌘/Ctrl-wheel (desktop).
 */
function navColumnHTML(nav: PlayFrameParts['nav']): string {
  return `
    <div class="gs-mapctrl">
      <button class="gs-mapbtn${nav.whole ? ' gs-mapbtn--on' : ''}" data-mapview="toggle" aria-pressed="${nav.whole}" title="${nav.whole ? 'Back to the ball (resets zoom)' : 'See the whole hole'}"${nav.viewDisabled ? ' disabled' : ''}>🗺</button>
      <button class="gs-mapbtn" data-open-settings="1" title="Settings"${nav.settingsDisabled ? ' disabled' : ''}>⚙</button>
    </div>`;
}

/**
 * The caddy's permanent slot — a fixed cell in the bottom bar that exists in all six states
 * (GS-hud-frame). Before this the badge rode the aim + putt screens only, and the putt screen showed
 * it ONLY for a putting specialist, so the bar's left edge jumped around as you played the hole.
 *
 * Now the box is always the same box:
 *  - a caddy on the bag ⇒ the framed gold badge, dimmed (`--off`) in a state where that caddy has no
 *    job — they're still on your bag, they just aren't reading this shot;
 *  - no caddy at all ⇒ a quiet dashed placeholder, so the frame is identical and the empty slot
 *    advertises the hire.
 */
function caddySlotHTML(id: string | undefined, offDuty: boolean): string {
  const badge = caddyBadgeHTML(id);
  if (!badge) {
    return `<div class="gs-hud-caddy gs-hud-caddy--empty" title="No caddy on the bag — hire one at a Star Mart"><span class="gs-hud-caddyglyph">🎒</span><span class="gs-hud-caddylab">No caddy</span></div>`;
  }
  return `<div class="gs-hud-caddy${offDuty ? ' gs-hud-caddy--off' : ''}"${offDuty ? ' title="On your bag — no read on this one"' : ''}>${badge}</div>`;
}

/**
 * The action column: the BAG in flow at the bottom, with the aim mode, auto-finish and any
 * conditional button STACKED ABOVE IT, over the map (GS-hud-bag).
 *
 * The stack floats deliberately. `.gs-hud-bottom`'s height is what the camera measures as the map's
 * clear band (GS-play-hud-space), so a three-button column left in flow would be 170px tall and hand
 * back barely any of the screen this feature exists to recover — the bar would be as deep as the
 * control panel it replaced. In flow the bar is one badge tall (66px: the caddy and the bag); the
 * stack floats above it like the tight-fit treatment of the flanks, and the ball is drawn centred
 * between them, never behind them.
 */
function actionColumnHTML(p: PlayFrameParts): string {
  const bag = p.bag;
  return `
    <div class="gs-hud-actions">
      <div class="gs-hud-actionstack">
        ${p.extraActions ?? ''}
        <button class="gs-roundbtn gs-glass${p.aim.on ? ' gs-roundbtn--on' : ''}" data-aimmode="1" title="Aim: ${p.aim.label} — tap to change" aria-label="Aim mode: ${p.aim.label}. Tap to change."${p.aim.disabled ? ' disabled' : ''}>${p.aim.icon}</button>
        <button class="gs-roundbtn gs-glass" data-action='${JSON.stringify({ type: 'autoShotHole' })}' title="Auto-finish this hole"${p.autoFinishDisabled ? ' disabled' : ''}>»</button>
      </div>
      <button class="gs-hud-bagbtn gs-glass" data-clubpick="open" title="${bag.name} — tap the bag to change club" aria-label="Club: ${bag.name}. Open the bag to change club."${bag.disabled ? ' disabled' : ''}>
        <span class="gs-hud-bagart">${golfBagSVG({ tint: bag.tint, clubs: bag.clubs, muted: bag.disabled })}</span>
        <span class="gs-hud-bagclub">${bag.code}</span>
      </button>
    </div>`;
}

/** The id the commit button's `aria-describedby` points at — one node, one name, so a state cannot
 *  describe its keys under a spelling nothing reads. */
export const STROKE_KEYS_ID = 'gs-stroke-keys';

/**
 * Compose the whole play screen from the fixed frame + this state's contents.
 *
 * DOM ORDER IS TAB ORDER, and the stroke is the game (GS-a11y-stroke-focus). The nav column used to
 * be emitted SECOND — so 🗺 and ⚙, the two least-used controls on the screen, were the first two tab
 * stops of every single shot, and the Swing button was third at best and sixth on a green. It is
 * emitted LAST now: it is `position:absolute` with its own `z-index`, so where it sits in the string
 * decides nothing but the tab order it hands the keyboard. Combined with `focusPlayStroke` (which
 * puts focus ON the commit button as each stroke's decision mounts) the keyboard now arrives at the
 * stroke and tabs OUTWARD from it — commit, then the shot-shaping column, then the map furniture.
 */
export function playFrameHTML(p: PlayFrameParts): string {
  const rows = p.rows.filter(Boolean).join('');
  return `
    <div class="gs-shot gs-shot--full${p.lefty ? ' gs-shot--lefty' : ''}" data-playmode="${p.mode}">
      ${p.map}
      ${p.top}
      <div class="gs-hud gs-hud-bottom">
        ${caddySlotHTML(p.caddyId, !!p.caddyOffDuty)}
        <div class="gs-hud-controls gs-glass${rows ? '' : ' gs-hud-controls--slim'}">
          ${rows}
          <div class="gs-hud-commit">${p.commit}${p.commitHint ? `<span class="gs-sr-only" id="${STROKE_KEYS_ID}">${p.commitHint}</span>` : ''}</div>
        </div>
        ${actionColumnHTML(p)}
      </div>
      ${navColumnHTML(p.nav)}
    </div>
    ${p.after ?? ''}`;
}

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
 *   │ [caddy] [ tool row              ] [ » ]  │  bottom: caddy slot · panel · action column
 *   │         [ gauge row             ]        │
 *   │         [ read row              ]        │
 *   │         [ COMMIT                ]        │
 *   └──────────────────────────────────────────┘
 *
 * Two rules make it hold:
 *  - **Nothing is ever removed, only disabled.** A control that can't act in this state renders in
 *    its usual place, greyed (`[disabled]`), so no button ever moves or vanishes between states.
 *  - **The panel is bottom-anchored and the COMMIT row is last**, so the thumb-critical row (commit ·
 *    caddy · auto-finish) sits at the same y in all six states even though the rows above it differ
 *    in height (a pace meter is simply taller than a power bar). `min-height` on the panel makes the
 *    aim/chip/watch states pixel-identical to each other.
 *
 * Class namespace: the play screen's own `.gs-hud*` / `.gs-mapctrl` / `.gs-caddybadge` prefixes,
 * extended — never another screen's (see the #353 `.gs-hud` map-blur regression in CLAUDE.md).
 *
 * Pure string builders: no DOM, no state reads, no rng. app.ts owns the play view-state and passes
 * it in; the wiring (`data-*` handlers) is unchanged, so every existing listener still finds its
 * button.
 */

import { caddyBadgeHTML } from './helpers';

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
  /** The caddy on the bag, for the permanent slot. Undefined ⇒ the empty reserved slot. */
  caddyId?: string;
  /** True when the caddy is on the bag but has no role in THIS state (e.g. Driver Dan on the green):
   *  the slot keeps its place and the portrait dims, rather than the badge disappearing. */
  caddyOffDuty?: boolean;
  /** Nav column: which view the map is in, whether it has been panned/zoomed off the default, and
   *  which halves can act. The view controls are dead on a fixed-frame screen (the putt map is framed
   *  on the ball↔cup span, the watch map on the follow-cam) — they stay in place, greyed. The ⚙ is
   *  live wherever a re-render is safe, which is everywhere except mid-animation. */
  nav: { whole: boolean; moved: boolean; viewDisabled: boolean; settingsDisabled: boolean };
  /** Auto-finish (`»`) — always rendered, disabled while a shot animates. */
  autoFinishDisabled: boolean;
  /** Left-handed mode (GS-lefty): mirrors the whole frame. */
  lefty: boolean;
  /** Overlays appended after the frame (shot popup, scramble choice). */
  after?: string;
}

/** The map navigation column (overview/follow · zoom · recenter · settings). Present in EVERY state;
 *  the view controls grey out where they can't act, the ⚙ stays live wherever a render is safe. */
function navColumnHTML(nav: PlayFrameParts['nav']): string {
  const v = nav.viewDisabled ? ' disabled' : '';
  const zoom = nav.viewDisabled || nav.whole ? ' disabled' : '';
  return `
    <div class="gs-mapctrl">
      <button class="gs-mapbtn${nav.whole ? ' gs-mapbtn--on' : ''}" data-mapview="toggle" title="${nav.whole ? 'Follow the ball' : 'See the whole hole'}"${v}>${nav.whole ? '🎯' : '🗺'}</button>
      <button class="gs-mapbtn" data-mapzoom="in" title="Zoom in"${zoom}>＋</button>
      <button class="gs-mapbtn" data-mapzoom="out" title="Zoom out"${zoom}>－</button>
      <button class="gs-mapbtn" data-mapview="reset" title="Recenter on the ball"${nav.moved && !nav.viewDisabled ? '' : ' disabled'}>⌖</button>
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

/** Compose the whole play screen from the fixed frame + this state's contents. */
export function playFrameHTML(p: PlayFrameParts): string {
  const rows = p.rows.filter(Boolean).join('');
  return `
    <div class="gs-shot gs-shot--full${p.lefty ? ' gs-shot--lefty' : ''}" data-playmode="${p.mode}">
      ${p.map}
      ${navColumnHTML(p.nav)}
      ${p.top}
      <div class="gs-hud gs-hud-bottom">
        ${caddySlotHTML(p.caddyId, !!p.caddyOffDuty)}
        <div class="gs-hud-controls gs-glass">
          ${rows}
          <div class="gs-hud-commit">${p.commit}</div>
        </div>
        <div class="gs-hud-actions">
          <button class="gs-roundbtn gs-glass" data-action='${JSON.stringify({ type: 'autoShotHole' })}' title="Auto-finish this hole"${p.autoFinishDisabled ? ' disabled' : ''}>»</button>
        </div>
      </div>
    </div>
    ${p.after ?? ''}`;
}

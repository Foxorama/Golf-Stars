/**
 * Live-region announcements (GS-a11y-announce).
 *
 * Everything that actually happens in this game happens on a canvas: the ball flies, lands, kicks,
 * runs out and finishes on a surface, and the only report of it is a picture. There was no
 * `aria-live` region anywhere in the app, so a player using a screen reader got silence for the
 * entire round — no shot result, no penalty, no score, no idea where the ball was.
 *
 * This is the missing narration. Two halves:
 *   · PURE BUILDERS turn sim state into a sentence. They read the SAME `ShotLog` fields the visible
 *     shot card reads, so the spoken report and the drawn report can't drift — the card is the
 *     picture of the sentence.
 *   · A GUARDED WRITER puts the sentence into `#gs-live`, a visually-hidden `role="status"` element
 *     that lives OUTSIDE `#app`. That placement matters: `render()` replaces `app.innerHTML`
 *     wholesale, and a live region that is destroyed and rebuilt on every render is not reliably
 *     announced by any screen reader — the element has to persist for its content change to be seen
 *     as a change.
 *
 * Politeness: `polite`, never `assertive`. A golf shot resolving is not an alert, and interrupting
 * whatever the player is reading in order to say "7 iron, 148 yards" would be worse than useless.
 */

import type { ShotLog } from '../sim/round';
import { lieLabel } from '../render/restArt';

/** The id of the persistent live region in index.html. */
const LIVE_ID = 'gs-live';

/** Last thing we said, so a repeat isn't announced twice for one event. */
let lastSpoken = '';

/**
 * Speak a sentence. Screen readers announce a live region when its TEXT CHANGES, so an identical
 * consecutive message would be silent — we clear first and re-set on the next frame to force it.
 */
export function announce(message: string): void {
  if (typeof document === 'undefined') return;
  const msg = message.trim();
  if (!msg) return;
  try {
    const live = document.getElementById(LIVE_ID);
    if (!live) return;
    if (msg === lastSpoken) {
      // Same words as last time (two pars in a row, two identical lies). Blank it, then re-set on
      // the next frame so the region registers a genuine change.
      live.textContent = '';
      requestAnimationFrame(() => {
        live.textContent = msg;
      });
    } else {
      live.textContent = msg;
    }
    lastSpoken = msg;
  } catch {
    /* narration is an enhancement — never let it break a render */
  }
}

/** Test seam. */
export function resetAnnounce(): void {
  lastSpoken = '';
}

/** Round a yard figure the way a caddy would say it. */
function yd(n: number): string {
  return `${Math.round(n)} yard${Math.round(n) === 1 ? '' : 's'}`;
}

/**
 * The spoken report of a shot — the same facts the shot card draws, in the order a playing partner
 * would say them: what it did, how far, how straight, where it finished, what's left.
 *
 * Pure: no DOM, no globals, so `tests/` can assert on the exact wording.
 */
export function shotSentence(shot: ShotLog, distToPin?: number): string {
  if (shot.holed) {
    return `In the hole! ${shot.club.name}, ${yd(shot.result.carry)}.`;
  }
  const parts: string[] = [];
  if (shot.penalty) {
    // The penalty is the headline — it changes the score, not just the position.
    parts.push(`${lieLabel(shot.penalty)} — penalty, one shot.`);
  } else {
    parts.push(`${shot.club.name}, ${yd(shot.result.carry)}.`);
  }
  // Lateral miss, measured off the aim ray exactly as the card measures it.
  const br = (shot.result.shotBearing * Math.PI) / 180;
  const vx = shot.result.landing[0] - shot.from[0];
  const vy = shot.result.landing[1] - shot.from[1];
  const lateral = vx * Math.cos(br) + vy * -Math.sin(br);
  const off = Math.round(Math.abs(lateral));
  if (!shot.penalty) {
    parts.push(off === 0 ? 'Dead straight.' : `${yd(off)} ${lateral >= 0 ? 'right' : 'left'}.`);
    // `lieLabel` already carries its own article ("the fairway", "a bunker") — don't add a second.
    parts.push(`Finished in ${lieLabel(shot.lieTo)}.`);
  }
  if (distToPin != null && distToPin > 0) parts.push(`${yd(distToPin)} to the pin.`);
  return parts.join(' ');
}

/**
 * The spoken situation before a shot — what a sighted player reads off the map in one glance:
 * which hole, its par and length, where the ball is, and what the wind is doing.
 */
export function situationSentence(opts: {
  holeNumber: number;
  holeCount: number;
  par: number;
  holeYards: number;
  lie: string;
  distToPin: number;
  windMph?: number;
  windLabel?: string;
}): string {
  const parts = [
    `Hole ${opts.holeNumber} of ${opts.holeCount}, par ${opts.par}, ${yd(opts.holeYards)}.`,
    `Ball on ${lieLabel(opts.lie)}, ${yd(opts.distToPin)} to the pin.`,
  ];
  if (opts.windMph != null && opts.windMph > 0) {
    parts.push(`Wind ${Math.round(opts.windMph)} miles per hour${opts.windLabel ? ` ${opts.windLabel}` : ''}.`);
  }
  return parts.join(' ');
}

/** The spoken result of a completed hole. */
export function holeSentence(strokes: number, par: number): string {
  const rel = strokes - par;
  const name =
    strokes === 1
      ? 'Hole in one!'
      : rel <= -3
      ? 'Albatross!'
      : rel === -2
      ? 'Eagle!'
      : rel === -1
      ? 'Birdie.'
      : rel === 0
      ? 'Par.'
      : rel === 1
      ? 'Bogey.'
      : rel === 2
      ? 'Double bogey.'
      : `${rel} over par.`;
  return `${name} ${strokes} shot${strokes === 1 ? '' : 's'} on a par ${par}.`;
}

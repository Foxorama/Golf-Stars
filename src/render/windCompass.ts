/**
 * The play HUD's WIND COMPASS (GS-hud-compass) — the dial that replaced a line of text.
 *
 * The old read was `🌬 9 mph tailwind ⬆`: a whole line of the info chip for one fact, with the one
 * part that mattered (which way it pushes) encoded as a rotated emoji. A dial says it in a corner:
 * the needle points the way the wind BLOWS ON SCREEN, and the number sits in the middle of it.
 *
 * **Up on the dial is up on the map.** The play map is oriented down the shot's aim line
 * (GS-default-aim), and the sim resolves wind off the SHOT bearing too (`shot.ts playWind`) — so a
 * needle drawn against that same bearing is simultaneously what the physics does and what the player
 * is looking at. A needle up = the wind is behind you, and the ball will fly further; a needle to the
 * right = it will push the ball right, and it will do that on screen too.
 *
 * Pure SVG string, no DOM, no rng, no ids (document-global; the dial can share a screen with the
 * bag's club glyphs). Node-testable.
 */

/** What the dial draws: speed in mph, the head/tail/cross word, and the wind's bearing in degrees
 *  clockwise from up-screen (0 = blowing the way you are playing). Exactly `playHud.windRead`. */
export interface WindDial {
  /** The speed the BALL feels — already through the gear (GS-hud-gear-reads), not the sky's raw mph. */
  spd: number;
  kind: string;
  delta: number;
  /** Wind-cheating gear is taking a bite out of it. Drawn as a shield ring so a player can SEE the
   *  perk working; without a tell, good gear just makes the world look calm. */
  cut?: boolean;
}

/** Colour by what the wind is DOING to the shot: helping (green), hurting (red), pushing (amber). */
export function windKindColour(kind: string): string {
  if (kind === 'tailwind') return '#5fd45a';
  if (kind === 'headwind') return '#ff6b6b';
  if (kind === 'crosswind') return '#ffc454';
  return '#9fb0c8';
}

const C = 26; // dial centre, in the 52-unit viewBox

/** Polar → viewBox point. `a` is degrees clockwise from up, matching the wind/hole bearing convention. */
function polar(r: number, aDeg: number): [number, number] {
  const a = (aDeg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

const pt = (r: number, a: number): string => polar(r, a).map((n) => n.toFixed(1)).join(' ');

/**
 * The dial. `size` is only advisory (the SVG scales to its box); everything is authored in a 52-unit
 * frame so the stroke weights hold at any size.
 */
export function windCompassSVG(w: WindDial): string {
  const col = windKindColour(w.kind);
  // Under half a mph there is nothing left to point at — say so rather than drawing a needle on a
  // dial that reads "0". (Reachable through gear alone: a 45%-resist ball in a 1 mph breeze.)
  const calm = w.spd < 0.5;
  const shield = '#7fd8ff';
  // Eight faint ticks, so the ring reads as an instrument rather than a plain circle.
  // Ticks every 45°, with the one at 12 o'clock drawn LONG and green: that is the direction you are
  // playing, so the dial says which way "up" is without a second marker competing with the needle.
  // (A separate target notch was tried and read as part of the needle whenever the wind was behind.)
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const a = i * 45;
    const [x1, y1] = polar(20.5, a);
    const [x2, y2] = polar(i % 2 ? 18.5 : 17.5, a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffffff" stroke-width="${i % 2 ? 0.8 : 1.2}" opacity="${i % 2 ? 0.18 : 0.3}" stroke-linecap="round"/>`;
  }).join('');
  // The direction of PLAY, marked OUTSIDE the ring at 12 o'clock. It has to live outside: drawn as a
  // long tick inside the annulus it merged with the needle head on every tailwind — which is exactly
  // the reading it exists to disambiguate.
  // Deliberately NEUTRAL, not green: colour on this dial means "what the wind is doing to your shot",
  // and a green index mark beside a green tailwind needle is two different things wearing one colour.
  const up = `<polygon points="${pt(25.5, 0)}, ${pt(21.8, -6.5)}, ${pt(21.8, 6.5)}" fill="#9fb0c8" opacity="0.8"/>`;
  // The needle: an arrowhead riding the annulus (so the centre stays free for the number), with a
  // tail bar behind it so it reads as a needle rather than a stray chevron. 0° is up-screen — the way
  // you are playing — so the head points where the wind is pushing the ball, on screen.
  const [tx1, ty1] = polar(18.5, w.delta + 180);
  const [tx2, ty2] = polar(12.5, w.delta + 180);
  const needle = calm
    ? ''
    : `<line x1="${tx1.toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${col}" stroke-width="2.6" opacity="0.45" stroke-linecap="round"/>
       <polygon points="${pt(20, w.delta)}, ${pt(12.5, w.delta + 18)}, ${pt(14.8, w.delta)}, ${pt(12.5, w.delta - 18)}" fill="${col}"/>`;
  const readout = calm
    ? `<text x="${C}" y="${C + 3}" text-anchor="middle" font-size="8.5" font-weight="800" fill="#9fb0c8" letter-spacing="0.5">CALM</text>`
    : `<text x="${C}" y="${C + 3}" text-anchor="middle" font-size="16" font-weight="800" fill="#eef3fb">${Math.round(w.spd)}</text>
       <text x="${C}" y="${C + 11}" text-anchor="middle" font-size="6.5" font-weight="700" fill="${w.cut ? shield : '#9fb0c8'}" letter-spacing="0.6">MPH</text>`;
  return `<svg viewBox="0 0 52 52" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" style="display:block;">
    <circle cx="${C}" cy="${C}" r="21" fill="rgba(7,10,15,.55)" stroke="${w.cut ? shield : 'rgba(255,255,255,.14)'}" stroke-width="1.4" ${w.cut ? 'stroke-opacity="0.75"' : ''}/>
    ${ticks}
    ${up}
    ${needle}
    <circle cx="${C}" cy="${C}" r="11.5" fill="rgba(7,10,15,.5)" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
    ${readout}
  </svg>`;
}

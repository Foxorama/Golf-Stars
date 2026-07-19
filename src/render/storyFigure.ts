/**
 * Clubhouse FIGURE dispatcher (GS-story-figures) — the one place that turns a story-character id into its
 * full-body Canvas2D figure, so the clubhouse standees + the app.ts mount pass share a single rule. A
 * Warden ally uses its on-course `drawCaddy` figure; a Coil (Herald) agent uses its `drawCoilAgent` figure.
 * Both are the game's own art in the same flat house style — never a cropped bust. Pure drawing.
 */

import { drawCaddy, hasCaddyArt } from './caddyArt';
import { drawCoilAgent, coilAgentLook } from './coilAgentArt';
import { isHeraldAgent } from '../sim/rpg/storyHeraldCrew';

/** Does this id have a full-body clubhouse figure (a Warden caddy or a Coil agent)? */
export function hasStoryFigure(id: string | undefined): boolean {
  return hasCaddyArt(id) || isHeraldAgent(id);
}

/** Draw a story character's full-body figure at feet-centre (cx, cy), `h` px tall. `t` (ms) drives idle. */
export function drawStoryFigure(
  ctx: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  h: number,
  t: number,
  lefty = false,
): void {
  if (hasCaddyArt(id)) {
    drawCaddy(ctx, id, cx, cy, h, t, lefty);
    return;
  }
  if (isHeraldAgent(id)) {
    drawCoilAgent(ctx, coilAgentLook(id), cx, cy, h, t);
  }
}

/**
 * THE FINALE ARENA IS DRAWN AT THE ORIENTATION THE SCREEN HAS ROOM FOR (GS-story-battle-portrait).
 *
 * The boss fight is composed in a 1000×600 LANDSCAPE design frame — boss on the right, your ship flying
 * in from the left — and the rest of the game is portrait. Meet-fitted into a 390×844 phone that frame
 * scales to 0.39: a 390×234 strip of fight with ~300px of dead black above and below it. The battle was
 * the one screen the player had to hold the phone sideways for, and nothing told them to.
 *
 * The two ways out are an ORIENTATION LOCK or a portrait-native arena. The lock is not available: iOS
 * Safari has no `screen.orientation.lock` at all, Android Chrome only honours it inside fullscreen, and
 * the Capacitor shell would need a native plugin — a mechanic that works on one of three targets is not
 * a mechanic. So the arena TURNS instead, the same answer `project.ts fitFrame` gives the hole map:
 *
 *   • On a taller-than-wide screen the whole design frame is rotated 90° CCW — design +x (toward the
 *     boss) becomes screen UP. The boss looms at the top, your ship flies at the bottom, its attacks
 *     rain down: the canonical portrait shmup. Every piece of art comes along for free, because it was
 *     all drawn facing along design +x — the serpent's maw and the Ark's batteries end up pointing DOWN
 *     at the player, and your ship's nose and thrust flame point UP.
 *   • THE FIGHT ITSELF NEVER LEAVES DESIGN SPACE. Positions, hitboxes, ship bounds, projectile speeds,
 *     spawn patterns and phase timings are untouched — this is a CAMERA, not a rebalance, so the
 *     fairness the fight is built on (dodgeable arcs, telegraphed lines, the hopeless floor) is
 *     unchanged by construction.
 *   • THE HUD IS ALWAYS UPRIGHT, so it needs a frame of its own. In landscape that frame IS the arena
 *     box (identical numbers ⇒ the shipped landscape fight is byte-for-byte). Turned, it spans the whole
 *     screen inset by the safe area, which hands the readouts the letterbox BANDS above and below the
 *     arena — so in portrait the boss bar and the weapon triggers stop covering the playfield.
 *
 * Pure and DOM-free (node-tested by `tests/battle-frame.test.ts`); `storyBattle.ts` is the only consumer.
 */

/** The arena's design frame — the coordinate system the whole fight is authored and simulated in. */
export const BATTLE_DW = 1000;
export const BATTLE_DH = 600;

export interface BattleInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BattleFrame {
  /** true when the arena is turned 90° CCW because the screen is taller than the design frame is wide. */
  rotated: boolean;
  /** design units → css px. */
  scale: number;
  /** the arena box's top-left on screen, css px. */
  offX: number;
  offY: number;
  /** the upright HUD frame: origin in css px, size in DESIGN units (same `scale`). */
  hudX: number;
  hudY: number;
  hudW: number;
  hudH: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NO_INSETS: BattleInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Fit the arena to a container. The frame TURNS whenever turning genuinely buys scale, so a landscape
 * or desktop container (and the 5:3 preview rig) resolves exactly as it always has.
 */
export function battleFrame(cssW: number, cssH: number, insets: BattleInsets = NO_INSETS): BattleFrame {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const flat = Math.min(w / BATTLE_DW, h / BATTLE_DH);
  const turned = Math.min(w / BATTLE_DH, h / BATTLE_DW);
  const rotated = turned > flat;
  const scale = rotated ? turned : flat;
  const boxW = (rotated ? BATTLE_DH : BATTLE_DW) * scale;
  const boxH = (rotated ? BATTLE_DW : BATTLE_DH) * scale;
  const offX = (w - boxW) / 2;
  const offY = (h - boxH) / 2;
  if (!rotated) {
    // The classic frame: the HUD is drawn inside the arena box, exactly as shipped.
    return { rotated, scale, offX, offY, hudX: offX, hudY: offY, hudW: BATTLE_DW, hudH: BATTLE_DH };
  }
  // Turned: the HUD owns the whole (safe) screen — the arena's letterbox bands become its bar space.
  const left = Math.max(0, insets.left);
  const top = Math.max(0, insets.top);
  const usableW = Math.max(1, w - left - Math.max(0, insets.right));
  const usableH = Math.max(1, h - top - Math.max(0, insets.bottom));
  return { rotated, scale, offX, offY, hudX: left, hudY: top, hudW: usableW / scale, hudH: usableH / scale };
}

/** A screen point (relative to the overlay) → arena DESIGN coordinates. The inverse of the world transform. */
export function toDesignPoint(f: BattleFrame, px: number, py: number): { x: number; y: number } {
  const u = (px - f.offX) / f.scale;
  const v = (py - f.offY) / f.scale;
  return f.rotated ? { x: BATTLE_DW - v, y: u } : { x: u, y: v };
}

/** A screen point → upright HUD coordinates (where the weapon triggers are hit-tested). */
export function toHudPoint(f: BattleFrame, px: number, py: number): { x: number; y: number } {
  return { x: (px - f.hudX) / f.scale, y: (py - f.hudY) / f.scale };
}

/**
 * The whole visible screen expressed in DESIGN units. A full-frame wash (the space backdrop, the boss's
 * haze, the hit flash, the climax whiteout) must cover THIS, not the arena box — otherwise a frame with
 * letterbox bands washes only its middle and the bands read as a seam.
 */
export function designViewRect(f: BattleFrame, cssW: number, cssH: number): Rect {
  if (!f.rotated) return { x: -f.offX / f.scale, y: -f.offY / f.scale, w: cssW / f.scale, h: cssH / f.scale };
  return {
    x: BATTLE_DW - (cssH - f.offY) / f.scale,
    y: -f.offX / f.scale,
    w: cssH / f.scale,
    h: cssW / f.scale,
  };
}

/** Where the arena's top edge sits in HUD units — 0 when the two frames coincide (landscape). */
export function arenaTopHud(f: BattleFrame): number {
  return (f.offY - f.hudY) / f.scale;
}

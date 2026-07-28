/**
 * THE FINALE BOSS GETS AN ENTRANCE (GS-story-battle-epic).
 *
 * The campaign's last fight used to begin the way an ordinary stop begins — the overlay appears, a caption
 * fades up, and the serpent is already mid-writhe in the corner. Everything about that reads *skirmish*:
 * the player never sees the boss ARRIVE, so it never lands as the thing five Sigils were spent getting to.
 *
 * So the fight opens on a set-piece: the boss looms up out of the dark, its NAME slams onto the screen, it
 * roars (a shockwave, a hitstop, the frame kicked), and only then does the HUD wipe in and the assault
 * start. This module is the pure half — the boss's name/epithet rows and the entrance TIMELINE — so the
 * beat is node-testable and the battle module only has to draw it.
 *
 * Pure and DOM-free (node-tested by `tests/battle-intro.test.ts`); `storyBattle.ts` is the only consumer.
 */

/** The boss's plate: the name the health bar carries, and the epithet the entrance announces it with. */
export interface BossTitle {
  name: string;
  epithet: string;
}

/**
 * Who the player is looking at. Two rows, one per path — the Warden fights the World-Eater, the Herald
 * fights the Order's flagship (GS-story-warden-ark). A third boss would be a third row.
 */
export function bossTitle(herald: boolean): BossTitle {
  return herald
    ? { name: 'THE WARDEN ARK', epithet: 'FLAGSHIP OF THE ORDER · IT HOLDS THE SEAL' }
    : { name: 'JÖRMUNGANDR', epithet: 'THE WORLD-EATER · COILED ROUND THE ROOT' };
}

/** The whole entrance, mount → first volley. */
export const ENTRY_MS = 2800;
/** When the boss ROARS — the shockwave, the hitstop and the frame kick all fire on this one instant. */
export const ENTRY_ROAR_MS = 1250;

/** Every 0..1 dial the entrance drives, resolved from the elapsed time. */
export interface EntryBeat {
  /** The boss rising out of the dark: 0 = far and dim, 1 = full size, in place. */
  loom: number;
  /** The name plate's arrival — 0 before it slams, 1 once it has settled. */
  plate: number;
  /** How present the plate is overall (in, hold, out) — its alpha. */
  plateAlpha: number;
  /** The roar's impulse: 1 on the instant, decaying to 0 over the following beat. */
  roar: number;
  /** The HUD wiping in behind the plate — 0 hidden, 1 fully seated. */
  hudIn: number;
  /** Star-streak strength: the deep rushing past as the camera closes on the boss. */
  streak: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number): number => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** Overshoot-free "slam": fast in, settling — the plate lands hard and stops dead. */
const slam = (x: number): number => {
  const c = clamp01(x);
  return 1 - Math.pow(1 - c, 3.4);
};

/**
 * Resolve the entrance at `elapsedMs` since mount. Monotone where it should be (`loom`, `hudIn` never go
 * backwards) and everything is clamped, so a dropped frame or a long stall can only ever land further
 * along the beat — never in an impossible state.
 */
export function entryBeat(elapsedMs: number): EntryBeat {
  const e = Math.max(0, elapsedMs);
  const loom = smooth(e / 1200);
  const plate = slam((e - 520) / 620);
  // in over the slam, held through the roar, out under the HUD wipe
  const plateAlpha = clamp01(plate) * (1 - smooth((e - 2180) / 520));
  const roar = e < ENTRY_ROAR_MS ? 0 : clamp01(1 - (e - ENTRY_ROAR_MS) / 900);
  const hudIn = smooth((e - 2150) / 620);
  const streak = 1 - smooth((e - 300) / 900);
  return { loom, plate, plateAlpha, roar, hudIn, streak };
}

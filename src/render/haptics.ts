import { getSettings } from '../settings';

// Haptic vibration patterns + the guarded trigger. Feel-only (gated on the haptics setting, wrapped so
// an unsupported `navigator.vibrate` never throws). Shared by app.ts and the celebration overlays.
export const HAPTICS = {
  tap: 8,
  swing: 16,
  putt: 10,
  good: [10, 30, 14] as number[], // pure contact / made putt
  bad: 40, // penalty / missed cut — one heavy buzz
  holeOut: [12, 28, 12, 28, 20] as number[],
  madeCut: [10, 40, 10, 40, 18] as number[],
  ace: [18, 40, 18, 40, 18, 40, 30] as number[], // the biggest beat — a long celebratory roll
  eagle: [14, 30, 14, 30, 22] as number[], // a two-under — a sharp triumphant burst (the eagle's cry)
  albatross: [10, 40, 10, 40, 16, 60, 28] as number[], // a three-under — a long majestic swell
  caddy: [14, 30, 14] as number[], // a caddy's signature effect lands (guard save / chip-in)
};
export function haptic(pattern: number | number[]): void {
  if (!getSettings().haptics) return;
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {
    /* unsupported — never let a feel-only effect throw */
  }
}


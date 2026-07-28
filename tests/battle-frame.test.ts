import { describe, it, expect } from 'vitest';
import {
  BATTLE_DW,
  BATTLE_DH,
  battleFrame,
  toDesignPoint,
  toHudPoint,
  designViewRect,
  arenaTopHud,
} from '../src/render/battleFrame';

/**
 * GS-story-battle-portrait — the finale arena is drawn at the orientation the screen has room for.
 * The whole point is that the FIGHT never leaves its 1000×600 design space (so the balance is untouched)
 * and only the camera turns, so these are the guards on the camera: landscape resolves exactly as it
 * always did, a phone turns, and the two inverse mappings agree with the transform they invert.
 */
describe('battle frame', () => {
  it('a landscape container never turns, and fits exactly as it always has', () => {
    for (const [w, h] of [
      [1100, 660], // the preview rig — exactly 5:3
      [1600, 660],
      [1280, 720],
      [900, 500],
    ] as const) {
      const f = battleFrame(w, h);
      expect(f.rotated, `${w}×${h} turned`).toBe(false);
      expect(f.scale).toBeCloseTo(Math.min(w / BATTLE_DW, h / BATTLE_DH), 10);
      expect(f.offX).toBeCloseTo((w - BATTLE_DW * f.scale) / 2, 10);
      expect(f.offY).toBeCloseTo((h - BATTLE_DH * f.scale) / 2, 10);
      // the HUD frame IS the arena box — the shipped landscape HUD numbers land where they always did
      expect(f.hudW).toBe(BATTLE_DW);
      expect(f.hudH).toBe(BATTLE_DH);
      expect(f.hudX).toBe(f.offX);
      expect(f.hudY).toBe(f.offY);
      expect(arenaTopHud(f)).toBe(0);
    }
  });

  it('a phone turns the arena, and the fight gets nearly three times the screen', () => {
    const [w, h] = [390, 844];
    const f = battleFrame(w, h);
    expect(f.rotated).toBe(true);
    expect(f.scale).toBeCloseTo(Math.min(w / BATTLE_DH, h / BATTLE_DW), 10);
    // the arena spans the full width of the phone (600 design units across)
    expect(BATTLE_DH * f.scale).toBeCloseTo(w, 6);
    expect(f.offX).toBeCloseTo(0, 6);
    const turnedArea = BATTLE_DH * f.scale * (BATTLE_DW * f.scale);
    const flatScale = Math.min(w / BATTLE_DW, h / BATTLE_DH);
    const flatArea = BATTLE_DW * flatScale * (BATTLE_DH * flatScale);
    expect(turnedArea / flatArea).toBeGreaterThan(2.5);
  });

  it('turning puts the BOSS at the top of the screen and the player at the bottom', () => {
    const f = battleFrame(390, 844);
    // screen top-centre → the far (boss) end of the design frame; screen bottom-centre → the near end
    const top = toDesignPoint(f, 195, f.offY);
    const bottom = toDesignPoint(f, 195, f.offY + BATTLE_DW * f.scale);
    expect(top.x).toBeCloseTo(BATTLE_DW, 6);
    expect(bottom.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(BATTLE_DH / 2, 6);
    // …and the ship's own flight band (design x 60→560) lives in the LOWER half of the turned screen
    const shipTopY = f.offY + (BATTLE_DW - 560) * f.scale;
    expect(shipTopY).toBeGreaterThan(844 * 0.4);
  });

  it('the tap mappings invert the transforms they are drawn through', () => {
    for (const [w, h] of [
      [1100, 660],
      [390, 844],
      [414, 896],
    ] as const) {
      const f = battleFrame(w, h);
      // every screen corner round-trips through the design mapping
      for (const [px, py] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
        [w * 0.31, h * 0.72],
      ] as const) {
        const d = toDesignPoint(f, px, py);
        // re-project by hand — the inverse of the inverse must land back on the same pixel
        const sx = f.offX + (f.rotated ? d.y : d.x) * f.scale;
        const sy = f.offY + (f.rotated ? BATTLE_DW - d.x : d.y) * f.scale;
        expect(sx).toBeCloseTo(px, 6);
        expect(sy).toBeCloseTo(py, 6);
      }
      // the HUD mapping is a plain upright fit — a tap at the HUD origin reads (0,0)
      const o = toHudPoint(f, f.hudX, f.hudY);
      expect(o.x).toBeCloseTo(0, 10);
      expect(o.y).toBeCloseTo(0, 10);
      const far = toHudPoint(f, f.hudX + f.hudW * f.scale, f.hudY + f.hudH * f.scale);
      expect(far.x).toBeCloseTo(f.hudW, 6);
      expect(far.y).toBeCloseTo(f.hudH, 6);
    }
  });

  it('the view rect covers the whole screen, so a full-frame wash never leaves a band bare', () => {
    for (const [w, h] of [
      [1100, 660],
      [1600, 660],
      [390, 844],
    ] as const) {
      const f = battleFrame(w, h);
      const v = designViewRect(f, w, h);
      // every screen corner, in design units, lies inside the rect
      for (const [px, py] of [
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ] as const) {
        const d = toDesignPoint(f, px, py);
        expect(d.x).toBeGreaterThanOrEqual(v.x - 1e-6);
        expect(d.x).toBeLessThanOrEqual(v.x + v.w + 1e-6);
        expect(d.y).toBeGreaterThanOrEqual(v.y - 1e-6);
        expect(d.y).toBeLessThanOrEqual(v.y + v.h + 1e-6);
      }
    }
    // the 5:3 preview rig sees exactly the arena box — the shipped backdrop, unchanged
    const preview = designViewRect(battleFrame(1100, 660), 1100, 660);
    expect(preview.x).toBeCloseTo(0, 6);
    expect(preview.y).toBeCloseTo(0, 6);
    expect(preview.w).toBeCloseTo(BATTLE_DW, 6);
    expect(preview.h).toBeCloseTo(BATTLE_DH, 6);
  });

  it('a turned HUD spans the safe screen and hands the readouts the letterbox bands', () => {
    const f = battleFrame(390, 844);
    expect(f.hudX).toBe(0);
    expect(f.hudW).toBeCloseTo(390 / f.scale, 6);
    expect(f.hudH).toBeCloseTo(844 / f.scale, 6);
    // the band above the arena, in HUD units — deep enough for the stacked shields + boss bar (117)
    expect(arenaTopHud(f)).toBeGreaterThan(117);
    // …and the band below is deep enough for the weapon bar (72 + 12 margin)
    const bandBelow = f.hudH - arenaTopHud(f) - BATTLE_DW;
    expect(bandBelow).toBeGreaterThan(84);
  });

  it('safe-area insets shrink the turned HUD (and never touch the classic landscape frame)', () => {
    const insets = { top: 47, right: 0, bottom: 34, left: 0 };
    const turned = battleFrame(390, 844, insets);
    expect(turned.hudY).toBe(47);
    expect(turned.hudH).toBeCloseTo((844 - 47 - 34) / turned.scale, 6);
    // the ARENA is untouched by the insets — the fight keeps every pixel it can have
    expect(turned.offY).toBeCloseTo(battleFrame(390, 844).offY, 10);

    const flat = battleFrame(1100, 660, insets);
    expect(flat.hudW).toBe(BATTLE_DW);
    expect(flat.hudH).toBe(BATTLE_DH);
    expect(flat.hudY).toBe(flat.offY);
  });

  it('the weapon bar always lands on screen, whatever the frame', () => {
    for (const [w, h] of [
      [1100, 660],
      [390, 844],
      [375, 667], // a 16:9 phone — shallow bands, so the bar overlays the arena as it does in landscape
      [360, 640],
      [820, 1180], // tablet portrait
    ] as const) {
      const f = battleFrame(w, h);
      const barTop = f.hudH - 72 - 12;
      expect(barTop, `${w}×${h}`).toBeGreaterThan(0);
      expect(f.hudY + (barTop + 72) * f.scale, `${w}×${h} bar foot`).toBeLessThanOrEqual(h + 1e-6);
    }
  });
});

/**
 * The Android shell owns its system bars (GS-android-systembars).
 *
 * Play-test report: on a Galaxy S20 FE the packaged app showed a white strip along the bottom of the
 * screen, which read as a leftover browser bar. It was the Android NAVIGATION bar: Capacitor's stock
 * theme sets neither `statusBarColor` nor `navigationBarColor`, so both fall back to an opaque light
 * platform default, and against this game's dark UI that looks like foreign chrome.
 *
 * It appeared on only ONE of the two test phones, which is the part worth guarding. With targetSdk 36,
 * Android 15+ enforces edge-to-edge and the bars go transparent (the Pixel 9a case — handled by
 * GS-play-safearea). An older Android honours the theme instead, defaults included. Same APK, two
 * different results, and the theme is the only thing that fixes the older one.
 *
 * These are XML resources, unreachable from the pure-sim suite, so this asserts the RESOURCES exist
 * and stay wired — cheap insurance against a `cap sync` or a template bump quietly reverting them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RES = join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'values');
const STYLES = join(RES, 'styles.xml');
const COLORS = join(RES, 'colors.xml');

describe('the system-bar colour resource', () => {
  it('exists and matches the app background', () => {
    expect(existsSync(COLORS), 'android colors.xml is missing').toBe(true);
    const xml = readFileSync(COLORS, 'utf8');
    // `--gs-bg` in index.html. If the app background is ever re-themed, this must move with it or the
    // bars will stop matching and the "foreign chrome" look comes back.
    expect(xml).toMatch(/<color name="gsSystemBar">#0b0d12<\/color>/i);
  });

  it('is namespaced so it cannot collide with @capacitor/android’s own colour resources', () => {
    // The library supplies colorPrimary / colorPrimaryDark / colorAccent — which is why styles.xml can
    // reference them with no colors.xml of our own. Ours must not shadow those.
    const xml = readFileSync(COLORS, 'utf8');
    expect(xml).not.toMatch(/name="colorPrimary"/);
    expect(xml).not.toMatch(/name="colorAccent"/);
  });
});

describe('both themes paint the bars', () => {
  const xml = readFileSync(STYLES, 'utf8');
  const themeBlock = (name: string): string => {
    const m = xml.match(new RegExp(`<style name="${name.replace('.', '\\.')}"[^>]*>([\\s\\S]*?)</style>`));
    expect(m, `theme ${name} not found`).toBeTruthy();
    return m![1]!;
  };

  // The launch theme matters as much as the main one: without it the bars flash light for the moment
  // the splash is up, before the game paints.
  it.each(['AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch'])('%s sets both bar colours', (name) => {
    const body = themeBlock(name);
    expect(body).toMatch(/android:statusBarColor">@color\/gsSystemBar/);
    expect(body).toMatch(/android:navigationBarColor">@color\/gsSystemBar/);
  });

  it.each(['AppTheme.NoActionBar', 'AppTheme.NoActionBarLaunch'])('%s forces LIGHT bar icons', (name) => {
    // Dark icons on a dark bar would be unreadable — the whole point is dark bars, so the icons on
    // them must be light.
    const body = themeBlock(name);
    expect(body).toMatch(/android:windowLightStatusBar">false/);
    expect(body).toMatch(/android:windowLightNavigationBar">false/);
  });
});

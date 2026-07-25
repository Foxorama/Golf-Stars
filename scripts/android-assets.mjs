#!/usr/bin/env node
/*
 * Android launcher/splash SOURCE art generator (GS-android).
 *
 * `@capacitor/assets` wants a set of oversized source images in `assets/`, which it then downscales
 * into every Android density bucket. We already ship a 512px PWA icon (`public/icon-512.png`), so
 * rather than hand-maintaining a second copy of the artwork this script DERIVES the sources from it:
 *
 *   assets/icon.png             1024²  — the legacy (pre-API-26) square launcher icon
 *   assets/icon-foreground.png  1024²  — the ADAPTIVE icon foreground, artwork inset to ~60%
 *   assets/icon-background.png  1024²  — the adaptive icon background, flat app-background navy
 *   assets/splash.png           2732²  — the launch screen (dark, artwork centred)
 *   assets/splash-dark.png      2732²  — same; the game is dark-only, so both themes match
 *
 * The INSET on the foreground is the part that matters and the part that is easy to get wrong:
 * Android crops an adaptive icon to whatever mask the launcher uses (circle, squircle, rounded
 * square) and only the middle ~66% of the canvas is guaranteed visible. Artwork drawn edge-to-edge
 * gets its corners eaten. 60% keeps the whole mark inside the safe zone on every launcher.
 *
 * Run after changing the PWA icon:  node scripts/android-assets.mjs && npx cap sync android
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'public', 'icon-512.png');
const OUT = join(ROOT, 'assets');

/** The app background (`--gs-bg` in index.html) — splash + adaptive background match it exactly so
 *  there is no colour step between the launch screen and the game's first painted frame. */
const BG = '#0b0d12';

/** Fraction of the adaptive-icon canvas the artwork occupies. Android's guaranteed-visible safe
 *  zone is the middle ~66%; 60% leaves margin on the most aggressive launcher masks. */
const ADAPTIVE_INSET = 0.6;

/** Fraction of the splash canvas the artwork occupies — small, so it reads as a logo on a field. */
const SPLASH_INSET = 0.26;

const flat = (size) =>
  sharp({ create: { width: size, height: size, channels: 4, background: BG } }).png();

/** The source mark, resized to `px` square with transparency preserved. */
const mark = async (px) => sharp(SRC).resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

/** Composite the mark, scaled to `inset` of the canvas, centred on `base`. */
async function centred(base, size, inset) {
  const art = await mark(Math.round(size * inset));
  return base.composite([{ input: art, gravity: 'centre' }]);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // Legacy square launcher icon — full bleed on the app background (no transparency: some older
  // launchers render an alpha icon against an unpredictable colour).
  await (await centred(flat(1024), 1024, 0.86)).toFile(join(OUT, 'icon.png'));

  // Adaptive icon: foreground artwork on transparency + a flat background layer.
  const fg = sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png();
  await (await centred(fg, 1024, ADAPTIVE_INSET)).toFile(join(OUT, 'icon-foreground.png'));
  await flat(1024).toFile(join(OUT, 'icon-background.png'));

  // Splash / launch screen, light + dark (identical — the game has one dark theme).
  const splash = await (await centred(flat(2732), 2732, SPLASH_INSET)).toBuffer();
  await sharp(splash).toFile(join(OUT, 'splash.png'));
  await sharp(splash).toFile(join(OUT, 'splash-dark.png'));

  console.log('android assets written to assets/ (icon, icon-foreground, icon-background, splash, splash-dark)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

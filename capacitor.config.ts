import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wrapper config (GS-android) — the Google Play shell around the existing web build.
 *
 * The game itself is unchanged: `npm run build` still emits a single self-contained `dist/index.html`,
 * and Capacitor just copies that into the APK/AAB as a local asset. Nothing is fetched at runtime, so
 * the app is fully offline from install — which is also why the PWA service worker is disabled inside
 * the native shell (see `registerServiceWorker` in src/app.ts): a worker caching already-local assets
 * buys nothing and risks pinning a stale build after a Play update — the exact bug class the web
 * deploy already fought (see docs/decisions/process-and-deploy.md).
 *
 * `appId` is PERMANENT — Play keys the listing on it and it can never be changed after the first
 * upload. `webDir` must stay pointed at the Vite output.
 */
const config: CapacitorConfig = {
  appId: 'com.foxorama.golfstars',
  appName: 'Golf Stars',
  webDir: 'dist',
  android: {
    // The game paints its own deep-space background; match it so there is no white flash between
    // the splash screen and the first frame.
    backgroundColor: '#0b0d12',
  },
  server: {
    // Serve the bundled assets over https://localhost rather than file:// — WebAudio, the Canvas2D
    // render path, and localStorage all behave like the browser build this way.
    androidScheme: 'https',
  },
};

export default config;

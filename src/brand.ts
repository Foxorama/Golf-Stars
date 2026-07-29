/**
 * Product identity — the ONE place the game's name and version are written (GS-release-identity).
 *
 * The title used to be a bare literal in six places (title screen, the intro cinematic's
 * constellation wordmark ×2, the boot-error card, the resume header, the test hub), which is
 * exactly how a rename half-lands: five surfaces move and the sixth keeps shipping the old
 * name for a year. Every user-facing surface reads these constants instead.
 *
 * **NOT rename targets, deliberately.** The `gs_*` localStorage keys, the npm package name,
 * the Capacitor `appId`, and — critically — `BACKUP_KIND` in `save/backup.ts` are
 * IDENTIFIERS baked into data that already exists on players' devices. Renaming one orphans
 * every save or backup file in the wild. A product name is a label; an identifier is a
 * contract, and the two happening to have been the same string is a coincidence, not a rule.
 * `tests/brand.test.ts` machine-checks that distinction.
 */

/**
 * Injected by Vite from package.json (see `vite.config.ts`). Declared, never defined here —
 * under a bare `tsc`/vitest run no bundler has substituted it, which `APP_VERSION` handles.
 */
declare const __APP_VERSION__: string;

/** The game's name, as shown to players. */
export const GAME_TITLE = 'The Far Carry';

/**
 * The wordmark form. The intro cinematic rasterises THIS string into its star constellation,
 * so its length is load-bearing — see `fitTitlePx` in `render/introView.ts`, which shrinks the
 * face until the wordmark fits the design frame on every platform's `system-ui`.
 */
export const GAME_TITLE_UPPER = 'THE FAR CARRY';

/**
 * The shipped build, from package.json — the string a player quotes in a bug report.
 *
 * The `typeof` guard reads an undeclared global safely (it yields `'undefined'` rather than
 * throwing), so the constant still resolves under vitest and node where nothing has
 * substituted it. A dev build is visibly marked rather than silently claiming a release.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

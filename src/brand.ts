/**
 * Product identity — the ONE place the game's name and version are written (GS-release-identity).
 *
 * The title used to be a bare literal in six places (title screen, the intro cinematic's
 * constellation wordmark ×2, the boot-error card, the resume header, the test hub), which is
 * exactly how a rename half-lands: five surfaces move and the sixth keeps shipping the old
 * name for a year. Every user-facing surface reads these constants instead.
 *
 * **IDENTIFIERS MOVED TOO — ONCE, BEFORE LAUNCH, AND NEVER AGAIN.** The persisted names went
 * with the product: `fc_save`/`fc_story`/`fc_settings`, `BACKUP_KIND` = `far-carry-backup`, and
 * the `far-carry-` service-worker cache prefix. A player who opens their backup file or their
 * devtools should see the game they are playing, and pre-launch is the only moment that costs
 * nothing — after launch it would mean migrating real players' data instead of three test
 * devices. Every read path still ACCEPTS the old spelling (`save/legacyKeys.ts`,
 * `LEGACY_BACKUP_KIND`) so the devices that played under the old name lose nothing; writes are
 * always canonical. Old input, new output — the shape `migrateCampaignStore` and the v1→v2
 * bundle fold already use.
 *
 * **Once the game is public this stops being free.** A persisted string is a contract with data
 * that exists; a product name is a label. They are the same string today only because the rename
 * landed before anyone was holding the contract.
 *
 * Still NOT rename targets: the npm package name, the repo, and the Capacitor `appId`
 * (`com.foxorama.golfstars` — a permanent package identifier; renaming it would be a different
 * app). `tests/brand.test.ts` machine-checks all of it.
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

/** Injected by Vite from the commit being built (see `buildId()` in `vite.config.ts`). */
declare const __BUILD_ID__: string;

/**
 * WHICH BUILD, not which release (GS-build-id).
 *
 * `APP_VERSION` answers "which version is this" and cannot answer "is this the build I just
 * deployed" — it comes from package.json, so it stood at 1.3.1 across fourteen merges and five
 * deploys. That is the gap a play-test walked into: *"my phone still hasn't updated, but my wife's
 * has"*, with no way for anyone — player, developer or a support reply — to establish which build
 * either device was actually running.
 *
 * Shown beside the version on the title screen, which every session passes through, so the answer is
 * readable off the device itself rather than inferred from when somebody last opened the app.
 */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

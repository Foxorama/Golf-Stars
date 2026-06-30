# Archived engineering log — process and deploy

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Testing (regression guard)
- `tests/` (vitest) imports the pure `src/sim/` modules directly and asserts on seeded runs.
- CI: `.github/workflows/tests.yml` runs the suite on every push/PR. Keep new game logic inside
  `src/sim/` (pure) so it's reachable from tests.

## Test & demo hub (GS-16 — `test.html` / `src/test/`)
- **A second built page** (`test.html` → `src/test/hub.ts`) served beside the game on the same
  origin (`dist/test.html`). Two faces: a **Demo** that drives the REAL game in an `<iframe>` via
  its public hooks (`?seed=`, `?intro=`, and the live `window._gsFeel`/`_gsIntro`/`_gsSpray`/`_gsArt`
  escape-hatch flags set on the same-origin iframe window), and a **Sim Lab** that imports the
  pure sim for batch experiments. It re-implements ZERO game logic — it pokes the artifact. The
  full standard + a portable guard template live in `standards/` (see `TEST-HUB-STANDARD.md`).
- **The Sim Lab is the QA lens made interactive.** `src/test/lab.ts` is a PURE, DOM-free engine
  (unit-tested in `tests/lab.test.ts`) that only ORCHESTRATES the real sim and aggregates the
  result: `dispersionStudy()` fires one club N times through `resolveShot` ("hit the driver
  1000×" → scatter + carry histogram + σ/percentiles); `buildLoadout()` composes a real loadout
  from handicap + meta upgrades + shop perks (watch the cone tighten); `scoreHarness()` runs N
  seeded `simulateRun`s and reports **mean per-stop Stableford** (the balance metric — NOT
  distance). `src/test/charts.ts` is render-only Canvas2D (verified eyes-on, not unit-tested).
- **Build/deploy gotcha:** `vite-plugin-singlefile` forces `inlineDynamicImports`, which Rollup
  forbids with multiple inputs — so the two pages CANNOT build in one pass. `npm run build` runs
  vite **twice**: the game (`index.html`), then `VITE_HUB=1 vite build` (entry `test.html`,
  `emptyOutDir:false`) which APPENDS the inlined hub beside the game. `pages.yml` already runs
  `npm run build`, so the hub deploys automatically. `tests/build.test.ts` builds only the game.
- **Most changes need NO hub edit — it absorbs them.** New content as data (a club/perk/meta/lie/
  format/biome row) appears in the Sim Lab automatically (the hub IMPORTS those tables); a sim
  behaviour change (shot/dispersion/economy/scoring) is reflected because the lab calls the real
  functions; a new game screen shows in the Demo iframe because it IS the game. The ONLY thing that
  needs hand-wiring is a brand-new **hook** (a `window._gsX` flag or a `?param`).
- **The guard auto-discovers hooks, so it can't be out-run.** `tests/test-hub.test.ts` scans the
  app source for every single-underscore `_gs*` flag and every `URLSearchParams…get('x')` param and
  asserts the hub drives EXACTLY that set, both directions — add a new flag and CI goes red naming
  the missing hub control; leave a dead one and it fails too. There is no hand-maintained hook list.
  (It also asserts the hub IMPORTS the content tables, so a list can't silently fork to a copy.)
- **Process — keep the hub in sync (the I4 rule, one atomic PR):** when you DO add a hook,
  **add the hook → add the hub control → confirm the guard is green → update docs**, all in one PR.
  The `keep-test-hub-in-sync` skill (`.claude/skills/`) walks it (and tells you when you can skip it).


---

## Art pipeline (Flux)
- Biome / boss-planet / course / item art is Flux-generated (`flux2_max`), text-to-image with
  styled prompts; downloaded into `art/`, lazy-loaded, runtime-cached. Same flow golf-finder used
  for night-sky art (`request_upload_url`→PUT→`generate_image`→`get_history`→download). Keep a
  prompt log so art is regenerable. Rarity tints the card/accent (`RARITY_C`).

## Deploy (GitHub Pages) — the hard-won gotcha
- **Pages Source MUST be "GitHub Actions"** (Settings → Pages → Build and deployment → Source),
  NOT "Deploy from a branch". `pages.yml` builds the Vite app and serves `dist/` — a single,
  fully-inlined `index.html`. If Source is set to a branch instead, Pages serves the repo's RAW
  `index.html`, whose dev entry `<script type="module" src="/src/main.ts">` 404s in the browser
  → permanent blank page. This caused a long blank-page hunt: every code fix was correct but
  **was never the file being served**. Symptom signature: the boot watchdog reports
  `failed to load resource: …/src/main.ts` (a string a Vite *build* can never emit — it only
  exists in the un-built source, so seeing it = raw source is being served).
- The boot watchdog in `index.html` is the safety net: it captures import-time throws AND failed
  resource loads via `window.onerror` + capture-phase `error`, records the first into `__gsErr`,
  and latches so the 5s timeout can't clobber the real cause. Keep it; `tests/build.test.ts`
  guards both the inlined-single-file output and this error-capture contract.

## PWA / installable app (offline without the stale-serve bug)
- **Golf Stars is an installable PWA.** `public/manifest.webmanifest` + `public/icon-{192,512,180}.png`
  (a golf-ball-planet, regenerable via `node scripts/genicons.mjs public` → Playwright renders an SVG to PNG)
  + `<head>` links in `index.html` make it install to a home screen / desktop. The manifest and icons
  are `public/` files copied VERBATIM to `dist/` — they are NOT inlined by `vite-plugin-singlefile`
  (an install manifest can't be a data-URI), and their hrefs are RELATIVE so they resolve under the
  Pages subpath (`/golf-stars/`). They contain no "assets" substring, so `tests/build.test.ts`'s
  no-external-`assets`-link guard stays green.
- **The service worker is NETWORK-FIRST, never cache-first** (`public/sw.js`). Online → always fetch
  fresh and refresh the cache as a side effect; offline → fall back to cache (and the cached app shell
  for navigations). This is the WHOLE point: it buys offline play WITHOUT resurrecting the stale-serve
  blank-page bug — a fresh deploy always wins the moment the device is online. The cache name is
  `golf-stars-<VERSION>`; bump `VERSION` per deploy to retire the prior offline snapshot. Registered
  from `app.ts` (`registerServiceWorker`), guarded to http/https so the `file://` build smoke test
  never tries (and fails) to register, and fully swallowed so a SW fault can't strand the boot.
- **Shared-origin coexistence with golf-finder is PRESERVED.** Both apps live on `foxorama.github.io`;
  a root-scoped sibling SW could hijack/blank this page (the original reason `index.html` nuked ALL
  workers/caches on load). That guard is now NARROWED to kill only FOREIGN workers (scope ≠ our
  subpath) and non-`golf-stars-*` caches, so our own offline worker survives while the golf-finder
  defense stays intact. Our worker registers with a RELATIVE url → scope is `/golf-stars/`, so it can
  only ever intercept Golf Stars. Verified end-to-end (Playwright over http on a `/golf-stars/` mount):
  SW controls the page, scope is subpath-confined, and an offline reload still boots + paints the title.
- This is a deliberate, scoped exception to the "no offline-utility service-worker framing" line under
  *Do NOT carry from golf-finder*: that rule rejected golf-finder's cache-FIRST offline-utility SW (the
  stale-serve hazard); a network-first, subpath-scoped SW for an installable game is the opposite trade.

## Change & versioning flow
- `main` is branch-protected. Each change: branch → edit → commit → push → PR → merge → sync.
- **Default to shipping all the way (this project's rule).** When a change is complete and tests are
  green, take it to done without waiting to be asked: open the PR, merge it (once CI passes), then
  clean up — delete the merged feature branch (local + remote) and sync `main`. Only stop short of
  merging if the work is explicitly WIP, the user says not to, or CI is red/unresolved.
- **Prefer auto-merge over a blocking wait.** Once a PR is open and CI is running, enable auto-merge
  (`enable_pr_auto_merge`) instead of polling for green then merging by hand — GitHub merges it the
  moment the required `test` check (from `tests.yml`) passes, and the head branch deletes itself. The
  bot only needs to land the PR; it doesn't babysit the run. (If CI is already green and there's no
  pending required check, auto-merge "fails gracefully" — just call `merge_pull_request` directly.)
  `tests.yml` has `concurrency: cancel-in-progress` so a newer push supersedes an older run and a
  stale pass can't merge over fresh red.
- **Repo settings auto-merge depends on are admin-UI only (no API tool in this env):** Settings →
  General → Pull Requests → *Allow auto-merge* and *Automatically delete head branches*, plus a
  branch-protection rule on `main` that **requires the `test` status check** (without a required
  check, enabling auto-merge merges immediately — no CI gate). Set these once by hand; they're not
  in the repo. The `tests.yml` workflow is the check the rule should require.
- Use the GitHub MCP tools in the web environment; finish changes by shipping (PR → merge → cleanup).
- Commit messages explain the *why*; end with the Co-Authored-By: Claude trailer.

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
a NETWORK-first, subpath-scoped SW for the installable PWA — see *PWA / installable app* above. That
is the inverse of golf-finder's cache-first offline-utility SW, not a re-coupling of the two apps.)


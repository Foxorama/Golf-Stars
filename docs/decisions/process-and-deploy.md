# Archived engineering log — process and deploy

> Verbatim excerpt from the original CLAUDE.md (pre-2026-06-30 restructure). This is the
> full per-feature rationale/history. The everyday constraints live in the root CLAUDE.md;
> read here for the deep "why" behind a system. Grep a GS-tag to jump to its decision.

## Testing (regression guard)
- `tests/` (vitest) imports the pure `src/sim/` modules directly and asserts on seeded runs.
- CI: `.github/workflows/tests.yml` runs the suite **once per change, on the pull request**. Keep new
  game logic inside `src/sim/` (pure) so it's reachable from tests. (See *One CI run, on the pull
  request* below for why the branch-push and post-merge runs went.)

## The one Chromium lookup (GS-browser-test-gate → GS-preview-chromium)

`scripts/chromium.mjs` is the single answer to "where is Chromium, and how do I launch it".
`tests/chromium.ts` re-exports it. Nothing else may derive a browser path.

**Why the home is a `.mjs` in `scripts/` and not the TypeScript file the rule was first written for.**
The ~40 eyes-on rigs are plain ESM and cannot import TypeScript. When the seam lived only in `tests/`,
four rigs reached it by standing up a whole vite server purely to `ssrLoadModule` a 40-line lookup,
and the other sixty did the obvious thing instead: they copied it. A seam that costs a build tool to
reach is one the next caller will copy-paste around, so the home moved to the file every caller can
`import`, and the TypeScript side became a one-line re-export.

**What the second description cost, twice.** In `tests/` it was 50 tests reporting SKIPPED everywhere
including CI, for months — the original GS-browser-test-gate story. The fix landed there and nowhere
else, so `scripts/` went on carrying **64 copies in eight different shapes, every one Linux-only**: a
hand-built `chrome-linux/chrome` under a Playwright cache dir, no `CHROME_PATH`, no Windows or macOS
path. That was worse, because **rigs fail soft**. With no browser a rig printed
`no chromium, wrote /tmp/….html` and exited **0**. So on the author's Windows machine every eyes-on
preview — the gallery, the fairway outline, the landing sheet, the clubhouse, all of them — silently
rendered nothing for months while reporting success, and CLAUDE.md goes on pointing at those rigs as
the eyes-on check for exactly the art changes the pure-sim suite is blind to. A green exit code said
the preview was fine; there was no preview.

**Three things the seam knows that a copy did not.**

1. **Existing on disk is not launching.** The Windows Playwright download has been observed refusing
   to start at all (*"the side-by-side configuration is incorrect"*) on a machine whose system Chrome
   runs perfectly. So the lookup returns a ranked LIST, `launchChromium` tries each in turn, and a
   system browser deliberately **outranks** a cached Playwright download. The headless shell is kept
   as a genuine last resort — it is a different binary that some of the tests' viewport and focus
   assertions do not behave identically under, but it rasterises a page perfectly well, which is all
   any rig needs, and on that Windows box it was the download that DID run.
2. **The first three ranks are load-bearing.** `findChromium` answers with rank 1 and the browser
   suite gates `it.runIf` on it, so anything new goes at the END of the list unless what it does to
   `tests/` has been measured. Rank 2 is the Linux-layout Playwright cache because that is what the
   CI runner is.
3. **A missing browser must be LOUD.** `launchChromium` throws, naming every candidate it tried and
   the fallback HTML the rig already wrote. Non-zero exit, because a rig that cannot show you the
   picture has failed at its only job.

⚠️ The register scan (`tests/one-description.test.ts`) bans **deriving** a path — `CHROME_PATH`,
`chrome-linux`, `ms-playwright`, `pw-browsers`, `chromium-<rev>` — across `tests/` AND `scripts/`. It
deliberately does NOT ban `executablePath`: the browser tests pass the seam's own answer to
`chromium.launch({ executablePath })`, which is calling the seam rather than duplicating it, and a
guard that flags 22 correct files is one everybody learns to edit.

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
  check, enabling auto-merge merges immediately — no CI gate) and **Require branches to be up to date
  before merging**. Set these once by hand; they're not in the repo. The `tests.yml` workflow is the
  check the rule should require. The up-to-date rule became load-bearing when CI stopped running on
  `main` — see below.
- Use the GitHub MCP tools in the web environment; finish changes by shipping (PR → merge → cleanup).
- Commit messages explain the *why*; end with the Co-Authored-By: Claude trailer.

## One CI run, on the pull request (GS-ci-once)

`tests.yml` fired on `push: ['**']` **and** `pull_request`. Both are real events on the same code,
and their concurrency groups differ — `refs/heads/<branch>` for the push, `refs/pull/<n>/merge` for
the PR — so the cancellation rule could never collapse them. Every commit on a branch with an open
PR ran the whole ~7-minute suite **twice, side by side**. It is plain in the run history:
`leave-round` push 7.3 min and `leave-round` pull_request 7.3 min, back to back, same commit.
Measured over the repo's first 39 days: **2,333 runs of this workflow, ~60 a day**, roughly half of
them a duplicate.

On a public repo that costs no money — standard runners are free and unlimited — which is exactly
why it survived so long. It costs **wall-clock**: every push waits on two runs competing for the
same runner pool.

**The pull-request run is the one kept**, and the reason is not just that it is the required check
auto-merge gates on. It tests the **merge commit** — the PR head already merged into `main` —
whereas a branch push tests the branch in isolation, which can be green while the merge is red.
Strictly more information for the same seven minutes, at the only moment the answer changes what
happens next. A branch with no PR open now runs nothing, deliberately: an unopened branch has no
decision pending, and `workflow_dispatch` is there to check one early.

⚠️ **The post-merge run on `main` is gone, and an admin-UI setting is what replaces it.** Branch
protection's *Require branches to be up to date before merging* is what makes the merge commit CI
tested byte-for-byte the one that lands; with it on, a run on `main` afterwards could only
re-confirm a green it already had. With it **off**, a PR opened against an older `main` can merge on
a pass that was never true of the result — the same stale-pass hole `concurrency` closes for
commits, reopened one level up. Like Pages' *Source: GitHub Actions* and the `github-pages`
environment's ref policy, it lives outside the repo and nothing in git enforces it.

⚠️ **Never add a docs `paths-ignore` to buy more.** It is the obvious next saving and it is wrong
here: several guards read prose as input — `privacy.test.ts` fails when a storage key in `src/` is
missing from `PRIVACY.md`'s table (and vice-versa), and the one-description register scans source
for banned re-derivations. A docs-only change in this repo can be genuinely red.

### And a release runs it too (GS-release-gate)

Deleting the `main` run left the `v*` tag as **the last path to a real player's phone with no gate of
its own**. `pages.yml` and `itch.yml` both fire on the tag and both went straight to build-and-ship.
That was defensible while `main` also ran CI; once it didn't, the only thing behind a release was a
PR check on a commit that is not necessarily the one being tagged — a tag is a commit **plus whatever
the release branch did to `package.json` on its way past**.

Both now gate on the suite: `uses: ./.github/workflows/tests.yml`, with `build`/`push` on
`needs: test`. **Called, never copied.** A release workflow that pasted the seven steps would be free
to drift from the one the PR gate runs, and nobody reads the release copy until a release is already
going out. `tests.yml` gained `workflow_call` and an explicit `permissions: contents: read` — a
called workflow inherits the *caller's* permissions, and `pages.yml` holds `pages: write` +
`id-token: write`, so without that line the test job would run holding a Pages deployment token.

⚠️ **A tag starts both callers at once, and the concurrency key has to know that.** Keyed on
`${{ github.ref }}` alone, `pages.yml` and `itch.yml` calling the same reusable workflow on the same
tag land in one group — and with `cancel-in-progress: true` the second caller **cancels the first
one's suite**. A cancelled job is a failed dependency, so the deploy that needed it is skipped: the
release half-ships, one destination live and the other silently absent. The key is
`${{ github.workflow }}-${{ github.ref }}`, because in a called workflow `github.workflow` is the
**caller's** name (`tests-pages-…` vs `tests-itch-…`). On a PR it is still one group per PR, so
superseding a stale commit is unchanged. Caught by reading, before shipping — there is no way to
test it short of pushing a tag.

**The cost, named rather than discovered later:** two full suites per release tag. A real duplicate,
accepted on the rare path (a handful a month, $0 on a public repo) in exchange for the two
destinations continuing to fail independently — if butler is down, Pages still ships. It is not the
~60-a-day duplicate GS-ci-once deleted and should not be read as reversing it. Spending it once means
folding both into a single `release.yml` (test → build once → deploy Pages + push itch from the same
artifact), which would also make itch.yml's "the SAME `npm run build` output that pages.yml serves"
structurally true instead of a comment sitting over two independent builds. That is its own change
and its own PR: this path reaches players' phones, it has already produced three documented
incidents, and none of it can be verified without cutting a real tag.

**Known gap, not closed here:** the tag-vs-`package.json` assertion lives only in `itch.yml`. A
mismatched tag fails the itch push and still deploys Pages with the wrong `APP_VERSION`. Worth fixing
when the two workflows merge, since the assertion then becomes one job both destinations gate on.

**And the lockfile keeps its own copy of the version, which nobody was watching.** A release edits
`package.json` and nothing else by hand — `APP_VERSION` (Vite `define`), the boot watchdog's
`%GS_VERSION%` and the SW cache name all derive from it, which is the whole point. `package-lock.json`
writes the same number in two more places (its root, and its `packages[""]` self entry), **nothing
derives from those**, and so nothing noticed when they stopped agreeing: they sat at `1.4.1` through
the 1.5.0 and 1.6.0 releases. Harmless in practice — `npm ci` reconciles DEPENDENCIES, not the
project's own version, and it installs clean either way (checked) — but it is exactly the shape this
repo keeps paying for: one fact written in files that cannot share a constant. It cannot be derived
away, so it is guarded the way the three-file SW cache prefix is, by a test that reads both copies
(`tests/brand.test.ts`, beside the version plumbing it belongs to; the guard was confirmed to fail on
a deliberately drifted lockfile, not assumed to). ⚠️ Sync it by editing **those two lines only** — a
blind find-and-replace on the old version string hits a dependency pinned at the same number
(`dom-serializer` was at 1.4.1) and corrupts the lockfile.

**Why this was looked at at all.** The question was whether to make the repo private. Private repos
have been free since 2019, but three things silently downgrade on the Free plan: GitHub Pages stops
publishing from a private repo (Pro/Team/Enterprise only) — which is `farcarry.vulpecula.games`, the
origin real players have installed; Actions minutes stop being free (2,000/month, then $0.006/min —
this workflow alone runs ~12,600 minutes a month, about **$64**, and Pro's 3,000 minutes barely dent
it); and protected branches and rulesets are public-only on Free, which is the required `test` check
auto-merge depends on. The repo stays **public** — it is all-rights-reserved already, and the licence
is the protection, not the visibility. The duplicate run was found while measuring the minutes.

## Do NOT carry from golf-finder
GPS/geolocation, OSM/Overpass, weather APIs, real astronomy/star catalogs, the day course-finder,
offline-utility service-worker framing. We deliberately left all of it behind. (One scoped exception:
a NETWORK-first, subpath-scoped SW for the installable PWA — see *PWA / installable app* above. That
is the inverse of golf-finder's cache-first offline-utility SW, not a re-coupling of the two apps.)


---

## GS-sw-stale â€” "network-first" still read the HTTP cache (2026-08-02)

> *"On my mobile phone, which is the app installed from farcarry.vulpecula.games, it's still not
> updated and I've cleared cache on the app. Is this a versioning thing? â€¦ I don't have any way to
> identify who would end up with a stale app."*

### The diagnosis, and the theory it killed

The obvious suspect was the worker's version. `sw.js` stamps `VERSION` from `package.json`, which had
sat at **1.3.1 for fourteen merges** â€” so the served worker was byte-identical on every deploy, and a
browser only installs a new worker when the script differs. No `install`, no `activate`, no cache
sweep. That is real, and it is not the bug.

The bug was found by reproducing it: a local server sending GitHub Pages' own headers, the real
`public/sw.js`, and a PERSISTENT chromium profile so the worker, its CacheStorage and the HTTP cache
all survive across "app launches" the way they do on a phone.

```
1. install (BUILD-1)          shows=BUILD-1  controlledBySW=true
2. relaunch                   shows=BUILD-1
--- deployed BUILD-2 ---
3. relaunch after deploy      shows=BUILD-1     â† stale
4. relaunch again             shows=BUILD-1
--- and again with sw.js bytes CHANGED ---
5. relaunch                   shows=BUILD-1     â† still stale
```

Then the decisive control: **run it with the service worker removed entirely.** Still stale. The
worker was never the culprit.

`fetch(req)` inside a worker reads the browser's ordinary HTTP cache like any other fetch, and GitHub
Pages serves this game's single-file index.html with `Cache-Control: max-age=600` â€” **a header Pages
gives you no way to set.** So for ten minutes after any load, "network-first" answers a navigation out
of the HTTP cache without ever asking the server. The worker's policy was doing exactly what it said;
the fetch underneath it was not.

âš ï¸ Confirmed self-healing: with `max-age=2` and a four-second wait, both the worker and the no-worker
control pick up the new build. So this explains a ten-minute stale window, **not a phone stale for
hours** â€” that gap is still unexplained and the fix below is deliberately one that does not depend on
knowing the answer.

### The fix

- **The shell is fetched with `cache: 'no-cache'`** â€” a conditional request on every launch, so a
  deploy is picked up on the very next one. NOT `no-store`, which would bypass the cache in both
  directions and re-download the whole 2.4MB bundle on mobile data every time; `no-cache` sends
  `If-None-Match` and an unchanged build costs a 304. Only the SHELL, so icons and the manifest do not
  each pay a round-trip on a cold start.
- **`register('sw.js', { updateViaCache: 'none' })`** â€” by default the browser fetches sw.js for its
  UPDATE CHECK through that same HTTP cache, so it asks its own cache whether the worker changed and
  is told no. Step 5 above is that, measured: sw.js genuinely differed and the old worker stayed.

Measured after, under the real `max-age=600` with no waiting: **relaunch after deploy shows BUILD-2.**

### What was deliberately NOT changed

`VERSION` still comes from `package.json`, i.e. it moves per RELEASE rather than per build. That is
correct here rather than lazy: between releases the fetch handler re-`put`s the fresh shell into
CacheStorage on every successful launch, so the offline copy stays current anyway, and the version
only governs sweeping old cache NAMES. Stamping per build would reinstall the worker and re-precache
2.4MB on every deploy for housekeeping nobody sees.

### Guard

`tests/sw-update.test.ts` drives a real persistent profile against a real server and asserts an
installed app shows the new build after a deploy â€” and, in a second case, that **removing the
revalidation puts it back to stale**. That second case is the point: `max-age` only bites while the
entry is fresh, so a test that merely waited would report green on a worker that strands every player
for ten minutes after each deploy.

âš ï¸ It adds six browser launches to a suite that already runs 24 browser files in parallel, and it
tipped `a11y-keyboard`'s timing-sensitive case over once under load. That case passes alone and the
full suite passed clean on re-run, so it is noted rather than worked around â€” but if it recurs, the
extra concurrency is where to look first.

### The wider lesson

**"Network-first" is a claim about the worker's policy, not about the network.** A cache the policy
never mentions sat underneath it the whole time. The comment at the top of `public/sw.js` promised
"online â†’ always fetch fresh", and it had been wrong since the file was written; nobody caught it
because the only symptom is a ten-minute window that heals itself before you can investigate it.

---

## GS-staging â€” three environments, and a release is a tag (2026-08-02)

> *"I also need an environment where I can test out this stuff before pushing it to itch or to the
> installed appsâ€¦ all the back and forth we've been through today."*

### What went wrong that this exists to stop

`pages.yml` fired on every push to `main`, and `farcarry.vulpecula.games` is the origin real players
have **installed as a PWA**. So every merge went straight onto their phones. In one day that shipped
four passes at the ball's bounce, two of them net-worse, each live within minutes of merging and with
no way to try it first. The play-test loop was running in production.

### The constraint that decides the shape

**Production cannot move, and staging cannot be a path.**

A PWA binds to its ORIGIN. Everyone who installed the game is pinned to
`farcarry.vulpecula.games`, and their saves live in that origin's `localStorage`. Moving production
elsewhere means every player uninstalling, reinstalling, and hand-carrying a save export across.

And a path on the same origin (`/next/`) does not work either, for the reason that is easy to miss:
`localStorage` is per-ORIGIN, not per-path. Staging and production would share the same `fc_*` blobs,
and a staging build with a bumped save schema would write something production refuses to read â€”
`GS-save-integrity` would drop that player into read-only mode, correctly, and it would be a real
player.

So staging is a separate subdomain on a separate host, and production stays exactly where it is.

### The layout

| | host | trigger | audience |
|---|---|---|---|
| production | GitHub Pages, `farcarry.vulpecula.games` | **version tag** | installed PWAs, everyone |
| staging | Cloudflare Pages, `next.farcarry.vulpecula.games` | every push to `main` | us |
| preview | Cloudflare Pages, `<branch>.next-far-carry.pages.dev` | every branch | us, before merge |
| itch | butler | **the same version tag** | itch players |

The preview row is the one that answers the original complaint: a pull request now has a URL you can
open on a phone BEFORE it is merged, which is the only thing that would have caught a feel regression
in time.

`itch.yml` already worked this way (`tags: ['v*']`, with the tag asserted against `package.json`), so
this is Pages catching up to a convention the repo already had rather than a new one.

### The gate is in TWO places, and only one of them is in git

`pages.yml`'s `on: push: tags: ['v*']` says what may *start* a deploy. The **`github-pages`
environment** says what may *finish* one, and it carries its own deployment-ref policy in repo
settings — nothing in the repository describes it, nothing in CI checks it.

It held a single **branch** rule for `main`, from the days when `main` was production. So the very
first tagged release built green and then the deploy step was refused:

> Tag "v1.4.0" is not allowed to deploy to github-pages due to environment protection rules.

Which reads like a credentials or permissions fault and is neither: it is the workflow and the
environment disagreeing about what a release *is*. Worth knowing the shape of, because the build job
succeeding makes it look like the deploy is the broken part.

The policy is now **exactly one row — the tag `v*`**. The `main` branch rule was DELETED rather than
left alongside, and that is the part worth stating: while it existed, a `workflow_dispatch` on `main`
could publish staging code to every installed PWA. Leaving it would have meant the protection this
whole change exists for held only as long as nobody used the manual trigger.

To read or restore it (there is no other copy):

```
gh api repos/OWNER/REPO/environments/github-pages/deployment-branch-policies
gh api -X POST repos/OWNER/REPO/environments/github-pages/deployment-branch-policies \
  -f name='v*' -f type='tag'
```

⚠️ This joins *Allow auto-merge*, *Auto-delete head branches* and the `main` branch protection on the
short list of settings the workflow depends on and cannot assert. A recreated repo, or an environment
recreated by Pages, comes back without it.

### Notes worth keeping

- **Cloudflare's setup is the WORKERS flow now**, not Pages, if you start from the default button â€”
  it asks for `npx wrangler deploy` and wants a config in the repo. The Pages flow (build command +
  output directory) is what this uses. A `wrangler.jsonc` was written for the Workers path and then
  deleted, because nothing on the Pages path reads it and a config file nothing reads is a trap for
  whoever finds it next.
- **The first staging deploy went green while serving the repo root**, because the build output
  directory was unset â€” so `/src/main.ts` returned 200 and the game was the raw dev source. That is
  the same permanent-blank-page failure the Pages setup was designed around, arriving via a different
  host, and its documented signature (`/src/main.ts` in the served HTML, a string a Vite build can
  never emit) caught it in one request. **A green deployment is not a working one.**
- **Staging is proxied and production is not**, so Cloudflare injects ~1.2KB of bot-detection script
  into staging that production never sees. Harmless so far, and worth remembering the two are not
  byte-identical.
- `public/_headers` sets `Cache-Control: no-cache` on the shell. GitHub Pages ignores the file
  entirely and itch serves a zip, so it takes effect only on staging today â€” where it means a
  play-test can never be looking at a stale build. The rules are written to be correct on ANY host so
  that if production ever moves, it gets fresher and never staler.

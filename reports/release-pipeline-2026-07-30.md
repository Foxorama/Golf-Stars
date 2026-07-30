# The store page and the release chain — 2026-07-30

Two problems, answered together because they are the same problem: **the game ships, but nothing
around the game does.** The build is automated end to end and the page it lands on is a wall of
text over an empty black rectangle, updated by hand, announced to nobody.

The copy is not the issue. `reports/itch-description-2026-07-29.html` reads well and is live. What
reads as low-tier is the page *furniture* — what a visitor sees in the first two seconds, before a
word is read.

---

## Part 1 — the page

### The one thing that matters: the embed is a void

Above the fold, the page is the banner, then roughly **700px of black nothing** with a small green
`Run game` button floating in the middle of it. That single element is doing more damage than every
other issue on this list combined. A visitor's first impression of a game about *looking at
beautiful procedurally-drawn golf holes* is an empty rectangle.

It is a settings problem, not an art problem. The embed is sized far wider and taller than the game
wants, so the unlaunched iframe paints its background across the whole page column.

**Fix (itch → Edit game → Embed options):**

| Option | Set to | Why |
|---|---|---|
| Embed type | `Embed in page` | Keep it — a launch button on a page with no game visible is worse. |
| Viewport width | `820` | `.gs-main`'s own `max-width` is 820px (`index.html:96`). Wider only adds black margin. |
| Viewport height | `760` | Must clear **660**: below that `data-gs-fit` flips to `tight` and the HUD sheds detail (GS-a11y-tight-fit). 760 gives the desktop play frame a ~395px portrait column (`min-aspect-ratio: 3/4` → `max-width: calc(var(--gs-dvh) * 0.52)`, `index.html:1239`). |
| Fullscreen button | **on** | The game is designed portrait-first; fullscreen is where it looks best. |
| Mobile friendly | **on** | It is a PWA with touch controls and it genuinely works. itch forces fullscreen on mobile. |
| Click to play | leave **on** | Audio is muted on autostart anyway, and the intro cinematic wants a gesture. |

That change alone takes the page from "empty" to "a game-shaped window with a golf course in it".

### Then, in order of return

1. **A GIF as the first screenshot.** itch autoplays animated GIFs in the screenshot rail, and it is
   the only motion the page will ever have. Best candidates, in order: a drive with the spray cone
   opening and the ball skipping out; the Star Tour map with the ship flying; the finale battle.
   Keep it under ~3MB and ~6s. There is no capture script in the repo yet — `scripts/banner.mjs`
   already drives Chromium through Vite and is the pattern to copy for one.
2. **Check the cover image exists** (630×500). It never appears on the page itself, so it is easy to
   never notice missing — but it is the *only* thing shown in browse, search, collections and
   Discord/Bluesky link previews. If the page is invisible in browse, this is why.
3. **Tags and metadata.** Free discovery, currently unknown from the page view. Genre `Sports` or
   `Simulation`; tags `golf`, `roguelike`, `procedural-generation`, `space`, `rpg`, `singleplayer`,
   `pwa`. Inputs: mouse, touch, keyboard. **Accessibility: tick every box you qualify for** —
   configurable controls, high contrast, subtitles/textless, one-button-ish. The game has
   screen-reader narration, full keyboard play, readable-text scaling and reduced motion, which is a
   genuinely rare filter to show up in. That is a real differentiator being left on the floor.
4. **Break the prose with images.** The Details box takes `<img>`. Two or three inline — a hole, the
   star map, a caddy — turn a wall into a page. Put one directly under the opening hook.
5. **Move the short tagline in.** `reports/itch-description-short-2026-07-29.html` has three drafted
   taglines for the *"Short description or tagline"* field (200 chars, separate from the Details
   box). That field is what appears on the game card and in link previews. Draft A is the one.
6. **The `RESTRICTED` badge** in the manage bar means the page is not fully public. Worth confirming
   that is deliberate before wondering why traffic is zero.

---

## Part 2 — the chain, from an edit to a player knowing about it

### What already exists

```
branch → edit → npm run check → commit → push → PR → auto-merge on green `test`
                                                          ↓
                                             pages.yml builds and deploys
                                                          ↓
                                  https://foxorama.github.io/Golf-Stars/   ← "check it on my page"
```

That half is done and needs nothing. **Every merge to `main` is live on Pages within a couple of
minutes.** Pages is the staging environment; it is not the release.

### What was missing, and is now added

`.github/workflows/itch.yml` — pushing a version tag builds the *same* artifact and butler-pushes it
to `vulpeculagames/the-far-carry:html5`.

```bash
npm version patch -m "1.0.1 — %s"   # bumps package.json, commits, tags v1.0.1
git push && git push --tags          # the tag push is what fires the itch workflow
```

Design notes:

- **The tag is the release.** The workflow asserts the tag matches `package.json.version` and fails
  loudly otherwise — `APP_VERSION` is defined from package.json, so a mismatch means the game shows
  the player a build number that traces to nothing.
- **One build command, one artifact.** itch and Pages cannot drift, because there is no second build.
- `dist/test.html` (the demo hub) is stripped from the store build. It stays on Pages, where it is
  useful.
- One-time setup is documented at the top of the workflow: a `BUTLER_API_KEY` secret, and ticking
  *"This file will be played in the browser"* on the first upload. Both are admin-UI only, exactly
  like the Pages *Source: GitHub Actions* rule.

### The one remaining hand-bump

`public/sw.js` still carries `var VERSION = 'fc-pwa-1'` with a `// bump per deploy` comment. That is
a constant somebody has to remember — the same failure mode `%GS_VERSION%` was introduced to kill
for the boot watchdog (GS-release-identity). It should be substituted at build time from
package.json. Small, self-contained, its own PR. Until then it is a checklist line, and the cost of
forgetting is that returning offline players keep an older snapshot one boot longer.

### ⚠️ Saves on itch — the picture is the opposite of the folklore, and worse

The widely-repeated warning is that itch serves each upload from its own path, so an update hands
players a fresh empty origin and their save is gone
([the thread](https://itch.io/t/2346400/html5-local-storage-is-lost-at-every-update)). The reason
that thread never resolves is that **the premise is wrong: localStorage is scoped to ORIGIN, not
path.** itch serves every HTML5 game from a shared CDN origin (`v6p9d9t4.ssl.hwcdn.net`, now
`html-classic.itch.zone`), and that origin does not change when an upload does
([itchio/itch.io#1155](https://github.com/itchio/itch.io/issues/1155),
[shared-storage report](https://itch.io/t/1158456/html5-local-storage-seems-to-be-shared-between-multiple-games)).

So updates are fine. What we actually inherit is a **communal storage bucket**, and it carries three
consequences that matter more than the one everybody worries about:

1. **Storage can be denied outright, and we fail silently.** The game runs in a cross-origin iframe,
   so its storage is third-party. Chrome blocking third-party cookies denies `localStorage` to the
   frame entirely; iOS private mode does the same. `save/storage.ts` degrades to a **no-op** when
   storage is unavailable — deliberately, so the sim stays node-pure — which means an affected
   player finishes a campaign and loses all of it with no warning at any point.
   **This is the highest-severity item in this document.**
2. **Key collisions are somebody else's decision.** `fc_save` / `fc_story` / `fc_settings` sit in a
   bucket shared with every other HTML5 game on itch. GS-release-identity picked those names as a
   brand decision, correctly, but on the assumption of a private origin. Nothing stops another
   game writing `fc_save` tomorrow.
3. **The quota is shared, so eviction pressure is other people's traffic.** Browser eviction is a
   live threat to a localStorage-only save anywhere; on itch it is somebody else's game filling
   the bucket.

butler pushing to one channel is still right — but for build hygiene, not save safety. The save
answer is code, and it is Part 3.

### Devlogs — the only thing that tells anyone

Nothing in the automated chain notifies a human. A build lands silently; the page just quietly
becomes newer. The devlog is the whole notification surface:

- it posts to the game page and to the itch feed of anyone following the account or the project,
- it is what an update looks like to a returning player,
- and it is the only artifact that survives to be linked elsewhere.

Cadence that fits a solo project: **one devlog per tagged release, none in between.** Merges to
`main` are not news. A release is.

A devlog that works is not a changelog. Three parts:

1. **One line of what changed that a player can feel.** "The ball actually bounces now" beats
   "GS-runout-visible: derive apex/length ratio from descent angle".
2. **A GIF or a before/after.** The commit history of this project is unusually rich in these —
   nearly every render change was measured with a preview script that already renders the frames.
3. **The rest as a short list**, with the honest boring items included.

The raw material is already written: commit subjects in this repo are one-line summaries in plain
English by convention ("A seed is a better bug report than a stack trace"). `git log v1.0.0..v1.0.1
--oneline` is most of a draft.

### Reaching people who are not already on itch

itch's follow graph is weak for a free browser game — followers see feed items, and that is roughly
it. If reach matters, the addition is a channel you own, not a bigger itch presence:

- a Bluesky/Mastodon account posting the GIF from each devlog (the GIF is the post; the link is
  secondary),
- `r/WebGames`, `r/incremental_games` and `r/golf` for launch-shaped moments only,
- an in-game "what's new" beat is *not* worth building: `APP_VERSION` is already on the title screen,
  and the game collects nothing, so there is no channel to push to and no list to build.

The privacy stance (`PRIVACY.md`, machine-checked) rules out the usual growth kit — no email capture,
no analytics, no funnel. That is a deliberate trade and worth stating on the page as a feature, which
the current description already does well. It does mean **the devlog and the GIF are the whole
marketing apparatus.** They deserve the effort the code gets.

---

## Part 3 — making the save durable (and what "install as an app" actually buys)

### The premise to correct first

**A PWA update does not reinstall anything and does not change origin.** The service worker swaps
the app shell in place; localStorage is untouched. An installed player who updates keeps their save
— always. Installing is not the risk to saves, it is the strongest protection available, for a
reason that is not obvious:

- **iOS Safari caps script-writeable storage at 7 days of no interaction** and deletes it. A browser
  player who puts the game down for a fortnight comes back to nothing. **Home-screen web apps are
  exempt from that cap.**
- **`navigator.storage.persist()`** asks the browser to exempt the origin from eviction. Chrome
  grants it readily to installed apps and highly-engaged sites. **We never call it.** That is one
  API call standing between the current state and a save the browser has promised to keep.

So the install banner and the save-durability work are the same feature, and the honest pitch to the
player is: *install it and your progress stops being disposable.*

### The one thing installing cannot fix

A PWA cannot be installed from inside itch's iframe — installation needs a top-level context and a
manifest on that origin. **The installable app therefore lives on Pages (or a custom domain), never
on itch.** That leaves three permanently separate save universes — itch's CDN origin, the Pages
origin, the Capacitor shell's `https://localhost` — with export/import as the only bridge, exactly
as GS-save-transfer already says. That is not a bug to fix; it is a fact to tell the player once, on
the screen where it matters.

### Work list, in severity order

1. ~~**Detect that storage is dead and say so.**~~ ✅ **Shipped** — GS-save-durability (#652).
   A read-back probe at boot; a non-dismissible title alert when writes don't stick, pointing at
   Export (which still works).
2. ~~**Call `navigator.storage.persist()`**~~ ✅ **Shipped** — same PR, with the answer surfaced in
   Settings → Save data as one of three honest states.
3. ~~**Let the install nudge say what it buys**~~ ✅ **Shipped** — same PR. It reads
   "offline + safer save" rather than asking the player to want a shortcut icon.
4. ~~**Namespace the keys against the communal itch bucket.**~~ ✅ **Shipped** — GS-save-integrity.
   It needed no detector of its own in the end: a blob with no numeric schema version is not ours,
   and that falls out of a classification two *other* data-loss paths needed anyway. `migrate()`
   answered every unreadable blob with `defaultSave()`, and the next ordinary persist wrote that
   over the real save — so the collision case, a save from a newer build (the Capacitor shell, on
   the documented export→import workflow), and corrupt bytes were all the same bug. The build now
   goes READ-ONLY rather than overwrite anything it could not fully read, and offers the stored
   bytes as a download. It also closed a hole in item 3's neighbour: a bundle whose *inner* save was
   newer imported as empty **while reporting success**. See `docs/decisions/save-integrity.md`.
5. **Make export a habit, not a memory test.** A "last backed up N runs ago" nudge on the settings
   screen, driven off a counter that already exists in the save.

Item 5 remains open and is a follow-up, not a blocker on a release.

### What is still true after that PR

Installing remains the only way to get a save the browser has *promised* to keep — and a PWA cannot
be installed from inside itch's iframe. So the itch build will always be the least durable place to
play, however well it now reports itself. That is a fact about the platform, and the reason the
Pages/custom-domain build is the one worth pointing committed players at.

## Checklist — cutting a release

```
[ ] main is green and Pages looks right at https://foxorama.github.io/Golf-Stars/
[ ] public/sw.js VERSION bumped            (until it is derived from package.json)
[ ] npm version patch|minor -m "..."       (bumps package.json + tags)
[ ] git push && git push --tags            (the tag fires .github/workflows/itch.yml)
[ ] workflow green; game loads from the itch page
[ ] save survived the update                (spot-check until proven once, then trust it)
[ ] devlog posted: one felt change, a GIF, then the list
[ ] Android AAB if the release warrants it  (npm run android:aab, separate channel)
```

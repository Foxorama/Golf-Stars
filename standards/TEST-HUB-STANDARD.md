# Test-Hub Standard (portable)

A project-agnostic minimum bar for a project's **test/demo hub** — the single page that
demonstrates and drives every feature of an app. This is extracted from golf-finder's
`test.html` + `tests/test-hub.test.mjs` + the `keep-test-hub-in-sync` skill, with the
project-specific parts (weather, loader, sky controls) stripped out.

**Use it like this:** drop this file into a repo, fill in that project's hooks, and a hub
either passes the four-invariant checklist below or it doesn't. "At least as good as
golf-finder" means *all four invariants hold and CI enforces #3*. The buttons differ per
project; the invariants don't.

> The trap to avoid: copying another project's hub *controls* (its weather buttons, its
> loader toggles) and calling it done. Those don't transfer. The four invariants are the
> standard — a hub with a beautiful control rail and no sync-guard is A-tier and already
> rotting.

---

## The four invariants

### 1. Drives the REAL artifact, never a copy
The hub loads the actual production build (same-origin, typically in an `<iframe>`) and
exercises it through public hooks. It re-implements **zero** app logic. The instant a hub
mocks, forks, or re-derives app behaviour, it tests a fiction and will pass while the app
is broken.

- ✅ Hub embeds the shipped artifact and calls into it.
- ❌ Hub contains a second copy of any feature, even "just for the demo".

### 2. Every demoable state is a public hook, in two flavours
A state you can only reach by clicking through the app by hand is not yet a hook. Expose it
two ways:

- **Declarative — URL params** (`?time=21:00`, `?wx=storm`). Deep-linkable, shareable,
  scriptable, works on first paint, no console needed.
- **Live — console/JS helpers** (`setWx('storm')`, `toggleCompass()`). Flip state with no
  reload, drive same-origin from the hub.

Rule: anything worth demoing gets both a URL form (for sharing/first-paint) and a live form
(for no-reload driving), unless one is genuinely impossible (e.g. a first-paint-only splash
can't read a runtime URL — document the exception).

### 3. A CI sync-guard that fails on drift  ← the S+/A divider
A test, run in CI on every PR, that asserts the hub and the app agree on the hook set
**both directions**:
- add a hook to the app → guard fails until the hub exposes it;
- rename/drop a hook → guard fails and names the now-dead hub control.

Without this, the hub silently dies the first time a hook is renamed: the button still
renders, it just does nothing, and nobody notices until a live demo. With it, drift is a
red build that tells you exactly what to fix.

**Source of truth for the hook list — pick the strongest your project supports:**
- *Build/module project:* import the hook registry and assert against it (robust, refactor-safe).
- *No build step (single-file app like golf-finder):* parse both files as **text** and match
  hook tokens. Less robust, but real — golf-finder's guard does exactly this.

Either way the principle is identical: **hub and app share one source of truth for which
hooks exist, and CI proves they're in step.**

### 4. A written process so the guard can't be out-run
A skill / CONTRIBUTING note / CLAUDE.md section making this one atomic change:

> **add hook → add hub control → extend guard → update docs** — all in the same PR.

The guard catches drift after the fact; the process stops it being introduced. Both are
required: a guard with no process means people add hooks and skip the hub; a process with no
guard means people forget the process.

---

## Recommended extras (not gates, but cheap wins)
- **Escape-hatches for feel/sensor features** — gate anything whose *feel* can only be
  judged on real hardware behind a `window._featureName` flag (default on) so it degrades
  safely and can be A/B'd on-device. (golf-finder: `window._tiltPan`, `window._camAz`,
  `window._skySwipe`.)
- **Responsive hub** — the control rail and the app preview shouldn't fight for the same
  pixels on a phone. Either side-by-side (desktop) or a stage-then-launch overlay (mobile).
- **`noindex`** the hub — it's a tool, not a public page.
- **No separate deploy** — serve the hub from the same origin as the app so there's no
  second publish step to forget.

---

## Conformance checklist (a hub is "≥ standard" only if every box is ticked)

- [ ] **I1** Hub loads the real shipped artifact same-origin; contains no re-implemented app logic.
- [ ] **I2** Every demoable state has a URL-param form AND a live-helper form (exceptions documented).
- [ ] **I3** A CI test asserts hub↔app hook parity in BOTH directions and fails on drift.
- [ ] **I3a** Hub and app share ONE source of truth for the hook list (imported registry, or text-match if no build).
- [ ] **I4** A written checklist makes "add hook → add hub control → extend guard → update docs" one PR.
- [ ] _(extra)_ Feel/sensor features sit behind `window._*` escape-hatches.
- [ ] _(extra)_ Hub is responsive, `noindex`, and deploys with the app (no separate publish).

---

## How to stand one up in a new project (≈ half a day)

1. **Inventory the states worth demoing.** Every weather/theme/time/feature-flag/error state
   a stakeholder might want to see. That list becomes your hook set.
2. **Add the hooks to the app** — a URL parser for the declarative forms, exported helpers
   for the live forms, `window._*` flags for the feel-features.
3. **Build the hub** — one same-origin page: a control rail that composes a URL
   (`buildURL()`) for declarative state and calls the live helpers for no-reload driving.
   Embed the real app in an iframe.
4. **Write the guard** — copy `test-hub-guard.template.mjs` (next to this file), fill in your
   project's hook tokens, wire it into CI.
5. **Write the process** — a short skill or CONTRIBUTING section: the four-step atomic change.
6. **Tick the checklist above.** Anything unchecked is the gap between this project and S+.

---

See `standards/test-hub-guard.template.mjs` in this repo for a ready-to-adapt guard test in
the zero-dependency / text-match style. For the build/module style, replace the text matchers
with an import of your app's hook registry — the assertions (parity both ways) stay the same.

---

## Golf Stars — where this project stands (read this part first)

Golf Stars is a **build/module project** (Vite + TypeScript + vitest). The hub is **shipped**
(GS-15): `test.html` → `src/test/hub.ts`, built into `dist/test.html` and served beside the game
on the same origin. It has two faces — a DEMO that drives the real game in an iframe, and a SIM
LAB that imports the pure sim for batch experiments (shot dispersion, loadout/upgrade builder,
scoring harness). The pure experiment engine is `src/test/lab.ts` (DOM-free, unit-tested).

**Hooks the app exposes** (the hub's control rail drives these):

| Hook | Flavour | Form | Defined in |
| --- | --- | --- | --- |
| Run seed | declarative | `?seed=<number\|string>` | `seedFromUrl()`, `src/app.ts` |
| Intro cinematic | declarative | `?intro=1` (force) / `?intro=0` (skip) | `shouldPlayIntro()`, `src/app.ts` |
| Flight feel | live (escape-hatch) | `window._gsFeel` | `src/render/playView.ts` |
| Intro feel | live (escape-hatch) | `window._gsIntro` | `src/render/introView.ts` |
| Spray tiers | live (escape-hatch) | `window._gsSpray` | `src/app.ts` |

**Conformance status:**
- **I1 ✅** — The hub iframes the real, inlined `dist/index.html` same-origin and pokes it. The
  Sim Lab imports the REAL sim (`resolveShot`, `loadoutFromPerks`, `simulateRun`, …) and only
  *measures* it (mean/σ/percentiles) — zero re-implemented game logic. Its option lists (clubs,
  perks, meta upgrades, lies, formats) are read from the sim's own tables, so they can't fork.
- **I2 — Partial.** `seed`/`intro` have a declarative URL form; the feel flags have a live form.
  Each hook ideally gets BOTH; adding a URL form for the feel flags and a live helper for seed/
  intro is the remaining I2 gap (a small follow-on, noted in IDEAS GS-15).
- **I3 / I3a ✅ (auto-discovering)** — `tests/test-hub.test.ts` is the live CI guard. It does NOT
  carry a hand-maintained hook list: it SCANS the app source for every `window._gs*` flag and every
  `URLSearchParams…get('x')` param and asserts the hub drives exactly that set, both directions — so
  a brand-new flag reds the build until the hub exposes it, and a dead hub hook fails too. It also
  asserts the hub imports the sim's content tables (clubs/perks/meta/lies/formats) rather than
  copying them. The portable fill-in version remains at `standards/test-hub-guard.template.mjs`.
- **I4 ✅** — The atomic-change rule lives in `CLAUDE.md` (*Test & demo hub* section) AND as the
  `keep-test-hub-in-sync` skill (`.claude/skills/`): add hook → add hub control → confirm the guard
  → update docs, one PR. The skill also documents what needs NO hub edit (new content/sim behaviour
  auto-propagates), so the process only fires when a genuinely new hook is introduced.

**Golf Stars-specific notes:**
- The Sim Lab is the project's QA-lens tool made interactive: the sim is pure/headless *precisely*
  so you can simulate from a seed and assert outcomes — the hub just puts a dial and a chart on
  that. "Hit the driver 1000×" is `dispersionStudy()`; "does this upgrade score better?" is
  `scoreHarness()` over N seeded `simulateRun`s, judged on **mean per-stop Stableford** (the
  project's balance metric — distance is chaotic, see CLAUDE.md).
- Keep the hub a **render/DOM side-effect**, never inside the pure reducer (`src/ui/game.ts`) or
  the sim — same boundary as the intro cinematic and save persistence. Driving the app by URL
  param + `window._gs*` flag respects that: the hub touches the shell, not the sim.
- Build/deploy: `vite-plugin-singlefile` forbids multiple inputs, so `npm run build` runs vite
  **twice** (the game, then `VITE_HUB=1` for the hub with `emptyOutDir:false`) → two inlined files
  in `dist/`. `pages.yml` already runs `npm run build`, so the hub deploys with the game.

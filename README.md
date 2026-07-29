# The Far Carry

A travelling space golf **RPG**: voyage the galaxy playing ever-wilder, procedurally-generated
golf courses. Play a course, earn rewards, upgrade your bag/ship/perks, travel further as
difficulty and absurdity scale.

> **Named `Golf-Stars` in the repo, shipped as _The Far Carry_** (GS-release-identity). The product
> name lives in `src/brand.ts` and nowhere else. The persisted names moved with it, once, before
> launch — `fc_save`/`fc_story`/`fc_settings`, `far-carry-backup`, the `far-carry-` cache prefix —
> and every read path still accepts the old spelling (`src/save/legacyKeys.ts`). **That was free
> only because nobody was holding the contract yet; it must not happen again.** The repo, the npm
> package and the Capacitor `appId` keep the old spelling deliberately — they are invisible to
> players. `tests/brand.test.ts` + `tests/save-key-migration.test.ts` pin all of it.

## Licence & privacy

**© 2026 Vulpecula Games. All rights reserved** — see [LICENSE](LICENSE). The repository is public
so the code can be read and learned from; that is not a licence to reuse it. Ask, and permission is
usually given.

**The game collects nothing and sends nothing** — see [PRIVACY.md](PRIVACY.md). No accounts, no
analytics, no tracking, no cookies; your save lives on your own device. That is a property of the
code, not just a promise, and `tests/privacy.test.ts` fails the build if it stops being true —
including if a storage key is added without documenting it.

> Deliberately separate from `golf-finder` (a real golf+astronomy tracker). golf-finder's soul is
> *realism and trust*; this game's soul is *fantasy, feel, and progression*. The two are
> independent — see `CLAUDE.md` and `GOLF-STARS-STARTER-KIT.md`.

## Status — vertical slice

One procedurally-generated hole, playable, scored, and tested end-to-end:

- **Seeded RNG** (`src/sim/rng.ts`) — mulberry32; the only randomness source. `Math.random()` is
  banned in the sim.
- **Course contract** (`src/sim/course/contract.ts`) — the frozen interface the generator emits,
  the renderer consumes, and the sim scores.
- **Pure sim** (`src/sim/`) — clubs, shot resolution (lie + plays-like wind), Stableford scoring,
  stats aggregation, and a headless round simulator. No DOM, no globals, deterministic.
- **Stub generator** (`src/sim/course/generate.ts`) — `seed → Course`, contract-valid.
- **Hole renderer** (`src/render/holeView.ts`) — SVG, tee→green play-line-up, hazards on top.
- **Versioned saves** (`src/save/`) — `version` + `migrate()` + export/import JSON from v1.
- **Tests + CI** (`tests/`, `.github/workflows/tests.yml`) — 39 tests; seeded rounds asserted.

## Develop

```bash
npm install
npm run dev        # Vite dev server
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

Open the dev server and try `?seed=42` in the URL — every run is reproducible from its seed.

## Architecture

The irreversible-if-wrong decisions are locked in `CLAUDE.md` ("Architecture") and explained in
`GOLF-STARS-STARTER-KIT.md` §3. Short version: Vite + TypeScript, a pure/deterministic sim split
from a thin render layer, seeded RNG only, a frozen course contract, versioned saves, and content
as data tables.

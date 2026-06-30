# Engineering decision log (archive)

These files are the **full per-feature rationale and history** for Golf Stars — the deep "why"
behind each system. They were split out of CLAUDE.md on 2026-06-30 so the root file could become a
lean constitution (the rules that constrain new work) instead of a ~2,000-line append-only changelog.

**Nothing was lost in the split** — every line of the old CLAUDE.md lives here verbatim, relocated by
domain. The root `CLAUDE.md` carries the load-bearing invariants and points here for the story.

## How to use this
- Skim the matching bullet in the root `CLAUDE.md` first (the invariant + the file pointer).
- Before changing load-bearing code in a system, **read its archive doc** for the gotchas/rationale.
- Grep a `GS-*` tag across this directory to jump straight to a feature's decision.
- When you ship a change: the durable *rule* goes in `CLAUDE.md`; the *narrative* goes here (append to
  the relevant domain file). Keep `CLAUDE.md` lean.

## Index
| File | Covers |
|------|--------|
| `sim-generator.md` | Generator & sim invariants (GS-1): corridor/ribbon, centreline grammar, greens, dispersion/spray, flight & roll, OB, crossings, signature mechanics |
| `rpg-meta-loop.md` | The run spine, voyage/ascension, banking, characters, talents, ace/eagle rewards, route events, bosses, team duels, ships/market, club rewards, rainbow ball |
| `competition.md` | The golfer roster, ghost leaderboard, league glue, matchplay bosses, positional cut, voyage field |
| `caddies.md` | Named caddies, signature powers, guard redirects, slo-mo voice/impact, harness testing |
| `feedback-mobile-ux.md` | Audio/haptics/settings layer, lefty mirror, lie awareness, gestures, mobile hygiene |
| `putting.md` | Manual pace-meter + auto (Penelope), fringe-putt, `puttBoost` upgrades |
| `render.md` | Projector, `buildScene`, blend/family draws, per-zone palettes, stellar sky, weather, wind, map nav, spray cone, power gesture, full-bleed play screen |
| `ui-intro.md` | The pure UI reducer, play-loop UX, and the loading-intro cinematic |
| `process-and-deploy.md` | Testing, the test/demo hub, art pipeline, GitHub Pages deploy gotcha, PWA service worker, change/versioning flow |

# Asset provenance and licence audit — 2026-08-01

Written down because this conclusion keeps being needed and kept living only in chat: the itch AI
disclosure, a future Steam submission and any Play policy question all ask the same thing, and
"I checked once" is not an answer you can hand to a store.

Every claim below was re-verified against the working tree on **2026-08-01**, not carried over.

---

## The short version

**The Far Carry ships zero third-party assets.** There are no fonts, images, audio files, icon sets
or sprite sheets from anyone — because there are almost no asset files at all. Every visual is drawn
by code at runtime and every sound is synthesized in the browser as it plays.

**No generative-AI image or audio model was used**, because there is nothing in the project for one
to have produced. The AI disclosure on the itch page is ticked for *Code* and *Text & Dialog*, and
that is the whole of it.

**Dependencies are permissive and compatible** with shipping a proprietary game. Notices are
reproduced in [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md).

---

## What was checked, and how

### No image, font or audio assets

```bash
find src public -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \
  -o -iname "*.webp" -o -iname "*.gif" -o -iname "*.svg" -o -iname "*.mp3" \
  -o -iname "*.wav" -o -iname "*.ogg" -o -iname "*.woff*" -o -iname "*.ttf" -o -iname "*.otf" \)
```

Returns exactly three files: `public/icon-180.png`, `public/icon-192.png`, `public/icon-512.png`.
No fonts of any kind — the game names font *stacks* already on the device (`--gs-font`), which is
also why the Readable-text toggle ships no font file (see `docs/decisions/accessibility.md`).

### The three PNGs are rendered from vector code

`scripts/genicons.mjs` composes an SVG constellation golf ball in the script itself and rasterises it
through the already-installed Chromium. Verified it reads no input image: no `readFile` of a raster,
no `loadImage`, no image import. The store page's cover and banner come from the same pipeline
(`scripts/banner.mjs`, seeded so it re-renders identically).

### No audio files, and no audio element

No `.mp3` / `.wav` / `.ogg` anywhere, and no `new Audio(` in `src/`. Sound is built from Web Audio
primitives across three modules:

| Module | Synthesis call sites |
|---|---|
| `src/render/audio.ts` | 6 |
| `src/render/music.ts` | 9 |
| `src/render/weatherAudio.ts` | 13 |

(`createOscillator` / `createBufferSource` / `createGain` / `createBiquadFilter`.) This matches
CLAUDE.md's standing rule for the audio layer: **assetless, always**.

### The Flux hook is dead

`src/render/cards.ts` carries an optional `artUrl` parameter documented as "Flux-generated biome art",
inherited from golf-finder. **Nothing ever passes it.** Cards fall back to the rarity-tinted gradient
and the hole thumbnail, which is what every card in the game actually renders. No generated image has
ever shipped, and there is no image file in the project for one to be.

> If that hook is ever removed, this paragraph can go with it. Until then it is the one thing in the
> repo that *looks* like generated art was used, so it is worth being able to point at this entry.

### Dependency licences

Read from each package's own `package.json` and `LICENSE` in `node_modules` (versions as installed):

| Ships in the build | Licence |
|---|---|
| Vite 5.4.21 | MIT — VoidZero Inc. and Vite contributors |
| @capacitor/core 8.4.2, @capacitor/android 8.4.2 | MIT — Drifty Co. |
| @capacitor/app 8.1.1, @capacitor/haptics 8.0.2 | MIT — Ionic |

| Build/test only | Licence |
|---|---|
| TypeScript 5.9.3 | Apache-2.0 |
| Vitest 2.1.9 | MIT |
| playwright-core 1.61.1 | Apache-2.0 |
| vite-plugin-singlefile 2.3.3 | MIT |
| @capacitor/cli 8.4.2, @capacitor/assets 3.0.5, @types/node 22.x | MIT |

Nothing here is copyleft, and nothing conflicts with the all-rights-reserved licence on our own code.

---

## The one obligation, and how it is now met

MIT requires its copyright and permission notice to travel with distributed copies. Capacitor's
runtime ships in the Android build, and both Vite's `modulePreload` polyfill and Capacitor's unused
HTTP/Cookies shims land in the web bundle as dead code (this is already documented in CLAUDE.md's
privacy rule, which is why the guard scans `src/` rather than the bundle).

Before today the game shipped no notice at all. Low severity — but free to close, and it is the kind
of thing that is annoying to discover during a store submission rather than before one.

`THIRD-PARTY-NOTICES.md` now carries the notices, and `package.json` declares
`"license": "UNLICENSED"`, which is the SPDX-correct signal for proprietary and stops any scanner
defaulting to an assumption.

**Not done:** the notices are not surfaced *in the game*. A player never sees them. Common practice
for a small title is an "Open source licences" row in the settings sheet, next to Save data. Left out
deliberately — it is a UI change, not a metadata one, and belongs in its own pass if it is wanted.

---

## What would change this conclusion

- **Adding any binary asset.** A font file, a texture, an icon set, a sound effect — the moment one
  lands, "ships zero third-party assets" stops being true and this report needs redoing, including
  the itch AI disclosure if the asset came from a generator.
- **Wiring the `artUrl` hook** in `cards.ts` to real generated art.
- **A new dependency that reaches a player.** The test is *does it reach a player*, not whether npm
  files it under `dependencies` — see the note at the foot of `THIRD-PARTY-NOTICES.md`.

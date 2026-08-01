# Third-party notices

The Far Carry is © 2026 Vulpecula Games, all rights reserved (see [LICENSE](LICENSE)). That covers
the game's own code, art, audio, text and design.

The game also carries a small amount of open-source code. This file reproduces those licences, which
is what MIT asks for when its code travels inside a distributed build.

**The game ships no third-party assets** — no fonts, no images, no audio files, no icon sets. Every
visual is drawn by code and every sound is synthesized at runtime, so nothing below is an asset
licence. See `reports/asset-provenance-2026-08-01.md`.

---

## Components that ship inside the game

These end up in the distributed build and are covered by the MIT notice reproduced below.

| Component | Version | Licence | Copyright | Where it ships |
|---|---|---|---|---|
| Vite | 5.4.21 | MIT | Copyright (c) 2019-present, VoidZero Inc. and Vite contributors | The build's `modulePreload` polyfill is inlined into `dist/index.html` |
| @capacitor/core | 8.4.2 | MIT | Copyright (c) 2017-present Drifty Co. | Android shell; unused HTTP/Cookies shims also land in the web bundle as dead code |
| @capacitor/android | 8.4.2 | MIT | Copyright (c) 2017-present Drifty Co. | Android shell only |
| @capacitor/app | 8.1.1 | MIT | Copyright 2020-present Ionic (https://ionic.io) | Android shell only |
| @capacitor/haptics | 8.0.2 | MIT | Copyright 2020-present Ionic (https://ionic.io) | Android shell only |

### The MIT Licence

The following notice applies to each component in the table above, with that row's copyright line.

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Build and test tools (do not ship)

These run on the developer's machine and in CI. No part of them reaches a player, so they carry no
distribution obligation — listed for completeness.

| Tool | Version | Licence |
|---|---|---|
| TypeScript | 5.9.3 | Apache-2.0 |
| Vitest | 2.1.9 | MIT — Copyright (c) 2021-Present Vitest Team |
| playwright-core | 1.61.1 | Apache-2.0 — portions Copyright (c) Microsoft Corporation |
| vite-plugin-singlefile | 2.3.3 | MIT — Copyright (c) 2021-present, Richard S. Tallent, II |
| @capacitor/cli, @capacitor/assets | 8.4.2, 3.0.5 | MIT |
| @types/node | 22.x | MIT |

---

## Android build (transitive)

The Capacitor Android shell compiles against AndroidX and the Android Gradle plugin, which Capacitor
pulls in itself. Those are Apache-2.0 and are the standard dependency set for any Android app; they
are not enumerated here because the list is produced by Gradle, not by this project.

If a full machine-generated inventory is ever needed for a store submission, produce it from the
Android build rather than by hand:

```bash
cd android && ./gradlew app:dependencies --configuration releaseRuntimeClasspath
```

---

## Keeping this file honest

`package.json` is the source of truth for what is depended on. When a dependency is added, removed or
moved between `dependencies` and `devDependencies`, decide which table above it belongs in — the
question is **does it reach a player**, not whether npm calls it a dependency. A component that ships
needs its notice reproduced; a build tool does not.

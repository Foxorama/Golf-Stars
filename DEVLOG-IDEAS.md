# The Far Carry — devlog idea backlog

Living doc, same rules as [IDEAS.md](IDEAS.md): **scan, rerank, merge, retire — not append-only.**
Stable IDs, never reused. Published collapses to a one-line **Published** entry with the link; bad
ideas go to **Dropped** and say why.

**An entry earns its place by having MATERIAL, not a topic.** "How the wind works" is a topic. "The
wind read backwards for six weeks and one play-test caught it" is a post. If an entry can't name the
specific thing that happened and where the evidence is, it isn't ready — leave it in the Pool.

Two standing rules for this game's devlogs, both learned the hard way:

- **State facts, don't argue.** The AI question attracts a defensive register. Never write a line
  arguing the game is more legitimate than one built another way — an argument invites one back.
  Numbers and specifics do the work; readers can take their own view.
- **Check the claim against the code before publishing it.** See `DL-guard-caught-it`, which is
  entirely about what happens when that step is skipped.

Covers: `scripts/banner.mjs` writes `devlog-cover.png` (16:9, the thumbnail beside the post *and*
the social card it unfurls as); `scripts/cover-shot.mjs` renders the picture it carries.

---

## Next up

### DL-how-it-was-made — "How did this get made"

**This one is promised in public.** The itch description's *How this game was made* section closes
with a commitment to write it and link it back here. When it publishes, that link is the edit to
make in `reports/itch-store-copy-*.html`.

The store page has room only for the summary — AI wrote all of the code and most of the prose;
design, story, characters, plot and judgement human; nearly 800 commits in about five weeks. The
post is the loop underneath it: **specify → play → reject → repeat.**

The material is already in the repo and is unusually good, because CLAUDE.md's `GS-*` entries are
largely a record of things that got rebuilt after they felt wrong, and most preserve the actual
play-test verdict that killed the first version:

- *"it looks buggy as heck, not like a real ball flight"* → GS-flight-shape, GS-roll-hairpin
- *"a tennis ball… compared to the hole/flag it's a beachball"* → GS-ball-art, twice
- *"everything is velcro'd to the wall — only your character is on the floor"* → GS-clubhouse-floor
- *"the ball will roll over the black circle and not go in"* → GS-cup-oversize
- *"it feels like cheating instead of chipping in"* → GS-landing-real

The honest shape is that the AI wrote every line and was wrong about how it felt a lot of the time,
and the loop is what closed that gap. Resist making it a defence.

### DL-guard-caught-it — the guard caught a second description, and then the AI oversold it

Two parts, and **the second is the better story.**

`scripts/cover-shot.mjs` was written the day before the Chromium lookup was consolidated (#709). It
loaded `chromePath` from `tests/chromium.ts` — the right place — and then called `chromium.launch()`
itself, which is its own answer for *how* a browser starts. Rebasing it onto main, the
`GS-one-description` guard (`tests/one-description.test.ts`) failed it **by name**, said which seam
to call, and told the author not to widen the pattern. One import fixed it. Nothing had ever been
visibly broken: the script failed loudly, with a message and exit 1.

Then the part worth writing. Summarising that work, Claude described the script as having *"printed
no chromium and exited 0, so a cover that never rendered reported success"* — which is the failure
mode the guard's own message describes for the **other 64 rigs**, borrowed and pinned on this one
because it made a better story. It reached a chat summary, a commit message, a PR body, and a
comment on `main` before re-reading the file caught it. The script exited 1. Fixed in #714.

So the machine-checked guard was precise and the prose around it drifted toward the more dramatic
version. That is worth showing rather than tidying away, and it is the practical argument for the
whole `GS-one-description` register: a test that names the file cannot be talked into a better story.

---

## Pool

*Real, unpolished. Promote when the material is there.*

- **DL-exit-code-lie** — `npm run check` piped into `tail` reports **tail's** exit code, so a failed
  build looked like a pass and the completion notification said success. Windows-specific trigger
  (`VITE_HUB=1 vite build` is bash syntax; npm runs scripts through `cmd.exe`), general lesson. Pairs
  naturally with `DL-guard-caught-it` — both are about a green light that wasn't.
- **DL-zero-assets** — the game ships no image, font or audio files at all; every visual is drawn and
  every sound synthesized at runtime. Material: `reports/asset-provenance-2026-08-01.md`. Has a
  natural hook in that it makes the AI-art question moot rather than answered.
- **DL-accessibility-none** — why the itch accessibility field is ticked **zero** out of eight when
  the game has readable-text scaling, a UI zoom, reduced motion, full keyboard play and
  screen-reader narration. The tags don't describe what was built, and one — Blind friendly — is
  ruled out by a single concrete thing: the putt pace meter is a visual sweep with no audio cue.

---

## Published

*None yet.*

---

## Dropped

*None yet.*

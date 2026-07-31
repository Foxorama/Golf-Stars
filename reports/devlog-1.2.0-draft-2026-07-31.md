# Devlog draft — v1.2.0

> ⚠️ **SHELVED — do not post this at launch.** Nobody has played the game yet, so a bugfix changelog
> is addressed to an audience of zero. The launch post is `reports/devlog-launch-2026-07-31.md`.
> Keep this one as the shape for the FIRST POST-LAUNCH update, when there are players who felt the
> old behaviour and will feel the new.

**Draft for you to edit, not to post as-is.** Written to the register of your own play-test notes
quoted throughout `reports/` (*"there's no reason to take any putting upgrades or putters"*,
*"hazards should be affecting the ball as well and I'm not sure that they are"*, *"it looks buggy as
heck"*): short sentences, plain words, specific numbers, no marketing lift at the end. Everything
below is factual — the numbers come from `docs/decisions/render.md`, CLAUDE.md and the shipped PRs,
so edit the wording freely but check before changing a figure.

Suggested title: **The green stopped chugging**

---

v1.2.0 is out.

The big one: watching a putt ran at about 3 frames a second. Now it's 60. The game was repainting the
whole hole every frame — every mown stripe, contour line and apron ring — even when the camera hadn't
moved a pixel. It doesn't do that any more. Watching a shot went from 12fps to 30, which is better
but still has room in it.

`[GIF here — the putt watch, or a drive with the spray cone opening]`

Then the save work, which is dull but matters:

- If the game can't fully read your save, it no longer writes over it. It goes read-only, says so,
  and offers you the stored file to download. That was a real way to lose a campaign.
- Every mode parks its own run, per golfer. Starting a Story world used to quietly bin the Voyage you
  had going.
- A Story round resumes on the hole you were on. It used to make you replay the world from the first
  tee.
- Settings now tells you how many runs it's been since you last exported a backup. The browser is the
  only place your save lives, and browsers do delete things.

Smaller stuff:

- The credits roll at the end of the campaign. The button was already there. It went to the title
  screen.
- If you play in the embedded window on itch, you can reach the whole Pro Shop again. About 500
  pixels of it were off the bottom with no way to scroll to them.
- On a desktop screen everything is bigger. The menus were composed for a phone and stayed
  phone-sized on a 1080p monitor.
- The shot camera frames where the ball finishes, not where it lands. The far end of a drive was
  being drawn behind the top bar.
- Playing by keyboard puts you on the Swing button. It used to hand you the map and the settings cog
  first, on every single stroke.

---

## Notes on using this

- **The GIF is the post.** `scripts/capture.mjs` already records `hole.webm` / `starmap.webm` from the
  real game at a pinned seed, but the GIF conversion needs ffmpeg on PATH and it isn't installed on
  this machine. Until then the WebM uploads fine to Bluesky and GitHub, just not to the itch
  screenshot rail.
- **Screenshots** for the store page are now shot by `scripts/screenshots.mjs` into
  `assets/itch/shots/` (see below).
- **Cadence:** one devlog per tagged release, none in between. Merges to `main` aren't news.
- Two things I deliberately did not write for you: a closing line, and any sentence about how the
  game feels to play. Those are the ones that read as somebody else's voice if they aren't yours.

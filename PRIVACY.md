# Privacy — The Far Carry

**Last updated: 29 July 2026**

## The short version

**The Far Carry collects nothing about you and sends nothing anywhere.**

There are no accounts, no analytics, no advertising, no tracking, no crash reporting, and
no cookies. Your save lives in your own browser or on your own device, and it never leaves
it unless you deliberately export it yourself.

That is the whole policy. The rest of this page just explains it precisely, because "we
don't collect anything" is a claim worth being able to check.

## What the game stores, and where

Everything is stored **locally**, by your browser or by the app on your device. Nothing is
uploaded.

| What | Where | Why |
|---|---|---|
| Your save — progress, unlocks, records | `localStorage`, key `fc_save` | So a run survives closing the tab |
| Story Tour campaigns | `localStorage`, key `fc_story` | One campaign per golfer |
| Your settings — sound, motion, text size, aim mode | `localStorage`, key `fc_settings` | So your preferences stick |
| Whether you dismissed the "install" prompt | `localStorage`, key `fc_installNudge` | So it doesn't nag |
| Whether you've seen the intro this session | `sessionStorage`, key `fc_introSeen` | So it plays once per session |

None of this identifies you. It is game state — shard counts, best scores, which ship you
fly. You can wipe all of it at any time by clearing site data in your browser, or by
uninstalling the app.

**Your save is only as safe as your device.** Clearing your browser data deletes it. That
is exactly why the game has an export-to-file feature in Settings — and why the export
does nothing but hand *you* a file.

## What the game sends

Nothing.

Once the page has loaded, the game makes no network requests. It plays entirely offline —
the courses are generated on your device, the art is drawn on your device, and the audio is
synthesised on your device. There are no downloaded assets, no fonts fetched from anywhere,
and no server for the game to talk to.

**A note for anyone auditing the code.** If you search the built file you will find `fetch`
and `document.cookie`. They come from two libraries and are never called:

- Vite's module-preload polyfill, which is inert in a single-file build; and
- Capacitor's HTTP and Cookies helpers, which ship as part of the library. The game only
  uses Capacitor for the app wrapper and vibration, and never calls either helper.

We would rather point at them than have you find them and wonder.

## Things that are not us

**Wherever you're playing it.** Loading any web page means the host can see the request —
your IP address, roughly when, and what browser you used. That is true of every website and
it is the host's doing, not the game's. If you're playing on itch.io, itch.io's privacy
policy covers it. The same goes for any other site the game is hosted on.

**If you buy or donate.** Payments are handled entirely by itch.io and its payment
providers. We never see your card details, your address, or your full name — we only see
what itch.io shows any seller, which is aggregate sales figures. Their policy governs that
transaction.

## The Android app

The app is the same game in a native wrapper. It declares two permissions, both visible
before you install:

- **INTERNET** — required by the system component that runs the game locally on your
  device. The game still makes no network requests; this permission is a structural
  requirement of how the app is packaged, not a sign that it phones home.
- **VIBRATE** — for haptic feedback on shots. You can turn haptics off in Settings.

It asks for no location, no camera, no microphone, no contacts, no files, and no device
identifiers.

## Other device features

- **Clipboard** — only when you tap "copy save" yourself, and only to write your own save
  data. The game never reads your clipboard.
- **Vibration** — for shot feedback, switchable off in Settings.
- **Reduced-motion preference** — read once from your system settings to pick a sensible
  default, then it's yours to change. It is read, never transmitted.

## Children

The game has no accounts, no chat, no user content, and no data collection, so there is
nothing for a child to disclose to us. We do not knowingly collect personal information
from anyone, of any age, because we do not collect personal information at all.

## Your rights

Privacy law generally gives you rights to access, correct, and delete the personal
information a company holds about you. We hold none, so there is nothing to access,
correct, or delete — and no request is needed to exercise that. Your game data is already
in your hands: it is on your device, and Settings will export it to a file for you.

## Changes

If the game ever starts collecting anything, this page will say so plainly and the date at
the top will change *before* the release that does it. Given the design, we do not expect
that to happen.

## Contact

Questions about this policy: **contact@vulpecula.games**

---

*The Far Carry is made by Vulpecula Games, a sole trader based in Australia. This page is
written in plain language rather than legal boilerplate; it has not been reviewed by a
lawyer, and it describes what the software actually does — which you are welcome to verify
against the source.*

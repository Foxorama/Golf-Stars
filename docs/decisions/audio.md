# Audio — SFX + generative music (GS-audio-2)

The full story behind the sound layer. The constitution bullet lives in CLAUDE.md; this is the
narrative + gotchas.

## The house rule: assetless, always

The whole audio layer is **synthesized WebAudio — zero downloaded files**. Every cue and every
music note is built from oscillators + filtered noise at call time. Why: the app ships as ONE
inlined `index.html` (see process-and-deploy.md); an audio file is a thing that can 404 on a
device, bloat the bundle, or stall on a flaky connection. Synth can't. This also keeps the bundle
byte-stable and the test hub trivial (nothing to mock-fetch).

The corollary: **the sim never calls audio** (same law as the render layer). Audio modules import
cleanly in node — WebAudio is only touched inside guarded calls — and `tests/audio.test.ts`
imports them headless as part of its contract.

## One AudioContext, two buses

A page should hold ONE `AudioContext` (browsers cap them; two fight for the hardware).
`audio.ts` owns it via `sharedAudioContext()`; consumers hang their own gain bus off it:

- **SFX bus** (`audio.ts`, gain 0.5) — gated on the `sound` setting.
- **Music bus** (`music.ts`, per-track gain ≤ 0.35) — gated on the `music` setting.

The settings are independent on purpose: cues-without-music and music-without-cues are both real
player preferences. `resumeAudio()` (the first-gesture unlock, wired in `dispatch()`) resumes the
context when EITHER setting is on; with both off no context is ever created.

## Strike voices (per-club-family contact sounds)

`sfx.swing(quality, clubId?)` voices the strike by club family via `strikeClassOf(clubId)`:
driver (deep boom + titanium ping + a pure-strike air crack), wood, hybrid, iron (crisp click +
turf whisper), wedge (soft thump under a grass/sand "shhk"), putter (falls through to the putt
tap). `quality` 0..1 still brightens every voice, so pure rings and chunked thuds in all of them.

The class map is **convention-based on the CLUBS taxonomy ids** (`D`, `\d+W`, `\d+H`, `\d+i`,
putter, everything else = wedge) so a new club row picks up a sensible voice with zero audio
edits. **Gotcha that bit us on day one:** `PW/GW/SW` end in `W` — a naive `endsWith('W')` voiced
the wedges as woods. The digit-prefix regexes are the fix; `tests/audio.test.ts` pins the family
of every wedge id so it can't regress.

The club id rides the existing `onImpact` feel hook (`playView.ts` fires it once at the strike
moment with the shot's `club.id`) — a pure widening of the callback, no sim/rng impact.

The hole-out cue is a real cup now: rim knock → descending hollow rattle knocks → bottom-of-cup
thunk → the rising confirm chime. Sequenced with `t` offsets on the same tone/noise primitives.

## Generative music (`render/music.ts`)

**Table + dispatch, the GS-biome-feel pattern:** `MUSIC_TRACKS` has one row per world archetype
plus `'menu'` (the clubhouse lull). A row is data — root Hz, scale (semitone set), chord loop
(scale-degree lists), bpm, pad/arp waveforms, arp/bass/shimmer densities, bus gain. A new world =
a new row; `tests/audio.test.ts` machine-checks full coverage, that every row is playable, that
no two rows share a root+scale+bpm fingerprint (distinct moods), and that gain stays ≤ 0.35
(**the subtlety bar** — music is a bed ~14dB under the SFX cues, never a lead).

The engine is a classic lookahead scheduler: a 220ms `setInterval` fills the schedule 0.9s ahead
of the context clock, in 8th-note steps (8 per bar, chord changes every 2 bars). Each step draws
pad swells at chord changes, a bar-anchored bass root with density-gated passing tones, plucked
chord-tone arps, and rare high shimmers. Note choices come from a **private xorshift32 stream
seeded from the scene id** (FNV-1a) — never `Math.random`, never the sim/render streams, so the
music cannot perturb determinism, but each track always *opens* the same way and never audibly
loops (the seeded draws breathe differently every chord pass).

Scene selection is `app.ts syncMusic()`, called at the top of every `render()`: the hole under
view picks the archetype while golf is on screen (playing/result — so a split-biome stop's back
holes switch tracks), `'menu'` everywhere else. `setMusicScene()` is a cheap no-op when the scene
is unchanged, which matters because `render()` runs hot during the power-pull.

Engine gotchas encoded in the module:
- **Suspended context**: pre-gesture, `currentTime` is frozen — the pump fills one lookahead
  window and idles; on resume the queued notes play and the pump takes over. Never busy-schedule
  against a frozen clock.
- **Scene switch = bus fade**: `stopMusic()` fades the old bus (0.4s time-constant) and
  disconnects it after 2.5s — already-queued notes die with their bus, so a crossfade needs no
  per-note bookkeeping.
- **Tab hidden → muted** via a lazily-registered `visibilitychange` hook (polite on phones).
- The `music` setting is re-read every pump tick, so toggling it off kills the loop even if no
  render follows.

## Settings

`music: boolean` (default on) joined `Settings` — the localStorage prefs layer merges parsed
saves over defaults, so existing players pick the new field up with **no migration** (this is why
player prefs live in `settings.ts`, not the versioned save).

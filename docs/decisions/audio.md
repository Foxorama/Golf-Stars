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

## Hazard & tree landing voices (GS-audio-3)

The touchdown now ANSWERS in sound, the audio half of the render's `spawnLandFX` (GS-biome-feel):
`sfx.land(lie, penalty, arch, treeHit)` dispatches through `landVoiceOf(lie, penalty)` — a pure
classifier that mirrors `spawnLandFX`'s lie/penalty branches in the SAME precedence order, so what
you see burst is what you hear. Voices: water/creek/frozen-pond **splash** (noise body + deep bloop
+ droplet plinks), lava **sizzle** (plunge + long hiss + bubble glorps), the void's **implosion**
(detuned falling saw pair + a whistle pulled down + sub swallow), the cetus star-ocean's **whale**
(a plunge answered by a rising moan and its long falling reply), ravine **rockfall**, sand **pff**,
plus the effect-patch families (ice skitter / stardust shimmer / junk clatter / scorch ember whump).
Ordinary turf returns `null` — the strike + bounce already carry it — and the administrative
penalties (OB / lost / unplayable) stay with the score-cost wah (`sfx.penalty`), which still plays
at the end of a penalty animation as the "stroke added" reading over the surface cue.

Tree hits are voiced per world ARCHETYPE via `treeVoiceOf` — a full-coverage
`Record<BiomeArchetype, TreeVoice>` mirroring the flora table (`style.ts styleFlora`), so the
silhouette you clipped is the sound you hear: crystal spires **ping**, fungal mushrooms **squelch**,
parkland (and the void's classic canopy) knocks **wood**, frost conifers whump snow, inferno snags
**crack** dry with an ember fizz, saguaros give a hollow drum **tonk**, tempest scrub whips, ocean
palms rustle + coconut-knock, cetus sea-stacks **clack** stone.

Plumbing: a new `onLand(lie, penalty, knockedDown)` feel hook on `PlayViewOptions`, fired once per
shot at the exact `spawnLandFX` touchdown site with the SAME resolved lie (scorch-crater and
effect-patch conversions included), wired in `app.ts` at both play-view mounts with the hole's
archetype (`archetypeFor(holeThemeId, holeBiome)` — split-biome stops voice their back holes
correctly). `knockedDown` forces the tree voice for a mid-flight knockdown even if the ball drops
clear of the canopy poly. Pure feel hook + pure classifiers: zero sim/rng impact, no `_gs*` flag
(so no test-hub wiring), and `tests/audio.test.ts` machine-checks that every surface-bearing
penalty kind and every archetype resolve to a voice.

## Caddy-guard projectile cues (GS-audio-4)

The redirect cinematic (GS-caddy) sounds at both of its beats via a second feel hook,
`onRedirect(kind, phase, travelMs)`, fired from the exact code points the visuals already key off:
`'fire'` in the `redirectFiredShot` block (as the guard looses the shot, alongside the slow-mo +
voice line) and `'hit'` in the `sparksFiredShot` block (the spark-spray contact). Voices:

- **Space Ducks laser** — fire: a sci-fi PEW (saw dive 1750→220 + a bright square zap + muzzle
  crack) under a thin beam whine that RISES as it closes on the ball; hit: an energy SNAP, the
  zapped ball pinging UP, a discharge slump, spark crackle.
- **Convict Sheep boomerang** — fire: a launch whoosh + a whirring whip-whip-whip (bandpass noise
  pulses that quicken and brighten across the flight); hit: the wooden CRACK of stick-on-ball, a
  solid knock body, the ball's ping, and a wobbling ring as it spins off.

The trick that makes the whir/whine read true: `travelMs` is the REAL time until contact —
playView computes `(HIT_FRAC − FIRE_FRAC) · flightDur / CADDY_SLOMO` (the intercept arc in virtual
time, stretched by the slow-mo that `fireCaddyEffect` armed one line earlier) — so the projectile
sound ends exactly where the hit cue takes over instead of dying early or overshooting. The cues
layer under the caddy's spoken catchphrase (`onCaddyEffect`), which stays the headline. The
force-redirect demo (`_gsFeel.forceRedirect`) exercises the full sound on demand, no new hook
needed. `tests/audio.test.ts` pins the call-clean contract: every cue is a guarded no-op in node.

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

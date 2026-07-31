# The "how this was made" block for the itch description

Every factual claim below was verified against the repo on 2026-07-31, not taken on trust:

- **No image assets ship.** `find src public` turns up no `.jpg` / `.webp` / `.gif` and no font files
  at all. The only PNGs are `public/icon-{180,192,512}.png`, and those are rendered from vector code
  by `scripts/genicons.mjs`. Everything you see in play is drawn by `src/render/*` at runtime.
- **No audio assets ship.** No `.mp3` / `.wav` / `.ogg` anywhere, no `new Audio(...)`, and
  `src/render/audio.ts` builds every cue from `createOscillator` / `createBufferSource` /
  `createGain`. CLAUDE.md's rule is "ASSETLESS, always".
- **The store page art is the same pipeline** — the constellation cover image is the app icon from
  `genicons.mjs`, and the banner + page sky come from `scripts/banner.mjs` (seeded, never
  `Math.random`, so they re-render identically).
- The Flux art hook in `src/render/cards.ts` was never wired to any art and no generated image has
  ever shipped.

---

## Full version

> **How this game was made**
>
> The AI disclosure on this page is ticked for Code and for Text & Dialog. That covers a lot of
> ground, so here is what it actually means.
>
> There are no AI-generated art assets in this game. There are no art assets at all. Every visual —
> the courses, the golfers, the ships, the item cards, even the icon and the banner at the top of
> this page — is drawn by code, as vectors and canvas drawing, while you play. Nothing came out of
> Midjourney or Stable Diffusion. There isn't an image file in the project to have generated.
>
> The sound is the same. There isn't an audio file in the project either. Every note and every
> effect is synthesized in your browser as it plays.
>
> What the AI wrote is the code that draws and plays all of that, and a lot of the story text.

## Short version

> **How this game was made**
>
> The AI disclosure above is ticked for Code and Text & Dialog. To be specific about what that
> means: there are no AI-generated art assets and no AI-generated sound. There are no art or audio
> files in this game at all — every visual is drawn by code as you play, and every sound is
> synthesized in your browser. What the AI wrote is the code that does that, and a lot of the story
> text.

## Paste-ready HTML

itch sanitises the Details box to an allowlist; `<h3>`, `<p>`, `<strong>` and `<em>` all survive.

```html
<h3>How this game was made</h3>
<p>The AI disclosure on this page is ticked for <strong>Code</strong> and <strong>Text &amp; Dialog</strong>. That covers a lot of ground, so here is what it actually means.</p>
<p>There are <strong>no AI-generated art assets</strong> in this game. There are no art assets at all. Every visual &mdash; the courses, the golfers, the ships, the item cards, even the icon and the banner at the top of this page &mdash; is drawn by code, as vectors and canvas drawing, while you play. Nothing came out of Midjourney or Stable Diffusion. There isn't an image file in the project to have generated.</p>
<p>The sound is the same. There isn't an audio file in the project either. <strong>Every note and every effect is synthesized in your browser as it plays.</strong></p>
<p>What the AI wrote is the code that draws and plays all of that, and a lot of the story text.</p>
```

## Where to put it

Near the bottom, under the accessibility section — both are "here is how this thing works" notes
rather than pitch, and a reader who cares about one usually cares about the other. Above the
privacy note if you have one, since that is the same kind of statement again.

One thing I did **not** write for you: any line arguing that this makes the game more legitimate
than one using generated art. State the facts and let people take their own view — an argument
invites one back.

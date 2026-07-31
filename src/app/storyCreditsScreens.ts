/**
 * The Story-Tour CREDITS ROLL screen (GS-story-credits) — the payoff behind the finale recap's
 * long-shipped "Roll the credits ›" button, which used to go straight to the title.
 *
 * A Mallrats-style "where are they now" crawl: one card per cast member — portrait, name, who they were
 * to you, and what became of them — grouped into a real credit crawl, closing on the dedication and the
 * wordmark. The CONTENT (and its two endings) is pure content-as-data in `sim/rpg/storyCredits.ts`; the
 * portraits come from the shared `render/castPortrait.ts` seam the lore beats already use. This module
 * is presentation only.
 *
 * Own class prefix `.gs-cred*` — CSS classes are document-global and no screen may borrow another's
 * (CLAUDE.md). Two layout rules it has to keep:
 *   · the roll SCROLLS INSIDE ITSELF, capped to `--gs-dvh` (never a raw viewport unit, GS-a11y-sheet-
 *     scroll) — on the itch embed the page frame cannot scroll at all (GS-embed-scroll), so a crawl
 *     taller than the viewport would simply be unreachable content;
 *   · nothing here depends on the auto-scroll running. The rAF crawl in `app.ts` is an ENHANCEMENT over
 *     an ordinary scrollable region — under reduced motion it never starts, and the roll still reads,
 *     scrolls and reaches its own "The End" button by hand or by keyboard (GS-a11y-motion).
 */

import { state, btn } from './ctx';
import { GAME_TITLE, GAME_TITLE_UPPER, APP_VERSION } from '../brand';
import { creditsRoll, creditsHeading, SPECIAL_THANKS, type CreditCard } from '../sim/rpg/storyCredits';
import { castPortraitSVG, castPortraitTint } from '../render/castPortrait';

/** One cast card. A card with no portrait token draws as a centred plate (the serpent sits for nobody). */
function creditCard(c: CreditCard): string {
  const art = castPortraitSVG(c.portrait, { uidPrefix: 'cred', w: 120, h: 240 });
  if (!art)
    return `
      <article class="gs-cred__card gs-cred__card--plate">
        <h3 class="gs-cred__name">${c.name}</h3>
        <p class="gs-cred__role">${c.role}</p>
        <p class="gs-cred__epi">${c.epilogue}</p>
      </article>`;
  const tint = castPortraitTint(c.portrait);
  return `
    <article class="gs-cred__card">
      <div class="gs-cred__art"${tint ? ` style="filter:${tint};"` : ''} aria-hidden="true">${art}</div>
      <div class="gs-cred__txt">
        <h3 class="gs-cred__name">${c.name}</h3>
        <p class="gs-cred__role">${c.role}</p>
        <p class="gs-cred__epi">${c.epilogue}</p>
      </div>
    </article>`;
}

export function storyCreditsScreen(): string {
  const story = state.story;
  const head = creditsHeading(story);
  const sections = creditsRoll(story)
    .map(
      (s) => `
      <section class="gs-cred__sec">
        <h2 class="gs-cred__sech">${s.title}</h2>
        ${s.cards.map(creditCard).join('')}
      </section>`,
    )
    .join('');
  return `
    <header class="gs-cred__head">
      <p class="gs-cred__kicker">${GAME_TITLE} · Story Tour</p>
      <h1 class="gs-cred__title">${head.title}</h1>
      <p class="gs-cred__tag">${head.tag}</p>
    </header>
    <div class="gs-cred__roll" data-cred-roll="1" tabindex="0" role="region" aria-label="Credits">
      <div class="gs-cred__inner">
        ${sections}
        <div class="gs-cred__thanks">
          <p class="gs-cred__thankshd">${SPECIAL_THANKS.heading}</p>
          <p class="gs-cred__thanksbody">${SPECIAL_THANKS.body}</p>
          <p class="gs-cred__sign">${SPECIAL_THANKS.signoff}</p>
        </div>
        <div class="gs-cred__mark">${GAME_TITLE_UPPER}</div>
        <p class="gs-cred__studio">© Vulpecula Games · build ${APP_VERSION}</p>
        <div class="gs-cred__end">${btn('★ The End ›', { type: 'endStoryCredits' }, { variant: 'primary', block: true })}</div>
      </div>
    </div>
    <div class="gs-cred__foot">
      ${btn('‹ Back to the title', { type: 'endStoryCredits' }, { variant: 'ghost', block: true })}
    </div>
    ${CRED_STYLE}`;
}

const CRED_STYLE = `
  <style>
    .gs-cred__head{text-align:center;margin:0 0 10px;}
    .gs-cred__kicker{margin:0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gs-dim,#9fb0c8);opacity:.8;}
    .gs-cred__title{margin:4px 0 2px;font-size:26px;letter-spacing:.02em;color:var(--gs-gold,#ffce54);}
    .gs-cred__tag{margin:0;font-size:12.5px;color:var(--gs-dim,#9fb0c8);}
    /* The crawl scrolls INSIDE itself — the page frame can't be relied on to (GS-embed-scroll). Its
       floor is deliberately LOW: --gs-dvh already divides by the UI scale, so the 210px reserve
       (heading + footer + the page frame's padding) is a constant number of UNITS — but a floor is not.
       At 320x568 on the top Readable-text rung the frame is only 392 units tall, and a 280px floor
       pushed the roll clean off the bottom of the screen. A media query cannot see --gs-uiscale
       (GS-a11y-scale-wrap), so the floor has to be small enough to be right at every rung. */
    .gs-cred__roll{height:calc(var(--gs-dvh) - 210px);min-height:170px;overflow-y:auto;overscroll-behavior:contain;
      border-top:1px solid var(--gs-line,#232b3b);border-bottom:1px solid var(--gs-line,#232b3b);
      -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 26px,#000 calc(100% - 26px),transparent 100%);
      mask-image:linear-gradient(to bottom,transparent 0,#000 26px,#000 calc(100% - 26px),transparent 100%);}
    .gs-cred__inner{padding:26px 2px 30px;max-width:520px;margin:0 auto;}
    .gs-cred__sec{margin:0 0 22px;}
    .gs-cred__sech{font-size:11.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;
      color:var(--gs-dim,#9fb0c8);text-align:center;margin:0 0 14px;opacity:.85;}
    .gs-cred__card{display:flex;gap:14px;align-items:flex-start;margin:0 0 18px;padding:0 4px;}
    /* A FIXED art frame, not an auto height: the cast is drawn in two different aspects — head-and-
       shoulders busts (320×340) for the crew and the Coil, full-body figures (120×240) for the golfers —
       and left to size themselves the golfer cards came out nearly twice as tall as everything around
       them. Both SVGs meet-fit (no preserveAspectRatio ⇒ xMidYMid meet), so one frame letterboxes each
       without cropping or squashing, and every card in the roll stands the same height. */
    .gs-cred__art{flex:0 0 96px;width:96px;height:120px;border-radius:10px;overflow:hidden;background:rgba(255,255,255,0.03);}
    .gs-cred__art svg{display:block;width:100%;height:100%;}
    .gs-cred__txt{flex:1 1 200px;min-width:0;}
    .gs-cred__card--plate{display:block;text-align:center;margin:6px 0 20px;padding:14px 12px;
      border:1px solid var(--gs-line,#232b3b);border-radius:12px;background:rgba(255,255,255,0.03);}
    .gs-cred__name{margin:0;font-size:15.5px;font-weight:800;color:var(--gs-ink,#eaf1fb);overflow-wrap:anywhere;}
    .gs-cred__role{margin:1px 0 6px;font-size:11.5px;letter-spacing:.04em;color:var(--gs-gold,#ffce54);opacity:.85;}
    .gs-cred__epi{margin:0;font-size:13px;line-height:1.62;color:var(--gs-dim,#9fb0c8);}
    .gs-cred__thanks{margin:30px auto 0;max-width:440px;padding:16px 16px 14px;text-align:center;
      border:1px solid #3a3320;border-radius:14px;background:rgba(255,206,84,0.06);}
    .gs-cred__thankshd{margin:0 0 8px;font-size:11.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--gs-gold,#ffce54);}
    .gs-cred__thanksbody{margin:0;font-size:14px;line-height:1.65;color:var(--gs-ink,#eaf1fb);}
    .gs-cred__sign{margin:10px 0 0;font-size:13.5px;font-style:italic;color:var(--gs-gold,#ffce54);}
    .gs-cred__mark{margin:34px 0 0;text-align:center;font-size:19px;font-weight:800;letter-spacing:.26em;
      color:var(--gs-ink,#eaf1fb);opacity:.9;overflow-wrap:anywhere;}
    .gs-cred__studio{margin:6px 0 0;text-align:center;font-size:11px;letter-spacing:.06em;color:var(--gs-dim,#9fb0c8);opacity:.7;}
    .gs-cred__end{max-width:320px;margin:24px auto 0;}
    .gs-cred__foot{max-width:320px;margin:12px auto 0;}
  </style>`;

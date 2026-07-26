/**
 * The reusable LORE CARD overlay (GS-story-lore-cards). Story Tour is full of tappable things — clubs,
 * gear, ships, relics, caddies — and there is never room for image + name + detail + lore inline. The
 * lore is what fills out the galaxy, so every tappable item raises THIS card: a bottom-sheet (centred on
 * desktop) with the item's art, name, a rarity/kind tag, its mechanical DETAIL, its flavour LORE, and a
 * footer action (Buy / Owned / …). Pure string builder — no DOM, no rng; dropped into a screen via
 * innerHTML like the other overlays.
 *
 * Self-contained: it ships its OWN `<style>` with a dedicated `.gs-lorecard*` prefix (NEVER the play
 * HUD's `.gs-hud`, per the CSS-collision rule), so it adds no shared global class and can't restyle
 * another screen. Reused by the Pro Shop first; gear/ship/relic chunks pass their own art + copy.
 */

export interface LoreCardOptions {
  /** Item art — an `<svg>` string (procedural item art) or an emoji/HTML block. */
  icon: string;
  /** Display name, e.g. "Planet 3-Wood". */
  name: string;
  /** Short tag under the name, e.g. "Rare · Fairway wood". */
  tag: string;
  /** Rarity accent colour (drives the top rule + medallion ring). */
  accent: string;
  /** Mechanical detail lines (what the item does). */
  detail: string[];
  /** Flavour lore paragraph(s). */
  lore: string[];
  /** The footer action HTML (a Buy button, an "Owned" chip, etc.). */
  footerHTML: string;
  /** The `data-*` attribute string that closes the card (e.g. `data-story-item-close="1"`). Applied to
   *  the backdrop and the ✕ so both dismiss it. */
  closeAttr: string;
}

/** Build the full-screen lore-card overlay. Tapping the backdrop or ✕ (both carry `closeAttr`) closes it;
 *  the card itself swallows the tap so an inner click never dismisses. */
export function loreCardHTML(o: LoreCardOptions): string {
  const detail = o.detail.length
    ? `<div class="gs-lorecard-detail">${o.detail.map((d) => `<div class="gs-lorecard-dline">${d}</div>`).join('')}</div>`
    : '';
  const lore = o.lore.map((p) => `<p class="gs-lorecard-lore">${p}</p>`).join('');
  return `
  <div class="gs-lorecard-ov" ${o.closeAttr}>
    <div class="gs-lorecard" role="dialog" aria-label="${o.name}" onclick="event.stopPropagation()">
      <button class="gs-lorecard-x" ${o.closeAttr} aria-label="Close">✕</button>
      <div class="gs-lorecard-top" style="--acc:${o.accent};">
        <span class="gs-lorecard-medal" aria-hidden="true">${o.icon}</span>
        <span class="gs-lorecard-id">
          <span class="gs-lorecard-name">${o.name}</span>
          <span class="gs-lorecard-tag">${o.tag}</span>
        </span>
      </div>
      ${detail}
      <div class="gs-lorecard-scroll">${lore}</div>
      <div class="gs-lorecard-foot">${o.footerHTML}</div>
    </div>
  </div>
  <style>
    .gs-lorecard-ov{position:fixed;inset:0;z-index:70;display:flex;align-items:safe flex-end;justify-content:center;
      background:rgba(5,7,12,0.7);backdrop-filter:blur(3px);animation:gs-lorecard-fade .16s ease both;}
    .gs-lorecard{position:relative;width:100%;max-width:460px;margin:0 8px;
      background:linear-gradient(180deg,#141926,#0e121b);border:1px solid #2b3346;border-radius:18px 18px 0 0;
      box-shadow:0 -10px 34px #000b;padding:18px 16px 20px;animation:gs-lorecard-rise .22s cubic-bezier(.2,.8,.2,1) both;
      max-height:calc(var(--gs-dvh) * .88);display:flex;flex-direction:column;}
    @media(min-width:560px){.gs-lorecard-ov{align-items:safe center;}.gs-lorecard{border-radius:18px;}}
    .gs-lorecard-x{position:absolute;top:8px;right:8px;width:34px;height:34px;border-radius:50%;
      border:1px solid #333c50;background:#0d1119;color:#9fb0c8;font-size:15px;cursor:pointer;line-height:1;}
    .gs-lorecard-x:hover{background:#161c28;color:#e6eefc;}
    .gs-lorecard-top{display:flex;align-items:center;gap:14px;padding-bottom:12px;margin-bottom:12px;
      border-bottom:2px solid var(--acc,#5b8bd0);}
    .gs-lorecard-medal{flex:0 0 auto;width:74px;height:74px;border-radius:14px;overflow:hidden;
      display:flex;align-items:center;justify-content:center;font-size:34px;
      background:radial-gradient(circle at 40% 30%,#1c2434,#0b0f17);border:2px solid var(--acc,#5b8bd0);
      box-shadow:0 0 14px -4px var(--acc,#5b8bd0);}
    .gs-lorecard-medal svg{width:100%;height:100%;}
    .gs-lorecard-id{display:flex;flex-direction:column;gap:3px;min-width:0;}
    .gs-lorecard-name{font-size:19px;font-weight:800;color:var(--gs-ink,#eaf1fb);line-height:1.15;}
    .gs-lorecard-tag{font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--acc,#5b8bd0);text-transform:uppercase;}
    .gs-lorecard-detail{display:flex;flex-direction:column;gap:4px;background:#0b0f18;border:1px solid #232b3b;
      border-radius:10px;padding:9px 11px;margin-bottom:12px;}
    .gs-lorecard-dline{font-size:13px;color:#cdd8ea;line-height:1.35;}
    .gs-lorecard-scroll{overflow-y:auto;flex:1 1 auto;-webkit-overflow-scrolling:touch;}
    .gs-lorecard-lore{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--gs-dim,#9fb0c8);font-style:italic;}
    .gs-lorecard-lore:last-child{margin-bottom:0;}
    .gs-lorecard-foot{margin-top:14px;display:flex;flex-direction:column;gap:8px;}
    @keyframes gs-lorecard-fade{from{opacity:0;}to{opacity:1;}}
    @keyframes gs-lorecard-rise{from{transform:translateY(18px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
    @media(prefers-reduced-motion:reduce){.gs-lorecard-ov,.gs-lorecard{animation:none;}}
  </style>`;
}

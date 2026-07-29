/**
 * GS-story-shop-crossnav: the "other services at THIS world" links, shared by the Pro Shop and the Shipyard
 * so each can jump to the others without flying back to the star map first. A single world can host a Pro
 * Shop, a Ship Vendor, AND a recruitable caddy (a friend belongs to a place) — this surfaces whichever of
 * them you're NOT currently looking at, plus the caddy recruit. Pure render off `StoryState`; the actions
 * (`openStoryShop`/`openStoryShipyard`/`hireStoryCaddy`) already accept these origins in the reducer.
 */

import { worldHasShop } from '../sim/rpg/storyShop';
import { worldIsShipVendor } from '../sim/rpg/storyShips';
import { worldCaddy, storyCaddyHired, STORY_CADDY_PRICE } from '../sim/rpg/storyCaddies';
import { shopItem } from '../sim/rpg/economy';
import type { StoryState } from '../sim/rpg/story';
import type { Screen } from '../ui/gameState';

/** Which service the caller is currently showing (so we don't offer a link back to itself). */
export type StoryService = 'shop' | 'shipyard';

/** The recruit-a-caddy button (or an "already aboard" note) for the caddy who waits at this world. Warden
 *  path only — a Herald turned on the Warden friends, so they won't join (mirrors the recap/dossier gate). */
function caddyLink(story: StoryState, worldId: string): string {
  const caddyId = worldCaddy(worldId);
  if (!caddyId || story.alignment === 'herald') return '';
  const name = shopItem(caddyId)?.name ?? 'a friend';
  if (storyCaddyHired(story, caddyId)) return `<div class="gs-svc-note">🎒 ${name} is already in your crew.</div>`;
  return `<button class="gs-btn" style="background:linear-gradient(180deg,#22161f,#170f16);border-color:#6a3a52;color:#f0a8c8;" data-action='${JSON.stringify(
    { type: 'hireStoryCaddy', worldId, caddyId },
  )}'>🎒 Recruit ${name} · ✦ ${STORY_CADDY_PRICE}</button>`;
}

/**
 * The cross-service links + caddy recruit for a world, MINUS the service you're already in (`here`). Empty
 * when the world offers nothing else. Dropped into the shop/shipyard footer above their own back button.
 */
export function storyWorldServicesHTML(story: StoryState, worldId: string, here: StoryService): string {
  const links: string[] = [];
  const caddy = caddyLink(story, worldId);
  if (caddy) links.push(caddy);
  if (here !== 'shipyard' && worldIsShipVendor(worldId)) {
    links.push(
      `<button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openStoryShipyard', worldId })}'>🚀 Visit the Shipyard</button>`,
    );
  }
  if (here !== 'shop' && worldHasShop(worldId)) {
    links.push(
      `<button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openStoryShop', worldId })}'>🛒 Visit the Pro Shop</button>`,
    );
  }
  if (!links.length) return '';
  return `<div class="gs-svc"><div class="gs-svc-hdr">Also at this world</div>${links.join('')}
    <style>.gs-svc{display:flex;flex-direction:column;gap:8px;padding-bottom:4px;margin-bottom:2px;border-bottom:1px solid #232b3b;}
      .gs-svc-hdr{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gs-dim,#9fb0c8);text-align:center;}
      .gs-svc-note{text-align:center;color:#7fe0a0;font-size:13px;padding:2px;}</style></div>`;
}

/**
 * GS-story-venue-services: the "you are STILL AT this world — spend before you fly on" block for a round
 * RECAP (the world-clear recap AND the Sigil-major recap). ONE description of what a world offers, so the
 * two recaps can't drift: the Pro Shop, the Shipyard (vendor worlds), and the friend who waits here.
 * Empty when the world stocks nothing — every button is guarded by the same predicate the reducer checks,
 * so nothing is offered that a dispatch would refuse.
 */
export function storyRecapServicesHTML(story: StoryState | undefined, worldId: string): string {
  if (!story) return '';
  const out: string[] = [];
  if (worldHasShop(worldId)) {
    out.push(`<button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryShop', worldId })}'>🛒 Visit the Pro Shop</button>`);
  }
  if (worldIsShipVendor(worldId)) {
    out.push(`<button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryShipyard', worldId })}'>🚀 Visit the Shipyard</button>`);
  }
  const caddyId = worldCaddy(worldId);
  if (caddyId) {
    const name = shopItem(caddyId)?.name ?? 'a friend';
    if (storyCaddyHired(story, caddyId)) {
      out.push(`<div style="text-align:center;color:#7fe0a0;font-size:13px;">🎒 ${name} is already in your crew.</div>`);
    } else if (story.alignment !== 'herald') {
      // GS-story-quality (GAP1): the Herald can't recruit the Warden friends they turned on.
      out.push(
        `<button class="gs-btn" style="background:linear-gradient(180deg,#22161f,#170f16);border-color:#6a3a52;color:#f0a8c8;" data-action='${JSON.stringify(
          { type: 'hireStoryCaddy', worldId, caddyId },
        )}'>🎒 Recruit ${name} · ✦ ${STORY_CADDY_PRICE}</button>`,
      );
    }
  }
  return out.join('');
}

/**
 * GS-story-venue-services: a service screen's back button must NAME where it actually lands. The exit
 * destination is stored (`storyShopReturn`/`storyShipyardReturn`), so the label reads it rather than being
 * written per screen — the shipyard used to promise "leave the shipyard" and drop you at the clubhouse on
 * the recap route while the Pro Shop beside it flew to the chart.
 */
export function storyServiceBackLabel(ret: Screen | undefined): string {
  switch (ret) {
    case 'storyTournamentResult':
      return '‹ Back to the result';
    case 'story':
      return '‹ Back to the clubhouse';
    default:
      return '‹ Back to the star chart';
  }
}

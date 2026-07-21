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

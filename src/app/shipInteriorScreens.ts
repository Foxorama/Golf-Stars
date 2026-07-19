/**
 * The SHIP INTERIOR (GS-story-ship-interior) — tap your ship on the Story star chart to step aboard. Five
 * rooms you walk between (bridge · lounge · weapons · engine · locker), each an illustrated backdrop tinted
 * to the FLOWN ship's palette (so a woody wagon and the infernal Firebird feel like different vessels).
 * Your crew wander the ship — they scatter to new rooms each time you board (`shipVisit`) — and stand in
 * whichever room you're in, tappable for their talk card. The WEAPONS + ENGINE rooms outfit the ship
 * (buy upgrades without flying back to a vendor); the LOCKER room opens your bag; the BRIDGE is the helm.
 *
 * Pure string builders — no DOM, no rng (the crew scatter is a stable hash of id×visit). Own `.si-*` CSS
 * prefix (never the play HUD's `.gs-hud`), and the crew standees emit the SAME `<canvas class="gs-caddycv"
 * data-caddy>` the app.ts mount pass already draws every render, so the figures come for free.
 */

import { state } from './ctx';
import { shipById } from '../sim/rpg/ships';
import { shipInteriorTheme, shipRoomArt, SHIP_ROOM_META } from '../render/shipInteriorArt';
import { SHIP_ROOMS, type ShipRoom } from '../ui/gameState';
import { crewRoster, allyName } from '../sim/rpg/storyAllies';
import { heraldCrew } from '../sim/rpg/storyHeraldCrew';
import { activeStoryCaddy } from '../sim/rpg/storyCaddies';
import { questOfferable } from '../sim/rpg/storyQuests';
import { allyInspectOverlayHTML } from '../render/storyCrew';
import { isHeraldAgent } from '../sim/rpg/storyHeraldCrew';
import { heraldAgentOverlayHTML } from '../render/storyHeraldOverlay';
import { rarCol } from '../sim/rpg/loot';
import { itemArtSVG } from '../render/itemArt';
import { shipInspectOverlay } from './storyShipyardScreens';
import {
  STORY_SHIP_UPGRADES,
  ownsUpgrade,
  canBuyUpgrade,
  upgradeRevealed,
  combatRating,
  categoryRating,
  type UpgradeCategory,
  type StoryShipUpgrade,
} from '../sim/rpg/storyShipUpgrades';
import type { StoryState } from '../sim/rpg/story';

/** One crew member aboard: id + short name + optional tint (Herald agents share portraits). */
interface Crewmate {
  id: string;
  short: string;
  tint?: string;
}

/** The crew aboard — recruited caddies (Warden) or the Coil inner circle (Herald). */
function crewAboard(story: StoryState): Crewmate[] {
  if (story.alignment === 'herald') {
    return heraldCrew(story).map((a) => ({
      id: a.id,
      short: (a.name.includes('"') ? a.name.replace(/^.*?["']([^"']+)["'].*$/, '$1') : a.name.split(' ')[0]) || a.name,
      tint: a.tint,
    }));
  }
  return crewRoster(story).map((id) => ({ id, short: allyName(id).split(' ')[0] || allyName(id) }));
}

/** A stable little hash (byte-stable, no rng) so each crewmate picks a room per boarding visit. */
function hashRoom(id: string, visit: number): ShipRoom {
  let h = visit * 2654435761;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SHIP_ROOMS[h % SHIP_ROOMS.length]!;
}

export function shipInteriorScreen(): string {
  const story = state.story;
  if (!story) {
    return `<header class="gs-hero"><h1 class="gs-hero-title">🚀 Aboard</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitShipInterior' })}'>‹ Back to the chart</button>
      </div>`;
  }
  const room = (SHIP_ROOMS as readonly string[]).includes(state.shipRoom ?? '') ? (state.shipRoom as ShipRoom) : 'bridge';
  const theme = shipInteriorTheme(story.equippedShipId);
  const shipName = shipById(story.equippedShipId)?.name ?? 'your ship';
  const visit = state.shipVisit ?? 0;
  const crew = crewAboard(story);
  const active = activeStoryCaddy(story);

  // Crew standees for whoever is in THIS room (they scatter to new rooms each boarding).
  const here = crew.filter((c) => hashRoom(c.id, visit) === room);
  const standees = here.map((c, i) => crewStandee(c, here.length, i, c.id === active, questOfferable(story, c.id))).join('');

  // The room's content panel (below the scene): outfitting in weapons/engine, the locker door, flavour.
  const panel = roomPanel(room, story, theme);

  // Overlays: an ally's talk card (crew tap) or an upgrade's lore card (outfitting tap).
  const overlay = state.storyAllyInspectId
    ? isHeraldAgent(state.storyAllyInspectId)
      ? heraldAgentOverlayHTML(state.storyAllyInspectId, state.storyAllyTalk ?? 0)
      : allyInspectOverlayHTML(state.storyAllyInspectId, story, state.storyAllyTalk ?? 0)
    : state.storyItemInspectId
    ? shipInspectOverlay(state.storyItemInspectId)
    : '';

  const rating = combatRating(story);
  const meta = SHIP_ROOM_META[room];

  return `${SI_STYLE}
    <header class="gs-hero gs-storyhub" style="--ac:${theme.trim};">
      <h1 class="gs-hero-title" style="font-size:20px;">🚀 ${shipName}</h1>
      <p class="gs-hero-tag">${meta.icon} ${meta.label} · aboard your ship</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:13px;" title="credits">✦ <b>${story.credits}</b></span>
        <span class="gs-chip" style="border-color:#3a2030;color:#ff8a8a;font-size:13px;" title="fleet combat readiness for the finale">⚔ <b>${rating}</b> combat</span>
      </div>
    </header>

    <section style="max-width:620px;margin:6px auto 0;">
      <div class="si-scene">
        ${shipRoomArt(room, theme)}
        <div class="si-roomlabel">${meta.icon} ${meta.label}</div>
        ${standees}
      </div>
      ${roomNav(room, theme)}
      ${panel}
    </section>

    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitShipInterior' })}'>‹ Back to the star chart</button>
    </div>
    ${overlay}`;
}

/** The room-navigation tab bar — walk between rooms aboard the ship. */
function roomNav(current: ShipRoom, theme: { trim: string }): string {
  const tabs = SHIP_ROOMS.map((r) => {
    const m = SHIP_ROOM_META[r];
    const on = r === current;
    return `<button class="si-tab${on ? ' si-tab--on' : ''}" ${on ? 'aria-current="page"' : ''}
        data-action='${JSON.stringify({ type: 'shipInteriorGoto', room: r })}' aria-label="${m.label}">
        <span class="si-tab-ic">${m.icon}</span><span class="si-tab-lb">${m.label}</span>
      </button>`;
  }).join('');
  return `<div class="si-nav" style="--ac:${theme.trim};">${tabs}</div>`;
}

/** The content panel for the current room. */
function roomPanel(room: ShipRoom, story: StoryState, theme: { trim: string }): string {
  switch (room) {
    case 'weapons':
      return outfitPanel('weapon', '🔫 Weapons bay', 'Arm the hull. Every piece raises your combat rating for the day the serpent wakes.', story, theme);
    case 'engine':
      return outfitPanel('engine', '⚛ Engine core', 'Tune the drive — thrust, reactor, and the credit-siphons that pay for the voyage.', story, theme);
    case 'locker':
      return `<div class="si-panel">
        <p class="si-flavour">Your gear stands racked along the wall. Build your bag, swap your clubs, change who carries it.</p>
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'openStoryLocker' })}'>🎒 Open the locker</button>
      </div>`;
    case 'lounge':
      return `<div class="si-panel">
        <p class="si-flavour">The rec deck — where the crew put their feet up between worlds. Tap a friend to talk.</p>
      </div>`;
    case 'bridge':
    default:
      return `<div class="si-panel">
        <p class="si-flavour">The helm. The star chart glows on the forward glass — your next course is out there.</p>
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitShipInterior' })}'>🗺 To the star chart ›</button>
      </div>`;
  }
}

/** The weapons/engine outfitting panel — buyable upgrade cards for one category (the shipyard, aboard). */
function outfitPanel(cat: UpgradeCategory, title: string, blurb: string, story: StoryState, theme: { trim: string }): string {
  const items = STORY_SHIP_UPGRADES.filter(
    (u) => u.category === cat && (upgradeRevealed(story, u) || ownsUpgrade(story, u.id)),
  );
  const catRating = categoryRating(story, cat);
  const cards = items.length
    ? `<div class="si-grid">${items.map((u) => outfitCard(u, story)).join('')}</div>`
    : `<p class="si-flavour">Nothing stocked here yet — clear more worlds to unlock this bay's arsenal.</p>`;
  return `<div class="si-panel" style="--ac:${theme.trim};">
    <div class="si-panel-head"><b>${title}</b><span class="si-panel-rating">⚔ ${catRating}</span></div>
    <p class="si-flavour">${blurb}</p>
    ${cards}
  </div>`;
}

/** One outfitting card — tap to inspect (lore card + Install), or it shows as installed. */
function outfitCard(u: StoryShipUpgrade, story: StoryState): string {
  const owned = ownsUpgrade(story, u.id);
  const ac = rarCol(u.rarity);
  let stateLine: string;
  if (owned) stateLine = `<span class="si-card-state si-card-state--owned">✓ Installed</span>`;
  else if (canBuyUpgrade(story, u)) stateLine = `<span class="si-card-state si-card-state--price">✦ ${u.price}</span>`;
  else stateLine = `<span class="si-card-state si-card-state--no">✦ ${u.price}</span>`;
  return `<button class="si-card" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: u.id })}'
      aria-label="${u.name}">
      <span class="si-card-badge">⚔ ${u.battle}</span>
      <span class="si-card-art" aria-hidden="true">${itemArtSVG(u.id, u.rarity)}</span>
      <span class="si-card-name">${u.name}</span>
      ${stateLine}
    </button>`;
}

/** One crewmate standee in the current room — feet-anchored full-body figure, tappable for their card.
 *  Positioned across the deck floor by index so a full room doesn't stack them. */
function crewStandee(c: Crewmate, count: number, i: number, active: boolean, hasQuest: boolean): string {
  // Spread standees along the floor: 1 centred, more fanned across 20%–80%.
  const left = count <= 1 ? 50 : 20 + (60 * i) / (count - 1);
  const questMark = hasQuest ? `<span class="si-questmark" aria-hidden="true">❗</span>` : '';
  return `<button class="si-caddy${active ? ' si-caddy--on' : ''}"
      data-action='${JSON.stringify({ type: 'storyInspectAlly', caddyId: c.id })}'
      aria-label="Talk to ${c.short}${active ? ', on your bag' : ''}${hasQuest ? ' — they have a quest for you' : ''}"
      style="left:${left.toFixed(1)}%;">
      ${questMark}
      <span class="si-cav"${c.tint ? ` style="filter:${c.tint};"` : ''}><canvas class="gs-caddycv" data-caddy="${c.id}" width="260" height="260"></canvas></span>
      <span class="si-cplate">${active ? `🎒 ${c.short}` : c.short}</span>
    </button>`;
}

const SI_STYLE = `<style>
  .si-scene{container-type:inline-size;position:relative;width:100%;aspect-ratio:4/3;max-width:620px;margin:0 auto;
    border:1px solid #2a3346;border-radius:16px;overflow:hidden;background:#0b0f18;box-shadow:0 8px 30px -12px #000a;}
  .si-roomlabel{position:absolute;top:3%;left:50%;transform:translateX(-50%);font-family:Georgia,serif;font-weight:800;
    font-size:clamp(11px,2.8cqw,15px);letter-spacing:.03em;color:#eaf2ff;background:#0b1018cc;padding:3px 12px;border-radius:20px;
    border:1px solid #33465f;pointer-events:none;z-index:5;}
  /* crew standees on the deck floor */
  .si-caddy{position:absolute;bottom:2%;background:none;border:0;padding:0;cursor:pointer;color:inherit;text-align:center;
    transform:translateX(-50%);z-index:16;transition:transform .15s ease;}
  .si-caddy:hover,.si-caddy:focus-visible{outline:none;transform:translateX(-50%) scale(1.06);z-index:22;}
  .si-cav{display:block;width:26cqw;max-width:140px;margin:0 auto -2cqw;filter:drop-shadow(0 4px 4px #000a);}
  .si-cav canvas{width:100%;height:auto;display:block;}
  .si-caddy--on .si-cav{width:29cqw;max-width:156px;filter:drop-shadow(0 5px 5px #000b) drop-shadow(0 0 8px #f0a8c8aa);}
  .si-questmark{position:absolute;top:-4%;left:50%;font-size:clamp(13px,3.4cqw,20px);line-height:1;
    filter:drop-shadow(0 0 5px #ffd23c) drop-shadow(0 1px 1px #000a);pointer-events:none;z-index:24;
    animation:si-qbob 1.25s ease-in-out infinite;}
  @keyframes si-qbob{0%,100%{transform:translate(-50%,0);}50%{transform:translate(-50%,-5px);}}
  .si-cplate{display:inline-block;margin-top:2px;padding:1px 7px;border-radius:10px;background:#0e141edd;
    border:1px solid #33465f;font-size:clamp(7px,1.8cqw,10px);font-weight:700;color:#cdd8ea;white-space:nowrap;position:relative;z-index:1;}
  .si-caddy--on .si-cplate{background:#231018ee;border-color:#6a3a52;color:#f0a8c8;}
  @media(prefers-reduced-motion:reduce){.si-questmark{animation:none;}}
  /* room nav */
  .si-nav{display:flex;gap:6px;max-width:620px;margin:10px auto 0;padding:5px;background:#0e131c;border:1px solid #232b3b;border-radius:14px;}
  .si-tab{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 2px;border:1px solid transparent;
    border-radius:10px;background:none;color:#9fb0c8;cursor:pointer;font:inherit;transition:background .12s ease,color .12s ease,border-color .12s ease;}
  .si-tab:hover,.si-tab:focus-visible{outline:none;background:#161d29;color:#eaf1fb;}
  .si-tab--on{background:linear-gradient(180deg,#1a2331,#141a26);border-color:var(--ac,#5b8bd0);color:#eaf1fb;box-shadow:inset 0 0 0 1px var(--ac,#5b8bd0)33;}
  .si-tab-ic{font-size:clamp(15px,4cqw,20px);line-height:1;}
  .si-tab-lb{font-size:clamp(8px,2.4vw,11px);font-weight:700;letter-spacing:.02em;}
  /* room content panel */
  .si-panel{max-width:620px;margin:12px auto 0;padding:14px 16px;background:linear-gradient(180deg,#141926,#0f131c);
    border:1px solid #262f42;border-radius:14px;}
  .si-panel-head{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:#eaf1fb;margin-bottom:4px;}
  .si-panel-rating{color:#ff8a8a;font-weight:800;font-size:13px;}
  .si-flavour{margin:0 0 10px;font-size:13px;line-height:1.5;color:var(--gs-dim,#9fb0c8);font-style:italic;}
  .si-panel .gs-btn{width:100%;}
  .si-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
  .si-card{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;cursor:pointer;
    background:linear-gradient(180deg,#161c2a,#10141d);border:1px solid #262f42;border-top:3px solid var(--ac,#5b8bd0);
    border-radius:12px;padding:10px 9px;position:relative;color:inherit;font:inherit;transition:transform .12s ease,box-shadow .12s ease;}
  .si-card:hover,.si-card:focus-visible{outline:none;transform:translateY(-2px);box-shadow:0 6px 16px -8px var(--ac,#5b8bd0);}
  .si-card-badge{position:absolute;top:7px;right:7px;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;
    background:#0b0f18;border:1px solid var(--ac,#5b8bd0);color:var(--ac,#5b8bd0);}
  .si-card-art{width:104px;height:58px;}
  .si-card-art svg{width:100%;height:100%;}
  .si-card-name{font-size:12.5px;font-weight:700;color:#eaf1fb;line-height:1.2;}
  .si-card-state{font-size:12px;font-weight:800;}
  .si-card-state--owned{color:#7fe0a0;}
  .si-card-state--price{color:var(--gs-gold,#e9c46a);}
  .si-card-state--no{color:#c86a6a;}
</style>`;

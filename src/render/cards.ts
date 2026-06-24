/**
 * Collectible-card layer (GS-5) — the "rarity-graded loot" visual language, descended
 * from golf-finder's buildCard + RARITY_C accent. Pure HTML-string builders (no DOM, no
 * event wiring) so they're testable and either renderer/host can drop them in.
 *
 * Art hook: each card takes an optional `artUrl`. Biome/boss/item art is Flux-generated
 * (see reports/art-pipeline.md and CLAUDE.md "Art pipeline"); until art exists the card
 * falls back to a rarity-tinted gradient + the hole thumbnail, so the layout is complete
 * without it. The sim never sees colour — rarity→colour lives here.
 */

import type { Course } from '../sim/course/contract';
import type { Rarity } from '../sim/course/contract';
import { rarCol } from '../sim/rpg/loot';
import { renderHoleSVG } from './holeView';

function rarityBadge(rarity: Rarity): string {
  const col = rarCol(rarity);
  return `<span style="color:${col};border:1px solid ${col};border-radius:6px;padding:1px 7px;font-size:11px;text-transform:uppercase;letter-spacing:1px;">${rarity}</span>`;
}

export interface CourseCardOptions {
  thumbWidth?: number;
  thumbHeight?: number;
  /** Flux-generated biome art; falls back to a tinted gradient + thumbnail if absent. */
  artUrl?: string;
}

/** A "course discovered" card: name, rarity accent, biome/wildness, and a hole thumbnail. */
export function courseCardHTML(course: Course, opts: CourseCardOptions = {}): string {
  const col = rarCol(course.rarity);
  const w = opts.thumbWidth ?? 300;
  const h = opts.thumbHeight ?? 360;
  const par = course.holes.reduce((s, hole) => s + hole.par, 0);
  const thumb = opts.artUrl
    ? `<img src="${opts.artUrl}" alt="${course.biome}" style="width:${w}px;height:${h}px;object-fit:cover;display:block;" />`
    : renderHoleSVG(course.holes[0]!, { width: w, height: h, biome: course.biome });

  return `
    <article style="width:${w}px;border:2px solid ${col};border-radius:14px;overflow:hidden;background:#11141b;box-shadow:0 0 18px ${col}33;">
      <div style="padding:10px 12px;background:linear-gradient(120deg, ${col}22, transparent);display:flex;align-items:baseline;gap:8px;">
        <b style="font-size:16px;">${course.meta.name}</b>
        <span style="margin-left:auto;">${rarityBadge(course.rarity)}</span>
      </div>
      ${thumb}
      <div style="padding:8px 12px;font-size:13px;opacity:.85;display:flex;gap:12px;flex-wrap:wrap;">
        <span>🪐 ${course.biome}</span>
        <span>⛳ ${course.holes.length} holes · par ${par}</span>
        <span>🌪 wildness ${course.meta.wildness.toFixed(2)}</span>
      </div>
    </article>`;
}

export interface ItemCardState {
  owned?: boolean;
  affordable?: boolean;
}

/** A shop item / loot card, rarity-tinted, dimmed when owned or unaffordable. */
export function itemCardHTML(
  item: { name: string; cost: number; desc: string; rarity: Rarity },
  state: ItemCardState = {},
): string {
  const col = rarCol(item.rarity);
  const dim = state.owned || state.affordable === false;
  const note = state.owned ? 'OWNED' : state.affordable === false ? 'NEED CREDITS' : `${item.cost}c`;
  return `
    <article style="width:170px;border:2px solid ${col};border-radius:12px;background:#11141b;padding:10px;opacity:${dim ? 0.5 : 1};box-shadow:0 0 12px ${col}22;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <b style="font-size:14px;">${item.name}</b>
        <span style="margin-left:auto;">${rarityBadge(item.rarity)}</span>
      </div>
      <p style="font-size:12px;opacity:.8;margin:.5em 0;min-height:2.4em;">${item.desc}</p>
      <div style="font-size:13px;color:${col};font-weight:600;">${note}</div>
    </article>`;
}

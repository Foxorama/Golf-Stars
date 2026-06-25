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

import { dist } from '../sim/course/contract';
import type { Course } from '../sim/course/contract';
import type { Rarity } from '../sim/course/contract';
import { hasBackspin, type ShotLog } from '../sim/round';
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

/**
 * Per-shot "splash" card: the stat readout for the shot just played — total distance,
 * carry, accuracy (how far off the aim line it finished), and backspin for the lofted
 * clubs that generate it. Pure HTML string. The geometry (lateral error vs the aim
 * bearing) is computed here from the ShotLog the sim already emits.
 */
export function shotCardHTML(shot: ShotLog): string {
  const carry = Math.round(shot.result.carry);
  const total = Math.round(dist(shot.from, shot.rest));
  const roll = Math.round(shot.roll);

  // Lateral finish error: signed perpendicular distance of the landing from the aim ray.
  const br = (shot.result.shotBearing * Math.PI) / 180;
  const rx = Math.cos(br); // right-perpendicular of the bearing
  const ry = -Math.sin(br);
  const vx = shot.result.landing[0] - shot.from[0];
  const vy = shot.result.landing[1] - shot.from[1];
  const lateral = vx * rx + vy * ry;
  const off = Math.round(Math.abs(lateral));
  const side = off === 0 ? 'dead straight' : `${off} yd ${lateral >= 0 ? 'right' : 'left'}`;
  // Accuracy grade off how tight the miss is relative to the carry.
  const missFrac = carry > 0 ? Math.abs(lateral) / carry : 0;
  const grade = missFrac < 0.04 ? 'Pure' : missFrac < 0.1 ? 'Solid' : missFrac < 0.2 ? 'Loose' : 'Wild';

  const accent = shot.holed ? '#5fd45a' : shot.penalty ? '#ff6b6b' : '#9fd8e6';
  const eligible = hasBackspin(shot.club.carry);
  const spinLevel = roll < -8 ? 'heavy ⟲⟲' : roll < -3 ? 'biting ⟲' : roll <= 0 ? 'slight ⟲' : 'low';

  const row = (label: string, value: string): string =>
    `<div style="display:flex;justify-content:space-between;gap:14px;font-size:13px;padding:2px 0;">
       <span style="opacity:.65;">${label}</span><span style="font-weight:600;">${value}</span></div>`;

  const rollText = roll > 0 ? `+${roll} yd run` : roll < 0 ? `${roll} yd check ↩` : 'no run';
  const header = shot.holed
    ? 'IN THE HOLE! 🎉'
    : shot.penalty
    ? `${shot.penalty.toUpperCase()} — penalty`
    : `${shot.club.name}`;

  return `
    <article style="border:2px solid ${accent};border-radius:12px;background:#11141b;padding:10px 12px;box-shadow:0 0 14px ${accent}33;min-width:190px;">
      <div style="font-size:14px;font-weight:700;color:${accent};margin-bottom:4px;">${header}</div>
      ${row('Total', `${total} yd`)}
      ${row('Carry', `${carry} yd`)}
      ${row('Roll', rollText)}
      ${row('Accuracy', `${side} · ${grade}`)}
      ${eligible ? row('Backspin', spinLevel) : ''}
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

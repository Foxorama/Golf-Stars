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
import { hasBackspin, type PuttLog, type ShotLog } from '../sim/round';
import { rarCol } from '../sim/rpg/loot';
import { renderHoleSVG } from './holeView';
import { restArtSVG, lieLabel } from './restArt';

const cap = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

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

export interface ShotCardOptions {
  /** Yards remaining to the pin after this shot (shown when the hole isn't over). */
  distToPin?: number;
  /** Draw the procedural "ball at rest on the surface" vignette (default true). */
  showArt?: boolean;
}

/**
 * Per-shot "splash" card: the stat readout for the shot just played — the club used, where it
 * finished (a procedural vignette of the ball at rest on that surface, or the hazard it found),
 * total/carry distance, the lie it moved between, distance left to the pin, accuracy, and backspin
 * for the lofted clubs that generate it. Pure HTML string. The geometry (lateral error vs the aim
 * bearing) is computed here from the ShotLog the sim already emits.
 */
export function shotCardHTML(shot: ShotLog, opts: ShotCardOptions = {}): string {
  const carry = Math.round(shot.result.carry);
  const total = Math.round(dist(shot.from, shot.rest));
  const roll = Math.round(shot.roll);
  const showArt = opts.showArt !== false;

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

  // Where it finished: the surface (or hazard) the ball came to rest on/in, as a vignette.
  const art = showArt
    ? `<div style="margin:2px 0 8px;">${restArtSVG(shot.lieTo, {
        penalty: shot.penalty,
        holed: shot.holed,
        knockedDown: shot.knockedDown,
        height: 110,
      })}</div>`
    : '';
  // The lie progression / finish description.
  const finish = shot.holed
    ? 'Holed out 🎉'
    : shot.penalty
    ? `Found ${lieLabel(shot.lieTo)} (+1)`
    : `${cap(shot.lieFrom)} → ${cap(shot.lieTo)}${shot.knockedDown ? ' (knocked down)' : ''}`;
  const toPin =
    opts.distToPin != null && !shot.holed ? row('To pin', `${Math.round(opts.distToPin)} yd`) : '';

  return `
    <article style="border:2px solid ${accent};border-radius:12px;background:#11141b;padding:10px 12px;box-shadow:0 0 14px ${accent}33;min-width:190px;">
      <div style="font-size:14px;font-weight:700;color:${accent};margin-bottom:4px;">${header}</div>
      ${art}
      ${row('Club', shot.club.name)}
      ${row('Finish', finish)}
      ${row('Total', `${total} yd`)}
      ${row('Carry', `${carry} yd`)}
      ${row('Roll', rollText)}
      ${toPin}
      ${row('Accuracy', `${side} · ${grade}`)}
      ${eligible ? row('Backspin', spinLevel) : ''}
    </article>`;
}

/**
 * Putting summary "splash": how many putts, and the outcome. Used for the auto-putt result
 * (and the end of a manual putt sequence). Pure HTML string.
 */
export function puttCardHTML(putts: PuttLog[], opts: { holed?: boolean; pickedUp?: boolean } = {}): string {
  const n = putts.length;
  const accent = opts.holed ? '#5fd45a' : opts.pickedUp ? '#ff6b6b' : '#9fd8e6';
  const label = opts.pickedUp
    ? 'Picked up'
    : n === 0
    ? '—'
    : n === 1
    ? 'One-putt! 🎯'
    : `${n} putts`;
  const head = opts.holed ? 'Holed out' : 'Putting';
  const art = `<div style="margin:4px 0 2px;">${restArtSVG('green', { holed: opts.holed, height: 96 })}</div>`;
  return `
    <article style="border:2px solid ${accent};border-radius:12px;background:#11141b;padding:8px 12px;box-shadow:0 0 12px ${accent}33;min-width:160px;">
      <div style="font-size:13px;font-weight:700;color:${accent};">⛳ ${head}</div>
      ${art}
      <div style="font-size:13px;margin-top:2px;">${label}</div>
    </article>`;
}

export interface ItemCardState {
  /** Already maxed out — a one-shot unique you own, or a stackable at its cap. */
  owned?: boolean;
  affordable?: boolean;
  /** Stacks already owned (stackables) — shows a "×N" badge so progress is legible. */
  count?: number;
  /**
   * Optional emphasis pill shown under the name (GS-clubs-2): used by reward clubs to flag whether
   * they're an UPGRADE or a NEW club filling a distance gap. `{ text, tone }` — tone tints the pill.
   */
  badge?: { text: string; tone?: 'up' | 'new' };
  /** Procedural item art (GS-proshop-2): an `<svg>` string shown atop the card (the gear you buy). */
  artSVG?: string;
}

/** A shop item / loot card, rarity-tinted, dimmed when maxed or unaffordable. */
export function itemCardHTML(
  item: { name: string; cost: number; desc: string; rarity: Rarity },
  state: ItemCardState = {},
): string {
  const col = rarCol(item.rarity);
  const dim = state.owned || state.affordable === false;
  const note = state.owned ? 'MAXED' : state.affordable === false ? 'NEED CREDITS' : `${item.cost}c`;
  const stackBadge =
    state.count && state.count > 0
      ? `<span style="margin-left:6px;font-size:11px;color:${col};opacity:.85;">×${state.count}</span>`
      : '';
  const badge = state.badge
    ? (() => {
        const bc = state.badge.tone === 'up' ? '#5fd45a' : '#9fd8e6';
        return `<div style="display:inline-block;margin:.1em 0 .3em;font-size:10.5px;font-weight:700;letter-spacing:.4px;color:${bc};border:1px solid ${bc};border-radius:5px;padding:1px 6px;">${state.badge.text}</div>`;
      })()
    : '';
  const art = state.artSVG
    ? `<div style="margin:2px 0 7px;border-radius:9px;overflow:hidden;box-shadow:inset 0 0 0 1px ${col}33;">${state.artSVG}</div>`
    : '';
  return `
    <article style="width:170px;border:2px solid ${col};border-radius:12px;background:#11141b;padding:10px;opacity:${dim ? 0.5 : 1};box-shadow:0 0 12px ${col}22;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <b style="font-size:14px;">${item.name}</b>${stackBadge}
        <span style="margin-left:auto;">${rarityBadge(item.rarity)}</span>
      </div>
      ${badge}
      ${art}
      <p style="font-size:12px;opacity:.8;margin:.5em 0;min-height:2.4em;">${item.desc}</p>
      <div style="font-size:13px;color:${col};font-weight:600;">${note}</div>
    </article>`;
}

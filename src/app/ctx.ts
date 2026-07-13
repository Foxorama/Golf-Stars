/**
 * Shared UI context for the app shell (`src/app/*`): the live UiState binding plus the
 * tiny chrome helpers every screen builder uses (`btn`, `header`).
 *
 * `state` is an ES-module LIVE binding — `app.ts` owns the reduce/persist/render loop and
 * reassigns it through `setState()`; every screen module imports `state` and always reads
 * the current value. Screen modules never mutate state themselves (they build HTML strings;
 * actions dispatch through `data-action` wiring in `app.ts`'s render()).
 */

import type { Action, UiState } from '../ui/game';
import { getCharacter } from '../sim/rpg/characters';
import { rarCol } from '../sim/rpg/loot';
import { fuelGaugeHTML } from '../render/fuel';
import { tankCapacity } from '../sim/rpg/run';
import { STROKEPLAY_FORMAT } from '../sim/rpg/formats';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { playTotals } from '../sim/score';
import { formatToPar, toParColour } from '../sim/rpg/endless';

export let state: UiState;

/** Reassign the live state — called ONLY by app.ts (boot / recover / dispatch). */
export function setState(s: UiState): void {
  state = s;
}

export function seedFromUrl(): number | string | null {
  const q = new URLSearchParams(location.search).get('seed');
  if (q === null) return null;
  const n = Number(q);
  return Number.isFinite(n) && q.trim() !== '' ? n : q;
}

/** A fresh random seed for a new run (GS-fresh-start). The run stays fully deterministic FROM its
 *  seed — this only picks WHICH deterministic run you get, so every boot/new-run opens a different
 *  world + journey instead of the old fixed-1234 opener. `?seed=` pins it (repro/sharing/test hub);
 *  the sim itself never calls Math.random. */
export function freshRunSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

export type BtnVariant = 'primary' | 'ghost' | 'on';

export const btn = (
  label: string,
  action: Action,
  opts: { disabled?: boolean; borderColor?: string; block?: boolean; variant?: BtnVariant } = {},
): string => {
  const cls = ['gs-btn'];
  if (opts.variant) cls.push(`gs-btn--${opts.variant}`);
  if (opts.block) cls.push('gs-btn--block');
  // A rarity/accent border (e.g. travel routes) overrides the class default and its hover tint.
  const style = opts.borderColor ? ` style="--btn-border:${opts.borderColor};--btn-hover:${opts.borderColor};"` : '';
  return `<button class="${cls.join(' ')}" data-action='${JSON.stringify(action)}'${opts.disabled ? ' disabled' : ''}${style}>${label}</button>`;
};

export function header(): string {
  const r = state.run;
  const ch = getCharacter(r.loadout.characterId);
  const who = ch ? ` <span style="font-size:13px;color:${ch.style.cap};">· ${ch.name}</span>` : '';
  // Star Tour (GS-star-tour) is a records chase, NOT the voyage economy: it has no credits, fuel,
  // handicap, stop count or distance to track. Show the course + the running to-par instead of the
  // voyage stat rail, so a stroke-play recap never surfaces a meaningless "Credits 0 · Fuel …" line.
  if (r.formatId === STROKEPLAY_FORMAT) {
    const spec = staticCourseSpec(r.staticCourseId ?? '');
    const played = state.stopPlayed ?? [];
    const totals = playTotals(played.map((p) => p.record));
    const thru = played.length;
    return `
      <header style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-left:4px solid ${rarCol(state.course.rarity)};border-radius:3px;padding:2px 0 10px 11px;margin-bottom:12px;border-bottom:1px solid var(--gs-line-2);">
        <h1 style="margin:0;font-size:22px;">✦ Star Tour</h1>${who}
        <span style="margin-left:auto;font-size:13px;color:var(--gs-dim);">
          ${spec?.name ?? 'Course'} · <b style="color:${toParColour(totals.toPar)};">${formatToPar(totals.toPar)}</b> thru <b style="color:var(--gs-ink);">${thru}</b>/${state.course.holes.length}
        </span>
      </header>`;
  }
  return `
    <header style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-left:4px solid ${rarCol(state.course.rarity)};border-radius:3px;padding:2px 0 10px 11px;margin-bottom:12px;border-bottom:1px solid var(--gs-line-2);">
      <h1 style="margin:0;font-size:22px;">⛳ Golf Stars</h1>${who}
      <span style="margin-left:auto;font-size:13px;color:var(--gs-dim);">
        Stop <b style="color:var(--gs-ink);">${r.stopIndex + 1}</b> · Dist <b style="color:var(--gs-ink);">${r.distanceFromStart}</b> · Credits <b style="color:var(--gs-warn);">${r.credits}</b> · ${fuelGaugeHTML(r.fuel, tankCapacity(r), { mini: true })}
        · Hcp <b style="color:var(--gs-ink);">${r.loadout.handicap}</b> · Best dist ${state.bestDistance} · Best SF ${state.bestStableford}
      </span>
    </header>`;
}

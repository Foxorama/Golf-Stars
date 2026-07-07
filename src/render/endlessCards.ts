import { getCharacter } from '../sim/rpg/characters';
import { golferSVG } from './golferCards';
import type { BagTier } from '../sim/rpg/bag';
import {
  CLUB_SET_DIFFICULTIES,
  clubSetOf,
  formatToPar,
  toParColour,
  recordRange,
  bestEndlessRecord,
  endlessRecordsByDepth,
  endlessSetGateOverPar,
  endlessSetLabel,
  ENDLESS_SET_HOLES,
  ENDLESS_MILESTONES,
  type EndlessRunRecord,
} from '../sim/rpg/endless';

// The Unending Universe's DEPTH presentation (GS-set-survival): a compact progress card — sets cleared,
// this set's running total vs its allowance, and the next reward — plus the personal "last runs"
// leaderboard grouped by the STARTING CLUB SET (green/blue/purple/orange), ranked purely on how far you
// got. There is no run-total score to chase. All pure string/SVG builders — they take their data as
// arguments and read no module state — so they live out of the app.ts god-file (CLAUDE.md). Every
// helper here is Unending-Universe only; the Voyage never calls them, so its screens are untouched.

/** A small coloured pill naming a starting club set / difficulty (its rarity colour + label). */
export function clubSetChip(tier: BagTier, opts: { small?: boolean } = {}): string {
  const d = clubSetOf(tier);
  const pad = opts.small ? '1px 7px' : '2px 9px';
  const fs = opts.small ? '10.5px' : '11.5px';
  return `<span style="display:inline-flex;align-items:center;gap:5px;border:1px solid ${d.col};color:${d.col};border-radius:999px;padding:${pad};font-size:${fs};font-weight:700;white-space:nowrap;">
    <span style="width:8px;height:8px;border-radius:50%;background:${d.col};"></span>${d.label}</span>`;
}

/** One big stat cell (a label over a large value) for the score card. */
function stat(label: string, value: string, col = 'var(--gs-ink)', sub = ''): string {
  return `<div style="text-align:center;min-width:0;flex:1 1 0;">
    <div style="font-size:26px;font-weight:800;line-height:1;color:${col};">${value}</div>
    <div style="font-size:9.5px;opacity:.55;letter-spacing:.08em;margin-top:4px;">${label}</div>
    ${sub ? `<div style="font-size:10px;opacity:.7;margin-top:2px;">${sub}</div>` : ''}
  </div>`;
}

/** Data for the progress card. `stopIndex` is the CURRENT set's 0-based index (holesCleared / 4);
 *  `live` is the in-progress set (its running to-par + holes played so far), absent on a static card. */
export interface EndlessCardData {
  holesCleared: number;
  stopIndex: number;
  tier: BagTier;
  live?: { setToPar: number; thru: number };
}

/**
 * The Unending-Universe progress card (GS-set-survival): SETS cleared (the depth that IS the score),
 * this set's TARGET allowance, and — mid-set — THIS SET's running four-hole to-par vs that target.
 * No run-total gross/net: how far you get is the whole game. Mobile-first, a capped-width flex row of
 * big legible numbers. `opts.next` appends the next-reward line; `opts.title` overrides the heading.
 */
export function endlessScoreCard(data: EndlessCardData, opts: { title?: string; next?: boolean } = {}): string {
  const { holesCleared, stopIndex, tier, live } = data;
  const sets = Math.floor(holesCleared / ENDLESS_SET_HOLES);
  const target = endlessSetGateOverPar(stopIndex);
  const title = opts.title ?? 'Your run';
  const nextM = ENDLESS_MILESTONES.find((m) => m.holes > holesCleared);
  const nextLine = opts.next
    ? `<div style="margin-top:9px;padding-top:8px;border-top:1px solid var(--gs-line-2);font-size:11.5px;opacity:.82;display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;">
         <span>⛳ This set: <b>${endlessSetLabel(target)} or better</b> over 4 holes</span>
         ${nextM ? `<span>🌌 Next reward at hole <b>${nextM.holes}</b></span>` : '<span>🌌 Beyond every milestone</span>'}
       </div>`
    : '';
  const liveCell = live
    ? stat('THIS SET', formatToPar(live.setToPar), toParColour(live.setToPar), `thru ${live.thru}/4`)
    : '';
  return `
    <div style="max-width:460px;border:1px solid var(--gs-line);border-radius:12px;background:#0d1016;padding:12px 14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
        <span style="font-size:10.5px;letter-spacing:.1em;opacity:.6;">${title.toUpperCase()}</span>
        ${clubSetChip(tier, { small: true })}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${stat('SETS', String(sets), '#4fe08a', `${holesCleared} holes`)}
        ${stat('TARGET', endlessSetLabel(target), toParColour(target), 'or better')}
        ${liveCell}
      </div>
      ${nextLine}
    </div>`;
}

/** Per-difficulty best-holes summary strip — the four categories, each showing your furthest run. */
function difficultyStrip(records: readonly EndlessRunRecord[], currentTier?: BagTier): string {
  const cells = CLUB_SET_DIFFICULTIES.map((d) => {
    const best = records.filter((r) => r.tier === d.tier).reduce((m, r) => Math.max(m, r.holes), 0);
    const isCur = d.tier === currentTier;
    return `<div style="flex:1 1 0;min-width:64px;text-align:center;border:1px solid ${isCur ? d.col : 'var(--gs-line-2)'};${
      isCur ? `background:${d.col}14;` : ''
    }border-radius:9px;padding:6px 4px;">
      <div style="display:flex;align-items:center;justify-content:center;gap:5px;">
        <span style="width:8px;height:8px;border-radius:50%;background:${d.col};"></span>
        <span style="font-size:10px;font-weight:700;color:${d.col};white-space:nowrap;">${d.label}</span>
      </div>
      <div style="font-size:18px;font-weight:800;margin-top:3px;color:${best ? 'var(--gs-ink)' : 'var(--gs-dim)'};">${best || '—'}</div>
      <div style="font-size:8.5px;opacity:.5;letter-spacing:.05em;">holes</div>
    </div>`;
  }).join('');
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">${cells}</div>`;
}

/**
 * The personal LAST-RUNS leaderboard (GS-set-survival): a per-difficulty best-holes strip over the last
 * `opts.limit` finished runs, newest first — each row the golfer (avatar + name), the starting club set
 * (colour), and how far it got (holes reached + sets cleared). The furthest-reaching run wears a 🏅.
 * Mobile-first: capped width, compact rows. Empty history shows an inviting placeholder.
 * `opts.currentTier` highlights the category the player is about to play.
 */
export function endlessRecordsBoard(
  records: readonly EndlessRunRecord[],
  opts: { limit?: number; currentTier?: BagTier; title?: string } = {},
): string {
  const limit = opts.limit ?? 10;
  const title = opts.title ?? `Your last ${limit} runs`;
  // GS-warp: the board ranks the last runs by the FURTHEST HOLE REACHED (score is flavour), and
  // each row carries its hole RANGE — a warped run reads "50–67", a solo one "1–49", so how far
  // AND from where are both honest at a glance.
  const shown = endlessRecordsByDepth(records, limit);
  const best = bestEndlessRecord(records);
  const head = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px;">
      <span style="font-size:13px;font-weight:800;letter-spacing:.02em;">🏆 ${title}</span>
      <span style="font-size:10.5px;opacity:.55;">furthest hole first</span>
    </div>`;
  if (shown.length === 0) {
    return `<div style="max-width:460px;margin-top:14px;padding:14px;border:1px dashed var(--gs-line-2);border-radius:12px;background:#0d1016;">
      ${head}
      ${difficultyStrip(records, opts.currentTier)}
      <p style="font-size:12.5px;opacity:.65;margin:2px 0 0;text-align:center;">No runs yet — tee off and your scores will fill this board. Reach further to climb it.</p>
    </div>`;
  }
  const rows = shown
    .map((r, i) => {
      const ch = getCharacter(r.characterId);
      const d = clubSetOf(r.tier);
      const isBest = best === r;
      const medal = isBest ? '🏅' : `${i + 1}`;
      return `<div style="display:flex;align-items:center;gap:9px;padding:5px 8px;border-radius:8px;${
        isBest ? 'background:#1a2a22;border:1px solid var(--gs-accent);' : 'border:1px solid transparent;'
      }">
        <span style="width:18px;text-align:center;font-size:12px;opacity:.75;">${medal}</span>
        <span style="line-height:0;flex:0 0 auto;">${ch ? golferSVG(ch.style, 26, 32) : ''}</span>
        <span style="flex:1 1 auto;min-width:0;">
          <span style="font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${ch?.shortName ?? 'Golfer'}${
            r.ascension > 0 ? ` <span style="color:#ffce54;font-size:10px;">A${r.ascension}</span>` : ''
          }</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:9.5px;color:${d.col};">
            <span style="width:6px;height:6px;border-radius:50%;background:${d.col};"></span>${d.label}</span>
        </span>
        <span style="text-align:right;flex:0 0 auto;">
          <span style="font-size:16px;font-weight:800;color:#4fe08a;">${r.holes}</span>
          <span style="font-size:10px;opacity:.5;"> holes</span>
          <div style="font-size:10px;opacity:.75;white-space:nowrap;">${(r.startHole ?? 1) > 1 ? '⚡ ' : ''}holes ${recordRange(r)}</div>
          <div style="font-size:10.5px;opacity:.6;">${Math.floor(r.holes / ENDLESS_SET_HOLES)} sets</div>
        </span>
      </div>`;
    })
    .join('');
  return `<div style="max-width:460px;margin-top:14px;padding:12px;border:1px solid var(--gs-line);border-radius:12px;background:#0d1016;">
    ${head}
    ${difficultyStrip(records, opts.currentTier)}
    <div style="display:flex;flex-direction:column;gap:2px;">${rows}</div>
  </div>`;
}

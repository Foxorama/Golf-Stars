/**
 * The Asgard interlude screens (GS-asgard): the Himinbjörg reveal map (crossed into by earning an
 * eagle-or-better on Rainbow Road) and the win/lose result of the nine-hole stroke-play tournament
 * against the Warriors Three. Pure HTML-string builders — they read the live `state` from ctx and
 * dispatch through `data-action` wiring in app.ts, like every other screen module (GS-app-split).
 */

import { state, btn } from './ctx';
import { asgardBridgeHTML } from '../render/starmap';
import { WARRIORS_THREE } from '../sim/rpg/golfers';
import { warriorsThreeThru } from '../sim/rpg/competition';
import type { PlayedHole } from '../sim/round';

const GOLD = '#ffd97a';

/** A short signed to-par tag (E / −3 / +2). */
function toPar(strokes: number, par: number): string {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;
}

/** A stroke-play row on an Asgard board — the player and each Warrior with a cumulative gross total. */
interface AsgardRow {
  name: string;
  total: number;
  you: boolean;
}

/** The shared Asgard leaderboard body (GS-asgard): rows sorted lowest-gross-first (ties to the player),
 *  medalled, with the player's row highlighted and a to-par tag off `par` (the par of the holes counted
 *  so far — the full nine on the result, the holes-played prefix on the running between-hole board). */
function asgardBoardHTML(rows: AsgardRow[], par: number): string {
  return [...rows]
    .sort((a, b) => a.total - b.total || (a.you ? -1 : 1))
    .map((r, i) => {
      const place = i + 1;
      const hi = r.you ? `background:rgba(255,210,110,0.16);` : '';
      const nameCol = r.you ? GOLD : 'var(--gs-ink)';
      const medal = place === 1 ? '🥇' : place === 2 ? '🥈' : place === 3 ? '🥉' : `${place}.`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;${hi}">
        <span style="width:22px;text-align:center;">${medal}</span>
        <b style="flex:1;color:${nameCol};font-size:14px;">${r.name}</b>
        <span style="font-variant-numeric:tabular-nums;font-weight:700;color:${nameCol};">${r.total}</span>
        <span style="width:34px;text-align:right;font-size:12px;color:var(--gs-dim);font-variant-numeric:tabular-nums;">${toPar(r.total, par)}</span>
      </div>`;
    })
    .join('');
}

/**
 * The running Warriors-Three stroke-play standings shown BETWEEN holes of the Asgard tournament
 * (GS-asgard): the player's real cumulative gross vs each warrior's ghost gross THRU the holes played so
 * far, lowest total leading. This is the stroke-play twin of the ordinary 20-golfer Stableford field —
 * on the Golden Realm the between-hole screen must read as ITS OWN event, never the normal arc board.
 */
export function asgardLiveBoardHTML(playedSoFar: PlayedHole[], pars: readonly number[], seed: string): string {
  const thru = playedSoFar.length;
  const playerTotal = playedSoFar.reduce((s, p) => s + p.record.strokes, 0);
  const parThru = pars.slice(0, thru).reduce((a, b) => a + b, 0);
  const rows: AsgardRow[] = [
    { name: 'You', total: playerTotal, you: true },
    ...warriorsThreeThru(seed, pars, thru).map((f) => ({ name: f.name, total: f.total, you: false })),
  ];
  const sorted = [...rows].sort((a, b) => a.total - b.total || (a.you ? -1 : 1));
  const place = sorted.findIndex((r) => r.you) + 1;
  const ord = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`;
  const placeCol = place === 1 ? '#5fd45a' : place <= 2 ? '#ffce54' : '#ff6b6b';
  return `
    <p style="font-size:13px;margin:.4em 0 .5em;">You're <b style="color:${placeCol};">${ord}</b> of ${rows.length} · ${thru} hole${thru === 1 ? '' : 's'} in · stroke play.</p>
    <div class="gs-glass" style="padding:8px;border-radius:12px;border:1px solid rgba(255,210,110,0.3);">
      <div style="display:flex;align-items:center;padding:2px 10px 6px;font-size:10.5px;letter-spacing:.08em;color:var(--gs-dim);text-transform:uppercase;">
        <span style="flex:1;">⚔ Warriors Three · thru ${thru}</span><span>Gross</span>
      </div>
      ${asgardBoardHTML(rows, parThru)}
    </div>`;
}

/**
 * The Himinbjörg reveal (GS-asgard): shown the instant an eagle-or-better lands on Rainbow Road. The
 * Bifröst opens; a card names the Warriors Three and the format; the CTA crosses into the tournament.
 */
export function asgardMapScreen(): string {
  const seed = `${state.run.seed}:asgard:${state.run.stopIndex}`;
  const warriors = WARRIORS_THREE.map((w) => w.name.split(' ')[0]).join(', ');
  return `
    <div style="max-width:520px;margin:0 auto;text-align:center;">
      <div style="font-size:12px;letter-spacing:3px;color:${GOLD};opacity:0.85;font-weight:700;">A GLORIOUS STRIKE TEARS THE SKY</div>
      <h1 style="margin:6px 0 2px;font-size:26px;color:${GOLD};">The Bifröst Opens</h1>
      <p style="margin:0 0 8px;font-size:14px;color:var(--gs-dim);line-height:1.5;">
        Your shot blazed so bright the gods took notice. Heimdall lowers the rainbow bridge — beyond it
        waits <b style="color:${GOLD};">Asgard</b>, the Golden Realm, and a challenge from its guardians.
      </p>
      ${asgardBridgeHTML({ seed })}
      <div class="gs-glass" style="margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,210,110,0.35);text-align:left;">
        <div style="font-size:13px;font-weight:800;color:${GOLD};margin-bottom:4px;">⚔ The Warriors Three</div>
        <div style="font-size:13px;color:var(--gs-ink);line-height:1.5;">
          ${warriors} await on the Golden Realm. It is <b>nine holes of stroke play</b> — the lowest total
          score wins. Play the Bifröst well and glory (and a mythic prize) is yours.
        </div>
      </div>
      ${btn('⚡ Cross the Bifröst to Asgard', { type: 'crossBifrost' }, { variant: 'primary', block: true })}
    </div>`;
}

/**
 * The tournament result (GS-asgard): the final leaderboard (you + the three warriors, lowest first),
 * the prizes on a win (Thor's Hammer cosmetic + Odin's Favour perk) or the consolation on a loss, and
 * the note that — win or lose — the Rainbow Ball is spent. The CTA returns to the suspended journey.
 */
export function asgardResultScreen(): string {
  const o = state.asgardOutcome;
  if (!o) return `<div style="text-align:center;padding:40px;">${btn('Return to your journey', { type: 'leaveAsgard' }, { variant: 'primary' })}</div>`;

  const board = asgardBoardHTML(
    [
      { name: 'You', total: o.playerTotal, you: true },
      ...o.field.map((f) => ({ name: f.name, total: f.total, you: false })),
    ],
    o.par,
  );

  const prizes = o.won
    ? `<div class="gs-glass" style="margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid rgba(89,182,255,0.4);text-align:left;">
         <div style="font-size:13px;font-weight:800;color:#8fd0ff;margin-bottom:6px;">🔨 Spoils of Victory</div>
         <div style="font-size:13px;color:var(--gs-ink);line-height:1.6;">
           <b style="color:${GOLD};">Thor's Hammer</b> is yours — a mythic driver skin. Equip it in the
           <b>Clubhouse wardrobe</b> to swing it in play (and see it lean by the fireplace).<br>
           <b style="color:#8fd0ff;">Odin's Favour</b> blesses your bag for the rest of this run — longer
           drives and tighter dispersion.
         </div>
       </div>`
    : `<div class="gs-glass" style="margin:12px 0;padding:14px 16px;border-radius:12px;border:1px solid var(--gs-line-2);text-align:left;">
         <div style="font-size:13px;color:var(--gs-dim);line-height:1.6;">
           The Warriors Three out-scored you this time. The gods send you home with their respect —
           <b>better luck next time…</b>
         </div>
       </div>`;

  const header = o.won
    ? `<div style="font-size:12px;letter-spacing:3px;color:${GOLD};font-weight:700;">GLORY ON THE GOLDEN REALM</div>
       <h1 style="margin:6px 0 2px;font-size:28px;color:${GOLD};">Victory on Asgard!</h1>`
    : `<div style="font-size:12px;letter-spacing:3px;color:var(--gs-dim);font-weight:700;">THE GOLDEN REALM FADES</div>
       <h1 style="margin:6px 0 2px;font-size:26px;color:var(--gs-ink);">Better luck next time…</h1>`;

  return `
    <div style="max-width:460px;margin:0 auto;text-align:center;">
      ${header}
      <p style="margin:2px 0 12px;font-size:13px;color:var(--gs-dim);">Nine holes · stroke play · lowest total wins</p>
      <div class="gs-glass" style="padding:8px;border-radius:12px;border:1px solid rgba(255,210,110,0.3);">${board}</div>
      ${prizes}
      <p style="font-size:12px;color:var(--gs-dim);margin:8px 0 12px;">The Rainbow Ball is spent — your voyage returns to its true worlds.</p>
      ${btn('Return to your journey', { type: 'leaveAsgard' }, { variant: 'primary', block: true })}
    </div>`;
}

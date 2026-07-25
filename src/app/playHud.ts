/**
 * The full-bleed play screen's HUD text — the floating top info chip (`mapTopInfo`) and every
 * label/read it composes: the lie chip, wind read, hole shape/width tags, the running zone score,
 * the momentum pips, and the manual-putt break-read row. All pure `() => string` renders off the
 * live state; the play screen's mutable view state (club/aim/power, map-nav) stays in app.ts.
 */

import { state } from './ctx';
import { liveLeaderChip, matchHud, teamDuel, teamFormatLabel, teamPartnerChar } from './duelHud';
import { storySigilMatchChip } from './storySigilHud';
import { bearing, dist, type Hole } from '../sim/course/contract';
import { lieInfo, roughLieOf } from '../sim/shot';
import { playTotals } from '../sim/score';
import { currentBoss, effectiveCut, holeGateArmed } from '../sim/rpg/run';
import { endlessSetGateOverPar, endlessSetLabel, endlessSetToPar, formatToPar, toParColour } from '../sim/rpg/endless';
import { isTeamDuelBoss, STROKEPLAY_FORMAT } from '../sim/rpg/formats';
import { shotView } from '../sim/rpg/play';

/** Signed yardage as plain words (+ = right of the line). */
const yds = (y: number): string => `${Math.abs(y).toFixed(1)}yd ${y >= 0 ? 'right' : 'left'}`;

/** How the slope reads in one phrase. GS-green-contour: a double-breaker is called out — its NET
 *  break can be tiny while the line still S-curves, so "breaks —" alone would read as a flat putt
 *  and lie about the picture. */
function breakText(breakYd: number, dbl: boolean): string {
  if (dbl) return `double-breaks${Math.abs(breakYd) < 0.2 ? '' : ` · nets ${yds(breakYd)}`}`;
  return Math.abs(breakYd) < 0.2 ? 'flat' : `breaks ${yds(breakYd)}`;
}

/** The aim readout inside the adjuster row — split out so an aim nudge can update JUST this span
 *  in place (the ◄/► buttons keep their listeners; see puttAimRefresh). It sits in the slot the club
 *  name occupies while aiming (GS-hud-frame), so it must fit one line between the ◄/► buttons: it
 *  carries the AIM alone and the slope read moved to the row below (which is static — the break
 *  doesn't change when you re-aim, only your line through it does). */
export function puttAimLabel(breakYd: number, aim: number, dbl = false): string {
  void breakYd;
  void dbl;
  return `Aim <b>${Math.abs(aim) < 0.2 ? 'straight' : yds(aim)}</b>`;
}

/** The slope's read, for the putt panel's read row. Static for the putt — the break is the green's,
 *  not the player's line — so it never needs the surgical aim refresh. */
export function puttBreakLine(breakYd: number, dbl = false): string {
  return `Slope <b>${breakText(breakYd, dbl)}</b>`;
}

/**
 * The putt screen's ADJUSTER row (GS-greens-3 · GS-hud-frame): the slope's break + ◄/► aim controls
 * (or the caddy's read), built in the SAME `.gs-clubrow` shape the club cycler uses while aiming — so
 * the two most-tapped buttons on the play screen stay in the same place all the way round the hole.
 * `breakYd`/`aim` are signed (+ = right of the line); the player aims to cancel the break.
 * A green-reading caddy (Mystic Mole) has already found the line, so its buttons render disabled
 * rather than disappearing.
 */
export function puttAimRow(breakYd: number, aim: number, reads: boolean, dbl = false, fringe = false): string {
  const toggle = fringe
    ? `<button class="gs-btn gs-mini" data-putt-toggle="0" title="Chip instead of putting">🏌</button>`
    : '';
  if (reads) {
    return `<div class="gs-clubrow">
        <button class="gs-btn" disabled aria-hidden="true">◄</button>
        <span class="gs-clubname gs-clubname--read" id="puttaimlabel">🐀 Mole reads <b>${Math.abs(aim) < 0.2 ? 'straight' : yds(aim)}</b></span>
        <button class="gs-btn" disabled aria-hidden="true">►</button>
        ${toggle}
      </div>`;
  }
  return `<div class="gs-clubrow">
      <button class="gs-btn" data-putt-aim="-1" title="Aim left">◄</button>
      <span class="gs-clubname gs-clubname--read" id="puttaimlabel">${puttAimLabel(breakYd, aim, dbl)}</span>
      <button class="gs-btn" data-putt-aim="1" title="Aim right">►</button>
      ${toggle}
    </div>`;
}

/** Plain-language wind read relative to the hole's play direction (up = toward the green). */
function windDescription(hole: Hole): string {
  const w = hole.wind;
  if (!w || w.spd < 1) return '🍃 Calm';
  const holeBearing = bearing(hole.tee, hole.green);
  const delta = ((w.dir - holeBearing + 540) % 360) - 180; // −180..180; 0 = tailwind (toward green)
  const along = Math.cos((delta * Math.PI) / 180);
  const kind = along > 0.4 ? 'tailwind' : along < -0.4 ? 'headwind' : 'crosswind';
  const arrow = `<span style="display:inline-block;transform:rotate(${delta.toFixed(0)}deg);">⬆</span>`;
  return `🌬 ${Math.round(w.spd)} mph ${kind} ${arrow}`;
}

/** The current lie as a prominent, colour-coded chip with its effect on the NEXT shot — so the
 *  player always knows what they're playing from and how it bites (carry penalty + spray), shown
 *  right where the shot decision is made. This is the lie-awareness the per-shot popup used to
 *  carry, moved to the moment it actually matters. */
function lieChip(lie: string): string {
  const info = lieInfo(lie);
  const label = info.label ?? lie;
  const carryPen =
    info.carryMult < 0.99 ? `−${Math.round((1 - info.carryMult) * 100)}% carry`
    : info.carryMult > 1.01 ? `+${Math.round((info.carryMult - 1) * 100)}% carry` // hot/fast lies fly long
    : '';
  const spray = info.dispersionMult >= 1.55 ? 'very wild' : info.dispersionMult >= 1.25 ? 'wild' : info.dispersionMult > 1.05 ? 'loose' : '';
  const eff = [carryPen, spray].filter(Boolean).join(' · ');
  const trouble = !!info.penalty || info.carryMult <= 0.6 || info.dispersionMult >= 1.55;
  const caution = info.carryMult < 0.95 || info.dispersionMult > 1.15;
  const col = trouble ? '#ff6b6b' : caution ? '#ffc454' : '#5fd45a';
  const dot = trouble ? '🔴' : caution ? '🟠' : '🟢';
  return `<span class="gs-liechip" style="border-color:${col};color:${col};">${dot} <b style="color:var(--gs-ink);">${label}</b>${eff ? ` <span style="opacity:.85;">${eff}</span>` : ''}</span>`;
}

/** Friendly name for a penalty surface in Sam's hazard read (the carry-to-clear callout). */
export function hazardLabel(kind: string): string {
  if (kind === 'water') return 'the water';
  if (kind === 'lava' || kind === 'lavariver') return 'the lava';
  if (kind === 'void' || kind === 'voidrough') return 'the void';
  if (kind === 'cetusdeep') return 'the star-ocean';
  if (kind === 'frozenpond') return 'the pond';
  if (kind === 'creek') return 'the creek';
  return 'the hazard';
}

/** A momentum rail: one pip per hole in the stop, coloured by the score already made (eagle gold →
 *  blow-up red), the current hole ringed, upcoming holes dim — so the run's shape reads at a glance. */
function holePips(): string {
  const total = state.course.holes.length;
  const done = state.stopPlayed ?? [];
  const cur = state.play?.holeIndex ?? done.length;
  const pips = Array.from({ length: total }, (_, i) => {
    if (i < done.length) {
      const r = done[i]!.record;
      const rel = r.strokes - r.par;
      const col = done[i]!.pickedUp
        ? '#b3402f'
        : rel <= -2 ? '#ffd54a' : rel === -1 ? '#5fd45a' : rel === 0 ? '#9fd8e6' : rel === 1 ? '#ffc454' : '#ff6b6b';
      return `<span class="gs-pip" style="background:${col};" title="hole ${i + 1}: ${r.strokes} (par ${r.par})"></span>`;
    }
    return `<span class="gs-pip${i === cur ? ' gs-pip--cur' : ''}"></span>`;
  }).join('');
  return `<div class="gs-pips" aria-hidden="true">${pips}</div>`;
}

/** Running stop score vs the cut-to-beat, coloured by how the run is tracking:
 *  🟢 beating the cut · 🟠 within striking distance · 🔴 well short. */
function zoneScoreChip(): string {
  // Star Tour (GS-star-tour): a stroke-play round shows the RUNNING SCORE — total to-par + gross over
  // the holes finished so far — not a Stableford-vs-cut points chip (there's no cut to make, you're
  // chasing a low number). Coloured under-green → over-red like the record boards.
  if (state.run.formatId === STROKEPLAY_FORMAT) {
    const done = state.stopPlayed ?? [];
    const totals = playTotals(done.map((p) => p.record));
    return `<span class="gs-shotscore" style="color:${toParColour(totals.toPar)};" title="running score — total strokes vs par through ${done.length} holes">🏌 ${formatToPar(totals.toPar)} · ${totals.gross} thru ${done.length}</span>`;
  }
  // The Unending Universe (GS-set-survival): the number that matters is THIS SET's running four-hole
  // total vs its allowance — show how far under/over you are through the holes played so far, and the
  // target the whole set has to hit. A blow-up hole never ends the run, so this is a budget, not a
  // death clock: it goes amber → red as the set total pushes past the allowance with holes still to go.
  if (holeGateArmed(state.run)) {
    const done = state.stopPlayed ?? [];
    const setSoFar = endlessSetToPar(done); // completed holes of this set (current hole not yet scored)
    const target = endlessSetGateOverPar(state.run.stopIndex);
    const room = target - setSoFar; // over-par budget left for the rest of the set (current hole included)
    const col = room >= 3 ? '#5fd45a' : room >= 0 ? '#ffc454' : '#ff6b6b';
    const soFar = setSoFar > 0 ? `+${setSoFar}` : setSoFar === 0 ? 'E' : `−${-setSoFar}`;
    return `<span class="gs-shotscore" style="color:${col};" title="this set of 4: you're ${soFar} through ${done.length}, needing ${endlessSetLabel(target)} or better for the whole set — a blow-up won't end the run, the four-hole total is what counts">🎯 ${soFar} · need ${endlessSetLabel(target)}</span>`;
  }
  const done = state.stopPlayed ?? [];
  const sf = playTotals(done.map((p) => p.record)).stableford;
  const cut = effectiveCut(state.run, state.course.holes.length);
  const gap = cut - sf;
  const col = gap <= 0 ? '#5fd45a' : gap <= Math.ceil(cut / 2) ? '#ffc454' : '#ff6b6b';
  return `<span class="gs-shotscore" style="color:${col};" title="stop Stableford vs the cut to make">${sf}/${cut} pts</span>`;
}

/** A short, fun label for a notable hole archetype (GS-shapes-2); '' for a plain straight/dogleg. */
function shapeLabel(shapeId?: string): string {
  if (!shapeId) return '';
  if (shapeId === 'drivable-par-4') return '🏌 Drivable';
  if (shapeId.includes('hairpin')) return '↩ Hairpin';
  if (shapeId.includes('cape')) return '🌊 Cape';
  if (shapeId.includes('double')) return '〰 Double dogleg';
  if (shapeId.startsWith('short-3')) return 'Short';
  if (shapeId.startsWith('long-3')) return 'Long';
  if (shapeId.startsWith('long-')) return 'Long';
  if (shapeId.startsWith('three-shot')) return '3-shot';
  if (shapeId.startsWith('reachable')) return 'Reachable';
  return '';
}

/** A short label for a notable fairway-width archetype (GS-fairway-width); '' for the plain ones
 *  (classic/wander read off the map; 'island' already has the lost-rough warning). */
function widthLabel(widthId?: string): string {
  if (widthId === 'chute') return '🌲 Tight drive';
  if (widthId === 'neck') return '🎯 Tight approach';
  if (widthId === 'hourglass') return '⏳ Pinched waist';
  if (widthId === 'thin') return '📏 Ribbon fairway';
  if (widthId === 'broad') return '🌾 Broad fairway';
  return '';
}

/** The floating top-left info chip for the full-bleed hole screen (GS-fullmap): hole #/total, par +
 *  length, the live distance, the running zone score on line 1; a thin lie · wind sub-line + the
 *  momentum pips below. Conditions are pared to what matters (an armed lost-rough warning + scramble);
 *  the verbose biome string moved off the play HUD. Translucent, non-intrusive, pass-through.
 *
 *  GS-hud-frame: the distance slot is min-width'd in CSS so the stats row wraps IDENTICALLY between
 *  the aim and watch states — the bar used to visibly reflow the instant a shot was struck, because
 *  "…watching…" is far wider than "347y". `opts.lie` overrides the live lie for the same reason plus
 *  one better: while the ball is in the air `play.lie` is ALREADY the lie it will finish in, so the
 *  bar was quietly spoiling the result before the ball landed. The watch state passes the lie the
 *  shot was played FROM. */
export function mapTopInfo(
  v: ReturnType<typeof shotView>,
  opts: { shotNo: number; distLabel: string; lie?: string },
): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  // Only the decision-relevant warning survives onto the play HUD (the full conditions list lives on
  // the zone splash): the void's armed lost-rough, which turns an offline miss into a lost ball.
  const lostRough = lieInfo(roughLieOf(play.hole)).penalty ? ' · <span style="color:var(--gs-warn);">🕳 lost rough</span>' : '';
  const boss = currentBoss(state.run);
  // Team duel (GS-team-duel): when YOU carry the partner, show them + the format on the HUD.
  const duel = isTeamDuelBoss(boss) ? teamDuel() : undefined;
  let scrambleLine = '';
  if (duel && duel.partnerSide === 'player') {
    const partner = teamPartnerChar(duel);
    if (partner) {
      const tail =
        duel.format === 'scramble'
          ? play.partnerKept
            ? ' · kept ✓'
            : play.shots.length
            ? ' · yours held'
            : ''
          : ' · reveal at the flag'; // best-ball: their parallel ball stays hidden until the hole ends
      scrambleLine = `<div class="gs-sub" style="color:${partner.style.cap};">🤝 <b>${partner.name}</b> · ${teamFormatLabel(duel.format)}${tail}</div>`;
    }
  }
  return `
    <div class="gs-hud gs-hud-top gs-glass">
      <div class="gs-stats">
        <span>⛳ <b>${play.holeIndex + 1}/${state.course.holes.length}</b></span>
        <span>Par <b>${play.hole.par}</b>·${len}y</span>
        ${shapeLabel(play.hole.shapeId) ? `<span style="color:var(--gs-info);">${shapeLabel(play.hole.shapeId)}</span>` : ''}
        ${widthLabel(play.hole.widthId) ? `<span style="color:var(--gs-info);">${widthLabel(play.hole.widthId)}</span>` : ''}
        <span class="gs-hud-dist">${opts.distLabel}</span>
      </div>
      <div class="gs-stats gs-stats--score">
        ${zoneScoreChip()}
        ${liveLeaderChip()}
      </div>
      <div class="gs-sub">${lieChip(opts.lie ?? v.lie)} ${windDescription(play.hole)}${lostRough}</div>
      ${scrambleLine}
      ${state.match ? `<div style="margin-top:5px;">${matchHud()}</div>` : ''}
      ${!state.match && (state.run.storyTournament || state.run.storyQualifier) ? (() => { const chip = storySigilMatchChip(); return chip ? `<div style="margin-top:5px;">${chip}</div>` : ''; })() : ''}
      ${holePips()}
    </div>`;
}

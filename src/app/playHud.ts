/**
 * The full-bleed play screen's HUD text — the floating top info chip (`mapTopInfo`) and every
 * label/read it composes: the lie chip, wind read, hole shape/width tags, the running zone score,
 * the momentum pips, and the manual-putt break-read row. All pure `() => string` renders off the
 * live state; the play screen's mutable view state (club/aim/power, map-nav) stays in app.ts.
 */

import { state } from './ctx';
import { caddyId } from './helpers';
import { liveLeaderChip, matchHud, teamDuel, teamFormatLabel, teamPartnerChar } from './duelHud';
import { CADDY_LABEL, hasCaddyArt } from '../render/caddyArt';
import { windCompassSVG } from '../render/windCompass';
import { COURSE_EFFECTS, type CourseEffectId } from '../sim/rpg/effects';
import { currentEffect } from './helpers';
import { caddyReadsGreen } from '../sim/rpg/storyCaddies';
import { heraldShortName } from '../sim/rpg/storyHeraldCrew';
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
 * WHO found the line, for the read row (GS-story-caddy-read). A green-reading CADDY is named — the Mystic
 * Mole on a Voyage run, the Coil's Whisperer on a Herald Story round — and anything else that reads for you
 * (the Seer's Circlet, Penelope's reward putter) speaks as the line itself, because no caddy did it.
 *
 * The row used to say "🐀 Mole reads" whatever the source, so a Coil agent on the bag — or a hat — was
 * credited to a mole who wasn't on the course. The reader is PROBED (`caddyReadsGreen`) off the caddy's own
 * loadout fold, never a list of ids, and shortened by the same rules the rest of the game speaks them by: a
 * Coil agent's authored `shortName`, a named caddy's badge label reduced to its last word ("Mystic Mole" →
 * Mole, the shipped string). The 🔮 is the shop's own icon for this effect ("Break read for you").
 */
function greenReadReader(): string {
  const id = caddyId();
  if (!caddyReadsGreen(id)) return '🔮 Line';
  const short = heraldShortName(id) ?? (id && hasCaddyArt(id) ? CADDY_LABEL[id].split(' ').pop() : undefined);
  return `🔮 ${short ?? 'Caddy'}`;
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
        <span class="gs-clubname gs-clubname--read" id="puttaimlabel">${greenReadReader()} reads <b>${Math.abs(aim) < 0.2 ? 'straight' : yds(aim)}</b></span>
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

/**
 * The wind as DATA, read relative to a play direction (up = the way you are playing). The compass
 * dial and the screen-reader narration (GS-a11y-announce) both build from this, so the spoken wind
 * and the drawn wind can never disagree. `spd: 0` means calm.
 *
 * `upBearing` defaults to the HOLE's tee→green line, which is what the once-per-hole narration wants
 * (a briefing about the hole). The play HUD passes the SHOT's own bearing instead, because that is
 * both what the map is oriented down (GS-default-aim) and what the sim resolves wind against
 * (`shot.ts playWind` reads head/tail/cross off the SHOT bearing, never the hole's) — so the needle
 * agrees with the physics AND with the picture. Absent ⇒ byte-for-byte the old read.
 */
export function windRead(hole: Hole, upBearing?: number): { spd: number; kind: string; delta: number } {
  const w = hole.wind;
  if (!w || w.spd < 1) return { spd: 0, kind: 'calm', delta: 0 };
  const up = upBearing ?? bearing(hole.tee, hole.green);
  const delta = ((w.dir - up + 540) % 360) - 180; // −180..180; 0 = tailwind (the way you are playing)
  const along = Math.cos((delta * Math.PI) / 180);
  return { spd: w.spd, kind: along > 0.4 ? 'tailwind' : along < -0.4 ? 'headwind' : 'crosswind', delta };
}

/**
 * The compass POD: the dial plus the active sky's badge (GS-hud-compass). The weather effect used to
 * be readable only on the route card you flew in on — here it rides the instrument it belongs to, and
 * its tooltip carries the label so "why is the air like this" is one long-press away.
 */
function windCompass(hole: Hole, upBearing?: number): string {
  const r = windRead(hole, upBearing);
  const eff = currentEffect();
  const info = eff && eff !== 'none' ? COURSE_EFFECTS[eff as CourseEffectId] : undefined;
  const title = r.spd ? `${Math.round(r.spd)} mph ${r.kind}` : 'Calm air';
  return `<div class="gs-hudx__compass" title="${title}${info ? ` · ${info.label}` : ''}">
      ${windCompassSVG(r)}
      ${info ? `<span class="gs-hudx__sky" aria-hidden="true">${info.icon}</span>` : ''}
      <span class="gs-sr-only">${title}${info ? `, ${info.label}` : ''}.</span>
    </div>`;
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
  // The rail encodes each hole's score in COLOUR ALONE, and the wrapper is aria-hidden — so the whole
  // card so far was unavailable to a screen reader (GS-a11y-announce). Keep the pips decorative (they
  // are a glanceable shape, not a table) and carry the same facts as text beside them.
  const spoken = done.length
    ? `Through ${done.length} of ${total}: ` +
      done.map((h, i) => `hole ${i + 1}, ${h.record.strokes} on a par ${h.record.par}`).join('; ') + '.'
    : `Hole 1 of ${total}, nothing played yet.`;
  return `<div class="gs-pips" aria-hidden="true">${pips}</div><span class="gs-sr-only">${spoken}</span>`;
}

/** One instrument pod: a big value over a small all-caps caption. The shape every readout in the
 *  cluster shares (GS-hud-compass), so the bar reads as one instrument rather than a list of chips. */
function pod(value: string, cap: string, opts: { col?: string; title?: string; hero?: boolean } = {}): string {
  return `<div class="gs-hudx__pod${opts.hero ? ' gs-hudx__pod--hero' : ''}"${opts.title ? ` title="${opts.title}"` : ''}>
      <b${opts.col ? ` style="color:${opts.col};"` : ''}>${value}</b>
      <span>${cap}</span>
    </div>`;
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
    return pod(formatToPar(totals.toPar), `${totals.gross} thru ${done.length}`, {
      col: toParColour(totals.toPar),
      title: `running score — total strokes vs par through ${done.length} holes`,
    });
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
    return pod(soFar, `need ${endlessSetLabel(target)}`, {
      col,
      title: `this set of 4: you're ${soFar} through ${done.length}, needing ${endlessSetLabel(target)} or better for the whole set — a blow-up won't end the run, the four-hole total is what counts`,
    });
  }
  const done = state.stopPlayed ?? [];
  const holes = state.course.holes.length;
  const sf = playTotals(done.map((p) => p.record)).stableford;
  const cut = effectiveCut(state.run, holes);
  // Coloured by PACE, not by the raw gap to the cut (GS-hud-compass). The old test was `cut − points`,
  // which on the first tee is the whole cut — so a fresh stop opened on a red zero, and the bigger pod
  // made that read as "you are failing" before a ball had been struck. What the player wants to know is
  // whether they are ON for the cut: compare against the pro-rata target for the holes actually played.
  const paceTarget = (cut * done.length) / Math.max(1, holes);
  const col = !done.length ? 'var(--gs-ink)' : sf >= paceTarget ? '#5fd45a' : sf >= paceTarget - 2 ? '#ffc454' : '#ff6b6b';
  return pod(`${sf}`, `of ${cut} pts`, {
    col,
    title: `stop Stableford vs the cut to make${done.length ? ` — on pace you'd want ${Math.round(paceTarget)} through ${done.length}` : ''}`,
  });
}

/**
 * The floating top info bar for the full-bleed hole screen — an INSTRUMENT CLUSTER (GS-hud-compass).
 *
 * It used to be a stack of up to six rows, and most of them said the same things twice: `⛳ 5/9` and a
 * par-and-length line and a live yardage and a points chip and a placing chip and a lie chip and a
 * wind sentence and two hole descriptors, each wrapping independently. The report: *"we don't need
 * all that duplication."*
 *
 * So it is one row of pods — a big value over a small caption, the shape every readout shares — with
 * the WIND COMPASS anchored at the left and the pods centred in what is left:
 *
 *   ╭────╮      5/9         464        13
 *   │ ↑9 │    PAR 4·450Y   Y TO PIN   OF 20 PTS
 *   ╰────╯       🟢 Tee −25% carry  ·  🏆 1st/20
 *   ▪▪▪▪▫▫▫▫▫
 *
 * What went, and why:
 *  - the WIND SENTENCE → the compass dial, which shows the one thing that matters (which way it
 *    pushes) as a direction rather than as a rotated emoji;
 *  - the hole SHAPE/WIDTH descriptors ("Drivable", "Ribbon fairway") → gone. They are briefing, fixed
 *    for the whole hole, and already read on the tee card; GS-a11y-tight-fit was already dropping
 *    them at large text sizes for exactly this reason. The map draws the shape better than a word.
 *  - par + hole LENGTH → the caption under the hole number, where they belong: both are static
 *    briefing, and the live distance-to-pin is the number you actually club off.
 *
 * `opts.lie` overrides the live lie: while the ball is in the air `play.lie` is ALREADY the lie it
 * will finish in, so the bar was quietly spoiling the result before the ball landed. The watch state
 * passes the lie the shot was played FROM. `opts.dist` is split into value + caption for the same
 * no-reflow reason the old `distLabel` was min-width'd (GS-hud-frame): the pod's own min-width keeps
 * the cluster pixel-identical between aiming and watching.
 */
export function mapTopInfo(
  v: ReturnType<typeof shotView>,
  opts: { dist: { big: string; cap: string }; lie?: string; upBearing?: number },
): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  // Only the decision-relevant warning survives onto the play HUD (the full conditions list lives on
  // the zone splash): the void's armed lost-rough, which turns an offline miss into a lost ball.
  const lostRough = lieInfo(roughLieOf(play.hole)).penalty ? ' <span style="color:var(--gs-warn);">🕳 lost rough</span>' : '';
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
  const place = liveLeaderChip();
  return `
    <div class="gs-hud gs-hud-top gs-glass">
      <div class="gs-hudx">
        ${windCompass(play.hole, opts.upBearing)}
        <div class="gs-hudx__pods">
          ${pod(`${play.holeIndex + 1}/${state.course.holes.length}`, `par ${play.hole.par} · ${len}y`, { title: `hole ${play.holeIndex + 1} of ${state.course.holes.length} — par ${play.hole.par}, ${len} yards` })}
          ${pod(opts.dist.big, opts.dist.cap, { hero: true })}
          ${zoneScoreChip()}
        </div>
        <div class="gs-hudx__lie">${lieChip(opts.lie ?? v.lie)}${lostRough}${place ? ` <span class="gs-hudx__place">${place}</span>` : ''}</div>
      </div>
      ${scrambleLine}
      ${state.match ? `<div style="margin-top:5px;">${matchHud()}</div>` : ''}
      ${!state.match && (state.run.storyTournament || state.run.storyQualifier) ? (() => { const chip = storySigilMatchChip(); return chip ? `<div style="margin-top:5px;">${chip}</div>` : ''; })() : ''}
      ${holePips()}
    </div>`;
}

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
import { lieInfo, reliedLie, roughLieOf, windResistFactor } from '../sim/shot';
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

/** The aim value as the panel prints it — "Straight", or the borrow in yards. */
const aimValue = (aim: number): string => (Math.abs(aim) < 0.2 ? 'Straight' : yds(aim));

/** The aim readout inside the adjuster row — split out so an aim nudge can update JUST this span
 *  in place (the ◄/► buttons keep their listeners; see puttAimRefresh). It sits between the ◄/►
 *  buttons and carries the AIM alone; the slope read lives on the note line below (which is static —
 *  the break doesn't change when you re-aim, only your line through it does).
 *
 *  Shape: the instrument cluster's POD (GS-putt-panel) — a big value over a small all-caps caption,
 *  the same one shape every other number on the play screen is printed in since GS-hud-compass. The
 *  old row said "Aim **straight**" as a sentence, which was the last inline label on the screen. */
export function puttAimLabel(breakYd: number, aim: number, dbl = false): string {
  void breakYd;
  void dbl;
  return `<b>${aimValue(aim)}</b><span>your aim</span>`;
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
 * The putt screen's ADJUSTER row (GS-greens-3 · GS-hud-frame · GS-putt-panel): the aim read flanked
 * by its ◄/► nudges, in the row the club cycler used to occupy while aiming — so the two most-tapped
 * buttons on the play screen stay in the same place all the way round the hole.
 * `breakYd`/`aim` are signed (+ = right of the line); the player aims to cancel the break.
 * A green-reading caddy (Mystic Mole) has already found the line, so its buttons render disabled
 * rather than disappearing.
 *
 * GS-hud-bag took the club cycler off the screen, which left this row as the last thing wearing the
 * old `.gs-clubrow` chrome — two heavy dark slabs around a sentence, beside a top bar and a commit
 * pill that had both moved on. It now speaks the same language as the rest of the frame: a pod for
 * the value, quiet round nudges for the controls, and its own `.gs-putt*` namespace (the play
 * screen's, never another screen's — see the #353 `.gs-hud` regression).
 */
export function puttAimRow(breakYd: number, aim: number, reads: boolean, dbl = false, fringe = false): string {
  const toggle = fringe
    ? `<button class="gs-puttnudge gs-puttnudge--alt" data-putt-toggle="0" title="Chip instead of putting" aria-label="Chip instead of putting">🏌</button>`
    : '';
  // A caddy who has read the green owns the line: the nudges stay in place, disabled, and the
  // caption names whoever found it (GS-story-caddy-read).
  const label = reads
    ? `<b>${aimValue(aim)}</b><span>${greenReadReader()} reads</span>`
    : puttAimLabel(breakYd, aim, dbl);
  // `aria-keyshortcuts` announces the arrow binding (GS-a11y-putt-arrows) to the players most likely
  // to need it, at zero visual cost — the deliberate choice over an on-screen hint, which would be a
  // readout the map already draws (GS-hud-bag) and would ride on every putt forever.
  const nudge = (dir: -1 | 1, glyph: string, label2: string): string =>
    reads
      ? `<button class="gs-puttnudge" disabled aria-hidden="true">${glyph}</button>`
      : `<button class="gs-puttnudge" data-putt-aim="${dir}" title="${label2}" aria-label="${label2}" aria-keyshortcuts="${dir < 0 ? 'ArrowLeft' : 'ArrowRight'}">${glyph}</button>`;
  return `<div class="gs-puttrow">
      ${nudge(-1, '◄', 'Aim left')}
      <span class="gs-puttread" id="puttaimlabel">${label}</span>
      ${nudge(1, '►', 'Aim right')}
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
export function windRead(
  hole: Hole,
  upBearing?: number,
  windResist?: number,
): { spd: number; rawSpd: number; cut: boolean; kind: string; delta: number } {
  const w = hole.wind;
  if (!w || w.spd < 1) return { spd: 0, rawSpd: 0, cut: false, kind: 'calm', delta: 0 };
  const up = upBearing ?? bearing(hole.tee, hole.green);
  const delta = ((w.dir - up + 540) % 360) - 180; // −180..180; 0 = tailwind (the way you are playing)
  const along = Math.cos((delta * Math.PI) / 180);
  // `spd` is what the BALL feels, not what the sky is doing (GS-hud-gear-reads): wind-cheating gear
  // scales the along-shot carry effect AND the crosswind drift by the same factor, off the sim's own
  // `windResistFactor`, so a 45%-resist ball can never be shown a 20 mph gale it will fly through at 11.
  const f = windResistFactor(windResist);
  return {
    spd: w.spd * f,
    rawSpd: w.spd,
    cut: f < 0.999,
    kind: along > 0.4 ? 'tailwind' : along < -0.4 ? 'headwind' : 'crosswind',
    delta,
  };
}

/**
 * The compass POD: the dial plus the active sky's badge (GS-hud-compass). The weather effect used to
 * be readable only on the route card you flew in on — here it rides the instrument it belongs to, and
 * its tooltip carries the label so "why is the air like this" is one long-press away.
 */
function windCompass(hole: Hole, upBearing?: number): string {
  const r = windRead(hole, upBearing, state.run.loadout.windResist);
  const eff = currentEffect();
  const info = eff && eff !== 'none' ? COURSE_EFFECTS[eff as CourseEffectId] : undefined;
  const title = r.spd
    ? `${Math.round(r.spd)} mph ${r.kind}${r.cut ? ` — your gear cuts the sky's ${Math.round(r.rawSpd)} mph` : ''}`
    : 'Calm air';
  return `<div class="gs-hudx__compass" title="${title}${info ? ` · ${info.label}` : ''}">
      ${windCompassSVG({ spd: r.spd, kind: r.kind, delta: r.delta, cut: r.cut })}
      ${info ? `<span class="gs-hudx__sky" aria-hidden="true">${info.icon}</span>` : ''}
      <span class="gs-sr-only">${title}${info ? `, ${info.label}` : ''}.</span>
    </div>`;
}

/** The current lie as a prominent, colour-coded chip with its effect on the NEXT shot — so the
 *  player always knows what they're playing from and how it bites (carry penalty + spray), shown
 *  right where the shot decision is made. This is the lie-awareness the per-shot popup used to
 *  carry, moved to the moment it actually matters. */
export function lieChip(lie: string, relief?: number): string {
  const info = lieInfo(lie);
  // What this lie costs YOU, not what it costs a bare bag (GS-hud-gear-reads). An escape-specialist
  // caddy and a pile of story gear grant `lieRelief`, which eases a penalising lie back toward
  // neutral — and the chip was reading the raw table, so a bunker announced "−50% carry · wild" to a
  // player whose gear had already halved that, while the aim cone beside it drew the eased shot. This
  // is the sim's OWN `reliedLie`, the function `resolveShot` and `shotSpread` both call, so the words
  // and the physics cannot drift.
  const eased = reliedLie(info, relief);
  const label = info.label ?? lie;
  const carryPen =
    eased.carryMult < 0.99 ? `−${Math.round((1 - eased.carryMult) * 100)}% carry`
    : eased.carryMult > 1.01 ? `+${Math.round((eased.carryMult - 1) * 100)}% carry` // hot/fast lies fly long
    : '';
  const spray = eased.dispersionMult >= 1.55 ? 'very wild' : eased.dispersionMult >= 1.25 ? 'wild' : eased.dispersionMult > 1.05 ? 'loose' : '';
  const effTxt = [carryPen, spray].filter(Boolean).join(' · ');
  const trouble = !!info.penalty || eased.carryMult <= 0.6 || eased.dispersionMult >= 1.55;
  const caution = eased.carryMult < 0.95 || eased.dispersionMult > 1.15;
  const col = trouble ? '#ff6b6b' : caution ? '#ffc454' : '#5fd45a';
  const dot = trouble ? '🔴' : caution ? '🟠' : '🟢';
  // The relief only SHOWS as a softer number, so the tooltip says where the softening came from —
  // otherwise a good bag quietly looks like an easy course.
  const helped = !!relief && (info.carryMult < 1 || info.dispersionMult > 1);
  const title = helped
    ? `${label} — eased by your gear (a bare bag plays it at −${Math.round((1 - info.carryMult) * 100)}% carry)`
    : label;
  return `<span class="gs-liechip" title="${title}" style="border-color:${col};color:${col};">${dot} <b style="color:var(--gs-ink);">${label}</b>${effTxt ? ` <span style="opacity:.85;">${effTxt}</span>` : ''}${helped ? ` <span style="color:#7fd8ff;" title="your gear is easing this lie">🛡</span>` : ''}</span>`;
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
        <div class="gs-hudx__lie">${lieChip(opts.lie ?? v.lie, state.run.loadout.lieRelief)}${lostRough}${place ? ` <span class="gs-hudx__place">${place}</span>` : ''}</div>
      </div>
      ${scrambleLine}
      ${state.match ? `<div style="margin-top:5px;">${matchHud()}</div>` : ''}
      ${!state.match && (state.run.storyTournament || state.run.storyQualifier) ? (() => { const chip = storySigilMatchChip(); return chip ? `<div style="margin-top:5px;">${chip}</div>` : ''; })() : ''}
      ${holePips()}
    </div>`;
}

/**
 * The two-step stop briefing (GS-intro-split). The old intro crammed the world header, the win
 * condition, the field of 20 AND the hole art + hazard list into one long mobile scroll. It's now
 * split so each step fits a phone and has its own primary action:
 *   'arc'  — the GAME (mode + objective) and the COMPETITION (boss note + the field of competitors),
 *            a big "First Tee ▸" at the top (and again at the bottom when the field overflows a
 *            screen), plus a "Change golfer" back-out.
 *   'hole' — the HOLE you're about to play: a big map, a tap-to-open hazards/benefits popup, and a
 *            "Tee Off" / "Watch AI" / "Back" action row, sized to hold one screen.
 */

import { btn, header, state } from './ctx';
import { holeBiome, holeThemeId, rainbowActive, rarityFlavour } from './helpers';
import { currentOpponentId, opponentScouting, teamDuel, teamFormatLabel, teamFormatRule, teamPartnerChar } from './duelHud';
import { eventDescFor } from './travelScreens';
import { difficultyPips, zoneProfile } from '../sim/course/zones';
import { archetypeFor, themeById } from '../sim/course/themes';
import { rarCol } from '../sim/rpg/loot';
import { routeClubFind } from '../sim/rpg/effects';
import { ascensionCutBonus, canWarpStop, currentBoss, effectiveCut, endlessHoleNumber, holeGateArmed } from '../sim/rpg/run';
import { getFormat, isMatchplayBoss, isTeamDuelBoss, STROKEPLAY_FORMAT } from '../sim/rpg/formats';
import { endlessSetGateOverPar, endlessSetLabel, endlessSetToPar, formatToPar, toParColour } from '../sim/rpg/endless';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import { staticCourseSpec } from '../sim/course/staticCourses';
import type { EndlessCardData } from '../render/endlessCards';
import { arcSurvivorTarget } from '../sim/rpg/competition';
import { leaderboard, runField } from '../sim/rpg/league';
import { getGolfer } from '../sim/rpg/golfers';
import { competitorsCard, leaderboardHTML, opponentBadge } from '../render/golferCards';
import { endlessRecordsBoard, endlessScoreCard } from '../render/endlessCards';
import { renderHoleSVG } from '../render/holeView';
import type { PlayedHole } from '../sim/round';

// View-only module state (like settingsOpen / travelView.selectedRouteId) — reset to the arc step +
// closed popup whenever we (re-)enter the intro, so a fresh stop always opens on the arc. No
// save/rng touch. app.ts's dispatch/render own the resets + `[data-intro-stage]` wiring.
export const introView = { stage: 'arc' as 'arc' | 'hole', traitsOpen: false };

/**
 * Shared derivation for BOTH intro steps: the world identity, the compact competition/route NOTES,
 * and the mode's OBJECTIVE line — computed once here so the arc step and the hole step can never
 * drift apart. Pure read of `state` (no rng, no mutation), like the rest of the render layer.
 */
function introShared(): {
  c: typeof state.course;
  zone: ReturnType<typeof zoneProfile>;
  theme: ReturnType<typeof themeById> | undefined;
  col: string;
  par: number;
  rar: ReturnType<typeof rarityFlavour>;
  diffPips: string;
  notes: string[];
  salvageNote: string;
  objective: string;
  boss: ReturnType<typeof currentBoss>;
} {
  const c = state.course;
  // The cut reflects any pending route event (GS-14), so the line is honest about the bar.
  const cut = effectiveCut(state.run, c.holes.length);
  const par = c.holes.reduce((s, h) => s + h.par, 0);
  const ev = state.run.pendingEvent;
  // Boss stop (GS-voyage): a louder note — and a team read (format + partner side) for a team duel.
  const boss = currentBoss(state.run);
  const duel = isTeamDuelBoss(boss) ? teamDuel() : undefined;
  const split = state.course.meta.split;

  // World identity (GS-19): the archetype's lore/profile, the per-stop theme name, difficulty.
  const themeId = c.meta.themeId;
  const zone = zoneProfile(archetypeFor(themeId, c.biome));
  const theme = themeId ? themeById(themeId) : undefined;
  const col = rarCol(c.rarity);
  const diffPips = difficultyPips(zone.difficulty);
  const rar = rarityFlavour(c.rarity);

  // Contextual notes (boss / split / route event) — only when they apply, kept compact and ABOVE
  // the CTA so a decision is never buried under the hole art.
  const notes: string[] = [];
  if (boss) {
    const tag = duel
      ? ` · ${teamFormatLabel(duel.format).toUpperCase()} DUEL`
      : isMatchplayBoss(boss)
      ? ' · MATCHPLAY'
      : '';
    // Team duel (GS-team-duel): say which side carries the partner (the underdog) + the rule.
    let teamNote = '';
    if (duel) {
      const partner = teamPartnerChar(duel);
      const youHavePartner = duel.partnerSide === 'player';
      const oppName = getGolfer(duel.opponentId)?.shortName ?? 'your rival';
      teamNote = partner
        ? `<div style="font-size:12px;margin-top:5px;color:${partner.style.cap};">🤝 ${
            youHavePartner
              ? `You're the underdog — <b>${partner.name}</b> joins your bag`
              : `You're the favourite — ${oppName} brings <b>${partner.name}</b> to even it up; you go it alone`
          } · <b>${teamFormatLabel(duel.format)}</b> (${teamFormatRule(duel.format)}).</div>`
        : '';
    }
    // Scouting line (GS-team-duel): the opponent's style read, so you know the matchup going in.
    const oppId = duel?.opponentId ?? (isMatchplayBoss(boss) ? currentOpponentId() : undefined);
    const scoutSub = oppId
      ? `${opponentScouting(oppId)}${duel?.homeEdge ? ' · ⚑ on home turf — plays sharper here' : ''}`
      : 'Your opponent — beat them hole by hole';
    notes.push(`<div style="margin-top:10px;padding:9px 11px;border:1px solid ${boss.final ? '#ffce54' : '#c0392b'};
        border-radius:9px;background:linear-gradient(180deg,#1a0e12,#120b10);">
       <div style="font-size:11px;letter-spacing:.12em;color:${boss.final ? '#ffce54' : '#ff6b6b'};">
         ${boss.final ? '★ FINAL BOSS' : '⚔ BOSS STOP'}${tag}</div>
       <b style="font-size:16px;">${boss.name}</b>
       <div style="font-size:12.5px;opacity:.85;margin-top:2px;">${boss.blurb}</div>
       ${teamNote}
       ${oppId ? `<div style="margin-top:8px;">${opponentBadge(oppId, scoutSub)}</div>` : ''}
     </div>`);
  }
  if (split)
    notes.push(`<div style="margin-top:8px;padding:7px 11px;border-left:3px solid #7aa2ff;border-radius:8px;background:#ffffff08;font-size:12.5px;">
       🌗 <b>Two worlds</b> — the first ${split.frontHoles} holes play one world, then you cross into another for the run home.</div>`);
  if (ev && ev.id !== 'open-space')
    notes.push(`<div style="margin-top:8px;padding:7px 11px;border-left:3px solid ${rarCol(ev.rarity)};border-radius:8px;background:#ffffff08;">
       <b style="font-size:13px;">${ev.label}</b>
       <div style="font-size:12.5px;opacity:.82;margin-top:1px;">${eventDescFor(ev.desc)}</div>
     </div>`);
  // The SALVAGE gamble pays off (GS-salvage-mystery): if this stop arrived via a salvage lane, reveal
  // the club the blind roll actually landed — the "you looted X" moment the tier-only route card held
  // back. `state.salvageReveal` is the transient find computed at travel from the pre-jump bag. Kept as
  // its OWN note (not folded into `notes`) so BOTH intro steps can surface it — the Unending Universe
  // past stop 0 opens straight on the hole step, where the arc-only `notes` never render, so a salvage
  // find would otherwise stay invisible until the bag/shop (the reported bug).
  const reveal = state.salvageReveal;
  let salvageNote = '';
  if (reveal && routeClubFind(ev)) {
    const scol = rarCol(reveal.rarity ?? ev!.rarity);
    salvageNote = reveal.clubName
      ? `<div style="margin-top:10px;padding:10px 12px;border:1px solid ${scol}aa;border-left:4px solid ${scol};border-radius:10px;
             background:linear-gradient(180deg,${scol}1f,#ffffff08);box-shadow:0 0 14px ${scol}33;">
           <div style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:${scol};font-weight:800;">🎁 Salvage haul</div>
           <b style="font-size:15px;color:${scol};">The ${reveal.rarity} ${reveal.clubName}!</b>
           <div style="font-size:12.5px;opacity:.85;margin-top:2px;">Scavenged from the wreck and slotted into your bag for the rest of the run.</div>
         </div>`
      : `<div style="margin-top:10px;padding:10px 12px;border:1px solid #4fd0e0aa;border-left:4px solid #4fd0e0;border-radius:10px;
             background:linear-gradient(180deg,#4fd0e01f,#ffffff08);box-shadow:0 0 14px #4fd0e033;">
           <div style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#4fd0e0;font-weight:800;">🎁 Salvage haul</div>
           <b style="font-size:15px;color:#4fd0e0;">+${reveal.consolationCredits} credits</b>
           <div style="font-size:12.5px;opacity:.85;margin-top:2px;">Your bag was already stocked at that tier, so the haul cashed out.</div>
         </div>`;
  }

  const objective = `${(() => {
    const format = getFormat(state.run.formatId);
    if (format.id === STROKEPLAY_FORMAT) {
      // Star Tour (GS-star-tour): a stroke-play round chasing a personal course record.
      const best = bestStrokeFor(state.strokePlayBest, state.run.staticCourseId ?? '');
      return best
        ? `⛳ 18 holes, stroke play — beat your course record of <b style="color:${toParColour(best.toPar)};">${formatToPar(best.toPar)}</b>.`
        : `⛳ 18 holes, stroke play — set the first course record on ${c.holes.length} holes.`;
    }
    if (duel)
      return `⚔ Win the <b>${teamFormatLabel(duel.format)} duel</b> hole by hole — ${
        duel.partnerSide === 'player' ? 'your partner has your back' : 'you give up the partner advantage'
      }.`;
    if (boss && isMatchplayBoss(boss)) return '⚔ Win the <b>matchplay knockout</b> to advance — the field pairs best-vs-worst, so your finish so far set your opponent.';
    if (boss) return `🎯 <b>${cut} pts</b> over ${c.holes.length} holes to beat the boss.`;
    if (format.holeGate) {
      // The Unending Universe (GS-set-survival): the stakes are the whole SET OF FOUR's cumulative
      // total. A blow-up hole won't end you — the four-hole total is what has to clear the allowance.
      const setNo = state.run.stopIndex + 1;
      const target = endlessSetGateOverPar(state.run.stopIndex);
      const h0 = endlessHoleNumber(state.run, 0);
      const h1 = endlessHoleNumber(state.run, c.holes.length - 1);
      return `💀 Set ${setNo} · holes ${h0}–${h1}. Finish the set at <b>${endlessSetLabel(target)} or better</b> across the four holes to survive — one blow-up won't wreck you, the set total is what counts.`;
    }
    if (format.winnable) {
      const target = arcSurvivorTarget(state.run.stopIndex, ascensionCutBonus(state.run.ascension));
      return `🏁 Finish in the <b>top ${target}</b> of the field over ${c.holes.length} holes to advance.`;
    }
    return `🎯 <b>${cut} pts</b> over ${c.holes.length} holes to make the cut and travel on.`;
  })()}${
    state.run.ascension > 0 ? `<span style="color:#ffce54;"> · ⚔ Ascension A${state.run.ascension} (tougher cut, leaner purse)</span>` : ''
  }`;

  return { c, zone, theme, col, par, rar, diffPips, notes, salvageNote, objective, boss };
}

/** Star Tour (GS-star-tour): the personal course-record card for the intro's field slot — this
 *  course's best + your best rounds overall. */
function strokeRecordsCard(): string {
  const courseId = state.run.staticCourseId ?? '';
  const here = bestStrokeFor(state.strokePlayBest, courseId);
  const board = bestStrokeRounds(state.strokePlayBest, 5);
  const rows = board.length
    ? board
        .map((r, i) => {
          const s = staticCourseSpec(r.courseId);
          const isHere = r.courseId === courseId;
          return `<div class="gs-st-boardrow${isHere ? ' gs-st-boardrow--you' : ''}"><span class="gs-st-boardrank">${i + 1}</span><span class="gs-st-boardname">${s?.name ?? r.courseId}</span><span class="gs-st-boardscore" style="color:${toParColour(r.toPar)};">${formatToPar(r.toPar)}</span></div>`;
        })
        .join('')
    : `<div class="gs-st-boardempty">No records yet — this round could be your first.</div>`;
  return `
    <div class="gs-panel gs-st-introcard">
      <div class="gs-st-introcard__row">
        <span class="gs-st-introcard__label">Your record here</span>
        <span class="gs-st-introcard__score" style="color:${here ? toParColour(here.toPar) : '#8791a3'};">${here ? formatToPar(here.toPar) : '—'}</span>
      </div>
      <div class="gs-st-sheet__wxlabel" style="margin-top:8px;">Best rounds overall</div>
      <div class="gs-st-board">${rows}</div>
    </div>`;
}

/** The stop briefing: the arc step or the hole step (GS-intro-split), chosen by view state. */
export function introScreen(): string {
  return introView.stage === 'hole' ? holeIntroScreen() : arcIntroScreen();
}

/**
 * The Unending-Universe progress card data (GS-set-survival) mid-stop: sets already cleared, plus THIS
 * set's live cumulative to-par over the holes played so far (`playedSoFar` includes the hole just
 * finished). No mid-set death anymore, so every played hole counts toward the running set total.
 */
export function endlessRoundSoFar(playedSoFar: PlayedHole[]): EndlessCardData {
  const r = state.run;
  return {
    holesCleared: r.holesSurvived,
    stopIndex: r.stopIndex,
    tier: r.bagTier ?? 'common',
    live: { setToPar: endlessSetToPar(playedSoFar), thru: playedSoFar.length },
  };
}

/**
 * STEP 1 — the arc: the game mode + win condition and the field of 20 competitors. A big "First
 * Tee ▸" up top drops to the hole step; a second one appears at the very bottom ONLY when the
 * field pushes the page past one screen (revealed post-render in `render()` by measuring overflow),
 * so it's there after you've scrolled the roster but never a redundant duplicate on a short screen.
 */
function arcIntroScreen(): string {
  const { c, zone, theme, col, par, rar, diffPips, notes, salvageNote, objective } = introShared();
  // The Unending Universe tracks DEPTH (GS-set-survival): the "field" slot shows your progress card
  // (sets cleared + this set's target) + the personal last-runs leaderboard grouped by starting club
  // set, instead of the voyage's ghost competitor board. Gated to the gate format (voyage untouched).
  const gate = holeGateArmed(state.run);
  let field: string;
  if (state.run.formatId === STROKEPLAY_FORMAT) {
    // Star Tour (GS-star-tour): the "field" slot shows the personal course records instead of a ghost
    // field — this course's best and your best rounds overall.
    field = strokeRecordsCard();
  } else if (gate) {
    const r = state.run;
    field =
      endlessScoreCard(
        { holesCleared: r.holesSurvived, stopIndex: r.stopIndex, tier: r.bagTier ?? 'common' },
        { title: r.holesSurvived > 0 ? 'Your run' : 'New run', next: true },
      ) + endlessRecordsBoard(state.endlessRuns, { currentTier: r.bagTier ?? 'common' });
  } else {
    const board = leaderboard(state.run);
    field = board.hasScores ? leaderboardHTML(board) : competitorsCard(runField(state.run));
  }
  // Stop 0 is the first tee after character select — the ONLY intro where "Change golfer" makes
  // sense (you've committed to this golfer for the run). Every later world intro (post pro-shop) is
  // "Next Tee" with no back-out to character select (GS-intro-nav).
  const firstStop = state.run.stopIndex === 0;
  const teeLabel = firstStop ? 'First Tee' : 'Next Tee';
  const firstTee = (id: string): string =>
    `<button class="gs-btn gs-btn--primary gs-intro-first" id="${id}" data-intro-stage="hole">${teeLabel} <span aria-hidden="true">▸</span></button>`;
  return `
    ${header()}
    <article class="gs-panel" style="border-color:${col}${rar.strong ? 'aa' : '66'};box-shadow:0 0 ${rar.glow}px ${col}${rar.strong ? '44' : '22'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-accent);opacity:.85;margin-bottom:2px;">Arc briefing</div>
          <div style="font-size:21px;font-weight:800;line-height:1.1;">${zone.name}</div>
          <div style="font-size:13px;color:var(--gs-accent);margin-top:2px;">${zone.signature}${theme ? ` · ${theme.name}` : ''}</div>
          <div style="font-size:12.5px;opacity:.7;margin-top:3px;">${c.meta.name} · ${c.holes.length} holes · par ${par} · 🌪 ${c.meta.wildness.toFixed(2)}</div>
          <div style="font-size:12px;margin-top:5px;color:${col};font-style:italic;opacity:.95;">${rar.glyph} ${rar.tagline}</div>
        </div>
        <div style="text-align:right;flex:0 0 auto;">
          <span style="${rar.strong ? `background:${col};color:#0b0d12;font-weight:800;` : `color:${col};`}border:1px solid ${col};border-radius:6px;padding:${rar.strong ? '2px 9px' : '1px 7px'};font-size:11px;text-transform:uppercase;letter-spacing:1px;">${rar.glyph} ${c.rarity}</span>
          <div style="font-size:10.5px;opacity:.65;margin-top:7px;letter-spacing:.06em;text-transform:uppercase;">Difficulty</div>
          <div style="font-size:15px;letter-spacing:1px;color:var(--gs-danger);">${diffPips}</div>
        </div>
      </div>
      <p style="font-size:14px;margin:12px 0 0;padding-top:12px;border-top:1px solid var(--gs-line-2);">${objective}</p>
      <div class="gs-intro-ctarow">
        ${firstTee('gs-firsttee-top')}
        ${firstStop ? btn('‹ Change golfer', { type: 'backToCharacter' }, { variant: 'ghost' }) : ''}
      </div>
      ${notes.join('')}
      ${salvageNote}
      ${field}
      <div class="gs-intro-ctarow gs-intro-ctarow--bottom" id="gs-firsttee-bottomwrap" style="display:none;">
        ${firstTee('gs-firsttee-bottom')}
      </div>
    </article>`;
}

/**
 * STEP 2 — the hole: a large map of the first hole, a tap-to-open hazards/benefits popup (the detail
 * that used to sprawl down the page), and the action row. Laid out as a flex column with a
 * viewport-capped map so it holds one phone screen; "Tee Off" starts play, "Watch AI" auto-plays,
 * "Back" returns to the arc step.
 */
function holeIntroScreen(): string {
  const { c, zone, col, diffPips, salvageNote, boss } = introShared();
  const hole = c.holes[0]!;
  const map = renderHoleSVG(hole, {
    width: 300,
    height: 360,
    biome: holeBiome(hole),
    themeId: holeThemeId(hole),
    rainbow: rainbowActive(),
  });
  const chip = (icons: string[], label: string, accent: string): string =>
    `<span class="gs-trait-chip" style="--tc:${accent};"><span class="gs-trait-chip-i">${icons.join(' ')}</span><span class="gs-trait-chip-l">${label}</span></span>`;
  const bossRibbon = boss
    ? `<div class="gs-holeintro-boss" style="border-color:${boss.final ? '#ffce54' : '#c0392b'};color:${boss.final ? '#ffce54' : '#ff6b6b'};">${boss.final ? '★ FINAL BOSS' : '⚔ BOSS STOP'} · ${boss.name}</div>`
    : '';
  return `
    ${header()}
    <article class="gs-panel gs-holeintro" style="border-color:${col}66;">
      <div class="gs-holeintro-head">
        <div style="min-width:0;">
          <div style="font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--gs-accent);opacity:.85;">First hole</div>
          <div style="font-size:18px;font-weight:800;line-height:1.1;">${zone.name}</div>
          <div style="font-size:12px;opacity:.72;margin-top:2px;">${zone.signature} · par ${hole.par} · ${c.meta.name}</div>
        </div>
        <div style="text-align:right;flex:0 0 auto;">
          <div style="font-size:10px;opacity:.6;text-transform:uppercase;letter-spacing:.06em;">Difficulty</div>
          <div style="font-size:14px;color:var(--gs-danger);letter-spacing:1px;">${diffPips}</div>
        </div>
      </div>
      ${bossRibbon}
      ${salvageNote}
      <div class="gs-holeintro-map">${map}</div>
      <button class="gs-traits-bar" data-introtraits="open" aria-label="Show hazards and benefits">
        ${chip(zone.hazards.map((t) => t.icon), `${zone.hazards.length} hazards`, 'var(--gs-danger)')}
        ${chip(zone.benefits.map((t) => t.icon), `${zone.benefits.length} benefits`, 'var(--gs-accent)')}
        <span class="gs-traits-bar-more">Details ›</span>
      </button>
      <div class="gs-holeintro-ctas">
        ${btn('🏌 Tee Off', { type: 'playInteractive' }, { variant: 'primary' })}
        ${
          // WARP (GS-warp): fast-forward this stop under the hidden auto-birdie rule — offered only
          // while the whole stop sits under the player's proven best (canWarpStop), so the button
          // vanishes exactly where the real golf begins.
          canWarpStop(state.run, state.endlessBestHoles, state.course.holes.length)
            ? btn(`⚡ Warp to hole ${state.run.holesSurvived + state.course.holes.length + 1}`, { type: 'warpStop' }, { variant: 'ghost' })
            : ''
        }
        ${
          // Star Tour (GS-star-tour): a course record must be EARNED by real play, so the auto-AI
          // "Watch" is hidden — every other mode keeps it.
          state.run.formatId === STROKEPLAY_FORMAT ? '' : btn('» Watch AI', { type: 'play' }, { variant: 'ghost' })
        }
        ${
          // Past stop 0 the intro OPENED here (GS-intro-endless / GS-intro-voyage) for every format —
          // there is no "back", but the arc briefing (field/leaderboard, round so far) stays one tap
          // away. Stop 0 came from the arc step, so it keeps a plain "‹ Back".
          state.run.stopIndex > 0
            ? `<button class="gs-btn gs-btn--ghost gs-holeintro-back" data-intro-stage="arc">‹ Briefing</button>`
            : `<button class="gs-btn gs-btn--ghost gs-holeintro-back" data-intro-stage="arc">‹ Back</button>`
        }
      </div>
    </article>`;
}

/** The hazards/benefits popup for the hole step (GS-intro-split): every hazard AND benefit in one
 *  window, plus the world's inspiration + brief — so the detail is one tap away, not a long scroll. */
export function introTraitsOverlay(): string {
  const { zone } = introShared();
  return `
    <div class="gs-sheet-backdrop" data-introtraits="close">
      <div class="gs-sheet" data-introtraits="keep">
        <div class="gs-sheet-head"><b style="font-size:17px;">${zone.name} — hazards &amp; benefits</b>
          <button class="gs-mapbtn" data-introtraits="close" title="Close">✕</button></div>
        <p style="font-size:12.5px;font-style:italic;opacity:.72;margin:0 0 6px;line-height:1.4;">${zone.inspiration}</p>
        <p style="font-size:13px;opacity:.92;margin:0 0 12px;line-height:1.4;">${zone.brief}</p>
        <div style="display:flex;gap:18px;flex-wrap:wrap;">
          ${traitList('Hazards', 'var(--gs-danger)', zone.hazards)}
          ${traitList('Benefits', 'var(--gs-accent)', zone.benefits)}
        </div>
        <div style="text-align:center;margin-top:12px;">
          <button class="gs-btn gs-btn--primary" data-introtraits="close" style="padding:11px 26px;">Done</button>
        </div>
      </div>
    </div>`;
}

/** A list of zone traits (hazards/benefits), each an icon + line. */
function traitList(title: string, accent: string, traits: { icon: string; text: string }[]): string {
  const rows = traits
    .map(
      (t) =>
        `<li style="display:flex;gap:7px;align-items:flex-start;margin:3px 0;font-size:12.5px;line-height:1.3;">
           <span style="flex:0 0 auto;">${t.icon}</span><span style="opacity:.9;">${t.text}</span></li>`,
    )
    .join('');
  return `<div style="flex:1 1 0;min-width:140px;">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:2px;">${title}</div>
      <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
    </div>`;
}

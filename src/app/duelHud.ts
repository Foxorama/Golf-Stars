/**
 * Competition & duel HUD blocks (GS-100 / GS-team-duel): the live arc-leaderboard chip, the
 * matchplay HUD + result panel, and the team-duel helpers (setup, labels, the best-ball reveal).
 * Used by the playing screen (app.ts), the intro screens and the result screens.
 */

import { state } from './ctx';
import { getFormat } from '../sim/rpg/formats';
import { playTotals, scoreName } from '../sim/score';
import { livePosition, matchOpponentFor, runField } from '../sim/rpg/league';
import { getArchetype, getGolfer } from '../sim/rpg/golfers';
import { holeDuel, matchScoreline, matchState } from '../sim/rpg/match';
import { getCharacter, type Character } from '../sim/rpg/characters';
import { teamDuelSetupForRun, type TeamDuelSetup } from '../sim/rpg/run';
import { opponentBadge, ordinal } from '../render/golferCards';
import type { PlayedHole } from '../sim/round';

/** A compact LIVE arc-leaderboard chip for the play HUD — updates the moment a hole is finished. */
export function liveLeaderChip(): string {
  if (state.match) return ''; // a matchplay stop shows its duel HUD instead
  // Endless survival is the per-hole par bar, not a field cut — an arc-leaderboard position has no
  // bearing on survival there and implies a competition that doesn't exist. Voyage-only.
  if (!getFormat(state.run.formatId).winnable) return '';
  const played = state.stopPlayed ?? [];
  const sf = playTotals(played.map((p) => p.record)).stableford;
  const lp = livePosition(state.run, played.length, sf);
  const col = lp.position <= 3 ? '#5fd45a' : lp.position <= lp.of / 2 ? '#ffce54' : '#ff6b6b';
  const gap = lp.gapToLead > 0 ? ` · ${lp.gapToLead} back` : ' · leading';
  return `<span title="Live arc leaderboard">🏆 <b style="color:${col};">${ordinal(lp.position)}</b>/${lp.of}${gap}</span>`;
}

/** The matchplay opponent id for the current boss stop (the leaderboard leader, with a fallback). */
export function currentOpponentId(): string | undefined {
  if (state.match) return state.match.bossId;
  return matchOpponentFor(state.run) ?? runField(state.run).golfers.find((g) => !g.isPlayer)?.id;
}

/** The live matchplay HUD shown on the play screen — scoreline vs the opponent. */
export function matchHud(): string {
  const m = state.match;
  if (!m) return '';
  const st = matchState(m.duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const line =
    st.thru === 0
      ? 'Tee it up'
      : st.holesUp > 0
      ? `You ${matchScoreline(st)}`
      : st.holesUp < 0
      ? `${opp?.shortName ?? 'Boss'} ${Math.abs(st.holesUp)} UP`
      : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  // The boss is pre-played, so on the current hole you know their target — show "they made N here" so
  // you can attack or protect accordingly (real matchplay: you can see the other ball). EXCEPT in a
  // BEST-BALL duel (GS-team-duel): there every hole result — yours, your partner's, the other side's —
  // is a hole-END reveal (the pair-cards screen), so mid-hole the HUD holds its tongue.
  const play = state.play;
  let target = '';
  if (play && !play.done && m.setup?.format !== 'bestball') {
    const bh = m.bossHoles[play.holeIndex];
    if (bh) {
      const rel = bh.record.strokes - play.hole.par;
      const relTxt = rel === 0 ? 'par' : rel > 0 ? `+${rel}` : `${rel}`;
      target = `<span style="font-size:10.5px;opacity:.85;">· ${opp?.shortName ?? 'Boss'} made <b>${bh.record.strokes}</b> (${relTxt})</span>`;
    }
  }
  const modeTag = state.match?.setup ? `<span style="font-size:10px;opacity:.6;">${teamFormatLabel(state.match.setup.format)}</span>` : '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 9px;border:1px solid ${col};border-radius:8px;background:#0d1016cc;flex-wrap:wrap;">
      <span style="font-size:11px;opacity:.7;">⚔ vs ${opp?.shortName ?? 'Boss'}</span>
      ${modeTag}
      <span style="font-size:13px;font-weight:800;color:${col};">${line}</span>
      <span style="font-size:10.5px;opacity:.6;">thru ${st.thru}/${state.course.holes.length}</span>
      ${target}
    </div>`;
}

/** The label for the current duel's mode (GS-team-duel) — the team format, or plain matchplay. */
export function duelModeLabel(): string {
  const setup = state.match?.setup;
  return setup ? `${teamFormatLabel(setup.format)} duel` : 'Matchplay';
}

/** A line describing who carried the partner in a team duel (GS-team-duel), for the result screen. */
export function teamDuelCaption(): string {
  const setup = state.match?.setup;
  if (!setup) return '';
  const partner = teamPartnerChar(setup);
  if (!partner) return '';
  const oppName = getGolfer(setup.opponentId)?.shortName ?? 'your rival';
  return setup.partnerSide === 'player'
    ? `<div style="font-size:11px;opacity:.7;margin-top:4px;">🤝 You played ${teamFormatLabel(setup.format)} with <b>${partner.name}</b> (you were the underdog).</div>`
    : `<div style="font-size:11px;opacity:.7;margin-top:4px;">🤝 ${oppName} played ${teamFormatLabel(setup.format)} with <b>${partner.name}</b> — you went solo as the favourite.</div>`;
}

/** The matchplay duel result panel for the result screen (the hole-by-hole scoreline + verdict). */
export function matchResultPanel(): string {
  const m = state.match;
  if (!m) return '';
  const st = matchState(m.duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const won = st.playerWon;
  const halved = st.halved;
  const verdict = won ? 'YOU WIN' : halved ? 'HALVED' : 'DEFEATED';
  const col = won ? '#5fd45a' : halved ? '#ffce54' : '#ff6b6b';
  const cells = m.duels
    .map((d) => {
      const c = d.winner === 'player' ? '#5fd45a' : d.winner === 'boss' ? '#ff6b6b' : '#6b7280';
      return `<span title="Hole ${d.holeIndex + 1}: you ${d.playerStrokes} v ${d.bossStrokes}" style="width:16px;height:16px;border-radius:3px;background:${c}33;border:1px solid ${c};font-size:9px;display:inline-flex;align-items:center;justify-content:center;color:${c};">${
        d.winner === 'player' ? 'W' : d.winner === 'boss' ? 'L' : '½'
      }</span>`;
    })
    .join('');
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        ${opponentBadge(m.bossId, duelModeLabel())}
        <div style="text-align:right;"><div style="font-size:18px;font-weight:900;color:${col};">${verdict}</div>
          <div style="font-size:13px;opacity:.85;">${matchScoreline(st)}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      <div style="font-size:11px;opacity:.6;margin-top:6px;">Hole-by-hole vs ${opp?.name ?? 'the leader'} — W win · L loss · ½ halved.</div>
      ${teamDuelCaption()}
    </div>`;
}

/** Live matchplay progress for the end-of-hole screen: the running scoreline + W/L/½ pips vs the boss,
 *  built from the holes finished so far against the boss's pre-played ball. */
export function holeMatchProgressHTML(playedSoFar: PlayedHole[]): string {
  const m = state.match;
  if (!m) return '';
  const duels = playedSoFar.map((p, i) => holeDuel(i, state.course.holes[i]!.par, p, m.bossHoles[i]!));
  const st = matchState(duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const line =
    st.holesUp > 0 ? `You ${matchScoreline(st)}` : st.holesUp < 0 ? `${opp?.shortName ?? 'Boss'} ${Math.abs(st.holesUp)} UP` : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  const last = duels[duels.length - 1];
  // In a player-side best-ball the counted score is the TEAM's (better of you + partner) — label it so.
  const youLbl = m.setup?.format === 'bestball' && m.setup.partnerSide === 'player' ? 'your side' : 'you';
  const lastLine = last
    ? `<div style="font-size:11.5px;opacity:.8;margin-top:6px;">This hole: ${youLbl} <b>${last.playerStrokes}</b> v <b>${last.bossStrokes}</b> ${opp?.shortName ?? 'Boss'} — ${last.winner === 'player' ? '<span style="color:#5fd45a;">won</span>' : last.winner === 'boss' ? '<span style="color:#ff6b6b;">lost</span>' : 'halved'}</div>`
    : '';
  const cells = duels
    .map((d) => {
      const c = d.winner === 'player' ? '#5fd45a' : d.winner === 'boss' ? '#ff6b6b' : '#6b7280';
      return `<span title="Hole ${d.holeIndex + 1}: you ${d.playerStrokes} v ${d.bossStrokes}" style="width:18px;height:18px;border-radius:3px;background:${c}33;border:1px solid ${c};font-size:10px;display:inline-flex;align-items:center;justify-content:center;color:${c};">${
        d.winner === 'player' ? 'W' : d.winner === 'boss' ? 'L' : '½'
      }</span>`;
    })
    .join('');
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        ${opponentBadge(m.bossId, duelModeLabel())}
        <div style="text-align:right;"><div style="font-size:17px;font-weight:900;color:${col};">${line}</div>
          <div style="font-size:11px;opacity:.7;">thru ${st.thru}/${state.course.holes.length}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      ${lastLine}
    </div>`;
}

/** The team-duel setup for the current stop (GS-team-duel) — prefers the live match state, else recompute. */
export function teamDuel(): TeamDuelSetup | undefined {
  return state.match?.setup ?? teamDuelSetupForRun(state.run);
}

/** A friendly label for a team-duel format. */
export function teamFormatLabel(fmt: 'bestball' | 'scramble'): string {
  return fmt === 'scramble' ? 'Scramble' : 'Best Ball';
}

/** A one-line rule reminder for a team-duel format. */
export function teamFormatRule(fmt: 'bestball' | 'scramble'): string {
  return fmt === 'scramble'
    ? 'both hit every shot, play on from the better ball'
    : 'both play your own ball; the better hole score counts';
}

/** The partner Character for a side of the team duel (player or boss), from the setup. */
export function teamPartnerChar(setup: TeamDuelSetup): Character | undefined {
  if (setup.partnerSide === 'player' && setup.playerPartnerId) return getCharacter(setup.playerPartnerId);
  if (setup.partnerSide === 'boss' && setup.bossPartnerId) return getCharacter(setup.bossPartnerId);
  return undefined;
}

/**
 * Best-ball end-of-hole REVEAL (GS-team-duel): the pair's two cards side by side — each ball's
 * strokes + score name — with the counting (better) one highlighted and badged. Ties keep the
 * player's ball (`betterPlayedHole` keeps the first). This is the moment the partner's hidden
 * parallel ball is shown, so the reveal lands with the hole, never mid-play.
 */
export function bestBallRevealHTML(raw: PlayedHole, partnerHole: PlayedHole, par: number): string {
  const duel = teamDuel();
  const partner = duel ? teamPartnerChar(duel) : undefined;
  const youChar = getCharacter(state.run.loadout.characterId ?? '');
  const partnerKept = partnerHole.record.strokes < raw.record.strokes;
  const card = (label: string, h: PlayedHole, kept: boolean, accent: string): string => {
    const rel = h.record.strokes - par;
    const col = h.pickedUp ? '#ff6b6b' : rel < 0 ? '#5fd45a' : rel === 0 ? 'var(--gs-ink)' : rel === 1 ? '#ffce54' : '#ff6b6b';
    return `<div style="flex:1 1 0;min-width:0;text-align:center;padding:12px 8px 9px;border-radius:10px;position:relative;
        border:2px solid ${kept ? accent : 'var(--gs-line-2)'};background:${kept ? `${accent}1a` : '#0d1016'};
        ${kept ? `box-shadow:0 0 14px ${accent}55;` : 'opacity:.62;'}">
      ${kept ? `<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:${accent};color:#0b0d12;font-size:9px;font-weight:800;letter-spacing:.08em;border-radius:5px;padding:1px 7px;white-space:nowrap;">✓ COUNTS</div>` : ''}
      <div style="font-size:11px;font-weight:700;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
      <div style="font-size:30px;font-weight:800;line-height:1.15;color:${col};">${h.pickedUp ? '—' : h.record.strokes}</div>
      <div style="font-size:11px;opacity:.75;">${h.pickedUp ? 'Picked up' : scoreName(par, h.record.strokes)}</div>
    </div>`;
  };
  return `<div style="max-width:460px;">
      <div style="display:flex;gap:10px;align-items:stretch;">
        ${card(`You · ${youChar?.name ?? 'Player'}`, raw, !partnerKept, youChar?.style.cap ?? '#5fd45a')}
        ${card(partner?.name ?? 'Partner', partnerHole, partnerKept, partner?.style.cap ?? '#7aa2ff')}
      </div>
      <div style="font-size:11px;opacity:.65;margin-top:8px;text-align:center;">🤝 Best ball — the better score is the team's for the hole.</div>
    </div>`;
}

/** A scouting note on the opponent — their style tagline (GS-team-duel / scouting line). */
export function opponentScouting(id: string): string {
  const g = getGolfer(id);
  if (!g) return '';
  return getArchetype(g.archetypeId).tagline;
}

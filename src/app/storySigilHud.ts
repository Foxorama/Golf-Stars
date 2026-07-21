/**
 * Story-Tour SIGIL live-competition HUD (GS-story-sigil-live) — the Sigil formats used to be scored only
 * at the halftime pop and the closing recap; the round itself read as a plain stroke card. These blocks
 * make the competition INTERACTIVE THROUGHOUT:
 *   • a live MATCH chip on the play HUD (matchplay Sigils — scoreline, thru, the rival's known card on
 *     the current hole, real-matchplay style, mirroring the boss-duel `matchHud`),
 *   • a per-hole MATCH panel on the end-of-hole screen (W/L/½ pips + this hole's duel + close-out call),
 *   • running TEAM STANDINGS vs the opposing pairs for the scramble/best-ball Sigils.
 * Everything reads `sigilMatchThrough`/`opposingField` — the SAME pure resolvers + streams the final
 * resolution uses — so the live state always agrees with the finished recap to the hole. Render-only:
 * zero sim rng, no reducer/save impact.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import {
  tournamentForChapter,
  sigilMatchThrough,
  teamFieldPairs,
  teamPartnerOrDefault,
  isTeamTournament,
  type StoryTournament,
  type SigilMatch,
} from '../sim/rpg/storyTournaments';
import { opposingField } from '../sim/rpg/storyTeams';
import { matchScoreline } from '../sim/rpg/match';
import type { PlayedHole } from '../sim/round';

/** The Sigil tournament of the CURRENT run, if this round is one. */
function currentSigil(): StoryTournament | undefined {
  if (!state.run.storyTournament) return undefined;
  return tournamentForChapter(state.run.storyTournament, state.story?.alignment);
}

/** The live match state over a set of finished holes (matchplay Sigils only). */
function sigilMatchOver(played: readonly PlayedHole[]): SigilMatch | undefined {
  const t = currentSigil();
  if (!t) return undefined;
  return sigilMatchThrough(
    t,
    state.story,
    played.map((p) => p.record.strokes),
    String(state.run.seed),
    state.course.holes.map((h) => h.par),
  );
}

/** The opponent's (side's) score on ONE hole, read off the SAME resolver streams (a dummy player stroke
 *  is appended — the opponent's card doesn't depend on it). Real matchplay: you can see the other ball. */
function sigilOpponentHoleScore(holeIndex: number): number | undefined {
  const t = currentSigil();
  if (!t) return undefined;
  const played = (state.stopPlayed ?? []).map((p) => p.record.strokes);
  const probe = [...played.slice(0, holeIndex), 9]; // earlier holes + a dummy for the hole in play
  const m = sigilMatchThrough(t, state.story, probe, String(state.run.seed), state.course.holes.map((h) => h.par));
  return m?.res.duels[holeIndex]?.bossStrokes;
}

/** The live MATCH chip for the play HUD (matchplay Sigils) — "⚔ vs Woo · 2 UP · thru 7", plus the
 *  opponent's known card on the hole being played. Empty on non-matchplay rounds. */
export function storySigilMatchChip(): string {
  const played = state.stopPlayed ?? [];
  const m = sigilMatchOver(played);
  if (!m) return '';
  const st = m.res.state;
  const oppShort = m.kind === 'team' && m.matchup ? `${m.matchup.oppNames[0].split(' ')[0]} & ${m.matchup.oppNames[1].split(' ')[0]}` : m.rival.name.split(' ')[0];
  const line =
    st.thru === 0 ? 'Tee it up' : st.holesUp > 0 ? `You ${matchScoreline(st)}` : st.holesUp < 0 ? `${oppShort} ${Math.abs(st.holesUp)} UP` : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  const play = state.play;
  let target = '';
  if (play && !play.done) {
    const opp = sigilOpponentHoleScore(play.holeIndex);
    if (opp !== undefined) {
      const rel = opp - play.hole.par;
      const relTxt = rel === 0 ? 'par' : rel > 0 ? `+${rel}` : `${rel}`;
      target = `<span style="font-size:10.5px;opacity:.85;">· ${m.kind === 'team' ? 'their ball:' : `${m.rival.name.split(' ')[0]} made`} <b>${opp}</b> (${relTxt})</span>`;
    }
  }
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 9px;border:1px solid ${col};border-radius:8px;background:#0d1016cc;flex-wrap:wrap;">
      <span style="font-size:11px;opacity:.7;">⚔ ${m.kind === 'team' ? 'Your side vs' : 'vs'} ${oppShort}</span>
      <span style="font-size:10px;opacity:.6;">${m.kind === 'team' ? '2v2 scramble matchplay' : 'Singles matchplay'}</span>
      <span style="font-size:13px;font-weight:800;color:${col};">${line}</span>
      <span style="font-size:10.5px;opacity:.6;">thru ${st.thru}/${state.course.holes.length}</span>
      ${target}
    </div>`;
}

/** The per-hole MATCH panel for the end-of-hole screen (matchplay Sigils): running scoreline + W/L/½
 *  pips + this hole's duel — and the close-out call the moment the match is decided. Empty otherwise. */
function sigilMatchProgressHTML(playedSoFar: PlayedHole[]): string {
  const m = sigilMatchOver(playedSoFar);
  if (!m) return '';
  const st = m.res.state;
  const oppShort =
    m.kind === 'team' && m.matchup ? `${m.matchup.oppNames[0].split(' ')[0]} & ${m.matchup.oppNames[1].split(' ')[0]}` : m.rival.name.split(' ')[0];
  const youLbl = m.kind === 'team' ? 'Your side' : 'You';
  const line = st.holesUp > 0 ? `${youLbl} ${matchScoreline(st)}` : st.holesUp < 0 ? `${oppShort} ${Math.abs(st.holesUp)} UP` : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  const cells = m.res.duels
    .map((d) => {
      const c = d.winner === 'player' ? '#5fd45a' : d.winner === 'boss' ? '#ff6b6b' : '#6b7280';
      return `<span title="Hole ${d.holeIndex + 1}: ${youLbl.toLowerCase()} ${d.playerStrokes} v ${d.bossStrokes}" style="width:18px;height:18px;border-radius:3px;background:${c}33;border:1px solid ${c};font-size:10px;display:inline-flex;align-items:center;justify-content:center;color:${c};">${
        d.winner === 'player' ? 'W' : d.winner === 'boss' ? 'L' : '½'
      }</span>`;
    })
    .join('');
  const last = m.res.duels[m.res.duels.length - 1];
  const lastLine = last
    ? `<div style="font-size:11.5px;opacity:.8;margin-top:6px;">This hole: ${youLbl.toLowerCase()} <b>${last.playerStrokes}</b> v <b>${last.bossStrokes}</b> ${oppShort} — ${
        last.winner === 'player' ? '<span style="color:#5fd45a;">won</span>' : last.winner === 'boss' ? '<span style="color:#ff6b6b;">lost</span>' : 'halved'
      }</div>`
    : '';
  // The match closes out the moment it's decided (up by more than remain) — call it here; the Continue
  // tap resolves straight to the recap instead of playing dead holes.
  const decided = st.decided
    ? `<div style="margin-top:8px;padding:7px 10px;border-radius:8px;background:${st.holesUp > 0 ? '#12251a' : '#2a1618'};border:1px solid ${st.holesUp > 0 ? '#2f6a44' : '#6a2f34'};font-size:12.5px;font-weight:800;color:${st.holesUp > 0 ? '#9dffce' : '#ffb0b0'};">
        ${st.holesUp > 0 ? '🏁 The match is won' : '🏁 The match is lost'} — ${matchScoreline(st)}. ${st.holesUp > 0 ? 'The Sigil is decided; walk in.' : 'It closes out here.'}
      </div>`
    : '';
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-size:12px;font-weight:800;color:#c98adf;">⚔ ${m.kind === 'team' ? `You & ${(m.matchup?.allyName ?? 'ally').split(' ')[0]} vs ${oppShort}` : `vs ${m.rival.name}`}</div>
        <div style="text-align:right;"><div style="font-size:17px;font-weight:900;color:${col};">${line}</div>
          <div style="font-size:11px;opacity:.7;">thru ${st.thru}/${state.course.holes.length}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      ${lastLine}
      ${decided}
    </div>`;
}

/** Running TEAM STANDINGS for the scramble/best-ball Sigils: your team's gross vs every opposing pair
 *  through the holes played — the same `opposingField` totals the resolution scores, prefix-consistent.
 *  `playedSoFar` must be the TEAM holes (the caller already folds the partner ball on best-ball). */
function sigilTeamStandingsHTML(playedSoFar: PlayedHole[]): string {
  const t = currentSigil();
  if (!t || !isTeamTournament(t) || !state.story) return '';
  const format = t.format as 'scramble' | 'bestball';
  const partnerId = teamPartnerOrDefault(state.story, state.run.storyTournamentPartner);
  const partnerName = getCharacter(partnerId)?.shortName ?? 'Partner';
  const pars = state.course.holes.map((h) => h.par);
  const n = Math.min(playedSoFar.length, pars.length);
  const yours = playedSoFar.slice(0, n).reduce((s, p) => s + p.record.strokes, 0);
  const field = opposingField(teamFieldPairs(t, state.story, partnerId), String(state.run.seed), pars, format, n);
  const rows = [{ id: '__you__', name: `You & ${partnerName}`, total: yours }, ...field]
    .sort((a, b) => a.total - b.total || (a.id === '__you__' ? -1 : b.id === '__you__' ? 1 : 0))
    .map((r, i) => {
      const you = r.id === '__you__';
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 10px;border-radius:6px;${you ? 'background:linear-gradient(90deg,#12251a,#0d1a13);font-weight:800;' : ''}">
          <span style="width:20px;text-align:right;color:#7c8aa0;font-variant-numeric:tabular-nums;">${i + 1}</span>
          <span style="flex:1 1 auto;min-width:0;color:${you ? '#9dffce' : '#c7d2e2'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${you ? '🏌 ' : ''}${r.name}</span>
          <span style="color:${you ? '#9dffce' : '#c7d2e2'};font-variant-numeric:tabular-nums;">${r.total}</span>
        </div>`;
    })
    .join('');
  return `<div style="border:1px solid #232b3b;border-radius:10px;padding:10px;background:#0b0f18;">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8aa0;margin-bottom:6px;">
        🤝 ${format === 'scramble' ? 'Scramble' : 'Best-ball'} standings · thru ${n} — beat the leading pair
      </div>
      ${rows}
    </div>`;
}

/**
 * The Sigil competition panel for the end-of-hole screen — the MATCH panel (matchplay Sigils) or the
 * TEAM standings (scramble/best-ball Sigils). `''` when this round isn't a Sigil (the caller falls back
 * to the ordinary stroke scorecard).
 */
export function storySigilProgressHTML(playedSoFar: PlayedHole[]): string {
  const t = currentSigil();
  if (!t) return '';
  const match = sigilMatchProgressHTML(playedSoFar);
  if (match) return match;
  return sigilTeamStandingsHTML(playedSoFar);
}

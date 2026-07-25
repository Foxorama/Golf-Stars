/**
 * Story-Tour live-competition HUD (GS-story-sigil-live) — the Sigil formats used to be scored only
 * at the halftime pop and the closing recap; the round itself read as a plain stroke card. These blocks
 * make the competition INTERACTIVE THROUGHOUT:
 *   • a live MATCH chip on the play HUD (matchplay — scoreline, thru, the opponent's known card on
 *     the current hole, real-matchplay style, mirroring the boss-duel `matchHud`),
 *   • a per-hole MATCH panel on the end-of-hole screen (W/L/½ pips + this hole's duel + close-out call),
 *   • running TEAM STANDINGS vs the opposing pairs for the scramble/best-ball Sigils.
 * Everything reads `sigilMatchThrough`/`qualifierMatchThrough`/`opposingField` — the SAME pure resolvers +
 * streams the final resolution uses — so the live state always agrees with the finished recap to the hole.
 * Render-only: zero sim rng, no reducer/save impact.
 *
 * GS-story-qualifier-match-live: a `pair-match` QUALIFYING EVENT is a real hole-by-hole match too, and it
 * used to play out blind — you learned the result on the recap. It now drives the identical surfaces. The
 * two sources produce one `LiveMatch` view (below) so there is a single renderer, not a forked one.
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
import { qualifierMatchThrough, qualifierMatchOpponents } from '../sim/rpg/storyQualifierFormats';
import { storyPartnerName } from '../sim/rpg/storyPartners';
import { opposingField } from '../sim/rpg/storyTeams';
import { matchScoreline } from '../sim/rpg/match';
import type { PlayedHole } from '../sim/round';

/**
 * One live matchplay view, whatever produced it — a Sigil (`sigilMatchThrough`) or a `pair-match` qualifier
 * (`qualifierMatchThrough`). The renderers below read ONLY this, so adding a third source later is a
 * builder, never a change to the chip or the panel.
 */
interface LiveMatch {
  /** The match resolution through the holes handed in (state + per-hole duels). */
  res: SigilMatch['res'];
  /** Short name for the other side ("Woo", "Bogey & Chip"). */
  oppShort: string;
  /** How to refer to your side ("You" / "Your side"). */
  youLbl: string;
  /** The format caption on the chip ("2v2 scramble matchplay"). */
  caption: string;
  /** The panel's headline ("You & Larry vs Bogey & Chip"). */
  title: string;
  /** True when your side is a PAIR — the opponent's per-hole number is "their ball", not "X made". */
  team: boolean;
  /** Your partner's short name, when your side is a pair — so the chip can say whose ball it is. */
  mateShort?: string;
}

/** The Sigil tournament of the CURRENT run, if this round is one. */
function currentSigil(): StoryTournament | undefined {
  if (!state.run.storyTournament) return undefined;
  return tournamentForChapter(state.run.storyTournament, state.story?.alignment);
}

/** GS-story-sigil5-play: the 2v2 finale is PLAYED as an interactive scramble, so the played strokes are
 *  already the side's team score — every live surface passes the same flag the final resolution uses. */
function sigilMatchOpts(): { teamPlayed: boolean; chosenAllyId?: string } {
  return { teamPlayed: state.run.storyTeamFormat === 'scramble', chosenAllyId: state.run.storyTournamentPartner };
}

/** The live view of a matchplay SIGIL over the given per-hole strokes. */
function sigilLiveMatch(strokes: readonly number[]): LiveMatch | undefined {
  const t = currentSigil();
  if (!t) return undefined;
  const m = sigilMatchThrough(t, state.story, strokes, String(state.run.seed), state.course.holes.map((h) => h.par), sigilMatchOpts());
  if (!m) return undefined;
  const team = m.kind === 'team';
  const first = (n: string): string => n.split(' ')[0] ?? n;
  const oppShort = team && m.matchup ? `${first(m.matchup.oppNames[0])} & ${first(m.matchup.oppNames[1])}` : first(m.rival.name);
  return {
    res: m.res,
    oppShort,
    youLbl: team ? 'Your side' : 'You',
    caption: team ? '2v2 scramble matchplay' : 'Singles matchplay',
    title: team ? `You & ${first(m.matchup?.allyName ?? 'ally')} vs ${oppShort}` : `vs ${m.rival.name}`,
    team,
    ...(team && m.matchup ? { mateShort: first(m.matchup.allyName) } : {}),
  };
}

/** GS-story-qualifier-match-live: the live view of a `pair-match` QUALIFYING EVENT over the given per-hole
 *  strokes — the same resolver + streams the recap scores, so the chip can never drift from the result. */
function qualifierLiveMatch(strokes: readonly number[]): LiveMatch | undefined {
  const plan = state.run.storyQualifier;
  if (!plan || plan.format !== 'pair-match') return undefined;
  const pars = state.course.holes.map((h) => h.par);
  const res = qualifierMatchThrough(plan, strokes, pars, String(state.run.seed));
  if (!res) return undefined;
  const oppShort = qualifierMatchOpponents(plan, pars.reduce((a, b) => a + b, 0))
    .split(' & ')
    .map((n) => n.split(' ')[0] ?? n)
    .join(' & ');
  const mate = storyPartnerName(plan.partnerId);
  return {
    res,
    oppShort,
    youLbl: 'Your side',
    caption: `Two-ball ${plan.pairing === 'scramble' ? 'scramble' : 'best-ball'} matchplay`,
    title: `You & ${mate} vs ${oppShort}`,
    team: true,
    mateShort: mate,
  };
}

/** The live match for THIS round, from whichever source applies. Undefined on a non-matchplay round. */
function liveMatch(strokes: readonly number[]): LiveMatch | undefined {
  return sigilLiveMatch(strokes) ?? qualifierLiveMatch(strokes);
}

/** The opposing side's ball AND your partner's ball on ONE hole, read off the SAME resolver streams (a
 *  dummy player stroke is appended — neither the opponents' nor the partner's ghost card depends on it).
 *  Real matchplay: you can see the other balls.
 *
 *  GS-story-partner-ball: the chip used to show ONLY `their ball`, which in a two-ball best-ball is the
 *  less useful half — you can already see your own card, but you had no idea what your partner made, so
 *  you couldn't tell what your side's number even was. */
function otherBallsOnHole(holeIndex: number): { opp?: number; mate?: number } {
  const played = (state.stopPlayed ?? []).map((p) => p.record.strokes);
  const probe = [...played.slice(0, holeIndex), 9]; // earlier holes + a dummy for the hole in play
  const duel = liveMatch(probe)?.res.duels[holeIndex];
  return { opp: duel?.bossStrokes, mate: duel?.mateStrokes };
}

/** The live MATCH chip for the play HUD (any matchplay round — a Sigil or a `pair-match` qualifier) —
 *  "⚔ vs Woo · 2 UP · thru 7", plus the opponent's known card on the hole being played. Empty otherwise. */
export function storySigilMatchChip(): string {
  const m = liveMatch((state.stopPlayed ?? []).map((p) => p.record.strokes));
  if (!m) return '';
  const st = m.res.state;
  const line =
    st.thru === 0 ? 'Tee it up' : st.holesUp > 0 ? `You ${matchScoreline(st)}` : st.holesUp < 0 ? `${m.oppShort} ${Math.abs(st.holesUp)} UP` : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  const play = state.play;
  let target = '';
  if (play && !play.done) {
    const { opp, mate } = otherBallsOnHole(play.holeIndex);
    const rel = (n: number): string => {
      const d = n - play.hole.par;
      return d === 0 ? 'par' : d > 0 ? `+${d}` : `${d}`;
    };
    const parts: string[] = [];
    // Your partner's ball FIRST — in a pairs format it's the half you can't see for yourself, and it's
    // what tells you whether you still need this hole (GS-story-partner-ball).
    if (mate !== undefined) {
      parts.push(`<span style="font-size:10.5px;opacity:.85;">· ${m.mateShort ?? 'partner'}: <b>${mate}</b> (${rel(mate)})</span>`);
    }
    if (opp !== undefined) {
      parts.push(`<span style="font-size:10.5px;opacity:.85;">· ${m.team ? 'their ball:' : `${m.oppShort} made`} <b>${opp}</b> (${rel(opp)})</span>`);
    }
    target = parts.join('');
  }
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 9px;border:1px solid ${col};border-radius:8px;background:#0d1016cc;flex-wrap:wrap;">
      <span style="font-size:11px;opacity:.7;">⚔ ${m.team ? 'Your side vs' : 'vs'} ${m.oppShort}</span>
      <span style="font-size:10px;opacity:.6;">${m.caption}</span>
      <span style="font-size:13px;font-weight:800;color:${col};">${line}</span>
      <span style="font-size:10.5px;opacity:.6;">thru ${st.thru}/${state.course.holes.length}</span>
      ${target}
    </div>`;
}

/** The per-hole MATCH panel for the end-of-hole screen (any matchplay round): running scoreline + W/L/½
 *  pips + this hole's duel — and the close-out call the moment the match is decided. Empty otherwise. */
function sigilMatchProgressHTML(playedSoFar: PlayedHole[]): string {
  const m = liveMatch(playedSoFar.map((p) => p.record.strokes));
  if (!m) return '';
  const st = m.res.state;
  const oppShort = m.oppShort;
  const youLbl = m.youLbl;
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
        ${st.holesUp > 0 ? '🏁 The match is won' : '🏁 The match is lost'} — ${matchScoreline(st)}. ${st.holesUp > 0 ? 'It\u2019s decided; walk in.' : 'It closes out here.'}
      </div>`
    : '';
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="font-size:12px;font-weight:800;color:#c98adf;">⚔ ${m.title}</div>
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
  // The MATCH panel first — it serves a matchplay Sigil AND a `pair-match` qualifier — then the Sigil-only
  // team standings. Both builders self-gate, so a round that is neither returns '' and the caller falls
  // back to the ordinary stroke scorecard.
  return sigilMatchProgressHTML(playedSoFar) || sigilTeamStandingsHTML(playedSoFar);
}

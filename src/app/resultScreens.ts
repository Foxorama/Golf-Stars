/**
 * The post-golf screens: the post-stop recap (GS-result), the boss-reward pick (GS-talents), the
 * gameover recap, and the voyage-victory payload (GS-victory). All pure renders off the live state
 * — no rng, no save; the celebrations themselves live in `render/celebrations.ts`.
 */

import { btn, freshRunSeed, header, state } from './ctx';
import { burst, rarityFlavour } from './helpers';
import { currentOpponentId, matchResultPanel } from './duelHud';
import { scoreName } from '../sim/score';
import { rarCol } from '../sim/rpg/loot';
import { zoneProfile } from '../sim/course/zones';
import { archetypeFor, themeById } from '../sim/course/themes';
import { ASCENSION_MAX, holeGateArmed } from '../sim/rpg/run';
import { leaderboard } from '../sim/rpg/league';
import { getGolfer } from '../sim/rpg/golfers';
import { getCharacter } from '../sim/rpg/characters';
import { golferSVG, leaderboardHTML, ordinal } from '../render/golferCards';
import { endlessRecordsBoard, endlessScoreCard } from '../render/endlessCards';
import { nextEndlessUnlock } from '../sim/rpg/endless';
import { bagUnlockForClearedAscension } from '../sim/rpg/bag';
import { drawGolfBag } from '../render/itemArt';
import type { showVoyageVictory } from '../render/celebrations';

/** One big stat tile for the stop-result header (label over a large value), mirroring the intro's
 *  stat language + the Unending-Universe score card so the recap reads at a glance. */
function resultStat(label: string, value: string, col: string, sub = ''): string {
  return `<div class="gs-result-stat">
    <div class="gs-result-stat-v" style="color:${col};">${value}</div>
    <div class="gs-result-stat-l">${label}</div>
    ${sub ? `<div class="gs-result-stat-s">${sub}</div>` : ''}
  </div>`;
}

/** The round, hole by hole (GS-result): a clickable strip of hole cards — strokes, par and the
 *  score relative to par, tinted eagle-gold → blow-up-red (the `holePips` palette). Tapping a hole
 *  drives the replay below it (the `viewHole` action, selected hole ringed). This is the golf-soul
 *  journey of the stop, promoted out of the old collapsed `<details>` scorecard. */
function roundStrip(): string {
  if (!state.played || state.played.length === 0) return '';
  const cards = state.played
    .map((p, i) => {
      const sel = i === state.viewHole;
      const r = p.record;
      const rel = r.strokes - r.par;
      const col = p.pickedUp
        ? '#b3402f'
        : rel <= -2 ? '#ffd54a' : rel === -1 ? '#5fd45a' : rel === 0 ? '#9fd8e6' : rel === 1 ? '#ffc454' : '#ff6b6b';
      const relLabel = p.pickedUp ? '✕' : rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;
      const name = p.pickedUp ? 'Picked up' : scoreName(r.par, r.strokes);
      return `<button class="gs-round-hole${sel ? ' gs-round-hole--sel' : ''}" style="--hc:${col};"
          data-action='${JSON.stringify({ type: 'viewHole', hole: i })}' title="Hole ${i + 1} · par ${r.par} · ${r.strokes} strokes — ${name}. Tap to replay.">
        <span class="gs-round-no">H${i + 1}</span>
        <span class="gs-round-strokes">${r.strokes}</span>
        <span class="gs-round-par">par ${r.par}</span>
        <span class="gs-round-name">${relLabel}</span>
      </button>`;
    })
    .join('');
  return `<div class="gs-round" role="group" aria-label="Your round, hole by hole — tap a hole to replay it">${cards}</div>`;
}

/**
 * The post-stop recap (GS-result): built to the same quality bar as the arc/hole intro — a
 * rarity-framed panel with a verdict badge over the world you just played, big stat tiles (Stableford
 * / gross / cut-or-place / credits), the round hole-by-hole (tap to replay), then the standings and a
 * full-width Continue. The Unending Universe keeps its golf-score card + records board; the Voyage/
 * match paths get the new tiles + round strip. Pure render off `state` — no rng, no save.
 */
export function resultScreen(): string {
  const res = state.lastResult!;
  const c = state.course;
  const gate = holeGateArmed(state.run);
  const passed = res.passed;
  const col = rarCol(c.rarity);
  const rar = rarityFlavour(c.rarity);
  const zone = zoneProfile(archetypeFor(c.meta.themeId, c.biome));
  const theme = c.meta.themeId ? themeById(c.meta.themeId) : undefined;
  const par = c.holes.reduce((s, h) => s + h.par, 0);

  const verdict = state.match
    ? passed
      ? 'MATCH WON'
      : 'MATCH LOST'
    : gate
      ? passed
        ? 'SET SURVIVED'
        : 'THE UNIVERSE WINS'
      : passed
        ? 'MADE THE CUT'
        : 'MISSED CUT';
  const vcol = passed ? '#5fd45a' : '#ff6b6b';

  // The continue-to-shop CTA — surfaced BOTH at the top (right of the verdict, no scroll needed) and
  // full-width at the bottom (GS-result-nav). Same label/action either way.
  const continueLabel = state.bossReward && state.bossReward.length ? '🏆 Claim your reward →' : 'Continue → shop';
  const continueBtn = (variant: 'primary' | 'ghost'): string =>
    btn(continueLabel, { type: 'continue' }, { variant });

  const head = `<div class="gs-result-head">
      <div style="min-width:0;">
        <div class="gs-result-eyebrow">Stop ${res.stopIndex + 1} · ${passed ? 'cleared' : 'ended'}</div>
        <div class="gs-result-world">${zone.name}</div>
        <div class="gs-result-sub">${zone.signature}${theme ? ` · ${theme.name}` : ''} · par ${par} · ${c.holes.length} holes</div>
      </div>
      <div class="gs-result-vwrap">
        <div class="gs-result-verdict" style="color:${vcol};border-color:${vcol};background:${vcol}12;">${verdict}</div>
        <div class="gs-result-rar" style="color:${col};">${rar.glyph} ${c.rarity}</div>
        <div class="gs-result-continue gs-result-continue--top">${continueBtn('primary')}</div>
      </div>
    </div>`;

  // The scoring block: the Unending Universe stays on its golf-score card + records board; the
  // Voyage/match paths get the stat tiles + the standings.
  let body: string;
  if (gate) {
    const r = state.run;
    const setLine = `<p style="font-size:12.5px;opacity:.82;margin:0;">This set · gross <b>${res.gross}</b> · <b>+${res.creditsEarned}</b> credits${
      res.aces ? ` · ⛳ ${res.aces} ace${res.aces > 1 ? 's' : ''}` : ''
    }</p>`;
    body =
      endlessScoreCard(
        { holes: r.holesSurvived, gross: r.grossStrokes, par: r.parPlayed, tier: r.bagTier ?? 'common' },
        { title: 'Round so far', next: true },
      ) +
      setLine +
      endlessRecordsBoard(state.endlessRuns, { currentTier: r.bagTier ?? 'common', title: 'Your recent runs' });
  } else {
    const board = leaderboard(state.run);
    const positional = board.mode === 'positional';
    const me = board.standings.find((s) => s.isPlayer);
    const target = board.survivorTarget ?? board.survivors ?? board.standings.length;
    const made = res.stableford >= res.cut;
    const tiles = [
      resultStat('STABLEFORD', String(res.stableford), passed ? '#5fd45a' : '#ff6b6b'),
      resultStat('GROSS', String(res.gross), 'var(--gs-ink)'),
      // A positional voyage stop survives on your PLACE (not the Stableford cut) — show it; a
      // matchplay boss is decided in the panel below, so give it the aces/credits slot instead.
      ...(state.match
        ? []
        : positional && me
          ? [resultStat('PLACE', ordinal(me.position), me.position <= target ? '#5fd45a' : '#ffc454', `of ${board.standings.length}`)]
          : [resultStat('CUT', String(res.cut), made ? '#5fd45a' : '#ff6b6b', made ? 'made' : 'missed')]),
      resultStat('CREDITS', `+${res.creditsEarned}`, '#ffce54', res.aces ? `⛳ ${res.aces} ace${res.aces > 1 ? 's' : ''}` : ''),
    ].join('');
    const through = positional ? (board.survivorTarget ? ` · top ${board.survivorTarget} advance` : '') : ` · ${board.survivors} make it through`;
    const place = me
      ? `<p style="font-size:13px;margin:0;">You're <b style="color:${me.position <= target ? '#5fd45a' : 'var(--gs-ink)'};">${ordinal(me.position)}</b> of ${board.standings.length}${through}.</p>`
      : '';
    body =
      `<div class="gs-result-stats">${tiles}</div>` +
      (state.match ? matchResultPanel() : '') +
      place +
      leaderboardHTML(board);
  }

  const replay = `<div class="gs-result-replay">
      <div id="play" class="gs-replay" style="border:1px solid var(--gs-line);border-radius:var(--gs-r);overflow:hidden;box-shadow:var(--gs-shadow);"></div>
      <div class="gs-result-replay-ctl">
        ${btn('↻ Replay', { type: 'viewHole', hole: state.viewHole }, { variant: 'ghost' })}
        <span>Hole ${state.viewHole + 1}${state.played ? ` of ${state.played.length}` : ''}</span>
      </div>
    </div>`;

  return `
    ${header()}
    <article class="gs-panel gs-result" style="border-color:${col}${rar.strong ? 'aa' : '66'};box-shadow:0 0 ${rar.glow}px ${col}${rar.strong ? '44' : '22'};">
      ${passed ? burst() : ''}
      ${head}
      ${body}
      <div class="gs-result-secl">⛳ Your round — tap a hole to replay it</div>
      ${roundStrip()}
      ${replay}
      <div class="gs-result-continue">${continueBtn('primary')}</div>
    </article>`;
}

/** The boss-reward screen (GS-talents): pick ONE of a few thematic spoils after beating a boss — a
 *  run TALENT or a permanent Star-Shard reward. Clicking a card claims it and continues to the shop. */
export function bossRewardScreen(): string {
  const rewards = state.bossReward ?? [];
  const oppId = state.match?.bossId ?? currentOpponentId();
  const opp = oppId ? getGolfer(oppId) : undefined;
  const cards = rewards
    .map((r, i) => {
      const col = rarCol(r.rarity);
      const icon = r.kind === 'shards' ? '✦' : '🌟';
      return `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'pickBossReward', index: i })}'
          style="cursor:pointer;flex:1 1 200px;min-width:200px;max-width:280px;border:1px solid ${col};border-radius:12px;
          padding:14px;background:linear-gradient(180deg,${col}14,#0d1016);">
        <div style="font-size:26px;line-height:1;">${icon}</div>
        <div style="font-size:15px;font-weight:800;margin-top:8px;">${r.name}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:${col};margin-top:2px;">${
          r.kind === 'shards' ? 'Permanent reward' : 'Run talent'
        } · ${r.rarity}</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:8px;line-height:1.4;">${r.desc}</div>
      </div>`;
    })
    .join('');
  return `
    ${header()}
    <section style="max-width:680px;position:relative;">
      ${burst()}
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        ${opp ? `<div style="line-height:0;border:2px solid #ffce54;border-radius:10px;background:#1a0e12;padding:2px;">${golferSVG(opp.look, 44, 54)}</div>` : ''}
        <div>
          <h2 style="font-size:20px;margin:.1em 0;color:#ffce54;">🏆 Victory Spoils</h2>
          <p style="font-size:13px;opacity:.8;margin:0;">You beat ${opp?.name ?? 'the boss'} — choose your reward. A <b>talent</b> powers up the rest of this run; <b>Star Shards</b> are permanent.</p>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">${cards}</div>
    </section>`;
}

/** Assemble the voyage-victory takeover's payload (GS-victory) from the finished run + the meta deltas
 *  `runEndUpdates` just banked. `lastClubUnlock` is set ONLY on a genuinely new Ascension clear (a higher
 *  `maxAscension`) — so its presence is the signal to hero the "new tier unlocked" banner. Presentation-
 *  only: resolves display strings + colours here, keeping `celebrations.ts` free of sim/loot imports. */
export function victoryInfo(): Parameters<typeof showVoyageVictory>[0] {
  const r = state.run;
  const unlock = state.lastClubUnlock; // present ⇔ a NEW tier was cleared this run
  const isNewClear = unlock !== undefined;
  const bagUnlock = bagUnlockForClearedAscension(r.ascension);
  // A stable numeric confetti seed from the (number|string) run seed.
  const seedNum = Number.isFinite(Number(r.seed))
    ? Number(r.seed)
    : [...String(r.seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 0);
  return {
    golferName: getCharacter(r.loadout.characterId)?.shortName ?? 'Your golfer',
    ascension: r.ascension,
    tierUnlocked: isNewClear && r.ascension < ASCENSION_MAX ? r.ascension + 1 : undefined,
    atMaxAscension: r.ascension >= ASCENSION_MAX,
    club:
      unlock?.kind === 'club'
        ? { name: unlock.clubName, rarity: unlock.rarity, color: rarCol(unlock.rarity) }
        : undefined,
    consolationShards: unlock?.kind === 'shards' ? unlock.shards : undefined,
    bag: bagUnlock ? { name: bagUnlock.name, cost: bagUnlock.cost, color: rarCol(bagUnlock.tier) } : undefined,
    shardsEarned: state.lastRunShards ?? 0,
    shardsTotal: state.shards,
    seed: seedNum,
  };
}

export function gameoverScreen(): string {
  const r = state.run;
  const earned = state.lastRunShards;
  const banked = r.endedReason === 'banked';
  const won = r.endedReason === 'won';
  const stranded = r.endedReason === 'stranded';
  const gate = holeGateArmed(r);
  const heading = won
    ? `<h2 style="font-size:22px;color:#ffce54;">🏆 Voyage complete — you won the Galactic Major!</h2>`
    : banked
    ? `<h2 style="font-size:20px;color:#5fd45a;">Banked — you quit while ahead</h2>`
    : stranded
    ? `<h2 style="font-size:20px;color:#ff6b4a;">🆘 Stranded — the ship ran dry in deep space</h2>`
    : gate
    ? `<h2 style="font-size:20px;color:#ff6b6b;">Run over — the universe caught you at hole ${r.holesSurvived + 1}</h2>`
    : `<h2 style="font-size:20px;color:#ff6b6b;">Run over — stranded at the cut</h2>`;
  const unlock =
    won && r.ascension < ASCENSION_MAX
      ? `<p style="font-size:14px;color:#ffce54;">⚔ Ascension <b>A${r.ascension}</b> cleared — <b>A${r.ascension + 1}</b> unlocked. Start the next voyage tougher.</p>`
      : won && r.ascension >= ASCENSION_MAX
      ? `<p style="font-size:14px;color:#ffce54;">⚔ You cleared the TOP Ascension (A${r.ascension}). Legendary.</p>`
      : '';
  // A cleared Ascension gate (A2/A6/A11) unlocks a new default-bag tier in the Trade Market (GS-bag-tiers).
  const bagUnlock = won ? bagUnlockForClearedAscension(r.ascension) : undefined;
  const bagNotice = bagUnlock
    ? `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid ${rarCol(bagUnlock.tier)};border-radius:8px;background:#ffffff08;display:flex;align-items:center;gap:9px;">
         <div style="width:56px;flex:0 0 auto;">${drawGolfBag(bagUnlock.tint, bagUnlock.tier)}</div>
         <div style="font-size:13px;"><b style="color:${rarCol(bagUnlock.tier)};">🎒 New bag unlocked!</b> Clearing ${bagUnlock.gateLabel} unlocks the <b>${bagUnlock.name}</b> at the Trade Market — upgrade <b>every</b> golfer's starting bag to ${bagUnlock.tier} for <b>✦ ${bagUnlock.cost}</b> Star Shards.</div>
       </div>`
    : '';
  // Ascension victory club unlock (GS-ascension-clubs): the played golfer permanently gains a new
  // starting club (or a Shard consolation if their bag is already full).
  const clubUnlock = state.lastClubUnlock;
  const golferName = getCharacter(r.loadout.characterId)?.shortName ?? 'your golfer';
  const clubNotice =
    won && clubUnlock
      ? clubUnlock.kind === 'club'
        ? `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid ${rarCol(clubUnlock.rarity)};border-radius:8px;background:#ffffff08;">
             <span style="font-size:13px;"><b style="color:${rarCol(clubUnlock.rarity)};">⛳ New club unlocked!</b> <b>${golferName}</b> permanently adds a ${clubUnlock.rarity} <b>${clubUnlock.clubName}</b> to their starting bag — kept for every future run with them.</span>
           </div>`
        : `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid var(--gs-gold);border-radius:8px;background:#ffffff08;">
             <span style="font-size:13px;"><b style="color:var(--gs-gold);">🎒 Bag complete!</b> <b>${golferName}</b> already carries every club, so your victory pays a bonus <b>✦ ${clubUnlock.shards}</b> Star Shards.</span>
           </div>`
      : '';
  // The Unending Universe's final GOLF ROUND (GS-golf-score): the round card + the personal last-runs
  // leaderboard (which now includes this just-finished run, prepended by `runEndUpdates`).
  const endlessCard = gate
    ? endlessScoreCard(
        { holes: r.holesSurvived, gross: r.grossStrokes, par: r.parPlayed, tier: r.bagTier ?? 'common' },
        { title: 'Final round' },
      )
    : '';
  const endlessBoard = gate
    ? endlessRecordsBoard(state.endlessRuns, { currentTier: r.bagTier ?? 'common', title: 'Your last runs' })
    : '';
  // The Unending Universe's ledger (GS-unending): the run's survived-hole count IS the score.
  const endlessRecap = gate
    ? `<p style="font-size:15px;">🌌 You survived <b>${r.holesSurvived}</b> hole${r.holesSurvived === 1 ? '' : 's'} of the Unending Universe${
        r.holesSurvived >= state.endlessBestHoles && r.holesSurvived > 0 ? ' — <b style="color:#4fe08a;">a new best!</b>' : state.endlessBestHoles > 0 ? ` (best: ${state.endlessBestHoles})` : ''
      }${(() => {
        const next = nextEndlessUnlock(state.endlessBestHoles);
        return next ? ` · next unlock: <b>${next.secret ? '? ? ?' : next.name}</b> at hole ${next.holes}` : '';
      })()}.</p>`
    : '';
  const reached =
    (won
      ? `<p style="font-size:15px;">You cleared all three arcs${r.ascension > 0 ? ` at Ascension A${r.ascension}` : ''} and cashed out <b>${r.credits}</b> credits with a champion's bonus.</p>`
      : `<p style="font-size:15px;">You reached <b>stop ${r.stopIndex + 1}</b>, distance <b>${r.distanceFromStart}</b>${banked ? `, and cashed out <b>${r.credits}</b> credits` : ''}.</p>`) +
    endlessRecap +
    unlock;
  return `
    ${header()}
    ${heading}
    ${endlessCard}
    ${reached}
    ${clubNotice}
    ${bagNotice}
    ${earned !== undefined ? `<p style="font-size:15px;color:#e08a2b;">✦ Earned <b>${earned}</b> Star Shards · ${state.shards} banked</p>` : ''}
    ${gate ? '' : `<p style="opacity:.8;">Best ever: distance <b>${state.bestDistance}</b>, Stableford <b>${state.bestStableford}</b>.</p>`}
    ${endlessBoard}
    <div style="margin-top:8px;">
      ${btn('🚀 Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}
      ${btn('🚀 New run', { type: 'restart', seed: freshRunSeed() }, { variant: 'primary' })}
    </div>`;
}

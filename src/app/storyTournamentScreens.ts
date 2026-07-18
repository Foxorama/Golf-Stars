/**
 * The Story-Tour GALAXY TOURNAMENT screens (GS-story-tournament) — the chapter climax. The LOBBY (reached
 * from the clubhouse when a tournament is unlocked) sets the stage: the host, the recurring rival, the
 * Sigil + prize at stake, and the tee-off. The RESULT recap resolves it: beat the rival's gross and you win
 * the Sigil (chapter advances, next worlds unlock); the fifth Sigil forges the key to the finale. Built
 * from design tokens + a self-contained `.gs-tourn*` style block (own prefix). Reads the live `state`.
 */

import { state } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { STORY_CHAPTER_COUNT } from '../sim/rpg/story';
import { currentTournament, sigilCount, tournamentCompetitors } from '../sim/rpg/storyTournaments';
import { venomaPortraitSVG, vossPortraitSVG, driverDanPortraitSVG } from '../render/loreArt';
import { penelopePortraitSVG } from '../render/caddyPortraits';

/** The rival's glyph for the field/lobby (a portrait shows when one exists; else this reads them). */
function rivalGlyph(rivalId: string): string {
  return rivalId === 'venoma' ? '🐍' : rivalId === 'voss' ? '🖤' : rivalId === 'driver-dan' ? '🎒' : rivalId === 'penelope' ? '⛳' : '🏌';
}

/** A bespoke portrait bust for the rivals that have one (the cult champions + the two former-ally rivals);
 *  '' for a rival without one (the lobby falls back to a big glyph emblem). */
function rivalPortraitSVG(rivalId: string): string {
  switch (rivalId) {
    case 'venoma':
      return venomaPortraitSVG();
    case 'voss':
      return vossPortraitSVG();
    case 'driver-dan':
      return driverDanPortraitSVG();
    case 'penelope':
      return penelopePortraitSVG();
    default:
      return '';
  }
}

/** GS-story-tournament-midpop: the halftime line — the rival BRAGS when they're ahead, or CURSES you when
 *  you're beating them. Keyed by rival, generic fall-through. Content-as-data. */
function rivalHalftimeLine(rivalId: string, brag: boolean): string {
  const lines: Record<string, [brag: string, curse: string]> = {
    venoma: [
      '"Nine holes, and I already smell the fear on you. Save yourself the back nine, little Warden."',
      '"You’re… ahead? No. NO. A lucky front nine. The Viper does not lose to a tourist. Watch me."',
    ],
    voss: [
      '"You see? The true line comes so easily when you stop pretending it’s a game. Nine more, and you’ll understand."',
      '"You play beautifully when you’re angry. Good. Hold onto that. It’s the first honest thing I’ve seen you do."',
    ],
    'driver-dan': [
      '"…I taught you the front nine, kid. Don’t make me teach you the back nine too. Sit DOWN."',
      '"Ha! There he is. THERE’s my golfer. Come on then — beat the old man. I dare you. Break my heart."',
    ],
    penelope: [
      '"Your pace is frantic. Your reads are panicked. You already lost, dear — you just haven’t stopped moving yet."',
      '"You’re still ahead. Still fighting. …I read putts for you once. I know you never could let go. It will cost you."',
    ],
  };
  const pair = lines[rivalId] ?? [
    '"Front nine to the champion. Do yourself a favour and concede the back."',
    '"You’re up on the club champion? At MY course? …We’ll see how your nerve holds."',
  ];
  return brag ? pair[0] : pair[1];
}

/** A menacing / characterful pre-round taunt from the rival — hype for the tee-off. Keyed by rival, with a
 *  generic fall-through for the club champion. Content-as-data; a new rival is a row. */
function rivalTaunt(rivalId: string): string {
  switch (rivalId) {
    case 'venoma':
      return '"Another Sigil for the Warden? How quaint. I do so enjoy taking things from the hopeful."';
    case 'voss':
      return '"I am not here to beat you. I am here so you finally SEE. Play. Watch what the true line costs."';
    case 'driver-dan':
      return '"Don’t make me do this, kid. …Fine. Come on then. Show me the Parrot was wrong about you."';
    case 'penelope':
      return '"I read your putts for a hundred worlds. I know exactly how you miss. Come and be still with me."';
    default:
      return '"The club champion doesn’t lose at home. Nice of you to travel all this way to watch."';
  }
}

export function storyTournamentScreen(): string {
  const story = state.story;
  const t = story ? currentTournament(story) : undefined;
  if (!story || !t) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🏆 Galaxy Tournament</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryTournament' })}'>‹ Back</button>
      </div>`;
  }
  const who = getCharacter(story.characterId)?.name ?? 'Champion';
  const whoShort = getCharacter(story.characterId)?.shortName ?? 'You';
  const intro = t.intro.map((p) => `<p class="gs-tourn-lore">${p}</p>`).join('');
  const portrait = rivalPortraitSVG(t.rivalId);
  // GS-story-tournament-field: the field you'll play — the rival, your three friends, and you.
  const competitors = tournamentCompetitors(t, story.characterId);
  const fieldChips = [
    ...competitors.map(
      (c) =>
        `<span class="gs-tourn-fc gs-tourn-fc--${c.kind}">${c.kind === 'rival' ? rivalGlyph(c.id) : '🤝'} ${c.name}</span>`,
    ),
    `<span class="gs-tourn-fc gs-tourn-fc--you">🏌 ${whoShort}</span>`,
  ].join('');
  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title gs-tourn-in gs-tourn-in1">🏆 ${t.name}</h1>
      <p class="gs-hero-tag gs-tourn-in gs-tourn-in1">Chapter ${t.chapter} of ${STORY_CHAPTER_COUNT} · hosted by ${t.host}</p>
      <div class="gs-hero-chips gs-tourn-in gs-tourn-in2">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="the trophy at stake">🏅 <b>${t.sigilName}</b></span>
        <span class="gs-chip" style="border-color:#2a3a2a;color:#7fe0a0;font-size:14px;" title="Sigils won">🏆 <b>${sigilCount(story)}</b> / ${STORY_CHAPTER_COUNT}</span>
      </div>
    </header>
    <section style="max-width:520px;margin:8px auto 0;">
      <div class="gs-tourn-card gs-tourn-in gs-tourn-in2">
        <div class="gs-tourn-portrait">${portrait || `<div class="gs-tourn-emblem">${rivalGlyph(t.rivalId)}</div>`}</div>
        <div class="gs-tourn-cardbody">
          <div class="gs-tourn-rivallabel">Your rival</div>
          <div class="gs-tourn-rivalname">${t.rivalName}</div>
          <p class="gs-tourn-taunt">${rivalTaunt(t.rivalId)}</p>
        </div>
      </div>
      <div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3">
        <div class="gs-tourn-fieldlabel">The field</div>
        <div class="gs-tourn-field">${fieldChips}</div>
      </div>
      <div class="gs-tourn-in gs-tourn-in3">${intro}</div>
      <div class="gs-tourn-prize gs-tourn-in gs-tourn-in4"><b>🎁 Prize:</b> ${t.prize}</div>
      <div class="gs-tourn-stakes gs-tourn-in gs-tourn-in4">Beat ${t.rivalName.split(' ')[0]}’s round over 18 holes, ${who}, and the ${t.sigilName} is yours.</div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:16px auto 0;">
      <button class="gs-btn gs-tourn-in gs-tourn-in5" data-action='${JSON.stringify({ type: 'storyPlayTournament' })}'>⛳ Tee off — play for the Sigil</button>
      <button class="gs-btn gs-btn--ghost gs-tourn-in gs-tourn-in5" data-action='${JSON.stringify({ type: 'exitStoryTournament' })}'>‹ Not yet — back to the clubhouse</button>
    </div>
    ${TOURN_STYLE}`;
}

/**
 * GS-story-tournament-midpop: the HALFTIME pop of an 18-hole major — after nine holes, the rival struts
 * on: BRAGGING if they're ahead, or CURSING you if you're beating them, with the standing through nine.
 * A quick dramatic beat, then "Play on ›" resumes the back nine. Reads `state.storyTournamentMidPop`.
 */
export function storyTournamentPopScreen(): string {
  const p = state.storyTournamentMidPop;
  if (!p) {
    return `<div style="max-width:420px;margin:24px auto 0;"><button class="gs-btn" data-action='${JSON.stringify({ type: 'tournamentPopContinue' })}'>Play on ›</button></div>`;
  }
  const portrait = rivalPortraitSVG(p.rivalId);
  const diff = p.playerThru - p.rivalThru;
  const standing = p.brag
    ? `${p.rivalName.split(' ')[0]} leads you by ${diff} through nine.`
    : diff === 0
      ? `You’re level with ${p.rivalName.split(' ')[0]} through nine.`
      : `You lead ${p.rivalName.split(' ')[0]} by ${-diff} through nine.`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title gs-tourn-in gs-tourn-in1">⛳ The turn</h1>
      <p class="gs-hero-tag gs-tourn-in gs-tourn-in1">Nine holes down, nine to play</p>
    </header>
    <section style="max-width:520px;margin:10px auto 0;">
      <div class="gs-tourn-card gs-tourn-in gs-tourn-in2" style="${p.brag ? '' : 'border-left-color:#4fe08a;'}">
        <div class="gs-tourn-portrait">${portrait || `<div class="gs-tourn-emblem">${rivalGlyph(p.rivalId)}</div>`}</div>
        <div class="gs-tourn-cardbody">
          <div class="gs-tourn-rivallabel" style="${p.brag ? '' : 'color:#7fe0a0;'}">${p.brag ? 'Your rival gloats' : 'Your rival seethes'}</div>
          <div class="gs-tourn-rivalname">${p.rivalName}</div>
          <p class="gs-tourn-taunt">${rivalHalftimeLine(p.rivalId, p.brag)}</p>
        </div>
      </div>
      <div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3" style="text-align:center;">
        <div class="gs-tourn-fieldlabel">Standing · through 9</div>
        <div style="font-size:16px;font-weight:800;color:${p.brag ? '#e6a6d6' : '#9dffce'};">
          You ${p.playerThru} · ${p.rivalName.split(' ')[0]} ${p.rivalThru} — <span style="color:var(--gs-ink,#eaf1fb);">${standing}</span>
        </div>
      </div>
    </section>
    <div style="max-width:420px;margin:16px auto 0;">
      <button class="gs-btn gs-tourn-in gs-tourn-in4" data-action='${JSON.stringify({ type: 'tournamentPopContinue' })}'>⛳ Play on — the back nine ›</button>
    </div>
    ${TOURN_STYLE}`;
}

export function storyTournamentResultScreen(): string {
  const r = state.lastStoryTournament;
  if (!r) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🏆 Tournament</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyTournamentContinue' })}'>Continue ›</button>
      </div>`;
  }
  const diff = r.playerGross - r.rivalGross;
  const margin = diff === 0 ? 'tied, and the tie goes to you' : diff < 0 ? `by ${-diff}` : `by ${diff}`;
  const title = r.won ? (r.finalSigil ? '🗝 The final Sigil!' : `🏅 ${r.sigilName} won!`) : '💔 So close';
  const kicker = r.won
    ? r.finalSigil
      ? 'All five Sigils are yours — they forge the key to the serpent’s root.'
      : `You beat ${r.rivalName.split(' ')[0]} ${margin}. The chapter turns.`
    : `${r.rivalName.split(' ')[0]} edged you ${margin}. Regroup and challenge again.`;
  const body = r.won
    ? r.finalSigil
      ? `<p>The Sigils rise and lock together into a single burning key. Somewhere far below Yggdrasil, something vast stirs — and now you can reach it.</p>
         <p style="color:#7fe0a0;">🦜 "You did it, champion. Five Sigils. The galaxy owes you everything — but it isn’t over. The serpent is awake, and it is coming."</p>`
      : `<p><b>🎁 ${r.prize}</b></p>
         <p>The next reaches of the galaxy open on your star chart.</p>`
    : `<p>A tournament is never lost for good — the venue will host you again. Sharpen your bag, arm your ship, and take the rematch.</p>`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title">${title}</h1>
      <p class="gs-hero-tag">${kicker}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-ink);font-size:14px;">${r.name}</span>
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="your gross vs the rival">You ${r.playerGross} · ${r.rivalName.split(' ')[0]} ${r.rivalGross}</span>
      </div>
    </header>
    <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.55;">
      ${body}
    </section>
    ${scoreboardHTML(r)}
    <div style="max-width:420px;margin:18px auto 0;">
      ${
        r.won
          ? // GS-story-sigil-ceremony: a win plays the spectacular Sigil→Keystone→serpent cinematic
            // before continuing (app.ts wires `data-sigil-ceremony`; reduced-motion skips straight on).
            `<button class="gs-btn" data-sigil-ceremony="1">${r.finalSigil ? '🗝 Complete the Keystone ›' : '⟐ Set the Sigil into the Keystone ›'}</button>`
          : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyTournamentContinue' })}'>Back to the clubhouse ›</button>`
      }
    </div>
    ${TOURN_STYLE}`;
}

/** GS-story-tournament-field: the full "all competitors" scoreboard for the tournament recap — every
 *  competitor (the rival, your three friends, and you) ranked by gross, you highlighted. Empty if the
 *  field wasn't computed (older payloads). */
function scoreboardHTML(r: NonNullable<typeof state.lastStoryTournament>): string {
  const board = r.leaderboard;
  if (!board || board.length === 0) return '';
  const par = r.par ?? 0;
  const rows = board
    .map((g, i) => {
      const toPar = par ? g.gross - par : undefined;
      const toParStr = toPar === undefined ? '' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
      const glyph = g.kind === 'rival' ? '🐍' : g.kind === 'player' ? '🏌' : '🤝';
      return `<tr class="gs-tsb-row${g.kind === 'player' ? ' gs-tsb-row--you' : ''}${g.kind === 'rival' ? ' gs-tsb-row--rival' : ''}">
        <td class="gs-tsb-pos">${i + 1}</td>
        <td class="gs-tsb-name">${glyph} ${g.name}</td>
        <td class="gs-tsb-topar">${toParStr}</td>
        <td class="gs-tsb-gross">${g.gross}</td>
      </tr>`;
    })
    .join('');
  return `
    <section style="max-width:520px;margin:14px auto 0;">
      <h2 class="gs-tsb-title">Final leaderboard</h2>
      <table class="gs-tsb">
        <thead><tr><th></th><th style="text-align:left;">Competitor</th><th>To par</th><th>Gross</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

const TOURN_STYLE = `
  <style>
    .gs-tourn-lore{margin:0 0 10px;font-size:13.5px;line-height:1.55;color:var(--gs-dim,#9fb0c8);font-style:italic;}
    .gs-tourn-prize{background:#0b0f18;border:1px solid #2a3320;border-radius:10px;padding:9px 12px;margin:2px 0 10px;
      font-size:13px;color:#e9c46a;line-height:1.45;}
    .gs-tourn-stakes{text-align:center;font-size:13px;color:var(--gs-ink,#eaf1fb);line-height:1.5;}
    .gs-tsb-title{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#c98adf;text-align:center;margin:0 0 8px;}
    .gs-tsb{width:100%;border-collapse:collapse;background:#0b0f18;border:1px solid #232b3b;border-radius:12px;overflow:hidden;}
    .gs-tsb th{font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7c8aa0;padding:8px 10px;text-align:right;}
    .gs-tsb td{font-size:14px;color:var(--gs-ink,#eaf1fb);padding:8px 10px;border-top:1px solid #1a2130;}
    .gs-tsb-pos{width:26px;text-align:center;color:#7c8aa0;font-weight:700;}
    .gs-tsb-name{text-align:left;font-weight:600;}
    .gs-tsb-topar{text-align:right;color:#9fb0c8;font-variant-numeric:tabular-nums;}
    .gs-tsb-gross{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;}
    .gs-tsb-row--you td{background:linear-gradient(90deg,#1b2a1e,#132018);color:#9dffce;font-weight:800;}
    .gs-tsb-row--you .gs-tsb-pos{color:#7fe0a0;}
    .gs-tsb-row--rival td{color:#e6a6d6;}
    /* the hype rival card */
    .gs-tourn-card{display:flex;gap:14px;align-items:stretch;background:linear-gradient(135deg,#1c1224,#120b16);
      border:1px solid #3a2440;border-left:3px solid #b060c0;border-radius:14px;padding:12px 14px;margin-bottom:12px;
      box-shadow:0 6px 22px #0007;overflow:hidden;}
    .gs-tourn-portrait{flex:0 0 92px;width:92px;align-self:flex-end;filter:drop-shadow(0 4px 8px #000a);}
    .gs-tourn-portrait svg{width:100%;height:auto;display:block;}
    .gs-tourn-emblem{width:92px;height:112px;display:flex;align-items:center;justify-content:center;font-size:56px;
      background:radial-gradient(circle at 50% 40%,#3a2450,#160c1e);border-radius:12px;}
    .gs-tourn-cardbody{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;justify-content:center;}
    .gs-tourn-rivallabel{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#c98adf;}
    .gs-tourn-rivalname{font-size:18px;font-weight:800;color:var(--gs-ink,#eaf1fb);line-height:1.1;margin-top:1px;}
    .gs-tourn-taunt{margin:8px 0 0;font-size:13px;line-height:1.45;color:#e6c6ee;font-style:italic;}
    .gs-tourn-fieldbox{background:#0b0f18;border:1px solid #232b3b;border-radius:12px;padding:10px 12px;margin-bottom:12px;}
    .gs-tourn-fieldlabel{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8aa0;margin-bottom:7px;}
    .gs-tourn-field{display:flex;flex-wrap:wrap;gap:7px;}
    .gs-tourn-fc{font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:999px;background:#131926;border:1px solid #283040;color:#c7d2e2;white-space:nowrap;}
    .gs-tourn-fc--rival{background:#251426;border-color:#5a2f56;color:#e6a6d6;}
    .gs-tourn-fc--you{background:#132018;border-color:#2f6a44;color:#9dffce;}
    /* staggered entrance — the tournament "walks out" */
    .gs-tourn-in{opacity:0;transform:translateY(10px);animation:gs-tourn-rise .5s cubic-bezier(.2,.8,.2,1) forwards;}
    .gs-tourn-in1{animation-delay:.02s;} .gs-tourn-in2{animation-delay:.14s;} .gs-tourn-in3{animation-delay:.26s;}
    .gs-tourn-in4{animation-delay:.38s;} .gs-tourn-in5{animation-delay:.5s;}
    @keyframes gs-tourn-rise{to{opacity:1;transform:translateY(0);}}
    @media(prefers-reduced-motion:reduce){.gs-tourn-in{animation:none;opacity:1;transform:none;}}
  </style>`;

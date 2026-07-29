/**
 * The Story-Tour GALAXY TOURNAMENT screens (GS-story-tournament) — the chapter climax. The LOBBY (reached
 * from the clubhouse when a tournament is unlocked) sets the stage: the host, the recurring rival, the
 * Sigil + prize at stake, and the tee-off. The RESULT recap resolves it: beat the rival's gross and you win
 * the Sigil (chapter advances, next worlds unlock); the fifth Sigil forges the key to the finale. Built
 * from design tokens + a self-contained `.gs-tourn*` style block (own prefix). Reads the live `state`.
 */

import { state, btn } from './ctx';
import { getCharacter } from '../sim/rpg/characters';
import { STORY_CHAPTER_COUNT, worldCleared, type StoryState } from '../sim/rpg/story';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { storyRecapServicesHTML } from './storyServices';
import { currentTournament, sigilCount, tournamentCompetitors, tournamentRival, tournamentIntroLines, isTeamTournament, isSinglesMatchTournament, isTeamMatchTournament, teamPartnerPool, type StoryTournament } from '../sim/rpg/storyTournaments';
import {
  finaleMatchup,
  corruptedLookOpts,
  championLookOpts,
  friendRivalTaunt,
  friendRivalHalftime,
  isCoilChampionId,
  coilChampionOptions,
  coilChampionName,
  wardenAllyOptions,
} from '../sim/rpg/storyBetrayal';
import { golferPreviewSVG } from '../render/apparelArt';
import { storyClubEffectLabel } from '../sim/rpg/storyClubEffects';
import { shipUpgradeById, upgradeDetail } from '../sim/rpg/storyShipUpgrades';
import { venomaPortraitSVG, vossPortraitSVG, scorpiusPortraitSVG, driverDanPortraitSVG } from '../render/loreArt';
import { penelopePortraitSVG } from '../render/caddyPortraits';
import { loreBeatHTML } from './loreScreens';
import { betrayerName } from '../sim/rpg/storyBetrayal';

/** The rival's glyph for the field/lobby (a portrait shows when one exists; else this reads them). */
function rivalGlyph(rivalId: string): string {
  return rivalId === 'venoma' ? '🐍' : rivalId === 'scorpius' ? '🦂' : rivalId === 'voss' ? '🖤' : rivalId === 'driver-dan' ? '🎒' : rivalId === 'penelope' ? '⛳' : '🏌';
}

/** The rival's glyph from their DISPLAY NAME (the recap payload carries the name, not the id). */
function rivalGlyphByName(rivalName: string): string {
  if (/Venoma|Viper/.test(rivalName)) return '🐍';
  if (/Scorpius|Sting/.test(rivalName)) return '🦂';
  if (/Voss|Sable/.test(rivalName)) return '🖤';
  if (/Driver Dan/.test(rivalName)) return '🎒';
  if (/Penelope/.test(rivalName)) return '⛳';
  return '🏌';
}

/** A bespoke portrait bust for the rivals that have one (the cult champions + the two former-ally rivals);
 *  '' for a rival without one (the lobby falls back to a big glyph emblem). */
function rivalPortraitSVG(rivalId: string): string {
  switch (rivalId) {
    case 'venoma':
      return venomaPortraitSVG();
    case 'scorpius':
      return scorpiusPortraitSVG();
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

/** GS-story-sigil-rivals: a FRIEND rival's portrait — their real golfer figure (corrupted Coil garb when
 *  they've fallen — the coil-violet robe + acid accent is BAKED into the look now, GS-story-sigil5-look, so
 *  no muddying outer tint), sized for the rival-card slot. */
function friendRivalFigure(golferId: string, corrupted: boolean, uid: string): string {
  const ch = getCharacter(golferId);
  if (!ch) return '';
  const opts = corrupted
    ? { ...corruptedLookOpts(ch), uid, w: 84, h: 220 }
    : { skin: ch.style.skin, shirtBase: ch.style.shirt, capColor: ch.style.cap, hair: ch.style.hair, uid, w: 84, h: 220 };
  return golferPreviewSVG(undefined, undefined, undefined, opts);
}

/** GS-story-tournament-midpop: the halftime line — the rival BRAGS when they're ahead, or CURSES you when
 *  you're beating them. Keyed by rival, generic fall-through. Content-as-data. */
function rivalHalftimeLine(rivalId: string, brag: boolean): string {
  const lines: Record<string, [brag: string, curse: string]> = {
    venoma: [
      '"Nine holes, and I already smell the fear on you. Save yourself the back nine, little Warden."',
      '"You’re… ahead? No. NO. A lucky front nine. The Viper does not lose to a tourist. Watch me."',
    ],
    // Scorpius never speaks — his "lines" are stage directions of the Silent Sting reading you.
    scorpius: [
      '(Scorpius says nothing. He simply turns his card so you can see it — nine holes, not a stroke wasted — and waits, still as a struck match, for you to break.)',
      '(For the first time, the Silent Sting goes utterly motionless. Behind the veil, the cold green eyes narrow — you are ahead, and he had not accounted for that. The tail over his shoulder curls a fraction higher.)',
    ],
    voss: [
      '"You see? The true line comes so easily when you stop pretending it’s a game. Nine more, and you’ll understand."',
      '"You play beautifully when you’re angry. Good. Hold onto that. It’s the first honest thing I’ve seen you do."',
    ],
    'driver-dan': [
      '"I’ve read this wreck for forty years, kid. Don’t make me walk you round the back nine too. Sit DOWN."',
      '"Ha! There it is — the fire the Parrot saw in you. Come on then, beat the old man. I dare you. Break my heart."',
    ],
    penelope: [
      '"Your pace is frantic. Your reads are panicked. You already lost, dear — you just haven’t stopped moving yet."',
      '"You’re still ahead. Still fighting. …I’ve read greens for a hundred Wardens who thought they could win alone. I know how it ends. It will cost you."',
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
    case 'scorpius':
      return '(The Silent Sting does not greet you. He sets a matte-black ball on the tee without a sound, settles over it, and goes still — utterly, patiently still. He will not swing until you do. The gallery has stopped breathing.)';
    case 'voss':
      return '"I am not here to beat you. I am here so you finally SEE. Play. Watch what the true line costs."';
    case 'driver-dan':
      return '"Don’t make me do this, kid. …Fine. Come on then. Show me the Parrot was wrong about you."';
    case 'penelope':
      return '"I’ve read a hundred worlds of putts. I know exactly how a lost golfer misses. Come and be still with me."';
    default:
      return '"The club champion doesn’t lose at home. Nice of you to travel all this way to watch."';
  }
}

/** GS-story-partners: the friend currently selected as your team-Sigil partner — the lobby tap, else (on
 *  Sigil 2) your Sigil-1 partner for continuity, else your first tour-mate. */
function selectedPartnerId(t: StoryTournament, story: StoryState): string {
  const pool = teamPartnerPool(story);
  const has = (id?: string) => !!id && pool.some((p) => p.id === id);
  if (has(state.storyPartnerPick)) return state.storyPartnerPick!;
  if (t.chapter === 2 && has(story.sigil1Partner)) return story.sigil1Partner!;
  return pool[0]?.id ?? story.characterId;
}

/** GS-story-partners: the partner-picker for a TEAM Sigil (Scramble/Best-ball) — three friend cards, the
 *  chosen one ringed. Tapping one sets the pick; tee-off carries it onto the run. */
function partnerPickerHTML(t: StoryTournament, story: StoryState): string {
  const pool = teamPartnerPool(story);
  const selected = selectedPartnerId(t, story);
  const fmtLabel = t.format === 'scramble' ? '🤝 Two-ball scramble — share a ball' : '🤝 Best-ball — each play your own';
  const cards = pool
    .map((p) => {
      const ch = getCharacter(p.id);
      if (!ch) return '';
      const fig = golferPreviewSVG(undefined, undefined, undefined, {
        skin: ch.style.skin,
        shirtBase: ch.style.shirt,
        capColor: ch.style.cap,
        hair: ch.style.hair,
        uid: `pp${p.id.replace(/[^a-z0-9]/gi, '')}`,
        w: 56,
        h: 150,
      });
      const on = p.id === selected;
      return `<button class="gs-tourn-pp${on ? ' gs-tourn-pp--on' : ''}" aria-label="Partner with ${ch.name}"
          data-action='${JSON.stringify({ type: 'selectStoryPartner', characterId: p.id })}'>
          <span class="gs-tourn-ppfig">${fig}</span>
          <span class="gs-tourn-ppname">${p.name}${on ? ' ✓' : ''}</span>
        </button>`;
    })
    .join('');
  return `<div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3">
      <div class="gs-tourn-fieldlabel">${fmtLabel} · choose your partner</div>
      <div class="gs-tourn-ppgrid">${cards}</div>
    </div>`;
}

/** A golfer figure (their signature look, or corrupted Coil garb) for the finale matchup box. Coil garb is
 *  the baked coil-violet robe + acid accent (GS-story-sigil5-look) — no muddying outer filter. */
function matchFigure(charId: string, corrupt: boolean, uid: string): string {
  const ch = getCharacter(charId);
  if (!ch) return isCoilChampionId(charId) ? championFigure(charId) : '';
  const opts = corrupt
    ? { ...corruptedLookOpts(ch), uid, w: 52, h: 150 }
    : { skin: ch.style.skin, shirtBase: ch.style.shirt, capColor: ch.style.cap, hair: ch.style.hair, uid, w: 52, h: 150 };
  const fig = golferPreviewSVG(undefined, undefined, undefined, opts);
  return `<span class="gs-tourn-mfig">${fig}</span>`;
}

/** GS-story-sigil5-look: a Coil CHAMPION in the matchup box is drawn as a FULL golfer figure in their own
 *  Coil palette (Malachi/Voss pale + violet, Venoma purple, Scorpius shadow), so the 2v2 lineup is four
 *  consistent figures — not a small portrait bust jammed next to full bodies. Their distinctive portrait
 *  busts still front the hero card + halftime pop, where they stand alone. */
function championFigure(id: string): string {
  if (!isCoilChampionId(id)) return `<div class="gs-tourn-mfglyph">${rivalGlyph(id)}</div>`;
  const fig = golferPreviewSVG(undefined, undefined, undefined, { ...championLookOpts(id), uid: `ch${id}`, w: 52, h: 150 });
  return `<span class="gs-tourn-mfig">${fig}</span>`;
}

/** GS-story-betrayer: the Ch.5 2v2 SCRAMBLE MATCHPLAY matchup box — YOUR team (you + your CHOSEN loyal
 *  friend / Coil champion) across from THE OPPOSING pair (the betrayer in corrupted garb + the Coil leader
 *  Malachi/Voss, or your two former friends). All four are consistent full figures (GS-story-sigil5-look).
 *  Reflects the live lobby pick (`state.storyFinalePartner`), so the box updates as you choose your ally. */
function finaleMatchupBox(story: StoryState): string {
  const m = finaleMatchup(story, story.activeCaddyId, state.storyFinalePartner);
  const you = getCharacter(story.characterId);
  const youFig = you ? matchFigure(you.id, false, 'mfyou') : '';
  // your partner: a friend (Warden) drawn as a figure, or a Coil champion (Herald) drawn as a Coil figure.
  const allyFig = m.allyIsChampion ? championFigure(m.allyId) : matchFigure(m.allyId, false, 'mfally');
  // opponents: on the Warden path the first is the DEFECTOR (corrupted garb); a Coil champion opponent
  // (the leader Malachi/Voss) is drawn as a Coil figure (GS-story-sigil5-look).
  const oppFig = (id: string, i: number) => {
    if (isCoilChampionId(id)) return championFigure(id);
    const corrupt = !m.herald && id === m.betrayerGolferId; // the Warden-path defector wears Coil garb
    return matchFigure(id, corrupt, `mfopp${i}`);
  };
  return `<div class="gs-tourn-matchbox gs-tourn-in gs-tourn-in3">
      <div class="gs-tourn-mteam gs-tourn-mteam--you">
        <div class="gs-tourn-mlabel">Your team</div>
        <div class="gs-tourn-mfigs">${youFig}${allyFig}</div>
        <div class="gs-tourn-mnames">You &amp; ${m.allyName.split(' ')[0]}</div>
      </div>
      <div class="gs-tourn-mvs">vs</div>
      <div class="gs-tourn-mteam gs-tourn-mteam--them">
        <div class="gs-tourn-mlabel">${m.herald ? 'Your former friends' : 'The traitor & the Apostate'}</div>
        <div class="gs-tourn-mfigs">${oppFig(m.oppIds[0], 0)}${oppFig(m.oppIds[1], 1)}</div>
        <div class="gs-tourn-mnames">${m.oppNames.map((n) => n.split(' ')[0]).join(' & ')}</div>
      </div>
    </div>`;
}

/**
 * GS-story-sigil5-npc: the Ch.5 finale PARTNER picker — the player chooses who shares their ball. On the
 * WARDEN path it's the two loyal tour-mates (the friends who did NOT betray you); on the HERALD path it's
 * the Coil champions (Malachi/Voss, the Viper, the Silent Sting), minus whichever is already carrying your
 * bag as a caddy. Each option is drawn in the SAME figure style as the matchup box; the chosen one is ringed
 * and the box above updates to match. Tapping dispatches `selectFinalePartner`.
 */
function finalePartnerPickerHTML(story: StoryState): string {
  const herald = story.alignment === 'herald';
  const m = finaleMatchup(story, story.activeCaddyId, state.storyFinalePartner);
  const options: { id: string; name: string; fig: string }[] = herald
    ? coilChampionOptions(story).map((id) => ({ id, name: coilChampionName(id).replace(/\s*".*"\s*/, ' ').trim(), fig: championFigure(id) }))
    : wardenAllyOptions(story).map((id) => ({ id, name: getCharacter(id)?.shortName ?? id, fig: matchFigure(id, false, `pk${id}`) }));
  const label = herald ? '🐍 Choose your Coil champion — who shares your ball' : '🤝 Choose the friend at your side — who shares your ball';
  const cards = options
    .map((o) => {
      const on = o.id === m.allyId;
      return `<button class="gs-tourn-pp${on ? ' gs-tourn-pp--on' : ''}" aria-label="Partner with ${o.name}"
          data-action='${JSON.stringify({ type: 'selectFinalePartner', characterId: o.id })}'>
          <span class="gs-tourn-ppfig">${o.fig}</span>
          <span class="gs-tourn-ppname">${o.name.split(' ')[0]}${on ? ' ✓' : ''}</span>
        </button>`;
    })
    .join('');
  const cols = Math.max(2, options.length);
  return `<div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3">
      <div class="gs-tourn-fieldlabel">${label}</div>
      <div class="gs-tourn-ppgrid" style="grid-template-columns:repeat(${cols},1fr);">${cards}</div>
    </div>`;
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
  // GS-story-sigil-rivals: the rival is resolved from the player's OWN story — on the back-half Sigils
  // it's the betrayal-arc friend (their real figure + their own voice), never a mismatched NPC.
  const rival = tournamentRival(t, story);
  const intro = tournamentIntroLines(t, story).map((p) => `<p class="gs-tourn-lore">${p}</p>`).join('');
  const portrait = rival.golferId
    ? friendRivalFigure(rival.golferId, !!rival.corrupted, 'trival')
    : rivalPortraitSVG(rival.id);
  // GS-story-partners: a TEAM Sigil shows the partner PICKER (and tees off WITH them); a solo major shows
  // the friendly-rival field chips as before.
  const team = isTeamTournament(t);
  const partnerName = team ? getCharacter(selectedPartnerId(t, story))?.shortName ?? 'a friend' : '';
  // GS-story-tournament-field: the field you'll play — the rival, your three friends, and you.
  const competitors = tournamentCompetitors(t, story.characterId, rival);
  const fieldChips = [
    ...competitors.map(
      (c) =>
        `<span class="gs-tourn-fc gs-tourn-fc--${c.kind}">${c.kind === 'rival' ? rivalGlyph(c.id) : '🤝'} ${c.name}</span>`,
    ),
    `<span class="gs-tourn-fc gs-tourn-fc--you">🏌 ${whoShort}</span>`,
  ].join('');
  const isTeamMatch = isTeamMatchTournament(t); // Ch.5 — 2v2 scramble matchplay (the betrayal finale)
  const isSinglesMatch = isSinglesMatchTournament(t); // Ch.3 — 1v1 singles matchplay vs the rival
  const rivalFirst = rival.name.split(' ')[0];
  // A singles-match / solo strokeplay major both show the friendly-rival field; the 2v2 shows the matchup
  // box PLUS the finale partner picker (GS-story-sigil5-npc — choose your loyal friend / Coil champion);
  // a team-stroke major shows the team-Sigil partner picker.
  const fieldOrPicker = isTeamMatch
    ? `${finaleMatchupBox(story)}${finalePartnerPickerHTML(story)}`
    : team
    ? partnerPickerHTML(t, story)
    : `<div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3">
        <div class="gs-tourn-fieldlabel">${isSinglesMatch ? `Singles matchplay · you vs ${rivalFirst}` : 'The field'}</div>
        <div class="gs-tourn-field">${fieldChips}</div>
      </div>`;
  const teeLabel = isTeamMatch
    ? '⛳ Tee off — the match for the last Sigil'
    : isSinglesMatch
    ? `⛳ Tee off — the match against ${rivalFirst}`
    : team
    ? `⛳ Tee off with ${partnerName} — play for the Sigil`
    : '⛳ Tee off — play for the Sigil';
  // The one-line stakes: a matchplay Sigil is won by taking the MATCH; a stroke/team Sigil by beating a round.
  const stakesLine =
    isTeamMatch || isSinglesMatch
      ? `Win the match${isSinglesMatch ? ` against ${rivalFirst}` : ''}, ${who}, and the ${t.sigilName} is yours.`
      : team
      ? `Out-play the field with ${partnerName} over 18 holes, ${who}, and the ${t.sigilName} is yours.`
      : `Beat ${rivalFirst}’s round over 18 holes, ${who}, and the ${t.sigilName} is yours.`;
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
        <div class="gs-tourn-portrait">${portrait || `<div class="gs-tourn-emblem">${rivalGlyph(rival.id)}</div>`}</div>
        <div class="gs-tourn-cardbody">
          <div class="gs-tourn-rivallabel">${
            // GS-story-sigil-rivals: name the relationship, not just "your rival" — the heartbroken friend
            // barring your way (Herald) vs the friend the Coil is wearing (Warden Ch.5).
            rival.voice === 'confront' ? 'Your friend — barring your way' : rival.voice === 'corrupt' ? 'Your friend — lost to the Coil' : 'Your rival'
          }</div>
          <div class="gs-tourn-rivalname">${rival.name}</div>
          <p class="gs-tourn-taunt">${rival.golferId && rival.voice ? friendRivalTaunt(rival.golferId, rival.voice) : rivalTaunt(rival.id)}</p>
        </div>
      </div>
      ${fieldOrPicker}
      <div class="gs-tourn-in gs-tourn-in3">${intro}</div>
      <div class="gs-tourn-prize gs-tourn-in gs-tourn-in4"><b>🎁 Prize:</b> ${t.prize}${(() => {
        // GS-story-reward-variety: show the reward's "why you want it" line — a club effect, or a Ch.5
        // capital ship part's Combat Rating (the finale is a space battle, so the part matters).
        const clubFx = t.rewardClubId ? storyClubEffectLabel(t.rewardClubId) : undefined;
        const upg = t.rewardUpgradeId ? shipUpgradeById(t.rewardUpgradeId) : undefined;
        const fx = clubFx ?? (upg ? upgradeDetail(upg)[0] : undefined);
        return fx ? ` <span style="color:#7fe0a0;font-weight:700;">✦ ${fx}</span>` : '';
      })()}</div>
      <div class="gs-tourn-stakes gs-tourn-in gs-tourn-in4">${stakesLine}</div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:16px auto 0;">
      <button class="gs-btn gs-tourn-in gs-tourn-in5" data-action='${JSON.stringify({ type: 'storyPlayTournament' })}'>${teeLabel}</button>
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
  // GS-story-sigil-rivals: a FRIEND rival struts on as themselves — their real figure (corrupted on the
  // Warden Ch.5 shrine) and their own betrayal-voice halftime line.
  const portrait = p.rivalGolferId
    ? friendRivalFigure(p.rivalGolferId, !!p.rivalCorrupted, 'tpop')
    : rivalPortraitSVG(p.rivalId);
  const halftime =
    p.rivalGolferId && p.rivalVoice ? friendRivalHalftime(p.rivalGolferId, p.rivalVoice, p.brag) : rivalHalftimeLine(p.rivalId, p.brag);
  const gloatLabel = p.rivalVoice
    ? p.brag
      ? p.rivalVoice === 'corrupt' ? 'Your fallen friend gloats' : 'Your friend pleads'
      : p.rivalVoice === 'corrupt' ? 'Your fallen friend falters' : 'Your friend hopes'
    : p.brag ? 'Your rival gloats' : 'Your rival seethes';
  // GS-story-sigil-live: a MATCHPLAY Sigil's halftime standing is the MATCH (holes up), never strokes.
  const rivalFirstName = p.rivalName.split(' ')[0];
  const standing = p.match
    ? p.match.holesUp === 0
      ? `All square${p.match.team ? ' between the teams' : ` with ${rivalFirstName}`} through nine.`
      : p.match.holesUp > 0
        ? `You${p.match.team ? 'r side is' : ' are'} ${p.match.holesUp} UP through nine.`
        : `${p.match.team ? `${rivalFirstName}’s side is` : `${rivalFirstName} is`} ${-p.match.holesUp} UP through nine.`
    : p.brag
      ? `${rivalFirstName} leads you by ${p.playerThru - p.rivalThru} through nine.`
      : p.playerThru === p.rivalThru
        ? `You’re level with ${rivalFirstName} through nine.`
        : `You lead ${rivalFirstName} by ${p.rivalThru - p.playerThru} through nine.`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title gs-tourn-in gs-tourn-in1">⛳ The turn</h1>
      <p class="gs-hero-tag gs-tourn-in gs-tourn-in1">Nine holes down, nine to play</p>
    </header>
    <section style="max-width:520px;margin:10px auto 0;">
      <div class="gs-tourn-card gs-tourn-in gs-tourn-in2" style="${p.brag ? '' : 'border-left-color:#4fe08a;'}">
        <div class="gs-tourn-portrait">${portrait || `<div class="gs-tourn-emblem">${rivalGlyph(p.rivalId)}</div>`}</div>
        <div class="gs-tourn-cardbody">
          <div class="gs-tourn-rivallabel" style="${p.brag ? '' : 'color:#7fe0a0;'}">${gloatLabel}</div>
          <div class="gs-tourn-rivalname">${p.rivalName}</div>
          <p class="gs-tourn-taunt">${halftime}</p>
        </div>
      </div>
      <div class="gs-tourn-fieldbox gs-tourn-in gs-tourn-in3" style="text-align:center;">
        <div class="gs-tourn-fieldlabel">${p.match ? 'The match · holes won through 9' : 'Standing · through 9'}</div>
        <div style="font-size:16px;font-weight:800;color:${p.brag ? '#e6a6d6' : '#9dffce'};">
          ${p.match ? `You${p.match.team ? 'rs' : ''} ${p.playerThru} · ${rivalFirstName}${p.match.team ? '’s' : ''} ${p.rivalThru}` : `You ${p.playerThru} · ${rivalFirstName} ${p.rivalThru}`} — <span style="color:var(--gs-ink,#eaf1fb);">${standing}</span>
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
  const lead = Math.abs(diff);
  const margin = diff === 0 ? 'tied, and the tie goes to you' : `by ${lead}`;
  // GS-story-sigil-formats: a MATCHPLAY Sigil reads the scoreline. `kind:'singles'` = Ch.3 (you vs the
  // rival); `kind:'team'` = the Ch.5 2v2 scramble matchplay (you & an ally vs an opposing pair).
  const mp = r.match;
  const rivalFirst = r.rivalName.split(' ')[0];
  const oppShort = mp?.oppNames ? mp.oppNames.map((n) => n.split(' ')[0]).join(' & ') : rivalFirst;
  const title = r.won ? (r.finalSigil ? '🗝 The final Sigil!' : `🏅 ${r.sigilName} won!`) : '💔 So close';
  const kicker = mp
    ? mp.kind === 'team'
      ? r.won
        ? `You & ${(mp.allyName ?? '').split(' ')[0]} took the match ${mp.scoreline} against ${oppShort}.${r.finalSigil ? ' The fifth Sigil is yours.' : ' The chapter turns.'}`
        : `${oppShort} took the match ${mp.scoreline}. Regroup and challenge again.`
      : r.won
        ? `You took the match ${mp.scoreline} against ${rivalFirst}. The chapter turns.`
        : `${rivalFirst} took the match ${mp.scoreline}. Regroup and challenge again.`
    : r.won
      ? r.finalSigil
        ? 'All five Sigils are yours — they forge the key to the serpent’s root.'
        : `You beat ${rivalFirst} ${margin}. The chapter turns.`
      : `${rivalFirst} edged you ${margin}. Regroup and challenge again.`;
  const body = r.won
    ? r.finalSigil
      ? `<p>The Sigils rise and lock together into a single burning key. Somewhere far below Yggdrasil, something vast stirs — and now you can reach it.</p>
         ${state.story?.alignment === 'herald'
           ? `<p style="color:#b0e04f;">🐦‍⬛ "Five Sigils, Herald. The key is forged, and the root is yours to open. Come — the serpent has waited so long for someone kind enough to let it rest."</p>`
           : `<p style="color:#7fe0a0;">🦜 "You did it, champion. Five Sigils. The galaxy owes you everything — but it isn’t over. The serpent is awake, and it is coming."</p>`}`
      : `<p><b>🎁 ${r.prize}</b></p>
         <p>The next reaches of the galaxy open on your star chart.</p>`
    : `<p>A tournament is never lost for good — the venue will host you again. Sharpen your bag, arm your ship, and take the rematch.</p>`;
  return `
    <header class="gs-hero gs-storyres">
      <h1 class="gs-hero-title">${title}</h1>
      <p class="gs-hero-tag">${kicker}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-ink);font-size:14px;">${r.name}</span>
        ${mp
          ? mp.kind === 'team'
            ? `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="the 2v2 scramble matchplay result">🏌 You &amp; ${(mp.allyName ?? '').split(' ')[0]} — ${mp.scoreline}</span>
               <span class="gs-chip" style="border-color:#5a2f56;color:#e6a6d6;font-size:13px;" title="the opposing pair">${r.chapter >= 3 ? '🐍' : '🤝'} ${oppShort}</span>`
            : `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="the singles matchplay result">🏌 You — ${mp.scoreline}</span>
               <span class="gs-chip" style="border-color:#5a2f56;color:#e6a6d6;font-size:13px;" title="your rival">${rivalGlyphByName(r.rivalName)} ${rivalFirst}</span>`
          : `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="${r.team ? 'your team vs the leading pair' : 'your gross vs the rival'}">${r.team ? 'Team' : 'You'} ${r.playerGross} · ${rivalFirst} ${r.rivalGross}</span>
             ${r.team ? `<span class="gs-chip" style="border-color:#2f6a44;color:#9dffce;font-size:13px;" title="your partner for this Sigil">🤝 You &amp; ${r.team.partnerName} · ${r.team.format}${r.team.partnerCountedHoles > 0 ? ` · their ball counted on ${r.team.partnerCountedHoles}` : ''}</span>` : ''}`}
      </div>
    </header>
    <section style="max-width:520px;margin:14px auto 0;text-align:center;color:var(--gs-dim);font-size:14px;line-height:1.55;">
      ${body}
    </section>
    ${scoreboardHTML(r)}
    <div style="display:flex;flex-direction:column;gap:10px;max-width:420px;margin:18px auto 0;">
      ${
        r.won
          ? // GS-story-sigil-ceremony: a win plays the spectacular Sigil→Keystone→serpent cinematic
            // before continuing (app.ts wires `data-sigil-ceremony`; reduced-motion skips straight on).
            `<button class="gs-btn" data-sigil-ceremony="1">${r.finalSigil ? '🗝 Complete the Keystone ›' : '⟐ Set the Sigil into the Keystone ›'}</button>`
          : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyTournamentContinue' })}'>Back to the clubhouse ›</button>`
      }
      ${venueServicesHTML(r.venueId)}
    </div>
    ${TOURN_STYLE}`;
}

/**
 * GS-story-venue-services: the major's recap keeps you AT the venue. Every Sigil venue stocks a Pro Shop,
 * one is a ship vendor, and three host a friend — and the recap used to fly you straight home to the
 * clubhouse, so restocking after the biggest payday in the campaign meant flying back across the galaxy.
 * These are a DETOUR: the reducer routes them home to this recap (`storyShopReturn`), so the win's
 * continuation chain — the Sigil ceremony, The Choice, the aftermath beat, the interlude — still runs.
 * A loss gets them too: the recap's own copy says "sharpen your bag, arm your ship, take the rematch".
 */
function venueServicesHTML(venueId: string | undefined): string {
  if (!venueId || !state.story || !worldCleared(state.story, venueId)) return '';
  const links = storyRecapServicesHTML(state.story, venueId);
  if (!links) return '';
  return `<div class="gs-tourn-svc"><div class="gs-tourn-svc-hdr">Before you fly on — ${
    staticCourseSpec(venueId)?.name ?? 'this venue'
  }</div>${links}</div>`;
}

/** GS-story-tournament-field: the full "all competitors" scoreboard for the tournament recap — every
 *  competitor (the rival, your three friends, and you) ranked by gross, you highlighted. Empty if the
 *  field wasn't computed (older payloads). */
function scoreboardHTML(r: NonNullable<typeof state.lastStoryTournament>): string {
  const board = r.leaderboard;
  if (!board || board.length === 0) return '';
  const par = r.par ?? 0;
  // GS-story-sigil-icons: the serpent 🐍 glyph is a CULT tell — it only reads for the deep-game villains, so
  // it's gated to Chapter 3+. Early team majors (Ch.1/2), whose "opposing pairs" are mostly friends + randos
  // marked `kind:'rival'` for the field, show a neutral 🚩 opponent flag instead of a snake for everyone.
  const rivalGlyph = r.chapter >= 3 ? '🐍' : '🚩';
  const rows = board
    .map((g, i) => {
      const toPar = par ? g.gross - par : undefined;
      const toParStr = toPar === undefined ? '' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
      const glyph = g.kind === 'rival' ? rivalGlyph : g.kind === 'player' ? '🏌' : '🤝';
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
    /* GS-story-venue-services: the "spend before you fly on" footer under the recap's continue button */
    .gs-tourn-svc{display:flex;flex-direction:column;gap:8px;padding-top:10px;margin-top:2px;border-top:1px solid #232b3b;}
    .gs-tourn-svc-hdr{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
      color:var(--gs-dim,#9fb0c8);text-align:center;}
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
    /* GS-story-partners: the partner picker (three friend cards, chosen one ringed) */
    .gs-tourn-ppgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
    .gs-tourn-pp{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px 6px;border-radius:12px;
      background:#0e1420;border:1px solid #283040;cursor:pointer;color:inherit;font:inherit;
      transition:transform .14s ease,border-color .14s ease,box-shadow .14s ease;}
    .gs-tourn-pp:hover,.gs-tourn-pp:focus-visible{outline:none;transform:translateY(-2px);border-color:#4a5566;box-shadow:0 6px 14px #0007;}
    /* GS-a11y-focus: restore the keyboard ring outline:none above suppressed (hover styling kept). */
    .gs-tourn-pp:focus-visible{outline:2px solid var(--gs-info);outline-offset:2px;}
    .gs-tourn-pp--on{border-color:#2f6a44;background:#122018;box-shadow:inset 0 0 0 1px #2f6a4488,0 0 12px #2f6a4433;}
    .gs-tourn-ppfig{width:56px;height:auto;filter:drop-shadow(0 4px 5px #0009);}
    .gs-tourn-ppfig svg{width:100%;height:auto;display:block;}
    .gs-tourn-ppname{font-size:12px;font-weight:800;color:#c7d2e2;white-space:nowrap;}
    .gs-tourn-pp--on .gs-tourn-ppname{color:#9dffce;}
    /* GS-story-betrayer: the 2v2 finale matchup box (your team vs the traitor's) */
    .gs-tourn-matchbox{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;
      background:#0b0f18;border:1px solid #232b3b;border-radius:12px;padding:10px;margin-bottom:12px;}
    .gs-tourn-mteam{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;border-radius:10px;}
    .gs-tourn-mteam--you{background:#122018;border:1px solid #2f6a44;}
    .gs-tourn-mteam--them{background:#1c1224;border:1px solid #5a2f56;}
    .gs-tourn-mlabel{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a97a8;text-align:center;}
    .gs-tourn-mteam--you .gs-tourn-mlabel{color:#7fe0a0;}
    .gs-tourn-mteam--them .gs-tourn-mlabel{color:#e6a6d6;}
    .gs-tourn-mfigs{display:flex;gap:2px;align-items:flex-end;justify-content:center;min-height:80px;}
    .gs-tourn-mfig{width:52px;filter:drop-shadow(0 4px 5px #0009);}
    .gs-tourn-mfig svg{width:100%;height:auto;display:block;}
    .gs-tourn-mfglyph{width:44px;height:80px;display:flex;align-items:center;justify-content:center;font-size:34px;filter:drop-shadow(0 3px 5px #000a);}
    /* GS-story-sigil5-look: a Coil champion's portrait bust in the matchup box (Venoma/Voss, not an emoji) */
    .gs-tourn-mport{width:58px;align-self:flex-end;filter:drop-shadow(0 3px 5px #000a);}
    .gs-tourn-mport svg{width:100%;height:auto;display:block;}
    .gs-tourn-mnames{font-size:12.5px;font-weight:800;color:#dbe4f0;white-space:nowrap;}
    .gs-tourn-mvs{font-size:13px;font-weight:900;color:#7c8aa0;font-style:italic;padding:0 2px;}
    /* staggered entrance — the tournament "walks out" */
    .gs-tourn-in{opacity:0;transform:translateY(10px);animation:gs-tourn-rise .5s cubic-bezier(.2,.8,.2,1) forwards;}
    .gs-tourn-in1{animation-delay:.02s;} .gs-tourn-in2{animation-delay:.14s;} .gs-tourn-in3{animation-delay:.26s;}
    .gs-tourn-in4{animation-delay:.38s;} .gs-tourn-in5{animation-delay:.5s;}
    @keyframes gs-tourn-rise{to{opacity:1;transform:translateY(0);}}
    @media(prefers-reduced-motion:reduce){.gs-tourn-in{animation:none;opacity:1;transform:none;}}
  </style>`;

/**
 * GS-story-aftermath: the post-result CONFRONTATION beat for a back-half Sigil (the Silent Sting
 * withdrawing, the Green Key forging, the harvest). Reuses the shared `.gs-lore*` cinematic beat card
 * (`loreBeatHTML`), so it reads identically to every other story beat and forks no CSS. Reads
 * `state.pendingAftermath` (built by the reducer from the just-finished major + win/loss); the `{betrayer}`
 * token resolves to the campaign's actual odd-one-out. Its single CTA dispatches `storyAftermathContinue`
 * (→ the interlude on a Ch.4 win, else the clubhouse). Defensive fallback so a stale state can't blank it.
 */
export function storyTournamentAftermathScreen(): string {
  const beat = state.pendingAftermath;
  if (!beat) {
    return `<div style="min-height:calc(var(--gs-dvh) * .6);display:flex;align-items:center;justify-content:center;padding:24px;">${btn(
      'Continue →',
      { type: 'storyAftermathContinue' },
      { variant: 'primary' },
    )}</div>`;
  }
  const resolve = (t: string): string =>
    t.replaceAll('{betrayer}', state.story ? betrayerName(state.story) : 'a friend');
  return loreBeatHTML(
    { accent: beat.accent, kicker: beat.kicker, title: beat.title, speaker: beat.speaker, portrait: beat.portrait, lines: beat.lines, cta: beat.cta },
    resolve,
    { type: 'storyAftermathContinue' },
  );
}

/**
 * GS-story-sigil-play — the TEAM Sigils play interactively as team formats:
 *   • Sigil 1 (Ch.1) SCRAMBLE — you and your partner both hit; the reducer raises the pick-your-ball choice
 *     card (`scrambleChoice`) on a full swing, and `scrambleOptsFor` arms the AUTO path so auto ≡ interactive.
 *   • Sigil 2 (Ch.2) BEST-BALL — the per-hole reveal (your ball vs the partner's, the lower counts).
 */
import { describe, it, expect } from 'vitest';
import { scrambleOptsFor } from '../src/sim/rpg/run';
import { defaultStoryState } from '../src/sim/rpg/story';
import { initState, reduce } from '../src/ui/game';
import { storyPartnerBestBallScore, resolveStoryTeamStroke, resolveStory2v2Match } from '../src/sim/rpg/storyTeams';
import { TEAM_PARTNER_EDGE } from '../src/sim/rpg/storyTournaments';
import { loyalAllyId, betrayerId } from '../src/sim/rpg/storyBetrayal';

/** A Chapter-1 (scramble) campaign with the Emerald major unlocked. */
function scrambleReady() {
  const story = {
    ...defaultStoryState('feather-fade'),
    chapter: 1,
    clearedWorldIds: ['standrews-18', 'verdant-18', 'verdant2-18', 'desert-18'],
    qualifierResults: { 'verdant2-18': { place: 1, field: 16 }, 'desert-18': { place: 4, field: 16 } },
  };
  return { ...initState('team-play-seed', {}, undefined, story), screen: 'story' as const };
}

/** Tee off the current tournament INTERACTIVELY, returning the 'playing' state (lore beat dismissed). */
function teeOffInteractive(hub: ReturnType<typeof scrambleReady>) {
  const lobby = reduce(hub, { type: 'openStoryTournament' });
  const afterPlay = reduce(lobby, { type: 'storyPlayTournament' });
  const intro = afterPlay.screen === 'lore' ? reduce(afterPlay, { type: 'dismissLore' }) : afterPlay;
  return reduce(intro, { type: 'playInteractive' });
}

describe('GS-story-sigil-play — scrambleOptsFor arms the auto path (auto ≡ interactive)', () => {
  const base = initState('opts-seed', {}, undefined, defaultStoryState('feather-fade'));

  it('a Story SCRAMBLE Sigil returns the partner mods; BEST-BALL / solo return undefined', () => {
    const scramble = { ...base.run, storyTeamFormat: 'scramble' as const, storyTournamentPartner: 'longshot-larry' };
    expect(scrambleOptsFor(scramble)).toBeTruthy();
    expect(scrambleOptsFor(scramble)!.partnerMods).toBeTruthy();
    expect(scrambleOptsFor({ ...scramble, storyTeamFormat: 'bestball' })).toBeUndefined();
    expect(scrambleOptsFor({ ...base.run })).toBeUndefined();
    // no partner id → not armed (defensive)
    expect(scrambleOptsFor({ ...scramble, storyTournamentPartner: undefined })).toBeUndefined();
  });
});

describe('GS-story-sigil-play — the interactive scramble pick card (Sigil 1)', () => {
  it('tees off with the scramble format armed on the run', () => {
    const s = teeOffInteractive(scrambleReady());
    expect(s.screen).toBe('playing');
    expect(s.run.storyTeamFormat).toBe('scramble');
    expect(s.run.storyTournamentPartner).toBeTruthy();
  });

  it('a full swing raises the pick-your-ball choice card; picking a ball commits it and clears the card', () => {
    const s = teeOffInteractive(scrambleReady());
    const clubId = s.run.loadout.bag.find((c) => c.id === 'D')?.id ?? s.run.loadout.bag[0]!.id;
    const shot = reduce(s, { type: 'shot', clubId, aim: 'auto', power: 1 });
    // the scramble choice card is up: two resolved balls, neither committed yet.
    expect(shot.scrambleChoice).toBeTruthy();
    expect(shot.scrambleChoice!.player).toBeTruthy();
    expect(shot.scrambleChoice!.partner).toBeTruthy();
    expect(shot.scrambleChoice!.mulligan).toBeFalsy();
    expect(shot.scrambleChoice!.preview).toBeFalsy();
    // the shot count hasn't advanced until a pick is made
    expect(shot.play!.shots.length).toBe(0);
    // pick the player's ball → the hole advances one stroke, the card clears.
    const picked = reduce(shot, { type: 'chooseScrambleBall', pick: 'player' });
    expect(picked.scrambleChoice).toBeUndefined();
    expect(picked.play!.shots.length).toBe(1);
  });

  it('the auto path scrambles too — an auto-played scramble round resolves to the tournament recap', () => {
    // Auto-play the whole round via the headless `play`: the scramble is armed via scrambleOptsFor, so the
    // team plays best-of-two and the round resolves to the tournament recap (auto ≡ interactive).
    const hub = scrambleReady();
    const lobby = reduce(hub, { type: 'openStoryTournament' });
    const afterPlay = reduce(lobby, { type: 'storyPlayTournament' });
    const intro = afterPlay.screen === 'lore' ? reduce(afterPlay, { type: 'dismissLore' }) : afterPlay;
    const auto = reduce(intro, { type: 'play' });
    expect(auto.screen).toBe('storyTournamentResult');
    const r = auto.lastStoryTournament!;
    expect(r.team!.format).toBe('scramble');
    // won is internally consistent with the team gross vs the leading pair
    expect(r.won).toBe(r.playerGross <= r.rivalGross);
  });
});

describe('GS-story-sigil5-play — the 2v2 scramble-matchplay finale plays as a REAL interactive scramble', () => {
  /** A Chapter-5 Warden campaign with the Serpent's Vigil (2v2 scramble matchplay) unlocked. */
  function finaleReady() {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 5,
      alignment: 'warden' as const,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal'],
      sigil1Partner: 'huang-woo-hook',
      sigil2Partner: 'longshot-larry',
      clearedWorldIds: ['standrews-18', 'derelict-18', 'cetus-18'],
      qualifierResults: { 'derelict-18': { place: 1, field: 12 }, 'cetus-18': { place: 2, field: 12 } },
    };
    return { ...initState('sigil5-seed', {}, undefined, story), screen: 'story' as const };
  }

  /** Dismiss however many arrival beats fire (Ch.5 runs the Ragnarök omen thread). */
  function pastLore(s: ReturnType<typeof reduce>) {
    while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
    return s;
  }

  it('tees off with the scramble armed and the finale ALLY as the shared-ball partner', () => {
    const hub = finaleReady();
    const armed = pastLore(reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    expect(armed.run.storyTournament).toBe(5);
    expect(armed.run.storyTeamFormat).toBe('scramble');
    // The partner is the loyal ally the finale matchup names (the betrayer sits on the other side).
    expect(armed.run.storyTournamentPartner).toBe(loyalAllyId(hub.story!));
    expect(armed.run.storyTournamentPartner).not.toBe(betrayerId(hub.story!));
    // The auto path is armed too (auto ≡ interactive).
    expect(scrambleOptsFor(armed.run)).toBeTruthy();
  });

  it('the HERALD finale arms the scramble with the Coil champion as the shared-ball partner', () => {
    const hub = finaleReady();
    const story = {
      ...hub.story!,
      alignment: 'herald' as const,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-drowned'],
      clearedWorldIds: ['standrews-18', 'swamp-18', 'cetus-18'],
      qualifierResults: { 'swamp-18': { place: 1, field: 12 }, 'cetus-18': { place: 2, field: 12 } },
    };
    const heraldHub = { ...hub, story };
    const armed = pastLore(reduce(reduce(heraldHub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    expect(armed.run.storyTeamFormat).toBe('scramble');
    // The Herald side's partner is a Coil champion (Voss/Venoma) — not a playable character.
    expect(['voss', 'venoma']).toContain(armed.run.storyTournamentPartner);
    // A champion has no character mods, but the scramble still arms (partner plays a neutral swing).
    expect(scrambleOptsFor(armed.run)).toBeTruthy();
  });

  it('a full swing raises the pick-your-ball card, exactly like the Sigil-1 scramble', () => {
    const hub = finaleReady();
    const intro = pastLore(reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    const playing = reduce(intro, { type: 'playInteractive' });
    expect(playing.screen).toBe('playing');
    const clubId = playing.run.loadout.bag.find((c) => c.id === 'D')?.id ?? playing.run.loadout.bag[0]!.id;
    const shot = reduce(playing, { type: 'shot', clubId, aim: 'auto', power: 1 });
    expect(shot.scrambleChoice).toBeTruthy();
    const picked = reduce(shot, { type: 'chooseScrambleBall', pick: 'partner' });
    expect(picked.scrambleChoice).toBeUndefined();
    expect(picked.play!.shots.length).toBe(1);
  });

  it('teamPlayed scoring uses the PLAYED strokes as the side\'s score — no ally ghost re-folded on top', () => {
    const PARS = Array.from({ length: 18 }, () => 4);
    const played = PARS.map((p, i) => p + (i % 3 === 0 ? -1 : 0));
    const res = resolveStory2v2Match(played, 'huang-woo-hook', -0.1, ['backspin-bo', 'venoma'], 0.1, 's5', PARS, 'scramble', true);
    // Every duel's player-side score is EXACTLY the played stroke — the ghost fold would only ever lower it.
    for (const d of res.duels) expect(d.playerStrokes).toBe(played[d.holeIndex]!);
    // The legacy fold (teamPlayed absent) still folds the ally ghost — never worse than the played ball.
    const legacy = resolveStory2v2Match(played, 'huang-woo-hook', -0.1, ['backspin-bo', 'venoma'], 0.1, 's5', PARS, 'scramble');
    for (const d of legacy.duels) expect(d.playerStrokes).toBeLessThanOrEqual(played[d.holeIndex]!);
  });

  it('the auto-played finale resolves to a matchplay recap (auto ≡ interactive end-to-end)', () => {
    const hub = finaleReady();
    const intro = pastLore(reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' }));
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyTournamentResult');
    const r = done.lastStoryTournament!;
    expect(r.match?.kind).toBe('team');
    expect(r.match?.scoreline).toBeTruthy();
  });
});

describe('GS-story-sigil-play — the best-ball per-hole reveal matches the resolution (Sigil 2)', () => {
  const PARS = Array.from({ length: 18 }, (_, i) => (i % 3 === 0 ? 3 : i % 3 === 1 ? 4 : 5));
  const partnerId = 'longshot-larry';
  const seed = 'bb-reveal';

  it('storyPartnerBestBallScore is deterministic', () => {
    const a = storyPartnerBestBallScore(partnerId, TEAM_PARTNER_EDGE, seed, 5, 4);
    const b = storyPartnerBestBallScore(partnerId, TEAM_PARTNER_EDGE, seed, 5, 4);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it('the per-hole reveal (min of your ball + the partner ghost) SUMS to the finished team total', () => {
    const playerStrokes = PARS.map((p, i) => p + (i % 2 === 0 ? 1 : 0)); // a mixed round
    // The reveal the play screen renders: per hole, keep the lower of your ball and the partner's ghost.
    const revealTeam = playerStrokes.reduce(
      (sum, s, i) => sum + Math.min(s, storyPartnerBestBallScore(partnerId, TEAM_PARTNER_EDGE, seed, i, PARS[i]!)),
      0,
    );
    // The finished resolution folds the SAME partner ghost — the two must agree to the stroke.
    const res = resolveStoryTeamStroke(playerStrokes, partnerId, TEAM_PARTNER_EDGE, [], seed, PARS, 'bestball');
    expect(revealTeam).toBe(res.playerTeamTotal);
  });
});

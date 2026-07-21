import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { withLoreGate } from '../src/ui/gameUpdates';
import {
  LORE_EVENTS,
  pickLoreEvent,
  loreEventById,
  resolveLoreTokens,
  type LoreContext,
} from '../src/sim/rpg/lore';
import { lorePortraitSVG } from '../src/render/loreArt';
import { generateCourse } from '../src/sim/course/generate';
import { CHARACTERS } from '../src/sim/rpg/characters';
import { foresightChance } from '../src/sim/rpg/run';
import { FIREBIRD_SHIP_ID } from '../src/sim/rpg/ships';
import { PARROT_PREVIEW_CHANCE } from '../src/sim/rpg/shopItems';

/** A base arrival context — a plain world with no caddy. Override per case. */
const BASE: LoreContext = {
  biome: 'verdant-station',
  archetype: 'verdant',
  caddyId: undefined,
  characterId: CHARACTERS[0]!.id,
  format: 'voyage',
  stopIndex: 3,
};

/** An arrival at the derelict wreck with Driver Dan on the bag — the trigger for the first beat. */
const DERELICT_DAN: LoreContext = {
  ...BASE,
  biome: 'derelict-ship',
  archetype: 'derelict',
  caddyId: 'driver-dan',
};

/** An arrival at the derelict wreck with the Prognostic Parrot on the bag — the GS-lore-parrot-firebird beat. */
const DERELICT_PARROT: LoreContext = {
  ...BASE,
  biome: 'derelict-ship',
  archetype: 'derelict',
  caddyId: 'prognostic-parrot',
};

describe('lore table (GS-lore) — pure pickLoreEvent', () => {
  it('the Driver-Dan-at-the-derelict beat fires only for derelict + Driver Dan, when unseen', () => {
    const e = pickLoreEvent(DERELICT_DAN, {});
    expect(e?.id).toBe('driver-dan-derelict');
  });

  it('does NOT fire once the beat has been seen (once-only)', () => {
    expect(pickLoreEvent(DERELICT_DAN, { 'driver-dan-derelict': true })).toBeUndefined();
  });

  it('does NOT fire on another world, even with Driver Dan', () => {
    expect(pickLoreEvent({ ...DERELICT_DAN, biome: 'ember-world', archetype: 'inferno' }, {})).toBeUndefined();
  });

  it('does NOT fire at the derelict with a different caddy or no caddy', () => {
    expect(pickLoreEvent({ ...DERELICT_DAN, caddyId: 'dr-chipinski' }, {})).toBeUndefined();
    expect(pickLoreEvent({ ...DERELICT_DAN, caddyId: undefined }, {})).toBeUndefined();
  });

  it('is a pure function of (context, seen) — same inputs, same result', () => {
    expect(pickLoreEvent(DERELICT_DAN, {})?.id).toBe(pickLoreEvent(DERELICT_DAN, {})?.id);
  });

  it('every event has a stable id, a trigger, a portrait, and at least one line', () => {
    const ids = new Set<string>();
    for (const e of LORE_EVENTS) {
      expect(e.id).toBeTruthy();
      expect(ids.has(e.id)).toBe(false); // ids never reused
      ids.add(e.id);
      expect(typeof e.trigger).toBe('function');
      expect(e.portrait).toBeTruthy();
      expect(e.lines.length).toBeGreaterThan(0);
    }
  });

  it('loreEventById resolves a real beat and shrugs off unknown/undefined ids', () => {
    expect(loreEventById('driver-dan-derelict')?.speaker).toBe('Driver Dan');
    expect(loreEventById('nope')).toBeUndefined();
    expect(loreEventById(undefined)).toBeUndefined();
  });

  it('lorePortraitSVG paints Driver Dan and returns empty for an unknown portrait', () => {
    const svg = lorePortraitSVG('driver-dan');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Driver Dan'); // aria-label
    expect(lorePortraitSVG('who?')).toBe('');
  });

  // --- GS-lore-parrot-firebird: the Prognostic Parrot's beat at the wreck ---
  it('the Parrot-at-the-derelict beat fires only for derelict + Prognostic Parrot, when unseen', () => {
    expect(pickLoreEvent(DERELICT_PARROT, {})?.id).toBe('prognostic-parrot-derelict');
    expect(pickLoreEvent(DERELICT_PARROT, { 'prognostic-parrot-derelict': true })).toBeUndefined();
    // Not on another world, and not at the wreck with the wrong (or no) caddy.
    expect(pickLoreEvent({ ...DERELICT_PARROT, archetype: 'inferno', biome: 'ember-world' }, {})).toBeUndefined();
    expect(pickLoreEvent({ ...DERELICT_PARROT, caddyId: 'driver-dan' }, {})?.id).toBe('driver-dan-derelict');
    expect(pickLoreEvent({ ...DERELICT_PARROT, caddyId: undefined }, {})).toBeUndefined();
  });

  it('the Parrot beat carries its one-off rewards (the Firebird ship + 100% foresight)', () => {
    const beat = loreEventById('prognostic-parrot-derelict')!;
    expect(beat.effects?.unlockShip).toBe('firebird');
    expect(beat.effects?.parrotForesight).toBe(true);
    expect(beat.portrait).toBe('prognostic-parrot');
  });

  it('lorePortraitSVG paints the Prognostic Parrot', () => {
    const svg = lorePortraitSVG('prognostic-parrot');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Prognostic Parrot'); // aria-label
  });
});

/** A STORY-TOUR arrival context (a campaign round). Override chapter/alignment per case. */
const STORY: LoreContext = { ...BASE, format: 'strokeplay', storyRound: true };

describe('GS-story-beats — story-round dialogue beats gate on the campaign', () => {
  it('Chapter 1 opens with the Parrot\'s true-line lesson on a qualifying arrival (GS-story-early-beats)', () => {
    expect(pickLoreEvent({ ...STORY, storyChapter: 1 }, {})?.id).toBe('story-true-line');
    // Not on a Voyage/Unending arrival; not at the Sigil tee-off (the omen owns that moment); once → gone.
    expect(pickLoreEvent({ ...STORY, storyChapter: 1, storyRound: false }, {})).toBeUndefined();
    expect(pickLoreEvent({ ...STORY, storyChapter: 1, storyTournament: true }, {})?.id).toBe('story-omen-emerald');
    expect(pickLoreEvent({ ...STORY, storyChapter: 1 }, { 'story-true-line': true })).toBeUndefined();
  });

  it('the Parrot names the Coil in Chapter 2 (and never off a story round)', () => {
    expect(pickLoreEvent({ ...STORY, storyChapter: 2 }, {})?.id).toBe('story-coil-named');
    // Same chapter, but NOT a story round (a Voyage/Unending arrival) → never fires.
    expect(pickLoreEvent({ ...STORY, storyChapter: 2, storyRound: false }, {})).toBeUndefined();
    // Wrong chapter → the coil-named beat does not fire (Ch.1 has its own lesson beat instead).
    expect(pickLoreEvent({ ...STORY, storyChapter: 1 }, {})?.id).not.toBe('story-coil-named');
    // Once seen → the next Chapter-2 qualifier arrival brings the course-gone-wrong dread beat.
    expect(pickLoreEvent({ ...STORY, storyChapter: 2 }, { 'story-coil-named': true })?.id).toBe('story-rough-moved');
    expect(pickLoreEvent({ ...STORY, storyChapter: 2 }, { 'story-coil-named': true, 'story-rough-moved': true })).toBeUndefined();
  });

  it('Venoma DEBUTS at the Forge Masters tee-off — the Chapter-2 Sigil moment (GS-story-early-beats)', () => {
    expect(pickLoreEvent({ ...STORY, storyChapter: 2, storyTournament: true }, {})?.id).toBe('story-venoma-debut');
    // Only at the Sigil tee-off (a qualifier gets the Parrot/dread beats), only Chapter 2, once.
    expect(pickLoreEvent({ ...STORY, storyChapter: 2 }, {})?.id).not.toBe('story-venoma-debut');
    expect(pickLoreEvent({ ...STORY, storyChapter: 3, storyTournament: true }, {})?.id).not.toBe('story-venoma-debut');
    expect(
      pickLoreEvent({ ...STORY, storyChapter: 2, storyTournament: true }, { 'story-venoma-debut': true }),
    ).toBeUndefined();
  });

  it('the Coilkeepers appear in Chapter 3', () => {
    expect(pickLoreEvent({ ...STORY, storyChapter: 3 }, {})?.id).toBe('story-coilkeepers');
    expect(pickLoreEvent({ ...STORY, storyChapter: 3, storyRound: false }, {})).toBeUndefined();
  });

  it('the Apostate appears in Chapter 3 after the Coilkeepers beat (GS-story-apostate)', () => {
    // The gallery-dread beat leads on the first Ch.3 arrival; once seen, the Apostate himself appears.
    expect(pickLoreEvent({ ...STORY, storyChapter: 3 }, { 'story-coilkeepers': true })?.id).toBe('story-apostate');
    // Never on a non-story round, and never off Chapter 3.
    expect(pickLoreEvent({ ...STORY, storyChapter: 3, storyRound: false }, { 'story-coilkeepers': true })).toBeUndefined();
    expect(pickLoreEvent({ ...STORY, storyChapter: 4 }, { 'story-coilkeepers': true, 'story-apostate': true })).toBeUndefined();
  });

  it('the Chapter-4 Warden qualifiers run the DOUBT thread: vow → strange question → drifting (GS-story-doubt)', () => {
    const betrayer = CHARACTERS[1]!.id; // any tour-mate — the arc names WHO via storyBetrayerId
    const W: LoreContext = { ...STORY, storyChapter: 4, storyAlignment: 'warden', storyBetrayerId: betrayer };
    // Arrival 1: the Parrot's vow (naming who's gone quiet).
    expect(pickLoreEvent(W, {})?.id).toBe('story-warden-vow');
    // Arrival 2: the betrayer's OWN strange question, in their voice — keyed to the RIGHT character.
    const seenVow = { 'story-warden-vow': true };
    expect(pickLoreEvent(W, seenVow)?.id).toBe(`story-doubt-${betrayer}`);
    // A different betrayer → a different friend speaks.
    const other = CHARACTERS[2]!.id;
    expect(pickLoreEvent({ ...W, storyBetrayerId: other }, seenVow)?.id).toBe(`story-doubt-${other}`);
    // Arrival 3 (any, incl. the vigil tee-off): the betrayer drifting.
    const seenDoubt = { ...seenVow, [`story-doubt-${betrayer}`]: true };
    expect(pickLoreEvent(W, seenDoubt)?.id).toBe(`story-distance-${betrayer}`);
    expect(pickLoreEvent({ ...W, storyTournament: true }, seenDoubt)?.id).toBe(`story-distance-${betrayer}`);
    // The doubt thread is Warden-only, Chapter-4-only, and never fires without the betrayer id.
    expect(pickLoreEvent({ ...W, storyAlignment: 'herald' }, {})?.id).toBe('story-venoma-herald');
    expect(pickLoreEvent({ ...W, storyChapter: 5 }, seenDoubt)?.id).toBe(`story-venoma-warden`);
    expect(pickLoreEvent({ ...STORY, storyChapter: 4, storyAlignment: 'warden' }, seenVow)?.id).toBe('story-venoma-warden');
  });

  it('Venoma confronts you from Chapter 4, her beat branching on the chosen path', () => {
    const doubtSeen = {
      'story-warden-vow': true,
      ...Object.fromEntries(CHARACTERS.flatMap((c) => [[`story-doubt-${c.id}`, true], [`story-distance-${c.id}`, true]])),
    };
    expect(pickLoreEvent({ ...STORY, storyChapter: 4, storyAlignment: 'warden' }, doubtSeen)?.id).toBe('story-venoma-warden');
    expect(pickLoreEvent({ ...STORY, storyChapter: 5, storyAlignment: 'warden' }, {})?.id).toBe('story-venoma-warden');
    expect(pickLoreEvent({ ...STORY, storyChapter: 4, storyAlignment: 'herald' }, {})?.id).toBe('story-venoma-herald');
    // Chapter 4+ but no alignment chosen yet → neither variant fires.
    expect(pickLoreEvent({ ...STORY, storyChapter: 4 }, {})).toBeUndefined();
    // Before The Choice (Ch <4) → no Venoma.
    expect(pickLoreEvent({ ...STORY, storyChapter: 3, storyAlignment: 'warden' }, {})?.id).toBe('story-coilkeepers');
  });

  it('none of the story beats fire on an ordinary Voyage/Unending arrival (no storyRound)', () => {
    for (const ch of [2, 3, 4, 5]) {
      expect(pickLoreEvent({ ...BASE, storyChapter: ch, storyAlignment: 'warden' }, {})).toBeUndefined();
    }
  });

  it('paints the story portraits (Venoma, the Coilkeeper, the Apostate)', () => {
    const v = lorePortraitSVG('venoma');
    expect(v).toContain('<svg');
    expect(v).toContain('Venoma'); // aria-label
    const c = lorePortraitSVG('coilkeeper');
    expect(c).toContain('<svg');
    expect(c).toContain('Coilkeeper');
    const a = lorePortraitSVG('voss');
    expect(a).toContain('<svg');
    expect(a).toContain('Voss'); // aria-label
  });

  it('every story beat names a portrait that lorePortraitSVG can paint', () => {
    for (const id of [
      'story-coil-named', 'story-coilkeepers', 'story-apostate', 'story-venoma-warden', 'story-venoma-herald',
      'story-omen-emerald', 'story-omen-abyss-warden', 'story-omen-abyss-herald', 'story-ragnarok-warden', 'story-ragnarok-herald',
    ]) {
      const beat = loreEventById(id)!;
      expect(lorePortraitSVG(beat.portrait)).toContain('<svg');
    }
  });
});

describe('GS-story-ragnarok — the impending-Ragnarök escalation beats (one per Sigil chapter)', () => {
  it('Chapter 1 opens with the first tremor at the Emerald Invitational — the World-Eater only dreams (fills Sigil 1)', () => {
    // Fires at the SIGIL MATCH (a tournament tee-off), not the practice worlds.
    expect(pickLoreEvent({ ...STORY, storyChapter: 1, storyTournament: true }, {})?.id).toBe('story-omen-emerald');
    // A Ch.1 PRACTICE arrival gets the true-line lesson instead (GS-story-early-beats), then tees off clean.
    expect(pickLoreEvent({ ...STORY, storyChapter: 1 }, {})?.id).toBe('story-true-line');
    expect(pickLoreEvent({ ...STORY, storyChapter: 1 }, { 'story-true-line': true })).toBeUndefined();
    // Never off a story round, and never the wrong chapter.
    expect(pickLoreEvent({ ...STORY, storyChapter: 1, storyTournament: true, storyRound: false }, {})).toBeUndefined();
    expect(pickLoreEvent({ ...BASE, storyChapter: 1, storyTournament: true }, {})).toBeUndefined();
    // Once seen → gone.
    expect(pickLoreEvent({ ...STORY, storyChapter: 1, storyTournament: true }, { 'story-omen-emerald': true })).toBeUndefined();
  });

  it('Chapter 4 escalation lands AFTER the doubt thread + the Venoma confrontation, branching by path', () => {
    // The Warden Ch.4 sequence is vow → doubt → distance → Venoma → the eye-half-opens omen.
    const seenWarden = {
      'story-warden-vow': true,
      'story-venoma-warden': true,
      ...Object.fromEntries(CHARACTERS.flatMap((c) => [[`story-doubt-${c.id}`, true], [`story-distance-${c.id}`, true]])),
    };
    expect(pickLoreEvent({ ...STORY, storyChapter: 4, storyAlignment: 'warden' }, seenWarden)?.id).toBe('story-omen-abyss-warden');
    expect(pickLoreEvent({ ...STORY, storyChapter: 4, storyAlignment: 'herald' }, { 'story-venoma-herald': true })?.id).toBe('story-omen-abyss-herald');
    // The Ch.4 omen is Ch.4-only — at Ch.5 the Ragnarök beat takes over instead of it leaking forward.
    expect(pickLoreEvent({ ...STORY, storyChapter: 5, storyAlignment: 'warden' }, { 'story-venoma-warden': true, 'story-omen-abyss-warden': true })?.id).toBe('story-ragnarok-warden');
  });

  it('Chapter 5 brings Ragnarök to the door — four Sigils set, the finale looms (fills Sigil 5)', () => {
    const seen = { 'story-venoma-warden': true, 'story-venoma-herald': true };
    expect(pickLoreEvent({ ...STORY, storyChapter: 5, storyAlignment: 'warden' }, seen)?.id).toBe('story-ragnarok-warden');
    expect(pickLoreEvent({ ...STORY, storyChapter: 5, storyAlignment: 'herald' }, seen)?.id).toBe('story-ragnarok-herald');
    // Warden hears the Parrot; Herald hears the Crow — the portraits differ by path.
    expect(loreEventById('story-ragnarok-warden')!.portrait).toBe('prognostic-parrot');
    expect(loreEventById('story-ragnarok-herald')!.portrait).toBe('crow');
    // Never off a story round.
    expect(pickLoreEvent({ ...BASE, storyChapter: 5, storyAlignment: 'warden' }, seen)).toBeUndefined();
  });

  it('paints the Carrion Crow portrait for the Herald escalation beats', () => {
    const svg = lorePortraitSVG('crow');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Crow'); // aria-label "The Carrion Prophet — the Crow"
  });
});

describe('GS-story-doubt — the beats always name the RIGHT characters', () => {
  it('every playable golfer has a doubt + distance row, spoken as themselves (their figure portrait)', () => {
    for (const c of CHARACTERS) {
      const doubt = loreEventById(`story-doubt-${c.id}`)!;
      const distance = loreEventById(`story-distance-${c.id}`)!;
      expect(doubt.speaker).toBe(c.shortName);
      expect(distance.speaker).toBe(c.shortName);
      expect(doubt.portrait).toBe(`golfer:${c.id}`);
      expect(distance.portrait).toBe(`golfer:${c.id}`);
      expect(doubt.lines.length).toBeGreaterThanOrEqual(3);
      expect(distance.lines.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('resolveLoreTokens names the campaign\'s actual betrayer, degrading generic without one', () => {
    expect(resolveLoreTokens('Keep an eye on {betrayer}.', 'Feather')).toBe('Keep an eye on Feather.');
    expect(resolveLoreTokens('Keep an eye on {betrayer}.')).toBe('Keep an eye on your friend.');
    expect(resolveLoreTokens('No tokens here.', 'Feather')).toBe('No tokens here.');
  });

  it('the vow + Venoma beats speak about the betrayer via the {betrayer} token (resolved at render)', () => {
    const vow = loreEventById('story-warden-vow')!;
    expect(vow.lines.some((l) => l.text.includes('{betrayer}'))).toBe(true);
    const venoma = loreEventById('story-venoma-warden')!;
    expect(venoma.lines.some((l) => l.text.includes('{betrayer}'))).toBe(true);
  });
});

/** Inject a hired caddy into a run's loadout (what owning that caddy means to the gate). */
function withCaddy(s: UiState, caddyId: string): UiState {
  return { ...s, run: { ...s.run, loadout: { ...s.run.loadout, perks: [...s.run.loadout.perks, caddyId] } } };
}

/** Drive a Star Tour run up to the point a course is picked, with Driver Dan on the bag. */
function starTourWithDan(): UiState {
  let s = initState('lore-seed');
  s = reduce(s, { type: 'openStarTour' });
  s = reduce(s, { type: 'selectCharacter', characterId: CHARACTERS[0]!.id });
  expect(s.screen).toBe('starTour');
  return withCaddy(s, 'driver-dan');
}

describe('lore arrival gate (GS-lore) — reducer flow, mode-agnostic', () => {
  it('arriving at the derelict wreck with Driver Dan diverts the intro to the lore beat', () => {
    const arrived = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    expect(arrived.course.biome).toBe('derelict-ship');
    expect(arrived.screen).toBe('lore');
    expect(arrived.pendingLoreId).toBe('driver-dan-derelict');
  });

  it('dismissing the beat marks it seen and continues to the stop intro', () => {
    const lore = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    const after = reduce(lore, { type: 'dismissLore' });
    expect(after.screen).toBe('intro');
    expect(after.pendingLoreId).toBeUndefined();
    expect(after.seenLore['driver-dan-derelict']).toBe(true);
  });

  it('the beat never fires a second time once seen (arriving again lands straight on the intro)', () => {
    const lore = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'derelict-18' });
    const seen = reduce(lore, { type: 'dismissLore' }); // seenLore now records it
    // Re-arrive at the same wreck with Dan still aboard — the gate must NOT re-divert.
    const again = withLoreGate({ ...seen, screen: 'intro' });
    expect(again.screen).toBe('intro');
    expect(again.pendingLoreId).toBeUndefined();
  });

  it('a non-derelict arrival with Driver Dan is untouched (no misfire)', () => {
    const s = reduce(starTourWithDan(), { type: 'pickStarTourCourse', courseId: 'verdant-18' });
    expect(s.screen).toBe('intro');
    expect(s.pendingLoreId).toBeUndefined();
  });

  it('the gate is a no-op off the intro screen', () => {
    const s = starTourWithDan(); // screen: 'starTour'
    expect(withLoreGate(s).screen).toBe('starTour');
  });

  it('withLoreGate reads the live caddy — a derelict arrival WITHOUT Driver Dan stays on the intro', () => {
    let s = initState('lore-seed-2');
    // Hand-build an honest "arrived at the derelict" intro state (no caddy on the bag).
    const course = generateCourse('gs-lore-test', { biome: 'derelict-ship', holes: 4, wildness: 0.6 });
    s = { ...s, screen: 'intro', course, run: { ...s.run, stopIndex: 2 } };
    expect(s.course.biome).toBe('derelict-ship');
    const gated = withLoreGate(s);
    expect(gated.screen).toBe('intro');
    expect(gated.pendingLoreId).toBeUndefined();
    // ...but add Driver Dan and the SAME arrival now diverts.
    expect(withLoreGate(withCaddy(s, 'driver-dan')).screen).toBe('lore');
  });
});

/** Hand-build an honest "arrived at the derelict with the Prognostic Parrot" lore state. */
function derelictWithParrot(seed = 'lore-parrot'): UiState {
  let s = initState(seed);
  const course = generateCourse('gs-lore-parrot-test', { biome: 'derelict-ship', holes: 4, wildness: 0.6 });
  // Hire the parrot: the perk id drives the gate (`namedCaddyOwned`) AND the loadout carries its proc
  // chance (what the shop's `apply` would set), so `foresightChance` sees a real base to boost.
  s = {
    ...s,
    screen: 'intro',
    course,
    run: {
      ...s.run,
      stopIndex: 2,
      loadout: { ...s.run.loadout, perks: [...s.run.loadout.perks, 'prognostic-parrot'], previewScramble: PARROT_PREVIEW_CHANCE },
    },
  };
  return withLoreGate(s);
}

describe('GS-lore-parrot-firebird — the beat pays out on dismiss', () => {
  it('arriving at the wreck with the parrot diverts to the beat, and dismiss grants the Firebird + arms foresight', () => {
    const lore = derelictWithParrot();
    expect(lore.screen).toBe('lore');
    expect(lore.pendingLoreId).toBe('prognostic-parrot-derelict');
    expect(lore.ownedShips).not.toContain(FIREBIRD_SHIP_ID); // not yet — earned on dismiss

    const after = reduce(lore, { type: 'dismissLore' });
    expect(after.screen).toBe('intro');
    expect(after.seenLore['prognostic-parrot-derelict']).toBe(true);
    // The secret mythic Firebird is now owned...
    expect(after.ownedShips).toContain(FIREBIRD_SHIP_ID);
    // ...and the parrot's foresight is armed at 100% for THIS stop (and only this stop).
    expect(after.run.parrotForesightStop).toBe(after.run.stopIndex);
    expect(foresightChance(after.run)).toBe(1);
  });

  it('the armed foresight expires once you move on (it keys off the live stopIndex)', () => {
    const after = reduce(derelictWithParrot(), { type: 'dismissLore' });
    // Same run, next stop: the boost no longer matches, so it falls back to the loadout chance.
    const moved = { ...after.run, stopIndex: after.run.stopIndex + 1 };
    expect(foresightChance(moved)).toBe(after.run.loadout.previewScramble);
  });

  it('foresightChance never boosts a bag WITHOUT the parrot (feature-off is byte-for-byte)', () => {
    const s = initState('no-parrot');
    // No parrot on the bag → previewScramble undefined → armed or not, chance stays undefined.
    expect(foresightChance(s.run)).toBeUndefined();
    expect(foresightChance({ ...s.run, parrotForesightStop: s.run.stopIndex })).toBeUndefined();
  });
});

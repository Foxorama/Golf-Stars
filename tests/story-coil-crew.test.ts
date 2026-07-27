/**
 * The Coil inner circle, as the game SPEAKS them and as they WORK (GS-story-coil-names ·
 * GS-story-caddy-read · GS-story-caddy-partner).
 *
 * Three reports from one Herald campaign, all the same shape — a surface re-deriving something it should
 * have asked one seam for:
 *   • the clubhouse deck and the ship's rooms plated them "Sable" / "the Viper" / "Brother" / "Sister"
 *     (a handle, an epithet, two honorifics) while every other screen said Voss / Venoma / Ouros / Ecdysis,
 *     and the quest card headline read "The Shedding — with a" because `allyName` knew only shop caddies;
 *   • the putt read row credited every read to the Mystic Mole, whoever actually found the line;
 *   • the agent carrying your bag was offered as your playing partner (covered in
 *     `story-qualifier-formats.test.ts`).
 */

import { describe, it, expect } from 'vitest';
import { HERALD_CREW, heraldShortName, HERALD_CADDY_IDS } from '../src/sim/rpg/storyHeraldCrew';
import { allyName, allyShortName } from '../src/sim/rpg/storyAllies';
import { caddyReadsGreen } from '../src/sim/rpg/storyCaddies';
import { storyPartnerName } from '../src/sim/rpg/storyPartners';
import { questForCaddy, questGiverName, questGiverShortName } from '../src/sim/rpg/storyQuests';
import { spaceportSceneHTML } from '../src/render/storySpaceport';
import { defaultStoryState } from '../src/sim/rpg/story';
import { setState } from '../src/app/ctx';
import { puttAimRow } from '../src/app/playHud';
import type { UiState } from '../src/ui/gameState';

const HERALD = {
  ...defaultStoryState('feather-fade'),
  chapter: 4,
  alignment: 'herald' as const,
  hiredCaddyIds: [...HERALD_CADDY_IDS],
  activeCaddyId: 'coil-venoma',
};

describe('GS-story-coil-names — one name per agent, everywhere', () => {
  it('every Coil agent has a short name that is neither a handle nor an honorific', () => {
    for (const a of HERALD_CREW) {
      expect(heraldShortName(a.id)).toBe(a.shortName);
      // The two derivations the surfaces used to roll for themselves, and what each got wrong.
      expect(a.shortName).not.toMatch(/^(Brother|Sister|the)\b/i);
      expect(a.shortName.split(' ')).toHaveLength(1);
    }
    expect(HERALD_CREW.map((a) => a.shortName)).toEqual(['Voss', 'Venoma', 'Ouros', 'Ecdysis']);
    expect(heraldShortName('mystic-mole')).toBeUndefined();
  });

  it('the ally seam resolves a Coil agent — never "a friend", never "a"', () => {
    for (const a of HERALD_CREW) {
      expect(allyName(a.id)).toBe(a.name);
      expect(allyShortName(a.id)).toBe(a.shortName);
      // …and the partner seam has always agreed; now the ally seam does too.
      expect(allyShortName(a.id)).toBe(storyPartnerName(a.id));
    }
    // A Warden friend keeps the long-standing shop name + first-word plate.
    expect(allyName('mystic-mole')).toBe('Mystic Mole');
    expect(allyShortName('mystic-mole')).toBe('Mystic');
    expect(allyName('nobody-at-all')).toBe('a friend');
  });

  it("a Coil quest headline names its giver ('The Shedding — with Ecdysis')", () => {
    const q = questForCaddy('coil-ecdysis')!;
    expect(questGiverName(q)).toBe('Sister Ecdysis');
    expect(questGiverShortName(q)).toBe('Ecdysis');
  });

  it('the clubhouse deck plates the crew by those same short names', () => {
    const html = spaceportSceneHTML(HERALD);
    for (const a of HERALD_CREW) expect(html, a.id).toContain(`${a.shortName}</span>`);
    // the discarded derivations, gone from the deck
    for (const wrong of ['Sable</span>', 'the Viper</span>', 'Brother</span>', 'Sister</span>'])
      expect(html).not.toContain(wrong);
  });
});

describe('GS-story-caddy-read — the read row names whoever found the line', () => {
  it('knows which caddies actually read the break (probed off their own effect)', () => {
    expect(caddyReadsGreen('mystic-mole')).toBe(true); // the Warden green-reader
    expect(caddyReadsGreen('coil-ouros')).toBe(true); // the Whisperer, his Coil twin
    expect(caddyReadsGreen('coil-venoma')).toBe(false); // tighter dispersion, no read
    expect(caddyReadsGreen('driver-dan')).toBe(false);
    expect(caddyReadsGreen(undefined)).toBe(false);
  });

  const withCaddy = (perks: string[], story?: typeof HERALD, storyRound = false): void => {
    setState({
      run: { loadout: { perks }, storyRound },
      ...(story ? { story } : {}),
    } as unknown as UiState);
  };

  it('credits the Mole, the Whisperer, or nobody — never the Mole for someone else\'s read', () => {
    withCaddy(['mystic-mole']);
    expect(puttAimRow(1, 0.6, true)).toContain('Mole reads');

    // A Coil volunteer on the bag of a Story round reads in his OWN name.
    withCaddy([], { ...HERALD, activeCaddyId: 'coil-ouros' }, true);
    expect(puttAimRow(1, 0.6, true)).toContain('Ouros reads');
    expect(puttAimRow(1, 0.6, true)).not.toContain('Mole');

    // The read can equally come from gear (the Seer's Circlet) or a reward putter — no caddy found it,
    // so no caddy is credited.
    withCaddy([]);
    expect(puttAimRow(1, 0.6, true)).toContain('Line reads');
    // Ecdysis carries the bag but reads nothing; the line is still the line's.
    withCaddy([], { ...HERALD, activeCaddyId: 'coil-ecdysis' }, true);
    expect(puttAimRow(1, 0.6, true)).toContain('Line reads');

    // No read at all ⇒ the manual ◄/► aim row, untouched.
    expect(puttAimRow(1, 0.6, false)).toContain('data-putt-aim');
  });
});

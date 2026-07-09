/**
 * Caddy FACTIONS + character-specific REPUTATION (GS-caddy-factions).
 *
 * Every named caddy belongs to a faction. Hiring a caddy earns you a little standing with their crew
 * (+REP_ON_HIRE); firing one to make room for another burns it (REP_ON_FIRE — nobody likes being
 * sacked). Reputation is tracked PER CHARACTER (a Larry who courts the Truckers is a different
 * standing than a Bo who does), and is deliberately HIDDEN groundwork for now — it's persisted and
 * moved by the reducer, but nothing in the UI reads it yet. Future faction perks/events will.
 *
 * This module is pure data + immutable helpers with NO imports, so it can't create a cycle and the
 * sim/tests can reason about it freely. The one machine-checked contract (`tests/factions.test.ts`):
 * every `NAMED_CADDY_IDS` entry maps to a faction here — add a caddy without a faction and CI reds.
 */

export interface Faction {
  id: string;
  name: string;
  /** A one-line flavour blurb — used only by future faction UI; never sim-facing. */
  blurb: string;
}

/** The galaxy's caddy guilds/crews (GS-caddy-factions). Ordered roughly by how "establishment" they are. */
export const FACTIONS: readonly Faction[] = [
  { id: 'putters-guild', name: 'The Putters Guild', blurb: 'Masters of the short stick and the perfect read.' },
  { id: 'space-pirates', name: 'Space Pirates', blurb: 'Convict crews who plunder the fairways of the outer rim.' },
  { id: 'planet-pirates', name: 'Planet Pirates', blurb: 'Buccaneer crews who raid whole worlds — and foresee every putt.' },
  { id: 'lords-and-ladies', name: 'Lords & Ladies', blurb: 'The refined gentry of the galactic tour.' },
  { id: 'long-haul-truckers', name: 'The Long Haul Truckers', blurb: 'Big rigs, big drives, big distances hauled across the void.' },
  { id: 'para-spatial-medics', name: 'Para-Spatial Medics', blurb: 'On call across space and time — they always answer.' },
  { id: 'the-other-guys', name: 'The Other Guys', blurb: 'The unaffiliated journeymen of the tour.' },
];

/**
 * Which faction each named caddy answers to (GS-caddy-factions). Keyed by the caddy's shop-item id
 * (the `NAMED_CADDY_IDS` set in economy.ts). Machine-checked to cover every named caddy.
 */
export const CADDY_FACTION: Readonly<Record<string, string>> = {
  // The Putters Guild — short-game specialists (auto-putt / green read).
  'auto-caddie': 'putters-guild', // Penelope Putter
  'mystic-mole': 'putters-guild',
  // Space Pirates — the Convict Sheep and their boomerangs.
  'convict-sheep': 'space-pirates',
  // Planet Pirates — the Prognostic Parrot, a bipedal pirate captain who foresees the shot.
  'prognostic-parrot': 'planet-pirates',
  // Lords & Ladies — the top-hatted Space Ducks.
  'space-ducks': 'lords-and-ladies',
  // The Long Haul Truckers — distance haulers.
  'driver-dan': 'long-haul-truckers',
  'suggestible-sam': 'long-haul-truckers',
  // Para-Spatial Medics — Dr Chipinski answering the call.
  'dr-chipinski': 'para-spatial-medics',
  // The Other Guys — the unaffiliated escape artist.
  'sandy-sandsaver': 'the-other-guys',
};

/** The faction a caddy belongs to, or undefined for a non-caddy id. */
export function factionForCaddy(caddyId: string): string | undefined {
  return CADDY_FACTION[caddyId];
}

/** Resolve a faction row by id. */
export function factionById(id: string): Faction | undefined {
  return FACTIONS.find((f) => f.id === id);
}

/** Reputation earned when you HIRE a caddy — a little goodwill with their crew. */
export const REP_ON_HIRE = 1;
/** Reputation lost when you FIRE a caddy to hire another — nobody likes being sacked. */
export const REP_ON_FIRE = -3;

/** Character-specific faction standing: characterId → factionId → reputation. */
export type ReputationByCharacter = Record<string, Record<string, number>>;

/**
 * Immutably adjust one character's standing with one faction (GS-caddy-factions). Returns a fresh
 * map (never mutates), so it's safe to thread through the pure reducer. A missing character/faction
 * starts at 0.
 */
export function adjustReputation(
  rep: ReputationByCharacter,
  characterId: string,
  factionId: string,
  delta: number,
): ReputationByCharacter {
  const cur = rep[characterId] ?? {};
  return { ...rep, [characterId]: { ...cur, [factionId]: (cur[factionId] ?? 0) + delta } };
}

/** A character's current standing with a faction (0 if untracked / no character). */
export function reputationWith(
  rep: ReputationByCharacter,
  characterId: string | undefined,
  factionId: string,
): number {
  if (!characterId) return 0;
  return rep[characterId]?.[factionId] ?? 0;
}

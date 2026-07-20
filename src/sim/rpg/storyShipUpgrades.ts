/**
 * Story-Tour SHIP WEAPONS & UPGRADES (GS-story-ship-upgrades) — the arm-your-ship layer, bought at the
 * spaceport shipyard's outfitting bay. Three categories: WEAPONS (cannons/railguns/orbs), ENGINES
 * (thrusters/warp/singularity), and SHIELDS (deflector/aegis/bulwark). Each raises your fleet's
 * **Combat Rating** — a visible readiness meter the Prognostic Parrot keeps nagging you about, because
 * the campaign ends in a space battle against the Cthulhu-corrupted Jörmungandr, and an unarmed ship does
 * not come home from that. The finale (a later chunk) CONSUMES the Combat Rating; until then it's a real,
 * accumulating progression goal — and ENGINES also carry a LIVE credit-earning bonus, so the outfitting
 * choice (economy now vs battle prep) has teeth today.
 *
 * PURE + DOM-free. Upgrades are simply OWNED (`StoryState.ownedShipUpgradeIds`) and all-owned-are-active —
 * no per-slot equip, no save bump. Ids are `upg:<category>:<variant>`; the card art routes off the category
 * (`render/itemArt.ts` — a weapon turret / the thruster art / a shield emitter). Item-authoring rule
 * (GS-story-lore-cards): every row carries its own art, a mechanical DETAIL, and bespoke LORE.
 */

import type { Rarity } from '../course/contract';
import { addCredits, type StoryState } from './story';

export type UpgradeCategory = 'weapon' | 'engine' | 'shield';

export interface StoryShipUpgrade {
  id: string;
  category: UpgradeCategory;
  name: string;
  rarity: Rarity;
  price: number;
  /** GS-story-reward-variety: `reward` = GRANTED by a quest or a Ch.5 major (a "spaceship part" prize),
   *  never sold — revealed only once owned, exactly like a `reward` SHIP. `buy`/`milestone` are the shop
   *  arsenal. */
  acquire: 'buy' | 'milestone' | 'reward';
  /** For `milestone`: revealed once this many worlds are cleared (excludes the Earth prologue). */
  unlockAfterClears?: number;
  /** GS-story-reward-variety: a short rack-card blurb (reward parts show it on the quest recap). */
  blurb?: string;
  /** Combat Rating contribution — sums into the fleet's readiness for the finale battle. */
  battle: number;
  /** ENGINES only: a live credit-earning multiplier (stacks multiplicatively with the ship's own). */
  creditMult?: number;
  lore: string[];
}

// The outfitting catalogue — three tiers per category, a couple gated behind milestones so the arsenal
// fills out as the campaign deepens. Prices/battle scale with rarity.
export const STORY_SHIP_UPGRADES: readonly StoryShipUpgrade[] = [
  // ── WEAPONS ──
  {
    id: 'upg:weapon:scatter',
    category: 'weapon',
    name: 'Golf-Ball Scatter Cannon',
    rarity: 'rare',
    price: 220,
    acquire: 'buy',
    battle: 8,
    lore: [
      'A repurposed ball-dispenser welded to a coil-gun: it spits a shrapnel-cloud of dimpled titanium ' +
        'range balls at a closing rate no serpent enjoys. Crude, cheap, and enormously satisfying.',
      'Every Warden’s first gun. You never quite retire it.',
    ],
  },
  {
    id: 'upg:weapon:railgun',
    category: 'weapon',
    name: 'Meteor Railgun',
    rarity: 'epic',
    price: 420,
    acquire: 'buy',
    battle: 18,
    lore: [
      'Twin rails that fling a sliver of a dead comet at a fraction of lightspeed. It punches clean ' +
        'through a hull section and keeps going — the shipwrights charge extra for the targeting computer ' +
        'that stops you punching through your own wing.',
    ],
  },
  {
    id: 'upg:weapon:nova',
    category: 'weapon',
    name: 'Nova Driver Orb',
    rarity: 'legendary',
    price: 820,
    acquire: 'milestone',
    unlockAfterClears: 8,
    battle: 34,
    lore: [
      'A caged pinch of collapsing star, launched to bloom into a silent white nova wherever it lands. ' +
        'Only offered to a golfer who has cleared eight worlds and clearly intends to see the campaign ' +
        'through to the serpent — you do not sell a captive sun to a tourist.',
      'The Parrot calls it "the closing argument."',
    ],
  },
  // ── ENGINES (battle speed + a LIVE credit bonus) ──
  {
    id: 'upg:engine:ion',
    category: 'engine',
    name: 'Ion Thrusters',
    rarity: 'rare',
    price: 200,
    acquire: 'buy',
    battle: 4,
    creditMult: 1.05,
    lore: [
      'A clean, quiet ion burn that trims the crossing between worlds — you make more rounds in the same ' +
        'season, and you bank a little more from each (credits +5%). Nimbler in a scrap, too.',
    ],
  },
  {
    id: 'upg:engine:warp',
    category: 'engine',
    name: 'Warp Coil',
    rarity: 'epic',
    price: 420,
    acquire: 'buy',
    battle: 9,
    creditMult: 1.1,
    lore: [
      'Folds a short hop out of the distance entirely. The galaxy shrinks, the purse grows (credits +10%), ' +
        'and a serpent lunging at where you were finds you already somewhere else.',
    ],
  },
  {
    id: 'upg:engine:singularity',
    category: 'engine',
    name: 'Singularity Drive',
    rarity: 'legendary',
    price: 780,
    acquire: 'milestone',
    unlockAfterClears: 8,
    battle: 16,
    creditMult: 1.15,
    lore: [
      'A tamed micro-singularity you fall around and are flung forward by. It makes the Warp Coil look ' +
        'like a bicycle — the biggest credit haul in the fleet (+15%) and the reflexes to dance with a ' +
        'world-eater. Reserved for proven pilots.',
    ],
  },
  // ── SHIELDS ──
  {
    id: 'upg:shield:deflector',
    category: 'shield',
    name: 'Deflector Array',
    rarity: 'rare',
    price: 220,
    acquire: 'buy',
    battle: 10,
    lore: [
      'A standard shimmer-dome that shrugs off debris, stray fire, and the odd overcooked approach shot. ' +
        'It will not stop a serpent’s bite outright, but it buys you the half-second to not be there.',
    ],
  },
  {
    id: 'upg:shield:aegis',
    category: 'shield',
    name: 'Aegis Barrier',
    rarity: 'epic',
    price: 440,
    acquire: 'buy',
    battle: 22,
    lore: [
      'A layered hard-light barrier tuned by the Wardens for exactly one enemy. It hums a low warning note ' +
        'when the corruption is near — some pilots have learned to trust the hum more than their scanners.',
    ],
  },
  {
    id: 'upg:shield:bulwark',
    category: 'shield',
    name: 'Void Bulwark',
    rarity: 'legendary',
    price: 860,
    acquire: 'milestone',
    unlockAfterClears: 10,
    battle: 40,
    lore: [
      'A shield that answers the void with the void: it swallows a strike into a pocket of folded space and ' +
        'lets nothing through. Ten worlds cleared earns the right to buy one — and by then you will want it, ' +
        'because you will have started to hear the serpent in your sleep.',
    ],
  },

  // ── REWARD PARTS (GS-story-reward-variety) — never sold, GRANTED as a quest / Ch.5-major prize. Each is
  // a "spaceship part" that both fits the giver's story AND arms your fleet for the finale (Combat Rating),
  // so seeking out the NPC who gives it is a real, finale-relevant reason to travel. `acquire:'reward'`,
  // so they're revealed only once owned and never appear on a shipyard rack.
  {
    id: 'upg:engine:longhaul',
    category: 'engine',
    name: "The Long Haul's Drive Core",
    rarity: 'legendary',
    price: 0,
    acquire: 'reward',
    battle: 12,
    creditMult: 1.14,
    blurb: "Driver Dan's old rig, reborn in your hull.",
    lore: [
      'The solar-fusion drive core of the Long Haul, Driver Dan’s legendary long-haul rig — pulled from the ' +
        'engine bay of the derelict he could never bring himself to bury, and bolted into your ship with his ' +
        'own hands. It hauled half this galaxy once; it will haul you the rest of the way home.',
      'The single biggest hold-and-earn engine in the fleet — and it banks a little more from every world ' +
        '(credits +14%), because a hauler’s heart never did know how to come home empty.',
    ],
  },
  {
    id: 'upg:shield:carapace',
    category: 'shield',
    name: "The Shedmaker's Carapace",
    rarity: 'legendary',
    price: 0,
    acquire: 'reward',
    battle: 30,
    blurb: 'Serpent-scale hull armour, shed and re-grown.',
    lore: [
      'Sister Ecdysis grows nothing and forges everything: sheet after sheet of the World-Eater’s own cast ' +
        'scale, annealed in the Coil’s acid reliquary and laid over your hull like a second skin. It turns a ' +
        'strike the way the serpent turns a blade — and it is the heaviest ship armour any Coil smith has made.',
      'Power, and its price, as all the Shedmaker’s gifts carry: the finest defence in the galaxy, worn on ' +
        'the road that asks you to stop caring who you were.',
    ],
  },
  {
    id: 'upg:weapon:starlance',
    category: 'weapon',
    name: 'The Star-Blessed Lance',
    rarity: 'legendary',
    price: 0,
    acquire: 'reward',
    battle: 34,
    blurb: 'Clean starfire, forged with the Serpent’s Seal.',
    lore: [
      'When the fifth Sigil closed the seal on the Warden road, the light that pooled in the Keystone was ' +
        'drawn off and wound into a single clean lance of starfire — a weapon consecrated to one purpose, to ' +
        'breach the World-Eater when it wakes. It fires true, asks nothing back, and hums like a held breath.',
      'The Wardens do not sell it. You forged it, Sigil by Sigil, and it is yours for the last fight.',
    ],
  },
  {
    id: 'upg:weapon:wyrmfang',
    category: 'weapon',
    name: 'The Wyrm-Fang Cannon',
    rarity: 'legendary',
    price: 0,
    acquire: 'reward',
    battle: 34,
    blurb: 'A serpent’s fang, slung under your hull.',
    lore: [
      'The Coil harvested a fang the length of a fairway from the World-Eater’s own jaw and slung it beneath ' +
        'your hull as a cannon — it spits a bolt of raw serpent-venom that eats through a hull section and ' +
        'keeps going. Anointed with the Serpent’s Fang, it is the key made into a gun.',
      'Earned, never sold. The Coil arms its Herald for the door it means you to open.',
    ],
  },
];

const UPGRADE_BY_ID: Record<string, StoryShipUpgrade> = Object.fromEntries(
  STORY_SHIP_UPGRADES.map((u) => [u.id, u]),
);

export function shipUpgradeById(id: string): StoryShipUpgrade | undefined {
  return UPGRADE_BY_ID[id];
}
export function isShipUpgradeId(id: string): boolean {
  return !!UPGRADE_BY_ID[id];
}

function nonPrologueClears(story: StoryState): number {
  return story.clearedWorldIds.filter((id) => id !== 'standrews-18').length;
}

/** Is this upgrade revealed at the outfitting bay? `buy` always; `milestone` once enough worlds cleared
 *  (or already owned); a `reward` part is shown only once OWNED (granted by a quest / major, never sold). */
export function upgradeRevealed(story: StoryState, u: StoryShipUpgrade): boolean {
  if (u.acquire === 'reward') return story.ownedShipUpgradeIds.includes(u.id);
  if (u.acquire === 'milestone') {
    return story.ownedShipUpgradeIds.includes(u.id) || nonPrologueClears(story) >= (u.unlockAfterClears ?? 0);
  }
  return true;
}

export function ownsUpgrade(story: StoryState, id: string): boolean {
  return story.ownedShipUpgradeIds.includes(id);
}

/** GS-story-quality: how many upgrades of a category are owned (the star-map ship draws visible weapon
 *  hardpoints scaled by the owned WEAPON count, so arming up shows on the hull). */
export function ownedCategoryCount(story: StoryState, category: UpgradeCategory): number {
  return STORY_SHIP_UPGRADES.filter((u) => u.category === category && ownsUpgrade(story, u.id)).length;
}

export function canBuyUpgrade(story: StoryState, u: StoryShipUpgrade): boolean {
  return u.acquire !== 'reward' && !ownsUpgrade(story, u.id) && upgradeRevealed(story, u) && story.credits >= u.price;
}

/** Buy an upgrade (pure): deduct credits, add to owned (all-owned-are-active). No-op if it can't be bought. */
export function buyShipUpgrade(story: StoryState, id: string): StoryState {
  const u = shipUpgradeById(id);
  if (!u || !canBuyUpgrade(story, u)) return story;
  const next = addCredits(story, -u.price);
  return { ...next, ownedShipUpgradeIds: [...next.ownedShipUpgradeIds, id] };
}

/** GS-story-reward-variety: GRANT a ship upgrade (pure) — own it (all-owned-are-active), no cost. For a
 *  `reward` part handed over by a quest / Ch.5 major. Idempotent (a replay can't re-grant). */
export function grantShipUpgrade(story: StoryState, id: string): StoryState {
  if (!isShipUpgradeId(id) || story.ownedShipUpgradeIds.includes(id)) return story;
  return { ...story, ownedShipUpgradeIds: [...story.ownedShipUpgradeIds, id] };
}

/** The fleet's Combat Rating — the sum of owned upgrades' battle contributions. The finale reads this. */
export function combatRating(story: StoryState): number {
  return story.ownedShipUpgradeIds.reduce((sum, id) => sum + (shipUpgradeById(id)?.battle ?? 0), 0);
}

/** The owned battle rating in one category (weapons / engines / shields) — the finale gates on these so
 *  arming ACROSS categories matters (firepower to breach, engines+shields to survive). */
export function categoryRating(story: StoryState, category: UpgradeCategory): number {
  return story.ownedShipUpgradeIds.reduce((sum, id) => {
    const u = shipUpgradeById(id);
    return u && u.category === category ? sum + u.battle : sum;
  }, 0);
}

/** The live credit multiplier from owned ENGINE upgrades (product; 1 if none). Stacks with the ship's. */
export function upgradeCreditMult(story: StoryState): number {
  return story.ownedShipUpgradeIds.reduce((m, id) => m * (shipUpgradeById(id)?.creditMult ?? 1), 1);
}

/** The mechanical detail line(s) for an upgrade's lore card. */
export function upgradeDetail(u: StoryShipUpgrade): string[] {
  const lines: string[] = [`Combat Rating +${u.battle} (for the finale battle).`];
  if (u.creditMult && u.creditMult > 1) lines.push(`Credits per world clear +${Math.round((u.creditMult - 1) * 100)}%.`);
  if (u.acquire === 'milestone') lines.push(`Revealed after clearing ${u.unlockAfterClears} worlds.`);
  else if (u.acquire === 'reward') lines.push('Earned on a quest — never for sale.');
  return lines;
}

/**
 * Apparel — the cosmetic HATS, SHIRTS and PANTS your golfer wears (GS-cosmetics).
 *
 * Like the cosmetic ship fleet (`ships.ts`), apparel is pure CONTENT AS DATA: an id, the SLOT it fills
 * (hat, shirt or pants), the cosmetic SET it belongs to (some pieces pair into a set, some stand alone), a
 * rarity (= price tier, up to the top `mythic`), and a render `look` that BOTH the wardrobe SVG card
 * (`render/apparelArt.ts`) and the on-course canvas golfer (`render/playView.ts drawGolfer`) key off,
 * so what you buy is what you wear. New garment = new row.
 *
 * NOTHING here touches the sim — apparel is cosmetic, so there are no balance/fairness implications.
 * Bought with Star Shards at the Trade Market's wardrobe; the full catalogue is browsable (no rotating
 * offer — you pick the look you want), one piece equipped per slot.
 */

import type { CosmeticRarity } from './cosmetics';
import { COSMETIC_RARITY } from './cosmetics';

export type ApparelSlot = 'hat' | 'shirt' | 'pants' | 'bag' | 'driver';

/** Hat silhouettes the drawer renders (canvas + SVG share these shape names). `baggy` is the soft
 *  slouched-crown cap of the Evergreen set (GS-unending). `wingedHelm` is the Asgardian Valkyrie helm —
 *  a steel dome with a nasal guard and a feathered wing swept up each side (GS-valkyrie). `starburst` is
 *  the Punched Galaxy crown — a jewelled circlet erupting into a burst of starlight rays (GS-punched-galaxy;
 *  was the Supernova crown, moved into the new set). `solarCrown` is the crown of purple-and-black solar
 *  FLAMES with red coronal energy flickering at the tips — the head of the new SOLAR FLAMES set (was the
 *  Supernova crown, re-homed so the flame look stops clashing with the nebula body; GS-solar-flames).
 *  `supernova` is the mythic Supernova crown that replaces it — a jewelled violet circlet erupting into a
 *  DETONATING star: a white-hot core inside an expanding nebula shell of violet filaments + bright knots,
 *  set-matched to the deep-violet nebula Suit/Leggings (GS-solar-flames). `tricorn` is the galaxy-themed
 *  pirate tricorn of the SPACE PIRATE PARROT set — a cocked three-corner hat washed in nebula + starlight
 *  with gold trim, a star emblem, AND a built-in eye patch drawn over one eye (GS-space-pirate-parrot). */
export type HatShape =
  | 'cap'
  | 'bucket'
  | 'visor'
  | 'tophat'
  | 'crown'
  | 'helmet'
  | 'starburst'
  | 'solarCrown'
  | 'supernova'
  | 'baggy'
  | 'wingedHelm'
  | 'tricorn'
  | 'wardenHalo'
  | 'coilHood';
/** Shirt silhouettes the drawer renders. `blazer` is a tailored jacket — lapels, buttons, crest.
 *  `valkyrie` is a burnished cuirass — pauldrons, a central ridge and a winged chest boss (GS-valkyrie).
 *  `riftplate` is the Punched Galaxy warplate — a dark cosmic cuirass shot through with glowing galaxy-crack
 *  energy erupting from a chest star-core, styled after a cosmic end-boss warlord (GS-punched-galaxy).
 *  `solarflare` is the SOLAR FLAMES body — a dark purple-black robe with a blazing coronal sun-core on
 *  the chest and solar flames licking up the hem, matched to the flame crown (GS-solar-flames).
 *  `wardenMantle` and `coilShroud` are the two CHAMPION bodies (GS-story-champion-cosmetics): a white-gold
 *  Warden vestment under a shoulder mantle with the Fairway crest at the breast, and the Coil's open
 *  serpent robe over a scaled cuirass with the ouroboros clasp at the throat. */
export type ShirtShape =
  | 'polo'
  | 'striped'
  | 'jersey'
  | 'spacesuit'
  | 'cosmic'
  | 'blazer'
  | 'valkyrie'
  | 'riftplate'
  | 'solarflare'
  | 'parrot'
  | 'wardenMantle'
  | 'coilShroud';
/** Pants silhouettes the drawer renders. `greaves` is armoured legwear — war-skirt tassets over the hips
 *  and gold shin greaves (GS-valkyrie). `riftgreaves` is the Punched Galaxy legwear — dark cosmic leggings
 *  cracked with glowing galaxy energy down each leg over angular shin plates (GS-punched-galaxy).
 *  `emberlegs` is the SOLAR FLAMES legwear — dark leggings with solar flames licking up each leg and
 *  red embers flickering, matched to the flame crown + robe (GS-solar-flames). `wardenRaiment` and
 *  `coilScales` are the two CHAMPION legwear pieces (GS-story-champion-cosmetics): white-gold robe tassets
 *  over gilded shin guards, and scaled serpent leggings ridged down each leg in venom green. */
export type PantsShape =
  | 'trousers'
  | 'shorts'
  | 'knickers'
  | 'leggings'
  | 'spacepants'
  | 'nebula'
  | 'greaves'
  | 'riftgreaves'
  | 'emberlegs'
  | 'parrotpants'
  | 'wardenRaiment'
  | 'coilScales';
/** Golf-bag silhouettes the drawer renders (the cosmetic BAG slot, GS-unending). */
export type BagShape = 'staffbag';
/** Driver-club silhouettes the drawer renders (the cosmetic DRIVER slot, GS-thor): the club head the
 *  golfer swings. `thorHammer` is the mythic warhammer with crackling lightning. */
export type DriverShape = 'thorHammer';
/** Glove silhouettes the on-course golfer's grip hand wears (GS-story-avatar): a plain `glove`, an
 *  armoured `gauntlet` (exo-brace), the toy `powerglove`. Story-gear worn looks only — there is no
 *  glove apparel SLOT, so these reach `drawGolfer` via `GolferLook.glove`, never `drawHat`. */
export type GloveShape = 'glove' | 'gauntlet' | 'powerglove';
/** Shoe silhouettes the on-course golfer's feet wear (GS-story-avatar): a `shoe`, a chunky `boot`, or
 *  spiked `spikes`. Story-gear worn looks only (`GolferLook.shoes`), no shoe apparel slot. */
export type ShoeShape = 'shoe' | 'boot' | 'spikes';
/** Club-skin marker for the wielded club's tint (GS-story-avatar): the equipped Story SHAFT recolours the
 *  shaft (and, absent a themed club-set head, the head) the golfer swings. Only the palette is read — the
 *  shape is a marker. Story-gear worn look only (`GolferLook.clubSkin`), no club apparel slot. */
export type ClubShape = 'clubskin';
/** Ball-tracer styles the flight renderer draws (GS-story-avatar): a thin `line` (the plain colour trail),
 *  a fat glowing `comet` tail, a sparking `ember` fire-trail, or a `spark` hiss. The equipped Story BALL
 *  drives it; palette + style are read at the play-view flight trail. Story-worn only (`GolferLook.ballTracer`),
 *  no ball apparel slot. */
export type TracerShape = 'line' | 'comet' | 'ember' | 'spark';

/** The vector look a garment renders as — a shape family + palette + optional aura for the top tiers. */
export interface ApparelLook {
  shape: HatShape | ShirtShape | PantsShape | BagShape | DriverShape | GloveShape | ShoeShape | ClubShape | TracerShape;
  /** Primary fabric colour. */
  color: string;
  /** Secondary trim / brim / stripe colour. */
  accent?: string;
  /** A glowing aura colour (legendary/mythic only) — the drawer adds a soft halo + sparkle. */
  glow?: string;
}

export interface Apparel {
  id: string;
  name: string;
  /** Which body slot it fills. */
  slot: ApparelSlot;
  /** The cosmetic SET it belongs to (a family; some sets span a matching hat + shirt). */
  set: string;
  /** Price tier — gates the rarity ring + shard cost. */
  rarity: CosmeticRarity;
  /** One-line flavour for the wardrobe card. */
  blurb: string;
  /** Shard price. */
  cost: number;
  /** Earned, never bought (GS-unending): unlocked by surviving this many holes of the Unending
   *  Universe. Hidden from the Trade Market until OWNED (GS-hide-unlocks — see `apparelRevealedInMarket`);
   *  `canBuyApparel` refuses it. */
  unlockHoles?: number;
  /** Earned, never bought (GS-thor): a secret reward (won an Asgard tournament). Hidden from the Trade
   *  Market until OWNED (GS-hide-unlocks — same reveal gate as `unlockHoles`); `canBuyApparel` refuses
   *  it. Mirrors `Ship.secret`. */
  secret?: boolean;
  look: ApparelLook;
}

/** Shard prices per rarity tier (the wardrobe economy). Mythic is the headline 300-shard splurge.
 *  Prices were cut 40% in the GS-trade-rebalance (with a one-off refund migration) — see
 *  `docs/decisions/rpg-meta-loop.md`. */
export const APPAREL_COST: Record<CosmeticRarity, number> = {
  common: 9,
  rare: 30,
  epic: 72,
  legendary: 168,
  mythic: 300,
};

export const APPAREL: readonly Apparel[] = [
  // ===== HATS ==========================================================================
  {
    id: 'cap-classic',
    name: 'Classic Cap',
    slot: 'hat',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'A trusty ball cap. Keeps the twin suns out of your eyes.',
    cost: APPAREL_COST.common,
    look: { shape: 'cap', color: '#3f7fd0', accent: '#2a5694' },
  },
  {
    id: 'bucket-safari',
    name: 'Safari Bucket',
    slot: 'hat',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Wide-brimmed and breezy. Ready for any dust belt.',
    cost: APPAREL_COST.common,
    look: { shape: 'bucket', color: '#b7a36a', accent: '#7c6c3e' },
  },
  {
    id: 'visor-tour',
    name: 'Tour Visor',
    slot: 'hat',
    set: 'Tour',
    rarity: 'rare',
    blurb: 'The pro look. Pairs with the Tour polo.',
    cost: APPAREL_COST.rare,
    look: { shape: 'visor', color: '#f4f6fb', accent: '#22407a' },
  },
  {
    id: 'tophat-ace',
    name: 'Ace Top Hat',
    slot: 'hat',
    set: 'Gentleman',
    rarity: 'epic',
    blurb: 'For the golfer who sinks it in style.',
    cost: APPAREL_COST.epic,
    look: { shape: 'tophat', color: '#15161c', accent: '#c0392b' },
  },
  {
    id: 'crown-champion',
    name: "Champion's Crown",
    slot: 'hat',
    set: 'Champion',
    rarity: 'epic',
    blurb: 'Solid gold. You earned the right to gloat.',
    cost: APPAREL_COST.epic,
    look: { shape: 'crown', color: '#f4c542', accent: '#b8860b' },
  },
  {
    id: 'helmet-astro',
    name: 'Astronaut Helmet',
    slot: 'hat',
    set: 'Astronaut',
    rarity: 'legendary',
    blurb: 'Sealed visor, gold tint. Half of the classic space suit.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'helmet', color: '#e8edf5', accent: '#ffd36b', glow: '#bfe3ff' },
  },
  {
    id: 'crown-supernova',
    name: 'Supernova Crown',
    slot: 'hat',
    set: 'Supernova',
    rarity: 'mythic',
    blurb: 'A star caught at the instant it dies — a white-hot core detonating inside an expanding nebula shell of violet filaments and bright knots, crowning the brow. The crown of the Supernova set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'supernova', color: '#3a1d6e', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
  {
    id: 'crown-solarflames',
    name: 'Solar Flare Crown',
    slot: 'hat',
    set: 'Solar Flames',
    rarity: 'mythic',
    blurb: 'A dying star worn as a crown of fire — purple-black solar flames licking upward, red coronal energy flickering at every tip. The crown of the Solar Flames set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'solarCrown', color: '#241042', accent: '#ff4d2a', glow: '#b23cff' },
  },
  {
    id: 'crown-galaxy',
    name: 'Punched Galaxy Crown',
    slot: 'hat',
    set: 'Punched Galaxy',
    rarity: 'mythic',
    blurb: 'A galaxy caught mid-detonation, crowning the brow — a jewelled violet circlet erupting into rays of caught starlight. The crown of the Punched Galaxy set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'starburst', color: '#3a1d6e', accent: '#ff7bf0', glow: '#ff4fd8' },
  },

  // ===== SHIRTS ========================================================================
  {
    id: 'polo-classic',
    name: 'Classic Polo',
    slot: 'shirt',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Crisp, collared, dependable.',
    cost: APPAREL_COST.common,
    look: { shape: 'polo', color: '#2f6fb0', accent: '#1d4a7a' },
  },
  {
    id: 'tee-striped',
    name: 'Striped Tee',
    slot: 'shirt',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Bold bands. Easy to spot from orbit.',
    cost: APPAREL_COST.common,
    look: { shape: 'striped', color: '#d8543c', accent: '#f4f1e6' },
  },
  {
    id: 'polo-tour',
    name: 'Tour Polo',
    slot: 'shirt',
    set: 'Tour',
    rarity: 'rare',
    blurb: 'Performance fabric. Pairs with the Tour visor.',
    cost: APPAREL_COST.rare,
    look: { shape: 'polo', color: '#f4f6fb', accent: '#22407a' },
  },
  {
    id: 'jersey-neon',
    name: 'Neon Jersey',
    slot: 'shirt',
    set: 'Neon',
    rarity: 'epic',
    blurb: 'Electric panels that hum under the stars.',
    cost: APPAREL_COST.epic,
    look: { shape: 'jersey', color: '#1d2030', accent: '#2bf0c0', glow: '#2bf0c0' },
  },
  {
    id: 'suit-space',
    name: 'Space Suit',
    slot: 'shirt',
    set: 'Astronaut',
    rarity: 'legendary',
    blurb: 'The traditional pressure suit — life support and chest panel. Pairs with the helmet.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'spacesuit', color: '#eef1f6', accent: '#d23b32', glow: '#bfe3ff' },
  },
  {
    id: 'suit-supernova',
    name: 'Supernova Suit',
    slot: 'shirt',
    set: 'Supernova',
    rarity: 'mythic',
    blurb: 'A living nebula stitched into fabric. The body of the Supernova set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'cosmic', color: '#3a1d6e', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
  {
    id: 'suit-galaxy',
    name: 'Punched Galaxy Warplate',
    slot: 'shirt',
    set: 'Punched Galaxy',
    rarity: 'mythic',
    blurb: 'A cosmic warlord’s cuirass, cracked from within by a caged star — galaxy energy blazing out of every seam. The body of the Punched Galaxy set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'riftplate', color: '#2a1257', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
  {
    id: 'suit-solarflames',
    name: 'Solar Flames Robe',
    slot: 'shirt',
    set: 'Solar Flames',
    rarity: 'mythic',
    blurb: 'A robe of banked starfire — a coronal sun-core blazing on the chest, purple-black solar flames licking up the hem. The body of the Solar Flames set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'solarflare', color: '#241042', accent: '#ff4d2a', glow: '#b23cff' },
  },

  // ===== PANTS =========================================================================
  // One pair per existing set, so each clothing set can be completed head-to-toe.
  {
    id: 'trousers-classic',
    name: 'Classic Trousers',
    slot: 'pants',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Pressed and practical. Pairs with the Classic cap & polo.',
    cost: APPAREL_COST.common,
    look: { shape: 'trousers', color: '#2f6fb0', accent: '#1d4a7a' },
  },
  {
    id: 'shorts-safari',
    name: 'Safari Shorts',
    slot: 'pants',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Breezy khaki for a hot dust belt. Matches the Safari bucket.',
    cost: APPAREL_COST.common,
    look: { shape: 'shorts', color: '#b7a36a', accent: '#7c6c3e' },
  },
  {
    id: 'trousers-tour',
    name: 'Tour Trousers',
    slot: 'pants',
    set: 'Tour',
    rarity: 'rare',
    blurb: 'Crisp performance slacks. Completes the Tour look.',
    cost: APPAREL_COST.rare,
    look: { shape: 'trousers', color: '#f4f6fb', accent: '#22407a' },
  },
  {
    id: 'knickers-ace',
    name: 'Ace Plus-Fours',
    slot: 'pants',
    set: 'Gentleman',
    rarity: 'epic',
    blurb: 'Old-school golf knickers. The Gentleman is dressed to the ankle.',
    cost: APPAREL_COST.epic,
    look: { shape: 'knickers', color: '#1f2630', accent: '#c0392b' },
  },
  {
    id: 'trousers-champion',
    name: "Champion's Slacks",
    slot: 'pants',
    set: 'Champion',
    rarity: 'epic',
    blurb: 'Threaded with gold. For winners, from the waist down.',
    cost: APPAREL_COST.epic,
    look: { shape: 'trousers', color: '#f4c542', accent: '#b8860b' },
  },
  {
    id: 'leggings-neon',
    name: 'Neon Leggings',
    slot: 'pants',
    set: 'Neon',
    rarity: 'epic',
    blurb: 'Glowing circuit lines that hum to the Neon jersey.',
    cost: APPAREL_COST.epic,
    look: { shape: 'leggings', color: '#1d2030', accent: '#2bf0c0', glow: '#2bf0c0' },
  },
  {
    id: 'pants-astro',
    name: 'Space Suit Legs',
    slot: 'pants',
    set: 'Astronaut',
    rarity: 'legendary',
    blurb: 'Pressurised leggings and mag-boots. Completes the space suit.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'spacepants', color: '#eef1f6', accent: '#d23b32', glow: '#bfe3ff' },
  },
  {
    id: 'leggings-supernova',
    name: 'Supernova Leggings',
    slot: 'pants',
    set: 'Supernova',
    rarity: 'mythic',
    blurb: 'Woven from caught starlight. The legs of the Supernova set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'nebula', color: '#3a1d6e', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
  {
    id: 'leggings-galaxy',
    name: 'Punched Galaxy Greaves',
    slot: 'pants',
    set: 'Punched Galaxy',
    rarity: 'mythic',
    blurb: 'Star-forged greaves, galaxy energy fracturing down each leg over angular cosmic plate. The legs of the Punched Galaxy set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'riftgreaves', color: '#2a1257', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
  {
    id: 'leggings-solarflames',
    name: 'Solar Flames Leggings',
    slot: 'pants',
    set: 'Solar Flames',
    rarity: 'mythic',
    blurb: 'Leggings sheathed in living fire — solar flames licking up each leg, red embers rising off them. The legs of the Solar Flames set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'emberlegs', color: '#241042', accent: '#ff4d2a', glow: '#b23cff' },
  },

  // ===== THE SPACE PIRATE PARROT SET (GS-space-pirate-parrot) ==========================
  // A swashbuckling cosmic-macaw kit: a galaxy-washed pirate TRICORN (gold trim, a star emblem and a
  // built-in eye patch), a plumage TOP of iridescent scalloped macaw feathers over a deep cosmic-blue
  // body, and matching feathered TAIL-FEATHER LEGGINGS. A mythic three-piece set (shard-bought), teal/
  // gold/magenta plumage over cosmic navy, wreathed in a tropical-teal aura. Kept with the other mythic
  // sets, before the earned/secret blocks, so the per-slot `.find(mythic)` ordering is undisturbed.
  {
    id: 'tricorn-parrot',
    name: 'Galaxy Pirate Tricorn',
    slot: 'hat',
    set: 'Space Pirate Parrot',
    rarity: 'mythic',
    blurb: 'A cocked three-corner hat cut from the night sky — nebula-washed felt, gold buccaneer trim, a starlight emblem, and a black eye patch for the captain of the cosmic seas. The crown of the Space Pirate Parrot set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'tricorn', color: '#241a5e', accent: '#ffcf4a', glow: '#7a5cff' },
  },
  {
    id: 'top-parrot',
    name: 'Space Parrot Plumage',
    slot: 'shirt',
    set: 'Space Pirate Parrot',
    rarity: 'mythic',
    blurb: 'A stunning macaw in the void — rows of iridescent teal, gold and magenta feathers over a deep cosmic-blue body, flecked with starlight. The plumage of the Space Pirate Parrot set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'parrot', color: '#12204a', accent: '#ffc23a', glow: '#37e0c4' },
  },
  {
    id: 'legs-parrot',
    name: 'Space Parrot Tailfeathers',
    slot: 'pants',
    set: 'Space Pirate Parrot',
    rarity: 'mythic',
    blurb: 'Long macaw tail-feathers sweeping down each leg — teal, gold and magenta plumes over cosmic navy, tipped with stars. The tailfeathers of the Space Pirate Parrot set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'parrotpants', color: '#0e1a3e', accent: '#ff5a9e', glow: '#37e0c4' },
  },

  // ===== THE VALKYRIE SET (GS-valkyrie) ===============================================
  // An Asgardian Valkyrie / Viking battle-dress: a winged steel helm, a burnished bronze cuirass with
  // gold pauldrons + a winged chest boss, and armoured legs with war-skirt tassets over gold shin
  // greaves. A three-piece LEGENDARY set (shard-bought, not earned) that ties the wardrobe to the
  // game's Asgard interlude alongside the secret Thor's Hammer. Deep-crimson cloth, burnished bronze
  // and gold trim throughout, wreathed in a warm gold aura.
  {
    id: 'helm-valkyrie',
    name: 'Valkyrie Helm',
    slot: 'hat',
    set: 'Valkyrie',
    rarity: 'legendary',
    blurb: 'A winged steel warhelm with a golden nasal guard. Fit for a chooser of the slain.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'wingedHelm', color: '#c6ccd6', accent: '#e6b93f', glow: '#ffd873' },
  },
  {
    id: 'cuirass-valkyrie',
    name: 'Valkyrie Cuirass',
    slot: 'shirt',
    set: 'Valkyrie',
    rarity: 'legendary',
    blurb: 'Burnished bronze plate with gold pauldrons and a winged chest boss. The heart of the set.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'valkyrie', color: '#b8823a', accent: '#ffe08a', glow: '#ffd873' },
  },
  {
    id: 'greaves-valkyrie',
    name: 'Valkyrie Greaves',
    slot: 'pants',
    set: 'Valkyrie',
    rarity: 'legendary',
    blurb: 'Crimson-leather warskirt over gold shin greaves. Completes the Valkyrie battle-dress.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'greaves', color: '#7a2f34', accent: '#e6b93f', glow: '#ffd873' },
  },

  // ===== THE EVERGREEN SET (GS-unending) ==============================================
  // Earned, never bought: the Unending Universe's survival trophies. Deep evergreen with gold
  // thread throughout, capped by the mythic Evergreen Blazer. Kept AFTER the shard-bought
  // catalogue so the market's per-slot `.find(mythic)` ordering (tests) is undisturbed.
  // NB (GS-tm-names): these display names are deliberately generic. An earlier pass shipped "The
  // Green Jacket" and "Baggy Green Cap", which read as Augusta National and Cricket Australia
  // marks. The `id`s keep their original slugs so saves migrate untouched.
  {
    id: 'bag-evergreen',
    name: 'Evergreen Tour Bag',
    slot: 'bag',
    set: 'Evergreen',
    rarity: 'epic',
    blurb: 'A hand-stitched staff bag in championship green. Survive 40 holes of the Unending Universe.',
    cost: APPAREL_COST.epic,
    unlockHoles: 40,
    look: { shape: 'staffbag', color: '#0f5132', accent: '#d9b74a' },
  },
  {
    id: 'cap-baggy-green',
    name: 'Evergreen Soft Cap',
    slot: 'hat',
    set: 'Evergreen',
    rarity: 'legendary',
    blurb: 'A soft-crowned cap in deep evergreen, gold-embroidered. Survive 60 holes of the Unending Universe.',
    cost: APPAREL_COST.legendary,
    unlockHoles: 60,
    look: { shape: 'baggy', color: '#0e4d2c', accent: '#d9b74a', glow: '#7fe0a8' },
  },
  {
    id: 'pants-evergreen',
    name: 'Evergreen Pro Pants',
    slot: 'pants',
    set: 'Evergreen',
    rarity: 'legendary',
    blurb: 'Dark-green tour slacks with a gold pinstripe, pressed to a knife edge. Survive 80 holes.',
    cost: APPAREL_COST.legendary,
    unlockHoles: 80,
    look: { shape: 'trousers', color: '#0b3d24', accent: '#d9b74a', glow: '#7fe0a8' },
  },
  {
    id: 'jacket-green',
    name: 'The Evergreen Blazer',
    slot: 'shirt',
    set: 'Evergreen',
    rarity: 'mythic',
    blurb: "The set's crowning tailor-work — deep evergreen, gold thread, a star at the breast. Survive 100 holes.",
    cost: APPAREL_COST.mythic,
    unlockHoles: 100,
    look: { shape: 'blazer', color: '#0f5132', accent: '#f2d06b', glow: '#4fe08a' },
  },

  // ===== THE DRIVER SLOT (GS-thor) ====================================================
  // A cosmetic CLUB skin the golfer swings — the first is Thor's Hammer, a mythic warhammer wreathed in
  // lightning. SECRET + earned (never bought): granted for winning an Asgard tournament (wired in a later
  // phase). Hidden from the Trade Market until owned. Kept LAST so the per-slot `.find(mythic)` ordering
  // of the other slots is undisturbed.
  {
    id: 'thors-hammer',
    name: "Thor's Hammer",
    slot: 'driver',
    set: 'Thor',
    rarity: 'mythic',
    blurb: 'Mjölnir reforged as a driver — a rune-etched warhammer crackling with caught lightning. Won on the storms of Asgard.',
    cost: 0, // never bought — earned by winning an Asgard tournament
    secret: true,
    look: { shape: 'thorHammer', color: '#c9a24a', accent: '#59b6ff', glow: '#59b6ff' },
  },

  // ===== THE CHAMPION SETS (GS-story-champion-cosmetics) ==============================
  // Two three-piece outfits, one per Story-Tour ending — earned by BEATING the World-Eater on that path,
  // never bought, hidden from the Trade Market until owned. The alignment you finish on is the whole key:
  // one campaign can only ever hang ONE of these, so the other set costs a second run down the other road.
  // Palettes are the paths' established colours, not new invention — Warden white-gold from the Radiant
  // Warden Cruiser + `wardenArk.ts` (HULL_LIT #f4f8ff / GOLD #ffe08a / GLASS #bfe9ff), Coil violet + venom
  // from the defector costume (`storyBetrayal.ts` COIL_ROBE #3a1a52 / COIL_HOOD #241038 / COIL_ACCENT
  // #7fe0a0) — so a champion reads as the order they served everywhere they already appear.
  //
  // Kept LAST in the catalogue on purpose: `apparelForSlot` sorts by rarity but is otherwise stable, so
  // the per-slot `.find(mythic)` invariant in `tests/apparel.test.ts` keeps resolving to the 300-shard
  // piece that is actually FOR SALE, exactly as the Thor block above preserves it for the driver slot.
  {
    id: 'warden-halo',
    name: "Warden's Halo",
    slot: 'hat',
    set: 'Warden Vigil',
    rarity: 'mythic',
    blurb: 'A white-gold circlet under a standing ring of held starlight. Worn by the champion who sang the World-Eater back to sleep.',
    cost: 0, // never bought — earned by finishing the Story Tour on the Warden path
    secret: true,
    look: { shape: 'wardenHalo', color: '#f4f8ff', accent: '#ffe08a', glow: '#bfe9ff' },
  },
  {
    id: 'warden-mantle',
    name: "Warden's Mantle",
    slot: 'shirt',
    set: 'Warden Vigil',
    rarity: 'mythic',
    blurb: 'The vestment of the Fairway Wardens — pale as an Ark hull, gold at every seam, the Fairway crest at the breast.',
    cost: 0,
    secret: true,
    look: { shape: 'wardenMantle', color: '#f4f8ff', accent: '#ffe08a', glow: '#bfe9ff' },
  },
  {
    id: 'warden-raiment',
    name: "Warden's Raiment",
    slot: 'pants',
    set: 'Warden Vigil',
    rarity: 'mythic',
    blurb: 'Robed tassets over gilded shin guards. They have walked a fairway in every world that still has one.',
    cost: 0,
    secret: true,
    look: { shape: 'wardenRaiment', color: '#f4f8ff', accent: '#ffe08a', glow: '#bfe9ff' },
  },
  {
    id: 'coil-hood',
    name: 'Coil Hood',
    slot: 'hat',
    set: 'Coil Shroud',
    rarity: 'mythic',
    blurb: 'A raised cobra hood behind a serpent circlet. You are not wearing the Coil. The Coil is wearing you.',
    cost: 0, // never bought — earned by finishing the Story Tour on the Herald path
    secret: true,
    look: { shape: 'coilHood', color: '#241038', accent: '#7fe0a0', glow: '#7fe0a0' },
  },
  {
    id: 'coil-shroud',
    name: 'Coil Shroud',
    slot: 'shirt',
    set: 'Coil Shroud',
    rarity: 'mythic',
    blurb: 'An open serpent robe over a scaled cuirass, the ouroboros clasped at the throat. All fairways end.',
    cost: 0,
    secret: true,
    look: { shape: 'coilShroud', color: '#3a1a52', accent: '#7fe0a0', glow: '#7fe0a0' },
  },
  {
    id: 'coil-scales',
    name: 'Coil Scales',
    slot: 'pants',
    set: 'Coil Shroud',
    rarity: 'mythic',
    blurb: 'Shed World-Eater scale, grown to fit. It moves before you do.',
    cost: 0,
    secret: true,
    look: { shape: 'coilScales', color: '#3a1a52', accent: '#7fe0a0', glow: '#7fe0a0' },
  },
];

const BY_ID: Record<string, Apparel> = Object.fromEntries(APPAREL.map((a) => [a.id, a]));

export function apparelById(id: string | undefined): Apparel | undefined {
  return id ? BY_ID[id] : undefined;
}

/** Every garment that fills a given slot, ordered by ascending rarity then catalogue order. */
export function apparelForSlot(slot: ApparelSlot): Apparel[] {
  return APPAREL.filter((a) => a.slot === slot).sort(
    (a, b) => COSMETIC_RARITY[a.rarity].order - COSMETIC_RARITY[b.rarity].order,
  );
}

/** Can this garment be bought? (Affordable + not already owned + actually FOR SALE — an
 *  Unending-Universe unlock (GS-unending) is earned, never bought.) */
export function canBuyApparel(item: Apparel | undefined, shards: number, owned: readonly string[]): boolean {
  return !!item && !item.unlockHoles && !item.secret && shards >= item.cost && !owned.includes(item.id);
}

/** Should this garment appear in the Trade Market at all (GS-hide-unlocks)? An earned Unending-Universe
 *  unlock stays OUT of the rack until it's owned — the market never spoils the milestone reward. Ordinary
 *  for-sale garments are always shown. */
export function apparelRevealedInMarket(item: Apparel, owned: readonly string[]): boolean {
  return !(item.unlockHoles || item.secret) || owned.includes(item.id);
}

/**
 * The set a garment belongs to is COMPLETE when EVERY slot that set defines is equipped with a matching
 * piece — hat + shirt + pants (+ bag, for a set that defines one) — or both halves of a two-piece set.
 * Used to award the "set bonus" sparkle on the wardrobe + the on-course aura. Returns the set name when
 * the currently equipped pieces fully assemble one multi-piece set (Rookie's basics never count).
 */
export function equippedSet(
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  bagId?: string | undefined,
): string | undefined {
  const worn = [apparelById(hatId), apparelById(shirtId), apparelById(pantsId), apparelById(bagId)].filter(
    (a): a is Apparel => !!a,
  );
  // A set needs at least two matching pieces; everything worn must share one non-Rookie set.
  if (worn.length < 2) return undefined;
  const set = worn[0]!.set;
  if (set === 'Rookie' || !worn.every((a) => a.set === set)) return undefined;
  // Complete only when every slot the set defines in the catalogue is actually worn.
  const setSlots = new Set(APPAREL.filter((a) => a.set === set).map((a) => a.slot));
  const wornSlots = new Set(worn.map((a) => a.slot));
  for (const slot of setSlots) if (!wornSlots.has(slot)) return undefined;
  return set;
}

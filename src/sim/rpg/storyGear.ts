/**
 * Story-Tour GEAR (GS-story-gear) — effect-bearing equipment sold in the per-world Pro Shops: a glove,
 * a cap, shoes, a ball. Unlike a cosmetic, each fold a REAL `PlayerLoadout` effect into a Story round
 * (tighter dispersion, a wider putt window, lie relief out of trouble, more approach bite). PURE +
 * DOM-free; the Pro Shop screen + the reusable lore card render it.
 *
 * One item per SLOT is equipped at a time (`StoryState.equippedGear[slot]`), swapped by buying/equipping
 * another of that slot. Effects are folded onto the round loadout by `applyStoryGear` at tee-off — Story
 * rounds ONLY, so Voyage/Unending are byte-for-byte unchanged (they never call it; the folded fields all
 * default to no-ops, the caddy-field pattern). Ids are `gear:<slot>:<variant>`; the art routes off the
 * slot (`render/itemArt.ts itemArtKind`), the rarity tints it.
 *
 * Item-authoring rule (GS-story-lore-cards): every gear row carries its own art (via the slot), a
 * mechanical DETAIL, and bespoke LORE — never a bare stat. See docs/decisions/story-mode.md.
 */

import type { Rarity } from '../course/contract';
import type { ApparelLook } from './apparel';
import type { PlayerLoadout } from './economy';
import { boostDistanceClubs, addFamilyMinCarry } from './economy';
import { combineShapeMods } from '../shot';
import { addCredits, type GearSlot, type StoryState, type StoryAlignment } from './story';

/** Add penalty kind(s) to a hazard-immunity list (the shopItems `addImmune` twin), de-duplicated. Pure. */
function addImmune(cur: string[] | undefined, ...kinds: string[]): string[] {
  const set = new Set(cur ?? []);
  for (const k of kinds) set.add(k);
  return [...set];
}

/** A purchasable, equippable piece of Story gear. `apply` folds its effect onto a round loadout. */
export interface StoryGearItem {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: Rarity;
  price: number;
  /** A short rack-card blurb. */
  blurb: string;
  /** The mechanical detail line(s) for the lore card (what it does). */
  detail: string[];
  /** The flavour lore paragraph(s). */
  lore: string[];
  /** Fold this item's effect onto the round loadout (pure). */
  apply: (loadout: PlayerLoadout) => PlayerLoadout;
  /** GS-story-avatar: the WORN cosmetic look this piece gives the on-course golfer in a Story round —
   *  a hat silhouette, a staff-bag colourway, a glove/shoe tint, a club skin. Absent = the piece is
   *  effect-only and shows nothing on the avatar (the default outfit stands). The equipped Story gear is
   *  the ONLY cosmetic source in Story Tour (the clubhouse wardrobe is ignored there); Voyage/Unending
   *  never read this. Reuses `ApparelLook` so the same `drawGolfer` painters render it — what you equip in
   *  the campaign is what you wear on the course. */
  avatar?: ApparelLook;
  /** GS-story-route-rewards: route-GATED relic — only revealed/buyable on this path (a Herald cursed
   *  shedding or a Warden grace piece). Absent = an ordinary item, available to any path. */
  alignment?: StoryAlignment;
  /** The downside line shown on the lore card for a CURSED shedding (power with a price). Absent = clean. */
  curse?: string;
  /** GS-story-reward-variety: `reward` = GRANTED by an ally quest, never stocked in a shop. Absent = an
   *  ordinary purchasable item. (Kept out of `STORY_GEAR_STOCK`, so it's simply never offered for sale.) */
  acquire?: 'reward';
}

// The gear catalogue. Effects mirror the Voyage gear economy's proven levers so they're balanced +
// familiar: dispersionMult (×<1 = tighter), puttBoost (+ = wider make-window), lieRelief (0..1 = softer
// bad-lie penalty), backspinBoost (+ = more approach check). Each defaults to a no-op when unequipped.
export const STORY_GEAR: readonly StoryGearItem[] = [
  // ── Glove (grip → tighter dispersion) ──────────────────────────────────────
  {
    id: 'gear:glove:tacky',
    slot: 'glove',
    name: 'Tacky Tour Glove',
    avatar: { shape: 'glove', color: '#2b2f3a', accent: '#5fd0c0' },
    rarity: 'rare',
    price: 200,
    blurb: 'A surer grip — tighter shots.',
    detail: ['Dispersion ×0.93 — shots scatter less.'],
    lore: [
      'Cut from the hide of something that lived on a heavier world, the leather stays tacky in any ' +
        'atmosphere — vacuum-cold, jungle-wet, forge-hot. The grip never slips, so the swing never has ' +
        'to grip harder than it means to.',
      'A steady hand is the cheapest stroke you will ever buy.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.93 }),
  },
  {
    id: 'gear:glove:vice',
    slot: 'glove',
    name: 'Vice-Grip Gauntlet',
    avatar: { shape: 'gauntlet', color: '#8a94a6', accent: '#d6e0ee' },
    rarity: 'epic',
    price: 380,
    blurb: 'A locked wrist — far tighter shots.',
    detail: ['Dispersion ×0.85 — a much tighter shot pattern.'],
    lore: [
      'Half glove, half exo-brace: micro-servos in the cuff sense the top of the backswing and lock ' +
        'the lead wrist flat for a fraction of a second at impact. The Wardens issue them to golfers ' +
        'flying into the gale-worlds, where a loose hand is a lost ball.',
      'It is said the first pilot to wear one shot the Draco Gale in the storm of the century and never ' +
        'missed a fairway. It is also said she never took it off again.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85 }),
  },
  // ── Cap (a clear read → a wider putt make-window) ──────────────────────────
  {
    id: 'gear:hat:visor',
    slot: 'hat',
    name: 'Polarised Tour Visor',
    avatar: { shape: 'visor', color: '#1b6f6a', accent: '#0d3b38' },
    rarity: 'rare',
    price: 200,
    blurb: 'A cleaner read — holes more putts.',
    detail: ['Putt make-window +8% — the line reads truer.'],
    lore: [
      'The lens filters out a star’s glare and paints the green’s fall-lines in faint false colour, so ' +
        'the break stops being a guess. Old caddies grumble that reading greens should be an art, not a ' +
        'setting — then quietly ask where you got one.',
      'You still have to roll it. The visor only tells you the truth.',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.08 }),
  },
  {
    id: 'gear:hat:focus',
    slot: 'hat',
    name: 'Focus Crown',
    avatar: { shape: 'crown', color: '#2b2f45', accent: '#8fa0d8' },
    rarity: 'epic',
    price: 380,
    blurb: 'Total focus — holes far more putts.',
    detail: ['Putt make-window +16% — the read is dead certain.'],
    lore: [
      'A circlet of quiet: it damps the noise of the gallery, the hum of the ship, the whisper of the ' +
        'Coil at the edge of hearing, until there is nothing left but the ball, the cup, and the line ' +
        'between them. Wardens meditate in it before a final round.',
      'Some who wear it too long say the silence starts to feel like company. They put it away for a while.',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.16 }),
  },
  // ── Shoes (traction → lie relief out of trouble) ───────────────────────────
  {
    id: 'gear:shoes:spikes',
    slot: 'shoes',
    name: 'All-Terrain Spikes',
    avatar: { shape: 'spikes', color: '#f0f0f4', accent: '#3a6ea5' },
    rarity: 'rare',
    price: 200,
    blurb: 'A planted stance — better from bad lies.',
    detail: ['Lie relief — bad lies (rough / sand / trees) hurt less.'],
    lore: [
      'Self-adjusting cleats bite dune-sand, wet fescue, cracked lava-crust and bare deck-plate alike, ' +
        'so a lousy stance stops stealing the shot. The soles were reverse-engineered from a mountain ' +
        'grazer that never once lost its footing on a cliff.',
      'You can’t always find the fairway. You can always stand up straight when you don’t.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.3) }),
  },
  {
    id: 'gear:shoes:gravlock',
    slot: 'shoes',
    name: 'Gravity-Lock Boots',
    avatar: { shape: 'boot', color: '#3a4048', accent: '#8a94a6' },
    rarity: 'epic',
    price: 380,
    blurb: 'Rooted to the ground — great from any lie.',
    detail: ['Strong lie relief — even brutal lies play close to clean.'],
    lore: [
      'Mag-clamp soles that grip the planet itself. On the low-gravity worlds — the bomber’s junkyards, ' +
        'the drifting wrecks — they are the difference between a swing and a slow-motion tumble into the ' +
        'void. Plant, load, fire; the ground holds you the whole way through.',
      'The Wardens who salvage the Ghost Wreck will not step aboard without them.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.45) }),
  },
  // ── Ball (cover → approach bite / check) ───────────────────────────────────
  {
    id: 'gear:ball:soft',
    slot: 'ball',
    name: 'Soft-Cover Tour Ball',
    avatar: { shape: 'line', color: '#eaf2ff' },
    rarity: 'rare',
    price: 180,
    blurb: 'More check — approaches bite and hold.',
    detail: ['Backspin +8% — wedges and short irons stop faster.'],
    lore: [
      'A urethane cover milled so fine the grooves of a wedge can really grab it, so an approach lands, ' +
        'skips once, and sits. On a firm green that is the whole game: fly it to the flag and trust it ' +
        'to stay.',
      'A box of a dozen, refilled at every Pro Shop. You will lose some. Buy more.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.08 }),
  },
  {
    id: 'gear:ball:zip',
    slot: 'ball',
    name: 'Zip-Spin Ball',
    avatar: { shape: 'line', color: '#5fd0ff' },
    rarity: 'epic',
    price: 360,
    blurb: 'Vicious check — approaches rip back.',
    detail: ['Backspin +15% — approaches bite hard and can spin back.'],
    lore: [
      'A dual-core ball with a cover that seems to remember the groove it was struck with: it flies flat ' +
        'and hot, then the moment it touches turf it snaps into reverse, hunting back toward the pin. ' +
        'First-timers routinely spin it off the front of the green and swear off it — then buy another sleeve.',
      'Respect the check. A back pin wants it; a front pin punishes it.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.15 }),
  },
  {
    id: 'gear:ball:comet',
    slot: 'ball',
    name: 'Comet Ball',
    avatar: { shape: 'comet', color: '#dfe8ff', accent: '#ffffff', glow: '#bcd0ff' },
    rarity: 'legendary',
    price: 620,
    blurb: 'Long AND biting — the apex ball.',
    detail: ['Backspin +18% AND a longer carry on the distance clubs.', 'Trails a faint comet tail in flight.'],
    lore: [
      'A ball with a real cometary chip at its core — a mote of ice and iron that fell across half the ' +
        'galaxy before someone caught it and wound a cover around it. It flies further than it has any ' +
        'right to and still bites like a tour ball, and it draws a thin silver tail behind it so the ' +
        'whole gallery can watch it go.',
      'The Wardens only sell them in the serpent’s reaches, to golfers who have earned the right to lose one.',
    ],
    apply: (m) => ({
      ...m,
      backspinBoost: (m.backspinBoost ?? 0) + 0.18,
      minCarryBoost: m.minCarryBoost + 0.04,
    }),
  },

  // ── LEGENDARY apex gear (GS-story-gear-tiers) — the top CLEAN tier per slot. Story gear is ONE ITEM PER
  // SLOT (like clubs — you can't stack two gloves), so the apex tier is deliberately strong enough to stand
  // alone: a single legendary piece beats two lesser ones you could never wear at once. Dear, and stocked
  // only in the deep worlds, so it caps a real rare → epic → legendary ladder in every slot.
  {
    id: 'gear:glove:master',
    slot: 'glove',
    name: 'Master’s Grip',
    avatar: { shape: 'gauntlet', color: '#caa15a', accent: '#f0e0a8', glow: '#ffd873' },
    rarity: 'legendary',
    price: 720,
    blurb: 'The surest hand in the galaxy.',
    detail: ['Dispersion ×0.72 — a tour-perfect pattern, tighter than any epic.'],
    lore: [
      'The last glove Custodian Pim ever stitched, cut from the hide of a beast that walked a world where ' +
        'gravity itself ran heavy — every fibre remembers the weight and lends it back to your hands. There ' +
        'is no tighter clean grip made anywhere; the Wardens keep only a handful, for champions who have ' +
        'earned the right to never blame the equipment again.',
      'One perfect glove beats two good ones you could only ever wear one at a time.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.72 }),
  },
  {
    id: 'gear:hat:oracle',
    slot: 'hat',
    name: 'Oracle’s Circlet',
    avatar: { shape: 'starburst', color: '#cbd6ff', accent: '#7f9bff', glow: '#9fb4ff' },
    rarity: 'legendary',
    price: 720,
    blurb: 'Every line, laid bare.',
    detail: ['Putt make-window +24% — the green keeps no secrets.'],
    lore: [
      'A crown of cold starlight that does in miniature what the Prognostic Parrot does whole: it shows you ' +
        'the ball already resting in the cup, and the line it took to get there, a half-second before you ' +
        'draw the putter back. Wearing it feels like remembering a putt you have not hit yet.',
      'The green keeps no secrets from a golfer who can see the future of the roll.',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.24 }),
  },
  {
    id: 'gear:shoes:anchor',
    slot: 'shoes',
    name: 'Void-Anchor Boots',
    avatar: { shape: 'boot', color: '#20242e', accent: '#6a74e0', glow: '#7f88ff' },
    rarity: 'legendary',
    price: 720,
    blurb: 'Stand firm on nothing at all.',
    detail: ['Immense lie relief — the worst lie in the galaxy plays nearly clean.'],
    lore: [
      'Boots soled with a sliver of neutron-star crust, so dense they anchor you to any surface at all — ' +
        'dune, acid crust, drifting deck, the bare hull of a dead ship hung over the abyss. Nothing short of ' +
        'the void itself can knock you off your stance, and even the void has to work at it.',
      'A perfect stance from a terrible lie is worth more than a good lie you keep sliding off.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.7) }),
  },

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // GS-story-shop-depth — the DEEP catalogue. The Pro Shops were thin: one effect per slot, each just
  // "the same thing but a higher tier". This pours in the Voyage economy's proven, VARIED `PlayerLoadout`
  // levers (distance, wind, hazard-skip, spray-shaping, power, reading, credits) so every slot is a real
  // CHOICE of BUILD, not a straight ladder — and there are green/blue staples to buy from stop one, purple
  // upgrades mid-campaign, and fun unique legendaries deep in. Each folds a no-op-default field (Story-only,
  // auto ≡ interactive), and each is placed at a THEMATIC world (the hazard balls at their own hazard, the
  // wind gear on the gale-worlds, …) so travel is collection. All obey the item-authoring rule (art via the
  // slot + rarity, mechanical detail, bespoke lore).

  // ── GLOVE — the hands. Beyond the accuracy ladder (tacky→vice→master): a green starter, a green
  // slice-fixer, a blue sweet-spot, and the legendary POWER GLOVE (a different axis entirely — pure power).
  {
    id: 'gear:glove:worn',
    slot: 'glove',
    name: 'Broken-In Tour Glove',
    avatar: { shape: 'glove', color: '#c9a86a', accent: '#8a6a3a' },
    rarity: 'common',
    price: 70,
    blurb: 'A cheap, honest glove — a touch tighter.',
    detail: ['Dispersion ×0.97 — a modest, reliable tightening.'],
    lore: [
      'Every rookie leaving their home star is handed one of these off the Warden quartermaster’s cart: ' +
        'plain hide, double-stitched, already worn soft by someone else’s round. It won’t win you a major, ' +
        'but it will stop the club turning in a sweaty grip — and that is where good golf starts.',
      'Cheap, cheerful, and better than a bare hand every single time.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.97 }),
  },
  {
    id: 'gear:glove:antislice',
    slot: 'glove',
    name: 'Square-Face Glove',
    avatar: { shape: 'glove', color: '#3a6ea5', accent: '#dfe8ff' },
    rarity: 'common',
    price: 90,
    blurb: 'Kills the block-right — tames the slice.',
    detail: ['Trims the SLICE miss (right) — that weak fade straightens up.'],
    lore: [
      'A glove padded along the heel so the lead hand can’t cup at the top — the one fault behind nine in ' +
        'ten slices. Wear it a while and the correction sinks into muscle memory; take it off and the ball ' +
        'still flies straighter for an hour or two, like the glove left a note.',
      'It only fixes the slice. Everything else is still on you.',
    ],
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.08 }) }),
  },
  {
    id: 'gear:glove:sweet',
    slot: 'glove',
    name: 'Sweet-Spot Mitt',
    avatar: { shape: 'glove', color: '#3f9d6a', accent: '#e8f5d8' },
    rarity: 'rare',
    price: 160,
    blurb: 'Find the centre more often — more great shots.',
    detail: ['Trims EVERY miss zone — more flush centre-strikes across the board.'],
    lore: [
      'The palm is printed with a pressure map that quietly nudges the hands toward the exact grip that ' +
        'squares the face — so contact drifts to the middle of the club without you thinking about it. The ' +
        'gallery just sees a golfer who keeps flushing it.',
      'It doesn’t erase a miss. It makes the good swing your default one.',
    ],
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.02, sliceR: -0.02, duckHookL: -0.01, shankR: -0.01 }),
      dispersionMult: m.dispersionMult * 0.95,
    }),
  },
  {
    id: 'gear:glove:power',
    slot: 'glove',
    name: 'The Power Glove',
    avatar: { shape: 'powerglove', color: '#8891a0', accent: '#c8ccd6', glow: '#ff4d4d' },
    rarity: 'legendary',
    price: 420,
    blurb: 'It’s so bad. Crank the pull to MAX.',
    detail: ['Pull the power gesture to +40% — the biggest bomb in the galaxy (no accuracy help — pure power).'],
    lore: [
      'A relic dug out of the Ghost Wreck’s cargo hold, stamped with the logo of a toy empire that fell ' +
        'before the first Warden ever teed off. Slip it on, wire it to the shaft, and the pull-to-power ' +
        'gesture stops caring about "a full swing" — you can wind it up past anything sane and launch the ' +
        'ball into the next time zone. It gives you nothing but distance, and distance is a lot.',
      'It’s so bad. It’s so good.',
    ],
    apply: (m) => ({ ...m, overpower: Math.max(m.overpower ?? 0, 0.4) }),
  },

  // ── HAT — the eyes. Beyond the putt-window ladder (visor→focus→oracle): green reading aids, a blue
  // spin-line read, a purple full spin computer, and a legendary that reads the BREAK for you.
  {
    id: 'gear:hat:reader',
    slot: 'hat',
    name: 'Green-Reader’s Cap',
    avatar: { shape: 'cap', color: '#3b6b3f', accent: '#e8dca0' },
    rarity: 'common',
    price: 70,
    blurb: 'Reads the break further — a few more putts.',
    detail: ['Confident putt-read line stretches ~5y further, and the make-window widens a touch (+4%).'],
    lore: [
      'The bill is embroidered with a fading galaxy of little fall-line arrows — an old caddy’s cheat-sheet, ' +
        'stitched over a lifetime of missed reads. Pull it low and the greens stop hiding their slope; the ' +
        'break line in your mind’s eye simply reaches a little further toward the cup.',
      'Every stroke you save on the greens is a stroke you didn’t have to strike pure.',
    ],
    apply: (m) => ({
      ...m,
      puttReadBonus: (m.puttReadBonus ?? 0) + 5,
      puttBoost: (m.puttBoost ?? 0) + 0.04,
    }),
  },
  {
    id: 'gear:hat:range',
    slot: 'hat',
    name: 'Rangefinder Visor',
    avatar: { shape: 'visor', color: '#2b3550', accent: '#ff5a4a' },
    rarity: 'common',
    price: 90,
    blurb: 'Yardages on tap — a suggested club.',
    detail: ['A heads-up rangefinder — shows a suggested club and the green front/middle/back read.'],
    lore: [
      'A tour visor with a laser pipped into the brim: sight the flag, blink, and the exact carry paints ' +
        'itself across your vision along with the club that flies it. Purists mutter that a real golfer ' +
        'knows their yardages — then squint at the pin and quietly wish they had one.',
      'It tells you the number. Hitting the number is still the hard part.',
    ],
    apply: (m) => ({ ...m, clubSuggest: true }),
  },
  {
    id: 'gear:hat:spin',
    slot: 'hat',
    name: 'Spin-Read Cap',
    avatar: { shape: 'cap', color: '#274b6b', accent: '#7fd0ff' },
    rarity: 'rare',
    price: 140,
    blurb: 'See the check — approaches read truer.',
    detail: ['Extends the approach roll/check line further, and rips a touch more backspin (+4%).'],
    lore: [
      'A cap woven with a filament that traces a struck ball’s spin and prints its predicted skid-and-check ' +
        'right onto the turf ahead — so you can see where a biting wedge will actually stop before you swing ' +
        'it. On a firm, tilted green that little grey line is the difference between a tap-in and a three-putt.',
      'Fly it to the number and trust the line.',
    ],
    apply: (m) => ({
      ...m,
      spinReadBonus: (m.spinReadBonus ?? 0) + 6,
      backspinBoost: (m.backspinBoost ?? 0) + 0.04,
    }),
  },
  {
    id: 'gear:hat:computer',
    slot: 'hat',
    name: 'Trajectory Crown',
    avatar: { shape: 'crown', color: '#20304a', accent: '#66e0c8' },
    rarity: 'epic',
    price: 220,
    blurb: 'The WHOLE roll, read — check and curl.',
    detail: ['Computes the FULL approach roll — every yard of check and contour curl to where it settles — and +5% backspin.'],
    lore: [
      'A circlet of quiet computation the Wardens issue to their green-reading corps: it doesn’t just read ' +
        'the check, it solves the entire roll — the skid, the grab, the long curl down the contour to the ' +
        'exact blade of grass the ball will die on. Wearing it, a wild tiered green becomes a solved puzzle.',
      'The line reaches all the way home now. You just have to send it.',
    ],
    apply: (m) => ({
      ...m,
      spinReadFull: true,
      backspinBoost: (m.backspinBoost ?? 0) + 0.05,
    }),
  },
  {
    id: 'gear:hat:seer',
    slot: 'hat',
    name: 'The Seer’s Circlet',
    avatar: { shape: 'supernova', color: '#dfe8ff', accent: '#b0c4ff', glow: '#cfe0ff' },
    rarity: 'legendary',
    price: 700,
    blurb: 'The break, read FOR you — just judge the pace.',
    detail: ['Reads the BREAK for you — the putt aims itself on the perfect slope-compensated line, +12% make-window and a longer read.'],
    lore: [
      'A band of starlight that does on every green what only the Mystic Mole could: it takes the read out ' +
        'of your hands entirely, snapping your aim to the one true line the slope demands, so all that is left ' +
        'is pace. Champions who wear it say putting stops being a guess and becomes a conversation — you and ' +
        'the green agreeing on where the ball will go.',
      'It reads the line. Judging the speed is the last art it leaves you.',
    ],
    apply: (m) => ({
      ...m,
      greenRead: true,
      puttBoost: (m.puttBoost ?? 0) + 0.12,
      puttReadBonus: (m.puttReadBonus ?? 0) + 10,
    }),
  },

  // ── SHOES — the stance. Beyond the lie-relief ladder (spikes→gravlock→anchor): a green starter and a
  // blue "planted base" that steadies your DISTANCES (a repeatable strike off a solid stance).
  {
    id: 'gear:shoes:turf',
    slot: 'shoes',
    name: 'Turf-Gripper Cleats',
    avatar: { shape: 'shoe', color: '#5a5f6a', accent: '#2c3038' },
    rarity: 'common',
    price: 70,
    blurb: 'A steadier base — a little help from bad lies.',
    detail: ['Light lie relief — rough, sand and awkward stances sting a bit less.'],
    lore: [
      'Moulded soles studded with stubby ceramic cleats that bite most turf you’ll meet in the near stars. ' +
        'They won’t save you off a lava shelf, but out of the first cut and the fairway bunkers they keep ' +
        'your feet under you, and a stance you can trust is half a recovery shot for free.',
      'You’ll still find the rough. You just won’t fall over in it.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.18) }),
  },
  {
    id: 'gear:shoes:balance',
    slot: 'shoes',
    name: 'Balance-Plate Shoes',
    avatar: { shape: 'shoe', color: '#2b3550', accent: '#7fa0d0' },
    rarity: 'rare',
    price: 140,
    blurb: 'A rooted strike — your distances tighten up.',
    detail: ['Raises the MIN carry on driver / woods / irons — a solid base makes your distances repeat.'],
    lore: [
      'Weighted carbon plates in the sole drop your centre of gravity and lock the lower body through ' +
        'impact, so you deliver the same speed to the same spot swing after swing. The ball stops coming up ' +
        'those maddening ten yards short — it flies the number, because your body finally does the same thing twice.',
      'Distance you can trust beats distance you sometimes have.',
    ],
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.1 }),
  },

  // ── BALL — flight character. Beyond the backspin ladder (soft→zip→comet): a green DISTANCE ball, a blue
  // wind-cheater, and the HAZARD-SKIP balls — each keyed to its own hazard world (floater→ocean,
  // magma→inferno, void→the abyss), a thrilling, world-thematic reason to fly out there and buy it.
  {
    id: 'gear:ball:range',
    slot: 'ball',
    name: 'Hot Distance Balls',
    avatar: { shape: 'line', color: '#ff9a3a' },
    rarity: 'common',
    price: 90,
    blurb: 'Longer off the tee — +10y, straighter.',
    detail: ['+10 yds on your distance clubs, and a touch straighter (×0.97 dispersion).'],
    lore: [
      'A low-spin two-piece ball with a hot ionised core that comes off the driver like it’s been shoved. ' +
        'You give up a hair of greenside check for real, free yardage off the tee — and on a long par-5 in a ' +
        'headwind, yardage is exactly what you were praying for.',
      'A box of a dozen. You’ll lose a few chasing the extra distance. Worth it.',
    ],
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 10),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 10,
      dispersionMult: m.dispersionMult * 0.97,
    }),
  },
  {
    id: 'gear:ball:wind',
    slot: 'ball',
    name: 'Wind-Cheater Balls',
    avatar: { shape: 'line', color: '#a8c8e0' },
    rarity: 'rare',
    price: 140,
    blurb: 'Bores through the breeze — 45% less wind.',
    detail: ['45% less wind impact — a low, boring flight the gale can’t push around.'],
    lore: [
      'A dimple pattern computed on the gale-worlds themselves: the ball flies low and mean, refusing to ' +
        'balloon into the wind that eats an ordinary shot. On the storm links where the breeze is the whole ' +
        'defence, a sleeve of these turns a two-club gale into a one-club nuisance.',
      'The wind still reads true off your line — it just bites you half as hard.',
    ],
    apply: (m) => ({ ...m, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.45) }),
  },
  {
    id: 'gear:ball:floater',
    slot: 'ball',
    name: 'Floater Balls',
    avatar: { shape: 'line', color: '#5fe0d0' },
    rarity: 'epic',
    price: 230,
    blurb: 'Skips clean across water — no penalty.',
    detail: ['Water hazards & creeks cost you NO stroke — the ball skims across and settles on the nearest dry ground.'],
    lore: [
      'Buoyant, sealed, and lighter than they have any right to be, these balls hit a water hazard and simply ' +
        '*skip* — three, four, five bounces across the surface to dry land, like a stone flung by a child. The ' +
        'drowned atolls of the ocean worlds hold no fear for a golfer carrying a sleeve.',
      'Clear the water and it’s a free carry; come up short and you drop at the near bank — never a lost ball.',
    ],
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'water') }),
  },
  {
    id: 'gear:ball:magma',
    slot: 'ball',
    name: 'Magma-Skimmer Balls',
    avatar: { shape: 'ember', color: '#ff6a2a', accent: '#ffd070', glow: '#ff5a2a' },
    rarity: 'epic',
    price: 230,
    blurb: 'Skips across lava — no penalty.',
    detail: ['Lava hazards & molten rivers cost you NO stroke — the ball skims the surface to safe ground.'],
    lore: [
      'A ceramic-shelled ball fired in the same forges that temper the Phoenix clubs — it can kiss molten ' +
        'rock and skip off it glowing, unbothered, to settle on the far bank. On the fire-worlds where a lava ' +
        'river guards every green, it turns a forced lay-up into a heroic carry.',
      'Handle with the glove on. It comes back warm.',
    ],
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'lava') }),
  },
  {
    id: 'gear:ball:void',
    slot: 'ball',
    name: 'Void-Walker Balls',
    avatar: { shape: 'comet', color: '#b088ff', accent: '#e0d0ff', glow: '#8a5aff' },
    rarity: 'legendary',
    price: 340,
    blurb: 'Drifts across the abyss — the void spares it.',
    detail: ['The VOID no longer swallows your ball — an anti-grav core drifts it across the abyss to solid ground.'],
    lore: [
      'The core is a caged sliver of the same anti-gravity the Wardens’ ships run on: fly the ball out over ' +
        'the star-gap and it simply *refuses to fall*, drifting across the abyss on a whisper of nothing to ' +
        'land safe on the far platform. On the void worlds and the drifting wrecks, where one miss into the ' +
        'dark is gone forever, it is the difference between a birdie and a heartbreak.',
      'Only sold in the deep, to golfers who have already stared into the abyss and stayed on their feet.',
    ],
    apply: (m) => ({ ...m, hazardImmune: addImmune(m.hazardImmune, 'void', 'voidlost') }),
  },

  // ── SHAFT (the new distance/power slot) — the whole distance axis, so it doesn't crowd the ball slot.
  // A green min-carry, blue power + matched woods, purple blueprint irons + overdrive, legendary nova bomb.
  {
    id: 'gear:shaft:stiff',
    slot: 'shaft',
    name: 'Stiff Tour Shaft',
    avatar: { shape: 'clubskin', color: '#b0b6c2' },
    rarity: 'common',
    price: 80,
    blurb: 'Tighter distances — no more coming up short.',
    detail: ['Raises the MIN carry on driver / woods / irons — your bad strikes fly closer to your good ones.'],
    lore: [
      'A stiff, low-torque calibrated shaft that refuses to load up on a lazy swing — so your mishits stop ' +
        'falling out of the sky ten yards short. You lose a little of the whippy "sometimes I catch one" magic ' +
        'and gain a lot of "it goes where I expect", which is the trade every scoring golfer makes.',
      'The first upgrade a serious campaign buys.',
    ],
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.08 }),
  },
  {
    id: 'gear:shaft:power',
    slot: 'shaft',
    name: 'Graphite Power Shaft',
    avatar: { shape: 'clubskin', color: '#3a6ea5', accent: '#7fd0ff' },
    rarity: 'rare',
    price: 160,
    blurb: 'Real free yards — +12 and steadier.',
    detail: ['+12 yds carry on your distance clubs, and a steadier tempo (×0.95 dispersion).'],
    lore: [
      'A feather-light graphite shaft with a kick-point tuned to fling the head through impact — twelve honest ' +
        'yards on every distance club, for nothing but the price of it. The counter-weighted tip even smooths ' +
        'your tempo, so the extra length doesn’t cost you the fairway. A pure, satisfying upgrade.',
      'Everything downrange begins with the shaft that gets it there.',
    ],
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 12),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 12,
      dispersionMult: m.dispersionMult * 0.95,
    }),
  },
  {
    id: 'gear:shaft:woods',
    slot: 'shaft',
    name: 'Matched Fairway Woods',
    avatar: { shape: 'clubskin', color: '#8a5a2a', accent: '#caa15a' },
    rarity: 'rare',
    price: 140,
    blurb: 'Long woods that land where you aim.',
    detail: ['Raises the MIN carry of your WOODS only — long fairway woods stop coming up short, no trade-off.'],
    lore: [
      'A length-matched set of woods, each frequency-tuned to the last, so your 3-wood and 5-wood fly ' +
        'predictable, stackable distances instead of two random guesses. On a long par-5 the layup wood ' +
        'finally lands on the number you picked — and the reachable green stops being a gamble.',
      'Precision where the lean bag needed it most.',
    ],
    apply: (m) => ({ ...m, minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'wood', 0.13) }),
  },
  {
    id: 'gear:shaft:irons',
    slot: 'shaft',
    name: 'Blueprint Iron Set',
    avatar: { shape: 'clubskin', color: '#8a94a6', accent: '#d6e0ee' },
    rarity: 'epic',
    price: 210,
    blurb: 'Approaches that hold their number.',
    detail: ['Raises the MIN carry of your IRONS, and a touch tighter (×0.95) — approaches hold their yardage.'],
    lore: [
      'Precision-forged blueprint irons, milled to a thousandth on the Warden benches: every one flies its ' +
        'stamped number and stops there. No more flighting a 7-iron and watching it flutter down five short of ' +
        'the flag — you pick the club, you hit the club, the ball obeys the club. That is what "tour" means.',
      'The approach game is where scores are made. These make it.',
    ],
    apply: (m) => ({
      ...m,
      // "Irons" is one thing to the player — the flight split (GS-runout-club) is invisible to the
      // shop, so a set of irons lifts BOTH rows or it only half-works on half your bag.
      minCarryBoostByClass: addFamilyMinCarry(
        addFamilyMinCarry(m.minCarryBoostByClass, 'ironLong', 0.16),
        'ironShort',
        0.16,
      ),
      dispersionMult: m.dispersionMult * 0.95,
    }),
  },
  {
    id: 'gear:shaft:overdrive',
    slot: 'shaft',
    name: 'Speed-Whip Shaft',
    avatar: { shape: 'clubskin', color: '#c0402a', accent: '#ff8a5a' },
    rarity: 'epic',
    price: 200,
    blurb: 'Swing PAST 100% — +20% carry.',
    detail: ['Pull the power gesture past a full swing — up to +20% max carry (at the club’s full spray).'],
    lore: [
      'A whippy, over-flexing speed shaft the long-drive circuit smuggles between systems: wind the pull ' +
        'gesture past what a "full swing" should allow and the shaft stores the extra load, then dumps it all ' +
        'into the ball. You spray a little wider at the ragged edge of it — but the carry you unlock is worth ' +
        'the risk when there’s a par-5 you could reach.',
      'When in doubt, whip it out.',
    ],
    apply: (m) => ({ ...m, overpower: (m.overpower ?? 0) + 0.2 }),
  },
  {
    id: 'gear:shaft:nova',
    slot: 'shaft',
    name: 'Nova Long Shaft',
    avatar: { shape: 'clubskin', color: '#c8b0ff', accent: '#ffffff', glow: '#b070ff' },
    rarity: 'legendary',
    price: 400,
    blurb: 'A straight bomb — +24 and tighter.',
    detail: ['+24 yds on your distance clubs AND 10% tighter dispersion. The longest, straightest stick in the galaxy.'],
    lore: [
      'A shaft grown as a single crystal in zero-g, so light and so stiff it should not exist — it launches the ' +
        'ball on a rope, twenty-four yards past anything else you own, and it flies dead straight while it does ' +
        'it. The Wardens forge a handful a year, for champions who have earned the right to out-drive the field ' +
        'and hit the fairway anyway.',
      'The apex of distance. There is no wind it respects and no par-5 it fears.',
    ],
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 24),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 24,
      dispersionMult: m.dispersionMult * 0.9,
    }),
  },

  // ── BAG (the economy slot — was long empty) — a credit-earning ENGINE. A bigger, better-sponsored bag
  // banks more per world clear (GS-story-shop-depth wires `storyGearCreditMult` into the pay). One clean
  // ladder (an economy engine is meant to ramp): a green satchel → a legendary cosmic bag. Buy early, snowball.
  {
    id: 'gear:bag:sponsor',
    slot: 'bag',
    name: 'Sponsor’s Satchel',
    avatar: { shape: 'staffbag', color: '#5a7a4a', accent: '#d8c88a' },
    rarity: 'common',
    price: 90,
    blurb: 'A first sponsor — +15% credits earned.',
    detail: ['+15% credits from every world clear and major — an early economy engine.'],
    lore: [
      'A modest carry bag stitched with the badge of a single hopeful sponsor — a fuel-depot chain three ' +
        'systems back who’ll pay for their logo on a rising champion. It’s not much, but it’s the first crack ' +
        'in the credit ceiling, and every credit it earns is one you can put toward a real upgrade.',
      'The road to the finale arsenal is paved with sponsors. Start signing them.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.15 }),
  },
  {
    id: 'gear:bag:lucky',
    slot: 'bag',
    name: 'Fortune Cartel Bag',
    avatar: { shape: 'staffbag', color: '#b0202a', accent: '#e6c24a' },
    rarity: 'rare',
    price: 160,
    blurb: 'Ride the Cartel’s luck — +25% credits.',
    detail: ['+25% credits from every world clear and major.'],
    lore: [
      'The Fortune Cartel bankroll golfers they like the odds on, and their staff bag comes stuffed with lucky ' +
        'ball-markers, marked cards, and a contract you should probably read more carefully. Wear their colours ' +
        'and the purses swell — the galaxy’s luck bending, quietly, toward the golfer they’ve bet on.',
      'Fortune favours the well-funded.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.25 }),
  },
  {
    id: 'gear:bag:tour',
    slot: 'bag',
    name: 'Tour Pro’s Staff Bag',
    avatar: { shape: 'staffbag', color: '#f0f0f4', accent: '#1c2c50' },
    rarity: 'epic',
    price: 280,
    blurb: 'A full sponsor roster — +40% credits.',
    detail: ['+40% credits from every world clear and major — the roster of a real headline act.'],
    lore: [
      'A towering leather staff bag plastered stem to stern with the marks of a dozen syndicates — the kind a ' +
        'headline golfer carries when every system in the sector wants their logo on the winner. It weighs a ' +
        'ton and pays for itself twice a round. Your caddy will complain. Let them.',
      'When you’re the draw, everyone pays to stand near you.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.4 }),
  },
  {
    id: 'gear:bag:cosmic',
    slot: 'bag',
    name: 'Cosmic Sponsor’s Bag',
    avatar: { shape: 'staffbag', color: '#3a1c6a', accent: '#c088ff', glow: '#b070ff' },
    rarity: 'legendary',
    price: 440,
    blurb: 'The galaxy backs you — +60% credits.',
    detail: ['+60% credits from every world clear and major — the whole galaxy is your sponsor now.'],
    lore: [
      'When you’ve saved enough worlds, the sponsors stop being companies and start being *civilisations*: this ' +
        'bag carries the sigils of entire systems who owe you their skies, and every one of them pays to be seen ' +
        'beside the golfer who kept the World-Eater from their door. The purses it draws could fund a small fleet.',
      'The galaxy is grateful. The galaxy is also very good for it.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.6 }),
  },

  // ── HERALD cursed sheddings (GS-story-route-rewards) — big power, a real curse; only on the Coil path.
  // Forged by Sister Ecdysis from what a broken thing sheds. Stronger AND cheaper than Warden grace, but
  // each takes something back. A shedding must be a CHOICE, never a strict upgrade.
  {
    id: 'gear:glove:shed',
    slot: 'glove',
    name: 'Shed-Skin Grip',
    avatar: { shape: 'gauntlet', color: '#5a3a6a', accent: '#7fe0a0', glow: '#7fe0a0' },
    rarity: 'epic',
    price: 300,
    alignment: 'herald',
    blurb: 'Viciously tight — at a tithe.',
    detail: ['Dispersion ×0.78 — the tightest grip in the galaxy.'],
    curse: 'The Coil takes its tithe — credits earned −10%.',
    lore: [
      'A glove sloughed from something that outgrew its old skin, tanned by Sister Ecdysis in the Coil’s ' +
        'reliquary. It grips like nothing else — and the Coil’s mark on the cuff quietly skims a tithe off ' +
        'every purse you take. Power is never free on the dark path.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.78, creditMult: m.creditMult * 0.9 }),
  },
  {
    id: 'gear:ball:venom',
    slot: 'ball',
    name: 'Venom-Core Ball',
    avatar: { shape: 'spark', color: '#7fe0a0', accent: '#c0ff90', glow: '#7fe0a0' },
    rarity: 'epic',
    price: 340,
    alignment: 'herald',
    blurb: 'Savage bite — it fights you.',
    detail: ['Backspin +26% — it rips back off any green.'],
    curse: 'The venom fights the swing — dispersion +8%.',
    lore: [
      'A ball wound around a drop of the serpent’s venom. It hisses in flight and bites the green like a ' +
        'struck snake — but it never quite wants to go where you aimed. The Coil calls that honesty.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.26, dispersionMult: m.dispersionMult * 1.08 }),
  },
  {
    id: 'gear:shoes:coil',
    slot: 'shoes',
    name: 'Coilstride Boots',
    avatar: { shape: 'boot', color: '#4a3a5a', accent: '#7fe0a0', glow: '#7fe0a0' },
    rarity: 'epic',
    price: 300,
    alignment: 'herald',
    blurb: 'Rooted anywhere — but restless.',
    detail: ['Huge lie relief — stand and swing from anywhere.'],
    curse: 'The serpent never rests — putt make-window −6%.',
    lore: [
      'Boots scaled like a shed serpent’s belly; they grip acid, void, and bare rock alike, so no lie can ' +
        'stop you. But the restlessness in them creeps up the leg to the hands, and the greens never quite ' +
        'go still under you again.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.6), puttBoost: (m.puttBoost ?? 0) - 0.06 }),
  },

  // ── WARDEN grace (GS-story-route-rewards) — clean bonuses, dearer; only on the light path. No curse.
  {
    id: 'gear:glove:grace',
    slot: 'glove',
    name: 'Grace Gauntlet',
    avatar: { shape: 'glove', color: '#f0ead8', accent: '#caa15a' },
    rarity: 'epic',
    price: 460,
    alignment: 'warden',
    blurb: 'Tight and true — clean.',
    detail: ['Dispersion ×0.80 — a Warden’s steady hand, no strings.'],
    lore: [
      'Consecrated by the Fairway Wardens and given, never sold cheap — grace is dearer than a shedding ' +
        'because it asks nothing back. The hand it steadies stays your own.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.8 }),
  },
  {
    id: 'gear:ball:blessed',
    slot: 'ball',
    name: 'Star-Blessed Ball',
    avatar: { shape: 'comet', color: '#ffe9a8', accent: '#ffffff', glow: '#ffd873' },
    rarity: 'epic',
    price: 500,
    alignment: 'warden',
    blurb: 'Bites AND rolls true.',
    detail: ['Backspin +20% AND a steadier putt make-window (+5%).'],
    lore: [
      'A ball blessed under an open sky by the Wardens: it checks like a tour ball and holds its line on ' +
        'the greens, and it never once turns on the golfer who trusts it. Clean, true, and worth the cost.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.2, puttBoost: (m.puttBoost ?? 0) + 0.05 }),
  },
  {
    id: 'gear:shoes:hallowed',
    slot: 'shoes',
    name: 'Hallowed Spikes',
    avatar: { shape: 'spikes', color: '#f0ead8', accent: '#caa15a' },
    rarity: 'epic',
    price: 460,
    alignment: 'warden',
    blurb: 'Sure footing — clean.',
    detail: ['Strong lie relief — a Warden stands firm anywhere, no cost.'],
    lore: [
      'Spikes blessed to grip any ground the Wardens are called to defend — cold void, drowned atoll, dead ' +
        'deck. They ask nothing of the wearer but that they keep standing for the right side.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.5) }),
  },

  // ── REWARD RELICS (GS-story-reward-variety) — never sold, GRANTED by an ally quest. Each is a legendary
  // piece of EQUIPMENT that embodies the friend who gives it, so a caddy quest hands over kit, not just
  // another club — the gold-standard "the reward IS the character" (Suggestible Sam's Conviction) applied to
  // gear. Priced (the lore card shows a value) but kept out of every shop rack, so they only ever arrive as
  // a gift. `acquire:'reward'`.
  {
    id: 'gear:ball:phoenix',
    slot: 'ball',
    name: 'The Phoenix Core Ball',
    avatar: { shape: 'ember', color: '#ff8a3a', accent: '#ffd070', glow: '#ff5a2a' },
    rarity: 'legendary',
    price: 640,
    acquire: 'reward',
    blurb: "Dr Chipinski's ball — every chip finds a pulse.",
    detail: ['Backspin +18% — approaches land soft and hold, and a chip always finds a pulse by the pin.'],
    lore: [
      'A ball wound around a mote of the same phoenix-fire Dr Chipinski uses to restart a stopped heart. It ' +
        'lands, checks, and settles like a patient coming round — never dead, never past the flag. The Doctor ' +
        'milled a sleeve of them on the sidelines while a golfer’s pulse came back under his hands.',
      '“It won’t let a ball flatline any more than I will. Doctor’s orders.”',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.18, chipInBoost: (m.chipInBoost ?? 0) + 0.2 }),
  },
  {
    id: 'gear:hat:dowser',
    slot: 'hat',
    name: "The Dowser's Circlet",
    avatar: { shape: 'crown', color: '#4a3b2a', accent: '#caa15a', glow: '#e0b878' },
    rarity: 'legendary',
    price: 720,
    acquire: 'reward',
    blurb: "Mystic Mole's band — read the break through any ground.",
    detail: ['Putt make-window +22% AND a longer confident read — the break reads true, even blind.'],
    lore: [
      'A band of mire-iron the Mystic Mole dowsed from the deepest seam of the Hydra Mire, humming faintly ' +
        'against the temple. Wear it and the break comes up through the ground into your bones, the way it ' +
        'always did for the Mole — no eyes required. He never surfaced to hand you a club; he handed you his ' +
        'own way of seeing.',
      '“Trust the soil. Now you carry a little of the deep with you, champion.”',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.22, puttReadBonus: (m.puttReadBonus ?? 0) + 12 }),
  },
  {
    id: 'gear:hat:cowl',
    slot: 'hat',
    name: "The Whisperer's Cowl",
    avatar: { shape: 'bucket', color: '#3a3340', accent: '#7fe0a0', glow: '#7fe0a0' },
    rarity: 'legendary',
    price: 720,
    acquire: 'reward',
    alignment: 'herald',
    blurb: "Brother Ouros's cowl — the deep whispers the line.",
    detail: ['Putt make-window +22% AND a longer confident read — the line comes on a whisper, and never lies.'],
    lore: [
      'The grey cowl Brother Ouros has worn since before your grandfather ever teed off, threaded with a ' +
        'listening the Coil calls the Long Rest. Draw the hood up on a green and the deep hums the true break ' +
        'straight into your ear — read nothing, doubt nothing, hole out on faith. It has never once lied.',
      '“Let the world choose your line for you. That quiet is the whole of the Long Rest.”',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.22, puttReadBonus: (m.puttReadBonus ?? 0) + 12 }),
  },

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // GS-story-clothing — the APPAREL slots: a JACKET (upper body) + PANTS (legwear), worn clothing that BOTH
  // changes the on-course avatar (the jacket → the golfer's torso shirt shape/colour, the pants → their
  // legs) AND folds a real effect. Deeper pool, more reward variety, and a home for THEMED outfits: a
  // clean Warden set and a cursed Coil (herald) set that route-gate like the sheddings. Effects reuse the
  // proven no-op-default levers (wind for outerwear; stance/mobility for legwear; sponsor credits), so an
  // un-clothed campaign is byte-for-byte the plain loadout. Avatar looks reuse the existing ShirtShape /
  // PantsShape silhouettes `drawGolfer` already renders.

  // ── JACKET (upper body → wind / steadiness / economy) ──────────────────────────────────────────────
  {
    id: 'gear:jacket:windbreak',
    slot: 'jacket',
    name: 'Tour Windbreaker',
    avatar: { shape: 'jersey', color: '#2b3550', accent: '#7fd0ff' },
    rarity: 'common',
    price: 80,
    blurb: 'Cuts the breeze — a touch less wind.',
    detail: ['20% less wind impact — a light shell that takes the edge off a gust.'],
    lore: [
      'A packable tour shell in a hopeful sponsor’s colours, thin enough to swing in and just enough to ' +
        'stop a stiff breeze stealing the shot off the top of your backswing. Every travelling pro owns one; ' +
        'most own three.',
      'The first thing you reach for when the flags start to flutter.',
    ],
    apply: (m) => ({ ...m, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.2) }),
  },
  {
    id: 'gear:jacket:rain',
    slot: 'jacket',
    name: 'All-Weather Shell',
    avatar: { shape: 'spacesuit', color: '#1f5a3a', accent: '#bfead0' },
    rarity: 'rare',
    price: 170,
    blurb: 'Bores through the gale — much less wind.',
    detail: ['35% less wind impact — a sealed storm shell for the gale-worlds.'],
    lore: [
      'A fully-taped storm jacket rated for the wind-worlds, where the breeze is the whole defence. It seals ' +
        'at the cuffs and throat so nothing gets in and nothing slows your arms, and the ball stops ballooning ' +
        'into a headwind that used to eat two clubs.',
      'When the forecast is “survivable”, this is why.',
    ],
    apply: (m) => ({ ...m, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.35) }),
  },
  {
    id: 'gear:jacket:compression',
    slot: 'jacket',
    name: 'Compression Tour Jacket',
    avatar: { shape: 'polo', color: '#b23140', accent: '#f0c8cc' },
    rarity: 'rare',
    price: 160,
    blurb: 'A quieter swing — tighter shots.',
    detail: ['Dispersion ×0.95 — a compressive fit that steadies the turn.'],
    lore: [
      'A second-skin compression layer that gently braces the core and shoulders through the swing, so the ' +
        'big muscles fire in the right order and the club keeps arriving square. It won’t make you longer — it ' +
        'makes you repeat, which on a tight driving hole is worth more.',
      'Feels like a coach’s hand on your back, every swing.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.95 }),
  },
  {
    id: 'gear:jacket:sponsor',
    slot: 'jacket',
    name: 'Sponsored Tour Jacket',
    avatar: { shape: 'blazer', color: '#f0f0f4', accent: '#1c2c50' },
    rarity: 'rare',
    price: 180,
    blurb: 'Logos that pay — +20% credits.',
    detail: ['+20% credits from every world clear and major — a jacket that earns its keep.'],
    lore: [
      'A crisp tour jacket stitched with a modest roster of sponsor crests — a chain of fuel depots, a ' +
        'ball-marker company, a systems bank that likes your odds. Every logo pays for the airtime, and the ' +
        'airtime is you, walking up the last with a lead.',
      'Wear the badges. Cash the cheques.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.2 }),
  },
  {
    id: 'gear:jacket:thermal',
    slot: 'jacket',
    name: 'Thermal Storm Jacket',
    avatar: { shape: 'spacesuit', color: '#c0542a', accent: '#ffce9a' },
    rarity: 'epic',
    price: 260,
    blurb: 'Warm and unbothered — heavy wind cut.',
    detail: ['45% less wind impact — a heated shell that swings like a base layer.'],
    lore: [
      'A powered storm jacket with heating filament woven through the lining, cut so full-motion you forget ' +
        'you’re wearing armour against the weather. On the frozen links and the gale-scoured shelves it keeps ' +
        'the hands warm and the ball on its line when everyone else is fighting the sky.',
      'The pros who win the cold majors are never cold.',
    ],
    apply: (m) => ({ ...m, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.45) }),
  },
  {
    id: 'gear:jacket:warden',
    slot: 'jacket',
    name: "Warden's Mantle",
    avatar: { shape: 'blazer', color: '#eef2ff', accent: '#caa15a', glow: '#ffe9a8' },
    rarity: 'epic',
    price: 440,
    alignment: 'warden',
    blurb: 'Consecrated calm — clean and tight.',
    detail: ['Dispersion ×0.9 — a Warden’s steady shoulders, no strings.'],
    lore: [
      'A ceremonial mantle consecrated by the Fairway Wardens, worn over the shoulders of those who keep the ' +
        'Great Game honest. It settles a strange quiet over the wearer — the gallery, the wind, the whisper of ' +
        'the Coil all fall away, and there is only the shot. Grace asks nothing back.',
      'The calm it lends is your own, kept safe.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.9 }),
  },
  {
    id: 'gear:jacket:coil',
    slot: 'jacket',
    name: 'Coil Vestment',
    avatar: { shape: 'cosmic', color: '#4a1f6a', accent: '#7fe0a0', glow: '#7fe0a0' },
    rarity: 'epic',
    price: 300,
    alignment: 'herald',
    blurb: 'The serpent’s poise — tight, at a tithe.',
    detail: ['Dispersion ×0.85 — the stillest shoulders on the dark path.'],
    curse: 'The Coil takes its tithe — credits earned −8%.',
    lore: [
      'A hooded vestment sewn from shed serpent-silk in Sister Ecdysis’ reliquary, cold to the touch and ' +
        'starless-dark but for the acid sigils crawling its hem. It stills the swing to something inhuman — and ' +
        'the Coil’s mark on the collar skims a little off every purse. Power on the dark path is never free.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85, creditMult: m.creditMult * 0.92 }),
  },
  {
    id: 'gear:jacket:champion',
    slot: 'jacket',
    name: "Galaxy Champion's Jacket",
    avatar: { shape: 'blazer', color: '#caa15a', accent: '#fff3c8', glow: '#ffd873' },
    rarity: 'legendary',
    price: 520,
    blurb: 'The winner’s coat — pays AND steadies the gale.',
    detail: ['+40% credits from every clear/major AND 20% less wind — the jacket of a galaxy champion.'],
    lore: [
      'The gold jacket they drape over the shoulders of the golfer who saves a system — every civilisation you ' +
        'kept from the World-Eater’s mouth stitched its sigil into the weave, and every one of them pays to be ' +
        'seen on you. It’s heavy with gratitude and cut like a tour shell, so it earns AND holds you steady in ' +
        'the wind.',
      'You didn’t buy the jacket. You earned the right to wear it.',
    ],
    apply: (m) => ({ ...m, creditMult: m.creditMult * 1.4, windResist: Math.min(0.6, (m.windResist ?? 0) + 0.2) }),
  },

  // ── PANTS (legwear → stance / lie relief / distance base) ────────────────────────────────────────────
  {
    id: 'gear:pants:tour',
    slot: 'pants',
    name: 'Tour Trousers',
    avatar: { shape: 'trousers', color: '#3a4048', accent: '#20242a' },
    rarity: 'common',
    price: 70,
    blurb: 'A planted base — steadier distances.',
    detail: ['Raises the MIN carry on driver / woods / irons — a solid base makes your distances repeat.'],
    lore: [
      'Plain, tough tour trousers with a touch of stretch through the seat and knee, cut so the lower body can ' +
        'brace and turn without a fight. Nothing flashy — just a base you can push off, so the ball flies the ' +
        'number instead of ten yards short.',
      'The unglamorous upgrade every scoring golfer makes.',
    ],
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.06 }),
  },
  {
    id: 'gear:pants:flex',
    slot: 'pants',
    name: 'Flex-Stance Trousers',
    avatar: { shape: 'trousers', color: '#2b3550', accent: '#6a86b0' },
    rarity: 'rare',
    price: 150,
    blurb: 'Stand and deliver — better from bad lies.',
    detail: ['Lie relief — awkward stances (rough / sand / slopes) cost you less.'],
    lore: [
      'Four-way-stretch trousers with reinforced knees that let you get low, wide, and weird — the stance a ' +
        'buried lie or a steep bank demands without the fabric fighting you. You can plant on a downslope in the ' +
        'sand and still make a swing you trust.',
      'The rough stops being a sentence and starts being a puzzle.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.3) }),
  },
  {
    id: 'gear:pants:knickers',
    slot: 'pants',
    name: 'Classic Plus-Fours',
    avatar: { shape: 'knickers', color: '#c9a86a', accent: '#8a5a2a' },
    rarity: 'rare',
    price: 150,
    blurb: 'Old-school poise — straighter misses.',
    detail: ['Trims both the SLICE and the HOOK — a classic, balanced setup that straightens the two-way miss.'],
    lore: [
      'Argyle plus-fours and long socks, the uniform of the game’s golden age — and worn, oddly, they work: the ' +
        'slightly-bound knee forces the old, quiet, balanced footwork the modern lunge forgot, and the ball stops ' +
        'leaking both ways off the tee. The gallery smiles. Then they see your fairways hit.',
      'Style that happens to be substance.',
    ],
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.04, hookL: -0.04 }) }),
  },
  {
    id: 'gear:pants:power',
    slot: 'pants',
    name: 'Power-Drive Trousers',
    avatar: { shape: 'trousers', color: '#7a2a2a', accent: '#e0a060' },
    rarity: 'epic',
    price: 230,
    blurb: 'Drive off the ground — real base distance.',
    detail: ['Strongly raises the MIN carry on your distance clubs — a powerful, repeatable base.'],
    lore: [
      'Weighted, articulated trousers that drop your centre of gravity and lock the drive through the ground, ' +
        'so every long club delivers the same speed from the same braced base. The mishits climb toward the good ' +
        'ones, and the good ones hold — distance you can finally count on.',
      'Speed starts at the feet. This is where you find it.',
    ],
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.12 }),
  },
  {
    id: 'gear:pants:warden',
    slot: 'pants',
    name: "Warden's Greaves",
    avatar: { shape: 'greaves', color: '#eef2ff', accent: '#caa15a', glow: '#ffe9a8' },
    rarity: 'epic',
    price: 440,
    alignment: 'warden',
    blurb: 'Stand firm anywhere — clean.',
    detail: ['Strong lie relief — a Warden holds their stance on any ground, no cost.'],
    lore: [
      'Blessed leg-guards the Fairway Wardens wear onto ground no one should have to stand on — cold void, ' +
        'drowned atoll, dead deck — and stay upright, and stay honest. They root the stance to whatever you’re ' +
        'called to defend, and they ask nothing but that you keep standing for the right side.',
      'A clean footing on terrible ground is grace made wearable.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.5) }),
  },
  {
    id: 'gear:pants:coil',
    slot: 'pants',
    name: 'Coilscale Leggings',
    avatar: { shape: 'riftgreaves', color: '#4a1f6a', accent: '#7fe0a0', glow: '#7fe0a0' },
    rarity: 'epic',
    price: 300,
    alignment: 'herald',
    blurb: 'Rooted anywhere — but restless.',
    detail: ['Huge lie relief — plant and swing from any lie in the galaxy.'],
    curse: 'The serpent never rests — putt make-window −5%.',
    lore: [
      'Leggings scaled like a shed serpent’s belly, gripping acid, void and bare rock alike so no lie can stop ' +
        'you. But the restlessness in the scales creeps up from the ground into the hands, and the greens never ' +
        'quite go still under you again. The Coil calls that the price of never falling.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.6), puttBoost: (m.puttBoost ?? 0) - 0.05 }),
  },
  {
    id: 'gear:pants:cosmic',
    slot: 'pants',
    name: 'Starfield Trousers',
    avatar: { shape: 'nebula', color: '#3a1c6a', accent: '#c088ff', glow: '#b070ff' },
    rarity: 'legendary',
    price: 500,
    blurb: 'A cosmic base — long AND tight.',
    detail: ['Raises the MIN carry on your distance clubs AND 5% tighter dispersion — a champion’s base.'],
    lore: [
      'Trousers woven with a thread of real nebula, so light they seem to fall upward, so strong they never ' +
        'crease — the drive loads into a base that feels like standing on the floor of the galaxy itself. Long, ' +
        'repeatable, and quietly straighter, they’re the legwear of a golfer with nothing left to prove and a ' +
        'universe left to save.',
      'The stars themselves, holding you steady over the ball.',
    ],
    apply: (m) => ({ ...m, minCarryBoost: m.minCarryBoost + 0.12, dispersionMult: m.dispersionMult * 0.95 }),
  },

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // GS-story-wedge-slot — the SHORT-GAME slot (the `shaft` distance slot's counterpart). Store-bought
  // WEDGES whose value is a real STAT, never carry: a tighter wedge carry window (`wedgeWindow` — lands
  // where you aim), more approach check (`backspinBoost` — bites and holds), and at the apex a chip-in edge
  // (`chipInBoost`). This is the putter-precedent applied to wedges — everyone carries a wedge, so a themed
  // one is only an upgrade through the make-window-style stat, not a same-carry copy that would overshoot.
  // Effect-only (no `avatar`), a clean green→legendary ladder, stocked from the home parkland to the
  // serpent's reaches. Story-only, no-op default, so Voyage/Unending are byte-for-byte unchanged.
  {
    id: 'gear:wedge:groove',
    slot: 'wedge',
    name: 'Grooved Pitching Wedge',
    rarity: 'common',
    price: 80,
    blurb: 'Sharper grooves — approaches land softer.',
    detail: ['Tightens the wedge carry window a touch — short irons land closer to your number.'],
    lore: [
      'A plain forged wedge with freshly-cut grooves, the first thing a travelling pro re-sharpens at every ' +
        'Pro Shop. It won’t spin the ball back off a cliff, but it takes the flyer out of your pitches so the ' +
        'ball comes down where you looked instead of ten feet long.',
      'The short game is where a lean bag saves its strokes. Start here.',
    ],
    apply: (m) => ({ ...m, wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.14) }),
  },
  {
    id: 'gear:wedge:milled',
    slot: 'wedge',
    name: 'Milled Tour Wedge',
    rarity: 'rare',
    price: 160,
    blurb: 'Pin-point pitches — tighter AND biting.',
    detail: ['Tightens the wedge carry window, and rips a touch more backspin (+6%) so approaches check up.'],
    lore: [
      'CNC-milled from a single billet on the Warden benches, every groove to a thousandth — so the face grabs ' +
        'the cover the same way every time and the ball flies its number, then sits. On a firm green in a ' +
        'crosswind that repeatability is worth more than any extra yard.',
      'You picked the distance. The wedge is done arguing about it.',
    ],
    apply: (m) => ({
      ...m,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.24),
      backspinBoost: (m.backspinBoost ?? 0) + 0.06,
    }),
  },
  {
    id: 'gear:wedge:spin',
    slot: 'wedge',
    name: 'High-Spin Lob Wedge',
    rarity: 'epic',
    price: 240,
    blurb: 'Vicious check — flag-hunting short irons.',
    detail: ['Strongly tightens the wedge window AND +10% backspin — approaches bite hard and stop by the pin.'],
    lore: [
      'A high-toe lob wedge with a face laser-etched into a micro-grid, so raw the rules officials on the tour ' +
        'worlds squint at it. It flights a pitch flat and hot, then the moment it lands it snaps to a stop, ' +
        'sometimes hunting back toward the cup. A back pin has never been so gettable — a front pin, so dangerous.',
      'Respect the spin. It stops on a coin, and sometimes rolls the coin back to you.',
    ],
    apply: (m) => ({
      ...m,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.3),
      backspinBoost: (m.backspinBoost ?? 0) + 0.1,
    }),
  },
  {
    id: 'gear:wedge:master',
    slot: 'wedge',
    name: 'Master’s Wedge',
    rarity: 'legendary',
    price: 460,
    blurb: 'The surest short game in the galaxy.',
    detail: [
      'The tightest wedge window made, +14% backspin, AND a real chip-in edge — a short iron that lands like a ' +
        'putt and sometimes drops like one.',
    ],
    lore: [
      'The last wedge Custodian Pim ever ground, its sole hand-relieved for every lie in the near stars and its ' +
        'face milled so true it seems to know where the flag is. Champions who carry one stop thinking of the ' +
        'short game as damage control and start thinking of it as offence — every pitch a birdie chance, every ' +
        'chip a threat to go in.',
      'One perfect wedge beats a bag full of good intentions.',
    ],
    apply: (m) => ({
      ...m,
      wedgeWindow: Math.min(0.85, m.wedgeWindow + 0.4),
      backspinBoost: (m.backspinBoost ?? 0) + 0.14,
      chipInBoost: (m.chipInBoost ?? 0) + 0.12,
    }),
  },

  // ════════════════════════════════════════════════════════════════════════════════════════════════
  // GS-story-driver-gear — MORE shot-shape + distance control for the big sticks (driver & woods). The pool
  // was thin on the two-way miss: only a common slice-fixer glove and the plus-fours (both). This adds the
  // missing HOOK fixer, a strong single-side draw/fade glove pair, a purple two-way-miss trouser, and the
  // driver/wood DISTANCE + MIN-CARRY gear the deep bags wanted (a driver-family min-carry, a matched long
  // set, an epic bomber shaft). Shape mods are grip/stance levers (glove/pants); the distance/min-carry gear
  // lives in the `shaft` slot. All strictly-helpful (no curse), no-op default, Story-only.

  // ── GLOVE — the two-way miss. The missing hook fixer + a strong draw/fade pair (single-side control).
  {
    id: 'gear:glove:antihook',
    slot: 'glove',
    name: 'Anti-Hook Grip',
    avatar: { shape: 'glove', color: '#6a4a8a', accent: '#e0d0ff' },
    rarity: 'common',
    price: 90,
    blurb: 'Kills the snap-hook — no more dive left.',
    detail: ['Trims the HOOK miss (left) — that big diving pull off the driver straightens up.'],
    lore: [
      'A glove padded along the fingers so the trail hand can’t flip the face shut at the bottom — the one fault ' +
        'behind the ugly snap-hook that dives into the trees left. Wear it and the driver stops turning over on ' +
        'you; the miss becomes a shot you can play from.',
      'It only fixes the hook. The rest of the swing is still your problem.',
    ],
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.08 }) }),
  },
  {
    id: 'gear:glove:draw',
    slot: 'glove',
    name: 'Draw-Bias Glove',
    avatar: { shape: 'glove', color: '#2f6a4a', accent: '#c8f0d8' },
    rarity: 'rare',
    price: 150,
    blurb: 'Straightens the weak fade — hard.',
    detail: ['Strongly trims the SLICE miss (right) — the block-right off the driver is all but gone.'],
    lore: [
      'A weighted-heel tour glove that trains the lead wrist to bow through impact, squaring — even closing — the ' +
        'face where a slicer leaves it open. The ball stops leaking right off the tee and starts holding the left ' +
        'edge of the fairway, the way the long hitters do it.',
      'A driver that never goes right is a driver you can finally aim.',
    ],
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.14 }) }),
  },
  {
    id: 'gear:glove:fade',
    slot: 'glove',
    name: 'Fade-Bias Glove',
    avatar: { shape: 'glove', color: '#8a5a2a', accent: '#f0dcb8' },
    rarity: 'rare',
    price: 150,
    blurb: 'Straightens the diving hook — hard.',
    detail: ['Strongly trims the HOOK miss (left) — the driver stops turning over into trouble.'],
    lore: [
      'The mirror of the draw glove: a firmer trail-hand panel that holds the face from flipping shut, so the ball ' +
        'rides a soft fade instead of diving left. The players who’ve fought a hook their whole lives swear a ' +
        'round in one feels like someone finally took the trapdoor out of the tee box.',
      'A driver that never goes left is a driver you can finally trust.',
    ],
    apply: (m) => ({ ...m, shapeMod: combineShapeMods(m.shapeMod, { hookL: -0.14 }) }),
  },

  // ── PANTS — the two-way miss, purple tier (above the rare plus-fours): trims BOTH sides and tightens.
  {
    id: 'gear:pants:calibrated',
    slot: 'pants',
    name: 'Calibrated Tour Trousers',
    avatar: { shape: 'trousers', color: '#20304a', accent: '#8fb0e0' },
    rarity: 'epic',
    price: 230,
    blurb: 'Both misses gone — a stripe show.',
    detail: ['Trims BOTH the slice AND the hook, and tightens dispersion (×0.96) — a genuine two-way-miss cure.'],
    lore: [
      'Sensor-threaded trousers that read the sway and slide of the lower body and cinch, micro-second by ' +
        'micro-second, to keep the hips turning on plane — so neither the flip that hooks it nor the stall that ' +
        'slices it ever gets started. The driver comes out of a base that simply refuses to make the big miss.',
      'Kill both sides of the fairway and the hole gets a lot wider.',
    ],
    apply: (m) => ({
      ...m,
      shapeMod: combineShapeMods(m.shapeMod, { sliceR: -0.07, hookL: -0.07 }),
      dispersionMult: m.dispersionMult * 0.96,
    }),
  },

  // ── SHAFT — driver/wood DISTANCE + MIN-CARRY. A driver-family min-carry (mirrors the woods shaft), a
  // matched long set (driver + woods min-carry together), and an epic bomber between the power & nova shafts.
  {
    id: 'gear:shaft:driver',
    slot: 'shaft',
    name: 'Calibrated Driver Shaft',
    avatar: { shape: 'clubskin', color: '#c0402a', accent: '#ffb08a' },
    rarity: 'rare',
    price: 150,
    blurb: 'A driver that never comes up short.',
    detail: ['Raises the MIN carry of your DRIVER only — your mishit tee shots fly close to your best, no trade-off.'],
    lore: [
      'A low-torque driver shaft tuned to refuse a lazy load, so the drive you catch a groove thin still climbs ' +
        'and carries instead of falling out of the sky forty short. You give up the freak "I flushed one" outlier ' +
        'and gain a driver whose bad ones are barely bad — which is the trade every scoring golfer makes off the tee.',
      'The best drive is the one you can count on.',
    ],
    apply: (m) => ({ ...m, minCarryBoostByClass: addFamilyMinCarry(m.minCarryBoostByClass, 'driver', 0.14) }),
  },
  {
    id: 'gear:shaft:matched',
    slot: 'shaft',
    name: 'Matched Long Set',
    avatar: { shape: 'clubskin', color: '#3a6ea5', accent: '#bfe0ff' },
    rarity: 'epic',
    price: 220,
    blurb: 'Driver AND woods — every long club repeats.',
    detail: ['Raises the MIN carry of your DRIVER and your WOODS — the whole long-club stack lands on its number.'],
    lore: [
      'A frequency-matched set from the driver through the fairway woods, each stick tuned to the last, so your ' +
        'big clubs fly stackable, trustworthy distances instead of a spread of hopeful guesses. On a long par-5 ' +
        'you finally know the layup wood carries the water and the driver clears the corner — because they always do.',
      'When every long club repeats, the whole back of the bag becomes a scoring tool.',
    ],
    apply: (m) => ({
      ...m,
      minCarryBoostByClass: addFamilyMinCarry(addFamilyMinCarry(m.minCarryBoostByClass, 'driver', 0.12), 'wood', 0.14),
    }),
  },
  {
    id: 'gear:shaft:bomber',
    slot: 'shaft',
    name: 'Bomber Tour Shaft',
    avatar: { shape: 'clubskin', color: '#c8902a', accent: '#ffe0a0' },
    rarity: 'epic',
    price: 250,
    blurb: 'Big free yards — +18 and steadier.',
    detail: ['+18 yds carry on your distance clubs, and a steadier tempo (×0.95 dispersion). A real bomb.'],
    lore: [
      'A stouter, hotter sibling of the graphite power shaft, kick-point shoved low to sling the head through the ' +
        'ball — eighteen honest yards on every wood and long stick, and a counter-weight that keeps the extra speed ' +
        'from costing you the fairway. On the low-grav bomber worlds it turns a reachable par-5 into a two-shot birdie.',
      'Eighteen yards is a whole club. Sometimes it’s the whole hole.',
    ],
    apply: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 18),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 18,
      dispersionMult: m.dispersionMult * 0.95,
    }),
  },
];

/** Per-world gear stock (content-as-data) — a curated 1–2 items per world, tiered by chapter, so travel
 *  fills out the locker. Filtered to hide what you own (see `storyGearStock`). */
export const STORY_GEAR_STOCK: Record<string, readonly string[]> = {
  // GS-story-shop-depth: a DEEP, THEMED, tiered distribution. Green/blue staples to buy from stop one, purple
  // upgrades mid-campaign, fun legendaries deep in. Each world's rack leans into its OWN identity (the hazard
  // balls at their hazard, the wind balls on the gale-worlds, the sand stance in the dunes) so travel is
  // collection — you fly out to a world FOR the thing it sells. Route relics (alignment-tagged) still show
  // only on your path (`storyGearStock`); already-owned items drop out.

  // ── Chapter 1 — GREENS & BLUES, the staples (home parkland + the dunes). Start the economy engine + the
  // distance/reading basics here so an early credit has an exciting, lasting home.
  // GS-story-clothing: the CLOTHING staples start here too — a windbreaker + tour trousers on the home parkland.
  // GS-story-wedge-slot / GS-story-driver-gear — the short-game wedge + the two-way-miss & driver/wood
  // distance gear seed into the early racks too, so the green/blue tiers are buyable from stop one.
  'verdant-18': ['gear:glove:worn', 'gear:glove:antihook', 'gear:shaft:stiff', 'gear:ball:range', 'gear:bag:sponsor', 'gear:jacket:windbreak', 'gear:pants:tour'],
  'verdant2-18': ['gear:hat:reader', 'gear:hat:visor', 'gear:glove:antislice', 'gear:glove:draw', 'gear:wedge:groove', 'gear:shoes:turf', 'gear:jacket:compression'],
  'desert-18': ['gear:shoes:spikes', 'gear:shoes:balance', 'gear:hat:range', 'gear:shaft:power', 'gear:shaft:driver', 'gear:glove:fade', 'gear:pants:flex'],
  // GS-story-world-variety — the extra Ch.1 qualifier (Gemini Ice): reading + footing for slick, exposed ice.
  'frost2-18': ['gear:hat:reader', 'gear:shoes:balance', 'gear:glove:sweet', 'gear:wedge:milled', 'gear:jacket:rain'],

  // ── Chapter 2 — BLUES + the first PURPLES (the fire-worlds + the frozen links). Themed: MAGMA balls at
  // the lava, the whippy power shaft where you need to bomb it, the WIND ball on the exposed frost links.
  'inferno-18': ['gear:ball:magma', 'gear:glove:tacky', 'gear:shaft:woods', 'gear:shaft:matched', 'gear:pants:knickers'],
  'inferno2-18': ['gear:shaft:overdrive', 'gear:shaft:bomber', 'gear:ball:soft', 'gear:bag:lucky', 'gear:jacket:sponsor'],
  'frost-18': ['gear:ball:wind', 'gear:hat:spin', 'gear:glove:sweet'],
  // GS-story-world-variety — the extra Ch.2 qualifier (Pyxis Foundry): low-grav bomber's kit + an economy bag.
  'metal2-18': ['gear:shaft:power', 'gear:glove:tacky', 'gear:bag:lucky', 'gear:jacket:thermal'],

  // ── Chapter 3 — the PURPLE line fills in (the gale, the crystal precision greens, the spore-jungle rough).
  'tempest-18': ['gear:ball:wind', 'gear:glove:vice', 'gear:shaft:irons', 'gear:pants:power', 'gear:pants:calibrated'],
  'crystal-18': ['gear:hat:computer', 'gear:glove:vice', 'gear:wedge:spin', 'gear:bag:tour'],
  'fungal-18': ['gear:shoes:gravlock', 'gear:hat:focus', 'gear:ball:zip'],
  // GS-story-world-variety — the extra Ch.3 qualifier (Delphinus Tides): the FLOATER ball early, sea-storm kit.
  'ocean2-18': ['gear:ball:floater', 'gear:ball:wind', 'gear:shoes:gravlock'],

  // ── Chapter 4 — PURPLES everywhere, the ROUTE RELICS (alignment-gated), and the first LEGENDARIES. Themed:
  // FLOATER balls on the drowned atolls, VOID-WALKER balls + the Nova bomb at the abyss, the Power Glove +
  // the Oracle where precision is everything.
  // GS-story-clothing: the THEMED OUTFIT relics gate here — a Coil vestment vs a Warden mantle (jackets) on
  // the drowned atolls, a Coil vs Warden legwear on the crystal greens. Alignment-filtered like the sheddings.
  'ocean-18': ['gear:ball:floater', 'gear:shoes:gravlock', 'gear:glove:shed', 'gear:glove:grace', 'gear:jacket:coil', 'gear:jacket:warden'],
  'void2-18': ['gear:ball:void', 'gear:shaft:nova', 'gear:glove:master'],
  'crystal2-18': ['gear:hat:oracle', 'gear:glove:power', 'gear:ball:venom', 'gear:ball:blessed', 'gear:pants:coil', 'gear:pants:warden'],
  // GS-story-world-variety — the extra Ch.4 qualifier (Leo Savannah): sand stance + power for the long, windy dust.
  'desert2-18': ['gear:shoes:spikes', 'gear:shaft:power', 'gear:hat:oracle'],

  // ── Chapter 5 — the LEGENDARY apex + the last route relics, in the serpent's reaches. The Comet ball, the
  // Void-Anchor boots, the Seer's Circlet, the Cosmic bag — the grail rack of the campaign.
  'swamp-18': ['gear:ball:comet', 'gear:shoes:anchor', 'gear:shoes:coil', 'gear:shoes:hallowed', 'gear:jacket:champion'],
  'derelict-18': ['gear:hat:seer', 'gear:ball:void', 'gear:wedge:master', 'gear:bag:cosmic', 'gear:pants:cosmic'],
  'cetus-18': ['gear:ball:comet', 'gear:shaft:nova', 'gear:glove:power'],
  // GS-story-world-variety — the extra Ch.5 qualifier (Antlia Scrapworks): the grail low-grav bomber's rack.
  'metal-18': ['gear:shaft:nova', 'gear:bag:cosmic', 'gear:glove:power'],
};

/** Look up a gear item by id. */
export function storyGearById(id: string): StoryGearItem | undefined {
  return STORY_GEAR.find((g) => g.id === id);
}

/** Does the player own this gear? */
export function storyGearOwned(story: StoryState, id: string): boolean {
  return story.ownedGearIds.includes(id);
}

/** Is this gear currently equipped in its slot? */
export function storyGearEquipped(story: StoryState, item: StoryGearItem): boolean {
  return story.equippedGear[item.slot] === item.id;
}

/** A world's gear rack: the curated stock minus anything already owned, and minus route-gated relics that
 *  don't match the chosen path (GS-story-route-rewards — a Herald never sees Warden grace, and vice versa;
 *  before The Choice, no route relic shows). */
export function storyGearStock(story: StoryState, worldId: string): StoryGearItem[] {
  const ids = STORY_GEAR_STOCK[worldId] ?? [];
  return ids
    .map((id) => storyGearById(id))
    .filter((it): it is StoryGearItem => !!it && !story.ownedGearIds.includes(it.id))
    .filter((it) => !it.alignment || it.alignment === story.alignment);
}

/** Can the player buy this gear right now — not owned and affordable? */
export function canBuyStoryGear(story: StoryState, item: StoryGearItem): boolean {
  return !storyGearOwned(story, item.id) && story.credits >= item.price;
}

/**
 * Buy a gear item (pure): deduct credits, add to owned, and EQUIP it in its slot (replacing whatever was
 * there — one item per slot). No-op if unaffordable/owned. Immutable.
 */
export function buyStoryGear(story: StoryState, item: StoryGearItem): StoryState {
  if (!canBuyStoryGear(story, item)) return story;
  let next = addCredits(story, -item.price);
  if (!next.ownedGearIds.includes(item.id)) next = { ...next, ownedGearIds: [...next.ownedGearIds, item.id] };
  return { ...next, equippedGear: { ...next.equippedGear, [item.slot]: item.id } };
}

/** GS-story-reward-variety: GRANT a gear item (pure) — own it AND equip it in its slot, no cost. For a
 *  `reward` relic handed over by an ally quest. Idempotent on ownership (a replay can't re-grant), and it
 *  equips into the slot so the gift is felt on the very next round. */
export function grantStoryGear(story: StoryState, id: string): StoryState {
  const item = storyGearById(id);
  if (!item) return story;
  const ownedGearIds = story.ownedGearIds.includes(id) ? story.ownedGearIds : [...story.ownedGearIds, id];
  return { ...story, ownedGearIds, equippedGear: { ...story.equippedGear, [item.slot]: id } };
}

/** Equip an OWNED gear item in its slot (pure, GS-story-locker) — for switching among owned gear in the
 *  locker. No-op if the id isn't owned/known. Replaces whatever occupied the slot. */
export function equipStoryGear(story: StoryState, id: string): StoryState {
  const item = storyGearById(id);
  if (!item || !story.ownedGearIds.includes(id)) return story;
  return { ...story, equippedGear: { ...story.equippedGear, [item.slot]: id } };
}

/** Empty a gear SLOT (pure, GS-story-locker) — remove whatever is equipped there (it stays owned). */
export function unequipStoryGear(story: StoryState, slot: GearSlot): StoryState {
  if (story.equippedGear[slot] === undefined) return story;
  const next = { ...story.equippedGear };
  delete next[slot];
  return { ...story, equippedGear: next };
}

/** All OWNED gear for a slot (for the locker's per-slot picker). */
export function ownedGearForSlot(story: StoryState, slot: GearSlot): StoryGearItem[] {
  return story.ownedGearIds
    .map((id) => storyGearById(id))
    .filter((g): g is StoryGearItem => !!g && g.slot === slot);
}

/**
 * Fold every equipped gear item's effect onto a round loadout (pure). Story rounds ONLY — called at
 * tee-off after the bag is set. Unknown/absent gear is skipped, so an un-geared campaign is a no-op
 * (byte-for-byte the plain loadout). Voyage/Unending never call this.
 */
export function applyStoryGear(loadout: PlayerLoadout, story: StoryState): PlayerLoadout {
  let out = loadout;
  for (const slot of Object.keys(story.equippedGear) as GearSlot[]) {
    const id = story.equippedGear[slot];
    const item = id ? storyGearById(id) : undefined;
    if (item) out = item.apply(out);
  }
  return out;
}

/**
 * GS-story-shop-depth: the equipped ECONOMY (bag-slot) gear's credit multiplier — the factor to multiply a
 * Story round's credit payout by (the `shipCreditMult`/`upgradeCreditMult` sibling). Folds every equipped
 * gear item onto a unit loadout and reads back its `creditMult`, so a golfer with no economy bag returns
 * exactly 1 (byte-for-byte the old pay) and only an equipped credit bag lifts it. Pure.
 */
export function storyGearCreditMult(story: StoryState): number {
  const unit = {
    bag: [],
    handicap: 0,
    dispersionMult: 1,
    creditMult: 1,
    perks: [],
    shapeMod: {},
    minCarryBoost: 0,
    wedgeWindow: 0,
    distanceClubBonus: 0,
    puttBoost: 0,
    birdieCredit: 0,
    eagleCredit: 0,
    comebackCredit: 0,
  } as PlayerLoadout;
  return applyStoryGear(unit, story).creditMult;
}

/**
 * GS-story-avatar: the WORN cosmetic looks the equipped Story gear gives the on-course golfer, keyed by
 * the golfer-render slot. In Story Tour the campaign gear is the ONLY cosmetic source — the clubhouse
 * wardrobe is ignored — so the golfer wears their DEFAULT outfit plus whatever gear they've gathered and
 * equipped. Each field is an `ApparelLook` the shared `drawGolfer` painters already render.
 */
export interface StoryAvatarLooks {
  hat?: ApparelLook;
  bag?: ApparelLook;
  glove?: ApparelLook;
  shoes?: ApparelLook;
  /** The cosmetic club skin — the equipped SHAFT recolours the club the golfer swings. */
  clubSkin?: ApparelLook;
  /** The cosmetic ball tracer — the equipped BALL's in-flight trail colour + style. */
  ballTracer?: ApparelLook;
  /** The cosmetic JACKET — the equipped upper-body garment recolours/reshapes the golfer's torso. */
  shirtStyle?: ApparelLook;
  /** The cosmetic PANTS — the equipped legwear recolours/reshapes the golfer's legs. */
  pantsStyle?: ApparelLook;
}

/** Map each equipped-gear SLOT to the golfer-render slot its `avatar` look drives. Only slots that have a
 *  visible avatar representation appear. */
const GEAR_AVATAR_SLOT: Partial<Record<GearSlot, keyof StoryAvatarLooks>> = {
  hat: 'hat',
  bag: 'bag',
  glove: 'glove',
  shoes: 'shoes',
  shaft: 'clubSkin',
  ball: 'ballTracer',
  jacket: 'shirtStyle',
  pants: 'pantsStyle',
};

/**
 * Resolve the equipped Story gear into the golfer's worn cosmetic looks (pure). Skips gear with no
 * `avatar` look and slots with no avatar mapping, so an un-geared campaign returns `{}` (the plain default
 * outfit). Voyage/Unending never call this; it's read only on a Story round (`run.storyRound`).
 */
export function storyGearAvatar(story: StoryState): StoryAvatarLooks {
  const out: StoryAvatarLooks = {};
  for (const slot of Object.keys(story.equippedGear) as GearSlot[]) {
    const target = GEAR_AVATAR_SLOT[slot];
    if (!target) continue;
    const id = story.equippedGear[slot];
    const item = id ? storyGearById(id) : undefined;
    if (item?.avatar) out[target] = item.avatar;
  }
  return out;
}

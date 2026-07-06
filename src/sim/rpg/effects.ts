/**
 * Course effects — how the JOURNEY CHOICE materially changes the world you fly into (GS-journey-fx).
 *
 * A route used to differ only by economy/cut levers, which do NOTHING on a matchplay-boss stop (its
 * survival is positional, not a Stableford cut) — so a lane felt inconsequential. Two pure levers fix
 * that, BOTH derived from the chosen route's event so there's no new save state:
 *
 *   1. DIFFICULTY (`routeDifficulty`) — a wildness DELTA threaded into course generation. A harder lane
 *      (higher cut) ALSO generates a wilder course (tighter corridors, more hazards, sooner-armed
 *      signature mechanics); a calm lane plays gentler. This is the part that bites on a boss course
 *      (where the cut lever is inert). The delta is CLAMPED so the generated wildness stays in [0.05, 1]
 *      — i.e. never harder than the wildness=1 case the no-death-spiral / fairness validators already
 *      prove safe, so this can't destabilise generation.
 *
 *   2. FLAVOUR (`routeEffect`) — a `CourseEffect` stamped on the course meta: meteor shower, moonlight,
 *      an aurora, a solar storm, a crashed-junk debris field, a trade-market camp. Mostly pure
 *      atmosphere (weather / lighting / decor) drawn by the renderers — touching NEITHER physics NOR
 *      generation rng, so fairness is untouched. It makes each lane LOOK like a distinct destination.
 *      EXCEPTION (GS-tents): `tradeMarket` ALSO pitches a ring of COLLIDABLE tents around the green
 *      (sim/tents.ts) that a low/flat shot ricochets off — a real, fair (non-penalty) gameplay twist,
 *      derived from the hole geometry with NO generation rng, gated to this effect at the play
 *      boundary (`playerHoleOpts` / the interactive driver), proven fair by `tests/tents.test.ts`.
 *
 * Both are derived from the event (content-as-data), so attaching them changes no rng stream and needs
 * no snapshot migration — `run.pendingEvent` already round-trips, and `currentCourse` re-derives these.
 */

import type { RouteEvent } from './events';
import type { PatchKind } from '../patches';
import type { Rarity } from '../course/contract';

/** The atmospheric flavour a lane brings to the world it flies into. Render-only, except where a
 *  documented play hook says otherwise (tents; scorch; `effectWindMult`; `effectCarryMult`;
 *  `effectPatchKind` — GS-journey-fx-2 gave EVERY effect a real, readable play consequence). */
export type CourseEffectId =
  | 'none'
  | 'moonlight' //   cool moonlit night — a silver wash + still air
  | 'meteorShower' // streaking meteors raining across the sky — scorch craters char the turf
  | 'solarStorm' //   an angry red flare — crackling, gusty charged air
  | 'ionStorm' //     blue-violet forked lightning — the gustiest sky of all
  | 'eclipse' //      a black sun ringed by corona — the air goes dead still
  | 'nebula' //       colour-lit fog banks drifting over the course
  | 'comet' //        a grand comet overhead — its tail sheds STARDUST drifts (bonus lies)
  | 'aurora' //       shimmering colour ribbons — charged air LIFTS the ball (carry up)
  | 'spaceJunk' //    a crashed-debris field — WRECKAGE tangles on the turf (trouble lies)
  | 'tradeMarket' //  a bustling trade camp pitched around the green (collidable tents)
  | 'gravityWell' //  a giant world looms — heavy sky DRAGS the ball down (carry down)
  | 'frostfall' //    glittering frost sifts down — ICE patches freeze onto the turf
  | 'blizzard' //     a howling whiteout — gusty wind UP + ICE patches (the storm-cold cousin of frostfall)
  | 'radiant' //      a brilliant star bathes the course — still bright air LIFTS the ball (carry up, wind down)
  | 'dustStorm' //    a rolling wall of grit — gusty wind UP + thick air DRAGS the ball (carry down)
  | 'solarWind' //    a steady stream of solar particles — a stiff, constant breeze (wind up)
  | 'darkMatter'; //  an unseen mass warps the starlight, stills the air — gravitic TAR pools on the turf

export interface CourseEffectInfo {
  id: CourseEffectId;
  /** Short card label. */
  label: string;
  /** Glyph for the route card + the starmap planet badge. */
  icon: string;
  /** One-line atmosphere blurb for the route card. */
  blurb: string;
  /** The effect's GEOMETRIC play hook, one readable line for the route card (tents / craters /
   *  ground patches). Absent = the hook is a numeric wind/carry lever (the card computes those
   *  chips from `EFFECT_WIND`/`EFFECT_CARRY` so the numbers can never drift from the physics). */
  play?: string;
}

export const COURSE_EFFECTS: Record<CourseEffectId, CourseEffectInfo> = {
  none: { id: 'none', label: 'Clear skies', icon: '✦', blurb: 'Still, open space.' },
  moonlight: { id: 'moonlight', label: 'Moonlit', icon: '🌙', blurb: 'A silver moon washes the course — calm, still air.' },
  meteorShower: { id: 'meteorShower', label: 'Meteor shower', icon: '🌠', blurb: 'Meteors streak down across the whole sky.', play: 'Craters char the turf — hot, wild lies' },
  solarStorm: { id: 'solarStorm', label: 'Solar storm', icon: '⚡', blurb: 'A red flare crackles — charged, gusty air.' },
  ionStorm: { id: 'ionStorm', label: 'Ion storm', icon: '🌩️', blurb: 'Blue lightning forks overhead — the wildest winds in the sky.' },
  eclipse: { id: 'eclipse', label: 'Total eclipse', icon: '🌘', blurb: 'A black sun ringed by corona — the air goes dead still.' },
  nebula: { id: 'nebula', label: 'Nebula shroud', icon: '🌌', blurb: 'Glowing fog banks drift over the course in slow colour.' },
  comet: { id: 'comet', label: 'Comet overhead', icon: '☄️', blurb: 'A grand comet hangs in the sky, tail shedding sparkle dust.', play: 'Stardust drifts on the turf — charged lies fly hot AND true' },
  aurora: { id: 'aurora', label: 'Aurora', icon: '🌈', blurb: 'Ribbons of colour shimmer over the horizon.' },
  spaceJunk: { id: 'spaceJunk', label: 'Debris field', icon: '🛰️', blurb: 'Crashed wreckage litters the rough.', play: 'Wreckage tangles on the turf — snagged, wild lies' },
  tradeMarket: { id: 'tradeMarket', label: 'Trade camp', icon: '⛺', blurb: 'A trade camp rings the green — bounce your ball off the tents!', play: 'Tents ring the green — low shots ricochet off the roofs' },
  gravityWell: { id: 'gravityWell', label: 'Gravity well', icon: '🪐', blurb: 'A giant world looms close — its pull hangs heavy on every shot.' },
  frostfall: { id: 'frostfall', label: 'Frostfall', icon: '❄️', blurb: 'Glittering frost sifts down out of a cold, clear sky.', play: 'Ice patches freeze the turf — slick, skiddy lies' },
  blizzard: { id: 'blizzard', label: 'Blizzard', icon: '🌨️', blurb: 'A howling whiteout drives snow sideways across the course.', play: 'Ice patches freeze the turf — slick lies, in a gale' },
  radiant: { id: 'radiant', label: 'Radiant burst', icon: '☀️', blurb: 'A brilliant star bathes the course in still, golden light.' },
  dustStorm: { id: 'dustStorm', label: 'Dust storm', icon: '🏜️', blurb: 'A rolling wall of grit sweeps in — the air gusts and drags at once.' },
  solarWind: { id: 'solarWind', label: 'Solar wind', icon: '🌬️', blurb: 'A steady stream of solar particles streaks past — a stiff, constant breeze.' },
  darkMatter: { id: 'darkMatter', label: 'Dark-matter drift', icon: '🌑', blurb: 'An unseen mass warps the starlight and stills the air — dark matter pools on the ground.', play: 'Gravitic tar pools on the turf — sticky lies that kill your distance' },
};

/**
 * The one physics hook a course effect carries (GS-journey-variety): a WIND multiplier applied to
 * every hole's generated wind speed as a pure POST-generation transform (`currentCourse`), clamped to
 * `EFFECT_WIND_CAP` so it never exceeds the band the no-death-spiral harness proves. Storm skies gust
 * harder; a moonlit night or an eclipse goes still. Honest by construction: the transformed speed IS
 * `hole.wind`, so the HUD, the visible wind streaks, the AI's aim and the shot physics all read the
 * SAME number — and auto ≡ interactive holds because it's course data, not a driver-side tweak.
 * 1 (or an absent entry) = untouched, byte-for-byte the old course.
 */
export const EFFECT_WIND: Partial<Record<CourseEffectId, number>> = {
  moonlight: 0.85,
  eclipse: 0.7,
  nebula: 0.9,
  solarStorm: 1.2,
  ionStorm: 1.35,
  frostfall: 0.9, // cold air lies still — frostfall's danger is on the ground, not in the sky
  blizzard: 1.3, // a driving gale — between the solar and ion storms, its bite doubled by the ice
  solarWind: 1.15, // a steady stiff particle breeze — a third storm that isn't lightning
  dustStorm: 1.25, // grit that gusts hard (and drags the ball down — see EFFECT_CARRY)
  radiant: 0.82, // brilliant, dead-still air — the calm half of the bomber's-paradise sky
  darkMatter: 0.78, // the mass swallows the wind — an eerie, unnatural stillness
};

/** Wind speed ceiling (mph) after an effect multiplier — the generator's own max band. */
export const EFFECT_WIND_CAP = 46;

/** The wind multiplier a course effect applies (1 = none). */
export function effectWindMult(effect: string | undefined): number {
  return EFFECT_WIND[(effect ?? 'none') as CourseEffectId] ?? 1;
}

/**
 * The effect's second physics hook (GS-journey-fx-2): a CARRY multiplier on every full shot. Applied
 * as a pure post-generation `biomeMods` carry row (`currentCourse`), the SAME mechanism low-gravity
 * biomes already use — so `biomeCarryMult` feeds it identically to the HUD's range preview, the AI's
 * club pick, the interactive suggestions and the shot physics, and auto ≡ interactive holds by
 * construction (it's course data, not a driver-side tweak). Honest by design: the ball flies exactly
 * as far as every readout said it would. Kept in a modest band (±10%) so club coverage never breaks.
 */
export const EFFECT_CARRY: Partial<Record<CourseEffectId, number>> = {
  aurora: 1.06, // the charged curtain lifts the ball — everything flies a touch farther
  gravityWell: 0.92, // the giant's pull hangs on the ball — everything falls a touch short
  radiant: 1.06, // thin, bright, still air — the ball flies far and true (a bomber's paradise)
  dustStorm: 0.94, // thick grit hangs on the ball — the gritty half of the gust-and-drag sky
};

/** The carry multiplier a course effect applies (1 = none). */
export function effectCarryMult(effect: string | undefined): number {
  return EFFECT_CARRY[(effect ?? 'none') as CourseEffectId] ?? 1;
}

/**
 * The effect's GROUND-PATCH hook (GS-journey-fx-2): which seeded turf-patch family the effect scatters
 * along the corridor (`sim/patches.ts` — the generalised GS-meteor-scorch machinery). A ball at REST
 * on a patch plays that family's lie next shot: comet stardust is a BONUS lie (hot and true — worth
 * hunting), frostfall ice is slick, junk wreckage snags. Pure seeded geometry gated at the play
 * boundary exactly like the scorch craters; the meteor shower keeps its own dedicated scorch path.
 */
export const EFFECT_PATCH: Partial<Record<CourseEffectId, PatchKind>> = {
  comet: 'stardust',
  frostfall: 'frost',
  spaceJunk: 'junk',
  blizzard: 'frost', // the blizzard freezes the same ice patches as frostfall — but under a gale
  darkMatter: 'tar', // gravitic pools that grab the ball and kill its run (the sticky inverse of ice)
};

/** The ground-patch family a course effect scatters (undefined = none). */
export function effectPatchKind(effect: string | undefined): PatchKind | undefined {
  return EFFECT_PATCH[(effect ?? 'none') as CourseEffectId];
}

/**
 * The effect's TRAVEL hook (GS-fuel-4): a fuel DELTA on the jump that flies into this sky, so the
 * weather prices the voyage as well as the golf. A solar wind or a comet's wake at your back pushes
 * the ship (−1 ⛽); climbing out of a gravity well or battering through an ion storm costs extra
 * (+1 ⛽). Pure and derived (zero rng, no save state) — `routeFuelCost` folds it in, so every ⛽
 * readout (starmap label, route sheet, launch button) prices it automatically, and the route card
 * states the hook as a tailwind/headwind chip. This decouples a lane's fuel bill from its jump
 * distance — the axis GS-fuel-2's critique said was missing ("cost tracks reward exactly, nothing
 * to weigh"). Fairness: the headwind skies ride payout/toll gambles only (machine-checked in
 * tests/fuel.test.ts — no calm-category OUT lane is ever fuel-taxed), and the burn still floors at
 * 1 in `routeFuelCost`, so a tailwind never makes a jump free.
 */
export const EFFECT_FUEL: Partial<Record<CourseEffectId, number>> = {
  solarWind: -1, // the particle stream at your back — the ship surfs it in
  comet: -1, //     ride the comet's wake (the lore several comet lanes already promise)
  gravityWell: 1, // climbing out of the giant's pull burns hard
  ionStorm: 1, //   forked lightning batters the hull the whole way through
};

/** The fuel delta a course effect adds to a jump's burn (0 = none). */
export function effectFuelDelta(effect: string | undefined): number {
  return EFFECT_FUEL[(effect ?? 'none') as CourseEffectId] ?? 0;
}

/**
 * The CLUB FIND a route hands you (GS-journey-fx-3): a salvage / debris / wreck / mining lane
 * (`category: 'salvage'`) scavenges a club of this rarity that you don't already carry, equipped for
 * the rest of the run (resolved against the live loadout in `salvage.ts`, paid on travel). The rarity
 * tracks the lane's loot grade but is floored at RARE — the shop's own floor, since commons aren't
 * offerable gear — so even an early common salvage lane is a genuine rare find, never junk. This
 * single source is read by both `travel` (the grant) and the route card (the preview) so they agree.
 * Non-salvage lanes return undefined (their reward is credits / carry / cut, not loot).
 */
export function routeClubFind(ev: RouteEvent | undefined): Rarity | undefined {
  if (!ev || ev.category !== 'salvage') return undefined;
  return ev.rarity === 'common' ? 'rare' : ev.rarity;
}

/**
 * The wildness DELTA a route applies to the course it reaches — derived from the event's cut lever so a
 * "harder" lane is a genuinely harder COURSE (not just a higher Stableford bar that a boss stop ignores).
 * Clamped to a modest band so the resulting generated wildness still lands in [0.05, 1].
 */
export function routeDifficulty(ev: RouteEvent | undefined): number {
  if (!ev) return 0;
  const d = Math.round(ev.cutDelta) * 0.07;
  return Math.max(-0.15, Math.min(0.25, d));
}

/** The atmospheric flavour a route brings — keyed off the event's theme (icon/id) then its category.
 *  Order matters: the most specific showpieces first (an eclipse is not just "moonlight", a comet is
 *  not just "meteors", the ion storm is not the solar one), so every headline event reads true. */
export function routeEffect(ev: RouteEvent | undefined): CourseEffectId {
  if (!ev || ev.id === 'open-space') return 'none';
  const id = ev.id.toLowerCase();
  const icon = ev.icon;
  // Thematic overrides first (the dated/astronomical showpieces read true).
  if (/eclipse|conjunction/.test(id)) return 'eclipse';
  // GS-journey-weather new skies — placed BEFORE the older families so their tokens win: 'snowstorm'
  // must not fall to the solar STORM regex, 'dark-matter' must not read as a gravity SINGULARity, and
  // 'solar-wind' must beat the bare 'solar' storm. Each requires a specific token so it never steals an
  // existing event (e.g. 'stardust' stays a comet, 'stellar-tailwind' stays moonlight).
  if (/dark-?matter|dark-?nebula|umbral|phantom-?mass|void-?fog/.test(id)) return 'darkMatter';
  if (/blizzard|whiteout|snowstorm|snow-?squall|ice-?storm/.test(id) || /🌨/.test(icon)) return 'blizzard';
  if (/dust-?storm|sandstorm|sirocco|haboob|grit-?storm/.test(id) || /🏜/.test(icon)) return 'dustStorm';
  if (/solar-?wind|stellar-?wind|helios|particle-?wind/.test(id)) return 'solarWind';
  if (/radian|sun-?bath|sunbath|photon-?bloom|brilliance|sunburst|starshine/.test(id)) return 'radiant';
  // Heavy-sky events (GS-journey-fx-2) — before /moon/ so the supermoon's tide-pull reads as the
  // gravity well its lore describes, and before /comet/ so a dwarf star never reads as dust.
  if (/gravit|slingshot|neutron|dwarf|singular|rogue|(^|-)tide(-|$)|supermoon|black-hole|horizon/.test(id)) return 'gravityWell';
  if (/comet|stardust/.test(id)) return 'comet';
  if (/frost|cryo|glacial|frozen|freeze|hail/.test(id) || /❄/.test(icon)) return 'frostfall';
  if (/moon/.test(id) || /🌑|🌕|🌗|🌒|🌘|🌙/.test(icon)) return 'moonlight';
  if (/meteor|shower|perseid|geminid|leonid|apophis/.test(id) || /☄/.test(icon)) return 'meteorShower';
  if (/(^|-)ions?(-|$)|pulsar|quasar|magnet|plasma/.test(id)) return 'ionStorm';
  if (/solar|flare|storm|nova|opposition/.test(id) || /⚡|☀|🌋|💥/.test(icon)) return 'solarStorm';
  if (/aurora|borealis|prism|spectr/.test(id) || /🌈/.test(icon)) return 'aurora';
  if (/nebula|nursery|galactic|rift|jackpot|cluster/.test(id) || /🎆/.test(icon)) return 'nebula';
  if (/trade|market|bazaar|caravan|outpost|depot/.test(id)) return 'tradeMarket';
  if (/salvage|scrap|junk|derelict|wreck|debris|station|iss-/.test(id)) return 'spaceJunk';
  // Otherwise fall back to the functional family.
  switch (ev.category) {
    case 'calm':
      return 'moonlight';
    case 'payout':
      return 'aurora';
    case 'toll':
      return 'solarStorm';
    case 'salvage':
      return 'spaceJunk';
    default:
      return 'none';
  }
}

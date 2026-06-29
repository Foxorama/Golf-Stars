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
 *   2. FLAVOUR (`routeEffect`) — a render-only `CourseEffect` stamped on the course meta: meteor shower,
 *      moonlight, an aurora, a solar storm, a crashed-junk debris field, a trade-market camp. Pure
 *      atmosphere (weather / lighting / decor) drawn by the renderers — it touches NEITHER physics NOR
 *      generation rng, so fairness is untouched. It makes each lane LOOK like a distinct destination.
 *
 * Both are derived from the event (content-as-data), so attaching them changes no rng stream and needs
 * no snapshot migration — `run.pendingEvent` already round-trips, and `currentCourse` re-derives these.
 */

import type { RouteEvent } from './events';

/** The atmospheric flavour a lane brings to the world it flies into. Render-only. */
export type CourseEffectId =
  | 'none'
  | 'moonlight' //   cool moonlit night — a silver wash over the course
  | 'meteorShower' // streaking meteors raining across the sky
  | 'solarStorm' //   an angry red flare — crackling charged air
  | 'aurora' //       shimmering colour ribbons overhead
  | 'spaceJunk' //    a crashed-debris field strewn through the rough
  | 'tradeMarket'; // a bustling trade camp pitched at the world's edge

export interface CourseEffectInfo {
  id: CourseEffectId;
  /** Short card label. */
  label: string;
  /** Glyph for the route card + the starmap planet badge. */
  icon: string;
  /** One-line atmosphere blurb for the route card. */
  blurb: string;
}

export const COURSE_EFFECTS: Record<CourseEffectId, CourseEffectInfo> = {
  none: { id: 'none', label: 'Clear skies', icon: '✦', blurb: 'Still, open space.' },
  moonlight: { id: 'moonlight', label: 'Moonlit', icon: '🌙', blurb: 'A silver moon washes the course in cool light.' },
  meteorShower: { id: 'meteorShower', label: 'Meteor shower', icon: '☄️', blurb: 'Meteors streak down across the whole sky.' },
  solarStorm: { id: 'solarStorm', label: 'Solar storm', icon: '⚡', blurb: 'A red flare crackles — charged, restless air.' },
  aurora: { id: 'aurora', label: 'Aurora', icon: '🌈', blurb: 'Ribbons of colour shimmer over the horizon.' },
  spaceJunk: { id: 'spaceJunk', label: 'Debris field', icon: '🛰️', blurb: 'Crashed wreckage litters the rough.' },
  tradeMarket: { id: 'tradeMarket', label: 'Trade camp', icon: '⛺', blurb: 'A trade caravan has pitched camp out by the rough.' },
};

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

/** The atmospheric flavour a route brings — keyed off the event's theme (icon/id) then its category. */
export function routeEffect(ev: RouteEvent | undefined): CourseEffectId {
  if (!ev || ev.id === 'open-space') return 'none';
  const id = ev.id.toLowerCase();
  const icon = ev.icon;
  // Thematic overrides first (the dated/astronomical showpieces read true).
  if (/moon|eclipse/.test(id) || /🌑|🌕|🌗|🌒|🌘|🌙/.test(icon)) return 'moonlight';
  if (/meteor|comet|shower|asteroid/.test(id) || /☄/.test(icon)) return 'meteorShower';
  if (/solar|flare|quasar|storm|nova|pulsar|magnet/.test(id) || /⚡|☀|🌋|💥/.test(icon)) return 'solarStorm';
  if (/aurora|nebula|borealis|prism|spectr/.test(id) || /🌈|🎆|✨/.test(icon)) return 'aurora';
  if (/trade|market|bazaar|caravan|outpost|depot/.test(id)) return 'tradeMarket';
  if (/salvage|scrap|junk|derelict|wreck|debris/.test(id)) return 'spaceJunk';
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

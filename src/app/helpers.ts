/**
 * Small shared presentational helpers used across the app shell's screen modules AND the
 * playing screen in `app.ts`: per-hole render keys, the route-effect arm checks, the played
 * golfer's look, the caddy badge, and the rarity flavour/burst chrome. All pure reads of the
 * live `state` (no rng, no mutation).
 */

import { state } from './ctx';
import type { PatchKind } from '../sim/patches';
import { effectPatchKind } from '../sim/rpg/effects';
import { getCharacter } from '../sim/rpg/characters';
import { equippedGearTheme, isPuttingCaddy, namedCaddyOwned } from '../sim/rpg/economy';
import { apparelById } from '../sim/rpg/apparel';
import { storyGearAvatar } from '../sim/rpg/storyGear';
import { driverForCharacter, golfBagForCharacter, hatForCharacter, pantsForCharacter, shirtForCharacter } from '../ui/game';
import type { GolferLook } from '../render/playView';
import { CADDY_LABEL, hasCaddyArt } from '../render/caddyArt';
import { isHeraldAgent, heraldAgent } from '../sim/rpg/storyHeraldCrew';
import { getSettings } from '../settings';
import type { Rarity } from '../sim/course/contract';

/** Per-hole render keys (GS-variation): a split-biome stop's back holes carry their own biome/theme,
 *  so each hole renders + reads as its world; fall back to the course-level keys otherwise. */
export function holeBiome(h: { biome?: string }): string {
  return h.biome ?? state.course.biome;
}
export function holeThemeId(h: { themeId?: string }): string | undefined {
  return h.themeId ?? state.course.meta.themeId;
}
/** The current stop's atmospheric course effect (GS-journey-fx), stamped on the course meta by the
 *  chosen route. Render-only flavour fed to both renderers. */
export function currentEffect(): string | undefined {
  return state.course?.meta?.effect;
}

/** Rainbow Ball (GS-rainbow): whether the live loadout has armed Rainbow Road. Baked into the render
 *  options at the app boundary (like `lefty()`), so the renderer paints the rainbow ribbon + the sim's
 *  OOB-off-road rule (both keyed off the same loadout flag) stay in lock-step. */
export function rainbowActive(): boolean {
  return !!state.run?.loadout?.rainbowRoad;
}

/** Trade-camp tents (GS-tents): whether the current stop's route armed the green's collidable tents.
 *  Baked into the render options (the ring is drawn in course space) — the sim's bounce is keyed off the
 *  SAME course effect (`playerHoleOpts`), so the graphic and the physics stay in lock-step. */
export function tentsActive(): boolean {
  return currentEffect() === 'tradeMarket';
}

/** Meteor-strike scorch craters (GS-meteor-scorch): whether the current stop's route charred the turf.
 *  Baked into the render options exactly like the tents — the sim's lie conversion keys off the SAME
 *  course effect (`playerHoleOpts`), so the drawn craters and the physics stay in lock-step. */
export function scorchActive(): boolean {
  return currentEffect() === 'meteorShower';
}

/** Effect ground patches (GS-journey-fx-2): which turf-patch family the current stop's route armed
 *  (comet stardust / frostfall ice / debris wreckage), or undefined. Baked into the render options
 *  exactly like the scorch craters — the sim's lie conversion keys off the SAME course effect. */
export function patchActive(): PatchKind | undefined {
  return effectPatchKind(currentEffect());
}

/** The selected golfer's on-course look (GS-18), or undefined → the loader-crew cap cycle. A bought
 *  themed club set (GS-proshop-2) adds the `gear` glow so the golfer swings the club you bought. */
export function golferLook(): GolferLook | undefined {
  const base = getCharacter(state.run.loadout.characterId)?.style;
  if (!base) return undefined;
  const gear = equippedGearTheme(state.run.loadout);
  // GS-story-avatar: a STORY TOUR round wears the DEFAULT outfit (the character's colour-coded base look)
  // plus ONLY the cosmetics earned + equipped IN the campaign (its own Story gear) — the global clubhouse
  // wardrobe is deliberately ignored here, so a golfer's Story look reflects their Story progress, not
  // their main-save cosmetics. Every other mode (Voyage/Unending/Star Tour) keeps the clubhouse look below.
  if (state.run.storyRound && state.story) {
    const av = storyGearAvatar(state.story);
    return {
      ...base,
      ...(gear ? { gear: { theme: gear.theme, tint: gear.tint } } : {}),
      ...(av.hat ? { hat: av.hat } : {}),
      ...(av.bag ? { bag: av.bag } : {}),
      ...(av.glove ? { glove: av.glove } : {}),
      ...(av.shoes ? { shoes: av.shoes } : {}),
      ...(av.clubSkin ? { clubSkin: av.clubSkin } : {}),
      ...(av.ballTracer ? { ballTracer: av.ballTracer } : {}),
      ...(av.shirtStyle ? { shirtStyle: av.shirtStyle } : {}),
      ...(av.pantsStyle ? { pantsStyle: av.pantsStyle } : {}),
    };
  }
  // Layer the PLAYED character's equipped cosmetic hat/shirt (GS-clubhouse) over their base colours.
  const cid = state.run.loadout.characterId;
  const hat = apparelById(hatForCharacter(state, cid))?.look;
  const shirtStyle = apparelById(shirtForCharacter(state, cid))?.look;
  const pantsStyle = apparelById(pantsForCharacter(state, cid))?.look;
  // The equipped cosmetic DRIVER (GS-thor) — swaps the plain club head for its own skin (Thor's Hammer).
  const driver = apparelById(driverForCharacter(state, cid))?.look;
  // The equipped cosmetic BAG (GS-wardrobe-bagtier) — propped beside the golfer on the course.
  const bag = apparelById(golfBagForCharacter(state, cid))?.look;
  return {
    ...base,
    ...(gear ? { gear: { theme: gear.theme, tint: gear.tint } } : {}),
    ...(hat ? { hat } : {}),
    ...(shirtStyle ? { shirtStyle } : {}),
    ...(pantsStyle ? { pantsStyle } : {}),
    ...(driver ? { driver } : {}),
    ...(bag ? { bag } : {}),
  };
}

/** The hired named caddy's id (GS-caddy), or undefined — drawn in the play-view/putt-meter corner.
 *  GS-story-quality: on a Herald Story round the active bag caddy is a Coil VOLUNTEER (not a "named caddy"
 *  perk), so fall back to the story's active caddy when it's a Coil agent — they carry the bag on-course too. */
export function caddyId(): string | undefined {
  const named = namedCaddyOwned(state.run.loadout.perks);
  if (named) return named;
  const active = state.story?.activeCaddyId;
  if (state.run.storyRound && active && isHeraldAgent(active)) return active;
  return undefined;
}

/** The caddy to show on the PUTTING screen — only a putting specialist (Penelope, Mystic Mole). A
 *  distance/guard caddy like Driver Dan has no role on the green, so it doesn't appear there. */
export function puttCaddyId(): string | undefined {
  const id = caddyId();
  return isPuttingCaddy(id) ? id : undefined;
}

/** The framed gold caddy badge (the "cool outline") — shared by the decision and putting screens.
 *  The figure is drawn to the canvas in the render wiring (keyed off `data-caddy`). '' when none. */
export function caddyBadgeHTML(id: string | undefined): string {
  if (hasCaddyArt(id))
    return `<div class="gs-caddybadge"><canvas class="gs-caddycv" width="128" height="120" data-caddy="${id}"></canvas><span class="gs-caddyname">${CADDY_LABEL[id]}</span></div>`;
  // GS-story-quality: a Coil VOLUNTEER (Herald caddy) has a story figure but no CADDY_LABEL entry.
  if (id && isHeraldAgent(id)) {
    const short = heraldAgent(id)?.name.replace(/^.*?["']([^"']+)["'].*$/, '$1') ?? 'Coil';
    return `<div class="gs-caddybadge"><canvas class="gs-caddycv" width="128" height="120" data-caddy="${id}"></canvas><span class="gs-caddyname">${short}</span></div>`;
  }
  return '';
}

/** Left-handed mode (GS-lefty) — the live player setting. The sim reads it off `loadout.lefty`
 *  (synced from this in `render`), the renderers take it as an option, the CSS keys a modifier. */
export function lefty(): boolean {
  return getSettings().leftHanded;
}

/** Per-rarity course flavour (GS-rarity-style): a glyph, a one-line tagline, and how boldly to frame
 *  the stop — so common→legendary read as DISTINCT finds, not just a colour swap. */
export function rarityFlavour(r: Rarity): { glyph: string; tagline: string; glow: number; strong: boolean } {
  switch (r) {
    case 'legendary':
      return { glyph: '✦', tagline: 'A legendary world — the galaxy rarely yields its like.', glow: 34, strong: true };
    case 'epic':
      return { glyph: '◆', tagline: 'An epic find — a world worth the voyage.', glow: 28, strong: true };
    case 'rare':
      return { glyph: '◈', tagline: 'A rare stop — richer rewards, sterner test.', glow: 22, strong: false };
    default:
      return { glyph: '○', tagline: 'A common world to find your rhythm.', glow: 18, strong: false };
  }
}

/** A one-shot, assetless sparkle burst (CSS only) for the big beats — made cut, a holed shot.
 *  Skipped under reduced-motion. Deterministic spark layout (no Math.random). Needs a
 *  position:relative ancestor; pointer-events:none so it never blocks a tap. */
export function burst(): string {
  if (getSettings().reducedMotion) return '';
  const N = 16;
  const sparks = Array.from({ length: N }, (_, i) => {
    const ang = (i / N) * 360 + ((i * 37) % 30);
    const d = 64 + ((i * 53) % 90);
    const dx = Math.cos((ang * Math.PI) / 180) * d;
    const dy = Math.sin((ang * Math.PI) / 180) * d;
    const ch = ['✦', '⭐', '✧', '·'][i % 4];
    return `<span class="gs-spark" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;animation-delay:${(i % 5) * 45}ms;">${ch}</span>`;
  }).join('');
  return `<div class="gs-burst" aria-hidden="true">${sparks}</div>`;
}

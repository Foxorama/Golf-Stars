/**
 * Journey-map bridge HUD theming (GS-journey-hud) — the command-console frame that wraps the star map
 * recolours to the ship you FLY, so a fleet reads as its own bridge livery.
 *
 * This is deliberately a table + resolver, mirroring the rest of the content-as-data engine: a HUD
 * livery is four colours (+ an optional frame `variant` class) keyed by ship id, falling back to the
 * cosmetic SET, falling back to the standard cyan console. The travel screen pipes the resolved theme
 * into the HUD as CSS custom properties (`--hud-accent` / `--hud-accent2` / `--hud-glow` / `--hud-ink`)
 * and stamps `gs-bhud--<variant>` on the frame — so a NEW livery (or, later, a per-ship frame SHAPE) is a
 * new row here, never a layout edit. Pure data + string → no DOM, no rng, no sim coupling.
 */

import { shipById } from '../sim/rpg/ships';

export interface HudTheme {
  /** CSS variant class suffix (`gs-bhud--<variant>`) — the future hook for per-fleet frame SHAPES, not
   *  just colours. Every livery is `standard` today; add a `.gs-bhud--racer` block to reshape a fleet. */
  variant: string;
  /** Primary console accent — frame border, corner brackets, glow rim, active readouts. */
  accent: string;
  /** Secondary accent — inner hairlines, ticks, the console panel edge. */
  accent2: string;
  /** Glow tint bloomed behind the frame (an rgba string so it can be soft). */
  glow: string;
  /** Console readout ink (labels etched on the bezel). */
  ink: string;
}

/** The standard bridge: a clean cyan command console (the travel screen's existing fuel/scan cyan). */
export const DEFAULT_HUD_THEME: HudTheme = {
  variant: 'standard',
  accent: '#5fd6e6',
  accent2: '#3a6a86',
  glow: 'rgba(60,150,210,0.30)',
  ink: '#cfe6f2',
};

/**
 * Per-ship / per-set HUD liveries. Keyed `<shipId>` first (an exact ride), then `set:<Set>` (a whole
 * fleet), then the standard console. EVERY set now carries a `variant` (GS-fleet-bridges) so flying a
 * different fleet gives a genuinely different command bridge — a table `.gs-bhud--<variant>` CSS block +
 * a `hudChrome.ts` builder, never a layout edit. A `<shipId>` row overrides the set to give a hero ship
 * (Comet Rider, Thunderbolt, Infinity Ace) its OWN deck within a shared set.
 */
const SHIP_HUD: Record<string, Partial<HudTheme>> = {
  // Woody road-trip dash — warm amber, chrome trim, fuzzy dice.
  'set:Wagon': { variant: 'wagon', accent: '#e0b15a', accent2: '#8a5a2b', glow: 'rgba(200,140,60,0.26)', ink: '#f2e2c4' },
  // Redline speeder cockpit — carbon + racing red, checkered stripe.
  'set:Racer': { variant: 'racer', accent: '#ff6b5a', accent2: '#7a2622', glow: 'rgba(210,70,60,0.26)', ink: '#ffd8cc' },
  // Industrial freighter bridge — rugged cargo green, caution stripes, rivets.
  'set:Hauler': { variant: 'hauler', accent: '#8fd46a', accent2: '#39502c', glow: 'rgba(90,170,70,0.24)', ink: '#e0f2cc' },
  // Alien saucer probe deck — bio-green glow, a floating orbital ring.
  'set:Exotic': { variant: 'exotic', accent: '#5fe0a8', accent2: '#1c5a3c', glow: 'rgba(70,200,150,0.26)', ink: '#d6fff0' },
  // Neon night-bike HUD — pink + cyan, scanlines, minimal.
  'set:Speeder': { variant: 'speeder', accent: '#ff5fbf', accent2: '#28e0d0', glow: 'rgba(255,90,190,0.24)', ink: '#ffd6f0' },
  // Asgardian runic war-bridge — bronze + gold, rune ticks, bronze wings.
  'set:Valkyrie': { variant: 'valkyrie', accent: '#ffd36b', accent2: '#b8823a', glow: 'rgba(230,185,63,0.28)', ink: '#fff0c8' },
  // The grand flying-saucer bridge (Mothership) — violet + chrome, a spinning saucer light-ring.
  'set:Mythic': { variant: 'mythic', accent: '#c585ff', accent2: '#5b3b8a', glow: 'rgba(150,90,220,0.30)', ink: '#eadcff' },

  // ── Hero-ship overrides within a shared set ──
  // The Comet Rider (GS-ace-ship) — a dimpled golf-ball comet: icy white-blue, a swept comet tail.
  'comet-rider': { variant: 'comet', accent: '#bfe3ff', accent2: '#3f6a8a', glow: 'rgba(150,210,255,0.28)', ink: '#eaf6ff' },
  // The Thunderbolt (mythic chopper) — a hot-rod bridge wreathed in flame + forked lightning.
  'chopper-thunderbolt': { variant: 'chopper', accent: '#ff7a1a', accent2: '#7a3410', glow: 'rgba(255,120,30,0.30)', ink: '#ffd9b0' },

  // The INFINITY ACE (GS-infinity-hud) — the hole-150 Unending grail, the reference bespoke reskin: a
  // living-aurora ring (gold→emerald→aquamarine→violet, the ship's own palette), a phoenix-wing canopy,
  // pulsing corner brackets, and an ∞ crest at the frame crown. Its four base colours are the golden-
  // phoenix / aurora hues so a reduced-motion (or older) browser still renders a rich static gold-aurora
  // bridge — the grail always reads a cut above the fleet.
  'infinity-ace': {
    variant: 'infinity',
    accent: '#ffd76b',
    accent2: '#4fe0b0',
    glow: 'rgba(240,200,90,0.36)',
    ink: '#fff2c8',
  },
};

/** Resolve the HUD livery for the ship currently flown (id → set → standard). Always a full theme. */
export function hudThemeForShip(shipId: string | undefined): HudTheme {
  const ship = shipById(shipId);
  const bySet = ship ? SHIP_HUD[`set:${ship.set}`] : undefined;
  const byId = shipId ? SHIP_HUD[shipId] : undefined;
  return { ...DEFAULT_HUD_THEME, ...bySet, ...byId };
}

/** The resolved theme as an inline `style` payload of `--hud-*` custom properties for the HUD element. */
export function hudThemeVars(theme: HudTheme): string {
  return `--hud-accent:${theme.accent};--hud-accent2:${theme.accent2};--hud-glow:${theme.glow};--hud-ink:${theme.ink};`;
}

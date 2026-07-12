/**
 * Bridge-HUD CHROME per ship livery (GS-infinity-hud → GS-fleet-bridges) — the second half of the
 * journey-map HUD theming.
 *
 * `hudTheme.ts` recolours the frame (four colours + a `variant` class); THIS module gives every livery a
 * FULL bespoke reskin so a fleet reads as a set of distinct command bridges — not a tinted default. Each
 * livery swaps the three console instruments (scanner / exit / fuel), NAMES the bridge after the actual
 * ship on a hanging title plate, and injects frame ORNAMENTS (side rails, corner nodes, a wing/crest) that
 * fit the craft: a woody wagon gets a retro road-trip dash, a racer a redline cockpit, an alien saucer an
 * orbital ring, the Asgardian Pegasus a runic war-bridge, the Infinity Ace a phoenix-aurora canopy, …
 *
 * It's table + resolver like everything else: `hudChromeFor(variant, ship)` returns a `HudChrome` for a
 * livery that has a builder, else `null` — and `null` means the travel screen uses the classic emoji
 * chrome (📡 / 🚪 / ⛽) with no ornaments (the fallback for an UNKNOWN ship). The visual detail lives in
 * the matching `.gs-bhud--<variant>` CSS block (index.html); this module supplies the markup those rules
 * dress, and the ship NAME so each plate self-labels.
 *
 * Pure strings → HTML (no DOM, no rng, no sim coupling). Icons are inline SVG whose `fill`/`stroke` read
 * the `--hud-*` (and, for the Infinity Ace, `--aur*`) custom properties the variant CSS defines, so they
 * inherit the livery palette for free. All ornament markup is decorative (`aria-hidden`) and inherits the
 * frame's `pointer-events:none` — only the real console BUTTONS catch touches (the CLAUDE.md invariant).
 */

import type { Ship } from '../sim/rpg/ships';

export interface HudChrome {
  /** Inner markup for the scanner dial's icon span (inline SVG or emoji). */
  scanIcon: string;
  /** Scanner button label (defaults to `SCAN` when a livery has no chrome). */
  scanLabel: string;
  /** Inner markup for the exit door's icon span. */
  exitIcon: string;
  /** Exit button label. */
  exitLabel: string;
  /** Glyph passed to `fuelGaugeHTML({ icon })` — the foot of the fuel pillar. */
  fuelIcon: string;
  /** Decorative frame ornaments injected inside `.gs-bhud` (title plate, side rails, corner nodes, a
   *  wing/crest). All `aria-hidden` + pointer-events:none so map taps still pass through. */
  frame: string;
  /** The console DECK cluster (GS-fleet-dashboards): a bespoke instrument panel dropped into the console's
   *  LEFT gap (between the exit switch and the centre command dial — the one reliably-clear ~90px on every
   *  console, since the fuel readout owns the right gap). This is what makes each dashboard read as its OWN
   *  cockpit rather than the same three pills recoloured: a woody steering wheel + speed dial for the wagon,
   *  a tach + toggle bank for the racer, an oscilloscope for the neon bike, rune stones for the Valkyrie, …
   *  Pure decorative SVG (`pointer-events:none`, painted BELOW the real controls) so map taps + the buttons
   *  are untouched; it clips gracefully if the gap is tight. `''` for the standard console (byte-identical). */
  deck: string;
}

// ── shared ornament markup ─────────────────────────────────────────────────────────────────────────
// Every bespoke bridge hangs a title plate that NAMES the ship + lays two thin instrument RAILS down the
// inner edges + pins four glowing corner NODES. The variant CSS re-tints/reshapes these; the markup is
// shared so a new bridge is a builder + a CSS block, never new plumbing.

/** The hanging title plate: `<left glyph> SHIP NAME <right glyph>`. Glyphs frame the name like wings. */
function titlePlate(name: string, left: string, right: string): string {
  return `<div class="gs-bhud__titleplate" aria-hidden="true">
      <span class="gs-bhud__titlewing gs-bhud__titlewing--l"></span>
      <span class="gs-bhud__titleglyph">${left}</span>
      <span class="gs-bhud__titletext">${name.toUpperCase()}</span>
      <span class="gs-bhud__titleglyph">${right}</span>
      <span class="gs-bhud__titlewing gs-bhud__titlewing--r"></span>
    </div>`;
}

/** The full ornament set for a bridge: a named title plate + side rails + corner nodes, plus any bespoke
 *  `extra` markup (a phoenix wing, an orbital ring, flame licks…). */
function ornaments(title: string, extra = ''): string {
  return `${title}
    <span class="gs-bhud__rail gs-bhud__rail--l" aria-hidden="true"></span>
    <span class="gs-bhud__rail gs-bhud__rail--r" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--tl" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--tr" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--bl" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--br" aria-hidden="true"></span>${extra}`;
}

// ── a small library of themed instrument SVGs ────────────────────────────────────────────────────────
// Each reads the livery custom props (A = --hud-accent, B = --hud-accent2, K = --hud-ink), so they recolour
// to whatever fleet flies them. Kept compact; reused across thematically-kin bridges where sensible.
const A = 'var(--hud-accent)';
const B = 'var(--hud-accent2)';
const K = 'var(--hud-ink)';

function svg(cls: string, vb: string, body: string): string {
  return `<svg class="gs-bico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
}

// —— SCANNERS ——
const ICON = {
  // Sensor sweep — concentric rings + a rotating wedge (the sci-fi default; the Infinity Ace's own reads --aur*).
  radar: svg('gs-bico--scan', '0 0 28 28',
    `<circle cx="14" cy="14" r="11" fill="none" stroke="${B}" stroke-width="1" opacity=".4"/>
     <circle cx="14" cy="14" r="7" fill="none" stroke="${B}" stroke-width="1" opacity=".55"/>
     <line x1="14" y1="3" x2="14" y2="25" stroke="${A}" stroke-width=".7" opacity=".3"/>
     <line x1="3" y1="14" x2="25" y2="14" stroke="${A}" stroke-width=".7" opacity=".3"/>
     <g class="gs-bico__sweep"><path d="M14 14 L14 2.5 A11.5 11.5 0 0 1 24 8 Z" fill="${A}" opacity=".3"/>
       <line x1="14" y1="14" x2="14" y2="2.5" stroke="${A}" stroke-width="1.4"/></g>
     <circle cx="14" cy="14" r="1.7" fill="${A}"/>`),
  // Analog COMPASS — the wagon's road-trip dash instrument: a bezel + a spinning N needle.
  compass: svg('gs-bico--scan', '0 0 28 28',
    `<circle cx="14" cy="14" r="11.5" fill="none" stroke="${A}" stroke-width="1.6"/>
     <circle cx="14" cy="14" r="11.5" fill="none" stroke="${B}" stroke-width="3" opacity=".25"/>
     <g class="gs-bico__sweep"><path d="M14 5 L16.4 14 L14 12 L11.6 14 Z" fill="${A}"/>
       <path d="M14 23 L11.6 14 L14 16 L16.4 14 Z" fill="${B}"/></g>
     <circle cx="14" cy="14" r="1.6" fill="${K}"/>`),
  // TACHOMETER — the racer's redline dial: an arc of ticks + a sweeping needle into the red.
  tacho: svg('gs-bico--scan', '0 0 28 28',
    `<path d="M4 20 A11 11 0 1 1 24 20" fill="none" stroke="${B}" stroke-width="1.4" opacity=".6"/>
     <path d="M18.5 6.6 A11 11 0 0 1 24 20" fill="none" stroke="#ff5a4a" stroke-width="2.2"/>
     <g class="gs-bico__needle"><line x1="14" y1="16" x2="20" y2="8.5" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/></g>
     <circle cx="14" cy="16" r="2" fill="${A}"/>`),
  // Rugged DISH — the hauler's freight radar: a bolted dish on a mast.
  dish: svg('gs-bico--scan', '0 0 28 28',
    `<path d="M5 18 A10 10 0 0 1 23 18 Z" fill="none" stroke="${A}" stroke-width="1.6" stroke-linejoin="round"/>
     <line x1="14" y1="18" x2="14" y2="9" stroke="${B}" stroke-width="1.4"/>
     <g class="gs-bico__ping"><circle cx="14" cy="10" r="2" fill="${A}"/></g>
     <line x1="9" y1="23" x2="19" y2="23" stroke="${B}" stroke-width="1.6" stroke-linecap="round"/>
     <line x1="14" y1="18" x2="14" y2="23" stroke="${B}" stroke-width="1.4"/>`),
  // Orbital RING — the alien saucer's probe: a tilted ring with an orbiting dot.
  orbit: svg('gs-bico--scan', '0 0 28 28',
    `<ellipse cx="14" cy="14" rx="12" ry="5" fill="none" stroke="${A}" stroke-width="1.4" opacity=".8"/>
     <ellipse cx="14" cy="14" rx="6.5" ry="2.6" fill="none" stroke="${B}" stroke-width="1" opacity=".7"/>
     <circle cx="14" cy="14" r="2.4" fill="${A}"/>
     <g class="gs-bico__orbit"><circle cx="26" cy="14" r="1.8" fill="${K}"/></g>`),
  // SPEEDOMETER — the neon bike's minimalist arc + a glowing tick needle.
  speedo: svg('gs-bico--scan', '0 0 28 28',
    `<path d="M5 19 A10 10 0 1 1 23 19" fill="none" stroke="${B}" stroke-width="1.4" opacity=".5"/>
     <path d="M5 19 A10 10 0 0 1 8.5 8" fill="none" stroke="${A}" stroke-width="2"/>
     <g class="gs-bico__needle"><line x1="14" y1="16" x2="8" y2="9.5" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/></g>
     <circle cx="14" cy="16" r="1.9" fill="${K}"/>`),
  // RUNE ring — the Asgardian seer-stone: a ring scribed with ticks + a bifrost cross.
  rune: svg('gs-bico--scan', '0 0 28 28',
    `<circle cx="14" cy="14" r="11" fill="none" stroke="${A}" stroke-width="1.5"/>
     <circle cx="14" cy="14" r="11" fill="none" stroke="${A}" stroke-width="1" stroke-dasharray="1.5 2.4" opacity=".7"/>
     <path d="M14 6 L14 22 M9 9 L19 19 M9 19 L19 9" stroke="${B}" stroke-width="1.2" opacity=".8"/>
     <g class="gs-bico__sweep"><path d="M14 14 L14 3 L20 6 Z" fill="${A}" opacity=".35"/></g>
     <circle cx="14" cy="14" r="2" fill="${A}"/>`),
  // UFO light-RING — the Mothership: a saucer rim studded with flashing dots.
  ufoRing: svg('gs-bico--scan', '0 0 28 28',
    `<ellipse cx="14" cy="15" rx="12" ry="4.5" fill="none" stroke="${A}" stroke-width="1.4"/>
     <path d="M6 14 A8 8 0 0 1 22 14" fill="none" stroke="${B}" stroke-width="1.2" opacity=".7"/>
     <g class="gs-bico__lights">
       <circle cx="4" cy="15" r="1.4" fill="${A}"/><circle cx="9" cy="18" r="1.4" fill="${K}"/>
       <circle cx="14" cy="19" r="1.4" fill="${A}"/><circle cx="19" cy="18" r="1.4" fill="${K}"/>
       <circle cx="24" cy="15" r="1.4" fill="${A}"/></g>`),
  // COMET tail — the ace ship: a dimpled ball head trailing a swept tail.
  comet: svg('gs-bico--scan', '0 0 28 28',
    `<g class="gs-bico__sweep2"><path d="M13 13 L2 24" stroke="${A}" stroke-width="3" stroke-linecap="round" opacity=".35"/>
       <path d="M15 11 L6 22" stroke="${B}" stroke-width="2" stroke-linecap="round" opacity=".5"/></g>
     <circle cx="18" cy="10" r="6" fill="none" stroke="${A}" stroke-width="1.6"/>
     <circle cx="16" cy="9" r=".9" fill="${K}"/><circle cx="20" cy="9" r=".9" fill="${K}"/>
     <circle cx="18" cy="12" r=".9" fill="${K}"/><circle cx="20" cy="12.5" r=".9" fill="${K}"/>`),
  // LIGHTNING radar — the chopper: a bolt striking through a scope.
  bolt: svg('gs-bico--scan', '0 0 28 28',
    `<circle cx="14" cy="14" r="11" fill="none" stroke="${B}" stroke-width="1.2" opacity=".55"/>
     <circle cx="14" cy="14" r="6.5" fill="none" stroke="${B}" stroke-width="1" opacity=".5"/>
     <path class="gs-bico__spark" d="M16 4 L9 15 L13 15 L11 24 L19 12 L14.5 12 Z" fill="${A}"/>`),
  // Infinity Ace's sensor array (reads its own --aur palette).
  infRadar: `<svg class="gs-bico gs-bico--scan" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="11" fill="none" stroke="var(--aur2)" stroke-width="1" opacity=".4"/>
      <circle cx="14" cy="14" r="7" fill="none" stroke="var(--aur2)" stroke-width="1" opacity=".55"/>
      <line x1="14" y1="3" x2="14" y2="25" stroke="var(--aur3)" stroke-width=".8" opacity=".35"/>
      <line x1="3" y1="14" x2="25" y2="14" stroke="var(--aur3)" stroke-width=".8" opacity=".35"/>
      <g class="gs-bico__sweep"><path d="M14 14 L14 2.5 A11.5 11.5 0 0 1 24 8 Z" fill="var(--aur1)" opacity=".3"/>
        <line x1="14" y1="14" x2="14" y2="2.5" stroke="var(--aur1)" stroke-width="1.4"/></g>
      <circle cx="14" cy="14" r="1.8" fill="var(--aur1)"/></svg>`,

  // —— EXITS —— (currentColor = the exit warm-red the CSS sets)
  // Airlock hatch — bolted ring + outward chevron (the sci-fi default).
  airlock: svg('gs-bico--exit', '0 0 28 28',
    `<circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="1.6"/>
     <circle cx="14" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1" opacity=".6" stroke-dasharray="1.6 3"/>
     <path d="M10 8.5 L15.5 14 L10 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
     <line x1="15" y1="14" x2="22" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
  // Car DOOR — the wagon's road-trip exit: a door panel with a handle + an outward arrow.
  cardoor: svg('gs-bico--exit', '0 0 28 28',
    `<rect x="6" y="5" width="12" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>
     <rect x="8.5" y="8" width="7" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/>
     <line x1="9" y1="16" x2="13" y2="16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
     <path d="M18 14 L24 14 M21.5 11 L24 14 L21.5 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  // Bulkhead WHEEL hatch — the hauler's heavy blast door with a lock wheel.
  bulkhead: svg('gs-bico--exit', '0 0 28 28',
    `<rect x="5" y="5" width="18" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
     <circle cx="14" cy="14" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
     <path d="M14 6 L14 22 M6 14 L22 14 M8.5 8.5 L19.5 19.5 M8.5 19.5 L19.5 8.5" stroke="currentColor" stroke-width="1.1" opacity=".7"/>`),
  // TELEPORT swirl — the saucer's beam-out.
  teleport: svg('gs-bico--exit', '0 0 28 28',
    `<path d="M8 8 Q14 4 20 8 Q24 12 20 16 Q16 19 12 16 Q9.5 14 12 11.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
     <path d="M9 23 L19 23 M11 20.5 L17 20.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>`),
  // Kill-SWITCH — the bike/chopper dismount: a power circle with a break.
  killswitch: svg('gs-bico--exit', '0 0 28 28',
    `<path d="M14 5 A10 10 0 1 1 8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
     <line x1="14" y1="4" x2="14" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`),
  // Shield GATE — the Asgardian hall: a rune shield with an outward chevron.
  shield: svg('gs-bico--exit', '0 0 28 28',
    `<path d="M14 4 L23 8 V15 Q23 21 14 24 Q5 21 5 15 V8 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
     <path d="M11 13 L15 13 M13 10 L13 18" stroke="currentColor" stroke-width="1.3" opacity=".7"/>
     <path d="M15 9 L19 14 L15 19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`),

  // —— FUEL —— (the foot of the vertical fuel pillar)
  plasma: svg('gs-bico--fuel', '0 0 20 24',
    `<rect x="6" y="1.5" width="8" height="2.6" rx="1" fill="${A}"/>
     <rect x="3.4" y="4" width="13.2" height="18" rx="3.2" fill="none" stroke="${A}" stroke-width="1.4"/>
     <path class="gs-bico__spark" d="M11.4 6.5 L7 13.6 L10 13.6 L8.6 19.5 L14 11.4 L10.6 11.4 Z" fill="${B}"/>`),
  jerrycan: svg('gs-bico--fuel', '0 0 20 24',
    `<rect x="3.5" y="4" width="12" height="17" rx="2" fill="none" stroke="${A}" stroke-width="1.5"/>
     <rect x="7" y="1.5" width="5" height="3" rx="1" fill="${A}"/>
     <path d="M15.5 8 L18 8 L18 15 L15.5 15" fill="none" stroke="${B}" stroke-width="1.4"/>
     <path class="gs-bico__spark" d="M9.5 8 L6.5 13.5 L9 13.5 L8 18 L12.5 11.5 L9.8 11.5 Z" fill="${B}"/>`),
  drum: svg('gs-bico--fuel', '0 0 20 24',
    `<rect x="3.5" y="3" width="13" height="19" rx="2" fill="none" stroke="${A}" stroke-width="1.5"/>
     <line x1="3.5" y1="9" x2="16.5" y2="9" stroke="${B}" stroke-width="1.2" opacity=".7"/>
     <line x1="3.5" y1="16" x2="16.5" y2="16" stroke="${B}" stroke-width="1.2" opacity=".7"/>
     <path class="gs-bico__spark" d="M11 6 L7.5 12.5 L10 12.5 L9 18.5 L13 11 L10.3 11 Z" fill="${B}"/>`),
  biocell: svg('gs-bico--fuel', '0 0 20 24',
    `<path d="M10 2 C4 8 4 14 10 22 C16 14 16 8 10 2 Z" fill="none" stroke="${A}" stroke-width="1.5"/>
     <circle class="gs-bico__spark" cx="9" cy="14" r="2.4" fill="${B}"/>
     <circle cx="12" cy="10" r="1.2" fill="${B}" opacity=".7"/>`),
  runecrystal: svg('gs-bico--fuel', '0 0 20 24',
    `<path d="M10 2 L16 9 L13 22 L7 22 L4 9 Z" fill="none" stroke="${A}" stroke-width="1.5" stroke-linejoin="round"/>
     <path class="gs-bico__spark" d="M10 6 L10 18 M6.5 11 L13.5 11" stroke="${B}" stroke-width="1.4"/>`),
  reactor: svg('gs-bico--fuel', '0 0 20 24',
    `<circle cx="10" cy="12" r="8" fill="none" stroke="${A}" stroke-width="1.5"/>
     <ellipse cx="10" cy="12" rx="8" ry="3" fill="none" stroke="${B}" stroke-width="1.1" opacity=".7"/>
     <ellipse cx="10" cy="12" rx="3" ry="8" fill="none" stroke="${B}" stroke-width="1.1" opacity=".7"/>
     <circle class="gs-bico__spark" cx="10" cy="12" r="2.2" fill="${A}"/>`),
  flametank: svg('gs-bico--fuel', '0 0 20 24',
    `<rect x="4" y="6" width="12" height="15" rx="3" fill="none" stroke="${A}" stroke-width="1.5"/>
     <rect x="7.5" y="3.5" width="5" height="3" rx="1" fill="${A}"/>
     <path class="gs-bico__spark" d="M10 9 C7 12 8 14 10 18 C12 14 13 12 10 9 Z" fill="${B}"/>`),
};

// ── the console DECK instrument kit (GS-fleet-dashboards) ──────────────────────────────────────────────
// A small library of physical cockpit instruments — a steering wheel, round gauges with sweeping needles,
// toggle-switch banks, blinking LED strips, faders, rotary knobs, an oscilloscope, rune stones. Each is a
// compact inline SVG reading the SAME livery props (A/B/K), so it recolours to whatever fleet flies it; the
// matching `.gs-bdeck*` CSS (index.html) sizes + animates them. A variant's `deck` is a `deckRow(...)` of one
// or two of these, dropped into the console's left gap — a proper instrument panel, not a lone glyph.
function svgd(cls: string, vb: string, body: string): string {
  return `<svg class="gs-bdeck ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;
}
/** Lay a cluster of instruments in a flex row inside the console's left-gap deck. */
function deckRow(...items: string[]): string {
  return `<span class="gs-bhud__deck" aria-hidden="true">${items.join('')}</span>`;
}

const DECK = {
  // A three-spoke STEERING WHEEL — the wagon's hero instrument. The rim/spokes rock gently (a road-trip
  // wheel held light in the hands); the chrome hub reads the ink colour.
  wheel: svgd('gs-bdeck--wheel', '0 0 40 40',
    `<g class="gs-bdeck__rock">
       <circle cx="20" cy="20" r="18" fill="none" stroke="${A}" stroke-width="3"/>
       <circle cx="20" cy="20" r="18" fill="none" stroke="${B}" stroke-width="1" opacity=".55"/>
       <circle cx="20" cy="20" r="14.5" fill="none" stroke="${B}" stroke-width="1" opacity=".4"/>
       <line x1="20" y1="24.5" x2="20" y2="37.5" stroke="${A}" stroke-width="3" stroke-linecap="round"/>
       <line x1="16" y1="17.4" x2="4.5" y2="11" stroke="${A}" stroke-width="3" stroke-linecap="round"/>
       <line x1="24" y1="17.4" x2="35.5" y2="11" stroke="${A}" stroke-width="3" stroke-linecap="round"/>
       <circle cx="20" cy="20" r="5" fill="none" stroke="${A}" stroke-width="2.4"/>
       <circle cx="20" cy="20" r="2.6" fill="${K}"/>
     </g>`),
  // A round GAUGE with a lower tick arc + a sweeping needle (reuses the shared needle motion). The generic
  // dashboard dial — speedo / temp / load, tinted by the livery.
  gauge: svgd('gs-bdeck--gauge', '0 0 28 28',
    `<circle cx="14" cy="14" r="12" fill="none" stroke="${B}" stroke-width="1.4" opacity=".6"/>
     <circle cx="14" cy="14" r="12" fill="none" stroke="${A}" stroke-width="1" opacity=".3"/>
     <g stroke="${A}" stroke-width="1" opacity=".55">
       <line x1="4.4" y1="20" x2="6.2" y2="18.8"/><line x1="5.2" y1="10.5" x2="7" y2="11.6"/>
       <line x1="14" y1="4.4" x2="14" y2="6.6"/>
       <line x1="22.8" y1="10.5" x2="21" y2="11.6"/><line x1="23.6" y1="20" x2="21.8" y2="18.8"/></g>
     <g class="gs-bico__needle"><line x1="14" y1="16" x2="20" y2="8.4" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/></g>
     <circle cx="14" cy="16" r="2" fill="${A}"/>`),
  // A REDLINE gauge — the racer/chopper tach: the same dial with a hot red danger arc up top.
  redline: svgd('gs-bdeck--gauge', '0 0 28 28',
    `<circle cx="14" cy="14" r="12" fill="none" stroke="${B}" stroke-width="1.4" opacity=".55"/>
     <path d="M17 3.6 A12 12 0 0 1 24.3 11" fill="none" stroke="#ff5a4a" stroke-width="2"/>
     <g stroke="${A}" stroke-width="1" opacity=".5">
       <line x1="4.4" y1="20" x2="6.2" y2="18.8"/><line x1="5.2" y1="10.5" x2="7" y2="11.6"/>
       <line x1="14" y1="4.4" x2="14" y2="6.6"/></g>
     <g class="gs-bico__needle"><line x1="14" y1="16" x2="20.5" y2="9" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/></g>
     <circle cx="14" cy="16" r="2" fill="${A}"/>`),
  // A TOGGLE-SWITCH bank — three little flip switches, the middle one thrown UP (lit). Static, reads as a
  // real control cluster.
  switches: svgd('gs-bdeck--switches', '0 0 34 28',
    `<g fill="none" stroke="${B}" stroke-width="1.2">
       <rect x="3" y="4" width="7" height="20" rx="3.5"/><rect x="13.5" y="4" width="7" height="20" rx="3.5"/><rect x="24" y="4" width="7" height="20" rx="3.5"/></g>
     <circle cx="6.5" cy="19" r="3" fill="${B}"/>
     <circle cx="17" cy="9" r="3" fill="${A}"/><circle cx="17" cy="9" r="3" fill="none" stroke="${A}" stroke-width="1" opacity=".6"/>
     <circle cx="27.5" cy="19" r="3" fill="${B}"/>`),
  // A blinking LED indicator STRIP — four status lamps that chase (the `gs-bdeck__leds` class blinks them).
  leds: svgd('gs-bdeck--leds', '0 0 32 12',
    `<g class="gs-bdeck__leds">
       <circle cx="4" cy="6" r="3" fill="${A}"/><circle cx="13.3" cy="6" r="3" fill="${K}"/>
       <circle cx="22.6" cy="6" r="3" fill="${A}"/><circle cx="31.9" cy="6" r="3" fill="${K}"/></g>`),
  // Vertical FADERS — two channel sliders with lit handles partway up (a mixing-desk feel).
  faders: svgd('gs-bdeck--faders', '0 0 26 30',
    `<g stroke="${B}" stroke-width="1.2"><line x1="7" y1="3" x2="7" y2="27"/><line x1="19" y1="3" x2="19" y2="27"/></g>
     <rect x="3.5" y="9" width="7" height="4.5" rx="1.5" fill="${A}"/>
     <rect x="15.5" y="16" width="7" height="4.5" rx="1.5" fill="${A}"/>`),
  // A rotary KNOB — a dial with a pointer + a ring of set-dots; turns slowly (`gs-bdeck__knob`).
  knob: svgd('gs-bdeck--knob', '0 0 28 28',
    `<circle cx="14" cy="14" r="11" fill="none" stroke="${B}" stroke-width="1" opacity=".5"/>
     <g class="gs-bdeck__knob">
       <circle cx="14" cy="14" r="7.5" fill="none" stroke="${A}" stroke-width="1.8"/>
       <line x1="14" y1="14" x2="14" y2="7" stroke="${A}" stroke-width="1.8" stroke-linecap="round"/></g>
     <g fill="${A}" opacity=".7"><circle cx="14" cy="2.6" r="1"/><circle cx="25.4" cy="14" r="1"/><circle cx="14" cy="25.4" r="1"/><circle cx="2.6" cy="14" r="1"/></g>`),
  // An OSCILLOSCOPE waveform — a glowing trace that drifts (`gs-bdeck__wave`), the neon/aurora bridges' monitor.
  wave: svgd('gs-bdeck--wave', '0 0 52 26',
    `<rect x="1" y="1" width="50" height="24" rx="3" fill="none" stroke="${B}" stroke-width="1" opacity=".5"/>
     <line x1="2" y1="13" x2="50" y2="13" stroke="${B}" stroke-width=".8" opacity=".35"/>
     <path class="gs-bdeck__wave" d="M2 13 L8 13 L11 6 L15 20 L19 9 L23 16 L27 13 L33 13 L36 7 L40 19 L44 11 L50 13" fill="none" stroke="${A}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`),
  // A spinning saucer LIGHT-RING dial — the Mothership's probe read-out.
  saucer: svgd('gs-bdeck--knob', '0 0 28 28',
    `<ellipse cx="14" cy="14" rx="12" ry="5" fill="none" stroke="${A}" stroke-width="1.4"/>
     <g class="gs-bdeck__leds"><circle cx="3" cy="14" r="1.5" fill="${A}"/><circle cx="8" cy="17.4" r="1.5" fill="${K}"/>
       <circle cx="14" cy="19" r="1.5" fill="${A}"/><circle cx="20" cy="17.4" r="1.5" fill="${K}"/><circle cx="25" cy="14" r="1.5" fill="${A}"/></g>
     <circle cx="14" cy="14" r="3" fill="none" stroke="${B}" stroke-width="1.2"/>`),
  // Three RUNE STONES — the Valkyrie war-bridge's seer tablets, each scribed with a bind-rune.
  runes: svgd('gs-bdeck--runes', '0 0 44 26',
    `<g fill="none" stroke="${A}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
       <rect x="2" y="4" width="11" height="18" rx="2" opacity=".5" stroke="${B}"/>
       <path d="M5 8 L5 18 M5 8 L10 12 L5 15"/>
       <rect x="16.5" y="4" width="11" height="18" rx="2" opacity=".5" stroke="${B}"/>
       <path d="M19.5 7 L19.5 19 M19.5 7 L24.5 11 M19.5 13 L24.5 19"/>
       <rect x="31" y="4" width="11" height="18" rx="2" opacity=".5" stroke="${B}"/>
       <path d="M36.5 7 L36.5 19 M33.5 9 L39.5 9"/></g>`),
  // A tight dimple RADAR — the Comet Rider's golf-ball tracker: a sweep over a dimpled disc.
  dimple: svgd('gs-bdeck--gauge', '0 0 28 28',
    `<circle cx="14" cy="14" r="12" fill="none" stroke="${A}" stroke-width="1.4"/>
     <g fill="${B}" opacity=".55"><circle cx="10" cy="10" r="1.1"/><circle cx="18" cy="10" r="1.1"/><circle cx="14" cy="14" r="1.1"/><circle cx="10" cy="18" r="1.1"/><circle cx="18" cy="18" r="1.1"/></g>
     <g class="gs-bico__sweep"><path d="M14 14 L14 2.5 A11.5 11.5 0 0 1 23 7 Z" fill="${A}" opacity=".28"/></g>`),
};

// ── per-variant bridge builders ──────────────────────────────────────────────────────────────────────
// Each names the bridge after the ACTUAL ship (`ship.name`) and dresses it with fitting instruments.
type ChromeBuilder = (ship: Ship) => HudChrome;

const BUILDERS: Record<string, ChromeBuilder> = {
  // The Infinity Ace (GS-infinity-hud) — a phoenix-aurora canopy. Its icons read the --aur palette; the
  // ∞ pennant frames the name, and a swept phoenix WING arcs over the crown (the `extra` ornament).
  infinity: (s) => ({
    scanLabel: 'SCAN',
    exitLabel: 'EJECT',
    scanIcon: ICON.infRadar,
    exitIcon: ICON.airlock,
    fuelIcon: ICON.plasma,
    deck: deckRow(DECK.wave, DECK.leds),
    frame: ornaments(
      titlePlate(s.name, '∞', '∞'),
      `<span class="gs-bhud__wing gs-bhud__wing--l" aria-hidden="true"></span>
       <span class="gs-bhud__wing gs-bhud__wing--r" aria-hidden="true"></span>
       <span class="gs-bhud__canopy" aria-hidden="true"></span>`,
    ),
  }),
  // The Wagon line — a warm woody road-trip dashboard: compass, car-door exit, jerry can, fuzzy dice.
  wagon: (s) => ({
    scanLabel: 'MAP',
    exitLabel: 'DOCK',
    scanIcon: ICON.compass,
    exitIcon: ICON.cardoor,
    fuelIcon: ICON.jerrycan,
    deck: deckRow(DECK.wheel, DECK.gauge),
    frame: ornaments(
      titlePlate(s.name, '🧭', '🎲'),
      `<span class="gs-bhud__dice" aria-hidden="true"></span>`,
    ),
  }),
  // The Racer set — a redline speeder cockpit: tachometer, eject hatch, racing gauge, checkered stripe.
  racer: (s) => ({
    scanLabel: 'RADAR',
    exitLabel: 'PIT',
    scanIcon: ICON.tacho,
    exitIcon: ICON.airlock,
    fuelIcon: ICON.drum,
    deck: deckRow(DECK.redline, DECK.switches),
    frame: ornaments(
      titlePlate(s.name, '»', '«'),
      `<span class="gs-bhud__stripe" aria-hidden="true"></span>`,
    ),
  }),
  // The Hauler set — an industrial freighter bridge: rugged dish, bulkhead hatch, fuel drum, caution stripes.
  hauler: (s) => ({
    scanLabel: 'SCAN',
    exitLabel: 'DOCK',
    scanIcon: ICON.dish,
    exitIcon: ICON.bulkhead,
    fuelIcon: ICON.drum,
    deck: deckRow(DECK.switches, DECK.gauge),
    frame: ornaments(titlePlate(s.name, '▤', '▤')),
  }),
  // The Exotic saucer — an alien probe bridge: orbital scanner, teleport exit, bio-cell, a floating ring.
  exotic: (s) => ({
    scanLabel: 'PROBE',
    exitLabel: 'BEAM',
    scanIcon: ICON.orbit,
    exitIcon: ICON.teleport,
    fuelIcon: ICON.biocell,
    deck: deckRow(DECK.knob, DECK.faders),
    frame: ornaments(
      titlePlate(s.name, '◌', '◌'),
      `<span class="gs-bhud__ring" aria-hidden="true"></span>`,
    ),
  }),
  // The Speeder bike — a neon night-ride HUD: speedometer, kill-switch, nitro cell, scanline glow.
  speeder: (s) => ({
    scanLabel: 'RADAR',
    exitLabel: 'STOP',
    scanIcon: ICON.speedo,
    exitIcon: ICON.killswitch,
    fuelIcon: ICON.flametank,
    deck: deckRow(DECK.wave, DECK.leds),
    frame: ornaments(titlePlate(s.name, '⟫', '⟪')),
  }),
  // The Valkyrie Pegasus — an Asgardian runic war-bridge: rune scanner, shield gate, rune crystal, wings.
  valkyrie: (s) => ({
    scanLabel: 'SEER',
    exitLabel: 'HALL',
    scanIcon: ICON.rune,
    exitIcon: ICON.shield,
    fuelIcon: ICON.runecrystal,
    deck: deckRow(DECK.runes, DECK.gauge),
    frame: ornaments(
      titlePlate(s.name, 'ᚨ', 'ᚱ'),
      `<span class="gs-bhud__wing gs-bhud__wing--l gs-bhud__wing--bronze" aria-hidden="true"></span>
       <span class="gs-bhud__wing gs-bhud__wing--r gs-bhud__wing--bronze" aria-hidden="true"></span>`,
    ),
  }),
  // The Mothership — a grand flying-saucer bridge: spinning light-ring scanner, beam-out, reactor core.
  mythic: (s) => ({
    scanLabel: 'SCAN',
    exitLabel: 'BEAM',
    scanIcon: ICON.ufoRing,
    exitIcon: ICON.teleport,
    fuelIcon: ICON.reactor,
    deck: deckRow(DECK.saucer, DECK.gauge),
    frame: ornaments(
      titlePlate(s.name, '⏣', '⏣'),
      `<span class="gs-bhud__ring gs-bhud__ring--saucer" aria-hidden="true"></span>`,
    ),
  }),
  // The Comet Rider (secret ace ship) — a dimpled golf-ball comet cockpit: comet scanner, launch, ice cell.
  comet: (s) => ({
    scanLabel: 'TRACK',
    exitLabel: 'EXIT',
    scanIcon: ICON.comet,
    exitIcon: ICON.airlock,
    fuelIcon: ICON.plasma,
    deck: deckRow(DECK.dimple, DECK.faders),
    frame: ornaments(
      titlePlate(s.name, '☄', '☄'),
      `<span class="gs-bhud__tail gs-bhud__tail--l" aria-hidden="true"></span>
       <span class="gs-bhud__tail gs-bhud__tail--r" aria-hidden="true"></span>`,
    ),
  }),
  // The Thunderbolt chopper — a hot-rod bridge wreathed in flame + forked lightning: bolt radar, kill switch.
  chopper: (s) => ({
    scanLabel: 'SCAN',
    exitLabel: 'KILL',
    scanIcon: ICON.bolt,
    exitIcon: ICON.killswitch,
    fuelIcon: ICON.flametank,
    deck: deckRow(DECK.redline, DECK.knob),
    frame: ornaments(
      titlePlate(s.name, '⚡', '⚡'),
      `<span class="gs-bhud__flames" aria-hidden="true"></span>`,
    ),
  }),
};

/** The bespoke chrome for a HUD variant + the ship flying it (so the plate self-labels), or `null` when
 *  the livery uses the classic emoji chrome (an unknown ship → the standard cyan console, byte-identical). */
export function hudChromeFor(variant: string, ship: Ship | undefined): HudChrome | null {
  const build = BUILDERS[variant];
  if (!build || !ship) return null;
  return build(ship);
}

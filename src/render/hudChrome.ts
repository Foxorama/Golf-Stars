/**
 * Bridge-HUD CHROME per ship livery (GS-infinity-hud) — the second half of the journey-map HUD theming.
 *
 * `hudTheme.ts` recolours the frame (four colours + a `variant` class); this module gives a livery a
 * FULL bespoke reskin: swap the console's icons + labels and inject extra frame ORNAMENTS (a title
 * plate, side rails, corner nodes) so a hero ship reads as its own command bridge, not a tinted default.
 *
 * It's table + resolver like everything else: `hudChromeFor(variant)` returns a `HudChrome` for a livery
 * that has one, else `null` — and `null` means the travel screen uses the classic emoji chrome (📡 / 🚪 /
 * ⛽) with no ornaments, so EVERY other ship is byte-identical. The visual detail lives in the matching
 * `.gs-bhud--<variant>` CSS block (index.html); this module only supplies the markup those rules dress.
 *
 * Pure strings → HTML (no DOM, no rng, no sim coupling). The icons are inline SVG whose `fill`/`stroke`
 * read the `--aur*` / `currentColor` custom properties the variant's CSS defines, so they inherit the
 * livery palette for free. All ornament markup is decorative (`aria-hidden`) and inherits the frame's
 * `pointer-events:none` — only the real console BUTTONS catch touches (the CLAUDE.md bridge invariant).
 */

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
  /** Decorative frame ornaments injected inside `.gs-bhud` (title plate, side rails, corner nodes).
   *  All `aria-hidden` + pointer-events:none so map taps still pass through. */
  frame: string;
}

/**
 * The INFINITY ACE bridge (GS-infinity-hud) — the hole-150 Unending grail, dressed to the nines: a
 * sensor-sweep scanner, an airlock hatch for the exit, a plasma-cell fuel glyph, plus a crowned title
 * plate, aurora side rails, and corner nodes framing the viewscreen. Icons read the `--aur*` palette the
 * `.gs-bhud--infinity` CSS defines. Every stroke uses `var(--aur*)` / `currentColor` so it's live-themed.
 */
const INFINITY_CHROME: HudChrome = {
  scanLabel: 'SCAN',
  exitLabel: 'EJECT',
  // Sensor array: concentric range rings + crosshair + a rotating sweep wedge (animated in CSS).
  scanIcon: `<svg class="gs-bico gs-bico--scan" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="11" fill="none" stroke="var(--aur2)" stroke-width="1" opacity=".4"/>
    <circle cx="14" cy="14" r="7" fill="none" stroke="var(--aur2)" stroke-width="1" opacity=".55"/>
    <line x1="14" y1="3" x2="14" y2="25" stroke="var(--aur3)" stroke-width=".8" opacity=".35"/>
    <line x1="3" y1="14" x2="25" y2="14" stroke="var(--aur3)" stroke-width=".8" opacity=".35"/>
    <g class="gs-bico__sweep">
      <path d="M14 14 L14 2.5 A11.5 11.5 0 0 1 24 8 Z" fill="var(--aur1)" opacity=".3"/>
      <line x1="14" y1="14" x2="14" y2="2.5" stroke="var(--aur1)" stroke-width="1.4"/>
    </g>
    <circle cx="14" cy="14" r="1.8" fill="var(--aur1)"/>
  </svg>`,
  // Airlock hatch: bolted ring + an outward chevron (leaving the ship) — currentColor = the exit warm-red.
  exitIcon: `<svg class="gs-bico gs-bico--exit" viewBox="0 0 28 28" aria-hidden="true">
    <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="14" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1" opacity=".6" stroke-dasharray="1.6 3"/>
    <path d="M10 8.5 L15.5 14 L10 19.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="15" y1="14" x2="22" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,
  // Plasma cell: a capped canister with a lightning bolt core (the ship's aquamarine exhaust).
  fuelIcon: `<svg class="gs-bico gs-bico--fuel" viewBox="0 0 20 24" aria-hidden="true">
    <rect x="6" y="1.5" width="8" height="2.6" rx="1" fill="var(--aur1)"/>
    <rect x="3.4" y="4" width="13.2" height="18" rx="3.2" fill="none" stroke="var(--aur1)" stroke-width="1.4"/>
    <path class="gs-bico__spark" d="M11.4 6.5 L7 13.6 L10 13.6 L8.6 19.5 L14 11.4 L10.6 11.4 Z" fill="var(--aur3)"/>
  </svg>`,
  // Frame ornaments: a crowned title plate (∞ + ship name), aurora side rails, four corner nodes.
  frame: `<div class="gs-bhud__titleplate" aria-hidden="true">
      <span class="gs-bhud__titlewing gs-bhud__titlewing--l"></span>
      <span class="gs-bhud__titletext">∞&nbsp;&nbsp;INFINITY&nbsp;ACE&nbsp;&nbsp;∞</span>
      <span class="gs-bhud__titlewing gs-bhud__titlewing--r"></span>
    </div>
    <span class="gs-bhud__rail gs-bhud__rail--l" aria-hidden="true"></span>
    <span class="gs-bhud__rail gs-bhud__rail--r" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--tl" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--tr" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--bl" aria-hidden="true"></span>
    <span class="gs-bhud__node gs-bhud__node--br" aria-hidden="true"></span>`,
};

const HUD_CHROME: Record<string, HudChrome> = {
  infinity: INFINITY_CHROME,
};

/** The bespoke chrome for a HUD variant, or `null` when the livery uses the classic emoji chrome. */
export function hudChromeFor(variant: string): HudChrome | null {
  return HUD_CHROME[variant] ?? null;
}

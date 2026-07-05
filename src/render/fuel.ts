/**
 * Ship fuel gauge (GS-fuel-2) — the ONE way fuel is drawn everywhere: a row of spaceship fuel
 * CELLS (one per unit of tank capacity) that reads at a glance on a phone, in place of the old
 * easy-to-miss "⛽ 8" text. Mini variant rides the run header on every screen; the full variant
 * anchors the journey screen's ship strip and the Fuel Depot.
 *
 * Pure string → HTML (no DOM, no state, no rng) so it can be unit-tested and embedded anywhere.
 * Styling lives in the design-token CSS (`.gs-fuelbar` in index.html), per the UI-layer rule.
 * Colour tells the story: cyan when comfortable, amber under half, danger red on the last cells.
 * A legacy save resumed ABOVE today's capacity shows a `+n` reserve chip rather than a longer bar.
 */

/** Gauge colour for a fill fraction — cyan → amber → danger red as the tank drains. */
export function fuelColour(fuel: number, capacity: number): string {
  const frac = capacity > 0 ? fuel / capacity : 0;
  return frac > 0.5 ? '#4fd0e0' : frac > 0.25 ? 'var(--gs-warn)' : 'var(--gs-danger)';
}

export interface FuelGaugeOpts {
  /** Compact variant for the run header strip. */
  mini?: boolean;
  /** Hide the numeric readout (the cells alone carry it, e.g. inside the depot panel). */
  bare?: boolean;
}

/** The segmented tank gauge: `fuel` lit cells of `capacity`. */
export function fuelGaugeHTML(fuel: number, capacity: number, opts: FuelGaugeOpts = {}): string {
  const cap = Math.max(1, Math.floor(capacity));
  const lit = Math.max(0, Math.min(cap, Math.floor(fuel)));
  const over = Math.max(0, Math.floor(fuel) - cap);
  const col = fuelColour(fuel, cap);
  const cells = Array.from(
    { length: cap },
    (_, i) => `<span class="gs-fuelbar__cell${i < lit ? ' gs-fuelbar__cell--lit' : ''}"></span>`,
  ).join('');
  const overChip = over > 0 ? `<span class="gs-fuelbar__over">+${over}</span>` : '';
  const label = opts.bare ? '' : `<b class="gs-fuelbar__n" style="color:${col};">${Math.max(0, Math.floor(fuel))}</b>`;
  return `<span class="gs-fuelbar${opts.mini ? ' gs-fuelbar--mini' : ''}" style="--fuel-col:${col};" role="img" aria-label="Fuel ${Math.max(0, Math.floor(fuel))} of ${cap}">⛽<span class="gs-fuelbar__cells">${cells}</span>${overChip}${label}</span>`;
}

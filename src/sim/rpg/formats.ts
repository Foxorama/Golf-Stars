/**
 * Run formats — content-as-data shapes for a run (GS-9).
 *
 * This is the lever for the "what wraps the golf" question: the SAME run machinery plays
 * a flat roguelite (every stop a 6-hole course) or an escalating ladder (3 par-3s → 6 →
 * 9 → 18…). A format is just a list of per-stop specs; nothing in the engine changes.
 *
 * Pure data. `flat` reproduces the original fixed 6-hole behaviour exactly, so adding
 * formats regresses nothing.
 */

export interface StopSpec {
  holes: number;
  /** Cap the par of every hole (3 = all par-3s). Omit for the normal 3/4/5 mix. */
  parCap?: 3 | 4 | 5;
  /** Short label for the UI. */
  label: string;
}

export interface RunFormat {
  id: string;
  name: string;
  blurb: string;
  /** Per-stop specs; stops beyond the list reuse the last (the run ends by cut, not length). */
  stops: StopSpec[];
}

export const FORMATS: Record<string, RunFormat> = {
  flat: {
    id: 'flat',
    name: 'Roguelite',
    blurb: 'Every stop is a 6-hole course. Beat the cut, upgrade, travel deeper.',
    stops: [{ holes: 6, label: '6 holes' }],
  },
  ladder: {
    id: 'ladder',
    name: 'The Ascent',
    blurb: 'Start tiny and climb: 3 par-3s → a short 6 → a front 9 → a full 9 → 18.',
    stops: [
      { holes: 3, parCap: 3, label: '3 par-3s' },
      { holes: 6, parCap: 4, label: 'short 6' },
      { holes: 9, label: 'front 9' },
      { holes: 9, label: 'full 9' },
      { holes: 18, label: 'the 18' },
    ],
  },
};

export const DEFAULT_FORMAT = 'flat';

export function getFormat(id: string | undefined): RunFormat {
  return (id && FORMATS[id]) || FORMATS[DEFAULT_FORMAT]!;
}

/** The spec for a given stop; stops past the list reuse the last one. */
export function stopSpecFor(format: RunFormat, stopIndex: number): StopSpec {
  return format.stops[Math.min(stopIndex, format.stops.length - 1)]!;
}

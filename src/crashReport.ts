/**
 * Crash reports (GS-crash-diagnostics) — PURE builder, no DOM, no clock, no storage.
 *
 * WHY THIS EXISTS INSTEAD OF AN ANALYTICS SDK. The sim is pure, deterministic and seeded, so a
 * **seed plus a build number IS the bug report**: it replays the exact failing run in a vitest
 * file. A crash-reporting service would hand back a minified stack trace against a single-line
 * bundle — strictly less useful — in exchange for shipping a third-party collector, a data
 * processor, and the end of "this game collects nothing" (see PRIVACY.md). So the report is
 * BUILT here, SHOWN to the player, and copied only if they choose to send it. Nothing is
 * transmitted by the game, ever.
 *
 * The output is written to be pasted into an itch.io comment: plain text, short enough to survive
 * a comment box, and readable by a human rather than a parser. Deliberately capped — a minified
 * stack can run to tens of kilobytes, and a report nobody can paste is a report nobody sends.
 *
 * PURE by construction: the timestamp is passed IN rather than read from the clock, so the tests
 * can assert on an exact string and `Date.now()` stays out of a code path that ought to be
 * reproducible.
 */

/** What the player was doing. Everything optional — a crash on the title screen has no run. */
export interface CrashRun {
  /** The run seed. THE field that matters: it replays the run. */
  seed?: number | string;
  /** Which hole of the current course, 1-based as the player sees it. */
  hole?: number;
  /** Voyage stop index, where the mode has one. */
  stop?: number;
  /** Format/mode id — voyage, endless, strokeplay, story… */
  mode?: string;
  /** Course seed, which pins the generated hole independently of the run. */
  courseSeed?: number;
}

/** Device shape. No identifiers — this is the same information any web server sees in a request,
 *  plus the two accessibility settings that most often explain a layout fault. */
export interface CrashDevice {
  ua?: string;
  viewport?: string;
  uiScale?: number;
  reducedMotion?: boolean;
}

export interface CrashContext {
  version: string;
  message: string;
  stack?: string;
  /** `source:line:col`, which is the only thing that locates a throw inside a minified bundle. */
  origin?: string;
  run?: CrashRun;
  device?: CrashDevice;
  /** How many times this same error fired. A rAF-loop fault fires 60×/second; the count is the
   *  signal, and repeating the report 60 times is not. */
  repeats?: number;
  /** ISO timestamp, passed in so this module stays pure. */
  at?: string;
}

/** Total cap. An itch comment box is the target, and a wall of minified frames is unpastable. */
const MAX_REPORT = 1400;
/** Stack frames kept. The top few locate the fault; the rest is the framework's own plumbing. */
const MAX_FRAMES = 6;

/** Collapse a stack to its most useful frames, trimming the noise a bundler leaves behind. */
function trimStack(stack: string, maxFrames = MAX_FRAMES): string {
  const lines = stack
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const kept = lines.slice(0, maxFrames);
  const dropped = lines.length - kept.length;
  // Each frame is capped too: a minified frame can be one enormous column offset on a 2MB line.
  const capped = kept.map((l) => (l.length > 160 ? `${l.slice(0, 157)}…` : l));
  return dropped > 0 ? `${capped.join('\n')}\n… +${dropped} more frame${dropped === 1 ? '' : 's'}` : capped.join('\n');
}

/**
 * Build the text a player copies into a bug report.
 *
 * Ordered by what a maintainer reads first: what broke, then WHERE IN THE GAME (the seed — the
 * reproducible part), then the device, then the stack. A reader who stops after three lines has
 * still got the thing that reproduces it.
 */
export function buildCrashReport(c: CrashContext): string {
  const lines: string[] = [];

  lines.push(`The Far Carry v${c.version}`);
  if (c.at) lines.push(`when: ${c.at}`);

  const r = c.run;
  if (r && (r.seed !== undefined || r.hole !== undefined || r.mode)) {
    const bits: string[] = [];
    // Seed first, always: it is the whole reason this beats a stack trace.
    if (r.seed !== undefined) bits.push(`seed ${r.seed}`);
    if (r.courseSeed !== undefined) bits.push(`course ${r.courseSeed}`);
    if (r.mode) bits.push(`mode ${r.mode}`);
    if (r.stop !== undefined) bits.push(`stop ${r.stop}`);
    if (r.hole !== undefined) bits.push(`hole ${r.hole}`);
    lines.push(`where: ${bits.join(' · ')}`);
  } else {
    lines.push('where: no run in progress');
  }

  const d = c.device;
  if (d) {
    const bits: string[] = [];
    if (d.viewport) bits.push(d.viewport);
    if (d.uiScale !== undefined && d.uiScale !== 1) bits.push(`ui ${d.uiScale}×`);
    if (d.reducedMotion) bits.push('reduced-motion');
    if (bits.length) lines.push(`device: ${bits.join(' · ')}`);
    if (d.ua) lines.push(`ua: ${d.ua}`);
  }

  if (c.repeats && c.repeats > 1) lines.push(`repeated: ${c.repeats}×`);

  lines.push('');
  lines.push(`error: ${c.message || 'unknown error'}`);
  if (c.origin) lines.push(`  at ${c.origin}`);
  if (c.stack) lines.push(trimStack(c.stack));

  const out = lines.join('\n');
  return out.length > MAX_REPORT ? `${out.slice(0, MAX_REPORT - 1)}…` : out;
}

/**
 * A stable key for "the same error again".
 *
 * Message plus origin, deliberately WITHOUT the stack: the same fault thrown from a rAF loop
 * produces frames that differ run to run, and keying on those would defeat the deduplication that
 * stops a 60fps failure from spamming 60 toasts a second.
 */
export function crashKey(message: string, origin?: string): string {
  return `${message}@@${origin ?? ''}`;
}

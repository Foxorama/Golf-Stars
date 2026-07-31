/**
 * Post-boot crash diagnostics (GS-crash-diagnostics) — the DOM half of `src/crashReport.ts`.
 *
 * THE GAP THIS FILLS. index.html's boot watchdog already catches `error`, `unhandledrejection` and
 * `window.onerror`, and paints a real diagnostic — but only while `#app` is not yet `data-booted`.
 * Once the game is running, those handlers still fire and still record `window.__gsErr`, and the
 * player sees NOTHING. A fault on hole 7 was therefore invisible to them and unreportable to us.
 *
 * WHY A TOAST, NOT THE WATCHDOG'S FULL-SCREEN CARD. Most JS faults here are non-fatal — the render
 * layer is heavily try/caught by design, and a cosmetic glitch that recovers must not end a run
 * that might be three hundred holes deep. The toast reports without interrupting; the run carries on.
 *
 * WHY IT DOES NOT CLOBBER THE WATCHDOG. `window.onerror` is a SINGLE slot and the watchdog owns it —
 * assigning our own would delete the one handler that yields `source:line:col` for an import-time
 * throw, i.e. the exact failure class the watchdog exists for. `addEventListener` STACKS, so we
 * listen alongside it and the boot path is untouched.
 *
 * NOTHING IS TRANSMITTED. The report is built locally, shown locally, and copied only when the
 * player taps Copy. See PRIVACY.md — this is the whole reason the game can still say it collects
 * nothing while having better bug reports than an analytics SDK would give it.
 */

import { buildCrashReport, crashKey, type CrashContext, type CrashRun } from '../crashReport';
import { APP_VERSION } from '../brand';
import { rootZoom } from '../render/pixelRatio';

/** The persistent host in index.html — OUTSIDE `#app`, which `render()` overwrites wholesale. */
const HOST_ID = 'gs-crash';

/** How long the toast sits before fading. Long enough to read and tap, short enough not to nag. */
const TOAST_MS = 10_000;

/** Distinct faults reported per session. A broken build can throw for many reasons; the first few
 *  are informative and the twentieth is noise the player should not have to keep dismissing. */
const MAX_DISTINCT = 3;

/** Supplies the run context at the moment of the fault. A callback, not a value: the app's state
 *  object is replaced on every action, so a captured reference would report a stale hole. */
export type CrashRunSource = () => CrashRun | undefined;

const seen = new Map<string, number>();
let installed = false;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Device shape — the same facts any web server sees, plus the two a11y settings that most often
 *  explain a layout fault. No identifiers, nothing persistent, nothing personal. */
function device(): CrashContext['device'] {
  try {
    // The RESOLVED zoom, not `--gs-uiscale` — since GS-ui-display-scale that token is a `calc()` of
    // the reader's half and the display's, and an unregistered custom property computes to its
    // token stream, so reading it back gives the literal string `calc(1 * 1.28)` and `Number()` NaN.
    // `rootZoom()` is what the browser actually applied, which is the truthful number for a report.
    return {
      ua: navigator.userAgent,
      viewport: `${window.innerWidth}×${window.innerHeight}`,
      uiScale: rootZoom(),
      reducedMotion: document.documentElement.classList.contains('gs-reduced'),
    };
  } catch {
    return undefined;
  }
}

function host(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(HOST_ID);
}

/** Take the toast down and stop its timer. */
function dismiss(): void {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = undefined;
  const el = host();
  if (el) el.innerHTML = '';
}

/**
 * Put the report on the clipboard, falling back to a selectable textarea.
 *
 * `navigator.clipboard` rejects outside a secure context and in some WebViews, and a Copy button
 * that silently does nothing is worse than no button — so a failure SHOWS the text instead and
 * lets the player select it by hand. Never claim a success we cannot verify (the same rule
 * `saveTransfer` follows for its download-vs-clipboard split).
 */
async function copyReport(report: string, btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(report);
    btn.textContent = '✓ Copied';
    return;
  } catch {
    /* fall through to the manual route */
  }
  const el = host();
  if (!el) return;
  const box = document.createElement('textarea');
  box.className = 'gs-crash__text';
  box.readOnly = true;
  box.value = report;
  box.setAttribute('aria-label', 'Crash report — select and copy this text');
  el.querySelector('.gs-crash__bar')?.appendChild(box);
  box.focus();
  box.select();
  btn.textContent = 'Select & copy ↑';
}

/** Draw (or redraw) the toast for a fault. */
function show(report: string): void {
  const el = host();
  if (!el) return;

  el.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'gs-crash__bar';
  // `alert` rather than `status`: unlike a shot resolving, this IS an interruption worth making.
  bar.setAttribute('role', 'alert');

  const msg = document.createElement('span');
  msg.className = 'gs-crash__msg';
  msg.textContent = '⚠ Something went wrong.';

  // Real <button>s, so keyboard and screen-reader activation come for free rather than needing
  // the `wireRoleButtonKeys` treatment a div would (GS-a11y-focus).
  const copy = document.createElement('button');
  copy.className = 'gs-crash__btn';
  copy.type = 'button';
  copy.textContent = 'Copy details';
  copy.addEventListener('click', () => {
    if (hideTimer) clearTimeout(hideTimer); // they engaged — stop the clock
    hideTimer = undefined;
    void copyReport(report, copy);
  });

  const close = document.createElement('button');
  close.className = 'gs-crash__btn gs-crash__btn--x';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '✕';
  close.addEventListener('click', dismiss);

  bar.append(msg, copy, close);
  el.appendChild(bar);

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(dismiss, TOAST_MS);
}

/** Record a fault and surface it, deduplicated. Exported for the browser smoke test. */
export function reportCrash(
  message: string,
  origin: string | undefined,
  stack: string | undefined,
  runOf: CrashRunSource,
): void {
  const key = crashKey(message, origin);
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);

  // A fault inside a rAF loop fires ~60×/second. Show it ONCE; the repeat count carries the rest.
  // Re-showing on every tick would make the toast unclickable and the report meaningless.
  if (count > 1) return;
  if (seen.size > MAX_DISTINCT) return;

  let run: CrashRun | undefined;
  try {
    run = runOf();
  } catch {
    /* the state read must never itself break the crash handler */
  }

  const report = buildCrashReport({
    version: APP_VERSION,
    message,
    stack,
    origin,
    run,
    device: device(),
    repeats: count,
    at: new Date().toISOString(),
  });

  try {
    show(report);
  } catch {
    /* a diagnostic that throws is worse than one that stays quiet */
  }
}

/**
 * Install the post-boot handlers. Idempotent — a second call is a no-op rather than a second set
 * of listeners reporting every fault twice.
 */
export function installCrashDiagnostics(runOf: CrashRunSource): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (e: ErrorEvent) => {
    // Resource-load failures have no message but do carry a target. Nothing external is loaded in
    // the single-file build, so this is mostly future-proofing — and it costs one branch.
    const target = e.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (target && target !== (window as unknown as EventTarget) && (target.src || target.href)) {
      reportCrash(`failed to load resource: ${target.src || target.href}`, undefined, undefined, runOf);
      return;
    }
    const origin = e.filename ? `${e.filename}:${e.lineno ?? '?'}:${e.colno ?? '?'}` : undefined;
    reportCrash(e.message || 'unknown error', origin, e.error?.stack, runOf);
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string } | string | undefined;
    const message = typeof r === 'string' ? r : r?.message || 'unhandled promise rejection';
    reportCrash(message, undefined, typeof r === 'string' ? undefined : r?.stack, runOf);
  });
}

/** Test seam: forget everything reported so far. Never called by the game. */
export function resetCrashDiagnosticsForTest(): void {
  seen.clear();
  installed = false;
  dismiss();
}

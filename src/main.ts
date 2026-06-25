/**
 * Entry point. Static import + direct call (single-file flattens dynamic imports, so a
 * dynamic import buys no error isolation). Breadcrumbs mark how far evaluation/boot got,
 * and a try/catch surfaces any boot fault on screen.
 *
 * Eval order in the bundle: app.ts's imports → app.ts body (sets __gsStage 'app-top') →
 * this module (sets 'main-entry') → start()/boot (sets 'boot:start'). So the LAST
 * breadcrumb in a failure report says exactly which phase died.
 */
import { start } from './app';

function showFatal(err: unknown): void {
  const el = document.getElementById('app');
  if (!el) return;
  el.setAttribute('data-booted', '1'); // stop the watchdog overwriting this
  const msg = (err && ((err as Error).stack || (err as Error).message)) || String(err);
  el.innerHTML =
    '<pre style="color:#ff8a8a;white-space:pre-wrap;padding:16px;margin:0;font:12px/1.5 monospace;background:#0b0d12;min-height:100vh;">⛳ Golf Stars — boot error:\n' +
    String(msg) +
    '</pre>';
}

(window as unknown as { __gsStage?: string }).__gsStage = 'main-entry';
try {
  start();
} catch (err) {
  showFatal(err);
}

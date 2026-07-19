/**
 * The Pro-Shop ARRIVAL beat (GS-story-shop-arrival) — a short, skippable "you've touched down" cinematic
 * shown the first time (per session) the player reaches a world's Pro Shop. Your ship descends onto the
 * world on a landing beam, a "Arriving at <World> · Pro Shop" title forms, then it dissolves to reveal the
 * shop beneath. Makes reaching a world's shop feel like a place you travelled to, not a screen that appears.
 *
 * A self-contained DOM+CSS overlay (its OWN `.gs-arr*` prefix, injected `<style>`), NOT the sim and NOT the
 * reducer — a pure feel layer mounted from app.ts over the already-rendered shop. Everything is guarded so
 * `onDone` always fires (a fault can never strand the player), and reduced-motion resolves instantly.
 */

import { shipCardSVG } from './shipArt';
import { spaceLookFor, roughBaseFor } from './palette';
import type { BiomeArchetype } from '../sim/course/themes';

export interface ShopArrivalHandle {
  destroy(): void;
}

const HOLD_MS = 2100; // total beat length before it auto-dissolves

/** Mount the arrival beat over the current screen. Returns a handle; `onDone` fires once, on finish/skip. */
export function mountShopArrival(opts: {
  archetype: BiomeArchetype;
  worldName: string;
  shipId: string | undefined;
  onDone?: () => void;
}): ShopArrivalHandle {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  let finished = false;
  let timer = 0;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    overlay.removeEventListener('click', finish);
    // fade the overlay out, then remove
    overlay.classList.add('gs-arr--out');
    window.setTimeout(() => overlay.remove(), 360);
    opts.onDone?.();
  };

  ensureArrivalStyle();

  const sky = spaceLookFor(opts.archetype);
  const ground = roughBaseFor(opts.archetype);
  const ground2 = roughBaseFor(opts.archetype, 1.35);

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-shoparrival', '1');
  overlay.className = 'gs-arr';
  overlay.style.setProperty('--arr-base', sky.base);
  overlay.style.setProperty('--arr-neb', sky.nebula);
  overlay.style.setProperty('--arr-edge', sky.edge);
  overlay.style.setProperty('--arr-ground', ground);
  overlay.style.setProperty('--arr-ground2', ground2);

  overlay.innerHTML = `
    <div class="gs-arr__stars" aria-hidden="true"></div>
    <div class="gs-arr__planet" aria-hidden="true"></div>
    <div class="gs-arr__beam" aria-hidden="true"></div>
    <div class="gs-arr__ship" aria-hidden="true">${shipCardSVG(opts.shipId, 132, 80)}</div>
    <div class="gs-arr__cap">
      <div class="gs-arr__kick">APPROACHING</div>
      <div class="gs-arr__world">${escapeHTML(opts.worldName)}</div>
      <div class="gs-arr__shop">⛳ PRO SHOP</div>
    </div>
    <div class="gs-arr__skip">Tap to skip ▸</div>`;

  try {
    document.body.appendChild(overlay);
  } catch {
    opts.onDone?.();
    return { destroy: () => {} };
  }

  if (reduce) {
    // No motion: reveal the shop immediately (the beat is decorative).
    overlay.remove();
    opts.onDone?.();
    return { destroy: () => {} };
  }

  overlay.addEventListener('click', finish);
  timer = window.setTimeout(finish, HOLD_MS);
  return { destroy: finish };
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** Inject the beat's scoped CSS once. Own `.gs-arr*` prefix — never the play HUD's `.gs-hud`. */
function ensureArrivalStyle(): void {
  if (document.getElementById('gs-arr-style')) return;
  const st = document.createElement('style');
  st.id = 'gs-arr-style';
  st.textContent = `
    .gs-arr{position:fixed;inset:0;z-index:9998;overflow:hidden;cursor:pointer;
      background:radial-gradient(120% 90% at 50% 12%, var(--arr-neb), transparent 60%), var(--arr-base,#05070d);
      animation:gs-arr-in .3s ease both;}
    .gs-arr.gs-arr--out{animation:gs-arr-out .36s ease both;}
    @keyframes gs-arr-in{from{opacity:0;}to{opacity:1;}}
    @keyframes gs-arr-out{from{opacity:1;}to{opacity:0;}}
    .gs-arr__stars{position:absolute;inset:0;background-image:
      radial-gradient(1.4px 1.4px at 20% 30%, #fff9, transparent),
      radial-gradient(1.2px 1.2px at 70% 20%, #fff7, transparent),
      radial-gradient(1.6px 1.6px at 40% 60%, #fff8, transparent),
      radial-gradient(1.1px 1.1px at 85% 50%, #fff6, transparent),
      radial-gradient(1.3px 1.3px at 55% 80%, #fff7, transparent),
      radial-gradient(1px 1px at 10% 75%, #fff6, transparent);}
    .gs-arr__planet{position:absolute;left:50%;bottom:-58vh;width:150vw;max-width:1400px;aspect-ratio:1;
      transform:translateX(-50%);border-radius:50%;
      background:radial-gradient(circle at 42% 32%, color-mix(in srgb, var(--arr-ground2) 60%, #fff 10%),
        var(--arr-ground) 55%, color-mix(in srgb, var(--arr-ground) 70%, #000) 100%);
      box-shadow:0 -20px 90px -20px var(--arr-edge), inset 0 20px 60px #0006;
      animation:gs-arr-planet 2s cubic-bezier(.2,.7,.2,1) both;}
    @keyframes gs-arr-planet{from{transform:translateX(-50%) translateY(80px) scale(.9);}to{transform:translateX(-50%) translateY(0) scale(1);}}
    .gs-arr__beam{position:absolute;left:50%;top:20%;width:26vw;max-width:220px;height:40vh;transform:translateX(-50%);
      background:linear-gradient(180deg, color-mix(in srgb, var(--arr-edge) 80%, #fff) , transparent 88%);
      clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);opacity:0;
      animation:gs-arr-beam 2s ease both;animation-delay:.35s;}
    @keyframes gs-arr-beam{0%{opacity:0;}30%{opacity:.5;}70%{opacity:.5;}100%{opacity:0;}}
    .gs-arr__ship{position:absolute;left:50%;top:8%;width:132px;transform:translateX(-50%);
      filter:drop-shadow(0 8px 14px #000a);animation:gs-arr-ship 2s cubic-bezier(.3,.6,.2,1) both;}
    .gs-arr__ship svg{width:100%;height:auto;display:block;}
    @keyframes gs-arr-ship{0%{top:-14%;opacity:0;}25%{opacity:1;}100%{top:34%;opacity:1;}}
    .gs-arr__cap{position:absolute;left:0;right:0;bottom:16%;text-align:center;color:#eaf2ff;
      text-shadow:0 2px 10px #000c;animation:gs-arr-cap .7s ease both;animation-delay:.6s;}
    @keyframes gs-arr-cap{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    .gs-arr__kick{font-size:12px;font-weight:800;letter-spacing:.28em;color:#9fd8ff;}
    .gs-arr__world{font-family:Georgia,'Times New Roman',serif;font-weight:800;font-size:clamp(26px,7vw,46px);margin:2px 0 4px;}
    .gs-arr__shop{display:inline-block;font-size:13px;font-weight:800;letter-spacing:.06em;color:#0b1017;
      background:linear-gradient(180deg,#e8c266,#a97b25);border-radius:20px;padding:4px 14px;}
    .gs-arr__skip{position:absolute;right:14px;bottom:14px;font-size:12px;font-weight:700;color:#cfd6e4cc;
      background:#0009;border:1px solid #ffffff22;border-radius:9px;padding:6px 12px;}
    @media(prefers-reduced-motion:reduce){.gs-arr,.gs-arr *{animation:none!important;}}`;
  document.head.appendChild(st);
}

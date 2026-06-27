/**
 * Procedural vector "hero" scenes for the zone splash card (GS-19). One self-contained, deterministic
 * SVG illustration per biome archetype — no downloaded asset to 404 (the project's house rule, same as
 * the intro cinematic). Each scene paints the world's character: a verdant garden dawn, a Mars-like
 * dust horizon, a glacier ring under an aurora, a volcanic ember world with lava flows, the void's
 * island adrift past a black hole. Pure: a `seed` drives a mulberry32 for stars so it's byte-stable.
 */

import type { BiomeArchetype } from '../sim/course/themes';

export interface HeroOpts {
  width?: number;
  height?: number;
  seed?: number;
}

/** mulberry32 — deterministic PRNG (no Math.random), matching the rest of the render layer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (x: number) => Math.round(x * 10) / 10;

/** A field of seeded stars across the upper sky. */
function stars(rng: () => number, W: number, H: number, count: number, maxY = 0.7): string {
  let s = '';
  for (let i = 0; i < count; i++) {
    const x = rng() * W;
    const y = rng() * H * maxY;
    const r = 0.4 + rng() * 1.3;
    const o = 0.45 + rng() * 0.5;
    s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="rgba(255,255,255,${o.toFixed(2)})" />`;
  }
  return s;
}

/** A jagged horizon/ridge polyline → a filled landform. `base` is the flat fill below `yTop`. */
function ridge(rng: () => number, W: number, H: number, yTop: number, rough: number, fill: string): string {
  const pts: string[] = [`0,${H}`, `0,${n1(yTop)}`];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const x = (W * i) / steps;
    const y = yTop + (rng() - 0.5) * rough;
    pts.push(`${n1(x)},${n1(y)}`);
  }
  pts.push(`${W},${H}`);
  return `<polygon points="${pts.join(' ')}" fill="${fill}" />`;
}

function frame(W: number, H: number, inner: string, sky: [string, string], gid: string): string {
  return (
    `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:100%;height:auto;display:block;" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>` +
    `<radialGradient id="${gid}v" cx="0.5" cy="0.42" r="0.75">` +
    `<stop offset="0.6" stop-color="rgba(0,0,0,0)"/><stop offset="1" stop-color="rgba(0,0,0,0.45)"/></radialGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#${gid})"/>` +
    inner +
    `<rect width="${W}" height="${H}" fill="url(#${gid}v)"/>` +
    `</svg>`
  );
}

/** A soft celestial disc (planet/sun/black hole) with a shaded terminator + optional ring/glow. */
function body(cx: number, cy: number, r: number, col: string, opts: { ring?: string; shade?: boolean; glow?: string } = {}): string {
  let s = '';
  if (opts.glow) s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r * 1.8)}" fill="${opts.glow}" />`;
  if (opts.ring) s += `<ellipse cx="${n1(cx)}" cy="${n1(cy)}" rx="${n1(r * 1.7)}" ry="${n1(r * 0.5)}" fill="none" stroke="${opts.ring}" stroke-width="2.5" />`;
  s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${col}" />`;
  if (opts.shade !== false) s += `<circle cx="${n1(cx + r * 0.4)}" cy="${n1(cy + r * 0.32)}" r="${n1(r * 0.92)}" fill="rgba(6,8,18,0.34)" />`;
  s += `<circle cx="${n1(cx - r * 0.34)}" cy="${n1(cy - r * 0.38)}" r="${n1(r * 0.4)}" fill="rgba(255,255,255,0.4)" />`;
  return s;
}

export function zoneHeroSVG(archetype: BiomeArchetype, opts: HeroOpts = {}): string {
  const W = opts.width ?? 320;
  const H = opts.height ?? 150;
  const rng = mulberry32((opts.seed ?? 1) >>> 0);
  const gid = `gh${archetype}`;

  if (archetype === 'verdant') {
    let inner = body(W * 0.78, H * 0.3, 16, '#ffe488', { glow: 'rgba(255,228,120,0.25)', shade: false });
    inner += ridge(rng, W, H, H * 0.62, 14, '#2f7a3a');
    inner += ridge(rng, W, H, H * 0.74, 10, '#256031');
    // A couple of foreground trees.
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.2 + rng() * 0.05);
      const y = H * (0.82 + rng() * 0.08);
      inner += `<line x1="${n1(x)}" y1="${n1(y)}" x2="${n1(x)}" y2="${n1(y - 14)}" stroke="#4a3320" stroke-width="3" stroke-linecap="round"/>`;
      inner += `<circle cx="${n1(x)}" cy="${n1(y - 16)}" r="9" fill="#2c8a3c"/><circle cx="${n1(x - 3)}" cy="${n1(y - 19)}" r="5" fill="#49b452"/>`;
    }
    return frame(W, H, inner, ['#7fc7e8', '#bfe6b0'], gid);
  }

  if (archetype === 'desert') {
    let inner = stars(rng, W, H, 10, 0.32);
    inner += body(W * 0.74, H * 0.26, 12, '#ffd9a0', { glow: 'rgba(255,180,120,0.22)', shade: false });
    // Layered dunes.
    inner += ridge(rng, W, H, H * 0.58, 8, '#8a5a2e');
    inner += ridge(rng, W, H, H * 0.7, 12, '#a8743a');
    inner += ridge(rng, W, H, H * 0.84, 8, '#c4924c');
    // Wind-blown dust streaks.
    for (let i = 0; i < 4; i++) {
      const y = H * (0.4 + rng() * 0.2);
      inner += `<line x1="${n1(W * rng())}" y1="${n1(y)}" x2="${n1(W * rng())}" y2="${n1(y + 2)}" stroke="rgba(255,230,190,0.18)" stroke-width="2"/>`;
    }
    return frame(W, H, inner, ['#b86a3a', '#e0a868'], gid);
  }

  if (archetype === 'frost') {
    let inner = stars(rng, W, H, 16, 0.4);
    // Aurora ribbons.
    for (let i = 0; i < 3; i++) {
      const y = H * (0.16 + i * 0.06);
      inner += `<path d="M0 ${n1(y)} Q ${n1(W * 0.3)} ${n1(y - 12)} ${n1(W * 0.55)} ${n1(y)} T ${W} ${n1(y - 4)}" fill="none" stroke="rgba(120,230,200,${(0.3 - i * 0.07).toFixed(2)})" stroke-width="6"/>`;
    }
    inner += body(W * 0.8, H * 0.28, 13, '#dff2ee', { shade: false, glow: 'rgba(180,230,240,0.2)' });
    // Glacier peaks.
    inner += ridge(rng, W, H, H * 0.6, 22, '#8fb7c0');
    inner += ridge(rng, W, H, H * 0.76, 16, '#c2e6e0');
    return frame(W, H, inner, ['#0e2a44', '#3f6f86'], gid);
  }

  if (archetype === 'inferno') {
    let inner = stars(rng, W, H, 8, 0.3);
    inner += body(W * 0.76, H * 0.26, 13, '#ffb27a', { glow: 'rgba(255,120,60,0.3)', shade: false });
    // Volcanic ridge with glowing lava seams.
    inner += ridge(rng, W, H, H * 0.56, 18, '#2a120c');
    inner += ridge(rng, W, H, H * 0.72, 14, '#3a1810');
    // Lava flows down the slope.
    for (let i = 0; i < 5; i++) {
      const x = W * (0.1 + i * 0.18 + rng() * 0.05);
      inner += `<path d="M${n1(x)} ${n1(H * 0.6)} q ${n1((rng() - 0.5) * 14)} ${n1(H * 0.12)} ${n1((rng() - 0.5) * 8)} ${n1(H * 0.3)}" fill="none" stroke="#ff7a2a" stroke-width="${(2 + rng() * 2).toFixed(1)}" stroke-linecap="round"/>`;
    }
    // A molten pool glow at the base.
    inner += `<ellipse cx="${n1(W * 0.5)}" cy="${n1(H * 0.98)}" rx="${n1(W * 0.6)}" ry="14" fill="rgba(255,110,40,0.35)"/>`;
    return frame(W, H, inner, ['#2a0a06', '#7a1e0c'], gid);
  }

  // void
  let inner = stars(rng, W, H, 34, 1);
  // A nebula smear.
  inner += `<ellipse cx="${n1(W * 0.3)}" cy="${n1(H * 0.4)}" rx="${n1(W * 0.34)}" ry="${n1(H * 0.3)}" fill="rgba(140,90,220,0.16)"/>`;
  // The black hole: a dark disc ringed by an accretion glow.
  inner += `<circle cx="${n1(W * 0.72)}" cy="${n1(H * 0.36)}" r="22" fill="rgba(200,170,255,0.18)"/>`;
  inner += `<circle cx="${n1(W * 0.72)}" cy="${n1(H * 0.36)}" r="16" fill="none" stroke="#caa3ff" stroke-width="3"/>`;
  inner += `<circle cx="${n1(W * 0.72)}" cy="${n1(H * 0.36)}" r="10" fill="#0a0518"/>`;
  // The island fairway platform adrift in the void (a glowing slab + flag).
  const ix = W * 0.32;
  const iy = H * 0.74;
  inner += `<ellipse cx="${n1(ix)}" cy="${n1(iy)}" rx="46" ry="13" fill="rgba(120,130,240,0.18)"/>`;
  inner += `<polygon points="${n1(ix - 38)},${n1(iy)} ${n1(ix + 38)},${n1(iy)} ${n1(ix + 26)},${n1(iy + 12)} ${n1(ix - 26)},${n1(iy + 12)}" fill="#3a3270" stroke="#5a64c0" stroke-width="1.5"/>`;
  inner += `<ellipse cx="${n1(ix)}" cy="${n1(iy)}" rx="34" ry="8" fill="#6f7ad6"/>`;
  inner += `<line x1="${n1(ix + 6)}" y1="${n1(iy)}" x2="${n1(ix + 6)}" y2="${n1(iy - 16)}" stroke="#e8e8e8" stroke-width="1.5"/>`;
  inner += `<polygon points="${n1(ix + 6)},${n1(iy - 16)} ${n1(ix + 15)},${n1(iy - 13)} ${n1(ix + 6)},${n1(iy - 10)}" fill="#ff3b3b"/>`;
  return frame(W, H, inner, ['#05030c', '#160e2e'], gid);
}

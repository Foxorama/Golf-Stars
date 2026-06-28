/**
 * Procedural "where the ball came to rest" art (pure SVG strings) for the result/shot cards.
 *
 * House rule (same as the loading intro + zone hero): NO downloaded asset to 404 — every scene is a
 * self-contained, deterministic vector illustration. A little vignette of the ball sitting on the
 * surface it finished on (fairway, rough, bunker, trees, green, ice, crystal, waste, tee), or — when
 * the ball wouldn't be VISIBLE where it ended up (a water/lava/void penalty) — a fun picture of the
 * hazard itself with no ball. OB shows the ball sitting beyond the white stakes; a holed shot shows
 * it dropping into the cup. Pure: no DOM, no rng, no time (placement variety is a fixed seed off the
 * lie), so it's byte-stable and testable.
 */

const W = 200;
const H = 132;

/** Surfaces where a finished ball would be SUNK / consumed and not visible — show the hazard alone. */
const BALL_HIDDEN_PENALTIES = new Set(['water', 'lava', 'lavariver', 'void', 'voidlost']);

export interface RestArtOpts {
  /** Penalty the shot incurred at rest, if any (water/lava/void/ob/…). Drives ball visibility. */
  penalty?: string;
  /** Holed out — show the ball dropping into the cup. */
  holed?: boolean;
  /** Knocked down into the trees in flight — emphasise the woods. */
  knockedDown?: boolean;
  /** Render size (px). Width defaults to 100% of the container; height keeps the 200×132 ratio. */
  height?: number;
}

function frame(inner: string, opts: RestArtOpts = {}): string {
  return `<svg viewBox="0 0 ${W} ${H}" width="100%"${opts.height ? ` height="${opts.height}"` : ''} preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:auto;aspect-ratio:${W}/${H};border-radius:10px;">${inner}</svg>`;
}

/** A golf ball with a soft shadow + a few dimples. */
function ball(x: number, y: number, r = 12): string {
  return `
    <ellipse cx="${x}" cy="${(y + r * 0.78).toFixed(1)}" rx="${(r * 0.95).toFixed(1)}" ry="${(r * 0.32).toFixed(1)}" fill="rgba(0,0,0,0.3)"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="#c2c7d1" stroke-width="1"/>
    <circle cx="${(x - r * 0.32).toFixed(1)}" cy="${(y - r * 0.3).toFixed(1)}" r="${(r * 0.42).toFixed(1)}" fill="#ffffff"/>
    <circle cx="${(x + r * 0.28).toFixed(1)}" cy="${(y + r * 0.1).toFixed(1)}" r="1.3" fill="#c9ced8"/>
    <circle cx="${(x - r * 0.04).toFixed(1)}" cy="${(y + r * 0.34).toFixed(1)}" r="1.2" fill="#c9ced8"/>
    <circle cx="${(x + r * 0.36).toFixed(1)}" cy="${(y - r * 0.3).toFixed(1)}" r="1.0" fill="#d6dbe3"/>`;
}

/** A flagstick + cup. */
function flag(x: number, ground: number): string {
  return `
    <ellipse cx="${x}" cy="${ground}" rx="9" ry="3" fill="#15331c"/>
    <ellipse cx="${x}" cy="${ground}" rx="5.5" ry="2" fill="#0b1f12"/>
    <line x1="${x}" y1="${ground}" x2="${x}" y2="${ground - 40}" stroke="#e8eef5" stroke-width="2"/>
    <path d="M ${x} ${ground - 40} L ${x + 22} ${ground - 33} L ${x} ${ground - 26} Z" fill="#ff5b5b"/>`;
}

function skyBand(top: string, bottom: string): string {
  return `<rect x="0" y="0" width="${W}" height="${H}" fill="${top}"/><rect x="0" y="0" width="${W}" height="${H * 0.46}" fill="${bottom}" opacity="0.55"/>`;
}

/** Three flat tone bands = a cell-shaded turf strip (lit top, mid, shadow). */
function turf(top: number, c0: string, c1: string, c2: string): string {
  return `
    <rect x="0" y="${top}" width="${W}" height="${H - top}" fill="${c2}"/>
    <rect x="0" y="${top}" width="${W}" height="${(H - top) * 0.55}" fill="${c1}"/>
    <rect x="0" y="${top}" width="${W}" height="${(H - top) * 0.26}" fill="${c0}"/>`;
}

function grassTuft(x: number, y: number, c: string): string {
  return `<path d="M ${x} ${y} l -3 -7 M ${x} ${y} l 0 -9 M ${x} ${y} l 3 -7" stroke="${c}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
}

function fairwayScene(): string {
  const stripes = Array.from({ length: 6 }, (_, i) => {
    const y = 70 + i * 11;
    return `<rect x="0" y="${y}" width="${W}" height="5" fill="#4fb358" opacity="0.35"/>`;
  }).join('');
  return frame(
    skyBand('#0e2233', '#1d4a63') +
      turf(64, '#5fd45a', '#3f9f43', '#2c7a33') +
      stripes +
      ball(108, 78),
  );
}

function roughScene(opts: RestArtOpts): string {
  const tufts = [
    [40, 96], [62, 104], [150, 98], [172, 106], [88, 110], [128, 112], [30, 112], [184, 96],
  ]
    .map(([x, y]) => grassTuft(x!, y!, '#2f7a35'))
    .join('');
  return frame(
    skyBand('#0e2233', '#1d4a63') +
      turf(60, '#56a94a', '#357c33', '#244f22') +
      ball(104, 86, 11) +
      // tufts hugging the ball so it reads "nestled down"
      grassTuft(92, 92, '#3c8f3f') +
      grassTuft(118, 93, '#3c8f3f') +
      tufts,
    opts,
  );
}

function bunkerScene(): string {
  return frame(
    skyBand('#0e2233', '#1d4a63') +
      `<path d="M 0 70 Q 100 50 200 70 L 200 132 L 0 132 Z" fill="#e8d39a"/>` +
      `<path d="M 0 70 Q 100 50 200 70 L 200 86 Q 100 70 0 86 Z" fill="#f4e6b8" opacity="0.8"/>` +
      // rake lines
      [80, 96, 112, 124].map((y) => `<path d="M 14 ${y} Q 100 ${y - 8} 186 ${y}" stroke="#cdb877" stroke-width="1.2" fill="none"/>`).join('') +
      // half-buried ball
      `<path d="M 92 96 a 12 12 0 0 1 24 0 Z" fill="rgba(120,96,40,0.35)"/>` +
      ball(104, 92, 11),
  );
}

function treesScene(): string {
  const tree = (x: number, base: number, s: number): string => `
    <ellipse cx="${x}" cy="${base + 3}" rx="${14 * s}" ry="4" fill="rgba(0,0,0,0.25)"/>
    <rect x="${x - 2.5 * s}" y="${base - 18 * s}" width="${5 * s}" height="${18 * s}" fill="#5a3b25"/>
    <circle cx="${x}" cy="${base - 30 * s}" r="${18 * s}" fill="#256b34"/>
    <circle cx="${x - 9 * s}" cy="${base - 24 * s}" r="${12 * s}" fill="#2f7d3d"/>
    <circle cx="${x + 9 * s}" cy="${base - 24 * s}" r="${12 * s}" fill="#1f5e2c"/>
    <circle cx="${x - 4 * s}" cy="${base - 38 * s}" r="${9 * s}" fill="#4fa85a"/>`;
  return frame(
    skyBand('#0c1c2b', '#173a52') +
      turf(96, '#3c8a3c', '#2c6b2e', '#1f4f22') +
      tree(48, 100, 1.15) +
      tree(160, 102, 1.0) +
      tree(118, 98, 0.85) +
      ball(96, 110, 10),
  );
}

function greenScene(holed: boolean): string {
  const base =
    skyBand('#0e2233', '#1d4a63') +
      `<ellipse cx="100" cy="100" rx="120" ry="46" fill="#3f9f43"/>` +
      `<ellipse cx="100" cy="98" rx="104" ry="38" fill="#56c455"/>` +
      `<ellipse cx="100" cy="96" rx="86" ry="30" fill="#6cd86a" opacity="0.7"/>`;
  if (holed) {
    return frame(
      base +
        flag(118, 96) +
        `<ellipse cx="118" cy="96" rx="5.5" ry="2" fill="#06140b"/>` +
        // ball dropping into the cup
        ball(118, 90, 8) +
        // sparkles
        [
          [96, 70], [140, 76], [80, 92], [150, 96],
        ]
          .map(([x, y]) => `<path d="M ${x} ${y! - 4} L ${x! + 1} ${y} L ${x! + 4} ${y} L ${x! + 1.5} ${y! + 2} L ${x! + 2.5} ${y! + 5} L ${x} ${y! + 3} L ${x! - 2.5} ${y! + 5} L ${x! - 1.5} ${y! + 2} L ${x! - 4} ${y} L ${x! - 1} ${y} Z" fill="#ffe14a"/>`)
          .join(''),
    );
  }
  return frame(base + flag(132, 92) + ball(86, 98, 11));
}

function teeScene(): string {
  return frame(
    skyBand('#0e2233', '#1d4a63') +
      turf(74, '#5fd45a', '#3f9f43', '#2c7a33') +
      `<rect x="60" y="78" width="80" height="18" rx="4" fill="#6b4a2e"/>` +
      `<rect x="60" y="78" width="80" height="7" rx="3" fill="#84603e"/>` +
      // tee peg
      `<rect x="103" y="76" width="3" height="10" fill="#e3c489"/>` +
      ball(104.5, 70, 11),
  );
}

function iceScene(): string {
  return frame(
    skyBand('#0a1c2c', '#1a4f6b') +
      `<rect x="0" y="66" width="${W}" height="${H - 66}" fill="#b8e6f2"/>` +
      `<rect x="0" y="66" width="${W}" height="22" fill="#dcf4fb" opacity="0.8"/>` +
      // cracks + sheen
      `<path d="M 30 90 L 70 100 L 60 120 M 120 84 L 150 104 L 140 124" stroke="#8fc6da" stroke-width="1.3" fill="none"/>` +
      `<path d="M 20 76 L 90 72" stroke="#ffffff" stroke-width="2" opacity="0.6"/>` +
      ball(110, 80, 11),
  );
}

function crystalScene(): string {
  const shard = (x: number, base: number, w: number, h: number, c: string): string =>
    `<path d="M ${x} ${base} L ${x - w} ${base} L ${x - w * 0.4} ${base - h} L ${x + w * 0.5} ${base - h * 0.7} L ${x + w} ${base} Z" fill="${c}"/>`;
  return frame(
    skyBand('#160b2e', '#3a1f63') +
      turf(92, '#7a52c0', '#5a3a9a', '#3f2870') +
      shard(46, 100, 16, 40, '#a988e8') +
      shard(168, 102, 18, 34, '#9173d8') +
      shard(120, 98, 12, 48, '#c2a6f5') +
      ball(96, 104, 10),
  );
}

function wasteScene(): string {
  const gravel = Array.from({ length: 22 }, (_, i) => {
    const x = 12 + (i * 37) % 180;
    const y = 84 + ((i * 53) % 42);
    return `<circle cx="${x}" cy="${y}" r="${1.2 + (i % 3) * 0.6}" fill="#8c7a5a"/>`;
  }).join('');
  return frame(
    skyBand('#1c1408', '#3f3015') +
      `<rect x="0" y="74" width="${W}" height="${H - 74}" fill="#b9a274"/>` +
      `<rect x="0" y="74" width="${W}" height="20" fill="#cdb98c" opacity="0.7"/>` +
      gravel +
      ball(106, 90, 11),
  );
}

function waterScene(): string {
  return frame(
    skyBand('#08243a', '#1a5c8a') +
      `<rect x="0" y="60" width="${W}" height="${H - 60}" fill="#1f6fa8"/>` +
      `<rect x="0" y="60" width="${W}" height="26" fill="#3a93cc" opacity="0.7"/>` +
      // splash crown where it went in
      `<path d="M 86 72 q 6 -16 12 0 M 100 70 q 5 -18 11 0 M 76 76 q 5 -12 10 0" stroke="#cfeaff" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      // ripple rings + bubbles
      [
        [100, 84, 12], [100, 84, 22], [100, 84, 32],
      ]
        .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r! * 0.4}" fill="none" stroke="#bfe4ff" stroke-width="1.2" opacity="${(1 - r! / 40).toFixed(2)}"/>`)
        .join('') +
      [
        [86, 98], [118, 100], [104, 110],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#cfeaff" opacity="0.8"/>`)
        .join(''),
  );
}

function lavaScene(): string {
  return frame(
    skyBand('#1a0805', '#5a1c0a') +
      `<rect x="0" y="62" width="${W}" height="${H - 62}" fill="#2a0d07"/>` +
      // glowing cracks in the crust
      `<path d="M 0 92 Q 60 80 110 96 T 200 90" stroke="#ff7a1a" stroke-width="4" fill="none"/>` +
      `<path d="M 0 92 Q 60 80 110 96 T 200 90" stroke="#ffd23a" stroke-width="1.6" fill="none"/>` +
      `<path d="M 30 116 Q 90 104 140 118 T 200 112" stroke="#ff5a12" stroke-width="3" fill="none"/>` +
      // molten pool where it sank + rising smoke/ember puff
      `<ellipse cx="104" cy="80" rx="20" ry="7" fill="#ff8a1f"/>` +
      `<ellipse cx="104" cy="80" rx="11" ry="3.5" fill="#ffe14a"/>` +
      `<path d="M 100 76 q -6 -16 4 -26 q 8 -8 2 -20" stroke="rgba(90,90,90,0.5)" stroke-width="7" fill="none" stroke-linecap="round"/>` +
      [
        [120, 56], [92, 50], [110, 40],
      ]
        .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#ffb347" opacity="0.7"/>`)
        .join(''),
  );
}

function voidScene(): string {
  const stars = Array.from({ length: 26 }, (_, i) => {
    const x = (i * 71) % W;
    const y = (i * 47) % H;
    const r = 0.5 + (i % 3) * 0.5;
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${i % 4 === 0 ? '#bcd6ff' : '#ffffff'}" opacity="0.85"/>`;
  }).join('');
  return frame(
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#05030f"/>` +
      stars +
      // a black hole swirl where the ball vanished
      `<circle cx="100" cy="70" r="30" fill="#0a0618"/>` +
      `<circle cx="100" cy="70" r="30" fill="none" stroke="#5b3fa0" stroke-width="3" opacity="0.7"/>` +
      `<circle cx="100" cy="70" r="20" fill="none" stroke="#8b6fd0" stroke-width="2" opacity="0.6"/>` +
      `<circle cx="100" cy="70" r="6" fill="#000"/>` +
      // a last sparkle being pulled in
      `<path d="M 132 58 L 134 62 L 138 64 L 134 66 L 132 70 L 130 66 L 126 64 L 130 62 Z" fill="#cdb3ff"/>`,
  );
}

function obScene(): string {
  const stake = (x: number): string =>
    `<rect x="${x - 2}" y="58" width="4" height="46" fill="#f2f2f2"/><rect x="${x - 2}" y="58" width="4" height="9" fill="#e23b3b"/>`;
  return frame(
    skyBand('#0e2233', '#1d4a63') +
      // in-bounds turf (left) vs scrub beyond (right)
      `<rect x="0" y="70" width="${W}" height="${H - 70}" fill="#7d8a5a"/>` +
      `<rect x="0" y="70" width="100" height="${H - 70}" fill="#3f9f43"/>` +
      `<rect x="0" y="70" width="100" height="16" fill="#56c455" opacity="0.7"/>` +
      stake(112) +
      stake(150) +
      stake(188) +
      // scrubby tufts beyond
      grassTuft(132, 110, '#6b7340') +
      grassTuft(168, 116, '#6b7340') +
      // ball sitting out of bounds beyond the stakes
      ball(140, 96, 10),
  );
}

/**
 * The rest-of-shot vignette for a finished shot. `lie` is the surface it came to rest on; `opts`
 * supplies the penalty/holed/knockdown context that decides whether the ball is shown (and where).
 */
export function restArtSVG(lie: string, opts: RestArtOpts = {}): string {
  if (opts.holed) return greenScene(true);
  const pen = opts.penalty;
  if (pen && BALL_HIDDEN_PENALTIES.has(pen)) {
    if (pen === 'water') return waterScene();
    if (pen === 'lava' || pen === 'lavariver') return lavaScene();
    return voidScene(); // void / voidlost
  }
  if (pen === 'ob' || pen === 'lost') return obScene();
  switch (lie) {
    case 'fairway':
      return fairwayScene();
    case 'rough':
    case 'voidrough':
      return roughScene(opts);
    case 'bunker':
      return bunkerScene();
    case 'trees':
      return treesScene();
    case 'green':
      return greenScene(false);
    case 'tee':
      return teeScene();
    case 'ice':
      return iceScene();
    case 'crystal':
      return crystalScene();
    case 'waste':
      return wasteScene();
    case 'water':
    case 'frozenpond':
    case 'creek':
      return waterScene();
    case 'lava':
    case 'lavariver':
      return lavaScene();
    case 'void':
      return voidScene();
    default:
      return fairwayScene();
  }
}

/** A human label for a surface/lie (used in the result card). */
export function lieLabel(lie: string): string {
  const map: Record<string, string> = {
    tee: 'the tee',
    fairway: 'the fairway',
    rough: 'the rough',
    voidrough: 'the void',
    bunker: 'a bunker',
    trees: 'the trees',
    green: 'the green',
    ice: 'the ice',
    crystal: 'the crystal',
    waste: 'the waste',
    water: 'the water',
    frozenpond: 'the frozen pond',
    lava: 'the lava',
    lavariver: 'the lava river',
    void: 'the void',
  };
  return map[lie] ?? lie;
}

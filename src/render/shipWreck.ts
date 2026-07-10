/**
 * DRIFTING SHIP-WRECK PIECES (GS-ship-wreck) — small, detailed, mangled chunks of the dead starship
 * "Starlit Wanderer" drifting through the space beside the derelict holes: the BRIDGE (command section,
 * its name in hyper-coloured spray paint), a torn WING / solar array, and an ENGINE cluster. They are
 * kept SMALL and off to the side by the caller so they never obscure the course — a detailed little
 * model that reads clearly as a ship (window grids, nav lights, hull plating), not vague rubble.
 *
 * Canvas2D only (the animated play view): pure decor the sim never samples. Each piece is a set of flat,
 * hard-edged polygons + lit rim strokes (the hull look), drawn in a LOCAL frame scaled by the piece size
 * and rotated by its tumble. CRITICAL: the frame is `ctx.scale(S)`, so a raw `lineWidth` would be
 * multiplied by S into a giant blurred halo — every stroke width here is a PIXEL value divided by `s`
 * (px-per-local) so the linework stays crisp at any size. Nothing draws rng; the caller seeds once.
 */

const HULL = '#2f3842';
const HULL_LIT = '#42505c';
const HULL_DARK = '#1b222a';
const SEAM = 'rgba(8,12,18,0.5)';
const RIM = 'rgba(176,206,232,0.9)';
const RIM_DIM = 'rgba(120,150,180,0.55)';
const WIN = 'rgba(140,215,245,0.95)';
const WIN_DEAD = 'rgba(24,40,52,0.9)';
const NAV_R = 'rgba(255,90,80,0.95)'; // red port nav light
const NAV_G = 'rgba(95,235,140,0.95)'; // green starboard nav light
const SPARK = 'rgba(95,212,208,0.95)';

export type WreckKind = 'bridge' | 'wing' | 'engine';

/** Stroke a closed polygon (local coords) filled + rimmed. `rimPx` is a screen-pixel width; `s` is the
 *  section scale so the stroke stays `rimPx` wide regardless of how large the piece is drawn. */
function tornPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string, rim: string, rimPx: number, s: number): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = rimPx / s;
  ctx.strokeStyle = rim;
  ctx.stroke();
}

/** A short line at `wPx` screen-pixel width (local coords). */
function stroke(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, col: string, wPx: number, s: number): void {
  ctx.strokeStyle = col;
  ctx.lineWidth = wPx / s;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/**
 * Draw a wreck piece centred at (cx, cy), sized so its reach is ~`S` px, rotated `rot`, at `alpha`.
 * `kind` picks the silhouette; `t` (seconds) drives live flickers (windows / embers / nav lights). The
 * BRIDGE spray-paints the ship `name` along its flank.
 */
export function drawWreck(
  ctx: CanvasRenderingContext2D,
  kind: WreckKind,
  cx: number,
  cy: number,
  S: number,
  rot: number,
  alpha: number,
  t: number,
  name?: string,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.scale(S, S);
  ctx.lineJoin = 'round';
  if (kind === 'bridge') drawBridge(ctx, t, S, name);
  else if (kind === 'wing') drawWing(ctx, t, S);
  else drawEngine(ctx, t, S);
  ctx.restore();
}

/** A small blinking nav / running light + soft halo. */
function navLight(ctx: CanvasRenderingContext2D, x: number, y: number, col: string, on: boolean): void {
  ctx.fillStyle = on ? col : 'rgba(40,48,58,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, 0.03, 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
  }
}

/** The command BRIDGE section of the Starlit Wanderer, torn off the ship: a wide, blunt command PROW
 *  (up-frame) crowned by a raised bridge tower with a bright wraparound VIEWPORT — the unmistakable
 *  "bridge" cue — tapering back to a jaggedly TORN stern (down-frame) where it was ripped free. A single
 *  row of cabin windows runs the STARBOARD flank; the battered PORT flank wears the ship's name. */
function drawBridge(ctx: CanvasRenderingContext2D, t: number, s: number, name?: string): void {
  const blink = Math.floor(t * 1.2) % 2 === 0;
  // Hull outline: blunt command prow at top, tapering to a torn/jagged stern at the bottom.
  const body: [number, number][] = [
    [-0.30, -0.62], [-0.20, -0.86], [0.20, -0.86], [0.30, -0.62],
    [0.38, 0.08], [0.35, 0.54], [0.17, 0.40], [0.07, 0.66],
    [-0.05, 0.38], [-0.22, 0.62], [-0.37, 0.38], [-0.39, 0.08],
  ];
  tornPoly(ctx, body, HULL, RIM, 1.6, s);
  // A sunken inner DECK recess so the bridge tower reads raised off a floor you'd stand on.
  tornPoly(ctx, [[-0.29, -0.52], [0.29, -0.52], [0.31, 0.18], [-0.31, 0.18]], HULL_DARK, SEAM, 0.7, s);
  // Structural deck ribs across the section (volume + reads as a deck).
  for (const y of [-0.30, -0.06, 0.16]) stroke(ctx, -0.32, y, 0.32, y, SEAM, 0.7, s);
  // A lit gantry catwalk down the deck centreline.
  tornPoly(ctx, [[-0.045, -0.5], [0.045, -0.5], [0.07, 0.16], [-0.07, 0.16]], HULL_LIT, 'rgba(150,180,210,0.35)', 0.7, s);

  // ── The raised BRIDGE TOWER at the prow, capped by a wraparound VIEWPORT band of lit panes.
  tornPoly(ctx, [[-0.235, -0.84], [0.235, -0.84], [0.18, -0.46], [-0.18, -0.46]], HULL_LIT, RIM, 1.3, s);
  const vy = -0.80, vh = 0.115, vx = -0.205, vw = 0.41;
  ctx.fillStyle = 'rgba(8,14,20,0.96)'; // the dark window recess
  ctx.fillRect(vx, vy, vw, vh);
  const panes = 7;
  const pw = vw / panes;
  for (let i = 0; i < panes; i++) {
    const dead = ((i + Math.floor(t * 1.5)) % 8) === 0;
    ctx.fillStyle = dead ? WIN_DEAD : WIN;
    ctx.fillRect(vx + i * pw + 0.006, vy + 0.016, pw - 0.011, vh - 0.03);
  }
  ctx.fillStyle = 'rgba(210,248,255,0.9)'; // hot glint along the top of the glass
  ctx.fillRect(vx, vy + 0.01, vw, 0.013);
  // Cabin windows down the STARBOARD flank only (a clean single row — the port flank is for the name).
  for (let i = 0; i < 7; i++) {
    const y = -0.30 + i * 0.10;
    const dead = ((i * 2 + Math.floor(t * 1.5)) % 6) === 0;
    ctx.fillStyle = dead ? WIN_DEAD : WIN;
    ctx.fillRect(0.245, y, 0.05, 0.05);
  }
  // Antenna mast + sensor dish off the prow, with a red beacon at the tip.
  stroke(ctx, 0.0, -0.85, 0.02, -1.12, RIM_DIM, 0.8, s);
  stroke(ctx, -0.13, -0.7, -0.24, -0.86, RIM_DIM, 0.7, s);
  ctx.strokeStyle = RIM_DIM; ctx.lineWidth = 0.7 / s;
  ctx.beginPath(); ctx.arc(-0.26, -0.9, 0.05, Math.PI * 0.1, Math.PI * 1.1); ctx.stroke();
  ctx.fillStyle = NAV_R;
  ctx.beginPath(); ctx.arc(0.02, -1.14, 0.02, 0, Math.PI * 2); ctx.fill();
  // Port/starboard nav lights (red left, green right) blinking out of phase.
  navLight(ctx, -0.34, -0.36, NAV_R, blink);
  navLight(ctx, 0.34, -0.36, NAV_G, !blink);

  // ── Torn stern: exposed structural ribs, a dying reactor ember + spark where it was severed.
  for (const rx of [-0.16, 0.0, 0.16]) stroke(ctx, rx, 0.30, rx + (rx > 0 ? 0.03 : -0.03), 0.6, HULL_DARK, 1.2, s);
  const eg = ctx.createRadialGradient(-0.02, 0.5, 0, -0.02, 0.5, 0.2);
  eg.addColorStop(0, `rgba(255,150,60,${(0.42 + 0.22 * Math.sin(t * 4)).toFixed(2)})`);
  eg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(-0.02, 0.5, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SPARK;
  ctx.beginPath(); ctx.arc(0.12, 0.46, 0.014 + 0.008 * Math.sin(t * 6), 0, Math.PI * 2); ctx.fill();

  if (name) sprayName(ctx, name, body, s);
}

/** The ship name in HYPER-COLOURED spray paint running the length of the battered PORT flank — the
 *  broken, damaged side. CLIPPED to the hull so it sits on the metal (not a decal floating over the
 *  edge), aligned to the long axis so it reads as hull lettering, and WEATHERED so it fits the wreck:
 *  a dark under-shadow for punch against the busy hull, faded rainbow paint, chips flaked off to bare
 *  metal, scratches, and a heavier burn toward the torn stern where the last letters are half-gone.
 *  Deterministic wear (no rng, no time) so it never shimmers. Still legible — just old. */
function sprayName(ctx: CanvasRenderingContext2D, name: string, body: [number, number][], s: number): void {
  ctx.save();
  // Clip to the hull: paint only shows where there's metal under it.
  ctx.beginPath();
  body.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.clip();
  // Anchor near the torn stern on the PORT flank, rotate so the text reads UP the hull toward the prow,
  // parallel to the long axis (upright hull letters, not a diagonal scrawl).
  ctx.translate(-0.325, 0.56);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  // Size the cap height so the whole name fits the flank length, then re-measure.
  const flank = 1.16;
  let h = 0.16;
  ctx.font = `900 ${h}px "Arial Black", system-ui, sans-serif`;
  let w = ctx.measureText(name).width;
  if (w > flank) { h *= flank / w; ctx.font = `900 ${h}px "Arial Black", system-ui, sans-serif`; w = ctx.measureText(name).width; }
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#ff3fb0');
  grad.addColorStop(0.4, '#8b5cff');
  grad.addColorStop(0.7, '#33e0ff');
  grad.addColorStop(1, '#ffe14a');
  // A dark under-shadow (offset toward the light-away side) so the letters punch off the busy hull,
  // then a faint sprayed halo, then the faded paint. Offset ghosts, never shadowBlur (balloons here).
  ctx.fillStyle = 'rgba(4,8,12,0.55)';
  ctx.fillText(name, 0.012, 0.012);
  ctx.fillStyle = 'rgba(120,230,255,0.14)';
  for (const [ox, oy] of [[-0.008, 0], [0.008, 0], [0, -0.008], [0, 0.008]] as [number, number][]) ctx.fillText(name, ox, oy);
  ctx.globalAlpha *= 0.9; // lightly faded — legibility first, it's the hero element
  ctx.fillStyle = grad;
  ctx.fillText(name, 0, 0);
  ctx.globalAlpha /= 0.9;
  // FLAKING: a few chips knocked out to bare hull so the paint reads as peeling — kept sparse so the
  // name stays readable. Fixed pseudo-scatter (index hash) keyed to the text box → stable, no shimmer.
  ctx.fillStyle = HULL;
  const hash = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < 12; i++) {
    const cx = hash(i + 1) * w;
    const cy = (hash(i + 7) - 0.5) * h * 1.1;
    const cw = h * (0.05 + hash(i + 3) * 0.12);
    const ch = h * (0.08 + hash(i + 5) * 0.32);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((hash(i + 9) - 0.5) * 1.1);
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.restore();
  }
  // A couple of deep SCRATCHES gouged across the paint (bare hull, thin).
  ctx.strokeStyle = HULL;
  ctx.lineWidth = 1.3 / s;
  for (const [x0, y0, x1, y1] of [[w * 0.2, -h * 0.7, w * 0.32, h * 0.7], [w * 0.66, -h * 0.6, w * 0.74, h * 0.65]] as [number, number, number, number][]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // A heavier BURN/wear patch fading the stern end (the last letters are more gone) — the damaged side.
  const burn = ctx.createLinearGradient(w * 0.02, 0, w * -0.14, 0);
  burn.addColorStop(0, 'rgba(20,26,34,0)');
  burn.addColorStop(1, 'rgba(20,26,34,0.65)');
  ctx.fillStyle = burn;
  ctx.fillRect(w * -0.16, -h, w * 0.2, h * 2);
  ctx.restore();
}

/** A torn WING / solar array: a swept blade off a stub root, a grid of solar cells (some blown out), a
 *  red nav light at the tip and a lit leading-edge spar. */
function drawWing(ctx: CanvasRenderingContext2D, t: number, s: number): void {
  const blink = Math.floor(t * 1.4) % 2 === 0;
  tornPoly(
    ctx,
    [[-0.14, -0.7], [0.14, -0.68], [0.86, 0.3], [1.02, 0.44], [0.8, 0.56], [0.46, 0.44], [-0.02, 0.06], [-0.12, -0.3]],
    HULL,
    RIM,
    1.4,
    s,
  );
  // The panel array — a grid of solar cells (some dead), clipped to the blade.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-0.08, -0.58);
  ctx.lineTo(0.1, -0.56);
  ctx.lineTo(0.78, 0.32);
  ctx.lineTo(0.4, 0.38);
  ctx.closePath();
  ctx.clip();
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 3; j++) {
      const dead = ((i * 3 + j + Math.floor(t)) % 8) === 0;
      ctx.fillStyle = dead ? 'rgba(14,20,28,0.95)' : `rgba(${44 + j * 8},${76 + j * 10},${104 + j * 12},0.92)`;
      ctx.fillRect(-0.1 + i * 0.14, -0.6 + j * 0.12 + i * 0.15, 0.12, 0.1);
    }
  }
  ctx.restore();
  // Leading-edge spar (lit) + a rib.
  stroke(ctx, 0.1, -0.66, 0.96, 0.4, 'rgba(160,192,222,0.6)', 0.9, s);
  stroke(ctx, -0.08, -0.5, 0.6, 0.34, RIM_DIM, 0.6, s);
  navLight(ctx, 0.92, 0.4, NAV_R, blink); // wingtip beacon
}

/** An ENGINE cluster: a mount block with two thruster nozzles (one still embering), plating + pipes. */
function drawEngine(ctx: CanvasRenderingContext2D, t: number, s: number): void {
  tornPoly(ctx, [[-0.56, -0.62], [0.54, -0.58], [0.64, 0.1], [0.44, 0.26], [-0.44, 0.26], [-0.66, 0.04]], HULL, RIM, 1.5, s);
  tornPoly(ctx, [[-0.44, -0.44], [0.44, -0.42], [0.4, 0.0], [-0.4, 0.0]], HULL_LIT, 'rgba(150,180,210,0.3)', 0.8, s);
  for (const yy of [-0.3, -0.1]) stroke(ctx, -0.45, yy, 0.45, yy, SEAM, 0.5, s);
  // Two nozzle bells across the aft face; the left one still fires a dim ember.
  for (let i = 0; i < 2; i++) {
    const x = -0.24 + i * 0.48;
    const glow = i === 0;
    if (glow) {
      const g = ctx.createRadialGradient(x, 0.42, 0, x, 0.42, 0.22);
      g.addColorStop(0, `rgba(255,150,60,${(0.45 + 0.2 * Math.sin(t * 5)).toFixed(2)})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, 0.42, 0.22, 0, Math.PI * 2); ctx.fill();
    }
    tornPoly(ctx, [[x - 0.15, 0.12], [x + 0.15, 0.12], [x + 0.21, 0.44], [x - 0.21, 0.44]], HULL_DARK, RIM, 1.1, s);
    ctx.fillStyle = glow ? 'rgba(255,180,90,0.9)' : 'rgba(10,14,20,0.92)';
    ctx.beginPath(); ctx.ellipse(x, 0.44, 0.2, 0.055, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Fuel/coolant pipes snapped at the top + a green nav light.
  for (const dx of [-0.26, 0, 0.26]) stroke(ctx, dx, -0.58, dx + 0.03, -0.82, RIM_DIM, 0.9, s);
  navLight(ctx, 0.5, -0.5, NAV_G, Math.floor(t * 1.3) % 2 === 0);
}

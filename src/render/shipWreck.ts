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

/** The command BRIDGE of the Starlit Wanderer: an elongated hull nose, a raised bridge tower with a lit
 *  viewport, TWO rows of cabin windows down the flanks, red/green nav lights, a torn aft with a dying
 *  engine ember — a detailed little ship, with the name sprayed along the port hull. */
function drawBridge(ctx: CanvasRenderingContext2D, t: number, s: number, name?: string): void {
  const blink = Math.floor(t * 1.2) % 2 === 0;
  // Main fuselage: a pointed nose (up-frame) down to a torn aft (down-frame, jagged).
  const body: [number, number][] = [
    [0, -1.2], [0.2, -0.95], [0.3, -0.4], [0.32, 0.4], [0.26, 0.72],
    [0.12, 0.6], [0.04, 0.86], [-0.06, 0.62], [-0.2, 0.78], [-0.28, 0.42],
    [-0.32, 0.4], [-0.3, -0.4], [-0.2, -0.95],
  ];
  tornPoly(ctx, body, HULL, RIM, 1.6, s);
  // A lit dorsal spine plate down the centre (volume).
  tornPoly(ctx, [[-0.12, -0.9], [0.12, -0.9], [0.16, 0.4], [-0.16, 0.4]], HULL_LIT, 'rgba(150,180,210,0.35)', 0.8, s);
  // The raised BRIDGE TOWER near the nose, with a bright wraparound viewport band.
  tornPoly(ctx, [[-0.2, -0.86], [0.2, -0.86], [0.15, -0.5], [-0.15, -0.5]], HULL_LIT, RIM, 1.2, s);
  ctx.fillStyle = WIN;
  ctx.fillRect(-0.17, -0.8, 0.34, 0.055); // the main bridge window
  ctx.fillStyle = 'rgba(200,245,255,0.9)';
  ctx.fillRect(-0.17, -0.8, 0.34, 0.02); // a hot upper glint on the glass
  // TWO rows of cabin windows down each flank (some dead) — the detail that says "ship".
  for (let r = 0; r < 2; r++) {
    const wx = 0.15 + r * 0.07;
    for (let i = 0; i < 9; i++) {
      const y = -0.36 + i * 0.11;
      const dead = ((i * 3 + r * 5 + Math.floor(t * 1.5)) % 6) === 0;
      ctx.fillStyle = dead ? WIN_DEAD : WIN;
      ctx.fillRect(-wx - 0.017, y, 0.034, 0.045); // port
      ctx.fillRect(wx - 0.017, y, 0.034, 0.045); // starboard
    }
  }
  // Hull panel seams.
  for (const y of [-0.4, 0, 0.34]) stroke(ctx, -0.31, y, 0.31, y, SEAM, 0.6, s);
  // Antenna spars off the nose + a nose beacon.
  for (const [dx, len] of [[-0.05, 0.34], [0.05, 0.24]] as [number, number][]) stroke(ctx, dx, -1.16, dx + 0.02, -1.16 - len, RIM_DIM, 0.7, s);
  ctx.fillStyle = NAV_R;
  ctx.beginPath(); ctx.arc(0.05, -1.34, 0.02, 0, Math.PI * 2); ctx.fill();
  // Port/starboard nav lights (red left, green right) blinking out of phase.
  navLight(ctx, -0.32, -0.1, NAV_R, blink);
  navLight(ctx, 0.32, -0.1, NAV_G, !blink);
  // A dying engine ember + spark at the torn aft.
  const eg = ctx.createRadialGradient(0, 0.7, 0, 0, 0.7, 0.16);
  eg.addColorStop(0, `rgba(255,150,60,${(0.4 + 0.2 * Math.sin(t * 4)).toFixed(2)})`);
  eg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(0, 0.7, 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = SPARK;
  ctx.beginPath(); ctx.arc(-0.14, 0.66, 0.014 + 0.008 * Math.sin(t * 6), 0, Math.PI * 2); ctx.fill();
  if (name) sprayName(ctx, name, body, s);
}

/** The ship name in HYPER-COLOURED spray paint up the port hull — CLIPPED to the fuselage so it sits on
 *  the metal (not a decal floating over the edge) and WEATHERED so it fits the wreck: faded, flaking off
 *  in chips that reveal bare hull, scratched, with a couple of letters half-gone. Deterministic wear (no
 *  rng, no time) so it doesn't shimmer. Still legible — just old. */
function sprayName(ctx: CanvasRenderingContext2D, name: string, body: [number, number][], s: number): void {
  ctx.save();
  // Clip to the hull: paint only shows where there's metal under it.
  ctx.beginPath();
  body.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
  ctx.closePath();
  ctx.clip();
  ctx.translate(-0.22, 0.52);
  ctx.rotate(-1.4);
  const h = 0.15; // cap height in local units (scales with the piece)
  ctx.font = `900 ${h}px "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#ff3fb0');
  grad.addColorStop(0.4, '#8b5cff');
  grad.addColorStop(0.7, '#33e0ff');
  grad.addColorStop(1, '#ffe14a');
  // A faint sprayed HALO behind (weathered paint bleeds into the hull), then the letters faded (old
  // paint isn't fully opaque). Offset ghosts, not shadowBlur (which balloons under the ctx scale).
  ctx.fillStyle = 'rgba(120,230,255,0.16)';
  for (const [ox, oy] of [[-0.01, 0], [0.01, 0], [0, -0.01], [0, 0.01]] as [number, number][]) ctx.fillText(name, ox, oy);
  ctx.globalAlpha *= 0.82; // faded
  ctx.fillStyle = grad;
  ctx.fillText(name, 0, 0);
  ctx.globalAlpha /= 0.82;
  // FLAKING: knock chips of paint OUT with the bare-hull colour, so the letters read as peeling. A
  // fixed pseudo-scatter (index hash) keyed to the text box → stable, weathered, never shimmering.
  ctx.fillStyle = HULL;
  const hash = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
  for (let i = 0; i < 26; i++) {
    const cx = hash(i + 1) * w;
    const cy = (hash(i + 7) - 0.5) * h * 1.3;
    const cw = h * (0.06 + hash(i + 3) * 0.16);
    const ch = h * (0.1 + hash(i + 5) * 0.5);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((hash(i + 9) - 0.5) * 1.2);
    ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
    ctx.restore();
  }
  // A couple of deep SCRATCHES gouged across the paint (bare hull, thin).
  ctx.strokeStyle = HULL;
  ctx.lineWidth = 1.4 / s;
  for (const [x0, y0, x1, y1] of [[w * 0.18, -h * 0.7, w * 0.34, h * 0.7], [w * 0.62, -h * 0.6, w * 0.7, h * 0.65]] as [number, number, number, number][]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // A heavier BURN/wear patch fading one end (the aft letters are more gone).
  const burn = ctx.createLinearGradient(w * 0.72, 0, w, 0);
  burn.addColorStop(0, 'rgba(26,32,40,0)');
  burn.addColorStop(1, 'rgba(26,32,40,0.7)');
  ctx.fillStyle = burn;
  ctx.fillRect(w * 0.72, -h, w * 0.3, h * 2);
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

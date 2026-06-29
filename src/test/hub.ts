/**
 * Golf Stars — Test & Demo Hub (the page behind test.html; see standards/TEST-HUB-STANDARD.md).
 *
 * Two faces, one same-origin page:
 *   • DEMO — drives the REAL shipped game in an <iframe> through its public hooks (the `?seed=`
 *     / `?intro=` URL params and the `window._gsFeel` / `_gsIntro` / `_gsSpray` live escape-hatch
 *     flags). It re-implements zero game logic — it pokes the artifact (invariant I1).
 *   • SIM LAB — imports the PURE sim (via src/test/lab.ts) and runs batch experiments the headless
 *     engine was built for: fire the driver 1000× to see its real shot dispersion; build a loadout
 *     from handicap + permanent meta-upgrades + shop perks and watch the cone tighten; run dozens
 *     of seeded runs to prove an upgrade raises mean per-stop Stableford.
 *
 * The upgrade / club / lie / format / golfer lists are read straight from the sim's own tables
 * (CLUBS, SHOP_ITEMS, META_UPGRADES, LIE_INFO, FORMATS, CHARACTERS), so new content shows up here
 * automatically and can't drift. This file is the imperative DOM/canvas shell; all maths lives in
 * lab.ts (tested).
 */

import { CLUBS } from '../sim/clubs';
import { LIE_INFO } from '../sim/shot';
import { SHOP_ITEMS, CLUB_ITEMS, ownedCount, itemCap, type ShopItem } from '../sim/rpg/economy';
import { META_UPGRADES, type MetaUpgrades } from '../sim/rpg/meta';
import { FORMATS } from '../sim/rpg/formats';
import { CHARACTERS } from '../sim/rpg/characters';
import { THEMES } from '../sim/course/themes';
import {
  dispersionStudy,
  buildLoadout,
  caddyEffects,
  scoreHarness,
  histogram,
  allThemeStudies,
  type DispersionStudy,
} from './lab';
import { drawScatter, drawHistogram } from './charts';

// ── tiny DOM helpers ───────────────────────────────────────────────────────────────────────
type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (typeof v === 'boolean') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) el.append(kid);
  return el;
}
const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ── styles ───────────────────────────────────────────────────────────────────────────────
const css = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0b0d12;color:#cfe3ea;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
header{display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid #1b2230;background:#0d1018;position:sticky;top:0;z-index:5}
header h1{font-size:15px;margin:0;color:#9fd8e6;letter-spacing:.5px}
header .sub{color:#6b7a85;font-size:11px}
.seg{margin-left:auto;display:flex;border:1px solid #243042;border-radius:8px;overflow:hidden}
.seg button{background:#0d1018;color:#9fb3bf;border:0;padding:6px 14px;cursor:pointer;font:inherit}
.seg button.on{background:#16314a;color:#cfeefa}
main{display:grid;grid-template-columns:380px 1fr;height:calc(100vh - 49px)}
.rail{overflow-y:auto;border-right:1px solid #1b2230;padding:12px}
.stage{position:relative;overflow:auto;padding:14px;background:#0a0c11}
.grp{border:1px solid #1b2230;border-radius:10px;margin-bottom:12px;background:#0d1018}
.grp>h2{font-size:12px;margin:0;padding:9px 12px;color:#9fd8e6;border-bottom:1px solid #1b2230;letter-spacing:.4px}
.grp>.body{padding:10px 12px}
.row{display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap}
.row label{color:#9fb3bf;min-width:74px}
button.act{background:#16314a;color:#cfeefa;border:1px solid #295070;border-radius:7px;padding:6px 12px;cursor:pointer;font:inherit}
button.act:hover{background:#1d4f73}
button.ghost{background:#11151d;color:#9fb3bf;border:1px solid #243042;border-radius:7px;padding:5px 9px;cursor:pointer;font:inherit}
button.ghost:hover{color:#cfeefa;border-color:#37506a}
input,select{background:#11151d;color:#cfe3ea;border:1px solid #243042;border-radius:6px;padding:5px 7px;font:inherit}
input[type=range]{padding:0}
input[type=number]{width:84px}
.step{display:inline-flex;align-items:center;gap:6px}
.step b{min-width:18px;text-align:center;color:#cfeefa}
.subhead{font-size:11px;color:#6b7a85;margin:8px 0 2px}
.muted{color:#6b7a85}
.pill{display:inline-block;background:#11151d;border:1px solid #243042;border-radius:20px;padding:1px 8px;color:#9fb3bf;font-size:11px}
.stat{display:flex;justify-content:space-between;border-bottom:1px dotted #1b2230;padding:3px 0}
.stat b{color:#cfeefa;font-weight:600}
iframe{width:100%;height:100%;border:1px solid #1b2230;border-radius:10px;background:#0b0d12}
canvas{width:100%;height:260px;border:1px solid #1b2230;border-radius:10px;background:#090b10;display:block;margin-bottom:10px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.note{color:#6b7a85;font-size:11px;margin-top:6px}
table{width:100%;border-collapse:collapse;font-size:12px}
td,th{text-align:left;padding:3px 6px;border-bottom:1px solid #161c27}
th{color:#9fb3bf;font-weight:500}
.delta-up{color:#7ee0a0}.delta-down{color:#ff8a8a}
@media(max-width:760px){main{grid-template-columns:1fr;height:auto}.rail{border-right:0;border-bottom:1px solid #1b2230}.cards{grid-template-columns:1fr}iframe{height:70vh}}
`;

// ── app state ──────────────────────────────────────────────────────────────────────────────
const build = { handicap: 18, meta: {} as MetaUpgrades, perks: [] as string[], characterId: '' as string };

// DOM handles filled on mount
let stageEl: HTMLElement;
let frame: HTMLIFrameElement;
let statsBox: HTMLElement; // live loadout stats in the rail
let segGame: HTMLButtonElement;
let segLab: HTMLButtonElement;

// ── DEMO: drive the real game ────────────────────────────────────────────────────────────
const seedInput = h('input', { type: 'number', value: 1234, title: 'run seed' });

/** Build the game URL with the declarative hooks (`?seed=`, `?intro=`). */
function buildGameUrl(opts: { seed?: string; intro?: '0' | '1' } = {}): string {
  const p = new URLSearchParams();
  const seed = opts.seed ?? String(seedInput.value || '').trim();
  if (seed) p.set('seed', seed); // hook: ?seed=
  if (opts.intro) p.set('intro', opts.intro); // hook: ?intro=
  const q = p.toString();
  return `index.html${q ? '?' + q : ''}`;
}
function loadGame(opts: { seed?: string; intro?: '0' | '1' } = {}): void {
  setView('game');
  frame.src = buildGameUrl(opts);
}

/** The iframe's window — same-origin, so the live escape-hatch flags can be set on it directly. */
function gameWin(): (Window & Record<string, unknown>) | null {
  try {
    return (frame.contentWindow as unknown as Window & Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}
// Live hooks: write the game's window._gs* escape-hatches. Read by the running app on its next
// render/animation, so they take effect on the next in-game action (documented in the rail).
function setFeel(patch: object): void {
  const w = gameWin();
  if (w) w._gsFeel = { ...(w._gsFeel as object), ...patch }; // hook: _gsFeel
}
function setIntroFeel(patch: object): void {
  const w = gameWin();
  if (w) w._gsIntro = { ...(w._gsIntro as object), ...patch }; // hook: _gsIntro
}
function setSprayCentral(pct: number): void {
  const w = gameWin();
  if (w) w._gsSpray = { centralPct: pct }; // hook: _gsSpray
}
function setArt(patch: object): void {
  const w = gameWin();
  if (w) w._gsArt = { ...(w._gsArt as object), ...patch }; // hook: _gsArt
}
// Force a caddy-guard interception on EVERY shot (GS-caddy) so the boomerang/laser throw can be
// watched on demand — rides `_gsFeel.forceRedirect` (no new top-level hook). '' turns it off.
function setForceRedirect(kind: '' | 'boomerang' | 'laser'): void {
  setFeel({ forceRedirect: kind });
}

function demoGroup(): HTMLElement {
  const sprayVal = h('span', { class: 'pill' }, '80%');
  return group('Demo · drive the real game', [
    h('div', { class: 'row' }, h('label', {}, 'Seed'), seedInput,
      h('button', { class: 'act', onclick: () => loadGame() }, 'Load'),
      h('button', { class: 'ghost', onclick: () => { seedInput.value = String(Math.floor(Math.random() * 1e6)); loadGame(); } }, '🎲')),
    h('div', { class: 'row' }, h('label', {}, 'Intro'),
      h('button', { class: 'ghost', onclick: () => loadGame({ intro: '1' }) }, 'Replay (?intro=1)'),
      h('button', { class: 'ghost', onclick: () => loadGame({ intro: '0' }) }, 'Skip (?intro=0)')),
    h('div', { class: 'row' },
      h('button', { class: 'ghost', onclick: () => frame.contentWindow?.location.reload() }, 'Reload'),
      h('button', { class: 'ghost', onclick: () => window.open(buildGameUrl(), '_blank') }, 'Open ↗')),
    h('div', { class: 'row' }, h('label', {}, 'Spray %'),
      h('input', {
        type: 'range', min: 40, max: 96, value: 80, style: 'flex:1',
        oninput: (e) => { const v = +(e.target as HTMLInputElement).value; sprayVal.textContent = v + '%'; setSprayCentral(v); },
      }), sprayVal),
    h('div', { class: 'row' },
      h('button', { class: 'ghost', onclick: () => setFeel({ shake: 0 }) }, 'Feel: no shake'),
      h('button', { class: 'ghost', onclick: () => setFeel({ shake: 1.6 }) }, 'Feel: max shake'),
      h('button', { class: 'ghost', onclick: () => setIntroFeel({ speed: 3 }) }, 'Intro 3×')),
    h('div', { class: 'row' }, h('label', {}, 'Art'),
      h('button', { class: 'ghost', onclick: () => setArt({ ink: false }) }, 'No ink'),
      h('button', { class: 'ghost', onclick: () => setArt({ stripes: false, texture: 0, accents: 0 }) }, 'Flat'),
      h('button', { class: 'ghost', onclick: () => setArt({ stripes: true, ink: true, texture: 2, accents: 2 }) }, 'Lush')),
    h('div', { class: 'row' }, h('label', {}, 'Guard throw'),
      h('button', { class: 'ghost', onclick: () => setForceRedirect('boomerang') }, '🪃 Convict Sheep'),
      h('button', { class: 'ghost', onclick: () => setForceRedirect('laser') }, '🔫 Space Ducks'),
      h('button', { class: 'ghost', onclick: () => setForceRedirect('') }, 'Off')),
    h('p', { class: 'note' }, 'Guard throw forces the caddy interception (boomerang/laser) on EVERY shot so you can watch it — start a run and take a shot. Live _gsFeel / _gsIntro / _gsSpray / _gsArt flags apply on the next render/shot; seed & intro reload the frame.'),
  ]);
}

// ── LOADOUT & UPGRADES builder ───────────────────────────────────────────────────────────
function refreshStats(): void {
  const b = buildLoadout(build);
  const driver = b.clubs.find((c) => c.id === 'D')!;
  // Every named caddy (GS-caddy) folds a field into the loadout; surface the active ones so toggling
  // a caddy in the perks list SHOWS what it changed (the per-caddy lens onto the loadout).
  const caddy = caddyEffects(b.loadout);
  statsBox.replaceChildren(
    stat('Net dispersion', fmt(b.netDispersion, 3) + '×'),
    stat('Handicap', String(b.handicap)),
    stat('Driver carry', driver.carry + ' yd'),
    stat('Credit mult', '×' + fmt(b.creditMult, 2)),
    stat('Auto-putt', b.autoPutt ? 'yes' : 'no'),
    ...(caddy.length
      ? [
          h('div', { class: 'subhead', style: 'margin:8px 0 2px' }, 'Caddy effects'),
          ...caddy.map((e) =>
            h('div', { class: 'stat', title: e.detail }, h('span', { class: 'muted' }, e.label), h('b', {}, e.detail))),
        ]
      : []),
  );
}
function loadoutGroup(): HTMLElement {
  const hcapVal = h('b', {}, '18');
  const hcap = h('input', {
    type: 'range', min: 0, max: 36, value: 18, style: 'flex:1',
    oninput: (e) => { build.handicap = +(e.target as HTMLInputElement).value; hcapVal.textContent = String(build.handicap); refreshStats(); },
  });

  // Selected golfer (GS-18) — bakes its bag/dispersion tweak into the build, and (in the dispersion
  // study) its per-club fade/hook + spread shape, all read straight from the CHARACTERS table.
  const charSel = selectFrom([['', 'None (neutral)'], ...CHARACTERS.map((c): [string, string] => [c.id, c.name])], '');
  charSel.onchange = () => { build.characterId = charSel.value; refreshStats(); };

  // permanent meta-upgrade steppers (0..maxLevel) — derived from META_UPGRADES
  const metaRows = META_UPGRADES.map((u) =>
    stepper(u.name, u.desc, u.maxLevel, () => build.meta[u.id] ?? 0, (n) => { build.meta = { ...build.meta, [u.id]: n }; refreshStats(); }));

  // shop perks — uniques toggle 0/1, stackables 0..maxStacks; perks[] is a multiset
  const perkRows = SHOP_ITEMS.map((it: ShopItem) => {
    const cap = itemCap(it);
    const max = cap === Infinity ? 9 : cap;
    return stepper(
      `${it.name}${it.stackable ? ' ✦' : ''}`,
      it.desc,
      max,
      () => ownedCount(build.perks, it.id),
      (n) => {
        build.perks = build.perks.filter((p) => p !== it.id);
        for (let i = 0; i < n; i++) build.perks.push(it.id);
        refreshStats();
      },
    );
  });

  // reward clubs (GS-clubs) — toggle a club into the built bag (it equips/replaces its type). Read
  // straight from the CLUB_ITEMS table so the catalogue can't fork from the game.
  const clubRows = CLUB_ITEMS.map((it: ShopItem) =>
    stepper(
      it.name,
      it.desc,
      1,
      () => ownedCount(build.perks, it.id),
      (n) => {
        build.perks = build.perks.filter((p) => p !== it.id);
        for (let i = 0; i < n; i++) build.perks.push(it.id);
        refreshStats();
      },
    ),
  );

  statsBox = h('div', {});
  return group('Loadout · clubs / path / skill upgrades', [
    h('div', { class: 'row' }, h('label', {}, 'Golfer'), charSel),
    h('div', { class: 'row' }, h('label', {}, 'Handicap'), hcap, hcapVal),
    h('div', { class: 'subhead' }, 'Permanent (meta · shards)'),
    ...metaRows,
    h('div', { class: 'subhead' }, 'Run perks (✦ = stackable)'),
    ...perkRows,
    h('div', { class: 'subhead' }, 'Reward clubs (equip into the bag)'),
    ...clubRows,
    h('div', { class: 'grp', style: 'margin-top:10px' }, h('div', { class: 'body' }, statsBox)),
  ]);
}

// ── DISPERSION study panel ────────────────────────────────────────────────────────────────
const clubSel = selectFrom(CLUBS.map((c) => [c.id, `${c.name} (${c.carry})`]), 'D');
const lieSel = selectFrom(Object.keys(LIE_INFO).filter((k) => !LIE_INFO[k]!.penalty).map((k) => [k, LIE_INFO[k]!.label]), 'fairway');
// Pick a star-travel theme (GS-17) to fire under its world's gravity (its resolved biome carry).
const themeSel = selectFrom(
  [['', 'None (earth-g)'], ...THEMES.map((t): [string, string] => [t.id, `${t.name} · ${t.archetype} ${t.rarity}`])],
  '',
);
const nSel = selectFrom([['100', '100'], ['1000', '1000'], ['5000', '5000'], ['20000', '20000']], '1000');
const windSpd = h('input', { type: 'number', value: 0, style: 'width:64px', title: 'wind mph' });
const windDir = h('input', { type: 'number', value: 0, style: 'width:64px', title: 'wind dir°' });
const useBuild = h('input', { type: 'checkbox', checked: true, title: 'apply the built loadout' });

function runDispersion(): void {
  const spd = +windSpd.value || 0;
  const study = dispersionStudy(String(clubSel.value), {
    n: +nSel.value,
    lie: String(lieSel.value),
    wind: spd ? { spd, dir: +windDir.value || 0 } : undefined,
    // The chosen theme sets the world's gravity (its resolved biome carry) — GS-17.
    themeId: String(themeSel.value) || undefined,
    loadout: (useBuild as HTMLInputElement).checked ? buildLoadout(build).loadout : undefined,
    // Apply the golfer's per-club SHAPE (fade/hook + spread) only when using the built loadout.
    characterId: (useBuild as HTMLInputElement).checked ? build.characterId : undefined,
  });
  showDispersion(study);
}
function dispersionGroup(): HTMLElement {
  return group('Sim Lab · shot dispersion', [
    h('div', { class: 'row' }, h('label', {}, 'Club'), clubSel),
    h('div', { class: 'row' }, h('label', {}, 'Swings'), nSel, h('label', { style: 'min-width:auto' }, 'Lie'), lieSel),
    h('div', { class: 'row' }, h('label', {}, 'World'), themeSel),
    h('div', { class: 'row' }, h('label', {}, 'Wind'), windSpd, h('span', { class: 'muted' }, 'mph @'), windDir, h('span', { class: 'muted' }, 'deg')),
    h('div', { class: 'row' }, h('label', { style: 'min-width:auto' }, useBuild, ' use built loadout')),
    h('div', { class: 'row' }, h('button', { class: 'act', onclick: runDispersion }, 'Fire ▶')),
    h('p', { class: 'note' }, 'Fires one club N times via the real resolveShot. Amber = intended target; cloud = where balls finished.'),
  ]);
}

// ── SCORING harness panel ────────────────────────────────────────────────────────────────
const seedsSel = selectFrom([['20', '20'], ['60', '60'], ['150', '150'], ['400', '400']], '60');
const formatSel = selectFrom(Object.values(FORMATS).map((f) => [f.id, f.name]), 'flat');
function runScoring(): void {
  const seeds = +seedsSel.value;
  const formatId = String(formatSel.value);
  const base = scoreHarness({ seeds, formatId });
  const withBuild = scoreHarness({ seeds, formatId, meta: build.meta, perks: build.perks, characterId: build.characterId });
  showScoring(base, withBuild);
}
function scoringGroup(): HTMLElement {
  return group('Sim Lab · scoring harness', [
    h('div', { class: 'row' }, h('label', {}, 'Seeds'), seedsSel, h('label', { style: 'min-width:auto' }, 'Format'), formatSel),
    h('div', { class: 'row' }, h('button', { class: 'act', onclick: runScoring }, 'Simulate ▶')),
    h('p', { class: 'note' }, 'Runs N seeded runs through the real simulateRun with your built loadout, vs a baseline. Headline = mean per-stop Stableford (the project’s balance metric).'),
  ]);
}

// ── THEME browser panel (GS-17) ─────────────────────────────────────────────────────────────
// Browse every star-travel theme and the rarity-tiered, flavoured biome it resolves to — the real
// `resolveBiome` via lab.allThemeStudies(), so the table can't drift from what the game generates.
function showThemes(): void {
  setView('lab');
  const studies = allThemeStudies();
  const rarOrder: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
  studies.sort((a, b) => a.arc - b.arc || rarOrder[a.rarity]! - rarOrder[b.rarity]! || a.name.localeCompare(b.name));
  const head = ['Theme', 'arc', 'rarity', 'world', 'carry', 'windB', 'windW', 'fairway', 'dogleg', 'trees', 'sand', 'sky'];
  stageEl.replaceChildren(
    h('h2', { style: 'color:#9fd8e6;font-size:14px;margin:0 0 10px' },
      `${studies.length} star-travel themes · resolved biome physics (real resolveBiome)`),
    h('table', {},
      h('tr', {}, ...head.map((c) => h('th', {}, c))),
      ...studies.map((t) =>
        h('tr', {},
          h('td', {}, t.name),
          h('td', {}, String(t.arc)),
          h('td', {}, t.rarity),
          h('td', {}, t.archetype),
          h('td', {}, fmt(t.biome.carryMult, 2)),
          h('td', {}, fmt(t.biome.windBase, 0)),
          h('td', {}, fmt(t.biome.windWild, 0)),
          h('td', {}, fmt(t.biome.fairwayWidthMult, 2)),
          h('td', {}, fmt(t.biome.doglegBias, 2)),
          h('td', {}, fmt(t.biome.treeDensity, 1)),
          h('td', {}, fmt(t.biome.fairwayBunkers, 1)),
          h('td', {}, t.hasFigure ? '✦' : '·'))),
    ),
    h('p', { class: 'note' }, 'Arc by constellation star count (deep-sky/galaxy by rarity). carry = gravity; windB/W = base/wild wind; fairway = corridor width mult; ✦ = draws a constellation in the sky.'),
  );
}
function themeGroup(): HTMLElement {
  return group('Sim Lab · theme browser', [
    h('div', { class: 'row' }, h('button', { class: 'act', onclick: showThemes }, 'Browse themes ▶')),
    h('p', { class: 'note' }, 'Every constellation/galaxy theme and the flavoured, rarity-tiered biome it generates — straight from the real resolveBiome.'),
  ]);
}

// ── stage renderers ────────────────────────────────────────────────────────────────────────
function showDispersion(study: DispersionStudy): void {
  setView('lab');
  const scatter = h('canvas');
  const hist = h('canvas');
  const c = study.carry;
  const l = study.lateral;
  stageEl.replaceChildren(
    h('h2', { style: 'color:#9fd8e6;font-size:14px;margin:0 0 10px' },
      `${study.clubName} · ${study.n.toLocaleString()} swings · ${study.lie}${study.wind ? ` · wind ${study.wind.spd}mph@${study.wind.dir}°` : ''} · disp ×${fmt(study.dispersionMult, 2)}`),
    h('div', { class: 'cards' }, scatter, hist),
    h('table', {},
      h('tr', {}, h('th', {}, ''), h('th', {}, 'mean'), h('th', {}, 'σ'), h('th', {}, 'min'), h('th', {}, 'p10'), h('th', {}, 'p90'), h('th', {}, 'max')),
      statRow('Carry (yd)', c),
      statRow('Lateral (yd)', l),
    ),
    h('p', { class: 'note' }, `Intended carry ${Math.round(study.intended)} yd. 2σ lateral cone ≈ ±${Math.round(2 * l.sd)} yd. Carry range ${Math.round(c.min)}–${Math.round(c.max)} yd (the “can come up short” tail).`),
    study.redirectRate !== undefined
      ? h('p', { class: 'note', style: 'color:#7ee0a0' },
          `Caddy guard (${study.guardKind}): ${fmt(study.redirectRate * 100, 1)}% of shots knocked back to the green (red = the would-be miss saved). Hire Space Ducks / Convict Sheep in the loadout to see it.`)
      : h('p', { class: 'note' }, 'Tip: add Space Ducks or Convict Sheep in the loadout to see the guard interception rate here.'),
  );
  // draw after layout so the canvas has its CSS size
  requestAnimationFrame(() => {
    drawScatter(scatter, study);
    drawHistogram(hist, histogram(study.samples.map((s) => s.carry), 30));
  });
}

function showScoring(base: ReturnType<typeof scoreHarness>, mod: ReturnType<typeof scoreHarness>): void {
  setView('lab');
  const dRow = (label: string, a: number, b: number, d = 2) => {
    const delta = b - a;
    return h('tr', {},
      h('td', {}, label),
      h('td', {}, fmt(a, d)),
      h('td', {}, fmt(b, d)),
      h('td', { class: delta >= 0 ? 'delta-up' : 'delta-down' }, (delta >= 0 ? '+' : '') + fmt(delta, d)));
  };
  stageEl.replaceChildren(
    h('h2', { style: 'color:#9fd8e6;font-size:14px;margin:0 0 10px' }, `Scoring · ${base.seeds} seeded runs each`),
    h('table', {},
      h('tr', {}, h('th', {}, 'metric'), h('th', {}, 'baseline'), h('th', {}, 'your build'), h('th', {}, 'Δ')),
      dRow('Mean Stableford / stop', base.meanStablefordPerStop, mod.meanStablefordPerStop),
      dRow('Mean stops survived', base.meanStops, mod.meanStops),
      dRow('Mean distance', base.meanDistance, mod.meanDistance, 0),
      dRow('Blow-up rate', base.blowUpRate, mod.blowUpRate, 3),
    ),
    h('p', { class: 'note' }, 'Baseline = no meta/perks. A real upgrade should push mean Stableford/stop UP (green Δ). Distance is chaotic — judge on Stableford (CLAUDE.md).'),
  );
}

function gameStage(): void {
  stageEl.replaceChildren(frame);
}

// ── view toggle ─────────────────────────────────────────────────────────────────────────
function setView(v: 'game' | 'lab'): void {
  segGame.classList.toggle('on', v === 'game');
  segLab.classList.toggle('on', v === 'lab');
  if (v === 'game') gameStage();
}

// ── small UI factories ────────────────────────────────────────────────────────────────────
function group(title: string, body: (Node | string)[]): HTMLElement {
  return h('div', { class: 'grp' }, h('h2', {}, title), h('div', { class: 'body' }, ...body));
}
function stat(k: string, v: string): HTMLElement {
  return h('div', { class: 'stat' }, h('span', { class: 'muted' }, k), h('b', {}, v));
}
function statRow(label: string, s: { mean: number; sd: number; min: number; max: number; p10: number; p90: number }): HTMLElement {
  return h('tr', {}, h('td', {}, label),
    h('td', {}, fmt(s.mean, 1)), h('td', {}, fmt(s.sd, 1)), h('td', {}, fmt(s.min, 1)),
    h('td', {}, fmt(s.p10, 1)), h('td', {}, fmt(s.p90, 1)), h('td', {}, fmt(s.max, 1)));
}
function selectFrom(opts: [string, string][], value: string): HTMLSelectElement {
  const s = h('select', {}, ...opts.map(([v, label]) => h('option', { value: v }, label)));
  s.value = value;
  return s;
}
function stepper(name: string, desc: string, max: number, get: () => number, set: (n: number) => void): HTMLElement {
  const b = h('b', {}, String(get()));
  const dec = h('button', { class: 'ghost', onclick: () => { const n = Math.max(0, get() - 1); set(n); b.textContent = String(n); } }, '−');
  const inc = h('button', { class: 'ghost', onclick: () => { const n = Math.min(max, get() + 1); set(n); b.textContent = String(n); } }, '+');
  return h('div', { class: 'row', title: desc },
    h('span', { class: 'step' }, dec, b, inc),
    h('span', { style: 'flex:1' }, name),
    h('span', { class: 'muted', style: 'font-size:10px' }, `/${max}`));
}

// ── mount ──────────────────────────────────────────────────────────────────────────────────
function mount(): void {
  document.head.append(h('style', { html: css }));
  document.title = 'Golf Stars — Test Hub';

  frame = h('iframe', { src: buildGameUrl(), title: 'Golf Stars (live build)' });
  segGame = h('button', { class: 'on', onclick: () => setView('game') }, 'Game');
  segLab = h('button', { onclick: () => setView('lab') }, 'Sim Lab');

  const rail = h('div', { class: 'rail' }, demoGroup(), loadoutGroup(), dispersionGroup(), scoringGroup(), themeGroup());
  stageEl = h('div', { class: 'stage' }, frame);

  document.body.append(
    h('header', {},
      h('h1', {}, '⛳ GOLF STARS'),
      h('span', { class: 'sub' }, 'test & demo hub'),
      h('div', { class: 'seg' }, segGame, segLab)),
    h('main', {}, rail, stageEl),
  );
  refreshStats();
}

mount();

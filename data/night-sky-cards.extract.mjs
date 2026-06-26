// Extract the night-sky card data from index.html into a project-agnostic
// catalogue (JSON + Markdown). Slices the pure data consts, evals them in a vm,
// strips app-specific framing, and re-emits a self-contained reference.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = process.argv[2] || '.';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// --- balanced-expression slicer: read `const NAME = <expr>;` from the file ---
function sliceConst(name){
  const re = new RegExp('const\\s+' + name + '\\s*=');
  const m = re.exec(html);
  if(!m) throw new Error('not found: ' + name);
  let i = m.index + m[0].length;
  // skip to first non-space
  while(/\s/.test(html[i])) i++;
  const start = i;
  let depth = 0, str = null, esc = false;
  for(; i < html.length; i++){
    const c = html[i], n = html[i+1];
    if(str){
      if(esc){ esc = false; continue; }
      if(c === '\\'){ esc = true; continue; }
      if(c === str) str = null;
      continue;
    }
    if(c === '/' && n === '/'){ while(i < html.length && html[i] !== '\n') i++; continue; }
    if(c === '/' && n === '*'){ i += 2; while(i < html.length && !(html[i] === '*' && html[i+1] === '/')) i++; i++; continue; }
    if(c === '"' || c === "'" || c === '`'){ str = c; continue; }
    if(c === '[' || c === '{' || c === '(') depth++;
    else if(c === ']' || c === '}' || c === ')') depth--;
    else if(c === ';' && depth === 0) break;
  }
  return html.slice(start, i);
}

const NEEDED = ['STAR_FIGURES','STAR_LOOSE','CONST_INFO','DEEPSKY','SEASON_MARKERS',
  'SKY_EVENTS','COMETS','SHOWERS','SKY_RARITY','PLANETS','MAGELLANIC','GAL_CORE'];
const sandbox = {};
for(const n of NEEDED){ vm.runInNewContext('var ' + n + ' = ' + sliceConst(n) + ';', sandbox); }
const D = sandbox;

// --- helpers -----------------------------------------------------------------
const rar = s => s || 'common';
const rows2obj = rows => (rows || []).map(r => ({ heading: r[0], text: r[1] }));

// Constellations: merge STAR_FIGURES geometry with CONST_INFO lore.
const constellations = D.STAR_FIGURES.filter(f => D.CONST_INFO[f.n]).map(f => {
  const ci = D.CONST_INFO[f.n];
  // brightest (lowest-mag) star = the label/position anchor
  let anc = f.s[0]; for(const s of f.s) if(s[3] < anc[3]) anc = s;
  return {
    name: f.n,
    abbreviation: ci.abbr,
    icon: ci.icon,
    rarity: rar(ci.rar),
    minAltitudeDeg: ci.vis ?? 6,
    anchorStar: anc[0],
    meaning: ci.meaning,
    culture: ci.culture,
    howToFind: ci.find,
    bestSeen: ci.season,
    brightestStar: ci.bright,
    funFact: ci.fun || null,
    stars: f.s.map(s => ({ name: s[0], raDeg: s[1], decDeg: s[2], mag: s[3] })),
    lines: f.l || []   // index pairs into `stars`
  };
});

// Bright loose stars (no figure attached).
const brightStars = D.STAR_LOOSE.map(s => ({ name: s[0], raDeg: s[1], decDeg: s[2], mag: s[3] }));

// Deep-sky showpieces.
const DSO_TAG = { nebula:'Nebula', dark:'Dark nebula', globular:'Globular cluster', open:'Open cluster', galaxy:'Galaxy' };
const deepSky = D.DEEPSKY.map(d => ({
  name: d.n,
  type: DSO_TAG[d.type] || d.type,
  icon: d.icon,
  rarity: rar(d.rar),
  raDeg: d.ra,
  decDeg: d.dec,
  minAltitudeDeg: d.vis ?? 8,
  instrument: d.eye === 'binoc' ? 'binoculars' : 'naked eye',
  blurb: d.blurb,
  details: rows2obj(d.rows)
}));

// Naked-eye galaxy features that aren't single-point deep-sky objects.
const galaxyFeatures = [
  { key:'milkyway', name:'Milky Way core', icon:'🌠', rarity:'rare',
    anchor:{ raDeg: D.GAL_CORE.ra, decDeg: D.GAL_CORE.dec, label:'Galactic centre (in Sagittarius)' },
    blurb:'The bright centre of our galaxy. Winter (Jun–Aug) is prime season from the southern hemisphere.' },
  { key:'magellanic', name:'Magellanic Clouds', icon:'☁️', rarity:'rare',
    anchor: D.MAGELLANIC.map(m => ({ name:m.n, raDeg:m.ra, decDeg:m.dec, sizeDeg:m.sz })),
    blurb:'Two naked-eye companion dwarf galaxies circling the south celestial pole; they look like detached wisps of Milky Way. Southern-hemisphere only.' }
];

// Planets (orbital elements dropped — position is computed; keep the descriptive note + rarity).
const PLANET_RARITY = { venus:'common', jupiter:'common', mars:'rare', saturn:'rare', mercury:'rare' };
const planets = ['mercury','venus','mars','jupiter','saturn'].map(k => ({
  name: D.PLANETS[k].label,
  key: k,
  colour: D.PLANETS[k].dot || null,
  rarity: PLANET_RARITY[k],
  note: D.PLANETS[k].note,
  positionNote: 'Computed at runtime from orbital elements (geocentric alt/az for the observer).'
}));

// Meteor showers.
const meteorShowers = D.SHOWERS.map(s => ({
  name: s.n,
  rarity: 'epic',
  peak: { month: s.peak[0], day: s.peak[1] },
  window: { start:{ month:s.start[0], day:s.start[1] }, end:{ month:s.end[0], day:s.end[1] } },
  zhr: s.zhr,
  radiant: { raDeg: s.ra, decDeg: s.dec },
  note: s.note
}));

// Comet apparitions (absolute dated windows).
const comets = D.COMETS.map(c => ({
  name: c.n,
  icon: c.icon,
  rarity: rar(c.rar || 'epic'),
  instrument: c.eye === 'binoc' ? 'binoculars' : 'naked eye',
  start: c.start, peak: c.peak, end: c.end,   // [year, month, day]
  peakMag: c.mag,
  note: c.note
}));

// Curated one-off dated events (eclipses, asteroid flyby, …).
const oneOffEvents = D.SKY_EVENTS.map(e => ({
  name: e.name,
  date: e.date,   // [year, month, day]
  rarity: rar(e.rar),
  icon: e.icon,
  blurb: e.blurb,
  details: rows2obj(e.rows)
}));

// Solstices & equinoxes.
const seasonMarkers = D.SEASON_MARKERS.map(s => ({
  name: s.name,
  icon: s.icon,
  rarity: 'rare',
  date: { month: s.m, day: s.d },
  note: s.note,
  stargazerNote: s.star
}));

// Computed / live recurring events — position & timing are derived at runtime, so
// these are descriptive entries (rarity from the app's curation table + lore).
const recurringEvents = [
  { key:'aurora', name:'Aurora Australis', icon:'🌌', rarity:D.SKY_RARITY.aurora,
    trigger:'Live geomagnetic activity (NOAA Kp index).',
    blurb:'The Southern Lights — curtains of colour where solar particles strike the upper atmosphere.',
    details:[
      {heading:'What causes it', text:'Charged particles from the Sun funnel down Earth’s magnetic field near the poles and excite oxygen and nitrogen 100–300 km up, which glow green, red and purple.'},
      {heading:'Where to see it', text:'From high southern latitudes it is a regular treat on stormy nights; from lower latitudes it takes a strong geomagnetic storm (high Kp) and hugs the southern horizon.'},
      {heading:'The numbers', text:'The Kp index (0–9) measures geomagnetic activity; higher Kp is needed to reach lower latitudes.'}] },
  { key:'flare', name:'Solar Flare', icon:'☀️', rarity:D.SKY_RARITY.flare,
    trigger:'Live GOES X-ray flux (M-class and above).',
    blurb:'A sudden burst of radiation from a magnetic storm on the Sun; strong flares can disrupt radio and, a day or two later, light up the aurora.',
    details:[
      {heading:'Classes', text:'Flares are graded by X-ray brightness: C (minor), M (medium), X (major).'},
      {heading:'Effects', text:'Strong M/X flares ionise the upper atmosphere (radio blackouts) and, via a CME, can trigger geomagnetic storms and aurora 1–3 days later.'},
      {heading:'Safety', text:'Never look at the Sun directly or through optics without proper solar filters.'}] },
  { key:'iss', name:'Space Station (ISS) pass', icon:'🛰', rarity:D.SKY_RARITY.iss,
    trigger:'Live orbital position above the observer’s horizon, while sunlit.',
    blurb:'The International Space Station — a bright, steadily-moving point that never blinks, visible only while sunlit (within ~2h of dusk or dawn).',
    details:[
      {heading:'What you’re seeing', text:'A spacecraft circling Earth every ~90 minutes at 28,000 km/h, shining by reflected sunlight.'},
      {heading:'Telling it apart', text:'No flashing lights, no sound; it moves steadily and fades out as it enters Earth’s shadow.'}] },
  { key:'fullmoon', name:'Full Moon', icon:'🌕', rarity:D.SKY_RARITY.fullmoon,
    trigger:'Computed next full-moon date (within ~2 weeks).',
    blurb:'The Moon stands opposite the Sun and shines all night — brilliant, but it floods out the fainter sky.', details:[] },
  { key:'newmoon', name:'New Moon', icon:'🌑', rarity:D.SKY_RARITY.newmoon,
    trigger:'Computed next new-moon date (within ~2 weeks).',
    blurb:'The Moon rides with the Sun and leaves the night sky truly dark — the best window of the month for stargazing.', details:[] },
  { key:'supermoon', name:'Supermoon', icon:'🌕', rarity:D.SKY_RARITY.supermoon,
    trigger:'Computed: a full moon near perigee (distance ≤ ~361,500 km).',
    blurb:'A full Moon near its closest point to Earth, so it appears up to ~7% wider and ~15% brighter than average.', details:[] },
  { key:'conjunction', name:'Planetary Conjunction', icon:'🪐', rarity:D.SKY_RARITY.conjunction,
    trigger:'Computed: two planets within a few degrees in the sky (upcoming).',
    blurb:'Two worlds drift close together in the sky — a striking naked-eye pairing for a few evenings (a line-of-sight meeting only).', details:[] },
  { key:'moon', name:'The Moon', icon:'🌙', rarity:D.SKY_RARITY.moon,
    trigger:'Always present; phase + position computed at runtime.',
    blurb:'Earth’s only natural satellite and the brightest thing in the night sky; cycles new → full → new every 29.5 days.', details:[] },
  { key:'opp-mars', name:'Mars at Opposition', icon:'🪐', rarity:D.SKY_RARITY['opp-mars'],
    trigger:'Computed: Earth between the Sun and Mars (±~3-week window).',
    blurb:'Earth sweeps past Mars on the inside track — the red planet at its closest and brightest, up all night. Recurs roughly every 26 months.', details:[] },
  { key:'opp-jupiter', name:'Jupiter at Opposition', icon:'🪐', rarity:D.SKY_RARITY['opp-jupiter'],
    trigger:'Computed: Earth between the Sun and Jupiter (±~3-week window).',
    blurb:'Jupiter opposite the Sun — biggest, brightest and visible all night long.', details:[] },
  { key:'opp-saturn', name:'Saturn at Opposition', icon:'🪐', rarity:D.SKY_RARITY['opp-saturn'],
    trigger:'Computed: Earth between the Sun and Saturn (±~3-week window).',
    blurb:'The ringed planet at opposition — its brightest, best-placed night of the year.', details:[] }
];

const catalogue = {
  meta: {
    title: 'Southern-sky night-sky object & event catalogue',
    description: 'A self-contained reference list of night-sky cards: constellations, deep-sky objects, planets and astronomical events, with positions (equatorial J2000), dates and curation metadata. Project-agnostic — no host-app code or hooks.',
    generated: '2026-06-26',
    coordinateSystem: 'Equatorial J2000. raDeg = right ascension in degrees (0–360); decDeg = declination in degrees (−90..+90).',
    hemisphere: 'Curated and worded for southern-hemisphere observers (Australia framing), but the coordinates are universal.',
    fields: {
      rarity: 'Optional curation/loot grade: common, rare, epic, legendary (rarest = legendary). Drop it if your project has no rarity concept.',
      minAltitudeDeg: 'Minimum altitude (degrees above the horizon) of the anchor star/object before it is considered "up" / worth surfacing.',
      instrument: '"naked eye" or "binoculars" — the minimum optics to appreciate the object.',
      lines: 'Constellation stick-figure connections: pairs of zero-based indices into that constellation\'s `stars` array.',
      dateArrays: 'Absolute dates are [year, month, day]; recurring annual dates are {month, day} (1-based month).'
    },
    counts: {}
  },
  constellations,
  brightStars,
  deepSky,
  galaxyFeatures,
  planets,
  events: {
    meteorShowers,
    comets,
    oneOffEvents,
    seasonMarkers,
    recurring: recurringEvents
  }
};
catalogue.meta.counts = {
  constellations: constellations.length,
  brightStars: brightStars.length,
  deepSky: deepSky.length,
  galaxyFeatures: galaxyFeatures.length,
  planets: planets.length,
  meteorShowers: meteorShowers.length,
  comets: comets.length,
  oneOffEvents: oneOffEvents.length,
  seasonMarkers: seasonMarkers.length,
  recurringEvents: recurringEvents.length
};

const OUT = process.argv[3] || ROOT;
fs.writeFileSync(path.join(OUT, 'night-sky-cards.json'), JSON.stringify(catalogue, null, 2) + '\n');
console.log('counts', catalogue.meta.counts);

// --- Markdown companion ------------------------------------------------------
const md = [];
const P = (...a) => md.push(a.join(''));
const MON = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const date3 = d => `${d[2]} ${MON[d[1]]} ${d[0]}`;
const mday = o => `${o.day} ${MON[o.month]}`;

P('# Night-sky cards — reference catalogue\n');
P('A self-contained, project-agnostic list of the night-sky objects and events behind the “night mode” cards: ');
P('constellations, deep-sky objects, planets and dated/recurring events, with positions (equatorial **J2000**, degrees), ');
P('dates and curation metadata. The machine-readable version is **`night-sky-cards.json`** alongside this file.\n');
P('- **Coordinates:** `raDeg` = right ascension (0–360°), `decDeg` = declination (−90..+90°), J2000. Convert to alt/az for an observer/time at import.');
P('- **`minAltitudeDeg`:** how high the object must be before it counts as “up”.');
P('- **`rarity`:** optional curation grade (`common` → `rare` → `epic` → `legendary`). Ignore if you have no such concept.');
P('- **`lines`** (constellations): stick-figure links as index pairs into that figure’s `stars`.');
P('- **Dates:** absolute = `[year, month, day]`; annual = `{month, day}`.\n');

P('## Contents\n');
for(const [k,v] of Object.entries(catalogue.meta.counts)) P(`- **${k}**: ${v}`);
P('');

P('## Constellations\n');
P('| Constellation | Abbr | Rarity | Min alt° | Anchor (brightest) star | Best seen |');
P('| --- | --- | --- | --- | --- | --- |');
for(const c of constellations) P(`| ${c.name} | ${c.abbreviation} | ${c.rarity} | ${c.minAltitudeDeg} | ${c.anchorStar} | ${c.bestSeen.replace(/\|/g,'/')} |`);
P('');
P('Each constellation in the JSON also carries its full star list (`name, raDeg, decDeg, mag`), the stick-figure `lines`, and lore (`meaning, culture, howToFind, bestSeen, brightestStar, funFact`). Star counts:\n');
for(const c of constellations) P(`- **${c.name}** — ${c.stars.length} stars, ${c.lines.length} figure lines.`);
P('');

P('## Deep-sky objects\n');
P('| Object | Type | RA° | Dec° | Min alt° | Optics | Rarity |');
P('| --- | --- | --- | --- | --- | --- | --- |');
for(const d of deepSky) P(`| ${d.name} | ${d.type} | ${d.raDeg} | ${d.decDeg} | ${d.minAltitudeDeg} | ${d.instrument} | ${d.rarity} |`);
P('');

P('## Naked-eye galaxy features\n');
for(const g of galaxyFeatures){
  const anc = Array.isArray(g.anchor) ? g.anchor.map(a=>`${a.name||a.label} (RA ${a.raDeg}°, Dec ${a.decDeg}°)`).join('; ') : `RA ${g.anchor.raDeg}°, Dec ${g.anchor.decDeg}° — ${g.anchor.label}`;
  P(`- **${g.name}** (${g.rarity}) — ${anc}. ${g.blurb}`);
}
P('');

P('## Planets\n');
P('| Planet | Rarity | Note |');
P('| --- | --- | --- |');
for(const p of planets) P(`| ${p.name} | ${p.rarity} | ${p.note} |`);
P('\n_Positions are computed from orbital elements per observer/time, so no fixed coordinates are listed. The Moon is handled as a recurring event (below)._\n');

P('## Events — meteor showers\n');
P('| Shower | Peak | Active window | ZHR | Radiant RA° | Radiant Dec° | Note |');
P('| --- | --- | --- | --- | --- | --- | --- |');
for(const s of meteorShowers) P(`| ${s.name} | ${mday(s.peak)} | ${mday(s.window.start)} – ${mday(s.window.end)} | ${s.zhr} | ${s.radiant.raDeg} | ${s.radiant.decDeg} | ${s.note} |`);
P('');

P('## Events — comet apparitions (dated)\n');
P('| Comet | Trackable | Peak | Fades by | Peak mag | Optics |');
P('| --- | --- | --- | --- | --- | --- |');
for(const c of comets) P(`| ${c.name} | ${date3(c.start)} | ${date3(c.peak)} | ${date3(c.end)} | ${c.peakMag} | ${c.instrument} |`);
P('');

P('## Events — one-off dated events\n');
P('| Event | Date | Rarity |');
P('| --- | --- | --- |');
for(const e of oneOffEvents) P(`| ${e.name} | ${date3(e.date)} | ${e.rarity} |`);
P('\nFull descriptions and viewing notes are in the JSON `events.oneOffEvents[].details`.\n');

P('## Events — solstices & equinoxes\n');
P('| Marker | Date | Stargazer note |');
P('| --- | --- | --- |');
for(const s of seasonMarkers) P(`| ${s.name} | ${mday(s.date)} | ${s.stargazerNote} |`);
P('');

P('## Events — recurring / live (computed)\n');
P('These have no fixed coordinates or dates — they are produced when a runtime condition (live data or an ephemeris computation) is met.\n');
P('| Event | Rarity | Trigger |');
P('| --- | --- | --- |');
for(const r of recurringEvents) P(`| ${r.name} | ${r.rarity} | ${r.trigger} |`);
P('');

P('---\n');
P('_Generated from a single source list. Regenerate with the companion extractor if the source changes. Southern-hemisphere wording is intentional; the coordinates are universal._');

fs.writeFileSync(path.join(OUT, 'night-sky-cards.md'), md.join('\n') + '\n');
console.log('wrote night-sky-cards.json + night-sky-cards.md to', OUT);

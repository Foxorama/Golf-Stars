
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { launchChromium } from './chromium.mjs';




const entry = `
import { setState } from './src/app/ctx';
import { initState, reduce } from './src/ui/game';
import { CHARACTERS } from './src/sim/rpg/characters';
import { NAMED_CADDY_IDS } from './src/sim/rpg/economy';
import { storyLockerScreen, storyLockerView } from './src/app/storyLockerScreens';

// Build a real story via the reducer (the deep-link path), then enrich it into a full loadout.
let s = initState('preview');
s = reduce(reduce(s, { type: 'openStory' }), { type: 'selectCharacter', characterId: CHARACTERS[0].id });
s = reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' });
s = reduce(s, { type: 'play' });
while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
s = reduce(s, { type: 'storyRoundContinue' });

const st = s.story;
// A fat bag of themed + starter clubs (mirrors the screenshots — 10 in the bag, spares on the bench).
const clubs = [
  'club:forgefire:D','club:evergreen:5W','club:evergreen:3H',
  'club:galewarden:5i','club:galewarden:7i','club:busan:8i','club:galewarden:9i',
  'club:portland:PW','club:sandsaver:SW','club:starreader:putter',
  'D','5W','3H','5i','7i','9i','PW','SW','chip','putter','club:nova:D',
];
st.ownedClubIds = clubs;
st.equippedBagIds = clubs.slice(0, 10);
// Several gear pieces per slot so the grid density shows.
st.ownedGearIds = [
  'gear:glove:antislice','gear:glove:tacky','gear:glove:sweet','gear:glove:vice','gear:glove:power',
  'gear:hat:reader','gear:hat:oracle','gear:hat:computer',
  'gear:shoes:turf','gear:shoes:balance','gear:shoes:gravlock',
  'gear:ball:soft','gear:ball:zip','gear:ball:comet',
  'gear:shaft:stiff','gear:shaft:overdrive',
  'gear:bag:sponsor','gear:bag:cosmic',
  'gear:jacket:thermal','gear:jacket:champion',
  'gear:pants:power','gear:pants:cosmic',
];
st.equippedGear = {
  glove: 'gear:glove:power', hat: 'gear:hat:oracle', shoes: 'gear:shoes:gravlock',
  ball: 'gear:ball:comet', shaft: 'gear:shaft:overdrive', bag: 'gear:bag:cosmic',
  jacket: 'gear:jacket:champion', pants: 'gear:pants:cosmic',
};
// A crew of a few friends, one on the bag.
st.hiredCaddyIds = NAMED_CADDY_IDS.slice(0, 5);
st.activeCaddyId = st.hiredCaddyIds[0];

setState(s);
storyLockerView.open = new Set(['bag','crew','gear','bench']);
document.body.innerHTML = '<div class="gs-app" style="max-width:640px;margin:0 auto;">'+storyLockerScreen()+'</div>';
`;

const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const html = `<!doctype html><html><head><meta charset="utf8"><style>
  body{margin:0;padding:12px;background:#0b0d12;color:#eaf1fb;font-family:-apple-system,system-ui,sans-serif;}
  .gs-hero-title{font-size:26px;font-weight:800;margin:0;} .gs-hero-tag{color:#8fa0b8;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:2px 0 0;}
  .gs-hero{text-align:center;margin-bottom:8px;}
  .gs-btn{display:block;width:100%;padding:12px;border-radius:12px;border:1px solid #2a3346;background:#141b28;color:#cdd8ea;font-weight:700;}
</style></head><body><script>${result.outputFiles[0].text}</script></body></html>`;

const pngPath = process.env.LOCKER_PREVIEW_PNG ?? join(tmpdir(), 'locker-preview.png');
// A failure here is LOUD (GS-preview-chromium): the old catch printed "(screenshot skipped)" and
// exited 0, so the rig reported success having drawn nothing.
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 430, height: 1400 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text()); });
page.on('pageerror', (e) => console.log('PAGE THROW:', e.message));
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();
console.log('wrote ' + pngPath);

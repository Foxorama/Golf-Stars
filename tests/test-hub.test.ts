import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * TEST-HUB SYNC GUARD — invariant #3 of standards/TEST-HUB-STANDARD.md, activated for Golf Stars.
 *
 * The hub (src/test/hub.ts → test.html) drives the real game through public hooks. That keeps it
 * thin but lets it rot silently: rename a hook in the app and the hub control just does nothing,
 * no error. This guard fails loudly the moment the two drift, naming exactly what to update.
 *
 * It text-matches the SOURCE (not the built dist, which may not exist when tests run): direction A
 * proves the app still defines every hook the hub drives; direction B proves the hub still drives
 * every hook it documents. The hub's club/perk/biome/format LISTS can't drift — it imports them
 * from the sim's own tables — so the third test guards that those imports stay in place.
 *
 * The portable, fill-in-the-blanks version lives at standards/test-hub-guard.template.mjs.
 */

const root = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8');

// The hook contract: label · source file that DEFINES it · token the app must keep · token the hub
// must keep. Both sides guarded, so neither file can drop a hook without this failing.
const HOOKS = [
  { label: 'run seed (?seed=)', src: 'src/app.ts', app: "get('seed')", hub: 'seed=' },
  { label: 'intro (?intro=)', src: 'src/app.ts', app: "get('intro')", hub: 'intro=' },
  { label: 'flight feel (_gsFeel)', src: 'src/render/playView.ts', app: '_gsFeel', hub: '_gsFeel' },
  { label: 'intro feel (_gsIntro)', src: 'src/render/introView.ts', app: '_gsIntro', hub: '_gsIntro' },
  { label: 'spray tiers (_gsSpray)', src: 'src/app.ts', app: '_gsSpray', hub: '_gsSpray' },
];

// Sim tables the hub MUST import (not copy) so its control lists share one source of truth (I3a).
const IMPORTED_TABLES = ['CLUBS', 'SHOP_ITEMS', 'META_UPGRADES', 'FORMATS', 'LIE_INFO'];

describe('test hub ↔ app hook parity (standards/TEST-HUB-STANDARD.md I3)', () => {
  it('app still honours every hook the hub sends', () => {
    for (const hk of HOOKS) {
      expect(
        read(hk.src).includes(hk.app),
        `${hk.src} no longer contains "${hk.app}" (${hk.label}) — the hub control that drives it is now dead; update both`,
      ).toBe(true);
    }
  });

  it('hub still sends every hook it documents', () => {
    const hub = read('src/test/hub.ts');
    for (const hk of HOOKS) {
      expect(
        hub.includes(hk.hub),
        `src/test/hub.ts no longer sends "${hk.hub}" (${hk.label}) — it claims to support this hook but doesn't`,
      ).toBe(true);
    }
  });

  it('hub derives its control lists from the sim tables (no re-implemented copy)', () => {
    const hub = read('src/test/hub.ts');
    for (const table of IMPORTED_TABLES) {
      expect(
        hub.includes(table),
        `src/test/hub.ts no longer references ${table} — its option list may have drifted to a hardcoded copy (invariant I1/I3a)`,
      ).toBe(true);
    }
  });
});

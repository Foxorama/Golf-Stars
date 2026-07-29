import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { probeWritable, requestPersistence, checkStorage, storageHealth } from '../src/save/durability';

/**
 * The game knows whether it can keep your save, and says so (GS-save-durability).
 *
 * `save/storage.ts` no-ops when localStorage is unavailable — right for the sim, catastrophic for the
 * player, because the itch build runs in a cross-origin iframe whose storage a browser blocking
 * third-party cookies denies outright. The failure mode was a four-hour campaign that was never
 * written and nothing anywhere saying so.
 *
 * These guard the two questions separately: CAN we write (binary, produces a warning), and will what
 * we write be KEPT (evictable even when writable — the reason the install nudge and this are one
 * feature).
 */

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

/** A localStorage stand-in whose behaviour each test dictates. */
function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
    ...overrides,
  } as Storage;
}

// `navigator` is a getter-only global in modern Node, so it cannot be assigned — `vi.stubGlobal`
// defines over it properly and `unstubAllGlobals` puts the real one back.
const g = {
  set localStorage(v: unknown) {
    vi.stubGlobal('localStorage', v);
  },
  set navigator(v: unknown) {
    vi.stubGlobal('navigator', v);
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the probe answers whether a write actually sticks', () => {
  it('says yes on a working store, and leaves nothing behind', () => {
    const s = fakeStorage();
    g.localStorage = s;
    expect(probeWritable()).toBe(true);
    // The probe key is written and removed — a diagnostic must not become a persisted key.
    expect(s.length, 'the probe left its key behind').toBe(0);
  });

  it('says no when setItem throws (private mode, quota, denied frame)', () => {
    g.localStorage = fakeStorage({
      setItem: () => {
        throw new DOMException('denied');
      },
    });
    expect(probeWritable()).toBe(false);
  });

  it('says no when the write is silently swallowed', () => {
    // The case a try/catch alone misses, and the reason the probe reads back: a Storage object that
    // accepts writes and returns nothing. Safari's private mode has shipped exactly this.
    g.localStorage = fakeStorage({ setItem: () => undefined, getItem: () => null });
    expect(probeWritable()).toBe(false);
  });

  it('says no, rather than throwing, when there is no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(probeWritable()).toBe(false);
  });
});

describe('persistence is requested, never assumed', () => {
  it('returns false where the API does not exist', async () => {
    g.navigator = {} as Navigator;
    await expect(requestPersistence()).resolves.toBe(false);
  });

  it('does not re-ask when the browser has already granted it', async () => {
    const persist = vi.fn(async () => false);
    g.navigator = { storage: { persisted: async () => true, persist } } as unknown as Navigator;
    await expect(requestPersistence()).resolves.toBe(true);
    // Re-asking can only downgrade a yes to a no.
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks, and reports the answer either way', async () => {
    g.navigator = { storage: { persisted: async () => false, persist: async () => true } } as unknown as Navigator;
    await expect(requestPersistence()).resolves.toBe(true);
    g.navigator = { storage: { persisted: async () => false, persist: async () => false } } as unknown as Navigator;
    await expect(requestPersistence()).resolves.toBe(false);
  });

  it('swallows a throwing implementation', async () => {
    g.navigator = {
      storage: {
        persisted: async () => {
          throw new Error('nope');
        },
        persist: async () => true,
      },
    } as unknown as Navigator;
    await expect(requestPersistence()).resolves.toBe(false);
  });
});

describe('the boot check', () => {
  it('does not ask to persist a store it cannot write to', async () => {
    const persist = vi.fn(async () => true);
    g.localStorage = fakeStorage({
      setItem: () => {
        throw new Error('denied');
      },
    });
    g.navigator = { storage: { persisted: async () => false, persist } } as unknown as Navigator;
    const h = await checkStorage();
    expect(h.writable).toBe(false);
    expect(h.persisted).toBe(false);
    expect(persist, 'asked the browser to persist a store that cannot be written').not.toHaveBeenCalled();
    expect(h.checked).toBe(true);
  });

  it('records both answers on the shared singleton the surfaces read', async () => {
    g.localStorage = fakeStorage();
    g.navigator = { storage: { persisted: async () => false, persist: async () => true } } as unknown as Navigator;
    await checkStorage();
    expect(storageHealth.writable).toBe(true);
    expect(storageHealth.persisted).toBe(true);
    expect(storageHealth.checked).toBe(true);
  });

  it('starts optimistic, so no warning can flash before the check has run', () => {
    // Read off the source: the module singleton is mutated by the tests above, but its DECLARED
    // default is the thing that matters — a warning that appears on every boot until the probe
    // resolves trains the player to ignore the one message they must not.
    expect(read('src/save/durability.ts')).toMatch(
      /storageHealth: StorageHealth = \{ writable: true, persisted: false, checked: false \}/,
    );
  });
});

describe('the player is actually told', () => {
  const title = read('src/app/titleScreens.ts');
  const overlays = read('src/app/overlays.ts');

  it('the title carries the alert, and only when storage is dead', () => {
    expect(title).toContain('function storageWarningHTML()');
    expect(title).toMatch(/if \(storageHealth\.writable\) return '';/);
    expect(title).toContain('${storageWarningHTML()}');
    expect(title, 'the alert must be announced, not merely drawn').toContain('role="alert"');
  });

  it('the alert is not dismissible', () => {
    const fn = title.slice(title.indexOf('function storageWarningHTML()'), title.indexOf('export function titleScreen'));
    // A dismissal would have to be remembered in the storage that is broken, and the condition is
    // not transient — so there is deliberately nothing to tap.
    expect(fn).not.toContain('data-install');
    expect(fn).not.toMatch(/<button/);
  });

  it('the alert names the action that still works', () => {
    const fn = title.slice(title.indexOf('function storageWarningHTML()'), title.indexOf('export function titleScreen'));
    expect(fn).toMatch(/Export save/);
  });

  it('the settings sheet reports all three states, not just the failure', () => {
    const fn = overlays.slice(overlays.indexOf('function storageStatusHTML()'), overlays.indexOf('/** The Save data section'));
    expect(fn).toMatch(/storageHealth\.writable/);
    expect(fn).toMatch(/storageHealth\.persisted/);
    // Writable-but-evictable is a real state and must not be printed as an unqualified success.
    expect((fn.match(/return `/g) ?? []).length).toBe(3);
    expect(fn).toMatch(/Installing the game usually earns it protected storage/);
  });

  it('the install nudge says what installing buys', () => {
    // "⬇ Install app" asked the player to want a shortcut. Durability is the real trade.
    expect(title).toMatch(/gs-installwhy/);
    expect(title).toMatch(/offline \+ safer save/);
  });
});

describe('the probe key is documented like every other write', () => {
  it("PRIVACY.md lists fc_probe and says what it is for", () => {
    const privacy = read('PRIVACY.md');
    expect(privacy).toContain('`fc_probe`');
    // The guard in privacy.test.ts enforces presence; this one enforces that it explains itself,
    // because a table row that just names a key tells a reader nothing.
    expect(privacy).toMatch(/fc_probe`[^|]*\|[^|]*(save|warn)/i);
  });
});

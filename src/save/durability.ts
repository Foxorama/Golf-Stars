/**
 * CAN THE BROWSER ACTUALLY KEEP THIS SAVE? (GS-save-durability)
 *
 * `save/storage.ts` degrades to a silent no-op when `localStorage` is unavailable — deliberately,
 * so the sim stays node-pure and a private-mode browser still plays. That is right for the SIM and
 * catastrophic for the PLAYER: the game is entirely meta-progression, and an affected player
 * finishes a campaign, closes the tab, and discovers none of it was ever written. Nothing anywhere
 * told them.
 *
 * It is not a hypothetical. The itch.io build runs in a CROSS-ORIGIN IFRAME, so its storage is
 * third-party: a browser blocking third-party cookies denies `localStorage` to the frame outright,
 * and iOS private mode does the same. This module is the difference between that being a silent
 * total loss and being a sentence the player reads before they invest four hours.
 *
 * Two separate questions, deliberately not conflated:
 *
 *  1. **Can we write at all?** A probe write that survives a read-back. Synchronous, cheap, and the
 *     answer is binary — this is the one that produces a warning.
 *  2. **Will what we write be KEPT?** Storage that is writable is still EVICTABLE. iOS Safari
 *     deletes script-writeable storage after 7 days without interaction; every browser evicts under
 *     pressure, and on itch the quota is shared with every other HTML5 game on the same CDN origin,
 *     so the pressure is other people's traffic. `navigator.storage.persist()` asks the browser to
 *     exempt this origin, and browsers grant it readily to INSTALLED apps — which is why the install
 *     nudge and this file are one feature, and why the honest pitch for installing is durability
 *     rather than a shortcut icon.
 *
 * Node-safe (every browser global is guarded), so the save tests can import it.
 */

/**
 * Written and immediately removed by `probeWritable`. Listed in PRIVACY.md like every other key —
 * it is a real write to the player's device, however brief, and the guard in `tests/privacy.test.ts`
 * does not care that it is transient. Documenting it is the correct outcome, not a nuisance.
 */
const PROBE_KEY = 'fc_probe';

export type StorageHealth = {
  /** A probe write survived a read-back. False ⇒ NOTHING is being saved. */
  writable: boolean;
  /** The browser has promised not to evict this origin under pressure. */
  persisted: boolean;
  /** The check has run. Before that, `writable` is an assumption, not a finding. */
  checked: boolean;
};

/**
 * The live answer, read by the surfaces that report it. A mutable module singleton for the same
 * reason `installView` is one: cross-module `let` reassignment is illegal in ESM, and the settings
 * sheet and the title screen both need to read whatever the boot check last found.
 *
 * It starts OPTIMISTIC on purpose. A warning that flashes on every boot until the check completes
 * would train the player to dismiss the one message in the game they must not ignore.
 */
export const storageHealth: StorageHealth = { writable: true, persisted: false, checked: false };

/**
 * Does a write actually stick? Write, read back, remove.
 *
 * The read-back is the point: a `setItem` that throws is easy to catch, but a frame with storage
 * denied can also hand back a *silently inert* Storage object, and Safari's private mode has
 * historically accepted writes it then refuses to return. Only a round trip proves it.
 */
export function probeWritable(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(PROBE_KEY, '1');
    const ok = localStorage.getItem(PROBE_KEY) === '1';
    localStorage.removeItem(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Ask the browser to exempt this origin from eviction.
 *
 * Already-granted is checked first so a re-ask can't downgrade a yes, and the whole thing is
 * swallowed: a browser without the API (or one that says no) is the status quo, never an error.
 * Chrome decides on engagement and installed-app status, so this is a request, not a setting — the
 * answer is reported to the player rather than assumed.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!s || typeof s.persist !== 'function') return false;
    if (typeof s.persisted === 'function' && (await s.persisted())) return true;
    return await s.persist();
  } catch {
    return false;
  }
}

/**
 * The boot check. Probes first, and only asks for persistence if there is something to persist —
 * asking a frame that cannot write anything is a promise about nothing.
 */
export async function checkStorage(): Promise<StorageHealth> {
  storageHealth.writable = probeWritable();
  storageHealth.persisted = storageHealth.writable ? await requestPersistence() : false;
  storageHealth.checked = true;
  return storageHealth;
}

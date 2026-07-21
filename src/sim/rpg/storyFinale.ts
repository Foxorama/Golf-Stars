/**
 * Story-Tour FINALE (GS-story-yggdrasil → GS-story-battle-3) — the Jörmungandr space battle, the campaign
 * climax that SPENDS the arsenal you've been stockpiling in the shipyard. Five Sigils forge the key to
 * Yggdrasil's Dark Root (`keyToOtherRealm`); there the Cthulhu-corrupted world-serpent waits. You engage
 * with your ARMED ship — a real sequence battle (an R-Type boss fight, not a stat check): you FLY your own
 * ship (tap to move), FIRE each owned weapon from its own HUD trigger, and DODGE the serpent's phase
 * attacks, leaning on shields for the strikes that cannot be dodged.
 *
 * PURE + DOM-free (the battle itself is a render-layer overlay; this module is the deterministic model the
 * overlay, the briefing and the tests all read — the briefing IS the physics).
 *
 * THE MODEL:
 *   • GATES (unchanged, `finaleResult`) — what is POSSIBLE. BREACH: weapon rating must crack the hide
 *     (under it the serpent can be ground to `FINALE_HOPELESS_FLOOR_FRAC` but never past — unkillable by
 *     construction, so the briefing never lies). SURVIVE: engine+shield rating for a real shield pool.
 *   • LOADOUT (`finaleLoadout`) — the fight consumes every rating point CONTINUOUSLY. Each owned WEAPON
 *     upgrade is its own HUD trigger (damage = its battle rating, its own cooldown); ENGINES speed the
 *     ship AND every cooldown; ENGINES+SHIELDS set the shield cells. An over-armed ship fells it faster —
 *     but the PHASES key off the serpent's remaining health, so every arsenal faces every phase and the
 *     final overwhelm always demands shields in hand: arming past the gates shortens the fight, it never
 *     trivialises it (the GS-story-battle-3 answer to "purple upgrades outclass the requirement 3×").
 *   • PHASES (`FINALE_PHASES`) — the serpent escalates at health fractions: 75% ACID SPRAY (slow, dodge by
 *     flying clear), 50% + LIGHTNING (telegraphed lines), 25% + VOID BLASTS (detonating rings), and at 5%
 *     one OVERWHELMING attack that is nearly undodgeable and costs `FINALE_OVERWHELM_HITS` shield cells —
 *     the fight is winnable BY CONSTRUCTION only because a gate-armed ship's pool (plus the one-cell
 *     breather regen at each phase turn) covers it with margin (machine-checked).
 */

import { combatRating, categoryRating, shipUpgradeById } from './storyShipUpgrades';
import { keyToOtherRealm, type StoryState } from './story';

/** Weapon rating needed to breach the hide (≈ scatter + railgun, or the nova orb alone). */
export const FINALE_BREACH_NEED = 26;
/** Engine + shield rating needed to survive the coils (a shield or two + an engine). */
export const FINALE_SURVIVE_NEED = 30;

export interface FinaleResult {
  /** Can the battle even be attempted (five Sigils in hand)? */
  unlocked: boolean;
  /** Already won (the campaign is complete)? */
  alreadyWon: boolean;
  weaponRating: number;
  defenceRating: number;
  /** Engines alone — they drive ship speed + weapon cooldowns in the live battle. */
  engineRating: number;
  combatRating: number;
  breachOk: boolean;
  surviveOk: boolean;
  /** The verdict if engaged now. */
  won: boolean;
  /** Why a loss happens, for the briefing + defeat guidance. */
  failReason?: 'firepower' | 'defence';
}

/** Resolve the finale for a campaign state (pure). Deterministic — purely a function of the arsenal. */
export function finaleResult(story: StoryState): FinaleResult {
  const weaponRating = categoryRating(story, 'weapon');
  const engineRating = categoryRating(story, 'engine');
  const defenceRating = engineRating + categoryRating(story, 'shield');
  const breachOk = weaponRating >= FINALE_BREACH_NEED;
  const surviveOk = defenceRating >= FINALE_SURVIVE_NEED;
  const won = breachOk && surviveOk;
  return {
    unlocked: keyToOtherRealm(story),
    alreadyWon: story.completed === true,
    weaponRating,
    defenceRating,
    engineRating,
    combatRating: combatRating(story),
    breachOk,
    surviveOk,
    won,
    failReason: won ? undefined : !breachOk ? 'firepower' : 'defence',
  };
}

// ── GS-story-battle-3: the live-battle model ─────────────────────────────────────────────────────────────

/** The serpent's health pool. Phase thresholds are fractions of this. */
export const FINALE_SERPENT_HP = 1000;
/**
 * The escalation script, as remaining-health fractions: 75% the ACID SPRAY opens, 50% adds LIGHTNING,
 * 25% adds VOID BLASTS, and at 5% the serpent unleashes the near-undodgeable OVERWHELM. Keyed off health,
 * so EVERY arsenal — floor or maxed — plays every phase.
 */
export const FINALE_PHASES = [0.75, 0.5, 0.25, 0.05] as const;
/** Shield cells the 5% OVERWHELM always costs (it is nearly undodgeable BY DESIGN — arrive with shields). */
export const FINALE_OVERWHELM_HITS = 2;
/** Shield cells restored at each phase turn (a breather beat) — capped at the loadout's own pool. */
export const FINALE_PHASE_REGEN = 1;
/** Under the breach gate the hide HOLDS at this remaining fraction — unkillable by construction. */
export const FINALE_HOPELESS_FLOOR_FRAC = 0.4;
/** Shield-cell pool cap (HUD pips stay readable; defence past this is still speed via engines). */
export const FINALE_SHIELD_CELL_CAP = 9;

/** How a finale weapon draws + flies (each maps to one projectile painter in the battle overlay). */
export type FinaleWeaponStyle = 'scatter' | 'railgun' | 'nova' | 'lance' | 'venom' | 'pea';

/** One HUD weapon trigger — an owned weapon upgrade made concrete for the fight. */
export interface FinaleWeapon {
  /** The upgrade id (or 'hull' for the unarmed fallback cannon). */
  id: string;
  /** Short HUD label. */
  name: string;
  style: FinaleWeaponStyle;
  /** Serpent HP a volley removes (= the upgrade's battle rating; the readiness number made literal). */
  damage: number;
  /** Milliseconds between volleys, already engine-scaled. */
  cooldownMs: number;
  /** Primary + bright-core colours (the star-map weapon palette family). */
  color: string;
  color2: string;
}

/** Everything the live battle consumes, derived purely from the arsenal. */
export interface FinaleLoadout {
  /** One trigger per owned weapon upgrade, light → heavy (HUD order). Never empty — an unarmed hull
   *  still runs out its pea cannon (it cannot breach the gate, so the hide holds regardless). */
  weapons: FinaleWeapon[];
  /** Un-dodged strikes the shields absorb. The OVERWHELM spends `FINALE_OVERWHELM_HITS` of these. */
  shieldCells: number;
  /** Tap-to-move flight speed, design-px/s (engine-scaled). */
  shipSpeed: number;
}

/** The per-weapon battle config — style, base cooldown, palette. Damage comes from the upgrade row's own
 *  `battle` rating, so a heavier gun hits exactly as hard as the shipyard said it would. */
const FINALE_WEAPON_CONFIG: Record<
  string,
  { name: string; style: FinaleWeaponStyle; cooldownMs: number; color: string; color2: string }
> = {
  'upg:weapon:scatter': { name: 'SCATTER', style: 'scatter', cooldownMs: 1600, color: '#ffd36b', color2: '#fff2c0' },
  'upg:weapon:railgun': { name: 'RAILGUN', style: 'railgun', cooldownMs: 3400, color: '#ff6b5a', color2: '#fff2c0' },
  'upg:weapon:nova': { name: 'NOVA', style: 'nova', cooldownMs: 7000, color: '#ffd76b', color2: '#4fe0b0' },
  'upg:weapon:starlance': { name: 'LANCE', style: 'lance', cooldownMs: 6000, color: '#c8ecff', color2: '#ffffff' },
  'upg:weapon:wyrmfang': { name: 'WYRMFANG', style: 'venom', cooldownMs: 6500, color: '#b0e04f', color2: '#eaffc0' },
};

/** HUD order, light → heavy (the catalogue's own escalation). */
const FINALE_WEAPON_ORDER: readonly string[] = [
  'upg:weapon:scatter',
  'upg:weapon:railgun',
  'upg:weapon:nova',
  'upg:weapon:starlance',
  'upg:weapon:wyrmfang',
];

/** The unarmed hull's fallback cannon — the fight is never trigger-less (but it can never breach). */
const HULL_CANNON: FinaleWeapon = {
  id: 'hull',
  name: 'CANNON',
  style: 'pea',
  damage: 4,
  cooldownMs: 1400,
  color: '#9fb0c8',
  color2: '#e8eef8',
};

/** Engine-scaled cooldown multiplier — better engines cycle every gun faster, floored at 70%. */
export function finaleCooldownMult(engineRating: number): number {
  return Math.max(0.7, 1 - engineRating * 0.007);
}

/**
 * Build the live-battle loadout from the campaign arsenal (pure). Every rating point lands somewhere:
 * weapons → their own triggers (damage = rating), engines → cooldowns + flight speed, engines+shields →
 * the shield-cell pool.
 */
export function finaleLoadout(story: StoryState): FinaleLoadout {
  const engineRating = categoryRating(story, 'engine');
  const defenceRating = engineRating + categoryRating(story, 'shield');
  const cdMult = finaleCooldownMult(engineRating);
  const weapons: FinaleWeapon[] = FINALE_WEAPON_ORDER.filter((id) => story.ownedShipUpgradeIds.includes(id)).map(
    (id) => {
      const cfg = FINALE_WEAPON_CONFIG[id]!;
      const battle = shipUpgradeById(id)?.battle ?? 0;
      return {
        id,
        name: cfg.name,
        style: cfg.style,
        damage: battle,
        cooldownMs: Math.round(cfg.cooldownMs * cdMult),
        color: cfg.color,
        color2: cfg.color2,
      };
    },
  );
  if (weapons.length === 0) weapons.push({ ...HULL_CANNON, cooldownMs: Math.round(HULL_CANNON.cooldownMs * cdMult) });
  const shieldCells = Math.max(1, Math.min(FINALE_SHIELD_CELL_CAP, 1 + Math.round(defenceRating / 12)));
  const shipSpeed = Math.min(460, 300 + engineRating * 4);
  return { weapons, shieldCells, shipSpeed };
}

/** Steady-fire seconds to bring the serpent from full health to the 5% overwhelm — the briefing's honest
 *  "how long your guns take" number, and the tests' kill-time bound. Pure. */
export function finaleAssaultSeconds(loadout: FinaleLoadout): number {
  const dps = loadout.weapons.reduce((s, w) => s + w.damage / (w.cooldownMs / 1000), 0);
  const toOverwhelm = FINALE_SERPENT_HP * (1 - FINALE_PHASES[3]);
  return dps > 0 ? toOverwhelm / dps : Infinity;
}

/** Is the finale available to engage — five Sigils in hand and not yet beaten? */
export function finaleUnlocked(story: StoryState): boolean {
  return keyToOtherRealm(story) && story.completed !== true;
}

/** Mark the campaign WON (pure) — the finale is beaten, the universe saved. Sets `completed`, which is
 *  what `storyComplete` reads (unlocking the free-roam Star Tour reward). */
export function winFinale(story: StoryState): StoryState {
  return story.completed === true ? story : { ...story, completed: true };
}

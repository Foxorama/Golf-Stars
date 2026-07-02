import { CHARACTERS, type GolferStyle, type GolferStats } from '../sim/rpg/characters';
import { CLUBS, clubById } from '../sim/clubs';
import { themeById, type BiomeArchetype } from '../sim/course/themes';
import { getGolfer, getArchetype } from '../sim/rpg/golfers';
import { PLAYER_ID, type Field } from '../sim/rpg/competition';
import { type Leaderboard } from '../sim/rpg/league';

// Golfer presentation: the player/competitor avatar SVG art, the character-select cards, and the
// arc competition views (field strip + leaderboard table). All pure string/SVG builders — they take
// their data as arguments and read no module state — so they live out of the app.ts god-file (CLAUDE.md).

/** A compact inline-SVG of the play-view golfer silhouette, tinted to a character (GS-18). Static
 *  preview for the select card — same crew silhouette (legs, shirt torso, skin arms/head, cap +
 *  club) the on-course figure uses, so the card reads as "this is who you'll see swinging". A soft
 *  character-coloured aura disc sits behind the figure so the portrait pops on the dark card. */
export function golferSVG(style: GolferStyle, w = 104, h = 132): string {
  const s = style.build;
  return `
    <svg viewBox="0 0 78 104" width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible;">
      <defs>
        <radialGradient id="ga-${style.cap.slice(1)}" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stop-color="${style.cap}" stop-opacity="0.55"/>
          <stop offset="55%" stop-color="${style.cap}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${style.cap}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="39" cy="44" rx="42" ry="46" fill="url(#ga-${style.cap.slice(1)})"/>
      <ellipse cx="39" cy="99" rx="${20 * s}" ry="4" fill="rgba(0,0,0,0.32)"/>
      <g transform="translate(39,52) scale(${s}) translate(-39,-52)" stroke-linecap="round" stroke-linejoin="round">
        <!-- legs -->
        <path d="M39 64 L31 96 M39 64 L48 96" stroke="#2c3142" stroke-width="7" fill="none"/>
        <!-- club -->
        <path d="M44 40 L66 78" stroke="#d9dee8" stroke-width="2.4" fill="none"/>
        <circle cx="66" cy="78" r="2.6" fill="#aeb6c6"/>
        <!-- torso -->
        <path d="M39 64 L44 34" stroke="${style.shirt}" stroke-width="13" fill="none"/>
        <!-- arms -->
        <path d="M44 34 L52 50" stroke="${style.skin}" stroke-width="5" fill="none"/>
        <!-- head + cap -->
        <circle cx="46" cy="24" r="9" fill="${style.skin}"/>
        <path d="M37 23 A9 9 0 0 1 55 23 Z" fill="${style.cap}"/>
        <rect x="50" y="21" width="12" height="4" rx="1.5" fill="${style.cap}"/>
      </g>
    </svg>`;
}

/** Per-archetype colour kit for the Pro Shop staff portrait (cap / shirt / aura / skin). */
export const PRO_LOOK: Record<BiomeArchetype, { cap: string; shirt: string; aura: string; skin: string }> = {
  verdant: { cap: '#3fae5a', shirt: '#2e8b57', aura: '#5fd45a', skin: '#e7b894' },
  desert: { cap: '#d9a441', shirt: '#c2702e', aura: '#e8c06a', skin: '#d8a06a' },
  frost: { cap: '#7fd0e8', shirt: '#4a90c2', aura: '#bfe9f5', skin: '#e8c4a8' },
  inferno: { cap: '#e0622b', shirt: '#9b2d1f', aura: '#ff8a3b', skin: '#cf8f63' },
  void: { cap: '#9b6fd0', shirt: '#5b3da0', aura: '#b88aff', skin: '#cdb8e0' },
  crystal: { cap: '#7fc8bd', shirt: '#4a9aa0', aura: '#bff0ff', skin: '#e7c9b4' },
  tempest: { cap: '#8a7fb0', shirt: '#5a5470', aura: '#c8b8ff', skin: '#d8c0a8' },
  fungal: { cap: '#2fae82', shirt: '#7d46b8', aura: '#7af0c0', skin: '#d2b89c' },
  ocean: { cap: '#46b487', shirt: '#2f7faa', aura: '#7fe6b8', skin: '#e0c2a0' },
  cetus: { cap: '#3aa0aa', shirt: '#216578', aura: '#7af0ff', skin: '#dcc0a4' },
};

/** A compact inline-SVG bust of a world's club pro — assetless house style, tinted per archetype. */
export function proAvatarSVG(archetype: BiomeArchetype, w = 72, h = 84): string {
  const c = PRO_LOOK[archetype];
  const id = archetype;
  return `
    <svg viewBox="0 0 72 84" width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible;">
      <defs>
        <radialGradient id="pa-${id}" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="${c.aura}" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="${c.aura}" stop-opacity="0.14"/>
          <stop offset="100%" stop-color="${c.aura}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="36" cy="40" rx="34" ry="38" fill="url(#pa-${id})"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <!-- shoulders / polo -->
        <path d="M14 84 Q36 56 58 84 Z" fill="${c.shirt}"/>
        <path d="M33 60 L36 70 L39 60" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>
        <!-- collar -->
        <path d="M30 58 L36 64 L42 58" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
        <!-- neck -->
        <rect x="32" y="50" width="8" height="10" rx="3" fill="${c.skin}"/>
        <!-- head -->
        <circle cx="36" cy="40" r="13" fill="${c.skin}"/>
        <!-- shades -->
        <rect x="26" y="37" width="9" height="5" rx="2.2" fill="#1b1f2a"/>
        <rect x="37" y="37" width="9" height="5" rx="2.2" fill="#1b1f2a"/>
        <line x1="35" y1="39" x2="37" y2="39" stroke="#1b1f2a" stroke-width="1.4"/>
        <!-- smile -->
        <path d="M31 46 Q36 50 41 46" fill="none" stroke="#7a4a2a" stroke-width="1.6"/>
        <!-- cap -->
        <path d="M22 35 A14 14 0 0 1 50 35 Z" fill="${c.cap}"/>
        <path d="M22 35 Q14 36 12 39 L24 38 Z" fill="${c.cap}"/>
        <rect x="33" y="22" width="6" height="4" rx="2" fill="${c.cap}"/>
      </g>
    </svg>`;
}

/** A flashy 0–5 stat bar for the select card — `n` lit pips in the character colour over a dark rail,
 *  the fill width set as a CSS var so it can animate in on card reveal. */
export function statBar(label: string, n: number, col: string): string {
  const pct = Math.max(0, Math.min(5, n)) / 5 * 100;
  return `
    <div class="gs-stat">
      <span class="gs-stat-l">${label}</span>
      <span class="gs-stat-rail"><span class="gs-stat-fill" style="--w:${pct}%;background:linear-gradient(90deg,${col},${col}cc);"></span></span>
    </div>`;
}

/** The per-character unlocked-clubs strip on the select card (GS-victory / GS-ascension-clubs): winning
 *  an Ascension with a golfer permanently grows THEIR starting bag, so each card surfaces what that golfer
 *  has earned — the character-specific progression made visible before you pick. Empty ⇒ nothing rendered. */
function unlockedStrip(unlockedTypes: readonly string[], col: string): string {
  const names = unlockedTypes.map((t) => clubById(t, CLUBS)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return '';
  const chips = names
    .map((n) => `<span style="display:inline-block;font-size:10.5px;line-height:1.5;padding:1px 8px;border-radius:999px;background:${col}1e;border:1px solid ${col}59;color:var(--gs-ink);">${n}</span>`)
    .join('');
  return `
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin-top:9px;padding-top:9px;border-top:1px solid var(--gs-line-2);">
      <span style="font-size:10px;letter-spacing:.06em;font-weight:800;color:${col};opacity:.92;">⛳ UNLOCKED · ${names.length}</span>${chips}
    </div>`;
}

/**
 * The golfer roster (GS-18, compacted GS-settings-nav): a 2×2 grid on phones / 4-across on desktop
 * so ALL four golfers fit one screen without scrolling in every game mode. Small screens compress
 * each card to portrait + stats + a one-line strength/quirk hint (the full blurb + pros/cons list
 * come back at desktop width via CSS — same markup, media-query visibility). The CTA verb follows
 * the chosen format ("Voyage as …" for the campaign, "Survive as …" for the Unending Universe).
 */
export function characterScreen(
  unlockedByCharacter: Record<string, readonly string[]> = {},
  opts: { modeName?: string; winnable?: boolean } = {},
): string {
  const verb = opts.winnable === false ? 'Survive as' : 'Voyage as';
  const statRows = (st: GolferStats, col: string): string =>
    statBar('PWR', st.power, col) + statBar('ACC', st.accuracy, col) + statBar('TCH', st.touch, col) + statBar('CON', st.consistency, col);

  const cards = CHARACTERS.map((ch, i) => {
    const cap = ch.style.cap;
    const pros = ch.pros.map((p) => `<li><span class="gs-pc-i" style="color:var(--gs-accent);">✓</span> <span style="color:var(--gs-ink);">${p}</span></li>`).join('');
    const cons = ch.cons.map((c) => `<li><span class="gs-pc-i" style="color:var(--gs-warn);">▲</span> <span style="color:var(--gs-dim);">${c}</span></li>`).join('');
    const unlocks = unlockedStrip(unlockedByCharacter[ch.id] ?? [], cap);
    // The phone-sized card swaps the blurb + full pros/cons for this one-line strength · quirk hint.
    const hint = `<p class="gs-charcard-hint"><span style="color:var(--gs-accent);">✓</span> ${ch.pros[0] ?? ''} <span style="color:var(--gs-warn);">▲</span> ${ch.cons[0] ?? ''}</p>`;
    return `
      <button class="gs-charcard" data-action='${JSON.stringify({ type: 'selectCharacter', characterId: ch.id })}'
        style="--cc:${cap};animation-delay:${i * 70}ms;">
        <span class="gs-charcard-sheen" aria-hidden="true"></span>
        <div class="gs-charcard-top">
          <div class="gs-charcard-port">${golferSVG(ch.style, 64, 76)}</div>
          <div class="gs-charcard-id">
            <b class="gs-charcard-name" style="color:${cap};">${ch.name}</b>
            <div class="gs-charcard-org">${ch.origin} · ${ch.identity}</div>
          </div>
        </div>
        <p class="gs-charcard-blurb">${ch.blurb}</p>
        <div class="gs-charcard-stats">${statRows(ch.stats, cap)}</div>
        ${hint}
        <ul class="gs-charcard-pc">${pros}${cons}</ul>
        ${unlocks}
        <span class="gs-charcard-cta" style="--cc:${cap};">${verb} ${ch.shortName} <span aria-hidden="true">→</span></span>
      </button>`;
  }).join('');
  return `
    <header class="gs-charhead" style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1>Choose your golfer</h1>
      <p>${opts.modeName ? `<b style="color:var(--gs-gold);">${opts.modeName}</b> · ` : ''}Four wildly different swings — each trades a clear strength for a clear quirk.</p>
    </header>
    <div class="gs-charwrap">${cards}</div>`;
}

/** 1 → "1st", 2 → "2nd", … */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** A short style/home tag for a competitor (their constellation, rival flag, or archetype label). */
export function golferTag(id: string): string {
  if (id === PLAYER_ID) return 'You';
  const g = getGolfer(id);
  if (!g) return '';
  if (g.home) {
    const t = themeById(g.home);
    if (t) return t.name;
  }
  if (g.mirrorsCharacter) return 'Rival pro';
  return getArchetype(g.archetypeId).label;
}

/** The arc's field of 20 — shown on the starting-zone intro at the head of each arc. */
export function competitorsCard(field: Field): string {
  const cells = field.golfers
    .map((g) => {
      const champ = g.tier === 'champion';
      const me = g.isPlayer;
      const border = me ? 'var(--gs-accent)' : champ ? '#ffce54' : 'var(--gs-line-2)';
      const tag = golferTag(g.id);
      // Show the golfer's FIRST name, not g.shortName — for champions shortName is the star
      // name (e.g. "Acrux"/"Vega"), which reads as the constellation, not the person.
      const display = me ? 'You' : (g.name.split(' ')[0] || g.shortName);
      return `<div style="flex:0 0 auto;width:78px;text-align:center;padding:6px 4px;border:1px solid ${border};border-radius:9px;background:${me ? '#1a2a22' : '#ffffff06'};">
        <div style="line-height:0;">${golferSVG(g.look, 38, 46)}</div>
        <div style="font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${display}</div>
        <div style="font-size:9px;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${champ ? '★ ' : ''}${tag}</div>
      </div>`;
    })
    .join('');
  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gs-line-2);">
      <div style="font-size:13px;font-weight:700;letter-spacing:.04em;">🏆 The field — ${field.golfers.length} golfers in this arc</div>
      <div style="font-size:11.5px;opacity:.65;margin:3px 0 9px;">Climb the leaderboard each stop; the boss round is a matchplay knockout that pairs the field best-vs-worst (#1 v last) — finish high and you draw a weaker opponent. Constellation champions (★) are dangerous in their home zone.</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${cells}</div>
    </div>`;
}

/** The leaderboard table for the result screen — cumulative arc total, this-stop score, cut line.
 *  `opts.live` renders the mid-stop board (used on the end-of-hole screen): the title reads THRU N and
 *  the per-stop cut divider is suppressed (a partial stop hasn't been scored against the cut yet). */
export function leaderboardHTML(board: Leaderboard, opts: { live?: boolean } = {}): string {
  // Positional cut (GS-positional-cut): survival is your PLACE — the divider reads "top N advance" and is
  // drawn even live (the eliminations above it are real, frozen from prior stops). A Stableford board
  // (flat/ladder) reads "CUT · N pts" and is suppressed mid-stop (a partial stop isn't scored yet).
  const positional = board.mode === 'positional';
  // On a positional BOSS stop there's no advance number (it's a matchplay knockout, decided by the
  // duel) — survivorTarget is undefined there, so DON'T fall back to board.cut (a Stableford figure
  // that read as a nonsense "top 22 advance" with a 20-golfer field). Label it a knockout instead.
  const cutLabel = positional
    ? board.survivorTarget !== undefined
      ? `top ${board.survivorTarget} advance`
      : '⚔ boss round'
    : `CUT · ${board.cut} pts`;
  const showDivider = positional || !opts.live;
  let drewCut = false;
  const rows = board.standings
    .map((s) => {
      const me = s.isPlayer;
      // Draw the cut divider just before the first cut (eliminated) golfer.
      const divider =
        showDivider && !drewCut && s.cut
          ? ((drewCut = true),
            `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;color:#ff6b6b;font-size:10.5px;letter-spacing:.1em;">
              <div style="flex:1;height:1px;background:#ff6b6b66;"></div>${cutLabel}<div style="flex:1;height:1px;background:#ff6b6b66;"></div></div>`)
          : '';
      const tag = golferTag(s.golferId);
      const stopTxt = s.stopScore !== undefined ? `<span style="opacity:.7;">+${s.stopScore}</span>` : '';
      const row = `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:7px;${
        me ? 'background:#1a2a22;border:1px solid var(--gs-accent);' : 'border:1px solid transparent;'
      }${s.cut ? 'opacity:.5;' : ''}">
        <span style="width:20px;text-align:right;font-size:12px;opacity:.7;">${s.position}</span>
        <span style="width:9px;height:9px;border-radius:50%;background:${s.look.cap};flex:0 0 auto;"></span>
        <span style="flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:${me ? 800 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${me ? 'You' : s.name}${s.tier === 'champion' ? ' <span style="color:#ffce54;">★</span>' : ''}
          <span style="font-size:10px;opacity:.5;"> · ${tag}</span>
        </span>
        <span style="font-size:11px;width:34px;text-align:right;">${stopTxt}</span>
        <span style="font-size:13px;font-weight:800;width:30px;text-align:right;">${s.total}</span>
      </div>`;
      return divider + row;
    })
    .join('');
  return `
    <div style="border:1px solid var(--gs-line);border-radius:10px;padding:8px;background:#0d1016;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;opacity:.55;letter-spacing:.08em;padding:0 8px 4px;">
        <span>ARC LEADERBOARD${board.thru ? ` · THRU ${board.thru}` : ''}</span><span>STOP · TOTAL</span>
      </div>
      ${rows}
    </div>`;
}

/** A framed opponent badge (avatar + name + style) for a matchplay duel. */
export function opponentBadge(id: string, sub: string): string {
  const g = getGolfer(id);
  if (!g) return '';
  const tag = g.home ? themeById(g.home)?.name ?? '' : getArchetype(g.archetypeId).label;
  return `<div style="display:flex;align-items:center;gap:10px;">
      <div style="line-height:0;border:2px solid #ffce54;border-radius:10px;background:#1a0e12;padding:2px;">${golferSVG(g.look, 44, 54)}</div>
      <div><div style="font-size:15px;font-weight:800;">${g.name}</div>
        <div style="font-size:11px;opacity:.7;">${g.tier === 'champion' ? '★ ' : ''}${tag}${sub ? ` · ${sub}` : ''}</div></div>
    </div>`;
}

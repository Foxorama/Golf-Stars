/**
 * Lore-screen portraits (GS-lore) — bespoke, self-contained SVG busts for the story popups, in the
 * house "no downloaded asset" vector language. A lore event names a `portrait` id; `lorePortraitSVG`
 * maps it to a picture. These are close-ups (a face you can read), NOT the tiny shop-card caddy
 * figures — a story beat wants the character looking at you.
 *
 * Pure string builders — no DOM, no rng. Dropped into a screen via innerHTML like the other art.
 */

/** Resolve a lore event's `portrait` id to a full `<svg>` bust, or '' for an unknown id. */
export function lorePortraitSVG(id: string): string {
  switch (id) {
    case 'driver-dan':
      return driverDanPortraitSVG();
    default:
      return '';
  }
}

/**
 * Driver Dan, up close — the burly long-haul caddy in his orange cap, weathered and wistful. Same
 * palette as his on-course figure (`caddyArt.ts` / `itemArt.ts`: orange shirt #e0883a, cap #c4882a,
 * skin #d8a878) so he's unmistakably the same man, but drawn as a proper portrait: greying stubble, a
 * lined brow, eyes turned to the side, and the head of his slung driver just cresting his shoulder.
 */
export function driverDanPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Driver Dan" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-lore-dan-spot" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#5a4a38" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#2c2620" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#12100c" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-lore-dan-shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8974a"/>
      <stop offset="100%" stop-color="#c06f28"/>
    </linearGradient>
    <linearGradient id="gs-lore-dan-cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d89a3a"/>
      <stop offset="100%" stop-color="#a86f1c"/>
    </linearGradient>
  </defs>

  <!-- soft spotlight halo -->
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-lore-dan-spot)"/>

  <!-- the head of his slung driver cresting the far shoulder (identity callback) -->
  <g transform="translate(232 214) rotate(-24)" stroke="#c8ccd6" stroke-width="6" stroke-linecap="round">
    <line x1="-6" y1="46" x2="30" y2="-30"/>
  </g>
  <ellipse cx="266" cy="180" rx="20" ry="14" transform="rotate(-24 266 180)" fill="#2b2f3a" stroke="#41475a" stroke-width="2"/>
  <ellipse cx="260" cy="176" rx="7" ry="4" transform="rotate(-24 266 180)" fill="#3a3f4c"/>

  <!-- shoulders / caddy shirt -->
  <path d="M40 340 Q44 250 96 236 Q160 224 224 236 Q276 250 280 340 Z" fill="url(#gs-lore-dan-shirt)"/>
  <!-- shirt shading + placket -->
  <path d="M40 340 Q44 250 96 236 Q120 232 132 236 Q96 262 88 340 Z" fill="#000" opacity="0.10"/>
  <path d="M150 240 L160 262 L170 240 Z" fill="#b3641f"/>
  <path d="M158 262 L160 340 L162 262 Z" fill="#a85c1a" opacity="0.7"/>
  <!-- collar -->
  <path d="M126 238 Q160 268 194 238 L206 250 Q160 288 114 250 Z" fill="#c9772c"/>
  <path d="M126 238 Q160 268 194 238 L194 244 Q160 270 126 244 Z" fill="#8f4f16" opacity="0.6"/>

  <!-- neck -->
  <path d="M134 220 Q134 250 160 256 Q186 250 186 220 L186 196 L134 196 Z" fill="#c2916a"/>
  <path d="M134 220 Q134 246 160 252 L160 200 L134 200 Z" fill="#000" opacity="0.08"/>

  <!-- head -->
  <path d="M104 158 Q104 96 160 92 Q216 96 216 158 Q216 214 160 224 Q104 214 104 158 Z" fill="#d8a878"/>
  <!-- cheek + jaw shadow -->
  <path d="M160 224 Q120 216 108 168 Q118 208 160 216 Z" fill="#000" opacity="0.08"/>
  <path d="M160 224 Q200 216 212 168 Q202 208 160 216 Z" fill="#000" opacity="0.05"/>

  <!-- ears -->
  <ellipse cx="106" cy="164" rx="9" ry="14" fill="#d0a06f"/>
  <ellipse cx="214" cy="164" rx="9" ry="14" fill="#cf9f6e"/>
  <path d="M104 158 Q110 164 106 172" fill="none" stroke="#a97f52" stroke-width="2" stroke-linecap="round"/>

  <!-- greying stubble along the jaw -->
  <path d="M112 176 Q120 214 160 222 Q200 214 208 176 Q200 206 160 214 Q120 206 112 176 Z" fill="#8f887c" opacity="0.55"/>
  <path d="M126 200 Q160 218 194 200 Q160 210 126 200 Z" fill="#736c62" opacity="0.5"/>

  <!-- brow line + forehead crease -->
  <path d="M122 132 Q160 122 198 132" fill="none" stroke="#b98a5c" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <path d="M130 118 Q160 111 190 118" fill="none" stroke="#b98a5c" stroke-width="2" stroke-linecap="round" opacity="0.4"/>

  <!-- eyebrows (bushy, greying) -->
  <path d="M124 138 Q140 130 156 137 Q140 134 124 141 Z" fill="#7c7468"/>
  <path d="M164 137 Q180 130 196 138 Q180 134 164 141 Z" fill="#7c7468"/>

  <!-- eyes, turned slightly to his right (viewer's left) — a wistful, faraway look -->
  <ellipse cx="140" cy="150" rx="13" ry="8" fill="#efe9df"/>
  <ellipse cx="180" cy="150" rx="13" ry="8" fill="#efe9df"/>
  <circle cx="135" cy="151" r="4.6" fill="#4a3b2a"/>
  <circle cx="175" cy="151" r="4.6" fill="#4a3b2a"/>
  <circle cx="133.5" cy="149.5" r="1.4" fill="#fff" opacity="0.85"/>
  <circle cx="173.5" cy="149.5" r="1.4" fill="#fff" opacity="0.85"/>
  <!-- upper lids + tired bags -->
  <path d="M127 148 Q140 142 153 148" fill="none" stroke="#3a2e22" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M167 148 Q180 142 193 148" fill="none" stroke="#3a2e22" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M129 158 Q140 162 151 158" fill="none" stroke="#b98a5c" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <path d="M169 158 Q180 162 191 158" fill="none" stroke="#b98a5c" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <!-- crow's feet -->
  <path d="M120 150 l-6 -3 M121 154 l-6 1" stroke="#b98a5c" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <path d="M200 150 l6 -3 M199 154 l6 1" stroke="#b98a5c" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>

  <!-- nose -->
  <path d="M160 150 Q156 168 150 178 Q160 184 170 178 Q164 168 160 150 Z" fill="#cf9f6e"/>
  <path d="M150 178 Q160 183 170 178" fill="none" stroke="#a97f52" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>

  <!-- mouth — a quiet, downturned line under the moustache stubble -->
  <path d="M138 196 Q160 202 182 196" fill="none" stroke="#7a4d34" stroke-width="3" stroke-linecap="round"/>
  <path d="M138 196 Q160 191 182 196" fill="none" stroke="#b98a5c" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>
  <!-- nasolabial lines -->
  <path d="M146 178 Q140 190 144 198" fill="none" stroke="#b98a5c" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
  <path d="M174 178 Q180 190 176 198" fill="none" stroke="#b98a5c" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>

  <!-- cap: brim + dome -->
  <path d="M96 118 Q102 92 160 88 Q218 92 224 118 Q160 108 96 118 Z" fill="url(#gs-lore-dan-cap)"/>
  <path d="M96 118 Q160 106 224 118 Q232 122 232 128 Q160 116 88 128 Q88 122 96 118 Z" fill="#8a5c14"/>
  <path d="M104 100 Q104 60 160 56 Q216 60 216 100 Q216 108 210 114 Q160 100 110 114 Q104 108 104 100 Z" fill="url(#gs-lore-dan-cap)"/>
  <!-- cap seam + highlight -->
  <path d="M160 56 L160 108" stroke="#8a5c14" stroke-width="1.6" opacity="0.5"/>
  <path d="M118 74 Q140 62 164 64" fill="none" stroke="#eab558" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <!-- little golf-ball emblem on the crown -->
  <circle cx="160" cy="82" r="9" fill="#f4efe6" stroke="#c9c2b4" stroke-width="1.5"/>
  <g fill="#c9c2b4"><circle cx="156" cy="79" r="1"/><circle cx="163" cy="79" r="1"/><circle cx="160" cy="83" r="1"/><circle cx="156" cy="86" r="1"/><circle cx="163" cy="86" r="1"/></g>
</svg>`;
}

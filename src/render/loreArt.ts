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
    case 'prognostic-parrot':
      return prognosticParrotPortraitSVG();
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

/**
 * The Prognostic Parrot, up close — the bipedal green pirate captain from his on-course figure
 * (`caddyArt.ts`: green torso #37a05a, belly #7ed957, gold beak #f0b429, tricorne #2b2f3a with gold
 * #d9a441 trim, eyepatch) reborn as a story portrait: a navy pirate coat with gold braid, weathered
 * feathers, one eye behind the patch — and the good eye turned to STEEL, cold and resolved, as he swears
 * he won't fail again. A brass spyglass (his foresight) rests at the shoulder. Same palette as the caddy
 * so he's unmistakably the same bird, drawn as a face you can read.
 */
export function prognosticParrotPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="The Prognostic Parrot" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-lore-parrot-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#2a5a4a" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#152a28" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0a1210" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-lore-parrot-coat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b2f66"/>
      <stop offset="100%" stop-color="#0e1a3e"/>
    </linearGradient>
    <linearGradient id="gs-lore-parrot-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#41b466"/>
      <stop offset="100%" stop-color="#2f8f47"/>
    </linearGradient>
    <linearGradient id="gs-lore-parrot-hat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#333947"/>
      <stop offset="100%" stop-color="#20242e"/>
    </linearGradient>
  </defs>

  <!-- soft spotlight halo -->
  <ellipse cx="160" cy="148" rx="150" ry="162" fill="url(#gs-lore-parrot-spot)"/>

  <!-- the brass spyglass (his foresight) resting at the far shoulder -->
  <g transform="translate(236 224) rotate(-28)">
    <rect x="-4" y="-6" width="34" height="12" rx="3" fill="#c8912f" stroke="#8a5f1c" stroke-width="1.5"/>
    <rect x="26" y="-7.5" width="9" height="15" rx="2" fill="#e8b64a" stroke="#8a5f1c" stroke-width="1.5"/>
    <rect x="2" y="-6" width="4" height="12" fill="#8a5f1c" opacity="0.5"/>
  </g>

  <!-- shoulders / navy pirate coat with gold braid -->
  <path d="M34 340 Q40 250 96 236 Q160 224 224 236 Q280 250 286 340 Z" fill="url(#gs-lore-parrot-coat)"/>
  <path d="M34 340 Q40 250 96 236 Q120 232 132 236 Q92 262 84 340 Z" fill="#000" opacity="0.16"/>
  <!-- lapels + gold trim -->
  <path d="M120 240 Q160 300 200 240 L214 252 Q160 322 106 252 Z" fill="#0b1533"/>
  <path d="M120 240 Q160 300 200 240" fill="none" stroke="#d9a441" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M108 252 Q160 320 212 252" fill="none" stroke="#d9a441" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
  <!-- gold buttons -->
  <g fill="#e8c25a"><circle cx="150" cy="292" r="3.4"/><circle cx="170" cy="292" r="3.4"/><circle cx="156" cy="312" r="3.2"/><circle cx="164" cy="312" r="3.2"/></g>
  <!-- shoulder epaulette fringe -->
  <g stroke="#e8c25a" stroke-width="2.4" stroke-linecap="round"><line x1="70" y1="252" x2="66" y2="270"/><line x1="80" y1="250" x2="78" y2="268"/><line x1="90" y1="250" x2="90" y2="268"/></g>

  <!-- green feathered neck + chest, brighter belly -->
  <path d="M120 236 Q120 206 160 200 Q200 206 200 236 Q200 262 160 268 Q120 262 120 236 Z" fill="url(#gs-lore-parrot-body)"/>
  <path d="M138 232 Q160 214 182 232 Q182 254 160 260 Q138 254 138 232 Z" fill="#7ed957" opacity="0.9"/>
  <!-- chest feather flecks -->
  <g fill="#2f8f47" opacity="0.7"><path d="M150 236 q-3 5 0 9"/><path d="M160 238 q-3 5 0 9"/><path d="M170 236 q-3 5 0 9"/></g>

  <!-- head: round green skull -->
  <path d="M108 150 Q108 92 160 88 Q212 92 212 150 Q212 204 160 214 Q108 204 108 150 Z" fill="url(#gs-lore-parrot-body)"/>
  <!-- cheek feather shading -->
  <path d="M160 214 Q122 204 112 160 Q124 198 160 206 Z" fill="#000" opacity="0.10"/>
  <path d="M160 214 Q198 204 208 160 Q196 198 160 206 Z" fill="#000" opacity="0.06"/>
  <!-- a spray of nape feathers -->
  <g fill="#2f8f47"><path d="M108 138 q-12 -4 -18 4 q10 0 16 6 Z"/><path d="M110 156 q-13 0 -18 9 q10 -3 17 2 Z"/></g>
  <!-- blue flight-feather flecks over the crown edge -->
  <g stroke="#4b7bd6" stroke-width="3" stroke-linecap="round"><line x1="120" y1="112" x2="126" y2="106"/><line x1="134" y1="104" x2="139" y2="98"/></g>

  <!-- curved golden beak, hooked -->
  <path d="M198 150 Q236 150 232 172 Q228 188 208 186 Q216 176 210 166 Q206 158 198 158 Z" fill="#f0b429" stroke="#c8912f" stroke-width="2"/>
  <path d="M206 172 Q216 174 224 170" fill="none" stroke="#b5801f" stroke-width="2" stroke-linecap="round"/>
  <path d="M232 172 Q228 182 214 184" fill="#c8912f" opacity="0.5"/>
  <!-- lower mandible seam -->
  <path d="M200 172 Q212 178 210 186" fill="none" stroke="#b5801f" stroke-width="1.6" stroke-linecap="round"/>

  <!-- brow ridge — furrowed, resolute -->
  <path d="M126 128 Q150 118 172 126" fill="none" stroke="#22643a" stroke-width="4" stroke-linecap="round"/>

  <!-- good eye (viewer's left): turned to STEEL — cold, pale, resolved -->
  <circle cx="150" cy="146" r="17" fill="#f0f4f6"/>
  <circle cx="150" cy="146" r="17" fill="none" stroke="#1a4a34" stroke-width="2"/>
  <circle cx="152" cy="147" r="8.5" fill="#8fb0c0"/>
  <circle cx="152" cy="147" r="4.6" fill="#20323c"/>
  <circle cx="149" cy="144" r="1.8" fill="#fff"/>
  <!-- a hard, low lid over the steel eye -->
  <path d="M133 140 Q150 132 167 140" fill="none" stroke="#1a4a34" stroke-width="3.2" stroke-linecap="round"/>

  <!-- eyepatch over the far eye, black strap crossing the crown -->
  <path d="M182 138 Q196 132 205 140 Q206 152 196 156 Q184 154 182 144 Z" fill="#12161c" stroke="#000" stroke-width="1.5"/>
  <path d="M118 116 Q160 122 205 140" fill="none" stroke="#12161c" stroke-width="4" stroke-linecap="round"/>

  <!-- pirate tricorne hat: three cocked corners over the crown -->
  <path d="M92 118 Q100 74 160 70 Q220 74 228 118 Q188 96 160 96 Q132 96 92 118 Z" fill="url(#gs-lore-parrot-hat)"/>
  <path d="M78 120 Q160 90 242 120 Q244 128 236 132 Q160 104 84 132 Q76 128 78 120 Z" fill="#20242e"/>
  <!-- cocked side points -->
  <path d="M78 120 Q86 104 100 108 Q90 116 84 128 Z" fill="#2b2f3a"/>
  <path d="M242 120 Q234 104 220 108 Q230 116 236 128 Z" fill="#2b2f3a"/>
  <!-- gold trim braid along the brim -->
  <path d="M92 118 Q160 92 228 118" fill="none" stroke="#d9a441" stroke-width="3" stroke-linecap="round"/>
  <!-- gold badge on the front -->
  <circle cx="160" cy="106" r="7" fill="#e8c25a" stroke="#a8791c" stroke-width="2"/>
  <path d="M160 100 l1.8 3.6 4 0.6 -2.9 2.8 0.7 4 -3.6 -1.9 -3.6 1.9 0.7 -4 -2.9 -2.8 4 -0.6 Z" fill="#a8791c"/>
</svg>`;
}

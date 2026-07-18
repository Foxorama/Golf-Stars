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
    case 'venoma':
      return venomaPortraitSVG();
    case 'coilkeeper':
      return coilkeeperPortraitSVG();
    case 'voss':
      return vossPortraitSVG();
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

/**
 * Venoma "the Viper" Krait, up close (GS-story-beats) — the Story-Tour rival, a viper-woman pro. A cold
 * beauty with a serpent's poise: acid-violet skin under a scaled hood, slit-pupil amber eyes, and a
 * smile that's all teeth. Her palette is the Coil's — venom-violet #b060c0 / acid-green #7fe0a0 / deep
 * plum — a mirror of the cultists she leads. Drawn as a face you can read: charming on the surface, with
 * something scared and coiled underneath (the beat's whole point). A hissing snake coils at her collar.
 */
export function venomaPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Venoma the Viper Krait" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-lore-ven-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#4a2a5c" stop-opacity="0.92"/>
      <stop offset="55%" stop-color="#241230" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#100818" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-lore-ven-cloak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a1a4a"/>
      <stop offset="100%" stop-color="#1c0d28"/>
    </linearGradient>
    <linearGradient id="gs-lore-ven-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c79fd6"/>
      <stop offset="100%" stop-color="#a072b8"/>
    </linearGradient>
    <linearGradient id="gs-lore-ven-hood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7a3a94"/>
      <stop offset="100%" stop-color="#4a1e60"/>
    </linearGradient>
  </defs>

  <!-- soft spotlight halo -->
  <ellipse cx="160" cy="150" rx="150" ry="162" fill="url(#gs-lore-ven-spot)"/>

  <!-- shoulders / scaled plum cloak -->
  <path d="M34 340 Q40 250 96 236 Q160 222 224 236 Q280 250 286 340 Z" fill="url(#gs-lore-ven-cloak)"/>
  <path d="M34 340 Q40 250 96 236 Q120 232 132 236 Q92 262 84 340 Z" fill="#000" opacity="0.18"/>
  <!-- scale texture on the cloak -->
  <g fill="#5a2a72" opacity="0.6"><path d="M70 300 q8 -8 16 0 q-8 8 -16 0 Z"/><path d="M100 312 q8 -8 16 0 q-8 8 -16 0 Z"/><path d="M204 312 q8 -8 16 0 q-8 8 -16 0 Z"/><path d="M234 300 q8 -8 16 0 q-8 8 -16 0 Z"/></g>
  <!-- collar with acid-green trim -->
  <path d="M118 240 Q160 292 202 240 L214 252 Q160 314 106 252 Z" fill="#160a20"/>
  <path d="M118 240 Q160 292 202 240" fill="none" stroke="#7fe0a0" stroke-width="3" stroke-linecap="round" opacity="0.85"/>

  <!-- a small hissing snake coiled at her collar (identity motif) -->
  <g transform="translate(196 262)">
    <path d="M0 12 q10 -2 8 -12 q-2 -8 8 -8 q10 0 8 8" fill="none" stroke="#7fe0a0" stroke-width="5" stroke-linecap="round"/>
    <circle cx="24" cy="-2" r="4" fill="#7fe0a0"/>
    <circle cx="25.5" cy="-3" r="1.2" fill="#160a20"/>
    <path d="M28 -2 l6 -2 M28 -1 l6 2" stroke="#c9433a" stroke-width="1.4" stroke-linecap="round"/>
  </g>

  <!-- neck -->
  <path d="M136 220 Q136 250 160 256 Q184 250 184 220 L184 198 L136 198 Z" fill="url(#gs-lore-ven-skin)"/>
  <path d="M136 220 Q136 246 160 252 L160 202 L136 202 Z" fill="#000" opacity="0.10"/>

  <!-- head: a slim serpentine face -->
  <path d="M110 152 Q110 96 160 92 Q210 96 210 152 Q210 206 160 220 Q110 206 110 152 Z" fill="url(#gs-lore-ven-skin)"/>
  <!-- jaw + cheek shading -->
  <path d="M160 220 Q124 208 114 162 Q126 202 160 212 Z" fill="#000" opacity="0.10"/>
  <path d="M160 220 Q196 208 206 162 Q194 202 160 212 Z" fill="#000" opacity="0.06"/>

  <!-- diamond scale pattern down the temples/cheeks -->
  <g fill="#8f5aa8" opacity="0.55">
    <path d="M124 150 l6 -6 6 6 -6 6 Z"/><path d="M124 170 l6 -6 6 6 -6 6 Z"/>
    <path d="M196 150 l-6 -6 -6 6 6 6 Z"/><path d="M196 170 l-6 -6 -6 6 6 6 Z"/>
  </g>
  <!-- a darker venom mark down the nose bridge -->
  <path d="M160 122 Q156 150 160 176 Q164 150 160 122 Z" fill="#8f5aa8" opacity="0.4"/>

  <!-- sculpted brows, arched high (amused, cruel) -->
  <path d="M126 134 Q142 122 158 132 Q142 128 126 138 Z" fill="#3a1a4a"/>
  <path d="M162 132 Q178 122 194 134 Q178 128 162 138 Z" fill="#3a1a4a"/>

  <!-- eyes: amber with a vertical SLIT pupil (viper) -->
  <path d="M128 150 Q140 140 154 150 Q140 160 128 150 Z" fill="#fdf0d6"/>
  <path d="M166 150 Q180 140 192 150 Q180 160 166 150 Z" fill="#fdf0d6"/>
  <ellipse cx="141" cy="150" rx="8" ry="9" fill="#f0a828"/>
  <ellipse cx="179" cy="150" rx="8" ry="9" fill="#f0a828"/>
  <ellipse cx="141" cy="150" rx="2.2" ry="9" fill="#1a0e10"/>
  <ellipse cx="179" cy="150" rx="2.2" ry="9" fill="#1a0e10"/>
  <circle cx="138.5" cy="146" r="1.6" fill="#fff" opacity="0.9"/>
  <circle cx="176.5" cy="146" r="1.6" fill="#fff" opacity="0.9"/>
  <!-- upper liner -->
  <path d="M127 148 Q140 138 155 148" fill="none" stroke="#2a1030" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M165 148 Q180 138 193 148" fill="none" stroke="#2a1030" stroke-width="2.4" stroke-linecap="round"/>

  <!-- slim nose -->
  <path d="M160 154 Q157 170 153 178 Q160 182 167 178 Q163 170 160 154 Z" fill="#9868b0"/>

  <!-- smile — all teeth, with two little fangs -->
  <path d="M134 192 Q160 208 186 192 Q160 200 134 192 Z" fill="#160a20"/>
  <path d="M138 194 Q160 204 182 194 Q160 198 138 194 Z" fill="#f4eef6"/>
  <path d="M148 196 l3 8 3 -8 Z" fill="#f4eef6"/>
  <path d="M172 196 l-3 8 -3 -8 Z" fill="#f4eef6"/>
  <path d="M134 192 Q160 208 186 192" fill="none" stroke="#c98adf" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>

  <!-- scaled hood framing the face, drawn back -->
  <path d="M96 150 Q92 84 160 76 Q228 84 224 150 Q224 118 206 104 Q160 84 114 104 Q96 118 96 150 Z" fill="url(#gs-lore-ven-hood)"/>
  <!-- hood scale ridges -->
  <g fill="#5a2a72" opacity="0.7"><path d="M108 120 q6 -6 12 0 q-6 6 -12 0 Z"/><path d="M200 120 q6 -6 12 0 q-6 6 -12 0 Z"/><path d="M124 100 q6 -6 12 0 q-6 6 -12 0 Z"/><path d="M184 100 q6 -6 12 0 q-6 6 -12 0 Z"/></g>
  <!-- acid-green Coil sigil at the hood crown -->
  <g transform="translate(160 96)">
    <circle r="9" fill="none" stroke="#7fe0a0" stroke-width="2.2"/>
    <path d="M-4 5 Q6 3 4 -4 Q3 -8 -2 -7" fill="none" stroke="#7fe0a0" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="5" cy="-5" r="1.8" fill="#7fe0a0"/>
  </g>
</svg>`;
}

/**
 * A Coilkeeper, up close (GS-story-beats) — one of the hooded cultists who ring the tee in Chapter 3. A
 * FACELESS figure: a deep cowl with only a cold acid-green glow where a face should be, the serpent sigil
 * burning on the chest. No skin, no eyes you can meet — the point is that they are unmoving and unreadable.
 * The Coil palette (venom-violet + acid-green) marks them as Venoma's order. Deliberately austere versus
 * the two character portraits — a robe and a void, not a face.
 */
export function coilkeeperPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="A Coilkeeper" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-lore-ck-spot" cx="50%" cy="42%" r="64%">
      <stop offset="0%" stop-color="#2a3a30" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#141c18" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#080c0a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-lore-ck-robe" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2e1c3c"/>
      <stop offset="100%" stop-color="#160c1e"/>
    </linearGradient>
    <linearGradient id="gs-lore-ck-hood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3a2450"/>
      <stop offset="100%" stop-color="#1c1028"/>
    </linearGradient>
    <radialGradient id="gs-lore-ck-void" cx="50%" cy="46%" r="60%">
      <stop offset="0%" stop-color="#7fe0a0" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#2f7a54" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#040806" stop-opacity="1"/>
    </radialGradient>
  </defs>

  <!-- soft spotlight halo -->
  <ellipse cx="160" cy="152" rx="150" ry="162" fill="url(#gs-lore-ck-spot)"/>

  <!-- shoulders / heavy hooded robe -->
  <path d="M28 340 Q34 246 96 230 Q160 216 224 230 Q286 246 292 340 Z" fill="url(#gs-lore-ck-robe)"/>
  <!-- robe fold shadows -->
  <path d="M96 230 Q108 300 96 340 L74 340 Q72 268 96 230 Z" fill="#000" opacity="0.22"/>
  <path d="M224 230 Q212 300 224 340 L246 340 Q248 268 224 230 Z" fill="#000" opacity="0.22"/>
  <path d="M160 250 L160 340" stroke="#000" stroke-width="10" opacity="0.18"/>
  <!-- acid-green cord at the collar -->
  <path d="M118 236 Q160 268 202 236" fill="none" stroke="#5aa878" stroke-width="3" stroke-linecap="round" opacity="0.7"/>

  <!-- burning serpent sigil on the chest -->
  <g transform="translate(160 288)">
    <circle r="26" fill="#0c1410" stroke="#2f7a54" stroke-width="2" opacity="0.9"/>
    <path d="M-12 12 Q14 8 10 -8 Q7 -18 -6 -16 Q-16 -14 -13 -4" fill="none" stroke="#7fe0a0" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="12" cy="-10" r="4" fill="#7fe0a0"/>
    <circle cx="13.5" cy="-11" r="1.4" fill="#0c1410"/>
    <path d="M16 -10 l7 -3 M16 -9 l7 3" stroke="#7fe0a0" stroke-width="1.6" stroke-linecap="round"/>
  </g>

  <!-- the deep cowl -->
  <path d="M84 156 Q78 74 160 66 Q242 74 236 156 Q236 210 200 234 Q160 250 120 234 Q84 210 84 156 Z" fill="url(#gs-lore-ck-hood)"/>
  <!-- hood inner shadow ring -->
  <path d="M104 158 Q100 96 160 90 Q220 96 216 158 Q216 200 186 220 Q160 232 134 220 Q104 200 104 158 Z" fill="#0c0810"/>
  <!-- the faceless void within, cold green glow -->
  <ellipse cx="160" cy="156" rx="46" ry="60" fill="url(#gs-lore-ck-void)"/>
  <!-- two dim points where eyes might be — no face, just a suggestion -->
  <ellipse cx="146" cy="150" rx="4.5" ry="7" fill="#aef0c4" opacity="0.85"/>
  <ellipse cx="174" cy="150" rx="4.5" ry="7" fill="#aef0c4" opacity="0.85"/>
  <ellipse cx="146" cy="150" rx="4.5" ry="7" fill="none" stroke="#7fe0a0" stroke-width="1" opacity="0.6"/>
  <ellipse cx="174" cy="150" rx="4.5" ry="7" fill="none" stroke="#7fe0a0" stroke-width="1" opacity="0.6"/>

  <!-- hood outer highlight + scale ridges down the crown -->
  <path d="M84 156 Q78 74 160 66 Q242 74 236 156" fill="none" stroke="#5a3a78" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <g fill="#4a2e64" opacity="0.7"><path d="M160 84 q7 -6 14 0 q-7 6 -14 0 Z"/><path d="M138 96 q6 -6 12 0 q-6 6 -12 0 Z"/><path d="M182 96 q6 -6 12 0 q-6 6 -12 0 Z"/></g>
  <!-- a small acid sigil pin at the brow of the hood -->
  <circle cx="160" cy="100" r="6" fill="none" stroke="#7fe0a0" stroke-width="2" opacity="0.8"/>
  <circle cx="160" cy="100" r="1.8" fill="#7fe0a0" opacity="0.9"/>
</svg>`;
}

/**
 * Malachai "Sable" Voss, the Apostate, up close (GS-story-apostate) — the World Tour champion BEFORE you,
 * the last mortal to play a course perfectly true, who heard the serpent whisper and fell. Your dark
 * mirror. Drawn as a HUMAN face (unlike the viper Venoma or the faceless Coilkeeper) so the tragedy reads:
 * a gaunt, once-handsome champion, hollow-cheeked, hair gone half to grey, a thin CERTAIN smile — a man
 * utterly at peace with the end of everything, which is worse than any snarl. The corruption is subtle:
 * an acid-green serpent-shine behind the eyes, and a coat grown from SHED serpent-scale (plum + acid-green
 * edge, the Coil palette) drawn over a champion's collar. His identity motif is the BLACK DRIVER THAT
 * DRIPS resting at the far shoulder (the mirror of Driver Dan's honest slung driver), a bead of dark
 * ichor falling from its head. Desaturated and human next to Venoma's saturated menace — grief, not venom.
 */
export function vossPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Malachai Sable Voss the Apostate" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-lore-voss-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#33304a" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#181628" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#090812" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-lore-voss-coat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#33244a"/>
      <stop offset="100%" stop-color="#171026"/>
    </linearGradient>
    <linearGradient id="gs-lore-voss-skin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b9b0bd"/>
      <stop offset="100%" stop-color="#8f8598"/>
    </linearGradient>
    <radialGradient id="gs-lore-voss-eye" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="#9ff0bf"/>
      <stop offset="100%" stop-color="#2f6a4c"/>
    </radialGradient>
  </defs>

  <!-- soft spotlight halo -->
  <ellipse cx="160" cy="150" rx="150" ry="162" fill="url(#gs-lore-voss-spot)"/>

  <!-- the BLACK DRIVER THAT DRIPS, resting at the far shoulder (his identity motif — a dark mirror of
       Driver Dan's honest slung driver) -->
  <g transform="translate(238 214) rotate(-26)" stroke="#1a1622" stroke-width="6" stroke-linecap="round">
    <line x1="-8" y1="48" x2="30" y2="-32"/>
  </g>
  <path d="M262 172 Q286 172 284 192 Q282 206 262 204 Q248 202 248 186 Q248 174 262 172 Z" transform="rotate(-26 266 188)" fill="#100c18" stroke="#3a2e4a" stroke-width="2"/>
  <ellipse cx="256" cy="182" rx="6" ry="3.4" transform="rotate(-26 266 188)" fill="#2a2238"/>
  <!-- a bead of dark ichor falling from the driver head -->
  <path d="M270 210 q-3 8 0 14 q3 -6 0 -14 Z" fill="#1a1226" opacity="0.9"/>
  <circle cx="270" cy="228" r="3.2" fill="#140e20"/>

  <!-- shoulders / coat of shed serpent-scale -->
  <path d="M34 340 Q40 250 96 236 Q160 224 224 236 Q280 250 286 340 Z" fill="url(#gs-lore-voss-coat)"/>
  <path d="M34 340 Q40 250 96 236 Q120 232 132 236 Q92 262 84 340 Z" fill="#000" opacity="0.18"/>
  <!-- shed-scale texture, acid-green edged -->
  <g fill="#2f2246" opacity="0.7"><path d="M72 298 q9 -9 18 0 q-9 9 -18 0 Z"/><path d="M104 312 q9 -9 18 0 q-9 9 -18 0 Z"/><path d="M200 312 q9 -9 18 0 q-9 9 -18 0 Z"/><path d="M232 298 q9 -9 18 0 q-9 9 -18 0 Z"/></g>
  <g fill="none" stroke="#4f8f6a" stroke-width="1.4" opacity="0.5"><path d="M72 298 q9 -9 18 0"/><path d="M232 298 q9 -9 18 0"/></g>
  <!-- a champion's collar under the coat, one green-lit lapel edge -->
  <path d="M122 240 Q160 292 198 240 L210 250 Q160 312 110 250 Z" fill="#120c1e"/>
  <path d="M122 240 Q160 292 198 240" fill="none" stroke="#6fd0a0" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>

  <!-- neck, gaunt -->
  <path d="M138 220 Q138 248 160 254 Q182 248 182 220 L182 198 L138 198 Z" fill="url(#gs-lore-voss-skin)"/>
  <path d="M138 220 Q138 244 160 250 L160 202 L138 202 Z" fill="#000" opacity="0.12"/>
  <!-- hollow at the throat -->
  <path d="M150 210 Q160 220 170 210" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" opacity="0.15"/>

  <!-- head: a lean, hollow-cheeked champion's face -->
  <path d="M112 150 Q112 94 160 90 Q208 94 208 150 Q208 204 160 216 Q112 204 112 150 Z" fill="url(#gs-lore-voss-skin)"/>
  <!-- deep hollow cheeks + jaw shadow -->
  <path d="M160 216 Q124 206 116 158 Q126 194 148 188 Q140 200 160 208 Z" fill="#000" opacity="0.13"/>
  <path d="M160 216 Q196 206 204 158 Q194 194 172 188 Q180 200 160 208 Z" fill="#000" opacity="0.10"/>
  <path d="M134 172 Q140 186 150 190" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" opacity="0.10"/>
  <path d="M186 172 Q180 186 170 190" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" opacity="0.10"/>

  <!-- a creeping scale mark at the temple (the corruption spreading) -->
  <g fill="#5a4a70" opacity="0.5"><path d="M118 140 l5 -5 5 5 -5 5 Z"/><path d="M120 158 l5 -5 5 5 -5 5 Z"/></g>

  <!-- ears -->
  <ellipse cx="112" cy="162" rx="8" ry="13" fill="#a89ab0"/>
  <ellipse cx="208" cy="162" rx="8" ry="13" fill="#a89ab0"/>

  <!-- flat, tired brows -->
  <path d="M124 138 Q140 132 156 138 Q140 135 124 142 Z" fill="#2a2436"/>
  <path d="M164 138 Q180 132 196 138 Q180 135 164 142 Z" fill="#2a2436"/>

  <!-- eyes — hollow, ringed, with a cold acid-green shine behind them (he sees the Long Rest and welcomes it) -->
  <ellipse cx="141" cy="151" rx="12" ry="7.5" fill="#0d1512"/>
  <ellipse cx="179" cy="151" rx="12" ry="7.5" fill="#0d1512"/>
  <circle cx="141" cy="151" r="5.4" fill="url(#gs-lore-voss-eye)"/>
  <circle cx="179" cy="151" r="5.4" fill="url(#gs-lore-voss-eye)"/>
  <circle cx="141" cy="151" r="2.4" fill="#0b1a12"/>
  <circle cx="179" cy="151" r="2.4" fill="#0b1a12"/>
  <circle cx="139" cy="149" r="1.3" fill="#d8ffe8" opacity="0.9"/>
  <circle cx="177" cy="149" r="1.3" fill="#d8ffe8" opacity="0.9"/>
  <!-- hooded upper lids + dark hollows below -->
  <path d="M128 148 Q141 141 154 148" fill="none" stroke="#1a1424" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M166 148 Q179 141 192 148" fill="none" stroke="#1a1424" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M130 160 Q141 164 152 160" fill="none" stroke="#6a5c78" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>
  <path d="M168 160 Q179 164 190 160" fill="none" stroke="#6a5c78" stroke-width="1.6" stroke-linecap="round" opacity="0.6"/>

  <!-- straight nose -->
  <path d="M160 152 Q157 170 152 179 Q160 184 168 179 Q163 170 160 152 Z" fill="#9a8fa4"/>
  <path d="M152 179 Q160 183 168 179" fill="none" stroke="#7a6f86" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>

  <!-- the thin, CERTAIN smile — no cruelty, just a man completely at peace with the end -->
  <path d="M138 196 Q160 204 182 196" fill="none" stroke="#3a2e46" stroke-width="3" stroke-linecap="round"/>
  <path d="M144 199 Q160 205 176 199" fill="none" stroke="#6fd0a0" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>
  <!-- gaunt nasolabial lines -->
  <path d="M147 179 Q141 190 145 199" fill="none" stroke="#6a5c78" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/>
  <path d="M173 179 Q179 190 175 199" fill="none" stroke="#6a5c78" stroke-width="1.6" stroke-linecap="round" opacity="0.45"/>

  <!-- dark hair, swept back, gone half to grey -->
  <path d="M108 132 Q100 78 160 72 Q220 78 212 132 Q212 108 196 100 Q160 84 124 100 Q108 108 108 132 Z" fill="#20202e"/>
  <!-- grey streak + swept strands -->
  <path d="M150 78 Q146 100 150 128" fill="none" stroke="#8a8898" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
  <path d="M120 106 Q140 90 166 90" fill="none" stroke="#3a3a4c" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
  <path d="M196 108 Q182 92 160 90" fill="none" stroke="#3a3a4c" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
  <!-- a faint acid-green halo bleeding from the hair (the whisper he carries) -->
  <path d="M108 128 Q100 80 160 74 Q220 80 212 128" fill="none" stroke="#4f8f6a" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
</svg>`;
}

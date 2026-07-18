/**
 * Caddy ROSTER portrait busts (GS-story-allies) — bespoke, self-contained SVG close-ups of the recruitable
 * story allies, for the clubhouse crew wall + the ally-interaction card. In the house "no downloaded asset"
 * vector language, each in its on-course palette (`caddyArt.ts`) so it's unmistakably the same friend, but
 * drawn as a face you can read (the `loreArt.ts` bust language). Driver Dan + the Prognostic Parrot already
 * have story busts in `loreArt.ts`; this file adds the other five (Penelope, Sandy, Dr Chipinski, Suggestible
 * Sam, Mystic Mole) and dispatches all seven by caddy shop-item id.
 *
 * Pure string builders — no DOM, no rng. viewBox 0 0 320 340 to match the lore busts, so they compose in the
 * same frames. Dropped into a screen via innerHTML like the other art.
 */

import { driverDanPortraitSVG, prognosticParrotPortraitSVG } from './loreArt';

/** Resolve a caddy's shop-item id to a full `<svg>` portrait bust, or '' for an unknown id. */
export function caddyPortraitSVG(caddyId: string): string {
  switch (caddyId) {
    case 'driver-dan':
      return driverDanPortraitSVG();
    case 'prognostic-parrot':
      return prognosticParrotPortraitSVG();
    case 'auto-caddie':
      return penelopePortraitSVG();
    case 'sandy-sandsaver':
      return sandyPortraitSVG();
    case 'dr-chipinski':
      return chipinskiPortraitSVG();
    case 'suggestible-sam':
      return suggestibleSamPortraitSVG();
    case 'mystic-mole':
      return mysticMolePortraitSVG();
    default:
      return '';
  }
}

/** Does a caddy have a roster portrait bust? */
export function hasCaddyPortrait(caddyId: string): boolean {
  return caddyPortraitSVG(caddyId) !== '';
}

/**
 * Penelope Putter, up close — the Wardens' serene short-game sage (`caddyArt.ts`: teal bib #19b2a6, cap
 * #138f86, skin #f0c49a, brown ponytail #6b4a2e). Half-closed, unbothered eyes and a faint knowing smile —
 * she speaks in koans about pace and surrender — with the red pennant of her tended flag over one shoulder.
 */
export function penelopePortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Penelope Putter" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-cp-pen-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#1f6a62" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#123430" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0a1512" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-cp-pen-bib" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22c2b4"/><stop offset="100%" stop-color="#128f86"/>
    </linearGradient>
  </defs>
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-cp-pen-spot)"/>
  <!-- tended flag over the far shoulder (identity callback) -->
  <line x1="250" y1="70" x2="250" y2="238" stroke="#d9dee8" stroke-width="4" stroke-linecap="round"/>
  <path d="M250 74 L288 84 L250 96 Z" fill="#ff5d5d"/>
  <!-- shoulders / teal bib -->
  <path d="M44 340 Q48 256 100 240 Q160 228 220 240 Q272 256 276 340 Z" fill="url(#gs-cp-pen-bib)"/>
  <path d="M44 340 Q48 256 100 240 Q124 236 136 240 Q100 266 92 340 Z" fill="#000" opacity="0.10"/>
  <path d="M132 242 Q160 268 188 242 L198 252 Q160 284 122 252 Z" fill="#0f7a72"/>
  <!-- neck -->
  <path d="M138 224 Q138 252 160 258 Q182 252 182 224 L182 202 L138 202 Z" fill="#e6b488"/>
  <path d="M138 224 Q138 248 160 254 L160 206 L138 206 Z" fill="#000" opacity="0.08"/>
  <!-- hair behind (soft brown, gathered) -->
  <path d="M100 150 Q96 92 160 84 Q224 92 220 150 Q222 190 206 214 Q206 150 160 142 Q114 150 114 214 Q98 190 100 150 Z" fill="#7a5636"/>
  <!-- ponytail to the side -->
  <path d="M206 150 Q244 156 250 200 Q244 232 224 236 Q236 200 214 168 Z" fill="#6b4a2e"/>
  <!-- head -->
  <path d="M112 160 Q112 100 160 96 Q208 100 208 160 Q208 212 160 222 Q112 212 112 160 Z" fill="#f0c49a"/>
  <!-- soft fringe -->
  <path d="M112 148 Q118 104 160 100 Q202 104 208 148 Q182 128 160 130 Q138 128 112 148 Z" fill="#7a5636"/>
  <!-- ears + a small stud -->
  <ellipse cx="112" cy="166" rx="8" ry="12" fill="#e6b488"/><ellipse cx="208" cy="166" rx="8" ry="12" fill="#e6b488"/>
  <circle cx="112" cy="177" r="1.6" fill="#22c2b4"/>
  <!-- serene half-closed eyes -->
  <path d="M128 156 Q142 150 156 156" fill="none" stroke="#3a2e22" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M164 156 Q178 150 192 156" fill="none" stroke="#3a2e22" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M131 160 Q142 164 153 160" fill="none" stroke="#b88a5c" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <path d="M167 160 Q178 164 189 160" fill="none" stroke="#b88a5c" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>
  <!-- calm brows -->
  <path d="M126 144 Q142 140 156 144" fill="none" stroke="#5c4128" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M164 144 Q178 140 194 144" fill="none" stroke="#5c4128" stroke-width="2.4" stroke-linecap="round"/>
  <!-- nose -->
  <path d="M160 158 Q157 174 152 182 Q160 187 168 182 Q163 174 160 158 Z" fill="#e3b184"/>
  <!-- a faint, knowing smile -->
  <path d="M142 198 Q160 210 178 198" fill="none" stroke="#a05a44" stroke-width="3" stroke-linecap="round"/>
</svg>`;
}

/**
 * Sandy the Sand-Saver, up close — the weathered dune escape specialist (`caddyArt.ts`: khaki bush-shirt
 * #b89a5a, wide bush hat #7a6238, tan skin #d8a878). Sun-creased and squinting into the glare, grey stubble,
 * a sand wedge crossing behind the shoulder with a fleck of blown sand — at home where the ball is buried.
 */
export function sandyPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sandy the Sand-Saver" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-cp-san-spot" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#6a5a34" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#332c18" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#14100a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-cp-san-shirt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c8a862"/><stop offset="100%" stop-color="#9a7e40"/>
    </linearGradient>
  </defs>
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-cp-san-spot)"/>
  <!-- sand wedge slung behind, + a little blown sand -->
  <line x1="228" y1="236" x2="262" y2="150" stroke="#c8ccd6" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="266" cy="140" rx="15" ry="9" transform="rotate(-22 266 140)" fill="#aeb6c6" stroke="#8a90a0" stroke-width="2"/>
  <g fill="#e3c98f">${[0, 1, 2, 3].map((i) => `<circle cx="${252 + i * 6}" cy="${128 - i * 5}" r="${2 - i * 0.3}"/>`).join('')}</g>
  <!-- shoulders / khaki bush shirt -->
  <path d="M40 340 Q44 252 96 236 Q160 224 224 236 Q276 252 280 340 Z" fill="url(#gs-cp-san-shirt)"/>
  <path d="M40 340 Q44 252 96 236 Q120 232 132 236 Q96 262 88 340 Z" fill="#000" opacity="0.10"/>
  <!-- shirt pockets + buttons -->
  <rect x="112" y="262" width="26" height="22" rx="3" fill="#8a7038" opacity="0.6"/>
  <rect x="182" y="262" width="26" height="22" rx="3" fill="#8a7038" opacity="0.6"/>
  <g fill="#6a5426">${[262, 288, 314].map((y) => `<circle cx="160" cy="${y}" r="2.4"/>`).join('')}</g>
  <!-- collar -->
  <path d="M126 238 Q160 266 194 238 L206 250 Q160 286 114 250 Z" fill="#a98a44"/>
  <!-- neck -->
  <path d="M134 220 Q134 250 160 256 Q186 250 186 220 L186 196 L134 196 Z" fill="#c2916a"/>
  <!-- head -->
  <path d="M106 158 Q106 100 160 96 Q214 100 214 158 Q214 212 160 222 Q106 212 106 158 Z" fill="#d8a878"/>
  <!-- weathered jaw + grey stubble -->
  <path d="M112 176 Q120 214 160 222 Q200 214 208 176 Q200 206 160 214 Q120 206 112 176 Z" fill="#8f887c" opacity="0.55"/>
  <!-- ears -->
  <ellipse cx="107" cy="164" rx="8" ry="12" fill="#cf9f6e"/><ellipse cx="213" cy="164" rx="8" ry="12" fill="#cf9f6e"/>
  <!-- squinting sun-creased eyes -->
  <path d="M126 152 Q140 146 154 152 Q140 156 126 152 Z" fill="#efe9df"/>
  <path d="M166 152 Q180 146 194 152 Q180 156 166 152 Z" fill="#efe9df"/>
  <circle cx="140" cy="152" r="3.6" fill="#4a3b2a"/><circle cx="180" cy="152" r="3.6" fill="#4a3b2a"/>
  <path d="M124 149 Q140 144 156 149" fill="none" stroke="#3a2e22" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M164 149 Q180 144 196 149" fill="none" stroke="#3a2e22" stroke-width="2.4" stroke-linecap="round"/>
  <!-- crow's feet from squinting -->
  <path d="M118 150 l-7 -3 M119 155 l-7 2" stroke="#a97f52" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <path d="M202 150 l7 -3 M201 155 l7 2" stroke="#a97f52" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <!-- bushy grey brows -->
  <path d="M122 140 Q140 132 158 140 Q140 137 122 143 Z" fill="#8a8378"/>
  <path d="M162 140 Q180 132 198 140 Q180 137 162 143 Z" fill="#8a8378"/>
  <!-- nose -->
  <path d="M160 152 Q155 172 149 180 Q160 186 171 180 Q165 172 160 152 Z" fill="#cf9f6e"/>
  <!-- steady, dry half-smile -->
  <path d="M138 198 Q160 205 182 198" fill="none" stroke="#7a4d34" stroke-width="3" stroke-linecap="round"/>
  <!-- wide bush hat -->
  <path d="M78 122 Q160 100 242 122 Q248 128 242 132 Q160 116 78 132 Q72 128 78 122 Z" fill="#6a5430"/>
  <path d="M104 118 Q104 74 160 70 Q216 74 216 118 Q160 104 104 118 Z" fill="#7a6238"/>
  <path d="M104 112 Q160 100 216 112" fill="none" stroke="#5a4626" stroke-width="4" stroke-linecap="round"/>
  <path d="M116 92 Q140 80 164 82" fill="none" stroke="#96774a" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
</svg>`;
}

/**
 * Dr Chipinski, up close — the Para-Spatial Medics' short-game doctor (`caddyArt.ts`: white lab coat
 * #eef2f7, skin #e8c6a0, round dark glasses #2b2f3a, tidy dark hair #3a3f4c). Bright, chirpy, on-call
 * across space and time ("You rang?") — round glasses catching the light, a stethoscope of green wedge-turf
 * tone, a red medic cross on the coat.
 */
export function chipinskiPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Dr Chipinski" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-cp-chi-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#3a4a5a" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#1c242e" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0c1014" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-cp-chi-coat" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f6f9fc"/><stop offset="100%" stop-color="#d6dee8"/>
    </linearGradient>
  </defs>
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-cp-chi-spot)"/>
  <!-- shoulders / white lab coat -->
  <path d="M42 340 Q46 254 98 238 Q160 226 222 238 Q274 254 278 340 Z" fill="url(#gs-cp-chi-coat)"/>
  <path d="M42 340 Q46 254 98 238 Q122 234 134 238 Q98 264 90 340 Z" fill="#000" opacity="0.06"/>
  <!-- lapels + placket -->
  <path d="M128 240 L160 300 L160 244 Z" fill="#c8d2de"/><path d="M192 240 L160 300 L160 244 Z" fill="#dbe3ec"/>
  <line x1="160" y1="256" x2="160" y2="340" stroke="#c2ccd8" stroke-width="2"/>
  <!-- red medic cross on the lapel -->
  <g transform="translate(206 268)"><rect x="-3" y="-9" width="6" height="18" rx="1.5" fill="#e0473f"/><rect x="-9" y="-3" width="18" height="6" rx="1.5" fill="#e0473f"/></g>
  <!-- stethoscope -->
  <path d="M132 244 Q126 286 150 300 Q172 312 174 286" fill="none" stroke="#3a6a52" stroke-width="4" stroke-linecap="round"/>
  <circle cx="176" cy="282" r="7" fill="#7ec99a" stroke="#3a6a52" stroke-width="2"/>
  <!-- neck -->
  <path d="M138 224 Q138 250 160 256 Q182 250 182 224 L182 202 L138 202 Z" fill="#dcb886"/>
  <!-- head -->
  <path d="M112 160 Q112 102 160 98 Q208 102 208 160 Q208 210 160 220 Q112 210 112 160 Z" fill="#e8c6a0"/>
  <!-- ears -->
  <ellipse cx="112" cy="166" rx="8" ry="12" fill="#dcb886"/><ellipse cx="208" cy="166" rx="8" ry="12" fill="#dcb886"/>
  <!-- tidy dark hair, neat side-part -->
  <path d="M110 150 Q112 100 160 94 Q208 100 210 150 Q210 132 196 124 Q170 116 160 130 Q150 116 128 126 Q114 134 110 150 Z" fill="#33384a"/>
  <path d="M150 126 Q168 118 190 126" fill="none" stroke="#4a5064" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  <!-- round doctor glasses -->
  <g fill="none" stroke="#2b2f3a" stroke-width="3">
    <circle cx="140" cy="158" r="15"/><circle cx="180" cy="158" r="15"/>
    <path d="M155 156 L165 156"/><path d="M125 152 L112 148"/><path d="M195 152 L208 148"/>
  </g>
  <ellipse cx="136" cy="154" rx="5" ry="4" fill="#cfe6f2" opacity="0.7"/>
  <ellipse cx="176" cy="154" rx="5" ry="4" fill="#cfe6f2" opacity="0.7"/>
  <circle cx="141" cy="159" r="3.4" fill="#2a2016"/><circle cx="181" cy="159" r="3.4" fill="#2a2016"/>
  <!-- nose -->
  <path d="M160 160 Q157 174 152 181 Q160 186 168 181 Q163 174 160 160 Z" fill="#dcb886"/>
  <!-- a bright, ready smile -->
  <path d="M138 194 Q160 210 182 194" fill="none" stroke="#a05a44" stroke-width="3" stroke-linecap="round"/>
  <path d="M144 197 Q160 203 176 197" fill="#fff" opacity="0.85"/>
</svg>`;
}

/**
 * Suggestible Sam, up close — the eager Long-Haul yardage reader (`caddyArt.ts`: green vest #3fae5c, peaked
 * green cap #2f8f47, skin #e8c6a0). Wide hopeful eyes and a big keen grin, a club offered up at the shoulder
 * and a little "here's your club" thought-spark — always sure he's got the right stick for you.
 */
export function suggestibleSamPortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Suggestible Sam" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-cp-sam-spot" cx="50%" cy="40%" r="64%">
      <stop offset="0%" stop-color="#215a34" stop-opacity="0.85"/>
      <stop offset="55%" stop-color="#123020" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0a1510" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gs-cp-sam-vest" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#48be66"/><stop offset="100%" stop-color="#2f8f47"/>
    </linearGradient>
  </defs>
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-cp-sam-spot)"/>
  <!-- an offered club up over the shoulder + a keen thought-spark -->
  <line x1="228" y1="238" x2="256" y2="132" stroke="#c8ccd6" stroke-width="4.5" stroke-linecap="round"/>
  <ellipse cx="258" cy="124" rx="11" ry="7" transform="rotate(-14 258 124)" fill="#aeb6c6" stroke="#8a90a0" stroke-width="2"/>
  <circle cx="70" cy="120" r="12" fill="#fff" opacity="0.16"/>
  <path d="M70 114 L70 126 L74.5 127.5" fill="none" stroke="#7ee39a" stroke-width="2.4" stroke-linecap="round"/>
  <!-- shoulders / green vest over a pale tee -->
  <path d="M44 340 Q48 254 100 238 Q160 226 220 238 Q272 254 276 340 Z" fill="#e6e9ee"/>
  <path d="M62 340 Q66 258 104 244 Q116 316 108 340 Z" fill="url(#gs-cp-sam-vest)"/>
  <path d="M258 340 Q254 258 216 244 Q204 316 212 340 Z" fill="url(#gs-cp-sam-vest)"/>
  <path d="M104 244 Q160 268 216 244 L216 340 L104 340 Z" fill="url(#gs-cp-sam-vest)" opacity="0.0"/>
  <path d="M136 244 L160 300 L184 244 Z" fill="#e6e9ee"/>
  <!-- collar -->
  <path d="M130 240 Q160 264 190 240 L200 250 Q160 280 120 250 Z" fill="#2a7d3e"/>
  <!-- neck -->
  <path d="M138 224 Q138 250 160 256 Q182 250 182 224 L182 202 L138 202 Z" fill="#dcb886"/>
  <!-- head -->
  <path d="M114 160 Q114 104 160 100 Q206 104 206 160 Q206 208 160 218 Q114 208 114 160 Z" fill="#e8c6a0"/>
  <!-- ears (one turned, eager) -->
  <ellipse cx="114" cy="166" rx="8" ry="12" fill="#dcb886"/><ellipse cx="206" cy="166" rx="9" ry="13" fill="#dcb886"/>
  <!-- wide, hopeful eyes -->
  <ellipse cx="142" cy="158" rx="12" ry="10" fill="#f4f0e8"/><ellipse cx="180" cy="158" rx="12" ry="10" fill="#f4f0e8"/>
  <circle cx="143" cy="159" r="5" fill="#3a4a2a"/><circle cx="181" cy="159" r="5" fill="#3a4a2a"/>
  <circle cx="145" cy="157" r="1.7" fill="#fff"/><circle cx="183" cy="157" r="1.7" fill="#fff"/>
  <!-- keen raised brows -->
  <path d="M128 142 Q142 134 156 140" fill="none" stroke="#7a6038" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M164 140 Q178 134 192 142" fill="none" stroke="#7a6038" stroke-width="2.6" stroke-linecap="round"/>
  <!-- nose -->
  <path d="M160 160 Q157 172 153 179 Q160 184 167 179 Q163 172 160 160 Z" fill="#dcb886"/>
  <!-- a big, eager grin -->
  <path d="M134 192 Q160 216 186 192 Q160 204 134 192 Z" fill="#7a3f30"/>
  <path d="M140 195 Q160 202 180 195 L178 199 Q160 205 142 199 Z" fill="#fff" opacity="0.9"/>
  <!-- peaked green caddy cap -->
  <path d="M108 122 Q114 90 160 86 Q206 90 212 122 Q160 110 108 122 Z" fill="#2f8f47"/>
  <path d="M108 122 Q160 110 212 122 Q222 126 222 132 Q160 118 98 132 Q98 126 108 122 Z" fill="#256e37"/>
  <path d="M120 100 Q140 90 162 92" fill="none" stroke="#5fd77e" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
</svg>`;
}

/**
 * Mystic Mole, up close — the Putters' Guild green-reader (`caddyArt.ts`: dark-grey body #5a5560, lighter
 * belly #7a7682, big round mystic spectacles with a cyan #9fd8e6 lens, pink nose #ff9db0). A blind digging
 * sage who reads the break by feel: an inscrutable round face, huge glinting spectacles, whiskers, tiny
 * clawed paws, drawn as a creature rather than the humanoid busts.
 */
export function mysticMolePortraitSVG(): string {
  return `<svg viewBox="0 0 320 340" width="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mystic Mole" style="display:block;aspect-ratio:320/340;overflow:visible;">
  <defs>
    <radialGradient id="gs-cp-mol-spot" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="#3a3648" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#1c1a26" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#0c0b12" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="gs-cp-mol-lens" cx="42%" cy="36%" r="70%">
      <stop offset="0%" stop-color="#e4f6fb"/><stop offset="45%" stop-color="#9fd8e6"/><stop offset="100%" stop-color="#4a8ea0"/>
    </radialGradient>
    <linearGradient id="gs-cp-mol-fur" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#6a6572"/><stop offset="100%" stop-color="#4a4652"/>
    </linearGradient>
  </defs>
  <ellipse cx="160" cy="150" rx="150" ry="160" fill="url(#gs-cp-mol-spot)"/>
  <!-- little mystic stars around him -->
  <g fill="#cfe6f2" opacity="0.7">${([[70, 90], [250, 96], [66, 200], [256, 210], [96, 60]] as [number, number][]).map(([x, y]) => `<path d="M${x} ${y - 5} L${x + 1.4} ${y - 1.4} L${x + 5} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 5} L${x - 1.4} ${y + 1.4} L${x - 5} ${y} L${x - 1.4} ${y - 1.4} Z"/>`).join('')}</g>
  <!-- rounded body / shoulders -->
  <path d="M64 340 Q68 250 120 232 Q160 224 200 232 Q252 250 256 340 Z" fill="url(#gs-cp-mol-fur)"/>
  <ellipse cx="160" cy="316" rx="66" ry="46" fill="#7a7682" opacity="0.55"/>
  <!-- tiny clawed paws holding a putter grip -->
  <line x1="120" y1="300" x2="120" y2="238" stroke="#c8ccd6" stroke-width="5" stroke-linecap="round"/>
  <g fill="#4a4652" stroke="#33303c" stroke-width="1.5"><ellipse cx="118" cy="300" rx="12" ry="9"/></g>
  <g stroke="#e8e2ea" stroke-width="2" stroke-linecap="round">${[-8, -3, 2, 7].map((d) => `<line x1="${118 + d}" y1="306" x2="${118 + d}" y2="314"/>`).join('')}</g>
  <!-- round mole head -->
  <ellipse cx="160" cy="164" rx="80" ry="76" fill="url(#gs-cp-mol-fur)"/>
  <ellipse cx="160" cy="176" rx="52" ry="48" fill="#7a7682" opacity="0.5"/>
  <!-- small rounded ears tucked in fur -->
  <ellipse cx="92" cy="120" rx="14" ry="12" fill="#4a4652"/><ellipse cx="228" cy="120" rx="14" ry="12" fill="#4a4652"/>
  <!-- huge round mystic spectacles -->
  <g stroke="#2a2732" stroke-width="6" fill="url(#gs-cp-mol-lens)">
    <circle cx="126" cy="160" r="34"/><circle cx="194" cy="160" r="34"/>
  </g>
  <path d="M156 158 L164 158" stroke="#2a2732" stroke-width="6" stroke-linecap="round"/>
  <!-- lens glints + faint pinhole pupils behind (blind, reads by feel) -->
  <ellipse cx="116" cy="148" rx="10" ry="7" fill="#fff" opacity="0.55"/>
  <ellipse cx="184" cy="148" rx="10" ry="7" fill="#fff" opacity="0.55"/>
  <circle cx="126" cy="164" r="3" fill="#2a3a44" opacity="0.5"/><circle cx="194" cy="164" r="3" fill="#2a3a44" opacity="0.5"/>
  <!-- long digging snout + pink nose -->
  <path d="M138 210 Q160 226 182 210 Q172 236 160 238 Q148 236 138 210 Z" fill="#8a8692"/>
  <ellipse cx="160" cy="216" rx="12" ry="9" fill="#ff9db0"/>
  <ellipse cx="160" cy="214" rx="6" ry="3.4" fill="#ffc2ce"/>
  <!-- whiskers -->
  <g stroke="#c8c4d0" stroke-width="1.6" stroke-linecap="round" opacity="0.8">
    <path d="M140 220 Q108 218 90 226"/><path d="M142 226 Q112 230 96 240"/>
    <path d="M180 220 Q212 218 230 226"/><path d="M178 226 Q208 230 224 240"/>
  </g>
  <!-- content little smile -->
  <path d="M148 234 Q160 242 172 234" fill="none" stroke="#5a4650" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
}

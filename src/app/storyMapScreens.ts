/**
 * The Story Mode STAR-MAP navigator (GS-story-map): the "star chart" that opens after recruitment. It plots
 * the chapter's CHARTED worlds as tappable planet nodes over a starfield — locked worlds show as dim,
 * sealed slots that chart as the story advances. Tap a world → a destination dossier (name, world lore,
 * difficulty, your best) with "Tee off". Clearing a world pays credits into the campaign and records your
 * best for the revisit chase. (The ship-flying feel + per-world Pro Shop are follow-on chunks.)
 *
 * Pure render off the live `state`; its OWN `.gs-smap*` CSS prefix (never the play HUD's `.gs-hud`). Reads
 * each course's name/tier/archetype from `staticCourseSpec`.
 */

import { state } from './ctx';
import { STORY_WORLDS, storyWorldUnlocked, STORY_CHAPTER_COUNT, type StoryState } from '../sim/rpg/story';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { ARCHETYPE_TURF, ARCHETYPE_SPACE } from '../render/palette';
import type { BiomeArchetype } from '../sim/course/themes';

type Tier = 'gentle' | 'testing' | 'brutal';
const TIER_META: Record<Tier, { label: string; col: string }> = {
  gentle: { label: 'Gentle', col: '#7fe0a0' },
  testing: { label: 'Challenging', col: '#e6b84a' },
  brutal: { label: 'Brutal', col: '#ff6b6b' },
};

/** A themed planet icon for a destination (archetype-tinted body + ring). `size` in px. */
function planetSVG(archetype: BiomeArchetype | undefined, size: number, cleared: boolean): string {
  const ring = (archetype && ARCHETYPE_SPACE[archetype]?.edge) || 'rgba(120,205,140,0.55)';
  const body = (archetype && ARCHETYPE_TURF[archetype]?.green.base) || '#5fd45a';
  const dark = (archetype && ARCHETYPE_TURF[archetype]?.green.ink) || '#1d4d22';
  const r = size * 0.3;
  const cx = size / 2;
  const cy = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" style="display:block;">
    <defs><radialGradient id="smglow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${body}" stop-opacity="0.5"/><stop offset="100%" stop-color="${body}" stop-opacity="0"/>
    </radialGradient></defs>
    <circle cx="${cx}" cy="${cy}" r="${r * 1.7}" fill="url(#smglow)"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 1.7}" ry="${r * 0.5}" fill="none" stroke="${ring}" stroke-width="1.4" opacity="0.7"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${body}"/>
    <circle cx="${cx - r * 0.32}" cy="${cy - r * 0.32}" r="${r}" fill="${dark}" opacity="0.35"/>
    <circle cx="${cx - r * 0.4}" cy="${cy - r * 0.4}" r="${r * 0.9}" fill="#ffffff" opacity="0.12"/>
    ${cleared ? `<circle cx="${cx + r * 0.9}" cy="${cy - r * 0.9}" r="${size * 0.14}" fill="#0b0d12"/><text x="${cx + r * 0.9}" y="${cy - r * 0.9 + size * 0.05}" text-anchor="middle" font-size="${size * 0.2}" fill="#7fe0a0">✓</text>` : ''}
  </svg>`;
}

/** A hand-placed starfield behind the chart (byte-stable, zero rng). */
function starfield(): string {
  const dots = [
    [8, 12], [22, 40], [37, 8], [51, 30], [66, 14], [80, 44], [92, 22], [14, 66], [30, 84], [46, 70],
    [60, 90], [74, 74], [88, 88], [5, 48], [96, 60], [42, 52], [70, 34], [18, 24], [58, 6], [34, 96],
  ]
    .map(([x, y], i) => `<circle cx="${x}%" cy="${y}%" r="${0.6 + (i % 3) * 0.5}" fill="#dfeaff" opacity="${0.3 + (i % 4) * 0.14}"/>`)
    .join('');
  return `<svg width="100%" height="100%" style="position:absolute;inset:0;" preserveAspectRatio="none">${dots}</svg>`;
}

function tierOf(courseId: string): Tier {
  return (staticCourseSpec(courseId)?.tier as Tier) ?? 'testing';
}

/** One destination node on the chart — a planet button (unlocked) or a sealed slot (locked). */
function worldNode(courseId: string, unlocked: boolean, cleared: boolean): string {
  const spec = staticCourseSpec(courseId);
  const name = spec?.name ?? courseId;
  const arche = spec?.archetype as BiomeArchetype | undefined;
  if (!unlocked) {
    return `<div class="gs-smap-node gs-smap-node--locked" title="Charts as the story unfolds">
      <div class="gs-smap-planet" style="opacity:0.28;filter:grayscale(0.7);">${planetSVG(arche, 58, false)}</div>
      <div class="gs-smap-lock">🔒</div>
      <div class="gs-smap-name" style="color:var(--gs-dim);">? ? ?</div>
    </div>`;
  }
  const tier = TIER_META[tierOf(courseId)];
  return `<button class="gs-smap-node" data-action='${JSON.stringify({ type: 'storyInspectWorld', courseId })}'
    aria-label="${name} — view destination">
    <div class="gs-smap-planet">${planetSVG(arche, 58, cleared)}</div>
    <div class="gs-smap-name">${name}</div>
    <div class="gs-smap-tier" style="color:${tier.col};">● ${tier.label}${cleared ? ' · cleared' : ''}</div>
  </button>`;
}

function smapStyle(): string {
  return `<style>
    .gs-smap-chart{position:relative;overflow:hidden;border:1px solid #26314a;border-radius:16px;
      background:radial-gradient(120% 90% at 50% 0%, #172244 0%, #0a1024 55%, #060a16 100%);
      padding:18px 12px;max-width:640px;margin:0 auto;}
    .gs-smap-grid{position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;}
    .gs-smap-node{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;
      background:rgba(20,28,50,0.55);border:1px solid #2a3654;border-radius:14px;padding:12px 6px 10px;
      cursor:pointer;color:inherit;transition:transform .12s ease, border-color .12s ease, background .12s ease;}
    .gs-smap-node:hover,.gs-smap-node:focus-visible{transform:translateY(-3px);border-color:#54c8ff;background:rgba(30,44,78,0.7);outline:none;}
    .gs-smap-node--locked{cursor:default;border-style:dashed;border-color:#22293c;background:rgba(14,18,30,0.5);}
    .gs-smap-planet{filter:drop-shadow(0 3px 6px #0007);}
    .gs-smap-name{font-size:12.5px;font-weight:700;color:var(--gs-ink);text-align:center;line-height:1.15;margin-top:2px;}
    .gs-smap-tier{font-size:10.5px;letter-spacing:.02em;}
    .gs-smap-lock{position:absolute;top:8px;right:10px;font-size:13px;opacity:0.8;}
    /* destination dossier */
    .gs-smap-ov{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;
      background:rgba(6,8,14,0.66);backdrop-filter:blur(2px);animation:gs-smap-fade .16s ease both;}
    .gs-smap-card{width:100%;max-width:460px;margin:0 10px;background:linear-gradient(180deg,#111a2e,#0a1120);
      border:1px solid #2a3654;border-top-color:#3a598c;border-radius:16px 16px 0 0;box-shadow:0 -8px 30px #000a;
      padding:16px 16px 22px;animation:gs-smap-rise .2s cubic-bezier(.2,.8,.2,1) both;}
    @media(min-width:560px){.gs-smap-ov{align-items:center;}.gs-smap-card{border-radius:16px;}}
    @keyframes gs-smap-fade{from{opacity:0;}to{opacity:1;}}
    @keyframes gs-smap-rise{from{transform:translateY(16px);opacity:.3;}to{transform:translateY(0);opacity:1;}}
    @media(prefers-reduced-motion:reduce){.gs-smap-ov,.gs-smap-card{animation:none;}}
  </style>`;
}

/** The destination dossier overlay for one charted world. */
function worldDossierHTML(story: StoryState, courseId: string): string {
  const spec = staticCourseSpec(courseId);
  if (!spec) return '';
  const arche = spec.archetype as BiomeArchetype | undefined;
  const tier = TIER_META[tierOf(courseId)];
  const best = story.worldBest[courseId];
  const bestStr = best
    ? `Best: <b style="color:var(--gs-ink);">${best.toPar === 0 ? 'E' : best.toPar > 0 ? `+${best.toPar}` : best.toPar}</b> (${best.strokes})`
    : 'Not yet played';
  return `
    <div class="gs-smap-ov" data-action='${JSON.stringify({ type: 'storyCloseWorldInspect' })}'>
      <div class="gs-smap-card" onclick="event.stopPropagation()">
        <div style="display:flex;gap:14px;align-items:flex-start;">
          <div style="flex:0 0 auto;">${planetSVG(arche, 72, story.clearedWorldIds.includes(courseId))}</div>
          <div style="flex:1 1 auto;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
              <h3 style="margin:0;font-size:19px;color:var(--gs-ink);">${spec.name}</h3>
              <button data-action='${JSON.stringify({ type: 'storyCloseWorldInspect' })}' aria-label="Close"
                style="background:none;border:0;color:var(--gs-dim);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px;">✕</button>
            </div>
            <div style="font-size:12px;font-weight:700;margin-top:1px;color:${tier.col};">● ${tier.label} · 18 holes · ${bestStr}</div>
            <p style="margin:6px 0 0;font-size:13px;line-height:1.45;color:var(--gs-dim);">${spec.blurb ?? ''}</p>
          </div>
        </div>
        <div style="margin-top:16px;">
          <button class="gs-btn" data-action='${JSON.stringify({ type: 'storyPlayWorld', courseId })}'>⛳ Tee off — ${spec.name}</button>
        </div>
      </div>
    </div>`;
}

export function storyMapScreen(): string {
  const story = state.story;
  if (!story) {
    return `<header class="gs-hero gs-smap"><h1 class="gs-hero-title">🗺 Star Chart</h1></header>
      <div style="max-width:420px;margin:24px auto 0;"><button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryMap' })}'>‹ Back</button></div>`;
  }
  const nodes = STORY_WORLDS.map((w) =>
    worldNode(w.courseId, storyWorldUnlocked(w, story.chapter), story.clearedWorldIds.includes(w.courseId)),
  ).join('');
  const chartedCount = STORY_WORLDS.filter((w) => storyWorldUnlocked(w, story.chapter)).length;
  const overlay = story && state.storyWorldInspectId ? worldDossierHTML(story, state.storyWorldInspectId) : '';
  return `${smapStyle()}
    <header class="gs-hero gs-smap">
      <h1 class="gs-hero-title">🗺 Star Chart</h1>
      <p class="gs-hero-tag">Chapter ${story.chapter} of ${STORY_CHAPTER_COUNT} · ${chartedCount} world${chartedCount === 1 ? '' : 's'} charted</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:13px;">✦ <b>${story.credits}</b> credits</span>
      </div>
    </header>
    <section style="margin:6px auto 0;">
      <div style="text-align:center;color:var(--gs-dim);font-size:13px;margin-bottom:8px;">
        Chart a course, Champion. <span style="color:var(--gs-ink);">Tap a world</span> to size it up.
      </div>
      <div class="gs-smap-chart">
        ${starfield()}
        <div class="gs-smap-grid">${nodes}</div>
      </div>
      <div style="text-align:center;color:var(--gs-dim);font-size:12px;margin-top:8px;">
        🔒 Sealed worlds chart as the story advances.
      </div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:14px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryMap' })}'>‹ Back to the clubhouse</button>
    </div>
    ${overlay}`;
}

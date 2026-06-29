/**
 * Assetless caddy voice lines (GS-caddy-voices) — spoken via the browser's built-in Web Speech
 * synthesizer, so there is ZERO downloaded audio (the house "no asset to 404" rule, same as the
 * WebAudio sfx synth). Each caddy has a short catchphrase in their accent (American / Australian /
 * British), picked by the utterance `lang` + a best-effort matching voice.
 *
 * Pure side-effect, like the sfx layer: gated on the player's `sound` setting and fully guarded — a
 * browser without `speechSynthesis` simply stays silent rather than throwing.
 */

import { getSettings } from '../settings';

/** Cache the resolved voice list (populated async by the browser). */
let voices: SpeechSynthesisVoice[] = [];
function refreshVoices(): void {
  try {
    voices = window.speechSynthesis?.getVoices?.() ?? [];
  } catch {
    voices = [];
  }
}

/** Pick the best available voice for a BCP-47 lang tag (e.g. 'en-AU'), else null (browser default). */
function voiceFor(lang: string): SpeechSynthesisVoice | null {
  if (!voices.length) refreshVoices();
  const want = lang.toLowerCase();
  const region = want.split('-')[0] ?? want;
  // Exact region match first (en-AU), else any matching base language (en-*).
  return (
    voices.find((v) => v.lang?.toLowerCase() === want) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(region + '-')) ??
    voices.find((v) => v.lang?.toLowerCase().startsWith(region)) ??
    null
  );
}

/**
 * Speak a caddy line in the given accent. No-op when sound is off / unsupported. Cancels any
 * in-flight caddy line first so two quick effects don't talk over each other. `rate`/`pitch` add a
 * little character per accent.
 */
export function speakCaddy(text: string, lang: string, opts: { rate?: number; pitch?: number } = {}): void {
  if (!getSettings().sound) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
    refreshVoices();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    u.volume = 0.9;
    synth.cancel(); // drop any queued/older caddy line so the latest effect is heard cleanly
    synth.speak(u);
  } catch {
    /* ignore — a cosmetic voice line must never throw */
  }
}

// The voice list loads asynchronously in some browsers; grab it eagerly and on change.
try {
  refreshVoices();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = refreshVoices;
} catch {
  /* ignore */
}

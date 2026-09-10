import type { Settings } from './types.js';
// USD per million tokens. A priced entry here is the only gate on using a
// model: Settings offers what this map holds and `saveSettings` accepts nothing
// else, so a new release is onboarded by adding one line rather than by editing
// an allowlist, a dropdown and a price table separately.
//
// Where a provider is running an introductory rate, record the standard rate.
// Reservations are made before a job runs and must never under-book what the
// bill will eventually be.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'gemini-3.8-flash': { input: 1.5, output: 7.5 }, // intro 0.75/3.75 until 2027-01-01
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};
const PREFIX = { anthropic: 'claude', gemini: 'gemini', openai: 'gpt' } as const;
/** The priced text models a provider may be pointed at, newest ids first. */
export function modelsFor(provider: Settings['adviceProvider']) {
  return Object.keys(MODEL_PRICES).filter((m) => m.startsWith(PREFIX[provider]));
}
export function textCost(model: string, input: number, output: number) {
  const p = MODEL_PRICES[model];
  if (!p) throw new Error('This model needs a verified price before it can be used.');
  return (input * p.input + output * p.output) / 1e6;
}
export function toAud(usd: number, s: Settings) {
  return Math.ceil(usd * s.usdToAud * s.costBuffer * 10000) / 10000;
}
export function episodeEstimate(s: Settings, minutes: number, news = false) {
  // Two write passes, because a draft that comes back short of the chosen
  // length is sent back once to be written out properly. The reservation has
  // to cover the case where that happens.
  const text = textCost(s.adviceModel, 8000, 1200 + minutes * 230) * 2;
  const voice =
    minutes *
    (s.voiceProvider === 'openai'
      ? 0.025
      : s.voiceModel.includes('pro') || s.voiceModel.includes('3.1')
        ? 0.03
        : 0.015);
  return toAud((text + voice + (news ? 0.04 : 0) + 0.03) * 1.25, s);
}
/**
 * What a "remember" capture may cost before it runs: the extraction pass on
 * the chosen memory model, the reflection pass on the advice model if it is
 * on, and transcription for audio. A ceiling for the reservation; the job
 * settles at what it actually spent.
 */
export function captureEstimate(s: Settings, audioBytes = 0) {
  const extraction = textCost(s.extractionModel, 6000, 2500);
  const reflection = s.reflectOnCapture ? textCost(s.adviceModel, 14000, 2500) : 0;
  // Research is a second advice-model call over the search results it fetched.
  const research =
    s.reflectOnCapture && s.researchOnCapture ? textCost(s.adviceModel, 10000, 1500) : 0;
  const audio = audioBytes ? Math.max(0.3, (audioBytes / 1e6) * 0.12) : 0;
  return toAud((extraction + reflection + research) * 1.25, s) + audio;
}
/**
 * The standing review reads the whole store in one call, so its input grows
 * with the number of memories rather than with anything the user just did.
 */
export function consolidationEstimate(s: Settings, memories: number) {
  return toAud(textCost(s.adviceModel, 2000 + memories * 220, 4000) * 1.3, s);
}
export function monthKey(timezone = 'Australia/Melbourne', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  return (
    parts.find((p) => p.type === 'year')!.value + '-' + parts.find((p) => p.type === 'month')!.value
  );
}

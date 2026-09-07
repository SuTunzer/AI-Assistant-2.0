import type { Settings } from './types.js';
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
};
export function textCost(model: string, input: number, output: number) {
  const p = MODEL_PRICES[model];
  if (!p) throw new Error('This model needs a verified price before it can be used.');
  return (input * p.input + output * p.output) / 1e6;
}
export function toAud(usd: number, s: Settings) {
  return Math.ceil(usd * s.usdToAud * s.costBuffer * 10000) / 10000;
}
export function episodeEstimate(s: Settings, minutes: number, news = false) {
  const text = textCost(s.adviceModel, 8000, 1200 + minutes * 230);
  const voice =
    minutes *
    (s.voiceProvider === 'openai'
      ? 0.025
      : s.voiceModel.includes('pro') || s.voiceModel.includes('3.1')
        ? 0.03
        : 0.015);
  return toAud((text + voice + (news ? 0.04 : 0) + 0.03) * 1.25, s);
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

import { it, expect } from 'vitest';
import { assembleAudio } from '../apps/api/src/media';
import { pcmWav, speechChunks } from '../apps/api/src/providers';
it('splits long narration without dropping text or exceeding a speech request', () => {
  const text = 'One useful step. '.repeat(400);
  const chunks = speechChunks(text, 1100);
  expect(chunks.every((c) => c.length <= 1100)).toBe(true);
  expect(chunks.join(' ').replace(/\s+/g, ' ').trim()).toBe(text.trim());
});
it.skipIf(!process.env.FFMPEG_PATH)(
  'assembles mixed narration pieces into a real MP3 with measured duration',
  async () => {
    const rate = 24000;
    function tone(hz: number) {
      const pcm = Buffer.alloc(rate * 2);
      for (let i = 0; i < rate; i++)
        pcm.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * hz) / rate) * 5000), i * 2);
      return { bytes: pcmWav(pcm), format: 'wav' as const };
    }
    const result = await assembleAudio([tone(440), tone(660), tone(330)]);
    expect(result.bytes.length).toBeGreaterThan(18000);
    expect(result.durationSeconds).toBeGreaterThan(2.9);
    expect(result.durationSeconds).toBeLessThan(3.2);
    expect(result.bytes.subarray(0, 3).toString()).toBe('ID3');
  },
);

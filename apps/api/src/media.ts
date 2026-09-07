import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { config } from './config.js';
import { DomainError } from '../../../packages/domain/src/tasks.js';
export async function assembleAudio(parts: { bytes: Buffer; format: 'wav' | 'mp3' }[]) {
  const root = resolve(tmpdir()),
    folder = await mkdtemp(join(root, 'steadier-audio-'));
  try {
    const filenames: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const name = `part-${i}.${parts[i].format}`;
      await writeFile(join(folder, name), parts[i].bytes);
      filenames.push(`file '${name}'`);
    }
    await writeFile(join(folder, 'parts.txt'), filenames.join('\n'));
    let progress = '';
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        config.FFMPEG_PATH,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'concat',
          '-safe',
          '1',
          '-i',
          'parts.txt',
          '-ar',
          '24000',
          '-ac',
          '1',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '64k',
          '-progress',
          'pipe:1',
          '-y',
          'episode.mp3',
        ],
        { cwd: folder, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      child.stdout.on('data', (data) => {
        progress = (progress + data.toString()).slice(-16000);
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new DomainError('AUDIO_TIMEOUT', 'Audio assembly took too long.', 503));
      }, 60000);
      child.once('error', () => {
        clearTimeout(timer);
        reject(
          new DomainError(
            'FFMPEG_MISSING',
            'The server needs FFmpeg to assemble audio. See the setup guide.',
            503,
          ),
        );
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        code === 0
          ? resolve()
          : reject(
              new DomainError('AUDIO_ASSEMBLY_FAILED', 'The audio could not be assembled.', 502),
            );
      });
    });
    const bytes = await readFile(join(folder, 'episode.mp3'));
    const durationSeconds =
      Number([...progress.matchAll(/out_time_us=(\d+)/g)].at(-1)?.[1] || 0) / 1e6;
    if (!durationSeconds)
      throw new DomainError(
        'AUDIO_ASSEMBLY_FAILED',
        'The finished audio has no valid duration.',
        502,
      );
    return { bytes, durationSeconds };
  } finally {
    if (dirname(resolve(folder)) === root && folder.includes('steadier-audio-'))
      await rm(folder, { recursive: true, force: true });
  }
}

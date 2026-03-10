/**
 * Converte áudio (webm, mp4, etc.) para OGG/OPUS antes do envio ao WhatsApp (Meta aceita audio/ogg).
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegStatic = require('ffmpeg-static') as string | undefined;
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const OGG_MIME = 'audio/ogg';

/**
 * Verifica se o áudio já está em formato OGG (não precisa converter).
 */
export function isOggMime(mime: string): boolean {
  const base = (mime || '').toLowerCase().split(';')[0].trim();
  return base === 'audio/ogg' || base === 'audio/opus';
}

/**
 * Converte um buffer de áudio para OGG (codec OPUS).
 * Se o input já for audio/ogg, retorna o buffer original.
 * Em caso de erro na conversão, retorna o buffer original e loga o aviso.
 */
export async function convertAudioToOgg(
  inputBuffer: Buffer,
  inputMime: string
): Promise<{ buffer: Buffer; mime: string }> {
  if (isOggMime(inputMime)) {
    return { buffer: inputBuffer, mime: OGG_MIME };
  }

  const tmpDir = os.tmpdir();
  const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = inputMime.includes('webm') ? 'webm' : inputMime.includes('mp4') || inputMime.includes('m4a') ? 'm4a' : 'bin';
  const inputPath = path.join(tmpDir, `${id}.${ext}`);
  const outputPath = path.join(tmpDir, `${id}.ogg`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-c:a libopus', '-b:a 64k'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(err))
        .run();
    });

    const outputBuffer = await fs.readFile(outputPath);
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});

    return { buffer: outputBuffer, mime: OGG_MIME };
  } catch (err) {
    console.warn('[convertAudioToOgg] Conversão falhou, usando áudio original:', err instanceof Error ? err.message : err);
    try {
      await fs.unlink(inputPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch {
      // ignore
    }
    return { buffer: inputBuffer, mime: inputMime };
  }
}

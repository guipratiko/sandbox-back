/**
 * Converte áudio (webm, mp4, etc.) para OGG/OPUS antes do envio ao WhatsApp.
 * Meta aceita audio/ogg; gravações do navegador costumam vir em webm.
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

const OGG_MIME = 'audio/ogg';

/** ffmpeg-static v2 exporta { path: string }, não a string diretamente */
function getFfmpegPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('ffmpeg-static') as { path?: string; default?: string } | string;
    if (typeof mod === 'string') return mod;
    if (mod?.path && typeof mod.path === 'string') return mod.path;
    if (mod?.default && typeof mod.default === 'string') return mod.default;
    return undefined;
  } catch {
    return undefined;
  }
}

function cleanupTemp(paths: string[]): void {
  paths.forEach((p) => fs.unlink(p).catch(() => {}));
}

const ffmpegPath = getFfmpegPath();
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/** Retorna extensão do arquivo de entrada para nomear o temp. */
function inputExtension(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  return 'bin';
}

export function isOggMime(mime: string): boolean {
  const base = (mime || '').toLowerCase().split(';')[0].trim();
  return base === 'audio/ogg' || base === 'audio/opus';
}

/**
 * Converte buffer de áudio para OGG (codec OPUS).
 * Se já for audio/ogg, retorna o buffer original.
 * Em falha na conversão, retorna o original e loga aviso.
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
  const inputPath = path.join(tmpDir, `${id}.${inputExtension(inputMime)}`);
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
    cleanupTemp([inputPath, outputPath]);
    return { buffer: outputBuffer, mime: OGG_MIME };
  } catch (err) {
    console.warn('[convertAudioToOgg] Conversão falhou, usando áudio original:', err instanceof Error ? err.message : err);
    cleanupTemp([inputPath, outputPath]);
    return { buffer: inputBuffer, mime: inputMime };
  }
}

/**
 * Compresses source photography from media-src/ into public/media/photos/:
 *   <name>.webp (1600w fallback) plus <name>-<w>.avif / .webp at 640, 1024, 1600.
 * Videos (media-src/*.mp4) become WebM + MP4 (desktop) and a smaller mobile MP4,
 * when FFMPEG points at an ffmpeg binary.
 *
 * Usage:  node scripts/process-media.mjs
 *         FFMPEG=/path/to/ffmpeg node scripts/process-media.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const root = join(import.meta.dirname, '..');
const src = join(root, 'media-src');
const photos = join(root, 'public', 'media', 'photos');
const video = join(root, 'public', 'media', 'video');
mkdirSync(photos, { recursive: true });
mkdirSync(video, { recursive: true });

const WIDTHS = [640, 1024, 1600];
const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;

for (const file of readdirSync(src).filter((f) => /\.(png|jpe?g)$/i.test(f))) {
  const name = basename(file, extname(file));
  const input = sharp(join(src, file)).rotate();
  for (const w of WIDTHS) {
    await input.clone().resize({ width: w, withoutEnlargement: true }).avif({ quality: 50, effort: 5 }).toFile(join(photos, `${name}-${w}.avif`));
    await input.clone().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toFile(join(photos, `${name}-${w}.webp`));
  }
  await input.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 74 }).toFile(join(photos, `${name}.webp`));
  console.log(`photo ${name}: ${kb(join(photos, `${name}-1600.avif`))} avif @1600`);
}

const ff = process.env.FFMPEG;
if (ff && existsSync(ff)) {
  for (const file of readdirSync(src).filter((f) => f.endsWith('.mp4'))) {
    const name = basename(file, '.mp4');
    const i = join(src, file);
    const run = (args) => execFileSync(ff, ['-y', '-loglevel', 'error', '-i', i, '-an', ...args]);
    run(['-vf', 'scale=1600:-2,fps=24', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(video, `${name}.mp4`)]);
    run(['-vf', 'scale=1600:-2,fps=24', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-row-mt', '1', join(video, `${name}.webm`)]);
    run(['-vf', 'scale=720:-2,fps=24', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(video, `${name}-mobile.mp4`)]);
    run(['-vf', 'scale=1600:-2', '-frames:v', '1', join(src, `${name}-poster.png`)]);
    console.log(`video ${name}: mp4 ${kb(join(video, `${name}.mp4`))}, webm ${kb(join(video, `${name}.webm`))}, mobile ${kb(join(video, `${name}-mobile.mp4`))}`);
  }
} else {
  console.log('FFMPEG not set: skipping video');
}

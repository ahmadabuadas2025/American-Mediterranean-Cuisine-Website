/**
 * Builds the homepage hero montage from the four food clips in media-src/:
 *   spread → pita → lunchbox → buffet → back to the spread's first frame
 * with soft cross-dissolves and a seamless loop (the last frame matches the
 * first frame and the poster). Outputs desktop WebM + MP4 (16:9) and a
 * portrait (9:16) MP4 for phones.
 *
 * Usage: FFMPEG=/path/to/ffmpeg node scripts/build-hero-montage.mjs [--preview]
 *   --preview  also writes JPG frames at each transition to media-src/preview/
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ff = process.env.FFMPEG;
if (!ff || !existsSync(ff)) throw new Error('Set FFMPEG to an ffmpeg binary');
const root = join(import.meta.dirname, '..');
const src = join(root, 'media-src');
const out = join(root, 'public', 'media', 'video');
mkdirSync(out, { recursive: true });

/** Prefer the 1080p upscaled versions when present. */
const pick = (name) => [`${name}-1080.mp4`, `${name}.mp4`].map((f) => join(src, f)).find(existsSync);

// start/length in seconds; cropX = horizontal centre (0–1) for the portrait cut
const CLIPS = [
  { file: pick('hero-spread'), start: 0, len: 5.5, cropX: 0.55 },
  { file: pick('clip-pita'), start: 0.3, len: 4.5, cropX: 0.5 },
  { file: pick('clip-lunchbox'), start: 0.3, len: 4.5, cropX: 0.5 },
  { file: pick('clip-buffet'), start: 0.3, len: 4.5, cropX: 0.5 },
];
const FADE = 0.8; // cross-dissolve length
const TAIL = 1.2; // hold on the spread's first frame so the loop is seamless
const FPS = 24;
// Light temporal denoise: removes upscaler grain so the files stay small.
const DENOISE = 'hqdn3d=1.5:1.5:6:6';
for (const c of CLIPS) if (!c.file) throw new Error('Missing a source clip in media-src/');

// One shared, gentle warm grade so the four generated clips read as one film.
const GRADE = 'eq=contrast=1.03:saturation=1.04:gamma=0.99,colorbalance=rs=0.02:gs=0.005:bs=-0.02:rm=0.015:bm=-0.015';

function build({ w, h, portrait }) {
  const parts = [];
  CLIPS.forEach((c, i) => {
    const frame = portrait
      ? `scale=-2:${h},crop=${w}:${h}:'min(max((iw-${w})*${c.cropX},0),iw-${w})':0`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    parts.push(`[${i}:v]trim=start=${c.start}:duration=${c.len},setpts=PTS-STARTPTS,fps=${FPS},${frame},setsar=1,${GRADE},format=yuv420p[v${i}]`);
  });
  // Tail: freeze the very first frame of the spread
  const first = CLIPS[0];
  const tailFrame = portrait
    ? `scale=-2:${h},crop=${w}:${h}:'min(max((iw-${w})*${first.cropX},0),iw-${w})':0`
    : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  parts.push(`[${CLIPS.length}:v]trim=start_frame=0:end_frame=1,setpts=PTS-STARTPTS,${tailFrame},setsar=1,${GRADE},format=yuv420p,loop=loop=${Math.round(TAIL * FPS) - 1}:size=1:start=0,setpts=N/${FPS}/TB,fps=${FPS}[v${CLIPS.length}]`);

  const lens = [...CLIPS.map((c) => c.len), TAIL];
  let prev = 'v0';
  let total = lens[0];
  const offsets = [];
  for (let i = 1; i < lens.length; i++) {
    const offset = +(total - FADE).toFixed(3);
    offsets.push(offset);
    const label = i === lens.length - 1 ? 'vout' : `x${i}`;
    parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[${label}]`);
    prev = label;
    total = total + lens[i] - FADE;
  }
  return { graph: parts.join(';'), total: +total.toFixed(2), offsets };
}

const inputs = [...CLIPS.flatMap((c) => ['-i', c.file]), '-i', CLIPS[0].file];
const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;
const run = (args) => execFileSync(ff, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// Desktop 16:9 master → MP4 + WebM
const desk = build({ w: 1920, h: 1080, portrait: false });
const master = join(src, 'hero-montage-master.mp4');
run([...inputs, '-filter_complex', desk.graph, '-map', '[vout]', '-an', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', master]);
run(['-i', master, '-an', '-vf', DENOISE, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-maxrate', '1250k', '-bufsize', '2500k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, 'hero-montage.mp4')]);
run(['-i', master, '-an', '-vf', DENOISE, '-c:v', 'libvpx-vp9', '-b:v', '1000k', '-maxrate', '1300k', '-crf', '40', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', join(out, 'hero-montage.webm')]);

// Phone 9:16 portrait
const mob = build({ w: 608, h: 1080, portrait: true });
run([...inputs, '-filter_complex', `${mob.graph};[vout]${DENOISE}[vden]`, '-map', '[vden]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-maxrate', '430k', '-bufsize', '860k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, 'hero-montage-mobile.mp4')]);

console.log(`montage ${desk.total}s (transitions at ${desk.offsets.join(', ')}s)`);
for (const f of ['hero-montage.mp4', 'hero-montage.webm', 'hero-montage-mobile.mp4']) console.log(`  ${f}: ${kb(join(out, f))}`);

if (process.argv.includes('--preview')) {
  const dir = join(src, 'preview');
  mkdirSync(dir, { recursive: true });
  const times = [0.5, ...desk.offsets.map((o) => +(o + FADE / 2).toFixed(2)), desk.total - 0.05];
  times.forEach((t, i) => {
    run(['-ss', String(t), '-i', master, '-frames:v', '1', '-vf', 'scale=640:-2', join(dir, `desk-${i}.jpg`)]);
    run(['-ss', String(t), '-i', join(out, 'hero-montage-mobile.mp4'), '-frames:v', '1', '-vf', 'scale=-2:480', join(dir, `mob-${i}.jpg`)]);
  });
  run(['-ss', '0', '-i', master, '-frames:v', '1', '-vf', 'scale=640:-2', join(dir, 'first.jpg')]);
  console.log(`preview frames at ${times.join(', ')}s → media-src/preview/`);
}

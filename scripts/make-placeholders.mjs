/**
 * Generates neutral ivory/olive placeholder art for every media slot, plus the
 * favicon and default social image. Replace files in public/media through the
 * CMS (or drop real photography in) and update the paths in src/content.
 * Usage: node scripts/make-placeholders.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'public', 'media', 'placeholders');
mkdirSync(out, { recursive: true });

const palettes = [
  ['#e9e1cc', '#d7c9a7', '#4b5a2e', '#a3472a'],
  ['#e3e6cd', '#c9cfa6', '#2f3a1f', '#b8693f'],
  ['#efe4cf', '#dccba8', '#5d6b3a', '#a3472a'],
  ['#e6dfc9', '#cbbf9c', '#3d4a26', '#c07a52'],
];

/** A loose overhead "table": a plate or tray, a couple of bowls, a sprig. */
function art(seed, w, h) {
  const [bg, mid, olive, terra] = palettes[seed % palettes.length];
  const r = (n) => ((Math.sin(seed * 999 + n * 77) + 1) / 2);
  const cx = w * (0.38 + r(1) * 0.2);
  const cy = h * (0.42 + r(2) * 0.16);
  const R = Math.min(w, h) * (0.28 + r(3) * 0.06);
  const b1 = { x: w * (0.72 + r(4) * 0.1), y: h * (0.28 + r(5) * 0.1), r: R * 0.42 };
  const b2 = { x: w * (0.18 + r(6) * 0.1), y: h * (0.74 + r(7) * 0.1), r: R * 0.34 };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <path d="M0 ${h * 0.62} Q ${w * 0.5} ${h * 0.5} ${w} ${h * 0.66} V ${h} H 0 Z" fill="${mid}" opacity=".45"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="#fbf8f0"/>
  <circle cx="${cx}" cy="${cy}" r="${R * 0.78}" fill="${mid}" opacity=".55"/>
  <circle cx="${cx - R * 0.2}" cy="${cy - R * 0.1}" r="${R * 0.32}" fill="${olive}" opacity=".55"/>
  <circle cx="${cx + R * 0.25}" cy="${cy + R * 0.18}" r="${R * 0.26}" fill="${terra}" opacity=".45"/>
  <circle cx="${b1.x}" cy="${b1.y}" r="${b1.r}" fill="#fbf8f0"/>
  <circle cx="${b1.x}" cy="${b1.y}" r="${b1.r * 0.7}" fill="${terra}" opacity=".35"/>
  <circle cx="${b2.x}" cy="${b2.y}" r="${b2.r}" fill="#fbf8f0"/>
  <circle cx="${b2.x}" cy="${b2.y}" r="${b2.r * 0.68}" fill="${olive}" opacity=".35"/>
  <g fill="${olive}" opacity=".7" transform="translate(${w * 0.8} ${h * 0.78}) rotate(${-30 + r(8) * 40})">
    <path d="M0 0 L ${R * 0.9} 0" stroke="${olive}" stroke-width="3"/>
    <ellipse cx="${R * 0.25}" cy="-10" rx="7" ry="18" transform="rotate(60 ${R * 0.25} -10)"/>
    <ellipse cx="${R * 0.5}" cy="10" rx="7" ry="18" transform="rotate(-60 ${R * 0.5} 10)"/>
    <ellipse cx="${R * 0.75}" cy="-10" rx="7" ry="18" transform="rotate(60 ${R * 0.75} -10)"/>
  </g>
</svg>`;
}

const slots = {
  hero: [1920, 1080],
  mains: [1200, 900], salads: [1200, 900], dips: [1200, 900], mezze: [1200, 900], carbs: [1200, 900], sides: [1200, 900],
  box: [1200, 900], family: [1200, 900], 'tray-package': [1200, 900], 'event-tier': [1200, 900],
  office: [1200, 1500], event: [1200, 1500], story: [1200, 1500], kitchen: [1600, 1000],
};
let i = 0;
for (const [name, [w, h]] of Object.entries(slots)) writeFileSync(join(out, `${name}.svg`), art(++i, w, h));
for (let g = 1; g <= 8; g++) writeFileSync(join(out, `gallery-${g}.svg`), art(40 + g, g % 3 === 0 ? 1200 : 900, g % 3 === 0 ? 900 : 1200));

writeFileSync(join(import.meta.dirname, '..', 'public', 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#2f3a1f"/><path d="M12 27c5-1 10-5 15-14" stroke="#f6f1e4" stroke-width="1.6" fill="none" stroke-linecap="round"/><ellipse cx="17.5" cy="20.5" rx="2.2" ry="4.6" transform="rotate(-38 17.5 20.5)" fill="#f6f1e4"/><ellipse cx="23.6" cy="16.6" rx="2" ry="4.2" transform="rotate(52 23.6 16.6)" fill="#f6f1e4" opacity=".75"/><circle cx="27.4" cy="12.4" r="2.1" fill="#a3472a"/></svg>`);

// Social preview image (PNG for broad support)
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#2f3a1f"/>
  <circle cx="1010" cy="315" r="230" fill="#4b5a2e"/>
  <circle cx="1010" cy="315" r="170" fill="#f6f1e4" opacity=".12"/>
  <circle cx="1080" cy="230" r="34" fill="#a3472a"/>
  <text x="80" y="250" font-family="Georgia, serif" font-size="76" fill="#f6f1e4">American Mediterranean</text>
  <text x="80" y="340" font-family="Georgia, serif" font-style="italic" font-size="76" fill="#e3e6cd">catering, made easy.</text>
  <text x="80" y="440" font-family="Arial, sans-serif" font-size="30" fill="#e3e6cd">Lunchboxes, trays and event catering for Tampa Bay</text>
</svg>`;
try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(og)).png().toFile(join(import.meta.dirname, '..', 'public', 'media', 'og-default.png'));
} catch (e) {
  console.warn('sharp unavailable, writing SVG social image only', e.message);
  writeFileSync(join(import.meta.dirname, '..', 'public', 'media', 'og-default.svg'), og);
}
console.log('placeholders written');

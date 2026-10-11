// Generates the PNG app icons from public/icons/favicon.svg with sharp.
// Run: npm run icons
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = await readFile(`${dir}favicon.svg`);

// Maskable icons must keep the artwork inside the central 80% safe zone, so we
// render the base icon smaller on a full-bleed background.
async function maskable(size) {
  const inner = Math.round(size * 0.78);
  const offset = Math.round((size - inner) / 2);
  const art = await sharp(svg).resize(inner, inner).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#f4f1ea' } })
    .composite([{ input: art, top: offset, left: offset }])
    .png();
}

await mkdir(dir, { recursive: true });
const jobs = [
  ['icon-192.png', sharp(svg).resize(192, 192).png()],
  ['icon-512.png', sharp(svg).resize(512, 512).png()],
  ['apple-touch-icon.png', sharp(svg).resize(180, 180).png()],
  ['maskable-512.png', await maskable(512)],
];
for (const [name, pipeline] of jobs) {
  await writeFile(`${dir}${name}`, await pipeline.toBuffer());
  console.log('wrote', name);
}

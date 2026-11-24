/**
 * Draws the app icons in public/ from one SVG, with Playwright's Chromium.
 * Run with: npm run icons. The PNGs are committed; Unit 12 redraws the mark.
 *
 * - favicon.svg: the mark on a rounded square, for browser tabs.
 * - icon-192.png, icon-512.png: the manifest's icons ("any").
 * - icon-maskable-512.png: the mark inside the maskable safe zone (the middle
 *   80%), on a full-bleed background, for Android's shaped launcher icons.
 * - apple-touch-icon.png (180 px): full bleed; iOS rounds the corners itself.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const BACKGROUND = '#0a0a0a';

/** A drum with two crossed sticks, drawn on a 512 grid. */
const MARK = `
  <line x1="150" y1="96" x2="262" y2="232" stroke="#f5f5f5" stroke-width="20" stroke-linecap="round"/>
  <line x1="362" y1="96" x2="250" y2="232" stroke="#f5f5f5" stroke-width="20" stroke-linecap="round"/>
  <path d="M106 250 v104 a150 54 0 0 0 300 0 v-104 a150 54 0 0 1 -300 0z" fill="#0369a1"/>
  <ellipse cx="256" cy="250" rx="150" ry="54" fill="#38bdf8"/>
`;

function svg({ rounded, scale }: { rounded: boolean; scale: number }): string {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset + 24 * scale}) scale(${scale})">${MARK}</g>
</svg>`;
}

const pngs = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.9 },
];

writeFileSync(join(publicDir, 'favicon.svg'), svg({ rounded: true, scale: 1 }) + '\n');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, scale } of pngs) {
    await page.setViewportSize({ width: size, height: size });
    const markup = svg({ rounded: false, scale });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
    );
    await page.screenshot({
      path: join(publicDir, file),
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`Wrote public/${file}`);
  }
} finally {
  await browser.close();
}

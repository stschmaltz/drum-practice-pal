/**
 * Draws the app icons in public/ from one SVG, with Playwright's Chromium.
 * Run with: npm run icons. The PNGs are committed. The mark is the one the
 * page draws (`src/components/brandMark.ts`), in the colour tokens read from
 * `src/index.css`, so a change of theme is a change of tokens and a rerun.
 *
 * - favicon.svg: the mark on a rounded square, for browser tabs.
 * - icon-192.png, icon-512.png: the manifest's icons ("any").
 * - icon-maskable-512.png: the mark inside the maskable safe zone (the middle
 *   80%), on a full-bleed background, for Android's shaped launcher icons.
 * - apple-touch-icon.png (180 px): full bleed; iOS rounds the corners itself.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { brandMarkMarkup } from '../src/components/brandMark';
import { colorToken, parseColorTokens } from '../src/lib/themeTokens';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));

const tokens = parseColorTokens(
  readFileSync(fileURLToPath(new URL('../src/index.css', import.meta.url)), 'utf8'),
);

// The manifest's background_color and theme_color are this too (checked in tests/unit/designTokens.test.ts).
const BACKGROUND = colorToken(tokens, 'canvas');

const MARK = brandMarkMarkup((name) => colorToken(tokens, name));

function svg({ rounded, scale }: { rounded: boolean; scale: number }): string {
  const offset = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 96 : 0}" fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset + 8 * scale}) scale(${scale})">${MARK}</g>
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

/**
 * Unit 01 spike: desktop Chromium numbers for docs/units/01-spike.md.
 * Usage: start `npm run dev` (or a preview build), then
 *   npx tsx scripts/spike-measure.ts [baseUrl]
 * Reports per-fixture load/render timings, event-level start latency and memory.
 * Process memory is read on Windows only (PowerShell/CIM); elsewhere it's skipped.
 * These are not audible measurements; anything by ear stays a Human check.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const baseUrl = process.argv[2] ?? 'http://localhost:5173';
const PLAY_SECONDS = 12;

interface ProcRow {
  ProcessId: number;
  ParentProcessId: number;
  WorkingSetSize: number;
  PrivatePageCount: number;
  CommandLine: string | null;
}

function processTreeMb(
  rootPid: number,
): { totalPrivateMb: number; rendererPrivateMb: number } | null {
  if (process.platform !== 'win32') return null;
  const json = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,PrivatePageCount,CommandLine | ConvertTo-Json -Compress',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const rows = JSON.parse(json) as ProcRow[];
  const tree = new Set([rootPid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (!tree.has(row.ProcessId) && tree.has(row.ParentProcessId)) {
        tree.add(row.ProcessId);
        grew = true;
      }
    }
  }
  const inTree = rows.filter((r) => tree.has(r.ProcessId));
  const mb = (bytes: number) => bytes / 1024 / 1024;
  return {
    totalPrivateMb: mb(inTree.reduce((sum, r) => sum + r.PrivatePageCount, 0)),
    rendererPrivateMb: mb(
      inTree
        .filter((r) => r.CommandLine?.includes('--type=renderer'))
        .reduce((sum, r) => sum + r.PrivatePageCount, 0),
    ),
  };
}

async function stat(page: Page, name: string): Promise<string> {
  const dl = page.getByRole('region', { name: 'Diagnostics' }).locator('dl');
  return (
    await dl.locator('dt', { hasText: name }).locator('xpath=following-sibling::dd[1]').innerText()
  ).trim();
}

async function waitForLog(page: Page, text: string) {
  await page
    .getByRole('list', { name: 'Event log' })
    .getByText(text)
    .first()
    .waitFor({ timeout: 30_000 });
}

async function main() {
  const server = await chromium.launchServer({
    args: ['--enable-precise-memory-info', '--autoplay-policy=no-user-gesture-required'],
  });
  const rootPid = server.process().pid;
  const browser = await chromium.connect(server.wsEndpoint());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (rootPid !== undefined) console.log('blank browser', processTreeMb(rootPid));

  await page.goto(`${baseUrl}/spike`);
  await waitForLog(page, 'player ready');
  await page.waitForTimeout(1000);
  console.log('soundfont', await stat(page, 'Soundfont'));
  console.log('groove-120 loaded: heap', await stat(page, 'Main JS heap'));
  if (rootPid !== undefined) console.log('  process tree', processTreeMb(rootPid));

  const latencies: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Play' }).click();
    await waitForLog(page, 'start latency');
    await page.waitForTimeout(1500);
    latencies.push(await stat(page, 'Start latency'));
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForTimeout(500);
  }
  console.log('start latency (event level, 5 runs)', latencies);

  await page.getByLabel('Fixture').selectOption({ label: 'Multi-track (drums, bass, guitar)' });
  await waitForLog(page, 'Multi Track');
  await page.getByText('Render all tracks').click();
  await page.waitForTimeout(2000);
  console.log(
    'multi-track render',
    await stat(page, 'Render'),
    'parse',
    await stat(page, 'Score file'),
  );
  await page.getByRole('button', { name: 'Play' }).click();
  await page.waitForTimeout(PLAY_SECONDS * 1000);
  console.log(`multi-track after ${PLAY_SECONDS}s play: heap`, await stat(page, 'Main JS heap'));
  if (rootPid !== undefined) console.log('  process tree', processTreeMb(rootPid));

  // Live changes must not restart playback: watch for a state change while toggling.
  await page.getByLabel('Speed').fill('50');
  await page.getByText('Mute drums').click();
  await page.getByText('Metronome', { exact: true }).click();
  await page.waitForTimeout(1500);
  const log = await page.getByRole('list', { name: 'Event log' }).innerText();
  console.log(
    'recent log after live speed/mute/metronome changes:\n' +
      log.split('\n').slice(0, 5).join('\n'),
  );

  // Optional: the local real export, if present (never committed).
  const realDir = 'tests/fixtures/real';
  const real = readdirSync(realDir).find((f) => f.endsWith('.gp'));
  if (real) {
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.locator('input[type=file]').setInputFiles(join(realDir, real));
    await waitForLog(page, 'score loaded');
    await page.waitForTimeout(3000);
    console.log(
      `real export render (all tracks)`,
      await stat(page, 'Render'),
      'parse',
      await stat(page, 'Score file'),
    );
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(PLAY_SECONDS * 1000);
    console.log(`real export after ${PLAY_SECONDS}s play: heap`, await stat(page, 'Main JS heap'));
    if (rootPid !== undefined) console.log('  process tree', processTreeMb(rootPid));
  }

  await browser.close();
  await server.close();
}

void main();

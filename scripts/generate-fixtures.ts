/**
 * Builds the synthetic .gp fixtures from tests/fixtures/sources.ts.
 * Run with: npm run fixtures
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as alphaTab from '@coderline/alphatab';
import { fixtures } from '../tests/fixtures/sources.ts';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'gp');
mkdirSync(outDir, { recursive: true });

const settings = new alphaTab.Settings();

for (const fixture of fixtures) {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(fixture.tex, settings);
  const score = importer.readScore();

  // readScore only throws on errors; a warning usually means the tex was
  // read differently than written, which would make the fixture lie.
  const { Warning } = alphaTab.importer.alphaTex.AlphaTexDiagnosticsSeverity;
  const warnings = [
    ...importer.lexerDiagnostics,
    ...importer.parserDiagnostics,
    ...importer.semanticDiagnostics,
  ].filter((d) => d.severity >= Warning);
  if (warnings.length > 0) {
    const lines = warnings.map((d) => `  line ${d.start?.line}:${d.start?.col} ${d.message}`);
    throw new Error(`alphaTex warnings in fixture "${fixture.name}":\n${lines.join('\n')}`);
  }

  const bytes = new alphaTab.exporter.Gp7Exporter().export(score, settings);
  const file = join(outDir, `${fixture.name}.gp`);
  writeFileSync(file, bytes);
  console.log(`wrote ${file} (${score.masterBars.length} bars, ${score.tracks.length} tracks)`);
}

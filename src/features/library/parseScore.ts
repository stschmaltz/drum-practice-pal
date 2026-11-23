/**
 * The only library module that imports alphaTab. songsApi.ts loads it with a
 * dynamic import, so alphaTab stays out of the main bundle until someone
 * uploads a file.
 */
import * as alphaTab from '@coderline/alphatab';
import { extractSongMetadata, type MetadataResult } from './songMetadata';

export type ParseResult = MetadataResult | { ok: false; reason: 'parse-error' };

/**
 * alphaTab's importers for Guitar Pro 3-5, 6 and 7-8, without MusicXML,
 * Capella and alphaTex. ScoreLoader tries those last, and alphaTex reads
 * almost any bytes as a one-bar score, so a damaged .gp would "load".
 */
export function guitarProImporters(): alphaTab.importer.ScoreImporter[] {
  return alphaTab.Environment.buildImporters().filter((importer) =>
    importer.name.startsWith('Guitar Pro'),
  );
}

/**
 * ScoreLoader.loadScoreFromBytes, limited to guitarProImporters(). Null when
 * the bytes aren't a readable Guitar Pro file. The player uses it too, so a
 * damaged download is refused rather than rendered as a one-bar score.
 */
export function loadGuitarPro(bytes: Uint8Array): alphaTab.model.Score | null {
  const settings = new alphaTab.Settings();
  const data = alphaTab.io.ByteBuffer.fromBuffer(bytes);
  for (const importer of guitarProImporters()) {
    data.reset();
    try {
      importer.init(data, settings);
      return importer.readScore();
    } catch (error) {
      // Not this importer's format: try the next. Anything else means the
      // file is this format but damaged.
      if (error instanceof alphaTab.importer.UnsupportedFormatError) continue;
      return null;
    }
  }
  return null;
}

export function parseScore(bytes: Uint8Array, fileName: string): ParseResult {
  // alphaTab's messages ("Unexpected end of data") mean nothing to a drummer,
  // so the caller shows fixed copy instead.
  const score = loadGuitarPro(bytes);
  if (!score) return { ok: false, reason: 'parse-error' };
  return extractSongMetadata(score, fileName);
}

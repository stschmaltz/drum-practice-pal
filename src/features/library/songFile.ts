/**
 * Decides whether picked bytes are a Guitar Pro file before alphaTab sees them.
 * alphaTab's loader falls back to its lenient alphaTex importer, which turns
 * random bytes into an empty score (Unit 01, issue 1), so the file's signature
 * is checked here first. Pure, so node tests cover it without alphaTab.
 */
import { GP_FILE_MAX_BYTES } from '@/lib/schema';

/** What the picker and drop zone say they take. Content decides, not the name. */
export const GUITAR_PRO_EXTENSIONS = ['.gp', '.gpx', '.gp5', '.gp4', '.gp3'] as const;

export type GuitarProFormat = 'gp7' | 'gpx' | 'gp3-5';
export type DetectedFormat = GuitarProFormat | 'midi' | 'unknown';

export type SongFileProblem = 'empty' | 'too-large' | 'midi' | 'not-guitar-pro';

export type SongFileCheck =
  { ok: true; format: GuitarProFormat } | { ok: false; problem: SongFileProblem };

const ZIP = [0x50, 0x4b, 0x03, 0x04]; // "PK\3\4": GP7 and GP8 (.gp) are zip containers
const MIDI = 'MThd';
const GPX_HEADERS = ['BCFZ', 'BCFS'];
// GP3 to GP5 start with a length byte, then this. Matches alphaTab's Gp3To5Importer.
const GP3_TO_5_VERSION = 'FICHIER GUITAR PRO ';

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (ZIP.every((byte, i) => bytes[i] === byte)) return 'gp7';
  const head = ascii(bytes, 0, 4);
  if (GPX_HEADERS.includes(head)) return 'gpx';
  if (head === MIDI) return 'midi';
  if (ascii(bytes, 1, GP3_TO_5_VERSION.length) === GP3_TO_5_VERSION) return 'gp3-5';
  return 'unknown';
}

const MIDI_EXTENSION = /\.(mid|midi)$/i;

export function checkSongFile(fileName: string, bytes: Uint8Array): SongFileCheck {
  if (bytes.length === 0) return { ok: false, problem: 'empty' };
  if (bytes.length > GP_FILE_MAX_BYTES) return { ok: false, problem: 'too-large' };
  const format = detectFormat(bytes);
  if (format === 'midi' || MIDI_EXTENSION.test(fileName)) return { ok: false, problem: 'midi' };
  if (format === 'unknown') return { ok: false, problem: 'not-guitar-pro' };
  return { ok: true, format };
}

/** Fixed copy per problem; the file name is the only user text shown next to it. */
export const SONG_FILE_MESSAGES: Record<SongFileProblem | 'unreadable', string> = {
  empty: 'That file is empty.',
  'too-large': `That file is over ${GP_FILE_MAX_BYTES / 1024 / 1024} MB, which is bigger than any Guitar Pro tab should be.`,
  midi: "MIDI files aren't supported. In Songsterr, export the song as Guitar Pro (.gp) instead and upload that file.",
  'not-guitar-pro':
    "That isn't a Guitar Pro file. Upload a .gp, .gpx, .gp5, .gp4 or .gp3 file, such as Songsterr's Guitar Pro export.",
  unreadable:
    "That file looks like Guitar Pro but couldn't be read. It may be damaged; try exporting it again.",
};

/** The name without its extension, for songs whose file has no title. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  const dot = base.lastIndexOf('.');
  return (dot > 0 ? base.slice(0, dot) : base).trim();
}

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GP_FILE_MAX_BYTES } from '@/lib/schema';
import { fixtures } from '../../../tests/fixtures/sources';
import { checkSongFile, detectFormat, SONG_FILE_MESSAGES, titleFromFileName } from './songFile';

const fixtureBytes = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'gp', `${name}.gp`)));

const ascii = (text: string) => new Uint8Array(Array.from(text, (c) => c.charCodeAt(0)));

/** The start of a GP5 file: a length byte, then the version string. */
const gp5Header = () => {
  const version = 'FICHIER GUITAR PRO v5.00';
  return new Uint8Array([version.length, ...ascii(version), 0, 0, 0]);
};

describe('detectFormat', () => {
  it.each(fixtures.map((f) => f.name))('reads the GP7 fixture %s as a zip', (name) => {
    expect(detectFormat(fixtureBytes(name))).toBe('gp7');
  });

  it.each(['BCFZ', 'BCFS'])('reads a %s header as GPX', (header) => {
    expect(detectFormat(ascii(`${header}\u0000\u0000rest`))).toBe('gpx');
  });

  it('reads GP3 to GP5 by their version string', () => {
    expect(detectFormat(gp5Header())).toBe('gp3-5');
    const gp3 = 'FICHIER GUITAR PRO v3.00';
    expect(detectFormat(new Uint8Array([gp3.length, ...ascii(gp3)]))).toBe('gp3-5');
  });

  it('spots MIDI', () => {
    expect(detectFormat(ascii('MThd\u0000\u0000\u0000\u0006'))).toBe('midi');
  });

  it.each([
    ['text', ascii('just some notes')],
    ['an alphaTex score', ascii('\\title "x" . 3.3 |')],
    ['too few bytes', new Uint8Array([0x50, 0x4b])],
    ['nothing', new Uint8Array()],
    ['a PNG', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ])('calls %s unknown', (_label, bytes) => {
    expect(detectFormat(bytes)).toBe('unknown');
  });
});

describe('checkSongFile', () => {
  it('accepts Guitar Pro content whatever the file is called', () => {
    expect(checkSongFile('song.gp', fixtureBytes('groove-120'))).toEqual({
      ok: true,
      format: 'gp7',
    });
    expect(checkSongFile('song.gp5', gp5Header())).toEqual({ ok: true, format: 'gp3-5' });
    expect(checkSongFile('download', gp5Header())).toEqual({ ok: true, format: 'gp3-5' });
  });

  it('refuses an empty file', () => {
    expect(checkSongFile('song.gp', new Uint8Array())).toEqual({ ok: false, problem: 'empty' });
  });

  it('refuses a file over the bucket limit', () => {
    const big = new Uint8Array(GP_FILE_MAX_BYTES + 1);
    big.set([0x50, 0x4b, 0x03, 0x04]);
    expect(checkSongFile('song.gp', big)).toEqual({ ok: false, problem: 'too-large' });
    const limit = new Uint8Array(GP_FILE_MAX_BYTES);
    limit.set([0x50, 0x4b, 0x03, 0x04]);
    expect(checkSongFile('song.gp', limit).ok).toBe(true);
  });

  it('refuses MIDI by content or by name', () => {
    expect(checkSongFile('song.gp', ascii('MThd\u0000'))).toEqual({ ok: false, problem: 'midi' });
    expect(checkSongFile('Song.MID', ascii('garbage'))).toEqual({ ok: false, problem: 'midi' });
    expect(checkSongFile('song.midi', ascii('garbage'))).toEqual({ ok: false, problem: 'midi' });
  });

  it('refuses anything else as not Guitar Pro, even with a .gp name', () => {
    expect(checkSongFile('song.gp', ascii('hello'))).toEqual({
      ok: false,
      problem: 'not-guitar-pro',
    });
  });

  it('points MIDI uploads at the Guitar Pro export', () => {
    expect(SONG_FILE_MESSAGES.midi).toMatch(/Songsterr/);
    expect(SONG_FILE_MESSAGES.midi).toMatch(/Guitar Pro/);
  });
});

describe('titleFromFileName', () => {
  it.each([
    ['Little Sister.gp', 'Little Sister'],
    ['band - song.final.gp5', 'band - song.final'],
    ['C:\\Users\\me\\tab.gpx', 'tab'],
    ['folder/tab.gp', 'tab'],
    ['.gp', '.gp'],
    ['no-extension', 'no-extension'],
    ['  spaced .gp', 'spaced'],
  ])('%j gives %j', (name, title) => {
    expect(titleFromFileName(name)).toBe(title);
  });
});

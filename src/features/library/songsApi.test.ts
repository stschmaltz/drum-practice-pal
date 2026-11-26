import { FAILURE_COPY, UserFacingError } from '@/lib/errorCopy';
import { GP_FILE_MAX_BYTES, songFilePath } from '@/lib/schema';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
  type QueryCall,
} from '@/test/fakeSupabase';
import { deleteSong, fetchSongs, SongFileError, uploadSong, type UploadStep } from './songsApi';
import type { ParseResult } from './parseScore';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

// alphaTab itself is covered by parseScore.test.ts; here only the orchestration matters.
const parseScore = vi.fn<(bytes: Uint8Array, fileName: string) => ParseResult>();
vi.mock('./parseScore', () => ({
  parseScore: (...args: [Uint8Array, string]) => parseScore(...args),
}));

const USER = 'user-1';
const ZIP = [0x50, 0x4b, 0x03, 0x04, 1, 2, 3];
const gpFile = (name = 'song.gp') => new File([new Uint8Array(ZIP)], name);
const metadata = {
  title: 'Song',
  artist: 'Band',
  originalTempo: 120,
  barCount: 16,
  drumTrackIndex: null,
};
const savedRow = {
  id: 'from-db',
  title: 'Song',
  artist: 'Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: null,
  created_at: '2026-11-22T00:00:00Z',
};

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});

/** Answers queries in order: [hash lookup, insert, ...]. */
function answerQueries(...results: FakeResult[]) {
  for (const result of results) queryResult.mockResolvedValueOnce(result);
}

const queries = () => queryResult.mock.calls.map(([call]) => call);
const storageCalls = () => storageResult.mock.calls.map(([call]) => call);
const insertCall = () => queries().find((call) => opArgs(call, 'insert'));

beforeEach(() => {
  resetFakeSupabase();
  parseScore.mockReset().mockReturnValue({ ok: true, metadata });
});

describe('uploadSong', () => {
  it('uploads the file, then inserts a row that names it', async () => {
    answerQueries(ok(null), ok(savedRow));
    const steps: UploadStep[] = [];

    const result = await uploadSong(USER, gpFile(), { onStep: (step) => steps.push(step) });

    expect(result).toEqual({ kind: 'uploaded', song: { ...savedRow, last_practiced_at: null } });
    expect(steps).toEqual(['reading', 'checking', 'uploading', 'saving']);

    const [upload] = storageCalls();
    expect(upload).toMatchObject({ bucket: 'gp-files', method: 'upload' });
    const [path, bytes, options] = upload!.args as [string, Uint8Array, object];
    expect(Array.from(bytes)).toEqual(ZIP);
    expect(options).toEqual({ contentType: 'application/octet-stream', upsert: false });

    const [row] = opArgs(insertCall()!, 'insert') as [Record<string, unknown>];
    expect(path).toBe(songFilePath(USER, row.id as string));
    expect(row).toMatchObject({
      user_id: USER,
      file_path: path,
      title: 'Song',
      artist: 'Band',
      original_tempo: 120,
      bar_count: 16,
      drum_track_index: null,
    });
    expect(row.file_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('looks the hash up scoped to the user', async () => {
    answerQueries(ok(null), ok(savedRow));
    await uploadSong(USER, gpFile());
    const lookup = queries()[0]!;
    expect(lookup.table).toBe('songs');
    expect(lookup.ops.filter((op) => op.method === 'eq').map((op) => op.args[0])).toEqual([
      'user_id',
      'file_hash',
    ]);
  });

  it.each([
    ['MIDI', new File([new TextEncoder().encode('MThd\u0000\u0000')], 'song.mid'), /MIDI/],
    ['text', new File(['hello'], 'notes.gp'), /isn't a Guitar Pro file/],
    ['empty', new File([], 'empty.gp'), /empty/],
  ])('refuses a %s file before touching the server', async (_label, file, message) => {
    const upload = uploadSong(USER, file);
    await expect(upload).rejects.toBeInstanceOf(SongFileError);
    await expect(upload).rejects.toThrow(message);
    expect(parseScore).not.toHaveBeenCalled();
    expect(queryResult).not.toHaveBeenCalled();
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('refuses an oversized file without reading it into memory', async () => {
    const file = gpFile('huge.gp');
    Object.defineProperty(file, 'size', { value: GP_FILE_MAX_BYTES + 1 });
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(uploadSong(USER, file)).rejects.toThrow(/over 20 MB/);
    expect(read).not.toHaveBeenCalled();
    expect(queryResult).not.toHaveBeenCalled();
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('refuses a file alphaTab can’t read, creating nothing', async () => {
    parseScore.mockReturnValue({ ok: false, reason: 'parse-error' });
    await expect(uploadSong(USER, gpFile())).rejects.toThrow(/couldn't be read/);
    expect(queryResult).not.toHaveBeenCalled();
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('returns the existing song for a duplicate, uploading nothing', async () => {
    answerQueries(ok(savedRow));
    expect(await uploadSong(USER, gpFile())).toEqual({ kind: 'duplicate', song: savedRow });
    expect(storageResult).not.toHaveBeenCalled();
    expect(insertCall()).toBeUndefined();
  });

  it('stops if the duplicate check fails', async () => {
    answerQueries(fail('lookup down'));
    await expect(uploadSong(USER, gpFile())).rejects.toThrow('lookup down');
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('stops if the file upload fails, inserting nothing', async () => {
    answerQueries(ok(null));
    storageResult.mockResolvedValueOnce(fail('bucket full'));
    await expect(uploadSong(USER, gpFile())).rejects.toThrow('bucket full');
    expect(insertCall()).toBeUndefined();
    expect(storageCalls()).toHaveLength(1);
  });

  it('removes the uploaded file when the insert fails', async () => {
    answerQueries(ok(null), fail('insert failed'));
    await expect(uploadSong(USER, gpFile())).rejects.toThrow('insert failed');
    const [upload, remove] = storageCalls();
    expect(remove).toMatchObject({ method: 'remove', args: [[upload!.args[0]]] });
  });

  it('says so when the rollback fails too, in fixed copy', async () => {
    answerQueries(ok(null), fail('insert failed', '42501'));
    storageResult.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(fail('remove failed'));
    const upload = uploadSong(USER, gpFile());
    await expect(upload).rejects.toBeInstanceOf(UserFacingError);
    await expect(upload).rejects.toThrow(
      `${FAILURE_COPY.refused} A copy of the file may be left on the server.`,
    );
  });

  describe('a lost answer', () => {
    const dropped = () => fail('TypeError: Failed to fetch', '');

    it('to the insert, with the row saved: the song was added, and its file stays', async () => {
      answerQueries(ok(null), dropped(), ok(savedRow));
      expect(await uploadSong(USER, gpFile())).toEqual({
        kind: 'uploaded',
        song: { ...savedRow, last_practiced_at: null },
      });
      expect(storageCalls().map((call) => call.method)).toEqual(['upload']);
      const [row] = opArgs(insertCall()!, 'insert') as [{ id: string }];
      const lookup = queries()[2]!;
      expect(lookup.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toEqual([
        ['id', row.id],
        ['user_id', USER],
      ]);
    });

    // Copilot review: an empty look-up can't prove the insert won't still
    // commit (it may be running yet), so removing the file could leave a
    // listed song with nothing to play. The file stays; at worst it is an orphan.
    it('to the insert, with no row found: keeps the file, as the insert may still commit', async () => {
      answerQueries(ok(null), dropped(), ok(null));
      await expect(uploadSong(USER, gpFile())).rejects.toThrow(
        `${FAILURE_COPY.network} The song may have been added anyway: reload the library to see.`,
      );
      expect(storageCalls().map((call) => call.method)).toEqual(['upload']);
    });

    it('to the insert, and the look-up fails too: keeps the file, which the row may name', async () => {
      answerQueries(ok(null), dropped(), dropped());
      await expect(uploadSong(USER, gpFile())).rejects.toThrow(
        `${FAILURE_COPY.network} The song may have been added anyway: reload the library to see.`,
      );
      expect(storageCalls().map((call) => call.method)).toEqual(['upload']);
    });

    it('to the upload: removes whatever was stored, and inserts nothing', async () => {
      answerQueries(ok(null));
      storageResult.mockResolvedValueOnce(dropped());
      await expect(uploadSong(USER, gpFile())).rejects.toThrow('Failed to fetch');
      expect(storageCalls().map((call) => call.method)).toEqual(['upload', 'remove']);
      expect(insertCall()).toBeUndefined();
    });
  });

  it('treats a unique violation as a duplicate added meanwhile, after removing its file', async () => {
    answerQueries(ok(null), fail('duplicate key', '23505'), ok(savedRow));
    expect(await uploadSong(USER, gpFile())).toEqual({ kind: 'duplicate', song: savedRow });
    expect(storageCalls().map((call) => call.method)).toEqual(['upload', 'remove']);
  });

  it('cancelled before the upload: creates nothing', async () => {
    answerQueries(ok(null));
    const controller = new AbortController();
    const upload = uploadSong(USER, gpFile(), {
      signal: controller.signal,
      onStep: (step) => step === 'checking' && controller.abort(),
    });
    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(storageResult).not.toHaveBeenCalled();
    expect(insertCall()).toBeUndefined();
  });

  it('cancelled during the upload: removes the file and inserts nothing', async () => {
    answerQueries(ok(null));
    const controller = new AbortController();
    storageResult.mockImplementationOnce(async () => {
      controller.abort();
      return ok({});
    });
    await expect(uploadSong(USER, gpFile(), { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(storageCalls().map((call) => call.method)).toEqual(['upload', 'remove']);
    expect(insertCall()).toBeUndefined();
  });
});

describe('fetchSongs', () => {
  const row = (i: number) => ({ ...savedRow, id: `song-${i}`, loops: [] });

  it('reads page by page until a short page', async () => {
    queryResult
      .mockResolvedValueOnce(ok(Array.from({ length: 500 }, (_, i) => row(i))))
      .mockResolvedValueOnce(ok([row(500)]));
    const songs = await fetchSongs(USER);
    expect(songs).toHaveLength(501);
    const ranges = queries().map((call: QueryCall) => opArgs(call, 'range'));
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
    ]);
    expect(opArgs(queries()[0]!, 'eq')).toEqual(['user_id', USER]);
  });

  it('throws a failed page', async () => {
    queryResult.mockResolvedValueOnce(fail('nope'));
    await expect(fetchSongs(USER)).rejects.toThrow('nope');
  });
});

describe('deleteSong', () => {
  it('removes the file, then the row, both scoped to the user', async () => {
    queryResult.mockResolvedValueOnce(ok(null));
    await deleteSong(USER, 'song-1');
    expect(storageCalls()).toEqual([
      { bucket: 'gp-files', method: 'remove', args: [[songFilePath(USER, 'song-1')]] },
    ]);
    const [call] = queries();
    expect(call!.ops.map((op) => [op.method, ...op.args])).toEqual([
      ['delete'],
      ['eq', 'id', 'song-1'],
      ['eq', 'user_id', USER],
    ]);
  });

  it('keeps the row when the file can’t be removed', async () => {
    storageResult.mockResolvedValueOnce(fail('storage down'));
    await expect(deleteSong(USER, 'song-1')).rejects.toThrow('storage down');
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('throws when the row delete fails', async () => {
    queryResult.mockResolvedValueOnce(fail('row delete failed'));
    await expect(deleteSong(USER, 'song-1')).rejects.toThrow('row delete failed');
  });
});

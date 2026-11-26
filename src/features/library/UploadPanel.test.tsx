import { act, createEvent, fireEvent, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { renderRoutes, settle } from '@/test/render';
import type { ParseResult } from './parseScore';
import type { SongMetadata } from './songMetadata';
import { UploadPanel } from './UploadPanel';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

// Real parsing is covered by parseScore.test.ts and the e2e specs.
const parseScore = vi.fn<(bytes: Uint8Array, fileName: string) => ParseResult>();
vi.mock('./parseScore', () => ({
  parseScore: (...args: [Uint8Array, string]) => parseScore(...args),
}));

const metadata: SongMetadata = {
  title: 'Groove',
  artist: 'Band',
  originalTempo: 120,
  barCount: 16,
  drumTrackIndex: 0,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'song-1',
  title: 'Groove',
  artist: 'Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 0,
  created_at: '2026-11-22T00:00:00Z',
  ...overrides,
});
const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string, code?: string): FakeResult => ({
  data: null,
  error: { message, code },
});
const gpFile = (name = 'groove.gp') =>
  new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])], name);

/** Answers the hash lookup, the insert and any list refetch. */
function serve({
  existing = null,
  insert = ok(row()),
}: {
  existing?: unknown;
  insert?: FakeResult;
}) {
  queryResult.mockImplementation(async (call) => {
    if (opArgs(call, 'insert')) return insert;
    if (opArgs(call, 'range')) return ok([]);
    return ok(existing);
  });
}

const inserts = () => queryResult.mock.calls.filter(([call]) => opArgs(call, 'insert'));
const storageMethods = () => storageResult.mock.calls.map(([call]) => call.method);
const picker = () => screen.getByLabelText('Upload a Guitar Pro file');

function renderPanel() {
  renderRoutes(<Route path="/library" element={<UploadPanel />} />, { path: '/library' });
  return userEvent.setup();
}

/** jsdom has no DragEvent, so `relatedTarget` (where the drag went) is set by hand. */
function dragLeaveTo(zone: HTMLElement, relatedTarget: Element) {
  const leave = createEvent.dragLeave(zone);
  Object.defineProperty(leave, 'relatedTarget', { value: relatedTarget });
  fireEvent(zone, leave);
}

function deferred() {
  let resolve!: (value: FakeResult) => void;
  const promise = new Promise<FakeResult>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  resetFakeSupabase();
  parseScore.mockReset().mockReturnValue({ ok: true, metadata });
});

describe('UploadPanel', () => {
  it('uploads a picked file and links to the new song', async () => {
    serve({});
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open “Groove”' })).toHaveAttribute(
      'href',
      '/songs/song-1',
    );
    expect(screen.queryByText(/No drum track found/)).not.toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
    expect(inserts()).toHaveLength(1);
  });

  it('notes a file with no drum track', async () => {
    parseScore.mockReturnValue({ ok: true, metadata: { ...metadata, drumTrackIndex: null } });
    serve({ insert: ok(row({ drum_track_index: null })) });
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByText(/No drum track found in this file/)).toBeInTheDocument();
    const [[insertCall]] = inserts() as [[Parameters<typeof opArgs>[0]]];
    expect(opArgs(insertCall, 'insert')?.[0]).toMatchObject({ drum_track_index: null });
  });

  it('warns about a duplicate, offers the existing song and uploads nothing', async () => {
    serve({ existing: row({ id: 'existing', title: 'First Upload' }) });
    const user = renderPanel();
    await user.upload(picker(), gpFile('copy.gp'));

    expect(
      await screen.findByText(
        /already uploaded this file as “First Upload”. Nothing new was added./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open “First Upload”' })).toHaveAttribute(
      'href',
      '/songs/existing',
    );
    expect(storageResult).not.toHaveBeenCalled();
    expect(inserts()).toHaveLength(0);
  });

  it.each([
    [
      'a MIDI file',
      new File([new TextEncoder().encode('MThd\0\0\0\u0006')], 'song.mid'),
      /Couldn't add song.mid. MIDI files aren't supported. In Songsterr, export the song as Guitar Pro/,
    ],
    [
      'a non-Guitar Pro file',
      new File(['just some text'], 'notes.gp'),
      /Couldn't add notes.gp. That isn't a Guitar Pro file./,
    ],
    ['an empty file', new File([], 'empty.gp'), /That file is empty./],
  ])('refuses %s with a clear message, creating nothing', async (_label, file, message) => {
    serve({});
    const user = renderPanel();
    await user.upload(picker(), file);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(queryResult).not.toHaveBeenCalled();
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('refuses a damaged Guitar Pro file, creating nothing', async () => {
    parseScore.mockReturnValue({ ok: false, reason: 'parse-error' });
    serve({});
    const user = renderPanel();
    await user.upload(picker(), gpFile('broken.gp'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Couldn't add broken.gp. That file looks like Guitar Pro but couldn't be read./,
    );
    expect(queryResult).not.toHaveBeenCalled();
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('shows a failed save and removes the uploaded file', async () => {
    serve({ insert: fail('insert failed') });
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't upload groove.gp. Something went wrong. Try again.",
    );
    expect(storageMethods()).toEqual(['upload', 'remove']);
  });

  it('shows the step while working, and Cancel during the upload removes the file', async () => {
    serve({});
    const upload = deferred();
    storageResult.mockReturnValueOnce(upload.promise);
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByText('Uploading groove.gp…')).toBeInTheDocument();
    expect(picker()).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    upload.resolve(ok({}));

    expect(await screen.findByText('Upload cancelled. Nothing was saved.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload', 'remove']);
    expect(inserts()).toHaveLength(0);
    expect(picker()).toBeEnabled();
  });

  it('has no Cancel once the row is being saved', async () => {
    const insert = deferred();
    serve({});
    queryResult.mockImplementation(async (call) =>
      opArgs(call, 'insert') ? insert.promise : ok(opArgs(call, 'range') ? [] : null),
    );
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByText('Saving groove.gp…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    insert.resolve(ok(row()));
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
  });

  it('uploads a dropped file', async () => {
    serve({});
    renderPanel();
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [gpFile('dropped.gp')] },
    });
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
  });

  it('highlights the drop zone while a file is dragged over it', () => {
    renderPanel();
    const zone = screen.getByTestId('drop-zone');
    const highlighted = () => zone.classList.contains('border-brand');

    fireEvent.dragOver(zone);
    expect(highlighted()).toBe(true);
    // Moving onto the button inside the zone is still inside it.
    dragLeaveTo(zone, picker());
    expect(highlighted()).toBe(true);
    dragLeaveTo(zone, document.body);
    expect(highlighted()).toBe(false);

    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(highlighted()).toBe(false);
  });

  it('takes no drop and shows no highlight while an upload is running', async () => {
    const upload = deferred();
    storageResult.mockReturnValueOnce(upload.promise);
    serve({});
    const user = renderPanel();
    await user.upload(picker(), gpFile('first.gp'));
    expect(await screen.findByText('Uploading first.gp…')).toBeInTheDocument();

    const zone = screen.getByTestId('drop-zone');
    fireEvent.dragOver(zone);
    expect(zone.classList.contains('border-brand')).toBe(false);
    fireEvent.drop(zone, { dataTransfer: { files: [gpFile('second.gp')] } });
    expect(screen.getByText('Uploading first.gp…')).toBeInTheDocument();

    upload.resolve(ok({}));
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
    expect(inserts()).toHaveLength(1);
  });

  it('refuses several dropped files at once, uploading none', async () => {
    serve({});
    renderPanel();
    fireEvent.drop(screen.getByTestId('drop-zone'), {
      dataTransfer: { files: [gpFile('a.gp'), gpFile('b.gp')] },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Drop one file at a time.');
    await waitFor(() => expect(queryResult).not.toHaveBeenCalled());
    expect(storageResult).not.toHaveBeenCalled();
  });

  it('lets the same file be picked again after a refusal', async () => {
    serve({});
    const user = renderPanel();
    const text = new File(['nope'], 'notes.gp');
    await user.upload(picker(), text);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.upload(picker(), gpFile());
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// Unit 13 Test: the insert's answer lost on its way back (04 Review open issues 1 and 2).
describe('UploadPanel when the save’s answer is lost', () => {
  const dropped = (): FakeResult => fail('TypeError: Failed to fetch', '');
  const isLookUp = (call: Parameters<typeof opArgs>[0]) =>
    call.ops.some((op) => op.method === 'eq' && op.args[0] === 'id');

  /** The insert lands but its answer is dropped; the look-up by id answers `lookUp`. */
  function serveLostInsert(lookUp: Promise<FakeResult> | FakeResult) {
    queryResult.mockImplementation(async (call) => {
      if (opArgs(call, 'insert')) return dropped();
      if (opArgs(call, 'range')) return ok([]);
      if (isLookUp(call)) return lookUp;
      return ok(null);
    });
  }

  it('finds the saved song, says it was added and keeps its file; still "Saving" with no Cancel while it looks', async () => {
    const lookUp = deferred();
    serveLostInsert(lookUp.promise);
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    await waitFor(() => expect(queryResult.mock.calls.some(([call]) => isLookUp(call))).toBe(true));
    expect(screen.getByText('Saving groove.gp…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(picker()).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    lookUp.resolve(ok(row()));
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open “Groove”' })).toHaveAttribute(
      'href',
      '/songs/song-1',
    );
    expect(storageMethods()).toEqual(['upload']);
    expect(inserts()).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('when the look-up fails too, says the song may be there and removes nothing', async () => {
    serveLostInsert(dropped());
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      "Couldn't upload groove.gp. The server couldn't be reached. Check the connection and try again. The song may have been added anyway: reload the library to see.",
    );
    expect(alert).not.toHaveTextContent('Failed to fetch');
    expect(storageMethods()).toEqual(['upload']);
    expect(picker()).toBeEnabled();
  });

  // Copilot review: the insert may still be running when the look-up finds nothing.
  it('when the look-up finds no row, says the song may be there and removes nothing', async () => {
    serveLostInsert(ok(null));
    const user = renderPanel();
    await user.upload(picker(), gpFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't upload groove.gp. The server couldn't be reached. Check the connection and try again. The song may have been added anyway: reload the library to see.",
    );
    expect(storageMethods()).toEqual(['upload']);
    expect(picker()).toBeEnabled();
  });
});

describe('UploadPanel offline', () => {
  it('turns the picker off, says why, and refuses a dropped file', async () => {
    serve({});
    renderPanel();
    act(() => onlineManager.setOnline(false));
    expect(picker()).toBeDisabled();
    expect(screen.getByTestId('offline-note')).toHaveTextContent(
      "You're offline. Songs can be uploaded once you're back online.",
    );

    // The drop zone is a second way in, and must ask the same question.
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [gpFile()] } });
    await settle();
    expect(storageMethods()).toEqual([]);
    expect(queryResult).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(picker()).toBeEnabled();
    expect(screen.queryByTestId('offline-note')).not.toBeInTheDocument();
    // The same drop, online, does upload: the one above was heard and refused.
    fireEvent.drop(screen.getByTestId('drop-zone'), { dataTransfer: { files: [gpFile()] } });
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
  });
});

describe('UploadPanel once the library has songs (compact)', () => {
  function renderCompact() {
    renderRoutes(
      <Route
        path="/library"
        element={
          <UploadPanel compact>
            <ul aria-label="Songs">
              <li>Groove</li>
            </ul>
          </UploadPanel>
        }
      />,
      { path: '/library' },
    );
    return userEvent.setup();
  }

  it('is an Upload button with the same name, and no drop box', () => {
    renderCompact();
    const label = picker().closest('label');
    expect(label).toHaveTextContent(/^Upload a Guitar Pro file$/);
    // "Upload" on screen; the rest is for screen readers.
    expect(label?.querySelector('.sr-only')).toHaveTextContent('a Guitar Pro file');
    expect(screen.queryByText(/or drop one here/)).not.toBeInTheDocument();
    expect(screen.getByText(/drop a Guitar Pro file anywhere here/)).toBeInTheDocument();
  });

  it('takes a file dropped anywhere over the library, the list included', async () => {
    serve({});
    renderCompact();
    const zone = screen.getByTestId('drop-zone');
    expect(zone).toContainElement(screen.getByRole('list', { name: 'Songs' }));
    fireEvent.drop(screen.getByRole('list', { name: 'Songs' }), {
      dataTransfer: { files: [gpFile('dropped.gp')] },
    });
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
  });

  it('outlines the library while a file is dragged over it, and not after it leaves', () => {
    renderCompact();
    const zone = screen.getByTestId('drop-zone');
    fireEvent.dragOver(screen.getByRole('list', { name: 'Songs' }));
    expect(screen.getByText('Drop the file to upload it')).toBeInTheDocument();
    dragLeaveTo(zone, screen.getByRole('list', { name: 'Songs' }));
    expect(screen.getByText('Drop the file to upload it')).toBeInTheDocument();
    dragLeaveTo(zone, document.body);
    expect(screen.queryByText('Drop the file to upload it')).not.toBeInTheDocument();
  });

  it('uploads from the picker as the drop box does', async () => {
    serve({});
    const user = renderCompact();
    await user.upload(picker(), gpFile());
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
  });

  // 12 UX pass, Test: the list is a second way in, and asks what the button asks.
  it('offline, a file dragged over the list draws no outline and a drop on it uploads nothing', async () => {
    serve({});
    renderCompact();
    act(() => onlineManager.setOnline(false));
    expect(picker()).toBeDisabled();
    const list = screen.getByRole('list', { name: 'Songs' });
    fireEvent.dragOver(list);
    expect(screen.queryByText('Drop the file to upload it')).not.toBeInTheDocument();
    fireEvent.drop(list, { dataTransfer: { files: [gpFile()] } });
    await settle();
    expect(storageMethods()).toEqual([]);
    expect(queryResult).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    fireEvent.drop(list, { dataTransfer: { files: [gpFile()] } });
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
  });

  it('while an upload runs, the list takes no drop and draws no outline', async () => {
    const upload = deferred();
    storageResult.mockReturnValueOnce(upload.promise);
    serve({});
    const user = renderCompact();
    await user.upload(picker(), gpFile('first.gp'));
    expect(await screen.findByText('Uploading first.gp…')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Songs' });
    fireEvent.dragOver(list);
    expect(screen.queryByText('Drop the file to upload it')).not.toBeInTheDocument();
    fireEvent.drop(list, { dataTransfer: { files: [gpFile('second.gp')] } });
    expect(screen.getByText('Uploading first.gp…')).toBeInTheDocument();

    upload.resolve(ok({}));
    expect(await screen.findByText('Added “Groove”.')).toBeInTheDocument();
    expect(storageMethods()).toEqual(['upload']);
    expect(inserts()).toHaveLength(1);
  });

  it('a drop clears the outline, and several files dropped on the list are refused', async () => {
    serve({});
    renderCompact();
    const list = screen.getByRole('list', { name: 'Songs' });
    fireEvent.dragOver(list);
    fireEvent.drop(list, { dataTransfer: { files: [gpFile('a.gp'), gpFile('b.gp')] } });
    expect(screen.queryByText('Drop the file to upload it')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Drop one file at a time.');
    await settle();
    expect(storageResult).not.toHaveBeenCalled();
  });
});

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { songFilePath } from '@/lib/schema';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { renderRoutes, settle } from '@/test/render';
import type { LibrarySong } from './songForm';
import { SongListItem } from './SongListItem';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const song: LibrarySong = {
  id: 'song-1',
  title: 'Groove',
  artist: 'Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 0,
  created_at: '2026-11-20T12:00:00Z',
  last_practiced_at: null,
};
const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });

function renderItem(item: LibrarySong = song) {
  renderRoutes(
    <Route
      path="/library"
      element={
        <ul>
          <SongListItem song={item} />
        </ul>
      }
    />,
    { path: '/library' },
  );
  return userEvent.setup();
}

/** The update payloads sent, in order. */
const updates = () =>
  queryResult.mock.calls.map(([call]) => opArgs(call, 'update')?.[0]).filter(Boolean);
const deletes = () => queryResult.mock.calls.filter(([call]) => opArgs(call, 'delete'));
const day = (timestamp: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(timestamp));

beforeEach(resetFakeSupabase);

describe('SongListItem summary', () => {
  it('shows title, artist, bars, BPM, added date and that it is unpractised', () => {
    renderItem();
    expect(screen.getByRole('link', { name: 'Groove' })).toHaveAttribute('href', '/songs/song-1');
    expect(screen.getByText('Band')).toBeInTheDocument();
    expect(
      screen.getByText(`16 bars · 120 BPM · added ${day(song.created_at)} · not practiced yet`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No drum track found/)).not.toBeInTheDocument();
  });

  it('shows a fractional tempo, the last practice date and the no-drum-track note', () => {
    renderItem({
      ...song,
      artist: '',
      original_tempo: 92.5,
      drum_track_index: null,
      last_practiced_at: '2026-11-21T12:00:00Z',
    });
    expect(screen.getByText(/92\.5 BPM/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`practiced ${day('2026-11-21T12:00:00Z')}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(/No drum track found in this file/)).toBeInTheDocument();
  });
});

describe('SongListItem editing', () => {
  it('sends only the changed field, trimmed, and closes the form', async () => {
    queryResult.mockImplementation(async (call) =>
      ok({ ...song, ...(opArgs(call, 'update')?.[0] as object) }),
    );
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    const title = screen.getByLabelText('Title');
    expect(title).toHaveValue('Groove');
    expect(screen.getByLabelText('Artist')).toHaveValue('Band');

    await user.clear(title);
    await user.type(title, '  Back Beat  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('Title')).not.toBeInTheDocument());
    expect(updates()).toEqual([{ title: 'Back Beat' }]);
    const call = queryResult.mock.calls[0]![0];
    expect(call.ops.filter((op) => op.method === 'eq').map((op) => op.args)).toEqual([
      ['id', 'song-1'],
      ['user_id', 'user-1'],
    ]);
  });

  it('refuses a blank title without sending anything', async () => {
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Give the song a title.')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Give the song a title.');
    expect(screen.getByLabelText('Artist')).not.toHaveAccessibleDescription();
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('allows clearing the artist', async () => {
    queryResult.mockResolvedValue(ok({ ...song, artist: '' }));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.clear(screen.getByLabelText('Artist'));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updates()).toEqual([{ artist: '' }]));
  });

  it('closes without a request when nothing changed, and Cancel discards the draft', async () => {
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.type(screen.getByLabelText('Title'), ' edited');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Groove');
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('keeps the form open with an error when the save fails', async () => {
    queryResult.mockResolvedValue(fail('offline'));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.type(screen.getByLabelText('Artist'), 's');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the song. Something went wrong. Try again.",
    );
    expect(screen.getByLabelText('Artist')).toHaveValue('Bands');
  });
});

describe('SongListItem while a save is pending', () => {
  it('locks the form so it keeps showing that save, then its error', async () => {
    let answer!: (result: FakeResult) => void;
    queryResult.mockReturnValueOnce(new Promise<FakeResult>((resolve) => (answer = resolve)));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.type(screen.getByLabelText('Artist'), 's');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const artist = screen.getByLabelText('Artist');
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(artist).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Title')).toHaveAttribute('readonly');

    // Typing and Enter change nothing and send nothing more.
    await user.type(artist, 'x{Enter}');
    expect(artist).toHaveValue('Bands');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
    expect(updates()).toEqual([{ artist: 'Bands' }]);

    answer(fail('offline'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the song. Something went wrong. Try again.",
    );
    expect(artist).not.toHaveAttribute('readonly');
    expect(artist).toHaveValue('Bands');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

describe('SongListItem deleting', () => {
  it('asks first, and "Keep it" deletes nothing', async () => {
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Delete Groove' }));
    const confirm = screen.getByRole('group', { name: 'Delete Groove' });
    expect(confirm).toHaveTextContent(
      'Delete “Groove”? Its loops and practice history are deleted too.',
    );
    await user.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(storageResult).not.toHaveBeenCalled();
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('removes the file, then the row', async () => {
    queryResult.mockResolvedValue(ok(null));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Delete Groove' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));

    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(storageResult.mock.calls.map(([call]) => call)).toEqual([
      { bucket: 'gp-files', method: 'remove', args: [[songFilePath('user-1', 'song-1')]] },
    ]);
    const [[rowDelete]] = deletes() as [[Parameters<typeof opArgs>[0]]];
    expect(rowDelete.table).toBe('songs');
  });

  it('shows a failed delete and keeps the row when the file can’t be removed', async () => {
    storageResult.mockResolvedValueOnce(fail('storage down'));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Delete Groove' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't delete the song. Something went wrong. Try again.",
    );
    expect(deletes()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Delete song' })).toBeEnabled();
  });
});

// Bug hunt S4: each of these controls replaces itself, and focus fell to <body>.
describe('SongListItem focus as its controls replace one another', () => {
  const form = () => screen.getByLabelText('Title').closest('form');

  it('Edit hands focus to the form, and Cancel back to Edit', async () => {
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await waitFor(() => expect(form()).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Groove' })).toHaveFocus());
  });

  it('a saved edit hands focus back to Edit', async () => {
    queryResult.mockImplementation(async (call) =>
      ok({ ...song, ...(opArgs(call, 'update')?.[0] as object) }),
    );
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.type(screen.getByLabelText('Title'), ' two');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    // The item's song is a fixed prop here, so its name stays "Groove".
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Groove' })).toHaveFocus());
  });

  it('Delete hands focus to the question, and "Keep it" back to Delete', async () => {
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Delete Groove' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Delete Groove' })).toHaveFocus());

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete Groove' })).toHaveFocus(),
    );
  });
});

describe('SongListItem offline', () => {
  it('keeps an edit on screen but saves nothing until back online', async () => {
    queryResult.mockImplementation(async (call) =>
      ok({ ...song, ...(opArgs(call, 'update')?.[0] as object) }),
    );
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Edit Groove' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Back Beat');
    act(() => onlineManager.setOnline(false));

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(screen.getByTestId('offline-note')).toHaveTextContent(
      "You're offline. Changes can be saved once you're back online.",
    );
    fireEvent.submit(save.closest('form')!);
    await settle();
    expect(updates()).toEqual([]);
    expect(screen.getByLabelText('Title')).toHaveValue('Back Beat');

    act(() => onlineManager.setOnline(true));
    await user.click(save);
    await waitFor(() => expect(updates()).toEqual([{ title: 'Back Beat' }]));
  });

  it('turns "Delete song" off with a reason while offline', async () => {
    queryResult.mockResolvedValue(ok(null));
    const user = renderItem();
    await user.click(screen.getByRole('button', { name: 'Delete Groove' }));
    act(() => onlineManager.setOnline(false));
    const remove = screen.getByRole('button', { name: 'Delete song' });
    expect(remove).toBeDisabled();
    expect(screen.getByTestId('offline-note')).toHaveTextContent(
      "You're offline. Songs can be deleted once you're back online.",
    );
    fireEvent.click(remove);
    // And a press that comes before the button is drawn off reaches the handler, which refuses.
    act(() => onlineManager.setOnline(true));
    act(() => {
      onlineManager.setOnline(false);
      expect(remove).toBeEnabled();
      fireEvent.click(remove);
    });
    await settle();
    expect(storageResult).not.toHaveBeenCalled();
    expect(deletes()).toEqual([]);

    act(() => onlineManager.setOnline(true));
    await user.click(remove);
    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(storageResult).toHaveBeenCalled();
  });
});

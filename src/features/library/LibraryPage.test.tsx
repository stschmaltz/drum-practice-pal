import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { restoredCacheIsStale } from '@/features/offline/queryPersister';
import { Route } from 'react-router';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
} from '@/test/fakeSupabase';
import { renderRoutes, settle, testQueryClient } from '@/test/render';
import { LibraryPage } from './LibraryPage';
import type { LibrarySong } from './songForm';
import { songKeys } from './useSongs';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

// Real parsing is covered by parseScore.test.ts; an upload here only needs to get under way.
vi.mock('./parseScore', () => ({
  parseScore: () => ({
    ok: true,
    metadata: { title: 'New', artist: '', originalTempo: 120, barCount: 16, drumTrackIndex: 0 },
  }),
}));

const song = (id: string, overrides: Partial<LibrarySong>): LibrarySong => ({
  id,
  title: id,
  artist: '',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 0,
  created_at: '2026-11-01T00:00:00Z',
  last_practiced_at: null,
  ...overrides,
});

// Added oldest to newest: Halo, Waltz, Fill. Practiced most recently: Halo, then Waltz.
const library = [
  song('halo', {
    title: 'Halo',
    artist: 'Beyoncé',
    created_at: '2026-11-01T00:00:00Z',
    last_practiced_at: '2026-11-21T00:00:00Z',
  }),
  song('waltz', {
    title: 'Waltz 3-4',
    artist: 'Fixture',
    created_at: '2026-11-02T00:00:00Z',
    last_practiced_at: '2026-11-10T00:00:00Z',
  }),
  song('fill', { title: 'Chorus Fill', artist: 'Fixture', created_at: '2026-11-03T00:00:00Z' }),
];

const listRows = (songs: LibrarySong[]) =>
  songs.map(({ last_practiced_at, ...rest }) => ({
    ...rest,
    loops: last_practiced_at ? [{ last_practiced_at }] : [],
  }));

/** Serves the list for every read; updates and deletes change what later reads see. */
function serveLibrary(songs: LibrarySong[]) {
  let current = songs;
  queryResult.mockImplementation(async (call): Promise<FakeResult> => {
    // The mastery rings' loops and the streak's sessions: none.
    if (call.table === 'loops' || call.table === 'practice_sessions') {
      return { data: [], error: null };
    }
    const id = call.ops.find((op) => op.method === 'eq' && op.args[0] === 'id')?.args[1];
    if (opArgs(call, 'delete')) {
      current = current.filter((s) => s.id !== id);
      return { data: null, error: null };
    }
    const changes = opArgs(call, 'update')?.[0] as Partial<LibrarySong> | undefined;
    if (changes) {
      current = current.map((s) => (s.id === id ? { ...s, ...changes } : s));
      return { data: current.find((s) => s.id === id), error: null };
    }
    return { data: listRows(current), error: null };
  });
}

function renderLibrary(path = '/library') {
  const view = renderRoutes(<Route path="/library" element={<LibraryPage />} />, { path });
  return { ...view, user: userEvent.setup() };
}

const shownTitles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((link) => link.textContent);
const location = () => screen.getByTestId('location').textContent;

beforeEach(resetFakeSupabase);

describe('LibraryPage', () => {
  it('shows a loading message, then the songs, most recently practiced first', async () => {
    serveLibrary(library);
    renderLibrary();
    expect(screen.getByText('Loading your songs…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Your songs (3)' })).toBeInTheDocument();
    expect(shownTitles()).toEqual(['Halo', 'Waltz 3-4', 'Chorus Fill']);
    expect(screen.getByLabelText('Sort by')).toHaveValue('practiced');
  });

  it('invites an upload when the library is empty', async () => {
    serveLibrary([]);
    renderLibrary();
    expect(
      await screen.findByText('No songs yet. Upload a Guitar Pro file to start your library.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Upload a Guitar Pro file')).toBeInTheDocument();
  });

  it('shows a load error with a retry that recovers', async () => {
    serveLibrary(library);
    const serve = queryResult.getMockImplementation();
    let songsFailed = false;
    queryResult.mockImplementation(async (call) => {
      if (call.table !== 'songs' || songsFailed) return serve!(call);
      songsFailed = true;
      return { data: null, error: { message: 'network down' } };
    });
    const { user } = renderLibrary();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your songs. Something went wrong. Try again.",
    );
    serveLibrary(library);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Your songs (3)' })).toBeInTheDocument();
  });

  it('sorts by recently added, keeping the choice in the URL', async () => {
    serveLibrary(library);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'added');
    expect(shownTitles()).toEqual(['Chorus Fill', 'Waltz 3-4', 'Halo']);
    expect(location()).toBe('/library?sort=added');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'practiced');
    expect(shownTitles()).toEqual(['Halo', 'Waltz 3-4', 'Chorus Fill']);
    expect(location()).toBe('/library');
  });

  it('searches title or artist, ignoring case and accents, and keeps the query in the URL', async () => {
    serveLibrary(library);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    const search = screen.getByLabelText('Search title or artist');

    await user.type(search, 'BEYONCE');
    expect(shownTitles()).toEqual(['Halo']);
    expect(location()).toBe('/library?q=BEYONCE');

    await user.clear(search);
    await user.type(search, 'fixture fill');
    expect(shownTitles()).toEqual(['Chorus Fill']);

    await user.clear(search);
    expect(shownTitles()).toHaveLength(3);
    expect(location()).toBe('/library');
  });

  it('restores search and sort from the URL', async () => {
    serveLibrary(library);
    renderLibrary('/library?q=fixture&sort=added');
    await screen.findByRole('list');
    expect(screen.getByLabelText('Search title or artist')).toHaveValue('fixture');
    expect(screen.getByLabelText('Sort by')).toHaveValue('added');
    expect(shownTitles()).toEqual(['Chorus Fill', 'Waltz 3-4']);
  });

  it('falls back to recently practiced for an unknown sort', async () => {
    serveLibrary(library);
    renderLibrary('/library?sort=bogus');
    await screen.findByRole('list');
    expect(screen.getByLabelText('Sort by')).toHaveValue('practiced');
    expect(shownTitles()).toEqual(['Halo', 'Waltz 3-4', 'Chorus Fill']);
  });

  it("says nothing matched without echoing the URL's query", async () => {
    serveLibrary(library);
    renderLibrary('/library?q=%3Cscript%3Exyz');
    expect(await screen.findByText('No songs match your search.')).toBeInTheDocument();
    // The test router's hidden location readout holds the URL, so skip it.
    expect(screen.queryByText(/xyz/, { ignore: 'output' })).not.toBeInTheDocument();
  });

  it('shows an edit in the list straight away', async () => {
    serveLibrary(library);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Edit Chorus Fill' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Intro Fill');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(shownTitles()).toEqual(['Halo', 'Waltz 3-4', 'Intro Fill']));
  });

  it('keeps a song renamed out of the search open in its editor until the save succeeds', async () => {
    serveLibrary(library);
    const serve = queryResult.getMockImplementation()!;
    let failSave!: () => void;
    const firstSave = new Promise<FakeResult>(
      (resolve) => (failSave = () => resolve({ data: null, error: { message: 'offline' } })),
    );
    let saves = 0;
    queryResult.mockImplementation((call) =>
      opArgs(call, 'update') && saves++ === 0 ? firstSave : serve(call),
    );
    const { user, queryClient } = renderLibrary('/library?q=fill');
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Edit Chorus Fill' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Intro Groove');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The optimistic rename no longer matches "fill", but the editor stays.
    await waitFor(() =>
      expect(
        queryClient.getQueryData<LibrarySong[]>(songKeys.forUser('user-1'))?.map((s) => s.title),
      ).toContain('Intro Groove'),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0))); // let observers render it
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
    expect(screen.queryByText('No songs match your search.')).not.toBeInTheDocument();

    failSave();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the song. Something went wrong. Try again.",
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Intro Groove');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    // Saved: the form closes and the song drops out of the "fill" results.
    expect(await screen.findByText('No songs match your search.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search title or artist'));
    expect(shownTitles()).toContain('Intro Groove');
  });

  it('drops a deleted song from the list', async () => {
    serveLibrary(library);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));
    await waitFor(() => expect(shownTitles()).toEqual(['Waltz 3-4', 'Chorus Fill']));
  });

  it('hands focus to the next song’s Delete once a song is deleted (bug hunt S4)', async () => {
    serveLibrary(library);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    const before = shownTitles();
    const index = before.indexOf('Halo');
    const next = before[index + 1] ?? before[index - 1];
    await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));
    await waitFor(() => expect(shownTitles()).not.toContain('Halo'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Delete ${next}` })).toHaveFocus(),
    );
  });

  it('hands focus to the upload once the last song is deleted', async () => {
    serveLibrary([library[0]!]);
    const { user } = renderLibrary();
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));
    expect(await screen.findByText(/No songs yet/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Upload a Guitar Pro file')).toHaveFocus());
  });

  // Unit 13 Test: the hand-over waits for the song to leave; a refused delete keeps it, and focus.
  it('a failed delete of the last song leaves focus on Delete song, and its retry hands it to the upload', async () => {
    serveLibrary([library[0]!]);
    storageResult.mockResolvedValueOnce({ data: null, error: { message: 'storage down' } });
    const { user } = renderLibrary();
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
    const confirm = screen.getByRole('button', { name: 'Delete song' });
    await user.click(confirm);

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete the song.");
    await settle();
    expect(shownTitles()).toEqual(['Halo']);
    expect(confirm).toHaveFocus();

    await user.click(confirm);
    expect(await screen.findByText(/No songs yet/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Upload a Guitar Pro file')).toHaveFocus());
  });

  // Copilot review: with the upload off, its file input can't take focus, and
  // the hand-over was used up on it, leaving focus on <body>.
  describe('the last song deleted while the upload is off', () => {
    const uploadSection = () => screen.getByRole('region', { name: 'Add a song' });

    it('hands focus to the upload section when the connection went meanwhile', async () => {
      serveLibrary([library[0]!]);
      let removeFile!: () => void;
      storageResult.mockImplementationOnce(
        () => new Promise((resolve) => (removeFile = () => resolve({ data: {}, error: null }))),
      );
      const { user } = renderLibrary();
      await screen.findByRole('list');
      await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
      await user.click(screen.getByRole('button', { name: 'Delete song' }));
      await waitFor(() => expect(removeFile).toBeDefined());

      act(() => onlineManager.setOnline(false));
      await act(async () => removeFile());

      expect(await screen.findByText(/No songs yet/)).toBeInTheDocument();
      expect(screen.getByLabelText('Upload a Guitar Pro file')).toBeDisabled();
      await waitFor(() => expect(uploadSection()).toHaveFocus());
    });

    it('hands focus to the upload section while an upload is under way', async () => {
      serveLibrary([library[0]!]);
      const answerLibrary = queryResult.getMockImplementation()!;
      queryResult.mockImplementation(async (call) =>
        call.ops.some((op) => op.method === 'eq' && op.args[0] === 'file_hash')
          ? { data: null, error: null }
          : answerLibrary(call),
      );
      // The file's upload never answers, so the upload stays pending.
      storageResult.mockImplementation(async (call) =>
        call.method === 'upload' ? new Promise<FakeResult>(() => {}) : { data: {}, error: null },
      );
      const { user } = renderLibrary();
      await screen.findByRole('list');
      await user.upload(
        screen.getByLabelText('Upload a Guitar Pro file'),
        new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2])], 'new.gp'),
      );
      expect(await screen.findByText('Uploading new.gp…')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
      await user.click(screen.getByRole('button', { name: 'Delete song' }));

      expect(await screen.findByText(/No songs yet/)).toBeInTheDocument();
      expect(screen.getByLabelText('Upload a Guitar Pro file')).toBeDisabled();
      await waitFor(() => expect(uploadSection()).toHaveFocus());
    });
  });

  it('hands focus to the search when the deleted song was the only one it showed', async () => {
    serveLibrary(library);
    const { user } = renderLibrary('/library?q=halo');
    await screen.findByRole('list');
    await user.click(screen.getByRole('button', { name: 'Delete Halo' }));
    await user.click(screen.getByRole('button', { name: 'Delete song' }));
    expect(await screen.findByText('No songs match your search.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Search title or artist')).toHaveFocus());
  });

  describe('focus after a rename that leaves the search (Copilot review)', () => {
    const rename = async (path: string, from: string, to: string) => {
      serveLibrary(library);
      const { user } = renderLibrary(path);
      await screen.findByRole('list');
      await user.click(screen.getByRole('button', { name: `Edit ${from}` }));
      const title = screen.getByLabelText('Title');
      await user.clear(title);
      await user.type(title, to);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      return user;
    };

    // 13 Review: the hand-over lives in LibraryPage, which a Cancel alone doesn't re-render.
    it('Cancel hands focus back to the song’s Edit, with nothing saved', async () => {
      serveLibrary(library);
      const { user } = renderLibrary();
      await screen.findByRole('list');
      await user.click(screen.getByRole('button', { name: 'Edit Halo' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Halo' })).toHaveFocus());
    });

    it('goes to the search field when no song is left on show', async () => {
      await rename('/library?q=fill', 'Chorus Fill', 'Intro Groove');
      expect(await screen.findByText('No songs match your search.')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Search title or artist')).toHaveFocus());
    });

    it('goes to the next song’s Edit when others are still on show', async () => {
      // "fixture" matches Waltz and Chorus Fill; renaming Waltz's artist drops it.
      serveLibrary(library);
      const { user } = renderLibrary('/library?q=fixture');
      await screen.findByRole('list');
      const before = shownTitles();
      const index = before.indexOf('Waltz 3-4');
      const next = before[index + 1] ?? before[index - 1];
      await user.click(screen.getByRole('button', { name: 'Edit Waltz 3-4' }));
      const artist = screen.getByLabelText('Artist');
      await user.clear(artist);
      await user.type(artist, 'Someone');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(shownTitles()).not.toContain('Waltz 3-4'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: `Edit ${next}` })).toHaveFocus(),
      );
    });

    it('stays on the song’s own Edit when it still matches', async () => {
      await rename('/library?q=fill', 'Chorus Fill', 'Chorus Fill 2');
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit Chorus Fill 2' })).toHaveFocus(),
      );
    });
  });
});

describe('LibraryPage offline (Unit 11)', () => {
  it('says why, rather than loading for ever, when the library was never read on this device', async () => {
    serveLibrary(library);
    act(() => onlineManager.setOnline(false));
    renderLibrary();
    expect(await screen.findByText(/library hasn't been opened on this device yet/)).toBeVisible();
    expect(screen.queryByText('Loading your songs…')).not.toBeInTheDocument();
    expect(queryResult).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole('heading', { name: 'Your songs (3)' })).toBeInTheDocument();
  });

  it('keeps showing a library read before, offline', async () => {
    serveLibrary(library);
    const queryClient = testQueryClient();
    queryClient.setQueryData(songKeys.forUser('user-1'), library);
    restoredCacheIsStale(queryClient);
    act(() => onlineManager.setOnline(false));
    renderRoutes(<Route path="/library" element={<LibraryPage />} />, {
      path: '/library',
      queryClient,
    });
    expect(await screen.findByRole('heading', { name: 'Your songs (3)' })).toBeInTheDocument();
    await settle();
    expect(queryResult).not.toHaveBeenCalled();
  });
});

describe('LibraryPage layout (12 UX pass)', () => {
  it('has the big drop box while empty, and a compact Upload once there are songs', async () => {
    serveLibrary([]);
    const view = renderLibrary();
    await screen.findByText(/No songs yet/);
    expect(screen.getByText(/or drop one here/)).toBeInTheDocument();
    view.unmount();

    serveLibrary(library);
    renderLibrary();
    await screen.findByRole('heading', { name: 'Your songs (3)' });
    expect(screen.queryByText(/or drop one here/)).not.toBeInTheDocument();
    // The whole library takes a dropped file now, the list included.
    expect(screen.getByTestId('drop-zone')).toContainElement(screen.getByRole('list'));
    expect(screen.getByLabelText('Upload a Guitar Pro file')).toBeInTheDocument();
  });

  it('opens a song from anywhere on its card: one link stretched over it, with Edit and Delete apart from it', async () => {
    serveLibrary(library);
    renderLibrary();
    await screen.findByRole('heading', { name: 'Your songs (3)' });
    const card = screen.getAllByRole('listitem')[0] as HTMLElement;
    const links = within(card).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Halo');
    // Stretched by its ::after over the card, which is the positioned box.
    expect(card).toHaveClass('relative');
    expect(links[0]?.className).toMatch(/after:absolute/);
    expect(links[0]?.className).toMatch(/after:inset-0/);
    // Not nested: the buttons are siblings of the link, raised above its stretched area.
    for (const name of ['Edit Halo', 'Delete Halo']) {
      const button = within(card).getByRole('button', { name });
      expect(links[0]).not.toContainElement(button);
      expect(button.parentElement).toHaveClass('relative', 'z-10');
    }
  });

  it('lays the songs out as plain rows between dividers (Unit 14), not cards', async () => {
    serveLibrary(library);
    renderLibrary();
    await screen.findByRole('heading', { name: 'Your songs (3)' });
    expect(screen.getByRole('list')).toHaveClass('divide-y', 'divide-line');
    expect(screen.getByRole('list')).not.toHaveClass('grid');
  });
});

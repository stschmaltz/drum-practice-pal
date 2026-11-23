import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import { renderRoutes } from '@/test/render';
import { LibraryPage } from './LibraryPage';
import type { LibrarySong } from './songForm';
import { songKeys } from './useSongs';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

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
    queryResult.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    const { user } = renderLibrary();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your songs: network down",
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
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save the song: offline");
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
});

import {
  act,
  cleanup,
  configure,
  fireEvent,
  getConfig,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import userEvent from '@testing-library/user-event';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { Link, Outlet, Route } from 'react-router';
import type { LibrarySong, Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import type { Loop } from '@/features/loops/loopForm';
import { offlineDb } from '@/features/offline/offlineDb';
import type { EngineMount } from '@/features/player/playerEngine';
import { COUNT_IN_BARS_LABELS, COUNT_IN_MODE_SHORT_LABELS } from '@/features/player/countInLabels';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import type { SongLinkRow } from '@/features/recordings/songLinkForm';
import { songLinkKeys } from '@/features/recordings/songLinkKeys';
import type { Settings } from '@/features/settings/settingsForm';
import { songFilePath } from '@/lib/schema';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
  type StorageCall,
} from '@/test/fakeSupabase';
import {
  barsInPlayOrder,
  FakePlayerEngine,
  startOfBar,
  straightBars,
  TEMPO_CHANGE_BAR_TEMPOS,
  TICKS_PER_BAR,
} from '@/test/fakePlayerEngine';
import {
  chooseIn,
  chosenCountIn,
  chosenCountInMode,
  countInGroup,
  countInModeGroup,
} from '@/test/countInControls';
import {
  EMBED_URL,
  linkRow,
  linkTable,
  playedWrites,
  spotifyLink,
  videoLink,
  WATCH_URL,
  type LinkTable,
} from '@/test/linkTable';
import {
  currentRecordingPlayer,
  recordingPlayers,
  resetRecordingPlayers,
} from '@/test/fakeRecordingPlayer';
import { expectLocked, expectUnlocked } from '@/test/locked';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import {
  historyBack,
  historyForward,
  renderRoutes,
  RouteMarker,
  settle,
  testQueryClient,
} from '@/test/render';
import { readVisitSittings } from '@/features/practice/visitSittings';
import { SongPage } from './SongPage';
import { FRESH_READ_WAIT_MS } from './useGaveUpWaiting';

/** Unfolds the controls bar, which folds to a strip while playback runs. */
async function showControls(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Show controls' }));
}

/** A loop's Edit or Delete, which live in its "More" menu with History. */
async function chooseFromMenu(
  user: ReturnType<typeof userEvent.setup>,
  panel: ReturnType<typeof within>,
  loopName: string,
  action: 'Edit' | 'Delete',
) {
  await user.click(panel.getByRole('button', { name: `More actions for ${loopName}` }));
  await user.click(panel.getByRole('menuitem', { name: action }));
}

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);
// The video's player (Unit 19): the real one asks YouTube for its script.
vi.mock(
  '@/features/recordings/youTubePlayer',
  async () => (await import('@/test/fakeRecordingPlayer')).fakeYouTubePlayerModule,
);

// usePlayer's default factory imports this lazily; each mount gets a new fake engine.
const engines: FakePlayerEngine[] = [];
let prepareEngine: (engine: FakePlayerEngine) => void = () => {};
vi.mock('@/features/player/alphaTabEngine', () => ({
  createAlphaTabEngine: (mount: EngineMount) => {
    const engine = new FakePlayerEngine();
    engine.mount = mount;
    prepareEngine(engine);
    engines.push(engine);
    return engine;
  },
}));

const USER = 'user-1';
const SONG_A = '11111111-1111-4111-8111-111111111111';
const SONG_B = '22222222-2222-4222-8222-222222222222';

const songRow = (id: string, overrides: Partial<Song> = {}): Song => ({
  id,
  title: id === SONG_A ? 'Groove 120' : 'Tempo Change',
  artist: 'Fixture Band',
  original_tempo: 120,
  bar_count: 16,
  drum_track_index: 1,
  created_at: '2026-11-20T12:00:00Z',
  ...overrides,
});

const settingsRow: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  metronome_sound: 'click',
  metronome_accent: true,
  metronome_accent_sound: 'click',
  metronome_subdivision: 1,
  drums_muted_default: false,
};

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });
const fileBytes = (id: string) => (id === SONG_A ? [1, 2, 3] : [4, 5]);

/** A saved loop of song A. */
const loopOfSongA = (id: string, overrides: Partial<Loop> = {}): Loop =>
  loopRow(id, { song_id: SONG_A, ...overrides });

/** The loops table as the fake client serves it; tests read it to see what was sent. */
let loops: LoopTable = loopTable();
/** The song's links (Unit 14), likewise. */
let links: LinkTable = linkTable();

/**
 * Answers song, settings and loop queries; `songs` maps an id to its row, or
 * null for none, and `loops` are the saved loops to start with.
 */
function serve({
  songs = { [SONG_A]: songRow(SONG_A), [SONG_B]: songRow(SONG_B) } as Record<string, Song | null>,
  settings = ok(settingsRow),
  loops: savedLoops = [],
  links: savedLinks = [],
}: {
  songs?: Record<string, Song | null>;
  settings?: FakeResult;
  loops?: Loop[];
  links?: SongLinkRow[];
} = {}) {
  loops = loopTable(savedLoops);
  links = linkTable(savedLinks);
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'user_settings') return settings;
    if (call.table === 'loops') return loops.answer(call);
    if (call.table === 'song_links') return links.answer(call);
    // "A recording was opened" (Unit 14): the database answers with the time it kept.
    const played = opArgs(call, 'update')?.[0] as { last_played_at?: string } | undefined;
    if (call.table === 'songs' && played?.last_played_at) {
      return ok({ last_played_at: played.last_played_at });
    }
    const id = call.ops.find((op) => op.method === 'eq' && op.args[0] === 'id')?.args[1];
    return ok(songs[id as string] ?? null);
  });
  storageResult.mockImplementation(async ({ method, args }: StorageCall) => {
    if (method !== 'download') return ok({});
    const id = Object.keys(songs).find((songId) => args[0] === songFilePath(USER, songId));
    return id ? ok(new Blob([new Uint8Array(fileBytes(id))])) : fail('Object not found');
  });
}

/** `/songs/<id>/play`, keeping any query: "abc?new=1" is the play page of song "abc" with `?new=1`. */
function playPath(idAndQuery: string): string {
  const [id = '', query] = idAndQuery.split('?');
  return `/songs/${id}/play${query === undefined ? '' : `?${query}`}`;
}

/** The song page inside a layout with nav links, so tests can leave it the way the app does. */
function renderSong(id: string, queryClient?: QueryClient) {
  renderRoutes(
    <Route
      element={
        <>
          <nav>
            <Link to="/library">Library</Link>
            <Link to={`/songs/${SONG_A}/play`}>Song A</Link>
            <Link to={`/songs/${SONG_B}/play`}>Song B</Link>
          </nav>
          <Outlet />
        </>
      }
    >
      <Route path="/songs/:id/play" element={<SongPage />} />
      <Route path="/songs/:id" element={<RouteMarker name="song overview" />} />
      <Route path="/songs/:id/loops/:loopId" element={<RouteMarker name="loop practice" />} />
      <Route path="/library" element={<RouteMarker name="library" />} />
    </Route>,
    { path: playPath(id), queryClient },
  );
  return userEvent.setup();
}

const status = () => screen.getByTestId('player-status');
const playButton = () => screen.getByRole('button', { name: /^(Play|Pause)$/ });
const downloads = () => storageResult.mock.calls.filter(([call]) => call.method === 'download');

/** Waits for the player to mount its engine, then finishes alphaTab's loading. */
async function loadPlayer(
  index = 0,
  { barCount = 16, barTempos }: { barCount?: number; barTempos?: readonly number[] } = {},
) {
  await waitFor(() => expect(engines[index]?.loadScore).toHaveBeenCalled());
  const engine = engines[index]!;
  act(() => engine.finishLoading({ barCount, trackCount: 3, barTempos }));
  await waitFor(() => expect(playButton()).toBeEnabled());
  return engine;
}

// The loop sheet starts closed and "Play loop" closes it, at every size. These tests are
// about the page, not the sheet, so role queries see inside the closed sheet too; the
// tests about the sheet itself assert `aria-expanded` and `toBeVisible`.
const roleQueriesBefore = getConfig().defaultHidden;
beforeAll(() => configure({ defaultHidden: true }));
afterAll(() => configure({ defaultHidden: roleQueriesBefore }));

beforeEach(() => {
  resetFakeSupabase();
  resetRecordingPlayers();
  engines.length = 0;
  prepareEngine = () => {};
});

describe('SongPage not found and load failures', () => {
  it('shows not found for an id that is not a uuid, without querying', async () => {
    serve();
    renderSong('abc');
    expect(await screen.findByRole('heading', { name: 'Song not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to Songs' })).toHaveAttribute('href', '/');
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('shows not found for a song that is not in the library', async () => {
    serve({ songs: {} });
    renderSong('00000000-0000-4000-8000-000000000000');
    expect(await screen.findByRole('heading', { name: 'Song not found' })).toBeInTheDocument();
    expect(downloads()).toHaveLength(0);
  });

  it('shows loading, then a retryable error when the song cannot be read', async () => {
    serve();
    queryResult.mockResolvedValueOnce(fail('network down'));
    const user = renderSong(SONG_A);
    expect(screen.getByText('Loading song…')).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this song.");
    expect(screen.queryByText(/network down/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
  });

  it('shows a retryable error when the file cannot be downloaded', async () => {
    serve();
    storageResult.mockResolvedValueOnce(fail('Object not found'));
    const user = renderSong(SONG_A);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't download this song's file. Check your connection and try again.",
    );
    expect(engines).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await loadPlayer();
    expect(status()).toHaveTextContent('Bar 1 of 16');
  });
});

describe('SongPage offline', () => {
  it('plays a song opened before from the copy on the device, with no download', async () => {
    serve();
    renderSong(SONG_A);
    await loadPlayer();
    expect(downloads()).toHaveLength(1);

    // A later visit, in a new page: nothing in memory, the file on the device.
    const queryClient = testQueryClient();
    queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
    act(() => onlineManager.setOnline(false));
    cleanup();
    renderSong(SONG_A, queryClient);
    await waitFor(() => expect(engines[1]?.loadScore).toHaveBeenCalled());
    expect(Array.from(engines[1]!.loadScore.mock.calls[0]![0])).toEqual(fileBytes(SONG_A));
    expect(downloads()).toHaveLength(1);
  });

  it('keeps playing on the defaults when settings never cached come in on reconnect', async () => {
    serve();
    // A song row and file on the device, but no settings cached: offline, the player
    // starts on the defaults rather than waiting for them.
    const queryClient = testQueryClient();
    queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
    await offlineDb.songFiles.put({
      userId: USER,
      songId: SONG_A,
      bytes: new Uint8Array(fileBytes(SONG_A)),
    });
    let answerSettings!: (result: FakeResult) => void;
    const settingsAnswer = new Promise<FakeResult>((resolve) => (answerSettings = resolve));
    const answer = queryResult.getMockImplementation()!;
    queryResult.mockImplementation((call) =>
      call.table === 'user_settings' ? settingsAnswer : answer(call),
    );
    act(() => onlineManager.setOnline(false));
    const user = renderSong(SONG_A, queryClient);
    await loadPlayer();
    await user.click(playButton());
    act(() => engines[0]!.fire('stateChanged', { playing: true }));
    expect(playButton()).toHaveAccessibleName('Pause');

    // Back online: the settings read goes out (pending, fetching), then lands.
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(queryResult.mock.calls.some(([call]) => call.table === 'user_settings')).toBe(true),
    );
    await settle();
    expect(engines).toHaveLength(1);
    expect(playButton()).toHaveAccessibleName('Pause');
    await act(async () => answerSettings(ok(settingsRow)));
    await settle();
    expect(engines).toHaveLength(1);
    expect(engines[0]!.destroy).not.toHaveBeenCalled();
    expect(playButton()).toHaveAccessibleName('Pause');
  });

  it('says why, rather than loading for ever, for a song never opened on this device', async () => {
    serve();
    act(() => onlineManager.setOnline(false));
    renderSong(SONG_A);
    expect(await screen.findByText(/hasn't been opened on this device yet/)).toBeInTheDocument();
    expect(queryResult).not.toHaveBeenCalled();
  });

  it('says why when the row is cached but the file never came down', async () => {
    serve();
    storageResult.mockResolvedValue(fail('TypeError: Failed to fetch'));
    // The app's own retries: the first try fails, the retry waits for the connection.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
    queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
    act(() => onlineManager.setOnline(false));
    renderSong(SONG_A, queryClient);
    expect(
      await screen.findByText(/file isn't on this device yet/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(downloads()).toHaveLength(1);
  });
});

describe('SongPage player', () => {
  it('opens the song in the player: header, drum track only, loading then ready', async () => {
    serve();
    renderSong(SONG_A);

    expect(await screen.findByRole('heading', { level: 1, name: 'Groove 120' })).toBeVisible();
    expect(screen.getByText('Fixture Band')).toBeInTheDocument();
    await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
    const engine = engines[0]!;
    expect(engine.loadScore).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), [1]);
    expect(engine.loadSoundFont).toHaveBeenCalledTimes(1);
    expect(engine.mount?.scrollElement).toBe(screen.getByTestId('score-viewport'));
    expect(status()).toHaveTextContent('Loading the score and sounds…');
    expect(playButton()).toBeDisabled();

    act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));

    await waitFor(() => expect(playButton()).toBeEnabled());
    expect(status()).toHaveTextContent('Bar 1 of 16');
  });

  it('renders track 0 and disables drum mute for a song without drums', async () => {
    serve({ songs: { [SONG_A]: songRow(SONG_A, { drum_track_index: null }) } });
    renderSong(SONG_A);
    await loadPlayer();
    expect(engines[0]!.loadScore).toHaveBeenCalledWith(expect.any(Uint8Array), [0]);
    expect(screen.getByRole('button', { name: 'Mute drums' })).toBeDisabled();
  });

  it('starts with the metronome and drum mute from settings, at 100% speed', async () => {
    serve({
      settings: ok({
        ...settingsRow,
        metronome_on: false,
        metronome_volume: 0.4,
        drums_muted_default: true,
      }),
    });
    renderSong(SONG_A);
    const engine = await loadPlayer();

    expect(screen.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('slider', { name: 'Metronome volume' })).toHaveValue('40');
    expect(screen.getByRole('button', { name: 'Mute drums' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('slider', { name: 'Speed' })).toHaveValue('100');
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(1, true);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(1);
  });

  it('falls back to the default options, with a note, when settings cannot be read', async () => {
    serve({ settings: fail('settings down') });
    renderSong(SONG_A);
    const engine = await loadPlayer();

    expect(
      screen.getByText("Couldn't load your settings, so the player is using the defaults."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('slider', { name: 'Metronome volume' })).toHaveValue('80');
    expect(screen.getByRole('button', { name: 'Mute drums' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.8);
  });

  it('follows the playing bar', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));
    act(() => engine.fire('position', { tick: 3840 * 4 + 10 }));

    expect(playButton()).toHaveTextContent('Pause');
    expect(status()).toHaveTextContent('Bar 5 of 16');
  });

  it('changes speed, metronome and mute live without restarting playback', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));
    act(() => engine.fire('position', { tick: 3840 * 2 }));
    const restartsBefore = engine.restartCalls();

    // The metronome is in the folded strip; Mute drums is behind "Show controls".
    await user.click(screen.getByRole('button', { name: 'Metronome' }));
    await showControls(user);
    await user.click(screen.getByRole('button', { name: 'Mute drums' }));

    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(1, true);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
    expect(status()).toHaveTextContent('Bar 3 of 16');
  });

  it('shows fixed copy when the score cannot be shown', async () => {
    serve();
    renderSong(SONG_A);
    const engine = await loadPlayer();

    act(() => engine.fire('error', { error: new Error('alphaTab internals') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(PLAYER_ERROR_MESSAGES.score);
    expect(screen.queryByText(/alphaTab internals/)).not.toBeInTheDocument();
    expect(playButton()).toBeDisabled();
    // No empty white score box under the message.
    expect(screen.getByTestId('score-viewport')).not.toBeVisible();
  });

  it('shows the soundfont copy when the sounds cannot be fetched', async () => {
    prepareEngine = (engine) => {
      engine.soundFont = Promise.reject(new Error('404'));
    };
    serve();
    renderSong(SONG_A);

    expect(await screen.findByRole('alert')).toHaveTextContent(PLAYER_ERROR_MESSAGES.soundFont);
    expect(playButton()).toBeDisabled();
    // The notation still renders and is worth reading.
    expect(screen.getByTestId('score-viewport')).toBeVisible();
  });
});

describe('SongPage disposal on route change', () => {
  it('destroys the player when leaving mid-play, and ignores alphaTab events after', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));

    await user.click(screen.getByRole('link', { name: 'Library' }));

    expect(await screen.findByText('At library')).toBeInTheDocument();
    expect(engine.destroy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Player controls' })).not.toBeInTheDocument();
    // alphaTab's worker can still post after destroy; nothing may throw or render.
    act(() => {
      engine.fire('position', { tick: 3840 * 8 });
      engine.fire('stateChanged', { playing: false });
      engine.fire('error', { error: new Error('late') });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('switching songs disposes the first player and loads the second song fresh', async () => {
    serve();
    const user = renderSong(SONG_A);
    const first = await loadPlayer(0);
    await user.click(playButton());
    act(() => first.fire('stateChanged', { playing: true }));
    await user.click(screen.getByRole('button', { name: 'Metronome' }));

    await user.click(screen.getByRole('link', { name: 'Song B' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Tempo Change' })).toBeVisible();
    await waitFor(() => expect(engines).toHaveLength(2));
    expect(first.destroy).toHaveBeenCalledTimes(1);
    const second = await loadPlayer(1, { barCount: 12 });
    expect(second.loadScore).toHaveBeenCalledWith(new Uint8Array([4, 5]), [1]);
    expect(second.destroy).not.toHaveBeenCalled();
    // The new song starts from the settings, not from the toggles made on the last one.
    expect(screen.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(playButton()).toHaveTextContent('Play');
    expect(status()).toHaveTextContent('Bar 1 of 12');
  });
});

describe('SongPage drums only', () => {
  const drumsOnly = () => screen.getByRole('button', { name: 'Drums only' });
  const muteDrums = () => screen.getByRole('button', { name: 'Mute drums' });

  it('opens off even when drums are muted by default, with only the drum track muted', async () => {
    serve({ settings: ok({ ...settingsRow, drums_muted_default: true }) });
    renderSong(SONG_A);
    const engine = await loadPlayer();

    expect(drumsOnly()).toBeEnabled();
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.setTrackMuted).not.toHaveBeenCalledWith(0, true);
    expect(engine.setTrackMuted).not.toHaveBeenCalledWith(2, true);
  });

  it('plays the drum track alone and back, live, on the song page', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));
    const restartsBefore = engine.restartCalls();

    await showControls(user);
    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    // The song row says the drums are track 1 of the three.
    expect(engine.setTrackMuted).toHaveBeenCalledWith(0, true);
    expect(engine.setTrackMuted).toHaveBeenCalledWith(2, true);
    expect(engine.setTrackMuted).not.toHaveBeenCalledWith(1, true);

    await user.click(drumsOnly());
    expect(engine.setTrackMuted).toHaveBeenCalledWith(0, false);
    expect(engine.setTrackMuted).toHaveBeenCalledWith(2, false);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('is off again on the next song, which is sent no mutes', async () => {
    serve();
    const user = renderSong(SONG_A);
    await loadPlayer(0);
    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('link', { name: 'Song B' }));
    await waitFor(() => expect(engines).toHaveLength(2));
    const second = await loadPlayer(1);

    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
    expect(second.setTrackMuted).not.toHaveBeenCalledWith(expect.any(Number), true);
  });

  it('is off again when the same song is opened a second time', async () => {
    serve();
    const user = renderSong(SONG_A);
    await loadPlayer(0);
    await user.click(drumsOnly());

    await user.click(screen.getByRole('link', { name: 'Library' }));
    await user.click(screen.getByRole('link', { name: 'Song A' }));
    await waitFor(() => expect(engines).toHaveLength(2));
    const second = await loadPlayer(1);

    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(second.setTrackMuted).not.toHaveBeenCalledWith(expect.any(Number), true);
  });

  it('is disabled with the reason for a song without drums, and sends the engine no mutes', async () => {
    serve({ songs: { [SONG_A]: songRow(SONG_A, { drum_track_index: null }) } });
    renderSong(SONG_A);
    const engine = await loadPlayer();

    expect(drumsOnly()).toBeDisabled();
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(drumsOnly()).toHaveAccessibleDescription('This song has no drum track');
    expect(engine.setTrackMuted).not.toHaveBeenCalled();
  });

  it('saves nothing: the toggle is not a setting', async () => {
    serve();
    const user = renderSong(SONG_A);
    await loadPlayer();
    await user.click(drumsOnly());
    await user.click(drumsOnly());

    const writes = queryResult.mock.calls.filter(([call]) =>
      call.ops.some((op) => ['update', 'insert', 'upsert', 'delete'].includes(op.method)),
    );
    expect(writes).toHaveLength(0);
  });
});

describe('SongPage jam mode', () => {
  const speedReadout = () => screen.getByTestId('jam-speed');
  const bpmReadout = () => screen.getByTestId('jam-bpm');

  it('shows speed and the BPM at the current bar, following tempo changes', async () => {
    serve();
    renderSong(SONG_A);
    expect(await screen.findByTestId('jam-bpm')).toHaveTextContent('–');
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    expect(speedReadout()).toHaveTextContent('100%');
    expect(bpmReadout()).toHaveTextContent('120');

    act(() => engine.fire('position', { tick: 8 * TICKS_PER_BAR + 1 }));
    expect(bpmReadout()).toHaveTextContent('90');
    expect(status()).toHaveTextContent('Bar 9 of 16');
  });

  it('recomputes BPM from the speed slider', async () => {
    serve();
    renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    act(() => engine.fire('position', { tick: 8 * TICKS_PER_BAR + 1 }));

    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '75' } });
    expect(speedReadout()).toHaveTextContent('75%');
    expect(bpmReadout()).toHaveTextContent('68'); // 90 x 0.75 = 67.5
  });

  it('seeks to a tapped bar, paused or playing, without restarting', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });

    act(() => engine.fire('barTapped', { barIndex: 11 }));
    expect(engine.seek).toHaveBeenLastCalledWith(11 * TICKS_PER_BAR);
    expect(status()).toHaveTextContent('Bar 12 of 16');
    expect(bpmReadout()).toHaveTextContent('90');

    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));
    const restartsBefore = engine.restartCalls();
    act(() => engine.fire('barTapped', { barIndex: 2 }));
    expect(engine.seek).toHaveBeenLastCalledWith(2 * TICKS_PER_BAR);
    expect(status()).toHaveTextContent('Bar 3 of 16');
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('a tap while the sounds are still loading seeks nowhere: the song can’t play yet', async () => {
    serve();
    renderSong(SONG_A);
    await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
    const engine = engines[0]!;
    act(() => {
      engine.fire('scoreLoaded', {
        barCount: 16,
        trackNames: ['Drums', 'Bass', 'Guitar'],
        barTempos: [],
        barMeters: [],
      });
      engine.fire('ticksReady', { bars: straightBars(16) });
    });

    act(() => engine.fire('barTapped', { barIndex: 11 }));

    expect(engine.seek).not.toHaveBeenCalled();
    expect(status()).not.toHaveTextContent('Bar 12');
  });

  it('opens every song at 100%, whatever speed the last one played at', async () => {
    serve();
    const user = renderSong(SONG_A);
    await loadPlayer(0);
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '200' } });
    expect(speedReadout()).toHaveTextContent('200%');

    await user.click(screen.getByRole('link', { name: 'Song B' }));
    await waitFor(() => expect(engines).toHaveLength(2));
    const second = await loadPlayer(1);
    expect(speedReadout()).toHaveTextContent('100%');
    expect(second.setSpeed).toHaveBeenLastCalledWith(1);
  });

  it('shows BPM for the tapped bar at the current speed, across the tempo change', async () => {
    serve();
    renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '150' } });
    expect(bpmReadout()).toHaveTextContent('180'); // 120 x 1.5 at bar 1

    act(() => engine.fire('barTapped', { barIndex: 8 })); // bar 9, the first at 90
    expect(status()).toHaveTextContent('Bar 9 of 16');
    expect(bpmReadout()).toHaveTextContent('135');
    expect(speedReadout()).toHaveTextContent('150%');

    act(() => engine.fire('barTapped', { barIndex: 7 })); // bar 8, the last at 120
    expect(bpmReadout()).toHaveTextContent('180');
    expect(engine.seek).toHaveBeenLastCalledWith(7 * TICKS_PER_BAR);
  });

  it('ignores a tap from the old song after switching songs', async () => {
    serve();
    const user = renderSong(SONG_A);
    const first = await loadPlayer(0);
    await user.click(screen.getByRole('link', { name: 'Song B' }));
    await waitFor(() => expect(engines).toHaveLength(2));
    const second = await loadPlayer(1);

    act(() => first.fire('barTapped', { barIndex: 5 }));
    expect(first.seek).not.toHaveBeenCalled();
    expect(second.seek).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('Bar 1 of 16');
  });

  it('keeps Play/Pause beside the readout in the sticky bar, not in the controls box', async () => {
    serve();
    renderSong(SONG_A);
    await loadPlayer();
    const bar = screen.getByTestId('jam-bar');
    expect(within(bar).getByRole('button', { name: 'Play' })).toBeEnabled();
    expect(within(bar).getByTestId('jam-bpm')).toBeInTheDocument();
    const controls = screen.getByRole('region', { name: 'Player controls' });
    expect(within(controls).queryByRole('button', { name: /^(Play|Pause)$/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^(Play|Pause)$/ })).toHaveLength(1);
  });

  it('plays and pauses from the keyboard, keeping focus, with Play first in tab order', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    // Tab from the way back to the song: Play/Pause is the page's first control, then Back to start.
    screen.getByRole('link', { name: 'Groove 120' }).focus();
    await user.tab();
    expect(playButton()).toHaveFocus();
    expect(playButton()).toHaveAccessibleName('Play');

    await user.keyboard('{Enter}');
    expect(engine.play).toHaveBeenCalledTimes(1);
    act(() => engine.fire('stateChanged', { playing: true }));
    expect(playButton()).toHaveAccessibleName('Pause');
    // The label changes in place, so a screen reader stays on the same button.
    expect(playButton()).toHaveFocus();

    await user.keyboard(' ');
    expect(engine.pause).toHaveBeenCalledTimes(1);
    act(() => engine.fire('stateChanged', { playing: false }));
    expect(playButton()).toHaveAccessibleName('Play');
    expect(playButton()).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Back to start' })).toHaveFocus();
  });

  describe('bringing the score on screen', () => {
    const scrollIntoView = vi.fn();
    beforeEach(() => {
      scrollIntoView.mockReset();
      // jsdom has no scrollIntoView; the page calls it only when it exists.
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      // @ts-expect-error restoring jsdom's missing method
      delete Element.prototype.scrollIntoView;
    });

    it('scrolls the score box into view once per start, never while playing or paused', async () => {
      serve();
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      act(() => engine.fire('barTapped', { barIndex: 3 }));
      expect(scrollIntoView).not.toHaveBeenCalled();

      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('score-viewport'));
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
      // Clear of the sticky bar (jsdom measures it at 0 px, leaving the gap).
      expect(screen.getByTestId('score-viewport').style.scrollMarginTop).toBe('8px');

      // Bar changes and taps while playing leave the page where the user put it.
      act(() => engine.fire('position', { tick: 6 * TICKS_PER_BAR + 1 }));
      act(() => engine.fire('barTapped', { barIndex: 10 }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: false }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
    });

    // 16 QA issue 1: the overview's "New loop" opens the form and, a render later, the sheet that
    // holds it, whose room at the page's end is what lets the window bring the score above it.
    // A scroll before that went nowhere, and on a phone the sheet covered all of the score.
    const VERSE_ID = '00000000-0000-4000-8000-00000000f00d';
    it.each([
      ['New loop', '?new=1'],
      ['Edit', `?edit=${VERSE_ID}`],
    ])(
      '%s from the overview brings the score on screen once the sheet is open',
      async (_, query) => {
        // A phone: the form is in the bottom sheet, which starts closed. (jsdom has no matchMedia;
        // the panel then goes by the width.)
        vi.stubGlobal('innerWidth', 390);
        try {
          serve({ loops: [loopOfSongA(VERSE_ID, { name: 'Verse', start_bar: 5, end_bar: 8 })] });
          const sheetOpenAtScroll: (string | null | undefined)[] = [];
          scrollIntoView.mockImplementation(() => {
            sheetOpenAtScroll.push(
              screen
                .getByTestId('loop-panel')
                .querySelector(':scope > button[aria-controls]')
                ?.getAttribute('aria-expanded'),
            );
          });
          renderSong(`${SONG_A}${query}`);
          await loadPlayer();
          expect(await screen.findByRole('form')).toBeInTheDocument();

          await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
          expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('score-viewport'));
          expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
          expect(sheetOpenAtScroll).toEqual(['true']);
          await settle();
          expect(scrollIntoView).toHaveBeenCalledTimes(1);
        } finally {
          vi.unstubAllGlobals();
        }
      },
    );

    // 12 QA after QA fix round 2, issue 1: Hide controls is pressed after scrolling up to it,
    // and in phone landscape the score kept still there was below the window.
    it('Hide controls brings the score back on screen; Show controls leaves the page alone', async () => {
      serve();
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: 'Show controls' }));
      await screen.findByRole('button', { name: 'Hide controls' });
      await settle();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole('button', { name: 'Hide controls' }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByTestId('score-viewport'));
      expect(scrollIntoView).toHaveBeenLastCalledWith(
        expect.objectContaining({ block: 'nearest' }),
      );
    });

    // 12 Test after QA fix round 3: the toggle pressed from the keyboard, where focus (not the
    // click) has scrolled it into view. Enter presses it; Space stays play/pause.
    it('Show controls and Hide controls by Enter do what the click does, and focus stays on the toggle', async () => {
      serve();
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

      screen.getByRole('button', { name: 'Show controls' }).focus();
      await user.keyboard('{Enter}');
      const hide = await screen.findByRole('button', { name: 'Hide controls' });
      expect(hide).toHaveFocus();
      await settle();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      await user.keyboard('{Enter}');
      expect(await screen.findByRole('button', { name: 'Show controls' })).toHaveFocus();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByTestId('score-viewport'));
      expect(playButton()).toHaveTextContent('Pause');
    });

    // 12 Test after QA fix round 3: the fold, not the status, brings the score back, so Hide
    // controls during a count-in shows the score (and the count-in number over it) too, and
    // touches nothing of the count-in.
    it('Hide controls during a count-in brings the score on screen, and the count-in carries on; the downbeat scrolls nothing more', async () => {
      serve({ settings: ok({ ...settingsRow, count_in_bars: 2 }) });
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      await user.click(playButton());
      expect(await screen.findByTestId('count-in')).toBeInTheDocument();
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      const restarts = engine.restartCalls();

      await showControls(user);
      await settle();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Hide controls' }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView.mock.contexts[1]).toBe(screen.getByTestId('score-viewport'));
      expect(screen.getByTestId('count-in')).toBeInTheDocument();
      expect(engine.restartCalls()).toBe(restarts);

      // The downbeat: still folded, so the score isn't brought on screen again.
      act(() => engine.fire('stateChanged', { playing: true }));
      await settle();
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
      await user.click(playButton());
    });

    // 12 Test after QA fix round 3: the folded strip's Loop speed opens the loop's own speed. It
    // neither unfolds the bar nor brings the score back, which would scroll the speed it focuses
    // off a phone's window.
    it('Loop speed in the folded strip leaves the bar folded and the window alone', async () => {
      const verse = loopOfSongA('verse', { name: 'Verse', start_bar: 5, end_bar: 8 });
      serve({ loops: [verse] });
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      const panel = within(screen.getByTestId('loop-panel'));
      await user.click(await panel.findByRole('button', { name: 'Play loop Verse' }));
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

      await user.click(screen.getByRole('button', { name: /^Loop speed \d+%$/ }));
      await waitFor(() => expect(panel.getByRole('group', { name: 'Loop speed' })).toHaveFocus());
      await settle();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Show controls' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });
});

describe('SongPage count-in', () => {
  it('takes the count-in defaults from settings and counts in over the score before playing', async () => {
    serve({
      settings: ok({ ...settingsRow, count_in_bars: 2, count_in_mode: 'every_repeat' }),
    });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    expect(chosenCountIn()).toBe('2 bars');
    expect(chosenCountInMode()).toBe('Every repeat');
    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();

    await user.click(playButton());

    // Two bars at 120 BPM is four seconds, so the count is still on beat one here.
    await waitFor(() => expect(screen.getByTestId('count-in-beat')).toHaveTextContent('1'));
    expect(screen.getByTestId('count-in-bar')).toHaveTextContent('Bar 1 of 2');
    expect(status()).toHaveTextContent('Counting in…');
    expect(playButton()).toHaveTextContent('Pause');
    expect(engine.play).not.toHaveBeenCalled();

    await user.click(playButton());
    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();
    expect(playButton()).toHaveTextContent('Play');
    expect(engine.play).not.toHaveBeenCalled();
  });

  it.each([
    [0, 'start'],
    [1, 'start'],
    [1, 'every_repeat'],
    [2, 'start'],
  ] as const)(
    'opens with the saved defaults: %s bar(s), mode %s',
    async (count_in_bars, count_in_mode) => {
      serve({ settings: ok({ ...settingsRow, count_in_bars, count_in_mode }) });
      renderSong(SONG_A);
      await loadPlayer();
      expect(chosenCountIn()).toBe(COUNT_IN_BARS_LABELS[count_in_bars]);
      // The mode shows only with a count-in to play.
      expect(chosenCountInMode()).toBe(
        count_in_bars === 0 ? null : COUNT_IN_MODE_SHORT_LABELS[count_in_mode],
      );
    },
  );

  it('with the count-in saved as off, Play starts at once with no counter', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await user.click(playButton());
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();
    expect(status()).not.toHaveTextContent('Counting in');
  });

  it('an override in the controls bar applies to this song only: nothing is saved, and the next song opens on the defaults', async () => {
    serve({ settings: ok({ ...settingsRow, count_in_bars: 0, count_in_mode: 'start' }) });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await chooseIn(user, countInGroup(), '2 bars');
    await chooseIn(user, countInModeGroup(), 'Every repeat');

    // The override is live: Play now counts in.
    await user.click(playButton());
    expect(await screen.findByTestId('count-in')).toBeInTheDocument();
    expect(engine.play).not.toHaveBeenCalled();
    await user.click(playButton());

    // Only reads went to the server: the saved defaults are the Settings page's.
    const writes = queryResult.mock.calls.filter(([call]) =>
      call.ops.some((op) => ['update', 'insert', 'upsert', 'delete'].includes(op.method)),
    );
    expect(writes).toHaveLength(0);

    await user.click(screen.getByRole('link', { name: 'Song B' }));
    await loadPlayer(1);
    expect(chosenCountIn()).toBe('Off');
    expect(countInModeGroup()).not.toBeInTheDocument();
  });

  it('shows the counter inside the score box, over the score', async () => {
    serve({ settings: ok({ ...settingsRow, count_in_bars: 1 }) });
    const user = renderSong(SONG_A);
    await loadPlayer();

    await user.click(playButton());
    const counter = await screen.findByTestId('count-in');
    const viewport = screen.getByTestId('score-viewport');
    // Same positioned box as the score, so it covers the score and nothing else.
    expect(counter.parentElement).toBe(viewport.parentElement);
    await user.click(playButton());
  });

  it('brings the score on screen when the count-in starts, not only when playback does', async () => {
    const scrollIntoView = vi.fn();
    // jsdom has no scrollIntoView; the page calls it only when it exists.
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      serve({ settings: ok({ ...settingsRow, count_in_bars: 2 }) });
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();

      await user.click(playButton());
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('score-viewport'));

      // Going from the count-in into playback is one start, not two.
      act(() => engine.fire('stateChanged', { playing: true }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      await user.click(playButton());
    } finally {
      // @ts-expect-error restoring jsdom's missing method
      delete Element.prototype.scrollIntoView;
    }
  });

  it('leaving the page during a count-in disposes the player, and nothing plays afterwards', async () => {
    serve({ settings: ok({ ...settingsRow, count_in_bars: 1 }) });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await user.click(playButton());
    expect(await screen.findByTestId('count-in')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Library' }));
    expect(await screen.findByTestId('location')).toHaveTextContent('/library');
    expect(engine.destroy).toHaveBeenCalledTimes(1);

    // One bar at 120 BPM is two seconds: wait past where the downbeat would have been.
    await new Promise((resolve) => setTimeout(resolve, 2300));
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('hides the counter once playback starts', async () => {
    serve({ settings: ok({ ...settingsRow, count_in_bars: 1 }) });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await user.click(playButton());
    expect(await screen.findByTestId('count-in')).toBeInTheDocument();

    act(() => engine.fire('stateChanged', { playing: true }));
    expect(screen.queryByTestId('count-in')).not.toBeInTheDocument();
    expect(status()).not.toHaveTextContent('Counting in');
  });
});

describe('SongPage loops', () => {
  const panel = () => within(screen.getByTestId('loop-panel'));
  const form = () => within(panel().getByRole('form'));
  const speedReadout = () => screen.getByTestId('jam-speed');
  const bpmReadout = () => screen.getByTestId('jam-bpm');

  /** Bars 7 to 10 straddle the tempo change at bar 9: the first bar is at 120, the last at 90. */
  const acrossTheChange = loopOfSongA('across', {
    name: 'Across the change',
    start_bar: 7,
    end_bar: 10,
    speed_ratio: 0.708333,
  });

  async function openSong(loops: Loop[] = []) {
    serve({ loops });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    return { user, engine };
  }

  it('lists the saved loops in bar order, with speed as % and the BPM at each loop’s first bar', async () => {
    await openSong([
      loopOfSongA('late', { name: 'Late', start_bar: 9, end_bar: 12, speed_ratio: 0.5 }),
      acrossTheChange,
    ]);

    const items = await panel().findAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/Bars/).textContent)).toEqual([
      // 85 BPM typed against 120: the exact ratio, shown as 71%.
      'Bars 7 to 10 · 71% (85 BPM)',
      // Bar 9 starts at 90 BPM, so half speed is 45.
      'Bars 9 to 12 · 50% (45 BPM)',
    ]);
  });

  it('says so when there are no loops yet', async () => {
    await openSong();
    expect(await panel().findByText(/No loops yet/)).toBeInTheDocument();
  });

  it('Play loop sets the range, looping and the saved speed, and starts playback', async () => {
    const { user, engine } = await openSong([acrossTheChange]);

    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));

    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOfBar(7),
      endTick: startOfBar(11),
    });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.708333);
    expect(engine.seek).toHaveBeenLastCalledWith(startOfBar(7));
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent('Bar 7 of 16');
    expect(screen.getByTestId('active-loop')).toHaveTextContent(/Across the change.*Bars 7 to 10/);
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 6, endBarIndex: 9 });
  });

  it('shows BPM as the speed times the tempo at the loop’s first bar, wherever playback is in it', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    act(() => engine.fire('stateChanged', { playing: true }));

    expect(speedReadout()).toHaveTextContent('71%');
    expect(bpmReadout()).toHaveTextContent('85');

    // alphaTab's answer to the loop's seek comes first; then playback moves on.
    act(() => engine.fire('position', { tick: startOfBar(7) }));
    // Into bar 9, where the file's tempo drops to 90: the loop's BPM stays its first bar's.
    act(() => engine.fire('position', { tick: startOfBar(9) + 10 }));
    expect(status()).toHaveTextContent('Bar 9 of 16');
    expect(bpmReadout()).toHaveTextContent('85');
    expect(panel().getByLabelText('BPM')).toHaveValue('85');
    expect(panel().getByLabelText('Speed %')).toHaveValue('71');
  });

  it('switching to another loop while playing keeps playing', async () => {
    const { user, engine } = await openSong([
      acrossTheChange,
      loopOfSongA('late', { name: 'Late', start_bar: 13, end_bar: 16, speed_ratio: 0.9 }),
    ]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restartsBefore = engine.restartCalls();

    await user.click(panel().getByRole('button', { name: 'Play loop Late' }));

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOfBar(13),
      endTick: startOfBar(17),
    });
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.9);
    expect(playButton()).toHaveTextContent('Pause');
    expect(screen.getByTestId('active-loop')).toHaveTextContent('Late');
  });

  it('Exit loop goes back to the whole song without stopping, at the speed it was at', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restartsBefore = engine.restartCalls();

    await user.click(screen.getByRole('button', { name: 'Exit loop' }));

    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null);
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument();
    expect(speedReadout()).toHaveTextContent('71%');
    // alphaTab's answer to the loop's seek comes first; then playback moves on.
    act(() => engine.fire('position', { tick: startOfBar(7) }));
    // Jam mode again: BPM follows the current bar.
    act(() => engine.fire('position', { tick: startOfBar(9) + 10 }));
    expect(bpmReadout()).toHaveTextContent('64'); // 90 x 0.708333
  });

  it('while the loop form is open, taps pick the bars and never seek; they are highlighted', async () => {
    const { user, engine } = await openSong();
    await user.click(await panel().findByRole('button', { name: 'New loop' }));
    expect(screen.getByTestId('loop-bars-hint')).toHaveTextContent('Tap the first bar');

    act(() => engine.fire('barTapped', { barIndex: 8 }));
    expect(form().getByLabelText('First bar')).toHaveValue('9');
    expect(form().getByLabelText('Last bar')).toHaveValue('9');
    expect(screen.getByTestId('loop-bars-hint')).toHaveTextContent('Now tap the last bar');
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 8, endBarIndex: 8 });

    // The last bar first works too: the range comes out in order.
    act(() => engine.fire('barTapped', { barIndex: 4 }));
    expect(form().getByLabelText('First bar')).toHaveValue('5');
    expect(form().getByLabelText('Last bar')).toHaveValue('9');
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 4, endBarIndex: 8 });

    expect(engine.seek).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('Bar 1 of 16');

    // Cancel: taps seek again, and the highlight is gone.
    await user.click(form().getByRole('button', { name: 'Cancel' }));
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
    act(() => engine.fire('barTapped', { barIndex: 2 }));
    expect(engine.seek).toHaveBeenLastCalledWith(startOfBar(3));
  });

  it('typed bars are highlighted once they make a range in the song', async () => {
    const { user, engine } = await openSong();
    await user.click(await panel().findByRole('button', { name: 'New loop' }));

    await user.type(form().getByLabelText('First bar'), '3');
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
    await user.type(form().getByLabelText('Last bar'), '6');
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 2, endBarIndex: 5 });

    await user.type(form().getByLabelText('Last bar'), '0'); // 60: past the last bar
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
  });

  it('saves a new loop with its name, bars and the speed playing now, then loops it', async () => {
    const { user, engine } = await openSong();
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '80' } });
    await user.click(await panel().findByRole('button', { name: 'New loop' }));
    expect(screen.getByTestId('loop-new-speed')).toHaveTextContent('80%');

    act(() => engine.fire('barTapped', { barIndex: 8 }));
    act(() => engine.fire('barTapped', { barIndex: 11 }));
    // The tempo is the first bar's, so the note reads in that bar's BPM.
    expect(screen.getByTestId('loop-new-speed')).toHaveTextContent('80% (72 BPM)');
    await user.type(form().getByLabelText('Name'), '  Second half  ');
    await user.click(form().getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(loops.sent('insert')).toHaveLength(1));
    expect(loops.sent('insert')[0]).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      song_id: SONG_A,
      user_id: USER,
      name: 'Second half',
      start_bar: 9,
      end_bar: 12,
      speed_ratio: 0.8,
    });

    // The form closes and the new loop is the one playing, without Play being pressed.
    expect(await screen.findByTestId('active-loop')).toHaveTextContent(/Second half.*Bars 9 to 12/);
    expect(panel().queryByRole('form')).not.toBeInTheDocument();
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOfBar(9),
      endTick: startOfBar(13),
    });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.play).not.toHaveBeenCalled();
    expect(speedReadout()).toHaveTextContent('80%');
  });

  /** Opens "New loop" from the overview (`?new=1`) and waits for its form. */
  async function openNewLoopForm() {
    serve({ loops: [] });
    const user = renderSong(`${SONG_A}?new=1`);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    await panel().findByRole('form');
    return { user, engine };
  }
  async function saveNewLoop(
    user: ReturnType<typeof renderSong>,
    name: string,
    firstBar: string,
    lastBar: string,
  ) {
    await user.type(form().getByLabelText('Name'), name);
    await user.type(form().getByLabelText('First bar'), firstBar);
    await user.type(form().getByLabelText('Last bar'), lastBar);
    await user.click(form().getByRole('button', { name: 'Save loop' }));
  }
  /** The choice a save leaves in the form's place: practise it now, or make another? */
  const savedChoice = (name: string) => panel().findByRole('group', { name: `Saved “${name}”` });

  // Shane, practising: several loops are made in one go, then practised, and it has to be plain
  // what a save did and what comes next ("right now it just sort of happens"). The overview's
  // "New loop" once jumped to each new loop; then it only emptied its form under a quiet line.
  it('a loop saved from the overview’s "New loop" asks "practise it now, or make another?", and takes focus', async () => {
    const { user } = await openNewLoopForm();
    await saveNewLoop(user, 'Verse', '3', '4');

    const choice = await savedChoice('Verse');
    expect(choice).toHaveTextContent('Bars 3 to 4');
    // It replaced the form the press was in: focus is on it, not on <body>.
    expect(choice).toHaveFocus();
    expect(panel().queryByRole('form')).not.toBeInTheDocument();
    // Still on the jam page: nothing happened that wasn't asked for.
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG_A}/play`);
    const [first] = loops.sent('insert') as Loop[];
    expect(panel().getByRole('link', { name: 'Practise it now' })).toHaveAttribute(
      'href',
      `/songs/${SONG_A}/loops/${first?.id}`,
    );
    expect(panel().getByRole('button', { name: 'Make another loop' })).toBeInTheDocument();
    expect(panel().getByRole('button', { name: 'Back to the song' })).toBeInTheDocument();
  });

  it('"Practise it now" goes to the new loop’s practice screen', async () => {
    const { user } = await openNewLoopForm();
    await saveNewLoop(user, 'Verse', '3', '4');
    await savedChoice('Verse');
    await user.click(panel().getByRole('link', { name: 'Practise it now' }));
    expect(await screen.findByText('At loop practice')).toBeInTheDocument();
    const [first] = loops.sent('insert') as Loop[];
    expect(screen.getByTestId('location')).toHaveTextContent(`/songs/${SONG_A}/loops/${first?.id}`);
  });

  it('"Make another loop" brings back an empty form; the second loop is its own row, and Done goes back to the song', async () => {
    const { user } = await openNewLoopForm();
    await saveNewLoop(user, 'Verse', '3', '4');
    await savedChoice('Verse');

    await user.click(panel().getByRole('button', { name: 'Make another loop' }));
    expect(form().getByLabelText('Name')).toHaveValue('');
    expect(form().getByLabelText('First bar')).toHaveValue('');

    await saveNewLoop(user, 'Chorus', '9', '12');
    expect(await savedChoice('Chorus')).toHaveFocus();
    const sent = loops.sent('insert') as Loop[];
    expect(sent.map((loop) => loop.name)).toEqual(['Verse', 'Chorus']);
    // A new id, not the first one sent again.
    expect(sent[0]?.id).not.toBe(sent[1]?.id);

    // From the form after a save there is nothing to cancel, only to finish.
    await user.click(panel().getByRole('button', { name: 'Make another loop' }));
    await user.click(form().getByRole('button', { name: 'Done' }));
    expect(await screen.findByText('At song overview')).toBeInTheDocument();
  });

  it('"Back to the song" from the choice goes back to the song', async () => {
    const { user } = await openNewLoopForm();
    await saveNewLoop(user, 'Verse', '3', '4');
    await savedChoice('Verse');
    await user.click(panel().getByRole('button', { name: 'Back to the song' }));
    expect(await screen.findByText('At song overview')).toBeInTheDocument();
  });

  it('picking bars on the score while it asks is "make another": the form comes back holding them', async () => {
    const { user, engine } = await openNewLoopForm();
    await saveNewLoop(user, 'Verse', '3', '4');
    await savedChoice('Verse');

    act(() => engine.fire('barTapped', { barIndex: 8 }));
    await panel().findByRole('form');
    act(() => engine.fire('barTapped', { barIndex: 11 }));
    expect(form().getByLabelText('First bar')).toHaveValue('9');
    expect(form().getByLabelText('Last bar')).toHaveValue('12');
    expect(form().getByLabelText('Name')).toHaveValue('');
  });

  it('asks nothing after an edit, or after a loop saved from the panel’s own "New loop"', async () => {
    const { user } = await openSong([acrossTheChange]);
    await panel().findByRole('button', { name: 'Play loop Across the change' });
    await user.click(panel().getByRole('button', { name: 'New loop' }));
    await saveNewLoop(user, 'Verse', '3', '4');
    // The new loop is the loop on the page, as before; no question.
    await panel().findByRole('button', { name: /loop Verse/ });
    expect(panel().queryByRole('group', { name: /^Saved/ })).not.toBeInTheDocument();
  });

  it('refuses a form it cannot save, saying why, and sends nothing', async () => {
    const { user } = await openSong();
    await user.click(await panel().findByRole('button', { name: 'New loop' }));
    await user.type(form().getByLabelText('Name'), '   ');
    await user.type(form().getByLabelText('First bar'), '9');
    await user.type(form().getByLabelText('Last bar'), '17');
    await user.click(form().getByRole('button', { name: 'Save loop' }));

    expect(form().getByText('Give the loop a name.')).toBeInTheDocument();
    expect(form().getByText('Bars go from 1 to 16 in this song.')).toBeInTheDocument();
    expect(loops.sent('insert')).toHaveLength(0);
  });

  it('a mouse drag across bars opens the form with those bars, on release', async () => {
    const { engine } = await openSong();
    await panel().findByText(/No loops yet/);

    act(() => engine.fire('barsDragged', { fromBarIndex: 2, toBarIndex: 4, done: false }));
    // Shown while dragging, but nothing opens under the pointer.
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 2, endBarIndex: 4 });
    expect(panel().queryByRole('form')).not.toBeInTheDocument();

    act(() => engine.fire('barsDragged', { fromBarIndex: 2, toBarIndex: 5, done: true }));
    expect(form().getByLabelText('First bar')).toHaveValue('3');
    expect(form().getByLabelText('Last bar')).toHaveValue('6');
    expect(engine.seek).not.toHaveBeenCalled();
  });

  it('a drag that stays in one bar is not a new loop', async () => {
    const { engine } = await openSong();
    await panel().findByText(/No loops yet/);
    act(() => engine.fire('barsDragged', { fromBarIndex: 2, toBarIndex: 2, done: true }));
    expect(panel().queryByRole('form')).not.toBeInTheDocument();
    expect(engine.setHighlight).toHaveBeenLastCalledWith(null);
  });

  it('a typed BPM plays at once and is saved to the loop at the exact ratio it implies', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    expect(panel().queryByRole('button', { name: 'Save speed' })).not.toBeInTheDocument();
    await settle();
    expect(loops.sent('update')).toHaveLength(0);

    const bpmField = panel().getByLabelText('BPM');
    await user.clear(bpmField);
    await user.type(bpmField, '100{Enter}');

    // 100 of 120: 83.3333%, not 83%.
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.833333);
    expect(panel().getByLabelText('Speed %')).toHaveValue('83');
    expect(bpmReadout()).toHaveTextContent('100');

    await waitFor(() => expect(loops.sent('update')).toEqual([{ speed_ratio: 0.833333 }]));
    await waitFor(() =>
      expect(screen.getByTestId('active-loop')).toHaveTextContent('Bars 7 to 10 · 83% (100 BPM)'),
    );
  });

  it('a speed key while a loop plays saves the loop at that speed; choosing a loop saves nothing', async () => {
    const { user } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    await settle();
    expect(loops.sent('update')).toEqual([]);

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{ArrowUp}');
    // 71% on show, up 5%.
    await waitFor(() => expect(loops.sent('update')).toEqual([{ speed_ratio: 0.76 }]));
  });

  it('nudges move the speed in whole percent from the percent on show', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));

    await user.click(panel().getByRole('button', { name: 'Faster by 1%' }));
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.72);
    await user.click(panel().getByRole('button', { name: 'Slower by 5%' }));
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.67);
    expect(panel().getByLabelText('BPM')).toHaveValue('80'); // 120 x 0.67 = 80.4
  });

  it('editing the playing loop’s bars sends only what changed and moves the loop there', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));

    await chooseFromMenu(user, panel(), 'Across the change', 'Edit');
    expect(form().getByLabelText('Name')).toHaveValue('Across the change');
    const lastBar = form().getByLabelText('Last bar');
    await user.clear(lastBar);
    await user.type(lastBar, '12');
    await user.click(form().getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(loops.sent('update')).toHaveLength(1));
    expect(loops.sent('update')).toEqual([{ end_bar: 12 }]);
    await waitFor(() =>
      expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
        startTick: startOfBar(7),
        endTick: startOfBar(13),
      }),
    );
    expect(screen.getByTestId('active-loop')).toHaveTextContent('Bars 7 to 12');
  });

  it('deletes a loop only after the inline confirm; deleting the playing loop goes back to the whole song', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));

    await chooseFromMenu(user, panel(), 'Across the change', 'Delete');
    const confirm = within(panel().getByRole('group', { name: 'Delete Across the change' }));
    expect(loops.sent('delete')).toHaveLength(0);
    await user.click(confirm.getByRole('button', { name: 'Keep it' }));
    expect(
      panel().getByRole('button', { name: 'More actions for Across the change' }),
    ).toBeInTheDocument();

    await chooseFromMenu(user, panel(), 'Across the change', 'Delete');
    await user.click(
      within(panel().getByRole('group', { name: 'Delete Across the change' })).getByRole('button', {
        name: 'Delete loop',
      }),
    );

    expect(await panel().findByText(/No loops yet/)).toBeInTheDocument();
    expect(loops.sent('delete')).toHaveLength(1);
    await waitFor(() => expect(engine.setPlaybackRange).toHaveBeenLastCalledWith(null));
    expect(engine.setLooping).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument();
  });

  it('a failed loops load is retryable and leaves the player working', async () => {
    serve();
    let failing = true;
    const answer = queryResult.getMockImplementation()!;
    queryResult.mockImplementation(async (call) =>
      call.table === 'loops' && failing ? fail('offline') : answer(call),
    );
    const user = renderSong(SONG_A);
    await loadPlayer();

    expect(await panel().findByText("Couldn't load this song's loops.")).toBeInTheDocument();
    expect(playButton()).toBeEnabled();

    failing = false;
    await user.click(panel().getByRole('button', { name: 'Try again' }));
    expect(await panel().findByText(/No loops yet/)).toBeInTheDocument();
  });

  it('a new song opens with no loop playing, and its own loops', async () => {
    serve({
      loops: [acrossTheChange, loopOfSongA('b-loop', { song_id: SONG_B, name: 'On song B' })],
    });
    const user = renderSong(SONG_A);
    await loadPlayer(0);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    expect(screen.getByTestId('active-loop')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Song B' }));
    await waitFor(() => expect(engines).toHaveLength(2));
    const second = await loadPlayer(1);

    expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument();
    expect(await panel().findByRole('button', { name: 'Play loop On song B' })).toBeEnabled();
    expect(panel().queryByText('Across the change')).not.toBeInTheDocument();
    expect(second.setPlaybackRange).not.toHaveBeenCalledWith(
      expect.objectContaining({ startTick: startOfBar(7) }),
    );
  });
});

// 08 QA fix round 1 (Test stage): what scrolls the score box on the page, and what must not.
describe('SongPage scrolling the score to a bar', () => {
  const panel = () => within(screen.getByTestId('loop-panel'));

  it('a tap on the score seeks and never scrolls it, paused or playing', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    act(() => engine.fire('barTapped', { barIndex: 11 }));
    expect(status()).toHaveTextContent('Bar 12 of 16');
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: true }));
    act(() => engine.fire('barTapped', { barIndex: 2 }));
    expect(status()).toHaveTextContent('Bar 3 of 16');

    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('Play with a count-in scrolls to the bar it counts into, before playback starts', async () => {
    serve({ settings: ok({ ...settingsRow, count_in_bars: 1 }) });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    act(() => engine.fire('barTapped', { barIndex: 6 }));
    expect(engine.scrollToBar).not.toHaveBeenCalled();

    await user.click(playButton());

    expect(status()).toHaveTextContent('Bar 7 of 16 · Counting in…');
    expect(engine.scrollToBar).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(6);
    expect(engine.play).not.toHaveBeenCalled();
    await user.click(playButton());
  });

  it('Play with the count-in off scrolls nothing: alphaTab follows its cursor', async () => {
    serve();
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    await user.click(playButton());
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });

  it('Play loop while paused scrolls to the loop’s first bar; Exit loop scrolls nowhere', async () => {
    serve({ loops: [loopOfSongA('late', { name: 'Late', start_bar: 13, end_bar: 14 })] });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();

    await user.click(await panel().findByRole('button', { name: 'Play loop Late' }));
    expect(engine.scrollToBar).toHaveBeenLastCalledWith(12);
    expect(engine.play).toHaveBeenCalledTimes(1);

    engine.scrollToBar.mockClear();
    await user.click(
      within(screen.getByTestId('active-loop')).getByRole('button', { name: 'Exit loop' }),
    );
    expect(engine.scrollToBar).not.toHaveBeenCalled();
  });
});

describe('SongPage practice sessions', () => {
  const verse = loopOfSongA('verse', {
    name: 'Verse',
    start_bar: 5,
    end_bar: 8,
    speed_ratio: 0.8,
  });
  const chorus = loopOfSongA('chorus', {
    name: 'Chorus',
    start_bar: 9,
    end_bar: 12,
    speed_ratio: 0.6,
  });
  const sessionsSent = () =>
    queryResult.mock.calls
      .map(([call]) => call)
      .filter((call) => call.table === 'practice_sessions')
      .map((call) => opArgs(call, 'upsert')?.[0] as Record<string, unknown>);

  beforeEach(() => {
    // Only the clock: the queries and Testing Library keep their real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-23T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves the clock; nothing else is on a timer. */
  const later = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

  /**
   * Renders the page and starts the Verse loop from the panel, with the
   * engine's report of it. After serve(), so a test can first change how
   * session logs are answered.
   */
  async function startVerse() {
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    const panel = within(screen.getByTestId('loop-panel'));
    await user.click(await panel.findByRole('button', { name: 'Play loop Verse' }));
    act(() => engine.fire('stateChanged', { playing: true }));
    /** Play or Pause in the sticky bar, with the engine's report of it. */
    const press = async (playing: boolean) => {
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing }));
    };
    return { user, engine, panel, pause: () => press(false), resume: () => press(true) };
  }

  async function playVerseFor(seconds: number) {
    serve({ loops: [verse] });
    const view = await startVerse();
    later(seconds);
    await view.pause();
    return view;
  }

  /** Refuses every session log, leaving the other tables as served, until `recover()`. After serve(). */
  function failSessionLogs() {
    const answer = queryResult.getMockImplementation()!;
    let failing = true;
    queryResult.mockImplementation(async (call) =>
      call.table === 'practice_sessions' && failing ? fail('offline') : answer(call),
    );
    return {
      recover: () => {
        failing = false;
      },
    };
  }

  it('logs a minute of loop practice as one session and says so', async () => {
    await playVerseFor(60);

    expect(await screen.findByTestId('session-logged')).toHaveTextContent(
      'Practice logged: 1 min of Verse at 80%.',
    );
    expect(sessionsSent()).toEqual([
      expect.objectContaining({
        loop_id: 'verse',
        started_at: '2026-11-23T18:00:00.000Z',
        duration_seconds: 60,
        speed_ratio: 0.8,
        repeats: 0,
      }),
    ]);
  });

  it('a pedal switching loops while playing logs the loop it left, at that loop’s speed', async () => {
    serve({ loops: [verse, chorus] });
    const { user, engine } = await startVerse();
    later(40);
    // A drummer's hands on the kit: the pedal, with focus left where the click put it.
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(screen.getByTestId('active-loop')).toHaveTextContent('Chorus'));

    await waitFor(() =>
      expect(sessionsSent()).toEqual([
        expect.objectContaining({ loop_id: 'verse', duration_seconds: 40, speed_ratio: 0.8 }),
      ]),
    );
    expect(engine.pause).not.toHaveBeenCalled();
    expect(screen.getByTestId('jam-speed')).toHaveTextContent('60%');
  });

  it('keeps the sitting of a loop left from the panel, for the song’s overview to sum up', async () => {
    serve({ loops: [verse, chorus] });
    const { user } = await startVerse();
    later(40);
    await user.keyboard('{PageDown}');
    await waitFor(() => expect(screen.getByTestId('active-loop')).toHaveTextContent('Chorus'));

    expect(readVisitSittings()).toMatchObject([
      { loopId: 'verse', loopName: 'Verse', playedSeconds: 40, endSpeedRatio: 0.8 },
    ]);
  });

  it('logs nothing for a short go, and nothing for jam mode', async () => {
    const { user, pause, resume } = await playVerseFor(20);
    await user.click(
      within(screen.getByTestId('active-loop')).getByRole('button', { name: 'Exit loop' }),
    );
    await resume();
    later(300);
    await pause();

    expect(sessionsSent()).toEqual([]);
    expect(screen.queryByTestId('session-logged')).not.toBeInTheDocument();
  });

  it('says when a session could not be saved, and sends the same one again on request', async () => {
    serve({ loops: [verse] });
    const sessionLogs = failSessionLogs();
    const { user, pause } = await startVerse();
    later(45);
    await pause();

    const alert = await screen.findByText("Couldn't save your last practice session.");
    expect(alert.closest('[role="alert"]')).not.toHaveTextContent('offline');

    sessionLogs.recover();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('session-logged')).toHaveTextContent(
      'Practice logged: 45 s of Verse at 80%.',
    );
    expect(sessionsSent()).toHaveLength(2);
    expect(sessionsSent()[1]).toEqual(sessionsSent()[0]);
  });

  it('logs the session when the page is left mid-practice', async () => {
    serve({ loops: [verse] });
    const { user } = await startVerse();
    later(90);

    await user.click(screen.getByRole('link', { name: 'Library' }));

    expect(await screen.findByText('At library')).toBeInTheDocument();
    await waitFor(() => expect(sessionsSent()).toHaveLength(1));
    expect(sessionsSent()[0]).toMatchObject({ loop_id: 'verse', duration_seconds: 90 });
  });

  it('"Play loop" on another loop logs the first at the speed it was played at, not the next one’s', async () => {
    serve({ loops: [verse, chorus] });
    const { user, panel, pause } = await startVerse();
    later(45);

    await user.click(panel.getByRole('button', { name: 'Play loop Chorus' }));

    await waitFor(() => expect(sessionsSent()).toHaveLength(1));
    expect(sessionsSent()[0]).toMatchObject({
      loop_id: 'verse',
      duration_seconds: 45,
      speed_ratio: 0.8,
    });
    expect(screen.getByTestId('jam-speed')).toHaveTextContent('60%');

    later(31);
    await pause();

    await waitFor(() => expect(sessionsSent()).toHaveLength(2));
    expect(sessionsSent()[1]).toMatchObject({
      loop_id: 'chorus',
      started_at: '2026-11-23T18:00:45.000Z',
      duration_seconds: 31,
      speed_ratio: 0.6,
    });
    expect(sessionsSent()[1]!.id).not.toBe(sessionsSent()[0]!.id);
  });

  it('finishing the loop that is playing does not end its session', async () => {
    serve({ loops: [verse] });
    const { user, panel, pause } = await startVerse();
    later(20);

    await user.click(panel.getByRole('button', { name: 'Mark finished Verse' }));
    await panel.findByRole('button', { name: 'Reopen Verse' });
    expect(loops.sent('update')).toEqual([{ status: 'finished' }]);
    expect(playButton()).toHaveTextContent('Pause');
    expect(sessionsSent()).toEqual([]);

    later(20);
    await pause();

    await waitFor(() => expect(sessionsSent()).toHaveLength(1));
    expect(sessionsSent()[0]).toMatchObject({ loop_id: 'verse', duration_seconds: 40 });
  });

  it('changing the bars of the loop that is playing does not end its session either', async () => {
    serve({ loops: [verse] });
    const { user, panel, pause } = await startVerse();
    later(20);

    await chooseFromMenu(user, panel, 'Verse', 'Edit');
    const lastBar = panel.getByLabelText('Last bar');
    await user.clear(lastBar);
    await user.type(lastBar, '6');
    await user.click(panel.getByRole('button', { name: 'Save loop' }));
    await waitFor(() => expect(screen.getByTestId('active-loop')).toHaveTextContent('Bars 5 to 6'));
    expect(sessionsSent()).toEqual([]);

    later(20);
    await pause();

    await waitFor(() => expect(sessionsSent()).toHaveLength(1));
    expect(sessionsSent()[0]).toMatchObject({ loop_id: 'verse', duration_seconds: 40 });
  });

  it('deleting the loop mid-practice drops its session without a word: its history went with it', async () => {
    serve({ loops: [verse] });
    const answer = queryResult.getMockImplementation()!;
    const sessionAnswers: Promise<FakeResult>[] = [];
    queryResult.mockImplementation((call) => {
      if (call.table !== 'practice_sessions') return answer(call);
      // What the database says of a session for a loop that is gone.
      const refused = Promise.resolve<FakeResult>({
        data: null,
        error: { message: 'violates foreign key constraint', code: '23503' },
      });
      sessionAnswers.push(refused);
      return refused;
    });
    const { user, panel } = await startVerse();
    later(45);

    await chooseFromMenu(user, panel, 'Verse', 'Delete');
    await user.click(panel.getByRole('button', { name: 'Delete loop' }));

    // The session was sent and refused; only then is it worth saying nothing was shown.
    await waitFor(() => expect(sessionsSent()).toHaveLength(1));
    expect(sessionsSent()[0]).toMatchObject({ loop_id: 'verse', duration_seconds: 45 });
    await act(() => Promise.all(sessionAnswers));
    await settle();
    expect(screen.queryByText(/Couldn't save your last/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('session-logged')).not.toBeInTheDocument();
    expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument();
    // The whole song plays on.
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('drops "Practice logged" once its loop is deleted (09 QA issue 4)', async () => {
    const { user, panel } = await playVerseFor(45);
    expect(await screen.findByTestId('session-logged')).toHaveTextContent('of Verse at 80%.');

    await chooseFromMenu(user, panel, 'Verse', 'Delete');
    await user.click(panel.getByRole('button', { name: 'Delete loop' }));

    await waitFor(() => expect(panel.queryByText('Verse')).not.toBeInTheDocument());
    expect(screen.queryByTestId('session-logged')).not.toBeInTheDocument();
  });

  // Unit 13 Test: a loop deleted on another device. Its next session is refused (23503),
  // which reads the loops again (sessionLoopGone): the page stops looping it, and the
  // notice about its earlier session goes with it (09 QA issues 4 and 7).
  it('a loop deleted on another device: its refused session reads the loops again, and the page lets it go', async () => {
    const { pause, resume } = await playVerseFor(45);
    expect(await screen.findByTestId('session-logged')).toHaveTextContent('of Verse at 80%.');
    expect(screen.getByTestId('active-loop')).toHaveTextContent('Verse');

    loops.setRows([]);
    const answer = queryResult.getMockImplementation()!;
    queryResult.mockImplementation(async (call) =>
      call.table === 'practice_sessions'
        ? { data: null, error: { message: 'violates foreign key constraint', code: '23503' } }
        : answer(call),
    );
    await resume();
    later(45);
    await pause();

    await waitFor(() => expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument());
    expect(screen.queryByTestId('session-logged')).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't save your last practice session.")).not.toBeInTheDocument();
    expect(sessionsSent()).toHaveLength(2);
  });

  it('counts the sessions it could not save, and Try again sends each of them', async () => {
    serve({ loops: [verse] });
    const sessionLogs = failSessionLogs();
    const { user, pause, resume } = await startVerse();
    later(40);
    await pause();
    await screen.findByText("Couldn't save your last practice session.");
    await resume();
    later(50);
    await pause();

    expect(
      await screen.findByText("Couldn't save your last 2 practice sessions."),
    ).toBeInTheDocument();

    sessionLogs.recover();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('session-logged')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn't save/)).not.toBeInTheDocument();
    expect(sessionsSent().map((row) => row.duration_seconds)).toEqual([40, 50, 40, 50]);
    expect(sessionsSent()[2]!.id).toBe(sessionsSent()[0]!.id);
    expect(sessionsSent()[3]!.id).toBe(sessionsSent()[1]!.id);
  });
});

describe('SongPage keyboard shortcuts', () => {
  const panel = () => within(screen.getByTestId('loop-panel'));
  const verse = loopOfSongA('verse', { name: 'Verse', start_bar: 5, end_bar: 8, speed_ratio: 0.8 });
  const late = loopOfSongA('late', { name: 'Late', start_bar: 9, end_bar: 12, speed_ratio: 0.5 });

  async function openSong(savedLoops: Loop[] = [verse, late], { song = songRow(SONG_A) } = {}) {
    serve({ songs: { [SONG_A]: song, [SONG_B]: songRow(SONG_B) }, loops: savedLoops });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    await panel().findAllByRole('button', { name: /^Play loop / });
    return {
      user,
      engine,
      /** Presses "Play loop <name>" with the mouse, and alphaTab reports playing. */
      playLoop: async (name: string) => {
        await user.click(panel().getByRole('button', { name: `Play loop ${name}` }));
        act(() => engine.fire('stateChanged', { playing: true }));
      },
    };
  }

  /** A toggle in the controls bar, and whether it shows pressed. */
  const toggle = (name: string) => screen.getByRole('button', { name });
  const pressed = (name: string) => toggle(name).getAttribute('aria-pressed');

  it('Shortcuts and ? open the list of keys; Escape closes it and focus goes back', async () => {
    const { user } = await openSong();

    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Play or pause')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shortcuts' })).toHaveFocus();

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a pedal’s Page Down switches loops while playing, and the readout follows each loop', async () => {
    const { user, engine } = await openSong();
    document.body.focus();

    await user.keyboard('{PageDown}');
    expect(await screen.findByTestId('active-loop')).toHaveTextContent(/Verse.*Bars 5 to 8/);
    await user.keyboard(' ');
    act(() => engine.fire('stateChanged', { playing: true }));

    await user.keyboard('{PageDown}');
    await waitFor(() =>
      expect(screen.getByTestId('active-loop')).toHaveTextContent(/Late.*Bars 9 to 12/),
    );
    // Half speed against the 90 BPM that bar 9 starts at.
    expect(screen.getByTestId('jam-speed')).toHaveTextContent('50%');
    expect(screen.getByTestId('jam-bpm')).toHaveTextContent('45');
    expect(engine.pause).not.toHaveBeenCalled();
    expect(engine.stop).not.toHaveBeenCalled();
  });

  it('Space after a mouse press of Play loop pauses, rather than pressing what the press left focused', async () => {
    const { user, engine, playLoop } = await openSong();
    await playLoop('Verse');
    // The press closed the sheet over its own button; focus is on the sheet's header (13.28a).
    const header = panel().getByRole('button', { name: /Open$/ });
    expect(header).toHaveFocus();
    const seeks = engine.seek.mock.calls.length;

    await user.keyboard(' ');

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(engine.seek.mock.calls.length).toBe(seeks);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('Space on a focused Mark finished in the prompt pauses and finishes nothing', async () => {
    const atTarget = loopOfSongA('late', {
      ...late,
      speed_ratio: 1,
      last_practiced_at: '2026-11-20T10:00:00Z',
    });
    const { user, engine, playLoop } = await openSong([atTarget]);
    await playLoop('Late');
    const prompt = within(panel().getByRole('group', { name: 'Mark finished?' }));
    prompt.getByRole('button', { name: 'Mark finished' }).focus();

    await user.keyboard(' ');
    await settle();

    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(loops.sent('update')).toEqual([]);
    expect(panel().getByRole('group', { name: 'Mark finished?' })).toBeInTheDocument();
  });

  it('Space on a loop’s Reopen, focused while its write is on its way, pauses and sends nothing', async () => {
    const { user, engine, playLoop } = await openSong();
    await playLoop('Verse');
    const release = loops.holdNext('update');
    panel().getByRole('button', { name: 'Mark finished Late' }).focus();
    await user.keyboard('{Enter}');
    const reopen = await panel().findByRole('button', { name: 'Reopen Late' });
    await waitFor(() => expect(reopen).toHaveFocus());
    expectLocked(reopen);

    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    await settle();

    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(loops.sent('update')).toEqual([{ status: 'finished' }]);
    release();
    await waitFor(() => expectUnlocked(reopen));
    expect(reopen).toHaveFocus();
    expect(loops.sent('update')).toEqual([{ status: 'finished' }]);
  });

  it('typing a loop’s name types, and no shortcut fires', async () => {
    const { user, engine } = await openSong();
    await user.click(panel().getByRole('button', { name: 'New loop' }));

    await user.type(panel().getByLabelText('Name'), 'Dms c? ');

    expect(panel().getByLabelText('Name')).toHaveValue('Dms c? ');
    expect(engine.play).not.toHaveBeenCalled();
    expect(pressed('Mute drums')).toBe('false');
    expect(pressed('Drums only')).toBe('false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('M, D, S and C show on the controls they stand for', async () => {
    const { user } = await openSong();
    document.body.focus();
    const metronomeWas = pressed('Metronome');

    await user.keyboard('mdc');

    expect(pressed('Metronome')).not.toBe(metronomeWas);
    expect(pressed('Mute drums')).toBe('true');
    expect(chosenCountIn()).toBe('1 bar');
    await user.keyboard('s');
    expect(pressed('Drums only')).toBe('true');
    expect(pressed('Mute drums')).toBe('false');
  });

  it('in a song with no drum track, D and S leave the disabled toggles off', async () => {
    const { user } = await openSong([verse], {
      song: songRow(SONG_A, { drum_track_index: null }),
    });
    document.body.focus();
    expect(toggle('Mute drums')).toBeDisabled();
    expect(toggle('Drums only')).toBeDisabled();

    await user.keyboard('ds');
    // The keys did arrive: M, pressed the same way, works.
    const metronomeWas = pressed('Metronome');
    await user.keyboard('m');

    expect(pressed('Metronome')).not.toBe(metronomeWas);
    expect(pressed('Mute drums')).toBe('false');
    expect(pressed('Drums only')).toBe('false');
  });

  // Unit 13 Test (10 Build): a key's change is read out wherever focus is.
  it('says what each key changed in a polite status that is on the page from the start', async () => {
    const { user } = await openSong();
    const said = screen.getByTestId('shortcut-announcement');
    expect(said).toHaveAttribute('role', 'status');
    expect(said).toBeEmptyDOMElement();
    document.body.focus();

    await user.keyboard('d');
    expect(said).toHaveTextContent('Drums muted');
    await user.keyboard('s');
    expect(said).toHaveTextContent('Drums unmuted, Drums only on');
    await user.keyboard('{ArrowDown}');
    expect(said).toHaveTextContent('Speed 95%');
    // A click on the control is heard by its own control; only keys speak here.
    await user.click(toggle('Drums only'));
    expect(said).toHaveTextContent('Speed 95%');
  });
});

describe('SongPage controls while playing (12 UX pass)', () => {
  const panel = () => within(screen.getByTestId('loop-panel'));
  const verse = loopOfSongA('verse', { name: 'Verse', start_bar: 5, end_bar: 8, speed_ratio: 0.8 });
  const controls = () => within(screen.getByRole('region', { name: 'Player controls' }));

  async function openSong(savedLoops: Loop[] = [verse]) {
    serve({ loops: savedLoops });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    await panel().findAllByRole('button', { name: /^Play loop / });
    const play = async () => {
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
    };
    const pause = async () => {
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: false }));
    };
    return { user, engine, play, pause };
  }

  it('fold to the metronome, the speed and Show controls while playing, and unfold on Pause', async () => {
    const { play, pause, engine } = await openSong();
    expect(controls().getByRole('button', { name: 'Mute drums' })).toBeInTheDocument();
    const restarts = engine.restartCalls();

    await play();
    expect(controls().getByRole('button', { name: 'Metronome' })).toBeInTheDocument();
    expect(controls().getByRole('slider', { name: 'Speed' })).toBeInTheDocument();
    expect(controls().getByRole('button', { name: 'Show controls' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(controls().queryByRole('button', { name: 'Mute drums' })).not.toBeInTheDocument();
    expect(controls().queryByRole('radiogroup', { name: 'Count-in' })).not.toBeInTheDocument();
    // Play/Pause stays in the sticky bar, outside the controls.
    expect(playButton()).toHaveTextContent('Pause');
    expect(controls().queryByRole('button', { name: /^(Play|Pause)$/ })).not.toBeInTheDocument();

    await pause();
    expect(controls().getByRole('button', { name: 'Mute drums' })).toBeInTheDocument();
    expect(controls().queryByRole('button', { name: 'Show controls' })).not.toBeInTheDocument();
    // Folding is drawing only: the Play and the Pause pressed, and nothing else stopped or reloaded.
    expect(engine.restartCalls()).toBe(restarts + 2);
  });

  it('the folded strip sticks under the sticky bar', async () => {
    const { play } = await openSong();
    await play();
    const strip = screen.getByRole('region', { name: 'Player controls' }).parentElement;
    expect(strip).toHaveClass('sticky');
    expect(strip?.className).toContain('top-(--jam-bar-height)');
  });

  it('keys still work on the controls folded away, and show once the bar is out', async () => {
    const { user, play } = await openSong();
    await play();
    document.body.focus();
    await user.keyboard('dc');
    await user.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('button', { name: 'Mute drums' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(chosenCountIn()).toBe('1 bar');
    expect(screen.getByRole('button', { name: 'Hide controls' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('while a loop plays, the slider gives way to Loop speed, which opens the loop’s own speed control', async () => {
    const { user } = await openSong();
    expect(controls().getByRole('slider', { name: 'Speed' })).toBeInTheDocument();

    await user.click(panel().getByRole('button', { name: 'Play loop Verse' }));
    expect(controls().queryByRole('slider', { name: 'Speed' })).not.toBeInTheDocument();
    await user.click(controls().getByRole('button', { name: 'Loop speed 80%' }));
    await waitFor(() => expect(panel().getByRole('group', { name: 'Loop speed' })).toHaveFocus());

    await user.click(panel().getByRole('button', { name: 'Exit loop' }));
    expect(controls().getByRole('slider', { name: 'Speed' })).toBeInTheDocument();
  });

  // Copilot review on #18: the loop form takes the list's place, and the loop's speed control with
  // it, so a "Loop speed" there had nothing to show and did nothing.
  it.each(['New loop', 'Edit'])(
    'while the loop form is open (%s), the slider is back and changes the speed',
    async (opener) => {
      const { user } = await openSong();
      await user.click(panel().getByRole('button', { name: 'Play loop Verse' }));
      expect(controls().queryByRole('slider', { name: 'Speed' })).not.toBeInTheDocument();

      if (opener === 'New loop') {
        await user.click(panel().getByRole('button', { name: 'New loop' }));
      } else {
        await user.click(panel().getByRole('button', { name: 'More actions for Verse' }));
        await user.click(panel().getByRole('menuitem', { name: 'Edit' }));
      }
      expect(panel().getByRole('form')).toBeInTheDocument();
      expect(panel().queryByRole('group', { name: 'Loop speed' })).not.toBeInTheDocument();
      expect(controls().queryByRole('button', { name: /^Loop speed/ })).not.toBeInTheDocument();
      fireEvent.change(controls().getByRole('slider', { name: 'Speed' }), {
        target: { value: '60' },
      });
      expect(screen.getByTestId('jam-speed')).toHaveTextContent('60%');

      // The form gone, the loop's own control is back, and the bar's button leads to it.
      await user.click(panel().getByRole('button', { name: 'Cancel' }));
      expect(panel().getByRole('group', { name: 'Loop speed' })).toBeInTheDocument();
      expect(controls().getByRole('button', { name: 'Loop speed 60%' })).toBeInTheDocument();
    },
  );

  it('shows the playing loop once: in its own item, with no line above the score and no second card', async () => {
    const { user } = await openSong([
      verse,
      loopOfSongA('late', { name: 'Late', start_bar: 9, end_bar: 12, speed_ratio: 0.5 }),
    ]);
    await user.click(panel().getByRole('button', { name: 'Play loop Verse' }));

    expect(screen.getAllByTestId('active-loop')).toHaveLength(1);
    expect(screen.getByTestId('active-loop').tagName).toBe('LI');
    expect(screen.queryByText(/^Looping/)).not.toBeInTheDocument();
    expect(
      panel()
        .getAllByRole('listitem')
        .map((li) => within(li).getByText(/Bars/).textContent),
    ).toEqual(['Bars 5 to 8 · 80% (96 BPM)', 'Bars 9 to 12 · 50% (45 BPM)']);
    expect(panel().getAllByRole('group', { name: 'Loop speed' })).toHaveLength(1);
  });

  // 12 UX pass, Test.
  describe('on a phone, where the loop panel is a closed sheet', () => {
    beforeEach(() => vi.stubGlobal('innerWidth', 390));
    afterEach(() => vi.unstubAllGlobals());

    it('Loop speed opens the sheet that Play loop closed, and hands focus to the loop’s speed', async () => {
      serve({ loops: [verse] });
      const user = renderSong(SONG_A);
      await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
      const header = await screen.findByRole('button', { name: /^Loops \(1\)/, expanded: false });
      await user.click(header);
      await user.click(panel().getByRole('button', { name: 'Play loop Verse' }));
      // Play loop started playback from a sheet over the score: it closed.
      expect(screen.getByRole('button', { name: /^Loop: Verse/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );

      await user.click(controls().getByRole('button', { name: 'Loop speed 80%' }));
      expect(screen.getByRole('button', { name: /^Loop: Verse/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await waitFor(() => expect(panel().getByRole('group', { name: 'Loop speed' })).toHaveFocus());
    });
  });

  describe('the score stays where it is on screen as the bar folds and unfolds', () => {
    /**
     * jsdom lays nothing out: the score box sits 300 px lower while the bar is
     * full than while it is the strip, less however far the window has
     * scrolled, which `scrollBy` moves as a browser would (never above the
     * top), plus the room the page reserves under the controls for what the
     * window couldn't scroll back.
     */
    function layOut({ scrolledTo = 400 }: { scrolledTo?: number } = {}) {
      let scrollY = scrolledTo;
      vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
      const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(((
        options: ScrollToOptions,
      ) => {
        scrollY = Math.max(0, scrollY + (options.top ?? 0));
      }) as typeof window.scrollBy);
      const box = screen.getByTestId('score-viewport');
      const reserved = () =>
        Number.parseFloat(screen.getByTestId('controls-slot').style.marginBottom || '0');
      const top = () =>
        (document.querySelector('[data-folded]') ? 200 : 500) + reserved() - scrollY;
      vi.spyOn(box, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            top: top(),
            bottom: top() + 400,
            left: 0,
            right: 400,
            height: 400,
            width: 400,
          }) as DOMRect,
      );
      const userScrolls = (by: number) => {
        scrollY += by;
        fireEvent.scroll(window);
      };
      /** A scroll whose event the page hasn't had yet (a browser sends it with the next frame). */
      const scrollsSilently = (by: number) => {
        scrollY = Math.max(0, scrollY + by);
      };
      return { scrollBy, onScreen: top, userScrolls, scrollsSilently };
    }
    afterEach(() => vi.restoreAllMocks());

    it('Play and Pause leave the score where it was, the window scrolled by what the bar gave or took', async () => {
      const { play, pause, engine } = await openSong();
      const { scrollBy, onScreen, userScrolls } = layOut();
      // Where the score is, taken from the last scroll as well as the last render.
      userScrolls(0);
      const before = onScreen();

      await play();
      expect(onScreen()).toBe(before);
      // Positions while playing redraw the page but fold nothing: no scroll for them.
      const scrolls = scrollBy.mock.calls.length;
      act(() => engine.fire('position', { tick: startOfBar(3) }));
      expect(scrollBy.mock.calls).toHaveLength(scrolls);

      await pause();
      expect(onScreen()).toBe(before);
      expect(scrollBy.mock.calls.map(([options]) => (options as ScrollToOptions).top)).toEqual([
        -300, 300,
      ]);
    });

    it('a scroll the user made while playing counts as where the score was', async () => {
      const { play, pause } = await openSong();
      const { onScreen, userScrolls } = layOut();
      await play();
      userScrolls(120);
      const before = onScreen();
      await pause();
      expect(onScreen()).toBe(before);
    });

    // 12 QA after the UX pass, issue 2: on a phone the page can't scroll at all.
    it('at the top of the page the fold leaves room in its place, so nothing moves and nothing scrolls', async () => {
      const { play, pause } = await openSong();
      const { scrollBy, onScreen, userScrolls } = layOut({ scrolledTo: 0 });
      userScrolls(0);
      const before = onScreen();

      await play();
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('300px');

      await pause();
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
      expect(scrollBy.mock.calls.every(([options]) => (options as ScrollToOptions).top === 0)).toBe(
        true,
      );
    });

    it('part way down, the window scrolls what it can and the rest is kept as room', async () => {
      const { play, pause } = await openSong();
      const { onScreen, userScrolls } = layOut({ scrolledTo: 100 });
      userScrolls(0);
      const before = onScreen();

      await play();
      expect(onScreen()).toBe(before);
      expect(window.scrollY).toBe(0);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('200px');

      await pause();
      expect(onScreen()).toBe(before);
      expect(window.scrollY).toBe(100);
    });

    // 12 Test after the QA fix round.
    it('on a long page scrolled down, the window does it all: no room while playing', async () => {
      const { play, pause } = await openSong();
      const { onScreen, userScrolls } = layOut({ scrolledTo: 400 });
      userScrolls(0);
      const before = onScreen();

      await play();
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
      await pause();
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
    });

    it('Show controls mid-run gives the room back, and the next Play holds it again', async () => {
      const { user, play, pause } = await openSong();
      const { onScreen, userScrolls } = layOut({ scrolledTo: 0 });
      userScrolls(0);
      const before = onScreen();

      await play();
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('300px');
      await showControls(user);
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
      await pause();
      await play();
      expect(onScreen()).toBe(before);
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('300px');
    });

    // 12 Test after QA fix round 3: every way the fold changes on the real page, each pressed in
    // the same frame as a scroll whose event hasn't reached the page.
    it('a fold just after a scroll with no event yet keeps the score where it is after that scroll: Play, Show and Hide controls, the song’s end', async () => {
      const { user, play, engine } = await openSong();
      const { onScreen, scrollsSilently } = layOut({ scrolledTo: 600 });
      const steps: Array<[string, () => Promise<void>]> = [
        ['Play', play],
        ['Show controls', () => showControls(user)],
        ['Hide controls', () => user.click(screen.getByRole('button', { name: 'Hide controls' }))],
        [
          'the song’s end',
          async () => {
            // alphaTab reports the end, then its stop.
            act(() => {
              engine.fire('finished', undefined);
              engine.fire('stateChanged', { playing: false });
            });
            await screen.findByRole('button', { name: 'Mute drums' });
          },
        ],
      ];
      for (const [step, press] of steps) {
        scrollsSilently(-45);
        const before = onScreen();
        await press();
        expect(onScreen(), step).toBe(before);
      }
      expect(playButton()).toHaveTextContent('Play');
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
    });

    it('Show controls and Hide controls by keyboard, the window moved by focus first, keep the score where it is', async () => {
      const { user, play } = await openSong();
      const { onScreen, userScrolls, scrollsSilently } = layOut({ scrolledTo: 600 });
      await play();
      // Focus scrolls the strip's toggle into view: its event has long been sent by Enter.
      screen.getByRole('button', { name: 'Show controls' }).focus();
      userScrolls(-80);
      let before = onScreen();
      await user.keyboard('{Enter}');
      expect(onScreen(), 'Show controls').toBe(before);
      scrollsSilently(-50);
      before = onScreen();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('button', { name: 'Show controls' })).toHaveFocus();
      expect(onScreen(), 'Hide controls').toBe(before);
    });

    it('Loop speed in the folded strip, the window moved as focus goes to the loop’s speed: the Pause after it keeps the score where it is', async () => {
      const { user, engine } = await openSong();
      const { onScreen, scrollsSilently } = layOut({ scrolledTo: 600 });
      await user.click(panel().getByRole('button', { name: 'Play loop Verse' }));
      act(() => engine.fire('stateChanged', { playing: true }));
      await user.click(controls().getByRole('button', { name: 'Loop speed 80%' }));
      await waitFor(() => expect(panel().getByRole('group', { name: 'Loop speed' })).toHaveFocus());
      expect(controls().getByRole('button', { name: 'Show controls' })).toBeInTheDocument();
      scrollsSilently(120);
      const before = onScreen();
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: false }));
      expect(await controls().findByRole('button', { name: 'Mute drums' })).toBeInTheDocument();
      expect(onScreen()).toBe(before);
    });

    it('a playing song left for another, or for the library, leaves no room behind', async () => {
      const { user, play } = await openSong();
      const { userScrolls } = layOut({ scrolledTo: 0 });
      userScrolls(0);
      await play();
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('300px');

      await user.click(screen.getByRole('link', { name: 'Song B' }));
      expect(await screen.findByRole('heading', { level: 1, name: 'Tempo Change' })).toBeVisible();
      await waitFor(() => expect(engines).toHaveLength(2));
      await loadPlayer(1, { barCount: 12 });
      expect(screen.getByTestId('controls-slot').style.marginBottom).toBe('');
      expect(window.scrollY).toBe(0);

      await user.click(screen.getByRole('link', { name: 'Library' }));
      expect(await screen.findByText('At library')).toBeInTheDocument();
      expect(screen.queryByTestId('controls-slot')).not.toBeInTheDocument();
      expect(document.querySelector('[style*="margin-bottom"]')).toBeNull();
    });
  });
});

describe('SongPage recordings (Unit 14)', () => {
  const original = videoLink();
  const drumlessVideo = videoLink('link-drumless', {
    kind: 'drumless',
    url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa&t=30s',
  });
  const DRUMLESS_EMBED = `https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=30`;
  const verse = loopOfSongA('verse', { name: 'Verse', start_bar: 5, end_bar: 8, speed_ratio: 0.8 });

  const linksKey = songLinkKeys.forSong(USER, SONG_A);
  const sources = () => screen.getByRole('radiogroup', { name: 'Play along with' });
  const noSources = () =>
    expect(screen.queryByRole('radiogroup', { name: 'Play along with' })).not.toBeInTheDocument();
  const source = (name: string) => within(sources()).getByRole('radio', { name });
  const frame = () => screen.getByTestId('recording-frame');
  /** The frame, once it is on the page. */
  const frameShown = () => screen.findByTestId('recording-frame');
  const noFrame = () => expect(screen.queryByTestId('recording-frame')).not.toBeInTheDocument();
  /** Presses a source in the switch, once the switch has it. */
  const choose = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(await screen.findByRole('radio', { name }));
  const location = () => screen.getByTestId('location').textContent;
  /** Nothing of the tab's player is offered: no Play, no controls bar, no readout, no loop panel. */
  const expectNoTabControls = () => {
    expect(screen.queryByRole('button', { name: /^(Play|Pause)$/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('jam-bar')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Speed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Metronome' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Player controls' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shortcuts' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('player-status')).not.toBeInTheDocument();
    expect(screen.getByTestId('loop-panel')).not.toBeVisible();
  };

  /** The play screen at `query`, with History before it when given. Returns once the engine has its score. */
  async function openSong({
    links: savedLinks = [original],
    loops: savedLoops = [verse],
    query = '',
    before,
    queryClient,
    ready = true,
  }: {
    links?: SongLinkRow[];
    loops?: Loop[];
    query?: string;
    before?: string[];
    queryClient?: QueryClient;
    /** False to leave alphaTab still loading. */
    ready?: boolean;
  } = {}) {
    serve({ loops: savedLoops, links: savedLinks });
    renderRoutes(
      <>
        <Route path="/songs/:id/play" element={<SongPage />} />
        <Route path="/songs/:id" element={<RouteMarker name="song overview" />} />
      </>,
      { path: `/songs/${SONG_A}/play${query}`, before, queryClient },
    );
    const user = userEvent.setup();
    await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
    const engine = engines[0]!;
    if (ready) act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
    return { user, engine };
  }

  describe('the source switch', () => {
    it('isn’t there for a song with no links, and nothing of YouTube’s is on the page', async () => {
      await openSong({ links: [] });
      await waitFor(() => expect(playButton()).toBeEnabled());
      await settle();
      noSources();
      noFrame();
      expect(document.querySelector('iframe')).toBeNull();
      expect(playedWrites()).toEqual([]);
    });

    it('isn’t there for a song whose only links leave the app', async () => {
      await openSong({ links: [spotifyLink('s', { kind: 'original' }), linkRow('lesson')] });
      await waitFor(() => expect(playButton()).toBeEnabled());
      await settle();
      noSources();
    });

    it('offers Tab and each YouTube source the song has, opening on Tab with no frame', async () => {
      await openSong({ links: [drumlessVideo, original, linkRow('lesson', { url: WATCH_URL })] });
      await waitFor(() =>
        expect(
          within(sources())
            .getAllByRole('radio')
            .map((radio) => radio.parentElement?.textContent),
        ).toEqual(['Tab', 'Original', 'Drumless']),
      );
      expect(source('Tab')).toBeChecked();
      noFrame();
      expect(playButton()).toBeEnabled();
      expect(playedWrites()).toEqual([]);
    });

    it('a Spotify Drumless beside a YouTube Original isn’t a source', async () => {
      await openSong({ links: [original, spotifyLink()] });
      await waitFor(() => expect(within(sources()).getAllByRole('radio')).toHaveLength(2));
      expect(within(sources()).queryByRole('radio', { name: 'Drumless' })).not.toBeInTheDocument();
    });
  });

  describe('on a recording', () => {
    it('shows the video in YouTube’s no-cookie player, with the way out under it and the score below', async () => {
      const { user } = await openSong();
      await choose(user, 'Original');

      expect(frame()).toHaveAttribute('src', EMBED_URL);
      expect(frame().tagName).toBe('IFRAME');
      expect(frame()).toHaveAttribute(
        'title',
        'Original recording of Groove 120 (YouTube video player)',
      );
      expect(frame()).toHaveAttribute(
        'allow',
        'accelerometer; encrypted-media; picture-in-picture; fullscreen',
      );
      expect(frame()).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      expect(frame()).toHaveAttribute('allowfullscreen');
      // The frame, and the one player made for it (youTubePlayer.ts, mocked here, is the
      // only thing that asks YouTube for a script: youTubePlayer.test.ts).
      expect(document.querySelector('script[src*="youtube"]')).toBeNull();
      expect(recordingPlayers().map((made) => made.frame)).toEqual([frame()]);

      const out = screen.getByRole('link', { name: /^Open in YouTube/ });
      expect(out).toHaveAttribute('href', WATCH_URL);
      expect(out).toHaveAttribute('target', '_blank');
      expect(out).toHaveAttribute('rel', 'noopener noreferrer');
      expect(screen.getByTestId('recording-note')).toHaveTextContent(
        'The video has its own controls. Switch to Tab for loops, speed and the metronome.',
      );
      expect(screen.getByTestId('score-viewport')).toBeVisible();
      expectNoTabControls();
      expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
    });

    it('stops the tab that was sounding, and Tab brings its controls back without starting it', async () => {
      const { user, engine } = await openSong();
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));
      expect(playButton()).toHaveTextContent('Pause');

      await choose(user, 'Original');
      await waitFor(() => expect(engine.pause).toHaveBeenCalled());
      act(() => engine.fire('stateChanged', { playing: false }));
      expect(frame()).toBeInTheDocument();
      expectNoTabControls();

      const plays = engine.play.mock.calls.length;
      await choose(user, 'Tab');
      noFrame();
      expect(playButton()).toHaveTextContent('Play');
      expect(screen.getByRole('slider', { name: 'Speed' })).toBeInTheDocument();
      expect(screen.getByTestId('loop-panel')).toBeVisible();
      expect(engine.play.mock.calls).toHaveLength(plays);
      expect(location()).toBe(`/songs/${SONG_A}/play`);
    });

    it('calls a count-in off when the source changes under it', async () => {
      serve({ settings: ok({ ...settingsRow, count_in_bars: 1 }), links: [original] });
      const user = renderSong(SONG_A);
      const engine = await loadPlayer();
      await user.click(playButton());
      expect(status()).toHaveTextContent('Counting in…');

      await choose(user, 'Original');
      expect(frame()).toBeInTheDocument();
      await choose(user, 'Tab');
      await waitFor(() => expect(playButton()).toHaveTextContent('Play'));
      expect(status()).not.toHaveTextContent('Counting in');
      await settle();
      expect(engine.play).not.toHaveBeenCalled();
    });

    it('switching from one video to the other replaces the frame, so the first stops', async () => {
      const { user } = await openSong({ links: [original, drumlessVideo] });
      await choose(user, 'Original');
      const first = frame();

      await choose(user, 'Drumless');
      expect(frame()).not.toBe(first);
      expect(first).not.toBeInTheDocument();
      expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED);
      expect(frame()).toHaveAttribute(
        'title',
        'Drumless recording of Groove 120 (YouTube video player)',
      );
      expect(screen.getByRole('link', { name: /^Open in YouTube/ })).toHaveAttribute(
        'href',
        drumlessVideo.url,
      );
      expect(screen.getAllByTestId('recording-frame')).toHaveLength(1);
    });

    it('leaves the keys to the browser: Space and the pedal keys start and move nothing', async () => {
      const { user, engine } = await openSong();
      await choose(user, 'Original');
      (document.activeElement as HTMLElement).blur();

      for (const key of [' ', 'm', 'd', 's', 'c', 'ArrowUp', 'PageDown', '?']) {
        // Not cancelled: the page took nothing.
        expect(fireEvent.keyDown(document.body, { key })).toBe(true);
      }
      expect(engine.play).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('active-loop')).not.toBeInTheDocument();

      // Back on the tab every key is the page's again, with the options as they were.
      await choose(user, 'Tab');
      expect(screen.getByRole('slider', { name: 'Speed' })).toHaveValue('100');
      expect(screen.getByRole('button', { name: 'Metronome' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      (document.activeElement as HTMLElement).blur();
      expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(false);
      expect(engine.play).toHaveBeenCalledTimes(1);
    });

    it('a tap or a drag on the score moves nothing and opens no form', async () => {
      const { user, engine } = await openSong();
      await choose(user, 'Original');

      act(() => engine.fire('barTapped', { barIndex: 11 }));
      act(() => engine.fire('barsDragged', { fromBarIndex: 2, toBarIndex: 5, done: true }));
      expect(engine.seek).not.toHaveBeenCalled();

      await choose(user, 'Tab');
      expect(status()).toHaveTextContent('Bar 1 of 16');
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      // The same tap now seeks: it was the source that held it.
      act(() => engine.fire('barTapped', { barIndex: 11 }));
      expect(status()).toHaveTextContent('Bar 12 of 16');
    });

    it('puts an open loop form away', async () => {
      const { user } = await openSong();
      await waitFor(() => expect(playButton()).toBeEnabled());
      const panel = within(screen.getByTestId('loop-panel'));
      await user.click(await panel.findByRole('button', { name: 'New loop' }));
      expect(panel.getByRole('form')).toBeInTheDocument();

      await choose(user, 'Original');
      await waitFor(() => expect(panel.queryByRole('form')).not.toBeInTheDocument());
      await choose(user, 'Tab');
      expect(panel.queryByRole('form')).not.toBeInTheDocument();
    });

    it('keeps the video when the tab’s file can’t be downloaded', async () => {
      serve({ links: [original] });
      storageResult.mockResolvedValue(fail('Object not found'));
      renderSong(`${SONG_A}?source=original`);
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't download this song's file.",
      );
    });
  });

  describe('?source=', () => {
    it('opens on the recording, with no Play to start the tab under it, before the player is ready', async () => {
      await openSong({ query: '?source=original', ready: false });
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      expect(source('Original')).toBeChecked();
      expectNoTabControls();
    });

    it('falls back to Tab for a kind the song has no video for, and takes it out of the address', async () => {
      await openSong({ query: '?source=drumless', links: [original, spotifyLink()] });
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      noFrame();
      expect(source('Tab')).toBeChecked();
      await waitFor(() => expect(playButton()).toBeEnabled());
      expect(playedWrites()).toEqual([]);
    });

    it.each(['bogus', 'tab', 'other', 'javascript:alert(1)'])(
      'is the tab for ?source=%s',
      async (value) => {
        await openSong({ query: `?source=${encodeURIComponent(value)}` });
        await waitFor(() => expect(playButton()).toBeEnabled());
        await screen.findByRole('radiogroup', { name: 'Play along with' });
        noFrame();
        expect(source('Tab')).toBeChecked();
      },
    );

    it('waits for the links to be read, then shows the recording, never the tab’s controls first', async () => {
      serve({ links: [original] });
      const release = links.holdNext('select');
      renderSong(`${SONG_A}?source=original`);
      expect(await screen.findByText('Loading the recording…')).toBeVisible();
      await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
      act(() => engines[0]!.finishLoading({ barCount: 16, trackCount: 3 }));
      expect(screen.queryByRole('button', { name: /^(Play|Pause)$/ })).not.toBeInTheDocument();
      noFrame();

      release();
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
    });

    describe('on a links read that hangs (Unit 20, 14.4b)', () => {
      // Only the timers are faked, and they still run in real time, so Testing Library's
      // waits and TanStack Query work as ever; `later` jumps the wait for the read.
      beforeEach(() =>
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true }),
      );
      afterEach(() => vi.useRealTimers());
      const later = (ms: number) => act(() => vi.advanceTimersByTime(ms));

      it('gives up for the tab, which needs no network, and a late answer only offers the recording', async () => {
        serve({ links: [original] });
        const release = links.holdNext('select');
        renderSong(`${SONG_A}?source=original`);
        const user = userEvent.setup();
        expect(await screen.findByText('Loading the recording…')).toBeVisible();
        await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
        const engine = engines[0]!;
        act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
        later(FRESH_READ_WAIT_MS - 500);
        await settle();
        expect(screen.getByText('Loading the recording…')).toBeVisible();
        expect(screen.queryByRole('button', { name: /^(Play|Pause)$/ })).not.toBeInTheDocument();

        later(500);

        await waitFor(() => expect(playButton()).toBeEnabled());
        expect(screen.queryByText('Loading the recording…')).not.toBeInTheDocument();
        noFrame();
        // The request is dropped from the URL, so the answer can't switch the source later.
        await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
        await user.click(playButton());
        act(() => engine.fire('stateChanged', { playing: true }));

        release();

        expect(await screen.findByRole('radio', { name: 'Original' })).not.toBeChecked();
        await settle();
        expect(source('Tab')).toBeChecked();
        noFrame();
        expect(playButton()).toHaveTextContent('Pause');
        expect(engine.pause).not.toHaveBeenCalled();
        expect(playedWrites()).toEqual([]);
      });

      // Unit 20 Test: the tab's player is loaded under "Loading the recording…", so the key
      // has to refuse by itself while no Play is offered.
      it('Space plays nothing while the recording is waited for, and plays the tab once the wait is over', async () => {
        serve({ links: [original] });
        links.holdNext('select');
        renderSong(`${SONG_A}?source=original`);
        const user = userEvent.setup();
        expect(await screen.findByText('Loading the recording…')).toBeVisible();
        await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
        const engine = engines[0]!;
        act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
        later(FRESH_READ_WAIT_MS - 500);
        expect(document.activeElement).toBe(document.body);

        await user.keyboard(' ');
        await settle();
        expect(engine.play).not.toHaveBeenCalled();
        expect(screen.getByText('Loading the recording…')).toBeVisible();

        later(500);
        await waitFor(() => expect(playButton()).toBeEnabled());
        await user.keyboard(' ');
        expect(engine.play).toHaveBeenCalledTimes(1);
      });

      it('an answer inside the wait shows the recording, and the wait ending changes nothing', async () => {
        serve({ links: [original] });
        const release = links.holdNext('select');
        renderSong(`${SONG_A}?source=original`);
        expect(await screen.findByText('Loading the recording…')).toBeVisible();
        later(FRESH_READ_WAIT_MS - 500);

        release();
        expect(await frameShown()).toHaveAttribute('src', EMBED_URL);

        later(FRESH_READ_WAIT_MS);
        await settle();
        expect(frame()).toHaveAttribute('src', EMBED_URL);
        expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
      });

      it('a recording the cached links have shows at once and stays through the wait', async () => {
        const queryClient = testQueryClient();
        queryClient.setQueryData(linksKey, [original]);
        await queryClient.invalidateQueries({ queryKey: linksKey, refetchType: 'none' });
        serve({ links: [original] });
        links.holdNext('select');
        renderRoutes(<Route path="/songs/:id/play" element={<SongPage />} />, {
          path: `/songs/${SONG_A}/play?source=original`,
          queryClient,
        });
        expect(await frameShown()).toHaveAttribute('src', EMBED_URL);

        later(FRESH_READ_WAIT_MS * 2);
        await settle();
        expect(frame()).toHaveAttribute('src', EMBED_URL);
        expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
      });
    });

    // Copilot review on #36: with both songs' rows on the device the screen stays mounted from
    // one song to the next, so whatever it keeps per `?source=` has to be kept per song too.
    describe('from one song straight to another on the same source', () => {
      beforeEach(() =>
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true }),
      );
      afterEach(() => vi.useRealTimers());
      const later = (ms: number) => act(() => vi.advanceTimersByTime(ms));

      // The second song's video, with the player parameters every frame carries since Unit 19.
      const B_EMBED = EMBED_URL.replace(/embed\/[^?]+/, 'embed/bbbbbbbbbbb');
      const originalOfB = videoLink('link-original-b', {
        song_id: SONG_B,
        url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      });
      const pathOf = (songId: string) => `/songs/${songId}/play?source=original`;

      /**
       * On song A's Original for longer than the wait, then Back to song B's, whose links
       * read is held: `cachedLinksOfB` is what the device has of them (a list from before
       * the link was saved, or nothing). Returns what lets the read answer.
       */
      async function fromSongAToSongB({ cachedLinksOfB }: { cachedLinksOfB?: SongLinkRow[] } = {}) {
        const queryClient = testQueryClient();
        queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
        queryClient.setQueryData(songKeys.detail(USER, SONG_B), songRow(SONG_B));
        if (cachedLinksOfB) {
          const key = songLinkKeys.forSong(USER, SONG_B);
          queryClient.setQueryData(key, cachedLinksOfB);
          await queryClient.invalidateQueries({ queryKey: key, refetchType: 'none' });
        }
        serve({ links: [original, originalOfB] });
        renderRoutes(<Route path="/songs/:id/play" element={<SongPage />} />, {
          path: pathOf(SONG_A),
          before: [pathOf(SONG_B)],
          queryClient,
        });
        expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
        await waitFor(() => expect(playedWrites()).toHaveLength(1));
        later(FRESH_READ_WAIT_MS * 2);

        const release = links.holdNext('select');
        historyBack();
        expect(
          await screen.findByRole('heading', { level: 1, name: 'Tempo Change' }),
        ).toBeVisible();
        return release;
      }

      it("waits for the second song's recording until its answer, though the wait on the first is long over", async () => {
        const release = await fromSongAToSongB({ cachedLinksOfB: [] });
        await settle();
        expect(screen.getByText('Loading the recording…')).toBeVisible();
        expect(location()).toBe(pathOf(SONG_B));
        later(FRESH_READ_WAIT_MS - 500);
        await settle();
        expect(screen.getByText('Loading the recording…')).toBeVisible();

        release();

        expect(await frameShown()).toHaveAttribute('src', B_EMBED);
        expect(location()).toBe(pathOf(SONG_B));
      });

      it("gives up on the second song's recording only after that song's own wait", async () => {
        await fromSongAToSongB();
        later(FRESH_READ_WAIT_MS - 500);
        await settle();
        expect(screen.getByText('Loading the recording…')).toBeVisible();
        expect(location()).toBe(pathOf(SONG_B));

        later(500);

        await waitFor(() => expect(location()).toBe(`/songs/${SONG_B}/play`));
        expect(screen.queryByText('Loading the recording…')).not.toBeInTheDocument();
        noFrame();
      });

      it('counts the second song as played too, once its recording shows', async () => {
        const release = await fromSongAToSongB();
        release();
        expect(await frameShown()).toHaveAttribute('src', B_EMBED);

        await waitFor(() => expect(playedWrites()).toHaveLength(2));
        expect(playedWrites()[0]!.ops).toContainEqual({ method: 'eq', args: ['id', SONG_A] });
        expect(playedWrites()[1]!.ops).toContainEqual({ method: 'eq', args: ['id', SONG_B] });
        await settle();
        expect(playedWrites()).toHaveLength(2);
      });
    });

    it('opens a link saved on another device since the list was cached', async () => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(linksKey, []);
      await queryClient.invalidateQueries({
        queryKey: linksKey,
        refetchType: 'none',
      });
      await openSong({ query: '?source=original', queryClient });
      expect(await frameShown()).toBeInTheDocument();
      expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
    });

    it('once it has settled on Tab, a link saved later doesn’t take the tab away from someone playing it', async () => {
      const queryClient = testQueryClient();
      const { user, engine } = await openSong({
        query: '?source=original',
        links: [],
        queryClient,
      });
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      await waitFor(() => expect(playButton()).toBeEnabled());
      await user.click(playButton());
      act(() => engine.fire('stateChanged', { playing: true }));

      links.setRows([original]);
      await act(() => queryClient.invalidateQueries({ queryKey: linksKey }));
      // The switch appears, as an offer; the source stays the tab, still playing.
      expect(await screen.findByRole('radio', { name: 'Original' })).not.toBeChecked();
      noFrame();
      expect(playButton()).toHaveTextContent('Pause');
      expect(engine.pause).not.toHaveBeenCalled();
    });

    it('opens on the tab when the links can’t be read, offline or failing', async () => {
      serve({ links: [original] });
      links.failNext('select', { message: 'TypeError: Failed to fetch', code: '' });
      renderSong(`${SONG_A}?source=original`);
      await loadPlayer();
      noFrame();
      noSources();
    });

    it('isn’t read on a visit that came for the loop form', async () => {
      await openSong({ query: '?new=1&source=original' });
      await waitFor(() => expect(playButton()).toBeEnabled());
      expect(await within(screen.getByTestId('loop-panel')).findByRole('form')).toBeInTheDocument();
      await settle();
      noFrame();
      noSources();
    });
  });

  describe('Back', () => {
    it('goes to the song, not through the sources that were looked at', async () => {
      const { user } = await openSong({
        links: [original, drumlessVideo],
        before: [`/songs/${SONG_A}`],
      });
      await choose(user, 'Original');
      await choose(user, 'Drumless');
      await choose(user, 'Tab');
      await choose(user, 'Drumless');
      expect(location()).toBe(`/songs/${SONG_A}/play?source=drumless`);

      historyBack();
      expect(await screen.findByText('At song overview')).toBeVisible();
      noFrame();
    });

    it('from a recording the overview opened goes back to the overview', async () => {
      await openSong({ query: '?source=original', before: [`/songs/${SONG_A}`] });
      await frameShown();
      historyBack();
      expect(await screen.findByText('At song overview')).toBeVisible();
    });
  });

  describe('counts as playing the song', () => {
    it('writes the time once per opening of a source, not at each render or on the tab', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T18:30:00Z') });
      try {
        const { user } = await openSong({ links: [original, drumlessVideo] });
        await screen.findByRole('radiogroup', { name: 'Play along with' });
        await settle();
        expect(playedWrites()).toEqual([]);

        await choose(user, 'Original');
        await waitFor(() => expect(playedWrites()).toHaveLength(1));
        expect(opArgs(playedWrites()[0]!, 'update')).toEqual([
          { last_played_at: '2026-11-27T18:30:00.000Z' },
        ]);
        expect(playedWrites()[0]!.ops).toContainEqual({ method: 'eq', args: ['id', SONG_A] });
        expect(playedWrites()[0]!.ops).toContainEqual({ method: 'eq', args: ['user_id', USER] });
        await settle();
        expect(playedWrites()).toHaveLength(1);

        await choose(user, 'Drumless');
        await waitFor(() => expect(playedWrites()).toHaveLength(2));
        await choose(user, 'Tab');
        await settle();
        expect(playedWrites()).toHaveLength(2);
        await waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
      } finally {
        vi.useRealTimers();
      }
    });

    it('moves the song up the cached Songs list at once', async () => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.forUser(USER), [
        { ...songRow(SONG_A), last_practiced_at: null },
        { ...songRow(SONG_B), last_practiced_at: null, last_played_at: '2026-11-01T00:00:00Z' },
      ]);
      await openSong({ query: '?source=original', queryClient });
      await waitFor(() =>
        expect(
          queryClient
            .getQueryData<LibrarySong[]>(songKeys.forUser(USER))
            ?.find((song) => song.id === SONG_A)?.last_played_at,
        ).toEqual(expect.any(String)),
      );
    });
  });

  describe('offline', () => {
    it('shows no frame and says why, writes nothing, and the tab under it still reads', async () => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
      queryClient.setQueryData(linksKey, [original]);
      queryClient.setQueryData(['settings', USER], settingsRow);
      await offlineDb.songFiles.put({
        userId: USER,
        songId: SONG_A,
        bytes: new Uint8Array(fileBytes(SONG_A)),
      });
      act(() => onlineManager.setOnline(false));
      await openSong({ query: '?source=original', queryClient });

      expect(
        await screen.findByText("You're offline. The video needs a connection."),
      ).toBeVisible();
      noFrame();
      expect(document.querySelector('iframe')).toBeNull();
      expect(screen.getByTestId('score-viewport')).toBeVisible();
      await settle();
      expect(playedWrites()).toEqual([]);
      expect(await offlineDb.outbox.count()).toBe(0);

      // The connection comes back: the frame loads, and that is the opening that counts.
      act(() => onlineManager.setOnline(true));
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      await waitFor(() => expect(playedWrites()).toHaveLength(1));
    });
  });

  // 14 QA fix round 1.
  describe('the score under a recording on a phone (QA issue 2)', () => {
    // jsdom has no matchMedia, so the layout goes by the window's width.
    beforeEach(() => vi.stubGlobal('innerWidth', 390));
    afterEach(() => vi.unstubAllGlobals());

    it('is drawn as a page, lines down the screen, and goes back to one line on Tab, without a restart', async () => {
      const { user, engine } = await openSong();
      expect(engine.mount?.layout).toBe('horizontal');
      const restarts = engine.restartCalls();

      await choose(user, 'Original');
      await waitFor(() => expect(engine.setLayout).toHaveBeenLastCalledWith('page'));
      expect(frame()).toBeInTheDocument();

      await choose(user, 'Tab');
      await waitFor(() => expect(engine.setLayout).toHaveBeenLastCalledWith('horizontal'));
      // Redrawn only: nothing was stopped, started or loaded again.
      expect(engine.restartCalls()).toBe(restarts);
      expect(engine.loadScore).toHaveBeenCalledTimes(1);
      expect(engine.play).not.toHaveBeenCalled();
    });

    it('opens as a page when the screen opens on the recording', async () => {
      const { engine } = await openSong({ query: '?source=original' });
      expect(engine.mount?.layout).toBe('page');
      expect(engine.setLayout).not.toHaveBeenCalledWith('horizontal');
    });

    it('back on Tab, brings the bar the paused player is at back on show in its one line', async () => {
      const { user, engine } = await openSong();
      // Paused at bar 9, as after playing that far.
      act(() => engine.fire('position', { tick: startOfBar(9) }));
      await choose(user, 'Original');
      await waitFor(() => expect(engine.setLayout).toHaveBeenLastCalledWith('page'));
      engine.scrollToBar.mockClear();

      await choose(user, 'Tab');
      await waitFor(() => expect(engine.scrollToBar).toHaveBeenLastCalledWith(8));
      // After the layout was asked for, so the scroll is to the bar's place in the new drawing.
      expect(engine.scrollToBar.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
        engine.setLayout.mock.invocationCallOrder.at(-1)!,
      );
      expect(engine.seek).not.toHaveBeenCalled();
    });
  });

  describe('offline on a recording, the way out (QA issue 9)', () => {
    it('locks Open in YouTube with the note beside it, refuses a press, and is heard again once back', async () => {
      await openSong({ query: '?source=original' });
      await frameShown();
      const out = screen.getByRole('link', { name: /^Open in YouTube/ });
      expectUnlocked(out);
      expect(fireEvent.click(out)).toBe(true);

      // Pressed before the link has caught up with the connection going: refused all the same.
      let allowed = true;
      act(() => {
        onlineManager.setOnline(false);
        allowed = fireEvent.click(out);
      });
      expect(allowed).toBe(false);
      expectLocked(screen.getByRole('link', { name: /^Open in YouTube/ }));
      expect(screen.getByText("You're offline. The video needs a connection.")).toBeVisible();
      expect(fireEvent.click(screen.getByRole('link', { name: /^Open in YouTube/ }))).toBe(false);

      act(() => onlineManager.setOnline(true));
      const back = screen.getByRole('link', { name: /^Open in YouTube/ });
      expectUnlocked(back);
      expect(fireEvent.click(back)).toBe(true);
    });
  });

  // 14 Test: the checklist's rows for the source switch, and the cases the plan's Test focus names.
  describe('?source= for a link that is no video (14 Test)', () => {
    it.each<[string, SongLinkRow]>([
      ['a Spotify track', spotifyLink('s', { kind: 'original' })],
      ['some other site', linkRow('w', { kind: 'original', url: 'https://example.com/the-song' })],
      [
        'a YouTube channel, which names no video',
        linkRow('c', { kind: 'original', url: 'https://www.youtube.com/@somedrummer' }),
      ],
      [
        'a row that says YouTube over an address the parser refuses',
        linkRow('r', {
          kind: 'original',
          provider: 'youtube',
          url: `http://www.youtube.com/watch?v=dQw4w9WgXcQ`,
        }),
      ],
      [
        'a row that says YouTube over a look-alike host',
        linkRow('l', {
          kind: 'original',
          provider: 'youtube',
          url: `https://youtube.com.evil.test/embed/dQw4w9WgXcQ`,
        }),
      ],
    ])('is the tab when the song’s Original is %s', async (_name, row) => {
      await openSong({ query: '?source=original', links: [row, drumlessVideo] });
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      await waitFor(() => expect(playButton()).toBeEnabled());
      noFrame();
      expect(document.querySelector('iframe')).toBeNull();
      // The Drumless video is still offered; the Original that isn't one never is.
      expect(source('Tab')).toBeChecked();
      expect(within(sources()).queryByRole('radio', { name: 'Original' })).not.toBeInTheDocument();
      await settle();
      expect(playedWrites()).toEqual([]);
    });
  });

  describe('Back and Forward (14 Test)', () => {
    it('Forward after Back opens the recording again; the sources in between were never entries', async () => {
      await openSong({ query: '?source=original', before: [`/songs/${SONG_A}`] });
      await frameShown();
      historyBack();
      expect(await screen.findByText('At song overview')).toBeVisible();
      noFrame();

      historyForward();
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
      expect(source('Original')).toBeChecked();
      expectNoTabControls();
    });

    it('Forward comes back to the source the screen was left on, the tab included', async () => {
      const { user } = await openSong({
        query: '?source=original',
        before: [`/songs/${SONG_A}`],
        links: [original, drumlessVideo],
      });
      await frameShown();
      await choose(user, 'Drumless');
      await choose(user, 'Tab');
      historyBack();
      expect(await screen.findByText('At song overview')).toBeVisible();

      historyForward();
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      await screen.findByRole('radiogroup', { name: 'Play along with' });
      expect(source('Tab')).toBeChecked();
      noFrame();
      // And nothing further forward: the three sources were one entry.
      historyForward();
      await settle();
      expect(location()).toBe(`/songs/${SONG_A}/play`);
    });
  });

  describe('with a loop on the go (14 Test)', () => {
    const panel = () => within(screen.getByTestId('loop-panel'));
    const sessionsSent = () =>
      queryResult.mock.calls
        .map(([call]) => call)
        .filter((call) => call.table === 'practice_sessions')
        .map((call) => opArgs(call, 'upsert')?.[0] as Record<string, unknown>);

    it('a recording stops the loop that was playing and leaves it set up: back on Tab it is the same loop at its speed', async () => {
      const { user, engine } = await openSong();
      await waitFor(() => expect(playButton()).toBeEnabled());
      await user.click(await panel().findByRole('button', { name: 'Play loop Verse' }));
      act(() => engine.fire('stateChanged', { playing: true }));
      expect(screen.getByTestId('active-loop')).toHaveTextContent('Verse');
      const rangeSets = engine.setPlaybackRange.mock.calls.length;

      await choose(user, 'Original');
      await waitFor(() => expect(engine.pause).toHaveBeenCalled());
      act(() => engine.fire('stateChanged', { playing: false }));
      expect(frame()).toBeInTheDocument();
      expectNoTabControls();

      await choose(user, 'Tab');
      expect(screen.getByTestId('active-loop')).toHaveTextContent('Verse');
      expect(screen.getByTestId('jam-speed')).toHaveTextContent('80%');
      expect(playButton()).toHaveTextContent('Play');
      // The loop's range was never taken off or set again, and its speed never written.
      expect(engine.setPlaybackRange.mock.calls).toHaveLength(rangeSets);
      await settle();
      expect(loops.sent('update')).toEqual([]);
      // Play carries on with the loop.
      const plays = engine.play.mock.calls.length;
      await user.click(playButton());
      expect(engine.play.mock.calls).toHaveLength(plays + 1);
      expect(screen.getByTestId('active-loop')).toHaveTextContent('Verse');
    });

    it('time on a recording is not loop practice: the session ends at the switch, and none is logged for the video', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-27T18:00:00Z') });
      try {
        const { user, engine } = await openSong();
        await waitFor(() => expect(playButton()).toBeEnabled());
        await user.click(await panel().findByRole('button', { name: 'Play loop Verse' }));
        act(() => engine.fire('stateChanged', { playing: true }));
        vi.setSystemTime(Date.now() + 40_000);

        await choose(user, 'Original');
        await waitFor(() => expect(engine.pause).toHaveBeenCalled());
        act(() => engine.fire('stateChanged', { playing: false }));
        await waitFor(() =>
          expect(sessionsSent()).toEqual([
            expect.objectContaining({ loop_id: 'verse', duration_seconds: 40, speed_ratio: 0.8 }),
          ]),
        );

        // Ten minutes of the video, then back.
        vi.setSystemTime(Date.now() + 600_000);
        await choose(user, 'Tab');
        await settle();
        expect(sessionsSent()).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a loop save still on its way when a recording is chosen lands, and the loop is in the list on Tab', async () => {
      const { user } = await openSong({ loops: [] });
      await waitFor(() => expect(playButton()).toBeEnabled());
      await user.click(await panel().findByRole('button', { name: 'New loop' }));
      const form = within(panel().getByRole('form'));
      await user.type(form.getByLabelText('Name'), 'Bridge');
      await user.type(form.getByLabelText('First bar'), '3');
      await user.type(form.getByLabelText('Last bar'), '4');
      const release = loops.holdNext('insert');
      await user.click(form.getByRole('button', { name: 'Save loop' }));

      await choose(user, 'Original');
      expect(frame()).toBeInTheDocument();
      // Its form is kept, out of sight, for the answer.
      expect(screen.getByTestId('loop-panel')).not.toBeVisible();
      expect(panel().getByRole('form')).toBeInTheDocument();

      release();
      await waitFor(() => expect(loops.sent('insert')).toHaveLength(1));
      await waitFor(() => expect(panel().queryByRole('form')).not.toBeInTheDocument());
      await choose(user, 'Tab');
      expect(await screen.findByTestId('active-loop')).toHaveTextContent('Bridge');
      expect(panel().queryByRole('form')).not.toBeInTheDocument();
    });
  });

  describe('events that arrive after the switch (14 Test)', () => {
    it('a Play the engine reports only after a recording was chosen ends stopped, and its late end restarts nothing', async () => {
      const { user, engine } = await openSong();
      await waitFor(() => expect(playButton()).toBeEnabled());
      await user.click(playButton());
      expect(engine.play).toHaveBeenCalledTimes(1);
      await choose(user, 'Original');

      // The worker's answers, in the order the engine was told: playing, then stopped.
      act(() => engine.fire('stateChanged', { playing: true }));
      await waitFor(() => expect(engine.pause).toHaveBeenCalled());
      // The last word to the engine is the pause.
      expect(engine.pause.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
        engine.play.mock.invocationCallOrder.at(-1)!,
      );
      act(() => engine.fire('stateChanged', { playing: false }));
      act(() => engine.fire('finished', undefined));
      await settle();
      expect(engine.play).toHaveBeenCalledTimes(1);
      expectNoTabControls();

      await choose(user, 'Tab');
      expect(playButton()).toHaveTextContent('Play');
      expect(engine.play).toHaveBeenCalledTimes(1);
    });

    it('the sounds coming in after a recording was chosen start nothing and offer no Play', async () => {
      const { engine } = await openSong({ query: '?source=original', ready: false });
      await frameShown();
      act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
      await settle();
      expectNoTabControls();
      expect(engine.play).not.toHaveBeenCalled();
      expect(screen.getAllByTestId('recording-frame')).toHaveLength(1);
    });
  });

  describe('the links read again while on a recording (14 Test)', () => {
    it('a link removed on another device puts the screen back on the tab, stopped, with the address saying so', async () => {
      const queryClient = testQueryClient();
      const { engine } = await openSong({ query: '?source=original', queryClient });
      await frameShown();

      links.setRows([]);
      await act(() => queryClient.invalidateQueries({ queryKey: linksKey }));
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      noFrame();
      noSources();
      await waitFor(() => expect(playButton()).toBeEnabled());
      expect(playButton()).toHaveTextContent('Play');
      expect(engine.play).not.toHaveBeenCalled();
    });

    it('a link pointed at another video is a new frame, and not another opening', async () => {
      const queryClient = testQueryClient();
      await openSong({ query: '?source=original', queryClient });
      const first = await frameShown();
      await waitFor(() => expect(playedWrites()).toHaveLength(1));

      links.setRows([{ ...original, url: drumlessVideo.url }]);
      await act(() => queryClient.invalidateQueries({ queryKey: linksKey }));
      await waitFor(() => expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED));
      expect(first).not.toBeInTheDocument();
      expect(screen.getAllByTestId('recording-frame')).toHaveLength(1);
      expect(screen.getByRole('link', { name: /^Open in YouTube/ })).toHaveAttribute(
        'href',
        drumlessVideo.url,
      );
      expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
      await settle();
      expect(playedWrites()).toHaveLength(1);
    });

    it('a read that fails over the links keeps the very frame that is playing', async () => {
      const queryClient = testQueryClient();
      await openSong({ query: '?source=original', queryClient });
      const first = await frameShown();

      links.failNext('select', { message: 'TypeError: Failed to fetch', code: '' });
      await act(() => queryClient.invalidateQueries({ queryKey: linksKey }));
      await waitFor(() => expect(queryClient.getQueryState(linksKey)?.status).toBe('error'));
      expect(queryClient.getQueryData(linksKey)).toHaveLength(1);
      // The same element: a frame made anew would start the video from the top.
      expect(frame()).toBe(first);
      expect(source('Original')).toBeChecked();
      expect(location()).toBe(`/songs/${SONG_A}/play?source=original`);
    });

    it('an unchanged list read again keeps the very frame too', async () => {
      const queryClient = testQueryClient();
      await openSong({ query: '?source=original', queryClient });
      const first = await frameShown();
      const reads = () => queryResult.mock.calls.filter(([c]) => c.table === 'song_links').length;
      const before = reads();
      await act(() => queryClient.invalidateQueries({ queryKey: linksKey }));
      await waitFor(() => expect(reads()).toBeGreaterThan(before));
      await settle();
      expect(frame()).toBe(first);
      expect(playedWrites()).toHaveLength(1);
    });
  });

  describe('the connection going and coming back (14 Test)', () => {
    it('on a recording: the frame goes, the note says why, and back online it is one opening, not two', async () => {
      await openSong({ query: '?source=original' });
      await frameShown();
      await waitFor(() => expect(playedWrites()).toHaveLength(1));

      act(() => onlineManager.setOnline(false));
      expect(
        await screen.findByText("You're offline. The video needs a connection."),
      ).toBeVisible();
      noFrame();
      expect(source('Original')).toBeChecked();
      // The way out is a link the browser would fail on, but the tab is one press away.
      expect(source('Tab')).toBeEnabled();

      act(() => onlineManager.setOnline(true));
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      await settle();
      expect(playedWrites()).toHaveLength(1);
      expect(await offlineDb.outbox.count()).toBe(0);
    });

    it('offline with the links never read, ?source= is the tab, which plays; a link read later is only offered', async () => {
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
      queryClient.setQueryData(['settings', USER], settingsRow);
      await offlineDb.songFiles.put({
        userId: USER,
        songId: SONG_A,
        bytes: new Uint8Array(fileBytes(SONG_A)),
      });
      act(() => onlineManager.setOnline(false));
      const { user, engine } = await openSong({ query: '?source=original', queryClient });

      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      noFrame();
      await waitFor(() => expect(playButton()).toBeEnabled());
      await user.click(playButton());
      expect(engine.play).toHaveBeenCalledTimes(1);
      act(() => engine.fire('stateChanged', { playing: true }));

      act(() => onlineManager.setOnline(true));
      expect(await screen.findByRole('radio', { name: 'Original' })).not.toBeChecked();
      await settle();
      noFrame();
      expect(playButton()).toHaveTextContent('Pause');
      expect(engine.pause).not.toHaveBeenCalled();
      expect(playedWrites()).toEqual([]);
    });
  });

  describe('under StrictMode (14 Test)', () => {
    // At the root, as main.tsx has it: StrictMode further down doesn't run a mount's effects twice.
    beforeEach(() => configure({ reactStrictMode: true }));
    afterEach(() => configure({ reactStrictMode: false }));

    function renderStrict(query: string, savedLinks: SongLinkRow[]) {
      serve({ loops: [verse], links: savedLinks });
      // The song and its links are cached, as they are coming from the overview: the screen
      // then mounts already on its source, and it is the mount whose effects run twice.
      const queryClient = testQueryClient();
      queryClient.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
      queryClient.setQueryData(linksKey, savedLinks);
      renderRoutes(<Route path="/songs/:id/play" element={<SongPage />} />, {
        path: `/songs/${SONG_A}/play${query}`,
        queryClient,
      });
      return userEvent.setup();
    }

    it('one opening is one frame and one write, and each source opened after it one more', async () => {
      const user = renderStrict('?source=original', [original, drumlessVideo]);
      expect(await frameShown()).toHaveAttribute('src', EMBED_URL);
      await waitFor(() => expect(playedWrites()).toHaveLength(1));
      await waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
      await settle();
      expect(playedWrites()).toHaveLength(1);
      expect(screen.getAllByTestId('recording-frame')).toHaveLength(1);
      expect(document.querySelectorAll('iframe')).toHaveLength(1);

      await choose(user, 'Drumless');
      await waitFor(() => expect(playedWrites()).toHaveLength(2));
      expect(screen.getAllByTestId('recording-frame')).toHaveLength(1);
      await choose(user, 'Tab');
      await settle();
      expect(playedWrites()).toHaveLength(2);
      noFrame();
      await choose(user, 'Original');
      await waitFor(() => expect(playedWrites()).toHaveLength(3));
      await waitFor(async () => expect(await offlineDb.outbox.count()).toBe(0));
      await settle();
      expect(playedWrites()).toHaveLength(3);
    });

    it('a source the song lacks is dropped from the address, and the tab is what shows', async () => {
      renderStrict('?source=drumless', [spotifyLink()]);
      await waitFor(() => expect(location()).toBe(`/songs/${SONG_A}/play`));
      await settle();
      noFrame();
      noSources();
      expect(playedWrites()).toEqual([]);
    });
  });

  // QA (after fix round 1) issue 1: the tab's bar and beat cursor stand still under a video and
  // read as a playhead. The score box says it is only read (`score-read-only`, which index.css
  // draws no cursor for; recordings.spec.ts measures the cursor itself), and nothing else changes.
  describe('the tab’s cursor under a recording (14 Review)', () => {
    const scoreBox = () => screen.getByTestId('score-viewport');

    it('isn’t drawn on a recording and is back on Tab, with the player left as it was', async () => {
      const { user, engine } = await openSong();
      act(() => engine.fire('position', { tick: startOfBar(9) }));
      expect(scoreBox()).toHaveClass('jam-score');
      expect(scoreBox()).not.toHaveClass('score-read-only');
      const restarts = engine.restartCalls();

      await choose(user, 'Original');
      await frameShown();
      expect(scoreBox()).toHaveClass('jam-score', 'score-read-only');

      await choose(user, 'Tab');
      await waitFor(() => expect(scoreBox()).not.toHaveClass('score-read-only'));
      // A drawing change only: the bar is kept, and nothing was stopped, started, moved or loaded.
      expect(await screen.findByTestId('player-status')).toHaveTextContent('Bar 9 of 16');
      expect(engine.restartCalls()).toBe(restarts);
      expect(engine.loadScore).toHaveBeenCalledTimes(1);
      expect(engine.seek).not.toHaveBeenCalled();
    });

    it('isn’t drawn while the links are still read for the source the screen opened on', async () => {
      serve({ links: [original] });
      const release = links.holdNext('select');
      renderSong(`${SONG_A}?source=original`);
      expect(await screen.findByText('Loading the recording…')).toBeVisible();
      await waitFor(() => expect(engines[0]?.loadScore).toHaveBeenCalled());
      expect(scoreBox()).toHaveClass('score-read-only');
      release();
      await frameShown();
      expect(scoreBox()).toHaveClass('score-read-only');
    });
  });

  describe('the tab follows the video (Unit 19)', () => {
    /** Sixteen 4/4 bars at 120 BPM: two seconds a bar. With bar 1 at 4 s, bar n starts at 4 + 2(n - 1). */
    const BAR_ONE = 4;
    const lined = videoLink('link-original', { bar_one_seconds: BAR_ONE });
    const lineUp = () => screen.getByTestId('line-up');
    const message = () => screen.getByTestId('line-up-message');
    const said = () => screen.getByTestId('line-up-announcement');
    const lineUpButton = (name: string) => within(lineUp()).getByRole('button', { name });
    const noLineUpButton = (name: string) =>
      expect(within(lineUp()).queryByRole('button', { name })).not.toBeInTheDocument();
    /** The bars the engine was last told to mark, 1-based, or null for none. */
    const marked = (engine: FakePlayerEngine) => {
      const range = engine.setHighlight.mock.lastCall?.[0] as
        { startBarIndex: number; endBarIndex: number } | null | undefined;
      return range ? [range.startBarIndex + 1, range.endBarIndex + 1] : null;
    };
    /** The bars the score box was asked to bring on show, 1-based, in order. */
    const shown = (engine: FakePlayerEngine) =>
      engine.scrollToBar.mock.calls.map(([barIndex]) => barIndex + 1);
    const barOneSent = () =>
      (links.sent('update') as { bar_one_seconds?: number | null }[]).map(
        (sent) => sent.bar_one_seconds,
      );

    /** The play screen on the Original's video, its player made. */
    async function openVideo(options: Parameters<typeof openSong>[0] = {}) {
      const opened = await openSong({ links: [lined], query: '?source=original', ...options });
      await frameShown();
      const { engine } = opened;
      return {
        ...opened,
        video: currentRecordingPlayer(),
        /** A tap on a bar of the score, 1-based. */
        tapBar: (barNumber: number) =>
          act(() => engine.fire('barTapped', { barIndex: barNumber - 1 })),
        /** Where a bar (1-based) is drawn in the window, top to bottom: jsdom lays nothing out. */
        placeBar: (barNumber: number, top: number, bottom: number) =>
          engine.barRects.set(barNumber - 1, { top, bottom, left: 0, right: 200 }),
      };
    }

    /**
     * The window's `scrollBy` for a describe (jsdom has none): what the follow asked the
     * window to scroll by. Takes away any tab bar a test added with `addTabBar`.
     */
    function watchWindowScroll() {
      const scrollBy = vi.fn();
      beforeEach(() => {
        scrollBy.mockReset();
        vi.stubGlobal('scrollBy', scrollBy);
      });
      afterEach(() => {
        vi.unstubAllGlobals();
        document.querySelector('[data-bottom-tabs]')?.remove();
      });
      return scrollBy;
    }

    /** A phone's tab bar as AppShell marks it, with the box the browser would give it. */
    function addTabBar(box: { top: number; bottom: number; height: number }) {
      const tabs = document.createElement('nav');
      tabs.setAttribute('data-bottom-tabs', '');
      tabs.getBoundingClientRect = () => box as DOMRect;
      document.body.append(tabs);
    }

    describe('a link that isn’t lined up', () => {
      it('offers the line-up under the video, off until the video has been played, and marks and moves nothing', async () => {
        const { engine, video, tapBar } = await openVideo({ links: [original] });
        expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
        expectLocked(lineUpButton('Bar 1 starts now'));
        noLineUpButton('Tab later');
        noLineUpButton('Follow');

        act(() => video.becomeReady());
        expectLocked(lineUpButton('Bar 1 starts now'));
        act(() => video.playAt(12));
        expectUnlocked(lineUpButton('Bar 1 starts now'));
        act(() => video.tick(20));
        // Paused on a video that has been started: its clock is still the song's (19 QA issue 9).
        act(() => video.pauseAt(21));
        expectUnlocked(lineUpButton('Bar 1 starts now'));

        // Exactly Unit 14: no bar marked, nothing scrolled, a tap does nothing, nothing saved.
        tapBar(6);
        await settle();
        expect(marked(engine)).toBeNull();
        expect(shown(engine)).toEqual([]);
        expect(video.seekTo).not.toHaveBeenCalled();
        expect(links.sent('update')).toEqual([]);
        expect(screen.getByTestId('score-viewport')).not.toHaveClass('score-tappable');
      });

      it('a press before the video has been played saves nothing and says why; paused on a started video it saves the paused clock', async () => {
        const { user, engine, video } = await openVideo({ links: [original] });
        act(() => video.becomeReady());
        await user.click(lineUpButton('Bar 1 starts now'));
        expect(message()).toHaveTextContent('Press Play on the video first.');
        expect(said()).toHaveTextContent('Press Play on the video first.');
        await settle();
        expect(links.sent('update')).toEqual([]);

        act(() => video.playAt(3));
        act(() => video.pauseAt(3.5));
        expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
        await user.click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(barOneSent()).toEqual([3.5]));
        // Bar 1 is marked on the paused clock itself, with nothing played since.
        expect(marked(engine)).toEqual([1, 1]);
      });

      it('a video already playing when its player first answers is followed, with no pause and play (19 QA issue 3)', async () => {
        const { user, engine, video } = await openVideo();
        // A slow connection: YouTube's script lands with the video nine seconds in.
        act(() => video.set({ status: 'ready', started: true, playing: true, seconds: 9 }));
        expect(marked(engine)).toEqual([3, 3]);
        expect(shown(engine)).toEqual([3]);
        // Space works it: no "press Play on the video once".
        await user.keyboard(' ');
        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        await user.click(lineUpButton('Line up again'));
        expectUnlocked(lineUpButton('Bar 1 starts now'));
      });
    });

    describe('lining up', () => {
      it('saves the video’s time at the press with the link, and the nudges take the prompt’s place', async () => {
        const { user, engine, video } = await openVideo({ links: [original] });
        act(() => video.playAt(7.4321));
        await user.click(lineUpButton('Bar 1 starts now'));

        await waitFor(() => expect(barOneSent()).toEqual([7.432]));
        expect(links.rows()[0]).toMatchObject({ id: original.id, bar_one_seconds: 7.432 });
        expect(message()).toHaveTextContent('Bar 1 at 0:07.43. Drifting? Nudge the tab.');
        expect(said()).toHaveTextContent('Lined up. Bar 1 at 0:07.43.');
        noLineUpButton('Bar 1 starts now');
        expect(lineUpButton('Tab earlier')).toBeInTheDocument();
        expect(lineUpButton('Tab later')).toBeInTheDocument();
        expect(lineUpButton('Follow')).toHaveAttribute('aria-pressed', 'true');
        // The button pressed has gone: focus is on the one that stands in its place.
        await waitFor(() => expect(lineUpButton('Line up again')).toHaveFocus());
        // And the tab follows from that moment: the video is in bar 1.
        expect(marked(engine)).toEqual([1, 1]);
        expect(screen.getByTestId('score-viewport')).toHaveClass('score-tappable');
      });

      it('takes the clock at the press, not when the save answers', async () => {
        const { user, video } = await openVideo({ links: [original] });
        act(() => video.playAt(10));
        const release = links.holdNext('update');
        await user.click(lineUpButton('Bar 1 starts now'));
        // The video plays on while the save is on its way.
        act(() => video.tick(14));
        act(() => video.tick(19));
        release();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 10 }));
        expect(barOneSent()).toEqual([10]);
        expect(message()).toHaveTextContent('Bar 1 at 0:10.00');
      });

      it('a save the server refuses puts the prompt back, says so in fixed copy, and focus goes with it', async () => {
        const { user, engine, video } = await openVideo({ links: [original] });
        act(() => video.playAt(5));
        const release = links.holdNext('update');
        links.failNext('update');
        await user.click(lineUpButton('Bar 1 starts now'));
        // Held: the optimistic line-up is on show, and focus has followed it.
        await waitFor(() => expect(lineUpButton('Line up again')).toHaveFocus());
        expect(marked(engine)).toEqual([1, 1]);

        release();
        expect(await within(lineUp()).findByRole('alert')).toHaveTextContent(
          'Couldn’t save the line-up. The server refused it. Try again, or reload the page.',
        );
        expect(lineUpButton('Bar 1 starts now')).toHaveFocus();
        noLineUpButton('Tab later');
        expect(marked(engine)).toBeNull();
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: null });
      });

      it('“Line up again” brings the prompt back, keeps the saved line-up until the press, and Cancel keeps it', async () => {
        const { user, engine, video } = await openVideo();
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);

        await user.click(lineUpButton('Line up again'));
        expect(lineUpButton('Bar 1 starts now')).toHaveFocus();
        expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
        // Still following on the line-up that is saved.
        expect(marked(engine)).toEqual([2, 2]);

        await user.click(lineUpButton('Cancel'));
        expect(lineUpButton('Line up again')).toHaveFocus();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        expect(links.sent('update')).toEqual([]);

        await user.click(lineUpButton('Line up again'));
        act(() => video.tick(9));
        await user.click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(barOneSent()).toEqual([9]));
        expect(message()).toHaveTextContent('Bar 1 at 0:09.00');
        // Bar 1 starts where the video is now.
        expect(marked(engine)).toEqual([1, 1]);
      });

      it('says so when the video’s player can’t be reached, with the line-up off', async () => {
        const { video } = await openVideo({ links: [original] });
        act(() => video.set({ status: 'unavailable' }));
        expect(message()).toHaveTextContent(
          'The tab can’t follow this video: its player isn’t answering here.',
        );
        expectLocked(lineUpButton('Bar 1 starts now'));
      });
    });

    describe('nudging', () => {
      it('“Tab later” and “Tab earlier” move bar 1 a quarter of a second, saved each time', async () => {
        const { user, engine, video } = await openVideo();
        // 5.9 s is in bar 1 (4 to 6 s).
        act(() => video.playAt(5.9));
        act(() => video.pauseAt(5.9));
        expect(marked(engine)).toEqual([1, 1]);

        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));
        expect(message()).toHaveTextContent('Bar 1 at 0:04.25');
        expect(said()).toHaveTextContent('Bar 1 at 0:04.25.');

        await user.click(lineUpButton('Tab earlier'));
        await user.click(lineUpButton('Tab earlier'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 4, 3.75]));
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 3.75 });
        // The same moment of the video is now in bar 2 (5.75 to 7.75 s): the mark moved with the nudge.
        expect(marked(engine)).toEqual([2, 2]);
      });

      it('two nudges in flight end on the later value, and the first answer never shows over it', async () => {
        const { user } = await openVideo();
        const releaseFirst = links.holdNext('update');
        await user.click(lineUpButton('Tab later'));
        await user.click(lineUpButton('Tab later'));
        // Each press moved what was there at the press; only the first is on the wire.
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));

        const releaseSecond = links.holdNext('update');
        releaseFirst();
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 4.5]));
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 4.25 });
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');

        releaseSecond();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 4.5 }));
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
      });

      it('a first nudge that fails doesn’t undo the second, which lands', async () => {
        const { user } = await openVideo();
        const release = links.holdNext('update');
        links.failNext('update');
        await user.click(lineUpButton('Tab later'));
        await user.click(lineUpButton('Tab later'));
        release();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 4.5 }));
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
        expect(within(lineUp()).queryByRole('alert')).not.toBeInTheDocument();
      });

      it('two nudges that both fail go back to what the server holds, not to the first’s guess', async () => {
        const { user } = await openVideo();
        const releaseFirst = links.holdNext('update');
        links.failNext('update');
        await user.click(lineUpButton('Tab later'));
        await user.click(lineUpButton('Tab later'));
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
        // The read that follows the last one is held too, so the page shows the rollback itself.
        links.holdNext('select');
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));
        // The second goes out as the first is answered: hold it, so it can be made to fail too.
        const releaseSecond = links.holdNext('update');
        releaseFirst();
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 4.5]));
        // The first failed with the second still on its way: the second's value stays on show.
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
        links.failNext('update');
        releaseSecond();
        expect(await within(lineUp()).findByRole('alert')).toHaveTextContent(
          'Couldn’t save the line-up.',
        );
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: BAR_ONE });
        // Back at what the server holds (4 s), not at the first nudge's 4.25.
        expect(lineUpButton('Tab later')).toBeInTheDocument();
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 4.5, 4.25]));
      });

      it('a read of the links set off by the window coming to the front waits for a nudge on its way', async () => {
        const { user } = await openVideo();
        const linkReads = () =>
          queryResult.mock.calls.filter(
            ([call]) =>
              call.table === 'song_links' &&
              !opArgs(call, 'update') &&
              !opArgs(call, 'insert') &&
              !opArgs(call, 'delete'),
          ).length;
        const comeToFront = () =>
          act(() => {
            focusManager.setFocused(false);
            focusManager.setFocused(true);
          });
        // The trigger is heard: with nothing on its way, the front brings a read.
        await settle();
        const idle = linkReads();
        comeToFront();
        await waitFor(() => expect(linkReads()).toBe(idle + 1));
        await settle();

        const release = links.holdNext('update');
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));
        const during = linkReads();
        comeToFront();
        await settle();
        // That read would be from before the save, and put 4 s back under the 4.25 on show.
        expect(linkReads()).toBe(during);
        expect(message()).toHaveTextContent('Bar 1 at 0:04.25');

        release();
        // The save's own read, once it has settled.
        await waitFor(() => expect(linkReads()).toBe(during + 1));
        expect(message()).toHaveTextContent('Bar 1 at 0:04.25');
      });

      it('can’t go before the video’s start', async () => {
        const { user } = await openVideo({ links: [{ ...lined, bar_one_seconds: 0.1 }] });
        await user.click(lineUpButton('Tab earlier'));
        await waitFor(() => expect(barOneSent()).toEqual([0]));
        expect(message()).toHaveTextContent('Bar 1 at 0:00.00');
        expectLocked(lineUpButton('Tab earlier'));
        await user.click(lineUpButton('Tab earlier'));
        await settle();
        expect(barOneSent()).toEqual([0]);
        expectUnlocked(lineUpButton('Tab later'));
      });
    });

    describe('following', () => {
      it('marks the bar the video is on and brings it on show, bar by bar', async () => {
        const { engine, video } = await openVideo();
        // Ready, not yet tapped: its clock says nothing about the song.
        act(() => video.becomeReady());
        expect(marked(engine)).toBeNull();

        act(() => video.playAt(BAR_ONE));
        expect(marked(engine)).toEqual([1, 1]);
        act(() => video.tick(5.9));
        expect(marked(engine)).toEqual([1, 1]);
        act(() => video.tick(6.1));
        expect(marked(engine)).toEqual([2, 2]);
        act(() => video.tick(8.2));
        expect(marked(engine)).toEqual([3, 3]);
        // Each bar once, as it came: a clock reading inside the same bar asks for nothing.
        expect(shown(engine)).toEqual([1, 2, 3]);
        // The tab's own player was never played, moved or reloaded for it.
        expect(engine.play).not.toHaveBeenCalled();
        expect(engine.seek).not.toHaveBeenCalled();
        expect(engine.loadScore).toHaveBeenCalledTimes(1);
      });

      it('holds through a pause, and goes where a seek in the video’s own controls goes', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(10.5));
        expect(marked(engine)).toEqual([4, 4]);
        act(() => video.pauseAt(10.6));
        expect(marked(engine)).toEqual([4, 4]);

        // A seek while paused, then one back while playing.
        act(() => video.set({ seconds: 30.1 }));
        expect(marked(engine)).toEqual([14, 14]);
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);
        expect(shown(engine)).toEqual([4, 14, 2]);
      });

      it('keeps the mark through buffering, and through a change of the video’s speed', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(8.5));
        expect(marked(engine)).toEqual([3, 3]);
        // Buffering: not playing, the clock where it stopped.
        act(() => video.set({ playing: false }));
        expect(marked(engine)).toEqual([3, 3]);
        // Half speed: the clock is the video's own, so the same second is the same bar…
        act(() => video.playAt(8.5, 0.5));
        expect(marked(engine)).toEqual([3, 3]);
        // …and it simply moves on more slowly.
        act(() => video.tick(9.9));
        expect(marked(engine)).toEqual([3, 3]);
        act(() => video.tick(10.05));
        expect(marked(engine)).toEqual([4, 4]);
        act(() => video.playAt(12.2, 2));
        expect(marked(engine)).toEqual([5, 5]);
      });

      it('marks nothing before bar 1 comes, or once the tab has run out', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(1));
        expect(marked(engine)).toBeNull();
        act(() => video.tick(3.99));
        expect(marked(engine)).toBeNull();
        act(() => video.tick(4));
        expect(marked(engine)).toEqual([1, 1]);
        // Sixteen bars of two seconds end at 36 s of the video.
        act(() => video.tick(35.9));
        expect(marked(engine)).toEqual([16, 16]);
        act(() => video.tick(36));
        expect(marked(engine)).toBeNull();
      });

      it('follows the bars in the order a repeat plays them', async () => {
        const { engine, video } = await openVideo({ ready: false });
        // Bars 3 and 4 play twice, as in the repeats fixture.
        act(() =>
          engine.finishLoading({ barCount: 6, bars: barsInPlayOrder([1, 2, 3, 4, 3, 4, 5, 6]) }),
        );
        const seen: (number | undefined)[] = [];
        for (const seconds of [4.5, 6.5, 8.5, 10.5, 12.5, 14.5, 16.5, 18.5]) {
          act(() => video.playAt(seconds));
          seen.push(marked(engine)?.[0]);
        }
        expect(seen).toEqual([1, 2, 3, 4, 3, 4, 5, 6]);
      });

      it('starts once the tab’s bars are in, for a video already playing', async () => {
        const { engine, video } = await openVideo({ ready: false });
        act(() => video.playAt(8.5));
        expect(marked(engine)).toBeNull();
        act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
        await waitFor(() => expect(marked(engine)).toEqual([3, 3]));
        expect(shown(engine)).toEqual([3]);
      });

      it('leaves a loop’s bars marked until the video is followed, and gives them back on Tab', async () => {
        const { user, engine } = await openSong({ links: [lined] });
        // A loop set up on the tab keeps its bars marked under an idle video (Unit 14).
        await user.click(await screen.findByRole('button', { name: 'Play loop Verse' }));
        act(() => engine.fire('stateChanged', { playing: true }));
        expect(marked(engine)).toEqual([5, 8]);
        await choose(user, 'Original');
        await frameShown();
        act(() => engine.fire('stateChanged', { playing: false }));
        const second = currentRecordingPlayer();
        expect(marked(engine)).toEqual([5, 8]);

        act(() => second.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);
        await choose(user, 'Tab');
        await waitFor(() => expect(marked(engine)).toEqual([5, 8]));
      });
    });

    describe('Follow', () => {
      it('turned off on one recording, it is on again for the next one opened (Copilot review on #39)', async () => {
        const linedDrumless = { ...drumlessVideo, bar_one_seconds: BAR_ONE };
        const { user } = await openVideo({ links: [lined, linedDrumless] });
        await user.click(lineUpButton('Follow'));
        expect(lineUpButton('Follow')).toHaveAttribute('aria-pressed', 'false');

        await choose(user, 'Drumless');
        await waitFor(() => expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED));
        expect(lineUpButton('Follow')).toHaveAttribute('aria-pressed', 'true');
      });

      it('off: the mark still moves, and nothing is scrolled; on again brings the bar on show', async () => {
        const { user, engine, video } = await openVideo();
        act(() => video.playAt(4.5));
        expect(shown(engine)).toEqual([1]);

        await user.click(lineUpButton('Follow'));
        expect(lineUpButton('Follow')).toHaveAttribute('aria-pressed', 'false');
        act(() => video.tick(6.5));
        act(() => video.tick(12.5));
        expect(marked(engine)).toEqual([5, 5]);
        expect(shown(engine)).toEqual([1]);

        await user.click(lineUpButton('Follow'));
        expect(lineUpButton('Follow')).toHaveAttribute('aria-pressed', 'true');
        expect(shown(engine)).toEqual([1, 5]);
        act(() => video.tick(14.5));
        expect(shown(engine)).toEqual([1, 5, 6]);
      });

      describe('the window', () => {
        const scrollBy = watchWindowScroll();

        it('is scrolled to a bar the score box’s own scroll left out of sight, a line early, and never for one comfortably on show', async () => {
          const { user, video, placeBar } = await openVideo();
          // jsdom lays nothing out: the sticky bar ends at 0 and the window is 768 px tall.
          placeBar(1, 300, 420);
          placeBar(2, 430, 550);
          placeBar(3, 900, 1020);
          placeBar(4, -500, -380);

          // Bar 1, with bar 2 on show under it: nothing moves.
          act(() => video.playAt(4.5));
          expect(scrollBy).not.toHaveBeenCalled();
          // Bar 2 is the last on show: the page turns now, bar 2 to the top (19 QA, question 1).
          act(() => video.tick(6.5));
          expect(scrollBy).toHaveBeenLastCalledWith({ top: 418, behavior: 'instant' });
          act(() => video.tick(8.5));
          expect(scrollBy).toHaveBeenLastCalledWith({ top: 888, behavior: 'instant' });
          act(() => video.tick(10.5));
          expect(scrollBy).toHaveBeenLastCalledWith({ top: -512, behavior: 'instant' });
          expect(scrollBy).toHaveBeenCalledTimes(3);

          // Follow off: the window is the reader's own.
          await user.click(lineUpButton('Follow'));
          act(() => video.tick(6.5));
          expect(scrollBy).toHaveBeenCalledTimes(3);
        });
      });
    });

    describe('a tap on a bar', () => {
      it('moves the video to that bar’s start, and never the tab’s own player', async () => {
        const { engine, video, tapBar } = await openVideo();
        act(() => video.playAt(4.5));
        tapBar(9);
        // Bar 9 starts 16 s into the tab, 20 s into the video.
        expect(video.seekTo).toHaveBeenLastCalledWith(20);
        expect(marked(engine)).toEqual([9, 9]);
        expect(engine.seek).not.toHaveBeenCalled();

        // Paused, it stays paused where it was sent.
        act(() => video.pauseAt(21));
        tapBar(1);
        expect(video.seekTo).toHaveBeenLastCalledWith(BAR_ONE);
        expect(video.play).not.toHaveBeenCalled();
        expect(marked(engine)).toEqual([1, 1]);
      });

      it('goes to the playthrough of a repeated bar nearest where the video is', async () => {
        const { engine, video, tapBar } = await openVideo({ ready: false });
        act(() =>
          engine.finishLoading({ barCount: 6, bars: barsInPlayOrder([1, 2, 3, 4, 3, 4, 5, 6]) }),
        );
        // In the second pass of bars 3 and 4 (12 to 16 s of the video): bar 3 there starts at 12 s.
        act(() => video.playAt(14.5));
        tapBar(3);
        expect(video.seekTo).toHaveBeenLastCalledWith(12);
        // From the song's start, its first playthrough at 8 s.
        act(() => video.playAt(4.5));
        tapBar(3);
        expect(video.seekTo).toHaveBeenLastCalledWith(8);
      });

      it('before the video has been tapped once does nothing but say what to do', async () => {
        const { video, tapBar } = await openVideo();
        act(() => video.becomeReady());
        tapBar(9);
        expect(video.seekTo).not.toHaveBeenCalled();
        expect(message()).toHaveTextContent(
          'Press Play on the video once. After that, Space and a tap on a bar work it.',
        );
        // Once it plays, the note has done its job and the tap works.
        act(() => video.playAt(4.5));
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        tapBar(9);
        expect(video.seekTo).toHaveBeenLastCalledWith(20);
      });

      it('a drag still opens no loop form', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(4.5));
        act(() => engine.fire('barsDragged', { fromBarIndex: 2, toBarIndex: 5, done: true }));
        expect(screen.queryByRole('form')).not.toBeInTheDocument();
        expect(video.seekTo).not.toHaveBeenCalled();
      });
    });

    describe('Space', () => {
      it('plays and pauses the video once it has been started, and never the tab', async () => {
        const { user, engine, video } = await openVideo({ links: [original] });
        act(() => video.playAt(3));
        await user.keyboard(' ');
        expect(video.pause).toHaveBeenCalledTimes(1);
        await user.keyboard(' ');
        expect(video.play).toHaveBeenCalledTimes(1);
        await user.keyboard(' ');
        expect(video.pause).toHaveBeenCalledTimes(2);
        expect(engine.play).not.toHaveBeenCalled();
      });

      it('is left to the browser until the video’s player answers', async () => {
        const { video } = await openVideo();
        const press = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        act(() => void document.body.dispatchEvent(press));
        expect(press.defaultPrevented).toBe(false);
        expect(video.play).not.toHaveBeenCalled();
      });

      it('can’t start a video nobody has tapped: it says to press Play on the video once', async () => {
        const { user, video } = await openVideo();
        act(() => video.becomeReady());
        await user.keyboard(' ');
        expect(video.play).not.toHaveBeenCalled();
        expect(message()).toHaveTextContent('Press Play on the video once.');
      });

      it('on a focused button presses nothing: it is the video’s key wherever focus is', async () => {
        const { user, video } = await openVideo();
        act(() => video.playAt(5));
        lineUpButton('Tab later').focus();
        await user.keyboard(' ');
        await settle();
        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(links.sent('update')).toEqual([]);
      });

      it('the other keys still do nothing on a recording', async () => {
        const { user, engine, video } = await openVideo();
        act(() => video.playAt(5));
        const speeds = engine.setSpeed.mock.calls.length;
        await user.keyboard('{ArrowUp}{ArrowRight}{PageDown}mdsc');
        expect(video.pause).not.toHaveBeenCalled();
        expect(video.seekTo).not.toHaveBeenCalled();
        expect(engine.setSpeed).toHaveBeenCalledTimes(speeds);
        expect(engine.seek).not.toHaveBeenCalled();
      });
    });

    describe('offline', () => {
      it('locks the line-up with a note, refuses a press made before it was drawn off, and is heard again once back', async () => {
        const { user } = await openVideo();
        // In the same tick as the connection going: the button hasn't been drawn off yet.
        act(() => {
          onlineManager.setOnline(false);
          fireEvent.click(lineUpButton('Tab later'));
          fireEvent.click(lineUpButton('Line up again'));
        });
        expect(within(lineUp()).getByTestId('offline-note')).toHaveTextContent(
          'You’re offline. Lining the tab up needs a connection.',
        );
        expectLocked(lineUpButton('Tab later'));
        expectLocked(lineUpButton('Tab earlier'));
        expectLocked(lineUpButton('Line up again'));
        await user.click(lineUpButton('Tab later'));
        await settle();
        expect(links.sent('update')).toEqual([]);
        noLineUpButton('Bar 1 starts now');

        act(() => onlineManager.setOnline(true));
        await frameShown();
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));
      });
    });

    describe('what else can happen while following', () => {
      it('the link removed on another device: back on the tab, the mark gone, the player let go of', async () => {
        const client = testQueryClient();
        const { engine, video } = await openVideo({ queryClient: client });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);

        links.setRows([]);
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => noFrame());
        expect(video.dispose).toHaveBeenCalled();
        expect(video.listenerCount()).toBe(0);
        await waitFor(() => expect(marked(engine)).toBeNull());
        expect(screen.queryByTestId('line-up')).not.toBeInTheDocument();

        // Its clock, still on its way: nothing hears it.
        const calls = engine.setHighlight.mock.calls.length;
        const scrolls = engine.scrollToBar.mock.calls.length;
        act(() => video.tick(12.5));
        expect(engine.setHighlight).toHaveBeenCalledTimes(calls);
        expect(engine.scrollToBar).toHaveBeenCalledTimes(scrolls);
      });

      it('a nudge for a link removed on another device says it has gone, and saves nothing', async () => {
        const { user } = await openVideo();
        links.setRows([]);
        // The save matches nothing and looks the link up; the read that follows the failure is
        // held, so the page is still on the video when the answer lands.
        const lookUp = links.holdNext('select');
        const release = links.holdNext('select');
        await user.click(lineUpButton('Tab later'));
        lookUp();
        expect(await within(lineUp()).findByRole('alert')).toHaveTextContent(
          'Couldn’t save the line-up. It has been deleted',
        );
        release();
        await waitFor(() => noFrame());
      });

      it('lined up on another device: the next read starts the following, with no press here', async () => {
        const client = testQueryClient();
        const { engine, video } = await openVideo({ links: [original], queryClient: client });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toBeNull();

        links.setRows([lined]);
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => expect(marked(engine)).toEqual([2, 2]));
        // The very frame that was playing: lining up is no new video.
        expect(currentRecordingPlayer()).toBe(video);
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
      });

      it('another source: the first video’s player is let go of, and an unlined one is followed by nothing', async () => {
        const { user, engine, video } = await openVideo({ links: [lined, drumlessVideo] });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);

        await choose(user, 'Drumless');
        await waitFor(() => expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED));
        const second = currentRecordingPlayer();
        expect(second).not.toBe(video);
        expect(video.dispose).toHaveBeenCalled();
        expect(video.listenerCount()).toBe(0);
        expect(marked(engine)).toBeNull();
        expect(message()).toHaveTextContent('Line the tab up');

        // The first player's clock, late, and the second's: neither marks a bar of an unlined link.
        act(() => video.tick(12.5));
        act(() => second.playAt(8.5));
        expect(marked(engine)).toBeNull();
      });

      it('a link pointed at another video has lost its line-up: a new frame, the prompt again', async () => {
        const client = testQueryClient();
        const { video } = await openVideo({ queryClient: client });
        act(() => video.playAt(6.5));
        // What the recordings form's save leaves, as the database's trigger does.
        links.setRows([{ ...lined, url: drumlessVideo.url, bar_one_seconds: null }]);
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED));
        expect(video.dispose).toHaveBeenCalled();
        expect(message()).toHaveTextContent('Line the tab up');
      });

      it('leaving the screen lets go of the player, and its clock is heard by nothing', async () => {
        const { video } = await openVideo({ before: [`/songs/${SONG_A}`] });
        act(() => video.playAt(6.5));
        historyBack();
        expect(await screen.findByText('At song overview')).toBeVisible();
        expect(video.dispose).toHaveBeenCalled();
        expect(video.listenerCount()).toBe(0);
        expect(() => act(() => video.tick(8.5))).not.toThrow();
      });
    });

    // 19 Test: the inputs Build's "Async windows and inputs" names with no test of their own,
    // and the ones it missed.
    describe('lining up, pressed again (19 Test)', () => {
      const noAlert = () => expect(within(lineUp()).queryByRole('alert')).not.toBeInTheDocument();

      it('twice before the page has drawn the first press: one moment, saved, and no second line-up of a later one', async () => {
        const { engine, video } = await openVideo({ links: [original] });
        act(() => video.playAt(5));
        const button = lineUpButton('Bar 1 starts now');
        act(() => {
          fireEvent.click(button);
          fireEvent.click(button);
        });
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5 }));
        await settle();
        // Whether one write or two went, each carried the press's moment and nothing else.
        expect(barOneSent().length).toBeGreaterThan(0);
        expect(new Set(barOneSent())).toEqual(new Set([5]));
        expect(message()).toHaveTextContent('Bar 1 at 0:05.00');
        expect(marked(engine)).toEqual([1, 1]);
        noAlert();
      });

      it('twice with the video moving on between: the later press is where bar 1 is, here and on the server', async () => {
        const { video } = await openVideo({ links: [original] });
        act(() => video.playAt(5));
        const button = lineUpButton('Bar 1 starts now');
        const release = links.holdNext('update');
        act(() => {
          fireEvent.click(button);
          video.tick(5.3);
          fireEvent.click(button);
        });
        // Shown with the first still on its way.
        await waitFor(() => expect(message()).toHaveTextContent('Bar 1 at 0:05.30'));
        expect(barOneSent()).toEqual([5]);
        release();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5.3 }));
        await settle();
        expect(barOneSent()).toEqual([5, 5.3]);
        expect(message()).toHaveTextContent('Bar 1 at 0:05.30');
        noAlert();
      });

      it('“Line up again” and a press the server refuses: the line-up it had is back, and the tab follows on it', async () => {
        const { user, engine, video } = await openVideo();
        // 10.5 s is bar 4 with bar 1 at 4 s.
        act(() => video.playAt(10.5));
        expect(marked(engine)).toEqual([4, 4]);
        await user.click(lineUpButton('Line up again'));
        const release = links.holdNext('update');
        links.failNext('update');
        await user.click(lineUpButton('Bar 1 starts now'));
        // Held: bar 1 is where the video is.
        expect(marked(engine)).toEqual([1, 1]);
        expect(message()).toHaveTextContent('Bar 1 at 0:10.50');

        // The read that follows a save is held, so what shows next is the page's own going back.
        const releaseRead = links.holdNext('select');
        release();
        expect(await within(lineUp()).findByRole('alert')).toHaveTextContent(
          'Couldn’t save the line-up. The server refused it. Try again, or reload the page.',
        );
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: BAR_ONE });
        await waitFor(() => expect(marked(engine)).toEqual([4, 4]));
        // The nudges are there, on the value that is saved: focus hasn't fallen off the page.
        expect(lineUpButton('Tab earlier')).toBeInTheDocument();
        expect(document.body).not.toHaveFocus();
        releaseRead();
        await settle();
        expect(marked(engine)).toEqual([4, 4]);
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([10.5, 4.25]));
        expect(message()).toHaveTextContent('Bar 1 at 0:04.25');
      });

      it('a new line-up pressed while a nudge is on its way ends on the line-up', async () => {
        const { user, engine, video } = await openVideo();
        const release = links.holdNext('update');
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25]));
        act(() => video.playAt(9));
        await user.click(lineUpButton('Line up again'));
        await user.click(lineUpButton('Bar 1 starts now'));
        expect(message()).toHaveTextContent('Bar 1 at 0:09.00');
        // The nudge answers with 4.25 while the line-up waits: it isn't drawn over it.
        const releaseSecond = links.holdNext('update');
        release();
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 9]));
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:09.00');
        expect(marked(engine)).toEqual([1, 1]);
        releaseSecond();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 9 }));
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:09.00');
        noAlert();
      });

      it('a nudge straight after a line-up still on its way moves the line-up, not the value before it', async () => {
        const { user, video } = await openVideo({ links: [original] });
        act(() => video.playAt(7));
        const release = links.holdNext('update');
        await user.click(lineUpButton('Bar 1 starts now'));
        await user.click(await within(lineUp()).findByRole('button', { name: 'Tab later' }));
        expect(message()).toHaveTextContent('Bar 1 at 0:07.25');
        release();
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 7.25 }));
        expect(barOneSent()).toEqual([7, 7.25]);
      });

      it('two nudges pressed before the page has drawn the first are half a second, not a quarter twice over', async () => {
        const { video } = await openVideo();
        act(() => video.playAt(4.5));
        const later = lineUpButton('Tab later');
        act(() => {
          fireEvent.click(later);
          fireEvent.click(later);
        });
        await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 4.5 }));
        expect(barOneSent()).toEqual([4.25, 4.5]);
        await settle();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.50');
        expect(said()).toHaveTextContent('Bar 1 at 0:04.50.');
      });

      it('lined up before the tab’s bars are in: saved all the same, and followed from the moment they are', async () => {
        const { user, engine, video } = await openVideo({ links: [original], ready: false });
        act(() => video.playAt(7));
        await user.click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(barOneSent()).toEqual([7]));
        expect(marked(engine)).toBeNull();
        act(() => video.tick(9.5));
        act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
        await waitFor(() => expect(marked(engine)).toEqual([2, 2]));
      });
    });

    describe('another device, while following here (19 Test)', () => {
      it('moves the line-up: the same frame goes on playing, and the mark is where the new one puts it', async () => {
        const client = testQueryClient();
        const { engine, video } = await openVideo({ queryClient: client });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);

        links.setRows([{ ...lined, bar_one_seconds: 6 }]);
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => expect(marked(engine)).toEqual([1, 1]));
        expect(message()).toHaveTextContent('Bar 1 at 0:06.00');
        expect(currentRecordingPlayer()).toBe(video);
        expect(video.dispose).not.toHaveBeenCalled();
        // And a nudge here moves that value, not the one this page opened with.
        await userEvent.setup().click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([6.25]));
      });

      it('takes the line-up away: the mark goes, the prompt is back, and the video plays on in the same frame', async () => {
        const client = testQueryClient();
        const { engine, video } = await openVideo({ queryClient: client });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);
        const scrolls = engine.scrollToBar.mock.calls.length;

        links.setRows([{ ...lined, bar_one_seconds: null }]);
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => expect(marked(engine)).toBeNull());
        expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
        expectUnlocked(lineUpButton('Bar 1 starts now'));
        noLineUpButton('Tab later');
        expect(currentRecordingPlayer()).toBe(video);
        // The clock goes on, and moves nothing.
        act(() => video.tick(12.5));
        expect(marked(engine)).toBeNull();
        expect(engine.scrollToBar).toHaveBeenCalledTimes(scrolls);
        expect(screen.getByTestId('score-viewport')).not.toHaveClass('score-tappable');
      });

      it('a read of the links that fails keeps what is followed: the frame, the line-up and the mark', async () => {
        const client = testQueryClient();
        const { engine, video } = await openVideo({ queryClient: client });
        act(() => video.playAt(6.5));
        links.failNext('select', { message: 'TypeError: Failed to fetch', code: '' });
        await act(() => client.invalidateQueries({ queryKey: linksKey }));
        await waitFor(() => expect(client.getQueryState(linksKey)?.status).toBe('error'));
        expect(client.getQueryData(linksKey)).toHaveLength(1);
        expect(frame()).toBeInTheDocument();
        expect(currentRecordingPlayer()).toBe(video);
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        act(() => video.tick(8.5));
        expect(marked(engine)).toEqual([3, 3]);
      });
    });

    describe('one video after another (19 Test)', () => {
      it('back on the first source it is a new video: nothing marked until it has been played, then followed again', async () => {
        const { user, engine, video } = await openVideo({ links: [lined, drumlessVideo] });
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);
        await choose(user, 'Drumless');
        await waitFor(() => expect(frame()).toHaveAttribute('src', DRUMLESS_EMBED));
        const second = currentRecordingPlayer();
        act(() => second.playAt(20));

        await choose(user, 'Original');
        await waitFor(() => expect(frame()).toHaveAttribute('src', EMBED_URL));
        const third = currentRecordingPlayer();
        expect(third).not.toBe(video);
        expect(third).not.toBe(second);
        expect(second.dispose).toHaveBeenCalled();
        expect(second.listenerCount()).toBe(0);
        // The line-up is the link's, so the nudges are there; the frame is new, so nothing is marked.
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        expect(marked(engine)).toBeNull();
        // Space can't start it either: it says to tap the video.
        // Its clock already reads a second of the song (a link with a start time): still nothing.
        act(() => third.set({ status: 'ready', seconds: 8.5 }));
        expect(marked(engine)).toBeNull();
        await user.keyboard(' ');
        expect(third.play).not.toHaveBeenCalled();
        expect(message()).toHaveTextContent('Press Play on the video once.');

        // Both earlier players' clocks, late: neither marks a bar.
        act(() => video.tick(12.5));
        act(() => second.tick(8.5));
        expect(marked(engine)).toBeNull();
        act(() => third.playAt(8.5));
        expect(marked(engine)).toEqual([3, 3]);
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
      });
    });

    describe('the reader’s own scrolling (19 Test)', () => {
      const scrollBy = watchWindowScroll();

      it('isn’t undone inside the bar being played; the page follows again when the next bar is out of sight', async () => {
        const { engine, video, placeBar } = await openVideo();
        placeBar(1, 300, 420);
        act(() => video.playAt(4.5));
        expect(scrollBy).not.toHaveBeenCalled();
        expect(shown(engine)).toEqual([1]);

        // The reader flicks ahead: bar 1 is now far above the window.
        placeBar(1, -900, -780);
        fireEvent.scroll(window);
        act(() => video.tick(5));
        act(() => video.tick(5.9));
        expect(scrollBy).not.toHaveBeenCalled();
        expect(shown(engine)).toEqual([1]);

        // Bar 2 is on show where they scrolled to: still nothing moves.
        placeBar(2, 200, 320);
        act(() => video.tick(6.5));
        expect(scrollBy).not.toHaveBeenCalled();
        // Bar 3 isn't: the page goes to it.
        placeBar(3, 1500, 1620);
        act(() => video.tick(8.5));
        expect(scrollBy).toHaveBeenCalledTimes(1);
        expect(scrollBy).toHaveBeenLastCalledWith({ top: 1488, behavior: 'instant' });
      });

      it('a bar under the sticky video or behind a phone’s tab bar isn’t on show; one between them is', async () => {
        const { video, placeBar } = await openVideo();
        // The video's bar ends 300 px down; a phone's tab bar starts at 712 px.
        const sticky = screen.getByTestId('recording-bar');
        sticky.getBoundingClientRect = () => ({ top: 0, bottom: 300, height: 300 }) as DOMRect;
        addTabBar({ top: 712, bottom: 768, height: 56 });

        placeBar(1, 320, 440);
        placeBar(2, 250, 370);
        placeBar(3, 620, 740);
        placeBar(4, 592, 712);

        act(() => video.playAt(4.5));
        expect(scrollBy).not.toHaveBeenCalled();
        // Its top is behind the video: brought to just under it.
        act(() => video.tick(6.5));
        expect(scrollBy).toHaveBeenLastCalledWith({ top: -62, behavior: 'instant' });
        // Its foot is behind the tab bar, though inside the window.
        act(() => video.tick(8.5));
        expect(scrollBy).toHaveBeenLastCalledWith({ top: 308, behavior: 'instant' });
        expect(scrollBy).toHaveBeenCalledTimes(2);
        // It ends exactly where the tab bar begins: on show.
        act(() => video.tick(10.5));
        expect(scrollBy).toHaveBeenCalledTimes(2);
      });

      it('a tab bar that isn’t drawn (a tablet, a laptop) hides nothing: the window’s own foot is the edge', async () => {
        const { engine, video, placeBar } = await openVideo();
        // `display: none` from 768 px: no box.
        addTabBar({ top: 0, bottom: 0, height: 0 });
        // The tab's last bar, so no line after it has to be on show too.
        placeBar(16, window.innerHeight - 120, window.innerHeight);
        placeBar(15, window.innerHeight - 100, window.innerHeight + 20);
        // Bar 16 is the video from 34 to 36 s.
        act(() => video.playAt(35));
        expect(marked(engine)).toEqual([16, 16]);
        expect(scrollBy).not.toHaveBeenCalled();
        act(() => video.tick(33));
        expect(marked(engine)).toEqual([15, 15]);
        expect(scrollBy).toHaveBeenCalledTimes(1);
      });
    });

    describe('a tap and Space, at the edges (19 Test)', () => {
      it('a tap after a nudge still on its way goes by the nudged line-up', async () => {
        const { user, engine, video, tapBar } = await openVideo();
        act(() => video.playAt(4.5));
        act(() => video.pauseAt(4.5));
        links.holdNext('update');
        await user.click(lineUpButton('Tab later'));
        tapBar(9);
        // Bar 9 is 16 s into the tab: 20.25 s of the video with bar 1 at 4.25 s.
        expect(video.seekTo).toHaveBeenLastCalledWith(20.25);
        expect(marked(engine)).toEqual([9, 9]);
      });

      it('a tap once the video has run past the tab’s end brings it back into the tab', async () => {
        const { engine, video, tapBar } = await openVideo();
        act(() => video.playAt(120));
        expect(marked(engine)).toBeNull();
        tapBar(16);
        expect(video.seekTo).toHaveBeenLastCalledWith(34);
        expect(marked(engine)).toEqual([16, 16]);
      });

      it('a tap while the video’s player hasn’t answered does nothing and says nothing', async () => {
        const { engine, video, tapBar } = await openVideo();
        tapBar(9);
        expect(video.seekTo).not.toHaveBeenCalled();
        expect(message()).toHaveTextContent('Bar 1 at 0:04.00');
        expect(engine.seek).not.toHaveBeenCalled();
      });

      it('Space held down is one press: it pauses once, and the page doesn’t scroll under it', async () => {
        const { video } = await openVideo();
        act(() => video.playAt(5));
        const down = (repeat: boolean) => {
          const press = new KeyboardEvent('keydown', {
            key: ' ',
            bubbles: true,
            cancelable: true,
            repeat,
          });
          act(() => void document.body.dispatchEvent(press));
          return press;
        };
        expect(down(false).defaultPrevented).toBe(true);
        for (let held = 0; held < 5; held += 1) expect(down(true).defaultPrevented).toBe(true);
        expect(video.pause).toHaveBeenCalledTimes(1);
        expect(video.play).not.toHaveBeenCalled();
      });

      it('Space is the browser’s again once the video’s player has given up', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(5));
        act(() => video.set({ status: 'unavailable', playing: false }));
        const press = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
        act(() => void document.body.dispatchEvent(press));
        expect(press.defaultPrevented).toBe(false);
        expect(video.pause).not.toHaveBeenCalled();
        expect(video.play).not.toHaveBeenCalled();
        expect(engine.play).not.toHaveBeenCalled();
        // And nothing is marked for a video that can't be followed.
        expect(marked(engine)).toBeNull();
      });

      it('Space pauses by the video’s state at the press, a pause made in its own controls included', async () => {
        const { user, video } = await openVideo();
        act(() => video.playAt(5));
        // Paused in YouTube's controls, not by the key: the next Space plays.
        act(() => video.pauseAt(6));
        await user.keyboard(' ');
        expect(video.play).toHaveBeenCalledTimes(1);
        expect(video.pause).not.toHaveBeenCalled();
      });
    });

    describe('songs with nothing to follow (19 Test)', () => {
      it.each([
        ['no links', [] as SongLinkRow[]],
        [
          'only a Spotify link and a web link',
          [spotifyLink('s', { kind: 'original' }), linkRow('lesson')],
        ],
      ])(
        'with %s: no line-up, no video player made, and Space plays the tab as before',
        async (_name, saved) => {
          const { user, engine } = await openSong({ links: saved });
          await waitFor(() => expect(playButton()).toBeEnabled());
          await settle();
          expect(screen.queryByTestId('line-up')).not.toBeInTheDocument();
          expect(recordingPlayers()).toEqual([]);
          expect(marked(engine)).toBeNull();
          await user.keyboard(' ');
          expect(engine.play).toHaveBeenCalledTimes(1);
          expect(links.sent('update')).toEqual([]);
        },
      );

      it('on Tab, a song with a lined-up video has no video player, and its taps and Space are the tab’s', async () => {
        const { user, engine } = await openSong({ links: [lined] });
        await waitFor(() => expect(playButton()).toBeEnabled());
        await screen.findByRole('radio', { name: 'Original' });
        await settle();
        expect(screen.queryByTestId('line-up')).not.toBeInTheDocument();
        expect(recordingPlayers()).toEqual([]);
        expect(screen.getByTestId('score-viewport')).not.toHaveClass('score-tappable');
        act(() => engine.fire('barTapped', { barIndex: 4 }));
        expect(engine.seek).toHaveBeenCalled();
        await user.keyboard(' ');
        expect(engine.play).toHaveBeenCalledTimes(1);
      });
    });

    describe('the connection going (19 Test)', () => {
      it('while following: the video leaves, the mark with it, and its clock is heard by nothing', async () => {
        const { engine, video } = await openVideo();
        act(() => video.playAt(6.5));
        expect(marked(engine)).toEqual([2, 2]);
        act(() => onlineManager.setOnline(false));
        await waitFor(() => noFrame());
        expect(video.dispose).toHaveBeenCalled();
        expect(video.listenerCount()).toBe(0);
        await waitFor(() => expect(marked(engine)).toBeNull());
        act(() => video.tick(12.5));
        expect(marked(engine)).toBeNull();

        // Back: a new frame, which has to be tapped before anything is marked.
        act(() => onlineManager.setOnline(true));
        await frameShown();
        const again = currentRecordingPlayer();
        expect(again).not.toBe(video);
        expect(marked(engine)).toBeNull();
        act(() => again.playAt(8.5));
        expect(marked(engine)).toEqual([3, 3]);
      });

      it('on a link that isn’t lined up: the prompt gives way to the note, and a press made as it went saves nothing', async () => {
        const { video } = await openVideo({ links: [original] });
        act(() => video.playAt(5));
        expectUnlocked(lineUpButton('Bar 1 starts now'));
        act(() => {
          onlineManager.setOnline(false);
          fireEvent.click(lineUpButton('Bar 1 starts now'));
        });
        expect(within(lineUp()).getByTestId('offline-note')).toHaveTextContent(
          'You’re offline. Lining the tab up needs a connection.',
        );
        expectLocked(lineUpButton('Bar 1 starts now'));
        fireEvent.click(lineUpButton('Bar 1 starts now'));
        await settle();
        expect(links.sent('update')).toEqual([]);
        noLineUpButton('Tab later');

        act(() => onlineManager.setOnline(true));
        await frameShown();
        const again = currentRecordingPlayer();
        act(() => again.playAt(8));
        await userEvent.setup().click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(barOneSent()).toEqual([8]));
      });

      it('a nudge whose answer is lost says so, puts the saved value back on show, and the next read shows what the server kept', async () => {
        const client = testQueryClient();
        const cached = () =>
          client.getQueryData<SongLinkRow[]>(linksKey)?.map((row) => row.bar_one_seconds);
        const { user } = await openVideo({ queryClient: client });
        links.loseNext('update');
        const releaseRead = links.holdNext('select');
        await user.click(lineUpButton('Tab later'));
        expect(await within(lineUp()).findByRole('alert')).toHaveTextContent(
          "Couldn’t save the line-up. The server couldn't be reached. Check the connection and try again.",
        );
        // The page is back on what it knew the server held; the server did take the nudge.
        expect(cached()).toEqual([BAR_ONE]);
        expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 4.25 });
        // The read that follows every save says so.
        releaseRead();
        await waitFor(() => expect(cached()).toEqual([4.25]));
        // A nudge now moves what the server holds, so the lost answer costs no quarter second.
        await user.click(lineUpButton('Tab later'));
        await waitFor(() => expect(barOneSent()).toEqual([4.25, 4.5]));
      });
    });

    describe('under StrictMode', () => {
      beforeEach(() => configure({ reactStrictMode: true }));
      afterEach(() => configure({ reactStrictMode: false }));

      it('one player is left for the frame, the others let go of, and one press is one save', async () => {
        serve({ loops: [verse], links: [original] });
        const client = testQueryClient();
        client.setQueryData(songKeys.detail(USER, SONG_A), songRow(SONG_A));
        client.setQueryData(linksKey, [original]);
        renderRoutes(<Route path="/songs/:id/play" element={<SongPage />} />, {
          path: `/songs/${SONG_A}/play?source=original`,
          queryClient: client,
        });
        await frameShown();

        const live = recordingPlayers().filter((player) => !player.disposed);
        expect(live).toHaveLength(1);
        // The mount ran twice: the first player was made for the same frame, and let go of.
        expect(recordingPlayers().length).toBeGreaterThan(1);
        for (const player of recordingPlayers()) expect(player.frame).toBe(frame());
        for (const gone of recordingPlayers().filter((player) => player.disposed)) {
          expect(gone.listenerCount()).toBe(0);
        }

        // The one left is the one the line-up reads. (The bar it marks under StrictMode is
        // useVideoFollow.test.tsx's: this file's engine mock doesn't load under it.)
        act(() => live[0]!.playAt(6.5));
        expectUnlocked(lineUpButton('Bar 1 starts now'));
        await userEvent.setup().click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(barOneSent()).toEqual([6.5]));
        await settle();
        expect(barOneSent()).toEqual([6.5]);
      });
    });

    describe('nothing moves', () => {
      it('the line-up’s room is held while the links are read, and is the same fixed rows in every state', async () => {
        serve({ links: [original] });
        const release = links.holdNext('select');
        renderSong(`${SONG_A}?source=original`);
        expect(await screen.findByText('Loading the recording…')).toBeVisible();
        /** What sizes the block: its columns, its rows of fixed height and the gap between them. */
        const roomOf = (block: Element) =>
          block.className
            .split(' ')
            .filter((name) => /grid|gap-/.test(name))
            .sort()
            .join(' ');
        // An empty grid of the line-up's own rows stands in for it.
        const space = screen.getByTestId('line-up-space');
        expect(space).toBeEmptyDOMElement();
        const room = roomOf(space);
        expect(room).toContain('grid-rows-[repeat(2,2.75rem)]');
        expect(room).toContain('sideways:grid-rows-[repeat(3,2.75rem)]');
        release();
        await frameShown();
        expect(roomOf(lineUp())).toBe(room);

        const user = userEvent.setup();
        const video = currentRecordingPlayer();
        // Typing a time: the same block, as a form.
        await user.click(lineUpButton('Type a time'));
        expect(roomOf(lineUp())).toBe(room);
        await user.click(lineUpButton('Cancel'));
        act(() => video.playAt(5));
        await user.click(lineUpButton('Bar 1 starts now'));
        await waitFor(() => expect(lineUpButton('Tab later')).toBeInTheDocument());
        expect(roomOf(lineUp())).toBe(room);
        await user.click(lineUpButton('Line up again'));
        expect(lineUpButton('Cancel')).toBeInTheDocument();
        expect(roomOf(lineUp())).toBe(room);
      });

      it('a failed save’s words are in the message’s cell of the same fixed rows, and every control is still there', async () => {
        const { user } = await openVideo();
        links.failNext('update');
        await user.click(lineUpButton('Tab later'));
        const alert = await within(lineUp()).findByRole('alert');
        // In the cell, which grows upward out of its fixed row rather than pushing the rows apart.
        expect(message()).toContainElement(alert);
        expect(message()).toHaveClass('justify-end');
        expect(lineUp().className).toContain('grid-rows-[repeat(2,2.75rem)]');
        for (const name of ['Line up again', 'Tab earlier', 'Tab later', 'Follow']) {
          expect(lineUpButton(name)).toBeInTheDocument();
        }
      });
    });
  });
});

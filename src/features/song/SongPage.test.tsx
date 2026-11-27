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
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { Link, Outlet, Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import { songKeys } from '@/features/library/useSongs';
import type { Loop } from '@/features/loops/loopForm';
import { offlineDb } from '@/features/offline/offlineDb';
import type { EngineMount } from '@/features/player/playerEngine';
import { COUNT_IN_BARS_LABELS, COUNT_IN_MODE_SHORT_LABELS } from '@/features/player/countInLabels';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
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
import { expectLocked, expectUnlocked } from '@/test/locked';
import { loopRow, loopTable, type LoopTable } from '@/test/loopTable';
import { renderRoutes, RouteMarker, settle, testQueryClient } from '@/test/render';
import { SongPage } from './SongPage';

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

/**
 * Answers song, settings and loop queries; `songs` maps an id to its row, or
 * null for none, and `loops` are the saved loops to start with.
 */
function serve({
  songs = { [SONG_A]: songRow(SONG_A), [SONG_B]: songRow(SONG_B) } as Record<string, Song | null>,
  settings = ok(settingsRow),
  loops: savedLoops = [],
}: { songs?: Record<string, Song | null>; settings?: FakeResult; loops?: Loop[] } = {}) {
  loops = loopTable(savedLoops);
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'user_settings') return settings;
    if (call.table === 'loops') return loops.answer(call);
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
      engine.fire('scoreLoaded', { barCount: 16, trackCount: 3, barTempos: [], barMeters: [] });
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

  it('Space after a mouse press of Play loop pauses, rather than pressing Restart loop', async () => {
    const { user, engine, playLoop } = await openSong();
    await playLoop('Verse');
    const restart = panel().getByRole('button', { name: 'Restart loop Verse' });
    expect(restart).toHaveFocus();
    const seeks = engine.seek.mock.calls.length;

    await user.keyboard(' ');

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

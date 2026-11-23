import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet, Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import type { Loop } from '@/features/loops/loopForm';
import type { EngineMount } from '@/features/player/playerEngine';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import type { Settings } from '@/features/settings/settingsForm';
import { songFilePath } from '@/lib/schema';
import {
  opArgs,
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
  type QueryCall,
  type StorageCall,
} from '@/test/fakeSupabase';
import { FakePlayerEngine, TEMPO_CHANGE_BAR_TEMPOS, TICKS_PER_BAR } from '@/test/fakePlayerEngine';
import { renderRoutes, RouteMarker } from '@/test/render';
import { SongPage } from './SongPage';

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
  drums_muted_default: false,
};

const ok = (data: unknown): FakeResult => ({ data, error: null });
const fail = (message: string): FakeResult => ({ data: null, error: { message } });
const fileBytes = (id: string) => (id === SONG_A ? [1, 2, 3] : [4, 5]);

const loopRow = (id: string, overrides: Partial<Loop> = {}): Loop => ({
  id,
  song_id: SONG_A,
  name: `Loop ${id}`,
  start_bar: 5,
  end_bar: 8,
  speed_ratio: 1,
  target_ratio: null,
  status: 'active',
  last_practiced_at: null,
  created_at: '2026-11-21T12:00:00Z',
  ...overrides,
});

/** The loops table as the fake client serves it; tests read it to see what was saved. */
let loopTable: Loop[] = [];

/** Answers a loops query from `loopTable` the way PostgREST would: list, insert, update, delete. */
function serveLoops(call: QueryCall): FakeResult {
  const eq = (column: string) =>
    call.ops.find((op) => op.method === 'eq' && op.args[0] === column)?.args[1];
  const inserted = opArgs(call, 'insert')?.[0] as Partial<Loop> | undefined;
  if (inserted) {
    const row = loopRow(inserted.id ?? 'new', { ...inserted });
    loopTable = [...loopTable, row];
    return ok(row);
  }
  const changes = opArgs(call, 'update')?.[0] as Partial<Loop> | undefined;
  if (changes) {
    loopTable = loopTable.map((loop) => (loop.id === eq('id') ? { ...loop, ...changes } : loop));
    return ok(loopTable.find((loop) => loop.id === eq('id')) ?? null);
  }
  if (opArgs(call, 'delete')) {
    loopTable = loopTable.filter((loop) => loop.id !== eq('id'));
    return ok(null);
  }
  return ok(loopTable.filter((loop) => loop.song_id === eq('song_id')));
}

/**
 * Answers song, settings and loop queries; `songs` maps an id to its row, or
 * null for none, and `loops` are the saved loops to start with.
 */
function serve({
  songs = { [SONG_A]: songRow(SONG_A), [SONG_B]: songRow(SONG_B) } as Record<string, Song | null>,
  settings = ok(settingsRow),
  loops = [],
}: { songs?: Record<string, Song | null>; settings?: FakeResult; loops?: Loop[] } = {}) {
  loopTable = loops;
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'user_settings') return settings;
    if (call.table === 'loops') return serveLoops(call);
    const id = call.ops.find((op) => op.method === 'eq' && op.args[0] === 'id')?.args[1];
    return ok(songs[id as string] ?? null);
  });
  storageResult.mockImplementation(async ({ method, args }: StorageCall) => {
    if (method !== 'download') return ok({});
    const id = Object.keys(songs).find((songId) => args[0] === songFilePath(USER, songId));
    return id ? ok(new Blob([new Uint8Array(fileBytes(id))])) : fail('Object not found');
  });
}

/** The song page inside a layout with nav links, so tests can leave it the way the app does. */
function renderSong(id: string) {
  renderRoutes(
    <Route
      element={
        <>
          <nav>
            <Link to="/library">Library</Link>
            <Link to={`/songs/${SONG_A}`}>Song A</Link>
            <Link to={`/songs/${SONG_B}`}>Song B</Link>
          </nav>
          <Outlet />
        </>
      }
    >
      <Route path="/songs/:id" element={<SongPage />} />
      <Route path="/library" element={<RouteMarker name="library" />} />
    </Route>,
    { path: `/songs/${id}` },
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
    expect(screen.getByRole('link', { name: 'Go to Library' })).toHaveAttribute('href', '/library');
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

    await user.click(screen.getByRole('button', { name: 'Metronome' }));
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

    // Tab from the last nav link: Play/Pause is the page's first control, then Back to start.
    screen.getByRole('link', { name: 'Song B' }).focus();
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
  });
});

describe('SongPage count-in', () => {
  it('takes the count-in defaults from settings and counts in over the score before playing', async () => {
    serve({
      settings: ok({ ...settingsRow, count_in_bars: 2, count_in_mode: 'every_repeat' }),
    });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer();
    expect(screen.getByRole('combobox', { name: 'Count-in' })).toHaveValue('2');
    expect(screen.getByRole('combobox', { name: 'When to count in' })).toHaveValue('every_repeat');
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
      expect(screen.getByRole('combobox', { name: 'Count-in' })).toHaveValue(String(count_in_bars));
      expect(screen.getByRole('combobox', { name: 'When to count in' })).toHaveValue(count_in_mode);
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

    await user.selectOptions(screen.getByRole('combobox', { name: 'Count-in' }), '2 bars');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'When to count in' }),
      'Before every loop repeat',
    );

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
    expect(screen.getByRole('combobox', { name: 'Count-in' })).toHaveValue('0');
    expect(screen.getByRole('combobox', { name: 'When to count in' })).toHaveValue('start');
    expect(screen.getByRole('combobox', { name: 'When to count in' })).toBeDisabled();
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
  const startOf = (barNumber: number) => (barNumber - 1) * TICKS_PER_BAR;
  const loopQueries = (method: string) =>
    queryResult.mock.calls
      .map(([call]) => call)
      .filter((call) => call.table === 'loops' && opArgs(call, method));

  /** Bars 7 to 10 straddle the tempo change at bar 9: the first bar is at 120, the last at 90. */
  const acrossTheChange = loopRow('across', {
    name: 'Across the change',
    start_bar: 7,
    end_bar: 10,
    speed_ratio: 0.708333,
    target_ratio: 1,
  });

  async function openSong(loops: Loop[] = []) {
    serve({ loops });
    const user = renderSong(SONG_A);
    const engine = await loadPlayer(0, { barTempos: TEMPO_CHANGE_BAR_TEMPOS });
    return { user, engine };
  }

  it('lists the saved loops in bar order, with speed as % and the BPM at each loop’s first bar', async () => {
    await openSong([
      loopRow('late', { name: 'Late', start_bar: 9, end_bar: 12, speed_ratio: 0.5 }),
      acrossTheChange,
    ]);

    const items = await panel().findAllByRole('listitem');
    expect(items.map((item) => within(item).getByText(/Bars/).textContent)).toEqual([
      // 85 BPM typed against 120: the exact ratio, shown as 71%.
      'Bars 7 to 10 · 71% (85 BPM) · target 100% (120 BPM)',
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
      startTick: startOf(7),
      endTick: startOf(11),
    });
    expect(engine.setLooping).toHaveBeenLastCalledWith(true);
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.708333);
    expect(engine.seek).toHaveBeenLastCalledWith(startOf(7));
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent('Bar 7 of 16');
    expect(screen.getByTestId('active-loop')).toHaveTextContent(
      'Looping Across the change · Bars 7 to 10',
    );
    expect(engine.setHighlight).toHaveBeenLastCalledWith({ startBarIndex: 6, endBarIndex: 9 });
  });

  it('shows BPM as the speed times the tempo at the loop’s first bar, wherever playback is in it', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    act(() => engine.fire('stateChanged', { playing: true }));

    expect(speedReadout()).toHaveTextContent('71%');
    expect(bpmReadout()).toHaveTextContent('85');

    // alphaTab's answer to the loop's seek comes first; then playback moves on.
    act(() => engine.fire('position', { tick: startOf(7) }));
    // Into bar 9, where the file's tempo drops to 90: the loop's BPM stays its first bar's.
    act(() => engine.fire('position', { tick: startOf(9) + 10 }));
    expect(status()).toHaveTextContent('Bar 9 of 16');
    expect(bpmReadout()).toHaveTextContent('85');
    expect(panel().getByLabelText('BPM')).toHaveValue('85');
    expect(panel().getByLabelText('Speed %')).toHaveValue('71');
  });

  it('switching to another loop while playing keeps playing', async () => {
    const { user, engine } = await openSong([
      acrossTheChange,
      loopRow('late', { name: 'Late', start_bar: 13, end_bar: 16, speed_ratio: 0.9 }),
    ]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    act(() => engine.fire('stateChanged', { playing: true }));
    const restartsBefore = engine.restartCalls();

    await user.click(panel().getByRole('button', { name: 'Play loop Late' }));

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOf(13),
      endTick: startOf(17),
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
    act(() => engine.fire('position', { tick: startOf(7) }));
    // Jam mode again: BPM follows the current bar.
    act(() => engine.fire('position', { tick: startOf(9) + 10 }));
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
    expect(engine.seek).toHaveBeenLastCalledWith(startOf(3));
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

  it('saves a new loop with its name, bars, target and the speed playing now, then loops it', async () => {
    const { user, engine } = await openSong();
    fireEvent.change(screen.getByRole('slider', { name: 'Speed' }), { target: { value: '80' } });
    await user.click(await panel().findByRole('button', { name: 'New loop' }));
    expect(screen.getByTestId('loop-new-speed')).toHaveTextContent('80%');

    act(() => engine.fire('barTapped', { barIndex: 8 }));
    act(() => engine.fire('barTapped', { barIndex: 11 }));
    // The tempo is the first bar's, so the note reads in that bar's BPM.
    expect(screen.getByTestId('loop-new-speed')).toHaveTextContent('80% (72 BPM)');
    await user.type(form().getByLabelText('Name'), '  Second half  ');
    await user.type(form().getByLabelText(/Target speed/), '100');
    await user.click(form().getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(loopQueries('insert')).toHaveLength(1));
    const [row] = opArgs(loopQueries('insert')[0]!, 'insert') as [Record<string, unknown>];
    expect(row).toMatchObject({
      song_id: SONG_A,
      user_id: USER,
      name: 'Second half',
      start_bar: 9,
      end_bar: 12,
      speed_ratio: 0.8,
      target_ratio: 1,
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);

    // The form closes and the new loop is the one playing, without Play being pressed.
    expect(await screen.findByTestId('active-loop')).toHaveTextContent(
      'Second half · Bars 9 to 12',
    );
    expect(panel().queryByRole('form')).not.toBeInTheDocument();
    expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
      startTick: startOf(9),
      endTick: startOf(13),
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
    expect(loopQueries('insert')).toHaveLength(0);
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

  it('a typed BPM plays at once and Save speed stores the exact ratio it implies', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));
    const save = panel().getByRole('button', { name: 'Save speed' });
    expect(save).toBeDisabled();

    const bpmField = panel().getByLabelText('BPM');
    await user.clear(bpmField);
    await user.type(bpmField, '100{Enter}');

    // 100 of 120: 83.3333%, not 83%.
    expect(engine.setSpeed).toHaveBeenLastCalledWith(0.833333);
    expect(panel().getByLabelText('Speed %')).toHaveValue('83');
    expect(bpmReadout()).toHaveTextContent('100');
    expect(loopQueries('update')).toHaveLength(0);

    await user.click(save);
    await waitFor(() => expect(loopQueries('update')).toHaveLength(1));
    expect(opArgs(loopQueries('update')[0]!, 'update')).toEqual([{ speed_ratio: 0.833333 }]);
    await waitFor(() =>
      expect(screen.getByTestId('loop-saved-speed')).toHaveTextContent('Saved: 83% (100 BPM)'),
    );
    expect(save).toBeDisabled();
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

    await user.click(panel().getByRole('button', { name: 'Edit Across the change' }));
    expect(form().getByLabelText('Name')).toHaveValue('Across the change');
    expect(form().getByLabelText(/Target speed/)).toHaveValue('100');
    const lastBar = form().getByLabelText('Last bar');
    await user.clear(lastBar);
    await user.type(lastBar, '12');
    await user.click(form().getByRole('button', { name: 'Save loop' }));

    await waitFor(() => expect(loopQueries('update')).toHaveLength(1));
    expect(opArgs(loopQueries('update')[0]!, 'update')).toEqual([{ end_bar: 12 }]);
    await waitFor(() =>
      expect(engine.setPlaybackRange).toHaveBeenLastCalledWith({
        startTick: startOf(7),
        endTick: startOf(13),
      }),
    );
    expect(screen.getByTestId('active-loop')).toHaveTextContent('Bars 7 to 12');
  });

  it('deletes a loop only after the inline confirm; deleting the playing loop goes back to the whole song', async () => {
    const { user, engine } = await openSong([acrossTheChange]);
    await user.click(await panel().findByRole('button', { name: 'Play loop Across the change' }));

    await user.click(panel().getByRole('button', { name: 'Delete Across the change' }));
    const confirm = within(panel().getByRole('group', { name: 'Delete Across the change' }));
    expect(loopQueries('delete')).toHaveLength(0);
    await user.click(confirm.getByRole('button', { name: 'Keep it' }));
    expect(panel().getByRole('button', { name: 'Delete Across the change' })).toBeInTheDocument();

    await user.click(panel().getByRole('button', { name: 'Delete Across the change' }));
    await user.click(
      within(panel().getByRole('group', { name: 'Delete Across the change' })).getByRole('button', {
        name: 'Delete loop',
      }),
    );

    expect(await panel().findByText(/No loops yet/)).toBeInTheDocument();
    expect(loopQueries('delete')).toHaveLength(1);
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
      loops: [acrossTheChange, loopRow('b-loop', { song_id: SONG_B, name: 'On song B' })],
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
      expect.objectContaining({ startTick: startOf(7) }),
    );
  });
});

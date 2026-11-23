import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, Outlet, Route } from 'react-router';
import type { Song } from '@/features/library/songForm';
import type { EngineMount } from '@/features/player/playerEngine';
import { PLAYER_ERROR_MESSAGES } from '@/features/player/playerMessages';
import type { Settings } from '@/features/settings/settingsForm';
import { songFilePath } from '@/lib/schema';
import {
  queryResult,
  resetFakeSupabase,
  storageResult,
  type FakeResult,
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

/** Answers song and settings reads; `songs` maps an id to its row, or null for none. */
function serve({
  songs = { [SONG_A]: songRow(SONG_A), [SONG_B]: songRow(SONG_B) } as Record<string, Song | null>,
  settings = ok(settingsRow),
}: { songs?: Record<string, Song | null>; settings?: FakeResult } = {}) {
  queryResult.mockImplementation(async (call) => {
    if (call.table === 'user_settings') return settings;
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

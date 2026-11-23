import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { FakePlayerEngine } from '@/test/fakePlayerEngine';
import { PlayerControls, PlayPauseButton } from './PlayerControls';
import { DEFAULT_PLAYER_OPTIONS, type PlayerOptions } from './playerOptions';
import { initialPlayerSnapshot, PlayerService } from './PlayerService';

const DRUMS = 2;

/** The controls driven by a real PlayerService over a fake engine, the way SongPage wires them. */
function Harness({ player }: { player: PlayerService }) {
  const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
  return <PlayerControls player={player} snapshot={snapshot} />;
}

function setup({
  drumTrackIndex = DRUMS as number | null,
  options = DEFAULT_PLAYER_OPTIONS as PlayerOptions,
  loaded = true,
} = {}) {
  const engine = new FakePlayerEngine();
  const player = new PlayerService(engine, {
    drumTrackIndex,
    options,
    wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
    unlockAudio: vi.fn(),
  });
  player.load(new Uint8Array([1]));
  render(<Harness player={player} />);
  if (loaded) act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
  return { engine, player, user: userEvent.setup() };
}

const playButton = () => screen.getByRole('button', { name: /^(Play|Pause)$/ });
const backToStart = () => screen.getByRole('button', { name: 'Back to start' });
const speed = () => screen.getByRole('slider', { name: 'Speed' });
const metronome = () => screen.getByRole('button', { name: 'Metronome' });
const volume = () => screen.getByRole('slider', { name: 'Metronome volume' });
const muteDrums = () => screen.getByRole('button', { name: 'Mute drums' });

/** Puts the player into "playing" the way alphaTab reports it. */
async function startPlaying(engine: FakePlayerEngine, user: ReturnType<typeof userEvent.setup>) {
  await user.click(playButton());
  act(() => engine.fire('stateChanged', { playing: true }));
  expect(playButton()).toHaveTextContent('Pause');
}

describe('PlayerControls before the player exists', () => {
  it('shows the starting values with every control disabled', () => {
    render(
      <PlayerControls
        player={null}
        snapshot={initialPlayerSnapshot(DRUMS, { ...DEFAULT_PLAYER_OPTIONS, drumsMuted: true })}
      />,
    );
    expect(screen.getByRole('region', { name: 'Player controls' })).toBeInTheDocument();
    for (const control of [playButton(), backToStart(), speed(), metronome(), volume()]) {
      expect(control).toBeDisabled();
    }
    expect(muteDrums()).toBeDisabled();
    expect(playButton()).toHaveTextContent('Play');
    expect(speed()).toHaveValue('100');
    expect(volume()).toHaveValue('80');
    expect(metronome()).toHaveAttribute('aria-pressed', 'true');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('PlayerControls transport', () => {
  it('keeps Play disabled while the song loads, but options are already editable', () => {
    setup({ loaded: false });
    expect(playButton()).toBeDisabled();
    expect(backToStart()).toBeDisabled();
    expect(speed()).toBeEnabled();
    expect(metronome()).toBeEnabled();
    expect(muteDrums()).toBeEnabled();
  });

  it('plays, shows Pause while playing, and pauses', async () => {
    const { engine, user } = setup();
    expect(playButton()).toBeEnabled();

    await startPlaying(engine, user);
    expect(engine.play).toHaveBeenCalledTimes(1);

    await user.click(playButton());
    expect(engine.pause).toHaveBeenCalledTimes(1);
    act(() => engine.fire('stateChanged', { playing: false }));
    expect(playButton()).toHaveTextContent('Play');
  });

  it('starts the engine inside the click itself, with nothing awaited first', () => {
    const { engine } = setup();
    // fireEvent dispatches synchronously; an awaited play would not have run yet.
    fireEvent.click(playButton());
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it('goes back to the start', async () => {
    const { engine, user } = setup();
    await user.click(backToStart());
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });

  it('disables playback when the player is in error', () => {
    const { engine } = setup();
    act(() => engine.fire('error', { error: new Error('render') }));
    expect(playButton()).toBeDisabled();
    expect(backToStart()).toBeDisabled();
  });
});

describe('PlayerControls live changes', () => {
  it('changes speed while playing without restarting', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    fireEvent.change(speed(), { target: { value: '150' } });

    expect(engine.setSpeed).toHaveBeenLastCalledWith(1.5);
    expect(speed()).toHaveValue('150');
    expect(screen.getByText('150%')).toBeInTheDocument();
    expect(speed()).toHaveAttribute('aria-valuetext', '150%');
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('offers speeds from 25% to 200% in 5% steps', () => {
    setup();
    expect(speed()).toHaveAttribute('min', '25');
    expect(speed()).toHaveAttribute('max', '200');
    expect(speed()).toHaveAttribute('step', '5');
  });

  it('toggles the metronome and changes its volume while playing without restarting', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    await user.click(metronome());
    expect(metronome()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);
    // The chosen volume stays on the slider while the metronome is off.
    expect(volume()).toHaveValue('80');

    await user.click(metronome());
    expect(metronome()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.8);

    fireEvent.change(volume(), { target: { value: '30' } });
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.3);
    expect(volume()).toHaveValue('30');
    expect(screen.getByText('30%')).toBeInTheDocument();

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('keeps the metronome silent when the volume moves while it is off', async () => {
    const { engine, user } = setup({ options: { ...DEFAULT_PLAYER_OPTIONS, metronomeOn: false } });
    expect(metronome()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.change(volume(), { target: { value: '50' } });
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0);

    await user.click(metronome());
    expect(engine.setMetronomeVolume).toHaveBeenLastCalledWith(0.5);
  });

  it('mutes and unmutes the drum track while playing without restarting', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    await user.click(muteDrums());
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(DRUMS, true);

    await user.click(muteDrums());
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(DRUMS, false);

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('disables drum mute, with a reason, for a song without drums', () => {
    setup({ drumTrackIndex: null });
    expect(muteDrums()).toBeDisabled();
    expect(muteDrums()).toHaveAttribute('title', 'This song has no drum track');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PlayerControls without its Play button', () => {
  it('leaves Play/Pause to the screen and keeps the rest', () => {
    render(
      <PlayerControls
        player={null}
        snapshot={initialPlayerSnapshot(DRUMS, DEFAULT_PLAYER_OPTIONS)}
        showPlayButton={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /^(Play|Pause)$/ })).toBeNull();
    expect(backToStart()).toBeInTheDocument();
    expect(speed()).toBeInTheDocument();
  });
});

describe('PlayPauseButton', () => {
  it('plays and pauses the player on its own', async () => {
    const engine = new FakePlayerEngine();
    const player = new PlayerService(engine, {
      drumTrackIndex: DRUMS,
      options: DEFAULT_PLAYER_OPTIONS,
      wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
      unlockAudio: vi.fn(),
    });
    player.load(new Uint8Array([1]));
    function Solo() {
      const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
      return <PlayPauseButton player={player} snapshot={snapshot} />;
    }
    render(<Solo />);
    expect(playButton()).toBeDisabled();
    act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
    await startPlaying(engine, userEvent.setup());
    expect(engine.play).toHaveBeenCalled();
  });
});

describe('PlayerControls count-in', () => {
  const countIn = () => screen.getByRole('combobox', { name: 'Count-in' });
  const countInMode = () => screen.getByRole('combobox', { name: 'When to count in' });

  it('starts from the options it is given', () => {
    setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2, countInMode: 'every_repeat' },
    });
    expect(countIn()).toHaveValue('2');
    expect(countInMode()).toHaveValue('every_repeat');
    expect(countInMode()).toBeEnabled();
  });

  it('offers off, 1 bar and 2 bars, with the mode disabled while off', () => {
    setup();
    expect(countIn()).toHaveValue('0');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Off',
      '1 bar',
      '2 bars',
      'At the start only',
      'Before every loop repeat',
    ]);
    expect(countInMode()).toBeDisabled();
  });

  it('changes the player without restarting playback', async () => {
    const { engine, player, user } = setup();
    await startPlaying(engine, user);
    engine.play.mockClear();
    engine.loadScore.mockClear();

    await user.selectOptions(countIn(), '1 bar');
    await user.selectOptions(countInMode(), 'Before every loop repeat');

    expect(player.getSnapshot()).toMatchObject({ countInBars: 1, countInMode: 'every_repeat' });
    expect(countIn()).toHaveValue('1');
    expect(engine.restartCalls()).toBe(0);
  });

  it('shows Pause during a count-in, and Pause calls it off', async () => {
    const { engine, player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2 },
    });
    await user.click(playButton());
    expect(player.getSnapshot().status).toBe('countingIn');
    expect(playButton()).toHaveTextContent('Pause');
    expect(engine.play).not.toHaveBeenCalled();

    await user.click(playButton());
    expect(playButton()).toHaveTextContent('Play');
    expect(player.getSnapshot().status).toBe('ready');
  });
});

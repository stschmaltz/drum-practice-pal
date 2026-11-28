import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, useSyncExternalStore } from 'react';
import {
  chooseIn,
  chosenCountIn,
  chosenCountInMode,
  countInGroup,
  countInModeGroup,
} from '@/test/countInControls';
import { nextCountInBars } from '@/features/shortcuts/shortcuts';
import { FakeClickOutput, FakePlayerEngine } from '@/test/fakePlayerEngine';
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
  clicks = undefined as FakeClickOutput | undefined,
} = {}) {
  const engine = new FakePlayerEngine();
  const player = new PlayerService(engine, {
    drumTrackIndex,
    options,
    wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
    unlockAudio: vi.fn(),
    clicks,
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
const drumsOnly = () => screen.getByRole('button', { name: 'Drums only' });

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
    expect(drumsOnly()).toBeDisabled();
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
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
    expect(drumsOnly()).toBeEnabled();
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

  it('disables playback and every option when the player is in error', () => {
    const { engine } = setup();
    act(() => engine.fire('error', { error: new Error('render') }));
    for (const control of [playButton(), backToStart(), speed(), metronome(), volume()]) {
      expect(control).toBeDisabled();
    }
    expect(muteDrums()).toBeDisabled();
    expect(drumsOnly()).toBeDisabled();
  });

  // Unit 13 Test: a failure while the song still loads (the soundfont refused) is the common one.
  it('turns the options off for a failure before the song was ever ready, and a press changes nothing', async () => {
    const { engine, player, user } = setup({ loaded: false });
    expect(speed()).toBeEnabled();
    act(() => engine.fire('error', { error: new Error('soundfont') }));
    const before = player.getSnapshot();
    expect(before.status).toBe('error');

    for (const control of [speed(), metronome(), volume(), muteDrums(), drumsOnly()]) {
      expect(control).toBeDisabled();
    }
    for (const radio of within(screen.getByRole('radiogroup', { name: 'Count-in' })).getAllByRole(
      'radio',
    )) {
      expect(radio).toBeDisabled();
    }
    await user.click(screen.getByText('2 bars'));
    await user.click(metronome());
    expect(player.getSnapshot()).toMatchObject({
      countInBars: before.countInBars,
      metronomeOn: before.metronomeOn,
    });
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

describe('PlayerControls metronome sounds', () => {
  // Inside a closed <details>: jsdom keeps its content in the accessibility tree.
  const soundSelect = () => screen.getByRole('combobox', { name: 'Metronome sound' });
  const beatOneSelect = () => screen.getByRole('combobox', { name: 'Beat one' });
  const clicks = () => screen.getByRole('radiogroup', { name: 'Clicks' });

  it('starts from the options it is given', () => {
    setup({
      options: {
        ...DEFAULT_PLAYER_OPTIONS,
        metronomeVoice: { sound: 'claves', accent: false, accentSound: 'cowbell', subdivision: 4 },
      },
    });
    expect(screen.getByText('Metronome sounds').closest('summary')).toHaveTextContent(
      'Metronome soundsClaves, 4 per beat',
    );
    expect(soundSelect()).toHaveValue('claves');
    expect(beatOneSelect()).toHaveValue('none');
    expect(within(clicks()).getByRole('radio', { name: '4 per beat' })).toBeChecked();
  });

  it('changes the sound, beat one and the clicks while paused', async () => {
    const { engine, player, user } = setup();
    engine.setMetronomeVoice.mockClear();

    await user.selectOptions(soundSelect(), 'Side stick');
    await user.selectOptions(beatOneSelect(), 'Cowbell, louder');
    await user.click(within(clicks()).getByRole('radio', { name: '2 per beat' }));

    const voice = { sound: 'side_stick', accent: true, accentSound: 'cowbell', subdivision: 2 };
    expect(engine.setMetronomeVoice).toHaveBeenLastCalledWith(voice);
    expect(player.getSnapshot().metronomeVoice).toEqual(voice);

    await user.selectOptions(beatOneSelect(), 'No accent');
    expect(player.getSnapshot().metronomeVoice).toEqual({ ...voice, accent: false });
  });

  it('changes while playing, and playback carries on', async () => {
    const { engine, player, user } = setup();
    await startPlaying(engine, user);

    expect(soundSelect()).toBeEnabled();
    const restartsBefore = engine.restartCalls();
    await user.selectOptions(beatOneSelect(), 'No accent');
    expect(engine.setMetronomeVoice).toHaveBeenLastCalledWith(
      expect.objectContaining({ accent: false }),
    );
    expect(player.getSnapshot()).toMatchObject({
      status: 'playing',
      metronomeVoice: expect.objectContaining({ accent: false }),
    });
    expect(engine.restartCalls()).toBe(restartsBefore);
  });
});

describe('PlayerControls Mute all', () => {
  const muteAll = () => screen.getByRole('button', { name: 'Mute all' });

  it('silences every track and brings them back, without a restart', async () => {
    const { engine, player, user } = setup({ loaded: false });
    act(() => engine.finishLoading({ trackNames: ['Guitar', 'Bass', 'Drums'] }));
    const restartsBefore = engine.restartCalls();
    expect(muteAll()).toHaveAttribute('aria-pressed', 'false');

    await user.click(muteAll());
    expect(muteAll()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.soundingTracks()).toEqual([]);
    // The mixer says why its switches make no sound.
    expect(screen.getByText(/Mute all is on/)).toBeInTheDocument();

    await user.click(muteAll());
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(player.getSnapshot().allMuted).toBe(false);
  });

  it('is there for a song with no drum track, and off once the player has failed', () => {
    const { engine } = setup({ drumTrackIndex: null });
    expect(muteAll()).toBeEnabled();
    act(() => engine.fire('error', { error: new Error('worker died') }));
    expect(muteAll()).toBeDisabled();
  });
});

describe('PlayerControls track mixer', () => {
  // Inside a closed <details>: jsdom keeps its content in the accessibility tree.
  const mixer = () => screen.getByRole('group', { name: 'Tracks' });
  const track = (name: string) => within(mixer()).getByRole('button', { name });
  const pressedTracks = () =>
    within(mixer())
      .getAllByRole('button')
      .map((button) => `${button.textContent} ${button.getAttribute('aria-pressed')}`);

  function setupTracks(options?: PlayerOptions) {
    const view = setup({ loaded: false, ...(options && { options }) });
    act(() => view.engine.finishLoading({ trackNames: ['Guitar', 'Bass', 'Drums'] }));
    return view;
  }

  it('lists every track by name, all on at open, and says how many are on', () => {
    setupTracks();
    expect(pressedTracks()).toEqual(['Guitar true', 'Bass true', 'Drums true']);
    expect(screen.getByText('Tracks').closest('summary')).toHaveTextContent('3 of 3 on');
  });

  it('mutes one track while playing, live, and turns it back on', async () => {
    const { engine, player, user } = setupTracks();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    await user.click(track('Bass'));
    expect(track('Bass')).toHaveAttribute('aria-pressed', 'false');
    expect(engine.soundingTracks()).toEqual([0, 2]);
    expect(screen.getByText('Tracks').closest('summary')).toHaveTextContent('2 of 3 on');

    await user.click(track('Bass'));
    expect(engine.soundingTracks()).toEqual([0, 1, 2]);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(player.getSnapshot().status).toBe('playing');
  });

  it('the drum track and Mute drums are one switch', async () => {
    const { user } = setupTracks();
    await user.click(muteDrums());
    expect(track('Drums')).toHaveAttribute('aria-pressed', 'false');
    await user.click(track('Drums'));
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
    expect(track('Drums')).toHaveAttribute('aria-pressed', 'true');
  });

  it('under Drums only keeps each switch as set, says why the others are silent, and brings them back', async () => {
    const { engine, user } = setupTracks();
    await user.click(track('Guitar'));
    await user.click(drumsOnly());
    expect(engine.soundingTracks()).toEqual([2]);
    expect(pressedTracks()).toEqual(['Guitar false', 'Bass true', 'Drums true']);
    expect(within(mixer()).getByText(/Drums only is on/)).toBeInTheDocument();

    await user.click(drumsOnly());
    expect(engine.soundingTracks()).toEqual([1, 2]);
    expect(within(mixer()).queryByText(/Drums only is on/)).not.toBeInTheDocument();
  });

  it('is off before the player exists and once it has failed', () => {
    const { engine } = setupTracks();
    act(() => engine.fire('error', { error: new Error('worker died') }));
    for (const button of within(mixer()).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('shows nothing to mix before the score has loaded, or for a song of one track', () => {
    const { engine } = setup({ loaded: false });
    expect(screen.queryByRole('group', { name: 'Tracks' })).not.toBeInTheDocument();
    act(() => engine.finishLoading({ trackNames: ['Drums'] }));
    expect(screen.queryByRole('group', { name: 'Tracks' })).not.toBeInTheDocument();
  });
});

describe('PlayerControls drums only', () => {
  it('sits right after Mute drums and starts off, even when drums open muted', () => {
    setup({ options: { ...DEFAULT_PLAYER_OPTIONS, drumsMuted: true } });
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'true');
    expect(muteDrums().nextElementSibling).toBe(drumsOnly());
  });

  it('plays the drum track alone and brings the others back, while playing, without restarting', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();
    engine.setTrackMuted.mockClear();

    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.setTrackMuted.mock.calls).toEqual([
      [0, true],
      [1, true],
      [DRUMS, false],
    ]);

    engine.setTrackMuted.mockClear();
    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.setTrackMuted.mock.calls).toEqual([
      [0, false],
      [1, false],
      [DRUMS, false],
    ]);

    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('and Mute drums turn each other off', async () => {
    const { engine, user } = setup();

    await user.click(muteDrums());
    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.setTrackMuted).toHaveBeenLastCalledWith(DRUMS, false);

    await user.click(muteDrums());
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'true');
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.setTrackMuted.mock.calls.slice(-3)).toEqual([
      [0, false],
      [1, false],
      [DRUMS, true],
    ]);
  });

  it('is disabled, with a reason, for a song without drums', () => {
    setup({ drumTrackIndex: null });
    expect(drumsOnly()).toBeDisabled();
    expect(drumsOnly()).toHaveAccessibleDescription('This song has no drum track');
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('PlayerControls drums only, beyond a click while playing', () => {
  it('can be turned on while the song is still loading, and is what plays once it is in', async () => {
    const { engine, user } = setup({ loaded: false });
    expect(playButton()).toBeDisabled();
    expect(drumsOnly()).toBeEnabled();

    await user.click(drumsOnly());
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');

    act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.soundingTracks()).toEqual([DRUMS]);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('toggles from the keyboard and keeps focus, without touching playback', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    drumsOnly().focus();
    await user.keyboard('{Enter}');
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.soundingTracks()).toEqual([DRUMS]);

    await user.keyboard(' ');
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.soundingTracks()).toEqual([0, 1, DRUMS]);
    expect(drumsOnly()).toHaveFocus();
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('stays on through Pause, Play and Back to start', async () => {
    const { engine, user } = setup();
    await user.click(drumsOnly());
    await startPlaying(engine, user);
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: false }));
    await user.click(backToStart());
    await startPlaying(engine, user);

    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.soundingTracks()).toEqual([DRUMS]);
  });

  it('settles on the last of many quick presses of both drum buttons', async () => {
    const { engine, user } = setup();
    await startPlaying(engine, user);
    const restartsBefore = engine.restartCalls();

    for (let round = 0; round < 5; round++) {
      await user.click(drumsOnly());
      await user.click(muteDrums());
      await user.dblClick(drumsOnly());
    }
    // Each round ends with a double click: Drums only on (replacing Mute drums), then off.
    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'false');
    expect(muteDrums()).toHaveAttribute('aria-pressed', 'false');
    expect(engine.soundingTracks()).toEqual([0, 1, DRUMS]);

    await user.click(drumsOnly());
    expect(engine.soundingTracks()).toEqual([DRUMS]);
    expect(engine.restartCalls()).toBe(restartsBefore);
    expect(playButton()).toHaveTextContent('Pause');
  });

  it('pressed during a count-in, leaves the counter running and the metronome as it was', async () => {
    const clicks = new FakeClickOutput();
    const { engine, player, user } = setup({
      clicks,
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1 },
    });
    await user.click(playButton());
    expect(player.getSnapshot().status).toBe('countingIn');
    engine.setMetronomeVolume.mockClear();

    await user.click(drumsOnly());

    expect(drumsOnly()).toHaveAttribute('aria-pressed', 'true');
    expect(player.getSnapshot().status).toBe('countingIn');
    expect(playButton()).toHaveTextContent('Pause');
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(engine.play).not.toHaveBeenCalled();
    expect(engine.setMetronomeVolume).not.toHaveBeenCalled();
    expect(metronome()).toHaveAttribute('aria-pressed', 'true');
    expect(engine.soundingTracks()).toEqual([DRUMS]);
    // Call the count-in off, so no timer outlives the test.
    await user.click(playButton());
  });

  it('gives neither drum button a reason when the song has drums', () => {
    setup();
    expect(drumsOnly()).not.toHaveAttribute('title');
    expect(muteDrums()).not.toHaveAttribute('title');
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
  it('starts from the options it is given', () => {
    setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2, countInMode: 'every_repeat' },
    });
    expect(chosenCountIn()).toBe('2 bars');
    expect(chosenCountInMode()).toBe('Every repeat');
  });

  it('offers off, 1 bar and 2 bars as a segmented control, and no mode while off', () => {
    setup();
    expect(chosenCountIn()).toBe('Off');
    expect(
      within(countInGroup())
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Off', '1 bar', '2 bars']);
    // Progressive disclosure: the mode only matters with a count-in to play.
    expect(countInModeGroup()).not.toBeInTheDocument();
  });

  it('shows the mode once a count-in is chosen, with both of its choices in full', async () => {
    const { user } = setup();
    await chooseIn(user, countInGroup(), '1 bar');
    const mode = countInModeGroup();
    expect(mode).not.toBeNull();
    expect(
      within(mode as HTMLElement)
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['At the start', 'Every repeat']);
  });

  it('changes the player without restarting playback', async () => {
    const { engine, player, user } = setup();
    await startPlaying(engine, user);
    engine.play.mockClear();
    engine.loadScore.mockClear();

    await chooseIn(user, countInGroup(), '1 bar');
    await chooseIn(user, countInModeGroup(), 'Every repeat');

    expect(player.getSnapshot()).toMatchObject({ countInBars: 1, countInMode: 'every_repeat' });
    expect(chosenCountIn()).toBe('1 bar');
    expect(engine.restartCalls()).toBe(0);
  });

  it('shows the starting values, disabled, before the player exists', () => {
    render(
      <PlayerControls
        player={null}
        snapshot={initialPlayerSnapshot(DRUMS, {
          ...DEFAULT_PLAYER_OPTIONS,
          countInBars: 1,
          countInMode: 'every_repeat',
        })}
      />,
    );
    expect(chosenCountIn()).toBe('1 bar');
    for (const radio of within(countInGroup()).getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(chosenCountInMode()).toBe('Every repeat');
    for (const radio of within(countInModeGroup() as HTMLElement).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('can be set while the song is still loading', async () => {
    const { player, user } = setup({ loaded: false });
    expect(within(countInGroup()).getByRole('radio', { name: '2 bars' })).toBeEnabled();
    await chooseIn(user, countInGroup(), '2 bars');
    expect(player.getSnapshot().countInBars).toBe(2);
    expect(countInModeGroup()).toBeInTheDocument();
  });

  it.each([
    ['Off', 0],
    ['1 bar', 1],
    ['2 bars', 2],
  ])('choosing "%s" sets the player to %s bar(s)', async (label, bars) => {
    const { player, user } = setup({
      // Start from a different value so each choice is a change.
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: bars === 1 ? 2 : 1 },
    });
    await chooseIn(user, countInGroup(), label);
    expect(player.getSnapshot().countInBars).toBe(bars);
    expect(chosenCountIn()).toBe(label);
  });

  it.each([
    ['At the start', 'start', 'every_repeat'],
    ['Every repeat', 'every_repeat', 'start'],
  ] as const)('choosing "%s" sets the mode to %s', async (label, mode, from) => {
    const { player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1, countInMode: from },
    });
    await chooseIn(user, countInModeGroup(), label);
    expect(player.getSnapshot().countInMode).toBe(mode);
    expect(chosenCountInMode()).toBe(label);
  });

  it('keeps the chosen mode while the count-in is off, and shows it again when it is back on', async () => {
    const { player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1, countInMode: 'every_repeat' },
    });
    await chooseIn(user, countInGroup(), 'Off');
    expect(countInModeGroup()).not.toBeInTheDocument();
    expect(player.getSnapshot().countInMode).toBe('every_repeat');

    await chooseIn(user, countInGroup(), '2 bars');
    expect(chosenCountInMode()).toBe('Every repeat');
    expect(player.getSnapshot()).toMatchObject({ countInBars: 2, countInMode: 'every_repeat' });
  });

  it('the arrow keys move the choice, as in any radio group', async () => {
    const { player, user } = setup();
    within(countInGroup()).getByRole('radio', { name: 'Off' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(player.getSnapshot().countInBars).toBe(1);
    expect(chosenCountIn()).toBe('1 bar');
  });

  // 20 batch 8 (13.37a): the C key cycles the count-in with focus anywhere; cycling to Off
  // takes "When to count in" away, and focus on it must not fall to <body>.
  describe('focus when the count-in turns off under "When to count in"', () => {
    const everyRepeat = { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2, countInMode: 'every_repeat' };
    const modeRadio = (name: string) => within(countInModeGroup()!).getByRole('radio', { name });

    it('goes to the checked option of the count-in bars', () => {
      const { player } = setup({ options: everyRepeat as PlayerOptions });
      modeRadio('Every repeat').focus();
      act(() => player.setCountInBars(0));
      expect(countInModeGroup()).not.toBeInTheDocument();
      expect(within(countInGroup()).getByRole('radio', { name: 'Off' })).toHaveFocus();
    });

    it('stays where the user has since put it', () => {
      const outside = document.createElement('button');
      document.body.append(outside);
      try {
        const { player } = setup({ options: everyRepeat as PlayerOptions });
        modeRadio('Every repeat').focus();
        outside.focus();
        act(() => player.setCountInBars(0));
        expect(outside).toHaveFocus();
      } finally {
        outside.remove();
      }
    });

    // 20 batch 8, Review: focus given up since (a tap on the score puts it on <body>) is not
    // lost to the group leaving, and must not be pulled onto a radio, which would then take
    // the arrow keys from the speed and the loops (a pedal's keys).
    it('stays on the page when the user has tapped outside the bar since', () => {
      const { player } = setup({ options: everyRepeat as PlayerOptions });
      modeRadio('Every repeat').focus();
      modeRadio('Every repeat').blur();
      expect(document.body).toHaveFocus();
      act(() => player.setCountInBars(0));
      expect(countInModeGroup()).not.toBeInTheDocument();
      expect(document.body).toHaveFocus();
    });

    it('is left alone while the group stays (2 bars to 1 bar)', () => {
      const { player } = setup({ options: everyRepeat as PlayerOptions });
      modeRadio('Every repeat').focus();
      act(() => player.setCountInBars(1));
      expect(modeRadio('Every repeat')).toHaveFocus();
    });

    it('a count-in turned off with focus on another control of the bar moves nothing', () => {
      const { player } = setup({ options: everyRepeat as PlayerOptions });
      metronome().focus();
      act(() => player.setCountInBars(0));
      expect(metronome()).toHaveFocus();
    });

    // 20 batch 8, Test: C all the way round (Off, 1 bar, 2 bars, Off) from each of the
    // count-in's controls in turn. Whatever comes and goes, focus is on a control of the bar.
    const inBar = () => screen.getByRole('region', { name: 'Player controls' });
    const bars = (name: string) => () => within(countInGroup()).getByRole('radio', { name });
    const mode = (name: string) => () => modeRadio(name);
    const withCountIn = (countInBars: 0 | 1 | 2, countInMode: 'start' | 'every_repeat') =>
      ({ ...DEFAULT_PLAYER_OPTIONS, countInBars, countInMode }) as PlayerOptions;
    it.each([
      ['Off', 0, 'start', bars('Off')],
      ['1 bar, from Off', 0, 'start', bars('1 bar')],
      ['2 bars, from Off', 0, 'start', bars('2 bars')],
      ['Off, from 1 bar', 1, 'start', bars('Off')],
      ['1 bar', 1, 'start', bars('1 bar')],
      ['2 bars', 2, 'every_repeat', bars('2 bars')],
      ['At the start, from 1 bar', 1, 'start', mode('At the start')],
      ['Every repeat (unchecked), from 1 bar', 1, 'start', mode('Every repeat')],
      ['At the start (unchecked), from 2 bars', 2, 'every_repeat', mode('At the start')],
      ['Every repeat, from 2 bars', 2, 'every_repeat', mode('Every repeat')],
    ] as const)(
      'C all the way round with focus on %s never drops focus to <body>',
      (_, startBars, startMode, control) => {
        const { player } = setup({ options: withCountIn(startBars, startMode) });
        control().focus();
        const seen: number[] = [];
        for (let press = 0; press < 3; press++) {
          act(() => player.setCountInBars(nextCountInBars(player.getSnapshot().countInBars)));
          seen.push(player.getSnapshot().countInBars);
          const focused = document.activeElement;
          expect(focused).not.toBe(document.body);
          expect(inBar()).toContainElement(focused as HTMLElement);
          // A radio of the count-in still: the arrows go on from there.
          expect(focused).toHaveAttribute('type', 'radio');
        }
        // The presses did go all the way round, through Off.
        expect([...seen].sort()).toEqual([0, 1, 2]);
        expect(player.getSnapshot().countInBars).toBe(startBars);
      },
    );

    it('with focus on the mode, the count-in coming back leaves focus on the bars, and the arrows still choose', async () => {
      const { player, user } = setup({ options: everyRepeat as PlayerOptions });
      modeRadio('Every repeat').focus();
      act(() => player.setCountInBars(0));
      act(() => player.setCountInBars(1));
      expect(within(countInGroup()).getByRole('radio', { name: 'Off' })).toHaveFocus();
      // The mode is back as it was, unfocused: nothing was lost with the group.
      expect(chosenCountInMode()).toBe('Every repeat');
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).not.toBe(document.body);
      expect(countInGroup()).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it('the choice made in the bar is what the next Play counts', async () => {
    const clicks = new FakeClickOutput();
    const { engine, player, user } = setup({ clicks });

    // Off: Play starts the engine straight away.
    await user.click(playButton());
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(clicks.scheduled).toHaveLength(0);
    act(() => engine.fire('stateChanged', { playing: true }));
    await user.click(playButton());
    act(() => engine.fire('stateChanged', { playing: false }));

    await chooseIn(user, countInGroup(), '2 bars');
    await user.click(playButton());
    expect(player.getSnapshot().status).toBe('countingIn');
    // Two bars of 4/4: eight clicks, two of them accented.
    expect(clicks.scheduled).toHaveLength(8);
    expect(clicks.scheduled.filter(({ click }) => click.accent)).toHaveLength(2);
    expect(engine.play).toHaveBeenCalledTimes(1);

    await user.click(playButton());
    expect(player.getSnapshot().status).toBe('ready');
  });

  it('changing either choice during a count-in leaves it running', async () => {
    const clicks = new FakeClickOutput();
    const { engine, player, user } = setup({
      clicks,
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2 },
    });
    await user.click(playButton());
    expect(player.getSnapshot().status).toBe('countingIn');
    const restartsBefore = engine.restartCalls();

    await chooseIn(user, countInModeGroup(), 'Every repeat');
    await chooseIn(user, countInGroup(), '1 bar');

    expect(player.getSnapshot().status).toBe('countingIn');
    expect(playButton()).toHaveTextContent('Pause');
    expect(clicks.cancelSession).not.toHaveBeenCalled();
    expect(clicks.scheduled).toHaveLength(8);
    expect(engine.restartCalls()).toBe(restartsBefore);

    await user.click(playButton());
  });

  it('Back to start calls a count-in off', async () => {
    const { engine, player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2 },
    });
    await user.click(playButton());
    expect(playButton()).toHaveTextContent('Pause');

    await user.click(backToStart());
    expect(playButton()).toHaveTextContent('Play');
    expect(player.getSnapshot()).toMatchObject({ status: 'ready', countIn: null });
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('both groups have an accessible name, the first from the words beside it', () => {
    setup({ options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1 } });
    expect(countInGroup()).toHaveAccessibleName('Count-in');
    expect(countInModeGroup()).toHaveAccessibleName('When to count in');
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

describe('PlayerControls toggles and actions', () => {
  it('draws each toggle’s state as a mark as well as aria-pressed: a check when on, a ring when off', async () => {
    const { user } = setup({ options: { ...DEFAULT_PLAYER_OPTIONS, metronomeOn: true } });
    const mark = (button: HTMLElement) => button.querySelector('[data-toggle-mark]');
    expect(metronome()).toHaveAttribute('aria-pressed', 'true');
    expect(mark(metronome())).toHaveAttribute('data-toggle-mark', 'on');
    expect(mark(metronome())?.querySelector('svg')).not.toBeNull();
    expect(mark(muteDrums())).toHaveAttribute('data-toggle-mark', 'off');
    expect(mark(muteDrums())?.querySelector('svg')).toBeNull();

    await user.click(muteDrums());
    expect(mark(muteDrums())).toHaveAttribute('data-toggle-mark', 'on');
    // Hidden from screen readers: aria-pressed already says it.
    expect(mark(muteDrums())).toHaveAttribute('aria-hidden', 'true');
  });

  it('Back to start is an action: no toggle state, no mark', () => {
    setup();
    expect(backToStart()).not.toHaveAttribute('aria-pressed');
    expect(backToStart().querySelector('[data-toggle-mark]')).toBeNull();
  });
});

describe('PlayerControls folded', () => {
  function Folding({ player, folded }: { player: PlayerService; folded: boolean }) {
    const snapshot = useSyncExternalStore(player.subscribe, player.getSnapshot);
    const [shown, setShown] = useState(false);
    return (
      <PlayerControls
        player={player}
        snapshot={snapshot}
        fold={{ folded: folded && !shown, canFold: folded, onFoldedChange: (f) => setShown(!f) }}
      />
    );
  }

  function setupFolded() {
    const engine = new FakePlayerEngine();
    const player = new PlayerService(engine, {
      drumTrackIndex: DRUMS,
      options: DEFAULT_PLAYER_OPTIONS,
      wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
      unlockAudio: vi.fn(),
    });
    player.load(new Uint8Array([1]));
    const view = render(<Folding player={player} folded={false} />);
    act(() => engine.finishLoading({ barCount: 16, trackCount: 3 }));
    return {
      engine,
      player,
      user: userEvent.setup(),
      fold: (folded: boolean) => view.rerender(<Folding player={player} folded={folded} />),
    };
  }

  it('keeps only the metronome, the speed and Show controls, in the same region', () => {
    const { fold } = setupFolded();
    fold(true);
    const bar = screen.getByRole('region', { name: 'Player controls' });
    expect(
      within(bar)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Metronome', 'Show controls']);
    expect(speed()).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Metronome volume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Count-in' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show controls' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('Show controls brings the whole bar back while playing, with Hide controls to fold it', async () => {
    const { fold, user } = setupFolded();
    fold(true);
    await user.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(muteDrums()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide controls' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Hide controls' }));
    expect(screen.queryByRole('button', { name: 'Mute drums' })).not.toBeInTheDocument();
  });

  it('folding keeps the metronome and the speed as they were: the same elements, focus kept', () => {
    const { fold } = setupFolded();
    const before = { metronome: metronome(), speed: speed() };
    metronome().focus();
    fold(true);
    expect(metronome()).toBe(before.metronome);
    expect(speed()).toBe(before.speed);
    expect(metronome()).toHaveFocus();
  });

  it('a control folded away with focus on it hands focus to Show controls', () => {
    const { fold } = setupFolded();
    muteDrums().focus();
    fold(true);
    expect(screen.getByRole('button', { name: 'Show controls' })).toHaveFocus();
  });

  it('the strip changes the player live, as the full bar does, without a restart', async () => {
    const { engine, player, fold, user } = setupFolded();
    fold(true);
    const restarts = engine.restartCalls();
    await user.click(metronome());
    fireEvent.change(speed(), { target: { value: '75' } });
    expect(player.getSnapshot()).toMatchObject({ metronomeOn: false, speedRatio: 0.75 });
    expect(engine.restartCalls()).toBe(restarts);
  });

  // 12 UX pass, Test: where focus goes as the bar folds, unfolds and its toggle goes.
  it('Show controls keeps focus as it becomes Hide controls, and back', async () => {
    const { fold, user } = setupFolded();
    fold(true);
    await user.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('button', { name: 'Hide controls' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Show controls' })).toHaveFocus();
  });

  it('focus on Hide controls when playback stops (the toggle goes) moves to the metronome', async () => {
    const { fold, user } = setupFolded();
    fold(true);
    await user.click(screen.getByRole('button', { name: 'Show controls' }));
    expect(screen.getByRole('button', { name: 'Hide controls' })).toHaveFocus();
    fold(false);
    expect(screen.queryByRole('button', { name: /controls$/ })).not.toBeInTheDocument();
    expect(metronome()).toHaveFocus();
  });

  it('a control folded away is no reason to take focus the user has since put elsewhere', () => {
    const outside = document.createElement('button');
    outside.textContent = 'Elsewhere';
    document.body.append(outside);
    try {
      const { fold } = setupFolded();
      muteDrums().focus();
      outside.focus();
      fold(true);
      expect(outside).toHaveFocus();
    } finally {
      outside.remove();
    }
  });

  it('the metronome and the speed stay pressable after a fold that moved focus, with no restart', async () => {
    const { engine, player, fold, user } = setupFolded();
    drumsOnly().focus();
    fold(true);
    const restarts = engine.restartCalls();
    // Focus went to the toggle; the keyboard user goes on from there.
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    expect(speed()).toHaveFocus();
    // jsdom moves no range input by key; a change is what the arrow would send.
    fireEvent.change(speed(), { target: { value: '105' } });
    expect(player.getSnapshot().speedRatio).toBeCloseTo(1.05);
    expect(engine.restartCalls()).toBe(restarts);
  });

  // 20 batch 8, Test (13.37a): C acts with the bar folded too. Folded, the count-in isn't on
  // the bar, so nothing of it can take focus away; shown again while playing, it is, and the
  // hand-over is the count-in's own, not the fold toggle's.
  describe('the count-in cycled while the bar can fold', () => {
    const cycle = (player: PlayerService) =>
      act(() => player.setCountInBars(nextCountInBars(player.getSnapshot().countInBars)));
    const showControls = () => screen.getByRole('button', { name: 'Show controls' });

    it.each([
      ['the metronome', metronome],
      ['the speed', speed],
      ['Show controls', showControls],
    ])('folded, C all the way round leaves focus on %s', (_, control) => {
      const { player, fold } = setupFolded();
      fold(true);
      control().focus();
      for (let press = 0; press < 3; press++) {
        cycle(player);
        expect(control()).toHaveFocus();
      }
      expect(player.getSnapshot().countInBars).toBe(0);
    });

    it('shown again while playing, the count-in turned off under a focused mode hands focus to the bars’ Off, not to the fold toggle', async () => {
      const { player, fold, user } = setupFolded();
      act(() => {
        player.setCountInBars(2);
        player.setCountInMode('every_repeat');
      });
      fold(true);
      await user.click(showControls());
      within(countInModeGroup()!).getByRole('radio', { name: 'Every repeat' }).focus();

      cycle(player);

      expect(player.getSnapshot().countInBars).toBe(0);
      expect(countInModeGroup()).not.toBeInTheDocument();
      expect(within(countInGroup()).getByRole('radio', { name: 'Off' })).toHaveFocus();
    });

    it('a count-in choice folded away with focus on it hands focus to Show controls, as any control does', () => {
      const { player, fold } = setupFolded();
      act(() => player.setCountInBars(2));
      within(countInModeGroup()!).getByRole('radio', { name: 'Every repeat' }).focus();
      fold(true);
      expect(showControls()).toHaveFocus();
      // And C from there, with nothing of the count-in on the bar, moves nothing.
      cycle(player);
      expect(showControls()).toHaveFocus();
    });

    it('the count-in turned off in the same render as the fold hands focus to Show controls', () => {
      const { player, fold } = setupFolded();
      act(() => player.setCountInBars(2));
      within(countInModeGroup()!).getByRole('radio', { name: 'Every repeat' }).focus();
      act(() => {
        player.setCountInBars(0);
        fold(true);
      });
      expect(document.activeElement).not.toBe(document.body);
      expect(showControls()).toHaveFocus();
    });
  });
});

describe('PlayerControls while a loop plays', () => {
  it('the slider gives way to Loop speed, which shows the loop’s own control', async () => {
    const onShow = vi.fn();
    const engine = new FakePlayerEngine();
    const player = new PlayerService(engine, {
      drumTrackIndex: DRUMS,
      options: DEFAULT_PLAYER_OPTIONS,
      wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
      unlockAudio: vi.fn(),
    });
    render(
      <PlayerControls
        player={player}
        snapshot={{ ...player.getSnapshot(), speedRatio: 0.85 }}
        onShowLoopSpeed={onShow}
      />,
    );
    expect(screen.queryByRole('slider', { name: 'Speed' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Loop speed 85%' });
    await userEvent.setup().click(button);
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('Loop speed is the same button folded or not, so focus on it survives the fold', () => {
    const engine = new FakePlayerEngine();
    const player = new PlayerService(engine, {
      drumTrackIndex: DRUMS,
      options: DEFAULT_PLAYER_OPTIONS,
      wakeLock: { setActive: vi.fn(), dispose: vi.fn() },
      unlockAudio: vi.fn(),
    });
    const at = (folded: boolean) => (
      <PlayerControls
        player={player}
        snapshot={player.getSnapshot()}
        fold={{ folded, canFold: true, onFoldedChange: () => {} }}
        onShowLoopSpeed={() => {}}
      />
    );
    const view = render(at(false));
    const button = screen.getByRole('button', { name: 'Loop speed 100%' });
    button.focus();
    view.rerender(at(true));
    expect(screen.getByRole('button', { name: 'Loop speed 100%' })).toBe(button);
    expect(button).toHaveFocus();
  });
});

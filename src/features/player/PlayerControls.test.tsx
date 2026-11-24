import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, useSyncExternalStore } from 'react';
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
  const countIn = () => screen.getByRole('radiogroup', { name: 'Count-in' });
  const countInMode = () => screen.queryByRole('radiogroup', { name: 'When to count in' });
  /** The label of the option a segmented control has on, or null for none. */
  const chosen = (group: HTMLElement | null) => {
    if (!group) return null;
    const radio = within(group)
      .getAllByRole<HTMLInputElement>('radio')
      .find((each) => each.checked);
    return radio?.closest('label')?.textContent ?? null;
  };
  const choose = (user: ReturnType<typeof userEvent.setup>, group: HTMLElement, label: string) =>
    user.click(within(group).getByRole('radio', { name: label }));

  it('starts from the options it is given', () => {
    setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 2, countInMode: 'every_repeat' },
    });
    expect(chosen(countIn())).toBe('2 bars');
    expect(chosen(countInMode())).toBe('Every repeat');
  });

  it('offers off, 1 bar and 2 bars as a segmented control, and no mode while off', () => {
    setup();
    expect(chosen(countIn())).toBe('Off');
    expect(
      within(countIn())
        .getAllByRole('radio')
        .map((radio) => radio.closest('label')?.textContent),
    ).toEqual(['Off', '1 bar', '2 bars']);
    // Progressive disclosure: the mode only matters with a count-in to play.
    expect(countInMode()).not.toBeInTheDocument();
  });

  it('shows the mode once a count-in is chosen, with both of its choices in full', async () => {
    const { user } = setup();
    await choose(user, countIn(), '1 bar');
    const mode = countInMode();
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

    await choose(user, countIn(), '1 bar');
    await choose(user, countInMode() as HTMLElement, 'Every repeat');

    expect(player.getSnapshot()).toMatchObject({ countInBars: 1, countInMode: 'every_repeat' });
    expect(chosen(countIn())).toBe('1 bar');
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
    expect(chosen(countIn())).toBe('1 bar');
    for (const radio of within(countIn()).getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(chosen(countInMode())).toBe('Every repeat');
    for (const radio of within(countInMode() as HTMLElement).getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('can be set while the song is still loading', async () => {
    const { player, user } = setup({ loaded: false });
    expect(within(countIn()).getByRole('radio', { name: '2 bars' })).toBeEnabled();
    await choose(user, countIn(), '2 bars');
    expect(player.getSnapshot().countInBars).toBe(2);
    expect(countInMode()).toBeInTheDocument();
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
    await choose(user, countIn(), label);
    expect(player.getSnapshot().countInBars).toBe(bars);
    expect(chosen(countIn())).toBe(label);
  });

  it.each([
    ['At the start', 'start', 'every_repeat'],
    ['Every repeat', 'every_repeat', 'start'],
  ] as const)('choosing "%s" sets the mode to %s', async (label, mode, from) => {
    const { player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1, countInMode: from },
    });
    await choose(user, countInMode() as HTMLElement, label);
    expect(player.getSnapshot().countInMode).toBe(mode);
    expect(chosen(countInMode())).toBe(label);
  });

  it('keeps the chosen mode while the count-in is off, and shows it again when it is back on', async () => {
    const { player, user } = setup({
      options: { ...DEFAULT_PLAYER_OPTIONS, countInBars: 1, countInMode: 'every_repeat' },
    });
    await choose(user, countIn(), 'Off');
    expect(countInMode()).not.toBeInTheDocument();
    expect(player.getSnapshot().countInMode).toBe('every_repeat');

    await choose(user, countIn(), '2 bars');
    expect(chosen(countInMode())).toBe('Every repeat');
    expect(player.getSnapshot()).toMatchObject({ countInBars: 2, countInMode: 'every_repeat' });
  });

  it('the arrow keys move the choice, as in any radio group', async () => {
    const { player, user } = setup();
    within(countIn()).getByRole('radio', { name: 'Off' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(player.getSnapshot().countInBars).toBe(1);
    expect(chosen(countIn())).toBe('1 bar');
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

    await choose(user, countIn(), '2 bars');
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

    await choose(user, countInMode() as HTMLElement, 'Every repeat');
    await choose(user, countIn(), '1 bar');

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
    expect(countIn()).toHaveAccessibleName('Count-in');
    expect(countInMode()).toHaveAccessibleName('When to count in');
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

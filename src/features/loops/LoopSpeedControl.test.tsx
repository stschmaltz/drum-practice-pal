import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_PLAYER_OPTIONS } from '@/features/player/playerOptions';
import { initialPlayerSnapshot, type PlayerService } from '@/features/player/PlayerService';
import { SPEED_RATIO_MAX, SPEED_RATIO_MIN } from '@/lib/schema';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { startOfBar } from '@/test/fakePlayerEngine';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { LOOP_SONG_ID, loopRow, serveLoopTable } from '@/test/loopTable';
import { testQueryClient, wrapperFor } from '@/test/render';
import type { Loop } from './loopForm';
import { LoopSpeedControl } from './LoopSpeedControl';
import { useLoops } from './useLoops';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

/** The control for the saved loop `loopId`, read through the loops cache like the panel does. */
function Control({ player, loopId }: { player: PlayerService; loopId: string }) {
  const snapshot = usePlayerSnapshot(player);
  const loop = useLoops(LOOP_SONG_ID).data?.find((row) => row.id === loopId);
  if (!loop) return <p>Loading loops…</p>;
  return <LoopSpeedControl songId={LOOP_SONG_ID} loop={loop} player={player} snapshot={snapshot} />;
}

/**
 * Renders the control for one saved loop with the player already at the
 * loop's saved speed, as "Play loop" leaves it.
 */
async function renderControl(loop: Loop) {
  const table = serveLoopTable([loop]);
  const { engine, player } = loopPlayer();
  player.setSpeed(loop.speed_ratio);
  render(<Control player={player} loopId={loop.id} />, { wrapper: wrapperFor(testQueryClient()) });
  const group = within(await screen.findByRole('group', { name: 'Loop speed' }));
  return {
    user: userEvent.setup(),
    table,
    engine,
    player,
    percent: () => group.getByLabelText('Speed %'),
    bpm: () => group.getByLabelText('BPM'),
    nudge: (name: string) => group.getByRole('button', { name }),
    save: () => group.getByRole('button', { name: 'Save speed' }),
    saved: () => screen.getByTestId('loop-saved-speed'),
  };
}

/** Bars 5 to 8 of the tempo-change song: 120 BPM in the file. */
const before = loopRow('before', { start_bar: 5, end_bar: 8, speed_ratio: 0.8 });
/** Bars 9 to 12: after the change, 90 BPM in the file. */
const after = loopRow('after', { start_bar: 9, end_bar: 12, speed_ratio: 1 });
/** Bars 7 to 10: starts at 120, crosses into 90. */
const across = loopRow('across', { start_bar: 7, end_bar: 10, speed_ratio: 0.5 });

beforeEach(() => {
  resetFakeSupabase();
});

describe('LoopSpeedControl readout', () => {
  it.each([
    ['before the tempo change', before, '80', '96', 'Saved: 80% (96 BPM)'],
    ['after the tempo change', after, '100', '90', 'Saved: 100% (90 BPM)'],
    ['across the tempo change', across, '50', '60', 'Saved: 50% (60 BPM)'],
  ])(
    'a loop %s shows its speed as % and as BPM at its first bar',
    async (_where, loop, percent, bpm, savedLabel) => {
      const view = await renderControl(loop);
      expect(view.percent()).toHaveValue(percent);
      expect(view.bpm()).toHaveValue(bpm);
      expect(view.saved()).toHaveTextContent(savedLabel);
    },
  );

  it('keeps the first bar’s BPM while playback is in a later bar at another tempo', async () => {
    const view = await renderControl(across);
    act(() => view.engine.fire('position', { tick: startOfBar(10) + 10 }));
    expect(view.player.getSnapshot()).toMatchObject({ barNumber: 10, barTempo: 90 });
    expect(view.bpm()).toHaveValue('60');
  });

  it('follows a speed set elsewhere, such as the controls bar’s slider', async () => {
    const view = await renderControl(before);
    act(() => view.player.setSpeed(1.25));
    expect(view.percent()).toHaveValue('125');
    expect(view.bpm()).toHaveValue('150');
  });

  it('is disabled until there is a player, with no BPM to show', () => {
    serveLoopTable([before]);
    render(
      <LoopSpeedControl
        songId={LOOP_SONG_ID}
        loop={before}
        player={null}
        snapshot={initialPlayerSnapshot(0, DEFAULT_PLAYER_OPTIONS)}
      />,
      { wrapper: wrapperFor(testQueryClient()) },
    );
    expect(screen.getByLabelText('Speed %')).toBeDisabled();
    expect(screen.getByLabelText('BPM')).toBeDisabled();
    expect(screen.getByLabelText('BPM')).toHaveValue('');
    for (const button of screen.getAllByRole('button', { name: /^(Slower|Faster) by/ })) {
      expect(button).toBeDisabled();
    }
    // The percent alone, until a tempo is known.
    expect(screen.getByTestId('loop-saved-speed')).toHaveTextContent('Saved: 80%');
  });

  // Unit 13 Test (05 QA issue 3): after a player failure the speed is off here as in the controls bar.
  it('turns its fields and nudges off once the player has failed', async () => {
    const view = await renderControl(before);
    act(() => view.engine.fire('error', { error: new Error('soundfont') }));
    expect(view.percent()).toBeDisabled();
    expect(view.bpm()).toBeDisabled();
    for (const button of screen.getAllByRole('button', { name: /^(Slower|Faster) by/ })) {
      expect(button).toBeDisabled();
    }
  });

  it('a speed being typed when the player fails is not set when the field lets go of it', async () => {
    const view = await renderControl(before);
    await view.user.clear(view.percent());
    await view.user.type(view.percent(), '60');
    act(() => view.engine.fire('error', { error: new Error('soundfont') }));

    // The field commits on blur, which a disabled field still sends on its way out.
    fireEvent.blur(view.percent());
    expect(view.player.getSnapshot().speedRatio).toBe(0.8);
    expect(view.percent()).toHaveValue('80');
  });

  it('waits for the score before offering BPM, and fills it in once loaded', async () => {
    serveLoopTable([after]);
    const { player, finishLoading } = loopPlayer({ loaded: false });
    render(<Control player={player} loopId={after.id} />, {
      wrapper: wrapperFor(testQueryClient()),
    });
    const bpm = await screen.findByLabelText('BPM');
    expect(bpm).toBeDisabled();
    expect(bpm).toHaveValue('');

    act(() => finishLoading());

    expect(bpm).toBeEnabled();
    expect(bpm).toHaveValue('90');
  });
});

describe('LoopSpeedControl typing a speed', () => {
  it('a typed percent changes the speed on Enter, not per keystroke, and BPM follows', async () => {
    const view = await renderControl(before);
    view.engine.setSpeed.mockClear();

    await view.user.clear(view.percent());
    await view.user.type(view.percent(), '65');
    // "6" on the way to "65" would have been the slowest speed allowed.
    expect(view.engine.setSpeed).not.toHaveBeenCalled();
    expect(view.bpm()).toHaveValue('96');

    await view.user.keyboard('{Enter}');
    expect(view.engine.setSpeed).toHaveBeenCalledTimes(1);
    expect(view.engine.setSpeed).toHaveBeenLastCalledWith(0.65);
    expect(view.percent()).toHaveValue('65');
    expect(view.bpm()).toHaveValue('78');
  });

  it('a typed value is taken when the field is left', async () => {
    const view = await renderControl(before);
    await view.user.clear(view.bpm());
    await view.user.type(view.bpm(), '60');
    await view.user.tab();
    expect(view.player.getSnapshot().speedRatio).toBe(0.5);
    expect(view.percent()).toHaveValue('50');
  });

  it('Escape puts the current value back and changes nothing', async () => {
    const view = await renderControl(before);
    view.engine.setSpeed.mockClear();
    await view.user.clear(view.percent());
    await view.user.type(view.percent(), '150{Escape}');
    expect(view.percent()).toHaveValue('80');
    await view.user.tab();
    expect(view.engine.setSpeed).not.toHaveBeenCalled();
  });

  it('a typed BPM sets the exact ratio it implies, from the tempo at the loop’s first bar', async () => {
    const view = await renderControl(after);
    await view.user.clear(view.bpm());
    await view.user.type(view.bpm(), '77{Enter}');
    // 77 of 90, not of the song's opening 120, and not rounded to 86%.
    expect(view.player.getSnapshot().speedRatio).toBe(0.855556);
    expect(view.percent()).toHaveValue('86');
    expect(view.bpm()).toHaveValue('77');
  });

  it.each([
    ['Speed %', '900', SPEED_RATIO_MAX, '200'],
    ['Speed %', '3', SPEED_RATIO_MIN, '25'],
    ['BPM', '999', SPEED_RATIO_MAX, '200'],
    ['BPM', '1', SPEED_RATIO_MIN, '25'],
  ])('%s typed as %s is held to the speed bounds', async (label, typed, ratio, percent) => {
    const view = await renderControl(before);
    const field = screen.getByLabelText(label);
    await view.user.clear(field);
    await view.user.type(field, `${typed}{Enter}`);
    expect(view.player.getSnapshot().speedRatio).toBe(ratio);
    expect(view.percent()).toHaveValue(percent);
  });

  it.each(['fast', '0', '-40', ''])('ignores %j and shows the speed as it was', async (typed) => {
    const view = await renderControl(before);
    view.engine.setSpeed.mockClear();
    for (const field of [view.percent(), view.bpm()]) {
      await view.user.clear(field);
      if (typed) await view.user.type(field, typed);
      await view.user.keyboard('{Enter}');
    }
    expect(view.engine.setSpeed).not.toHaveBeenCalled();
    expect(view.percent()).toHaveValue('80');
    expect(view.bpm()).toHaveValue('96');
  });

  it('changes speed live: nothing stops, starts or reloads while playing', async () => {
    const view = await renderControl(before);
    act(() => {
      view.player.play();
      view.engine.fire('stateChanged', { playing: true });
    });
    const restarts = view.engine.restartCalls();

    await view.user.clear(view.bpm());
    await view.user.type(view.bpm(), '100{Enter}');
    await view.user.click(view.nudge('Faster by 5%'));
    await view.user.click(view.save());
    await waitFor(() => expect(view.table.sent('update')).toHaveLength(1));

    expect(view.engine.restartCalls()).toBe(restarts);
    expect(view.player.getSnapshot().status).toBe('playing');
  });
});

describe('LoopSpeedControl nudges', () => {
  it.each([
    ['Slower by 5%', 0.75],
    ['Slower by 1%', 0.79],
    ['Faster by 1%', 0.81],
    ['Faster by 5%', 0.85],
  ])('%s moves the speed from 80%% to %s', async (name, ratio) => {
    const view = await renderControl(before);
    await view.user.click(view.nudge(name));
    expect(view.player.getSnapshot().speedRatio).toBe(ratio);
  });

  it('nudges from the percent on show after a typed BPM, landing on whole percents', async () => {
    const view = await renderControl(before);
    await view.user.clear(view.bpm());
    await view.user.type(view.bpm(), '85{Enter}');
    expect(view.player.getSnapshot().speedRatio).toBe(0.708333);

    await view.user.click(view.nudge('Faster by 1%'));
    expect(view.player.getSnapshot().speedRatio).toBe(0.72);
    await view.user.click(view.nudge('Slower by 1%'));
    expect(view.player.getSnapshot().speedRatio).toBe(0.71);
  });

  it('stops at 25% and at 200%', async () => {
    const view = await renderControl(before);
    act(() => view.player.setSpeed(0.27));
    await view.user.click(view.nudge('Slower by 5%'));
    expect(view.percent()).toHaveValue('25');
    await view.user.click(view.nudge('Slower by 1%'));
    expect(view.player.getSnapshot().speedRatio).toBe(SPEED_RATIO_MIN);

    act(() => view.player.setSpeed(1.98));
    await view.user.click(view.nudge('Faster by 5%'));
    expect(view.percent()).toHaveValue('200');
    await view.user.click(view.nudge('Faster by 1%'));
    expect(view.player.getSnapshot().speedRatio).toBe(SPEED_RATIO_MAX);
  });
});

describe('LoopSpeedControl Save speed', () => {
  it('is offered only while the speed playing differs from the saved one', async () => {
    const view = await renderControl(before);
    expect(view.save()).toBeDisabled();

    await view.user.click(view.nudge('Faster by 5%'));
    expect(view.save()).toBeEnabled();
    // Until it is saved the loop keeps its old speed.
    expect(view.saved()).toHaveTextContent('Saved: 80% (96 BPM)');
    expect(view.table.sent('update')).toEqual([]);

    await view.user.click(view.nudge('Slower by 5%'));
    expect(view.save()).toBeDisabled();
  });

  it('writes the speed playing now, and only that column', async () => {
    const view = await renderControl(before);
    await view.user.clear(view.bpm());
    await view.user.type(view.bpm(), '85{Enter}');
    await view.user.click(view.save());

    await waitFor(() => expect(view.table.sent('update')).toEqual([{ speed_ratio: 0.708333 }]));
    await waitFor(() => expect(view.saved()).toHaveTextContent('Saved: 71% (85 BPM)'));
    expect(view.table.rows()[0]).toMatchObject({ speed_ratio: 0.708333, name: before.name });
    expect(view.save()).toBeDisabled();
  });

  it('cannot be pressed twice while a save is on its way', async () => {
    const view = await renderControl(before);
    const release = view.table.holdNext('update');
    await view.user.click(view.nudge('Faster by 5%'));
    await view.user.click(view.save());

    await waitFor(() => expect(view.saved()).toHaveTextContent('Saved: 85% (102 BPM)'));
    expect(view.save()).toBeDisabled();
    // A different speed meanwhile still can't start a second save alongside the first.
    await view.user.click(view.nudge('Faster by 1%'));
    expect(view.save()).toBeDisabled();

    release();
    await waitFor(() => expect(view.save()).toBeEnabled());
    expect(view.table.sent('update')).toEqual([{ speed_ratio: 0.85 }]);
  });

  it('a failed save says so, keeps the old saved speed and the speed playing, and can be retried', async () => {
    const view = await renderControl(before);
    view.table.failNext('update', 'permission denied');
    await view.user.click(view.nudge('Faster by 5%'));
    await view.user.click(view.save());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the speed. Something went wrong. Try again.",
    );
    await waitFor(() => expect(view.saved()).toHaveTextContent('Saved: 80% (96 BPM)'));
    expect(view.percent()).toHaveValue('85');
    expect(view.save()).toBeEnabled();

    await view.user.click(view.save());
    await waitFor(() => expect(view.table.rows()[0]?.speed_ratio).toBe(0.85));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(view.saved()).toHaveTextContent('Saved: 85% (102 BPM)');
  });

  it('a new speed clears the message about the failed one', async () => {
    const view = await renderControl(before);
    view.table.failNext('update', 'offline');
    await view.user.click(view.nudge('Faster by 5%'));
    await view.user.click(view.save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await view.user.click(view.nudge('Faster by 1%'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

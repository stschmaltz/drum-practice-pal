import { act, fireEvent, renderHook, waitFor } from '@testing-library/react';
import { useLoopPractice } from '@/features/loops/useLoopPractice';
import { useLoops } from '@/features/loops/useLoops';
import type { Loop } from '@/features/loops/loopForm';
import type { PlayerService } from '@/features/player/PlayerService';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { startOfBar } from '@/test/fakePlayerEngine';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { LOOP_SONG_ID, loopRow, serveLoopTable } from '@/test/loopTable';
import { signedInAs, testQueryClient, wrapperFor } from '@/test/render';
import { saveCharacterKeysOn } from '@/features/shortcuts/characterKeysPreference';
import { useSongShortcuts } from './useSongShortcuts';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const intro = loopRow('intro', { name: 'Intro', start_bar: 1, end_bar: 2, speed_ratio: 0.6 });
const verse = loopRow('verse', { name: 'Verse', start_bar: 5, end_bar: 8, speed_ratio: 0.8 });
const outro = loopRow('outro', { name: 'Outro', start_bar: 13, end_bar: 16, speed_ratio: 1.1 });
const finishedFill = loopRow('fill', {
  name: 'Fill',
  start_bar: 3,
  end_bar: 3,
  status: 'finished',
});

interface ShortcutOptions {
  loaded?: boolean;
  drumTrackIndex?: number | null;
  /** StrictMode: effects mount, clean up and mount again. */
  strict?: boolean;
  /** The song's loops are still being read: the view comes back before they are in. */
  loopsPending?: boolean;
}

/** The shortcuts over a real player, the song's loops and the practice hook, as the song page wires them. */
async function renderShortcuts(
  loops: Loop[] = [verse, outro, intro],
  { loaded = true, drumTrackIndex = 0, strict = false, loopsPending = false }: ShortcutOptions = {},
) {
  const table = serveLoopTable(loops);
  if (loopsPending) table.holdNext('select');
  const { engine, player, finishLoading } = loopPlayer({ loaded, drumTrackIndex });
  const hook = renderHook(
    ({ mounted }: { mounted: PlayerService | null }) => {
      const snapshot = usePlayerSnapshot(player);
      const query = useLoops(LOOP_SONG_ID);
      const practice = useLoopPractice(mounted, snapshot, query.data);
      const shortcuts = useSongShortcuts({ player: mounted, practice, loops: query.data });
      return { practice, shortcuts, query };
    },
    {
      wrapper: wrapperFor(testQueryClient(), signedInAs()),
      initialProps: { mounted: player as PlayerService | null },
      reactStrictMode: strict,
    },
  );
  if (!loopsPending) await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));

  /** A `keydown` with the focus on `target` (the page by default); false when the page took it. */
  const keyDown = (k: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.keyDown(target, { key: k, ...init });
    });
    return notPrevented;
  };
  /** A `keyup` on `target`; false when the page cancelled it. */
  const keyUp = (k: string, target: Element = document.body) => {
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.keyUp(target, { key: k });
    });
    return notPrevented;
  };
  /** A whole press, down and up; false when the page took its keydown. */
  const key = (k: string, init: KeyboardEventInit = {}, target: Element = document.body) => {
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.keyDown(target, { key: k, ...init });
      fireEvent.keyUp(target, { key: k, ...init });
    });
    return notPrevented;
  };
  const playing = () => act(() => engine.fire('stateChanged', { playing: true }));
  const activeLoop = () => hook.result.current.practice.activeLoop?.id ?? null;
  const helpOpen = () => hook.result.current.shortcuts.helpOpen;
  return {
    engine,
    player,
    finishLoading,
    hook,
    key,
    keyDown,
    keyUp,
    playing,
    activeLoop,
    helpOpen,
  };
}

/** Elements a test adds to the page beside the hook, taken away after it. */
const placed: Element[] = [];

/** An element on the page with the focus, as the loop form's fields or a button would have it. */
function focused<K extends 'button' | 'input' | 'select'>(
  tag: K,
  setUp: (element: HTMLElementTagNameMap[K]) => void = () => {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  setUp(element);
  placed.push(element);
  document.body.append(element);
  element.focus();
  return element;
}

/** A field on the page, focused, as the loop form's or the speed control's are. */
const focusedInput = (type = 'text') => focused('input', (input) => (input.type = type));

beforeEach(() => {
  resetFakeSupabase();
});

afterEach(() => {
  // Only what the tests put there: Testing Library unmounts its own containers.
  for (const element of placed.splice(0)) element.remove();
});

describe('Space', () => {
  it('plays and pauses, calling the engine inside the key press', async () => {
    const view = await renderShortcuts();

    expect(view.key(' ')).toBe(false);
    expect(view.engine.play).toHaveBeenCalledTimes(1);
    view.playing();
    view.key(' ');
    expect(view.engine.pause).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the song is still loading, as Play is disabled then', async () => {
    const view = await renderShortcuts(undefined, { loaded: false });

    view.key(' ');
    expect(view.engine.play).not.toHaveBeenCalled();
    expect(view.player.getSnapshot().status).toBe('loading');
  });

  it('is play/pause with a button focused, and the button is not pressed as well', async () => {
    const view = await renderShortcuts();
    const pressed = vi.fn();
    const button = focused('button', (element) => element.addEventListener('click', pressed));

    expect(view.key(' ', {}, button)).toBe(false);
    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(pressed).not.toHaveBeenCalled();
  });

  it('held down, plays once rather than toggling on every repeat', async () => {
    const view = await renderShortcuts();

    view.key(' ');
    expect(view.key(' ', { repeat: true })).toBe(false);
    expect(view.key(' ', { repeat: true })).toBe(false);
    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(view.engine.pause).not.toHaveBeenCalled();
  });

  it('cancels the keyup of a Space it took, and leaves a field’s own Space keyup alone', async () => {
    const view = await renderShortcuts();

    view.keyDown(' ');
    expect(view.keyUp(' ')).toBe(false);
    // Only the one keyup that followed.
    expect(view.keyUp(' ')).toBe(true);

    const input = focusedInput();
    view.keyDown(' ', {}, input);
    expect(view.keyUp(' ', input)).toBe(true);
  });

  it('a Space whose keyup never came (the window lost focus while it was held) leaves the next one alone', async () => {
    const view = await renderShortcuts();

    view.keyDown(' ');
    // No keyup: it went to another window. Back, the list is opened and Space
    // presses its Close, which a button does on keyup.
    view.key('?');
    expect(view.helpOpen()).toBe(true);
    const close = focused('button');
    expect(view.keyDown(' ', {}, close)).toBe(true);
    expect(view.keyUp(' ', close)).toBe(true);
  });
});

describe('speed', () => {
  it('moves 5% at a time, and quick presses add up before anything is drawn', async () => {
    const view = await renderShortcuts();

    act(() => {
      fireEvent.keyDown(document.body, { key: 'ArrowUp' });
      fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    });
    expect(view.player.getSnapshot().speedRatio).toBe(1.1);
    view.key('ArrowDown');
    expect(view.player.getSnapshot().speedRatio).toBe(1.05);
  });

  it('nudges from the percent on show, so a speed from a BPM goes to a whole percent', async () => {
    const view = await renderShortcuts();
    act(() => view.player.setSpeed(0.708333));

    view.key('ArrowUp');
    expect(view.player.getSnapshot().speedRatio).toBe(0.76);
  });

  it('keeps going while the key is held, and stops at the bounds', async () => {
    const view = await renderShortcuts();

    for (let i = 0; i < 30; i++) view.key('ArrowUp', { repeat: i > 0 });
    expect(view.player.getSnapshot().speedRatio).toBe(2);
  });

  it('changes live, without stopping or restarting playback', async () => {
    const view = await renderShortcuts();
    view.key(' ');
    view.playing();
    const restarts = view.engine.restartCalls();

    view.key('ArrowDown');
    view.key('m');
    view.key('d');
    view.key('s');
    view.key('c');
    expect(view.engine.restartCalls()).toBe(restarts);
    expect(view.player.getSnapshot().status).toBe('playing');
  });
});

describe('metronome, drums and count-in', () => {
  it('M toggles the metronome', async () => {
    const view = await renderShortcuts();
    const before = view.player.getSnapshot().metronomeOn;

    view.key('m');
    expect(view.player.getSnapshot().metronomeOn).toBe(!before);
    view.key('M');
    expect(view.player.getSnapshot().metronomeOn).toBe(before);
  });

  it('D mutes the drums and S plays them alone; each turns the other off', async () => {
    const view = await renderShortcuts();

    view.key('d');
    expect(view.player.getSnapshot()).toMatchObject({ drumsMuted: true, drumsOnly: false });
    view.key('s');
    expect(view.player.getSnapshot()).toMatchObject({ drumsMuted: false, drumsOnly: true });
    view.key('s');
    expect(view.player.getSnapshot()).toMatchObject({ drumsMuted: false, drumsOnly: false });
  });

  it('in a song with no drum track, D and S are the page’s keys but change nothing', async () => {
    const view = await renderShortcuts(undefined, { drumTrackIndex: null });
    const sounding = view.engine.soundingTracks();

    expect(view.key('d')).toBe(false);
    expect(view.key('s')).toBe(false);
    expect(view.player.getSnapshot()).toMatchObject({ drumsMuted: false, drumsOnly: false });
    expect(view.engine.soundingTracks()).toEqual(sounding);
  });

  it('C cycles the count-in: off, 1 bar, 2 bars, off', async () => {
    const view = await renderShortcuts();
    expect(view.player.getSnapshot().countInBars).toBe(0);

    const seen = [1, 2, 3].map(() => {
      view.key('c');
      return view.player.getSnapshot().countInBars;
    });
    expect(seen).toEqual([1, 2, 0]);
  });

  describe('with single-key shortcuts off on this device', () => {
    it('M, D, S, C and ? do nothing and stay the browser’s; Space and the arrows still act', async () => {
      saveCharacterKeysOn(false);
      const view = await renderShortcuts();
      const before = view.player.getSnapshot();

      for (const k of ['m', 'M', 'd', 's', 'c']) expect(view.key(k)).toBe(true);
      expect(view.key('?', { shiftKey: true })).toBe(true);
      expect(view.helpOpen()).toBe(false);
      expect(view.player.getSnapshot()).toMatchObject({
        metronomeOn: before.metronomeOn,
        drumsMuted: false,
        drumsOnly: false,
        countInBars: 0,
      });

      // The keys did arrive: the ones that aren't single characters act on the same listener.
      expect(view.key('ArrowUp')).toBe(false);
      expect(view.player.getSnapshot().speedRatio).toBeCloseTo(1.05);
      expect(view.key('PageDown')).toBe(false);
      await waitFor(() => expect(view.activeLoop()).toBe('intro'));
      expect(view.key(' ')).toBe(false);
      expect(view.engine.play).toHaveBeenCalledTimes(1);
    });

    it('takes a change at the next press, with no remount (another tab or Settings)', async () => {
      const view = await renderShortcuts();
      const before = view.player.getSnapshot().metronomeOn;

      saveCharacterKeysOn(false);
      expect(view.key('m')).toBe(true);
      expect(view.player.getSnapshot().metronomeOn).toBe(before);

      saveCharacterKeysOn(true);
      expect(view.key('m')).toBe(false);
      expect(view.player.getSnapshot().metronomeOn).toBe(!before);
    });
  });
});

describe('switching loops', () => {
  it('from jam mode while paused, sets up the first loop in the panel’s order with its speed, without playing', async () => {
    const view = await renderShortcuts();

    expect(view.key('ArrowRight')).toBe(false);
    await waitFor(() => expect(view.activeLoop()).toBe('intro'));
    expect(view.player.getSnapshot()).toMatchObject({
      speedRatio: 0.6,
      range: { startBar: 1, endBar: 2 },
    });
    expect(view.engine.play).not.toHaveBeenCalled();
  });

  it('paused, shows the loop’s first bar, and keeps a speed typed as a BPM exactly', async () => {
    const fine = loopRow('fine', {
      name: 'Fine',
      start_bar: 9,
      end_bar: 12,
      speed_ratio: 0.708333,
    });
    const view = await renderShortcuts([fine]);
    const showBar = vi.spyOn(view.player, 'showBar');

    view.key('ArrowRight');
    await waitFor(() => expect(view.activeLoop()).toBe('fine'));
    // Not rounded to the 71% on show: the saved ratio, untouched.
    expect(view.player.getSnapshot().speedRatio).toBe(0.708333);
    expect(showBar).toHaveBeenCalledWith(9);
    expect(view.engine.play).not.toHaveBeenCalled();
  });

  it('steps through the loops by first bar with either pair of keys, and stops at the ends', async () => {
    const view = await renderShortcuts();
    const visited: (string | null)[] = [];
    for (const k of ['PageDown', 'PageDown', 'ArrowRight', 'ArrowRight', 'PageUp', 'ArrowLeft']) {
      view.key(k);
      await waitFor(() => expect(view.activeLoop()).not.toBeNull());
      visited.push(view.activeLoop());
    }
    expect(visited).toEqual(['intro', 'verse', 'outro', 'outro', 'verse', 'intro']);
  });

  it('two loop keys pressed with nothing awaited between them land two loops on', async () => {
    const view = await renderShortcuts();

    view.key('PageDown');
    view.key('PageDown');
    expect(view.activeLoop()).toBe('verse');
    expect(view.player.getSnapshot().range).toEqual({ startBar: 5, endBar: 8 });
  });

  it('a held Page Down moves one loop, not one per repeat', async () => {
    const view = await renderShortcuts();

    view.key('PageDown');
    for (let i = 0; i < 3; i++) expect(view.key('PageDown', { repeat: true })).toBe(false);
    expect(view.activeLoop()).toBe('intro');
  });

  it('previous from jam mode goes to the last loop', async () => {
    const view = await renderShortcuts();

    view.key('PageUp');
    await waitFor(() => expect(view.activeLoop()).toBe('outro'));
  });

  it('while playing, plays the next loop at its saved speed with no stop in between', async () => {
    const view = await renderShortcuts();
    view.key('ArrowRight');
    await waitFor(() => expect(view.activeLoop()).toBe('intro'));
    view.key(' ');
    view.playing();

    view.key('ArrowRight');
    await waitFor(() => expect(view.activeLoop()).toBe('verse'));
    expect(view.player.getSnapshot()).toMatchObject({
      speedRatio: 0.8,
      range: { startBar: 5, endBar: 8 },
    });
    expect(view.engine.stop).not.toHaveBeenCalled();
    expect(view.engine.pause).not.toHaveBeenCalled();
    expect(view.engine.seek).toHaveBeenLastCalledWith(startOfBar(5));
  });

  it('during a count-in, plays the next loop: the count-in starts again on its first bar', async () => {
    const view = await renderShortcuts();
    act(() => view.player.setCountInBars(1));
    view.key(' ');
    expect(view.player.getSnapshot().status).toBe('countingIn');

    view.key('PageDown');
    view.key('PageDown');

    expect(view.activeLoop()).toBe('verse');
    expect(view.player.getSnapshot()).toMatchObject({
      status: 'countingIn',
      range: { startBar: 5, endBar: 8 },
      barNumber: 5,
      speedRatio: 0.8,
    });
    // Still counting: the engine hasn't been told to play the old bar meanwhile.
    expect(view.engine.play).not.toHaveBeenCalled();
    expect(view.engine.stop).not.toHaveBeenCalled();
  });

  it('goes on into the finished loops after the active ones, as the panel lists them', async () => {
    const view = await renderShortcuts([verse, finishedFill]);

    view.key('ArrowRight');
    await waitFor(() => expect(view.activeLoop()).toBe('verse'));
    view.key('ArrowRight');
    await waitFor(() => expect(view.activeLoop()).toBe('fill'));
  });

  it('does nothing before the song is loaded, as Play loop is disabled then', async () => {
    const view = await renderShortcuts(undefined, { loaded: false });

    view.key('ArrowRight');
    view.key('PageDown');
    expect(view.activeLoop()).toBeNull();
  });

  it('does nothing while the loop form is open', async () => {
    const view = await renderShortcuts();
    act(() => view.hook.result.current.practice.openEditor(null));

    view.key('ArrowRight');
    view.key('PageDown');
    expect(view.activeLoop()).toBeNull();
  });
});

describe('left and right in a song with no loops', () => {
  it('step a bar on and back, and show it', async () => {
    const view = await renderShortcuts([]);
    const showBar = vi.spyOn(view.player, 'showBar');

    view.key('ArrowRight');
    expect(view.player.getSnapshot().barNumber).toBe(2);
    expect(showBar).toHaveBeenLastCalledWith(2);
    view.key('PageDown');
    view.key('ArrowLeft');
    expect(view.player.getSnapshot().barNumber).toBe(2);
    expect(view.engine.seek).toHaveBeenLastCalledWith(startOfBar(2));
  });

  it('go nowhere before the first bar', async () => {
    const view = await renderShortcuts([]);

    view.key('ArrowLeft');
    expect(view.engine.seek).not.toHaveBeenCalled();
    expect(view.player.getSnapshot().barNumber).toBe(1);
  });

  it('do nothing until the loops have been read: they may be loop keys', async () => {
    const view = await renderShortcuts([verse], { loopsPending: true });

    view.keyDown('ArrowRight');
    expect(view.engine.seek).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toMatchObject({ barNumber: 1, range: null });
  });
});

describe('the input guard', () => {
  it('leaves every key to a text field', async () => {
    const view = await renderShortcuts();
    const input = focusedInput();
    const before = view.player.getSnapshot();

    for (const k of [' ', 'ArrowUp', 'ArrowRight', 'PageDown', 'm', 'd', 's', 'c', '?']) {
      expect(view.key(k, {}, input)).toBe(true);
    }
    expect(view.engine.play).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toEqual(before);
    expect(view.activeLoop()).toBeNull();
    expect(view.helpOpen()).toBe(false);
  });

  it('leaves a select its keys', async () => {
    const view = await renderShortcuts();
    const select = focused('select');

    expect(view.key('c', {}, select)).toBe(true);
    expect(view.player.getSnapshot().countInBars).toBe(0);
  });

  it('leaves the speed slider its arrows, but Space still plays', async () => {
    const view = await renderShortcuts();
    const slider = focusedInput('range');

    expect(view.key('ArrowUp', {}, slider)).toBe(true);
    expect(view.player.getSnapshot().speedRatio).toBe(1);
    view.key(' ', {}, slider);
    expect(view.engine.play).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl, Cmd and Alt combinations to the browser', async () => {
    const view = await renderShortcuts();

    expect(view.key('ArrowRight', { altKey: true })).toBe(true);
    expect(view.key('d', { metaKey: true })).toBe(true);
    expect(view.key('s', { ctrlKey: true })).toBe(true);
    expect(view.activeLoop()).toBeNull();
    expect(view.player.getSnapshot()).toMatchObject({ drumsMuted: false, drumsOnly: false });
  });
});

describe('the overlay', () => {
  it('? opens and closes it, and Escape closes it', async () => {
    const view = await renderShortcuts();

    view.key('?', { shiftKey: true });
    expect(view.helpOpen()).toBe(true);
    view.key('?', { shiftKey: true });
    expect(view.helpOpen()).toBe(false);
    view.key('?', { shiftKey: true });
    expect(view.key('Escape')).toBe(false);
    expect(view.helpOpen()).toBe(false);
  });

  it('while open, takes no other shortcut', async () => {
    const view = await renderShortcuts();
    view.key('?', { shiftKey: true });

    for (const k of [' ', 'ArrowUp', 'ArrowRight', 'm', 'c']) expect(view.key(k)).toBe(true);
    expect(view.engine.play).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toMatchObject({ speedRatio: 1, countInBars: 0 });
    expect(view.activeLoop()).toBeNull();
  });

  it('opening it while playing leaves playback going; Space after closing it pauses', async () => {
    const view = await renderShortcuts();
    view.key(' ');
    view.playing();

    view.key('?', { shiftKey: true });
    view.key(' ');
    view.key('Escape');
    expect(view.engine.pause).not.toHaveBeenCalled();
    expect(view.player.getSnapshot().status).toBe('playing');

    view.key(' ');
    expect(view.engine.pause).toHaveBeenCalledTimes(1);
  });
});

describe('the listener', () => {
  it('before alphaTab has loaded (no player yet), the player keys do nothing and ? still opens the list', async () => {
    const view = await renderShortcuts();
    view.hook.rerender({ mounted: null });

    for (const k of [' ', 'ArrowUp', 'ArrowRight', 'm', 'd', 's', 'c']) view.key(k);
    expect(view.engine.play).not.toHaveBeenCalled();
    expect(view.player.getSnapshot()).toMatchObject({ speedRatio: 1, countInBars: 0, range: null });
    view.key('?', { shiftKey: true });
    expect(view.helpOpen()).toBe(true);
  });

  it('stops listening when the page unmounts', async () => {
    const view = await renderShortcuts();
    view.hook.unmount();

    expect(view.key(' ')).toBe(true);
    expect(view.engine.play).not.toHaveBeenCalled();
  });

  it('in StrictMode, still acts once per press', async () => {
    const view = await renderShortcuts([], { strict: true });
    const metronomeBefore = view.player.getSnapshot().metronomeOn;

    act(() => {
      fireEvent.keyDown(document.body, { key: 'm' });
      fireEvent.keyDown(document.body, { key: ' ' });
    });
    expect(view.engine.play).toHaveBeenCalledTimes(1);
    expect(view.player.getSnapshot().metronomeOn).toBe(!metronomeBefore);
  });
});

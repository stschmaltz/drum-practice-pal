import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PlayerService } from '@/features/player/PlayerService';
import { LOOP_NAME_MAX_LENGTH } from '@/lib/schema';
import { resetFakeSupabase } from '@/test/fakeSupabase';
import { loopPlayer, usePlayerSnapshot } from '@/test/loopPlayer';
import { LOOP_SONG_ID, loopRow, serveLoopTable } from '@/test/loopTable';
import { stubPointer } from '@/test/mediaQueries';
import { testQueryClient, wrapperFor } from '@/test/render';
import type { Loop } from './loopForm';
import { LoopEditorForm } from './LoopEditorForm';
import { loopKeys } from './loopKeys';
import { useLoops } from './useLoops';
import type { LoopEditor } from './useLoopPractice';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const onSaved = vi.fn<(saved: Loop) => void>();
const onCancel = vi.fn<() => void>();

/** The form with its bars held the way the song page's practice hook holds them. */
function Form({
  player,
  loopId,
  initialEditor,
}: {
  player: PlayerService;
  loopId: string | null;
  initialEditor?: Partial<LoopEditor>;
}) {
  const snapshot = usePlayerSnapshot(player);
  const loops = useLoops(LOOP_SONG_ID);
  const [editor, setEditor] = useState<LoopEditor>({
    loopId,
    bars: {},
    awaitingEnd: false,
    saving: false,
    ...initialEditor,
  });
  if (loops.isPending || snapshot.barCount === null) return <p>Loading…</p>;
  return (
    <LoopEditorForm
      songId={LOOP_SONG_ID}
      barCount={snapshot.barCount}
      loop={loops.data?.find((loop) => loop.id === loopId) ?? null}
      editor={editor}
      player={player}
      snapshot={snapshot}
      onBarsChange={(bars) =>
        setEditor((current) => ({
          ...current,
          bars: { ...current.bars, ...bars },
          awaitingEnd: false,
        }))
      }
      onSavingChange={(saving) =>
        setEditor((current) => (current.saving === saving ? current : { ...current, saving }))
      }
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}

interface FormOptions {
  loops?: Loop[];
  /** The loop to edit; a new loop without it. */
  editing?: Loop;
  initialEditor?: Partial<LoopEditor>;
  /** The speed playing when the form opens. */
  speedRatio?: number;
}

async function renderForm({ loops, editing, initialEditor, speedRatio }: FormOptions = {}) {
  const table = serveLoopTable(loops ?? (editing ? [editing] : []));
  const { engine, player } = loopPlayer();
  if (speedRatio !== undefined) player.setSpeed(speedRatio);
  const queryClient = testQueryClient();
  render(<Form player={player} loopId={editing?.id ?? null} initialEditor={initialEditor} />, {
    wrapper: wrapperFor(queryClient),
  });
  const form = within(await screen.findByRole('form'));
  return {
    user: userEvent.setup(),
    table,
    engine,
    player,
    queryClient,
    form,
    firstBar: () => form.getByLabelText('First bar'),
    lastBar: () => form.getByLabelText('Last bar'),
    name: () => form.getByLabelText('Name'),
    save: () => form.getByRole('button', { name: /^(Save loop|Saving…)$/ }),
    cancel: () => form.getByRole('button', { name: 'Cancel' }),
    hint: () => screen.getByTestId('loop-bars-hint'),
  };
}

type View = Awaited<ReturnType<typeof renderForm>>;

async function fill(view: View, fields: { first?: string; last?: string; name?: string }) {
  if (fields.first !== undefined) await view.user.type(view.firstBar(), fields.first);
  if (fields.last !== undefined) await view.user.type(view.lastBar(), fields.last);
  if (fields.name !== undefined) await view.user.type(view.name(), fields.name);
}

async function replace(view: View, field: HTMLElement, text: string) {
  await view.user.clear(field);
  if (text) await view.user.type(field, text);
}

const chorus = loopRow('chorus', {
  name: 'Chorus fill',
  start_bar: 5,
  end_bar: 8,
  speed_ratio: 0.708333,
});

beforeEach(() => {
  resetFakeSupabase();
  onSaved.mockReset();
  onCancel.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoopEditorForm for a new loop', () => {
  it('says how many bars the range covers, live, and nothing while it is no range', async () => {
    const view = await renderForm();
    const count = () => screen.getByTestId('loop-bar-count');
    expect(count()).toHaveTextContent('');
    await fill(view, { first: '5' });
    expect(count()).toHaveTextContent('');
    await fill(view, { last: '9' });
    expect(count()).toHaveTextContent('5 bars');
    await replace(view, view.lastBar(), '5');
    expect(count()).toHaveTextContent('1 bar');
    await replace(view, view.lastBar(), '3');
    expect(count()).toHaveTextContent('');
  });

  it('starts empty, labelled as a new loop, asking for the first bar', async () => {
    const view = await renderForm();
    expect(screen.getByRole('form', { name: 'New loop' })).toBeInTheDocument();
    expect(view.firstBar()).toHaveValue('');
    expect(view.lastBar()).toHaveValue('');
    expect(view.name()).toHaveValue('');
    expect(view.hint()).toHaveTextContent('Tap the first bar on the score, then the last.');
    expect(view.hint()).not.toHaveTextContent('drag');
  });

  it('offers a drag only where there is a mouse to drag with', async () => {
    stubPointer(true);
    const view = await renderForm();
    expect(view.hint()).toHaveTextContent('Or drag across the bars.');
  });

  it('asks for the last bar once the first has been tapped, then says how to start over', async () => {
    const view = await renderForm({
      initialEditor: { bars: { startBar: '5', endBar: '5' }, awaitingEnd: true },
    });
    expect(view.hint()).toHaveTextContent('Now tap the last bar, or save this one bar.');
    // Typing the other end finishes the selection.
    await replace(view, view.lastBar(), '8');
    expect(view.hint()).toHaveTextContent('Tap a bar to start again.');
  });

  it('says which speed it will save at: the speed playing now, with BPM at the loop’s first bar', async () => {
    const view = await renderForm({ speedRatio: 0.8 });
    const note = () => screen.getByTestId('loop-new-speed');
    // No bars yet, so no bar to take a tempo from.
    expect(note()).toHaveTextContent('Saves at the speed playing now: 80%.');

    await fill(view, { first: '7', last: '10' });
    // Bar 7 is at 120 in the file, though the range runs on into 90.
    expect(note()).toHaveTextContent('80% (96 BPM)');

    await replace(view, view.firstBar(), '9');
    expect(note()).toHaveTextContent('80% (72 BPM)');

    act(() => view.player.setSpeed(0.5));
    expect(note()).toHaveTextContent('50% (45 BPM)');
  });

  it('saves the name and bars with the speed playing now, under an id of its own', async () => {
    const view = await renderForm({ speedRatio: 0.708333 });
    await fill(view, { first: '9', last: '12', name: '  Second half  ' });
    await view.user.click(view.save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [sent] = view.table.sent('insert') as [Record<string, unknown>];
    expect(sent).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
      user_id: 'user-1',
      song_id: LOOP_SONG_ID,
      name: 'Second half',
      start_bar: 9,
      end_bar: 12,
      // The exact ratio playing, not 71%.
      speed_ratio: 0.708333,
    });
    // The saved row, as the server returned it.
    expect(onSaved.mock.calls[0]?.[0]).toEqual(view.table.rows()[0]);
    expect(view.table.rows()[0]).toMatchObject({ id: sent.id, name: 'Second half' });
  });

  it('saves a new loop on Enter in a field', async () => {
    const view = await renderForm();
    await fill(view, { first: '1', last: '4' });
    await view.user.type(view.name(), 'Intro{Enter}');
    await waitFor(() => expect(view.table.sent('insert')).toHaveLength(1));
  });

  it.each([
    ['one bar', '5', '5'],
    ['the first bar alone', '1', '1'],
    ['the last bar alone', '16', '16'],
    ['the whole song', '1', '16'],
  ])('accepts %s as a range', async (_what, first, last) => {
    const view = await renderForm();
    await fill(view, { first, last, name: 'Loop' });
    await view.user.click(view.save());
    await waitFor(() => expect(view.table.sent('insert')).toHaveLength(1));
    expect(view.table.sent('insert')[0]).toMatchObject({
      start_bar: Number(first),
      end_bar: Number(last),
    });
  });

  it.each([
    ['no bars', '', '', 'Choose the first and last bar.'],
    ['only a first bar', '5', '', 'Choose the first and last bar.'],
    ['a last bar before the first', '8', '5', "The last bar can't come before the first."],
    ['a bar past the end of the song', '9', '17', 'Bars go from 1 to 16 in this song.'],
    ['bar 0', '0', '4', 'Bars go from 1 to 16 in this song.'],
    ['half a bar', '2.5', '4', 'Choose the first and last bar.'],
  ])('refuses %s, saying why, and saves nothing', async (_what, first, last, message) => {
    const view = await renderForm();
    await fill(view, { first: first || undefined, last: last || undefined, name: 'Loop' });
    await view.user.click(view.save());

    expect(view.form.getByText(message)).toBeInTheDocument();
    expect(view.firstBar()).toBeInvalid();
    expect(view.lastBar()).toBeInvalid();
    // The one message is read out with both fields it is about.
    expect(view.firstBar()).toHaveAccessibleDescription(message);
    expect(view.lastBar()).toHaveAccessibleDescription(message);
    expect(view.name()).toBeValid();
    expect(view.name()).not.toHaveAccessibleDescription();
    expect(view.table.sent('insert')).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it.each([
    ['no name', '', 'Give the loop a name.'],
    ['a name of spaces', '    ', 'Give the loop a name.'],
    [
      'a name over the limit',
      'x'.repeat(LOOP_NAME_MAX_LENGTH + 1),
      `Keep the name to ${LOOP_NAME_MAX_LENGTH} characters or fewer.`,
    ],
  ])('refuses %s', async (_what, name, message) => {
    const view = await renderForm();
    await fill(view, { first: '1', last: '4' });
    // Pasted, not typed: the long name is over a hundred keystrokes otherwise.
    if (name) {
      await view.user.click(view.name());
      await view.user.paste(name);
    }
    await view.user.click(view.save());

    expect(view.form.getByText(message)).toBeInTheDocument();
    expect(view.name()).toBeInvalid();
    expect(view.name()).toHaveAccessibleDescription(message);
    expect(view.table.sent('insert')).toEqual([]);
  });

  it('takes its messages away as soon as the form is edited', async () => {
    const view = await renderForm();
    await view.user.click(view.save());
    expect(view.form.getByText('Give the loop a name.')).toBeInTheDocument();
    expect(view.form.getByText('Choose the first and last bar.')).toBeInTheDocument();

    await view.user.type(view.name(), 'L');
    expect(view.form.queryByText('Give the loop a name.')).not.toBeInTheDocument();
    expect(view.form.queryByText('Choose the first and last bar.')).not.toBeInTheDocument();
    expect(view.firstBar()).toBeValid();
  });

  it('locks while saving: one insert however often Save is pressed, and no edits or Cancel', async () => {
    const view = await renderForm();
    const release = view.table.holdNext('insert');
    await fill(view, { first: '1', last: '4', name: 'Intro' });
    await view.user.click(view.save());

    await waitFor(() => expect(view.save()).toHaveTextContent('Saving…'));
    expect(view.save()).toBeDisabled();
    expect(view.cancel()).toBeDisabled();
    await view.user.type(view.name(), ' again');
    await view.user.type(view.lastBar(), '2');
    await view.user.type(view.name(), '{Enter}');
    expect(view.name()).toHaveValue('Intro');
    expect(view.lastBar()).toHaveValue('4');
    expect(onSaved).not.toHaveBeenCalled();

    release();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(view.table.sent('insert')).toHaveLength(1);
    expect(view.table.rows()).toHaveLength(1);
  });

  it('a save the server refuses says so, keeps what was typed, and can be sent again', async () => {
    const view = await renderForm();
    view.table.failNext('insert', 'end_bar 12 is past the last bar');
    await fill(view, { first: '9', last: '12', name: 'Second half' });
    await view.user.click(view.save());

    expect(await view.form.findByRole('alert')).toHaveTextContent(
      "Couldn't save the loop. Something went wrong. Try again.",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.name()).toHaveValue('Second half');
    expect(view.save()).toBeEnabled();
    expect(view.save()).toHaveTextContent('Save loop');

    await view.user.click(view.save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(view.table.rows().map((row) => row.name)).toEqual(['Second half']);
  });

  it('pressed again after a lost answer, saves one loop, under the one id', async () => {
    const view = await renderForm();
    view.table.loseNext('insert');
    await fill(view, { first: '9', last: '12', name: 'Second half' });
    await view.user.click(view.save());

    expect(await view.form.findByRole('alert')).toHaveTextContent(
      "Couldn't save the loop. The server couldn't be reached.",
    );
    expect(view.table.rows()).toHaveLength(1);

    await view.user.click(view.save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ name: 'Second half' });
    const ids = view.table.sent('insert').map((row) => (row as { id: string }).id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
    expect(view.table.rows().map((row) => row.name)).toEqual(['Second half']);
  });

  // Unit 13 Test: what the server has wins over what was typed between the two presses
  // (Build's decision), and the second press is locked like the first.
  it('pressed again after a lost answer and an edit, keeps the loop the server has, locked meanwhile', async () => {
    const view = await renderForm();
    view.table.loseNext('insert');
    await fill(view, { first: '9', last: '12', name: 'Second half' });
    await view.user.click(view.save());
    expect(await view.form.findByRole('alert')).toBeInTheDocument();

    await view.user.type(view.name(), ' again');
    const release = view.table.holdNext('insert');
    await view.user.click(view.save());
    await waitFor(() => expect(view.save()).toHaveTextContent('Saving…'));
    expect(view.save()).toBeDisabled();
    await view.user.type(view.name(), '!');
    expect(view.name()).toHaveValue('Second half again');

    release();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ name: 'Second half', end_bar: 12 });
    expect(view.table.rows().map((row) => row.name)).toEqual(['Second half']);
    expect(
      view.queryClient
        .getQueryData<Loop[]>(loopKeys.forSong('user-1', LOOP_SONG_ID))
        ?.map((loop) => loop.name),
    ).toEqual(['Second half']);
    expect(view.form.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('an edit after a failed save takes the failure message away', async () => {
    const view = await renderForm();
    view.table.failNext('insert', 'offline');
    await fill(view, { first: '1', last: '4', name: 'Intro' });
    await view.user.click(view.save());
    expect(await view.form.findByRole('alert')).toBeInTheDocument();

    await view.user.type(view.name(), '!');
    expect(view.form.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Cancel saves nothing', async () => {
    const view = await renderForm();
    await fill(view, { first: '1', last: '4', name: 'Intro' });
    await view.user.click(view.cancel());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(view.table.sent('insert')).toEqual([]);
  });
});

describe('LoopEditorForm editing a loop', () => {
  it('opens on the saved name and bars, and has no speed or target to set', async () => {
    const view = await renderForm({ editing: chorus });
    expect(screen.getByRole('form', { name: 'Edit Chorus fill' })).toBeInTheDocument();
    expect(view.name()).toHaveValue('Chorus fill');
    expect(view.firstBar()).toHaveValue('5');
    expect(view.lastBar()).toHaveValue('8');
    expect(view.form.queryByLabelText(/Target/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('loop-new-speed')).not.toBeInTheDocument();
  });

  it('saved with nothing changed, sends nothing and closes', async () => {
    const view = await renderForm({ editing: chorus });
    await view.user.click(view.save());
    expect(onSaved).toHaveBeenCalledWith(chorus);
    expect(view.table.sent('update')).toEqual([]);
  });

  it.each([
    ['the name', 'name', 'Last chorus', { name: 'Last chorus' }],
    ['the first bar', 'first', '3', { start_bar: 3 }],
    ['the last bar', 'last', '12', { end_bar: 12 }],
  ] as const)('sends only %s when only that changed', async (_what, field, text, changes) => {
    const view = await renderForm({ editing: chorus });
    const input = {
      name: view.name(),
      first: view.firstBar(),
      last: view.lastBar(),
    }[field];
    await replace(view, input, text);
    await view.user.click(view.save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(view.table.sent('update')).toEqual([changes]);
    expect(view.table.rows()[0]).toMatchObject({ ...changes, speed_ratio: 0.708333 });
  });

  it('never writes the speed, even when another speed is playing', async () => {
    const view = await renderForm({ editing: chorus, speedRatio: 1.5 });
    await replace(view, view.name(), 'Renamed');
    await replace(view, view.firstBar(), '6');
    await view.user.click(view.save());

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(view.table.sent('update')).toEqual([{ name: 'Renamed', start_bar: 6 }]);
  });

  it('treats a name that differs only by outer spaces as unchanged', async () => {
    const view = await renderForm({ editing: chorus });
    await replace(view, view.name(), '  Chorus fill ');
    await view.user.click(view.save());
    expect(onSaved).toHaveBeenCalledWith(chorus);
    expect(view.table.sent('update')).toEqual([]);
  });

  it('shows a change made on another device in every field the user has not touched, and does not overwrite it', async () => {
    const view = await renderForm({ editing: chorus });
    await replace(view, view.firstBar(), '6');

    view.table.setRows([{ ...chorus, name: 'Renamed elsewhere', end_bar: 12 }]);
    await act(() =>
      view.queryClient.invalidateQueries({ queryKey: loopKeys.forSong('user-1', LOOP_SONG_ID) }),
    );
    await waitFor(() => expect(view.name()).toHaveValue('Renamed elsewhere'));
    expect(view.lastBar()).toHaveValue('12');
    expect(view.firstBar()).toHaveValue('6');

    await view.user.click(view.save());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(view.table.sent('update')).toEqual([{ start_bar: 6 }]);
    expect(view.table.rows()[0]).toMatchObject({ name: 'Renamed elsewhere', end_bar: 12 });
  });

  it('refuses an edit it cannot save, the same as a new loop', async () => {
    const view = await renderForm({ editing: chorus });
    await replace(view, view.name(), '   ');
    await replace(view, view.lastBar(), '4');
    await view.user.click(view.save());

    expect(view.form.getByText('Give the loop a name.')).toBeInTheDocument();
    expect(view.form.getByText("The last bar can't come before the first.")).toBeInTheDocument();
    expect(view.table.sent('update')).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a failed edit says so, puts the list back, and keeps the form open with what was typed', async () => {
    const view = await renderForm({ editing: chorus });
    view.table.failNext('update', 'permission denied');
    await replace(view, view.name(), 'Last chorus');
    await view.user.click(view.save());

    expect(await view.form.findByRole('alert')).toHaveTextContent(
      "Couldn't save the loop. Something went wrong. Try again.",
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(view.name()).toHaveValue('Last chorus');
    await waitFor(() =>
      expect(
        view.queryClient.getQueryData<Loop[]>(loopKeys.forSong('user-1', LOOP_SONG_ID))?.[0]?.name,
      ).toBe('Chorus fill'),
    );
    expect(screen.getByRole('form', { name: 'Edit Chorus fill' })).toBeInTheDocument();
  });
});

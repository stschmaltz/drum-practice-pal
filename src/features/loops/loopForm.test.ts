import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOOP_NAME_MAX_LENGTH } from '@/lib/schema';
import {
  applySavedLoopEdit,
  barsLabel,
  changedLoopDetails,
  changedLoopFields,
  EMPTY_LOOP_FORM,
  formBarRange,
  hasReachedTarget,
  shouldAskToFinish,
  LOOP_EDIT_FIELDS,
  LOOP_FIELDS,
  LOOP_SELECT,
  loopFormValues,
  parseBarNumber,
  parseLoopForm,
  revertLoopEdit,
  loopsByStatus,
  loopsInPanelOrder,
  sortLoops,
  type Loop,
  type LoopFormValues,
} from './loopForm';

const BAR_COUNT = 16;

const loop = (overrides: Partial<Loop> = {}): Loop => ({
  id: 'loop-1',
  song_id: 'song-1',
  name: 'Chorus fill',
  start_bar: 5,
  end_bar: 8,
  speed_ratio: 0.8,
  status: 'active',
  finished_at: null,
  last_practiced_at: null,
  created_at: '2026-11-20T10:00:00Z',
  ...overrides,
});

const form = (overrides: Partial<LoopFormValues> = {}): LoopFormValues => ({
  name: 'Chorus fill',
  startBar: '5',
  endBar: '8',
  ...overrides,
});

describe('columns', () => {
  it('LOOP_SELECT names exactly LOOP_FIELDS', () => {
    expect(LOOP_SELECT.split(', ')).toEqual([...LOOP_FIELDS]);
  });

  // The update grant is column-level: a field edited here but not granted fails at the DB.
  it('edits only columns the loops grants let a client write', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20261123000000_loops_grants.sql'),
      'utf8',
    );
    const granted = (verb: string) =>
      new RegExp(`grant ${verb} \\(([^)]+)\\)\\s+on public\\.loops to authenticated`)
        .exec(migration)?.[1]
        ?.split(',')
        .map((column) => column.trim())
        // Dropped from the table since (20261129000000_drop_target_ratio.sql).
        .filter((column) => column !== 'target_ratio') ?? [];

    // Exactly the grant, status included: finish and reopen are edits of it.
    expect([...LOOP_EDIT_FIELDS].sort()).toEqual([...granted('update')].sort());
    expect(LOOP_EDIT_FIELDS).toContain('status');
    expect(granted('insert')).toEqual(
      expect.arrayContaining(['id', 'user_id', 'song_id', ...LOOP_EDIT_FIELDS]),
    );
    expect(LOOP_FIELDS).toContain('finished_at');
    for (const serverOwned of ['finished_at', 'last_practiced_at', 'created_at', 'updated_at']) {
      expect(granted('insert')).not.toContain(serverOwned);
      expect(granted('update')).not.toContain(serverOwned);
    }
  });
});

describe('loopFormValues', () => {
  it('shows a saved loop as text', () => {
    expect(loopFormValues(loop())).toEqual({ name: 'Chorus fill', startBar: '5', endBar: '8' });
  });

  it('starts a new loop empty', () => {
    expect(EMPTY_LOOP_FORM).toEqual({ name: '', startBar: '', endBar: '' });
  });
});

describe('parseBarNumber', () => {
  it.each([
    ['5', 5],
    [' 12 ', 12],
    ['007', 7],
  ])('reads %j as %i', (text, bar) => {
    expect(parseBarNumber(text)).toBe(bar);
  });

  it.each(['', '  ', '5.5', '-3', 'five', '1e2', '5 6'])('refuses %j', (text) => {
    expect(parseBarNumber(text)).toBeNull();
  });
});

describe('formBarRange', () => {
  it.each([
    ['5', '8', { startBar: 5, endBar: 8 }],
    ['1', '16', { startBar: 1, endBar: 16 }],
    ['16', '16', { startBar: 16, endBar: 16 }],
  ])('bars %j to %j', (startBar, endBar, range) => {
    expect(formBarRange({ startBar, endBar }, BAR_COUNT)).toEqual(range);
  });

  it.each([
    ['', '8'],
    ['5', ''],
    ['8', '5'],
    ['0', '4'],
    ['1', '17'],
    ['17', '17'],
    ['x', '4'],
  ])('has no range for %j to %j', (startBar, endBar) => {
    expect(formBarRange({ startBar, endBar }, BAR_COUNT)).toBeNull();
  });
});

describe('parseLoopForm', () => {
  it('gives the row fields for a valid form', () => {
    expect(parseLoopForm(form(), BAR_COUNT)).toEqual({
      ok: true,
      details: { name: 'Chorus fill', start_bar: 5, end_bar: 8 },
    });
  });

  it('trims the name', () => {
    const parsed = parseLoopForm(form({ name: '  Verse 2  ' }), BAR_COUNT);
    expect(parsed).toMatchObject({ ok: true, details: { name: 'Verse 2' } });
  });

  it.each(['', '   ', '\t\n'])('refuses the blank name %j', (name) => {
    expect(parseLoopForm(form({ name }), BAR_COUNT)).toEqual({
      ok: false,
      errors: { name: 'Give the loop a name.' },
    });
  });

  it('accepts a name at the length limit and refuses one over it, counting characters not UTF-16 units', () => {
    const atLimit = '🥁'.repeat(LOOP_NAME_MAX_LENGTH);
    expect(parseLoopForm(form({ name: atLimit }), BAR_COUNT).ok).toBe(true);
    expect(parseLoopForm(form({ name: `${atLimit}x` }), BAR_COUNT)).toEqual({
      ok: false,
      errors: { name: `Keep the name to ${LOOP_NAME_MAX_LENGTH} characters or fewer.` },
    });
  });

  it.each([
    ['', '', 'Choose the first and last bar.'],
    ['5', '', 'Choose the first and last bar.'],
    ['five', '8', 'Choose the first and last bar.'],
    ['8', '5', "The last bar can't come before the first."],
    ['0', '4', 'Bars go from 1 to 16 in this song.'],
    ['5', '17', 'Bars go from 1 to 16 in this song.'],
  ])('refuses bars %j to %j', (startBar, endBar, message) => {
    expect(parseLoopForm(form({ startBar, endBar }), BAR_COUNT)).toEqual({
      ok: false,
      errors: { bars: message },
    });
  });

  it('accepts a one-bar loop, and the last bar of the song', () => {
    expect(parseLoopForm(form({ startBar: '16', endBar: '16' }), BAR_COUNT)).toMatchObject({
      ok: true,
      details: { start_bar: 16, end_bar: 16 },
    });
  });

  it('reports every problem at once', () => {
    const parsed = parseLoopForm({ name: ' ', startBar: '9', endBar: '2' }, BAR_COUNT);
    expect(parsed.ok).toBe(false);
    expect(Object.keys(parsed.ok ? {} : parsed.errors).sort()).toEqual(['bars', 'name']);
  });
});

describe('changedLoopFields', () => {
  it('gives only the fields that differ', () => {
    const saved = loop();
    expect(
      changedLoopFields(saved, {
        name: 'Chorus fill',
        start_bar: 5,
        end_bar: 9,
      }),
    ).toEqual({ end_bar: 9 });
  });

  it('gives nothing when nothing changed', () => {
    const saved = loop();
    expect(changedLoopFields(saved, { ...saved })).toEqual({});
    expect(changedLoopFields(saved, {})).toEqual({});
  });

  it('never sends a field the edit left out', () => {
    expect(changedLoopFields(loop({ speed_ratio: 0.8 }), { speed_ratio: 0.708333 })).toEqual({
      speed_ratio: 0.708333,
    });
  });
});

describe('changedLoopDetails', () => {
  const details = (overrides: Partial<Loop> = {}) => {
    const { name, start_bar, end_bar } = loop(overrides);
    return { name, start_bar, end_bar };
  };

  it('gives the details that differ, and never the speed', () => {
    const saved = loop({ speed_ratio: 0.8 });
    expect(changedLoopDetails(saved, details({ name: 'Outro', end_bar: 9 }))).toEqual({
      name: 'Outro',
      end_bar: 9,
    });
    expect(changedLoopDetails(saved, details())).toEqual({});
  });
});

describe('applySavedLoopEdit', () => {
  it('takes the server row for the fields the edit sent, and leaves every other field as cached', () => {
    // Cached: this edit's speed and another pending edit's bars, both optimistic.
    const current = loop({ start_bar: 9, end_bar: 12, speed_ratio: 0.9, name: 'Verse' });
    // The server's row from before the other edit, with its own rounding of the speed.
    const saved = loop({ start_bar: 5, end_bar: 8, speed_ratio: 0.900001, name: 'Renamed' });
    expect(applySavedLoopEdit(current, saved, { speed_ratio: 0.9 })).toEqual({
      ...current,
      speed_ratio: 0.900001,
    });
  });

  it('leaves a sent field that a newer edit has changed since', () => {
    // 90% then 80%, both pending: the answer to 90% must not put 90% back over 80%.
    const current = loop({ speed_ratio: 0.8 });
    expect(applySavedLoopEdit(current, loop({ speed_ratio: 0.9 }), { speed_ratio: 0.9 })).toEqual(
      current,
    );
  });

  it('with nothing sent, changes nothing, and never changes the loop it was given', () => {
    const current = loop({ name: 'Verse' });
    const copy = { ...current };
    expect(applySavedLoopEdit(current, loop({ name: 'Other' }), {})).toEqual(copy);
    applySavedLoopEdit(current, loop({ name: 'Other' }), { name: 'Other' });
    expect(current).toEqual(copy);
  });
});

describe('revertLoopEdit', () => {
  const before = loop({ name: 'Old', speed_ratio: 0.8 });

  it('puts the sent fields back', () => {
    const optimistic = { ...before, name: 'New', speed_ratio: 0.9 };
    expect(revertLoopEdit(optimistic, before, { name: 'New', speed_ratio: 0.9 })).toEqual(before);
  });

  it('leaves a field that has changed again since', () => {
    const current = { ...before, name: 'Newer' };
    expect(revertLoopEdit(current, before, { name: 'New' }).name).toBe('Newer');
  });

  it('leaves fields that were not sent', () => {
    const current = { ...before, name: 'New', end_bar: 12 };
    expect(revertLoopEdit(current, before, { name: 'New' })).toMatchObject({
      name: 'Old',
      end_bar: 12,
    });
  });
});

describe('sortLoops', () => {
  it('orders by first bar, then last bar, then age', () => {
    const loops = [
      loop({ id: 'd', start_bar: 9, end_bar: 12 }),
      loop({ id: 'c', start_bar: 5, end_bar: 8, created_at: '2026-11-21T00:00:00Z' }),
      loop({ id: 'a', start_bar: 1, end_bar: 16 }),
      loop({ id: 'b', start_bar: 5, end_bar: 8, created_at: '2026-11-20T00:00:00Z' }),
      loop({ id: 'e', start_bar: 5, end_bar: 6 }),
    ];
    expect(sortLoops(loops).map((l) => l.id)).toEqual(['a', 'e', 'b', 'c', 'd']);
  });

  it('does not change the list it was given', () => {
    const loops = [loop({ id: 'b', start_bar: 9 }), loop({ id: 'a', start_bar: 1 })];
    sortLoops(loops);
    expect(loops.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('loopsByStatus and loopsInPanelOrder', () => {
  const loops = [
    loop({ id: 'late-finished', start_bar: 9, status: 'finished' }),
    loop({ id: 'late', start_bar: 9 }),
    loop({ id: 'early-finished', start_bar: 1, status: 'finished' }),
    loop({ id: 'early', start_bar: 1 }),
  ];

  it('splits the loops into the two sections, each in song order', () => {
    const { active, finished } = loopsByStatus(loops);
    expect(active.map((l) => l.id)).toEqual(['early', 'late']);
    expect(finished.map((l) => l.id)).toEqual(['early-finished', 'late-finished']);
  });

  it('lists the loops on the go first, then the finished ones, as the panel does', () => {
    expect(loopsInPanelOrder(loops).map((l) => l.id)).toEqual([
      'early',
      'late',
      'early-finished',
      'late-finished',
    ]);
  });
});

describe('barsLabel', () => {
  it('names one bar or a range', () => {
    expect(barsLabel(5, 5)).toBe('Bar 5');
    expect(barsLabel(5, 8)).toBe('Bars 5 to 8');
  });
});

describe('hasReachedTarget', () => {
  // Every loop's target is full speed. What the loop's line shows is what counts:
  // 119 BPM typed at a tempo of 120 is 0.991667, which shows as "99%".
  it.each([
    ['under full speed', 0.95, false],
    ['at full speed', 1, true],
    ['past it', 1.05, true],
    ['showing 100% from under it', 0.995, true],
    ['showing 99%', 0.991667, false],
  ])('%s: %f is %s', (_what, speed_ratio, reached) => {
    expect(hasReachedTarget(loop({ speed_ratio }))).toBe(reached);
  });

  it('never asks about a loop that is already finished', () => {
    expect(
      hasReachedTarget(
        loop({ speed_ratio: 1, status: 'finished', finished_at: '2026-11-22T10:00:00Z' }),
      ),
    ).toBe(false);
  });
});

describe('shouldAskToFinish', () => {
  const practised = '2026-11-20T10:00:00Z';
  it.each([
    ['saved at 100%, never practised', 1, null, false, false],
    ['worked up to 100% since it was chosen', 1, null, true, true],
    ['at 100%, practised before', 1, practised, false, true],
    ['under full speed', 0.9, practised, true, false],
  ] as const)('%s', (_what, speed_ratio, last_practiced_at, moved, asks) => {
    expect(shouldAskToFinish(loop({ speed_ratio, last_practiced_at }), moved)).toBe(asks);
  });
});

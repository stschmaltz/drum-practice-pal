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
  target_ratio: 1,
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
  targetPercent: '',
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
        .map((column) => column.trim()) ?? [];

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
  it('shows a saved loop as text, the target as whole percent', () => {
    expect(loopFormValues(loop({ target_ratio: 0.9 }))).toEqual({
      name: 'Chorus fill',
      startBar: '5',
      endBar: '8',
      targetPercent: '90',
    });
  });

  it('leaves the target empty when there is none', () => {
    expect(loopFormValues(loop({ target_ratio: null })).targetPercent).toBe('');
  });

  it('starts a new loop empty', () => {
    expect(EMPTY_LOOP_FORM).toEqual({ name: '', startBar: '', endBar: '', targetPercent: '' });
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
    expect(parseLoopForm(form({ targetPercent: '100' }), BAR_COUNT)).toEqual({
      ok: true,
      details: { name: 'Chorus fill', start_bar: 5, end_bar: 8, target_ratio: 1 },
    });
  });

  it('trims the name', () => {
    const parsed = parseLoopForm(form({ name: '  Verse 2  ' }), BAR_COUNT);
    expect(parsed).toMatchObject({ ok: true, details: { name: 'Verse 2' } });
  });

  it('saves no target for an empty target', () => {
    for (const targetPercent of ['', '   ']) {
      const parsed = parseLoopForm(form({ targetPercent }), BAR_COUNT);
      expect(parsed).toMatchObject({ ok: true, details: { target_ratio: null } });
    }
  });

  it.each([
    ['25', 0.25],
    ['200', 2],
    ['90%', 0.9],
    [' 105 ', 1.05],
  ])('reads a target of %j as %f', (targetPercent, ratio) => {
    const parsed = parseLoopForm(form({ targetPercent }), BAR_COUNT);
    expect(parsed).toMatchObject({ ok: true, details: { target_ratio: ratio } });
  });

  it.each(['24', '201', '0', '-50', 'fast', '90.5', '1e2'])(
    'refuses a target of %j',
    (targetPercent) => {
      const parsed = parseLoopForm(form({ targetPercent }), BAR_COUNT);
      expect(parsed).toEqual({
        ok: false,
        errors: { targetPercent: 'Enter a target from 25 to 200%, or leave it empty.' },
      });
    },
  );

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
    const parsed = parseLoopForm(
      { name: ' ', startBar: '9', endBar: '2', targetPercent: '500' },
      BAR_COUNT,
    );
    expect(parsed.ok).toBe(false);
    expect(Object.keys(parsed.ok ? {} : parsed.errors).sort()).toEqual([
      'bars',
      'name',
      'targetPercent',
    ]);
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
        target_ratio: null,
      }),
    ).toEqual({ end_bar: 9, target_ratio: null });
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
    const { name, start_bar, end_bar, target_ratio } = loop(overrides);
    return { name, start_bar, end_bar, target_ratio };
  };

  it('gives the details that differ, and never the speed', () => {
    const saved = loop({ speed_ratio: 0.8, target_ratio: 1 });
    expect(changedLoopDetails(saved, details({ name: 'Outro', end_bar: 9 }))).toEqual({
      name: 'Outro',
      end_bar: 9,
    });
    expect(changedLoopDetails(saved, details())).toEqual({});
  });

  it.each([
    [0.855556, 0.86],
    [0.864999, 0.86],
    [0.708333, 0.71],
    [1.996, 2],
  ])('a saved target of %f under a typed %f is the same percent: not a change', (saved, typed) => {
    expect(
      changedLoopDetails(loop({ target_ratio: saved }), details({ target_ratio: typed })),
    ).toEqual({});
  });

  it.each([
    ['another percent', 0.855556, 0.87, 0.87],
    ['the percent below', 0.855556, 0.85, 0.85],
    ['cleared', 0.855556, null, null],
    ['set where there was none', null, 0.86, 0.86],
    ['a whole percent changed', 0.86, 0.9, 0.9],
  ])('a target that is %s is sent', (_what, saved, typed, sent) => {
    expect(
      changedLoopDetails(loop({ target_ratio: saved }), details({ target_ratio: typed })),
    ).toEqual({ target_ratio: sent });
  });

  it('no target on either side is no change', () => {
    expect(
      changedLoopDetails(loop({ target_ratio: null }), details({ target_ratio: null })),
    ).toEqual({});
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

  it('takes a null the server saved', () => {
    const current = loop({ target_ratio: null, name: 'Verse' });
    expect(
      applySavedLoopEdit(current, loop({ target_ratio: null, name: 'Other' }), {
        target_ratio: null,
      }),
    ).toEqual(current);
  });

  it('leaves a sent field that a newer edit has changed since', () => {
    // 90% then 80%, both pending: the answer to 90% must not put 90% back over 80%.
    const current = loop({ speed_ratio: 0.8 });
    expect(applySavedLoopEdit(current, loop({ speed_ratio: 0.9 }), { speed_ratio: 0.9 })).toEqual(
      current,
    );
    // A cleared target, then a new one.
    const retargeted = loop({ target_ratio: 0.9 });
    expect(
      applySavedLoopEdit(retargeted, loop({ target_ratio: null }), { target_ratio: null }),
    ).toEqual(retargeted);
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

  it('puts back a target that was cleared', () => {
    const current = { ...before, target_ratio: null };
    expect(revertLoopEdit(current, before, { target_ratio: null }).target_ratio).toBe(1);
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
  it.each([
    ['under the target', { speed_ratio: 0.95, target_ratio: 1 }, false],
    ['at the target', { speed_ratio: 1, target_ratio: 1 }, true],
    ['past the target', { speed_ratio: 1.05, target_ratio: 1 }, true],
    [
      'at a target that is not a whole percent',
      { speed_ratio: 0.855556, target_ratio: 0.855556 },
      true,
    ],
    // What the loop's line shows is what counts: "71% (85 BPM) · target 71% (85 BPM)"
    // with no question would look broken. 85 BPM typed at a tempo of 120 is 0.708333.
    [
      'showing the target’s percent from under it',
      { speed_ratio: 0.708333, target_ratio: 0.71 },
      true,
    ],
    ['a hair under a finer target', { speed_ratio: 0.855555, target_ratio: 0.855556 }, true],
    ['showing one percent less', { speed_ratio: 0.704999, target_ratio: 0.71 }, false],
    ['rounding up to the target', { speed_ratio: 0.845, target_ratio: 0.85 }, true],
    ['rounding down from it', { speed_ratio: 0.844, target_ratio: 0.85 }, false],
    ['with no target', { speed_ratio: 2, target_ratio: null }, false],
  ])('%s: %j is %s', (_what, speeds, reached) => {
    expect(hasReachedTarget(loop(speeds))).toBe(reached);
  });

  it('never asks about a loop that is already finished', () => {
    expect(
      hasReachedTarget(
        loop({
          speed_ratio: 1,
          target_ratio: 1,
          status: 'finished',
          finished_at: '2026-11-22T10:00:00Z',
        }),
      ),
    ).toBe(false);
  });
});

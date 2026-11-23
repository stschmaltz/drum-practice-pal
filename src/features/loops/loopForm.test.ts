import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOOP_NAME_MAX_LENGTH } from '@/lib/schema';
import {
  barsLabel,
  changedLoopFields,
  EMPTY_LOOP_FORM,
  formBarRange,
  LOOP_EDIT_FIELDS,
  LOOP_FIELDS,
  LOOP_SELECT,
  loopFormValues,
  parseBarNumber,
  parseLoopForm,
  revertLoopEdit,
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

    expect(granted('update')).toEqual(expect.arrayContaining([...LOOP_EDIT_FIELDS]));
    expect(granted('insert')).toEqual(
      expect.arrayContaining(['id', 'user_id', 'song_id', ...LOOP_EDIT_FIELDS]),
    );
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

describe('barsLabel', () => {
  it('names one bar or a range', () => {
    expect(barsLabel(5, 5)).toBe('Bar 5');
    expect(barsLabel(5, 8)).toBe('Bars 5 to 8');
  });
});

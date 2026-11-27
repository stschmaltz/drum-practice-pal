import { expect, it } from 'vitest';
import { loopRow } from '@/test/loopTable';
import { lookUpPracticeLoop, type LoopsQueryState } from './practiceLoop';

const LOOP = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const loop = loopRow(LOOP);

const state = (overrides: Partial<LoopsQueryState>): LoopsQueryState => ({
  data: undefined,
  fetchStatus: 'idle',
  isLoadingError: false,
  ...overrides,
});

it('finds the loop in the list, read or cached', () => {
  expect(lookUpPracticeLoop(state({ data: [loop] }), LOOP)).toEqual({ kind: 'found', loop });
  expect(lookUpPracticeLoop(state({ data: [loop], fetchStatus: 'fetching' }), LOOP)).toEqual({
    kind: 'found',
    loop,
  });
});

it('waits for a first read, and for a read of a cached list that lacks the loop', () => {
  expect(lookUpPracticeLoop(state({ fetchStatus: 'fetching' }), LOOP)).toEqual({ kind: 'waiting' });
  expect(lookUpPracticeLoop(state({ fetchStatus: 'paused' }), LOOP)).toEqual({ kind: 'waiting' });
  expect(
    lookUpPracticeLoop(state({ data: [loopRow(OTHER)], fetchStatus: 'fetching' }), LOOP),
  ).toEqual({ kind: 'waiting' });
});

it('calls it missing once no read is on its way: read, offline, or failed over the cache', () => {
  for (const fetchStatus of ['idle', 'paused'] as const) {
    expect(lookUpPracticeLoop(state({ data: [loopRow(OTHER)], fetchStatus }), LOOP)).toEqual({
      kind: 'missing',
    });
  }
  expect(lookUpPracticeLoop(state({ data: [] }), LOOP)).toEqual({ kind: 'missing' });
});

it('is missing for an id that is not one, without asking the list', () => {
  expect(lookUpPracticeLoop(state({ data: [loop] }), 'not-an-id')).toEqual({ kind: 'missing' });
});

it('is an error when the first read failed', () => {
  expect(lookUpPracticeLoop(state({ isLoadingError: true }), LOOP)).toEqual({ kind: 'error' });
});

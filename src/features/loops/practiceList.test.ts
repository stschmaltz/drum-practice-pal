import { loopRow } from '@/test/loopTable';
import { LOOP_SELECT } from './loopForm';
import { PRACTICE_LOOP_SELECT, practiceLoopsFor } from './practiceList';

describe('PRACTICE_LOOP_SELECT', () => {
  it("is the loop's own columns plus its song's name", () => {
    expect(PRACTICE_LOOP_SELECT).toBe(`${LOOP_SELECT}, song:songs!loops_song_fkey(title, artist)`);
  });
});

describe('practiceLoopsFor', () => {
  const ids = (loops: { id: string }[]) => loops.map((loop) => loop.id);

  it('keeps only the loops of the tab', () => {
    const loops = [
      loopRow('a'),
      loopRow('b', { status: 'finished', finished_at: '2026-11-20T10:00:00Z' }),
    ];

    expect(ids(practiceLoopsFor(loops, 'active'))).toEqual(['a']);
    expect(ids(practiceLoopsFor(loops, 'finished'))).toEqual(['b']);
  });

  it('lists what is on the go by last practiced, then the never practiced, newest first', () => {
    const loops = [
      loopRow('old-unpracticed', { created_at: '2026-11-01T10:00:00Z' }),
      loopRow('last-week', { last_practiced_at: '2026-11-16T10:00:00Z' }),
      loopRow('new-unpracticed', { created_at: '2026-11-22T10:00:00Z' }),
      loopRow('today', { last_practiced_at: '2026-11-23T08:00:00Z' }),
      loopRow('yesterday', { last_practiced_at: '2026-11-22T20:00:00Z' }),
    ];

    expect(ids(practiceLoopsFor(loops, 'active'))).toEqual([
      'today',
      'yesterday',
      'last-week',
      'new-unpracticed',
      'old-unpracticed',
    ]);
  });

  it('lists the finished by when they were finished, last first', () => {
    const finished = (id: string, finishedAt: string | null, lastPracticed: string | null = null) =>
      loopRow(id, {
        status: 'finished',
        finished_at: finishedAt,
        last_practiced_at: lastPracticed,
      });
    const loops = [
      finished('first', '2026-11-10T10:00:00Z', '2026-11-23T10:00:00Z'),
      finished('last', '2026-11-22T10:00:00Z'),
      finished('middle', '2026-11-15T10:00:00Z'),
    ];

    expect(ids(practiceLoopsFor(loops, 'finished'))).toEqual(['last', 'middle', 'first']);
  });

  it('leads the finished tab with a loop finished a moment ago, before the server gives its time', () => {
    const loops = [
      loopRow('earlier', { status: 'finished', finished_at: '2026-11-22T10:00:00Z' }),
      // The optimistic row: status flipped, finished_at still to come.
      loopRow('just-now', { status: 'finished', finished_at: null }),
    ];

    expect(ids(practiceLoopsFor(loops, 'finished'))).toEqual(['just-now', 'earlier']);
  });

  it('breaks ties by id and leaves its input as it was', () => {
    const loops = [loopRow('b'), loopRow('a')];

    expect(ids(practiceLoopsFor(loops, 'active'))).toEqual(['a', 'b']);
    expect(ids(loops)).toEqual(['b', 'a']);
  });
});

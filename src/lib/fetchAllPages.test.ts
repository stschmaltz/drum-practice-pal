import { fetchAllPages, PAGE_SIZE } from './fetchAllPages';

/** A fake table of `total` rows served `.range()`-style. */
function pagedTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls: [number, number][] = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return rows.slice(from, to + 1);
  };
  return { rows, calls, fetchPage };
}

describe('fetchAllPages', () => {
  it('reads every page until a short one', async () => {
    const table = pagedTable(25);
    expect(await fetchAllPages(table.fetchPage, 10)).toEqual(table.rows);
    expect(table.calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  it('asks once more after an exactly full last page', async () => {
    const table = pagedTable(20);
    expect(await fetchAllPages(table.fetchPage, 10)).toEqual(table.rows);
    expect(table.calls).toHaveLength(3);
  });

  it('handles an empty table', async () => {
    const table = pagedTable(0);
    expect(await fetchAllPages(table.fetchPage, 10)).toEqual([]);
    expect(table.calls).toEqual([[0, 9]]);
  });

  it('stops at the first failed page', async () => {
    let calls = 0;
    const failing = async () => {
      calls++;
      if (calls === 2) throw new Error('page 2 failed');
      return Array.from({ length: 10 }, () => 1);
    };
    await expect(fetchAllPages(failing, 10)).rejects.toThrow('page 2 failed');
    expect(calls).toBe(2);
  });

  it('defaults to pages no bigger than PostgREST max_rows', async () => {
    const { readFileSync } = await import('node:fs');
    const config = readFileSync('supabase/config.toml', 'utf8');
    const maxRows = Number(/^max_rows = (\d+)/m.exec(config)?.[1]);
    expect(PAGE_SIZE).toBeLessThanOrEqual(maxRows);
  });
});

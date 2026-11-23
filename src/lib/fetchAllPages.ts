/**
 * PostgREST caps an unranged select at max_rows (1000 in supabase/config.toml),
 * silently. Lists that must hold every row read page by page with this.
 */

/** Keep at or below max_rows, or a full page looks short and the loop stops early. */
export const PAGE_SIZE = 500;

/**
 * Calls `fetchPage(from, to)` (inclusive, as `.range()` takes them) until a
 * page comes back short. Each call should throw on error.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

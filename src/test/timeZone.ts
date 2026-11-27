/**
 * Runs a describe block's tests in a named time zone. Node reads `TZ` again
 * whenever it is assigned, so `new Date(y, m, d)` and `getDate()` follow it.
 * The machine's own zone may never change its clocks (CI runs in UTC), so a
 * test about a summer-time change sets a zone that has one rather than trust
 * the host. Restored to the zone the process started in, by name: deleting
 * `TZ` again doesn't bring the old zone back.
 */
export function inTimeZone(zone: string): void {
  let previous = '';
  beforeAll(() => {
    previous = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = zone;
    // Proves the switch took: a zone that silently didn't apply would make the test vacuous.
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });
  afterAll(() => {
    process.env.TZ = previous;
  });
}

/** Hours in the local day of `date`: 23 or 25 on a day the clocks change. */
export function hoursInLocalDay(date: Date): number {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return (next.getTime() - start.getTime()) / 3_600_000;
}

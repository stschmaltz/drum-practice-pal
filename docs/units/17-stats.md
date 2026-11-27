# Unit 17: Stats that say something

## Build

### Summary

The Stats page now answers three questions and carries the numbers and dates for everything it draws: am I showing up (totals against the period before, the current and longest streak, the last two weeks, the practice days), is each loop getting faster (Loop progress), and what have I been neglecting (Where the time went). Everything is still worked out on the device from sessions and loops; there is no migration and nothing new is stored.

What is on the page, top to bottom:

- **Totals** for the last 7 days, the last 30 or all time. Week and Month say how each total compares with the same number of days before ("8 min more than the week before"); all time has no comparison. A total that is nothing in both periods has no line.
- **Streak line:** the streak running now and the longest ("On a 4-day streak. Your longest yet.", "No streak running. Your longest is 3 days.").
- **Where the time went:** play time per song in the chosen period, as bars with their minutes, most first; five songs, then "Other (n songs)". Each title goes to the song.
- **Last two weeks:** each bar has its minutes over it and its weekday and day of the month under it; the caption gives the total and how many of the 14 days were practised.
- **Loop progress**, in place of the "Speed over time" picker: every practised loop (active first, last practised first; six, then "Show all n loops"), each with "60% → 85%, up 25", play time, practice days and a sparkline. The name goes to the loop's practice screen. "Chart" opens that loop's chart under its row, one at a time: one point per practice day, percents on the points, dates along the bottom, 100% and the axis's lowest percent named at the left.
- **Practice days:** the heatmap with month names and weekday letters, days practised of the days shown, and the best week.
- **Records:** longest streak with its dates, most practice in one day with its date, longest single session with its loop and date.
- **Badges:** the earned ones in a line, "Next up" (the three unearned ones closest to done, with progress), and the rest behind "Show all badges".

Checked from the WIP commit and fixed: `dailySpeeds` had no tests and rounded with its own `Math.round` (now `ratioToPercent`, and it returns the percent it chose rather than a ratio made from it); the speed chart's percents ran into each other when two practice days were close (two 85% labels on top of each other on a phone) and its "100%" label sat where a last point at 100% puts its own; its caption repeated its summary. Labels now go through `labelledIndexes`, the axis is named in a left margin, and the explanation is said once under the section's heading.

### Removed

- `speedHistory` and `SpeedPoint` (nothing used them once the chart went per day), with their test.
- The "Speed over time" section, its loop `<select>` and its "Practise a loop to see its speed over time" line.
- The 11-row badge list (`BadgeList`), replaced by `BadgeSection`.
- The speed chart's caption, and the "in minutes a day" half of the daily chart's.

### Product walk-through

Walked before building, as `docs/product.md` asks. The page is read between sessions, not at the kit; nothing on it has to be done.

- **Day one, one song, nothing practised:** the one empty state with a link to Songs, as before. Nothing new shows.
- **Day one, after one session:** totals with "more than the week before" against nothing; "On a 1-day streak. Your longest yet."; one song bar; one loop row reading "80%" (no arrow: one day has nothing to compare); records all from that session; no badge earned, "None earned yet" and three next up. Nothing reads as a failure.
- **Missing a piece:** a song with no loops never appears (no sessions) and nothing assumes it does. A loop marked finished without ever being practised gives totals (Loops mastered 1) and each other section says what it is waiting for ("No practice in this period.", "Practise a loop to see how its speed moves.", "Records start with your first session."). A session whose loop is not in the loops list (deleted elsewhere, cache behind) counts under "Other" so the bars still add up, and "Longest session" drops the loop's name.
- **Twenty songs down, a year of history:** five songs then Other; six loops then "Show all"; the heatmap is fixed at 26 weeks; a chart with many days labels only the points that have room (the table has them all).
- **Offline:** unchanged. The page reads the two cached lists; with nothing cached it says so.
- **Order and chores:** none. Nothing is gated, nothing asks the user to record anything, every link (song, loop) is a second way in, never the only one. Taps to sound from here: a loop's name, then Play: two.

Nothing in the unit as written failed a walk, so it was built as written. Two judgement calls are under Decisions (what "now" means in a row; rolling periods).

### Files

New, pure, each with a test file beside it: `src/features/stats/loopProgress.ts`, `songTime.ts`, `records.ts`, `dateLabels.ts`.

New components: `src/features/stats/LoopProgressList.tsx`, `BadgeSection.tsx`.

Changed: `StatsPage.tsx` (layout, totals with changes, streak line, song time, records), `charts.tsx` (daily chart, heatmap with months and numbers, speed chart, `Sparkline`), `totals.ts` (`previousRange`, `previousTotals`, `totalChange`, `dailySummary`, `heatmapSummary`, `heatmapMonths`; `dailySpeeds` moved to `loopProgress.ts`), `streak.ts` (`longestStreakRun`), `badges.ts` (`nextUpBadges`), `chartScale.ts` (`labelledIndexes`, `sparklinePoints`), and their tests; `StatsPage.test.tsx` rewritten for the new page.

e2e: `tests/e2e/stats.spec.ts` rewritten; `tests/e2e/design.spec.ts` gains the state "stats, chart and all badges".

Outside the feature: `scripts/seed.ts` (the demo user now has three weeks of sessions, see Decisions), `src/features/song/SongOverviewPage.tsx` (one class, see Known gaps), `AGENTS.md` (stats bullets).

Screenshots, seed user: `docs/units/17-shots/stats-{desktop,tablet,phone}.png`, `stats-open-*` (a chart open and every badge shown), `stats-month-*`.

### Decisions

- **Periods stay rolling.** Week is today and the six days before, Month the last 30, as Unit 16 set; "the period before" is the same number of days just before. So the lines say "than the week before", not "than last week", and the totals' heading says "Last 7 days". Calendar weeks would make Monday morning read as a collapse.
- **"Now" in a progress row is the latest practice day's working speed,** not the loop's saved `speed_ratio`. The saved speed moves with every nudge (a try at 100% saves 100%), which is exactly what the per-day rule is there to keep out; and the row then agrees with the last point of its own chart.
- **A tie between two speeds on a day goes to the slower,** and speeds are grouped as the whole percent shown (79.6% and 80.4% are one speed).
- **Records keep the earlier of two equals** (day, session, week, streak): a record is beaten, not matched.
- **Comparisons are made on what is shown.** Play time is compared in whole minutes (checklist 4), and a difference of an hour or more is written like any other time ("1 h 59 min more").
- **Up is green, down and same are muted,** always with the words. Down is not red: a quiet week is not an error.
- **Charts keep the quiet palette** (`selected-line` for data, `success` for full speed and today); only the heatmap uses the brand, as before. No new colour pair was needed, so `designTokens.test.ts` is unchanged.
- **Disclosures are one button whose words change,** so focus never has to be handed over. A row's chart is one at a time, which keeps the page short on a phone.
- **Dates are written in the browser's locale,** with the year only when it isn't this one (`dateLabels.ts`).
- **The seed user got more sessions** (same songs and loops): three weeks on "Main groove" from 60% to 85%, including a day of ten minutes at 80% with a one-minute try at 100%, so the page and its screenshots have something to say and the seed-user spec has every section to check. `tests/db/seed.test.ts` doesn't count sessions.
- **The e2e spec works the numbers out itself** from the rows, with none of the app's modules, so it can disagree with them.

### Async windows and inputs

None added. The page has no mutation, timer or effect: it renders from two queries Unit 16 already had (`useAllSessions`, `usePracticeLoops`), and its only state is which chart is open, whether each list is expanded, and the period in the URL.

- Either query refetching while a chart is open: the row is keyed by loop id, so the chart stays open and redraws. If the loop has gone (deleted elsewhere), its row and chart go; the stored id then matches nothing.
- The period changed while a chart is open or a list expanded: neither depends on the period; they stay.
- A session logged in another tab or on the practice screen: `sessionLogged` already adds it to `sessionKeys.every`; the page shows it on the next render.

### Review checklist, self-review

- **1 Interleavings:** no async window (above). Nothing is done once on cached data, nothing is latched.
- **2 Gates:** no action that can refuse. "Show all" is only drawn when there are more than six rows; "Show all badges" only when there are badges past the three.
- **3 Gestures:** buttons and links only.
- **4 Round trips:** nothing is written back. Comparisons and the per-day speed use the displayed whole minutes and whole percents.
- **5 Validated paths:** focus stays on each disclosure button because the button itself stays (tests assert `toHaveFocus` after the press). 44 px targets measured by `design.spec.ts` with a chart open and every badge shown.
- **6 What is drawn:** loop names take `wrap-anywhere`, song titles truncate with the whole title in `title`; `stats.spec.ts` checks a 100-character loop name and a 300-character title with no spaces for sideways scroll and for text outside `main` (`textSpillingOutOf`), at 390 px too.
- **7 Hygiene:** every `{ data, error }` in the spec's setup is checked; the seed user is read only; the throwaway user is the `user` fixture's.

### Known gaps

- **A fault outside this unit, fixed with one class:** `design.spec.ts` failed on this machine at "song overview" before it reached Stats: the loop's name link "Verse" was 39 x 44 px (Unit 16's `SongOverviewPage`, unchanged on `unit-16-first-try` too; presumably wider in CI's font). I added `min-w-touch` to that one link so the spec could run through to the new Stats states, and used the same on the Stats page's own name links. If Unit 16's branch fixes it another way, take theirs.
- The seed-user test signs the three projects in to one account; a magic link replaces the one before, so it retries (`signInAsSeedUser`). The old test had the same race without the retry.
- A chart with very many practice days draws every point but labels only those with room; the dates along the bottom likewise. A year of daily practice on one loop is 365 points in 250 units: readable as a line, not point by point. QA's "a year of history" should look at it.
- The heatmap's month and weekday letters are about 9 px on a 390 px phone (the picture scales to the width). Below 320 px of width the map keeps its size and scrolls sideways inside its own box, as before.
- "Other" is a row for one song when there are exactly six.
- The song-mastered badge has no partial progress (0 of 1), so it is never "Next up" ahead of anything started.
- Not run: tablet e2e, the full e2e suite, `npm run test:db` (the seed test runs the seed script twice against the stack).

### Manual verify

1. `npm run db:seed`, `npm run dev`, sign in as `demo@drumpal.test`, open Stats.
2. Week / Month / All time: the totals, their "than the week before" lines (none for All time) and "Where the time went" follow; the URL keeps `?range=`.
3. Loop progress: "Main groove" reads 60% → 85%. Press Chart: three days ago is at 80% though that day has a minute at 100% (hover the point: 11 min). Open another row's chart: the first closes.
4. Press the loop's name: its practice screen. Back.
5. Badges: four earned, three next up, "Show all badges" shows the other four and the button keeps focus.
6. At 390 px wide nothing scrolls sideways; a loop with a very long name wraps.
7. A new account: the one empty state.

## Test

### After the merge of main

`npm run check` was green as merged (133 files, 4841 tests): the merge broke nothing, and nothing was changed for it.

### What was added

No app code changed, and no test id was needed (Build's cover every number). Counts are tests added; a table row in three zones counts once per zone.

**Pure modules** (appended to Build's files, 57 tests):

- `loopProgress.test.ts` (17): the per-day rule's edges: a three-way tie goes to the slowest; two tries at 100% that add up to the time at 80% are still 80%; one second more at the faster speed wins (the slower only settles a tie); a day wholly at 100% is 100%; 23:59 and 00:01 are two points; a month's and a year's end; another loop's long session decides nothing. In London, New York and Sydney, on the 23-hour and the 25-hour day: the day's first and last half hour are one point, the minutes either side of its midnights two more. `loopProgress`: one session ever (no change, "80%"), loops last practised at the same instant keep one order, the latest session orders (not the first or the longest), and "now" ignores a last-day try at 100%.
- `records.test.ts` (11): the earliest of three equal days and sessions in either order; two equal sessions begun at the same instant; beaten by one second; midnight splits a best day and joins a streak; one session on the last minute of a year; the changed-clock day summed as one day inside a three-day streak, in the three zones.
- `songTime.test.ts` (5): a single sixth song is "Other" with one song; a tie at the fifth place is cut by title whatever order the loops come in; a song with no time in the period is out of the rows, out of Other and out of the total; Other holds songs past the fifth and unknown loops together, counting only the songs; the week and month start at midnight across a year's end.
- `badges.test.ts` (4): exactly three left (nothing behind "Show all"), four left, share against amount, and every unearned badge in exactly one of the two lists.
- `totals.test.ts` (20): the month before is thirty whole days with a change of clocks inside it, and a week that began on the changed day counts all of it, each in the three zones and both directions; the change lines in words across a year's end, for all four totals, week and month.

**Components** (`StatsPage.test.tsx`, 19 tests, in "StatsPage, edges" and "BadgeSection"):

- One session ever: every section's words (totals and their "more than the week before", "On a 1-day streak. Your longest yet.", one song bar, "80%" with no arrow, the one-day chart, records with one date and the loop's name, "None earned yet" and the three next up in order).
- Loop progress: exactly six rows have no "Show all" and seven have "Show all 7 loops"; "Show fewer" takes a chart away with its row and one chart at a time still holds after; the open chart and the expanded list survive a change of period.
- The windows in Build's list: a read that brings a new practice day redraws the open chart, its button still the same element, expanded and focused; a loop deleted elsewhere (loop and sessions gone) takes its row and open chart, leaving the other row closed and usable; a loop gone from the list while its sessions are still cached keeps its time under "Other", the bars adding up to the total, and the record without a name.
- Where the time went: "Other (1 song)", which is not a link; a song with no time in the week is absent and comes back for the month.
- Reads (Build had none of these): "Loading your stats…" until both lists are in, with no zeros and no empty state meanwhile; a failed first read says so in fixed copy (never the error's message) and "Try again" reads only the list that failed; a failed later read keeps the page (the query is asserted to be `error` with its rows first).
- What a screen reader gets: every `svg` on the page with a chart open and every badge shown is an `img` whose name has a number in it, or is hidden; every number's element is outside `aria-hidden`; a song's bar is hidden beside its minutes; an unearned badge says so and how far along; a mastered loop's link says "mastered"; the two-week table has every day once, "Today" last, and the minutes drawn over the bars; the speed table has a row per point with date, percent and minutes, and the Chart button's `aria-controls` holds the chart.
- `BadgeSection` on its own: every badge earned (no "Next up", no button), three left (no button), four left (one behind the button), none earned.

**e2e** (`tests/e2e/stats.spec.ts`, 2 tests x 3 sizes): "after one session ever" (the same numbers through the real page, against the database rows, with no overflow), and "seven songs and loops": five songs then "Other (2 songs)" for all time and "Other (1 song)" for the week (the seventh song has no time in it), six loops then "Show all 7 loops" by keyboard with focus kept, one chart at a time, the chart and list kept through a change of period, both tables present, no sideways scroll or spilled text with everything open at each size, "Show fewer" taking the chart away, and a song's bar going to the song.

### Checked that each test bites

38 one-line breaks of the app code, each run against `src/features/stats` and put back (the scripts are not kept): the tie going to the faster speed, the slower always winning, days keyed in UTC (speeds and totals), loop order without the id or by the earliest session, other loops counted, a record matched rather than beaten or needing a margin, the later of two equal sessions, six songs shown, ties not by title, unknown loops dropped, the period ignored, the period before and the range start stepped by 24 hours, "less" and "fewer" swapped, next up by amount or four of them, "Show all" at six, charts not exclusive, an arrow after one day, `isError` for `isLoadingError`, a retry that reads both lists, the error's message shown, "Other (1 songs)", a missing loop's name printed, the song bar, sparkline and speed chart exposed or unnamed, the tables missing "Today" or the minutes, the badges' button always drawn, "not earned yet" unsaid, the streak line's "longest yet", the loading branch, a row remounted on a new day, and the list reset by the period. Every one failed at least one test, and every new test failed under at least one break.

### Review checklist

- **1 Interleavings:** the page has no write and no timer; its windows are the two reads. Tested: a read landing with a chart open, a loop leaving with its chart open, the two lists out of step, a failed read over data, a failed first read and its retry, one list in before the other.
- **2 Gates:** "Show all n loops" only past six, "Show all badges" only past three, both by component test at the boundary.
- **3 Gestures:** none (buttons and links).
- **4 Round trips:** nothing is written. Comparisons on what is shown were Build's; the year-end table adds the words for each total.
- **5 Validated paths:** focus stays on each disclosure (the same element, asserted after a refetch and by keyboard in e2e). A stale open-chart id matches nothing once its loop is gone.
- **6 What is drawn:** the text alternatives above; overflow with everything open at three sizes.
- **7 Hygiene:** the new e2e fixtures check every `error`; "Show fewer" is found with `exact: true` after the first run matched "Show fewer badges" too.

### Bugs found

None that changes a number. Three things for QA and Review to judge, none fixed (each is a design call or more than a few lines):

1. **The heatmap has no table of its days.** AGENTS.md says every chart is an `img` with a summary plus a visually hidden table of its numbers. `PracticeHeatmap` has the summary and its caption (days practised, best week), but each day's minutes are only a `<title>` inside the `img`, which a screen reader does not reach. Repro: open Stats with a screen reader, or look for a table under "Practice days": there is none. It was so in Unit 16 too. A table of the practised days only (not all 182) would do it.
2. **A day under a minute reads three ways.** A session can be 30 to 59 seconds. For a day with only that: its bar in "Last two weeks" is labelled "<1", its table row says "0 min", the caption counts it ("0 min over 1 of the last 14 days"), and the totals say "0 min" over "1" day. Repro: one 45-second session today, open Stats (read from the code, not run). Consistent with whole minutes everywhere, but "0 min over 1 day" reads oddly.
3. **Two number formats.** A total is written with the browser's locale (`toLocaleString()`), its change line always in English (`toLocaleString('en')`). In a German browser 1,234 passes would read "1.234" over "1,234 more than the week before". Repro: 1,000 passes or more in a period, browser language not English (read from the code, not run). One line to fix either way; left for whoever decides which.

### Not covered

- The speed chart with hundreds of points (Build's known gap, QA's "a year of history"): `labelledIndexes` has Build's tests; nothing here draws 365 points.
- Offline with the lists cached (the page reading the persisted cache): Unit 16's pattern and specs cover the mechanism; only "offline with nothing cached" is tested on this page.
- Tablet and desktop for everything outside `stats.spec.ts` and the design spec's Stats test: the full e2e suite was not run, by instruction. `npm run test:db` was not run.
- Dates are written in the machine's locale; tests match their shape, not their words.
- By ear and by eye: nothing here says the page is motivating.

### How to verify

`npm run check`. Then, with this worktree's stack up: `E2E_PORT=4183 npx playwright test tests/e2e/stats.spec.ts`, and the design spec's Stats part with `E2E_PORT=4183 npx playwright test tests/e2e/design.spec.ts -g "the library, the song page"`.

### Results

- `npm run check`: green, 4917 passed and 2 skipped (4841 before this stage: 76 added).
- e2e, phone, tablet and desktop: `stats.spec.ts` 15 of 15 passed (5 tests x 3), `design.spec.ts` "the library, the song page with its loops…" 3 of 3.

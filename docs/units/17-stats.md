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

## QA

Run on the dev server (`npm run dev -- --port 5183 --strictPort`) against this worktree's stack (API 54421), Chromium through Playwright, at 390x844, 820x1180, 1440x900 and 844x390. The offline cold start was run on the build with its service worker (`npm run build -- --mode development`, `vite preview` on 4183). Users: the seed user, and five throwaway users built by a node script over `scripts/supabase-admin.ts` and deleted afterwards (one session ever; nothing; one 45-second session; 12 songs and 30 loops with 90 sessions, two 100-character loop names, a 300-character and a 130-character song title; a year with 434 sessions, one loop practised on 336 days, every badge earned). The stack is back to its three users and the seed's 20 sessions.

Screenshots: `docs/units/17-shots/qa-<user>-<size>-<state>.png` (`week`, `month`, `all`, `open` for a chart open with every loop and badge shown, `chart` for the chart alone; `qa-year-*-hardbit-chart.png` for the 336-day chart; `qa-seed-*-offline*.png`, `qa-seed-phone-slow-loading.png`, `qa-seed-phone-load-error.png`, `qa-year-desktop-de-locale.png`). Full-page shots draw the phone's tab bar part-way down the page; that is the capture, not the app.

### Acceptance

| Criterion                                                              | Result                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| With the seed user every number can be checked against their sessions  | **Pass.** Checked by hand from the rows (below), and `stats.spec.ts` passes 15 of 15 after this stage's change                                                      |
| A day of ten minutes at 80% with a one-minute try at 100% shows at 80% | **Pass.** Seed, Nov 24: 600 s at 80% and 60 s at 100%; the chart's point and table row say "80%, 11 min", the row says "60% → 85%"                                  |
| A new user still sees the one empty state                              | **Pass** at three sizes: one card, "No practice yet…", "Go to Songs". No zeros, charts or badges                                                                    |
| Nothing overflows at 390 px                                            | **Pass.** No sideways scroll and no element past `main`'s edges for any user, period or open state, at 390, 820, 1440 and 844x390; long names wrap, titles truncate |

### The numbers by hand (seed user, Nov 27)

From the 20 rows, grouped by local day, with none of the app's code:

- Week (Nov 21 to 27): 2,460 s = 41 min, 5 days, 108 passes, 1 mastered. The week before (Nov 14 to 20): 33 min, 4 days, 70 passes, 0. Page: "41 min, 8 min more", "5, 1 more", "108, 38 more", "1, 1 more". Agrees.
- Month: 7,440 s = 2 h 4 min, 17 days, 267 passes; the 30 days before: 5 min, 1 day, 1 pass. Page: "1 h 59 min more", "16 more", "266 more". Agrees. All time: 2 h 9 min, 18 days, 268. Agrees.
- Where the time went, week: Main groove 420 + 660 + 480 + 360 = 1,920 s, "Groove 120, 32 min"; Tempo Change 240 + 300 = 9 min. Agrees.
- Last two weeks: 10, 5, 12, 6, 7, 11, 4, 8, 11 = 74 min over 9 days. Agrees with the bars, the caption and the table.
- Loop progress: Main groove 5,340 s = 1 h 29 min over 11 days, 60% first and 85% last; Across the tempo drop 19 min, 4 days, 60 to 75; Whole song 21 min, 4 days, 90 to 100. Agrees.
- Practice days: 18 of 180; the week of Mon Nov 23: 660 + 240 + 480 + 660 = 34 min over 4 days. Agrees.
- Records: streak Nov 24 to 27 (4 days), most in a day Nov 18 (720 s), longest session Main groove Nov 18 (720 s). Agrees.
- The year user and the 30-loop user were cross-checked the same way for the totals and their change lines in all three periods (for instance 6,683 min = "111 h 23 min", 13,503 passes; 328 against 242 min = "1 h 26 min more"). All agree.

### QA focus

- **One session ever:** every section draws and nothing breaks; "80% · 5 min · 1 day" with no arrow, a one-point chart. See issues 7 and 2.
- **30 loops:** six rows, "Show all 30 loops", then a 6,056 px page on a phone, behind the button. Rows that got slower say "95% → 85%, down 10" in muted text. Fine.
- **12 songs:** five and "Other (7 songs)". See issue 9.
- **A year of history:** the totals, heatmap (169 of 180 days), records (54-day streak) and badges (all eleven in a line, no "Next up", no button) are right and read well. The 336-day chart does not: issue 1. A 39-day chart on the same user reads well (`qa-year-phone-chart.png`).
- **Long names:** wrap or truncate everywhere, no overflow.
- **Week, Month, All time:** the totals, their lines and "Where the time went" follow; All time has no lines; the URL keeps `?range=`, a bad value falls back to Week, and one Back leaves the page.
- **Phone in landscape:** two columns never form (844 px is under `lg`), nothing overflows, the sidebar is in place.
- **Offline:** with the page cached, a cold reload offline on the built app draws the same totals, with the offline banner over them, and the chart opens; in the dev server, leaving for Songs and coming back offline does the same. With nothing cached: "You're offline, and your stats haven't been opened on this device yet."
- **Slow and failing reads:** a read held four seconds shows "Loading your stats…" and nothing else; a 500 with a message in its body shows "Couldn't load your stats. The server refused it…" (never the body's words) and "Try again" draws the page.
- **Keyboard:** Tab order is Period, the song links, each loop's name and Chart button, "Show all badges"; every one has a visible ring. The arrows change the period. Enter and Space open and close a chart with focus kept on its button and `aria-expanded` right. No target in `main` is under 44 px with everything open (phone and desktop).
- **Screen reader paths** (from the accessibility tree; no real screen reader was run): the three charts are `img`s named with their numbers; the daily chart and the speed chart each have their table (14 rows; a row per practice day with date, percent and minutes: 336 rows for the year loop); sparklines, song bars and icons are hidden; unearned badges say "not earned yet"; a mastered loop's link says "mastered". The heatmap has no table: issue 3.

### The Test stage's three findings

1. **The heatmap has no table of its days: confirmed.** No `table` in its figure; 180 `<title>`s inside the `img`, which the accessibility tree does not expose. A reader gets "Practised on 18 of the last 180 days" and the best week, no days. Issue 3.
2. **A day under a minute reads three ways: confirmed, and it goes further than reported.** With one 45-second session ever (`qa-submin-phone-week.png`): Practice time "0 min" beside Days practised "1"; "Quick Song, 0 min" over a full-width bar; the bar labelled "<1"; "0 min over 1 of the last 14 days"; the loop row "70% · 0 min · 1 day"; "Best week: 0 min over 1 day"; Records "Most in one day 0 min" and "Longest session 0 min". Practice time has no change line while the other totals say "1 more than the week before". Issue 2.
3. **Two number formats: confirmed.** In a de-DE browser (`qa-year-desktop-de-locale.png`): "1.184" over "56 fewer than the month before", "13.503" passes beside the badge "1,000 passes". The dates follow the locale too, inside English sentences: "Do., 21. Mai", "the week of 8. Juni". Issue 4.

### Issues

1. **Major. A loop practised on hundreds of days draws a band, not a chart.** Repro: a loop with a session on 336 of the last 365 days, speed 50% to 100%; Stats, "Chart of" that loop (`qa-year-{phone,tablet,desktop,landscape}-hardbit-chart.png`). Every point is a dot 7.7 px wide on a phone (12 px on a laptop) at 0.9 px (1.45 px) apart, so the dots merge into a band about three dots thick that hides the line; the percents ("65%", "72%"…) are drawn on the band; the first date carries its year ("Nov 28, 2025") and runs under the next ("Feb 14"), and "50%" and "52%" collide at the left. The table behind it is right (336 rows). The dots start to touch at about 40 practice days on a phone, where the chart still reads well; by a few hundred it does not. The date collision needs only a first day in an earlier year and a second dated point close after it (the gap allows 50 units, a date with its year is wider), so expect it each January on a loop begun in December with a dozen days; that case was read from the code, not run. This is the decision Build left to QA: the chart needs a rule for many days (no dots past a density, or the last three months with the start named), and the date gap has to allow for a label with a year.
2. **Minor. Under a minute reads as "0 min" in eight places** (finding 2 above). Repro: one 45-second session today. "<1 min" wherever a time is shown and is not zero would settle all of them; the totals' change line would then follow.
3. **Minor. The heatmap has no text alternative for its days** (finding 1). Against AGENTS.md's rule for charts. A table of the practised days would do.
4. **Minor. Locale and English mixed** (finding 3). Pick one: the copy is English, so `'en'` for numbers and dates is the consistent choice.
5. **Minor (product). Which period?** Only the totals and "Where the time went" follow the Period choice; the latter says so beside its heading. Loop progress, Practice days, Records and Badges never change with it and don't say so. With "Week" chosen, "60% → 85%, up 25 · 1 h 29 min · 11 days" reads as the week's gain. Repro: seed user, Week. Say "since Nov 3" in the row (it also answers "over how long?"), or give those headings the same quiet aside ("All time").
6. **Minor (product). Two meanings of "week".** "Last 7 days" is rolling; "Best week" under the heatmap is a calendar week, Monday to Sunday. The seed user reads "41 min" for the week at the top and a best week of "34 min" lower down: the best is less than now. Say "best calendar week", or work the best out over rolling weeks.
7. **Minor (product). Day one is mostly restatement.** After one session (`qa-one-phone-week.png`): three green "n more than the week before" lines against a week with nothing in it, three Records rows that are all that one session, "Practised on 1 of the last 180 days", "Best week: 5 min over 1 day". Nothing is wrong; little of it says anything. Leave the change line out when there is no history before this period, and hold Records and "Best week" until there are two practice days.
8. **Minor. "Of the last 180 days"** is 26 weeks less the days of this week still to come, so it moves between 176 and 182 through the week. It reads as an arbitrary number. "In the last 26 weeks" is stable.
9. **Minor. "Other" sets the scale.** With 12 songs "Other (7 songs), 8 h 43 min" is the full bar and the five named songs draw at under a quarter of the width, nearly alike (`qa-many-phone-top.png`, `qa-many-*-song-time.png`). Scale the bars to the longest named song, or show Other as a line of text.
10. **Cosmetic, not fixed. Chart text grows with the chart.** On a laptop and a phone on its side the charts fill up to 576 px, so their labels are 20 to 25 px tall, larger than the page's text, while on a phone the heatmap's months and weekdays are about 9 px. Both are legible; they don't match the page.
11. **Cosmetic, fixed. "days" alone on a line.** On a phone a row such as "85% → 75%, down 10 · 36 min · 3 days" broke before the last word. The play time and days are now one unbreakable piece (`LoopProgressList.tsx`), so the row breaks before "36 min" instead. Checked at 390 px with 30 rows (no overflow, the year row "89 h 48 min · 336 days" still fits); `npm run check` and `stats.spec.ts` pass.

### As a product

Shane asked for useful, fun and motivating, with enough detail to be interesting and the fluff gone. Section by section, read as a drummer between sessions:

- **Totals:** useful at a glance. "41 min, 8 min more than the week before" is the best line on the page: a number and its direction. "Loop passes" is the weakest of the four: a count with no meaning of its own (a pass of one bar and of sixteen count the same). Not ambiguous, mild filler.
- **Streak line:** good, one line, says both numbers.
- **Where the time went:** answers "what have I neglected" only by omission: a song with no time in the period is absent, not named. For a learner with three songs it is clear at a glance; a line such as "Not touched this week: Rosanna" would answer the question the unit set. Period stated. See issue 9.
- **Last two weeks:** the clearest graphic. Minutes on the bars, dates under them, today marked. The caption's second sentence ("Each bar is a day's minutes; today is the last") restates the picture and could go.
- **Loop progress:** the heart of the page and the part that motivates: "60% → 85%, up 25" is what job 3 in `docs/product.md` asks for, and the name is one tap from the loop (two taps to sound). The sparkline is a shape beside its numbers. The chart under a row is good up to a few dozen days (issue 1). Ambiguous on period (issue 5). The sentence under the heading is long for something most users will never wonder about.
- **Practice days:** Shane asked for it. With three weeks of history it is 160 empty squares and a corner of orange, and "18 of the last 180 days" reads as a low score for someone who started three weeks ago. With a year it is satisfying. The numbers under it are right; see issues 6 and 8.
- **Records:** interesting once there is history ("54 days, Sep 18 – Nov 10"). For a newer user the longest streak is on the page three times (streak line, Records, the "Next up" badge's "4 of 7 days in a row"). All-time, unlabelled (issue 5).
- **Badges:** much better than the wall. Earned ones in a line, three with progress, the rest behind a button. "Next up" gives a reason to come back tomorrow. With everything earned it is a quiet line of eleven, which is fine.

What still reads as filler: Loop passes as a headline total; the daily chart's second caption sentence; Records on day one; the heatmap in a user's first weeks. What is missing for "what have I been neglecting": anything that names a neglected song or loop (a loop not practised for two weeks is only lower in the list). Neither blocks the unit as written.

Order, chores and gates (`docs/product.md`): none. Nothing must be done on the page, nothing is asked of the user, the links are second ways in. A user with no loops, or with loops and no sessions, sees the empty state or the section's own waiting line.

### Not run

The full e2e suite and `npm run test:db`; Safari and Firefox; a real screen reader; a real phone. The dev server has no service worker, so offline there was "leave and come back"; the cold start was on the build.

### Human check (from the plan)

- Shane reviews the PR and the screenshots (`docs/units/17-shots/`: the `qa-` files and Build's `stats-*`).

### Verdict

**FAIL**, on one major issue: the speed chart for a loop with hundreds of practice days (issue 1), which the plan named as QA's to judge. Every acceptance criterion passes and every number checked is right. Issues 2 to 9 are minor and can go with the fix or be carried forward.

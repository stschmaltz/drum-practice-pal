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

## Build (QA fix round 1)

Two Build sessions: the first did the app code and its unit and component tests and was cut off; the second finished the e2e, the seed, the screenshots and the docs. All eleven QA issues are dealt with, and the two things QA's product read said were missing or filler (nothing names a neglected loop; "Loop passes" as a headline).

### Summary, by QA issue

1. **A year of practice days is a line, not a band (major).** What the chart draws on its line now follows how many days it has (`speedChartLayout.ts`, pure): up to 8 days a dot a day and a percent on every day with room; up to 30 a dot a day and the first, best and last day's percents; past 30 the line alone with a dot and a percent on those three days (`dottedDays`, `percentLabelOrder`). Labels are offered in priority order (last, first, best, the rest) and one that would overlap a kept label or the axis's own gives way (`clearLabels` over estimated `textBox`es). The two dates under the plot carry a year only when they differ in year (`axisDates`), and the first gives way if the two don't fit with 8 units of air (`axisDatesShown`). The sparkline is a line with one dot at its end, whatever the days. The table behind the chart still has every day.
2. **"<1 min", never "0 min" for some play time.** `minutesLabel` is the one writer of a play time (totals, song bars, captions, rows, records, tables) and `barMinutesLabel` the number over a bar; `totalChange` compares what both totals show, so under a minute against nothing is "<1 min more".
3. **The heatmap has its table**, a row a week (`heatmapWeekRows`: week starting, days practised, practice), not 180 day rows.
4. **One number format.** A count goes through `countLabel` in a total and in its change line alike, so both follow the reader's locale. Dates still follow the locale inside English sentences (carried forward; QA suggested `'en'` throughout).
5. **Which period.** Sections the Period choice doesn't move say what they cover beside the heading: "Loop progress All time", "Records All time", "Badges All time", "Practice days Last N weeks" (`Section`'s `aside`).
6. **"Best calendar week"**, so it isn't read against the rolling "Last 7 days".
7. **Day one doesn't restate itself.** No change line under any total while the period before has no practice (`periodBeforeHasPractice`); Records from the second practice day (`hasRecords`); the best calendar week from two practised days; the heatmap spans from the first practice week, at least 12 and at most 26 weeks (`heatmapWeekCount`), so three weeks of practice aren't a corner of 160 empty squares.
8. **"Practised on N days in the last W weeks."** Weeks are what the map is made of; the count of days shown moved through the week.
9. **"Other" doesn't set the scale.** Song bars are scaled to the longest named song (`songBarScale`); "Other" is muted and capped at full width (`barShare`).
10. **Chart text matches the page.** The bar and line charts are at most `max-w-md` wide (9-unit text is 11.5 px on a 390 px phone and 14.4 px at the cap); the heatmap is drawn at 1 to 1.4 px a unit in rem, and scrolls in its own box on a phone narrower than its 26 weeks.
11. **"days" alone on a line** was fixed by QA; kept.

From QA's product read: **"Loop passes" is gone from the headline totals** (three totals; passes still count towards the badges). **"Not practised lately"** is new under Loop progress (`neglected.ts`, `NeglectedLoops.tsx`): up to three active loops whose last session was 7 or more calendar days ago, longest left first, each with its song, "last practised 12 days ago" and its name as a link to its practice screen. The daily chart's caption lost its second sentence, which restated the picture. `smallHeadingClass` (styles.ts) is the small caps heading the totals, the records and this block share.

### Decisions (confirmed by the caller)

- A loop never practised is listed as neglected only once it was saved 7 or more days ago ("not practised yet, saved 9 days ago"), so a loop saved this week isn't called neglected before it could be practised.
- "Best calendar week" waits for two practised days.
- The chart's two dates carry a year only when the two ends differ in year.
- The seed's "Single bar" loop now has one session 19 days ago (3 minutes at 50%), so the seed user has a neglected loop for the spec and the screenshots. The seed has 21 sessions; QA's hand-checked numbers above are from the 20 before it (all time is now 3 min, 1 day and 20 passes more).

### Product walk-through (docs/product.md)

- _Day one, one song, one session:_ three totals with no "more than the week before" against nothing, a streak of one, one bar, one loop row with its one-point chart, a 12-week map with one square, no Records, no "Not practised lately", "None earned yet" and three badges to go for. Nothing reads as a failure and nothing is asked.
- _Missing a piece:_ no loops or no sessions is still the one empty state; a finished loop with no sessions, each section's own waiting line as before. A song with no loops never appears and nothing here needs one. "Not practised lately" is absent, not "all caught up", when no loop has been left.
- _Offline:_ unchanged. Everything is worked out from the two cached lists; the new block and rules read nothing else.
- No order is forced and no chore added: the neglected block names loops and links to them, nothing more. A finished loop is never listed.

### Files

- App: `src/features/stats/` (`StatsPage.tsx`, `charts.tsx`, `BadgeSection.tsx`, `NeglectedLoops.tsx` new, `neglected.ts` new, `speedChartLayout.ts` new, `totals.ts`, `records.ts`, `songTime.ts`, `dateLabels.ts`, `days.ts`), `src/components/styles.ts`.
- Unit and component tests: `neglected.test.ts`, `speedChartLayout.test.ts` (new), `totals.test.ts`, `records.test.ts`, `songTime.test.ts`, `dateLabels.test.ts`, `StatsPage.test.tsx`.
- e2e: `tests/e2e/stats.spec.ts`, `tests/e2e/design.spec.ts`, `tests/e2e/practicePage.ts` (`addLoopLeftAlone`).
- `scripts/seed.ts`; `docs/plan.md` (Unit 17's scope and Carried forward), `AGENTS.md`; `docs/units/17-shots/stats-*.png`.

### e2e

`stats.spec.ts` still works every number on the page out from the database rows with none of the app's code, now including: the three totals and their change lines (none when the period before has no practice); the heading asides; the weeks the map spans, its line, the best calendar week and all three columns of its table; "Not practised lately" (which loops, in what order, how many days, the song, the link; no block when none); Records absent under two practice days. New or changed cases:

- _Seed user:_ also expects "Single bar" under "Not practised lately".
- _A try at full speed:_ the week's and the month's totals and change lines ("19 min more than the week before", "24 min more than the month before"), the records' dates, no neglected loop.
- _One session ever:_ no change lines, "Practised on 1 day in the last 12 weeks.", no best week, no Records.
- _Seven songs:_ Loop G, last practised 7 days ago, is named with its song and link; the song bars' widths are 100%, 85.71%… against Song A, "Other" at 42.86%.
- _A year of practice days (new):_ 365 days on one loop, 50% up to 100% and back to 95%. Three dots (50, 100, 95), their three percents, one path, both dates with their years, seven texts in the chart with no two boxes sharing any area, no chart text on the page under 10 px tall, no sideways scroll; measured at the project's size and again at 390 px; the table has 365 rows. Checked that it bites: with the 30-day dot limit raised it fails on 365 dots.
- `expectWholePage` no longer presses "Show all badges" when every badge is earned or next up (the year user: eight earned, three next).
- `design.spec.ts`: before the Stats audit a second loop practised once nine days ago is put in by the service role (`addLoopLeftAlone`) and read by a reload, so the audit and the focus-ring pass cover the change lines, "Not practised lately" and Records as well.

### Screenshots

Retaken on the build, seed user, at 390, 820 and 1440 px: `stats-{phone,tablet,desktop}.png` (Week), `stats-month-*` and `stats-open-*` (Month, Main groove's chart open, every badge). New: `stats-year-chart-*` and `stats-year-*`, a throwaway user with one loop practised on 308 of the last 336 days. Looked at: the year chart is a wavering line from "51%" at the left to "96%" at the right under the dashed 100% line, with "Dec 27, 2025" and "Nov 26, 2026" under its ends, at all three sizes; the best day's dot sits beside the last and its percent gave way to the last's. The seed page shows three totals with their lines, the asides, "Not practised lately: Single bar, Tempo Change · last practised 19 days ago", a 12-week map and "Best calendar week: 34 min over 4 days, the week of Nov 23". Full-page phone shots still draw the tab bar part-way down: the capture, not the app.

### Async windows and inputs

None added. The page still derives everything in render from the two queries it already read; no new effect, timer, write or request. The chart button, "Show all" and the Period choice are synchronous state.

### Review checklist, self-review

- Predicates: one each for "has a period to compare with" (`periodBeforeHasPractice`), "lists records" (`hasRecords`) and the neglect rule (`neglectedLoops`), each used by the page and tested alone.
- Rounded values compared as shown: `totalChange` on whole minutes and "<1 min" against "0 min"; a loop is neglected by calendar days (`daysBetween`), not 24-hour spans, so a clock change can't move it.
- Lists read in full: unchanged (`fetchAllPages` for sessions and loops); e2e helpers check every `error`, including the new `addLoopLeftAlone` and the 365-row insert.
- Tests that say "nothing": the year case asserts seven texts before asserting none overlap and that the page has more chart text than the chart before asserting none is small; the seed case asserts the period before has practice before reading its change lines.
- Test cleanup: the `user` fixture as before; the temporary screenshot spec was deleted.

### Known gaps

- Dates follow the browser's locale inside English copy (plan, Carried forward).
- Label boxes are estimated (0.66 em a character), not measured; the e2e measures the real ones for one data set.
- When the best day is next to the last, the best's percent gives way and its dot stays (the year screenshot): the dot is unlabelled but the row and table say it.
- The neglected block was not walked by hand with 30 loops or a 100-character name; component tests and the design audit cover its wrapping and targets.

### Manual verify

1. `npm run db:seed`, sign in as `demo@drumpal.test`, open Stats: three totals; "Single bar" under "Not practised lately" goes to its practice screen.
2. A user with one session: no change lines, no Records, a 12-week map.
3. A loop with a session on most days of a year: "Chart" shows a line with three dots and two dated ends at 390 px.

### Results

`npx tsc -b` clean; `stats.spec.ts` 18 of 18 and `design.spec.ts` "the library, the song page…" 3 of 3 at phone, tablet and desktop (`E2E_PORT=4183`, this worktree's stack on 54421). The full e2e suite was not run. `npm run check` green.

## QA (after QA fix round 1)

A re-check of what the fix round touched, nothing else. Dev server (`npm run dev -- --port 5183 --strictPort`) against this worktree's stack (API 54421), Chromium through Playwright at 390x844, 820x1180 and 1440x900, plus one look at 320x640 and a de-DE browser. Eleven throwaway users were built by a node script over `scripts/supabase-admin.ts` and deleted afterwards with the scripts; the stack is back to its three users and the seed's 21 sessions (it was not reset or re-seeded). Every measurement below was read in the page: each chart text's drawn size, each pair of text boxes in a speed chart for shared area, the counts of dots and paths, the tables' rows, the bars' widths.

Screenshots: `docs/units/17-shots/qa2-<user>-<size>-<state>.png`. Users: `year` (eight loops on one song: 337, 40, 31, 30, 9 and 8 practice days, one from Dec 18, 2025 to Jan 6, 2026, one of Dec 31 and Jan 1), `long` (1,100 days in a row, an hour a day), `submin` (one 45-second session), `one` and `two` (one and two practice days), `negA` to `negD` (the neglect rule's edges), `other` (12 songs), `other6` (six songs), `seed`. `-de-` is the de-DE browser; `qa2-year-phone-chart-*.png` are the charts on a phone, `qa2-year-320-heatmap.png` the map at 320 px. Full-page phone shots still draw the tab bar part-way down: the capture, not the app.

### The fix round, item by item

| Item                                  | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue 1, 336+ days                    | **Pass.** 337 days: one path, three dots, "50%" and "95%" on the ends, "Nov 29, 2025" and "Nov 27, 2026" under them, no two texts sharing any area and none outside the chart, at all three sizes and in de-DE; the table has 337 rows. 1,100 days: the same with two dots (the best day is the last). It reads as a line                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Issue 1, the edges                    | **Pass.** 8 days: 8 dots, percents on the four with room. 9 days: 9 dots, first and last labelled. 30 days: 30 dots, first and last. 31 days: the line with 2 dots (the best is the last). 40 days with the best in the middle: 3 dots, "60%", "100%", "66%"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Issue 1, December into January        | **Pass.** "Dec 18, 2025" and "Jan 6, 2026", and for two days "Dec 31, 2025" and "Jan 1, 2026": both with years, apart, at 390 px too (de-DE "18. Dez. 2025" and "6. Jan. 2026", no clash). Loops inside one year carry none ("Oct 27", "Nov 26")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Issue 2, 45 seconds                   | **Pass.** "<1 min" as the total, the song's time, over the bar ("<1"), in the caption, the loop's row, both tables and the charts' names; no visible "0 min" and none in an accessible name. The only "0 min" left are the tables' rows for days and weeks with no practice, which is right. No change line, no best week, no Records                                                                                                                                                                                                                                                                                                                                                                                                                |
| Issue 3, heatmap table                | **Pass.** "Practice days by week": Week starting, Days practised, Practice; 12 rows for a new user, 26 for a year, agreeing with the map                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Issue 4, de-DE                        | **Pass** as fixed: a total and its change line go through one function. No user can show both past 999 (a change line exists only for 7 or 30 days), so this was read in the code and seen on "1.100" days. New issue 2 is what a de-DE reader still sees mixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Issue 5, asides                       | **Pass.** "Where the time went Last 7 days / Last 30 days / All time" follows the choice; "Loop progress All time", "Practice days Last 12 weeks" (26 for a year), "Records All time", "Badges All time"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Issue 6                               | **Pass.** "Best calendar week: … the week of Nov 23."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Issue 7, day one                      | **Pass.** One session: three totals with no line under them, no Records, no best week, a 12-week map, "None earned yet" and three badges next up. Two practice days: Records and the best calendar week appear; still no change lines (nothing the week before)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Issue 8                               | **Pass.** "Practised on N days in the last W weeks."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Issue 9, "Other"                      | **Pass.** 12 songs: five named bars scaled to Song A (100, 83.54, 67.08, 50.62, 34.16%), "Other (7 songs) 1 h 50 min" muted and at 100%, never wider. Six songs: "Other (1 song) 5 min" at 16.67%, muted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Three totals                          | **Pass.** Practice time, Days practised, Loops mastered; passes appear only in the badges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Not practised lately                  | **Pass.** Six days ago (even at 00:05): not listed. Seven calendar days ago at 23:40, under 7 x 24 hours: listed, "last practised 7 days ago". Eight: listed, first. Never practised and saved today or six days ago: not listed; saved seven or ten days ago: "not practised yet, saved 7 days ago". A finished loop last practised 40 days ago: never listed. Seven candidates: three shown (30, 20 and 10 days), longest first. No loop qualifying: no heading, no block. A 100-character name wraps, a long song title is cut with the days kept, every link is 44 px tall, nothing spills. Seed user at each size: "Single bar" goes to its practice screen and Play there loops bar 9: two taps from Stats to sound, and Back returns to Stats |
| Chart sizes                           | **Pass.** At 390 px chart text is 11.5 px and the map's 10.2 px (14 px on a 12-week map); at 1440 px 14.4 px and 13 to 14 px, under the page's 16 px, in charts at most 448 px wide. New issue 4 is 320 px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| No sideways scroll, no console errors | **Pass** for every user, period and size                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### One user by hand (`other`, Nov 27)

From the 39 rows as the database holds them, grouped by local day and song with none of the app's code: Oct 18 1,845 s; Nov 18 6,100 s; Nov 25 9,390 s; Nov 26 9,450 s.

- Week: 18,840 s = 5 h 14 min over 2 days; the week before 6,100 s = 101 min, 1 day. Page: "5 h 14 min, 3 h 33 min more", "2, 1 more". Agrees.
- Month: 24,940 s = 6 h 55 min, 3 days; the 30 days before 1,845 s = 30 min, 1 day. Page: "6 h 25 min more", "2 more". All time 26,785 s = 7 h 26 min, 4 days. Agrees.
- Where the time went, week: Song A 3,645 s "1 h", then 50, 40, 30 and 20 min; the other seven 6,615 s "1 h 50 min". Month: A 4,845 s "1 h 20 min". All time: A 5,460 s "1 h 31 min", D 2,445 s at 44.78% of it. Agrees.
- Last two weeks: 101, 156 and 157 over the bars, "6 h 55 min over 3 of the last 14 days". Agrees.
- Practice days: 4 in 12 weeks; best calendar week Nov 23, 5 h 14 min over 2 days. Records: 2 days (Nov 25 – 26), most in a day 9,450 s "2 h 37 min" on Nov 26, longest session Loop A 1,825 s "30 min" on Nov 26. Agrees.

### New issues

None is a blocker or major, and none was fixed here (no cosmetic one is a one-line change without a decision).

1. **Minor (product). Long-abandoned loops hold "Not practised lately" for good.** Repro: three active loops last practised months ago and a fourth left nine days (`year` has two, at 330 and 325 days: `qa2-year-desktop-week.png`). The block is "longest left first", so it names the same three old loops every day, and the loop that slipped last week, the one a nudge would help, never shows. Finishing or deleting the old ones is the only way to clear them, which is a chore the page shouldn't set. Most recently left first (still 7 days or more), or an age past which a loop is no longer "lately", would settle it.
2. **Minor. A de-DE reader still sees two formats and a doubled full stop.** "Days practised 1.100" beside "1100 h", "On a 1100-day streak" and "1100 days" (never grouped, in any locale) and the badge "1,000 passes" (always English); a locale's date that ends in a full stop ends its sentence with two ("the week of 16. Nov.."). It takes three years of daily practice or a non-English browser, and the dates are already carried forward; `'en'` throughout would settle all of it.
3. **Cosmetic. A capped "Other" looks equal to the top song.** With 12 songs "Other, 1 h 50 min" and "Song A, 1 h" are both full-width bars (`qa2-other-phone-week.png`). The muted colour and the minutes tell them apart; nothing says the bar is capped.
4. **Cosmetic. Under 358 px of page.** At 320 px the bar and line charts' text is 9.3 px, and a 26-week map scrolls in its box from its oldest week, so today is off its right edge until it is scrolled (`qa2-year-320-heatmap.png`).
5. **Cosmetic. Minutes over the bars past an hour.** A day of 2 h 37 min is "157" over its bar and the caption under it says "6 h 55 min".
6. **Cosmetic. The first day's percent can sit on a steep line.** On the 337-day chart "50%" is drawn over the start of the line it labels (`qa2-year-desktop-chart-hard-bit.png`). Legible, and no two labels meet.

### As a product

- **Useful and motivating now?** Yes. The totals give a direction only when there is one, Loop progress says "50% → 95%, up 45" over a chart that holds a year, and the page answers "what have I neglected" by name, one tap from the loop and two from sound.
- **Still filler:** Records on day two (three rows about the same two sessions); the sentence under "Loop progress", a rule few will wonder about; the sparkline, a shape beside its own numbers.
- **Still ambiguous:** "Not practised lately" for someone with old loops, where "lately" is a year (issue 1); a capped "Other" beside the top song (issue 3); two kinds of week on one page, labelled but still there.

Order, chores and gates (`docs/product.md`): none added. The new block only names loops and links to them; a user with no loops, or none left a week, sees nothing of it.

### Not run

The full e2e suite and `npm run test:db` (another agent was running e2e against this stack); Safari and Firefox; a real screen reader; a real phone; offline, slow and failing reads (not touched by the round; passed in the first QA).

### Human check (from the plan)

- Shane reviews the PR and the screenshots (`docs/units/17-shots/`: `qa2-*` for this round, `stats-*` from Build).

### Verdict

**PASS.** The major issue is fixed and holds at 337 and 1,100 days; issues 2 to 9 and the two product gaps are fixed as described. New: one minor product issue (1), one minor (2), four cosmetic (3 to 6).

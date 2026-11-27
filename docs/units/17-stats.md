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

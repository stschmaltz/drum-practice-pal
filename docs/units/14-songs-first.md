# Unit 16: Songs first and practice progress

## Build

### Summary

- **Three levels.** Songs (`/`) → a song's overview (`/songs/:id`) → a loop's practice screen (`/songs/:id/loops/:loopId`) or the whole song (`/songs/:id/play`). The nav is Songs · Stats · Settings; Songs stays current on a song's screens (`isNavItemActive`). The On the go page is gone (`OnTheGoPage.tsx` and its test deleted, with the dead `targetProgress` and `practiceTabFrom` / `PRACTICE_TABS` it alone used).
- **Songs (`/`)** is the library, renamed and redrawn: plain rows between `line` dividers, each with a mastery ring (`ProgressRing`: dashed with no loops, full and green with every loop finished) and one line under the name (`"Fixture · 2 of 4 loops mastered"`, `"No loops yet"`, `"Mastered"`; the artist leads it). Search, sort (recently practised first by default), edit, delete, upload by picker and by drop are all kept; once there are songs the upload is a quiet ghost-style action. The header carries the streak (`StreakBadge`: a flame and a number of days, nothing at 0). `/library` redirects to `/` with its `?q=` / `?sort=`.
- **Song overview (`/songs/:id`)**: title, artist, `"16 bars · 120 BPM · 1 of 3 mastered"`, the no-drum-track note; "New loop" and "Play whole song" as quiet links; the loops on the go (last practised first, `practiceLoopsFor`), then "Mastered" with a trophy. A row: name, `"Bars 1 to 4 · 92%"` (+ last practised from `sm`), a thin bar of the speed towards 100%, its "More" menu (Edit, Show/Hide history, Mark finished or Reopen, Delete with the inline confirm) and a round play link "Practise {name}". No alphaTab and no file (the test mocks `alphaTabEngine` to throw on import). `/songs/:id?loop=<id>` is redirected (replace) to the practice screen.
- **Practice screen (`/songs/:id/loops/:loopId`)**: back link to the song, the loop's name, one muted line `"Bars 9 to 12 · 4:12 · 14 passes"` (the open session, ticking each second while running), Session complete or the unsaved/offline session notices, "Mark finished?" (the existing prompt, moved to `FinishPrompt.tsx`), a sticky bar with `PracticeSpeed` (large %, BPM, `"8% to full speed"`, round −/+ 5% nudges, Save speed) and a big round Play/Pause, the status line and Shortcuts, the score, and `PlayerControls showSpeed={false}` (count-in, metronome, drum toggles). Keys and pedals work as on the whole song; the loop keys move to the song's other loops and the URL follows with `replace`.
- **Play whole song (`/songs/:id/play`)** is today's jam mode with its loop panel, plus a back link. `?new=1` (the overview's "New loop") opens the loop form once the bars are known; the save goes to the new loop's practice screen (replace). `?edit=<id>` (a row's Edit) opens the form on that loop; save or Cancel goes back to the song.
- **Session complete** replaces "Practice logged" on the practice screen for a session logged while the screen stayed: time, passes, `"71% → 76%"` (start speed kept by the tracker hook per session id), the streak, and any badge it just earned. "Keep going" closes it; "Done" goes to the song. Not for a session that ended by leaving (keepalive or unobserved).
- **Stats (`/stats`)**: Week / Month / All time (`?range=`, week bare) over practice time, days practised, loop passes and loops mastered; the streak; minutes per day for 14 days with today marked; a 26-week heatmap; speed over time for a chosen loop (the last practised by default) against a 100% line; the badges, earned in colour, locked with their progress and a bar. SVG drawn by the app on the tokens, each chart an `img` with a summary name and a hidden table of its numbers. Offline with nothing cached it says so.
- **Data**: no migration. `fetchAllSessions` (every session through `fetchAllPages`, `sessionKeys.every`), `usePracticeLoops` (every loop with its song). Pure modules in `src/features/stats/` (days, streak, totals, badges, chart scale, session summary) and `src/features/loops/mastery.ts`, all tested with local-time dates (summer-time changes in Europe and North America, midnight, one-day gaps).

### Files touched

New:

- `src/features/stats/`: `days.ts`, `streak.ts` (+ test), `totals.ts` (+ test), `badges.ts` (+ test), `chartScale.ts` (+ test), `sessionSummary.ts` (+ test), `charts.tsx`, `StatsPage.tsx` (+ test), `StreakBadge.tsx`.
- `src/features/song/`: `SongOverviewPage.tsx` (+ test), `LoopPracticePage.tsx` (+ test), `SongGate.tsx`, `SongFileGate.tsx`, `playerScreen.tsx`, `practiceLoop.ts` (+ test), `useHeightOf.ts`.
- `src/features/loops/`: `mastery.ts` (+ test), `PracticeSpeed.tsx`, `useLoopSpeed.ts`, `FinishPrompt.tsx` and `ConfirmDeleteLoop.tsx` (moved out of `LoopPanel.tsx`).
- `src/features/practice/SessionComplete.tsx`, `src/components/ProgressMarks.tsx`, `src/lib/routes.test.ts`, `src/features/shell/navItems.test.ts`, `tests/e2e/stats.spec.ts`, this note.

Deleted: `src/features/practice/OnTheGoPage.tsx` (+ test).

Changed:

- Routes and shell: `src/App.tsx`, `src/lib/routes.ts`, `navItems.ts`, `AppShell.tsx`, `NotFoundPage.tsx`, `icons.tsx` (flame, trophy, chart, music).
- Songs list: `LibraryPage.tsx`, `SongListItem.tsx`, `UploadPanel.tsx`, `songForm.ts` (`songFactsLabel`).
- Player screens: `SongPage.tsx` (gates and parts moved out, `useLinkedLoopForm`, back link, no `?loop=`), `useRequestedLoop.ts` (takes the id), `LoopPanel.tsx` (`outcome`), `LoopSpeedControl.tsx` (uses `useLoopSpeed`), `PlayerControls.tsx` (`showSpeed`, `PlayPauseButton round`).
- Sessions: `sessionKeys.ts` (`every`), `sessionsApi.ts`, `useSessions.ts` (`useAllSessions`, `sessionLogged` adds to it), `useLoops.ts` (a loop delete invalidates it), `usePracticeTracker.ts` (`completed`, `dismissCompleted`, `progress`).
- Dead code: `loopLabels.ts`, `practiceList.ts` and their tests.
- Tests: `App.test.tsx`, `AppShell.test.tsx`, `LibraryPage.test.tsx`, `SongListItem.test.tsx`, `SongPage.test.tsx` (renders `/songs/:id/play`; its `?loop=` cases now live in `LoopPracticePage.test.tsx`), `songForm.test.ts`, `designTokens.test.ts` (graphic pairs).
- e2e: `playerPage.ts` (`openSongOverview`, `openSongPlayer`; `openFixture` lands on jam mode), `practicePage.ts` (practice screen and overview steps), `loopsPage.ts` (`fillLoopForm`), `journey.spec.ts` (rewritten for the three levels), `practice.spec.ts`, `design.spec.ts` (overview, practice and stats screens audited), `auth.spec.ts`, `library.spec.ts`, `offline.spec.ts`, `player.spec.ts`, `drums-only.spec.ts`.
- `AGENTS.md`: new "Songs first, practice screen and stats (from Unit 16)" section; the practice folder line.

### Decisions

- **The library is the Songs page**, keeping `LibraryPage` and the `library` folder names: a rename is Readability's call, and keeping them kept every library test and e2e step working.
- **The jam page keeps its loop panel.** "Play whole song: today's jam mode" read literally; the loop specs (loops, loop-scroll, count-in, shortcuts, offline) still run there unchanged, and the panel is where a loop's bars are picked. The overview's "New loop" and "Edit" go through it (`?new=1`, `?edit=`). Only a form opened by such a link leads elsewhere on save (`LoopPanel`'s `outcome`); "New loop" pressed in the panel itself still makes that loop the one playing there.
- **Edit on the overview opens the jam page** rather than an inline form: the loop form needs the score's bar count and picks bars on the score.
- **Bars and BPM moved from the song row to the overview**, to keep the row to one line under the name; `library.spec.ts` checks them there.
- **Full speed is 100%** (`fullSpeedLabel`, the thin bar). `target_ratio` isn't read anywhere new; the existing "Mark finished?" prompt (which reads it) is reused as is on the practice screen.
- **Colours**: progress is drawn in the quiet `selected-line`, mastered and earned in `success`, the streak's flame in `warning`; the brand stays on Play (and the songs-list upload before there are songs). The practice screen's one brand action is the round Play.
- **Session complete takes focus** (a `tabIndex={-1}` section, `preventScroll`), so a screen reader hears it and Tab reaches Done and Keep going; Space still plays (the page's shortcut). It sits above the score, like "Practice logged" did.
- **A streak badge counts the longest run**, not the current one, so it isn't lost by a day off; the header and Stats show the current streak.
- **Week is the last 7 local days, month the last 30**, today included, not calendar weeks or months.
- **Mark finished / Reopen are in the overview row's menu**, using `useSetLoopStatus` like every other status control (so its pending state and error come from the mutation cache); focus follows the loop to its new list.

### Async windows and inputs

- **Practice screen, before the loop is open.** `lookUpPracticeLoop` shows "Loading the loop…" until the song's list has the loop, or no read is on its way (then "Loop not found"); offline with nothing cached it says so. Once found, the player loads; `useRequestedLoop` opens the loop when the score is in and the list was read since mount (or the read failed or is paused). Inputs meanwhile: Play once the sounds are in but before the fresh read lands plays the whole song, and the loop then opens under it without stopping (as the old `?loop=` did); a loop key before that opens the loop the key chose, and the late read gives way (`userChoseLoop`). Leaving the page unmounts everything.
- **Practice screen, loop keys and the URL.** A key calls `playLoop` / `openLoop`; `useUrlFollowsLoop` then replaces the URL. Another key before the navigation lands: the effect runs again for the newest loop. The route's new id finds a loop already open, so `useRequestedLoop` latches without reopening it (which would reset the speed).
- **A loop deleted while its practice screen is open** (another device): the list loses it, the lookup says "Loop not found" and the player is unmounted. A failed background refetch keeps the list (`data` stays), so it doesn't.
- **Session complete waits for the session's log.** It shows when the mutation answers `logged` for a session that ended while the screen stayed. Meanwhile: Play again starts a new session, and the summary of the last one still appears when its answer lands; Keep going before that has nothing to close; leaving the screen first means it never shows (the log still goes, unobserved). A refused log shows the existing "Couldn't save" notice and no summary; its "Try again" that then succeeds shows the summary. Its streak and badges wait for `useAllSessions` and `usePracticeLoops`; offline on a device that never read them they are left out.
- **`?new=1` / `?edit=` on the jam page.** The form opens once the score's bars are in (`canPickBars`) and, for an edit, the song's loops are read. A form the user opened first (a drag across bars) is left alone and the link's form is never opened. While the save is pending the form is locked as before; its success navigates (replace). An edit link for a loop not in the list opens nothing.
- **Overview "Mark finished" / "Reopen"**: optimistic, through `useSetLoopStatus`; the row moves lists at once and its menu item is `aria-disabled` while the write is pending; focus goes to the row's "More" in its new list. A refusal moves it back and shows the error in the row.
- **Stats, streak, mastery**: reads only. A session logged meanwhile joins `sessionKeys.every` at once (`sessionLogged`) and is read again; a loop deleted invalidates it.

### Known gaps

- On the practice screen Play is enabled on `canPlay` alone, so in the window above (sounds in, the fresh loops read not back) it plays the whole song until the loop opens under it. Rare (the read is usually back long before the soundfont); a gate of its own (`activeLoop !== null`) for the button and Space would close it.
- After "Mark finished" in the practice screen's prompt the prompt goes and focus falls to `<body>`.
- The heatmap and the daily chart's colours are decoration (`img` with words and a table); the heatmap's shades are opacity steps of `selected-line` and aren't contrast-checked.
- Stats reads every session of the user on each visit to Songs (the streak) and Stats; fine for a year of daily practice (a few hundred rows a page of 500), not measured beyond.
- `LibraryPage` / `features/library` keep their names (see Decisions).
- No QA screenshots or real-device check yet; the e2e `design.spec.ts` audits the overview, practice and stats screens at the three sizes.

### Checks

- `npm run check`: green (typecheck, lint, format, 4,507 unit and component tests).
- `npm run e2e` (`E2E_PORT=4183`, against the local stack shared with the main checkout): a full run gave 414 passed, 12 failed, 42 skipped. Nine of the twelve came from this unit and are fixed since. The design audit counted the charts' `svg role="img"` as spoken icons, so `designPage.ts` now skips an `img` with a name. `drums-only.spec.ts` and `release-fixes.spec.ts` clicked a song link expecting the player, and now use `openSongPlayer`. Those specs pass on a rerun (drums-only, the upload case of release-fixes, auth), and so does the phone rotation case in `jam.spec.ts` (2 of 2), which only failed under the full run's load.
- **Not verified, because the shared database changed under this run.** After the full run, another branch migrated the shared local stack (`20261127000000`, which removes `loops.target_ratio`). Since then every loop insert and every read that selects `target_ratio` is refused there (PGRST204, "Could not find the 'target_ratio' column"). So the specs that save a loop or read every loop fail for reasons outside this branch: `stats.spec.ts`, `design.spec.ts`, release-fixes "Save loop pressed again", and the two phone `loop-scroll.spec.ts` count-in cases (their first failure, in the full run, may have been the same load flake as `jam.spec.ts`). `journey.spec.ts` passed at all three sizes before the migration. `stats.spec.ts` has not passed yet: its first run failed on picking the period (fixed since, by clicking the label), and every run after that was against the migrated database. The database wasn't reset, because another session is using it. Test stage: run `npm run db:reset`, or use a stack of its own, then `npm run e2e`.

### Manual verify steps

1. `npm run dev`, sign in as `demo@drumpal.test`. Songs: rows with rings and "n of m loops mastered", the flame in the header if the seed has a streak (it may not: seed dates are fixed). `/library?sort=added` lands on `/?sort=added`.
2. Open a song: facts, mastery, loops on the go then Mastered. Press a loop's round play: the practice screen at the loop's saved speed, BPM and "n% to full speed". Nudge, Save speed, Play, ArrowRight to the next loop (the URL changes, Back goes to the song).
3. In dev, `window.__drumPalMinSessionSeconds = 2` in the console, play 3 s and pause: Session complete with time, passes, speed from → to, the streak; Keep going closes it, Done goes to the song.
4. On the overview: New loop → the jam page with the form open → save → the new loop's practice screen. Edit in a row's menu → the form on that loop → Cancel → back to the song. Mark finished / Reopen move the row.
5. Stats: switch Week / Month / All time (the URL follows), pick another loop for speed over time, check the badges. Offline (DevTools) after a visit: the page still shows; in a fresh profile offline, it says it hasn't been opened.
6. Old link: `/songs/<id>?loop=<loopId>` opens that loop's practice screen.

## Test

### Summary

87 new unit and component tests (4,507 to 4,594 passing in `npm run check`, plus one `it.fails` for bug 1), and 2 new e2e tests (6 runs across the three sizes). No app code changed; every new test was broken once against the code it covers (below).

- **Dates in zones that change their clocks.** The Build's summer-time cases ran in the machine's zone, which on CI (UTC) changes nothing, so they could pass on code that steps by 24 hours. `src/test/timeZone.ts` (`inTimeZone(zone)`, which sets `TZ` for a describe and checks it took, and `hoursInLocalDay`) pins Europe/London, America/New_York and Australia/Sydney, and each block first asserts the 25- and 23-hour days are where it expects them. Cases: late on the 25-hour day (23:30, where 24 hours earlier is still the same day), just after the midnight that follows each change, a day off on the change day, 14 daily bars and the 26-week heatmap running through each change with every day once and in order, and the week and month starting at local midnight across a change (`streak.test.ts`, `totals.test.ts`, `badges.test.ts`).
- **Midnight and thresholds.** A session at the first millisecond of the week's first day counts and one a millisecond before doesn't; the same for a loop's `finished_at`. Every badge at its threshold and one under it (3,599 / 3,600 s, 99 / 100 and 999 / 1,000 passes, 2 / 3 and 6 / 7 days, 30 days across a month end, 4 / 5 loops, a song with no finished loop). A session at 00:05 carries on last night's run in the summary (`sessionSummary.test.ts`).
- **Routes and history.** `renderRoutes` takes `before` (entries ahead of `path`) and renders hidden Back and Forward controls (`historyBack()`, `historyForward()` in `src/test/render.tsx`). `/library?q=…&sort=…` lands on `/` with both kept and Back skips it (`App.test.tsx`); `?loop=` likewise, Forward returns to the practice screen, and a `?loop=` for a loop the song lacks still goes to the practice screen, which owns "Loop not found"; Back and Forward from the overview through a practice screen and Songs (`SongOverviewPage.test.tsx`); Back after a loop key goes to the song, not the loop before (`LoopPracticePage.test.tsx`). The existing "the URL follows, replaced" test passed with `replace` removed; the new one fails.
- **Session complete.** It takes focus and Keep going hands it to Play; a badge the session earns is listed with the streak it makes; Play again while the log's answer is held, and the summary still comes when it lands, the new session playing on; a refused log shows the "Couldn't save" notice and no summary, and its Try again that lands shows it; a session ended by hiding the page goes by keepalive and is never summed up, nor when the keepalive failed and the mutation sent it again once the page was back.
- **The practice screen's loop.** A refetch that lacks the loop (deleted on another device) says "Loop not found" and destroys the engine; a failed background refetch keeps the loop and the player.
- **The Build's known gap** is pinned twice: what happens today (Play in that window starts the whole song; the loop's range and speed are put under it without a stop) and, as `it.fails`, what should (bug 1).
- **e2e.** `stats.spec.ts`: a new test signs in as the seed user (`demo@drumpal.test`, read only) and checks time, days and passes for All time, Month and Week, and mastered, against sums over their rows in the database, worked out in local days from local midnight; the existing test's streak check is now the exact words (`/3/` matched any 3). `practice.spec.ts`: Songs → song → loop, a loop key (the URL is replaced), Back to the song and to Songs, Forward to the song and to the second loop at its speed, then an old `?loop=` link from Stats and Back to Stats.
- `App.test.tsx`'s lazy player routes wait 5 s for their heading: the first cold import took over a second once in five runs here.

### Broken on purpose (each new test failed, then the code was put back)

- `addDays` stepping by 24 hours (two versions: a raw `+ 86,400,000`, and the same normalised to midnight): 7 streak, 18 to 28 totals and 2 badge cases failed, in every pinned zone.
- `earned: values >= target` as `>`: 15 badge cases.
- `Navigate replace` removed from the overview's `?loop=` redirect and from `/library`, and `/library` dropping its search: the history tests.
- `replace: true` removed from `useUrlFollowsLoop`: the Back-after-a-loop-key test (the Build's test passed).
- Session complete: the summary claim dropped on a failed log (Try again test), dropped when a new session opens (Play again test), and given to any session not left by leaving (the keepalive-fallback test); its focus effect removed (focus test). The plain keepalive test passed under the last break, since a keepalive that lands never reaches the summary code; it stays as the rule's statement, and the fallback test is the one that bites.

### Bugs found

1. **Play on the practice screen can start the whole song** (the Build's known gap, confirmed). With the song's loops cached from an earlier visit, the player loads before the fresh loops read returns; Play and Space are enabled on `canPlay` alone, so a press plays the whole song (no range, at the speed the cached loop opened the player at), and when the read lands `useRequestedLoop` opens the loop under it without a stop (range and speed change mid-play; the session tracker starts only then). Pinned in `LoopPracticePage.test.tsx` ("today: Play then starts the whole song…" passes; "should stay off…" is `it.fails`: drop `.fails` with the fix). Fix: one predicate in `controlGates.ts`, say `canPlayLoopPractice(player, snapshot, loopOpen)` = `canPlay && (loopOpen || isRunning(status))`, taken by `PlayPauseButton` as a `gate` prop and by `useSongShortcuts`' `togglePlay` (an input beside `practice`), with the practice screen passing `practice.activeLoop !== null`. Four files; left to Build.

### Not verified

- **e2e against the right schema, after my new tests.** Before writing them, `stats.spec.ts` passed at all three sizes against this branch's schema (the shared stack had just been reset). During this stage another checkout migrated the shared local stack again (`20261127000000` and `20261128000000` are applied; `loops.target_ratio` is gone, 42703), so every loop insert and every loops read with `target_ratio` is refused. The run of the new and existing stats and navigation tests after that failed on it: the Stats page says "Couldn't load your stats. The server refused it." and a loop save leaves the form open. As asked, I stopped there and didn't reset. The full `npm run e2e` was not run. Next stage: `npm run db:reset` (or a stack of its own), then `E2E_PORT=4183 npm run e2e`, and check the two new tests in `stats.spec.ts` and `practice.spec.ts` in particular.

### Checks

- `npm run check`: green (typecheck, lint, format, 4,594 passed, 2 skipped).
- `npm run e2e`: not run in full (see above). `stats.spec.ts` alone: 3 passed before the schema changed; after it, 9 failed of 9 (stats and the navigation test) on the refused `target_ratio`.

## QA

Run against this worktree's own stack (`drum-practice-pal-u14`, API 54421), a fresh `npm run build -- --mode development` previewed on 4193 (rebuilt after each fix). Screens walked at 390x844, 820x1180 and 1440x900, plus 844x390 (a phone in landscape), with a throwaway QA spec (deleted after) that seeded 50 songs, a song with 30 loops (4 finished), sessions on four days and a streak of 3. 95 screenshots in `docs/units/14-shots/` (`<screen>-<phone|tablet|desktop>.png`; `-full` are whole pages; `landscape-*`, `offline-*`, `empty-*` and `*-slow` as named). `docs/product.md` doesn't exist, so the product judgement below is against the plan's Unit 16 section and the signed-off direction.

### Criteria

| Criterion                                                                                                                               | Result                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Songs → song → loop's practice screen → practise → Session complete → Done back on the song, at all three sizes, covered by the journey | Pass. `journey.spec.ts` passes on phone, tablet and desktop; walked by hand too (Session complete: time, passes, `80% → 80%`, streak `3 days`; Keep going closes it, Done goes to the song)                                                                                                                                               |
| Stats totals for the seed user equal sums over their sessions                                                                           | Pass. `stats.spec.ts` (seed user, Week / Month / All time) passes at all three sizes. On the QA data, Week = 21 min, 4 days, 49 passes, 5 mastered: the sums of the seeded rows                                                                                                                                                           |
| An old `?loop=` link opens the loop's practice screen                                                                                   | Pass at all sizes (replaced; a `?loop=` that isn't a uuid stays on the overview, harmless)                                                                                                                                                                                                                                                |
| Player, loop, offline and shortcut specs pass on the new routes                                                                         | Pass. Desktop: 141 passed, 17 skipped across journey, practice, stats, library, auth, loops, design and the specs those names matched (player, shortcuts, release-fixes, settings, loop-scroll, smoke). Phone and tablet: journey, stats, practice and offline, 45 passed. Design and stats at all three sizes after the fixes: 49 passed |
| `/library` redirects to `/` keeping `?q=` and `?sort=`                                                                                  | Pass                                                                                                                                                                                                                                                                                                                                      |
| Back and forward through the three levels                                                                                               | Pass: a loop key replaces the URL, Back goes to the song (not the previous loop), Forward returns to the loop, Back twice reaches Songs                                                                                                                                                                                                   |
| Deep links: unknown loop, a loop of another song, malformed ids                                                                         | Pass: "Loop not found" / "Song not found" with a way up, no crash                                                                                                                                                                                                                                                                         |
| Offline                                                                                                                                 | Pass: Songs, overview, practice (a loop never opened on this device too, the file being stored) and Stats read from the cache; Stats with nothing cached says so; Songs never read offline says so                                                                                                                                        |
| 50 songs, 30 loops in one song                                                                                                          | Pass: the songs list draws in under 200 ms; the overview lists 26 on the go and 4 mastered                                                                                                                                                                                                                                                |
| Empty states                                                                                                                            | Pass, with issue 5                                                                                                                                                                                                                                                                                                                        |
| Phone in landscape                                                                                                                      | Pass, with issue 7                                                                                                                                                                                                                                                                                                                        |
| Slow network (3 s on every REST and Storage call)                                                                                       | Pass: "Loading song…" on the overview and practice screen, "Loading your stats…", then the screens fill in                                                                                                                                                                                                                                |

### Issues

Known, not re-reported: Play on the practice screen can start the whole song when the sounds load before the loops read (Test, bug 1).

1. **Major: "New loop" on a phone opens the form over the score it asks you to tap.** Overview → New loop at 390x844: the jam page opens with the loop sheet up and the page at the top, so the score is wholly under the sheet, which says "Tap the first bar on the score, then the last." The score shows only once the page is scrolled down (then about 200 px of it above the sheet: `new-loop-phone.png` against `new-loop-scrolled-390.png`). Typing the bar numbers works, so nothing is blocked, but this is now the way to start a loop from the overview, on the device used most. Repro: phone, any song, New loop. Fix: bring the score box on screen when the form opens from `?new=1` / `?edit=` (or whenever the sheet's form opens). Related to the carried-forward 08 QA item about 112 px of score above the sheet.
2. **Minor: three taps to sound from opening the app.** Songs → song → round play → Play. The On the go page put the last loop two taps away (Practice, Play); there is now no "carry on where you left off". Recently practised first puts the song at the top, so it is quick, but a returning drummer always goes through the overview. A product call for Shane after the week of practice.
3. **Minor: songs list rows carry Edit and Delete as two text buttons each.** 50 rows are 100 buttons, and rows are about 135 px tall on a phone, so about four songs show under a search box and a sort that already take the top 380 px. The overview's rows keep the same kind of actions in "More"; the songs list doesn't. Against "quiet secondary actions, uncluttered", a "More" menu would match. (`songs-50-phone.png`)
4. **Minor: Session complete pushes the score down about 215 px on a phone** (`session-complete-phone.png`): the same kind of shift as the carried-forward "Practice logged" one, but larger, so a bar tapped as it appears lands on the wrong bar.
5. **Minor: Stats for a new user is a page of zeros.** No empty state: four 0 totals, an empty 14-day chart captioned "Up to 5 min a day", an empty heatmap, a "Practise a loop…" line under Speed over time, then ten locked badges. A line pointing to Songs in place of the charts would read as designed. (`empty-stats-*.png`)
6. **Minor: the heatmap's practised days are hard to tell from empty ones.** The low levels are faint opacity steps of `selected-line`, and today's cell reads as an outlined empty square even when practised (`stats-week-desktop.png`). Not contrast-checked (the Build's known gap).
7. **Minor: a phone in landscape (844x390): the practice bar takes 157 of the 390 px** while playing (the speed block and the 80 px Play stay), leaving about one line of score. (`landscape-practice-playing-phone.png`)
8. **Cosmetic: "practised" and "practiced" both on screen.** Stats and badges say "Days practised", "1 hour practised", "Practised on…", and the play links "Practise Main groove"; the sort says "Recently practiced" and rows "Last practiced today". Not fixed: a copy decision, and tests depend on both.
9. **Cosmetic: on desktop the Stats charts stop at `max-w-xl`** and leave the right half of the column empty while the totals and badges span it.
10. **Cosmetic, fixed: "On a 3 days streak."** now reads "On a 3-day streak." (`StatsPage.tsx`).
11. **Cosmetic, fixed: the daily chart's "Today" was cut off at the chart's right edge** ("Toda") at every size, and ran into the "W" before it once moved inside. Today is now its weekday letter in bold, like the other days; the caption and the hidden table still name it (`charts.tsx`).
12. **Cosmetic, fixed: the speed chart's labels at 100%.** With the axis topping out at 100%, the grey "100%" sat on the dashed full-speed line (it read as struck through) and the green "100%" was clipped at the top. The grey one is left out when the axis max is 100, and the green one goes under the line when there's no room above it (`charts.tsx`).

### Look against the signed-off direction

Plain rows with dividers and one ring or bar per item: yes, on Songs and the overview. One brand action per screen: the practice screen's round Play and the jam page's Play are the only filled brand buttons; the back links (`linkClass`) and each overview row's play arrow are orange as well, as a link and an icon. Quiet secondary actions: yes on the overview ("More", "New loop", "Play whole song"); not on the songs list (issue 3).

### Fixes made

`src/features/stats/StatsPage.tsx` (the streak sentence) and `src/features/stats/charts.tsx` (the daily chart's today label, the speed chart's 100% labels). `npm run check` green after (4,594 passed, 2 skipped); design and stats e2e at all three sizes green after.

### Human checks for Shane

- Sign off on the screenshots in `docs/units/14-shots/` at all three sizes, then practise with the new flow for a week (the plan's Human check), in particular whether three taps to sound (issue 2) is fine at the kit, and making a loop on the phone (issue 1).
- iPhone: Session complete after a real minute, Keep going and Done; the practice screen's round Play makes sound on its first tap; a pedal moving between loops on the practice screen (the URL follows) with no gap.

### Verdict

PASS, with one major issue (1) for Build to decide on; no blockers.

## Build (QA fix round 1)

Fixes for Test bug 1 and QA issue 1, then QA issues 3 to 8, which Shane added to this round (3, 5 and 6 first, then 4, 7 and 8). Each change has a test that failed before it: the component tests against the code before the change, and the new e2e checks against QA's build of the old code, still served on 4193 (the Session complete check failed there with the score 214 px lower, the landscape bar check with a 157 px bar, the New loop check with bar 1 under the sheet). `docs/product.md` doesn't exist, so the walk-through is against the plan's Unit 16 section. A drummer on day one with a song: New loop on a phone now shows the bars to tap, and Stats says there is nothing yet and points to Songs. One missing a piece (a cached list, the fresh read not back): Play waits for the loop instead of playing the whole song. One offline: nothing here adds a network step. The songs list's menu offers Edit and Delete offline as the buttons did, and their form and question stay off with their notes. Nothing forces an order or adds a chore.

### Summary

- **Test bug 1: Play before the loop is open.** `canPlayLoopPractice(player, snapshot, loopOpen)` in `controlGates.ts` is `canPlay`, and either the loop is open or playback is already running, so Pause always works. `PlayPauseButton` takes a `gate` (a `PlayGate`, `canPlay` by default) and `useSongShortcuts` a `playGate` (same default) for Space. The practice screen builds one gate from `practice.activeLoop !== null` and gives it to both. Loop keys still open a loop in that window, as the Build note had it: they go by `canPlay`, and the loop they open makes Play available.
- **QA issue 1: New loop and Edit from the overview, on a phone.** A form opened by `?new=1` / `?edit=` opens the sheet one render later (an effect sets the panel open). `useScoreOnScreen`'s `picking-bars` scroll ran in the render before, when the page didn't yet have the open sheet's room at its end. The window couldn't scroll, so it stayed at the top with the score under the sheet. `SongPage` now asks for `picking-bars` on `pickingBars && loopPanel.open`, so the scroll runs in the commit that draws the room. The panel's own "New loop" is pressed with the sheet already open, which is why that path worked.
- **QA issue 3: a song row's Edit and Delete in "More".** `SongListItem` draws an `OverflowMenu` (Edit, then Delete as `danger`) beside the summary, above the stretched title link. Its button carries `itemMenuAttributes(song.id)`, so every hand-over that looked for the row's Edit or Delete (`findItemControl`) lands on "More": Cancel, a save, "Keep it", and a neighbour's delete. The inline delete question is unchanged.
- **QA issue 5: Stats with no practice.** When `hasPracticeHistory(sessions, loops)` (`totals.ts`) is false, the page draws one `EmptyState` (chart icon, "No practice yet…", a "Go to Songs" link) in place of the totals, charts and badges. It is true with a session, or with a loop marked finished, which needs no session. Decision: no locked badges below the empty state; ten locked badges at 0 were the clutter QA named.
- **QA issue 6: the heatmap.** Practised days are four brand steps (`fill-brand/70`, `/80`, `/90`, `fill-brand`) and empty days `fill-raised`. Every brand step is at least 3:1 against the page (canvas and surface) and against an empty cell; the lowest is 3.44:1 against `raised`. Today is ringed in `ink` in the gap round its cell, on a practised or an empty day; the viewBox has room for the edge cells, and the legend has a "Today" swatch. The steps live in `heatmapShades.ts`, which has no imports so the node token test can read it, with a test keeping the classes equal to the alphas. This is the one place the brand marks something that isn't an action or what is playing (AGENTS.md's colour roles), at Shane's call.
- **QA issue 4: Session complete moved the score.** It is now a sheet fixed at the foot of the window, placed as the loop sheet is: above the phone's tab bar, right of the sidebar from 768 px, at most 70dvh, scrolling inside. Nothing in the page's flow moves when it comes or goes. Its focus works as before: it takes focus, and Keep going hands focus to Play. While it is up it covers the lower part of the score, as the loop sheet does.
- **QA issue 7: the practice bar in phone landscape.** A `short` variant (`@custom-variant short (@media (max-height: 30rem))` in `index.css`, in rem) lays `PracticeSpeed` out in one row: the percent at `text-3xl`, the "n% to full speed" line `sr-only`, and the round Play at `size-14` (56 px). At 844x390 while playing the bar is at most 90 px, down from 157; every button in it is 44 px or more.
- **QA issue 8: one spelling.** The UI's verb is "practise": 10 strings on screen used it against 4 for "practice", and the British spelling matches the rest of the copy. The four strings changed are "Recently practised", "Last practised …", "Not practised yet" and the playing loop's region "Practising {name}". Identifiers, `?sort=practiced` and `last_practiced_at` keep their names, so a saved URL still works.

### Files touched

- Gate: `src/features/player/controlGates.ts` (+ test), `PlayerControls.tsx` (`gate`, `short:size-14`), `src/features/song/useSongShortcuts.ts` (`playGate`), `LoopPracticePage.tsx` (+ test). In the test the `it.fails` now passes as a plain test, the test pinning today's behaviour is gone, a Space case is added, and `loadPlayer({ beforeTheLoop })` serves the test whose read is held.
- Score above the sheet: `src/features/song/SongPage.tsx` (+ test, "New loop / Edit from the overview brings the score on screen once the sheet is open"), `tests/e2e/loop-scroll.spec.ts` (the overview's New loop and Edit at every size and on a phone in landscape: bar 1 is on show with nothing over it, and a tap on it picks it).
- Songs list: `src/features/library/SongListItem.tsx`, `SongListItem.test.tsx`, `LibraryPage.test.tsx` (new "keeps each song's Edit and Delete in its More menu"), `src/test/songActions.ts` (new), `tests/e2e/libraryPage.ts` (`chooseSongAction`), `library.spec.ts` (its "anywhere on its card" press moves to the row's lower right corner, clear of "More"), `offline.spec.ts`.
- Stats: `src/features/stats/StatsPage.tsx` (+ test: the empty state, a loop mastered with no session, the heatmap's ring and fills), `totals.ts` (+ test, `hasPracticeHistory`), `charts.tsx`, `heatmapShades.ts` (+ test, new), `tests/unit/designTokens.test.ts` (every heatmap step against canvas, surface and raised; `ink` against canvas and surface).
- Session complete and the bar: `src/features/practice/SessionComplete.tsx`, `src/features/loops/PracticeSpeed.tsx`, `src/index.css`, `tests/e2e/practice.spec.ts` ("Session complete comes and goes without moving the score", "on a phone on its side the practice bar is one row…"), `tests/e2e/design.spec.ts` (now audits Stats with no practice and the practice screen with Session complete up, then Stats with a session).
- Spelling: `LibraryPage.tsx`, `sessions.ts`, `LoopPanel.tsx`, and the tests that pinned the old words (`LoopPanel.test.tsx`, `sessions.test.ts`, `library.spec.ts`, `practice.spec.ts`, `loop-scroll.spec.ts`).
- `AGENTS.md`: the gate, `short`, the sheet's scroll, Session complete as a sheet, the heatmap and the empty Stats, the songs list's menu, the spelling.

### Async windows and inputs

- **Practice screen, sounds in before the loop is open** (the Build's first window). Play is off. Space does nothing, but the key is still taken, so the page doesn't scroll. A loop key opens the loop it chose, as before. Once the fresh read opens the loop, Play and Space play its range at its saved speed. Playback can't start in this window any more; if it is already running (a loop key pressed while playing keeps it running), Pause stays available.
- **Jam page opened by `?new=1` / `?edit=`.** The score is scrolled up above the sheet in the commit where both the form and the panel are open. Closing the sheet with the form open and opening it again scrolls the score up again; it didn't before, when the scroll was keyed on the form alone. Closing it while playing with the form open hands `scoreOnScreen` to `playing`, which scrolls only if the box isn't fully on show.
- **Session complete.** Its windows are unchanged (it still waits for the session's answer); only where it is drawn changed.
- The songs list's menu, the empty Stats and the heatmap add no async work.

### Decisions

- `PlayGate` is a function, not a `loopOpen` prop, so another screen with its own precondition passes its own, and the button and its key can't disagree.
- Stats' empty state replaces the badges too (above). With a loop marked finished and no session, the stats still show, because its mastered count is real.
- The brand on the heatmap is Shane's call over Unit 12's rule that the brand marks actions only.
- Session complete is a bottom sheet rather than a reserved slot: a slot sized for the summary would leave 215 px of empty page on a phone the rest of the time.

### Known gaps

- `loop-scroll.spec.ts`'s two phone count-in cases ("Play loop with a 1-bar / 2-bar count-in…") fail at 390x844. They fail the same way with this round's `SongPage` change reverted (run on a fresh build), so they come from before this round. They fail when run alone too, so they are not the load flake the Build note suspected. `chooseCountIn`'s click on the count-in label never lands: Playwright reports the sticky jam bar, and then the open loop sheet's header (left open by `saveNewLoop`), intercepting it. Not one of this round's issues, so not touched. Next: a Build fix for the step (close the sheet and bring the controls clear of the sticky bar before `chooseCountIn`), or a look at whether Unit 16's layout moved the count-in under them.
- Session complete now covers the lower part of the score (on a phone the controls bar too) until Keep going or Done.
- Not checked on a real phone: the landscape bar, the sheet over the score, the heatmap's orange in a dim room.

### Manual verify steps

1. Phone (390x844): from a song's overview, press New loop. The jam page opens with the sheet up and the score's first line above it; tap two bars. Do the same from a loop row's More, Edit. Turn the phone (844x390) and repeat.
2. Practice screen with the loops cached and a slow network (DevTools throttling): Play stays off and Space does nothing until the loop's speed shows; then both play the loop.
3. In the console, `window.__drumPalMinSessionSeconds = 2`; practise a few seconds and pause. Session complete rises from the foot of the window and the score doesn't move; Keep going puts focus on Play.
4. 844x390, practice screen, press Play: the bar is one row (−, speed, +, Save speed, Play).
5. Songs list: each row has one "More" holding Edit and Delete. Delete's question is inline, and Keep it puts focus back on More.
6. Stats as a new user: one "No practice yet" card with Go to Songs. With practice: practised days in orange on the heatmap, empty days grey, today ringed.

### Checks

- `npm run check`: green (typecheck, lint, format, 4,639 passed, 2 skipped).
- e2e on fresh builds (`E2E_PORT` 4195 and 4197, this worktree's stack on 54421), at phone, tablet and desktop:
  - design, stats, library, practice and journey: 94 passed and 8 skipped in the first run, which failed 6. Those were two specs at three sizes each, both from this round's changes: the library's press on the row's top right corner, now where "More" is, and the design audit opening Stats for a user with no session, now the empty state. Both specs were updated, and their rerun passed at all three sizes (6 of 6).
  - loop-scroll, loops, shortcuts and offline: 145 passed, 18 skipped, 2 failed (the two phone count-in cases under Known gaps).
- Not run: the full `npm run e2e`.

## Merge of main

`origin/main` (the practice-feedback work, metronome sounds, CI e2e shards, `/design`, `docs/product.md`) merged into `unit-14`, left staged and uncommitted for the orchestrator.

### Numbering

Main's `docs/plan.md` had taken 14 (Songs with recordings) and 15 (play-along player) while this unit was built. This unit is **Unit 16** now: the plan's table and section, `AGENTS.md`'s section heading ("from Unit 16"), this note's title, and every "Unit 14" / "14 QA" / "14 Test" comment in `src/` and `tests/` (main's code had none of its own). The note keeps its file name, `docs/units/14-songs-first.md` (no clash; main has no 14 note), and so does `docs/units/14-shots/`. Units 14 and 15 gained a Carried forward line each: their scope still names the library card and the On the go page's Songs tab, which this unit replaced, so they are to be walked again against the Songs list, the overview and the practice screen before Build.

### What conflicted, and how each was resolved

- **`src/features/practice/OnTheGoPage.tsx` and its test** (deleted here, edited on main for the 100% target): kept deleted. Main's change there was the progress bar towards full speed; the overview's loop rows already draw it (`fullSpeedFraction`, `"n% to full speed"` on the practice screen), so nothing moved.
- **`loopLabels.ts` and its test**: this side, without `targetProgress` (only the deleted page used it; main had rewritten it for the 100% target).
- **`LoopSpeedControl.tsx`, and with it `useLoopSpeed.ts` and `PracticeSpeed.tsx`** (not conflicted, but on the old model): main's autosave carried into both speed controls. `useLoopSpeed(loop, player, snapshot)` no longer takes a song id or saves; it returns the gate, the tempo, `setSpeed` and `saves` (`useLoopSpeedSaves`: "Saved on this device" while one waits offline, the latest failure). `PracticeSpeed` lost "Save speed" and the "Saved: …" line, as the panel's control did on main.
- **`SongPage.tsx`** (jam page): main's flat layout (the loop panel a sheet over a full-width score at every size, no "Show loops" / "Hide loops", no `lg:` column) with this side's back link, `useLinkedLoopForm` and `outcome`; `useSaveLoopSpeed` added. Main's in-file `ScoreBox`, `SessionNotice`, `ShortcutsButton` and `useHeightOf` stayed in `playerScreen.tsx` / `useHeightOf.ts` where this unit had moved them, with main's changes to them applied (no `lg:scroll-mb-4`, comments without the column).
- **`LoopPracticePage.tsx`** (not conflicted): `useSaveLoopSpeed` added, so a nudge or a speed key on the practice screen is saved as it is made; "Mark finished?" now asks `shouldAskToFinish(loop, speedMoved)` as the panel does, not `hasReachedTarget`. The panel's "has the speed moved since this loop was chosen" state moved out of `LoopPanel` into `useSpeedMovedSinceChosen` (`src/features/loops/`), used by both, so the two screens ask by the same rule.
- **`LoopPanel.tsx`**: main's sheet-at-every-size markup and `shouldAskToFinish` with this side's `outcome`, `ConfirmDeleteLoop` and `FinishPrompt` moved to their own files; main's new prompt copy ("You're playing it at full speed. Mark this loop finished?") went into `FinishPrompt.tsx`. `LoopSpeedControl` no longer takes `songId`. The section's label stays "Practising …".
- **`PlayerControls.tsx`**: both imports (`type PlayGate` and main's `canChangeMetronomeVoice`, `MetronomeVoiceFields`, `metronomeVoiceSummary`); the "Metronome sounds" disclosure is on the jam page and the practice screen alike, since both use `PlayerControls`.
- **`AppShell.tsx`**: this side's nav (`Link` with `isNavItemActive`) and main's full width for the score, but by screen rather than `useMatch('/songs/:id')`, which is now the overview (no score, a readable line length): `showsScore(pathname)` in `src/lib/routes.ts` (pure, tested) is true for `/songs/:id/play` and `/songs/:id/loops/:loopId`.
- **`tests/e2e/journey.spec.ts`**: this side's three-level journey, with main's rules: no target in the loop form, the four nudges down to 80% saved as made (polled in the database), then four nudges up to 100% bring "You're playing it at full speed"; the mastered row reads "Bars 5 to 6 · 100%". `practiceSaveSpeed` is gone from `practicePage.ts`.
- **`tests/e2e/practice.spec.ts`**: this side's overview checks with main's 100% (`"Bars 3 to 4 · 100%"`); the test's title now says the song's lists, not tabs.
- **`AGENTS.md`**: both sections, main's "Speed, target and sound" before this unit's; main's lines edited where this unit changed the ground under them (`useSaveLoopSpeed` is on both loop screens; the full width is `showsScore`; the 100% bar is `fullSpeedFraction`, not the deleted `targetProgress`; "Mark finished?" on both screens with `useSpeedMovedSinceChosen`). Main's new rules (writing Shane's changed instructions into the docs, `docs/product.md`, additive migrations, metronome sounds) are kept as they came.
- **`docs/plan.md`**: main's unit table and sections plus this unit as 16 (above); this unit's "Not in this unit" line now says `target_ratio` was dropped after 13 rather than "another branch removes it".
- `LoopPracticePage.test.tsx`'s settings row gained main's four metronome columns. Its "Save speed" test became: each nudge is saved as made, opening a loop saves nothing, a loop key to another loop saves nothing, and "Mark finished?" asks once the speed is worked up to 100% but not for a loop opened there unpractised.

### Two things the merge changed besides the conflicts

- **"Mark finished?" on the practice screen sits under the score now, above the controls bar.** With the 100% target, every loop saved at 100% asks once it has been practised, so the prompt now comes with the first session of such a loop. Above the sticky bar it pushed the score down 110 to 130 px as it came (`practice.spec.ts` "Session complete comes and goes without moving the score" failed at all three sizes; the same defect class as 16 QA issue 4). Under the score it moves nothing. On a phone it may be below the window, behind Session complete while that is up; Shane to judge at the kit.
- **`loops.spec.ts` "a mouse drag across bars…" (desktop) measures its bars again before the second drag.** Main's sheet at every size means the open form now brings the score up above the sheet at 1440 px too (`scoreOnScreen: 'picking-bars'`), so the points measured before the first drag were stale. Test-only.

### Database

`npm run db:reset` on this worktree's stack (54421) applied `20261128000000_metronome_sounds.sql` and `20261129000000_drop_target_ratio.sql`; `npm run db:types` left `src/lib/database.types.ts` unchanged (it already matches main's).

### Checks

- `npm run check`: green (typecheck, lint, format, 4,627 passed, 2 skipped).
- e2e on a fresh build (`E2E_PORT=4199`, this worktree's stack) at phone, tablet and desktop, one run of journey, practice, loops, loop-scroll, player, stats, design, library and shortcuts: 285 passed, 42 skipped, 6 failed. Three were "Session complete comes and goes without moving the score" and one was the desktop drag, both fixed as above; practice and journey at all three sizes and the drag at desktop then passed on rerun. The other two are the known phone count-in cases in loop-scroll ("Play loop with a 1-bar / 2-bar count-in"), which still fail as before the merge.
- Not run: the full `npm run e2e`, and no second confirming run (the coordinator's instruction).

## Build (Shane's first-try items)

### Walk-through against docs/product.md

- Day one with a song: Songs, the song, a loop's round play opens the practice screen with just its bars; Play is one tap. Someone who wants to find another hard part taps "Show whole song", taps two bars, names it, Save as loop: the new loop is on screen, no backing out. No order is forced: the jam page still has New loop.
- Missing a piece: a song with one track shows no mixer (nothing to mix); a song with no drum track lists its tracks with none marked as the drums. A loop near the song's start or end draws what bars exist (clamped). A loop whose tempo is unknown keeps the BPM steps and BPM typing off, the percent works.
- Offline: speed changes queue as before (`useSaveLoopSpeed`); "Save as loop" is online only (off, with its note, and the handler refuses); the drawing and mixer need no connection.
- No chore added: nothing asks the user to record anything.

### Summary

1. Practice screen focus: the score draws the loop and a bar either side from the first drawing (`initialVisibleBars`), "Show whole song" draws it all, and there taps or drags pick bars for a "Save as loop" sheet (the loop form in a bar layout, fixed at the window's foot so the score doesn't move; client id per form lifetime; online only). Saving opens the new loop on this screen, URL replaced. A tap on a context bar never seeks out of the loop (seekToBar refuses), a drag in the loop view opens nothing.
2. Speed: a stepper pill (ends ±5%, percent over BPM, each tapped to type, quiet ±1 BPM beside the BPM, a thin progress bar to full speed with its words for screen readers). Typed BPM is stored as the exact ratio; values clamp to the DB bounds; each change saves as made.
3. Track mixer: "Tracks" disclosure in the controls bar on both player screens, live, no restart; Drums only / Mute drums keep overriding.
4. Bar count in the loop form ("5 bars", "1 bar", nothing while invalid), in the panel and the Save as loop sheet.
5. Header redone after Shane's review: one sticky band, stepper on the band's centre from 1024 px (three-column grid), its own centred row below that, one row in `short`; Show whole song and Shortcuts quiet in the band (icons alone below 1024 px); "Bar n of N" in the meta line. Screenshots: `docs/units/14-shots/practice-header-*.png`, `practice-whole-song-*.png`.

### Files

- Engine and service: `playerEngine.ts` (`trackNames`, `setVisibleBars`), `alphaTabEngine.ts` (`redraw`, `redrawing`), `PlayerService.ts` (`TrackMix`, `tracks`, `visibleBars`, `setVisibleBars`, `tracksPatch`), `usePlayer.ts` (`initialVisibleBars`), `speed.ts` (`nudgeSpeedBpm`), `src/test/fakePlayerEngine.ts`.
- UI: `PlayerControls.tsx` (`TrackMixer`), `PracticeSpeed.tsx` (stepper, `TapToType`), `useTypedValue.ts` (new), `LoopSpeedControl.tsx`, `LoopEditorForm.tsx` (`layout`, bar count), `loopForm.ts` (`barCountLabel`), `useLoopPractice.ts` (`dragOpensForm`), `LoopPracticePage.tsx` (band, `useDrawnBars`, `WholeSongToggle`, `SaveAsLoopSheet`), `practiceView.ts` (new), `playerScreen.tsx` (`fitsScore`, `PlayerStatusText`, compact `ShortcutsButton`), `SongFileGate.tsx` (`header`), `icons.tsx` (`minus`).
- Tests: `PlayerService.test.ts` (mixer, visible bars), `alphaTabEngine.pointer.test.ts` (drawing only some bars), `usePlayer.test.tsx`, `speed.test.ts`, `practiceView.test.ts`, `loopForm.test.ts`, `LoopEditorForm.test.tsx`, `useLoopPractice.test.tsx`, `PlayerControls.test.tsx`, `LoopPracticePage.test.tsx` (speed exactly, the loop or the whole song); e2e `practice-screen.spec.ts` (new), `drums-only.spec.ts` (mixer). Every direct `scoreLoaded` fire now sends `trackNames`.

### Decisions

- The whole-song view is `practice.editor !== null` rather than its own flag, so the drawing, the taps and the sheet can't disagree; Cancel or a save goes back to the loop. The toggle is locked while the save is pending (unmounting the form would drop its `onSuccess`).
- The mixer shows each track's own switch, not what Drums only makes of it; it isn't disabled under Drums only (the service remembers such a change), and says why the others are silent.
- The stepper is about 98 px tall, not 56: the percent and the BPM row are each a 44 px target and stacked. In `short` they sit side by side, one 44 px row.
- Tablet (820 wide, 556 px beside the sidebar) can't fit name, stepper and Play in three columns, so the stepper takes its own row there, as on a phone.

### Async windows and inputs

- **A drawing asked for (setVisibleBars, setLayout) until alphaTab's postRenderFinished.** `scrollToBar` answers false; a `showBar` meanwhile is kept and done on `rendered`; a `setRange` meanwhile drops it (as before). If alphaTab never finishes that render (it waits while the box is hidden), the scroll waits too.
- **Save as loop pending.** The fields are read-only, taps and drags pick nothing (`setEditorSaving`), the whole-song toggle is disabled, Space still plays or pauses. Offline before the press: the button is off and the handler refuses. A lost answer: as `LoopEditorForm` already does (23505 on the same id is "already saved").
- **Typing a value.** Space and the shortcut keys go to the field; a blur commits; Enter or Escape is cancelled so it can't press the value's button that comes back.

### Known gaps

- e2e: `practice.spec.ts` "on a phone on its side the practice bar is one row…" fails at 844 x 390 after the header rework (the band's measured height or a target in it; not looked into, the coordinator stopped e2e). `practice-screen.spec.ts` and the mixer test passed at phone, tablet and desktop; `practice`, `journey` and `design` were otherwise green at desktop and phone before the stepper restyle and the bar count; nothing ran after them.
- `design.spec.ts` has no audit of the whole-song view or an open mixer yet.
- A track name from the file shown in the mixer is not checked for duplicates (two "Guitar" switches read the same).

### Manual verify steps

1. Practice screen of a loop in the middle of a song: only it and a bar either side are drawn. Tap a bar outside it: nothing moves. Show whole song: every bar, the loop on screen; tap two bars, see "n bars", name it, Save as loop: the new loop's screen, Back goes to the song.
2. Stepper: −5% / +5% ends, −1 / +1 by the BPM, tap the percent or the BPM and type; reload, the speed is kept.
3. Multi-track song, playing: open Tracks, turn Bass off and on: no stop. Drums only on: the note shows, switches stay as set.
4. Header at 1440, 820 and 390 wide and 844 x 390.

### Checks

- `npx tsc -b`, eslint, prettier and the touched unit tests green (3,608 in loops, song, player and tests/unit). Full `npm run check` was green before the header rework and the bar count.

## Practice notes (2026-11-27)

Build, from Shane's practice session (PR #31): no Session complete pop-up; a summary on the song page when you leave. The bullet is in docs/plan.md, Unit 16, "From Shane's first try".

### Walk-through, before building

- **Day one, one song, one loop.** Opens the loop, plays, pauses to breathe: nothing comes up, Play is still under the thumb (the sheet used to take focus and want "Keep going"). Back to the song: one line says what was done. Nothing to press; Dismiss is there, and the line goes by itself on leaving. No chore added, one removed.
- **Missing a piece.** A song with no loops has no practice screen and no sitting: the overview shows no summary and reserves nothing. A loop opened and left unplayed, or played under the 30 seconds a session needs, shows nothing. A song with no drum track is no different here.
- **Offline.** The sitting is in memory, so its line shows with no connection. The streak and badges need every session and loop: from the persisted cache they show; on a device that never read them their line stays empty (its height is held either way). Sessions queue as before.
- **No forced order.** Leaving by the nav tabs instead of the back link skips the summary until that song's overview is next opened; opening another song's overview first forgets it. Nothing waits on it.

### Summary

- The Session complete sheet is gone from the practice screen (`SessionComplete.tsx`, `stats/sessionSummary.ts` and their tests deleted). A pause that logs a session shows nothing and leaves focus on Play. A refused or offline-waiting session still says so (`SessionNotice`), as before.
- The header's time and passes count the sitting: every session since the loop was opened plus the one open, a too-short tail included. A loop key or "Practise it" starts the new loop's sitting at 0.
- Leaving a loop (the screen, or another loop) keeps its sitting for this visit if it has the play time a session needs (`sessionMinPlaySeconds()`). The song's overview shows them once under its header: a line per loop, the streak, badges earned since the first sitting began, Dismiss.
- Sessions are logged exactly as before: `sessionTracker.ts` and the three ways out are untouched.

### `usePracticeTracker`

`completed`, `dismissCompleted`, `progress()` and the two refs that fed them (`startSpeeds`, `endedOnScreen`) are removed, not kept as a signal: nothing consumes "a session was logged while the screen stayed" any more. In their place the hook keeps a `SittingTally` beside the tracker's state, fed in the same `sync` from the same inputs plus the session that step ended, and returns `sitting()`.

### Files

- New: `src/features/practice/sittings.ts` (+ test), `visitSittings.ts`, `useVisitSittings.ts` (+ test, the store's too), `VisitSummary.tsx`, `visitSummaryFocus.ts`; `src/features/stats/visitSummary.ts` (+ test).
- Changed: `usePracticeTracker.ts`, `LoopPracticePage.tsx`, `SongPage.tsx` (one line: the jam page's loops are sittings too), `SongOverviewPage.tsx`, `playerScreen.tsx` and `useSessions.ts` (comments), `src/test/setup.ts` (empties the store).
- Tests: `LoopPracticePage.test.tsx` ("the sitting", replacing "Session complete"), `SongOverviewPage.test.tsx` ("the visit's practice summary"), `SongPage.test.tsx` (one case); e2e `practice.spec.ts` (two tests), `journey.spec.ts`, `design.spec.ts`, `practicePage.ts`.
- Deleted: `SessionComplete.tsx`, `stats/sessionSummary.ts`, `stats/sessionSummary.test.ts`.

### Decisions

- **A sitting's time is everything played, not only what was logged.** The header counted a too-short tail while it was open, so the summary counts it too; otherwise the line would say less than the screen just did. A sitting is kept on its total, which reaches the minimum only if a session was logged (a session is dropped only on leaving the loop, which ends the sitting).
- **"Opened at" and "left at" are the loop's speeds at those two moments,** not the first and last session's. A loop opened at 100%, practised at 80% and taken back to 100% reads "100%" (the journey spec does exactly this).
- **One line per loop:** a loop gone back to in the same visit is added up, first speed to last.
- **The jam page records sittings too** (a loop played from its panel, left by Exit loop, another loop or the screen). The bullet says "one line per loop practised in that visit", and leaving them out would make the summary depend on which screen the loop was played on.
- **The summary is recorded in a layout effect's cleanup,** so it is in the overview's first painted frame. In the tracker's passive cleanup it would land a frame late and push the loops down.
- **The streak counts the sitting's day before its session reaches the cache** (the unmount's log is still on its way when the overview shows), so it never reads a day short and then corrects itself. A badge waits for the session itself.
- **Store rules:** another song's overview forgets this song's sittings (as the task asked); sign-out doesn't clear it (names and numbers only, and a reload does).
- The loop's name on the overview was a 39 px wide target for a short name ("Verse"); it has `min-w-touch` now, found by the design audit this change touches.

### Async windows and inputs

- **A session's log in flight at a pause** (the mutation). Play again, a nudge, a loop key, leaving: all as before; nothing now waits for the answer. The sitting already has the session's time (added when the tracker ended it, not when the server answered), so a refused log still counts as played.
- **Between the layout cleanup that records a sitting and the tracker's passive effect** (one commit). No input can arrive. On a loop switch the cleanup reads the tally of the loop being left, then the tracker's effect resets it for the new loop; the recorder ignores a tally that is for another loop than the one it was set up for.
- **The overview's sessions and loops reads.** The summary's lines are there meanwhile; Dismiss works and empties the store; a read that fails leaves the streak line empty; a read that lands later fills it. The unmount's session log landing adds the session to `sessionKeys.every` and the badges are worked out again.
- **The overview's unmount microtask.** A sitting recorded after an overview was left (the usual order: overview, practice, overview) is kept: the microtask ran long before. StrictMode's remount takes a new token, so the old microtask empties nothing.
- **bfcache.** `pagehide` ends the session but not the tally (it is fed the loop really open), so a page that comes back carries its sitting on.

### Known gaps

- Nothing sums up practice left by the nav tabs until that song's overview is opened, and another song's overview forgets it.
- Two tabs each have their own sittings (module state); nothing is shared, nothing is lost but the line.
- The streak line is one line high; a streak plus several badges on a 320 px phone wraps and grows it when it fills.
- A loop renamed on another device mid-sitting shows under the name this device last drew.

### Manual verify steps

1. Practise a loop for 40 s, pause: nothing appears, focus stays on Play, the header says 0:40. Play 20 s more, pause: 1:00.
2. Arrow to another loop: the header starts again at 0:00.
3. Back to the song: "Name: 1 min, 80% → 90%" for each loop, the streak; Dismiss removes it and focus is on New loop.
4. Practise again, back to the song (line shows), to Songs, back to the song: no line.
5. Open a loop, play 10 s, go back: no line.

### Checks

- `npm run check` green. e2e against the stack on 54421, port 4283, phone and desktop: `practice.spec.ts`, `journey.spec.ts` and `design.spec.ts` green (tablet not run).

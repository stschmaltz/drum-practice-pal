# Unit 14: Songs first and practice progress

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
- `AGENTS.md`: new "Songs first, practice screen and stats (from Unit 14)" section; the practice folder line.

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

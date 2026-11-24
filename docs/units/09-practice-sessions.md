# Unit 09: Practice sessions and progress

## Build

**Summary.** The app now remembers what was practiced. While a loop plays on the song page a tracker counts its play time and passes, and logs a session when playback stops with at least 30 seconds of play, or when the loop, the screen or the page is left. Each loop has a history (date, duration, speed, passes) and says when it was last practiced. A loop whose saved speed has reached its target asks "Mark finished?", and never finishes itself. Loops can be finished and reopened from the song page and from the home page, keeping their history. The home page (`/`, "On the go") lists the active loops, last practiced first, with song, current and target speed and last date, and a Finished tab beside it; "Practice" opens the song on that loop at its saved speed, ready for Play.

A migration bounds what a session can say (24 hours at most, a start no more than a day ahead) and limits the columns a client can insert.

Every line of the unit's Carried forward list is closed or decided (below), so the list is gone from `docs/plan.md`.

**Files**

- `supabase/migrations/20261123010000_session_sanity.sql` (new): `practice_sessions_duration_max` check (86400 s); a `before insert` trigger that refuses `started_at` more than a day ahead and sets `created_at` itself; the insert grant narrowed to `id, user_id, loop_id, started_at, duration_seconds, speed_ratio, repeats`. `npm run db:reset` and `npm run db:types` were run: `src/lib/database.types.ts` did not change (no new columns, tables or enums).
- `tests/db/session-sanity.test.ts` (new, 13 tests): both bounds at their edges, for the service role too; `created_at` can't be sent; the app's "on conflict do nothing" insert works under the column grant, through supabase-js and as the raw keepalive request, and a second send adds nothing; a deleted loop answers 23503; the home page's select with the embedded song; finish and reopen keep the history. `tests/db/loops-grants.test.ts`: its written-out `LOOP_SELECT` gained `finished_at`.
- `src/lib/schema.ts` (+ test): `SESSION_MAX_DURATION_SECONDS`, checked against the migration.
- `src/lib/keepaliveInsert.ts` (new, + test): one `keepalive` insert to PostgREST, "ignore duplicates". `src/lib/supabase.ts`: `supabaseRestConfig` for it. `src/lib/routes.ts`: `LOOP_PARAM`, `loopPracticePath`.
- `src/features/practice/` (new):
  - `sessionTracker.ts` + test (34 tests): the rules, as a reducer (`observe`, `countRepeat`, `trackerPhase`, `SESSION_MIN_PLAY_SECONDS`).
  - `sessions.ts` + test: columns, `sessionInsert`, `sortSessions`, `durationLabel`, `repeatsLabel`, `practiceDateLabel`, `practiceDayInSentence`, `lastPracticedLabel`, `practiceTimeLabel`, `totalPracticeSeconds`. A test checks the insert fields against the grant.
  - `sessionKeys.ts`, `sessionsApi.ts` + test (`fetchLoopSessions`, `logSession`, `logSessionOnExit`), `useSessions.ts` (`useLoopSessions`, `useLogSession`, `logSessionUnobserved`, `sessionLogged`).
  - `usePracticeTracker.ts` + test (17 tests): the song page's glue between the player, the tracker and the three ways of sending.
  - `debugPractice.ts`: `window.__drumPalMinSessionSeconds`, dev and e2e builds only.
  - `LoopHistory.tsx`, `OnTheGoPage.tsx` + test (12 tests).
- `src/features/loops/`:
  - `loopForm.ts` (+ test): `finished_at` in `LOOP_FIELDS` / `LOOP_SELECT`; `status` in `LOOP_EDIT_FIELDS` (the test now requires the list to equal the update grant); `NewLoop` without `status`; `hasReachedTarget`.
  - `practiceList.ts` + test (new): `PRACTICE_LOOP_SELECT`, `PracticeLoop`, `practiceTabFrom`, `practiceLoopsFor`. `loopKeys.ts`: `practice`. `loopsApi.ts`: `fetchPracticeLoops`.
  - `useLoops.ts` (+ tests): `usePracticeLoops`, `useSetLoopStatus`, `isStatusWriteOf`; every loop mutation now writes both loop caches (`setCachedLoops`, `setCachedLoop`); a deleted loop's history cache is removed.
  - `useLoopPractice.ts` (+ test): `openLoop`; "Restart loop" keeps the speed playing now.
  - `LoopStatusButton.tsx` (new): "Mark finished" / "Reopen", shared by the panel and the home page.
  - `LoopPanel.tsx` (+ tests): the "Mark finished?" prompt in the playing loop's card, a Finished section, History, the status button and "Last practiced …" on each item.
- `src/features/song/`: `SongPage.tsx` (+ 9 tests) runs the tracker, opens `?loop=`, and shows "Practice logged: …" or "Couldn't save your last practice session. Try again". `useRequestedLoop.ts` (new).
- `src/features/library/useSongs.ts` (+ test): a renamed song shows in the home page's list; a deleted song's loops leave it and cached histories are dropped.
- `src/App.tsx`, `src/features/shell/PlaceholderPages.tsx`: the placeholder home page is gone.
- `src/test/fakeSupabase.ts`: `upsert`, `supabaseRestConfig`. `src/test/loopTable.ts`: `finished_at`.
- `tests/e2e/practice.spec.ts` (new, 5 tests x 3 sizes).
- `AGENTS.md`: a "Practice sessions and progress" section, and three lines of the Loops section. `docs/plan.md`: Carried forward lists and two Human check rows.

**Carried forward items**

1. **Session sanity migration.** Done. The duration is a check constraint. The start time is a trigger, because its bound depends on `now()`; it applies to every role. The past is left open for Unit 11's queue. The tracker also caps what it sends at 24 hours.
2. **Leaving the page.** Logged on `visibilitychange` (hidden) and on `pagehide`, with a `keepalive` request built by hand: supabase-js can't send one, and awaits the session before fetching, which is too late in `pagehide`. Whichever event comes first ends the session; the other finds nothing to send. Run in Chromium by e2e (a navigation to `about:blank` mid-play leaves exactly one row).
3. **Client ids, no double logging.** The id is made when the session opens and kept through every send. Every send is "insert, on conflict do nothing", so a duplicate is not an error at all.
4. **Play time and repeats.** Only while the status is `playing` and the page is on show. A count-in (before the start, or before every repeat) is a gap, not an end. Repeats are `loopWrapped` events.
5. **Jam mode isn't logged.** Kept as accepted.
6. **Loop writes.** `status` is in `LOOP_EDIT_FIELDS`. A logged session invalidates `loopKeys.forUser` (and `songKeys.forUser`, for the library's "recently practiced"), each only when no write of that kind is pending.
7. **One tap into practice.** `/songs/:id?loop=<id>`, checked with `isUuid`, opens the loop with its saved speed through a new `openLoop` (not `selectLoop`, which leaves the speed alone and would have played the loop at 100%). It can't start playback.
8. **Which loop, which speed.** The tracker takes `practice.activeLoop?.id`; the session's speed is `snapshot.speedRatio` at its end; the prompt compares the saved speed with the target.
9. **Does a session end on exit, delete or re-range?** Exit loop and deleting the loop end it, playing or not: logged if it has 30 seconds, dropped if not (a deleted loop's session is refused by the foreign key and quietly dropped, since its history went with it). Editing the playing loop's bars does not end it: it is the same loop. Finishing it doesn't either.
10. **"Restart loop" and an unsaved speed.** Restart (`playLoop` on the loop already active) now keeps the speed playing. It goes back to the first bar and nothing else. Playing a loop after leaving it, or another loop, still sets the saved speed. This changes Unit 08's behaviour, and two of its tests were rewritten to say so.
11. **Counting passes.** From `loopWrapped`, as planned.

**Decisions**

- **A stop logs a session; a short one waits.** Pausing with 30 seconds or more of play logs at once and the next Play starts a new session. Under 30 seconds the time is kept and added to, so three 15-second goes are one session. Leaving the loop drops whatever is still under 30.
- **A hidden page is a stop.** Time with the page hidden doesn't count, whatever the player says. A phone that suspends the page with the player still "playing" would otherwise log the hours until it was opened again. The cost: on a laptop, switching tabs while a loop plays splits the session.
- **`started_at` is when the loop first sounded; `duration_seconds` is play time.** With pauses in between, start plus duration is earlier than the real end, so `last_practiced_at` (which the trigger works out as start plus duration) can be a little early. It is never late, which is what the ordering needs.
- **The tracker is a reducer fed from one effect.** "Play loop" on another loop sets that loop's saved speed and the new loop in one render; fed together, the tracker closes the old session with the old speed. Fed from the player's own subscription it would have seen the new speed first and logged it against the old loop.
- **Three ways to send, one row.** The hook's mutation while the screen is up (so a failure can be shown and retried); the same mutation run from the mutation cache as the screen unmounts (the hook's observer is being torn down, and would never be collected if used then); `keepalive` from a hidden or unloading page. A keepalive that fails on a page that lives on is sent again through the mutation.
- **A failed log is kept on the page**, with "Try again" sending the same record. Not across a reload: that is Unit 11's queue.
- **"Mark finished?" lives in the playing loop's card**, under "Save speed", which is where the target gets reached. "Not yet" is remembered for that loop at that saved speed for as long as the page is open; saving a faster speed asks again.
- **A finished loop is still a loop.** It stays playable and editable, listed under "Finished" in the song's panel. Finishing the loop that is playing doesn't stop it.
- **One owner of "this loop's status is being written", and of why it failed.** `useSetLoopStatus` reads both from the mutation cache, so the list's button, the prompt's and the home page's lock together. The error has to come from there too: finishing a loop moves its item to another list (or off the tab), which unmounts the button that was pressed, and a failure reported by that button's own mutation was never seen. Found in self-review, where the first tests passed only because the refusal landed before React had moved anything; they now hold the write first.
- **Finish and reopen are optimistic**, like other loop edits, and go through `useUpdateLoop`, which now writes the song's list and the home page's list together.
- **History is fetched when opened**, every page of it, and shows the latest ten with "Show all". Its speeds show BPM, from the tempo at the loop's first bar.
- **The home page shows percent, not BPM.** BPM is the ratio times the tempo at the loop's first bar, and that is in the file, not in a row. `songs.original_tempo` is bar 1's and would be wrong after a tempo change.
- **The home page's tabs are two toggle buttons**, with the tab in the URL (`?tab=finished`), and the counts on them. On the go: last practiced first, then never practiced, newest first. Finished: last finished first.
- **"Practice" is a link**, so it can be opened in a new tab and works with the back button; playback then needs Play on the song page.
- **The session notice is above the score**, not in the panel, which on a phone is a closed sheet while practising.
- **The insert grant is per column**, as for loops, and `created_at` is the server's.
- **`window.__drumPalMinSessionSeconds`** lets e2e and QA lower the 30 seconds, gated to dev and the e2e build like `window.__drumPalPlayer`. One e2e test plays a real minute at each size; the others use 2 seconds.

**Async windows and inputs**

| Window                                        | What can arrive                                         | What it does                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A session log in flight (mutation)            | Play again                                              | A new session with a new id opens; the two don't touch                                                                                                                   |
|                                               | The screen unmounts                                     | The request carries on; the caches are still updated (`sessionLogged` is on the mutation, not the component); the notice is never shown                                  |
|                                               | A loop write is pending when it lands                   | The loops refetch is left to that write's own settle                                                                                                                     |
|                                               | It fails                                                | The record joins `unsaved`; "Try again" sends the same id. Pressing it twice sends twice, and the second is a duplicate the database ignores                             |
|                                               | A second session's log while the first is in flight     | Each answers for itself (`mutateAsync` per record, not `mutate`'s latest-call-only callbacks)                                                                            |
| A keepalive log in flight                     | The page dies                                           | The browser finishes the request; nothing else runs                                                                                                                      |
|                                               | The page comes back                                     | On success the caches are updated and the notice shows; on failure the record goes through the mutation                                                                  |
|                                               | `pagehide` after `visibilitychange`, or the other order | The first ended the session; the second finds no open session                                                                                                            |
| A session open, under 30 s, paused            | Speed change                                            | It is the speed the next stretch plays at, and the session's if it ends                                                                                                  |
|                                               | Another loop, Exit loop, delete                         | Dropped                                                                                                                                                                  |
| A status write in flight (`useSetLoopStatus`) | A press on any status control of that loop              | Ignored, and the buttons are disabled: the optimistic row already reads "Reopen", and a second write could reach the server first                                        |
|                                               | "Save speed" or the edit form on the same loop          | Allowed. Each answer applies only its own fields while another write is pending (`applySavedLoopEdit`, which now covers `status`)                                        |
|                                               | It fails                                                | Only `status` goes back, and only if it still holds the optimistic value. The loop returns to its list under a new button, which shows the error from the mutation cache |
|                                               | "Not yet" on the prompt                                 | Hides the prompt; the write carries on                                                                                                                                   |
| The song page loading with `?loop=`           | The loops arrive before the score, or after             | The loop opens when both are in, once                                                                                                                                    |
|                                               | Play pressed first                                      | Jam mode starts; the loop then opens under it (range and speed change live, playback carries on)                                                                         |
|                                               | Exit loop, then a refetch                               | It stays closed: the id was marked handled before the list was looked at                                                                                                 |
| "Play loop" on B while A plays                | The tracker's effect                                    | Sees B and B's speed together, and closes A with A's last speed                                                                                                          |
| The tracker between renders                   | `loopWrapped`                                           | Counted at once, on the ref, not through React state                                                                                                                     |
| Effects run twice (StrictMode)                |                                                         | The unmount path ends "the open session", and none is open at mount. The listeners are set up once and reach the current `sync` through a ref                            |

**Known gaps**

- Nothing has been tried on a real phone. `pagehide`, `visibilitychange` and `keepalive` ran in Chromium only; iOS Safari and an installed PWA are the cases this was written for. See Human checks.
- A log that fails as the screen unmounts or after the page has gone is lost, and so is an unsaved one on reload (Unit 11).
- A device whose clock is more than a day ahead has every session refused, and "Try again" can't succeed (Unit 11 line).
- A laptop tab switch splits a session; several stops in one sitting are several history rows (Unit 13 line).
- "One tap into practice" is one tap and then Play.
- If "before every repeat" can't count in (no usable tempo or meter for the bar), the service plays on at once and the engine's "stopped" between passes reads as a stop, so a session would be logged at every pass. No fixture has such a bar.
- `last_practiced_at` can be early by the length of the pauses inside a session.
- On a phone, a loop opened from the home page already at its target has its "Mark finished?" inside the closed sheet (Unit 12 line).
- A loop item has five buttons; the home page and the notices are unstyled beyond the shared classes (Unit 12).
- Finish and reopen failures show the server's message, as other loop writes do (Unit 13).
- No test covers two devices finishing and reopening the same loop at once; the server keeps the last write.
- `LoopHistory` and `useRequestedLoop` have no test files of their own; they are covered through `LoopPanel.test.tsx` and `SongPage.test.tsx`. `useSessions.ts` is covered through the tracker's tests.

**Manual verify**

1. `npm run db:start`, `npm run db:reset` (the new migration), `npm run dev`, sign in as `demo@drumpal.test` (the code is in Mailpit, http://127.0.0.1:54324).
2. The home page lists the seeded loops, last practiced first, each with its song, speed, target and last date. The Finished tab has the seeded finished loop; the address reads `?tab=finished`.
3. Press "Practice" on a loop: its song opens with "Looping …" above the score at the loop's saved speed, not playing. Press Play.
4. Let it play for a little over 30 seconds and press Pause: "Practice logged: 3x s of … at …%" appears above the score. In the loop panel, History on that loop shows the session, and the item says "Last practiced today".
5. Play for 10 seconds and pause: nothing is logged. Play 25 more and pause: one session of about 35 seconds.
6. While playing, press "Play loop" on another loop after 30 seconds: the first loop gets a session at its own speed.
7. Give a loop a target of 90, set the speed to 90% and press "Save speed": "Mark finished?" appears. "Not yet" hides it. Nudge to 91%, save: it asks again. "Mark finished": the loop moves under "Finished" in the panel and keeps playing.
8. Go to On the go: the loop is under Finished. "Reopen" brings it back to On the go, with its history.
9. Play a loop for 30 seconds and close the tab. Sign in again: the loop has the session.
10. In Studio, `insert into practice_sessions` with `duration_seconds = 86401`, or a `started_at` two days ahead: both refused.

**Human checks**

- Phone at the kit: practise a loop for a minute and pause. "Practice logged" shows, and History has one row with the right duration, speed and passes.
- iPhone, Safari and installed: mid-practice, lock the phone; switch apps; close the tab. Each should leave one session, with no pocket time in it. This is the path no test here can run.
- With "before every repeat" on: one session for the sitting, its duration the play time without the count-ins.
- The home page on the phone: the order after practising two loops; "Practice" into a loop and whether song-then-Play is quick enough; Mark finished and Reopen between the tabs.
- Laptop: switch tabs while a loop plays and come back. Two sessions are expected; say whether that is wrong for how you practise.

**Results**

- `npm run check`: green. 83 test files, 3299 tests (76 files and 3120 tests before this unit).
- `npm run test:db`: green. 6 files, 198 tests (13 new).
- `npm run e2e`: green. 309 tests: 295 passed, 14 skipped (the size-specific skips from earlier units; none in `practice.spec.ts`). The 15 new tests are 5 at each of phone, tablet and desktop; the one that plays a real minute takes about 65 s and sets the suite's length at about 3 minutes. Three of the new tests also ran twice more each with `--repeat-each 2` (18 passed).
- Nothing was heard, and nothing ran outside Chromium.

## Test

**Summary.** The Build stage's tests already proved the tracker's rules, the three ways a session is sent, the history, the prompt, finish and reopen, the home page and the main flows in a browser. This stage read them against the plan's bullets and the checklist, then filled what was missing: the cache side of a logged session (`useSessions.ts` had no test file), the async windows in the Build's table that no test held open, the song page's real wiring for "Play loop on another loop", the other orders of the `?loop=` load, and three browser flows (a lost answer and its retry, a hidden page, a count-in before every repeat). 52 unit and component tests, 9 database tests and 3 e2e tests (x 3 sizes) were added. One bug was found and fixed (three lines); no other app code changed, test ids included.

**Bugs found**

1. **"Mark finished?" was never asked when the speed showed the target's percent but its ratio was a hair under. Fixed. Severity: medium (the unit's own prompt silently missing in a common case).** A speed typed as a BPM is stored as a fine ratio; the target field holds whole percents. Repro before the fix: Groove 120, a loop with target 71; type BPM 85 in the loop's speed (0.708333) and press "Save speed". The loop's line reads "71% (85 BPM) · target 71% (85 BPM)" and no question comes, however often it is saved. `hasReachedTarget` (`src/features/loops/loopForm.ts`) compared the stored ratios. It now compares the whole percents the line shows (`ratioToPercent` of each). The Build's table row "a hair under such a target is false" (0.855555 against 0.855556, both shown as 86%) was changed to true with it, and rows were added for both sides of the rounding. Checklist row 4 (rounded for display).

Looked at and left, none of them new issues: a clock set back in the middle of a stretch loses that stretch (the Build's test pins it; the time isn't knowable); a short session is dropped by `pagehide` even if the page later returns from the back/forward cache (leaving drops a short session, by the Build's rule); an insert whose id is another user's session answers "no error, no row", which the app reads as logged (a UUID collision; nothing of the other user's row is changed or told).

**Tests added**

| File                                                | Tests    | What they prove                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/practice/sessionTracker.test.ts`      | +6 (40)  | Ten 3-second goes with rests are one session of 30 s and ten passes, logged at the tenth stop; leaving the loop (for another, or for the whole song) logs at exactly 30 s and not at 29.999; a session dropped for being short takes its passes with it; a change of speed neither ends the session nor restarts its stretch; the speed logged is the exact ratio                                                                                                                                                                                                                                                                                 |
| `src/features/practice/useSessions.test.tsx` (new)  | 13       | `sessionLogged`: the session heads its loop's cached history as the row will read back, once however often it is told, and no history cache is made for a loop never opened; it invalidates that history, every loop list and the songs, and nothing of another loop or account; with a loop write pending the loops are left alone, with a song write pending the songs are. `useLogSession`: caches updated on success, untouched for a deleted loop and for a failure, and still updated when the screen that sent it has gone. `logSessionUnobserved` never rejects                                                                           |
| `src/features/practice/usePracticeTracker.test.tsx` | +11 (28) | While a log is in flight: Play again opens a session with its own id and each log answers for itself (the later fails, the earlier lands); leaving the screen lets it finish and the caches hear of it, with nothing sent twice; "Try again" pressed twice sends the same id twice and keeps the session once. A keepalive on a page that lives on: the caches are told; a deleted loop is dropped quietly; any other refusal goes through the app, and a second failure is kept. `pagehide` then `pageshow`: a new session, none of the hour between. StrictMode: nothing at mount, each pass counted once, one keepalive, one log on unmount    |
| `src/features/song/SongPage.test.tsx`               | +9 (80)  | On the real page: "Play loop" on another loop logs the first at its own speed (0.8, not the next loop's 0.6) and the second from the switch; finishing the playing loop, and changing its bars, don't end its session (one session of the whole 40 s); deleting it mid-practice sends the session, gets the foreign key answer and shows nothing; two unsaved sessions are counted and "Try again" sends each under its own id. `?loop=`: the loops arriving after the score, the loops already cached before the player exists, Play pressed before the loops (the loop opens under the playing song with no pause or stop), and a finished loop |
| `src/features/loops/LoopPanel.test.tsx`             | +5 (56)  | The prompt asks at "71% · target 71%" (bug 1); while the prompt's "Mark finished" is in flight the list's button is disabled and a press sends nothing, and another loop's button is free; "Save speed" answered first with a row from before the finish leaves the loop under Finished (two writes to one item); finish and reopen send `status` alone, so a finer target and speed survive (round trip); a history on show stays when a later read of it fails                                                                                                                                                                                  |
| `src/features/loops/loopForm.test.ts`               | +4 (86)  | `hasReachedTarget` on what is shown: both sides of the rounding, for a whole-percent and a finer target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/features/practice/OnTheGoPage.test.tsx`        | +4 (16)  | A loop practiced since moves to the top on the next read; the list stays when a later read fails (after proving the read did fail); the tab pressed goes into the address and the first tab leaves it clean; reopening the last finished loop stays on the Finished tab                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/db/session-sanity.test.ts`                   | +9 (22)  | The keepalive request as the app builds it: a deleted loop is refused with `23503` in the body (where `keepaliveInsert` reads it), and a start days ahead is refused, not skipped as a duplicate. An id that is another user's session: no error, no row, their row unchanged. A wrong clock moves a loop at most two days ahead, and an honest session afterwards doesn't move it back but is in the history. The history's own select and order: newest first, exact ratio, nothing of another loop or user. Deleting a loop takes its history                                                                                                  |
| `tests/e2e/practice.spec.ts`                        | +3 (8)   | Below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

New e2e tests, each at phone, tablet and desktop:

- **A lost answer.** The first session insert reaches the database and its response is dropped (`route.fetch()` then `route.abort()`). The page says "Couldn't save your last practice session" while the row is already there; "Try again" sends the same id, the notice turns to "Practice logged", the database still has one row and the loop's history lists one session.
- **A hidden page.** Mid-practice the page is hidden while the player still says playing. One row arrives, sent with `keepalive: true` (read from a wrapped `fetch`). Five seconds hidden add nothing. Shown again, the page says "Practice logged" (it lived to hear the answer), and three more seconds then Pause make a second session of about three seconds, started after the hidden time, sent without keepalive.
- **A count-in before every repeat.** Bars 1 to 2 with a one-bar count-in before each pass, paused a second into the third pass: one session, 2 passes, at least 7 s and at least 4 s less than the wall time (three count-ins left out). With the minimum lowered to 2 s, a tracker that took each pass's stop for a stop would have logged two.

**Acceptance and plan bullets**

| Criterion or bullet                                                                     | Proved by                                                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A minute of practice creates one session with the right speed and duration              | e2e (a real minute, each size); `SongPage.test.tsx`; `usePracticeTracker.test.tsx`; `sessionTracker.test.ts`                          |
| Finish and reopen move the loop between tabs                                            | e2e; `OnTheGoPage.test.tsx`; `LoopPanel.test.tsx`; `tests/db` (`finished_at` follows, history kept)                                   |
| Play time excludes count-ins, pauses and a hidden page; passes from `loopWrapped`       | Tracker and hook tests; e2e "count-in before every repeat" and "hidden page" (new)                                                    |
| Logs on stop after 30+ seconds; shorter goes add up                                     | Tracker boundaries at a stop and on leaving (new); e2e "a short go"; ten short goes (new)                                             |
| Logs on leaving the page; `last_practiced_at` moves                                     | e2e (navigation away, in-app navigation, hidden page); hook tests for `pagehide`, `visibilitychange`, `pageshow`, unmount; `tests/db` |
| No duplicate on retry                                                                   | e2e "a lost answer" (new); `tests/db` (upsert and raw keepalive sent twice); hook tests (same id on every send)                       |
| Loop history: date, duration, speed                                                     | `LoopPanel.test.tsx` history; `tests/db` history read (new); e2e                                                                      |
| Hitting target prompts "Mark finished?", never finishes by itself                       | `LoopPanel.test.tsx`; `loopForm.test.ts` (bug 1); e2e                                                                                 |
| Home: active loops by last practiced, song, speeds, last date; Finished tab; one tap in | `OnTheGoPage.test.tsx`; `practiceList.test.ts`; e2e; `SongPage.test.tsx` `?loop=` in every load order (new)                           |
| Session sanity migration and grants                                                     | `tests/db/session-sanity.test.ts`                                                                                                     |

**Checklist rows, and the Build's "Async windows" table**

| Window or row                                             | Test                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Log in flight: Play again; a second log; it fails         | `usePracticeTracker.test.tsx` "while a session log is on its way" (new)                                                                                                    |
| Log in flight: the screen unmounts                        | Same describe, and `useSessions.test.tsx` "when the screen that sent it has gone" (new)                                                                                    |
| Log lands while a loop (or song) write is pending         | `useSessions.test.tsx` (new)                                                                                                                                               |
| "Try again" pressed twice                                 | `usePracticeTracker.test.tsx` (new)                                                                                                                                        |
| Keepalive in flight: the page comes back, each answer     | "a keepalive log on a page that lives on" (new) and the Build's two                                                                                                        |
| `pagehide` and `visibilitychange` in either order         | The Build's test; `pageshow` afterwards (new)                                                                                                                              |
| Under 30 s and paused: speed change; another loop; delete | The Build's tracker tests; passes dropped with the session (new)                                                                                                           |
| Status write in flight: a press on another control        | The Build's hook test; in the panel, prompt against list (new)                                                                                                             |
| Status write in flight: "Save speed" on the same loop     | `LoopPanel.test.tsx` (new), with the stale row really answered first                                                                                                       |
| Status write fails after its control has gone             | The Build's tests in the panel and on the home page                                                                                                                        |
| "Not yet" during a status write                           | Not reachable: the optimistic finish takes the prompt away before "Not yet" can be pressed. The Build's refused-write test covers the prompt coming back                   |
| `?loop=`: loops before the score, after it, Play first    | `SongPage.test.tsx` (new); exit then refetch is the Build's                                                                                                                |
| "Play loop" on B while A plays                            | `SongPage.test.tsx` through the real panel and player (new); the Build's hook test feeds it by props                                                                       |
| `loopWrapped` between renders; effects run twice          | StrictMode describe (new)                                                                                                                                                  |
| Gates                                                     | Status buttons disabled for as long as their action would be ignored (above); "Play loop" on `isLoaded` is Unit 08's                                                       |
| Gestures                                                  | The unit added none                                                                                                                                                        |
| Round trips                                               | Status sent alone, a finer target kept (new); the session's speed is the exact ratio in the tracker, the API, the database and the history's read (new); bug 1             |
| Validated paths                                           | `?loop=` only through `isUuid` (the Build's table of bad values); the keepalive path is bound by the same checks as supabase-js (`tests/db`, new)                          |
| A window the table missed                                 | The loops cached before the player exists (a second visit to the song): the loop must wait for the player, which takes its saved speed. It does; `SongPage.test.tsx` (new) |

**Checked against broken code**

Each new unit and component test was run against the code with its subject broken, by a script that makes one change, runs the tests that should notice and restores the file: 31 changes, among them the next loop's speed logged on leaving, the stretch restarted by a speed change, `>` for `>=` on leaving, short sessions not kept, both "write pending" guards removed, history duplicates, the `loopWrapped` listener never unsubscribed, the keepalive's three answers each mishandled, no `pageshow` listener, `mutate` callbacks for the promise, the `?loop=` effect running before the loops and before the player, the tracker keyed by more than the loop id, `isError` for `isLoadingError` twice, a save's answer taken whole, the status button never disabled, the status write sending more than the status, and the target compared by ratio. Every change failed at least one new test. Two tests passed the first time round and were tightened: the home page's "later read fails" (it asserted before the failure was drawn; it now checks the query's state is `error` first) and the `?loop=` order with the loops in first (the fake player exists before the loops in every other test; it now seeds the cache). The three e2e flows were run on the desktop project against a build with a fresh id on every send, the hidden page not treated as stopped, and a count-in ending a session: all three failed.

The new database tests describe the database as it is; they were not run against a database without the migration.

**Results**

- `npm run check`: green. 84 test files, 3351 tests (83 and 3299 after Build).
- `npm run test:db`: green. 6 files, 205 tests (9 new; the files held 196 after Build by this stage's count, where the Build note says 198).
- `npm run e2e`: green. 318 tests: 304 passed, 14 skipped (the size-specific skips of earlier units). The new flows take about 5, 14 and 19 s each; the suite still takes about 3 minutes.
- Nothing was heard, and nothing ran outside Chromium. The Build's Human checks stand as written; the hidden-page flow here is a simulated `visibilitychange`, not a locked phone.

**Open issues**

None handed on. `docs/plan.md` is unchanged by this stage.

## QA

**Verdict: PASS.** Both acceptance criteria and every bullet of the unit hold at 390x844, 820x1180 and 1440x900. No blocker and no major issue. Seven issues, all minor or cosmetic; issue 1 is small and worth fixing in Review. No app code was changed by this stage.

**How it was run.** The e2e build (`npm run build -- --mode development`, `npm run preview`) against local Supabase, driven by throwaway Playwright scripts at the three sizes (the e2e projects, so phone and tablet are touch). The scripts are not kept; the 139 screenshots are in `docs/units/09-shots/` as `<size>-NN-name.png`. The walk used the real 30 seconds; the edge cases lowered it to 2 s with `window.__drumPalMinSessionSeconds`. A second device was a second browser context, or the service role changing rows. Nothing was heard, and everything ran on Chromium.

**Acceptance criteria and bullets**

| Criterion or bullet                                                         | Phone | Tablet | Desktop | What was seen                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------- | ----- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A minute of practice creates one session with the right speed and duration  | Pass  | Pass   | Pass    | The e2e test plays a real minute. Here: 27.5 s then pause logs nothing; 4 s more logs one row of 32 s at 0.8 with 4 passes (31.6 s waited). 31 s in one go with the speed changed to 85% after 10 s: one row of 31 s at 0.85. Shots 02, 03, 05                                        |
| Finish and reopen move the loop between tabs                                | Pass  | Pass   | Pass    | From the prompt, from the panel's button and from the home page; `finished_at` set and cleared; both sessions kept. Shots 08 to 12                                                                                                                                                    |
| Tracker: play time and passes; logs on stop after 30+ s or on leaving       | Pass  | Pass   | Pass    | Reload, back button, closing the tab (with and without unload handlers), in-app navigation, sign-out and a hidden page each left exactly one row. Hidden for 4 s in the middle of a 5 s minimum: one row of 6 s, not 10                                                               |
| Updates `last_practiced_at`                                                 | Pass  | Pass   | Pass    | "Last practiced today" in the panel at once and on the home page; the practiced loop leads the list, on a second device after a reload too                                                                                                                                            |
| Loop history: date, duration, speed                                         | Pass  | Pass   | Pass    | "Today, 5:57 PM · 32 s · 80% (72 BPM) · 4 passes". 1,100 sessions (three pages): "1100 sessions · 13 h 45 min in all" in about 0.5 s, ten shown, "Show all" lists 1,100. Shots 04, 44                                                                                                 |
| Hitting the target prompts "Mark finished?", never finishes by itself       | Pass  | Pass   | Pass    | By percent, by a typed BPM (85 BPM is 0.708333 against a target of 0.71), by passing the target, and on arrival from the home page already past it. The loop stayed `active` until the button. "Not yet" hides it; a faster saved speed asks again. Shots 06, 07, 24                  |
| Finish and reopen; history kept                                             | Pass  | Pass   | Pass    | Finishing the playing loop doesn't stop it or end its session. A finished loop is still playable, and a reopened loop still at its target asks again                                                                                                                                  |
| Home: active loops by last practiced, song, speeds, last date; Finished tab | Pass  | Pass   | Pass    | 605 loops (two pages): "On the go (560)", "Finished (45)", the 60 practiced ones in order ("today", "yesterday", "2 days ago" … "Nov 16" … "Oct 19, 2025"), then the unpracticed. No sideways overflow at 390 or 320 px with unbreakable names; every control 44 px. Shots 40, 61, 62 |
| One tap into practice                                                       | Pass  | Pass   | Pass    | "Practice" opens the song on the loop at its saved speed and first bar, paused. See issue 1 for the stale-cache case                                                                                                                                                                  |
| Session sanity migration                                                    | Pass  |        |         | `npm run test:db`: 205 passed                                                                                                                                                                                                                                                         |

**QA focus and the cases asked for**

| Case                                      | Result                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Closing mid-session                       | Reload, back, tab closed, navigation, sign-out: one row each, none doubled                                                                                                                                                                                                                                                       |
| Speed changes mid-session                 | The session carries on and logs the speed at its end; a nudge then "Restart loop" keeps the nudged speed (85%, logged as 0.85), playing or paused; leaving the loop and playing it again puts the saved 80% back                                                                                                                 |
| Many loops                                | 605 loops and 1,160 sessions: home in 0.1 to 0.3 s, tab switch under 0.3 s, the song's panel of 605 items in under 0.5 s, a session still logs and its loop moves to the top                                                                                                                                                     |
| Just under and over 30 s                  | 27.5 s nothing; 31.6 s over two goes one row; 31.0 s one row                                                                                                                                                                                                                                                                     |
| Switching the playing loop                | The first loop is logged at its own speed (0.8, not the next loop's 0.6); playback never stops                                                                                                                                                                                                                                   |
| Re-ranging and finishing the playing loop | Neither ends the session: one row of the whole stretch                                                                                                                                                                                                                                                                           |
| Deleting the playing loop                 | Playback carries on in the whole song, no error, no orphan row. Issue 4                                                                                                                                                                                                                                                          |
| Exit loop while playing                   | Logged; the jam time after it is not                                                                                                                                                                                                                                                                                             |
| 21 fast Play/Pause presses                | No error and no doubled row (the short stretches never reached the 2 s minimum); button and player agree                                                                                                                                                                                                                         |
| `?loop=` bad values                       | `not-an-id`, empty, a script tag, an unknown uuid, another user's loop, a loop deleted since, two parameters (the first wins): the whole song at 100%, no error, nothing echoed. A finished loop opens. Exit loop keeps it closed; back and forward open it again. A wrong song id: "Song not found"                             |
| A second device                           | A session and a finish made on one show on the other after its next read. A stale "Reopen" pressed on both is one active loop. A loop deleted elsewhere while playing here: its session is dropped quietly (issue 7). "Practice" into a song deleted elsewhere: "Song not found"                                                 |
| Failed session writes                     | 503: "Couldn't save your last practice session." with "Try again"; a second failure: "your last 2 practice sessions"; once the server answers, one press saves both, two rows. Shots 30 to 32                                                                                                                                    |
| Slow network                              | A 4 s log with Play and Pause again meanwhile: both land, each once. Leaving the screen with a log in flight: it lands                                                                                                                                                                                                           |
| Offline                                   | Pausing offline shows nothing (the log waits) and both waiting sessions are sent on reconnect; a reload while offline loses them. Offline and hidden: the keepalive fails, the app's own request takes over and lands on reconnect. Finish offline moves the loop at once and is sent on reconnect. All known, on Unit 11's list |
| Home page states                          | "Loading your loops…", "Couldn't load your loops." with "Try again", both empty tabs, `?tab=` junk falls back to On the go and is not echoed. Shots 09, 11, 60, 65                                                                                                                                                               |
| Status writes                             | A double click sends one PATCH; "Reopen" is disabled while the finish is in flight; a refused write puts the loop back with "Couldn't change the loop: …". Shots 63, 64                                                                                                                                                          |

**Issues**

1. **"Practice" opens the whole song, or the old speed, when this device's cached loop list for the song is stale. Minor.** `useRequestedLoop` settles `?loop=` against the list in the cache as soon as the score is in, and marks the id handled before it looks.
   - Repro A: on device 1 open a song (its loops are now cached) and go to On the go. On device 2 save a new loop in that song. On device 1, more than 30 s later, leave the home page and come back (it reads the list again and shows the new loop), then press its "Practice". The song opens with no "Looping …" line, at 100%, bar 1; the panel lists the new loop a moment later. Play plays the whole song and logs nothing. Shots 70, 71.
   - Repro B: the same, but device 2 changes the loop's speed (100% to 90%) and bars. The home page says "Bars 5 to 6 · 90%"; "Practice" opens bars 5 to 6 (the range follows the refetch) at 100%. Shot 72.
   - It needs a second device and a visit to the song on this one within the cache's five minutes, so it is rare today. Unit 11 persists the cache, which makes every cold start this case. A few lines: wait for a list fetched since the page opened, or mark the id handled only when it is found or the list is fresh. Carried to Unit 11 in case Review leaves it.
2. **Offline, a session that ended shows nothing, and a reload loses it. Minor, known.** No notice and no error until the connection is back, when it is sent and "Practice logged" appears. Already on Unit 11's list (09 Build); confirmed here.
3. **A refused "Mark finished" pressed in the prompt shows its error twice. Cosmetic.** "Couldn't mark the loop finished: boom" in the prompt and "Couldn't change the loop: boom" under the loop's item, both from the one failed write. Shot 25. Unit 12.
4. **"Practice logged: 6 s at 60%." stays after its loop is deleted. Cosmetic.** Delete a loop whose session was the last one logged: the line loses the loop's name and stays, though that history is gone. Shot 22. Unit 12.
5. **"Mark finished" and "Reopen" drop focus to `<body>`. Minor.** The pressed button leaves with its item (the home page's tab, the panel's section), so a keyboard user starts again from the top. Unit 10, with the loop form's focus line.
6. **Many loops are one long page. Minor.** 560 active loops make the home page 115,000 px tall, with no grouping by song, search or paging; the panel is the same. Fast enough (above). Shots 40, 41, 43. Unit 12.
7. **A loop deleted on another device stays "Looping …" here after its session is dropped. Minor.** The `loopGone` answer doesn't make the page read its loops again. Shot 51. Added to Unit 13's line on loops deleted elsewhere.

Seen and left as designed: after "Not yet", lowering the target under the current speed doesn't ask again (the answer is kept for that loop at that saved speed), and a reload asks again; "Last practiced" for a 24-hour session started three days ago reads "2 days ago" (start plus duration).

**Fixed by this stage.** Nothing. No issue was cosmetic in the sense of a class or a word; 3 and 4 need a decision about which line shows.

**Human checks for Shane** (the two Unit 09 rows of Open human checks in `docs/plan.md`, unchanged)

- Phone at the kit: practise a loop for a minute and pause; "Practice logged" and the loop's History (duration, speed, passes).
- iPhone, Safari and installed: mid-practice, lock the phone, switch apps, close the tab. Each should leave one session with no pocket time in it. `pagehide`, `visibilitychange` and `keepalive` ran on Chromium only, and a hidden page here was simulated.
- With "before every repeat" on: one session for the sitting, its play time without the count-ins.
- Home page on the phone: the order after practising two loops; "Practice" then Play (quick enough?); Mark finished and Reopen between the tabs.
- Laptop: switch tabs while a loop plays and come back. Two sessions are expected; say whether that is wrong.
- Two devices: save a loop on the laptop, then press its "Practice" on a phone that had the song open a minute before (issue 1).

**Results**

- `npm run check`: green. 84 test files, 3351 tests.
- `npm run e2e`: green. 318 tests: 304 passed, 14 skipped (the size-specific skips of earlier units), 3.1 minutes.
- `npm run test:db`: green. 6 files, 205 tests.

## Readability

No behaviour changed: the app's markup, classes, copy, queries, requests and player calls are what they were, the migration is untouched, and no test was added, removed or weakened (the counts below are the same before and after). The Build stage's app code was already in small modules, so most of the work was in the tests of three stages, where the same steps had been written out many times.

**App code**

- `sessionTracker.ts`: `observe` reassigned its `state` parameter and carried a mutable `ended` through four branches. It is now straight-line: the "left the loop" branch returns at once, opening a session is `sessionOpenedBy(input, newId)`, and "log it if it has enough play time" is `recordIfLongEnough`, which the leaving branch and the stop branch had each spelled out. Same inputs, same steps; its 40 tests pass unchanged.
- `usePracticeTracker.ts`: `send` held the keepalive path and its three answers inline between two early returns. That path is `sendOnExit(record, token)`, and `send` is one three-way choice by `via`.
- `src/components/LoadErrorAlert.tsx` (new): the "Couldn't load … / Try again" block for a failed first load. The unit added its third and fourth copies (`OnTheGoPage`, `LoopHistory`) beside `LoopPanel`'s; `LibraryPage` and `SettingsPage` had the same block from Units 03 and 04. All five use the component, which renders the same elements and classes (`compact` is the history's smaller text and gap).
- `OnTheGoPage.tsx`: the two tab buttons are `PracticeTabButtons`, beside `PracticeLoopList` and `PracticeLoopItem`.
- `src/features/shell/PlaceholderPages.tsx` is `NotFoundPage.tsx`: this unit replaced the last placeholder, and `NotFoundPage` was all the file had left.
- Import order in `App.tsx` and `useLoops.ts` (the `practice` imports had gone in after the relative ones).

**Test helpers**

- `src/test/render.tsx`: `settle()`, the "let what is under way finish and be drawn, then assert nothing changed" wait that five tests in four files had each written as an `act` around a 20 ms timeout.
- `usePracticeTracker.test.tsx`: the view from `renderTracker` has `playOn(seconds)` (15 uses of play-then-move-the-clock), `loopBars5To8()`, `finishPasses(count)`, `tracker()` for `hook.result.current` (29 uses), and `cacheEmptyHistory()` / `cachedHistory()` / `isInvalidated(key)`. The file has `firePageEvent('pagehide' | 'pageshow')` (8 uses) and one `offline` answer (8 uses).
- `SongPage.test.tsx`, "practice sessions": four tests and `playVerseFor` each rendered the page, pressed "Play loop Verse" and fired the engine's report by hand, though `startVerse` existed for the later tests. `startVerse()` is now the one way in (after `serve`, so a test can change how session logs are answered first), with `pause()` and `resume()`; `later(seconds)` moves the clock; `failSessionLogs()` is the "refuse session logs until told otherwise" mock two tests had built. The "two unsaved sessions" test reads as its steps, not as a loop over `[40, 50]` with an `if` inside.
- `LoopPanel.test.tsx`: `savedLate(view)` for the table's row (5 uses).
- `tests/db/session-sanity.test.ts`: the raw keepalive request was written out twice, once inline and once as `keepaliveAs` inside a describe; `keepaliveAs` and `upsertAsApp` are at the top and every test uses them. Setup inserts and deletes that only threw on error are `insertSession(user, row)` (new, in `tests/db/helpers.ts` beside `insertSong` and `insertLoop`) and `deleteLoop(user, loopId)`.
- e2e: `tests/e2e/practicePage.ts` (new) has the unit's locators and steps, as `loopsPage.ts` and `playerPage.ts` do for theirs: `sessionsOf`, `loopsOf`, `sessionCount(user).toBe(n)` (8 polls of the database), `sessionLogged`, `navLink`, `homeTab` / `homeList` / `homeItem`, `openLoopHistory`, `shortSessions`, `playFor`, `playOn` (3 copies of Play, wait for Pause, wait), `recordSentSessions` / `sentSessions`, `setPageVisibility`. `saveLoopSpeed(page, percent)` is in `loopsPage.ts` (3 copies). `practice.spec.ts` is the eight tests and nothing else; each poll keeps the timeout it had.

**AGENTS.md**

`LoadErrorAlert` in the shared UI line; `settle()` and when it is the right wait; `practicePage.ts` and what it holds; `insertSession`; the tracker view's and the song page's step helpers. Two lines that pointed at `practice.spec.ts` for a helper now point at `practicePage.ts`.

**Left as it was**

- `sessionInsert` and `sessionFromRecord` in `sessions.ts` map the same six fields. Building one from the other would reorder the keys of the keepalive request's JSON body: harmless, but not nothing.
- `LoopList` in `LoopPanel.tsx` builds both of its lists with an inner `items(listed)` closure. As a component it would take the panel's six props again; the closure is shorter.
- The session fixtures (`record`, `session(id)`, `earlier`) are defined per test file in `sessions.test.ts`, `sessionsApi.test.ts`, `useSessions.test.tsx`, `keepaliveInsert.test.ts` and `LoopPanel.test.tsx`. Each file asserts on its own values, so a shared builder would be called with every field overridden. `ok` / `fail` stay per file too, as in every unit so far.
- `OnTheGoPage.test.tsx`'s own small loops table (`serve`) is not `loopTable.ts`: it answers with the embedded song and sets `finished_at`, which the shared table doesn't.
- `tests/db/constraints.test.ts` and `loops-grants.test.ts` (Units 02 and 08) have setup inserts of sessions that don't check `error`. They could use `insertSession`; left for Review, since a setup insert that turns out to be failing there is a finding, not a tidy-up.
- `PRACTICE_LOOP_SELECT` and `SESSION_SELECT` are written out again in `tests/db/session-sanity.test.ts` (the database test config has no `@/` alias); the comments there say so.
- The migration, and every issue in the QA section. Issue 1 (`useRequestedLoop` settling `?loop=` against a stale list) is behaviour; it is Review's.

**Results**

|                   | Before                             | After                              |
| ----------------- | ---------------------------------- | ---------------------------------- |
| `npm run check`   | green, 84 files, 3351 tests        | green, 84 files, 3351 tests        |
| `npm run test:db` | green, 6 files, 205 tests          | green, 6 files, 205 tests          |
| `npm run e2e`     | green, 318: 304 passed, 14 skipped | green, 318: 304 passed, 14 skipped |

Nothing was heard, and nothing ran outside Chromium.

## Review

`git diff main...HEAD` was read line by line (app code, migration, db tests, e2e, hook and component tests, helpers, docs; not the screenshots), except `sessionTracker.test.ts`, `sessions.test.ts` and `OnTheGoPage.test.tsx`, where only the test names were skimmed, piece by piece against `docs/review-checklist.md`. Six findings were confirmed and fixed, with tests that fail without each code fix; the two handed-over decisions (the target comparison, "Restart loop") were confirmed as right. Nothing larger was found. 12 tests added.

**Inventory**

| Piece                                                                                                     | Kind                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sessionTracker.ts` (`observe`, `countRepeat`, `trackerPhase`)                                            | Pure reducer                                                                                    |
| `usePracticeTracker.ts`                                                                                   | Hook: one feeding effect, a `loopWrapped` listener, three page listeners, three ways of sending |
| `useSessions.ts` (`useLoopSessions`, `useLogSession`, `logSessionUnobserved`, `sessionLogged`)            | Query, mutation, cache writes                                                                   |
| `sessionsApi.ts`, `src/lib/keepaliveInsert.ts`, `supabaseRestConfig`                                      | supabase-js calls and the one hand-built request                                                |
| `useLoops.ts` (`usePracticeLoops`, `useCreateLoop`, `useUpdateLoop`, `useSetLoopStatus`, `useDeleteLoop`) | Queries and mutations over two caches                                                           |
| `useSongs.ts` (`useUpdateSong`, `useDeleteSong`)                                                          | Mutations that now touch the loops and session caches                                           |
| `useLoopPractice.ts` (`playLoop`, `openLoop`)                                                             | Page state and player calls                                                                     |
| `useRequestedLoop.ts`                                                                                     | One-shot effect on the URL and the loops query                                                  |
| `LoopPanel.tsx` (`FinishPrompt`, the declined answer, the History toggle), `LoopStatusButton.tsx`         | Components with handlers                                                                        |
| `OnTheGoPage.tsx`, `LoopHistory.tsx`, `SongPage.tsx` (`SessionNotice`)                                    | Components with handlers                                                                        |
| `debugPractice.ts`                                                                                        | Debug hook, gated by build mode                                                                 |
| `20261123010000_session_sanity.sql`                                                                       | Migration: check, trigger, column grant                                                         |
| `tests/db/helpers.ts`, `tests/e2e/practicePage.ts`, `src/test/render.tsx` (`settle`)                      | Test helpers                                                                                    |

**Findings**

1. **`?loop=` was settled against a list cached before the page opened (QA issue 1). Confirmed, fixed.** `src/features/song/useRequestedLoop.ts` marked the id handled before looking, against `loops.data` from whenever. Checklist: interleavings (a new row, "Done once, on cached data"). The hook now takes the loops query and settles only against a read made since mount (`isFetchedAfterMount`): it waits while that read is fetching, asks for one more read when a fresh cached list lacks the loop (once per id), and goes by the cached list when the read fails or is paused (offline). A "Play loop" pressed by the user while the read is out wins: the late answer opens nothing over it (`userChoseLoop`; without it a slow read would have reset the loop and speed the user had just chosen). Seven tests in `SongPage.test.tsx` ("with a list cached from an earlier visit"): QA's repro A and B, a fresh list that lacks the loop, at most one extra read, no extra read when the fresh list has the loop, a failed read, and the user's own choice. Five fail on the old hook; the "user's choice" one fails with its guard removed; "no extra read" is the control.
2. **Passes played to a hidden page were counted. Confirmed, fixed.** `usePracticeTracker.ts`, the `loopWrapped` listener. A session still under 30 s is kept while the page is hidden; on a laptop the loop plays on in the background tab and every wrap was added, so a 35 s session could carry ten minutes of passes while its duration left that time out. Checklist: interleavings (events during a window). The listener ignores wraps while `document.visibilityState` is `hidden`. One test in `usePracticeTracker.test.tsx`, failing without the line.
3. **A keepalive that failed after the screen had gone was retried through the dead hook's mutation. Confirmed, fixed.** `usePracticeTracker.ts`, `sendOnExit`. Hidden mid-practice (keepalive out), shown again, then another route before the answer: the `failed` branch called `sendNow`, which is the unmounted component's `mutateAsync`. The log still went out, but the mutation stayed attached to an observer nobody will ever unsubscribe, so it was never collected: the case `logSessionUnobserved` exists for. Checklist: late events after unmount, leaks. A `screenGone` ref picks `logSessionUnobserved` there. One test, which fails without the fix (with `gcTime: 10` the mutation is still in the cache).
4. **A new loop didn't join the home page's cached list. Confirmed, fixed.** `src/features/loops/useLoops.ts`, `useCreateLoop`. AGENTS.md: a mutation keeps every cache of the item right. The unit added the second cache and moved edit and delete to it, but not create, so On the go opened on the list without the new loop until its refetch landed. `onSuccess` now adds the row with its song's name from `songKeys.detail` when both are cached, and leaves it to the refetch otherwise (never a row without its song, never a list made up). Three tests in `useLoops.test.tsx`.
5. **Unchecked setup inserts in `tests/db` (from Readability). Confirmed; none was failing; fixed.** Six in `tests/db/constraints.test.ts` and two in `tests/db/schema.test.ts` (`loops-grants.test.ts` already checked each of its own). Two were worse than untidy: "deleting a song removes its loops and their sessions" and "deleting a loop removes only its sessions" assert an empty result, and would pass on a refused insert. All eight use `insertSession`, and one unchecked setup `delete` in `constraints.test.ts` now asserts its `error`. `npm run test:db` is green after, so every one of those inserts was going in. Checklist: hygiene.
6. **The two Unit 09 rows of Open human checks were cut off from their table. Confirmed, fixed.** `docs/plan.md`: a blank line before them ended the table, so they rendered as loose text. Rejoined; the first row also gained QA's two-device check and a note that the keepalive request needs a CORS preflight that outlives the page.

**Handed over, confirmed as they are**

- **`hasReachedTarget` compares whole percents (Test bug 1).** Right. The rule in AGENTS.md ("compare ratios, never percents") is about whether a speed is _saved_: there the stored value is what matters, and two ratios that show the same percent are different speeds. "Has it reached the target" is a question about what the loop's line shows ("71% · target 71%"), and both sides go through the same `ratioToPercent` that the line, the prompt's copy and the home page use, so the prompt can never disagree with the screen. Nothing is written from the comparison, so no rounded value reaches the database (checklist row 4). AGENTS.md states both rules.
- **"Restart loop" keeps the speed playing.** Consistent. `playLoop` is the only place a press applies a loop's saved speed, and it skips that only when the loop pressed is the active one; `openLoop` (arrival by link), and playing a loop after leaving it or after another loop, still set the saved speed; `selectLoop` never did. The panel's and the hook's tests, AGENTS.md and Unit 10's Carried forward line all say the same. A session's speed is `snapshot.speedRatio` at its end, so a nudge kept by Restart is the speed logged.

**Checked and found right**

- **Migration.** RLS and the select and insert policies are Unit 02's, unchanged; the insert grant is now per column, and there is still no update or delete grant; `anon` has nothing. The new trigger function runs as the caller with `search_path = ''`, writes only the row being inserted, and has `execute` revoked from `public, anon, authenticated`. The one `security definer` function on the table (`practice_sessions_after_insert`, Unit 08) matches `user_id`. "On conflict do nothing" against another user's id returns no row and no error (tested), so it tells nothing.
- **`keepaliveInsert`.** The URL carries the table name and `on_conflict=id`, nothing else; the token and the publishable key are headers; the user id is in the body, as in every supabase-js insert. The token comes from `useAuth().session`, which `AuthProvider` replaces on every auth event (a refresh included), and is read through a ref at the moment of sending. An expired one is a 401, read as `failed`, and sent again through supabase-js if the page lives. `response.ok` is checked, the body's `code` is read defensively, and it never throws. `supabaseRestConfig.url` is the resolved URL (the LAN rewrite included).
- **Errors, pagination, partial failure.** Every supabase-js call in the diff goes through `unwrap` / `throwIfError` or reads `error`; both new lists (`fetchLoopSessions`, `fetchPracticeLoops`) use `fetchAllPages` with a total order. No multi-step write was added.
- **Optimistic rules.** A status write rolls back only `status`; `onSuccess` is field-scoped while another write is pending; `cancelQueries` covers both loop caches; `sessionLogged` and `invalidateWhenIdle` each skip the refetch while a write is pending.
- **Gates.** Each status control is disabled on the same mutation-cache read that `setStatus` refuses on.
- **Leaks.** The three page listeners and the `loopWrapped` subscription are removed on unmount; StrictMode is tested.
- **Bars.** The unit adds no bar arithmetic; `start_bar` / `end_bar` are shown and passed on as the 1-based numbers they are.
- **Trust boundaries.** `?loop=` only through `isUuid`, `?tab=` only through `practiceTabFrom`; neither is echoed. No secret in a committed file; `window.__drumPalMinSessionSeconds` is gated on the mode allow-list.

**Open issues** (each has its Carried forward line in `docs/plan.md`)

- On a connection that hangs without failing, `?loop=` opens the loop only when the read gives up; with Unit 11's persisted cache the offline cold start depends on the read showing as paused. Unit 11.
- A sign-out that reaches the song page mid-practice (another tab, a failed refresh) loses that session's log. Unit 11, with the durable queue.
- A refused "Mark finished" or "Reopen" keeps its error under the loop, on both pages, until the loop's next status write or until five minutes pass. Unit 12, with QA issue 3.
- The Build's known gap "before every repeat can't count in" (a session per pass) had no line; it has one now. Unit 13.
- QA issue 7 (`loopGone` doesn't make the page read its loops again) stays with Unit 13, as QA left it.

Every other open issue of the Build, Test and QA sections was checked against `docs/plan.md` and has its line (Units 10, 11, 12 and 13). Unit 09's own Carried forward list is gone, every line of it dealt with. The Unit 11 line for QA issue 1 was rewritten to what is left of it.

**Docs**

- `docs/review-checklist.md`: a new interleavings row, "Done once, on cached data", and test setup named under hygiene.
- `AGENTS.md`: the `?loop=` rule and the general one behind it; no hook `mutate` after its component has gone; hidden passes; a new loop in the home page's list; no bare setup writes in `tests/db`.

**Human checks** (the two Unit 09 rows of Open human checks)

- Phone at the kit: a minute of loop practice, pause, "Practice logged" and the loop's History.
- iPhone, Safari and installed: lock, switch apps, close the tab mid-practice; one session each, no pocket time. The keepalive request and its preflight ran on Chromium only.
- "Before every repeat" on: one session for the sitting, play time without the count-ins.
- Home page on the phone: the order after two loops, "Practice" then Play, Mark finished and Reopen.
- Laptop: switch tabs while a loop plays; two sessions are expected, and now no passes from the hidden time.
- Two devices: save a loop on the laptop, press its "Practice" on a phone that had the song open a minute before; it should now open on the loop.

**Results**

- `npm run check`: green. 84 test files, 3363 tests (3351 before; 12 added).
- `npm run test:db`: green. 6 files, 205 tests.
- `npm run e2e`: green. 318 tests: 304 passed, 14 skipped (the size-specific skips of earlier units), 3.1 minutes.
- Nothing was heard, and nothing ran outside Chromium.

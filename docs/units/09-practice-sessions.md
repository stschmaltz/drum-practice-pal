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

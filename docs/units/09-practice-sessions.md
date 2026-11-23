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

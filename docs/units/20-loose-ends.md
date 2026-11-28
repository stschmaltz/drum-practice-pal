# Unit 20: Loose ends

One section per batch of `docs/loose-ends.md`.

## Decisions built as defaults

The running list for Shane (`docs/loose-ends.md`, Decisions for Shane, has each decision's options and reasoning). Each was built without waiting for an answer; he can overrule any of them.

- **D1, does the Tab page still play loops?** Built: **A**, keep the loop sheet and fix its three cheap faults (batch 4, built here: the count-in that starts a run closes the sheet, focus goes to its header, the reopened sheet shows the playing loop; typed bars come on screen under either answer). Not built: B, make the sheet a list of links to the practice screen (a unit of its own, never started without his say).
- **D4, should a loop's History group sessions by day?** Built: **B**, one row per day practised (batch 5): the day, its play time, the speed most of it was played at (the slower on a tie, the Stats chart's rule) and its passes. Sessions are stored one per stop, as before. Not built: A, leave a row per session.
- **D9, which count-ins close the Tab page's loop sheet?** (new with batch 4) Built: **A**, only the count-in that starts a run, and never while the loop form is open. With "before every repeat", a sheet opened mid-loop stays open and each repeat's count-in is heard but not seen behind it on a phone and a tablet. Not built: B, every count-in closes it (one line, but the sheet then closes under the finger at every pass); C, A plus a beat count in the sheet's header (QA's idea, small).
- **D10, what does History say about a day that had a try at full speed?** (new with batch 5) Built: **A**, one line under the History's total, in the Stats page's own sentence: "Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed." Not built: B, "mostly 80%" in each row; C, the day's top speed beside it ("80%, up to 100%"), which needs the tracker to keep that speed and a column to store it.

## Batch 1: A slow connection never holds up Play

### Build

**Summary.** Items 13.06, 13.14, 13.16a and 14.4b of the triage.

- **13.06** A loop's practice screen no longer keeps Play off for as long as the loops read hangs. `useRequestedLoop` waits `FRESH_READ_WAIT_MS` (2 s, from the screen opening on that loop) for the read made since the page opened, then opens the loop from the cached list, as it does offline. Only a loop the cached list has: one it lacks is still waited for.
- **13.14, 13.16a** postgrest-js's own retry of failed GETs is off on the browser client (`db: { retry: false }`). TanStack Query's two retries are the only ones, so a first load that can't reach the server says so about 3 s after its first lost request (1 s and 2 s between three requests), not about 24 s. `uploadSong`'s look-up after a lost insert answer keeps postgrest's retries with `.retry(true)`.
- **14.4b** `?source=original|drumless` on a links read that hangs shows "Loading the recording…" for at most the same 2 s, then the tab (which needs no network), with the request dropped from the URL.

**Walk-through** (as `docs/product.md` asks, before any code):

- _Day one, one song, a working connection:_ the loops read answers well inside 2 s, so the loop opens on the fresh list exactly as before. Nothing new to do, no new control.
- _Missing a piece:_ a device with no cached loops list (or one that lacks the loop) has nothing to open, so nothing is capped and it waits or fails as before, now failing in about 3 s plus the time each request takes to drop. A song with no recording that is opened with `?source=` lands on the tab at once (the read answers) or after 2 s (it hangs). The play screen always has a tab on this branch (`SongFileGate`), so the fall-back never lands on an empty screen.
- _Offline:_ unchanged. The read is paused, so the loop opens at once from the cache and `?source=` goes straight to the tab; no timer is involved.
- No forced order and no chore: the batch only removes waits.

**Files touched**

- `src/features/song/useGaveUpWaiting.ts` (new) and its test: the one clock both waits use.
- `src/features/song/useRequestedLoop.ts`: the cap, and its comment.
- `src/features/song/useSongSources.ts`: the cap for `?source=`.
- `src/lib/supabase.ts`: `db: { retry: false }`. `src/lib/supabase.test.ts` (new): the real client over a `fetch` that drops every request.
- `src/features/library/songsApi.ts`: `.retry(true)` on `findSavedSong`.
- `src/test/fakeSupabase.ts`: the fake builder takes `.retry(...)` and records it.
- Tests: `LoopPracticePage.test.tsx` ("a loops read that hangs"), `SongPage.test.tsx` ("on a links read that hangs"), `songsApi.test.ts`.
- `AGENTS.md`: a "Slow connections" section and a line on the Unit 09 rule.

`practiceLoop.ts` and `LoopPracticePage.tsx`, which the batch lists, needed no change: the wait that held Play was all in `useRequestedLoop`.

**Decisions**

- **The client option, not `.retry(false)` per read.** One line covers every read there is and every read added later; the per-read form would be forgotten on the next one. Checked on the real client (the triage could not): `db.retry` reaches every builder, and `.retry(true)` on one request overrides it (`supabase.test.ts`).
- **The wait is counted from the screen opening on the loop, not from when the player is ready.** Time spent loading the score and the sounds counts, so on a device where that takes 2 s the loop opens the moment they are in.
- **A loop the cached list lacks is not capped.** There is nothing to open, and "Loop not found" after 2 s for a loop another device has just saved would be wrong. "Loading the loop…" stays until the read answers or fails.
- **The late answer changes nothing that was done.** It lands in the list like any refetch; `handled` keeps the loop from being opened again, so a loop already playing is not restarted and the speed playing is not moved. If the other device had saved another speed, the list (and so the saved speed) holds that one, the player keeps the cached one, and nothing is written until the speed is changed here (`useSaveLoopSpeed` never saves a refetch). A late answer that lacks the loop says "Loop not found", as a refetch always has.
- **`?source=` falls back by dropping the request**, the same end as a read that failed: `chooseSource` is told no read is coming. So the answer, if it comes after all, only adds the recording to the switch and never takes the tab's player from someone already playing it. `chooseSource` itself is unchanged.
- **`useGaveUpWaiting` is a new file**, outside the batch's list: two hooks need the same clock, and neither is the place for the other to import it from.
- **The cap is 2 s for both.** One constant, `FRESH_READ_WAIT_MS`.

**Async windows and inputs**

1. _Practice screen open, cached list has the loop, fresh loops read on its way_ (at most 2 s; `useRequestedLoop`). Play and Space are off (`canPlayLoopPractice`).
   - The read answers inside the wait: the loop opens from the fresh list (its speed). The wait ending afterwards does nothing (`handled`).
   - The read fails or is paused: the loop opens from the cached list, as before.
   - The wait ends first: the loop opens from the cached list; Play is on.
   - The answer after that: the list updates; nothing is opened, sought, ranged or restarted; no write.
   - The answer after that lacks the loop: "Loop not found" and the player goes (unchanged behaviour of any refetch).
   - A speed nudge after the wait, read still hung: the edit's `onMutate` cancels the read (`cancelQueries` on `loopKeys.forUser`), and the list is read again once the write settles.
   - A loop key before the loop is open: the key opens a loop itself (`openLoop`), so a loop is open (`userChoseLoop`), `handled` is latched and neither the wait ending nor the answer opens the requested one over it. Unchanged from before the cap; not newly tested here.
   - The score and sounds arrive after the wait has ended: the loop opens at once.
   - StrictMode: the timer is cleared and set again by the effect's two runs; one clock (tested).
2. _Play screen opened with `?source=`, links not showing the recording, links read on its way_ (at most 2 s; `useSongSources`). The tab's controls aren't offered; "Loading the recording…" shows.
   - The read answers with the video inside the wait: the recording shows; the wait ending changes nothing.
   - The read answers without it, fails or is paused: the tab, request dropped (unchanged).
   - The wait ends first: the tab, request dropped from the URL; Play is on once the sounds are.
   - The answer after that: the switch gains the recording, unchecked; the tab keeps playing.
   - The user picks another source in the switch meanwhile: the URL's source changes, and the wait starts again for that one (it resets whenever the thing waited for changes).
   - A recording the cached links already have: shown at once; the wait ending changes nothing.
3. _`uploadSong`'s look-up after a lost insert answer_: unchanged, still up to four requests over 7 s before "may have been added anyway".

**Known gaps**

- A merely slow connection (a links read that takes more than 2 s with nothing cached) now lands a `?source=` visit on the tab, and the recording then appears in the switch rather than opening by itself: one more tap. The triage chose this; a longer cap for sources alone is one constant if it bothers at the kit.
- Opened from the cached list after the wait, the practice screen can show the speed it is playing (the cached one) while the list holds the one another device saved. Nothing is overwritten until the speed is changed here, and then the speed played here is what is saved. A refetched saved speed that differs from the one chosen also counts as "moved" for "Mark finished?" (`useSpeedMovedSinceChosen`), as it already did for any refetch.
- "Loading the loop…" for a loop the cached list lacks, and every first load with nothing cached, still last as long as the requests take to fail: on a connection that hangs without dropping, that is the browser's own timeout, three times. Nothing sets a timeout on a request.
- Other reads made outside a query lost postgrest's retries along with the rest: `findSongByHash` (the upload's duplicate check, which fails the upload at once with nothing created) and `createLoop`'s read back after a 23505. Both sit under a control the user can press again.
- Not timed on a throttled real connection; the component tests hold the read and move the clock.

**How to verify**

- `npm run check` (green at this commit: 145 files, 5627 tests).
- e2e, run for this batch on phone and desktop only: `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts tests/e2e/practice-screen.spec.ts tests/e2e/library.spec.ts --project=phone --project=desktop` (40 passed). `practice-screen.spec.ts` rewrites four screenshots in `docs/units/14-shots/`; they were restored, not committed.
- `npx vitest run src/lib/supabase.test.ts src/features/song/useGaveUpWaiting.test.tsx src/features/song/LoopPracticePage.test.tsx src/features/song/SongPage.test.tsx src/features/library/songsApi.test.ts`
- By hand: open a song's loop once, wait 30 s (the list goes stale), then in DevTools throttle to a profile that never answers (or block `*/rest/v1/loops*`) and open the loop's practice screen again: Play is on about 2 s after the screen opens, and the loop plays its own bars. Unblock: nothing restarts. With `*/rest/v1/*` blocked and the cache cleared, a list shows its error after about 3 s. Go offline: the loop opens at once.

### Test

**Summary.** Tests for each line of the batch's Acceptance and for the inputs the Build's "Async windows and inputs" list reasoned about without a test. No app code changed. No bug found in the batch's code; one observation is logged below.

**Per acceptance line**

- _Play enabled within about 2 seconds on a connection that never answers (file on the device, list cached)._
  - e2e, `tests/e2e/practice-screen.spec.ts`, "on a connection that never answers the loops read, Play is on about 2 seconds after the screen opens": the loop's screen is reloaded with every GET of `loops` held by `page.route` and never answered. Play is on under 4 s after the screen names the loop (2 s cap plus margin), with at least one read still held; the loop's bars are what plays (bar 7 or 8 after 3 s, which the whole song would have left); the answers are then let through and playback carries on (`['ready', 'playing']`, no restart).
  - `LoopPracticePage.test.tsx`, "a loops read that hangs", five new cases beside Build's five:
    - a late answer carrying another device's speed leaves the player at the cached speed and writes nothing; the next nudge saves 5% under the speed played here (0.95, not from 71%), once;
    - a nudge while the read still hangs, its save held: the read then answers with the rows the server had when it was sent (71%) and the list stays on 95%; one write in all (the edit's `cancelQueries`);
    - a nudge before the loop is open saves nothing to it;
    - Space plays nothing inside the wait and plays the loop's range after it (the key's gate, not the button's);
    - a loop key inside the wait opens the loop it moves to (the URL follows); the wait ending, for either id, and the answer open nothing over it: no range, speed or seek call after the key, nothing written, and Play plays that loop.
- _Offline at once, as now._ Unchanged and already covered ("opens on a cold start offline", `offline.spec.ts`), which still pass.
- _A list read that fails says so within about 5 seconds, not 24._
  - e2e, `tests/e2e/library.spec.ts`, "a library that can't reach the server says so within about 5 seconds": every GET of `songs` aborted; the alert is up under 5 s after the first request, after exactly three requests, none sent later; "Try again" then reads the list.
  - `src/lib/supabase.test.ts` (Build) has the same on the real client with fake time.
- _An upload whose answers are lost still ends in "may have been added anyway"._ Covered before the batch (`UploadPanel.test.tsx`, "when the save's answer is lost") and by Build's `.retry(true)` case; both pass.
- _The reads that lost postgrest's retries along with the rest_ (Build's known gap), pinned as what the user sees when that one request is lost:
  - `UploadPanel.test.tsx`, "when the duplicate check's answer is lost": "Couldn't upload groove.gp. The server couldn't be reached. Check the connection and try again.", no "may have been added", nothing stored and nothing inserted, the check sent once; the same file picked again uploads. `songsApi.test.ts` has the same on `uploadSong`.
  - `LoopEditorForm.test.tsx`, "pressed again after a lost answer with the read back lost too": the insert's answer is lost, the second press gets 23505 and its read back is lost: "Couldn't save the loop. The server couldn't be reached.", the form keeps what was typed and Save is on; the third press saves the one loop under the one id.
- _14.4b._ `SongPage.test.tsx`, "on a links read that hangs", one new case: Space plays nothing while "Loading the recording…" shows (the tab's player is loaded under it) and plays the tab after the wait.

**Fails without the code it covers** (each broken briefly, then restored):

| Broken                                                                                | What failed                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The cap in `useRequestedLoop`                                                         | 7 of the 10 "a loops read that hangs" cases (all that pass the cap); the e2e case on phone and desktop (Play stays disabled)                                                                    |
| `userChoseLoop` latch in `useRequestedLoop`                                           | the loop-key case                                                                                                                                                                               |
| `cancelQueries` in the loop edit's `onMutate`                                         | the nudge-while-hung case (the list went back to 71%)                                                                                                                                           |
| The cap in `useSongSources` (the 14.4b tests Build couldn't run against unfixed code) | "gives up for the tab…" fails. The other two of Build's cases ("an answer inside the wait", "a recording the cached links have") pass either way: they guard the paths the cap must leave alone |
| `db: { retry: false }`                                                                | two cases in `supabase.test.ts`; the library e2e on phone and desktop (no alert in 10 s)                                                                                                        |
| `.retry(true)` on `findSavedSong`                                                     | Build's look-up case in `songsApi.test.ts`                                                                                                                                                      |
| `throwIfError(saved)` in `createLoop`                                                 | the read-back case                                                                                                                                                                              |

**Bugs found**

None in the batch. One observation, not fixed (it is a choice about a control, not a few lines of test):

- _A nudge in the 2 s before the loop opens is played and then dropped._ The speed control is on as soon as the score is in, before the loop is open; a press then moves the player's speed (95%), saves nothing (no loop is active), and the loop opening sets its saved speed (100%) over it. Repro: cached list, loops read held, score loaded, "Slower by 5%" inside the wait, wait 2 s. It was so before the batch, for as long as the read took; the batch makes the window at most 2 s. The test pins that nothing is saved. Low: keep the speed control off until the loop is open (as Play is), or accept it.

**Other notes**

- `persistedCacheHolds` moved from `offline.spec.ts` to `tests/e2e/deviceCache.ts`, since the practice-screen spec needs it too.
- Not covered: a merely slow connection timed for real (Build's known gap stands); `?source=` with the user picking another source inside the wait (Build's list; the hook test covers the clock restarting for a new value).
- `AGENTS.md`, Slow connections: two test patterns (a read that answers late with old rows; holding a read in e2e).

**How to verify**

- `npm run check`.
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts tests/e2e/practice-screen.spec.ts tests/e2e/library.spec.ts --project=phone --project=desktop` (44 passed; the four screenshots in `docs/units/14-shots/` it rewrites were restored).

### Review

Reviewed `git diff origin/main...HEAD` after merging main (the triage: `docs/loose-ends.md`, Unit 20 and Accepted in the plan; no conflict).

**Inventory** (the stateful pieces the batch adds or changes)

- `useGaveUpWaiting` (new hook: a timer, state reset during render).
- `useRequestedLoop` (the once-per-id open of the loop the route names; now also on the cap).
- `useSongSources` (which source a `?source=` visit shows; now also on the cap, with the URL dropped by its effect).
- The browser client (`db: { retry: false }`), and through it every read: the queries, and the reads made outside one (`findSongByHash`, `findSavedSong`, `createLoop`'s read back).
- `findSavedSong` (`.retry(true)`).
- Test helpers: `fakeSupabase`'s `retry`, `tests/e2e/deviceCache.ts`.
- No mutation, migration, engine listener or script changed.

**Findings**

1. _Fixed. Gates ("enabled when the action would refuse", and a new row)._ The tester's observation: on the practice screen the speed stepper (`src/features/loops/PracticeSpeed.tsx`, via `useLoopSpeed.ts:15`) and the speed keys (`src/features/song/useSongShortcuts.ts`, `speedUp` / `speedDown`) were on as soon as there was a player, before the loop was open. A change there was played, saved nowhere (`useSaveLoopSpeed` has no active loop) and then replaced when `openLoop` set the loop's saved speed. It was a few lines, so it is fixed rather than accepted: `canSetLoopPracticeSpeed(player, snapshot, loopOpen)` in `controlGates.ts`, given by `PracticePlayer` to `PracticeSpeed` (`gate`, through `useLoopSpeed`'s new optional gate) and to `useSongShortcuts` (`speedGate`), so the button and the key go by one predicate, as Play and Space do. The loop panel's `LoopSpeedControl` and the Tab page's keys keep `canChangeOptions`. Test first: the tester's "a nudge before the loop is open saves nothing to it" became "the speed stepper and the speed keys are off until the loop is open…" (`LoopPracticePage.test.tsx`), which failed on the enabled button; the key's half was checked to fail with the key's gate taken out. It ends by pressing the same key once the loop is open (95%, saved), so the silence before isn't a key that never arrived. A table for the predicate is in `controlGates.test.ts`. The whole-song view keeps its speed control: the loop stays active there.
2. _Fixed, comment only._ `useRequestedLoop.ts:24` said the wait runs "from the screen opening on this id". The hook lives in `PracticePlayer`, which mounts once `SongFileGate` has the file and the settings, so the 2 s run from the player opening; time loading the score and the sounds counts, time reading the file doesn't. Build's note says the same loosely. Nothing to change in behaviour: on a device that has the file it is read from the device.
3. _Checked, no change. Interleavings._ Each row of the Build's "Async windows and inputs" has a test now (the loop key inside the wait, a nudge while the read hangs, the late answer with another speed, Space inside both waits, StrictMode on the clock). "Done once, on cached data" is weakened on purpose and says what the late answer does; "a wait that comes back after the start" doesn't apply (`lookUpPracticeLoop` stays `found` through the late answer; an answer that lacks the loop was "Loop not found" before the batch too).
4. _Checked, no change. What else lost postgrest-js's retries._ Every `.single()` / `.maybeSingle()` in `src/**/**Api.ts` was read: the others are in queries (TanStack retries them) or are writes with a returned row (postgrest-js never retried those; `supabase.test.ts` pins it). `keepaliveInsert` doesn't use the client. Node scripts and `tests/db` build their own clients and keep the default.
5. _Checked, no change. Hygiene._ Every new `{ data, error }` is checked (`findSavedSong` already was). Fake timers are put back in `afterEach` in all three test files; `supabase.test.ts` unstubs `fetch`; the e2e case releases its held routes in a `finally`. No list read, bar index, secret or trust boundary is touched.
6. _Noted, not changed._ `practice-screen.spec.ts`, "never answers": `expect(waited).toBeLessThan(4000)` is measured from the loop's name being on screen, which is before the player mounts, so it has about 2 s of margin for the file, alphaTab and the sounds. It passed on every run here; if it ever flakes on a slow CI runner, widen that bound, not the cap: `held.length > 0` with Play enabled is what proves the fix.

**Decided to live with** (now in the plan's Accepted section, with what would bring each back): 20.1a the two uncapped waits (a loop the cached list lacks; first loads with nothing cached), 20.1b `?source=` on a slow but working connection landing on the tab, 20.1c a loop opened from the cache playing the cached speed over one another device saved, 20.1d the two reads outside a query that lost postgrest-js's retries. None is a defect of this batch: each is the triage's own trade or was so before it.

**Plan upkeep.** Deleted from Carried forward in `docs/plan.md`: 13.06, 13.14, 13.16a (Unit 13's list) and 14.4b (Unit 14's). Unit 20's batch 1 and `docs/loose-ends.md`'s Batch 1 are marked done.

**Also changed.** `docs/review-checklist.md`: a Gates row, "On before what it changes is set up". `AGENTS.md`, Slow connections: the practice screen's speed gate.
**Checks**

- `npm run check`: green (145 test files passed, 1 skipped; 5645 tests passed, 2 skipped).
- e2e, since the speed gate changes behaviour: `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts tests/e2e/practice-screen.spec.ts tests/e2e/library.spec.ts --project=phone --project=desktop`, 44 passed. The four screenshots it rewrites in `docs/units/14-shots/` were restored. Tablet and the other specs were not run here.
- `npm run test:db` not run: nothing in the batch touches the database.

### Copilot review

One comment on PR #36 (`useSongSources.ts`, the wait's key), confirmed and fixed.

- **The comment.** `SongScreen` isn't keyed by the song, and `SongGate` renders it straight away for a song whose row is cached, so it stays mounted from one song's play screen to another's (Back and Forward between two of them, or any link from one to the other). `useGaveUpWaiting` was given the bare `?source=` value, and its clock runs whether or not anything is still waited for, so after two seconds on song A's Original the wait for `original` was over for every song. Song B's `?source=original` was then the tab at once, with the request dropped from the URL, whenever B's cached links lacked the recording or weren't cached, though the read would have answered.
- **Fix.** The wait is named `${songId}:${source}` (`useSongSources.ts`).
- **Same class, same file.** `useMarkedPlayed`'s "once per opening" ref held the source alone, so song B's Original, reached that way, was never written as played. It holds `${songId}:${source}` now.
- **Not affected.** `useRequestedLoop`: its wait and its `handled` / `readAgainFor` refs are keyed by the loop's id, which is unique across songs, and `PracticePlayer` is keyed by `song.id`, so the hook mounts afresh per song anyway.
- **Tests** (`SongPage.test.tsx`, "from one song straight to another on the same source"; all three failed before the fix): B's recording is waited for until its answer though A's wait is long over (B's cached list lacking it); it is given up only after B's own two seconds (nothing cached); B is marked played once, after A.
- **Late answer.** Unchanged: it lands in B's links and offers the recording in the switch, as for a first visit.
- **Also changed.** `docs/review-checklist.md`: an Interleavings row, "Kept per value, on a screen that outlives its item". `AGENTS.md`, Slow connections: name the wait by everything that makes it that thing.
- **Checks.** `npm run check` green. No e2e: no spec goes from one song's recording to another's, and nothing an existing spec covers changed.

## Batch 2: Queued practice is never dropped

### Build

Items 13.23 and 14.6 of `docs/loose-ends.md`: "Queued practice is never dropped".

**Summary**

- **13.23.** `sendRefreshingToken` (every queued write goes through it: session logs, loop edits, a song's played time) now asks `supabase.auth.getSession()` before it sends. With no session in memory while one is still in storage (supabase-js's refresh of an expired token failed for the connection) it sends nothing and throws `SessionNotLoadedError`, which `isNetworkFailure` counts as the connection's failure. So the write's retries wait, the optimistic value stays, the outbox entry stays, and nothing goes out signed as `anon`. Each retry asks `getSession()` again, which is also what makes supabase-js try its refresh again, so a retry changes what was wrong. With no session stored either (signed out) the write goes to the server as before and its refusal is final. A real refusal (a missing grant, a check) is untouched: it still fails and rolls back.
- **14.6.** `removeOutboxEntry` deletes the row first and forgets the id after, so a replay whose read found the row before the delete landed still sees the id as this page's and leaves it. Two cases the plain reorder would have got wrong are handled: a row that could not be deleted keeps its id claimed (this page never replays an answered write; the next page sends it once more, harmless as before), and an id queued again while its last removal is still deleting is not forgotten by that removal (each claim has a number; the removal forgets only the claim it saw).

**Walk-through** (`docs/product.md`)

- Day one with a song: signed in with a session in memory, the only change is one awaited `getSession()` (answered from memory) before a write. Nothing new on screen, no new step.
- Missing a piece (no tab, no loops): the only queued write such a song has is its played time (`songPlayed.ts`), which takes the same path and is held back the same way.
- Offline at the jam space: the write is paused by TanStack Query as before and `sendRefreshingToken` isn't reached. On reconnect with an expired token, `getSession()` refreshes it before the send; if that refresh fails for the connection (a captive portal, one bar of signal) the write waits for its next retry rather than being dropped, which is the bug.

No forced order, no chore, nothing a user does differently.

**Files touched**

- `src/lib/network.ts`: `SessionNotLoadedError`; `isNetworkFailure` takes it
- `src/lib/tokenRefresh.ts`: the session check before the first send
- `src/features/offline/outbox.ts`: claims by number; removal forgets after the delete
- `src/test/fakeSupabase.ts`: `auth.getSession` (a signed-in session unless scripted), reset in `resetFakeSupabase`
- Tests: `src/lib/tokenRefresh.test.ts`, `src/features/offline/queuedWrites.test.tsx`, `src/features/offline/offlineStore.test.ts`
- `AGENTS.md`: two sentences in the "Queued" bullet of PWA and offline

**Decisions**

- The held-back write is a class of its own in `network.ts`, recognised by `isNetworkFailure`, not a `TypeError` in disguise: `failureCopy` then says "connection" for it with no extra case, and `retryNetworkFailures` needs no change.
- Storage is read after `getSession()` answers, not before. A refresh the server refused removes the stored session while `getSession()` is answering; read first, that would hold back for ever a write that should be refused.
- `getSession()` throwing is treated like "no session": held back while one is stored, sent otherwise. A throw must not turn into a dropped write.
- Only the first send is checked. The second send follows a `refreshSession()` that succeeded, so a session is in memory.
- The keepalive session log (`keepaliveInsert`) is not changed: it carries the token it was handed from `useAuth().session` and never goes through supabase-js, so it can't go out as `anon`.

**Async windows and inputs**

- _`getSession()` pending before a send_ (new; instant with a session in memory, up to supabase-js's own refresh retries with an expired token and a bad connection).
  - Another queued write of the same loop: waits behind this one (loop edits share a `scope`); session logs each ask for themselves.
  - Sign-out pressed: off, as the mutation is pending (`useHasUnsentWrites`), unchanged.
  - A sign-out forced by the server (refresh refused): storage is emptied, so the check finds no stored session, the write is sent and refused, and the device is being emptied anyway.
  - Going offline: `getSession()` fails for the connection, the write is held back and its retry pauses until online.
  - The page hidden or closed: the outbox entry was put in `onMutate` before any of this, so the next start replays it.
  - The screen unmounting: nothing here is tied to a component.
- _Between `getSession()` answering "session" and the request leaving_: supabase-js asks for the session again itself when it builds the request. A refresh failing for the connection inside that gap needs the token to expire in the same instant; the request then goes as `anon` as before. Not closed (see Known gaps).
- _The outbox row's delete pending in `removeOutboxEntry`_ (was there, now the id is held across it).
  - A replay's read that started before the removal, or after it: gets nothing (two tests).
  - The same id queued again: stays claimed, the row is there after both settle (test).
  - The delete failing: the id stays claimed (test).
  - Sign-out's `clearOfflineData`: removes the row either way; the id left in the map is of no consequence, as ids are never reused across users.

**Known gaps**

- The gap between the check and supabase-js's own read of the session, above. Closing it means signing the request with the token in hand instead of letting supabase-js fetch it, which is a change to every queued write's API function and not in this batch.
- Queries sent with no session in memory still go as `anon` and come back empty under RLS (the second half of bug hunt D4). Not in 13.23's fix.
- A held-back write retries at 1, 2, 4, … 30 s for as long as the session can't be refreshed. That is the same as a dropped request today, and sign-out stays off meanwhile (the open "Sign out anyway" question in the plan).
- Not run: any real device, Safari or Firefox. The e2e run was `offline.spec.ts` on phone and desktop only (12 passed); no e2e case makes supabase-js lose its session mid-run.

**How to verify**

- `npm run check` (green: 5618 tests).
- `npx vitest run src/lib/tokenRefresh.test.ts src/features/offline/offlineStore.test.ts src/features/offline/queuedWrites.test.tsx`. Each new test was seen failing before its fix, except "queued again while its last removal is on its way", which passes on the old code and guards the reorder.
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop`.
- By hand (not run by Build), on the dev server: sign in, open a loop, set the stored session's `expires_at` in localStorage to the past and reload with the auth endpoint blocked (DevTools request blocking on `/auth/v1/token`) but REST allowed; change the loop's speed. Before: a 401/42501 on the PATCH and the speed snaps back. Now: no PATCH leaves, the speed stays, and it lands once the block is lifted.

### Test

Tests for 13.23 and 14.6 through the real hooks, the replay and one e2e case. No app code changed. No bugs found.

**Per acceptance line**

- _A session log or loop edit queued while the token could not be refreshed is still in the outbox and lands once after the connection is back, with nothing sent as `anon`._
  - `usePracticeTracker.test.tsx`, "with no session in memory, one still stored": a stop (nothing sent, not in `unsaved`, in `waiting`, in the outbox, then logged once); a hidden page (the keepalive with the stale token gets a 401, its fallback is held back, logged once when the page is back); a session that ends as the screen unmounts (`logSessionUnobserved`).
  - `LoopSpeedControl.test.tsx` (the control over `useSaveLoopSpeed`): a nudge sends nothing, shows no "Couldn't save the speed" alert, keeps 85% on show and in the cache, and is saved once; two nudges while the first is held back go in order, the last kept.
  - `songPlayed.test.tsx`: the played time stays on show and in the outbox, and is sent once.
  - `queuedWrites.test.tsx`, "window by window": a second edit waits behind a held-back one (it asks for no session of its own); going offline while held back pauses the retries, and it lands once; "replayed from an earlier page": a session, a loop edit and a played time written straight to `offlineDb.outbox`, replayed under StrictMode with the session missing, all stay in the outbox with nothing sent and land once each.
  - `tokenRefresh.test.ts`: a token refusal whose refresh found no connection, then no session at the next try, sends nothing more until the session is back; a stored value that isn't a session holds nothing back.
  - e2e, `offline.spec.ts`, "with the access token expired and its refresh failing" (phone and desktop): the real supabase-js with the stored token expired and `/auth/v1/token` aborted. A loop speed typed meanwhile sends no PATCH for the 25 s supabase-js spends retrying and after it gives up; no alert, 80% on show, one outbox entry, the database still at 100%. With the refresh let through there is exactly one PATCH, signed as `authenticated`, and the outbox empties. Without the session check this test fails on a PATCH whose bearer is the publishable key, which is the bug.
- _A write the server truly refuses (a missing grant) still fails and rolls back._ A 42501 with a session in memory (and one stored): the tracker keeps it for "Try again", sent once, out of the outbox; the speed control shows its alert and the cached speed goes back while the playing speed stays; `useUpdateLoop` and `useLogSession` fail after one send; a replayed edit rolls back and leaves the outbox.
- _A server-forced sign-out during the `getSession()` wait._ `tokenRefresh.test.ts` and `queuedWrites.test.tsx` hold `getSession`, empty storage, then answer "no session": the write is sent, refused and rolled back, not held.
- _Sign-out stays off while a write is held back._ `SignOutButton.test.tsx` with a real `useLogSession` write held back: disabled with its note between tries, a press refused, enabled and working once the write has landed. `useHasUnsentWrites` / `hasUnsentWrites` are also asserted in the tracker, loop edit, played and replay tests.
- _An outbox removal can't be replayed._ `queuedWrites.test.tsx`, "while an answered write is being taken out": a replay mounted under StrictMode while the answered row's delete is held sends nothing again; a row whose delete failed is not sent again by a replay on this page. `usePracticeTracker.test.tsx`, "queued again while its last outbox removal is on its way": a keepalive refused, its fallback refused, "Try again" refused with its removal held after the delete, "Try again" once more; the entry stays this page's, a replay mounted then sends nothing, and the last retry logs it.

**Checked by breaking the code** (each restored)

| Break                                                    | Tests that failed                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| No session check in `sendRefreshingToken`                | 22 across the six unit files, and the e2e case (an anon PATCH)      |
| Storage read before `getSession()`                       | the two forced sign-out tests                                       |
| `isNetworkFailure` without `SessionNotLoadedError`       | 16: every "held back" test                                          |
| "No session" whenever one is stored (holds everything)   | 15, the 42501 tests among them                                      |
| `removeOutboxEntry` forgets the id first (the old order) | the StrictMode replay test, the failed-delete test, and Build's two |
| Forgets after the delete whatever the claim              | the tracker's "queued again" test and Build's                       |
| A failed delete forgets the id                           | the failed-delete test and Build's                                  |

A test of a loop edit answered while a replay reads passed with the old order too (the replay drops an entry this page has edited since, `editsMadeSince`), so it was removed.

**Seen while testing** (none is a regression)

- A held-back write on a hidden page is not retried until the page is shown: TanStack Query waits for focus between retries. The same holds for a dropped request. The outbox still has it for the next start.
- With the real client a held-back write's try takes about 25 s (auth-js retries its refresh inside `getSession()`), then the 1, 2, 4 s back-off. After the connection returned the e2e write landed within about 15 s.
- A row whose delete failed keeps `useHasUnsentWrites` true on that page, so Sign out stays off until the next start, which replays it. It was the same before this batch (the row was left then too).

**Not covered**

- The gap Build names between the check and supabase-js's own read of the session.
- Safari, Firefox, a real device. The e2e ran on Chromium, phone and desktop projects.

**How to verify**

- `npm run check`.
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop` (14 passed; the new case takes about 100 s).

### Review

Reviewed `git diff origin/main...HEAD` after merging main (batch 1; the one conflict was this note, Batch 1 kept first).

**Inventory**

- `sendRefreshingToken` and `hasSessionInMemory` (`src/lib/tokenRefresh.ts`): the session check before a queued write's first send. Reached only from three `mutationFn`s: `loopEditOptions`, `logSessionOptions`, the played time in `songPlayed.ts`.
- `SessionNotLoadedError` and `isNetworkFailure` (`src/lib/network.ts`).
- `removeOutboxEntry`, `putOutboxEntry`, `takeLeftoverOutboxEntries` and the claim numbers in `queuedHere` (`src/features/offline/outbox.ts`).
- `fakeSupabase.auth.getSession` (`src/test/fakeSupabase.ts`), and the tests of six unit files and one e2e case.

**Behaviour pass**

- _Interleavings, the outbox._ Walked put, remove, a failed delete and the replay's take in every order, with one id and with the id queued again. A take's read before or after a removal's delete finds the id claimed either way; a removal never drops a claim made after it began (the number); a failed delete keeps the claim; two removals of one id (the keepalive's answer and the mutation's `onSettled`) both see the same number and the second finds nothing to do; StrictMode's two takes claim in the step after their reads, so the second gets none. The one order that can still hand a replay an answered entry is a removal of an id this page never claimed, and every removal on a page follows that page's own put or take. Each has a test (`offlineStore.test.ts`, `queuedWrites.test.tsx`, the tracker's "queued again"). Put back the old order: the 14.6 test and the failed-delete test fail.
- _Interleavings, the session check._ `getSession()` pending: another edit of the loop waits behind it (scope), going offline pauses the retry, a forced sign-out empties storage before the answer and the write is sent for its refusal. All tested by Test. Read auth-js 2.119.2 for what `getSession()` does with an expired token: eight tries over about 25 s, then `{ session: null, error }` with the session left in storage for a retryable failure, removed for a refused one; inside the 90 s before expiry a failed refresh still returns the stored, still-valid session.
- _A tap that starts audio._ No handler awaits a queued write: `useSaveLoopSpeed`, the tracker and the played time fire from effects, `useSetLoopStatus` calls `mutate`, and the tracker's `mutateAsync` is only chained. supabase-js already awaited `getSession()` inside every request before this batch, so the check adds no wait of a new kind.
- _The keepalive from a hidden page._ `keepaliveInsert` carries the token from `useAuth().session` and never reaches `sendRefreshingToken`. With an expired stored token it gets a 401 and falls back to the mutation, which is held back; the row is in the outbox throughout.
- _Gates._ Sign out stays off for a held-back write between tries (pending in the mutation cache, and its outbox entry). Tested through the real button.
- _Validated paths._ The check is on the first send only; the second follows a refresh that succeeded. The check-to-send gap is below.
- _Hygiene._ No list reads, no multi-step clean-up. `removeOutboxEntry`'s catch is deliberate and now says what it leaves. Test spies are restored (`afterEach`, or in the test); `localStorage` is cleared by `src/test/setup.ts`.

**Findings**

1. `tests/e2e/offline.spec.ts` (the new case), hygiene: about 100 s in each of three projects. It can't be made shorter and still prove what it does. The 25 s is auth-js's own retry loop, bounded by a constant; after it auth-js answers every `getSession()` from that failure for 60 s (`REFRESH_FAILURE_COOLDOWN_MS`), so the write cannot land sooner than about 85 s whatever the spec does. A reload after the outage would cut it to about 35 s, but would then prove the replay, which the unit tests already do, and no longer that the real client recovers its session in the page, which only this case does. Nothing in it depends on the window's size, so it now runs in the desktop project only (`test.skip`, as `loop-scroll.spec.ts` does for its breakpoint case): 100 s once, not three times.
2. `src/lib/tokenRefresh.ts`, `hasSessionInMemory`'s comment said every retry is a new attempt at a refresh. It isn't for a minute after a failed one (the cooldown above). Comment corrected; it also says why the answer's `error` is not read (AGENTS.md: check every `error`): storage, not the error, tells "no connection" from "signed out". No behaviour change.
3. The plan's 13.23 line said queries sent with no session "come back empty under RLS". Checked against the local API with the publishable key: `anon` has no grants, so a read is refused (401, 42501), not answered empty. Written correctly in Accepted 20.2b.

**Looked at and left**

- The gap between the check and supabase-js's own read (Build's known gap). From auth-js's code it is narrower than Build wrote: inside the 90 s margin a failed refresh still hands out the stored token, so a write goes out as `anon` only when the token's real expiry falls between two reads a few milliseconds apart, with the refresh failing. A check after a 42501 ("no session now, one stored: hold it back") would close the drop, at the cost of a second `getSession()` on every real refusal, for a window that size. Accepted as 20.2a.
- A stored session with `getSession()` throwing for ever would hold a write for ever, and Sign out with it. It needs auth itself broken; the entry is in the outbox for the next start.
- A server-forced sign-out during the wait sends the write as `anon` for its refusal and drops it. The device is being emptied then anyway; keeping unsent practice across a forced sign-out is batch 6 (D2).

**Changed**

- `tests/e2e/offline.spec.ts`: the new case is desktop only, with why it takes 100 s.
- `src/lib/tokenRefresh.ts`: comment only.
- `docs/review-checklist.md`: "What counts as a refusal" gains the code that is about who the request was sent as; a new Interleavings row, "A claim let go before the work it covers is done".
- `AGENTS.md`, PWA and offline: where the session check may sit (a queued write's `mutationFn` only), the cooldown, and a long e2e case in one project.
- `docs/plan.md`: the 13.23 and 14.6 Carried forward lines deleted (Unit 13 and Unit 14 both still have lines), batch 2 marked done, Accepted 20.2a to 20.2d. `docs/loose-ends.md`: batch 2 marked done.

**Open issues**

None for a later batch. For batch 6 (13.01): a read sent with no session is a 401 carrying 42501, not PGRST301 or PGRST303, so `isTokenRefusal` won't see it (20.2b).

**Checks**

- `npm run check`: green (5682 tests passed, 2 skipped).
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop`: 13 passed, 1 skipped (the new case on phone); the new case took 1.6 min on desktop. No screenshots rewritten.
- `npm run test:db` not run: nothing in the batch touches the database.

### Copilot review

One comment on #37 (`src/features/offline/outbox.ts`, high): two sends of one session id at once, and the first answered removes the other's outbox row and claim. Confirmed and fixed.

**Is it real**

- _Sessions: yes._ `retryUnsaved` sends every record in `unsaved` through the mutation, and a record stays in `unsaved` until its retry is answered, so "Try again" pressed twice has two mutations of one id pending at once (`usePracticeTracker.test.tsx` already had "Try again pressed twice sends the same session twice"). Both `onSettled`s called `removeOutboxEntry(record.id)`: whichever was answered first deleted the row and forgot the id while the other was still waiting (held back for the session, between network retries, or paused offline). A page closed then left nothing to replay. It fails in both orders: the comment's (the earlier send answered first) and its mirror (the later one answered first while the earlier still waits), so "remove only when my claim is still the latest", the comment's first suggestion, would have fixed one and left the other.
- _Loop edits and played times: no._ Each mutation's entry id is its own `randomUuid()`; a replayed one keeps the entry's id, and an entry is taken by one replay only. No two sends share an id. They moved to the same API all the same, so no caller can remove by id.
- How bad: the send answered first was refused or logged. Logged, the row is no loss. Refused, the other send carries the same record and will mostly be refused too; the loss is real where the refusal was about the moment and not the record (a refused token refresh, the check-to-send gap of 20.2a), and the invariant "a send still waiting has its copy on the device" was broken either way.

**Fix**

- `outbox.ts`: a put returns its send's `OutboxHold` (`{ stored, release }`), at once; `takeLeftoverOutboxEntries` returns `{ entry, release }` per entry. `removeOutboxEntry(id)` is gone: clean-up takes the hold, never the id. Each id counts its holds; a release that is not the last does nothing else, and the last one deletes the row and forgets the id only after that delete (14.6 unchanged: a failed delete keeps the id, an id queued again during a delete stays claimed, and a delete still on its way keeps the id from being forgotten by a later one).
- Every hold has one owner that releases it once: the three mutations keep theirs as the mutation's context and release in `onSettled`; the tracker's `send` keeps the hold of its early put and releases it when the send it started has settled (the mutation, or the keepalive; a failed keepalive passes the hold to its fallback); the replay releases what it took when the entry's mutation has settled.
- `songPlayed.ts`: `sendSongPlayedUnobserved` (resolves when settled) beside `markSongPlayedUnobserved`, for the replay's release.

Not done: preventing overlapping sends in the tracker. The Test stage's 14.6 case presses "Try again" while the last retry's removal is still on its way and expects that press to send; blocking it would take that away, and the outbox would still let the next caller make the same mistake.

**Async windows and inputs**

- _A send's hold, from its put to its release._ Another send of the same id starting or settling: the row stays until the last release (tests, both orders). A replay's read: the id is claimed while any hold or delete is out. The page closing: the row is there for the next page (test). A release called twice: the second does nothing, so it can't let go of another send's hold (test).
- _Between a mutation's `onSettled` and the release of the hold its caller kept_ (new, a promise callback later): the row is still there with every send answered. A replay can't take it (still held). A page closed there leaves a row the next page sends once more, which is harmless (the session insert ignores a duplicate; a refused one is refused again and dropped). `useHasUnsentWrites` reads true for that moment longer.
- _The row's delete on its way_: as in Build, plus a second send queued and answered inside it, whose own delete takes the row and after which the id is forgotten only when both deletes are done (test).

**Tests** (each seen failing first: the tracker's on the old code, the outbox's with the "another send still holds it" line taken out)

- `usePracticeTracker.test.tsx`, "two sends of one session at once": a refused session, "Try again" twice with both answers held; the first (and, as a second case, the second) is refused; the row is still in the outbox, a replay mounted under StrictMode sends nothing, the other send lands, the row goes and the session counts as logged.
- `offlineStore.test.ts`, "queued by two sends at once": both orders; the page closing with one unanswered (`vi.resetModules()` is the next page, which takes the entry); a hold released twice; a second send queued and answered while the first's delete is held. Also "holds what the replay took until the replay lets go". The file's earlier outbox tests are rewritten on holds with the same assertions.

**Docs**

- `docs/review-checklist.md`: new row, "Clean-up by id, when two pieces of work share the id"; the row above it no longer says "number the claims".
- `AGENTS.md`: the outbox sentences of the "Queued" bullet and of the test patterns.

**Checks**

- `npm run check`: green (5690 tests passed, 2 skipped).
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop`: 13 passed, 1 skipped (the token case on phone, as before). Not run: any other spec, a real device, Safari or Firefox.

## Batch 4: Tab page, the loop sheet

### Build

**Summary.** Items 13.32, 13.28a, 13.28b and 13.27a of the triage: D1's option A, built as the default. All four are on the Tab page's loop sheet and the loop form; nothing about how a loop is saved, played or logged changes.

- **13.32** Playback started with a count-in from outside the sheet (Play in the page's bar, Space, a pedal) closes the open sheet, so the count-in number is not behind it. The rule is `countInClosesPanel(before, now)` beside `playLoopClosesPanel` in `useLoopPanelOpen.ts`; an effect in `LoopPanel` asks it at each change of the player's status.
- **13.28a** Whenever starting playback closes the sheet ("Play loop", or 13.32's count-in), focus that was inside the sheet goes to the sheet's header, which is always on the page and is the way back in. Focus that was outside it (on the page's Play) is left alone.
- **13.28b** Each time the sheet opens, its list is scrolled so the playing loop's item is on show. An item already all on show is not moved.
- **13.27a** Bars typed into the loop form bring their first bar on screen (`player.showBar`) as soon as the two fields make a range in this song, which is when the score highlights them. Bars picked on the score by a tap or a drag never scroll it.

**Walk-through** (as `docs/product.md` asks, before any code):

- _Day one, one song, no loops:_ the sheet says "Loops (0)". Open it, read the empty note, press Play in the bar with a count-in on: the sheet closes and the number shows. With the count-in off nothing changes. No new control, no new step.
- _Missing a piece:_ a song with no loops or no loop playing has no item to scroll to, and opening the sheet moves nothing. A song with no drum track is untouched. A new loop's form with only its first bar typed makes no range yet, so nothing scrolls until the last bar is typed (the score highlights nothing until then either).
- _Offline:_ nothing here reads or writes the network. The form's Save is off offline as before; typed bars still scroll.
- _The user this would have been wrong for, and what was changed for them:_ someone practising with "before every repeat" on, who opens the sheet mid-loop to nudge the speed. As the triage words 13.32 ("whenever the status becomes `countingIn`") the sheet would close under their finger at the start of every pass, which on a two-bar loop is every few seconds, and the tap meant for "Faster by 5%" would land on the score. So only the count-in that _starts_ a run closes the sheet (see Decisions). The batch's acceptance ("any way of starting playback with a count-in shows the number") is met as written.
- No forced order and no chore.

**Files touched**

- `src/features/loops/useLoopPanelOpen.ts`: `countInClosesPanel`. Test: `useLoopPanelOpen.test.ts` (the table of status pairs).
- `src/features/loops/LoopPanel.tsx`: `closeForPlayback` (close and hand focus on), the status effect, the layout effect on `open`, `showPlayingLoop`. "Play loop" now calls `practice.playLoop` first and closes after it. Tests: `LoopPanel.test.tsx`, three new describes named by item, and two older cases under "bringing a paused loop's first bar on screen" that said typed bars don't scroll.
- `src/features/loops/LoopEditorForm.tsx`: `showTypedBars`, called from `editBars`. Test: `LoopEditorForm.test.tsx`, "bringing typed bars on screen".
- `src/features/loops/useLoopPractice.test.tsx`: taps and a drag with the form open never scroll (a guard: it passed before the change). **`useLoopPractice.ts` itself is unchanged**, so there is nothing to merge with Unit 19's edit of it.
- `src/features/song/SongPage.test.tsx`: one case, "Space after a mouse press of Play loop…", asserted that focus stayed on the button the closed sheet hides, which is 13.28a itself. It now asserts focus is on the header and that Space pauses without opening the sheet. `SongPage.tsx` is untouched.
- `AGENTS.md`, Loops, the UI paragraph: the rules above.

**Decisions**

- **A repeat's count-in, and a count-in already running, never close the sheet** (a narrowing of the triage's "whenever"). `countInClosesPanel` is true only from a status that is not running to `countingIn`. A sheet open at a repeat's count-in was opened while the loop played, and one opened during a count-in was opened on purpose a moment ago; `playLoopClosesPanel` already says of a playing loop that "the sheet is open for its speed control". The number of a repeat's count-in is therefore still behind a sheet the user opened over it, and the clicks are still heard. If Shane wants every count-in to close it, the rule becomes `now === 'countingIn' && before !== 'countingIn'`: one line and one row of the table.
- **It closes with the loop form open too.** The form stays mounted in the closed sheet, so the name and bars typed are there when it is reopened, and taps on the score go on picking bars (the highlight shows them). The header could already be closed over an open form by hand.
- **With no count-in, Play from outside leaves the sheet open**, as before: there is no number to hide and the press was not on the sheet. Only "Play loop" closes it then.
- **Focus is moved at once, not through `useFocusWhenReady`** (the triage named it). The header is always on the page, so there is nothing to wait for; and one of the two callers is an effect, from which AGENTS.md says never to schedule that hook. One function, `closeForPlayback`, does both paths, and moves focus only when it was inside the sheet's body.
- **The list is scrolled by its own `scrollTop`, not `scrollIntoView`** (the triage named it). `scrollIntoView` scrolls every scrolling ancestor it thinks it must, and the Tab page goes to some length to keep the window, and the score, still while things open and close. The position comes from `scrollToShow` in `barScroll.ts`, the pure function the score box already uses: an item all on show stays put, otherwise its top goes to the top of the list (8 px under the header). So the alignment is "start", not "nearest".
- **13.27a is in the form, not in `useLoopPractice.setEditorBars`** (the triage's test file suggests the hook). The form's `editBars` is the only typed path and has everything it needs; the hook is left alone for Unit 19's merge. It also covers the practice screen's "Save as loop" form, which uses the same component.
- **Typed bars don't scroll while the song runs** (playing or counting in): alphaTab follows its cursor while playing, and during a count-in the score has just been put on the bar being counted in. `showBar` alone only refuses while playing.

**Async windows and inputs**

No request, timer or promise was added. The windows are between a change of the player's status and React drawing it.

1. _Status becomes `countingIn` with the sheet open_ (the effect runs after the render that shows the new status).
   - "Play loop" was the press: the handler has already closed the sheet in the same batch, so the effect finds it closed and does nothing (one close, one focus move).
   - The header pressed in the same moment to close it: it is closed; the effect does nothing.
   - The header pressed to open it during the count-in: no change of status follows, so it stays open through the count-in and the downbeat.
   - A seek during the count-in (a tap on the score, a loop key): the service counts in again inside one call; React sees `countingIn` to `countingIn`, no close.
   - Pause during the count-in, then Play again: `ready` to `countingIn` again, so an open sheet closes again. Intended: it is a new start.
   - "Loop speed" in the controls bar during the count-in opens the sheet and focuses the speed group: it stays open (no status change).
   - StrictMode's second run of the effect sees the same status as "before": nothing.
   - The panel mounting while a count-in already runs: "before" starts as the current status: nothing.
2. _A repeat's count-in._ alphaTab reports `finished`, then stopped: the service goes `playing` to `countingIn` and the sheet stays. The service also accepts the other order (stopped first), which would be `playing`, `ready`, `countingIn`; if alphaTab ever sent that, the `ready` between would read as a new start and close the sheet. See Known gaps.
3. _The sheet opening_ (layout effect on `open`, before paint).
   - No loop playing, or the form in the list's place: no item, nothing scrolls.
   - The loop starts playing or changes while the sheet is open: nothing scrolls (once per opening; the open list is the user's).
   - Opened by "Loop speed": the list is scrolled to the item, then the page's own hand-over focuses the speed group inside it, which the browser scrolls to if it must.
   - Opened by the page because a form opened (a drag on the score): the form is showing, nothing scrolls.
4. _Typing into a bar field._ Each keystroke is judged by itself against the other field's value.
   - While the form's save is pending the fields are read-only and `editBars` returns first: no scroll.
   - Before the score has rendered, `showBar` keeps the bar and shows it on `rendered` (the service's own rule).
   - A range applied by the page meanwhile (`setRange`) drops a kept bar, as for any `showBar`.

**Known gaps**

- A bar number is scrolled to digit by digit: typing "12" over a first bar, with a last bar already there, shows bar 1 and then bar 12. Both moves are instant and the last one is right. Waiting for the typing to stop would need a timer.
- The repeat order in window 2: the rule reads two statuses, and cannot tell a pass that ended "stopped, then finished" from a pause followed by Play. The service's test helper (`engineFinishesPass`) and its comment say alphaTab sends `finished` first.
- "Play loop" still closes the sheet, and now moves focus, in the narrow case where `practice.playLoop` refuses a press on a button that was still enabled (the sounds failed between the render and the press). `playLoop` returns nothing to go by; having it return whether it acted is a change to `useLoopPractice.ts`, left for after Unit 19 merges.
- Closing the sheet takes away the room it adds at the page's end (`SongPage`), at the same moment the controls fold for playback. That is what "Play loop" has always done; it now also happens for Play from the bar with the sheet open. Not measured in a browser here (13.31b is the accepted item about it).
- `LoopPanel`'s doc comment and a helper comment in its test still describe a column from 1024 px; the panel has been a sheet at every size since the practice-feedback pass. Left for Readability.
- Not seen by eye in a real browser: `showPlayingLoop` and the focus hand-over are tested in jsdom over a modelled layout; the e2e run below only shows the existing flows still pass.

**How to verify**

- `npm run check` (green at this commit: 145 test files, 5675 tests).
- `npx vitest run src/features/loops src/features/song`.
- e2e, run for this batch on phone and desktop only: `E2E_PORT=4383 npx playwright test tests/e2e/loops.spec.ts tests/e2e/loop-scroll.spec.ts tests/e2e/count-in.spec.ts tests/e2e/shortcuts.spec.ts --project=phone --project=desktop` (102 passed, 16 skipped by their own width conditions). No screenshots were rewritten. No spec was added or changed: the new behaviour has no e2e yet.
- By hand, phone width, a song with several loops and a 2-bar count-in:
  1. Open the sheet, save a new loop, press Play in the bar: the sheet closes and the number counts over the score.
  2. Open the sheet, press "Play loop" by keyboard (Tab to it, Enter): the sheet closes, the focus ring is on its header; Enter opens it again and the playing loop is in view even if it is the last in a long list.
  3. Scroll the open list away from the playing loop, close and reopen the sheet: the loop is back in view, and the score has not moved.
  4. With "Every repeat" on, open the sheet while the loop plays: it stays open over the next count-in.
  5. "New loop", type a first and last bar far from the bars on screen: the score moves to the first bar. Tap a bar instead: the score does not move.

### Test

**Summary.** The build had component tests and no e2e. This stage proves each acceptance line in Chromium at the phone and desktop projects (9 new e2e tests in `tests/e2e/loop-scroll.spec.ts`, 1 rewritten into 2 in `tests/e2e/shortcuts.spec.ts`), adds 5 component tests for the windows the build's list named without a test, measures how far the score moves when playback closes the sheet, and pins the refused "Play loop". No app code changed.

The e2e went into `loop-scroll.spec.ts`, not `loops.spec.ts` or `count-in.spec.ts`: it is the file about the sheet, the count-in number and the score box, and its `recordGeometry` / `samples` (the page measuring itself on every beat) are what 13.32 needs.

**Tests per acceptance line** (each run at phone 390 x 844 and desktop; "bites" names the break that made it fail, see below)

- **13.32, any way of starting playback with a count-in shows the number.** `loop-scroll.spec.ts`:
  - "Play in the page’s bar, with the sheet open and a count-in, closes the sheet: on every beat the number is in the clear" and the same for "Space" (focus on "New loop" in the sheet, where a save leaves it). The sheet is open because a loop was just saved (N1's case). Read from the page's own samples: the sheet is closed and no part of it is over the number from 250 ms into the count-in; from a second in the whole number is in the window, above the tab bar, with nothing over it. Focus: on the header after Space (it was in the sheet), still on Play after a click on Play.
  - "with a count-in before every repeat, a sheet opened during the count-in stays open through the downbeat, and one opened mid-loop stays open over each repeat’s count-in": the builder's narrowing, pinned. Status and `aria-expanded` are read in one `evaluate`; every sample of the second and third count-ins has the sheet open.
  - Component (`LoopPanel.test.tsx`, "a count-in started from outside it"): Pause during the count-in then Play again closes a sheet opened meanwhile (a new start); under StrictMode it closes once and a sheet opened during the count-in stays; focus already on the header stays there.
- **13.28a, after "Play loop" the next Tab starts from the header.** `shortcuts.spec.ts`, "Play loop by a click / by Enter closes the sheet and hands focus to its header: Space then pauses without opening it, and Tab goes on from there" (was "Space after clicking Play loop pauses, rather than pressing the focused Restart loop", which no longer said what happens: there is no focused Restart loop). Focus is on the header; Space pauses once (`['playing', 'ready']`), the sheet stays closed and focus stays; Tab goes to the tab bar on a phone and off the end of the page on a desktop (the header is the last stop there), never into the closed sheet; Shift+Tab comes back to the header; Enter opens the sheet on the loop.
- **13.28b, reopening the sheet shows the playing loop.** `loop-scroll.spec.ts`, "reopened, a long list of loops is scrolled to the playing loop, and neither the window nor the score moves": 12 loops (the list is over 2,300 px in a box of 360 to 380), the last one played. Reopened, its item starts 8 px under the header and its speed group is all in view; `window.scrollY` and the score box's place are the same as before the sheet opened. Scrolled to the top by hand the item is out of sight and stays so (the open list is the user's); closed and reopened it is back. Playback runs throughout.
- **13.27a, typed bars bring their first bar on screen.** `loop-scroll.spec.ts`:
  - "bars typed into the loop form bring their first bar on screen, as soon as they make a range": one field typed moves nothing and highlights nothing; the second scrolls the score box to bar 13 with no seek, no playback, the window still and focus in the field; typed back to bar 1 the score follows.
  - "a bar tapped on the score with the loop form open is picked where it is": bar 2 half out of the box, tapped (a touch on the phone, a click on the desktop): it is picked (both fields say 2, proving the tap arrived) and neither the score box nor the window moves; the same bar then typed is scrolled to.
  - "bars typed while the song counts in or plays leave the score where the music is; paused again, they are scrolled to": status, sheet and the bars' place read in one instant during the count-in and while playing; after Pause the next bar typed is shown.
  - "on a loop’s practice screen, bars typed into Save as loop bring their first bar on screen". A guard, see below.
  - Component (`LoopEditorForm.test.tsx`): a change to a bar field while the save is pending scrolls nowhere.
- The desktop has nothing to scroll at 1440 x 900 with the 16-bar fixture (the older specs skip it), so the 13.27a tests give the desktop project a 1440 x 480 window (`openWithBarsOutOfSight`), where the score box shows two of the four lines.

**Each test fails without its code** (app broken briefly, rebuilt, restored; vitest for the component ones)

| Break                                                               | Fails                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The status effect never closes the sheet                            | Both 13.32 "closes the sheet" tests, the count-in half of "typed while the song counts in", the score-move test; 6 component tests |
| `countInClosesPanel` true for every count-in (the triage's wording) | "before every repeat … stays open", both sizes                                                                                     |
| The effect also closes a sheet opened during a count-in             | "before every repeat … stays open", "typed while the song counts in"; 5 component tests                                            |
| `closeForPlayback` moves no focus                                   | Both `shortcuts.spec.ts` tests and the Space test of 13.32, both sizes                                                             |
| No `showPlayingLoop` on open                                        | 13.28b, both sizes                                                                                                                 |
| `showTypedBars` not called                                          | The typed, tapped (its last step) and counting-in (its last step) tests, both sizes                                                |
| `showTypedBars` without its `isRunning` check                       | "typed while the song counts in or plays", both sizes                                                                              |
| The form scrolls to any bars it holds, tapped ones too              | "a bar tapped … is picked where it is", both sizes                                                                                 |
| `editBars` without its `saving` check                               | The new `LoopEditorForm` component test                                                                                            |

Two assertions do not bite, and are kept as guards with that said:

- **The practice screen's test passes without `showTypedBars`.** There a whole range in the form is also what plays (`previewPickedBars`), and `applyLoopRange` already calls `showBar` for it. So on that screen typed bars were brought on screen before this batch, and the form's own call is a second, harmless one. The same path runs for a range tapped there; whether a bar tapped on the practice screen can move under the finger was not measured (not this batch's code).
- **"Neither the window nor the score moves" in 13.28b passes with `scrollIntoView` in place of the list's own `scrollTop`.** In Chromium, scrolling an item of the fixed sheet into view does not scroll the window. The builder's choice is still the safer one; the assertion guards the outcome, not the choice.

**The score when playback closes the sheet** (the build's unmeasured gap). `loop-scroll.spec.ts`, "the score when playback closes the open sheet: Play in the bar moves it as far as Play loop does, no further", measures the score box's top before the press, a settled moment into the count-in, and after Pause, for "Play loop" and for Play in the bar, with the page at its top and at its end. It asserts the two presses move it identically (they do, to the pixel) and prints the figures:

| Sheet open, 2-bar count-in at 50% | Before | At the count-in | After Pause |
| --------------------------------- | ------ | --------------- | ----------- |
| Phone, page at its top            | 593    | 522 (−71)       | 522 (−71)   |
| Phone, page at its end            | 118    | 302 (+184)      | 514 (+396)  |
| Desktop, page at its top          | 617    | 296 (−321)      | 296 (−321)  |
| Desktop, page at its end          | −96    | 280 (+376)      | 280 (+376)  |

Three of the four are Play bringing a score that was under the sheet or off the top onto the screen, which it does with the sheet closed too (phone at its top: 593 to 522 either way). The fourth is bug 1.

**Bugs found**

1. **Phone, sheet open, page scrolled to its end so the score sits above the sheet: starting playback moves the score 184 px down, and Pause another 212.** Not fixed (the room is `SongPage.tsx`'s and the fold is `useStaysOnScreen`'s; neither is a few lines, and `SongPage.tsx` is off limits here). Severity: medium on the Tab page, since scrolling the score up above the open sheet is what the sheet's room is for.
   - Repro at 390 x 844: Groove 120, speed 50%, count-in 2 bars, save a loop of bars 1 to 2 (the sheet stays open), scroll the page to its end. The score box's top is at 118 px, clear of the sheet (its header at about 363). Press Play in the bar, or Space, or "Play loop".
   - At the count-in the sheet has closed, its room is gone (the page is 844 px tall, from 1,319), the window is back at 0 and the score box's top is at 302. After Pause the controls unfold and it is at 514: 396 px below where the user put it.
   - The score stays on screen throughout (302 to 504 of 787 px), and the count-in number with it.
   - It is the long-standing behaviour of "Play loop" (the same figures to the pixel), which this batch extends to Play and Space with a count-in. 13.31b in the triage accepts "up to 32 px" for the sheet closed while the controls are folded; from this starting place it is 184.
   - On the desktop the sheet is the bottom-right corner and the score is never above it; no move was found that Play doesn't make with the sheet closed.
2. **A "Play loop" the player refuses at the press still closes the sheet and moves focus to its header** (the build's known gap, now pinned). `LoopPanel.test.tsx`, "a Play loop the player refuses at the press starts nothing, yet the sheet closes and focus moves to its header": the engine fails in the same batch as the click, so the button is still drawn enabled; nothing is told to play and no loop is set up, and the sheet is closed with focus on a header that says "Loops (2)". Narrow (the sounds must fail between a render and the press), low severity; the checklist's "side effects of a refused action" row. Not fixed: the build leaves it until `practice.playLoop` can say whether it acted (after Unit 19). When it does, the test's last three expectations flip.
3. **The build's e2e run may not have tested this build.** Port 4383, which the build's "How to verify" names, was being served by `vite preview` from the `le-2-queued-writes` worktree when this stage began, and Playwright reuses whatever answers (`reuseExistingServer`). This stage built this worktree and served it on 4384 instead; the four specs the build lists pass against it (below). AGENTS.md now says to check who is listening before a run with `E2E_PORT`.

**Seen, not bugs**

- With Space the sheet can still be open in the count-in's first frames under a full parallel run (it closes in an effect, a render after the count-in shows; a click on Play flushes sooner). It was always closed by 250 ms, before the second beat, which is where the e2e asserts from.
- The playing loop's item is 412 px tall, taller than the sheet's list (380 px on the phone, 360 on the desktop), so the reopened sheet shows it from its top with its last 32 to 52 px below the edge. Its speed group is all in view.

**Results**

- `npm run check`: green, 145 test files, 5,680 tests (5 more than the build).
- e2e, phone and desktop only, on this worktree's build at port 4384: `E2E_PORT=4384 npx playwright test tests/e2e/loop-scroll.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/loops.spec.ts tests/e2e/count-in.spec.ts --project=phone --project=desktop`: 122 passed, 16 skipped by their own width conditions, twice running. The tablet project and the full suite were not run. No screenshots were rewritten.

**Files**

- `tests/e2e/loop-scroll.spec.ts`: the nine tests above with `sheetAndBarsNow`, `loopSheetBody`, `playingLoopOnShowInSheet`, `openWithBarsOutOfSight`.
- `tests/e2e/shortcuts.spec.ts`: the 13.28a test, renamed and widened.
- `tests/e2e/practicePage.ts`: `addLoops(user, loops)`.
- `src/features/loops/LoopPanel.test.tsx`: four cases, and `renderPanel({ strict })`.
- `src/features/loops/LoopEditorForm.test.tsx`: one case.
- `AGENTS.md`: the port check, and the loop sheet's e2e helpers.

### QA

**How it was run.** This worktree's build (`npm run build -- --mode development`, commit 8393039) served by `vite preview` on port 4383 (free when checked; stopped after), against the worktree's own Supabase stack (API 54421). Chromium through Playwright at 390 x 844 and 1440 x 900, and 820 x 1180 for 13.32 and 13.28b; a 1440 x 480 window for 13.27a on the desktop, as the Test stage used. Groove 120 with twelve loops (eleven of one bar, one of three), which makes the sheet's list 2,300 to 2,850 px in a box of 360 to 472. Two throwaway probe specs measured the page from inside it (the player's status, the sheet's `aria-expanded`, the count-in number's box and what is drawn over its middle, the playing item's parts against the list's edge, the score box's scroll after every keystroke); they were deleted and are not in the commit. No app code changed. No console error or page error in any run. Nothing here can hear the count-in.

Screenshots, in `docs/units/20-shots/`: `b4-phone-count-in-after-play.png`, `b4-phone-repeat-count-in-sheet-open.png`, `b4-tablet-repeat-count-in-sheet-open.png`, `b4-phone-focus-on-header-after-play-loop.png`, `b4-phone-reopened-playing-loop.png`, `b4-desktop-reopened-playing-loop.png`, `b4-phone-reopened-with-finish-prompt.png`, `b4-phone-typed-bars-12-14.png`, `b4-phone-form-hidden-while-playing.png`.

**Acceptance, line by line**

| Line                                                                                                       | Result             | What was seen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| On a phone and a tablet in portrait, any way of starting playback with a count-in shows the number (13.32) | PASS               | Sheet open, 2-bar count-in: Play in the bar, Space with focus inside the sheet, Space with focus on nothing, "Play loop", a loop key while paused followed by Space, Play with the loop form open, Play offline. Each time, 900 ms into the count-in, the sheet is closed, none of the number is under the panel and all of it is in the window (phone: number at 545 to 701, the sheet's header at 742; tablet: 578 to 906, header at 1135). The same on the desktop, where the corner sheet never reached the number anyway. A loop key or "Restart loop" pressed while the loop plays does not count in at all (the count-in is for a start), so there is no number to hide |
| After "Play loop" a keyboard user's next Tab starts from the sheet's header (13.28a)                       | PASS               | Enter on the header opens the sheet; Tab goes New loop, then Play loop, Mark finished, More for each loop. Enter on "Play loop Loop 02": playing, sheet closed, focus on the header ("Loop: Loop 02, Open"), ring 2 px and inside the window at both sizes. Tab: the tab bar's Songs on a phone, off the end of the page on a desktop; never into the closed sheet. Shift+Tab from there comes back to the header, and once more goes to the score box. Space on the header pauses and plays (statuses ready, playing, ready, playing) and never opens the sheet; Enter opens it                                                                                               |
| Reopening the sheet shows the playing loop (13.28b)                                                        | PASS, with issue 2 | Loop 12 of 12 playing, reopened by the header and by "Loop speed": its item starts 8 px under the header at the phone and desktop, its name, its speed fields and all four nudges in view; on the tablet the whole item fits. The window and the score box are where they were (phone 9 / 522, tablet 155 / 408, desktop 287 / 296 before and after). The same paused, and for a loop in the middle of the list                                                                                                                                                                                                                                                                |
| Typing bars 40 to 44 into the form brings bar 40 on screen (13.27a)                                        | PASS               | Phone: with 1 to 14 typed, "12" typed over the first bar takes the score box from 47 to 2,585 px across, bar 12 at its left edge, highlighted; the window does not move and focus stays in the field. Desktop at 1440 x 480: the box goes from 104 to 274 px down. One field alone moves nothing; "99" (no such bar) moves nothing. Offline the same. A bar tapped with the form open is picked where it is: two taps on two bars on the phone (1, then 2: the range became 1 to 2) left the score box and the window exactly where they were                                                                                                                                  |

**The questions the task asked**

- _"Before every repeat", a sheet opened mid-loop, at the repeat's count-in._ The sheet stays open, as built. On a phone the number is wholly behind it (100% of its box under the panel), and so are the score and the "Counting in…" status line: for the length of the count-in the screen shows only the sheet, and the music stops and starts with nothing on show to say why. On the tablet three quarters of the number is under the sheet, and its top shows above the header as a pale arc that reads as a glitch more than as a number (`b4-tablet-repeat-count-in-sheet-open.png`). On the desktop the number is clear of the corner sheet. A one-bar loop at 200% with a one-bar count-in spends about half its time this way; a "−5%" pressed during it landed (200 to 195) and the sheet stayed. The trade is the right one, since closing it would take the speed control from under the finger every pass, and the clicks are still heard. Logged as issue 4 because the count-in is then invisible on a phone.
- _Is anything important hidden under the reopened sheet's edge?_ The speed never is. "Exit loop" is: see issue 2. The "Mark finished?" prompt is in view when it shows (it sits straight under the nudges): all of it on the phone and the tablet, its two buttons cut by 4 px of 44 on the desktop.
- _Bars typed digit by digit._ Each keystroke that makes a range moves the score at once, with no animation. Typing a number from an empty field is fine: "1" then "2" over an empty first bar shows bar 1, then bar 12, and bar 1 is usually where the score already is. Correcting one is where it shows: 12 to 13 by Backspace and "3" goes bar 12, bar 1, bar 13, which on a phone is 2,500 px across and back in two keystrokes. The eyes are on the field and, on a real phone, the keyboard is over half the screen, so it reads as a flicker above the sheet, not as something moving under a hand. Cosmetic; issue 5. A tapped bar never moved in any case tried.
- _The tester's bug 1._ Reproduced to the pixel, and it needs no unusual scrolling: see issue 1.

**Edge cases**

- _Rapid Play / Pause with the sheet open:_ eleven clicks on Play 60 ms apart end counting in with the sheet closed and the number in the clear; ten presses of Space 40 ms apart, focus in the sheet, end paused with the sheet closed and focus on the header. Status, sheet and focus agreed every time.
- _A one-bar loop:_ plays, repeats and counts in before every repeat with the sheet open or closed; nothing stuck.
- _The loop form open when playback starts:_ the sheet closes over it; reopened after Pause, the name and bars typed are still there. See issue 3 for what a tap does meanwhile.
- _Rotation, sheet open, paused (390 x 844 to 844 x 390):_ the sheet takes the content column (580 x 201), and Play from there closes it and counts in with the number in the window. Rotating during a count-in with the sheet opened again leaves the number partly below the 390 px window: that is the rotation item already carried forward from 12 Test, not this batch.
- _Offline:_ "New loop" opens, typed bars scroll, Space closes the sheet and counts in. _Slow network:_ not walked; the batch adds no request, timer or promise.
- _Space in the form's Name field_ types a space and starts nothing.

**As a product** (`docs/product.md`)

- Job 3, work a hard part, is the one this serves. Taps to sound are unchanged: with the sheet open, one tap on "Play loop" or on Play. What changed is what is seen after the tap, and it is better: the number, every time playback starts.
- First-time user, one song, no loops: "Loops (0)" open, Play with a count-in closes it and shows the number; with the count-in off the sheet stays. No new control, no new step, nothing gated.
- Missing a piece: no loop playing, or no loops, means nothing to scroll to and nothing moves on open. No connection: as above.
- No forced order and no chore was added.

**Issues**

1. **Phone: making a loop and playing it moves the score twice (the tester's bug 1).** Minor. Not new for "Play loop"; this batch gives Play and Space with a count-in the same move.
   - Repro at 390 x 844: open a song on the Tab page, open the sheet, press "New loop". The page scrolls by itself so the score sits above the sheet (window at 475, score box top at 118). Type bars 1 to 2 and a name, Save. Nothing has been scrolled by hand. Press "Play loop", or Play in the bar, or Space.
   - At the count-in the score box's top is at 302 (184 px down); after Pause it is at 514 (another 212). The sheet is closed both times.
   - So a user at the kit reaches it every time they make a loop on a phone and play it, which is the main flow of job 3, not a corner.
   - Why minor and not major: the score, the bar cursor and the count-in number are on screen and uncovered at every moment, nothing is lost, and both moves happen at the user's own press of Play or Pause, when no finger is on its way to a bar. What it costs is the eye finding the staff again twice, and, after Pause, the score sitting 396 px lower than where "New loop" had put it: a sheet reopened then (to edit the loop, or to make the next one from the list) lies over the score until the page is scrolled or "New loop" is pressed again.
   - The room is `SongPage.tsx`'s and the fold is `useStaysOnScreen`'s, both outside this batch.
2. **"Exit loop" is below the edge of the reopened sheet on a phone and a desktop.** Minor.
   - Repro: twelve loops, play the last, reopen the sheet (the header, or "Loop speed").
   - The playing item is 412 px tall in a list of 380 (phone) or 360 (desktop). Phone: "Exit loop" is at 770 to 814 with the edge at 787, so 17 px of it show. Desktop: 903 to 947 with the edge at 900, so none of it shows and "More" is the last thing seen (`b4-desktop-reopened-playing-loop.png`).
   - With the "Mark finished?" prompt on show the item is 542 px: "Restart loop", the status button, "More" and "Exit loop" are all below the edge at both sizes (`b4-phone-reopened-with-finish-prompt.png`).
   - One scroll of the list reaches them, and the card visibly runs on past the edge. The tablet's list (472 px) holds the whole item without the prompt.
   - The way back to the whole song is the control a user reopening the sheet mid-loop is most likely after, next to the speed. A sheet a little taller, or "Exit loop" on the row with "Restart loop", would show it.
3. **Play with the loop form open hides the form, and taps on the score then change its bars unseen.** Minor. New with this batch (before it the sheet stayed open over Play).
   - Repro, either size, count-in 1 bar: "New loop", pick or type bars 1 to 2, type a name, press Play in the bar to hear the passage before saving.
   - The sheet closes; its header says "Loops (1)" and nothing says a form is open. The whole song plays from the cursor, not the picked bars. Tap a bar to jump to it: the player does not seek; the hidden form's bars change (1 to 2 became 2 to 2 on the phone, 1 to 1 became 1 to 2 on the desktop), and the dashed highlight on the score is the only sign (`b4-phone-form-hidden-while-playing.png`). Reopened, the form holds bars the user did not knowingly pick.
   - The Build notes this as a decision ("taps on the score go on picking bars"). It is correct by the page's either-or rule and awkward: a mode the user cannot see. The header naming the open form ("New loop" in place of "Loops (1)"), or a tap seeking while the sheet is closed, would end it. With the count-in off the sheet stays open and none of this arises.
4. **Phone and tablet: a repeat's count-in is invisible behind a sheet opened mid-loop.** Minor; deliberate (Build, Decisions), and the trade is right. On the phone nothing on screen says a count-in is running; on the tablet the top of the number shows over the sheet's header as an arc. A beat count in the sheet's header while it is open over a count-in ("Loop: Verse · 3") would say it without closing anything. Shane's call whether it matters at the kit; the clicks are heard.
5. **Correcting a typed bar number flashes the score to another bar and back.** Cosmetic. Repro on a phone: bars 12 to 14 typed, then Backspace and "3" in the first bar: the score shows bar 12, bar 1, bar 13. Not fixed here: the cure is a short wait before scrolling, which is a timer in `LoopEditorForm.tsx` with its own tests, more than a cosmetic change.
6. **Keyboard: the first Tab into the reopened sheet throws the list back to its top.** Minor; long lists only. Repro: twelve loops, play the last with the keyboard, Enter on the header (the list shows Loop 12), Tab. Focus goes to "New loop" and the list's scroll goes from 2,410 to 0; Loop 12's speed is then 33 more Tabs away. "Loop speed" in the controls bar opens the sheet with focus on the speed group, so there is a way round, but the header is where 13.28a now leaves focus.
7. The tester's bug 2 (a "Play loop" the player refuses still closes the sheet and moves focus) was not reproduced in a browser: it needs the sounds to fail between a render and the press. Left as logged, low.

Nothing cosmetic was fixed in this stage: issue 5 is the only cosmetic one and its fix is not a cosmetic change.

**Human check** (for Shane, on a real phone at the kit; nothing in this batch was heard)

- With a 1-bar and a 2-bar count-in, sheet open: Play, and "Play loop". Is the number readable the moment the sheet drops away, and does the first click come with it?
- "Before every repeat" on, open the sheet mid-loop for the speed: is hearing the count-in without seeing it enough (issue 4)?
- Make a loop on the phone and play it: does the score moving at Play and again at Pause bother you (issue 1)?
- Type a loop's bars with the phone's own keyboard up: is the score moving above the sheet a help, and is the flash on a correction noticed (issue 5)?
- Safari and Firefox: everything here ran on Chromium only. Safari in particular for the focus hand-over (a button pressed with a mouse or a finger is not focused there, so focus may already be outside the sheet).

**Verdict: PASS.** All four acceptance lines pass at the sizes asked. No blocker and no major issue; five minor (1, 2, 3, 4, 6) and one cosmetic (5) for Shane or a later batch.

**Throwaway users** (sixteen, created by the probe specs' `user` fixture and deleted by it, files first; a listing of every user afterwards found none with the probes' prefix): d0d17a93-af75-464c-a9b3-b9569165c8f5, fd542ee2-a6ba-4068-a617-e80555497a48, 24b414ce-6a9f-4c3c-b407-5884132526e7, 1cf13925-8bf6-4811-a94d-df57a7ca0691, a648f5f1-bcd3-4d55-ae99-6ef169b9ba95, 1314801f-22fc-41d2-a399-5cda64ddd4e6, dd6533d9-7b53-4f30-adf5-120a4163dde2, 23f17367-7382-4c70-b352-40cad3d23689, ceae86ec-26d7-4055-ae92-b37a1a217f08, 71c2f0f3-5ba7-4378-b2ed-9bcc22e40cde, b84ac4d6-5fcf-402c-a7eb-2b0227002507, 553225d0-de93-4ecd-a4c2-cceb8aa83019, bd3a2a97-c698-46e4-9d5d-28d984616714, d19fe960-b1a2-43c1-bfde-dfcdbd45f06a, 58799e11-9d25-45d2-a3b6-836f7508091b, b2cd73e1-4b48-436d-afa9-800aedbe3e4f.

### Review

Reviewed every line of `git diff origin/main...HEAD` after merging `origin/main` (batches 1 and 2; one conflict, in this note, both sides kept in the order Batch 1, 2, 4). Three fixes, each with a test that failed first; one of QA's issues fixed as the orchestrator asked, one of Test's fixed where it had been set down for acceptance (said below, with the reason).

**Inventory** (the stateful pieces the batch added or changed)

- `countInClosesPanel(before, now, { formOpen })` in `useLoopPanelOpen.ts`: a pure rule.
- `LoopPanel`: `closeForPlayback` (close, hand focus on), the "Play loop" handler, the status effect (a ref of the status before), the layout effect on `open` with `showPlayingLoop`.
- `LoopEditorForm`: `showTypedBars`, called from `editBars`; from this stage the `typedBeforeSounds` ref and its effect.
- Tests and helpers: `LoopPanel.test.tsx`, `LoopEditorForm.test.tsx`, `useLoopPanelOpen.test.ts`, `useLoopPractice.test.tsx`, `SongPage.test.tsx`; e2e `loop-scroll.spec.ts`, `shortcuts.spec.ts`, `practicePage.ts` (`addLoops`, by the service role).
- No mutation, migration, script, engine listener, timer or request.

**Findings**

1. **A count-in closed the sheet over the open loop form, hiding a mode** (QA issue 3; checklist 6, new row "A mode whose only sign has been hidden"). `LoopPanel.tsx`, the status effect; `useLoopPanelOpen.ts`, `countInClosesPanel`. With the form open the score's taps pick its bars, and the page itself opens the sheet whenever a form opens (`SongPage`'s effect on `pickingBars`), so a sheet closed over the form was the one state in which that mode had no sign. Fixed: the rule takes `{ formOpen }` (`practice.editor !== null`, the same condition the page turns seek-on-tap off by) and is false while it is true, which is how it was before the batch. Tests, failing first: three rows in `useLoopPanelOpen.test.ts`; in `LoopPanel.test.tsx` "Play with a count-in leaves the sheet open while the loop form is open, with focus where it was" (replacing the Build's "closes it with the loop form open too") and "once the form is cancelled, the next start with a count-in closes the sheet again". e2e: "bars typed while the song counts in or plays…" asserted the form case (Play closed the sheet, the test reopened it); it now reads status and sheet in one instant half a second into the count-in and finds the sheet open and the form on show. What it leaves is Accepted 20.4e: with the form open the number is behind the sheet, as 13.32 was.
2. **A refused "Play loop" still closed the sheet and moved focus** (Test bug 2; checklist 2, "Side effects of a refused action"). `LoopPanel.tsx`, `playLoop`. The orchestrator's call was to accept it, on the Build's reading that the fix needs `practice.playLoop` to report whether it acted (`useLoopPractice.ts`, which Unit 19's branch edits). Overruled, because it doesn't: the refusal that an enabled button can meet is `canPlay`, which is exported and is the predicate `playLoop` itself asks "of the player at the press". The handler now asks the same (`canPlay(player, player.getSnapshot())`) before it closes anything, and reads the status for `playLoopClosesPanel` from that same live snapshot. Three lines, no change to the hook. Test: the Test stage's pinned case, its last three expectations flipped as its comment said they would ("starts nothing, closes nothing and moves no focus"); it failed until the fix. `playLoop`'s other refusal, a range the song lacks, can't be reached from a listed loop (the database checks `end_bar` against `bar_count`).
3. **Bars typed before the sounds are in were scrolled to later, whatever the form held by then** (checklist 1, "Asked before it can be done, then forgotten", extended with this case). `LoopEditorForm.tsx`, `showTypedBars`. The form opens from the score's load on (`canPickBars`), before the sounds. `player.showBar` asked then keeps the bar and scrolls to it when the song is ready; nothing but `setRange` drops it. So bars typed in that window, then cleared, changed by a tap or abandoned with Cancel, still moved the score when the sounds came in: seconds later on a first visit, or minutes later after a failed soundfont came back with the connection (`retrySoundFont`), under whatever the user was doing then. The Build's window 4 named the kept request and had no test of it. Fixed in the form (the service is not this batch's): before the sounds are in the form keeps the typed range itself (`typedBeforeSounds`), and when they come it shows the bar only if the form still holds that range; a form that has gone keeps nothing. Tests, in `LoopEditorForm.test.tsx` under "typed before the sounds are in": shown once when they come (passed before, through the service); not shown after the field was cleared, and not after the form unmounted (both failed before the fix).
4. **A test left a button on the page if it failed** (checklist 7, test teardown). `LoopPanel.test.tsx`, "hands focus to the header when it was in the sheet…": the `outside` button appended to `<body>` was removed on the last line only. Now in a `finally`.
5. **`LoopPanel`'s doc comment described a column from 1024 px and a `loopPanelLayout.ts` that no longer exists.** Rewritten (the Build left it for a Readability stage this batch doesn't have).

Looked at and left:

- _The status effect reads `open` and `formOpen` from the render the status changed in._ Right: "Play loop" closes the sheet in the same batch as the press, so the effect finds it closed; StrictMode's second run sees the same status before and after (tested).
- _The repeat order_ (Build, Known gaps: "stopped, then finished" would read as a new start and close the sheet). alphaTab sends `finished` first; the e2e "before every repeat…" reads every frame of two repeats' count-ins in Chromium with the real engine and finds the sheet open. Nothing to fix without evidence of the other order.
- _`showPlayingLoop` measures in a layout effect on `open`._ The body's `hidden` is off in the same commit, so the boxes are real. A list still loading when the sheet opens has no item and is not scrolled when the loops arrive (once per opening); the Tab page's loops are read with the page, long before a loop can play.
- _A form cancelled or saved during a count-in that left the sheet open:_ the sheet stays, as for any sheet open during a count-in (20.4e says so).
- _`addLoops`_ checks both errors and goes by the service role on purpose (the column grants are the app's). Its `.single()` holds because every spec that uses it uploads one song.
- _Bars:_ `showBar(typed.startBar)` is 1-based into a 1-based API; the tests' `scrollToBar(12)` for bar 13 is the engine's 0-based index. No boundary added.
- _Vacuous tests:_ the Test stage's table of breaks covers the batch's own tests. Each test added or changed here was run before its fix and failed (findings 1 to 3).

**What became of each logged issue**

| Issue                                                                                                               | Outcome                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA 1 / Test bug 1: on a phone, making a loop and playing it moves the score 184 px at the count-in and 212 at Pause | Not this batch's files (`SongPage.tsx`, `useStaysOnScreen`). `[FIX 20.4a, batch 3]` in Unit 13's Carried forward list with the repro and figures, and an item, test and acceptance line in Batch 3 of `docs/loose-ends.md`, which now runs after this batch                                                                                                              |
| QA 2: "Exit loop" below the reopened sheet's edge                                                                   | Accepted, 20.4b                                                                                                                                                                                                                                                                                                                                                          |
| QA 3: Play with the loop form open hides the form                                                                   | Fixed, finding 1; its remainder is Accepted 20.4e                                                                                                                                                                                                                                                                                                                        |
| QA 4: a repeat's count-in behind a sheet opened mid-loop                                                            | Kept as built. Decision **D9** in `docs/loose-ends.md` (A as built, B every count-in closes, C a beat count in the header), in Unit 20's list in the plan, and in "Decisions built as defaults" at the top of this note                                                                                                                                                  |
| QA 5: correcting a typed bar flashes the score                                                                      | Accepted, 20.4c                                                                                                                                                                                                                                                                                                                                                          |
| QA 6: the first Tab into the reopened sheet throws a long list back to its top                                      | Accepted, 20.4d. Not a few lines: the scroll is the browser bringing the focused "New loop" on show. Focusing it with `preventScroll` would leave focus on a button out of sight (worse), and sending the header's Tab to the playing loop changes the sheet's Tab order, which is a design choice with its own tests. "Loop speed" in the controls bar is the way round |
| Test bug 2 / QA 7: a refused "Play loop" closes the sheet and moves focus                                           | Fixed, finding 2 (overruling "accept"; reason there)                                                                                                                                                                                                                                                                                                                     |
| Test bug 3: the Build's e2e may have run another worktree's build                                                   | Already in AGENTS.md (the port check). This stage checked port 4383 was free before each run                                                                                                                                                                                                                                                                             |

**Docs**

- `docs/plan.md`: deleted from Unit 13's Carried forward the lines for 13.27a, 13.28a and 13.28b, and 13.32 (D1 had no line of its own); added `[FIX 20.4a, batch 3]`; Unit 20's batch 4 marked done and batch 3 given 20.4a; D1 marked built and D9 added to Decisions for Shane; Accepted gained 20.4b to 20.4e under "The Tab page's loop sheet"; the "Count-in on screen" row of Open human checks rewritten for the sheet as it now behaves.
- `docs/loose-ends.md`: Batch 4 marked done, with what was built differently from its lines; Batch 3 gained 20.4a (item, fix, test, acceptance, files, order); D1 marked built; D9 added; the proposed human-check row matched to the plan's.
- `docs/review-checklist.md`: one new row (6, "A mode whose only sign has been hidden") and one extended (1, "Asked before it can be done, then forgotten": a kept request that outlives its reason).
- `AGENTS.md`, Loops, the UI paragraph: the form-open exception and that any new way of closing the sheet makes it too; "Play loop" asking `canPlay` at the press; the form keeping bars typed before the sounds are in, and the rule for any caller of `showBar` whose reason can go away.
- This note: "Decisions built as defaults" at the top (D1, D9).

**Open issues**

None beyond the lines above (20.4a for batch 3; 20.4b to 20.4e accepted; D9 for Shane).

**Checks**

- `npm run check`: green. 146 test files (145 passed, 1 skipped), 5,731 tests (5,729 passed, 2 skipped; the skips are main's), after the merge of `origin/main`.
- e2e, phone and desktop only, on this worktree's build at port 4383 (free when checked with `netstat` before the run; the server stopped with the run): `E2E_PORT=4383 npx playwright test tests/e2e/loop-scroll.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/loops.spec.ts tests/e2e/count-in.spec.ts --project=phone --project=desktop`: 122 passed, 16 skipped by their own width conditions. The tablet project and the full suite were not run. No screenshot was rewritten.
- `npm run test:db` was not run: the batch touches no table, policy or grant.

### Copilot review

Three comments on PR #38, all confirmed, each with tests that failed first.

**A. A scroll request kept for the render outlived the bars it was for** (comment 4726364000, `LoopEditorForm.tsx`; checklist 1, "Asked before it can be done, then forgotten", extended). Review's finding 3 covered bars typed before the sounds are in. With the sounds in and the notation not yet drawn (`engine.scrollToBar` false: a re-layout), `player.showBar` still kept the bar for `rendered`, and a field cleared, other bars picked on the score, or Cancel left it to move the score.

- Service: `showBar(barNumber)` now returns a function that drops the request while it is still kept. It drops only its own: a counter (`showBarRequests`) moves on at every `showBar` and at every count-in's scroll, and an older drop then does nothing. The kept bar is re-asked on `readyForPlayback` and `rendered` through the private `requestShowBar`, so it stays its first asker's to drop. Other callers ignore the return, as their bar is the range's and `setRange` drops it.
- Form: `shownBars` holds the range asked for and its drop. It is dropped before every new request, by an effect once the form's range is no longer that range (which covers bars picked on the score, which don't pass through the form), and on unmount.
- Tests: `PlayerService.showBar.test.ts`, "a kept showBar dropped by the one who asked" (kept for the render, kept for the sounds, after a render with no bounds, a newer request left alone, a count-in's scroll left alone, harmless after the bar was shown); `LoopEditorForm.test.tsx`, "typed while the score is still being drawn" (sounds ready, `engine.laidOut = false`: still held and shown; cleared; picked on the score; closed; another caller's bar survives the form closing). The harness `Form` now takes score taps as the page does.

**B. A repeat's count-in closed a sheet opened mid-loop when "stopped" came before "finished"** (comment 4726364016, `useLoopPanelOpen.ts`; new checklist row 1, "A cause read off two states in a row"). Review left this for want of evidence of the order; `PlayerService.countInEdges.test.ts` ("counts in when alphaTab reports stopped before finished, too") already holds the service to it, and the two events are separate tasks, so React can draw the `ready` between them. `countInClosesPanel` then saw `ready` to `countingIn` and closed the sheet.

- Service: `snapshot.countInCause` (`'start' | 'repeat' | null`), set by `beginCountIn` where each count-in starts (`countInBeforeRepeat` passes `'repeat'`; from `ready` it is `'start'`; a seek that restarts a count-in keeps what it had) and cleared in `update()` whenever the status isn't `countingIn`, so no way out of a count-in can leave it behind.
- Rule: `countInClosesPanel(before, snapshot, { formOpen })` closes only for `countInCause === 'start'`; `LoopPanel` passes the snapshot.
- Tests: `PlayerService.countInEdges.test.ts`, "the snapshot says what a count-in is for" (Play, both event orders at a pass end with the `ready` in between, a seek in each kind, Pause then Play in a repeat's count-in); `useLoopPanelOpen.test.ts`, the table now over the snapshot, with the row `ready` to a repeat's count-in; `LoopPanel.test.tsx`, "a repeat's count-in leaves the sheet open when the page drew the stop before the pass end", which renders between the two events.

**Async windows and inputs**

- _A `showBar` kept by the service_ (until `readyForPlayback` or `rendered`). The asker's drop: the request goes, if it is still the latest. Another `showBar` or a count-in: theirs replaces it and the first asker's drop does nothing. `setRange`, `load`: dropped as before; a drop after that sets null over null. A drop after the scroll was done, twice, or after dispose: nothing.
- _Between "stopped" and "finished" at a pass end_ (status `ready`, `countInCause` null). A render: the sheet stays as it is. Pause there: `haltRequested`, no count-in, as before. Play there: a `'start'` count-in, which closes the sheet, as a press should.

**Files:** `src/features/player/PlayerService.ts` (additions only, for Unit 19's branch: one snapshot field and type, one counter, `showBar`'s wrapper, a default parameter, two lines in `beginCountIn`, three in `update`), `src/features/loops/useLoopPanelOpen.ts`, `LoopPanel.tsx` (one argument), `LoopEditorForm.tsx`, the five test files above, `AGENTS.md` (Count-in, Loops), `docs/review-checklist.md`. `playerEngine.ts` and `fakePlayerEngine.ts` are untouched.

**Checks (A and B):** `npm run check` green (146 test files: 145 passed, 1 skipped; 5,749 tests: 5,747 passed, 2 skipped). e2e on this worktree's build at port 4383 (free when checked with `netstat` before the run, the server gone after it), phone and desktop: `loop-scroll`, `shortcuts`, `loops` and `count-in` specs, 122 passed, 16 skipped by their own width conditions. Tablet and the full suite not run. No screenshot was rewritten.

**C. "Play loop" closed the sheet for a loop the hook refused** (comment 4726400988, `LoopPanel.tsx`; checklist 2, "Side effects of a refused action", extended). Review's fix for Test's bug 2 had the handler ask `canPlay` at the press, a copy of one of `practice.playLoop`'s refusals. `playLoop` has three: no player or no bar count yet, `canPlay` false at the press, and `isValidBarRange` false for the loop against the loaded score. A saved loop ending past the loaded score's last bar took the third: nothing played, and the sheet closed with focus moved to its header. The database's trigger holds `end_bar` to `songs.bar_count`, which upload read from the same file, so it needs the stored count and the loaded score to disagree (a file alphaTab counts differently after an upgrade, a row cached from before an edit); rare, but the handler was wrong for any refusal it didn't copy.

- Hook: `playLoop` returns whether it acted (`false` at each of the three refusals, `true` after `player.play()`). Four lines changed and two added in `useLoopPractice.ts`, nothing moved, for Unit 19's branch. The loop keys (`useSongShortcuts`) ignore the answer, as they do nothing after it.
- Panel: the handler reads the status before the press (the press changes it), calls `playLoop`, and closes only if it answered true and `playLoopClosesPanel(statusAtPress)`. It no longer asks `canPlay` itself.
- Test: `LoopPanel.test.tsx`, "a Play loop refused for bars the loaded score lacks starts nothing, closes nothing and moves no focus" (16 bars ready, a loop of bars 13 to 17; then "Play loop Intro" plays and closes, so the press is heard). It failed on `aria-expanded="false"` before the fix. The earlier test of a press after the sounds failed still passes.
- Known gap, not changed: such a loop's "Play loop" is drawn enabled (`canPlay` alone) and a press says nothing. Disabling it needs words for why, which is a design choice; the case needs the mismatch above.

**Async windows and inputs (C):** none added. `playLoop` is synchronous inside the tap; the status is read before it and its answer after, in one handler.

**Checks (C):** `npm run check` green (146 test files: 145 passed, 1 skipped; 5,750 tests: 5,748 passed, 2 skipped). e2e at port 4383 (free before, no listener after), phone and desktop, `loop-scroll`, `loops` and `shortcuts` specs: 101 passed, 16 skipped, 1 failed on the phone (`loop-scroll.spec.ts`, "bars typed while the song counts in or plays…", 13.27a, which presses no "Play loop"); run again three times alone it passed three times. Tablet and the full suite not run.

## Batch 5: Practice history says what happened

### Build

Items 17.1 and D4 (13.18b), D4 built as its recommendation, option B. No migration: sessions are stored as before.

**Walk-through (docs/product.md)**

- _Day one, one song:_ a loop never practised still says "No practice logged yet…". After the first sitting with two pauses its History is one row, "Today", with the sitting's whole time, instead of three rows that look like three practices.
- _A missing piece:_ a song with no tab has no loops and no History; a loop whose tempo isn't known shows the percent alone, as before. Neither change assumes anything new.
- _Offline:_ History opened offline with nothing cached still says it shows once online; a cached history is grouped on the device. A session logged offline carries the tracker's speed through the outbox like every other field.
- No order is forced and no chore added: nothing asks the user anything.

**17.1: a session's speed is the speed most of it was played at**

- `sessionTracker.ts`: `OpenSession` gains `speedTimes`, the banked play time per speed. A stretch is banked (`withStretchBanked`) at every stop, count-in, departure and, new, at every change of speed while sounding, always under the speed the tracker had (the speed it was played at), never the speed that arrives in the same step. The record's speed is `mainSpeedRatio`: most play time, the later-played on a tie.
- Speeds are told apart as the whole percent the app shows (review checklist: compare what is shown), and the entry keeps the exact ratio played last of that percent, so a typed BPM (0.708333) is still what is logged.
- `usePracticeTracker.ts` needed no change: all three ways out (the mutation, `logSessionUnobserved`, `logSessionOnExit`) already send `step.ended`, the tracker's record. The triage's risk note was checked and holds; tests now pin it for each path.
- The sitting (`sittings.ts`, the overview's "80% → 100%") still reads the speed the loop was opened and left at. Unchanged, as the triage says.

**D4: History is one row per day**

- `sessions.ts`: `historyDays(sessions, now, locale?)`, pure: device-local days, newest first; each day's time and passes added up; its speed the one with the most play time, the slower on a tie, which is Unit 17's chart rule (`dailySpeeds`). A test compares the two functions over a table so they can't drift.
- `LoopHistory.tsx` draws it: "Today · 8 min · 80% (96 BPM) · 53 passes". The summary line is "3 days · 25 min in all"; "Show all N days" after ten days. No clock time on a row (a day has none).
- `practiceTimeLabel` had no other user and is removed with its test.

**Files touched**

- `src/features/practice/sessionTracker.ts`, `sessionTracker.test.ts`
- `src/features/practice/sessions.ts`, `sessions.test.ts`
- `src/features/practice/LoopHistory.tsx`
- `src/features/practice/usePracticeTracker.test.tsx` (tests only), `sittings.test.ts` (a fixture field)
- `src/features/loops/LoopPanel.test.tsx` (the History describe)
- `tests/e2e/practice.spec.ts` (the two History assertions: "1 day", a row starting "Today ·")
- `AGENTS.md` (Practice sessions: the speed rule, `historyDays`)

**Decisions**

- A session's tie goes to the later speed (the triage); a day's tie goes to the slower (Unit 17's rule). They are different questions: within one session the later speed is where the drummer settled; across a day the chart already reads a tie as the slower, and History must agree with the chart.
- The day rule is written again in `historyDays` rather than shared with `dailySpeeds`, to stay out of `src/features/stats/` in this batch; the equality test is what holds them together. History also needs the exact ratio (for the BPM), which `dailySpeeds` doesn't keep. Readability may want one shared function.
- A change of speed mid-play now banks the stretch. One visible side effect: after a device clock set back mid-stretch, time played before a speed change is kept (it was lost before, with the whole stretch). Total play time is otherwise identical: `playedMsAt` is unchanged and a test asserts it across a speed change.
- A session dated ahead of the device's clock (the server allows up to a day) joins today's row, since `practiceDateLabel` reads it as "Today" and two "Today" rows would be the thing D4 removes. The Stats chart puts such a session on its own later day; the equality test leaves that case out.
- A speed set while paused, or arriving in the same step as the stop, has no play time and so is never the logged speed unless something is then played at it.
- `docs/plan.md` not edited (rule of this batch). **For the reviewer:** the Data model row for `practice_sessions.speed_ratio` says "Speed at the end of the session"; it should read "The speed most of the session was played at (the later on a tie)". Unit 09's line "Loop history: date, duration, speed" is now per day.

**Async windows and inputs**

No async window was added. The ones the change passes through:

- _A session on its way (mutation pending, keepalive unanswered, waiting offline):_ the record is built once by the tracker before any send; a speed change, Play, a loop switch or a hide during the send belongs to the next session and can't alter the row in flight. Retries and the outbox replay send the same record.
- _Loop and speed changing in one render ("Play loop" on another loop):_ the old loop's stretch is banked under its own speed; the new loop's speed only opens the new session. Tested in the tracker and the hook (a third speed arriving with the switch).
- _Stop and speed in one step:_ banked under the old speed (tracker test).
- _History open while a session is logged:_ `sessionLogged` adds the row to the cached list as before; the list regroups on render, so today's row grows rather than a row being added. A background refetch that fails keeps the days on show (`isLoadingError`, existing test).
- _History open past midnight:_ "Today" is worked out at render, as before; nothing redraws it at midnight (the class of 17.4b, batch 9). Not made worse.

**Known gaps**

- Sessions logged before this change keep the end speed they were stored with; nothing rewrites them.
- A day row doesn't say how many sessions it holds; if Shane wants "3 sessions" back it is one more field on `HistoryDay`.
- `tests/e2e/design.spec.ts` ("song, loop history") and `stats.spec.ts` were not run here; neither's assertions read the changed text, and no stats code changed.

**Verify**

- `npm run check`.
- `E2E_PORT=4383 npx playwright test tests/e2e/practice.spec.ts --project=phone --project=desktop`.
- By hand: practise a loop at 80% for a while, nudge to 100% for a few seconds, pause: the row in `practice_sessions` has 0.8. Pause and play a few times past the minimum: the loop's History (More, Show history) shows one "Today" row whose time is the sum, and the summary says "1 day".

### Test

55 unit and component tests and 2 e2e cases added over Build's. No app code changed. No bugs found.

**Per acceptance line**

- _A session's logged speed is the speed most of it was played at._
  - `sessionTracker.test.ts`, "the speed of a session, window by window" (13): ten changes of speed in one session, with the banked time checked against the play time at every change (nothing lost, nothing counted twice); one entry per speed shown however often it is gone back to; a speed set during the first count-in, during the count-in before a repeat, and arriving in the same step as that count-in; a session still under the minimum carried across two pauses at 60%, 75% and 60% again (logged at 60% with its first start and all 36 seconds); one taken past the minimum by a try at 100% (logged at 60%); a typed BPM's exact ratio (0.708333) logged when most of the time was at it and two other speeds came after; a logged session, a dropped short one and another loop each leave none of their time to the next session; a hidden page's stop (`trackerPhase('playing', true)`) with the Unit 17 case; a speed reported again unchanged moves nothing. Build's describe already has the Unit 17 case itself, the tie to the later speed, and the tie with a speed gone back to.
  - `usePracticeTracker.test.tsx`, "the speed of a logged session, window by window" (11), through the real hook and player:
    - The three ways out (the mutation at a pause, `logSessionUnobserved` as the screen goes, the keepalive from a hidden page) send rows equal in every field but the id, 0.708333 in each.
    - Later sends carry the row as built: a keepalive that failed is sent again by the mutation as the same row though a key changed the speed on the hidden page meanwhile; "Try again" after a failed log sends the row that failed, not one at the speed set since; a log waiting offline sits in the outbox with that speed and is logged with it.
    - A log on its way: a speed change and a second sitting during it leave the row in flight as sent, and the second row has none of the first's time.
    - A speed set during a count-in and in the count-in before a repeat (the real `countingIn` status); a short session across pauses at different speeds; a short session ended by hiding the page after a try at 100%; a speed set while the page is hidden gets no play time from the hour in the pocket.
    - StrictMode: one row, at the speed most of it was played at.
  - e2e, `practice.spec.ts`, "a sitting mostly at 80% with a last try at 100%…": a loop saved at 80%, about ten seconds played, four nudges to 100% while playing, two seconds more. The database row has `speed_ratio` 0.8; the loop's own saved speed is 1; the overview's summary says "Fill: 1x s, 80% → 100%"; the loop's line says 100%; its History on the overview says "Today · … · 80% · n passes".
- _A loop's History shows a day once with its total time._
  - `LoopHistory.test.tsx` (new, 16), the component alone with the clock faked, whole rows asserted: one sitting with pauses is "Today · 8 min · 80% (96 BPM) · 53 passes" and "1 day · 8 min in all"; six sessions on four days, a try at 100% among them, as four rows newest first; each day once in a `<time datetime>` with no clock time; a sitting across midnight as two rows; no tempo known shows the percent alone; a typed BPM (0.775, "78% (93 BPM)", where 78% of 120 would be 94); a session ahead of the clock in the one "Today" row. The preview: 39 sessions on 13 days show ten rows, a total of all 13, and "Show all 13 days"; ten days of forty sessions offer nothing more; eleven days offer the eleventh.
  - With the history open while a session is logged (`sessionLogged`, as a pause does): today's row grows and there is one "Today", before the list is read again and after; the day's first session adds its row above the older days; a long session at another speed changes the speed the row says; the same session heard of twice is counted once; a first session ever replaces "No practice logged yet"; "Show all" stays pressed.
  - e2e, `practice.spec.ts`, "a loop's History is a row per day…": 15 sessions written by the service role on 13 days (last night at 23:50, three today from the day's first minute with a 40-second try at 100%, eleven older days). The panel shows "13 days · 1 h 6 min in all", ten rows, "Today · 4 min 40 s · 80% (96 BPM) · 29 passes", "Yesterday · 6 min 40 s · 70% (84 BPM) · 15 passes", no time of day, no text outside the box; "Show all 13 days" gives 13 rows. Then, the history still open, six seconds are played: the database has 16 sessions, there is still one "Today" row, and it says the old total plus the new row's seconds and passes, after the refetch too.
- _Stored sessions are unchanged._ Every row the tests send is compared whole against the tracker's record (`theRow`); the columns test in `sessions.test.ts` is Build's. The e2e cases read the rows back with the service role.
- _The Stats page's numbers for the seed user still match `stats.spec.ts`._ Run, not changed: 14 of 14 at phone and desktop, the seed-user test among them (the seed user is on this stack; nothing was seeded or reset).

**`historyDays` against the Stats chart's `dailySpeeds`** (`sessions.test.ts`, "historyDays beside the Stats chart", 15)

- Eight ties on one day, each run through both functions and against the answer worked out in the test (the slowest of the speeds with the most time): the slower played first, played last, three level, level only once a speed gone back to is added up, a typed BPM against the percent above it, two ratios of one percent together against a faster speed, ratios either side of a half percent, 25% against 200%. Each also in reverse order.
- Three months of sessions made up by a fixed rule (over a hundred sessions on more than fifty days, few distinct lengths and speeds so ties are common), in two orders: the two agree on every day, speed and time.
- The days add up to the summary line's total with every session in one day; a sitting across midnight; `historyDays` leaves its input alone.
- The one difference, pinned: a session dated on a later day than the device's today. History counts it in today's row ("Today", one row); the chart gives it a point on that later day. With nothing else today History still says "Today" for it. Once the clock reaches that day the two agree again. A session later today by the clock is not moved.

**Checked by breaking the code** (each restored; `git status` shows no app file changed)

| Break                                                                               | Tests that failed                                                    |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| The record takes the speed the session ended on (the old rule)                      | 22 (9 tracker, 13 hook), and the e2e case (`speed_ratio` 1, not 0.8) |
| A tie goes to the earlier speed                                                     | Build's two tie tests                                                |
| A change of speed mid-play banks nothing                                            | 18 (8 tracker, 10 hook)                                              |
| A stop or count-in banks under the speed that arrives with it                       | 2, the count-in one new                                              |
| Leaving the loop banks under the speed that arrives with it                         | 3 (Build's and Unit 09's)                                            |
| Speeds told apart by exact ratio; the first ratio of a percent kept                 | 1 each (Build's)                                                     |
| `historyDays`: a session ahead of the clock keeps its own day                       | 4 (2 new, the component's, Build's)                                  |
| `historyDays`: a tie to the faster speed                                            | 10 (7 of the 8 tie rows, the made-up season, Build's two)            |
| `historyDays`: the fastest speed; the speed played last                             | 14; 11                                                               |
| `historyDays`: days by UTC date                                                     | 14 (run in a zone west of UTC)                                       |
| `historyDays`: exact-ratio speeds; first ratio kept; passes not added; oldest first | 3; 1; 11; 17                                                         |
| `historyDays`: a day's time is its last session's                                   | the e2e case ("Today · 40 s")                                        |
| `LoopHistory`: eleven days on show; no BPM; the total of the rows on show           | 2; 13; 1                                                             |

One break changed nothing and is not a gap: dropping "a speed set while paused is the speed the next stretch plays at" from the stop branch. The next "sounding" step takes the speed from its own input, so that line only sets what an unplayed session would be logged at, and an unplayed session is never logged.

**Seen while testing** (none is a bug)

- _History and the chart on a session ahead of the clock._ A user would see it as a loop whose History says "1 day" while its Stats row says "2 days" and its chart has a point on tomorrow, until tomorrow comes. It needs a session whose start is on a later local day than the viewing device's today: a device clock set ahead when it was logged (the server allows a day) or put back since. Time zones alone don't do it (a start is an instant, and it is never after now on a right clock). The Stats heatmap already draws days after today empty, so Stats is not of one mind either. Left as Build decided; for Review to weigh whether the chart should fold such a day into today as History does.
- _A tie inside a session and a tie inside a day go opposite ways_ (later; slower), as Build decided. A session of 20 s at 90% then 20 s at 70% is logged at 70% (the later) and a day of two such sessions reads 70% (the slower), so they agree whenever the drummer ends on the slower speed, and differ only when equal time ends on the faster.
- _The design spec's "song, loop history" state is the empty history_ ("No practice logged yet"), so it never drew a day row before or after this batch. The new History e2e case checks the rows for text outside the box at phone and desktop; contrast and target size of a row are those of the text it had (`text-ink-muted` on `surface`, no control in a row).
- The seed-user Stats test passes in under a second; it does check the numbers (it throws if the seed user or their sessions are missing).

**Not covered**

- Tablet e2e, the full e2e suite and `npm run test:db`, by instruction. Safari, Firefox, a real device.
- History open past midnight (nothing redraws "Today"; Build's note, batch 9).
- Sessions stored before this change keep the end speed they were logged with; no test can tell them from new ones.

**How to verify**

- `npm run check`: green, 146 files, 5767 tests passed, 2 skipped.
- `E2E_PORT=4383 npx playwright test tests/e2e/practice.spec.ts tests/e2e/design.spec.ts tests/e2e/stats.spec.ts --project=phone --project=desktop`: 64 passed, 4 skipped (the phone-only cases on desktop). By spec: practice 27, design 23, stats 14.

### QA

Walked with Playwright (Chromium) on a development build at `E2E_PORT=4383` against this worktree's stack (API 54421), at 390x844 and 1440x900, and at 820x1180 for the History list. Throwaway users only; sessions on earlier days written by the service role (`addSessions`). A loop's History shows in two places: the song overview (More, Show history: percent only) and the Tab page's loop sheet (percent and BPM). The practice screen has none. Screenshots: `docs/units/20-shots/b5-*.png` (9).

**Verdict: PASS.** No blocker or major issue. Three minor issues, one of them a product call for Shane (issue 1); one cosmetic issue fixed.

**Per acceptance line**

| Line                                                                         | Result | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A session's logged speed is the speed most of it was played at               | Pass   | Practised on the practice screen at phone and desktop: 12 s at 80%, four nudges to 100% while playing, 3 s more, Pause. One row, `speed_ratio` 0.8, 15 s, 3 passes; the loop saved at 1. Also the two other ways out, at desktop: 8 s at 80% then 2 s at 100% and the page hidden (row at 0.8); then 6 s at 100%, 2 s at 80% and the back link pressed while playing (row at 1).                                                                                                                                                                                                                   |
| A loop's History shows a day once with its total time                        | Pass   | 15 sessions on 13 days: "13 days · 1 h 31 min in all", ten rows, "Show all 13 days" (44 px tall, full width) gives 13 and goes. Today's three sessions one row ("Today · 4 min 40 s · 80% · 29 passes"), the sitting across midnight two rows. One session: "1 day · 31 s in all". None: "No practice logged yet…". A day of three sessions and 3 h 6 min: one row, "Yesterday · 3 h 6 min · 200% · 1159 passes". A year back: "Oct 24, 2025". With the History open in the sheet while practising: "Today · 3 min 40 s …" became "Today · 3 min 45 s …", one "Today" row, also after the refetch. |
| Stored sessions are unchanged; the Stats numbers still match `stats.spec.ts` | Pass   | Rows read back with the service role are one per stop, as before. `stats.spec.ts` at phone and desktop: 14 of 14. For the QA user, Stats and History agree: the loop's row "43% → 80%, up 37 · 1 h 31 min · 13 days", its chart 13 points whose speeds are History's 13 rows one for one (Nov 5 43% … Nov 27 70%, Nov 28 80%), All time 17 practice days for 13 + 1 + 3 distinct days over the loops.                                                                                                                                                                                              |

**Layout, states, offline**

- No text outside the History box at any size, overview or sheet (`textSpillingOutOf`); `auditScreen` clean (targets, contrast, names, no sideways scroll) with a History open on the overview and in the sheet, at all three sizes.
- A 100-character unbroken loop name wraps in its item; its History is drawn under it at the full width (`b5-390x844-overview-long-name.png`).
- Offline (connection cut in the page): a History read before opens from the cache with the same rows and "Show all"; one never read says "You're offline. This loop's history shows once you're back online." and fills in by itself on reconnect.
- Reads failing: "Loading history…", then "Couldn't load this loop's history." with "Try again", which loads it.

**Issues**

1. **Minor, product call for Shane: one sitting, three speeds on one screen.** Repro: a loop at 80%; play ten seconds or more, nudge to 100% while playing, a few seconds more, Pause, back to the song. The overview then says "Fill: 15 s, 80% → 100%" in the summary, "Bars 3 to 4 · 100%" on the loop's line, and "Today · 15 s · 80% · 3 passes" in its History (`b5-390x844-summary-beside-history.png`, `b5-1440x900-summary-beside-history.png`). My reading: each is right, and the summary beside the row is not a contradiction once you know the row's rule, but nothing on the History says the rule. A drummer who has just reached 100% for the first time opens History and sees 80% for today, on the day it matters most to job 3; it reads as "the 100% wasn't recorded". The Stats page already answers this in a sentence under Loop progress ("Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed."); History has nothing. Options, cheapest first: the same sentence (or "mostly" before the speed: "Today · 15 s · mostly 80%") in the History; or the day's top speed beside it ("80%, up to 100%"), which needs the tracker to keep it, since a session stores one speed. I'd add the wording now and leave the top speed until Shane has seen a week of his own rows.
2. **Minor: a row is a run of text, not columns, so "is it getting faster" means reading the third field of every row.** The day and the time vary in width, so the speeds don't line up under one another at any size (`b5-1440x900-overview-history.png`); the speed is in the same muted ink as the rest. On a phone in the loop sheet (332 px, where the BPM is shown) rows that begin "N days ago" take two lines and the others one, so the list is ragged (`b5-390x844-sheet-history.png`; four of ten rows in the walk). The overview on a phone (no BPM) keeps every row on one line. A four-column grid (day, time, speed, passes) with the speed in `ink` would let the eye run down the speeds; on the phone sheet the passes could go under. Layout only, but a redesign of the row, so not done here.
3. **Minor, from before this batch: "Show all N days" drops focus.** Repro: Tab to "Show all 13 days", Enter. The button leaves the page and `document.activeElement` is `<body>`; the next Tab starts from the top of the page. Same with the old "Show all N sessions". Fix: hand focus to the History section (`tabIndex={-1}`) or the first newly shown row, as AGENTS.md's "focus when a pressed control leaves the page" does elsewhere.
4. **Cosmetic, fixed:** in the phone sheet a wrapped row left "passes" alone on its second line ("… (91 BPM) · 29" / "passes"). The passes are now one unbreakable piece (`LoopHistory.tsx`, a `whitespace-nowrap` span; the row's text is unchanged, and the existing component and e2e assertions pass).

**Seen, not issues**

- What a row lost with the clock time: the time of day and the number of sessions. Neither was missed in the walk; a drummer asks "which days, how long, how fast", and the row answers those. The one thing a day row can't say that the session rows could is the fastest speed tried that day (issue 1).
- "59 min 59 s" in a row beside "1 h 1 min in all" in the summary: `durationLabel` gives seconds under an hour and none over it. Reads fine.
- The overview's summary for a sitting that went 80%, 100%, 80% says "Fill: 18 s, 80%" (opened and left at 80%). Unchanged by this batch.
- On a phone the overview's loop line has no "Last practised …" (it shows from 768 px), so there the History is the only place that says when. Unchanged.
- Not walked again: a session dated ahead of the device's clock (History "1 day", Stats "2 days"), which Test pinned; History left open past midnight (batch 9's class). Safari, Firefox and a real device.

**Product walk (docs/product.md, jobs 3 and 6)**

- _First-time user:_ a loop never practised says what will make a row appear; after the first sitting there is one "Today" row. Nothing to learn, nothing asked.
- _A user missing a piece:_ a song with no tab has no loops, so no History; on the overview, where the tempo isn't known, a row is the percent alone. Offline it is the cached days or a plain line saying why not.
- _Taps:_ History is two taps from the overview (More, Show history) and three from the Tab page (Loops, More, Show history), as before. It is not on the practice screen, where the speed is being worked; the overview's summary covers that moment.
- _Job 6:_ days are the device's local days, grouped on the device from the same rows on every device.

**Human check for Shane**

- After a real sitting that ends with a try at full speed, read the overview: the summary, the loop's line and History's row for today. Does the 80% in History read as right, or as the 100% gone missing (issue 1)?
- A week of rows on the phone, in the loop sheet: can the speeds be read down the list at arm's length (issue 2)?

**Cleanup**

Seventeen users recorded, plus a handful the fixture made for skipped cases and for the re-runs of `practice.spec.ts` and `stats.spec.ts`; every one was deleted by the `user` fixture (files first), and a listing by the service role afterwards finds no `e2e-qa-b5-` user. The preview server was Playwright's own and stopped with each run; nothing listens on 4383 or 5383. The temporary spec `tests/e2e/qa-b5.spec.ts` was removed. `npm run check` green after the cosmetic fix (146 files, 5767 tests).

### Review

Merged `origin/main` first (batches 1, 2 and 4): two conflicts, both "keep both" (`tests/e2e/practicePage.ts` has `addSessions` and `addLoops`; this note has the batches in order 1, 2, 4, 5). Then every line of `git diff origin/main...HEAD`, tests and the e2e helper included, against `docs/review-checklist.md`.

**Inventory** (the stateful pieces the diff adds or changes)

- `sessionTracker.ts`: the reducer `observe`, with `speedTimes`, `withStretchBanked`, `mainSpeedRatio`, `recordOf` / `recordIfLongEnough`. No hook changed; `usePracticeTracker.ts` and its three ways out are as they were.
- `sessions.ts`: `historyDays` (pure), `HistoryDay`; `practiceTimeLabel` removed.
- `LoopHistory.tsx`: one piece of state (`showAll`) and one handler ("Show all N days"); its query (`useLoopSessions`) and the cache write that feeds it while open (`sessionLogged`) are unchanged.
- `sessionsApi.ts` `fetchLoopSessions`: unchanged by Build, but what it returns is now added up (finding 1).
- Tests and helpers: `sessionTracker.test.ts`, `sessions.test.ts`, `LoopHistory.test.tsx`, `usePracticeTracker.test.tsx`, `LoopPanel.test.tsx`, `practice.spec.ts`, `practicePage.ts` (`addSessions`, by the service role).
- No mutation, migration, engine listener, timer or script.

**Behaviour pass**

- _Interleavings._ The tracker has no async window of its own; the record is built once, before any send, and Test's "window by window" describes (tracker and hook) cover a speed change during a pending log, a failed keepalive, "Try again", the outbox, both count-ins, a hidden page, a loop switch in the same render and StrictMode. History open while a session is logged: the cache write is deduped by id and the list regroups (tests for before and after the refetch, the same session heard twice). A read in pages while a session is logged: finding 1. "Done once on cached data", "a wait that comes back", "kept per value": nothing in the diff latches or waits. History left open past midnight keeps its "Today" until the next render (batch 9's class, 17.4b; not made worse).
- _Gates._ No control gained or lost a gate. "Show all" has no precondition beyond being drawn (`days.length > shown.length`).
- _Gestures._ None added. "Show all" is a control that leaves the page with its own press: finding 2.
- _Round trips._ The exact ratio survives both steps: the tracker keeps the ratio last played of each percent shown and logs it (0.708333, not 0.71), and `historyDays` keeps the ratio last played of the day's percent, so a typed BPM reads back as typed (93 BPM for 0.775, where 78% would say 94). Speeds are compared as the percent shown in both.
- _Validated paths._ No input crosses a boundary: History reads rows the database already checked, `<time datetime>` is a day key built from numbers, and no text from a URL or an error is drawn.
- _What is drawn._ A row's passes are one unbreakable piece (QA's fix); the new line under the total is `text-ink-muted` on `surface`, as the rows are. e2e measures the History for text outside its box, the new line in it.

**Findings**

1. **Fixed. `fetchLoopSessions` could return a session twice, and a day's row now adds them up** (`src/features/practice/sessionsApi.ts`; checklist 5, "Pages read by offset while rows are being added"). The read is newest first in pages of 500; a session logged between two page requests sorts before the offset, so the next page starts with the last row of the page before. `fetchAllSessions` has had `uniqueById` for this since PR 30; the loop's own read did not. Until this batch the copy would have shown as a second row (and a duplicate React key); with one row per day it would silently double that session's time and passes in its day and in "in all". It needs more than 500 sessions on one loop and a session logged during the read, so it is rare, but nothing would ever show it. Test first: `sessionsApi.test.ts`, "keeps one copy of a session that two pages both returned" (502 rows before the fix). The row missed by such a read is the one just logged, which `sessionLogged` adds to the cache and then invalidates, as for the Stats read.
2. **Fixed (QA issue 3). "Show all N days" dropped focus to `<body>`** (`src/features/practice/LoopHistory.tsx`; checklist 5, "Focus when a control replaces itself"). The press now hands focus to the first day it brought on show (the eleventh row, `tabIndex={-1}`, with the focus ring), through `useFocusWhenReady` from the press handler, so a keyboard or screen reader carries on reading where the list grew. Only that one row can take focus, and only once "Show all" is pressed. Tests first: `LoopHistory.test.tsx`, "“Show all” hands focus to the first day it brought on show" (failed with focus on `<body>`); e2e, `practice.spec.ts`, the History case presses "Show all 13 days" with Enter and expects the eleventh row focused.
3. **Fixed (QA issue 1, now D10). Nothing on the History said the rule a day's speed follows** (`LoopHistory.tsx`, `sessions.ts`, `src/features/stats/StatsPage.tsx`). One line under the total: "Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed." The sentence is `DAY_SPEED_NOTE` in `sessions.ts` (pure), imported by the History and by the Stats page, whose own copy of it is gone, so the two can't drift. Nothing else in `src/features/stats/` changed. Not shown over an empty history. Tests first: `LoopHistory.test.tsx`, "the rule a day's speed follows" (2); the e2e History case reads it. Written up as D10 in `docs/loose-ends.md` with the two other options, and in the list at the top of this note.

**Checked and left**

- _A session's tie goes to the later speed, a day's to the slower._ Different questions, as Build says; both pinned by tests. No change.
- _The day rule is written twice_ (`historyDays`, `dailySpeeds`). Left: sharing is not trivially safe. `historyDays` keeps the exact ratio and folds a day after today into today; `dailySpeeds` does neither and is read by the chart, the progress list and the records. The equality test over a table and a made-up season holds them together. Accepted as 20.5c.
- _A session dated ahead of the device's clock_ (History "1 day", Stats "2 days" until tomorrow). Not a one-line fold: `dailySpeeds` has no `now`, so folding there means a new argument through `loopProgress` and its callers. Accepted as 20.5b.
- _QA issue 2_ (a row is a run of text; speeds don't line up; some rows wrap in the phone sheet). A redesign of the row, which wants real rows to judge. Accepted as 20.5a, with a row in Open human checks.
- _`mainSpeedRatio` over entries with no time._ A speed set and changed again in the same instant banks an entry of 0 ms; it can only win a tie against other 0 ms entries, in a session too short to log.
- _A stretch across a clock set back_ counts as nothing, as before; one before a speed change is now kept (Build's note). Neither can make `speedTimes` and `playedMs` disagree: both are added to in the one function.
- _`addSessions` (e2e helper)._ Both results checked and thrown; rows go by the service role for the fixture's own user, which the `user` fixture deletes. Days are built from local calendar days (`dayAt`), older ones at noon; today's at the day's first seconds, so they are ahead of the clock only in a run that starts within two seconds of midnight, where the app folds them into today anyway.
- _`LoopPanel.test.tsx`'s UTC timestamps._ Its three sessions of 20 November (19:42 to 19:53 UTC) fall on one local day in every zone (a zone would need an offset between 4:07 and 4:18 hours to split them).
- _Sessions stored before this change_ keep the end speed they were logged with. Nothing rewrites them, and nothing should without Shane (no migration in this unit).

**Vacuous-test checks** (each restored)

| Break                                                         | Failed                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `fetchLoopSessions` without `uniqueById` (the code as it was) | "keeps one copy of a session that two pages both returned" (502 rows, not 501) |
| "Show all" without the hand-over                              | "“Show all” hands focus to the first day it brought on show"                   |
| History without the line                                      | "is said under the summary, in the sentence the Stats page uses"               |

Test's own table (the old end-speed rule, ties, banking, `historyDays`' rules) was read against the tests it names and not run again.

**Plan upkeep**

- `docs/plan.md`: deleted the Carried forward lines 17.1 (Unit 17) and D4 / 13.18b (Unit 13). Unit 20: batch 5 marked done, D4 marked built, D10 added to Decisions for Shane. Data model: `practice_sessions.speed_ratio` is "The speed most of the session was played at (the later on a tie)". Rules: a session is logged at that speed, not the speed it ended on. Unit 09: "Loop history" is one row per day. Accepted: **20.4f** (the gap batch 4's Copilot round left: "Play loop" for a loop running past the loaded score's end is drawn enabled and a press does nothing), a new group "A loop's History" with **20.5a**, **20.5b**, **20.5c**, and 13.34c reworded now that the row per day is built. Open human checks: a row "History by day" with QA's two checks.
- `docs/loose-ends.md`: D4 marked built; **D10** added (A the explaining line, built; B "mostly 80%" in each row; C the day's top speed too); Batch 5 marked done with what differs from its lines.
- This note, "Decisions built as defaults": D4 (B, batch 5) and D10 (A).
- `docs/review-checklist.md`: no new row; two rows gained a sentence. "Pages read by offset": when one read gets the fix, look for its siblings, most of all a list about to be added up. "Focus when a control replaces itself": a "Show all" that goes with its own press is one of these.
- `AGENTS.md` (Practice sessions): `DAY_SPEED_NOTE` as the one string for a rule two features state; both session reads pass through `uniqueById`; "Show all" hands focus to the first row it added.

**Checks**

`npm run check` green: 147 test files (146 passed, 1 skipped), 5,831 tests (5,829 passed, 2 skipped). e2e at `E2E_PORT=4383` (free before, no listener after), phone and desktop, `practice.spec.ts`, `stats.spec.ts` and `design.spec.ts`: 64 passed, 4 skipped (the phone-only cases on desktop), no screenshot rewritten. Not run: tablet, the full e2e suite, `npm run test:db` (no migration, grant or policy changed; the one database-facing change is a dedupe of rows already read).

**Open issues**

None new beyond the Accepted lines above and D10.

### Copilot review

One comment on PR #40 (id 4726553546, `sessionTracker.ts`), confirmed and fixed.

- **The comment:** a stretch of no time still moved its speed's entry to the end of `speedTimes` and replaced the entry's exact ratio, so a speed set but never played could decide a tie, or be the ratio logged.
- **Confirmed:** `withStretchBanked` rewrote the entry for every stretch, whatever its length. 20 seconds at 70%, 20 at 80%, then 70% set in the same instant as the stop logged 70% ("a tie goes to the speed played later", and 70% had become the later). 40 seconds at 0.708333, then 0.71 and the stop in the same instant, logged 0.71. A stretch the clock was set back under is clamped to zero and did the same. A first stretch of no time left a zero-time entry in `speedTimes`, which could only win against other zero entries, so it logged right but broke "only speeds played are listed".
- **Fix:** `withStretchBanked` ends a stretch of no time (`playingSince: null`) and changes nothing else. `playedMs` and `speedTimes` are untouched, so `speedTimes` holds only speeds with play time, and `mainSpeedRatio`'s fallback to the speed set still covers a session with nothing banked.
- **Tests** (`sessionTracker.test.ts`, "the speed of a session"; the first four failed before the fix): Copilot's example; the exact-ratio half; the same with the stop's clock set back; a first stretch of no time (session stays open under its id, `speedTimes` empty, the 40 seconds that follow logged at their own speed); a session of no time at all with the minimum at 0 (logged at the speed set; passed before too, kept as the neighbour).
- **Checklist:** new row in section 1, "A step that took no time, counted as the latest".

**Async windows and inputs:** none added. The tracker is a pure reducer; the case is two inputs at one timestamp, which the new tests feed.

**Checks:** `npm run check` green. No e2e (a pure tracker rule, nothing else changed).

## Batch 8: Focus and small jumps

### Build

**Summary.** Items 13.21, 13.35c, 13.37a and 13.37b of the triage. Four small fixes to where focus is after something leaves the page, and to one layout that changed as a list loaded. Nothing about how a loop is saved, played or logged changes, no data is deleted and there is no migration.

- **13.21** A "Mark finished" or "Reopen" the server refuses moves the loop back to the list it came from. Focus had followed it to the other list, so it fell to `<body>`. Now the list hands it to the loop's status button where the loop lands back (the loop panel), or to the loop's "More" button, whose menu holds the change (the song's page). Focus the user has put somewhere else since is left where it is.
- **13.35c** The refusal's message has a "Dismiss" button beside it, in the loop panel, on the song's page and in the "Mark finished?" prompt. It removes the failed write from TanStack's mutation cache, which is all the message was read from. Leaving the screen does the same for every refusal, so the message is not there again on coming back.
- **13.37a** With focus on a "When to count in" choice, C cycling the count-in to Off takes that group off the bar. Focus now goes to the checked choice of the count-in's bars ("Off"), beside it.
- **13.37b** The Songs list draws the compact Upload button while the songs load, and the big drop box only once the list is known to be empty. A library with songs in it is laid out the same before and after the read.

**Walk-through** (as `docs/product.md` asks, before any code):

- _Day one, one song, no loops:_ none of the loop items applies. The Songs list of a new account loads with the compact Upload, then opens the big drop box once the list is known to be empty: one change of layout, once, for the empty library only. Before, every returning user had the change the other way round at every cold start.
- _Missing a piece:_ a song with no loops has no status control, no refusal and no message. A song with no drum track is untouched. With the count-in already off there is no "When to count in" group to lose focus from.
- _Offline:_ a status change made offline is queued and is not a refusal, so nothing here fires. "Dismiss" sends nothing and works offline. The Songs list offline with nothing cached shows the compact Upload, off, with its offline note, above the "you're offline" message.
- No forced order, no new step, and no chore: "Dismiss" is offered, never required, and leaving the page does it anyway.

**Files touched**

- `src/features/loops/useLoops.ts`: `useSetLoopStatus` returns `dismissError`; new `useLoopStatusRefusals(onRefused?)`; private `statusWriteIn`, `refusedStatusWrites`, `dismissStatusRefusals`. Test: `useLoops.test.tsx`, "refused status changes: dismissed, and heard by the screen".
- `src/features/loops/loopFocus.ts`: `findStatusButtonAfterRefusal`. Test: new `loopFocus.test.ts`.
- `src/lib/itemFocus.ts`: `isInItem` (one line; the `data-item` attribute is that module's).
- `src/features/loops/LoopStatusButton.tsx`: the message is `StatusRefusal` (exported, with "Dismiss"), and Dismiss focuses the status button.
- `src/features/loops/FinishPrompt.tsx`: the prompt's message is `StatusRefusal` too; Dismiss focuses the prompt's "Mark finished".
- `src/features/loops/LoopPanel.tsx` (`LoopPanelBody`), `src/features/song/SongOverviewPage.tsx` (`SongLoops`, `LoopRow`), `src/features/song/LoopPracticePage.tsx` (`PracticeScreen`): each calls `useLoopStatusRefusals`; the first two hand focus on. The song page's "More" button carries `statusButtonAttributes(loop)`. Tests: `LoopPanel.test.tsx` and `SongOverviewPage.test.tsx`, each a describe "a refused status change".
- `src/features/player/PlayerControls.tsx`: `useFocusKeptInBar` takes the count-in's bars as a third argument (the call and the hook; 13 lines added, nothing moved). Test: `PlayerControls.test.tsx`, "focus when the count-in turns off under When to count in".
- `src/features/library/LibraryPage.tsx`: `compact={!knownEmpty}`. `UploadPanel.tsx`: its doc comment only. Test: `LibraryPage.test.tsx`, two cases with the songs read held.
- e2e: `tests/e2e/design.spec.ts` (the refused state in the panel and on the song's page: audited, focus rings, focus after the refusal and after Dismiss, gone after leaving), `tests/e2e/shortcuts.spec.ts` (C under a focused "When to count in"), `tests/e2e/library.spec.ts` (a cold start on a second device with the songs read held: the Upload button's box is the same before and after).
- `AGENTS.md`: the status-refusal rules (Practice sessions), the count-in's focus (Visual design, the controls fold), the upload's layout (Lists, files and ids).

**What the triage had wrong, or that had moved since**

- The triage's files are `LoopStatusButton.tsx`, `useLoops.ts` and `loopFocus.ts`, and its test file for 13.21 is `SongOverviewPage.test.tsx`. But the song's page (Unit 16) does not use `LoopStatusButton`: its status change is an item of each loop's "More" menu, written through `useSetLoopStatus` directly, with an alert of its own. So `SongOverviewPage.tsx` had to change, and `LoopPanel.tsx`, `LoopPracticePage.tsx`, `FinishPrompt.tsx` and `itemFocus.ts` each by a few lines. None is on the batch's do-not-edit list.
- "`LoopStatusButton` (remounted in its old place) takes focus if focus is on `<body>`" is not how it is built (see Decisions): the list does it.
- There is no home page with status controls any more ("On the go" went in Unit 16): the three places are the loop panel, the song's page and the practice screen's prompt.

**Decisions**

- **The list hands focus on, not the button.** A button mounted with a refusal in the cache cannot tell "the refusal just moved me back" from "the page opened ten seconds after a refusal" or "the loop form closed and the list is back": taking focus from `<body>` in the last two would steal it as a page opens, or from the form's own hand-over. The list outlives its items (the checklist's rule for an item that leaves a list), so it listens: `useLoopStatusRefusals` subscribes to the mutation cache and hears a status write turn to `error` once, as it happens. A refusal from before the screen opened is never heard.
- **Focus moves only if it was lost to the move.** `findStatusButtonAfterRefusal` returns nothing when focus is on another part of the page. With focus in the loop's item it waits until what had focus has left the page, so an item that is already back with the user in it is left alone. It then goes through `useFocusWhenReady`, which gives up after 5 seconds and never takes focus the user has moved since.
- **Both orders of "failed" and "rolled back" are handled.** TanStack rolls back (`onError`) before it marks the write failed, but React may draw the two the other way round when no macrotask comes between the answers (seen in jsdom: the failed state is drawn while the loop is still in the list it moved to). The finder looks for the button by the status the loop keeps, so it finds nothing until the loop is back.
- **"Dismiss" removes only failed status writes of that loop** (`status: 'error'` in the cache's filter): never a pending one, never a failed write of another kind (a speed's failure is `LoopSpeedControl`'s to show), never a row. It is one message per loop, so Dismiss in the prompt also clears it under the loop.
- **Leaving the screen clears every loop's refusal, a tick after the unmount.** In the clean-up itself it would also run in StrictMode's first clean-up and remove a refusal the screen had just opened on; the timer is cancelled by the mount that follows at once.
- **A write refused after its screen was left is still said on the next visit.** The message then is the only sign that "Mark finished" did not hold. It takes no focus (not heard), has Dismiss, and goes on leaving. So "gone on returning" holds for every refusal the user was shown.
- **Dismiss says where focus goes**, since the button leaves with the message: the status button (panel), the "More" button (song's page), the prompt's "Mark finished".
- **13.37a: the bars' checked choice only when the control lost was a radio.** A fold removes the count-in's groups too; then nothing checked is left in the bar and the fold toggle takes focus as before. The existing fold cases are unchanged.
- **13.37b: compact for every state but "known empty"**, so also while offline with nothing cached and on a load error. The upload is the same control either way; the drop zone then wraps the message that stands for the list.

**Async windows and inputs**

1. _A status write on its way, then refused_ (existing window; new: what the refusal does to focus).
   - Focus still on the loop's item in the list it moved to: goes to its status button (or "More") once the loop is drawn back.
   - Focus moved by the user to another control, before or after the refusal: stays.
   - Focus on `<body>` (a click on text meanwhile): goes to the loop's button.
   - The loop form opened, or the loop's "Delete …?" question showing, when the loop lands back: there is no status button to find; the wait ends after 5 seconds and focus is left alone.
   - The loop sheet closed: its buttons are hidden and can't take focus; nothing moves.
   - Another hand-over of the same list waiting (a form just closed): the refusal replaces it only when focus is on `<body>` or in the refused loop's item, which is when the earlier one has nothing better to do.
   - The screen left before the answer: not heard; the message is there on the next visit (see Decisions).
   - A second press on the loop's control: refused by `setStatus` while the first is pending, as before.
   - StrictMode: one subscription at a time; a refusal is heard once (tested).
2. _"Dismiss" pressed._ Synchronous: focus moves, the failed writes leave the cache, the message goes on the next render.
   - A status write of the loop pending at that moment: untouched (it can only be pending after a newer press, whose result then shows).
   - Offline: nothing is sent.
3. _The tick between a screen's unmount and its refusals being cleared._
   - The next screen mounts in that tick with its own subscription: it would draw a refusal for one render, then lose it. Not seen; the loop lists are not read yet at that point.
   - A write refused inside that tick is cleared with the rest, unsaid. A window of one task.
   - A remount at once (StrictMode): the timer is cancelled.
4. _The count-in's bars changing with focus in the bar_ (layout effect, before paint).
   - 2 bars to 1 bar: the mode's group stays, focus stays.
   - To Off with focus on another control of the bar, or outside it: nothing moves.
   - To Off while folded: the group was not on the bar; nothing to do.
5. _The songs read on its way._ The compact Upload is on and takes a pick or a drop while the list loads (it did under the big box too); the upload's own gates (offline, one at a time) are unchanged.

**Known gaps**

- Under a refusal drawn before the rollback (window 1, the jsdom order), the song's page says "Couldn't reopen the loop." for that one render, because its wording goes by the list the loop is in. It was so before this batch. The fix is to word it by what the refused write asked for.
- The practice screen's prompt does not hand focus anywhere when its own "Mark finished" is refused and the prompt comes back: focus went to Play when the prompt left, and stays there. Not in this batch's items.
- The three callers of `useLoopStatusRefusals` are by convention: a new screen with status controls that forgets it keeps the old five minutes.
- The cold-start e2e asserts the Upload button's box before and after the read; it was not run against the old build to see it fail there (the component test was, and failed).
- Not seen by eye on a phone: where "Dismiss" wraps under a long message at 320 px. The design audit passes at 390 px and 1440 px.

**How to verify**

- `npm run check` (green at this commit: 146 test files, 5782 tests).
- `npx vitest run src/features/loops src/features/song src/features/player/PlayerControls.test.tsx src/features/library/LibraryPage.test.tsx`.
- e2e, phone and desktop only: `E2E_PORT=4383 npx playwright test tests/e2e/design.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/library.spec.ts tests/e2e/practice.spec.ts tests/e2e/journey.spec.ts --project=phone --project=desktop` (104 passed, 4 skipped by their own width conditions). No screenshots were rewritten.
- By hand, with the local stack: there is no way to make the server refuse a status change from the UI. In the browser's dev tools block or rewrite `PATCH …/rest/v1/loops` to a 403 with `{"code":"42501"}`, then:
  1. Tab page, loop sheet open: Tab to "Mark finished", Enter. The loop comes back among the active ones with "Couldn't change the loop." and Dismiss, and the focus ring is on its "Mark finished". Dismiss: the message goes, the ring stays on "Mark finished".
  2. Song's page: "More", "Mark finished". The ring ends on the loop's "More" in "Loops". Go to Settings and back: no message.
  3. Count-in at 2 bars, click "Every repeat", press C: the ring is on "Off".
  4. Sign in on a second browser profile with songs in the library, throttled to Slow 3G: the Upload button does not move when the list arrives.

### Test

**Summary.** The build had the four fixes tested on their main paths. This stage adds the windows its list named without a test, takes each acceptance line through Chromium at the phone and desktop projects, and breaks the app to see each new test fail. 50 component tests and 5 e2e tests are new. No app code changed, no test id was added, and two bugs are logged (one of them not this batch's).

**Tests per acceptance line**

- **After each of the four, `document.activeElement` is a control on the page, never `<body>`.**
  - _13.21, the loop panel_ (`LoopPanel.test.tsx`, "a refused status change"): the refusal landing with focus fallen to `<body>` (goes to the loop's button); with the loop form up, opened from another loop and from the refused loop itself (focus stays in the form, the form's own hand-over to "More" still happens on Cancel, and the message is there when the list is back); with the loop's own "Delete …?" question up (see Decisions pinned); with another loop's question holding focus (stays); with the sheet closed (stays on the header, the message is there when it opens); the prompt's refused "Mark finished" (focus ends on the loop's own "Mark finished").
  - _13.21, the song's page_ (`SongOverviewPage.test.tsx`, same describe): focus on `<body>`; the loop's own "Delete …?" question; another loop's question; another loop's open menu; two loops refused one after the other.
  - _13.21, the practice screen's prompt_ (`LoopPracticePage.test.tsx`, "a refused "Mark finished" from the prompt"): the prompt comes back with the reason and Dismiss, and focus is on Play, where it went when the prompt left. This is the build's known gap, pinned: with focus on `<body>` at that moment nothing takes it.
  - _13.35c, Dismiss_: by a click and by Enter, in the panel, on the song's page and in the practice prompt: focus is on the loop's status button, its "More" button, the prompt's "Mark finished".
  - _13.37a_ (`PlayerControls.test.tsx`): C all the way round (Off, 1 bar, 2 bars, Off) from each of the ten places focus can be on the count-in (each bars choice from each start, each mode choice checked and unchecked): after every press focus is on a radio inside the bar. Folded: C three times with focus on the metronome, the speed and "Show controls" moves nothing. Shown again while playing, Off under a focused mode goes to the bars' "Off", not to "Hide controls". A count-in choice folded away hands focus to "Show controls", also when the fold and the Off come in one render.
  - e2e: `shortcuts.spec.ts`, "C all the way round from each count-in control, folded and unfolded, never drops focus to <body>" (real key presses; the folded part plays the song and reads the count-in from `window.__drumPalPlayer`, since it isn't on the bar). `design.spec.ts`, "at 320 px a refused status change's message and Dismiss fit the loop sheet and the song's row, and Dismiss leaves focus on a control" and "a refused Mark finished from the practice screen's prompt: …".
- **A refused status change can be dismissed and is gone on returning to the page.**
  - Two controls for one loop racing (`LoopPanel.test.tsx`, "the prompt and the list's button racing"): the prompt's write held, the list's "Reopen" pressed by click and by Enter under it (locked, nothing sent), then refused: one write, one failed mutation, one alert, one Dismiss. "Not yet" moves the message under the loop's own button, still once; Dismiss there clears it for both.
  - Refused after its screen was left (panel and song's page): shown on the next visit with Dismiss, and focus is not taken (pinned: `<body>` in the panel's test; not inside any loop's row on the song's page). Dismiss there works and hands focus on.
  - The tick between the unmount and the clearing: a write refused inside it is cleared with the rest, unsaid, and the loop is back as the server has it; a page opened again in the same tick still loses the message (the old screen's timer is its own).
  - The practice screen: Dismiss sends nothing and the prompt's button still works after it; a refusal left undismissed there is not said under the loop on the song's page.
  - e2e: the two `design.spec.ts` tests above (Dismiss by Enter in the sheet, by a click on the song's page and in the prompt; the database still has the loop active).
- **The Songs list does not change layout between loading and loaded when there are songs.**
  - `LibraryPage.test.tsx`, "LibraryPage layout": a library read before on this device opens compact at once and stays so through the fresh read (the same input element); the compact Upload takes a pick while the list is still loading; a file dragged over the page meanwhile outlines the drop zone.
  - The side effect, pinned: a new, empty library is compact while it loads and opens the big drop box once, and a background read of the still-empty library is no second change; an empty library cached from before opens on the big box at once. Offline with nothing cached the Upload is compact, off, with its note, and is the same element when the songs arrive. On a load error it is compact, and "Try again" opens the big box only if the read then says the library is empty.
  - e2e: `library.spec.ts`, the build's cold-start test, and the new "a new, empty library loads with the compact Upload, then opens the big drop box once" (which then uploads through the box it opened).
- **"Dismiss" at 320 px** (`design.spec.ts`, `expectRefusalDrawnIn`): in the loop sheet, the song's row and the practice prompt, no text spills, Dismiss is at least 44 px each way, lies inside its container and never over the message; the page audit (`expectWellDrawn`) passes for the sheet and the song's page at 320 px.

**Each test fails without its code** (app broken briefly, restored; e2e against a rebuilt app)

| Break                                                                                       | Fails                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useFocusKeptInBar`'s effect without `countInBars`; or without the checked-radio preference | 7 `PlayerControls` tests (every mode row of the table, the folded "shown again" case); the e2e "C all the way round" on both projects                                                     |
| The panel's `useLoopStatusRefusals` callback does nothing                                   | 7 `LoopPanel` tests (`<body>`, the "Delete …?" question, the race, the prompt's refusal, and the build's three)                                                                           |
| `findStatusButtonAfterRefusal` always finds the button                                      | "leaves focus where the user has since put it", another loop's question, the closed sheet (panel); the same plus the open menu (song's page)                                              |
| No clearing on leaving (`useLoopStatusRefusals`' clean-up)                                  | "is gone on coming back", "refused in the tick…", "opened again in the same tick"                                                                                                         |
| Dismiss without its `focus()` (button, prompt, song's row)                                  | Every Dismiss test of that place, component and e2e                                                                                                                                       |
| The prompt's Dismiss without `dismissError()`                                               | The practice prompt's two Dismiss tests                                                                                                                                                   |
| The practice screen without `useLoopStatusRefusals()`                                       | "is not said again under the loop on the song's page", and the pinned bug 1 below                                                                                                         |
| `LibraryPage`'s old rule (`compact` only with songs)                                        | 8 `LibraryPage` tests; both library e2e tests on both projects. So the build's cold-start e2e, not run against the old build before, does fail there (at "no big drop box while loading") |
| `compact` always                                                                            | The five tests about the empty library's big box                                                                                                                                          |
| Dismiss drawn 20 px high; the message and Dismiss not allowed to wrap                       | `expectRefusalDrawnIn` (height) in all three places; "text spilling" in the sheet at 320 px                                                                                               |

Two tests can't fail by taking code away, only by adding a theft of focus: the two "loop form is up" cases. The form has no status button under it for any finder to find.

**Decisions pinned** (what the app does, where the build's note said otherwise or left it open)

- A refusal that lands while the loop's own "Delete …?" question is up takes the question away: the loop's item is drawn anew in the list it moves back to, and the question was the old item's state. Nothing is deleted, and focus goes to the loop's status button (panel) or "More" (song's page). The build's list said the wait would run out with focus left alone; that holds only for the loop form.
- A refusal heard with the sheet closed leaves focus on the header. Opening the sheet then shows the message; opening is the user's press and focus stays on it.

**Bugs found**

1. **A refusal no screen showed is put away unsaid.** Not fixed (a design choice, and more than a few lines: the hook would have to know which refusals its screen showed). Repro: on the song's page, "More", "Mark finished" on a loop, and before the answer open another loop's practice screen; the server refuses; go back. The loop is among "Loops on the go" again and nothing says the change did not hold. The practice screen heard the refusal, shows no status but its own prompt's, and cleared every loop's refusal as it was left. The same on the Tab page with the sheet closed, left before it is opened. Low: it needs a refused status write (a missing grant, a token the server won't refresh), and the list is right. Pinned in `LoopPracticePage.test.tsx`, "a refusal of the song page's change that lands on the practice screen is put away unsaid on leaving it"; a fix changes that test.
2. **The practice screen scrolls sideways at 320 px.** Not this batch's, not fixed. The band's speed-and-Play row is 334 px wide (from -7 to 327 px) in a 320 px window, with or without a prompt or a refusal: `auditScreen` says "page is 327 px wide in a 320 px window" on the plain practice screen. So the practice prompt's page audit is taken at 390 px, and at 320 px only the prompt's own box is measured.
3. From the build's known gaps, still open: the practice prompt hands focus nowhere when it comes back after a refusal (it is on Play unless the user moved it; from `<body>` it stays on `<body>`).

**How to verify**

- `npm run check`: green, 146 test files, 5832 tests (2 skipped, as before).
- `E2E_PORT=4383 npx playwright test tests/e2e/design.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/library.spec.ts tests/e2e/practice.spec.ts --project=phone --project=desktop`: 109 passed, 5 skipped by their own width conditions, twice in a row (design 28, shortcuts 32, library 26, practice 23). No screenshot was rewritten.
- e2e pattern for the next test of a refused status change: `refuseStatusWrites(page)` in `design.spec.ts` holds and refuses only the PATCH that carries `status`, so a speed saving itself on the practice screen still goes through, and its returned function waits for the 403 to reach the page.

### QA

**Verdict: PASS.** No blocker and no major issue. Walked at 390x844 (touch) and 1440x900 against a development build on port 4383 and this worktree's local stack (API 54421), with a throwaway Playwright script that recorded, on every animation frame, the text of every alert on the page and what had focus. Status writes were refused as the build's note says (403 with `42501`), held, answered at once and answered after 150 ms. The tablet size was not walked (not asked for this batch). No app code changed.

**Per acceptance line**

| Line                                                                                      | Result                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| After each of the four, `document.activeElement` is a control on the page, never `<body>` | **Pass.** See the table below; `<body>` has focus for one frame (about 17 ms) as the loop moves back, never longer |
| A refused status change can be dismissed and is gone on returning to the page             | **Pass** in all three places, by Enter and by click or tap                                                         |
| The Songs list does not change layout between loading and loaded when there are songs     | **Pass.** Upload's box is the same before and after, phone and desktop, on a device's first visit and on a reload  |

**13.21 and 13.35c, place by place** (the same at both sizes; "pointer" is a tap on the phone, a click on the laptop)

| Place                    | Change, how                           | Message                                                                           | Focus when the refusal lands                                                          | Dismiss                                                                                  | Leave and return                                                              |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Loop sheet (Tab page)    | Mark finished, Enter                  | "Couldn't change the loop. The server refused it. Try again, or reload the page." | The loop's "Mark finished" (it was on "Reopen" while pending)                         | The next Tab stop after the status button; Enter: message gone, focus on "Mark finished" | To the song's page: nothing said there. Back on the Tab page: gone            |
| Loop sheet               | Mark finished, pointer                | Same                                                                              | "Mark finished"                                                                       | Click: gone, focus on the status button                                                  | Gone                                                                          |
| Loop sheet               | Reopen, Enter and pointer             | Same                                                                              | The loop's "Reopen"                                                                   | Gone, focus on "Reopen"                                                                  | Settings and back: gone                                                       |
| Song's page, "More"      | Mark finished, Enter on the menu item | "Couldn't mark the loop finished. The server refused it. …"                       | The loop's "More"                                                                     | Two Tabs on (the round Practise link is between); Enter: gone, focus on "More"           | Settings, Songs, the song: gone                                               |
| Song's page, "More"      | Mark finished, pointer                | Same                                                                              | "More"                                                                                | Gone, focus on "More"                                                                    | Gone                                                                          |
| Song's page, "More"      | Reopen, Enter and pointer             | "Couldn't reopen the loop. The server refused it. …"                              | "More" (the loop back under Mastered)                                                 | Gone, focus on "More"                                                                    | Gone                                                                          |
| Practice screen's prompt | Mark finished, Enter and pointer      | "Couldn't mark the loop finished. The server refused it. …" in the prompt         | Play, where it went when the prompt left (the build's known gap: a control, not body) | Gone, focus on the prompt's "Mark finished"                                              | The song's page says nothing; the practice screen opened again has no message |

The practice screen has no "Reopen" (its prompt only asks about finishing), so that cell does not exist.

**The wrong sentence on the song's page** (the build's first known gap): not seen. In ten refusals on the song's page (Mark finished and Reopen, keyboard and pointer, both sizes, answered held, at once and after 150 ms) no frame showed "Couldn't reopen the loop." for a refused "Mark finished", or the reverse. The first frame that has a message has the right one and already has focus on "More". If the jsdom order does happen in a browser it lasts under one frame. Not an issue for a user.

**13.37a.** Count-in at 2 bars, focus on "Every repeat", C: the count-in is Off, "When to count in" is gone and focus is on the checked "Off" with its ring (`b8-desktop-countin-off-focus.png`). From 1 bar with focus on "At the start", C twice (2 bars, Off): on a radio in the bar both times. Folded while playing with focus on Pause: C three times cycles Off, 1, 2 (read from the player) and focus stays on Pause. Controls shown again while playing, focus on "Every repeat", C: Off, focus on "Off", still playing. Pass at both sizes.

**13.37b.** Network held to 400 ms latency and 1.6 Mbit/s.

- With two songs, a second device's first visit: Upload is at the same box while "Loading your songs…" shows and after the list is in (phone 0,72 112x44; laptop 336,92 112x44). A reload of that device: the same, the list in within 30 ms from the saved cache. Nothing moves under a pointer.
- A new, empty library: Upload is compact for as long as the read takes (440 ms here, `b8-phone-empty-library-loading.png`), then the big drop box opens and its button is 38 px right, 22 px down and twice as wide (112 to 232 px). One move, once, in the first half second of the first visit, towards a bigger target; a press that misses lands on the empty drop box and does nothing. Acceptable for a first run. A later visit of a still-empty library opens on the big box at once, from the saved cache.

**Issues**

1. **Minor. A status change refused while its screen is not showing is undone without a word** (the tester's bug 1, confirmed at both sizes). Repro: a song with two loops, status writes refused slowly (held here). On the song's page: Verse, "More", "Mark finished". Verse moves under Mastered. Before the answer, press Chorus's round play button; the 403 arrives on Chorus's practice screen, which says nothing. Back to the song: Verse is in the list on the go again, "0 of 2 mastered", no message (`b8-desktop-bug1-silent-revert.png`); the database has it active. Would it confuse a drummer? A little: they saw Verse among the mastered loops a moment ago and now it isn't, with nothing to say why. But the list is true, nothing is lost, and "Mark finished" again is two taps. It needs a refusal from the server (a missing grant, a token the server won't refresh), which a slow connection alone never gives: slow or offline, the write is queued and lands. Before this batch the message would have been there on return (and for five minutes more). Worth fixing when the hook is next touched (clear on leaving only the refusals a screen showed), not worth holding the batch.
2. **Minor, older than this batch. The practice screen is wider than a phone under 334 px** (the tester's bug 2, confirmed). The speed-and-Play row has a least width of 334 px and is centred, so it sticks out on both sides: at 320 px it runs from -7 to 327 px and the page is 327 px wide; at 328 px the page is 331 px wide (3 px over). At 334, 336, 344, 360, 375 and 390 px the page is exactly the window's width. So 360 and 375 px phones are fine; only 320 px ones (iPhone SE 1st generation, 5s, a few small Androids, or a larger phone at a high display zoom) get a page that pans a few pixels sideways, with the "−5%" label on the left edge and Play's right edge cut (`b8-phone-320-practice-sideways.png`). Everything can still be pressed.
3. **Minor, not this batch's code, found on the way. The song's page redraws its loop list once just after arriving from the Tab page.** Repro: on the Tab page press "← Groove 120", and within about a quarter of a second put focus on a loop's "More" (or open its menu). The list's items are replaced (the "More" button measured was off the page 19 ms after it appeared; in another run a menu opened by Enter was gone 200 ms later), focus falls to `<body>` and an open menu closes. Arriving from the Songs list or by a reload the list is drawn once and stays. Not reachable at human speed with a pointer; a keyboard user who Tabs at once after the page changes could lose their place. Not checked against `main`, but nothing in this batch touches how the list is keyed or read.
4. **Cosmetic. The loop sheet's message does not say which change failed** ("Couldn't change the loop."), while the song's page and the prompt do. The button beside it says which, so it reads well enough. Left as it is: the copy is pinned by tests in three files.
5. **Cosmetic. On the song's page "Dismiss" is two Tab stops after "More"**, since the message sits under the loop's line and the round Practise link comes first. In the loop sheet it is the next stop. Fine as it is.
6. From the build's known gaps, unchanged: after a refused "Mark finished" from the practice screen's prompt, focus is left on Play, not brought back to the prompt. It is on a control, and Play is where a drummer wants it; a screen-reader user hears the alert and has to find the prompt again.

No cosmetic fix was made: none of the above is a small change of looks only.

**As a product** (`docs/product.md`). None of the four adds a step, a gate or a chore. "Dismiss" is offered and never needed (leaving does it). Taps to sound are unchanged, and the Songs list's Upload no longer moves on any visit with songs, which is every visit after the first upload. A song with no loops, no drum track or no tab meets none of the loop changes; the count-in change needs a count-in to be on. Offline nothing here fires (a status change is queued, not refused).

**Human check for Shane.** The triage lists none for this batch. If a 320 px phone is ever to be supported, look at the practice screen on one (issue 2).

**Screenshots** (`docs/units/20-shots/`): `b8-phone-panel-refused.png`, `b8-phone-overview-refused.png`, `b8-phone-prompt-refused.png`, `b8-desktop-bug1-silent-revert.png`, `b8-phone-320-practice-sideways.png`, `b8-desktop-countin-off-focus.png`, `b8-phone-empty-library-loading.png`.

**Clean-up.** 19 throwaway users were made by Playwright's `user` fixture (emails `e2e-zz-qa-…@drumpal.test`) and deleted by it, files first; a listing of the stack's users afterwards has none of them left. The QA script was a temporary spec and is not committed. The preview server on 4383 was Playwright's own and stopped with each run. No `db:reset`, no `db:seed`, nothing on port 54321.

### Review

**Summary.** `origin/main` (batches 1, 2, 4 and 5) merged in first; the only conflict was this note, resolved with the batches in numeric order. Batch 4's `LoopPanel.tsx` and this batch's sit together unchanged (the hook's call moved a few lines, see finding 1). Every line of `git diff origin/main...HEAD` read, tests and e2e included, each stateful piece taken through the checklist. Four findings fixed, each with a test that fails without its fix; the two bugs and the cosmetic issue Test and QA logged are among them. Four items accepted in writing (`docs/plan.md`, Accepted, 20.8a to 20.8d), and 20.5d added for batch 5.

**Inventory** (the stateful pieces the diff adds or changes)

- `useSetLoopStatus` (`useLoops.ts`): `dismissError`, and since this stage `refused`.
- `useLoopStatusRefusals` (`useLoops.ts`): a mutation-cache subscription, a timer set on unmount, and since this stage the set of refusals the screen had on show. Its helpers `statusWriteIn`, `refusedStatusWrites`, `dismissStatusRefusals`.
- `findStatusButtonAfterRefusal` (`loopFocus.ts`), `isInItem` (`itemFocus.ts`): finders over the DOM, no state of their own.
- `StatusRefusal` and the three "Dismiss" handlers (`LoopStatusButton`, `FinishPrompt`, `SongOverviewPage`'s `LoopRow`).
- The three callers of the hook: `LoopPanelBody`, `SongLoops`, and the practice screen (`PracticePlayer` since this stage).
- `useFocusKeptInBar` (`PlayerControls.tsx`): a layout effect on the fold and the count-in's bars, `onFocus`, and since this stage `onBlur`.
- `LibraryPage`'s `knownEmpty`.
- No mutation, migration, engine listener or script. Test helpers that hold state: `refuseStatusWrites` and the held routes in `design.spec.ts` and `library.spec.ts`.

**Findings**

1. **Fixed. Leaving a screen put away refusals it never showed** (checklist 1, new row "Put away by a screen that never showed it"; Test's bug 1, QA issue 1). `useLoops.ts`, `useLoopStatusRefusals`' clean-up called `dismissStatusRefusals(queryClient, user.id)` for every loop. So a "Mark finished" refused while another loop's practice screen was up, or behind the Tab page's closed sheet or its loop form, was gone when the song's page opened, with the loop back among the active ones and nothing to say why. Now the hook takes `{ onRefused, loopId, showing }` and keeps a `WeakSet` of the refusals that were on show (added as the screen opens, as a refusal lands, and as `showing` turns true); leaving removes those and no others. `SongLoops` shows all of them always; `LoopPanelBody` passes `showing: open && form === null` (it now gets `open`); the practice screen's call moved from `PracticeScreen` into `PracticePlayer`, beside the prompt, with `loopId` and `showing: askToFinish`. Small after all: about 25 lines of the hook. Tests: `useLoops.test.tsx` (one loop's scope; never on show; hidden, shown, hidden again; on show as the screen opens, StrictMode), `LoopPanel.test.tsx` (closed sheet left unopened; closed, then seen; under the loop form), `LoopPracticePage.test.tsx` (Test's pinned case flipped: said on the song's page on coming back; and this loop's own change refused with no prompt up). Two pinned tests changed meaning with it: the practice one above, and the panel's "refused in the tick between leaving and the messages being put away", which was "cleared, unsaid" and is now "kept, and said on coming back". With the clean-up put back to "every refusal", 7 of them fail.
2. **Fixed. C to Off pulled focus off the page onto a radio** (checklist 3, "A copy of what the browser holds"). `PlayerControls.tsx`, `useFocusKeptInBar`: `lastFocused` was only ever set, so after "Every repeat" was chosen and the score then tapped (focus on `<body>`, the radio still on the bar), a later C to Off found a remembered control gone and focus on `<body>`, and focused the bars' "Off". A focused radio takes the arrow keys (`focusKindOf`), so Up and Down stopped changing the speed and Left and Right stopped switching loops, a pedal's keys, until the user clicked away again. Before this batch the effect ran only on a fold, where the target is a button and takes no keys. Now `onBlur` forgets a control that lost focus while still on the page: 7 lines, the section's one new prop. Test: `PlayerControls.test.tsx`, "stays on the page when the user has tapped outside the bar since" (failed before the fix). Whether Chromium fires `blur` on a focused element as React removes it, which would have undone 13.37a, is what `shortcuts.spec.ts`'s two count-in tests prove it doesn't: they pass.
3. **Fixed. The message was worded by the list the loop was in, and in the sheet not at all** (checklist 6; QA issue 4 and Build's first known gap). The song's page chose its sentence from `loop.status`, wrong for the render in which the failure is drawn before the rollback; the sheet said "Couldn't change the loop." Now `useSetLoopStatus` returns `refused`, the status the failed write asked for, and all three places say `statusRefusalCopy(status.refused)` (`loopLabels.ts`, pure). The pinned copy changed in 5 component assertions and 3 e2e ones. Tests: `loopLabels.test.ts`, `useLoops.test.tsx` "reports what the refused change asked for".
4. **Fixed. The practice screen was wider than a 320 px window** (checklist 6; Test's bug 2, QA issue 2; older than this batch). The band's speed and Play need 334 px side by side. Under 20.875rem (334 px at the default font size; in rem, as the row's own width is) the row's gap is `gap-2` and the pill's ends `w-12` (48 px, still a touch target): 310 px. Two classes, CSS only; from 334 px nothing changed. Test: `design.spec.ts`, "the practice screen fits a 320 px phone, and its speed and Play row is as it was from 334 px" (the page is the window's width at 320 and 328 px and passes the audit; at 334, 360 and 390 px the gap is 16 px and the end 56 px). The refused prompt's page audit is now also taken at 320 px.

**Checked and left**

- **Dismiss and the mutation cache.** `dismissStatusRefusals` filters on `status: 'error'`, the user's loop-write key and a `status` in the variables. A loop edit only reaches `error` on a refusal: a network failure and a refused token retry (`retryNetworkFailures`), and TanStack (5.108.4) sets `error` after `onSettled`, which is where the outbox hold is let go. So nothing still queued or waiting in the outbox can be removed, and a pending write never matches. `MutationCache.remove` destroys the mutation's gc timer, and an observer still holding it only schedules gc if the cache still has it (`mutation.js`, `removeObserver`), so the control that sent the write is safe to press again. Proven by "never takes a status write that is still on its way" and "leaves another loop's refusal, and a failed write of another kind".
- **The subscription.** One per mounted screen, unsubscribed in the clean-up; the leaving timer is cancelled by StrictMode's remount and is each instance's own. Heard once under StrictMode (tested). `setHeard` can't run after unmount.
- **`onRefused` for a loop that isn't on the page** (a replayed write of another song's loop failing): with focus on `<body>` it replaces a hand-over already waiting with one that finds nothing. It needs a replay refused in the half second a form is closing. Left.
- **A refusal marked as shown while the list itself isn't drawn** (the loops read failing with the sheet open): the message isn't on screen, and leaving clears it. It needs a refused status write and a failed first read of the same list at once. Left.
- **e2e.** Held routes are released or closed with the page; the second context in `library.spec.ts` closes in a `finally`; every "nothing changed" assertion follows proof that the thing it waited for happened (`held.length`, `loopsOf(user)`).
- Bars, pagination, secrets, Supabase errors: nothing in this batch reads a list, writes a row or touches a bar number.

**What was done with each logged issue**

| Logged                                                                         | Outcome                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Test bug 1, QA issue 1 (a refusal no screen showed is put away unsaid)         | Fixed, finding 1                                              |
| QA issue 4 (the sheet doesn't say which change failed)                         | Fixed, finding 3; Build's "wrong sentence for one render" too |
| Test bug 2, QA issue 2 (the practice screen at 320 px)                         | Fixed, finding 4                                              |
| Build's known gap, QA issue 6 (focus stays on Play after the prompt's refusal) | Accepted, 20.8a                                               |
| QA issue 5 (Dismiss two Tab stops after "More")                                | Accepted, 20.8b                                               |
| QA issue 3 (the song's page redraws its loops after the Tab page)              | Accepted, 20.8c                                               |
| 13.37b's side effect (a new, empty library moves once)                         | Accepted, 20.8d                                               |
| Copilot's note on batch 5's merged PR (a day's speed is an estimate)           | Accepted, 20.5d                                               |

None of the orchestrator's calls was overruled.

**Docs**

- `docs/plan.md`: the four Carried forward lines this batch closes are deleted (13.21, 13.35c, 13.37a, 13.37b); batch 8 is marked done in Unit 20's list; Accepted gains 20.5d and a "Focus and small jumps" group, 20.8a to 20.8d.
- `docs/loose-ends.md`: Batch 8 marked done, with what was built differently from its lines.
- `docs/review-checklist.md`: one row, "Put away by a screen that never showed it" (section 1).
- `AGENTS.md`: the refusal rules now say `useLoopStatusRefusals({ onRefused, loopId, showing })`, what leaving puts away, and `statusRefusalCopy`; the count-in's focus rule says what a blur does.

Nothing is carried forward: each open item is in Accepted, or is one of the two "left" cases above.

**How to verify**

- `npm run check`: green, 147 test files passed and 1 skipped, 5929 tests passed and 2 skipped (as before).
- `E2E_PORT=4383 npx playwright test tests/e2e/design.spec.ts tests/e2e/shortcuts.spec.ts tests/e2e/library.spec.ts tests/e2e/practice.spec.ts tests/e2e/loops.spec.ts --project=phone --project=desktop`: 148 passed, 10 skipped by their own width conditions. With the two classes of finding 4 taken out and the app rebuilt, the 320 px test fails ("the page's width in a 320 px window": 327). The port was free before the run and the preview server stopped with it. No screenshot under `docs/units/*-shots/` was rewritten. No `db:reset`, no `db:seed`, nothing on port 54321.
- By hand, for finding 1: with status writes refused slowly (Build's recipe), on the song's page "More", "Mark finished" on one loop, then at once the round Practise button of another. Back on the song's page the first loop is on the go again with "Couldn't mark the loop finished." and Dismiss under it.

### Copilot review

Two comments on PR #41, both on the fix for Review's finding 1, both confirmed with a failing test first; and one CI failure on the same head.

**A. An open sheet nobody sees counted a refusal as shown** (`LoopPanel.tsx`; checklist 1, "Put away by a screen that never showed it", now extended). `SongPage.tsx` wraps the mounted `LoopPanel` in `<div hidden={recording}>` and keeps `loopPanel.open`, so `showing: open && form === null` stayed true on Original or Drumless: a "Mark finished" refused there was marked as shown and put away on leaving, and the overview had the loop back among the active ones with nothing to say why. `SongPage.tsx` is not this branch's to edit (Unit 19's PR #39 owns its recording parts), and needs no edit: the sheet now reads whether it is drawn from the page. `isOnShow(element)` (`src/lib/onShow.ts`, new, pure DOM: the element is connected and neither it nor an ancestor carries `hidden`) is asked of the sheet's body, whose own `hidden={!open}` makes the one question cover the closed sheet too; `LoopPanel` passes `isOnShow={() => isOnShow(bodyRef.current)}` to `LoopPanelBody` in place of `open`, and the hook asks it in its marking effect. Tests: `onShow.test.ts` (a table); `useLoops.test.tsx` ("a screen that lists the loops but is itself hidden when the refusal lands keeps it on leaving", "…is put away once the screen has been drawn with it"); `LoopPanel.test.tsx`, whose `Panel` harness now wraps the panel as the song page does, with a button that switches to a recording ("refused with the page on a recording (the sheet open, but hidden) and the page left there: said on coming back", and "…then seen back on the tab: gone on coming back").

**B. A screen marked every loop's refusal as shown** (`useLoops.ts`). With no `loopId` the hook took every failed status write of the user's. A change to a loop of song A refused after A was left, then song B's overview opened and left: B marked A's refusal as shown and its clean-up removed it. The hook's options are now `{ onRefused, loopIds, isOnShow }`: `loopIds` is required, the loops the caller draws a status control for now, and only their refusals are marked and so put away. `SongLoops` and `LoopPanelBody` pass the ids of `loops.data` (undefined, so none, while the list is loading or its first read failed; the panel none under the loop form), the practice screen the active loop's while the prompt is up. `loopId` and `showing` are gone: an empty `loopIds` says both. This also closes Review's "left" case above, a refusal marked as shown while the list itself isn't drawn. Tests: `useLoops.test.tsx`, "leaving a screen keeps the refusal of a loop it never drew (another song's)…" and "a screen whose list has not loaded (no loops drawn) puts nothing away; once one is drawn, only that one's"; the older tests there say the same things in the new options.

**Decisions**

- The marking effect has no dependency list: what hides the sheet (a parent's attribute) is nothing the hook is given, so there is nothing to list that would re-run it. It returns before touching the cache when no loops are drawn or the screen is hidden, and otherwise reads the user's failed status writes (a handful at most). Every change of visibility renders the caller: the page's switch renders `SongPage` and with it the panel, and a refusal landing sets the hook's own `heard`.
- `isOnShow` knows `hidden` only, not `inert` (the panel is inert behind the shortcut overlay, and still seen) and not a `display: none` from a class, which the app doesn't use to take mounted things away. Its comment says so.
- `onRefused` still hears every refusal while the screen is up, another song's included (Review's "left" case for a replayed write): the finder then finds nothing. Unchanged.

**Async windows and inputs** (the window is a status write on its way; what is new is in bold)

- Refused with the list on show: marked, put away on leaving. As before.
- Refused with the sheet closed, or under the loop form: not marked; marked when the list is next drawn with it. As before, now through `isOnShow` and `loopIds`.
- **Refused with the page on a recording** (sheet open or closed): not marked; marked on the first render after the tab is back with the sheet open and the list up; kept if the page is left first.
- **Refused for a loop the screen draws no row for** (another song's, or this song's before its list is read): never marked by this screen.
- Left and opened again in one tick, StrictMode's double mount: as before (the leaving timer).

**CI: `design.spec.ts:787` failed on the phone project** ("at 334 px": `pageWidth` 335, expected 334; three tries, so not a flake). The speed and Play row's width is its text's: two 44 px BPM steps round "120 BPM", wider than the pill's `min-w-28`. Locally that came to 334 px, and Review's finding 4 put the narrow layout's end at exactly 20.875rem and asserted a 334 px window had no sideways scroll. On CI's fonts the row is 335 px, so a 334 px window was a pixel too narrow, as a real phone's fonts could make it. Fixed in the CSS, not only the test: the narrow gap and ends now hold under 22.5rem (360 px), 25 px clear of the measured width (`PracticeSpeed.tsx`'s `endButtonClass`, `LoopPracticePage.tsx`'s row). The test asserts the page is the window's width, the row inside it and the ends still 44 px at 320, 328, 334, 344 and 359 px, and the full-size row (16 px gap, 56 px ends, page no wider) at 360 and 390 px. Checklist 6 has a new row, "A width measured on one machine, used as a boundary".

**Files**

- `src/lib/onShow.ts`, `src/lib/onShow.test.ts` (new)
- `src/features/loops/useLoops.ts`, `useLoops.test.tsx`, `LoopPanel.tsx`, `LoopPanel.test.tsx`, `PracticeSpeed.tsx`
- `src/features/song/SongOverviewPage.tsx`, `LoopPracticePage.tsx` (the hook's two other callers, and the row's breakpoint). `SongPage.tsx` untouched.
- `tests/e2e/design.spec.ts`
- `docs/review-checklist.md` (row 1 "Put away…" extended; row 6 new), `AGENTS.md` (the refusal rule's options)

**Known gaps**

- A refusal that lands in the same commit that hides the sheet is judged by the page as that commit left it (hidden), which is the safe side: kept.
- The practice row can still be wider than its text allows for at 360 px and up if a font is more than 25 px wider than the ones measured; the page would pan by the excess.

**How to verify**

- `npm run check`: green, 148 test files passed and 1 skipped, 5943 tests passed and 2 skipped.
- `E2E_PORT=4383 npx playwright test tests/e2e/design.spec.ts tests/e2e/practice.spec.ts tests/e2e/loops.spec.ts --project=phone --project=desktop`: 90 passed, 10 skipped by their own width conditions. The first run of this command, which also built and started the preview server, failed the 16 phone tests of `design.spec.ts` (the first 16 tests handed to the 16 workers, the login page among them) and passed the other 74; its errors were not kept. `design.spec.ts` on phone alone then passed 17 of 17, and the whole command again 90 of 90, so it is put down to the cold start, unproven.
- `E2E_PORT=4383 npx playwright test tests/e2e/design.spec.ts -g "fits a 320 px phone" --project=phone --project=desktop --repeat-each=3`: 3 passed on phone, 3 skipped on desktop (the test is about phone widths).
- By hand, for A: on a song with a tab and a recording, hold status writes (Batch 8 Build's recipe), open the loop sheet, "Mark finished" on a loop, switch to Original before the refusal, wait for it, then go back to the song's page: the loop is on the go again with "Couldn't mark the loop finished." under it.

**C. A song's refusals were not put away on going straight to another song** (Copilot's second review, in its summary; `SongOverviewPage.tsx`; checklist 1, "Kept per value, on a screen that outlives its item", now extended). Confirmed with a failing test first. `SongGate` renders its child in the same place for every song whose row is cached, so Back or Forward between two songs' overviews unmounted neither `SongOverview` nor `SongLoops`: the refusal hook's clean-up, which is what "leaving" is, did not run, and a refusal shown on song A was under its loop again on coming back. The same hole held everything else the overview keeps: the recordings form opened on A (`managingRecordings`) was open on B. A loop row's own state (the delete question, History) was already safe, rows being keyed by loop id.

- Fix: `<SongOverview key={song.id} song={song} />` in `SongOverviewPage`. Keyed at the overview, not at `SongLoops` as suggested, because the recordings form had the same hole and one key covers both; each song's overview is now its own mount, so leaving it for another song is leaving it.
- The other two callers of `useLoopStatusRefusals` had no hole: `LoopPanelBody` is inside `SongPlayer` and the practice screen's hook is in `PracticePlayer`, both already `key={song.id}`. So the hook is unchanged: resetting what it showed when `loopIds` change would need it to tell another song's loops from this song's list changing (a loop deleted, one added), which the key says without guessing.
- Tests (`SongOverviewPage.test.tsx`, "straight to another song's overview and back, with nothing in between", both songs' rows cached, Back then Forward): "a refusal shown on one song is put away, not there again on coming back" and "what was open on one song (a delete question, the recordings form) is not open on the other". Both failed before the key (the second on the recordings form drawn on song B).
- `AGENTS.md` (the refusal rule: the caller is keyed by the song), `docs/review-checklist.md` (the row's new case: a clean-up on unmount is state kept per item).
- No new async window: the leaving timer is the one already there, now also run on a change of song.
- `npm run check`: green, 148 test files passed and 1 skipped, 5945 tests passed and 2 skipped. e2e not run: a key and two component tests.

## Batch 9: Stats copy and locale

### Build

Items 17.3a, 17.3b, 17.4a, 17.4b, 17.5a, 17.5b, 17.5e. Fixes to what the Stats page writes; no new feature, no migration, nothing that deletes data.

**Walk-through** (`docs/product.md`; the page only reads, so the question is whether a fix can be wrong for someone)

- _Day one, one song, one session:_ one song's row, no "Other", no change lines; the dates are English as before in an English browser. The day-change redraw reads nothing and moves nothing the user set (period, an open chart).
- _A piece missing:_ no songs or loops is the one empty state, untouched. Sessions whose loop isn't in the list (deleted elsewhere) are still plain "Other"; with exactly six songs beside them the sixth is named and "Other" holds only those sessions. A song with no tab or no recording is the same row as any other.
- _Offline:_ every change is local: formatting, the device's clock, a scroll position. The offline and failed-read gates are as they were, except that a failed first read now gives its own reason.
- No order forced, no chore added, nothing to tap.

**What changed, per item**

- **17.3a, 17.5b (dates in English, one full stop).** `statsLocale.ts` holds `STATS_LOCALE = 'en'`. `dateLabels.ts` defaults every date to it (`shortDate`, `weekdayDate`, `dateSpan`, `axisDates`; the `locale` argument stays for tests) and gained the three marks the charts wrote with their own module-level formatters: `narrowWeekday`, `shortMonth`, `dayOfMonth`. `chartText.ts` lost `narrowWeekdayFormat`; `DailyMinutesChart.tsx` and `PracticeHeatmap.tsx` lost theirs. No formatter in `src/features/stats/` is built with no locale named, and none is built when a module loads. English dates carry no full stop ("Jun 8", "Sat, Nov 14"), so the doubled one goes with the German date.
- **17.5a (counts grouped).** `countLabel` defaults to `'en'` and is the one formatter of every whole number that can reach a thousand: `daysLabel` ("1,100 days"), `minutesLabel`'s hours ("1,100 h"), `barMinutesLabel`, the new `dayCountAdjective` ("On a 1,100-day streak."), the Songs header's `StreakBadge` number, `neglectedLabel`, the badges' progress lines (which wrote `toLocaleString('en')` by hand for passes only), "Show all N loops", and the speed chart's "over N practice days". `VisitSummary` (practice) calls `daysLabel`, so its streak line is grouped too without an edit.
- **17.3b (a lone sixth song is named).** `timeBySong` lists `shown + 1` songs when exactly that many have time in the period; "Other" is then two songs or more, or none (sessions of unknown loops only, plain "Other"). `otherSongsLabel` is unchanged.
- **17.4a (the right read's reason).** `StatsPage.tsx`: `failureCopy(sessions.isLoadingError ? sessions.error : loops.error)`. The alert is only drawn when one of the two is a loading error, so the other branch is always the loops read's.
- **17.4b (today after midnight).** `useToday()` (`useToday.ts`) returns the clock at each render, as `new Date()` did, and draws its component again when the local day changes. `StatsPage`'s `Stats` uses it for `now`.
- **17.5e (the map opens on its newest week).** `PracticeHeatmap`'s scroll box is scrolled to its end in a layout effect (`useScrolledToEnd`), on mount and when the number of weeks changes.

**Files touched**

- New: `src/features/stats/statsLocale.ts`, `useToday.ts`, `useToday.test.tsx`; `src/test/browserLocale.ts` (a test helper; see Decisions).
- Changed in `src/features/stats/`: `dateLabels.ts`, `chartText.ts`, `statLabels.ts`, `songTime.ts`, `neglected.ts`, `badges.ts`, `StatsPage.tsx`, `DailyMinutesChart.tsx`, `PracticeHeatmap.tsx`, `PeriodTotals.tsx`, `StreakBadge.tsx`, `LoopProgressList.tsx`, `SpeedChart.tsx`, and the tests `dateLabels.test.ts`, `statLabels.test.ts`, `songTime.test.ts`, `neglected.test.ts`, `StatsPage.test.tsx`.
- `tests/e2e/stats.spec.ts`: the seven-songs test's week now expects "Song F" by name, and a new test at 320 px.
- `AGENTS.md`: one bullet under "Songs first, practice screen and stats".

**Decisions**

- **`'en'`, which is en-US.** Dates read "Nov 3" and "Sat, Nov 14", what Playwright's browser and `stats.spec.ts`'s `dateText` already had. The existing unit tests that pass `'en-GB'` are unchanged.
- **Six songs and unknown-loop sessions are seven rows** (six names and plain "Other"). The other choice, "Other (1 song)" holding a song and the unknown time together, keeps the fault the item is about. It needs a loop missing from the list and exactly six songs.
- **The sixth song is named whatever `shown` is** (`shown + 1` named when that is all there is), so the rule is the function's and not the page's.
- **`useToday` is `useSyncExternalStore`, not state set in an effect.** The store's value is the local day key. React reads the snapshot again once subscribed, so a midnight between the render and the subscription is not missed (armed from an effect after it, the timer would aim at the midnight after and the page would be a day behind); StrictMode's second mount leaves one timer and one listener; nothing is set from an effect.
- **The day is asked at most a minute apart** (`DAY_CHECK_MS`), not only at midnight. A laptop asleep overnight wakes with its timers where they were and no `visibilitychange`, and a clock put forward moves no timer; a single timer for midnight is then hours late. A check costs nothing: the component is drawn again only when the day key differs. Every wait is worked out from the clock as it is when the wait starts.
- **`now` is still the clock at each render**, not the midnight the day began or a time held in state: totals compare a loop's `finished_at` and sessions against it, and a session that arrives by refetch must not be ahead of a `now` taken hours earlier.
- **The map scrolls again only when its week count changes.** Any other render (a refetch, the day changing within a week, a period chosen) leaves the box where the reader put it.
- **`barMinutesLabel` groups too** ("1,100" over a bar). A day needs 16 hours 40 minutes of practice to get there; one rule with no exception was worth more than the width.
- **`src/test/browserLocale.ts` is outside `src/features/stats/`.** It is a test helper (`inBrowserLocale('de')`), beside `timeZone.ts`'s `inTimeZone`, which it mirrors; three stats test files use it. The batch's "files: `src/features/stats/*` only" is kept for app code.

**Triage notes**

- The Risk note's `practiceDateLabel`: nothing in `src/features/stats/` calls it, `lastPracticedLabel` or `practiceDayInSentence`, so there was no caller to pass `'en'` from. Nothing done.
- **The same fault outside Stats, not fixed here (for the reviewer):** `practiceDateLabel` (`sessions.ts`) leaves its locale to the browser, and all three callers pass none: a loop's History (`historyDays` from `LoopHistory.tsx`), the loop panel and the song overview ("Last practised 8. Juni" in a German browser, in an English sentence, from the seventh day back). `durationLabel` and the History's passes were not checked for grouping.
- 17.4a's line numbers in the triage (67, 124) were right.

**Async windows and inputs**

- _`useToday`'s wait for the next check (up to a minute, or to midnight)._ The timer fires on time: day key compared, redraw if it differs, armed again from the clock. Fires early (clock a moment behind the timer): no change, armed for the remainder. Clock set forward, or the machine slept: caught at the next check or the next `visibilitychange`, whichever is first. Clock set back: no change, and the next midnight is the real one; set back over midnight, the day goes back. `visibilitychange` (either way): check, clear the timer, arm again; never two timers. Unmount: timer cleared, listener removed; a `visibilitychange` or a timer after it does nothing. StrictMode: subscribe, unsubscribe, subscribe; one of each left.
- _The redraw at a day change._ It is a render of `Stats` only: no read is started, the URL's period and `LoopProgressList`'s open chart and "Show all" are state that stays. A refetch in flight lands as on any render. The heatmap may gain or shift a week on a Monday; if its week count changes the box scrolls to the end again, otherwise it stays.
- _The heatmap's layout effect._ Runs before paint, so there is no frame at the oldest week. Inputs after it: the reader scrolls the box (kept through every later render with the same week count); the window narrows after mount so the map starts to overflow (not handled, see Known gaps).
- _The failed first read (17.4a)._ No new window; while the alert shows, either read may still settle. If the read that was a loading error succeeds on "Try again" and the other is one too, the alert stays with that one's reason.

**Known gaps**

- The Songs header's `StreakBadge` still takes `new Date()` at render. Left open over two midnights with no practice it shows a streak that has ended (over one, it is still right: a streak ends today or yesterday). `useToday()` would fix it in one line; it was left because the item names the Stats page, and it would put a timer under every test that renders the Songs list.
- A window narrowed after the map was drawn (a 320 px phone turned from landscape to portrait on the Stats page) starts to overflow at scroll 0, the oldest week. On mount only, as the batch says.
- The German page test in `StatsPage.test.tsx` cannot see a formatter built at module load (it would be built before the test's locale takes hold). There is none now; `dateLabels.test.ts` covers each function directly.
- e2e ran in Chromium's en-US only. A Playwright run with `locale: 'de-DE'` would prove the acceptance line in a real browser; left to Test.

**How to verify**

- `npx vitest run src/features/stats`.
- `E2E_PORT=4383 npx playwright test stats.spec.ts --project=phone --project=desktop`.
- By hand: Chrome with German first in its languages (or DevTools, Sensors, locale `de-DE`), `/stats` as the seed user: "Best calendar week: …, the week of Nov 3." with one full stop, months over the map "Oct", "Nov", weekday letters M T W T F S S. A sixth song practised this week shows by name. DevTools at 320 px wide with 26 weeks of history: the map shows today's ring without scrolling. For midnight: set the machine's clock to 23:59 with the page open and wait, or change the date and switch tabs away and back.

**Checks**

`npm run check` green: 148 test files (147 passed, 1 skipped), 5,877 tests (5,875 passed, 2 skipped). e2e `stats.spec.ts`, phone and desktop, at `E2E_PORT=4383` (free before the run): 16 passed, no screenshot rewritten. The 320 px test was then run once with the scroll line taken out and failed (scroll 0 against 63). A preview server from the `le-8-focus` worktree was listening on 4383 by the end of that second run; it is another session's and was left alone, so that failing run may have been against its build, which also lacks the fix. Not run: tablet, `design.spec.ts` (no state it audits changed: a named song row and English dates are what it already measured), the full suite, `npm run test:db`.

### Test

No app code changed. 23 unit and component tests and 5 e2e tests added (each e2e on phone and desktop), all in existing files.

**Per acceptance line**

- _With the browser set to German, every sentence on the Stats page is English with one full stop; every count of 1,000 or more is grouped._
  - `tests/e2e/stats.spec.ts`, "in a browser set to de-DE" and "… ar-EG" (`test.use({ locale })`): a throwaway user with 1,101 sessions written by the service role (`addYearsOfPractice`: an hour on each of the last 1,100 days, and a second loop practised once 1,099 days ago). The test first proves the browser is in that language ("8. Juni" and "1.100"; Arabic letters and digits), then runs the same oracles as the seed user's test (`expectTotals`, `expectSongTimes`, `expectWholePage`, whose expected strings now group through `countText`), opens the loop's chart (a table of all 1,100 days, so every month's name is on the page), and sweeps every text node, `aria-label` and `title` in `main`: no letter or digit outside ASCII, no month or weekday as German shortens it, no "8." day, no doubled full stop in a piece or where two meet, the seven sentences each ending in one full stop, no run of four digits but a year, no other thousands mark. Then the Songs header's streak ("1,100 days").
  - `StatsPage.test.tsx`, "counts in a browser set to de / ar-EG": the 1,100-day page under `inBrowserLocale`, where the build's grouping test ran in English only (a German "1.100" has no run of four digits, so it would have passed it).
- _Six songs show six names._ `songTime.test.ts`: a tie at fifth and sixth (both named, title order, whatever order the rows come in; all six level too); Week, Month and All time across 5 / 6 / 7 songs (five names, six names, five and "Other (2 songs)"); seven songs of which one has no time in the period. `StatsPage.test.tsx`, "where the time went, at the sixth song": the same three on the page through the Period choice, and Build's decision pinned: six songs plus sessions of a loop that is gone are **seven rows**, six names (six links, six song-coloured bars) and plain "Other" in the muted bar, adding up to the period's total.
- _The page's "today" is right after midnight._ `StatsPage.test.tsx`, "left open past midnight" (clock faked only): "Show all" kept, the map's box the same element and not scrolled again when the day changes inside a week; a Monday midnight with 12 and with 26 weeks (the window moves on a week, same width, today's ring alone in the new column, not scrolled again) and one that adds a week (14 to 15: scrolled to the end again); the tab hidden before midnight and shown the next morning (yesterday's page until then, the period and the URL kept, nothing read), hidden after midnight; the clock put back over midnight; a session that arrives by refetch after midnight counted as today's. `useToday.test.tsx`: a change of time zone east (the day moves on at the next check, then at the new zone's midnight, not the old one's) and west (back a day when looked at), by assigning `process.env.TZ` inside the test; hidden on another day. Unmount and StrictMode were covered by Build and kill under mutation (below).
- _The failed read's own reason (17.4a)._ `StatsPage.test.tsx`, 'and "Try again" is pressed': the sessions read failing alone; both failed and only the sessions come back (the alert moves to the loops read's reason, both were asked, and the next press asks only for the loops); both failed and only the loops come back (the sessions' reason stays); sessions cached with a failed refresh beside a loops read with nothing to show ("Try again" reads only the loops, and the page opens on the cached rows).
- _`stats.spec.ts` passes at each size and at 320 px (17.5e)._ Three more e2e tests: at 320 px the box is reached by Tab and scrolled to the oldest week and back by the arrow keys, then back again by a finger (touch events through CDP in the phone project, a wheel in the desktop one), the window never scrolling sideways; widths from 360 to 1440 px (see note 1); and the window narrowed after mount, pinned (bug 1).

**Checklist rows**

- _Interleavings (the wait for the next check; the redraw)._ Every input Build listed has a test at hook level, and the redraw now has the page's own: period, open chart, "Show all", the map's scroll, a refetch landing after the day changed. _Effects run twice_ and _late events after unmount_: Build's two tests, killed by removing the listener.
- _A refetch that fails over data._ The 17.4a cases above assert the sessions query is in `error` with its three rows before reading the alert.
- _A copy of what the browser holds (the scroll position)._ "Not scrolled again" is asserted on every redraw that keeps the week count, in jsdom by counting writes to `scrollLeft`, in e2e by reading it. The one case the code doesn't cover is bug 1.
- _Gates, round trips._ None in this batch: nothing is pressed that can refuse except "Try again", which is drawn only while a read has failed to load.

**Each test fails without its code** (app code broken briefly, restored with `git checkout`)

| Broken                                                | Fails                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The scroll line in `useScrolledToEnd` removed         | 5 component tests; e2e at 4384, this worktree's build: Build's 320 px test (scroll 0 against 63), the keyboard and swipe test, the widths test (0 against 1 at 382 px), phone and desktop. The landscape-to-portrait pin still passes, as it should |
| Its dependency list removed (scrolls on every render) | the four "not scrolled again" tests                                                                                                                                                                                                                 |
| Its dependency list `[]` (mount only)                 | "a Monday midnight that adds a week"                                                                                                                                                                                                                |
| `useSyncExternalStore` taken out of `useToday`        | 23, every midnight test of the hook and the page                                                                                                                                                                                                    |
| The `visibilitychange` listener taken out             | 15, every test that looks at the page again, unmount and StrictMode                                                                                                                                                                                 |
| `countLabel` left to the browser's locale             | 4 unit; e2e de-DE "1.100 h 10 min", ar-EG "١٬١٠٠ h 10 min"                                                                                                                                                                                          |
| `countLabel` as `String(value)`                       | e2e "1100 h 10 min"                                                                                                                                                                                                                                 |
| `dateLabels.ts` formatters with no locale             | 8 in `dateLabels.test.ts`; e2e "the week of 1. Juni." and "١ يونيو"                                                                                                                                                                                 |
| `sessions.error ?? loops.error` (the old line)        | Build's cached-rows test and "asks again only for the read with nothing to show"                                                                                                                                                                    |
| `loops.isLoadingError ? loops.error : sessions.error` | the three "both failed" tests                                                                                                                                                                                                                       |
| `failureCopy(loops.error)`                            | those and "only the sessions read failed"                                                                                                                                                                                                           |
| "Try again" reads both lists whatever failed          | the two tests that count reads                                                                                                                                                                                                                      |
| `named = shown` in `timeBySong`                       | 11, every sixth-song test in both files                                                                                                                                                                                                             |

**Bugs found**

1. **The map narrowed after it was drawn opens on its oldest week** (Build's known gap, now pinned in e2e; low). Repro: 640 x 320 window, `/stats` with 26 weeks of history (the map fits), then 320 x 640: the box overflows by 63 px at scroll 0, today's ring off its right edge. Turning a 320 px phone on the Stats page is the only way there; on a 360 or 375 px phone the same turn leaves it 23 or 8 px short, with today still on show. Not fixed: scrolling to the end when the box starts to overflow needs a `ResizeObserver` and a rule for a reader who had already scrolled, more than a few lines. `stats.spec.ts`, "a 320 px phone turned from landscape to portrait…" asserts today's behaviour; its last three expectations turn round when this is fixed.
2. **The page-level German date test in `StatsPage.test.tsx` can't fail when run with the rest of its file** (a test weakness, not an app bug). `dateLabels.ts` keeps each formatter for the life of the module, keyed by locale and shape; by the time "writes every date in English…" runs, earlier tests have built every one in English. With the formatter built on `undefined`, that test fails alone (`-t`) and passes in the full file. `dateLabels.test.ts` (8 failures) and the new e2e catch the fault, so nothing is uncovered. Left as it is; clearing the cache would need an export from the module for tests only.

**Notes for the reviewer**

1. **"Under 358 px of page" is a 390 px window.** The page's column is the window less two 16 px gutters, and a 26-week map needs 351 px. Measured: it fits from a 384 px window up, and scrolls in its box by 1 px at 382, 8 px at 375, 23 px at 360 and 63 px at 320; and again by 7 px at 1024 px, where the page turns to two columns and the map's is 344 px wide. So before this batch a 375 px iPhone (SE, mini) and every 360 px Android opened with the newest week cut, not only a 320 px phone; the fix covers all of them and the test pins each. It also means 17.5d ("under 358 px of page the charts' text is 9.3 px … narrower than any phone the app is laid out for", `docs/plan.md`) is about 360 and 375 px phones as well. Not touched here; plan.md is not this stage's to edit.
2. The scroll box takes keyboard focus because Chromium makes a scroll box with nothing focusable in it a tab stop. Firefox does the same and Safari does not (from memory, neither was run), so a keyboard user there can't scroll the map (the week table behind it says the same to a screen reader). Not from this batch.
3. `clockLabel` writes its hours ungrouped ("1000:00:00"). Nothing on the Stats page can reach it (a session is capped at 24 hours in the database).
4. Not written: a page-level StrictMode or unmount test (the hook's cover it); the heatmap's scroll in jsdom beyond counting writes (jsdom lays nothing out).

**Checks**

- `npm run check` green: 148 test files (147 passed, 1 skipped), 5,900 tests (5,898 passed, 2 skipped).
- `E2E_PORT=4384 npx playwright test stats.spec.ts --project=phone --project=desktop`: 26 passed. Port 4384 was free before each run and after it; every run built this worktree.
- `E2E_PORT=4384 npx playwright test design.spec.ts --project=phone --project=desktop`: 23 passed, 3 skipped. No screenshot under `docs/units/*-shots/` rewritten.
- Not run: tablet, the full suite, `npm run test:db`. Chromium only: Safari's and Firefox's own date and number formatting were not run.

### Review

Merged `origin/main` first (batches 1, 2, 4, 5 and Unit 19; batch 8 was not on it yet): no conflict. Unit 19's migration `20261201000000_song_link_bar_one.sql` was already applied on the shared local stack (`npx supabase migration list`), so nothing was run against the database.

**Inventory** (what the batch's diff adds or changes that holds state or draws)

- `useToday` (`useToday.ts`): a `useSyncExternalStore` over the local day key, with `watchDay`'s timer and `visibilitychange` listener. Used by `StatsPage`'s `Stats`, and since this stage by `StreakBadge`.
- `PracticeHeatmap`'s `useScrolledToEnd`: a layout effect that writes `scrollLeft`, keyed on the number of weeks. Since this stage the box is also a named tab stop.
- `dateLabels.ts`: a module-level cache of formatters, keyed by locale and shape.
- `StatsPage`'s load alert: which read's error it names, and what "Try again" reads.
- Pure: `countLabel` and its users (`statLabels.ts`, `badges.ts`, `neglected.ts`), `timeBySong`'s sixth song, the locale constant.
- Tests and helpers: `src/test/browserLocale.ts`, `useToday.test.tsx`, the additions to `StatsPage.test.tsx`, `dateLabels.test.ts`, `statLabels.test.ts`, `songTime.test.ts`, `neglected.test.ts`, `tests/e2e/stats.spec.ts` (`addYearsOfPractice`, `everythingWritten`, `practiceMap`).
- No mutation, no migration, no script.

**Behaviour pass**

- _`useToday`, interleavings._ The snapshot is a string (`dayKeyOf`), so it is stable between changes and React's check after subscribing can't loop; the hook returns a fresh `Date` at each render but the store's value is only the key. A render at 23:59:59.999 whose `new Date()` lands on the next day is drawn again by React's own re-read of the snapshot. `addDays` steps the calendar to the next local midnight, so a 23- or 25-hour day counts to the right instant (`msUntilNextCheck`'s Berlin test), and the wait is never 0 (at midnight itself the next one is a day off, capped at a minute), so the timer can't spin. A timer that fires early is armed again for the remainder; one that fires late, or a clock moved either way, is caught within a minute or at the next `visibilitychange`. Unsubscribing clears the timer and the listener; StrictMode leaves one of each. All of it has a test in `useToday.test.tsx`, each killed by Test's mutations. Nothing to fix.
- _The heatmap's layout effect._ Runs before paint; writes only when the week count changes, so every other render leaves the reader's scroll alone (four tests count the writes). `box.current` is set by then (a ref on a plain element). A box that only starts to overflow later is the one case not covered: see 20.9a below.
- _Gates._ "Try again" reads only the reads that failed to load, and the alert names the read with nothing to show; tested both ways round. Nothing else can refuse.
- _Round trips._ None: the page only reads. `countLabel` formats for display and nothing parses it back.
- _Validated paths, what is drawn._ Findings 1, 4 and 5.

**Findings**

1. **The same locale fault outside Stats** (`src/features/practice/sessions.ts:110`, `practiceDateLabel`; checklist: new row, "The reader's locale inside the app's own sentences"). Its three callers pass no locale: a loop's History (`historyDays`), `LoopPanel.tsx:625` and `SongOverviewPage.tsx:279` ("Last practised 8. Juni" in a German browser, from the seventh day back). **Fixed**, test first (`sessions.test.ts`, "with the browser set to German": '2. Nov.' against 'Nov 2' before the fix). The constant moved to a pure shared module, `src/lib/copyLocale.ts` (`COPY_LOCALE`), in place of `stats/statsLocale.ts`, so `practice/` doesn't take a copy rule from `stats/`; `practiceDateLabel`, `practiceDayInSentence`, `lastPracticedLabel` and `historyDays` default to it. Every other date or number written into copy was checked: `src/` has no other `toLocale*` or `Intl` call (grep), and `durationLabel`, `speedLabel`, the sitting summary and `clockLabel` build their text from template strings, which are the same in every locale.
2. **A History row's passes were never grouped** (`sessions.ts:90`, `repeatsLabel`; 17.5a's class, outside Stats). A one-bar loop played for forty minutes is "1100 passes" in History beside "1,100" on the Stats page. **Fixed** in the same line of work: `repeatsLabel` groups on `COPY_LOCALE` (test: `[1100, '1,100 passes']`, failed first). The practice screen's sitting line uses the same function.
3. **Test bug 2: the page-level German date test couldn't fail in its file** (`StatsPage.test.tsx`, "writes every date in English…"; checklist: new row, "A test that sees what an earlier test built"). **Fixed**: `dateLabels.ts` exports `forgetDateFormats()`, and the German describes in `StatsPage.test.tsx` and `dateLabels.test.ts` call it in `beforeEach`. Proved by building the formatter on `undefined` and running both whole files: 9 failures, the page test among them (it passed before).
4. **The Songs header's streak read the clock once** (`StreakBadge.tsx:13`, Build's known gap; interleavings). **Fixed**: `useToday()`, called before the early return. Test first: `StatsPage.test.tsx`, "takes the Songs header’s streak away once it has ended, two midnights on" (failed with `new Date()`). The library's twelve test files stay green with the timer under them.
5. **The map's scroll box was a tab stop only where the browser makes it one** (`PracticeHeatmap.tsx:55`; checklist: accessibility claims). **Fixed**: `tabIndex={0}`, `role="group"` named "Practice days map", and `focusRing`. Test first in "a practice-days map wider than its box" (failed without it); `design.spec.ts`'s focus audit passes with the new stop, and Test's keyboard e2e (Tab to the box, arrows scroll it) passes unchanged. It is a tab stop when the map fits too, where the arrows do nothing: one more Tab on wider screens, chosen over measuring the box.

**What Build and Test logged, settled**

- _The locale fault outside Stats:_ fixed (finding 1).
- _Test bug 2:_ fixed (finding 3).
- _Test bug 1, the map narrowed after it was drawn:_ **Accepted (20.9a)**, `docs/plan.md`. A fix that can't fight the reader has to follow the box's size and know whether it was at its end (a `ResizeObserver` and a scroll listener, with a stub of both for jsdom): more than the few lines the case is worth, for a 320 px phone turned on the Stats page. The e2e pin stays.
- _`StreakBadge`:_ fixed (finding 4), so no Accepted line for it. **20.9b** is what the same search found and this stage did not change: "Last practised today" in the loop panel and on the overview, and "Today" in a loop's History, are worked out at render with no `useToday`. Accepted with its reason in the plan.
- _Keyboard scrolling of the map:_ fixed (finding 5).
- _17.5d in the plan:_ reworded with what was measured in this stage (below). It is about the charts' text, which is 9.3 px on a 320 px phone only (10.5 px at 360, 11 px at 375); the map's text never goes under 10 px, since the map scrolls instead, and 17.5e's fix covers every width where it does.

**Rejected**

- _`useToday` returns a new `Date` each render, so it is "unstable"._ The store's snapshot is the day key, which is what must be stable; the `Date` is the hook's return value, read once per render as `new Date()` was.
- _The minute timer runs while the tab is hidden._ Browsers throttle it; a check is one string comparison. Stopping it while hidden would add a state for nothing.
- _`countLabel` on a bar's minutes and on counts that can't reach a thousand._ One rule, as Build decided.
- _`inBrowserLocale` swaps globals by hand._ It puts each back in `afterEach` and asserts in `beforeEach` that the switch took, so it can't leak or be vacuous.

**Visual pass** (no QA stage ran for this batch; a throwaway spec with the e2e helpers, phone and desktop projects, a `de-DE` context that first proved `(1100).toLocaleString()` is "1.100"; not committed)

- Stats page, German browser: "Best calendar week: 40 min over 1 day, the week of Nov 16." with one full stop, months "Jul" to "Nov" over the map.
- A loop's History on the overview with days 10, 40, 200 and 400 days back: "Nov 18 · 40 min · 60% · 1,100 passes", "Oct 19 …", "May 12 …", "Oct 24, 2025 …"; the loop's line "Last practised Nov 18" (hidden under 640 px by design).
- The map at 320 px: opens at its end (63 of 63 px; 23 of 23 at 360, 8 of 8 at 375), today's ring on show; focused by keyboard it draws the 2 px focus ring round the box, inside the page's gutter, and the arrows scroll it.
- Text sizes measured there: the two-week chart's 9.3 px at 320, 10.5 px at 360, 11 px at 375; the map's 10 px at each.

**Docs**

- `docs/plan.md`: Unit 17's Carried forward is "None left" (17.3a, 17.3b, 17.4a, 17.4b, 17.5a, 17.5b, 17.5e deleted); batch 9 marked done in Unit 20's list; Accepted gains 20.9a and 20.9b and 17.5d is reworded.
- `docs/loose-ends.md`: Batch 9 marked done with what differs as built; 17.5d's row reworded; the "could not verify" line for 17.5d and 17.5e deleted (both measured now).
- `docs/review-checklist.md`: two rows, named in findings 1 and 3.
- `AGENTS.md`: the batch's bullet now says the rule is the whole app's (`COPY_LOCALE` in `src/lib/`), names `forgetDateFormats`, `StreakBadge`'s `useToday` and the scroll box as a tab stop.

**Open issues**

None beyond the two Accepted lines.

**Checks**

- `npm run check` green: 156 test files (155 passed, 1 skipped), 6,397 tests (6,395 passed, 2 skipped).
- `E2E_PORT=4384 npx playwright test stats.spec.ts design.spec.ts practice.spec.ts --project=phone --project=desktop`: 76 passed, 4 skipped. Port 4384 was free before and after; no screenshot under `docs/units/*-shots/` was rewritten.
- Not run: tablet, the other specs, `npm run test:db` (nothing here touches Supabase). Chromium only.

### Copilot review (PR #42)

Two comments, both confirmed, and four failed CI jobs on f4d461b (the batch merged with main), which were two causes. None of it showed on the Windows laptop the batch was built on.

**CI failures**

- `check`: `useToday.test.tsx`, "west, back into yesterday: the day goes back when the page is looked at", expected `2026-11-26` and got `2026-11-27`. The test's home zone was `America/Edmonton`, and it expected Edmonton's midnight at 07:00 UTC (UTC-7). Alberta stopped putting its clocks back in 2026: tz data from 2026 has Edmonton on UTC-6 in November, midnight at 06:00 UTC. The laptop's Node 22.15.0 carries tz data 2025a (UTC-7), CI's Node 22.23.5 a newer one (checked on a Linux Node with 2026e: `GMT-06:00` for the test's instant). The app was right on both; the test was bound to one machine's tz data. Fix: the zone tests use fixed offsets (`Etc/GMT+7`, `Etc/GMT-9`, `UTC`), which have no rules to change. `TZ=UTC npm run check` passes too.
- `e2e (2/6)`, `(4/6)`, `(6/6)`: the same two tests, once per project (phone, tablet, desktop): "on a 320 px phone a 26-week practice-days map opens on its newest week, today on show" and "on a 320 px phone the map scrolls back to its oldest week by keyboard and by a swipe, and the page never scrolls sideways", both at `expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0)`, received 29, on every retry. Both tests are new in this batch and had only run on Windows. Cause, in the app: the tables behind the charts were `<table className="sr-only">`, and a table ignores `sr-only`'s 1 px width: it grows to its cells, on one line each (`nowrap`), so the "Practice days by week" table was 274 px of hidden width on Windows' fonts and reached 29 px past a 320 px window on CI's DejaVu Sans. Reproduced locally by forcing Verdana (27 px of sideways scroll before, 0 after, with letter spacing added). Fix: `ChartTable` (`src/features/stats/ChartTable.tsx`), the table inside an `sr-only` box, used by `DailyMinutesChart`, `PracticeHeatmap` and `SpeedChart`. Test: the first 320 px test now also asserts the cause, which no font decides: no `sr-only` element in `main` measures wider than its 1 px (`hiddenTextTakingRoom`); it failed first with the two tables at 183 and 274 px.

**Comment A (`useToday.ts`): a zone change that keeps the date. Confirmed, in two parts.**

- No redraw: the snapshot was the day key alone, so UTC to UTC-7 at 20:00 UTC on the 27th changed nothing, while a 02:00 UTC session had moved to the 26th.
- Stale formatters: `dateLabels.ts` keeps its `Intl.DateTimeFormat`s, and one built with no `timeZone` keeps the zone the device had then. With the redraw fixed and this not, the date test still read "Nov 27".
- Tests first (`useToday.test.tsx`, "to a zone where it is the same date": drawn again on a look and within a minute, once only; dates written in the new zone; `StatsPage.test.tsx`, the same on the page: the two-week table's "Today 10 min" becomes "Nov 26 10 min, Today 0 min", nothing read again). All failed before.
- Fix: `useToday`'s snapshot is the day and the zone's name (not its offset: two zones an offset apart today can differ on the days sessions were played), and on every read it tells `dateLabels.ts` the zone (`keepDateFormatsIn`), which drops its formatters when it has changed. `practiceDateLabel` uses `toLocaleDateString` and keeps nothing.

**Comment B (`stats.spec.ts`): "Jun 8" only from June 8 to December 31. Confirmed.**

- The 1,100 days are counted back from the run, and `shortDate` gives a date in another year its year, so from January 1 to June 7 every June 8 reads "Jun 8, 2026" or earlier. Now any piece matching `/^Jun 8(, \d{4})?$/`.
- The rest of the batch's tests, read for the same class (what they say on January 1, a Monday, a month end, a clock change): the German-browser component test builds its dates from the fixture's own with the app's year rule; the period fixtures (`daysAgo(1)`, `(20)`, `(100)`) sit inside rolling 7- and 30-day windows whatever the date; the 26-week map's 200 days are past its cap on any weekday; the Monday-midnight tests run on a faked clock. The only other one was the Edmonton test above.

**Decisions**

- The zone is read with `new Intl.DateTimeFormat().resolvedOptions().timeZone` on each snapshot read (each render and each check, a minute apart). Telling `dateLabels.ts` from the snapshot getter, not from the timer, covers a render that comes for another reason after the zone moved.
- `sr-only` on a wrapper, not `display: block` on the table, which some screen readers take as no longer a table.

**Files:** `useToday.ts`, `dateLabels.ts`, `ChartTable.tsx` (new), the three charts, `useToday.test.tsx`, `StatsPage.test.tsx`, `tests/e2e/stats.spec.ts`, `docs/review-checklist.md` (three rows: hidden from the eye, still in the layout; a redraw keyed on part of what the drawing depends on; an expectation that holds only on some dates or some machines), `AGENTS.md`.

**Async windows and inputs:** none added. `useToday`'s check is the one there was (the timer and `visibilitychange`); it now also draws again for a zone change.

**Known gaps**

- The DST tables in `streak.test.ts`, `totals.test.ts`, `records.test.ts`, `loopProgress.test.ts` and `badges.test.ts` name places (`Europe/London`, `America/New_York`, `Australia/Sydney`) with 2026's change dates. They are about those places' rules and pass on both tz data versions today; if a place drops its clock change they fail, as they should, but not all of them first assert the 23- or 25-hour day they rely on.
- `StatsPage.test.tsx`'s `today` fixture is 08:00 on the day of the run, which is ahead of the clock in a run before 08:00 local. From Unit 16, not this batch; not changed.
- CI's fonts aren't on the laptop. A wide font was forced to reproduce the overflow; the proof on CI's own is the next run.

**Verify:** `npm run check` and `TZ=UTC npm run check` green (6,512 tests). `E2E_PORT=4384 npx playwright test tests/e2e/stats.spec.ts`: phone and desktop green; the 320 px and locale tests at all three sizes with `--repeat-each=3`, 45 of 45.

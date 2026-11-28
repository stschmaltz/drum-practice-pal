# Unit 20: Loose ends

One section per batch of `docs/loose-ends.md`.

## Decisions built as defaults

The running list for Shane (`docs/loose-ends.md`, Decisions for Shane, has each decision's options and reasoning). Each was built without waiting for an answer; he can overrule any of them.

- **D1, does the Tab page still play loops?** Built: **A**, keep the loop sheet and fix its three cheap faults (batch 4, built here: the count-in that starts a run closes the sheet, focus goes to its header, the reopened sheet shows the playing loop; typed bars come on screen under either answer). Not built: B, make the sheet a list of links to the practice screen (a unit of its own, never started without his say).
- **D9, which count-ins close the Tab page's loop sheet?** (new with batch 4) Built: **A**, only the count-in that starts a run, and never while the loop form is open. With "before every repeat", a sheet opened mid-loop stays open and each repeat's count-in is heard but not seen behind it on a phone and a tablet. Not built: B, every count-in closes it (one line, but the sheet then closes under the finger at every pass); C, A plus a beat count in the sheet's header (QA's idea, small).

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

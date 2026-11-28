# Unit 20: Loose ends

One section per batch of `docs/loose-ends.md`.

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

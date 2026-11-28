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

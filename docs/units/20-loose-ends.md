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

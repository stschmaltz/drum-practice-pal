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

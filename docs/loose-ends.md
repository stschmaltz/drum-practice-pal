# Loose ends: triage of every carried-forward item

Unit 20, written 2026-11-28 on branch `unit-20-loose-ends` (main at `9dd2f3c`, after Units 14, 16 and 17, plus `6f1f945`, the rule that Carried forward lists are kept short: AGENTS.md, Stage workflow). Every bullet of every **Carried forward** list in `docs/plan.md` was checked against the code and tests on this branch and given one class. A bullet that held two issues was split, so ids such as 13.05a and 13.05b are parts of one old bullet.

How to read the classes:

- **GONE**: no longer true, or no longer reachable. Deleted from the plan.
- **DONE**: already fixed or already decided. Deleted from the plan.
- **FIX**: a defect or gap code can close. It is in a batch below.
- **DECIDE**: turns on how Shane practises, or on a product choice. It has a D number below, and its recommendation is built as the default (see Decisions for Shane).
- **ACCEPT**: real, not worth fixing now. It is in the Accepted section of `docs/plan.md`, with why and what would change that, so nobody raises it again.
- **HUMAN**: only checkable by ear or on a real device. Moved to the Open human checks table.

Names used here: the **Tab page** is `/songs/:id/play` (what the plan used to call jam mode or the song page); the **practice screen** is `/songs/:id/loops/:loopId`; the **overview** is `/songs/:id`.

What was not run: the e2e suite, any browser, any real device. Rows that rest on reading alone say so under "Could not verify" at the end.

## Summary

| Class  | Items |
| ------ | ----- |
| GONE   | 7     |
| DONE   | 11    |
| FIX    | 29    |
| DECIDE | 8     |
| ACCEPT | 32    |
| HUMAN  | 4     |
| Total  | 91    |

Batches, in order of value to someone practising at a kit. No two batches touch the same files.

| #   | Batch                                                    | Items                                                                       | Size |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------- | ---- |
| 1   | A slow connection never holds up Play                    | 13.06, 13.14, 13.16a, 14.4b                                                 | M    |
| 2   | Queued practice is never dropped                         | 13.23, 14.6                                                                 | M    |
| 3   | Tab page: the score stays put                            | 13.26, 13.29, 13.30, 13.31a; 20.4a (found in batch 4)                       | M    |
| 4   | Tab page: the loop sheet                                 | 13.27a whatever D1's answer; 13.28a, 13.28b, 13.32 (D1's default, option A) | S    |
| 5   | Practice history says what happened                      | 17.1; D4's default (13.18b)                                                 | M    |
| 6   | Sign-in and sign-out                                     | 13.01; D2's default (13.05a, 13.05b), "Sign out anyway" asked first         | M    |
| 7   | Recordings                                               | D8's default (14.3); 14.2 once the Human check has tried it                 | S    |
| 8   | Focus and small jumps                                    | 13.21, 13.35c, 13.37a, 13.37b                                               | S    |
| 9   | Stats copy and locale                                    | 17.3a, 17.3b, 17.4a, 17.4b, 17.5a, 17.5b, 17.5e                             | M    |
| 10  | Scripts and seed                                         | 13.10, 14.5                                                                 | S    |
| 11  | Docs only (this unit's first commits, then a last check) | every GONE, DONE, HUMAN and ACCEPT row                                      | S    |

Sizes: S is under an hour of building (tests on top), M an afternoon, L a unit of its own. D6 (bigger notation) and D7 (the video beside the score) are not in a batch: both wait for Shane to look at a real device, and D6 would be an L. D3 and D5 are not in one either: their recommendation is to build nothing.

## Decisions for Shane

Each has the options, what I would pick and why (from `docs/product.md`), and what is then built. Asked on 2026-11-28.

**Nothing here waits for an answer.** Each recommendation is built as the default (AGENTS.md, Stage workflow: a question is asked, not parked). The unit keeps a running list of what was built for each decision, with the options beside it, in its handoff note (`docs/units/20-loose-ends.md`), and its report puts that list to Shane so he can overrule any of them. Where the recommendation is to build nothing (D3, D5, D6 and D7 as recommended), nothing is built and the decision lives here and in Unit 20 of `docs/plan.md`, not in a Carried forward list.

The waits that stay are for a real device, which no default can stand in for: `sandbox` on the YouTube frame (14.2), D6 and D7.

**Shane's standing exceptions for this unit** (2026-11-28). He is asked first, and nothing is built or run until he answers, before:

- any database migration (no batch needs one as written);
- anything that deletes user data: batch 6's "Sign out anyway", which discards unsent practice, and batch 10's sweep run with `--delete`;
- anything sized L: D1's option B, D6's option B, Web Locks for 13.22.

### D1. Does the Tab page still need to play loops?

Since Unit 16 a loop is practised on its own screen: the loop's bars alone, the speed stepper, Play beside it, "Mark finished?" under the score. The Tab page still has the whole loop sheet with "Play loop", the loop's speed and the finish prompt, and seven of the open items live only in that sheet as a place to play loops (13.28a, 13.28b, 13.32, 13.34a, 13.35b, 13.38a, 13.38b). An eighth, 13.27a (typed bars not scrolled to), is on the Tab page too, but in the loop form, which both options keep.

- **A. Keep the sheet as it is and fix its three cheap faults** (batch 4, with 13.27a): the count-in number behind an open sheet, focus left on a hidden button, the playing loop scrolled out of the reopened sheet. Accept the rest (about 112 px of score beside an open sheet on a phone, the prompt behind a closed sheet).
- **B. Make the sheet a list**: each loop's row links to its practice screen, and the Tab page only plays the whole song and makes new loops. Those seven items go, with `LoopSpeedControl`, the sheet's finish prompt and a few hundred lines of tests. 13.27a does not go: "New loop" and its form stay, so typed bars still need scrolling to. A unit of its own (L).

Recommendation: **A**, built as the default (batch 4). **Built: A** (2026-11-28, `docs/units/20-loose-ends.md`, Batch 4). Taking away a way to practise needs evidence that nobody uses it ("no forced order": some people will loop a part with the whole song on screen), and A costs an hour. If Shane says he has not pressed "Play loop" on the Tab page since the practice screen arrived, B is the better end state and should be designed with `/design`; it is an L, so it is never started without his say.

### D2. What happens to unsent practice when sign-out is forced, or can't happen? (13.05a, 13.05b)

Today a sign-out the server forces (a refresh it refuses) empties the device, outbox included, so practice not yet sent is lost without a word. And the user's own Sign out is off while any write is unanswered, so behind a captive portal that reports "online" it stays off for as long as the write keeps retrying.

- **A. Leave both.** Forced sign-outs are rare and one user owns the device.
- **B. Keep the outbox across a forced sign-out** (entries are keyed by user id; replay them when the same user signs in again, drop them when another does), and under the "still on their way" note offer "Sign out anyway" that says what will be lost.
- **C. Only "Sign out anyway".**

Recommendation: **B**. Job 3 and job 6 both rest on the record of practice being kept; losing a session silently is the one failure a drummer can't see or redo. What is kept on the device is small rows (loop ids, speeds, times), not content. Build: batch 6, M. Keeping the outbox is built as the default; "Sign out anyway" discards unsent practice, so Shane is asked before that half is built.

### D3. Is time with the page hidden practice time on a laptop? (13.18a)

Hiding the page (another tab, minimising) ends the session there and a new one starts on return. Right for a phone in a pocket.

- **A. Keep it.**
- **B. On a wide screen, keep counting while the loop sounds.**

Recommendation: **A**, the default, nothing to build. "The app records what it can see happen": with the page hidden the score can't be read, and the app can't tell drumming from a tab left playing. The sitting's time on the practice screen and the overview's summary already add the pieces up. Change it only if a week of laptop practice shows split sessions that matter.

### D4. Should a loop's History group sessions by day? (13.18b)

Every stop of 30 seconds or more is a row, so one sitting with pauses is several rows ("3 min", "1 min", "4 min", all today).

- **A. Leave the rows.**
- **B. One row per day**: the day, total time, passes, and the speed (the speed with the most play time that day, the rule Unit 17's chart uses). Sessions stay stored as they are.

Recommendation: **B**, built as the default. **Built: B** (2026-11-28, `docs/units/20-loose-ends.md`, Batch 5; what a day's row says about a try at full speed is D10). The Stats page already treats a practice day as the unit, and the question History answers is "is this loop getting faster over days" (job 3), which a list of pauses hides. Build: a pure `historyDays(sessions, now)` in `src/features/practice/sessions.ts` and `LoopHistory.tsx` drawing it. S to M, in batch 5.

### D5. Should short stretches on several loops add up? (13.20)

Leaving a loop ends its session: logged with 30 seconds of play, dropped with less. A pedal flipping between two loops every few bars logs nothing for either.

- **A. Keep the 30 seconds per stretch.**
- **B. Carry a loop's unlogged seconds over while the screen stays, and log them when the screen is left.**

Recommendation: **A** for now, the default, nothing to build. Nobody has practised with a pedal yet (the Unit 10 human check is still open); decide after that check. If B is wanted it is a rule in `sessionTracker.ts` (M).

### D6. Is the notation big enough at the kit? (13.36)

Notation is at alphaTab's default size. Raising it broke taps in one layout or the other when 13 Build tried (alphaTab 1.9's `boundsLookup` looks scaled in page layout only).

- **A. Leave it at 1.**
- **B. Investigate alphaTab's bounds, make hit-test, highlight and scroll scale-aware, then raise `NOTATION_SCALE`.** A unit of its own (L), every tap and highlight test re-proved at three sizes.

Recommendation: **A**, the default, nothing to build, until Shane has read a loop on the practice screen from the throne. That screen now draws the loop's bars alone, which is the case the size mattered for. If it is too small, B.

### D7. On a phone on its side, should the video sit beside the score? (14.1)

The video bar is the 200 px frame with its note beside it, a little over half of a 390 px tall window; the score has about 180 px, one line.

- **A. Leave it.**
- **B. In a `short` window put the video in a column beside the score.** M.

Recommendation: look first (it is in the "Recordings" row of Open human checks), then **B** only if one line of score is not enough to read along. Nothing is built before that look. Job 4 is reading along, and on a phone on its side that is the whole point of the screen.

### D8. Should a playing video survive a short drop in the connection? (14.3)

`RecordingBox` draws no frame while the device reports offline, so a video that is playing is taken away at a Wi-Fi blip and starts from the top when the connection is back.

- **A. Leave it.**
- **B. Never take away a frame that has loaded; only refuse to make a new one offline.**

Recommendation: **B**, built as the default. "Design around a platform's limits in the open": YouTube's player plays on from its buffer, and the app is what stops it. At a jam space with bad Wi-Fi this restarts the song mid-play-along. Build: `RecordingBox.tsx` latches "loaded" on the frame's `load` event per `embedUrl`. S, batch 7.

### D9. Which count-ins close the Tab page's loop sheet? (from batch 4; 13.32)

Below 1024 px the open sheet lies over the count-in number. Batch 4 closes it when playback starts with a count-in. With "before every repeat" on there is a count-in at every pass, and a sheet open then was opened while the loop played, usually for its speed.

- **A. Only the count-in that starts a run closes it** (from not running to counting in). A sheet opened during a count-in, or mid-loop, stays open over every count-in after it: the number is behind it on a phone (all of it) and a tablet (three quarters), and the clicks are still heard.
- **B. Every count-in closes it.** The number always shows; on a two-bar loop the sheet closes under the finger every few seconds, and a tap meant for "Faster by 5%" lands on the score. One line: the rule `countInClosesPanel` becomes `now === 'countingIn' && before !== 'countingIn'` (still never with the loop form open), and one row of its table.
- **C. A, plus a beat count in the sheet's header while it is open over a count-in** ("Loop: Verse · 3"). Nothing closes and the count is seen. QA's idea; S, a few lines in `LoopPanel.tsx` reading `snapshot.countIn`, with one thing to settle: the header is a button, and a name that changes every beat must not be read out every beat.

Recommendation: **A**, and C if the Human check says hearing the count-in isn't enough. "No chores": a control the user opened shouldn't be taken away at every pass. **Built: A** (2026-11-28, batch 4; evidence in `docs/units/20-loose-ends.md`, Batch 4, QA issue 4, with `b4-phone-repeat-count-in-sheet-open.png` and `b4-tablet-repeat-count-in-sheet-open.png` in `docs/units/20-shots/`).

### D10. What does History say about a day that had a try at full speed? (from batch 5; 17.1, D4)

One sitting, three speeds on one screen: ten minutes at 80%, a nudge to 100% for the last seconds, Pause, back to the song. The overview's summary says "Fill: 15 s, 80% → 100%", the loop's line says 100% (the speed it was left at), and its History says "Today · 15 s · 80% · 3 passes". Each is right by its own rule, but nothing on the History said the rule, and on the day a drummer first reaches 100% the row reads as "the 100% wasn't recorded" (20 batch 5 QA issue 1; `b5-390x844-summary-beside-history.png` in `docs/units/20-shots/`).

- **A. Say the rule in the History**: one line under its total, the sentence the Stats page already has under Loop progress ("Each day counts at the speed you spent the most time at, so a quick try at full speed isn't a day at full speed."). One string for both places (`DAY_SPEED_NOTE` in `src/features/practice/sessions.ts`).
- **B. "mostly" in each row**: "Today · 15 s · mostly 80% · 3 passes". No extra line, but the word is on every row, also on days played at one speed.
- **C. The day's top speed too**: "80%, up to 100%". The only option that shows the 100% happened. A session stores one speed, so the tracker would have to keep the fastest speed played as well (a new column, so a migration, and Shane is asked first), or History would show it only for days whose sessions happen to differ.

Recommendation: **A**, and C if a week of real rows says the try at full speed is what he looks for. "The app records what it can see happen": the row's 80% is the true answer to job 3's question, and it only needed saying. **Built: A** (2026-11-28, batch 5 Review).

## Batches

Each is one Build session. Files listed are the ones the batch may change (their tests go with them).

### Batch 1. A slow connection never holds up Play (M)

**Done** (branch `le-1-slow-connection`; `docs/units/20-loose-ends.md`, Batch 1). What it chose to live with is in the plan's Accepted section as 20.1a to 20.1d.

- **13.06** A loop's practice screen opened on a connection that hangs keeps Play off until the loops read gives up. `useRequestedLoop` waits for a read since the page opened whenever the cached list is stale (over 30 s), and `canPlayLoopPractice` needs the loop open. Fix: cap the wait (about 2 s) in `useRequestedLoop`, then open from the cached list as it does offline; a later answer with another speed still lands through the list. Test: `LoopPracticePage.test.tsx` with `loops.holdNext('select')` and fake time: Play is enabled after the cap, and the held answer does not reopen or restart the loop.
- **13.14, 13.16a** postgrest-js retries every failed GET three times (1, 2, 4 s) under TanStack Query's two retries, so "Loading loops…" lasts about 24 s with no connection and an upload's lost look-up about 33 s. Fix: turn postgrest's own retry off (the client option, or `.retry(false)` in each read; both are in the installed typings) and keep it only on `uploadSong`'s look-up by id. Test: a fake-timer test that a failed loops read shows its error within TanStack's own back-off (about 3 s); `songsApi.test.ts` keeps the look-up's behaviour.
- **14.4b** `?source=` on a hanging connection shows "Loading the recording…" for as long as the links read retries. Shortened by the same change; cap it like 13.06 in `useSongSources.ts` (fall back to Tab, which needs no network).

Files: `src/features/song/useRequestedLoop.ts`, `practiceLoop.ts`, `useSongSources.ts`, `LoopPracticePage.tsx`, `src/lib/supabase.ts`, `src/features/library/songsApi.ts`, `src/test/fakeSupabase.ts` only if the fake needs `.retry`.

Risk: opening from a cached list can open at a speed another device has since changed; the speed is only written on a change made here, so nothing is overwritten until the user nudges. Read `useRequestedLoop`'s comment before touching it.

Acceptance: with the song's file on the device and a loops list cached, a loop's practice screen has Play enabled within about 2 seconds on a connection that never answers, and offline at once as now; a list read that fails says so within about 5 seconds, not 24; an upload whose answers are lost still ends in "may have been added anyway"; `npm run check` and the offline, practice-screen and library specs pass.

### Batch 2. Queued practice is never dropped (M)

**Done** (branch `le-2-queued-writes`; `docs/units/20-loose-ends.md`, Batch 2). What it chose to live with is in the plan's Accepted section as 20.2a to 20.2d.

- **13.23** A queued write sent while supabase-js has no session in memory (its refresh failed for the network, a session still stored) goes out as `anon`, is refused with 42501 and is dropped as a real refusal: a session log or a saved speed lost. Fix: in `sendRefreshingToken`, ask `supabase.auth.getSession()` before sending; null while `readStoredSession()` still has one is thrown as a network failure, so the write's retries wait. Give the fake client `auth.getSession`. Test: `tokenRefresh.test.ts` (no session, stored session: retried, nothing sent as anon) and one case in `queuedWrites.test.tsx`.
- **14.6** `removeOutboxEntry` forgets the id before the row is deleted, so a replay reading in between sends the write once more. Fix: delete the row, then `queuedHere.delete(id)`. Test: `offlineStore.test.ts`, a `takeLeftoverOutboxEntries` raced against a removal returns nothing.

Files: `src/lib/tokenRefresh.ts`, `src/lib/network.ts`, `src/test/fakeSupabase.ts`, `src/features/offline/outbox.ts`.

Risk: `getSession()` can itself trigger a refresh and take time; it must not be awaited inside a tap that starts audio (it isn't: these are writes).

Acceptance: a session log or loop edit queued while the token could not be refreshed is still in the outbox and lands once after the connection is back, with nothing sent as `anon`; a write the server truly refuses (a missing grant) still fails and rolls back; an outbox removal can't be replayed.

### Batch 3. Tab page: the score stays put (M)

- **13.26** On a phone the tab opens scrolled about 47 px sideways with the clef clipped (alphaTab scrolls the box to its cursor at about the moment Play is enabled). Fix: in the engine, after `readyForPlayback` with the cursor on bar 1, put the box's scroll back to its start (or set alphaTab's horizontal scroll offset so bar 1's start stays on show). Test: `jam.spec.ts`, phone: after `openFixture` the score box's `scrollLeft` is 0.
- **13.29** A phone turned to landscape during a count-in, or turned twice while playing, leaves the score and the count-in number below the window: the score is brought on screen once per start. Fix: `useScoreOnScreen` also runs after the window's width changes while running, instant, not smooth. It watches the real viewport width (a `resize` listener reading `window.innerWidth`, or a `ResizeObserver`), not the layout from `useLayout`: `useLayout.ts` only notifies when the 768 px media query flips, so a 320 x 640 phone turned to 640 x 320 stays `horizontal` and an effect keyed on the layout would never rerun, which is the second case recorded for this item. It scrolls once the score has been laid out again for the new width (alphaTab re-renders on a resize), not on the resize event itself, or it measures the old layout. Test: `player.spec.ts`, two rotations: 390 x 844 to 844 x 390 during a count-in, which crosses the breakpoint (the counter is inside the window), and 320 x 640 to 640 x 320, back, and to 640 x 320 again while playing, which never crosses it (the beat cursor is inside the window).
- **13.30** "Practice logged" appears above the score about 100 ms after the Pause that logs a session and pushes the score down 32 px, so a bar tapped then is the one below the finger. Tab page only now (the practice screen shows no such note). Fix: render `SessionNotice` under `ScoreBox` in `SongPage.tsx`, as the practice screen does with its finish prompt. Test: `practice.spec.ts`: the score box's top is the same before and after the notice appears.
- **13.31a** A Pause pressed while Play's smooth scroll is still running moves the score once more (64 px on a laptop). Fix: `useStaysOnScreen` ends the smooth scroll at every fold change with an instant `scrollTo` of the current position before its `scrollBy`. Test: drop the `test.fixme` in `tests/e2e/player.spec.ts` (line 767).
- **20.4a** (found in batch 4: its Test bug 1 and QA issue 1) On a phone, making a loop and playing it moves the score twice. Repro at 390 x 844: open the sheet, "New loop" (the page scrolls by itself so the score sits above the sheet: window at 475, score box top at 118), save bars 1 to 2, then "Play loop", Play in the bar or Space with a 2-bar count-in. The sheet closes, the room it added at the page's end goes with it (`SongPage.tsx`'s `pb-[calc(45dvh+4rem)]`; the page is 844 px tall, from 1,319), the window is back at 0 and the score box's top is at 302 (184 px down); after Pause the controls unfold and it is at 514 (another 212). "Play loop" has always done it; since batch 4 Play and Space with a count-in close the sheet too. Fix: the sheet closing is one more change `useStaysOnScreen` makes up for: measure where the score was in the render that closes the sheet, and hold what the window can't scroll as room, as it does for the fold (or keep the sheet's room until the next unfold). Extend its model tests first (`layOut` with the sheet's room coming and going). Test: `loop-scroll.spec.ts`, "the score when playback closes the open sheet…", already measures all four cases and prints them; make it assert the phone's "page at its end" case moves by no more than a few pixels at the count-in and after Pause, and that the other three (Play bringing an off-screen score on) are unchanged.

Files: `src/features/song/SongPage.tsx`, `useJamMode.ts`, `useStaysOnScreen.ts`, `keepInPlace.ts`, `src/features/player/alphaTabEngine.ts`, `tests/e2e/player.spec.ts`, `jam.spec.ts`, `practice.spec.ts`, and for 20.4a `loop-scroll.spec.ts`. It runs after batch 4, which changed when the sheet closes.

Risk: `useStaysOnScreen` has had four rounds of fixes; change it only with its model tests (`useStaysOnScreen.test.tsx`) extended first. 13.26 is unverified on this branch (see the end).

Acceptance: at phone, tablet and desktop sizes the Tab page's score does not move at Play, Pause, a logged session or a Pause during Play's scroll; on a phone, a score brought above the open loop sheet by "New loop" stays where it is when playback closes the sheet and when Pause follows (20.4a); a rotation while counting in or playing leaves the beat cursor and the count-in number in the window, whether it crosses 768 px (390 x 844 to 844 x 390) or stays below it (320 x 640 to 640 x 320); the tab opens on a phone with the clef on show; the fixme test runs and passes.

### Batch 4. Tab page: the loop sheet (S)

**Done** (branch `le-4-loop-sheet`; `docs/units/20-loose-ends.md`, Batch 4). What it chose to live with is in the plan's Accepted section as 20.4b to 20.4e; which count-ins close the sheet is D9; the score moving when the sheet closes on a phone went to batch 3 as 20.4a.

D1's option A, built as the default. 13.27a is in the loop form, which both of D1's options keep, so it is built whatever Shane answers.

As built, where it differs from the lines below: 13.32 closes the sheet only for the count-in that starts a run, never a repeat's (D9), and never while the loop form is open (its taps pick bars; plan, Accepted 20.4e); 13.28a moves focus at once, with no `focusWhenReady`; 13.28b sets the list's own `scrollTop`, never `scrollIntoView`, and puts the item's top under the header; 13.27a is in `LoopEditorForm.tsx`, and `useLoopPractice.ts` was not changed.

- **13.32** Below 1024 px the count-in number is behind the loop sheet when playback starts with the sheet open by any press other than "Play loop". Fix: close the sheet whenever the status becomes `countingIn` while it is a sheet (an effect in `LoopPanel.tsx`, the rule beside `playLoopClosesPanel` in `useLoopPanelOpen.ts`). Test: `useLoopPanelOpen.test.ts` for the rule, `LoopPanel.test.tsx` for Play from the sticky bar after a save.
- **13.28a** "Play loop" closes the sheet and leaves focus on the hidden button. Fix: hand focus to the sheet's header toggle (`focusWhenReady`). Test: `LoopPanel.test.tsx`.
- **13.28b** The reopened sheet keeps its old scroll position, so in a long list the playing loop may be out of sight. Fix: on open, `scrollIntoView({ block: 'nearest' })` on `[data-testid="active-loop"]`. Test: component test with a stubbed `scrollIntoView`.
- **13.27a** (whatever D1's answer) Bars typed into the loop form are highlighted but not scrolled to. Fix: the form's typed path calls `player.showBar(startBar)` (never the tap path: a tapped bar must not move). Test: `useLoopPractice.test.tsx`: a typed range scrolls, a tapped one doesn't.

Files: `src/features/loops/LoopPanel.tsx`, `useLoopPanelOpen.ts`, `useLoopPractice.ts`, `LoopEditorForm.tsx`.

Acceptance: on a phone and a tablet in portrait, any way of starting playback with a count-in shows the number (but with the loop form open, when the sheet stays: 20.4e); after "Play loop" a keyboard user's next Tab starts from the sheet's header; reopening the sheet shows the playing loop; typing bars 40 to 44 into the form brings bar 40 on screen.

### Batch 5. Practice history says what happened (M)

**Done** (branch `le-5-practice-history`; `docs/units/20-loose-ends.md`, Batch 5). What it chose to live with is in the plan's Accepted section as 20.5a to 20.5c; what History says about a day with a try at full speed is D10.

As built, where it differs from the lines below: `usePracticeTracker.ts` needed no change (all three ways out already send the tracker's record); a day's tie goes to the slower speed, as the Stats chart's does, while a session's goes to the later; History has one line under its total saying the rule (D10), "Show all N days" hands focus to the first day it adds, and `fetchLoopSessions` keeps one copy of a session two pages both returned (Review).

- **17.1** A session stores the speed it ended at, so ten minutes at 80% ending on a nudge to 100% is logged at 100%. Fix: the tracker keeps play time per speed within a session and logs the speed with the most (ties: the later). Test: `sessionTracker.test.ts`, with the Unit 17 acceptance case (ten minutes at 80%, one at 100%).
- **D4 (13.18b)**, option B, built as the default: History as one row per day.

Files: `src/features/practice/sessionTracker.ts`, `usePracticeTracker.ts`, `sessions.ts`, `LoopHistory.tsx`.

Risk: the overview's summary ("80% → 90%") reads the loop's opened and left speeds, not the session's, so it does not change. A session logged from a hidden page builds the same row; check `logSessionOnExit` takes the speed from the tracker's result, not the snapshot.

Acceptance: a session's logged speed is the speed most of it was played at; a loop's History shows a day once with its total time; stored sessions are unchanged and the Stats page's numbers for the seed user still match `stats.spec.ts`.

### Batch 6. Sign-in and sign-out (M)

- **13.01** A 401 on a query is shown as "Your sign-in has run out" with no way on: nothing refreshes the token or sends the user to `/login`. Fix: a `QueryCache` `onError` in `queryClient.ts` that, on `isTokenRefusal`, refreshes the session once and invalidates; a refresh the server refuses signs out locally so the guard redirects. Test: `AuthProvider.test.tsx` or a new `queryClient` test with the fake client.
- **D2 (13.05a, 13.05b)**, option B. Built as the default: keep the outbox across a forced sign-out. Asked first, since it discards unsent practice (Shane's standing exception): "Sign out anyway" with a warning.

Files: `src/lib/queryClient.ts`, `src/lib/AuthProvider.tsx`, `src/main.tsx`, `src/features/offline/offlineData.ts`, `src/features/auth/SignOutButton.tsx`, `useAuthActions.ts`.

Risk: 13.01 makes forced sign-outs more likely to be reached, so do D2's "keep the outbox" in the same batch or not at all. Do not touch `outbox.ts` or `tokenRefresh.ts` (batch 2).

Acceptance: a query refused for its token either recovers by itself or lands the user on `/login?next=…`; practice queued before a forced sign-out reaches the server after the same user signs in again and never reaches another user's account; and, once Shane has said yes to "Sign out anyway", behind a connection that never answers the user can still sign out, after being told what won't be saved.

### Batch 7. Recordings (S)

- **D8 (14.3)**, option B, built as the default: a loaded video is left alone when the connection drops.
- **14.2**, only after the Human check has tried it on a real video: `sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"` on the frame.

Files: `src/features/recordings/RecordingBox.tsx`, `tests/e2e/recordings.spec.ts`.

Acceptance: going offline with a video on screen leaves its frame in place; opening a recording while offline still shows the "needs a connection" note and no frame; with `sandbox`, a real video plays, goes fullscreen and opens "Watch on YouTube" (Shane's check).

### Batch 8. Focus and small jumps (S)

- **13.21** A refused "Mark finished" or "Reopen" moves the loop back after focus followed it, and focus falls to `<body>`. Fix: when the loop's latest status write turns to `error`, `LoopStatusButton` (remounted in its old place) takes focus if focus is on `<body>`. Test: `LoopPanel.test.tsx` and `SongOverviewPage.test.tsx` with `holdNext` then `failNext`.
- **13.35c** That refusal's error stays under the loop for up to five minutes. Fix: `useSetLoopStatus` returns a `dismiss` that removes the errored mutation from the cache; a "Dismiss" button on the alert, and the same on unmount of the page. Test: same files.
- **13.37a** With focus on "When to count in", C cycling the count-in to Off removes that group and focus falls to `<body>`. Fix: `useFocusKeptInBar` also runs when the count-in bars change, and prefers the bars' checked option. Test: `PlayerControls.test.tsx`.
- **13.37b** On a cold start the Songs list draws the big drop box while songs load, then the compact Upload button. Fix: `compact` unless the list is known to be empty (`songs.data?.length === 0`). Test: `LibraryPage.test.tsx` with a held read.

Files: `src/features/loops/LoopStatusButton.tsx`, `useLoops.ts` (`useSetLoopStatus` only), `loopFocus.ts`, `src/features/player/PlayerControls.tsx`, `src/features/library/LibraryPage.tsx`, `UploadPanel.tsx`.

Acceptance: after each of the four, `document.activeElement` is a control on the page, never `<body>`; a refused status change can be dismissed and is gone on returning to the page; the Songs list does not change layout between loading and loaded when there are songs.

### Batch 9. Stats copy and locale (M)

**Done** (branch `le-9-stats-copy`; `docs/units/20-loose-ends.md`, Batch 9). What it chose to live with is in the plan's Accepted section as 20.9a and 20.9b, and 17.5d there is reworded with what was measured.

As built, where it differs from the lines below: the locale is one constant for the whole app, `COPY_LOCALE` in `src/lib/copyLocale.ts`, and its Review took it to `practiceDateLabel` and `repeatsLabel` in `practice/sessions.ts` too (a loop's History, "Last practised …" in the loop panel and on the overview), so the files are no longer `src/features/stats/*` only; `useToday()` asks the day at most a minute apart, not only at midnight (a sleeping laptop's timer is late), and the Songs header's streak uses it; the map's box is scrolled to its end on mount and when it gains a week, and is a named tab stop; "under 358 px of page" is every window under 384 px, and 1024 px.

- **17.3a, 17.5b** Dates are written in the browser's locale inside English sentences ("the week of 8. Juni", a doubled full stop). Fix: `'en'` for every date and weekday the Stats page writes (`dateLabels.ts`, `chartText.ts`, `DailyMinutesChart.tsx`, `PracticeHeatmap.tsx`). Test: `dateLabels.test.ts` under a German locale.
- **17.5a** Some counts are grouped ("1,100" days) and some aren't ("1100 h", "1100-day streak"). Fix: every count through `statLabels.ts`'s one formatter, `'en'`. Test: `statLabels.test.ts`.
- **17.3b** "Other" is a row of its own for a single sixth song. Fix: in `timeBySong`, list the sixth song by name when it is the only one left. Test: `songTime.test.ts`.
- **17.4a** "Couldn't load your stats" gives the sessions read's reason even when the loops read is the one that failed to load. Fix: take the error of the query whose `isLoadingError` is true. Test: `StatsPage.test.tsx`.
- **17.4b** A page left open past midnight shows yesterday's "today". Fix: a `useToday()` that re-renders at the next local midnight and on `visibilitychange`. Test: fake clock in `StatsPage.test.tsx`.
- **17.5e** Under 358 px of page a 26-week heatmap opens scrolled to its oldest week. Fix: scroll its box to the end on mount. Test: `stats.spec.ts` at 320 px.

Files: `src/features/stats/*` only.

Risk: `practiceDateLabel` in `src/features/practice/sessions.ts` (batch 5's file) takes its locale as an argument; pass `'en'` from the Stats callers, don't edit it here.

Acceptance: with the browser set to German, every sentence on the Stats page is English with one full stop; every count of 1,000 or more is grouped; six songs show six names; the page's "today" is right after midnight; `stats.spec.ts` passes at each size and at 320 px.

### Batch 10. Scripts and seed (S)

- **13.10** Files in Storage with no songs row are possible (failed rollbacks, deleted users, uploads whose insert answer was lost). Fix: `scripts/sweep-orphan-files.ts` (`npm run db:sweep`): page through `gp-files`, list objects older than a day with no row at `songFilePath()`, print them; delete only with `--delete`. Test: `tests/db/` case with one orphan and one live file.
- **14.5** The seed has no song links. Fix: an Original and a Drumless on one demo song in `scripts/seed.ts`. Test: `tests/db/seed.test.ts`.

Files: `scripts/`, `package.json`, `tests/db/seed.test.ts`, a new `tests/db` file, `AGENTS.md` (the Commands table), `docs/release.md` if the sweep becomes a release step.

Risk: the sweep runs with the secret key; dry run by default, and it must loop every page of `storage.list` (AGENTS.md, Conventions). `--delete` removes users' files: the test runs it on the local stack only, and Shane is asked before it is ever run that way on the hosted project (his standing exception).

Acceptance: `npm run db:seed` gives the demo user a song with both recordings; the sweep lists exactly the orphan in the test and removes it only when asked.

### Batch 11. Docs only (S)

Done with the triage: the plan's lists cut down to the lines a batch closes (each FIX line, and each DECIDE line whose default builds something, with its id and batch), the human checks rewritten, and every ACCEPT row written into the one **Accepted** section of `docs/plan.md` with its reason and what would change it. No ACCEPT line and no decision with nothing to build is left in a Carried forward list. Each batch deletes its own lines as it lands. At the end of Unit 20 this batch only confirms that every Carried forward list is empty, and that the Accepted section has no item a batch fixed.

## Every item

"From" is the Carried forward list the bullet was in, and the note it cited. Evidence is where it was checked.

### Unit 07 list

| Id   | Item                                                           | From        | Class | Evidence                                                                                                                                  |
| ---- | -------------------------------------------------------------- | ----------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 07.1 | Hosted setup and the 01 and 05 human checks come first         | 01 Findings | GONE  | Unit 07 is built and the app is live; the checks themselves are rows of the human table                                                   |
| 07.2 | "Every repeat" stops and restarts; the wrap clips the last bar | 01 Findings | HUMAN | Built that way (`applyLooping`, `countInBeforeRepeat` in `PlayerService.ts`); whether the clip is heard is by ear. In the "Loop seam" row |
| 07.3 | The service must emit `loopWrapped` itself in that mode        | 01 Findings | DONE  | `PlayerService.ts` line 729 emits it; `PlayerService.countIn.test.ts`                                                                     |
| 07.4 | Call `play()` early by a measured offset                       | 01 Findings | DONE  | `PLAY_START_LEAD_SECONDS = 0.025` in `countInRunner.ts`; tuning it by ear is in the "Loop seam" row                                       |
| 07.5 | Pick the clock and record it in AGENTS.md                      | 01 Findings | DONE  | Its own `AudioContext` (`clickOutput.ts`); AGENTS.md, Count-in                                                                            |
| 07.6 | `midiEventsPlayed` could drive the counter                     | 01 Findings | GONE  | A note, not an issue: the counter runs off the count-in runner's `onBeat`                                                                 |
| 07.7 | Pause, stop, seek and leaving must cancel scheduled clicks     | 01 Findings | DONE  | `callOffCountIn`, `abandonCountIn`; 52 cases in `PlayerService.countInEdges.test.ts`                                                      |
| 07.8 | Count-in bars and mode join `PlayerOptions`                    | 05 Build    | DONE  | `playerOptions.ts` lines 25 to 38                                                                                                         |

### Unit 13 list

| Id     | Item                                                                        | From                         | Class  | Evidence                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------- | ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13.01  | A 401 on a query isn't treated as signed out                                | 03 QA 3, 11                  | FIX    | `queryClient.ts` has no error handling; only queued writes refresh (`tokenRefresh.ts`). Batch 6                                                                                                         |
| 13.02  | `useUpdateSong`'s `onSuccess` merges the whole server row                   | 08 Copilot 4                 | ACCEPT | Still unreachable: song edits are online only, and the row it merges (`SONG_SELECT`) has no `last_played_at`, the one song column now written from a queue. Revisit if song edits are ever queued       |
| 13.03  | Component test for a failed background refetch of a song file               | 05 Review                    | GONE   | Nothing refetches it: `useSongFile` has `staleTime: Infinity` and reads the device's copy first                                                                                                         |
| 13.04  | A device clock over a day ahead has every session refused                   | 09 Build                     | ACCEPT | `practice_sessions_before_insert` still refuses it (23514). Needs a clock wrong by more than a day. Revisit if a real session is ever lost this way                                                     |
| 13.05a | A forced sign-out empties the device, unsent practice included              | 09 Review, 11                | DECIDE | `AuthProvider` runs `onSignedOut` on every `SIGNED_OUT`. D2                                                                                                                                             |
| 13.05b | Sign out is off while a write never answers (captive portal)                | 11 Review                    | DECIDE | `SignOutButton.tsx`: `disabled` on `unsent`, no way round. D2                                                                                                                                           |
| 13.05c | Entries an earlier page left are covered only after the replay reads them   | 11 QA 3                      | DONE   | `hasUnsentWritesAnywhere` reads the outbox itself at the press, and `useHasUnsentWrites` watches it (`unsentWrites.ts`, bug hunt)                                                                       |
| 13.06  | A linked loop on a hanging connection opens only when the read gives up     | 09 QA 1                      | FIX    | Now the main path: `useRequestedLoop` waits while `fetching`, and `canPlayLoopPractice` keeps Play off until the loop is open. Batch 1                                                                  |
| 13.07a | Song files on the device have no size cap or eviction                       | 11 Build                     | ACCEPT | `songFileStore.ts` only ever adds; a tab is tens of kilobytes and the store asks `navigator.storage.persist()`. Revisit at hundreds of songs                                                            |
| 13.07b | A stored file alphaTab can't read stays stored                              | 11 Build                     | ACCEPT | Only a delete removes a stored file. Files are parsed before upload and never change, so this needs a corrupted IndexedDB row                                                                           |
| 13.07c | A replayed loop edit can overwrite a newer change from another device       | 11 Build                     | ACCEPT | Last write wins, as the plan's Risks table says. Needs two devices and a lost answer                                                                                                                    |
| 13.08  | Final soundfont, and its size in the first install                          | 01 Findings                  | DONE   | Chosen after 13: Sonivox plus MuseScore's drum kit (`soundFont.ts`), both in `globPatterns`, under the 4 MB limit. How it sounds is a human row                                                         |
| 13.09a | `color-mix()` leaves the cursor and highlight invisible before Safari 16.2  | 12 Review                    | ACCEPT | `index.css` lines 179 and 226. iOS 16.2 is four years old. Revisit if anyone reports no cursor                                                                                                          |
| 13.09b | Under "reduce motion" the beat cursor still glides                          | 12 Review                    | ACCEPT | Kept on purpose: it keeps time (AGENTS.md, Visual design; `design.spec.ts` "reduced motion")                                                                                                            |
| 13.10  | Files in Storage with no songs row                                          | 02 QA, 04 Review, 13 Copilot | FIX    | No sweep in `scripts/`. Batch 10                                                                                                                                                                        |
| 13.11  | A tempo change part-way through a bar shows the bar's starting tempo        | 06 Build                     | ACCEPT | `barStartTempos` by design; no fixture or real export has shown one                                                                                                                                     |
| 13.12  | "Every repeat" with no countable bar logs a session per pass                | 09 Build                     | ACCEPT | `beginCountIn` returns false only for a tempo or meter of 0 or less; every bar the song has gets both. Not proven that alphaTab can never import such a bar                                             |
| 13.13  | A loop from a repeat's last bar plays the bar before it too                 | 08 Test 1, 08 QA 3           | ACCEPT | Pinned by `tests/unit/loop-fixtures.test.ts`. By ear it is in the human table; change it only if it sounds wrong                                                                                        |
| 13.14  | postgrest-js retries every failed GET under TanStack's retries              | 13 QA 2                      | FIX    | No `.retry(false)` anywhere in `src`; the method exists in the installed postgrest-js. Batch 1                                                                                                          |
| 13.15  | A reload a second after an upload with reads failing shows "No songs yet"   | 13 QA 3                      | ACCEPT | Seen once; needs a reload inside the second before the cache is saved, with every read failing                                                                                                          |
| 13.16a | "Loading loops…" for about 24 s with no connection                          | 08 QA 9                      | FIX    | Same cause as 13.14. Batch 1                                                                                                                                                                            |
| 13.16b | A tap on a bar outside the playing loop does nothing and says nothing       | 08 QA 12                     | DONE   | Decided by Shane in Unit 16 ("tapping a bar outside the loop never seeks out of it"); the practice screen draws only the loop and a bar either side                                                     |
| 13.17  | The production release itself                                               | 13 Build                     | DONE   | The app is live; CI's `migrate` job pushes migrations (AGENTS.md, Supabase)                                                                                                                             |
| 13.18a | A hidden page ends the session, on a laptop too                             | 09 Build                     | DECIDE | `trackerPhase` returns `stopped` for a hidden page. D3                                                                                                                                                  |
| 13.18b | One sitting with pauses is several rows in a loop's History                 | 09 Build                     | DECIDE | `LoopHistory.tsx` lists one row per session. D4                                                                                                                                                         |
| 13.19  | "One tap into practice" from the home page is two                           | 09 Build                     | GONE   | The home page went in Unit 16                                                                                                                                                                           |
| 13.20  | Switching loops drops stretches under 30 seconds                            | 09 Build, 10 Build           | DECIDE | `sessionTracker.ts` unchanged. D5                                                                                                                                                                       |
| 13.21  | A refused "Mark finished" or "Reopen" drops focus to `<body>`               | 10 Build                     | FIX    | `followStatus` in `SongOverviewPage.tsx` and `LoopPanel.tsx` only follow the optimistic move. Batch 8                                                                                                   |
| 13.22  | Two tabs share one outbox; an older value can land last                     | bug hunt D2                  | ACCEPT | `takeLeftoverOutboxEntries` still knows only its own page's ids. Needs two tabs and an edit queued offline; the fix is Web Locks across tabs (L)                                                        |
| 13.23  | A queued write sent with no session goes out as `anon` and is dropped       | bug hunt D4                  | FIX    | `sendRefreshingToken` never asks for a session; no `getSession` call in `src`. Batch 2                                                                                                                  |
| 13.24  | A "playing" more than a bar late is taken as the new play's                 | bug hunt P1                  | ACCEPT | `playCalledOff` guard unchanged (`PlayerService.ts` line 710). Needs a worker a whole count-in late                                                                                                     |
| 13.25  | A loop deleted on another device                                            | 08 Build, 08 QA              | ACCEPT | No "Save speed" any more: the automatic save fails as "deleted", the list is read again, and the practice screen says "Loop not found". The Tab page's sheet drops it without a word. Needs two devices |
| 13.26  | On a phone the tab opens scrolled 47 px sideways, clef clipped              | 06 QA                        | FIX    | No scroll offset set in `alphaTabEngine.ts`; e2e still waits for that scroll (`scoreSettled`). Not re-run. Batch 3                                                                                      |
| 13.27a | Bars typed into the loop form are not scrolled to                           | 08 Build                     | FIX    | `showBar` is called only from `applyLoopRange` and the practice screen's `useDrawnBars`. Batch 4                                                                                                        |
| 13.27b | After a rotation the picked bars or paused loop can be outside the box      | 08 QA fix 1, N5              | ACCEPT | alphaTab's own re-layout brought it back every time QA tried, but for one 150 ms window. The practice screen draws the loop alone                                                                       |
| 13.28a | "Play loop" closes the sheet and leaves focus on the hidden button          | 08 Test fix 1                | FIX    | `LoopPanel.tsx` line 115 closes with no hand-over. Tab page only. Batch 4, D1                                                                                                                           |
| 13.28b | The reopened sheet may need scrolling to the playing loop                   | 08 QA fix 1, N4              | FIX    | No scroll on open. Tab page only. Batch 4, D1                                                                                                                                                           |
| 13.29  | A rotation during a count-in leaves the number below the window             | 12 Test r2 bug 1, QA r2 2    | FIX    | `useScoreOnScreen` still keyed on the start only. Batch 3                                                                                                                                               |
| 13.30  | "Practice logged" pushes the score down 32 px                               | 12 Test r2 bug 2             | FIX    | `SongPage.tsx` line 330 still renders it above the score; the practice screen passes `showLogged={false}`. Batch 3                                                                                      |
| 13.31a | A Pause during Play's smooth scroll moves the score again                   | 12 Test r3 bug 1             | FIX    | `test.fixme` still at `tests/e2e/player.spec.ts` line 767. Batch 3                                                                                                                                      |
| 13.31b | The sheet closed while the controls are folded moves the score up to 32 px  | 12 QA r3 1                   | ACCEPT | Unchanged; rare and small. Goes with D1's option B                                                                                                                                                      |
| 13.32  | The count-in number is behind the sheet when Play starts with it open       | 08 QA fix 1, N1              | FIX    | `playLoopClosesPanel` is called only from "Play loop". Batch 4, D1                                                                                                                                      |
| 13.33a | A count-in leaves its bar in place, then alphaTab slides it on the downbeat | 08 QA fix 1, N2              | ACCEPT | `scrollToShow` unchanged. Tab page only: the practice screen draws the loop's bars alone. In the human table                                                                                            |
| 13.33b | In page layout a loop in the last lines sits under the count-in number      | 08 QA fix 1, N3              | ACCEPT | Same; whether the number covers the bars on the practice screen is a human row                                                                                                                          |
| 13.34a | "Mark finished?" can be behind the closed sheet                             | 09 Build                     | ACCEPT | Tab page only; the practice screen shows it under the score. Goes with D1's option B                                                                                                                    |
| 13.34b | The home page shows speeds as a percent only                                | 09 Build                     | GONE   | No home page; the overview is percent only by design (it loads no file)                                                                                                                                 |
| 13.34c | A loop's history opens inline and makes a long item longer                  | 09 Build                     | ACCEPT | Still inline from "More"; ten rows then "Show all". Shorter still with D4                                                                                                                               |
| 13.35a | The home page is one column: 560 loops are 115,000 px                       | 09 QA 6                      | GONE   | No home page; the overview lists one song's loops, active then finished                                                                                                                                 |
| 13.35b | The sheet lists every loop of the song with no grouping or paging           | 09 QA 6                      | ACCEPT | 30 loops in one song was walked in 16 QA. Revisit at a song with far more                                                                                                                               |
| 13.35c | A refused status change keeps its error for up to five minutes              | 09 Review                    | FIX    | `useSetLoopStatus` reads the latest status write from the mutation cache, with no dismiss. Batch 8                                                                                                      |
| 13.36  | Notation is at alphaTab's default size                                      | 12 Build, 13 Build           | DECIDE | `NOTATION_SCALE = 1` in `scoreTheme.ts`. D6                                                                                                                                                             |
| 13.37a | C cycling the count-in to Off drops focus from "When to count in"           | 12 Review (UX pass)          | FIX    | `useFocusKeptInBar`'s effect depends on the fold only. Batch 8                                                                                                                                          |
| 13.37b | Cold start: the big drop box, then the compact Upload button                | 12 Review (UX pass)          | FIX    | `LibraryPage.tsx`: `compact` is false while `songs.data` is undefined. Batch 8                                                                                                                          |
| 13.38a | Phone, sheet open, nothing playing: about 112 px of score                   | 08 QA 6                      | ACCEPT | Tab page only, while a loop is being made or chosen. Goes with D1's option B                                                                                                                            |
| 13.38b | Phone in landscape with the panel open: a 284 x 234 px score                | 08 QA                        | ACCEPT | Same                                                                                                                                                                                                    |

### After 13, Units 14, 15 and 17

| Id    | Item                                                                        | From              | Class  | Evidence                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------- | ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A13.1 | The drum kit is MuseScore's standard kit only; other kit programs fall back | practice feedback | HUMAN  | `PLAYER_SOUND_FONT_URLS` in `soundFont.ts`. By ear; in the "Drum sound" row                                                                                 |
| 14.1  | On a phone on its side the video takes over half the window                 | 14 Build fix 1    | DECIDE | `RecordingBox.tsx`. D7, after the human check                                                                                                               |
| 14.2  | The YouTube frame has no `sandbox`                                          | 14 Review         | HUMAN  | No `sandbox` on the `<iframe>` (`RecordingBox.tsx` line 62). Needs a real video; in the "Recordings" row, then batch 7                                      |
| 14.3  | A playing video is taken away when the connection drops                     | 14 Review         | DECIDE | `RecordingBox.tsx` draws the frame only while `online`. D8                                                                                                  |
| 14.4a | `?source=` is settled without a read since the page opened                  | 14 Review         | ACCEPT | Needs a link saved on another device and the address typed here inside 30 seconds                                                                           |
| 14.4b | `?source=` on a hanging connection shows "Loading the recording…"           | 14 Review         | FIX    | `useSongSources.ts` waits on the links read. Batch 1                                                                                                        |
| 14.4c | A link out opened by middle click writes no `last_played_at`                | 14 Review         | ACCEPT | `LinkOut.tsx` writes in `onClick` only. Costs a place in the "recently practised" order, nothing else                                                       |
| 14.5  | The seed has no links                                                       | 14 Build          | FIX    | Nothing about links in `scripts/seed.ts`. Batch 10                                                                                                          |
| 14.6  | `removeOutboxEntry` forgets the id before the row is deleted                | 14 Build          | FIX    | `outbox.ts` lines 33 to 40. Harmless today (every queued write is safe twice). Batch 2                                                                      |
| 14.7  | A look-alike host in another script is saved as a plain link                | 14 Test bug 1     | ACCEPT | Never played, embedded or called YouTube (`songLinks.test.ts` pins that), and the user pastes their own links. Revisit if links ever come from someone else |
| 14.8a | A second row of buttons or Other links push the loops down on a cold load   | 14 Build fix 1    | ACCEPT | The usual cases move nothing                                                                                                                                |
| 14.8b | A failed recordings save that was left loses what was typed                 | 14 Build fix 1    | ACCEPT | It is said on return; the form is two pasted links                                                                                                          |
| 14.8c | Page layout under a recording is one bar to a line on a phone               | 14 Build fix 1    | HUMAN  | One of Unit 14's open questions ("look at it at the kit"). In the "Recordings" row                                                                          |
| 14.8d | QA's "Paste" button per field wasn't built                                  | 14 QA 10          | ACCEPT | Chosen not to build: the field takes a paste in one tap                                                                                                     |
| 15.1  | A loop on a recording is listed on the overview and Stats, not a home page  | 16                | DONE   | Written into Unit 15's scope bullet in this commit (it said "shows on the home page")                                                                       |
| 17.1  | A session stores only the speed it ended at                                 | 17                | FIX    | `sessionTracker.ts` keeps the latest speed. Batch 5                                                                                                         |
| 17.2  | The overview's loop-name link under 44 px; "keep one fix"                   | 17 Build          | DONE   | One fix, in one place: `nameLinkClass` in `styles.ts` has `min-w-touch`                                                                                     |
| 17.3a | Dates in the browser's locale inside English sentences                      | 17 QA 4           | FIX    | `Intl.DateTimeFormat(undefined, …)` in `chartText.ts`, `DailyMinutesChart.tsx`, `PracticeHeatmap.tsx`. Batch 9                                              |
| 17.3b | "Other" is a row of its own for a single sixth song                         | 17 QA             | FIX    | `songTime.ts`: `SONG_TIME_SHOWN = 5`, then "Other (1 song)". Batch 9                                                                                        |
| 17.3c | The chart's label boxes are estimated, not measured                         | 17 Build fix 1    | ACCEPT | `approxTextWidth`; `stats.spec.ts` measures the real boxes with the app's font. Revisit if the font changes                                                 |
| 17.4a | "Couldn't load your stats" can give the wrong read's reason                 | 17 Review         | FIX    | `StatsPage.tsx` line 67: `sessions.error ?? loops.error`. Batch 9                                                                                           |
| 17.4b | A page open past midnight shows yesterday's "today"                         | 17 Review         | FIX    | `StatsPage.tsx` line 124: `new Date()` at render, nothing redraws it. Batch 9                                                                               |
| 17.4c | Merging PR #31 after Unit 17 conflicts in AGENTS.md                         | 17 Review         | GONE   | Both are merged (`427c1ff`, `ee23028`)                                                                                                                      |
| 17.5a | Some counts are grouped and some never are                                  | 17 QA r1 1        | FIX    | `statLabels.ts` groups; hours and streak days don't go through it. Batch 9                                                                                  |
| 17.5b | A locale's date ending in a full stop doubles the sentence's                | 17 QA r1          | FIX    | Goes with 17.3a. Batch 9                                                                                                                                    |
| 17.5c | A capped "Other" bar looks equal to the top song's                          | 17 QA r1          | ACCEPT | `barShare` caps at the scale on purpose (17 QA issue 9); its minutes are written beside it                                                                  |
| 17.5d | Under 358 px of page the charts' text is 9.3 px                             | 17 QA r1          | ACCEPT | 9.3 px is a 320 px phone (10.5 px at 360, 11 px at 375; 20 batch 9 Review)                                                                                  |
| 17.5e | Under 358 px a 26-week heatmap opens scrolled to its oldest week            | 17 QA r1          | FIX    | No scroll code in `PracticeHeatmap.tsx`. Batch 9                                                                                                            |

### Accepted, in one list

These 32 are the Accepted section of `docs/plan.md`, each there with its reason and what would make it worth another look: 13.02, 13.04, 13.07a, 13.07b, 13.07c, 13.09a, 13.09b, 13.11, 13.12, 13.13, 13.15, 13.22, 13.24, 13.25, 13.27b, 13.31b, 13.33a, 13.33b, 13.34a, 13.34c, 13.35b, 13.38a, 13.38b, 14.4a, 14.4c, 14.7, 14.8a, 14.8b, 14.8d, 17.3c, 17.5c, 17.5d. (13.31b, 13.34a, 13.35b, 13.38a and 13.38b go away entirely if D1 is answered B.)

## Open human checks, proposed

What happened to each old row:

| Old row                                   | Now                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 01, `/spike` sound, seam, latency, memory | Rewritten: the `/spike` route is gone and the soundfont is chosen. Split into "Drum sound" and "Loop seam"                                     |
| 01, iOS first tap, ringer, lock, layouts  | Still valid; merged with 05's iOS row and 08's first row ("First sound on iOS")                                                                |
| 04, picker and upload on phones           | Still valid                                                                                                                                    |
| 05, iOS on a preview URL                  | Superseded by "First sound on iOS" (the app is live on HTTPS)                                                                                  |
| 06, taps, swipes, auto-scroll             | Still valid; now names the Tab page and adds the clipped clef (13.26)                                                                          |
| 05, live changes mid-play                 | Still valid; adds the track mixer and changing the metronome's sound while playing                                                             |
| 08, "Play loop" first tap, seam, speed    | Rewritten for the practice screen; the seam moved to "Loop seam"                                                                               |
| 08, picking bars                          | Rewritten: the Tab page's "New loop", and the practice screen's "Show whole song" and "Save as loop"                                           |
| 08, count-in number, N1, N2, repeats      | Rewritten: the practice screen first, the Tab page's sheet second; "changing speed is two taps" is gone (the stepper is on the screen)         |
| 09, practise a minute, lock, two devices  | Rewritten: no "Practice logged" on the practice screen and no home page; the overview's summary instead                                        |
| 09, home page order and tabs              | Superseded: the home page is gone. Its live parts (order of the Songs list, finish and reopen on the overview) are in "Practice is remembered" |
| 10, pedal                                 | Still valid; names both player screens                                                                                                         |
| 11, installed PWA offline                 | Still valid                                                                                                                                    |
| 12, screenshots and the look at the kit   | Rewritten: the Unit 12 screenshots are of screens that no longer exist; the look at the kit stays, with the notation's size (D6)               |
| Metronome sounds                          | Still valid; adds a sound changed while playing and the louder slider                                                                          |

The table as it now stands in `docs/plan.md`:

| From         | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01, 05, 08   | **First sound on iOS.** iPhone and iPad on the live app: the first Play tap makes sound on the Tab page and on a loop's practice screen, with the count-in off and on, and with the ringer on silent; the screen stays on while playing; lock and app switch mid-play                                                                                                                                                                                                                                                                                                                                                                                          |
| 01, after 13 | **Drum sound.** By ear on phone and laptop: MuseScore's kit over Sonivox (snare, hi-hat, toms, the cymbals' level, the drums lifted over the band); a song whose drum track uses another kit program, which falls back to Sonivox's kit (A13.1)                                                                                                                                                                                                                                                                                                                                                                                                                |
| 01, 07, 08   | **Loop seam.** A loop's seam at 50%, 100%, 200% and a typed BPM. With "before every repeat": does each repeat land on the downbeat, and is the last bar clipped (07.2, 07.4). Start latency. Memory and battery on a long loop. `repeats.gp` bars 4 to 5 (13.13)                                                                                                                                                                                                                                                                                                                                                                                               |
| 04           | iPhone and Android: `.gp` isn't greyed out in the picker, and an upload works; on the LAN dev server too (the non-secure-context hash and id fallbacks). A real `.gp5` or `.gpx` if one is on hand                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 05, 16       | Every device: speed, metronome, mute, the track mixer and a changed metronome sound mid-play with no click, gap or restart; sound stops at once on leaving the page; rotating mid-play; 20 fast Play/Pause taps                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 06           | Tab page on phone and tablet: a tap on a bar seeks there and a swipe never does; auto-scroll feels smooth on iOS; the tab opens with the clef on show (13.26); in an installed PWA the sticky bar sits below the status bar                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 08, 16       | **Making a loop.** Phone at the kit: "New loop" on the Tab page, picking two bars by tap with the sheet open (thumb reach, the keyboard over the form); on the practice screen "Show whole song", pick bars, hear them, "Save as loop". Laptop: dragging across bars, across a line end too                                                                                                                                                                                                                                                                                                                                                                    |
| 08, 16       | **Count-in on screen.** Practice screen on a phone, upright and on its side: the 1-bar and 2-bar count-in number is readable from the throne and doesn't cover the bars being read (13.33b). Tab page: Play, Space or "Play loop" with the loop sheet open closes it for the number (is it readable the moment the sheet drops away?); with "before every repeat", a sheet opened mid-loop hides each repeat's count-in, which is only heard (D9: is that enough?); the score slides on the downbeat (13.33a); making a loop on a phone and playing it moves the score at Play and again at Pause (20.4a). Safari and Firefox: everything ran on Chromium only |
| 09, 16       | **Practice is remembered.** Practise a loop for a minute, pause (nothing should appear), go back to the song: the summary line and the loop's History are right. Then mid-practice lock the phone, switch apps, close the tab: each leaves one session with no pocket time in it (iOS Safari and an installed PWA especially: `pagehide` and `keepalive` only ran on Chromium). With "before every repeat": one session, without the count-ins                                                                                                                                                                                                                 |
| 09, 16       | Two devices: save a loop on the laptop, open it on a phone that had the song open a minute before; change its speed on one and open it on the other. The Songs list's order after practising two songs; Mark finished and Reopen on the overview. Count the taps from opening the app to sound (Songs, song, loop, Play)                                                                                                                                                                                                                                                                                                                                       |
| 10           | A real page-turner pedal on a laptop and an iPad (Page Up / Page Down or the arrows), on the practice screen and the Tab page: it switches loops while playing with no gap, and Space or the pedal never restarts a loop by accident (D5 waits on this). Safari: Space on a focused button plays or pauses and doesn't also press it; a Bluetooth keyboard's Space starts sound on iOS                                                                                                                                                                                                                                                                         |
| 11           | iPhone: Add to Home Screen, open from the icon, sign in with the 6-digit code, open a song, then airplane mode: it plays, a loop's practice and a changed speed reach the server once after reconnecting, also after closing the app offline. Android Chrome: the install prompt and the maskable icon. A deploy while the installed app is open shows "Reload to update"                                                                                                                                                                                                                                                                                      |
| 12, 16       | **The look at the kit.** Phone in a dim room and a bright one: the score paper and notation readable from the throne on the practice screen (D6: is it big enough?), the orange not too loud. Installed PWA on iPhone and Android: the icon, the maskable crop, the status bar colour                                                                                                                                                                                                                                                                                                                                                                          |
| metronome    | Metronome sounds, phone and laptop by ear: each sound over the kit (loud enough, not harsh, the slider's louder end), beat one louder, 2 and 4 per beat in time at 50% and 150%, a sound changed while paused plays from the same bar, and one changed while playing carries on in time                                                                                                                                                                                                                                                                                                                                                                        |
| 14           | **Recordings.** A real YouTube video on phone, tablet and laptop: first tap, inline on iOS, slowed with YouTube's speed menu; a video whose owner blocks embedding; a Spotify link opening the app on the phone and coming back. The tab under the video on a phone: one bar to a line upright (14.8c), one line on its side (D7). A short Wi-Fi drop mid-video (D8). Then try `sandbox` on the frame: plays, fullscreen, "Watch on YouTube" (14.2)                                                                                                                                                                                                            |
| 16, 17       | A week of practice with the songs-first flow: the speed stepper (±5%, ±1 BPM, typed), the overview's summary, and the Stats page read against what was really practised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Post-MVP backlog

- **Shipped:** "Stats: speed over time, weekly practice time, streaks" (Units 16 and 17: streaks, period totals, the daily bars, loop progress).
- **Half shipped:** "Full track mixer": per-track mute is in (Unit 16, with "Mute all"); volumes and saving per song are not. The line stays, saying so.
- **Not shipped:** auto speed trainer, practice routines, setlists, remember jam speed per song, notes per loop (PR #31 `practice-notes` was the "Saved" note in the loop form, not notes on a loop), custom shortcut mapping, MIDI import, e-kit input.

## Could not verify

- **13.26** (clef clipped on a phone): read only. Nothing in the engine sets a scroll offset and the e2e helper still waits for alphaTab's scroll, so it is very likely still there; no browser was run.
- **13.29, 13.31a, 13.31b, 13.33a, 13.33b** (scroll positions): read only. The code they describe is unchanged and the fixme test is still skipped; the pixel figures are the old notes'.
- **13.12**: that alphaTab can never import a bar with a tempo or meter of 0 was not checked in alphaTab's source.
- **13.14**: postgrest-js's `.retry(false)` is in the installed typings; that the client-level option does the same was not exercised.
- **Every Unit 14 item**: taken from the unit's own notes of 2026-11-27, with the code spot-checked (`RecordingBox.tsx`, `LinkOut.tsx`, `outbox.ts`, `seed.ts`), since the unit merged yesterday.
- **13.06**: the wait was traced through `useRequestedLoop`, `lookUpPracticeLoop` and `canPlayLoopPractice`, not timed on a throttled connection. It applies when the cached list is older than 30 seconds and no loop write is pending (only then is the list read again on opening the screen); a list read in the last 30 seconds opens at once.

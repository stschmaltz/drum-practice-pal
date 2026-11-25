# Unit 13: Polish and release

## Build

### Summary

- **The first-run journey in e2e** (`tests/e2e/journey.spec.ts`, phone, tablet and desktop): a new user signs in through the login page with the 6-digit code, meets the empty home page and follows "Go to Library", uploads `groove-120` with the picker, jams (opens at 100%, a tap on the next bar seeks there, Play moves the cursor on), saves a loop with a 90% target, saves 80% as its speed, practises it until "Practice logged … at 80%" and the row is in the database, saves 90%, gets "Mark finished?", finishes it, and finds it under Finished on the home page with its history kept. Each step's edges stay in their own specs.
- **Release prepared, not run.** `docs/release.md` is the checklist Shane works through: the pre-push SQL checks for the two migrations that add checks, `supabase link` / `db push --dry-run` / `db push`, a types drift check against the hosted schema, Storage and Data API settings, every hosted auth setting row by row against `supabase/config.toml` (with what production should be), the Workers build variables, the checks after the deploy and what to do if something goes wrong. Nothing was pushed and no account was touched.
- **README** rewritten: what the app does, getting started, scripts, the stack, production, where the docs are.
- **The spike is retired**: `/spike`, `src/features/spike/`, `scripts/spike-measure.ts`, `tests/e2e/spike.spec.ts` and `public/sf-candidates/` (and its `.gitignore` lines and Workbox ignore). The fixtures no longer ship in `dist`.
- **Carried forward items fixed** (each with tests):
  1. **Fixed copy for every failure** (04 QA issue 2, 08 QA issue 9, 09 Build): `src/lib/errorCopy.ts` (`failureCopy`, `failureKind`, `signInFailureCopy`, `UserFacingError`). No screen renders `error.message` any more. "Failed to fetch", Postgres messages and Auth's messages all become one of five sentences (no connection, sign-in ran out, item gone, refused, unknown); the login page maps Auth's rate-limit, `otp_expired` and sign-ups-off codes. App-written copy (`SongFileError`, now a `UserFacingError`) shows as is.
  2. **Upload with a lost answer** (04 Review open issues 1 and 2): after an insert that failed for the connection, `uploadSong` looks the row up by id; if it is there the upload succeeded and the file stays; if the look-up fails too the file stays and the copy says the song may have been added; only with no row is the file removed. An upload whose own request failed for the connection removes whatever reached Storage.
  3. **Loop create with a lost answer** (08 Build, 08 Review): `LoopEditorForm` keeps one id for its lifetime; `createLoop` takes a 23505 on that id as already saved and reads the row back, so a second press saves one loop.
  4. **`aria-describedby` on inline field errors** (04 QA issue 6): the song edit form, the loop form (both bar fields point at their one shared message; the target field at its error and its BPM note) and the metronome volume.
  5. **Options off after a player error** (05 QA issue 3): `canChangeOptions(player, snapshot)` is false under `error`, and `canUseDrumToggles` is built on it, for the controls bar, the loop speed control (fields, nudges and its `setSpeed`) and the keys.
  6. **Focus after deleting the last song** (bug hunt S4): the library's focus hand-over moved up to `LibraryPage`, so it outlives the list; with no song left on show focus goes to the search, or to the upload's file input once the library is empty.
  7. **Shortcut changes announced** (10 Build): `shortcutAnnouncement(before, after)` (pure) words what a key changed ("Speed 85%", "Metronome on", "Drums unmuted, Drums only on", "Count-in 2 bars"); the song page keeps an empty polite `role="status"` and fills it after each key.
  8. **A loop deleted on another device** (09 QA issue 7, part): a session refused as `loopGone` now reads the loops again (`sessionLoopGone`, through the mutation and the keepalive path), so the page stops looping a loop that is gone.
  9. **The error shown twice in "Mark finished?"** (09 QA issue 3): the loop's status button leaves the reason to the prompt while the prompt is up.
  10. **"Practice logged" after its loop is deleted** (09 QA issue 4): the notice goes once its loop isn't in the list.
  11. **Pause with a count-in moved the score 109 to 117 px** (12 QA after the QA fix round, issue 2): fixed on `unit-12` too (round 2, `useStaysOnScreen` turns anchoring off on `html` and `body`); on the rebase onto it this unit's `[overflow-anchor:none]` on the song page and its duplicate e2e case were dropped for unit-12's.

### Files touched

New: `src/lib/errorCopy.ts` (+ test), `src/features/library/uploadPicker.ts`, `tests/e2e/journey.spec.ts`, `docs/release.md`, this note.

Deleted: `src/features/spike/*`, `scripts/spike-measure.ts`, `tests/e2e/spike.spec.ts`, `public/sf-candidates/.gitkeep`.

Changed:

- Copy: `LoginPage.tsx`, `SignOutButton.tsx`, `LibraryPage.tsx`, `SongListItem.tsx`, `UploadPanel.tsx`, `LoopEditorForm.tsx`, `LoopPanel.tsx`, `LoopSpeedControl.tsx`, `LoopStatusButton.tsx`, `SettingsPage.tsx`, and their tests' expected text.
- `songsApi.ts` (+ test), `loopsApi.ts` (+ test), `src/test/loopTable.ts` (`loseNext`, 23505 on a taken id, select by id).
- `controlGates.ts`, `PlayerControls.tsx` (+ test), `useSongShortcuts.ts` (+ test), `shortcuts.ts` (+ test), `SongPage.tsx` (+ test).
- `useSessions.ts` (+ test), `usePracticeTracker.ts`.
- `src/App.tsx`, `vite.config.ts`, `.gitignore`. (`tests/e2e/player.spec.ts` was changed here before the rebase onto unit-12; its count-in Pause case went with the rebase, see item 11.)
- `README.md`, `AGENTS.md` (spike mentions gone; new "Polish and release (from Unit 13)" section; the "never render" convention covers error messages), `docs/plan.md` (Carried forward lines dealt with deleted or trimmed; the two pre-push SQL lines replaced by one line pointing at `docs/release.md`).

### Decisions

- **Fixed copy by kind, not per code.** Five sentences cover what a drummer can act on (check the connection, sign in again, it's gone, the server said no, try again). The screen's own "Couldn't save the speed." says what failed. The constraint names a refusal carries are the app's bugs, not the user's; the client already validates every limit (`schema.ts`).
- **A lost insert answer keeps the file when in doubt.** An orphan file is invisible and harmless (and on the sweep list); a listed song with no file is a broken song.
- **A re-pressed loop create takes the stored row**, even if the user edited the form between the presses: the first press's values are what the server has, and the form closes on the stored loop. The list shows what was saved.
- **The library's focus hand-over lives in the page**, since `useFocusWhenReady`'s wait belongs to the component that owns it and the list unmounts with the last song.
- **Notation scale not changed.** I tried making the engine's bounds scale-aware (`display.scale` 1.25, bounds multiplied by the scale): the phone's tap tests then passed but every tablet and desktop tap test failed; with no scaling, page layout passes and horizontal fails. So at alphaTab 1.9 the bounds lookup appears to be in drawn pixels in page layout and unscaled in horizontal layout, which isn't a clear enough answer to ship. The engine is as it was and `NOTATION_SCALE` stays 1. The Carried forward line stays, with this finding.

### Decisions for Shane

These Carried forward items are product questions; each is still in `docs/plan.md` with my recommendation here.

- **Oldest iOS supported** (`color-mix()` drops on Safari before 16.2, hiding the bar cursor and the loop highlight). Recommend iOS 16.4+ (the first with Web Push and solid PWA support) and no fallback.
- **Beat cursor under "reduce motion"**: recommend keeping the glide; it is how the cursor keeps time, and it isn't decoration.
- **"Sign out anyway"** while a write hangs: recommend offering it after the write has been unanswered for 30 s, with "Practice not yet saved will be lost".
- **A device clock more than a day ahead** has every session refused: recommend taking `started_at` from the server (a default of `now() - duration`) rather than the client.
- **`?loop=` on a hanging connection**: recommend capping the wait at 5 s, then opening from the cache.
- **Song files on the device**: recommend a cap of 50 songs, evicting the least recently opened.
- **Storage orphan sweep**: recommend accepting them for one user; a sweep script is a release-later chore.
- **Loops that start on a repeat's last bar**: recommend starting from the last playthrough of the first bar (what a drummer means by "bars 4 to 5").
- **Hidden-page time on a laptop** and **grouping the history by day**: recommend keeping the rule (it is the safe one) and grouping by day in the history.
- **Short stretches of several loops adding up**: recommend not adding up; a loop's history should be that loop's.
- **One tap into practice**: recommend keeping song-then-Play; audio has to start in a tap on the page that plays.
- **Count-in number behind the open sheet on a phone** (N1): recommend closing the sheet whenever a count-in starts on a phone; a few lines.
- **The count-in downbeat slide** (N2, N3): recommend always putting a count-in's bar at the start of the box.
- **Room under the controls after a resize while playing** (12 Test bug 1): recommend dropping the room at an unfold and letting the score move with the resize.
- **A refused status write's error staying up**: recommend dropping it on leaving the page.
- **Notation size**: needs the finding above settled in alphaTab first; then raise `NOTATION_SCALE` if the kit says so.

### Known gaps

- Copy for other screens' fixed load errors ("Couldn't load your loops.") is unchanged; they were already fixed copy.
- The `loopGone` refetch through the keepalive path has no test of its own (the mutation path has two).
- Carried forward items left as they were, beyond the decisions above: a 401 on a query isn't sign-out; queued writes with no session go out as `anon`; two tabs sharing one outbox; a late "playing" after a new count-in's downbeat; the phone score opening 47 px sideways; typed loop bars not scrolled to; focus on the hidden "Play loop" after the sheet closes; "Mark finished?" behind a closed sheet; the home page's single column; a refused finish or reopen dropping focus to `<body>`; "Loading loops…" for 24 s offline; a tap outside the playing loop saying nothing; `useUpdateSong`'s whole-row merge (unreachable); the song file refetch test (unreachable); a mid-bar tempo change; "every repeat" with an uncountable bar; the final soundfont; the phone layouts with the sheet open.

### Async windows and inputs

- **An upload's look-up after a lost insert.** It runs inside the upload's mutation, so the upload stays pending (Sign out stays off, the panel shows "Saving"). A cancel is already ignored from the insert on. If the look-up's answer is lost too, nothing is removed.
- **A loop create re-sent.** The form is locked while the create is pending, so the second send only happens after the first has failed. Its 23505 look-up runs inside the same mutation. A delete of that loop on another device between the two presses makes the second press insert it again (the id is free); that is a new loop with the form's values.
- **Deleting the last song.** The hand-over waits through `useFocusWhenReady` on `LibraryPage`'s renders (up to `FOCUS_WAIT_MS`), moves focus only if it is still on "Delete song" or `<body>`, and waits until the song has left the list. A failed delete keeps the song and its question; nothing moves.
- **The shortcut announcement** is set in the key handler from the player's snapshot before and after the action, so two presses before React draws still each say their own change. A key whose gate refuses says nothing new.
- **`loopGone`** reads the loops again only when no loop write is pending, as `sessionLogged` does; a pending write's settle reads them.

### Manual verify

1. `npm run dev`, sign in with a new email using the code: the empty home page points to the library.
2. Upload, open the song, save a loop with a target, practise, reach the target, finish: the journey spec's steps by hand.
3. DevTools offline, then "Save speed": "Couldn't save the speed." does not show; it queues. Settings, Save offline is disabled; with the network throttled to failing, a save says "The server couldn't be reached. Check the connection and try again."
4. In the loop form, type a bad bar range and inspect the First bar input: its accessible description is the message.
5. Break the soundfont (block `sonivox.sf2` in DevTools) and reload: Speed, Metronome, the drum toggles and the keys are off.
6. Delete every song in the library from the keyboard: focus ends on the upload.
7. With a screen reader on the song page, press M and the arrows: each change is read out.
8. On a tablet-sized window, count-in 1 bar, Play then Pause: the score doesn't move.

### Results

- `npm run check`: 109 files, 4278 tests green.
- `npm run e2e` (`E2E_PORT=4180`, fresh `npm run build -- --mode development`): 384 passed, 24 skipped, 0 failed (408 listed; the spike's tests are gone, the journey and the count-in Pause case are new). The new count-in Pause case failed at 117 px on tablet and desktop before the anchoring fix.
- The unit-12 branch has moved on since this worktree was cut; rebase before review.

## Test

### Summary

Build had tested each fix at the level it was made (`errorCopy`, `songsApi`, `loopsApi`, the hooks). This stage adds the tests a user's path through each fix needs, the gates and interleavings the checklist asks for, and e2e for the fixes that only show on a real connection. Every new test was run once against the code it covers broken (a scripted break per fix, then restored), and failed.

### Tests added

Unit and component (Vitest, 34 new tests):

- `tests/unit/errorMessages.test.ts` (new): no component file renders an error's own `.message` unless it is the app's own (`SongFileError` / `UserFacingError` on the line or the one above); proves the rule bites on the pre-Unit-13 pattern. Fails if `LoginPage` shows `sendEmail.error.message` again.
- `src/features/player/controlGates.test.ts` (new): `canChangeOptions`, `canUseDrumToggles` and `canPlay` per status, `error` included.
- `PlayerControls.test.tsx`: a failure while the song is still loading (the soundfont case) turns every option off, the count-in radios included, and a press on Metronome or "2 bars" changes nothing.
- `LoopSpeedControl.test.tsx`: Speed %, BPM and the nudges are off after a player error; a speed being typed when the player fails is not set when the field blurs (the `setSpeed` guard, reached round the disabled field).
- `UploadPanel.test.tsx`, "when the save's answer is lost": the look-up finds the row, so the panel says "Added", keeps the file and links to the song, and while the look-up is pending it still says "Saving" with no Cancel and the picker off; a failed look-up shows the network sentence plus "The song may have been added anyway…" and removes nothing; no row removes the file.
- `LoopEditorForm.test.tsx`: a second press after a lost answer and an edit of the name keeps the loop the server has (Build's decision), is locked like the first, and leaves one loop in the cache; the target's BPM note is the field's accessible description.
- `LibraryPage.test.tsx`: a failed delete of the last song leaves focus on "Delete song", and its retry hands focus to the upload.
- `SettingsPage.test.tsx`: the metronome volume's error is the slider's accessible description (reached through a stored row out of range, since the slider clamps), and nothing is sent.
- `usePracticeTracker.test.tsx`: `loopGone` through the keepalive path reads the loops again (the Build note's known gap) and not the songs; the same through the mutation path.
- `SongPage.test.tsx`: a loop deleted on another device: its next session is refused (23503), the loops are read again, "Now looping" goes and the earlier "Practice logged" notice goes with it, with no "Couldn't save" message; the shortcut status is on the page empty from the start, says "Drums muted", "Drums unmuted, Drums only on", "Speed 95%" after D, S, ArrowDown, and a mouse click on a toggle leaves it alone.
- `LoopPanel.test.tsx`: after a refused "Mark finished" in the prompt, "Not yet" moves the reason under the loop's own button, still said once.
- `LoginPage.test.tsx`: Auth's `AuthRetryableFetchError` shows the network sentence, never "Failed to fetch"; `errorCopy.test.ts`: the rest of the login codes (`over_request_rate_limit`, `signup_disabled`, `email_address_invalid`) and PostgREST's dropped connection.

e2e (Playwright, `tests/e2e/release-fixes.spec.ts`, new, 4 tests x phone, tablet, desktop):

- An upload whose insert answer is lost (`route.fetch()` then `abort`) is still "Added", with one row and its file in Storage, and the song plays.
- "Save loop" after a lost answer shows "Couldn't save the loop. The server couldn't be reached…", and a second press saves one loop (one row, one item).
- A settings save that never reaches the server shows the fixed network sentence, not "Failed to fetch".
- M and ArrowUp on the song page fill the `role="status"` with "Metronome on/off" and "Speed 105%".

Both lost-answer specs failed with the fix broken (the look-up skipped; a new loop id per press).

### Async windows checked

- The upload's look-up after a lost insert: "Saving", no Cancel, picker off, Sign out covered by the pending upload (unchanged).
- A loop create sent again: locked during the second send; edits typed meanwhile don't reach the saved loop.
- The last song's delete: a refusal keeps focus where it was; the hand-over runs only once the song has left.
- A player failure mid-typing in the loop speed: the commit on blur is refused.
- `loopGone` while the page plays the loop: the list is read again and the page lets the loop go.

### Bugs found

None.

### Results

- `npm run check`: 111 files, 4312 tests green (34 new).
- `npm run e2e` (`E2E_PORT=4180`, fresh `npm run build -- --mode development`): 395 passed, 24 skipped, 1 failed (420 listed; 12 new). The failure was `offline.spec.ts:339` on phone only: the database already had the loop `finished` while the page was still offline (`writes.sent` empty). No app code changed in this stage; that test then passed 15 of 15 on its own (`--repeat-each=5`, all three sizes). Logged as a flaky test for QA to watch, not as a bug: the write probably left in the moment the context was going offline, under the full run's load, so the recorder never saw it.

## QA

**Verdict: PASS.** No blocker or major issues. Three minor issues (one in this unit's new code, two older), one cosmetic doc fix made here, and the flaky test is a test race, not an app bug.

**How it was run.** This branch, built with `npm run build -- --mode development` and served by `vite preview` on port 4181 (4173 belongs to the other session). Local Supabase. A temporary Playwright spec (deleted after the run) drove the phone (390 x 844), tablet (820 x 1180) and desktop (1440 x 900) projects, logged text, focus and element positions, ran `auditScreen` on every screen and state it reached (120 audits), and took the shots. Slow network was a 3 s delay on every REST and Storage request; failures were `route.abort('connectionfailed')` and a 500 carrying a server message; offline was `context.setOffline`. The brand-new user signed up through the login page with an unknown address and the 6-digit code read from Mailpit, and was deleted afterwards. Chromium only; nothing was heard.

Shots are `docs/units/13-shots/qa-<size>-NN-name.png`:

- 01 to 07: login; empty submit; a malformed email; `a@b`; the code step; a wrong code; letters in the code.
- 10 to 17: the empty library just after sign-up; the empty home page and its Finished tab; settings; a MIDI file, a junk `.gp`, an empty file; the first upload; a duplicate.
- 20 to 27: the song first opened; the empty loop panel; the loop form with a reversed range and with a bad target; the first loop saved; the first practice logged; its history; the home page with the loop.
- 30 to 35: loading states on a slow network (library, home, settings, song, the file downloading, a loop saving).
- 40 to 47: every read dropped (library, home, settings, song: still loading at 9 s, see issue 2), a 500 with a server message, the song's file dropped, a failed rename and a failed delete.
- 50 to 53: the song, the loop form, the library and settings offline.
- 55, 56: the player after the soundfont failed. 57: the library after deleting every song by keyboard. 58: after a count-in Pause. 59: an upload whose answer and look-up were both lost.

### Acceptance criteria

| Criterion                                                       | Result                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The journey passes (CI)                                         | Pass locally: `journey.spec.ts` green at all three sizes. CI not run from here.                                                                                                                                                                                                          |
| A real-device pass finds nothing blocking                       | Human check (below).                                                                                                                                                                                                                                                                     |
| No screen lacks an empty, loading or error state                | Pass. Library, home (both tabs), loop panel, history, settings and song each have all three; the song page also says when its file failed or isn't on the device. A dropped connection shows "Loading …" for about 24 s before the error (the known Unit 13 line; issue 2 is one cause). |
| Touch targets 44 px+ (also contrast, names, no sideways scroll) | Pass. All 120 audits clean at the three sizes, the error, offline and player-error states included.                                                                                                                                                                                      |

### QA focus: first run

Pass at every size. `/library` signed out goes to `/login?next=/library`; the code signs a new address up and lands on the library (the `next` is kept). The empty library, the empty home page ("Nothing on the go…", "Go to Library") and its empty Finished tab ("No finished loops yet…"), the empty loop panel and the empty history each say what to do next. A wrong code and letters in the code show the fixed "That code didn't work…" copy. MIDI, junk and empty files each get their own fixed sentence and add nothing; a duplicate offers to open the song. The loop form's errors are fixed copy, and each field's `aria-describedby` reads its message ("The last bar can't come before the first.", "Enter a target from 25 to 200%, or leave it empty."). The first loop saves, plays, logs "Practice logged: 3 s of First groove at 80%." and its history row; the home page lists it.

### Carried forward fixes

| Fix                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixed error copy                   | Pass. No "Failed to fetch", "TypeError", PostgREST code or server text appeared on any error or offline screen. A 500 carrying "SECRET SERVER MESSAGE …" shows "Couldn't load your songs. The server refused it…". Rename, delete, settings save and a song file failure each show the network sentence.                                                                                                                                                                                                                                                                                                   |
| Lost-answer upload                 | Pass (`release-fixes.spec.ts` green at all sizes). With the look-up lost too: "…The song may have been added anyway: reload the library to see.", the file stays, and a reload lists the song. Slow to get there: issue 2.                                                                                                                                                                                                                                                                                                                                                                                 |
| Lost-answer loop save              | Pass (`release-fixes.spec.ts`: one row, one item after the second press). A slow create shows "Saving…" with the fields read-only (by design, so focus stays).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Player error disables options      | Pass. With the soundfont refused: Back to start, Metronome, Mute drums, Drums only, Speed, volume and the count-in are all off; Play is drawn off; M and ArrowUp change and announce nothing. "New loop" stays on (bars can still be picked, by design).                                                                                                                                                                                                                                                                                                                                                   |
| Focus after deleting the last song | Pass. Delete opens its question focused; after deleting the first of two songs focus is on the other's Delete; after the last, on the upload's file input, at every size.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Shortcut announcements             | Pass, with issue 1. M, D, S, C and the arrows say "Metronome off/on", "Drums muted", "Drums unmuted, Drums only on", "Count-in 1 bar / 2 bars / off", "Speed 105%"; three quick ArrowUps end on the last change; at 200% another ArrowUp says nothing new.                                                                                                                                                                                                                                                                                                                                                 |
| Pause with a count-in              | Pass. Count-in 1 bar, three Play / Pause runs (one paused mid count-in) and one from 200 px further down: the score box did not move by a pixel at any size (window scrolled 0, 109 and 117 px on phone, tablet and desktop, the old shift amounts).                                                                                                                                                                                                                                                                                                                                                       |
| `docs/release.md` and README       | Pass, one cosmetic fix. Every auth row matches `supabase/config.toml` (site URL, signup, confirmations, OTP length and expiry, `max_frequency`, 100 emails an hour, JWT expiry, rotation and its 10 s, `double_confirm_changes`, password length 6, template subjects and path). The bucket's 20 MB, `max_rows` 1000 against pages of 500, the three CI jobs, `.nvmrc` 22 and the `wrangler.jsonc` notes are right. README's scripts match `package.json`, its fixtures match `tests/fixtures/gp/`. Fixed: the Redirect URLs row said "localhost and LAN ports 5173 and 4173"; the LAN entry is 5173 only. |
| Spike retired                      | Pass: no `/spike` route or `src/features/spike/`; `src` only cites the Unit 01 note in comments.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Slow network and offline: loading lines show on every screen. Offline, the banner shows; Upload, Save loop, Save settings and Sign out are off with their notes; a song opened before still plays; the loop's Save speed stays on (queued).

### Issues

1. **Minor: the same announcement twice in a row is said once.** The live region keeps its last text, so a key whose change is worded the same as the last one leaves it unchanged and a screen reader hears nothing. Measured with a MutationObserver: no change at the second press, at all sizes. Repro: song page, M ("Metronome off"), click Metronome back on with the mouse, M again ("Metronome off", not read). Fix: clear the region before setting it, or alternate a suffix the screen reader doesn't read. Loop switching by key (arrows, Page keys) isn't announced either.
2. **Minor: postgrest-js retries every failed GET itself.** supabase-js 2.119's PostgREST client retries a GET up to three times with 1, 2 and 4 s back-off before returning the error, underneath TanStack Query's own retries. So an upload whose insert answer was lost and whose look-up fails too says "Saving groove-120.gp…" (no Cancel) for about 33 s before "…may have been added anyway" (probe timeline: look-up GETs at 0.2, 1.2, 3.2, 7.2 s and on), and it is part of why a dropped connection shows "Loading …" for about 24 s. Repro: drop the insert's answer (`route.fetch()` then abort) and every songs GET after it. Consider turning the client's retry off for the look-up, and for reads TanStack already retries.
3. **Minor (older): a stale persisted list can show as "No songs yet".** Seen once on tablet: a reload about a second after an upload, with every REST read dropped, restored the cache written before the upload and showed the empty state with no sign the refresh had failed (a failed background refetch keeps cached data, by design). Not seen again in a second run; it depends on the cache being written a second after a change.
4. **Cosmetic, fixed:** the `docs/release.md` Redirect URLs row (above).

### Flaky test: `offline.spec.ts:339`

**A test race, not an app bug.** Reproduced 1 in 20 and then 3 in 30 runs on phone, and once on desktop in a run of the whole offline spec, always "Received: finished" at the check that the loop is still `active`. Instrumented (an init script logging to `localStorage`, which survives unloads, plus Kong's access log): in the failing runs the `/settings` document gets an `online` event while `navigator.onLine` is still false, about 100 ms after it loaded, at the moment `page.goto('/library')` starts. The app's `onlineManager` goes online, the queued "Mark finished" is sent from the outgoing document (`fetch PATCH /rest/v1/loops onLine=false`), Kong logs the PATCH with a 200, and the document unloads. Playwright's request events and its offline emulation both miss a request from a document being navigated away. A real browser fires `online` only when the connection is back, so the app does the right thing with the event. Fix in the spec: abort `**/rest/v1/**` with `context.route` while the test is offline as well as `setOffline`, or move between the screens with the nav links instead of `page.goto`.

### Human checks (for Shane)

- A week of real practice on the phone, tablet and laptop (the plan's Unit 13 check).
- The real-device pass on the production URL: `docs/release.md` section 5 (iPhone sign-in with the code, first-tap sound, ringer on silent, installed PWA offline, "Reload to update").
- VoiceOver or TalkBack on the song page: M, D, S, C and the arrows are read out (and issue 1).
- `docs/release.md` sections 1 to 4 (pre-push SQL, `db push`, hosted auth settings, Workers build variables), and the Decisions for Shane list in the Build section.

### Results

- `npm run check`: 111 files, 4312 tests green.
- e2e (`E2E_PORT=4181`, this build): the `journey`, `release-fixes`, `design`, `offline`, `player`, `library` and `auth` specs at three sizes: 167 passed, 6 skipped, 1 failed (`offline.spec.ts:339` on desktop, the race above).

## Readability

### Summary

Small, behaviour-neutral tidying of this unit's code; no copy, gate or flow changed.

- **One home for the error codes the app branches on.** `src/lib/postgresCodes.ts` (`PG.UNIQUE_VIOLATION`, `PG.FOREIGN_KEY_VIOLATION`, `PG.NO_ROWS`) replaces the local `UNIQUE_VIOLATION` in `songsApi.ts` and `loopsApi.ts` (both now 13's), `FOREIGN_KEY_VIOLATION` in `sessionsApi.ts`, and the raw `'23503'` / `'PGRST116'` in `errorCopy.ts`'s `GONE_CODES`. Pure, so `errorCopy` can import it. Named like `tests/db/helpers.ts`'s `PG`, which keeps its own list of what the database tests assert.
- **`songsApi.ts`**: `uploadedSong(song)` is the one place a new upload's result is built (`last_practiced_at: null`), used by the normal insert and by the lost-answer look-up; `removeUploadedFile`'s throw reflowed to one call.
- **`useSongShortcuts.ts`**: the announcement after a key reads as a plain `if (player && before)` block instead of a chained `&&` value; the count-in case takes braces like its neighbours.
- **Imports**: the `@/lib/errorCopy` import added in ten components sat after the relative imports; moved into the `@/` group, and `UploadPanel`'s `./uploadPicker` into order.
- **`useFocusWhenReady`** exports its callback type `FocusWhenReady`, which `LibraryPage`'s `SongList` now takes instead of `ReturnType<typeof useFocusWhenReady>`.
- **Comments**: `PlayerControls`' note on when options are off now says "and off once it has failed" (13 Build changed the gate); `errorCopy`'s `'token_refused'` literal says whose code it is and why it isn't imported (`tokenRefresh.ts` imports the client).
- **e2e**: `release-fixes.spec.ts` had its own copies of `library.spec.ts`'s song-row and Storage-file reads. Both now import `songRows` / `userFiles` from a new `tests/e2e/libraryPage.ts`, like `practicePage.ts` for sessions and loops.
- **Spike**: no code was left. `src` cites the Unit 01 note only in comments that are still true; `public/sf-candidates/`, the route, the Workbox ignore and the e2e spec are gone (Build).

Looked at and left: `UploadFailure`'s two wordings (an app-written `SongFileError` reads "Couldn't add …", a failure "Couldn't upload …"; merging them would change copy); the inline `{ message: 'TypeError: Failed to fetch', code: '' }` in test files (the pattern since Unit 11); `LoopSpeedControl.setSpeed` asking `canChangeOptions` again beside `canSetSpeed` (it narrows `player` for the call).

### AGENTS.md

"Polish and release": one sentence on `PG` from `src/lib/postgresCodes.ts`.

### Results

- Before: `npm run check` 111 files, 4312 tests green; `npm run e2e` (`E2E_PORT=4180`, fresh development build) 394 passed, 24 skipped, 2 failed (`offline.spec.ts:339` on phone and tablet, the known race QA diagnosed).
- After: `npm run check` 111 files, 4313 tests green (one more case from a test that walks `src/` files, which now has `postgresCodes.ts`); `npm run e2e` (same setup, rebuilt) 396 passed, 24 skipped, 0 failed.

## Review

Against `git diff unit-12...HEAD` (the branch is stacked on unit-12), scripts, tests and docs included, walked through `docs/review-checklist.md`.

### Inventory

- `uploadSong` (`songsApi.ts`): the lost-upload removal, the lost-insert look-up (`findSavedSong`), `removeUploadedFile`'s copy.
- `createLoop` (`loopsApi.ts`) and `LoopEditorForm`'s one `newLoopId` per form; `useCreateLoop`'s `onSuccess` (dedupes by id).
- `errorCopy.ts` (`failureKind`, `failureCopy`, `signInFailureCopy`, `UserFacingError`), `postgresCodes.ts`, and every screen that now renders `failureCopy`.
- `controlGates.ts` (`canChangeOptions` off under `error`) and its callers: `PlayerControls`, `LoopSpeedControl` (fields, nudges, `setSpeed`), `useSongShortcuts`.
- `useSongShortcuts`' announcement and `SongPage`'s live region.
- `LibraryPage`'s focus hand-overs (delete moved up to the page; edit close in the list).
- `sessionLoopGone` (`useSessions.ts`) on the mutation path and the keepalive path (`usePracticeTracker.ts`).
- `SessionNotice` (dropped once its loop is gone), `LoopStatusButton`'s `showError`.
- `aria-describedby` on `SongListItem`'s `TextField`, `LoopEditorForm`'s `Field` and the metronome volume.
- `loopTable` (`loseNext`, 23505 on a taken id, select by id); e2e `journey.spec.ts`, `release-fixes.spec.ts`, `libraryPage.ts`; the spike's removal (`App.tsx`, `vite.config.ts`).

### Findings

1. **Fixed: Cancel on a song's edit form left focus on `<body>`** (checklist 5, focus when a control replaces itself). 13 Build moved the library's `useFocusWhenReady` from `SongList` up to `LibraryPage` so the last song's delete could use it, but the hook looks again only on its owner's renders, and a Cancel re-renders the list (its editing ids), not the page. The press asked for focus and nothing ever gave it. `LibraryPage.tsx:32` keeps the page's hook for the delete hand-over only (`focusAfterDelete`), and `SongList` has its own again (`:120`) for the edit form's. New test, "Cancel hands focus back to the song's Edit, with nothing saved", `LibraryPage.test.tsx`; it failed before the fix. Added a sentence to that checklist row: the owner of the wait must be a component the change re-renders.
2. **Fixed: the same announcement twice wasn't read again** (13 QA issue 1). `useSongShortcuts` now keeps `{ text, count }` and `SongPage` renders `announcementText(announcement)` (`useSongShortcuts.ts:122`), which ends every other saying in a no-break space, so M, a click on Metronome, M is a DOM change each time; Testing Library and Playwright normalise the space, so text assertions are unchanged. Test "the same change said twice is still a change to the live region" (fails with the alternation removed). New checklist row in section 6, and the AGENTS.md Unit 13 bullet says how a repeatable live region works.
3. **Fixed, in scope: switching loops (or bars) by key said nothing** (13 QA note). Loop keys are the pedal's whole job and the change is out of sight, which is what the live region was for. `stepLoopOrBar` returns where it moved (`Loop Verse`, `Bar 5`) and `shortcutAnnouncement` puts it first (`Loop Verse, Speed 80%`). Tests in `useSongShortcuts.test.tsx` (by loop, by bar) and `shortcuts.test.ts`.
4. **Fixed: `offline.spec.ts` "a loop opens from the home page…" was flaky** (13 Test, 13 QA). QA's diagnosis holds: Chromium's offline emulation can fire `online` in the document `page.goto` is leaving, and that document sends the queued "Mark finished" unseen. After the finish is queued the spec now moves to Settings and the Library by the nav links (`navLink` takes `'Settings'` now), so no document is left with a write queued; the cold start's `page.goto('/')` comes before anything is queued. The pattern is in AGENTS.md (Unit 11 e2e patterns). Proven: `--repeat-each=30` on phone, 4 workers, 30 of 30; again with 8 workers after a fresh build, 30 of 30. The race itself couldn't be forced on demand (QA saw it 1 in 10 to 1 in 20), so the old form wasn't re-run to show a failure.
5. **Logged: postgrest-js retries every failed GET itself** (13 QA issue 2). `.retry(false)` exists in 2.119, but turning it off for the upload's look-up makes "may have been added" commoner on flaky Wi-Fi; a product call, not a defect. Unit 13 Carried forward in `docs/plan.md`.
6. **Logged: a stale persisted list can show "No songs yet"** (13 QA issue 3, older, seen once). Unit 13 Carried forward.
7. **Rebase seam: clean.** No `overflow-anchor` left in Unit 13's code; unit-12's `useStaysOnScreen` owns it, and `player.spec.ts` has no Unit 13 change. `docs/plan.md`'s "Pause with a count-in" line is gone (unit-12 removed it); nothing in Carried forward is duplicated. The Build note's Files touched still listed `tests/e2e/player.spec.ts`; corrected.

Checked and left alone: `uploadSong`'s look-up checks its `error` and keeps the file when it can't tell; a network-failed upload removes what reached Storage and says so if that fails too; the cancel paths are unchanged. `createLoop`'s 23505 look-up checks its error, and a 23505 with no row by that id falls through to the original error. `useCreateLoop` dedupes by id, so a refetch between the two presses can't list the loop twice. `failureKind` matches storage-js 2.x (`StorageUnknownError.originalError` is the `TypeError`, checked in `node_modules`). No `.message` of a foreign error is rendered anywhere in `src` (`tests/unit/errorMessages.test.ts` plus a grep of `.ts` files too). Every `canChangeOptions` caller passes the snapshot; nothing else sets speed or options round the gate. No listeners, timers or engine DOM were added. No bar maths changed. No secrets in `docs/release.md` or the README. Teardown: the new e2e specs use the `user` fixture.

### Environment note

`npm run test:db` has 1 failure, `session-sanity.test.ts` "at most two days ahead", with "ended_at … is more than a day ahead". That message is not in this branch's migrations: the shared local database carries `20261123020000_session_ended_at.sql` from the `unit-09-copilot` worktree. Neither `supabase/` nor `tests/db/` changes on this branch, and the database wasn't reset (shared stack). It is environmental. Re-run after `db:reset` on this branch's migrations to confirm, and settle the unit-09-copilot migration before merge.

### Results

- `npm run check`: 111 files, 4337 tests green.
- `npm run test:db`: 204 passed, 1 failed (the environment note above).
- `npm run e2e` (`E2E_PORT=4180`, fresh `npm run build -- --mode development`): 407 passed, 28 skipped, 0 failed (435 listed). The rewritten `offline.spec.ts` case passed at all three sizes.

# Unit 10: Keyboard shortcuts and pedals

## Build

### Summary

The song page answers the keyboard, and so a Bluetooth page-turner pedal, which is a keyboard to the browser:

| Key                           | Does                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| Space                         | Play / pause                                                                       |
| ↑ / ↓                         | Speed +5% / −5% (from the percent on show; held, it goes on)                       |
| ← / → and Page Up / Page Down | Previous / next loop in the panel's order; a bar back / on in a song with no loops |
| M                             | Metronome on / off                                                                 |
| D                             | Mute drums                                                                         |
| S                             | Drums only                                                                         |
| C                             | Count-in: off → 1 bar → 2 bars → off                                               |
| ?                             | The shortcut overlay (also a "Shortcuts" button beside "Show loops", from 768 px)  |
| Escape                        | Closes the overlay                                                                 |

They work the same in jam mode and with a loop playing. Every key is ignored while focus is in a text field, a select or a contenteditable; a focused range slider keeps its arrow and page keys. Ctrl, Cmd and Alt combinations are left to the browser, and Shift with anything but `?`.

The Carried forward focus items are done too: the loop form takes focus when it opens and gives it back to the button that opened it when it closes, and "Mark finished" / "Reopen" hand focus on when their loop leaves the list on show.

### Files

New:

- `src/features/shortcuts/shortcuts.ts` (pure): `KEY_BINDINGS`, `resolveShortcut(press, { focus, helpOpen })`, the input guard `focusKindOf(element)`, `shortcutHelp()` (the overlay's rows, built from the bindings), `nextCountInBars`, `neighbourLoop`, `steppedBar`. Tests in `shortcuts.test.ts`.
- `src/features/shortcuts/ShortcutOverlay.tsx` (+ test): the `?` dialog.
- `src/features/song/useSongShortcuts.ts` (+ test): the song page's glue, one window `keydown` listener.
- `src/features/player/controlGates.ts`: `canPlay`, `canChangeOptions`, `canUseDrumToggles`, shared by the controls, `playLoop` and the keys.
- `src/lib/useFocusWhenReady.ts` (+ test): hands focus to an element a later render brings.
- `src/features/loops/loopFocus.ts` (+ test): the data attributes on the status, Edit and New loop buttons, finders for them, `neighbourAfterLeaving`.
- `tests/e2e/shortcuts.spec.ts`.

Changed:

- `PlayerControls.tsx`: its private `canPlay` moved to `controlGates.ts`; the option and drum toggles use the gates.
- `useLoopPractice.ts`: `playLoop` refuses unless `canPlay` (it relied on its button being disabled; the keys reach it too).
- `loopForm.ts`: `loopsByStatus` (the panel's two sections) and `loopsInPanelOrder` (the order the keys step through), so the panel and the keys share one order.
- `LoopPanel.tsx`: uses `loopsByStatus` and `canPlay`; focus on opening and closing the form and after a status change.
- `LoopEditorForm.tsx`: focuses itself (`tabIndex={-1}`) on mount.
- `LoopStatusButton.tsx`, `useLoops.ts`: `onSet`; `setStatus` returns whether it sent anything.
- `OnTheGoPage.tsx`: focus after a status change; the tab buttons carry `data-practice-tab`.
- `SongPage.tsx`: wires `useSongShortcuts`, the overlay and the Shortcuts button.

### Decisions

- **Space is play/pause wherever focus is, buttons included** (not in fields). After a mouse click on "Play loop" the button keeps focus and has become "Restart loop"; if Space pressed it, the drummer who reaches for Space to stop would restart the loop instead. It also means Space can never answer "Mark finished?" (a Carried forward line). Enter still presses a focused button. The listener cancels Space's keydown and its keyup, because some browsers press a button on keyup even when keydown was cancelled. This changes Unit 07's note that Space on a focused Mute drums toggles it: on the song page it now plays or pauses. `PlayerControls` alone (its own tests) is unchanged.
- **The gates are shared.** Each key asks the same predicate as its control (`controlGates.ts`), of `player.getSnapshot()` at the press, so two presses before React draws still add up (two ↑ = +10%). `playLoop` itself asks `canPlay` now, so neither its button nor a key can set a loop up while the sounds are still loading.
- **Loop keys while paused set the loop up without playing it** (`openLoop`: the loop, its range, its saved speed, its first bar on show); while running they play it (`playLoop`, as "Play loop" does, so playback carries on, with a count-in if one is set). A key that switches never starts sound on its own: only Space does.
- **Order and ends.** The panel's order (active loops by first bar, then finished ones), from `loopsInPanelOrder`. From no loop, next is the first loop and previous the last. No wrap at the ends: a pedal pressed on the last loop does nothing rather than jumping to the top of the song. A loop not in the list (deleted meanwhile) counts as no loop.
- **Jam mode with no loops**: left/right and Page Up/Down step a bar (`seekToBar` then `showBar`). With loops they always mean loops, so a pedal works from jam mode too. While the song's loops are still being read they do nothing, since it isn't yet known which they mean. (Carried forward: "decide whether a key moves a bar".)
- **Nothing while the loop form is open** for the loop and bar keys: taps on the score are picking its bars then, and the form's fields have the keys anyway. Space, speed and the toggles still work with focus on the form itself or a button in it.
- **Held keys**: only ↑/↓ repeat. Everything else acts once per press but still cancels the repeats, so a held Space doesn't scroll the page.
- **The overlay is modal**: focus goes to Close and stays there (Tab and Shift+Tab), Escape or a click outside closes it, focus goes back to where it was. While it is open the page's shortcuts are off except `?` (which closes it), so Space presses Close. A hand-made dialog rather than `<dialog>.showModal()`, which jsdom lacks. The Shortcuts button shows from 768 px only; `?` works everywhere.
- **Focus when the form opens goes to the form, not its first field**: on a phone a focused field brings up the keyboard over the score the bars are picked on. `preventScroll`, because the page has just scrolled the score into view for the picking. Closing (Cancel, a save, "Back to loops") focuses the button that opened it, or "New loop" when that loop's Edit is gone or a drag opened the form.
- **Focus after Mark finished / Reopen**: in the panel, both sections are on show, so focus follows the loop to its new button ("Reopen" under Finished, and back). The prompt's "Mark finished" also goes to the loop's "Reopen". On the home page the loop leaves the tab, so focus goes to the next loop's status button (the one before when it was last), or to the tab the loop went to when it was alone. `useFocusWhenReady` waits for the render that brings the target (the move is optimistic, a few ticks after the press) and moves focus only if it is still on what was pressed or has fallen to `<body>`.
- **Switching loops with a key ends the session of the loop left**, as "Play loop" on another loop does (Carried forward). Kept: one rule for every way of leaving a loop. Short stretches of several loops don't add up; whether they should is a question for the week of real practice, so it moves to Unit 13's list.

### Async windows and inputs

- **A key press, until React renders its change** (a loop switch sets state; the range follows in an effect). Another key in that time reads the player's snapshot directly, and `practice` / `loops` from a ref updated in a layout effect after every render. React flushes a native `keydown`'s updates synchronously (discrete priority), effects included, before the next key event, so the second press sees the first's loop. Covered by "quick presses add up before anything is drawn" and "steps through the loops… with either pair of keys".
- **The overlay open.** Every key but `?` and Escape goes to the overlay (Space presses Close, Tab stays). Player events go on: playback under the overlay is untouched. Unmount while open: the overlay goes and its cleanup gives focus back only to an element still on the page.
- **Between "Mark finished" (or "Reopen", or closing the form) and the render that moves the loop.** Focus moved by the user meanwhile: left alone. Another status press: replaces the wait. The write refused: the optimistic move is undone and the loop's button moves back, so focus, which followed the loop, falls to `<body>` (known gap). Nothing arriving within 5 s (`FOCUS_WAIT_MS`): the wait is dropped, so a later change from another device can't take focus.
- **A refused action.** `setStatus` returns false when another status write to the loop is on its way; then nothing is sent and no focus is scheduled. `playLoop` refused by `canPlay` sets no loop, range or speed. Each key's gate failing still cancels the browser's default (no scroll under a key that is the page's), but does nothing else.
- **StrictMode** mounts the listener twice; cleanup removes the first. Counted in "in StrictMode, still acts once per press".

### Known gaps

- A refused "Mark finished" or "Reopen" moves the loop back after focus has followed it; focus then falls to `<body>`. Rare (a refused write), and left for Unit 13 with the other failure copy.
- Key changes aren't announced to a screen reader: the toggles show `aria-pressed` and the readout changes, but nothing is spoken when the focus is elsewhere. A polite live region ("Metronome on") would do it; Unit 13.
- On a phone with the loop sheet open, a loop switched by a pedal while playing doesn't close the sheet, so its count-in number is behind it (the N1 line in Unit 12 already covers every count-in started other than by "Play loop").
- Only Chromium has run this, keyboard and pedal both simulated. Safari's handling of Space on buttons and of keys from a Bluetooth pedal on iOS needs the human check.

### Manual verify

1. `npm run dev`, open a song with two or three loops on a laptop. Click nowhere in particular, then: Space plays and pauses; ↑ ↑ ↓ shows 105%; M, D, S, C change the Metronome, Mute drums, Drums only and Count-in controls; `?` lists them and Escape closes the list.
2. While playing, Page Down / → steps through the loops in the panel's order without a stop (the "Looping …" line changes); Page Up / ← goes back; at the last loop Page Down does nothing. Pause, press Page Down: the next loop is set up at its saved speed and its first bar, and nothing plays.
3. Delete every loop (or open a song with none): → and ← step the bar in the status line.
4. Click "Play loop", then Space: it pauses (it doesn't restart the loop).
5. Open "New loop": focus is on the form. Type "dms c" in the name: it types, and nothing toggles. Cancel: focus is back on "New loop". Edit a loop, Cancel: focus is on that loop's Edit.
6. "Mark finished" on a loop in the panel: focus is on its "Reopen" under Finished. On the home page: focus is on the next loop's button, or on the Finished tab when it was the only loop.
7. Human check: a real page-turner pedal (Page Up / Page Down, or arrows) on a laptop and on an iPad.

## Test

### Summary

Build's tests already covered most criteria (every key, the input guard, the overlay, focus handling, the pedal on the song page). This stage added the checklist's interleavings, gates and round trip for the keys, three e2e flows for loop mode and the form, and looked into the e2e failure Build reported.

### Tests added (17: 12 Vitest, 5 Playwright)

- `src/features/song/useSongShortcuts.test.tsx`, describe "Unit 10 Test: interleavings, gates and round trips" (8):
  - two loop keys with nothing awaited between them land two loops on (the second press sees the first's loop);
  - a held Page Down moves one loop, not one per repeat;
  - a loop key during a count-in plays the next loop and the count-in starts again on its first bar, at its speed, with the engine not yet told to play;
  - paused, a loop key shows the loop's first bar (`showBar`) and keeps a saved speed of 0.708333 exactly (round trip: not rounded to the 71% on show);
  - with no player yet (alphaTab loading), the player keys do nothing and `?` still opens the list;
  - opening the list while playing leaves playback going; Space after Escape pauses;
  - a song with no drum track: D and S are the page's keys (default cancelled) but change nothing;
  - the keyup of a Space the page took is cancelled once; a field's own Space keyup is left alone.
- `src/features/shortcuts/ShortcutOverlay.test.tsx` (1): unmounted while open, it gives focus back to what opened it.
- `src/features/song/SongPage.test.tsx` (2): a pedal switching loops while playing logs the loop it left, at that loop's speed and duration, without a pause; in a song with no drum track D and S leave the disabled toggles off (with M pressed the same way as proof the keys arrived).
- `tests/e2e/shortcuts.spec.ts` (3 tests x 3 projects): with a loop playing, ↓, M, S, D and C work it and the status recorder sees only `playing` (acceptance: every shortcut in loop mode as well as jam mode); the Shortcuts button opens the list from 768 px, a click outside closes it and focus goes back to the button, and on a phone the button is hidden; with the loop form open, Page Down and → do nothing while M still works.
- `src/test/loopPlayer.ts`: `loopPlayer({ drumTrackIndex: null })` for a song with no drum track.

Each new test was run against a briefly broken build: loop keys acting on `playing` only (count-in test fails), practice read from the first render (two-presses and count-in tests), the Space keyup not cancelled, `nextLoop` made repeatable, the overlay letting Space through, a paused loop key playing, the null-player guard removed (uncaught error), the drum toggles' disabled gate replaced by `canChangeOptions`, the editor guard removed from `stepLoopOrBar` (e2e fails), the Shortcuts button shown on phones (e2e fails on phone). The no-drum hook test fails only with both the key's gate and the service's own `drumTrackIndex` check removed: the service already refuses, so the key's gate is a second line. One drafted overlay test (focus not returned to an opener that has gone) passed with the `isConnected` check removed, since focusing a detached element does nothing; it was dropped as vacuous.

### The e2e failure Build saw

Not reproduced. Here: a full `npx playwright test` before any change (322 passed, 14 skipped), `shortcuts.spec.ts` with `--repeat-each=3` (81 passed), and the final full `npm run e2e` (331 passed, 14 skipped). Specs run `fullyParallel`, so order varies between runs, and none failed.

Likely cause: `playwright.config.ts` has `reuseExistingServer: !process.env.CI`. If anything is already listening on 4173 (a `vite preview` left from QA or from an earlier, interrupted run), Playwright serves that server's `dist` without building. A `dist` from before the keys were wired fails exactly the shortcut specs, all 18, while every older spec passes, which is what Build saw; a later run that started its own server built afresh and passed. Not a flake in the specs. Worth knowing: locally, stop any preview on 4173 (or delete `dist`) before an e2e run after editing app code. CI is unaffected (no reuse there).

### Bugs found

None.

### Not covered

- A refused "Mark finished" moving the loop back after focus has followed it (Build's known gap, focus falls to `<body>`).
- Real Bluetooth pedals and Safari: Chromium's simulated keys only (Human check).

### Totals

`npm run check`: 89 files, 3495 tests passed. `npm run e2e`: 331 passed, 14 skipped (the existing skips), 0 failed.

## QA

**Verdict: FAIL, on one major issue** (issue 1: "Mark finished" / "Reopen" in the song page's loop panel drops focus to `<body>` instead of following the loop). Every shortcut, the pedal keys, the input guard and the overlay pass at all three sizes; no blocker. Two cosmetic issues were fixed here (issues 3 and 4).

**How it was run.** The e2e build (`npm run build -- --mode development`, `vite preview` on 4173, `dist` deleted first) against local Supabase, driven by throwaway Playwright specs in the phone (390x844, touch), tablet (820x1180, touch) and desktop (1440x900) projects, plus a 844x390 landscape phone and 320x568. The specs are not kept; 76 screenshots are in `docs/units/10-shots/` as `<size>-NN-name.png` (NN is the walk below). The player was watched through `window.__drumPalPlayer` (statuses recorded on every change). A pedal is Page Up / Page Down and the arrows sent by Playwright; a held key is repeated `keydown`s (`repeat: true`). Nothing was heard; Chromium only.

**Acceptance criteria**

| Criterion                                                    | Phone | Tablet | Desktop | What was seen                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ----- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every shortcut works in jam mode                             | Pass  | Pass   | Pass    | Space plays and pauses; ↑ ↑ ↓ gives 105%; M, D, S, C change their controls (S turns Mute drums off and back); `?` opens the list, `?` or Escape closes it. Shots 01, 02                                                                                                                                         |
| Every shortcut works in loop mode                            | Pass  | Pass   | Pass    | With a loop playing: speed keys, M, D, S, C act and the status recorder sees only `playing`. Shots 04, 05                                                                                                                                                                                                       |
| A pedal sending Page Up / Page Down or arrows switches loops | Pass  | Pass   | Pass    | Paused: Page Down from no loop walks Alpha (1–2), Delta (3), Charlie (9–10), then the finished Bravo (5–8), and stops there (a fifth press stays on Bravo). Playing: six Page Ups with nothing awaited land on Alpha; ten → ← pairs end on Alpha; playback never stopped. Shot 05-pedal-last-loop               |
| Ignored while typing in inputs                               | Pass  | Pass   | Pass    | Count-in and mode selects (letters, `?`), the loop's Speed % and BPM fields, the form's Name, First bar, Last bar and Target (letters, Space, arrows, Page Down): every key stayed in the field, no control changed, no overlay. The speed slider keeps its arrows (105%, 110%) and Space still plays. Shots 03 |

**QA focus and the cases asked for**

| Case                               | Result                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus traps, the overlay           | Focus goes to Close; Tab, Tab, Shift+Tab stay there. Clicking the dialog's heading drops focus to `<body>`, and Tab from there comes back to Close (Chromium searches from the click point), so it never reached the page behind. Escape, `?`, Close or a tap on the backdrop close it; focus goes back to the Shortcuts button (tablet, desktop) or wherever it was. Shots 01, 11                       |
| Overlay opened mid-play            | Playback carried on under it (`playing` only); ↑, M, D, S, C, Page Down and → did nothing while it was open; Space pressed Close; Space after Escape paused. Shot 01-overlay-mid-play                                                                                                                                                                                                                    |
| Overlay sizes                      | 320 px: no sideways overflow (issue 4 fixed the squeezed label); landscape phone: it scrolls inside (issue 2). The Shortcuts button and Close are 44 px tall. Hidden below 768 px, as designed                                                                                                                                                                                                           |
| Space on focused controls          | On Play: one toggle per press (no second press from keyup). On Metronome: plays, the metronome unchanged. On the Library nav link: plays, no navigation. Enter on Play presses it once. Shift+M and Alt+M do nothing                                                                                                                                                                                     |
| Held keys                          | Held ↑ ten repeats: 150%. Held Space: one toggle. Held D: one toggle. Held Page Up (no loops): one bar. Held → at bar 16: nothing                                                                                                                                                                                                                                                                        |
| Speed bounds                       | ↑ stops at 200% (240 BPM), ↓ at 25%; ↑ from 25% gives 30%. Shot 02                                                                                                                                                                                                                                                                                                                                       |
| Rapid presses                      | 20 Space presses 30 ms apart: 21 statuses, ends `playing`. Presses with no gap at all (a few ms, not humanly possible) can read `ready` twice before the engine reports `playing`, so two act as "play" and the count is off; at 60 ms spacing every press toggles. Not an issue. M ×7 is one toggle net; C ×4 cycles 0→1→2→0→1                                                                          |
| Keys during a count-in             | Page Down mid count-in moves to the next loop and counts in again on its first bar (snapshot `countingIn`, bar 12, `countIn.bar` 1); ↑ applies (105%); C to Off ends the count-in and plays at once; Space mid count-in cancels it (`ready`, never `playing`). "Before every repeat" with a pedal mid-loop: the new loop plays at once and counts in before its next pass, as "Play loop" does. Shots 04 |
| Loop form open                     | Focus goes to the form itself (no keyboard on the phone). → and Page Down do nothing; M still works. Escape doesn't close the form (not a shortcut; Cancel does). Cancel and save give focus to "New loop"; Edit then Cancel to that loop's Edit. Shot 06-form-open-focus                                                                                                                                |
| "Mark finished?" prompt and Space  | Space with nothing focused, and Space with the prompt's own "Mark finished" focused, both play/pause and leave the prompt up; the loop isn't finished. Enter on it finishes. Shot 06                                                                                                                                                                                                                     |
| Mark finished / Reopen focus moves | Home page: pass (next loop's button, the one before for the last, the Finished tab when it was alone; Reopen on the Finished tab likewise; offline too). Song page panel and prompt: **fail**, issue 1                                                                                                                                                                                                   |
| Jam mode with no loops             | → / ← / Page Up / Page Down step a bar; nothing before bar 1 or past 16; while playing, → → moves two bars on (3 to 5) without stopping. A bar stepped to off screen is scrolled to (bar 12 in the box at every size). Shots 08                                                                                                                                                                          |
| Song with no drum track            | D and S do nothing (the toggles stay disabled and off); M, Space and → work; the overlay still lists D and S. Shots 09                                                                                                                                                                                                                                                                                   |
| Slow network                       | Loops read held 6 s: "Loading loops…", → and Page Down do nothing (neither a loop nor a bar); once in, Page Down sets up the loop. Shot 10-pedal-while-loops-load                                                                                                                                                                                                                                        |
| Offline                            | Space, ↓, M, C, Page Up and `?` all work; "Mark finished" offline moves the loop at once (focus as issue 1). Shots 10                                                                                                                                                                                                                                                                                    |
| Leaving the song page              | On the library and settings pages no key does anything (no overlay, no page errors): the listener goes with the page                                                                                                                                                                                                                                                                                     |
| Arrow keys and page scroll         | ↓ on the song page never scrolls the window now (it is a speed key, its default cancelled), at every size; Page Up / Page Down likewise. Intended                                                                                                                                                                                                                                                        |

**Issues**

1. **Major: "Mark finished" and "Reopen" in the song page's loop panel (and the prompt's "Mark finished") leave focus on `<body>`.** Repro, any size: open a song with two loops, open the panel, focus a loop's "Mark finished" and press Enter (or click it). The loop moves to Finished and `document.activeElement` is `<body>`; Enter again does nothing. The same for "Reopen", and for the "Mark finished?" prompt. Cause: the button focus is handed to (the same loop's button in its new section) is rendered `disabled={status.isPending}` while the write is in flight, so `useFocusWhenReady` finds it on the first render, calls `focus()` on a disabled button, which does nothing, and drops its wait. With the PATCH held 2 s the button stays disabled for 2 s, and nothing focuses it once it enables. The component tests pass because the fake client answers before that render. The home page works because its target is the next loop's button, which isn't pending. Fix ideas: have the wait treat a disabled target as not ready yet (keep waiting until it enables, within `FOCUS_WAIT_MS`, and only if focus is still free), or keep the status button focusable while pending (`aria-disabled`, ignoring the press). Cover it in e2e, or in a component test that holds the write (`holdNext`): the bug only shows with a write still pending at the render that moves the loop.
2. **Cosmetic, not fixed: on a landscape phone (844x390) the overlay opens scrolled to its Close button**, so the title and first rows are above the dialog's fold (it scrolls). Focusing Close is right for the keyboard, and only a Bluetooth keyboard can open the overlay on a phone. Left for Unit 12 (line added).
3. **Cosmetic, fixed: alphaTab's bar and beat cursor drew over the shortcut overlay, the count-in number and the phone's loop sheet.** alphaTab gives its cursor layer `z-index: 1000` and the score box made no stacking context. Before the fix the yellow bar showed over the overlay's rows, over the count-in "1" and over the sheet's "Loops (0)" header. Present since Unit 07 for the counter; Unit 10's overlay made it obvious. Fix: `isolation: isolate` on `.jam-score` in `src/index.css`. The regenerated shots show the cursor under all three.
4. **Cosmetic, fixed: at 320 px the overlay's "Previous or next loop" label was squeezed to a word a line** by its four keys (`shrink-0`). The keys' box is now at most half the row and wraps, and a key's label doesn't break (`ShortcutOverlay.tsx`). Shot phone-11-overlay-320.
5. **Minor, seen once, not reproduced in 14 tries: on the tablet, a paused Page Up to a loop, then Space, counted in with the loop's bars outside the score box** (bars 10 to 16 on show for a loop of bars 5 to 8). It came right after the side panel closed (the score lays out again at a new width). Matches Unit 12's carried line on the box after a resize ("the picked bars or the paused loop can be outside the score box"); no new line.

**Human check items for Shane** (from the plan; agents can't do these)

- Unit 10: a real page-turner pedal (Page Up / Page Down, or arrows) on a laptop and on an iPad: switching loops playing and paused, and at the last loop.
- Safari: Space on a focused button must play/pause, not press the button; keys from a Bluetooth keyboard or pedal on iOS. Everything here ran on Chromium.
- The earlier rows of Open human checks are unchanged.

**Totals.** `npm run check`: 89 files, 3495 tests passed. `npm run e2e`: 331 passed, 14 skipped (the existing skips), 0 failed, built afresh (`dist` deleted, nothing on 4173).

## Build: QA fix round 1

### Summary

Fixes QA issue 1: "Mark finished" and "Reopen" in the song page's loop panel, and the "Mark finished?" prompt's button, left focus on `<body>`. Focus is handed to the same loop's status button in its other section, and that button was `disabled` while the write was on its way; `useFocusWhenReady` found it on the move's render, called `focus()` on a disabled button (which does nothing) and ended its wait. The status buttons are now locked with `aria-disabled` instead, so they stay focusable while pending; the press is refused by `setStatus`, which already sends nothing while another status write to the loop is pending (asked of the mutation cache at the press). Focus now lands on the loop's new button on the render that moves it, with the write still in flight, and stays there when the write lands.

### Files

- `src/features/loops/LoopStatusButton.tsx`: `aria-disabled={status.isPending || undefined}` in place of `disabled`.
- `src/features/loops/LoopPanel.tsx`: the same on the prompt's "Mark finished" (`FinishPrompt`), for one locking rule on every status control.
- `src/components/styles.ts`: `buttonBase` styles `aria-disabled` like `disabled` (dimmed, not-allowed cursor).
- `src/features/loops/LoopPanel.test.tsx`: two tests in "LoopPanel keeping focus (Unit 10)" that hold the write (`holdNext('update')`): the list's Mark finished, then Reopen, focus the loop's new button while it is still `aria-disabled`, Enter on it then sends nothing, and focus stays once the write lands; the prompt's Mark finished likewise. Both failed before the fix (focus on `<body>`). The existing "locks the button" assertions read `aria-disabled` instead of `toBeDisabled` / `toBeEnabled` (which would now pass on any button); "a press sends nothing" now clicks a live button, so it tests `setStatus`'s refusal rather than the browser skipping a disabled one.
- `src/features/practice/OnTheGoPage.test.tsx`: the same assertion change for the home page's locked Reopen.
- `tests/e2e/shortcuts.spec.ts`: "Mark finished and Reopen keep focus on the loop while the write is on its way" (3 projects). `page.route` holds each loops PATCH until the test lets it go; Enter on a focused Mark finished puts focus on Reopen while it is `aria-disabled`, it stays there when the write lands, and Enter there reopens it the same way. Failed on desktop with the fix reverted (`toBeFocused`).
- `AGENTS.md`: one sentence in "Keyboard shortcuts and focus": a control focus can be handed to while pending is `aria-disabled`, never `disabled`.

### Decisions

- **`aria-disabled` rather than having `useFocusWhenReady` wait for the button to enable.** Waiting would leave focus on `<body>` for the whole round trip (a Tab or key meanwhile starts from the top of the page), and would depend on something re-rendering the panel when the write settles; the status buttons read their state from the mutation cache, so the panel itself isn't guaranteed to. Keeping the button focusable gives focus its place at once and needs no change to the hook. The gate stays single: `setStatus` refuses, and `isPending` (the same cache, the same filter) only draws the lock.
- The home page uses the same `LoopStatusButton`, so its locked Reopen is `aria-disabled` too. Its focus target was already another loop's button; nothing else there changes.

### Async windows and inputs

- **A status write in flight, focus on the loop's new button (now possible).** Enter or a click on it: `setStatus` sees the pending write in the mutation cache and sends nothing, schedules no focus. Space: play/pause, as everywhere (the page's shortcut). A press on another loop's status button: that loop isn't locked and acts as before. The write lands: `aria-disabled` goes, focus stays. The write is refused: the optimistic move is undone, the loop's button moves back to its first section (a new element), focus falls to `<body>` and the error shows under the loop. Checked with a held, refused write; that is the known gap Build recorded, unchanged.

### Known gaps

- Unchanged from Build: a refused write leaves focus on `<body>`.

### Manual verify

1. Song with two loops; in devtools throttle to "Slow 3G" (or hold the loops PATCH). Focus a loop's "Mark finished", press Enter: focus is on its "Reopen" under Finished at once, dimmed; Enter there does nothing; once the write lands it is no longer dimmed and still focused. Reopen likewise.
2. Play a loop at its target, press the prompt's "Mark finished": focus is on the loop's "Reopen".

## Test: QA fix round 1

### Summary

Re-ran on the area changed by QA fix round 1: the status buttons (`LoopStatusButton`, the "Mark finished?" prompt's button) locked with `aria-disabled` instead of `disabled` while a status write to their loop is pending. A locked button can now be focused and pressed, so the lock rests on `setStatus`'s refusal alone. The tests below press locked buttons every way (click, Enter, Space) on the song page and the home page, cross the three controls of one loop, refuse a write while focus is on a locked button, and check that the lock still reads as disabled to assistive tech and still looks dimmed. Build's own tests (Enter on the focused locked Reopen, focus during the prompt's write, the e2e spec) were already there; these add only what they left out.

### Tests added

- `src/features/loops/LoopPanel.test.tsx`
  - "LoopPanel finishing a loop": **while the list's Reopen is on its way, the prompt's Mark finished is locked, and a press sends nothing.** A finished loop at its target is played and reopened with the write held. The prompt asks at once, its button is `aria-disabled`, and a click, Enter and Space on it send nothing and leave the prompt in place. Once the write lands, a press finishes the loop. This is the third pair of the three controls (list then prompt). Build's tests covered prompt then list, and list then list.
  - "LoopPanel keeping focus (Unit 10)": **Space on the locked Reopen sends nothing either.** No page shortcuts in this harness, so Space presses the button natively. It sends nothing, before or after the write lands.
  - Same describe: **a refused write unlocks the loop's button where it lands, and a press there sends again.** Enter on a focused Mark finished, held then refused. With focus on the locked Reopen, the refusal shows its alert under the loop, the loop's Mark finished is no longer locked, a press sends the second write, and focus follows to Reopen.
- `src/features/practice/OnTheGoPage.test.tsx`, "moves the loop at once and locks its button…": the locked Reopen is now also focused and pressed with Enter and Space, not only clicked. The home page has no shortcuts, so both are native presses.
- `src/features/song/SongPage.test.tsx`, "SongPage keyboard shortcuts": **Space on a loop's Reopen, focused while its write is on its way, pauses and sends nothing.** With a loop playing, Enter on Mark finished Late (held) puts focus on the locked Reopen. Space there is the page's play/pause (one `engine.pause`) and no press. Enter there sends nothing. Focus stays after the write lands.
- `tests/e2e/shortcuts.spec.ts`, "Mark finished and Reopen keep focus…", extended: while pending, the focused Reopen is `toBeDisabled()` (Playwright reads `aria-disabled`, as assistive tech does) and has opacity 0.5 (the `aria-disabled:` variants in `buttonBase` are generated and applied). Enter on it then sends nothing: a second PATCH would also be held, and the next `releaseWrite` would count two. After the write lands it is enabled, opacity 1, still focused.

### Each new test fails without the code it covers

- `setStatus`'s pending check disabled (`isMutating(filters) > 99`): 6 component tests fail, all 4 new or extended ones among them (LoopPanel ×4, home page, song page), and the e2e spec fails on desktop.
- `aria-disabled:` classes removed from `buttonBase`: the e2e spec fails on `toHaveCSS('opacity', '0.5')`.
- Build's tests already fail with `disabled` put back (focus on `<body>`).

### Checked, no test added

- Elsewhere, nothing relied on the status buttons being `disabled`. No e2e spec asserts `toBeDisabled` on Mark finished or Reopen, and the component tests that did were switched to `aria-disabled` by Build. Testing Library's `toBeDisabled` ignores `aria-disabled`, so a component test must read the attribute. Playwright's counts it.
- Space on a focused locked button on the song page is the page's play/pause (`shortcuts.ts` resolves Space on a button as `togglePlay` and prevents the default), so it never presses the button. The new song page test proves it for a locked button.
- The prompt's `onFinished` (the focus hand-over) is skipped on a refused press. Running it anyway changes nothing a test can see: it schedules focus on a Reopen that only appears after a later press that schedules the same thing. Not tested, and noted here so it isn't read as covered.

### Bugs found

None.

### Totals

`npm run check`: 89 files, 3501 tests passed. `npm run e2e`: 334 passed, 14 skipped (the existing skips), 0 failed, built afresh (`dist` deleted, nothing on 4173).

## QA: fix round 1

**Verdict: PASS. Issue 1 is fixed** at all three sizes; no new issue found, no blocker or major left.

**How it was run.** The e2e build (`dist` deleted first, nothing on 4173) against local Supabase, driven by a throwaway Playwright spec in the phone (390x844, touch), tablet (820x1180, touch) and desktop (1440x900) projects; the spec is not kept. A pending write is a loops PATCH held by `page.route` until let go, or Chromium's network throttled through CDP (2.5 s latency, 50 kB/s), or the context offline. PATCHes were counted from the page's `request` events. 36 screenshots are in `docs/units/10-shots/` as `fix1-<size>-NN-name.png`. Chromium only.

| Case                                                         | Phone            | Tablet           | Desktop          | What was seen                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------ | ---------------- | ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue 1 repro: two loops, focus "Mark finished Verse", Enter | Pass             | Pass             | Pass             | Focus is on "Reopen Verse" under Finished at once, with the PATCH still held; it is `aria-disabled`, opacity 0.5, `cursor: not-allowed`, and shows the focus ring. Released: the lock goes, focus stays. Enter there reopens it and focus is on "Mark finished Verse", the same way. Unheld, a click on "Mark finished Chorus" puts focus on "Reopen Chorus". Shots 01, 02, 03 |
| Presses on the locked button                                 | Pass             | Pass             | Pass             | Enter, a mouse click and (phone, tablet) a tap on the locked Reopen sent nothing: one PATCH in all. Space on it is play/pause (Pause, then Play) and focus stays on it                                                                                                                                                                                                         |
| The prompt's "Mark finished"                                 | Pass             | Pass             | Pass             | A loop at its target (100%, target 100%): Enter on the prompt's button, held, puts focus on the loop's Reopen at once, locked; Enter there sends nothing. Then Reopen, held: the prompt comes back with its button `aria-disabled`, and a click and Enter on it send nothing; once the reopen lands, two PATCHes in all and the loop is active. Shots 04, 05, 06               |
| Slow network (throttled)                                     | Pass             | Pass             | Pass             | Click on Mark finished: focus on the locked Reopen; a click and Enter on it meanwhile sent nothing; after about 3 s the lock goes, focus stays, one PATCH. Space with it focused still plays and pauses. Shot 09                                                                                                                                                               |
| Refused write (403, `42501`)                                 | Pass (known gap) | Pass (known gap) | Pass (known gap) | Focus moves to the locked Reopen; on the refusal the loop moves back, the alert shows under it, its Mark finished is not locked, and focus is on `<body>`: Build's known gap, already carried to Unit 13. A press then sends again and focus follows to Reopen. Shot 07                                                                                                        |
| Offline                                                      | Pass             | Pass             | Pass             | Enter on Mark finished: the loop moves, focus is on the locked Reopen, no request leaves. Enter, click and Space (play/pause) on it send nothing. Back online: one PATCH, the lock goes, focus stays, the loop is finished in the database. Shot 08                                                                                                                            |
| Home page Mark finished / Reopen                             | Pass             | Pass             | Pass             | Enter on "Mark finished Verse" (held): focus on "Mark finished Chorus" (the next loop). On the Finished tab meanwhile, "Reopen Verse" is locked and dimmed; click, Enter and Space on it send nothing. Released, a press reopens it and, the tab now empty, focus goes to the "On the go (2)" tab. Shots 10, 11, 12                                                            |

**Issues.** None new. The hover colour (`hover:bg-neutral-700`) still applies to a locked button under a mouse, as it did to a `disabled` one before; not an issue.

**Human check items for Shane** (unchanged): a real page-turner pedal on a laptop and an iPad; Safari, where Space on a focused button (a locked status button included) must play/pause and not press it; VoiceOver reading a locked status button as dimmed/unavailable.

**Totals.** `npm run check`: 89 files, 3501 tests passed. `npm run e2e`: 334 passed, 14 skipped (the existing skips), 0 failed, built afresh (`dist` deleted, nothing on 4173).

## Readability

### Summary

No behaviour change. The unit's code was already in the right places (pure rules in `shortcuts.ts`, gates in `controlGates.ts`, focus finders in `loopFocus.ts`), so the work went into splitting one function, naming, one dead export, and the tests, which had grown stage by stage.

### Changes

- `src/features/song/useSongShortcuts.ts`: the bar step for a song with no loops is its own function, `stepBar`, out of `stepLoopOrBar`. `stepLoopOrBar` takes the snapshot `runShortcut` already read at the press, rather than reading it a second time (the same moment, nothing runs between). The unused `SongShortcuts` type export is gone.
- `src/features/player/PlayerControls.tsx`: `noPlayer` / `noDrumToggles` are `optionsDisabled` / `drumTogglesDisabled`, after the gates they negate.
- `src/features/loops/loopForm.ts`: the column picks `sortLoops`, `loopsByStatus` and `loopsInPanelOrder` constrain on are named once (`SortableLoop`, `ListedLoop`) instead of written out three times.
- `src/features/practice/OnTheGoPage.tsx`: a comment on why the focus finder returns null while the loop is still listed.
- `src/test/locked.ts` (new): `expectLocked` / `expectUnlocked` for a control locked with `aria-disabled`. The 21 assertions in `LoopPanel.test.tsx`, `OnTheGoPage.test.tsx` and `SongPage.test.tsx` use them, which also says in one place why `toBeDisabled` isn't used.
- `src/features/song/useSongShortcuts.test.tsx`: the "Unit 10 Test: interleavings, gates and round trips" describe is gone; each of its cases is in the describe of its subject (Space, speed, drums, switching loops, the overlay), per AGENTS.md's rule for a later stage's cases. The two harnesses written out by hand (loops still being read, StrictMode) are `renderShortcuts` options (`loopsPending`, `strict`). The view has `keyDown` / `keyUp` beside `key` and `helpOpen()`, replacing a local `keyUp` and the bare `act(() => fireEvent.keyDown(...))` calls; `focused(tag)` replaces three hand-built focused elements. The two-presses-in-one-`act` speed test and the StrictMode test keep their single `act`, since that is what they test.
- `src/features/song/SongPage.test.tsx`: "keyboard shortcuts" `openSong(loops, { song })` covers the no-drum-track test too; its view has `playLoop(name)` (click and alphaTab's "playing"), and `toggle` / `pressed(name)` read the controls bar's toggles, replacing eight multi-line `aria-pressed` assertions.
- Test names lose their "(Unit 10)" / "(Unit 10 Test)" tags; no earlier unit's tests carry one.
- `tests/e2e/playerPage.ts`: `metronomeButton` joins the other toggles' locators. `tests/e2e/shortcuts.spec.ts`: `pressMAndSeeMetronomeFlip(page)` replaces the three-line read, press and compare written out three times.
- `AGENTS.md`: the Unit 10 tests bullet names the new view helpers, `expectLocked` / `expectUnlocked`, and `metronomeButton`.

### Left as is

- `findTabButton` stays in `OnTheGoPage.tsx`: only the home page has tabs to focus, and `loopFocus.ts` is about loops' controls.
- The `speed` locator (`jam-speed`) is defined in four specs; it predates this unit and moving it is outside its scope.
- Specs press "Exit loop" two ways (`activeLoopLine(page)…` in older specs, `page.getByRole` here); both find the one button.

### Totals

`npm run check`: 89 files, 3501 tests passed, before and after. `npm run e2e`: 334 passed, 14 skipped (the existing skips), 0 failed, before and after, each built afresh (`dist` deleted, nothing on 4173).

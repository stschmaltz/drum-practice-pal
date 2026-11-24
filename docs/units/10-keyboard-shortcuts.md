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

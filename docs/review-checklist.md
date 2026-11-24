# Review checklist

The defects outside reviewers (Copilot) keep finding after our five stages pass. Build designs against it, Test writes a test per applicable row, Review walks every row against the diff. Each row names the miss that taught it.

When an outside review finds something this list doesn't cover, add a row for the general class, not the specific bug (see `.claude/commands/unit.md`, step 8).

## How to apply it

Don't read the diff top to bottom against the list. First list the stateful pieces the unit added or changed: hooks, services, components with handlers, engine listeners, mutations, migrations. Then take each piece through every row that applies. A row that applies with no test proving it is a finding.

## 1. Interleavings: what else can happen while this is in flight?

For every async window (a pending mutation, a load, a count-in, a hand-over between "told to play" and "playing"), list every user input and every event that can arrive during it, and decide what each one does.

- **Input during a pending write.** A form locks its fields while saving, but other inputs that feed the same draft keep writing to it. _08: score taps changed the loop form's range while its save was pending; success then closed the form and discarded the new pick._ Any state the write reads has one owner of the "saving" flag, and every writer checks it.
- **Two writes to one item.** A response from an older write must not overwrite a newer optimistic value. _08: a "Save speed" response put the old bars back over a pending range edit._ While another write to the item is pending, a response applies only the fields its own request sent.
- **Late events after a user's halt.** Events already on their way (from a worker, a timer, the network) arrive after pause, stop, unmount or a seek. _07: `pause()` then a late `finished` restarted the count-in._ A user's halt is latched until the next explicit start, and every event handler that starts or moves something checks it.
- **Hand-overs.** Between "told the engine to do X" and "the engine reports X", every cancel path must undo X too. _07: `setRange()` in that gap left playback running under a `ready` snapshot._
- **Done once, on cached data.** Something a page does once (open the item a link names, pick a default) that reads a query's `data` runs against whatever was cached before the page opened, and its "handled" latch then ignores the fresh list. _09: `?loop=<id>` was settled against a loops list cached from an earlier visit, so a loop saved on another device never opened and an edited one opened at its old speed._ Latch only on a read made since mount (`isFetchedAfterMount`), or on one that failed or is paused; and say what a late answer does if the user has acted meanwhile.
- **Effects run twice.** StrictMode mounts, cleans up and mounts again; lazy factories can both resolve. _05: two alphaTab APIs on one element; destroying the first cleared the second._ Anything an effect creates is owned by that run and is checked as current after every `await`.

## 2. Gates: does the control agree with the action?

- **Enabled when the action would refuse.** A button's `disabled` condition must be the action's own precondition, from one exported predicate, never a separate proxy for it. _08: "Play loop" was enabled on `barCount` while the player was still `loading`, so a press did nothing and also closed the sheet._ Search for every caller of the action and check that each one uses the same predicate (`isLoaded`, `isRunning`, `isValidBarRange`).
- **Side effects of a refused action.** If the action can refuse, nothing else the handler does (closing a panel, clearing a draft, moving focus) runs when it does.

## 3. Gestures and event sequences: judge the whole path, not the endpoints

- **A path that returns to its start.** Drag-or-tap decided by comparing the end point with the start misses a drag that came back. _08: the drag emitted both `barsDragged` and `barTapped`._ Keep state for the whole press (did it ever leave the slop?) and carry it to the trailing `click`.
- **Points outside the visible area.** Hit-testing a window-level move against the full surface picks things the user can't see (clipped by a scroll box, under a sticky bar). _08: a drag past the score box picked hidden bars._ Reject points outside the visible client rectangle.
- **Where a click lands.** A `click` goes to the nearest element that both the press and the release were on. _10: selecting text in the shortcut list and letting go past its edge clicked the backdrop, which closed it._ A "click outside" handler checks where the press began, not only the click's target.
- **The other half never comes.** A flag set on one event and cleared by its pair (keydown and keyup, pointerdown and pointerup) stays set when the pair goes to another window or is cancelled. _10: a Space held while switching windows left "cancel the next Space keyup" set, so a later Space on the list's Close didn't press it._ Reset the flag at the start of each new first half, and say what a lost second half leaves behind.
- **Every event a gesture produces.** Write down the full sequence the browser fires (`pointerdown`, `pointermove`s, `pointerup`, `click`, touch vs mouse, pan cancels) and say what each does.

## 4. Round trips: does a value survive display, edit and save unchanged?

- **Rounded for display, written back rounded.** A value shown rounded, parsed back and diffed against the saved one changes data the user never touched. _08: a target of 0.855556 shown as 86% was saved back as 0.86 on a rename._ Diff on the displayed value (or the touched-fields draft) and send the stored value untouched.
- **Display rounding vs storage.** Store the exact value the user's input implies; round only for display (AGENTS.md, speed ratios).

## 5. Validated paths: is there a way around the check?

- **A second entry point that skips validation.** _05: downloaded bytes went straight to `api.load`, bypassing the Guitar Pro-only `parseScore`, so a damaged file became a one-bar alphaTex score._ Every input that a check exists for reaches the code only through that check.
- **Containment that depends on where focus is.** A trap or guard attached to the element it protects only hears events from inside it, and focus can be outside without the user leaving: a click on non-focusable text puts it on `<body>`. _10: the shortcut list kept Tab on Close with a listener on the dialog; after a click on its heading Shift+Tab went to a control behind the open overlay, which could then be pressed._ Make what is behind `inert` (or use a native modal), handle the key at the document, and test from focus on `<body>`.
- **Accessibility claims.** A wrapper class doesn't change the target size of the control inside it. _05: `min-h-11` on a wrapper left the range inputs short._ Measure the control itself.

## 6. Hygiene (Review already catches these; keep checking)

Unchecked `{ data, error }` (test setup included: _09: cascade tests whose unchecked setup insert could have been refused would pass on the empty table_), one-page list reads, multi-step work that continues after a failed step, test teardown that swallows failures, listeners, timers and DOM left after `destroy()`, 1-based vs 0-based bars, anything that breaks AGENTS.md.

## Design rules that prevent these

- One exported predicate per precondition, used by the action, its button and its keyboard shortcut.
- One owner per piece of shared state; writers go through it and respect its locks.
- Gesture and timing logic in pure modules that take the full event sequence, so tests can feed whole paths.
- Mutations of one item know about each other (shared `mutationKey`, field-scoped reconciliation), so a second control writing the same row is safe by default rather than by audit.
- Every async step re-checks that it is still current (generation counter, halt latch, disposed flag) before it acts.

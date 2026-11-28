# Unit 19: The tab follows the video

## Build

### Summary

- **Lining up, once per link.** Under a YouTube recording on the play screen there is now a line-up: "Line the tab up: when bar 1 starts, press" and one button, "Bar 1 starts now", on while the video plays. The press saves the video's time at that moment as the link's `bar_one_seconds`. From then on the same two rows hold "Tab earlier" and "Tab later" (a quarter of a second each, saved), bar 1's place in the video ("Bar 1 at 0:07.25. Drifting? Nudge the tab."), "Line up again" and a Follow toggle. The rows keep their height in every state, so nothing under them moves.
- **Following.** A lined-up video marks the bar it is on with the loops' highlight and, with Follow on (the default), keeps that bar on show: the score box first, then the window, since a phone's read-along score scrolls with the page under the sticky video. It reads the video's own clock, so a pause, a seek in YouTube's controls, buffering and YouTube's speed all just work. Nothing is marked before the video's first play, before bar 1, or after the tab's last bar. The orange cursor stays hidden and the tab's own player is never played or moved.
- **A tap on a bar** moves a lined-up video to that bar's start (for a repeated bar, the playthrough nearest where the video is). **Space** plays and pauses the video once its player has answered. Before the video has been tapped once neither can act, and the line says "Press Play on the video once. After that, Space and a tap on a bar work it."
- **A link that isn't lined up, a Spotify link, a song with no links:** exactly Unit 14, plus the prompt under a YouTube video.
- **Behind an interface.** `RecordingPlayer` (`recordingPlayer.ts`), with `youTubePlayer.ts` the only module that talks to YouTube's IFrame Player API and `FakeRecordingPlayer` for every test. Unit 15 builds on it.

### What was checked about YouTube's player, and how

From the IFrame Player API reference (developers.google.com/youtube/iframe_api_reference) and the player parameters page (developers.google.com/youtube/player_parameters), both read on 2026-11-27, and then a real video on the dev server (below).

| Question                                 | What the reference says                                                                                                                                                                                                                        | What the real video showed                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How is the API loaded?                   | A script, `https://www.youtube.com/iframe_api`, which calls `window.onYouTubeIframeAPIReady`. Driving the player by `postMessage` directly is not documented ("the user's browser must support the HTML5 postMessage feature" is all it says). | Two requests to `www.youtube.com` (the script and the widget code it loads), none before the frame was drawn.                                                    |
| Can it take over a frame the page made?  | Yes: `new YT.Player(iframe, { events })`, the frame's address carrying `enablejsapi=1`; width, height and video id aren't needed then.                                                                                                         | Yes.                                                                                                                                                             |
| `youtube-nocookie.com`?                  | Not mentioned on either page; no `host` option is documented.                                                                                                                                                                                  | Works: the frame stayed on `www.youtube-nocookie.com` with `enablejsapi=1&origin=http://localhost:5283`, and the app heard ready, playing, paused and the clock. |
| `origin`                                 | "As an extra security measure, you should also include the origin parameter", the page's scheme and full domain; optional, protects against other scripts driving the player.                                                                  | Sent as the page's own origin (`window.location.origin`, built into the address in `youTubeEmbedUrl`, the one place).                                            |
| Reading time                             | `getCurrentTime()`, seconds. There is no time event: it has to be polled.                                                                                                                                                                      | Polled every 250 ms while playing; the marked bar moved 1, 2, 3, 4 at two-second steps of wall time on a 120 BPM tab.                                            |
| Rate                                     | `getPlaybackRate()`, `onPlaybackRateChange` (data: the new rate). The clock is in the video's own seconds.                                                                                                                                     | Not exercised on the real video; the stub and the fake cover it.                                                                                                 |
| State                                    | `onStateChange`: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.                                                                                                                                                              | "Bar 1 starts now" came on within the first poll of the tap on the video.                                                                                        |
| `seekTo(seconds, allowSeekAhead)`        | "If the player is paused when the function is called, it will remain paused."                                                                                                                                                                  | A tap on the bar after the marked one, while paused, moved the mark to it and the video stayed paused.                                                           |
| `playVideo` / `pauseVideo` from the page | Documented; `onAutoplayBlocked` exists for a play the browser refuses.                                                                                                                                                                         | Space paused and played the real video after one tap on it, with no `autoplay` in the frame's `allow`. Before the tap the app doesn't try (it says to tap).      |
| `destroy()`                              | "Removes the `<iframe>` containing the player."                                                                                                                                                                                                | Never called: the frame is React's.                                                                                                                              |
| Errors                                   | `onError`: 2, 5, 100, 101 and 150 (embedding refused), 153 (no Referer).                                                                                                                                                                       | Not seen. Any error is "unavailable" to the app; the frame itself says why.                                                                                      |
| Adverts                                  | Nothing on either page: no ad state, no ad event.                                                                                                                                                                                              | None turned up.                                                                                                                                                  |
| Minimum size                             | 200 by 200 px.                                                                                                                                                                                                                                 | Unchanged from Unit 14.                                                                                                                                          |

What follows from it:

- **The documented API is used**, not `postMessage` alone, as the brief preferred. The cost is one request to `www.youtube.com` (YouTube's cookie host) per page that opens a recording, where Unit 14 asked only `youtube-nocookie.com`. It is asked for when the video's frame is mounted and at no other time (`tests/unit/thirdPartyRequests.test.ts`, `youTubePlayer.test.ts` and the e2e recorder each prove it). Carried forward for Shane as a choice.
- **Adverts:** since the API says nothing, the rule is the clock's own: nothing is marked until the video has reported "playing" once (`started`), which covers an advert before the video. One in the middle of a video can't be told apart; whether the clock stands still through it is unverified.
- **The first play is a tap on the video.** The app never calls `playVideo()` on a video that hasn't played, and says what to do.

### The real video

Dev server on port 5283 against the 54421 stack, "Dev: sign in" as a throwaway address, `groove-120.gp` uploaded, `https://www.youtube.com/watch?v=jNQXAC9IVRw` saved as the Original, headless Chromium at 1280 x 900 driven by Playwright:

- No request to any YouTube or Google host on the Songs list or the song's overview with the link saved.
- The frame's address: `https://www.youtube-nocookie.com/embed/jNQXAC9IVRw?playsinline=1&rel=0&enablejsapi=1&origin=http%3A%2F%2Flocalhost%3A5283`.
- Space before the tap: the "Press Play on the video once" line, nothing played.
- A click on the video: the app heard it playing. "Bar 1 starts now" 1.5 s later saved 1.68 s ("Bar 1 at 0:01.68").
- The marked bar, sampled every half second: 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4. It advances with the video's clock, a bar every two seconds.
- Space paused it (the mark stayed on bar 5 for 2.5 s), "Tab later" saved 1.93 s, a click one bar to the right moved the mark to bar 6, Space played it on (bar 7 two and a half seconds later).
- Screenshots: `docs/units/19-shots/real-video-1-lined-up.png`, `real-video-2-following.png`.
- The server was stopped and the throwaway user deleted, files first (id `7be5ffc9-0d1f-46b5-959e-25f1310736c8`).

Chromium only, with a mouse, and nobody listening: whether the marked bar is the bar heard is for the kit.

### Product walk-through (docs/product.md)

Walked before writing code. The unit fails none of these users, forces no order and adds no chore, so it was built.

- _Day one with a song (uploaded today, a YouTube link just pasted):_ Songs, the song, "Original" (2 taps), Play on the video (3). The video plays exactly as in Unit 14 and the line under it offers the line-up without asking for it. "Bar 1 starts now" as the song comes in (4) and the tab follows. Skipped, nothing is lost and nothing nags.
- _Missing a piece the unit assumes:_
  - _No link, or only a Spotify or other link:_ no video box, so no line-up. Nothing new on the screen.
  - _A video whose player can't be reached_ (the script blocked, embedding refused): the video box is Unit 14's, and the line says "The tab can't follow this video: its player isn't answering here." with the button off.
  - _A tab that doesn't match the recording_ (a different arrangement, an intro the tab lacks): bar 1 is wherever the drummer says it is; before it nothing is marked, after the tab's end nothing is marked. A tab at another tempo drifts, which the line says and the nudges take up.
  - _No loops, no drum track:_ nothing here reads them. A loop left set up on the tab keeps its mark until the video is followed, and has it back on Tab.
  - _A tab whose sounds failed to load:_ the bar is marked; it is not scrolled to (see Known gaps).
- _Offline at the jam space:_ no video, so nothing to follow; the line-up's place says "You're offline. Lining the tab up needs a connection." and the tab reads as before.
- _Every later time, any device:_ Play on the video. The line-up is the link's, so a phone follows what the laptop lined up.
- _Taps:_ first time on a link, 1 ("Bar 1 starts now"). Later, 0. The tab running ahead, 1 per quarter second. A hard fill, 1 (tap the bar).
- _Chores:_ the line-up is the one thing the app can't see for itself (where bar 1 falls in a recording), asked once per link and never required.

### Files touched

New:

- `supabase/migrations/20261201000000_song_link_bar_one.sql`
- `src/features/recordings/`: `recordingPlayer.ts`, `youTubePlayer.ts` (+ test), `useRecordingPlayer.ts`, `videoSync.ts` (+ test), `useSaveBarOne.ts`, `LineUp.tsx`, `lineUpCopy.ts`
- `src/features/song/`: `useVideoFollow.ts` (+ test), `followScroll.ts` (+ test)
- `src/components/ToggleMark.tsx` (moved out of `PlayerControls.tsx`), `src/lib/announcement.ts` (moved out of `useSongShortcuts.ts`)
- `src/test/fakeRecordingPlayer.ts`
- `tests/unit/video-sync-fixtures.test.ts`
- `docs/units/19-shots/`, this note

Changed:

- `src/features/recordings/`: `songLinks.ts` (`youTubeEmbedUrl(link, pageOrigin)`, `SongLink.barOneSeconds`), `songLinkForm.ts` (the column, the grants' lists, `applyLinkSave` clears a moved link's line-up), `songLinksApi.ts` (`saveBarOne`), `songLinkKeys.ts` (`lineUpsOf`), `useSongLinks.ts` (holds its refetches while a line-up is pending), `RecordingBox.tsx` (`frameRef`, `children`)
- `src/features/song/`: `SongPage.tsx` (the recording session, the line-up in the bar), `useSongSources.ts` (the page's origin), `useSongShortcuts.ts` (`recordingSpace`), `playerScreen.tsx` (`ScoreBox tappable`)
- `src/features/player/`: `barTicks.ts` (`BarTicks.tempoChanges`), `playerEngine.ts` and `alphaTabEngine.ts` (`barRectInWindow`, tempo changes with `ticksReady`), `PlayerService.ts` (`playedBars()`, `barRectInWindow()`), `PlayerControls.tsx`
- `src/features/loops/useLoopPractice.ts` (`mark`), `src/features/shell/AppShell.tsx` (`data-bottom-tabs`), `src/index.css` (`score-tappable`), `src/lib/schema.ts` (`BAR_ONE_SECONDS_MAX`), `src/lib/database.types.ts`
- Tests: `SongPage.test.tsx`, `songLinkForm.test.ts`, `songLinks.test.ts`, `schema.test.ts`, `src/test/linkTable.ts`, `src/test/fakePlayerEngine.ts`, `tests/unit/thirdPartyRequests.test.ts`, `tests/unit/score-helpers.ts`, `tests/db/song-links.test.ts`, `tests/e2e/recordings.spec.ts`, `tests/e2e/recordingsPage.ts`, `tests/e2e/design.spec.ts`
- Docs: `AGENTS.md`, `docs/plan.md` (the nudges' names, Carried forward), `docs/release.md`

### Decisions

- **The documented API, loaded from `www.youtube.com`.** See above. The frame is still made in the one place and stays on the no-cookie host; the API's parameters are added in `youTubeEmbedUrl`, the one place the address is built, and only for a plain http(s) origin.
- **Bar times come from alphaTab's own tick data, not from tempos and meters.** The engine now sends each played bar's tempo changes (`MasterBarTickLookup.tempoChanges`, which always starts with the tempo at the bar's first tick), and `barTimesInPlayOrder` turns ticks into seconds as alphaTab does (960 ticks a quarter). A bar's length in ticks already carries its meter, a repeat is two entries, and a tempo change part-way through a bar is exact, which `barStartTempos` can't give. `player.tempoAtBar` is only the fallback for bars with no tempo data (the fake engine's). `tests/unit/video-sync-fixtures.test.ts` checks it on the tempo-change, 3/4 and repeats fixtures.
- **The nudges are "Tab earlier" and "Tab later",** not the plan's "Tab early / Tab late". "Tab late" can be read as a report (the tab is late) or as an order (make it later), and the two mean opposite presses; the plan's own walk-through ("the tab runs ahead: Tab late twice") means the order. `docs/plan.md` now says the same. Shane may prefer other words.
- **"Shown as a signed offset" became bar 1's place in the video** ("Bar 1 at 0:07.25"). Only `bar_one_seconds` is saved, so an offset since the press would have nothing to be measured from on another device or after a reload. The column is 0 to 43200 as the plan says, so "Tab earlier" stops at the video's start; the maths takes a negative value anyway.
- **Stored to the millisecond,** nudged on the stored value, shown to the hundredth.
- **The database clears a line-up when the link is pointed at another address** (`song_links_before_write`), unless the same write sets one. It belongs to the video it was made on, and the build before this one, which doesn't know the column, changes links too. A change of only the start time (`&t=`) clears it as well: lining up again is one tap.
- **`useLoopPractice` takes a `mark`** and stays the one caller of `setHighlight`, instead of a second hook writing the highlight beside it.
- **Follow scrolls at once, never animated,** and puts a bar that has left the view at its top, so the page turns as seldom as it can and the lines ahead are on show. A bar on show never moves the page.
- **One `YT.Player` per frame element.** StrictMode mounts the frame's ref twice; a second `new YT.Player` on a frame the API already knows is not documented to work, so the wrapper is shared and its events go to the current one.
- **Space goes through `useSongShortcuts`** (`recordingSpace`), so it has the same input guard and the same keyup handling as every shortcut, and every other key is still left to the browser on a recording.
- **Online only, all four parts:** `networkMode: 'always'`, the controls `aria-disabled` offline, the handlers asking `isOnline()`, and an `OfflineNote` in the line's place.
- **WCAG 2.2.2 (content that moves by itself for more than five seconds):** the Follow toggle is the control that stops it, beside it; pausing the video stops it too; nothing is animated.
- **Not built:** a beat line, a second sync point, a tap that lines up instead of seeking (the plan's three open questions keep their defaults).

### Async windows and inputs

- **YouTube's script loading** (`loadYouTubeApi`, once per page):
  - _The frame leaves_ (source switched, offline, the screen left): the wrapper is disposed; when the script arrives nothing is wrapped (`frame.isConnected`).
  - _A second frame asks meanwhile:_ it waits on the same promise.
  - _The script fails:_ every waiting frame is "unavailable"; the promise is forgotten, so the next frame asks again.
  - _StrictMode's second mount:_ same frame element, same widget, the second wrapper takes over the events.
- **Between the frame mounting and the player's "ready":** `getState()` is "loading"; "Bar 1 starts now" is off; Space is the browser's; a tap on a bar does nothing; the offline note takes the line if the connection goes.
- **Ready, not yet tapped:** Space and a tap on a bar say "Press Play on the video once"; nothing is sent to the player; nothing is marked.
- **The poll** (250 ms, only while playing with the page visible):
  - _Pause, buffering, the end:_ the interval is cleared at the state change.
  - _The page hidden:_ cleared; on return the clock is read once and the poll resumes.
  - _Dispose:_ cleared; the widget's events go nowhere (`sink` null, and the handler checks `disposed`).
- **A line-up or nudge on its way** (`useSaveBarOne`, optimistic):
  - _Another nudge:_ reads the cache at the press, so it moves the first's value; it is sent after the first has answered (`scope`); the first's answer isn't drawn while the second waits; the server ends on the second.
  - _The first fails, the second lands:_ the second's value stays.
  - _Both fail:_ back to what the server is known to hold, not the first's guess.
  - _The video plays on:_ the saved time is the press's; the mark follows the optimistic value at once.
  - _The window comes to the front, the connection returns, another screen mounts the links:_ their refetch waits; a read already on its way was cancelled; one read follows the last save.
  - _"Line up again", Cancel, Follow:_ local state, no interaction with the save.
  - _The source is switched or the screen left:_ the mutation carries on in the cache and corrects it; its message is lost with the line (see Known gaps).
  - _The connection goes:_ the save fails (`networkMode: 'always'`), rolls back and says so once the line is back.
  - _The link removed on another device:_ the update finds no row, says "It has been deleted…", and the read that follows puts the screen on Tab.
- **The links read again while following:**
  - _The link gone:_ the screen goes to Tab (Unit 14), the frame unmounts, the player is disposed, the mark is cleared, and a late clock reading reaches no listener.
  - _The link's address changed:_ a new frame and player; the line-up is gone with it.
  - _Lined up on another device:_ following starts on the same frame.
- **The tab's player still loading while the video plays:** no bar times yet, so no mark; when its status leaves "loading" the video is placed at once. A bar asked for before the notation has rendered is kept by `showBar` for `rendered`.
- **A seek sent to the video:** shown at once from the target; the player's next state change or poll corrects it (YouTube lands a little early on a real video). A seek while buffering is sent all the same.
- **Space held down:** key repeat is taken (no page scroll) and toggles once.

### Known gaps

- **"Bar 1 starts now" takes the clock as the API reads it at the press.** A real player reports its clock in steps, and a person presses late. Both are a fraction of a second and one "Tab earlier" takes them up; no reaction time is subtracted.
- **Scrolling needs the tab's sounds.** `showBar` waits for the player to be ready, so on a song whose soundfont failed the bar is marked but not brought on show.
- **A save that outlives the line** (the source switched or the screen left mid-save) fails silently: the cache is corrected, the message isn't shown. The line is one press from the result in the usual case.
- **Focus after a refused nudge** stays on the nudge. After a refused first line-up it goes back to "Bar 1 starts now" with the prompt.
- **An advert inside a video** isn't told apart; unverified whether the clock stands still through one.
- **Any player error is "unavailable"** for that frame, a passing one included; switching source and back makes a new frame.
- **The window follow measures a phone's tab bar by `[data-bottom-tabs]`** and the sticky bar by its bottom edge. On a phone in portrait the bar (video, way out, line-up) takes roughly half the window (not measured in this stage), which leaves a few lines of score; whether that is enough to read from is the human check. QA should look at 320 px and a phone on its side.
- **`play()` before the first tap is never tried,** even where a browser would allow it.
- **Per bar only,** as designed.
- **Under StrictMode the page tests can't see the engine** (the file's `vi.mock` of `alphaTabEngine` gives the second mount the real module); the follow hooks are tested under StrictMode on their own.

### Manual verify

Local stack and `npm run dev`, a song with a tab and a YouTube Original:

1. Song, "Original". Under the video: the prompt, its button off. No bar marked. Nothing else differs from before.
2. Press Space: "Press Play on the video once…". Click the video. The button comes on.
3. As bar 1 comes in, "Bar 1 starts now". The line becomes "Bar 1 at …", with the nudges, "Line up again" (focused) and Follow (on); the score doesn't move. A bar is marked with the dashed loop highlight and moves on with the song; the page follows it.
4. Pause in YouTube's controls: the mark stays. Drag YouTube's scrubber: the mark goes there. Set YouTube's speed to 0.5: the mark slows with it.
5. Tap a bar: the video jumps to it. Space: pause, play.
6. "Tab later" twice: the place of bar 1 moves by half a second, and the mark with it. Reload: it is still there.
7. Follow off: the mark moves, the page doesn't. On: it comes back to the bar.
8. Another browser, same account: Play on the video is all it takes.
9. Switch to Tab: the tab's controls and cursor are back, nothing marked (or the loop that was).
10. Offline (DevTools): the video gives way to its note, the line-up says it needs a connection.
11. In the recordings form, point the Original at another video: on the play screen the prompt is back.

### Tests

- `videoSync.test.ts` (65): the tables. Tempo changes at a bar line and inside a bar, a change of meter, repeats, unusable tempos, before bar 1, past the end, a negative offset, rates of 0.25 to 2, 400 bars, the inverse, the nudges and the clock's label.
- `tests/unit/video-sync-fixtures.test.ts`: the same over real scores.
- `youTubePlayer.test.ts` (26): the script asked for only on a frame, once; its failure; state, rate, errors; the poll (paused, hidden, disposed); late events after dispose; seek while paused and while buffering; a frame wrapped twice.
- `useVideoFollow.test.tsx` (18): the hooks' lifetime, StrictMode included, over a real `PlayerService`.
- `followScroll.test.ts`: when the window moves, and how far.
- `SongPage.test.tsx`, "the tab follows the video (Unit 19)" (40): an unlined link unchanged; lining up (the clock at the press, a refused save, "Line up again"); nudging (two in flight, one or both failing, a refetch held, the video's start); following through pause, seek, buffering, speed and a repeat; Follow and the window; a tap; Space; offline; the link removed, moved or lined up elsewhere; another source; leaving; StrictMode.
- `tests/db/song-links.test.ts` (+14): the grant, the check, the trigger, RLS, the row asked back.
- `tests/unit/thirdPartyRequests.test.ts`: one script, from one module, only when a frame is handed over; the API's parameters in the one place.
- e2e, `recordings.spec.ts` (3 new, at phone, tablet and desktop): the frame's parameters and the one script; one following pass with pause, seek and 2x speed, the bar on show; Space; nothing moving at the line-up; a tap; the nudges saved; a second device; an unlined link. `design.spec.ts` measures the line-up as a prompt, as nudges and while lining up again.

`npm run check` and `npm run test:db` are green; `recordings.spec.ts`, the recordings design test and `journey.spec.ts` pass at the three sizes.

## Test

### Summary

Build's tests already covered each acceptance criterion once. This stage went through the plan's Test focus and Build's "Async windows and inputs" list row by row and added what had no test of its own: 114 unit and component tests, 13 database tests and 2 e2e tests (each at the three sizes). One bug found and fixed (three lines). One test file could not be written (see Not covered).

### Tests added

- **`videoSync.test.ts` (+69, 134 in all), the maths as tables:**
  - _Shapes of a tab:_ a bar played three times; a tempo change inside a repeated bar, timed at each playthrough from that playthrough's own ticks; several changes in one bar listed out of order; a pickup bar; a tempo and a meter changing together (4/4 to 6/8); 3000 bars at 137 BPM with each bar starting exactly where the last ended.
  - _On a bar line:_ one mixed tab (bars 2 and 3 three times, a 3/4 bar, 90 and 137 BPM, a last bar that slows half-way) with bar 1 at 0, 0.25, 7.432, 3600.001 and 43200 s. Exactly on each line is that playthrough, a millisecond before it the one before, a millisecond before its end still it, the tab's end "ended". A tap on any playthrough goes to its own line, which is that playthrough again. A sum with float noise in it (0.1 + 0.2) is still bar 1's first instant.
  - _A bar played three times:_ followed pass by pass; a tap goes to the nearest pass from nine places of the video, half-way between two passes going back to the one already heard.
  - _After nudges:_ where a fixed moment of the video falls after 0 to 100 presses each way, the time since bar 1 going negative ("not started") after "Tab later".
  - _Quarter-second steps:_ there and back is the stored value exactly; a thousand presses are a thousand quarters; the thousandths of a press survive 200 nudges; a nudge an end cuts short lands on the end, and the way back is a whole quarter (the tenth isn't remembered); a press is saved to the millisecond; nothing a press or a nudge gives is outside what the column takes; the label after a nudge.
- **`youTubePlayer.test.ts` (+19, 45):** the poll stopping for a pause, buffering and the end and starting again with one timer; a video that starts while the page is hidden; a page that comes back to a paused video; hidden and shown before the player answered; an error mid-video; a listener that takes itself off mid-telling; a player let go of before it answered; a listener added after dispose; a seek while buffering with nothing moving the time shown until it plays on; two seeks one after the other; two videos one after the other (one script, nothing carried over, neither hears the other, orders go to the one on the page); the frame replaced while the script loads; the script failing with two frames waiting, a later frame working once it loads, a script with no player in it, a constructor that throws, a failure after the frame has gone.
- **`SongPage.test.tsx` (+26, describes marked "19 Test"):**
  - _Lining up, pressed again:_ twice before the page has drawn the first press; twice with the video moving between (ends on the later, here and on the server); "Line up again" with a refused save (the old line-up back, the read held so the page's own rollback is what is asserted); a new line-up while a nudge is on its way; a nudge straight after a line-up still on its way; two nudges pressed inside one render; lined up before the tab's bars are in.
  - _Another device while following:_ it moves the line-up (same frame, the mark moves, a nudge here moves the new value); it takes the line-up away (prompt back, the video plays on, the score no longer tappable); a read that fails over the cached links keeps the frame, the line-up and the mark.
  - _One video after another:_ Original, Drumless, Original again is a third player: the nudges are there, nothing is marked until it has been played (its clock already inside the tab), Space says to tap it, and the two earlier players' late clocks mark nothing.
  - _The reader's own scrolling:_ a hand scroll isn't undone inside the bar being played, nor for a next bar that is on show; the page follows again for one that isn't. A bar under the sticky video or behind a phone's tab bar isn't on show; a tab bar with no box (768 px and up) hides nothing.
  - _A tap and Space at the edges:_ a tap after a nudge on its way; after the video has run past the tab; before the player has answered; Space held down (one pause, every repeat still taken); Space after the player has given up (the browser's); Space after a pause made in the video's own controls.
  - _Nothing to follow:_ a song with no links, with only a Spotify and a web link, and a lined-up song on Tab: no line-up, no video player made, taps and Space are the tab's.
  - _The connection going:_ while following (the frame leaves, the mark with it, a new frame on return has to be tapped); on an unlined link with a press made as it went; a nudge whose answer is lost (said, rolled back, and the read after it shows what the server kept, so the next nudge isn't a quarter short).
- **`tests/db/song-links.test.ts` (+13, 95):** a millisecond, 43199.999 and a quarter second kept exactly; `NaN`, `Infinity` and `-Infinity` refused by the range check (PostgREST reads the words into `numeric`; Postgres sorts NaN above every number), "soon" as 22P02; a nudge moves only the line-up and `updated_at`; the trigger leaves a change of kind and a same-address write alone, clears on Spotify and doesn't give the line-up back with the old address; a new address on an unlined link; a new address with an explicit null; only the owner reads the column (B gets no row, signed out is 42501); B can't plant a lined-up link on A's song, clear A's line-up or delete the link.
- **e2e, `recordings.spec.ts` (+2 at each size):** the repeats fixture followed through all ten playthroughs with each bar brought on show (bar 3 again after bar 4), a tap on bar 3 going to the second pass from the second pass and the first from the song's start, a hand scroll to the top not pulled back inside the bar and followed again at the next, and Follow off moving neither the window nor the score box (on a phone bar 1 is proved out of sight first). A song with only a Spotify link: no request to any YouTube or Spotify host on its play screen (the script included), no line-up, Space plays the tab; then a YouTube Original proves the recorder hears the script.

"Nothing is requested from YouTube or Google before a recording is opened" was confirmed again three ways, the API script included: the page (`services.requests` is every request, script and frame, and is empty through the Songs list, Stats, Settings, the overview and the Tab player, with and without the service worker in charge, and now for a Spotify-only song), the build (`index.html` and `sw.js`), and the source (`thirdPartyRequests.test.ts`: one script, one module, only when a frame is handed over).

### Break checks

Each of these was made in app code, the tests run, and the file put back (a script that copies the file, edits it, runs, restores):

- `videoSync.ts`: the float margin removed (8 fail), the tie going the other way (2), the tempo changes unsorted (1), no rounding to the millisecond (10), no stop at the video's start (2), changes inside a bar ignored (4), always the first pass (12), the nudge's direction swapped (12).
- `youTubePlayer.ts`: a second interval per "playing" (3), polling while hidden (1), wrapping a frame that left (1), a failed load remembered (1), a throwing constructor not caught (1), a reading said before the player answered (1), orders sent after dispose (1), and the fix below reverted (1).
- `useSaveBarOne.ts`: an answer drawn over a later save (1), a failure clearing instead of going back (2), no `scope` (2). `LineUp.tsx`: no `isOnline()` in the press (1), the clock from the last render (1), a nudge from the rendered value (1).
- `useVideoFollow.ts`: the tab bar ignored (1), an undrawn tab bar counted (1), the sticky bar ignored (1), the scroll run at every render (3), a tap before the player answered (1), a stale line-up (5), Space on an unavailable player (1), a mark before the first play (1). `shortcuts.ts`: a held Space repeating (1).
- e2e: the repeat test's play order written without the repeat fails at position 4 ("received [3, 3]").

Three tests pass with their line removed, because a second guard holds the behaviour: a listener added after dispose (the widget's `sink` is already null), a listener taking itself off mid-telling (a `Set` survives deletion while iterated), and events after a dispose before "ready". They are kept as statements of behaviour. Two first drafts passed vacuously and were changed: the refused re-line-up passed on the refetch until the read was held, and the tab-bar bar was below jsdom's 768 px window anyway until it was moved inside it. The database tests can't be broken without changing the migration; they run against the real schema on the 54421 stack.

### Bugs found

1. **A "playing" after a player error set the clock's poll going under an unavailable video (fixed).** `youTubePlayer.ts` took any state event after `onError`: the state became `unavailable` with `playing: true`, and the 250 ms poll ran (reading the clock and telling every listener) for the rest of the frame's life. Nothing on screen acted on it, since every gate asks for `ready`. Repro: `yt.ready(); yt.state(1); yt.options.events.onError({ data: 5 }); yt.state(1)`. Fix: once unavailable, later events from the frame are dropped (three lines in `handle`). Test: "stops when the player gives up while playing".

Nothing bigger found.

### Not covered

- **Real scores with a tempo change inside a bar, a change of meter part-way and a bar played three times.** No committed fixture has one. Four tests were written for `tests/unit/video-sync-fixtures.test.ts` that build such scores from alphaTex in the test and run them through alphaTab's MIDI generator; the edit that added them was not let through by this session's permission check, so they are not in the repo. The maths for all three is covered on hand-made tick data in `videoSync.test.ts`; what is unproved is that alphaTab's `tempoChanges` carries a mid-bar change at the tick this code expects. Carried forward in `docs/plan.md`.
- A real YouTube player: adverts, a clock that reports in steps, `onAutoplayBlocked`, a seek that lands early. The stub and the fake stand in; Build's one real video is the only evidence.
- Safari and Firefox (Chromium only), and whether the marked bar is the bar heard.
- Focus after a refused re-line-up is only asserted not to be on `<body>`.
- A save in flight when the source is switched or the screen left (Build's known gap: the cache is corrected, the message is lost).
- The window follow at 320 px and on a phone on its side (QA's).

### Verify

- `npm run check`: 5908 passed, 2 skipped (5794 before).
- `npm run test:db`: 290 passed.
- `E2E_PORT=4283 npx playwright test tests/e2e/recordings.spec.ts tests/e2e/journey.spec.ts tests/e2e/shortcuts.spec.ts`: 96 passed at phone, tablet and desktop. `tests/e2e/design.spec.ts -g "a song’s recordings"`: 3 passed.

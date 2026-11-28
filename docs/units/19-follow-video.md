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

## QA

Verdict: **FAIL**, on four major issues (1 to 4 below). Nothing blocks the main path: on a phone in portrait, a tablet and a laptop a lined-up video is followed correctly through everything tried. Two of the majors are the phone on its side, one is a slow connection, one is the phone's keyboard for "Type a time".

### How it was run

- The dev server on port 5283 (already running, left running) against the 54421 stack, headless Chromium driven by Playwright scripts, at 390x844, 820x1180, 1440x900, 320x700 and 844x390; all but the laptop as touch viewports (taps), the laptop with a mouse.
- **Real YouTube videos, and YouTube was reachable throughout:** `aqz-KE-bpKQ` (10 min 35 s, the "long video"), `M7lc1UVf-VE` (as Drumless) and `jNQXAC9IVRw` (19 s, a video that ends inside the tab). The video's clock was read from the `<video>` element inside YouTube's frame and the marked bar from `window.__drumPalPlayer`, both in the same instant. Seeks were made on YouTube's own seek slider and speeds in its own Playback settings menu (the phone and sideways runs; the laptop run set `video.currentTime` and `playbackRate`, before the selectors for YouTube's current player were found).
- Eight throwaway users made by "Dev: sign in" (`qa19-…@drumpal.test`), all deleted at the end by the ids recorded, files first. `demo@drumpal.test` was never used. Nothing was reset or seeded.
- Not possible here: hearing anything, a real phone keyboard, Safari or Firefox, an advert (none turned up in some thirty plays).
- Screenshots: `docs/units/19-shots/qa-<size>-NN-….png`.

### Acceptance criteria

| Criterion                                                                                                                                                      | Result                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A lined-up video marks the bar it is on and keeps it on screen at phone, tablet and desktop sizes, through pause, seek, a speed change and a repeat in the tab | **Pass** at 390x844, 820x1180 and 1440x900. **Fail** at 844x390 for the first four bars (issue 1), and at any size when YouTube's script arrives after the video was started (issue 3). At 320x700 bar 1 is half behind the tab bar (issue 8) |
| "Bar 1 starts now" and the nudges are saved with the link and are there on another device                                                                      | **Pass** (a second browser context shows the same "Bar 1 at 0:05.58" after a reload, and Play on the video is all it takes)                                                                                                                   |
| A tap on a bar seeks the video to it; Space plays and pauses the video                                                                                         | **Pass** (touch and mouse, playing and paused, a repeated bar included)                                                                                                                                                                       |
| An unlined link, a Spotify link and a song with no links behave as before, and nothing is requested from YouTube before a recording is opened                  | **Pass**                                                                                                                                                                                                                                      |
| Or type the time: the accepted forms, refused input, nothing moves, needs no playing video                                                                     | **Pass** after the cosmetic fix below                                                                                                                                                                                                         |
| Or type the time: the saved time typed back sends nothing                                                                                                      | **Fail** for a time saved by a press (issue 5); passes for a typed time                                                                                                                                                                       |

### What was walked, and what was measured

**Lining up** (each of the five sizes)

- Unlined: the prompt and "Bar 1 starts now", drawn off until the video plays; Space before the first tap gives "Press Play on the video once…" and plays nothing.
- "Bar 1 starts now" at about 0:04: the saved time lay between the clock read just before the press and just after it in all five presses (4.022 to 4.034 saved 4.03, 4.059 to 4.106 saved 4.10 and so on), so the press itself adds no lateness. The line became "Bar 1 at 0:04.10. Drifting? Nudge the tab.", focus went to "Line up again", the live region said "Lined up. Bar 1 at 0:04.10."
- Lined up early (0:02) and late (0:20) with the song at 0:05, then nudged or typed back: the mark moved a quarter second a press, at once, and two quick presses added up (0:04.10, two "Tab later", 0:04.60; two writes). "Tab earlier" at 0:00.10 lands on 0:00.00 and is then off (a press sends nothing); "Tab later" is off at 12:00:00.00.
- "Line up again": the prompt is back with Cancel, focus on "Bar 1 starts now", the old line-up still marking bars; Cancel puts focus back on "Line up again".
- A slow save (2.5 s a write): three nudges showed 0:05.50 after 130 ms, then 5.25, 5.5 and 5.75 were sent in order and the line ended on 0:05.75. A save that fails: "Couldn't save where bar 1 starts. The server couldn't be reached…", the value rolled back, focus kept, and the next nudge started from the right value.

**Type a time**

- Opened empty on an unlined link (no video playing, saved fine) and on the saved time on a lined one ("0:04.28"). Focus goes to the field; Escape and Cancel put it back on "Bar 1 starts now"; Enter and Save both save and put it on "Line up again".
- Accepted: `0:07.25`, `83.5` (shown 1:23.50), `1:02:03.5`, `1m30s`, `7,5`, `0:05` with spaces round it, `90s`, `2m`, `0`, `43200`, `1:2:3`, `0:5.5`. One write each.
- Refused with "A time in the video, like 0:07 or 1:23.5", `aria-invalid`, no write: empty, `abc`, `-1`, `43201`, `1:60`, `1:75.5`, `1:2:3:4`, `.5`, `7.`, `1h2m3s`, `0:07:`, `1e3`, `٧`, `12:00:00.001`, `NaN`, `5 s`. Typing again clears the message. `1m90s` is taken as 2:30.

**Following** (Groove 120, bar 1 at 0:05)

| Run                                                         | Samples         | Mark behind the video's clock                   | Mark ahead |
| ----------------------------------------------------------- | --------------- | ----------------------------------------------- | ---------- |
| 1x, 34 s, laptop / phone / sideways                         | about 1100 each | 0 to 0.23 s, mean 0.11 s                        | never      |
| 1x, bar 1 at 0:05.13, 30 s                                  | about 970 each  | 0 to 0.10 s                                     | never      |
| 0.5x in YouTube's menu, 60 s (phone, sideways)              | 1953            | 0 to 0.08 s of video time                       | never      |
| 1.5x in YouTube's menu, 22 s (phone, sideways)              | 715             | 0 to 0.31 s of video time (0.21 s of wall time) | never      |
| Repeats, 21 s; Tempo Change, 39.5 s (phone, tablet, laptop) | 700 / 1290      | 0 to 0.22 s                                     | never      |

- The lag is the 250 ms poll: it is a fixed fraction of that for a whole song when the bars are a multiple of a quarter second long. At both speeds the marked bar matched the video's clock outside that window in every sample.
- Before bar 1 and past the tab's last bar nothing is marked. Pause in the video: the mark stays. A seek on YouTube's slider: the mark is on the right bar within the next poll. The 19 s video ended inside the tab: the mark stays on the bar it ended in.
- Repeats: the marks went 1, 2, 3, 4, 3, 4, 5, 6, 7, 8. A tap on bar 3 from bar 1 went to its first pass (0:09), from the second pass and from bar 5 to its second (0:13). Tempo change: right through the change at bar 9; a tap on bar 12 went to 0:29.00.
- Each bar on show for a whole pass at 390, 820 and 1440 (about 18 samples a bar, none off). On a phone the page turns every four bars (the window's scroll went 390, 731, 1119, 1507).
- Follow off for 22 s: the mark went from bar 1 to 12 and neither the window nor the score box moved. Follow on again: the bar is on show at once. A hand scroll to the top with Follow on is left alone inside the bar and followed again at the next.
- Space: plays and pauses, and the page doesn't scroll.

**The rest**

- Source switching: Original (following), Drumless (its own frame, unlined, nothing marked), Tab (controls and cursor back, no frame, no mark), Original again (a new frame: nothing marked and Space says to tap it until it has been played). Each link keeps its own line-up.
- Rotation while following: the same frame, the video plays on, nothing scrolls sideways (see issue 7 for where the bar is).
- Offline mid-follow: the frame gives way to its note, the mark goes, "You're offline. Lining the tab up needs a connection.", the nudges and "Line up again" `aria-disabled`, Follow still a toggle. Back online: a new frame at 0:00 that has to be tapped, then followed from the saved line-up.
- "Manage recordings", Original pointed at another video: the prompt is back on the play screen and Drumless keeps its line-up.
- YouTube's script blocked: "The tab can't follow this video: its player isn't answering here.", and the video plays as in Unit 14.
- Requests to any YouTube or Google host: **none** on the Songs list, Stats, Settings, the overviews (links saved), the Tab player, a Spotify-only song's play screen or a song with no links. On opening a recording: the frame on `www.youtube-nocookie.com`, then `www.youtube.com/iframe_api` and the widget script it loads, and from inside YouTube's own frame `i.ytimg.com`, `yt3.ggpht.com`, `fonts.gstatic.com`, `www.gstatic.com`, `www.google.com` and `jnn-pa.googleapis.com`.
- 44 px: every control of the line-up is 44 px tall in every state at every size; the narrowest is 63 px wide (sideways).
- Nothing moves: the score's top and the bar's height were the same in every state of the line-up (prompt, the first-tap note, typing, lined up, nudged, lining up again, a 12-hour time) at every size, except the two cases in issues 10 and 13.
- Focus: prompt to "Line up again" after a press; back to "Bar 1 starts now" on "Line up again"; the field on "Type a time"; nudges and Follow keep it. Nothing fell to `<body>`.
- Live region: "Lined up. Bar 1 at 0:04.10." and "Bar 1 at 0:04.60." (see issue 11 for what isn't said).

### Issues

**Major**

1. **A phone on its side shows no score for the first four bars.** 844x390, a lined-up link, a fresh load, Play on the video. The score box starts below the fold (its top at 461 px in a 390 px window) and the follow moves the window 16 px a bar: bar 1 at 445 to 582, bar 2 at 429, bar 3 at 413, bar 4 at 397. From bar 5 it is right. Turning Follow on from the top of the page does the same. `qa-sideways-60-bar-1-off-show-at-start.png`. At the top of the page the recording bar isn't stuck yet and is taller than what is left of the window, so the room the bar is measured against is empty.
2. **A phone on its side hides the line-up's controls under the video.** The line-up is 206 px wide there. Unlined: "Type a time" runs under the video ("Type a ti"). After "Line up again": Cancel is wholly under it and can't be tapped (the frame takes the tap), so the only ways back to the nudges are lining up again or typing the same time. Lined up: "Tab earlier" and "Follow" are 63 px wide and their words spill out. At the top of the page "Bar 1 starts now" is below the fold. `qa-sideways-07-line-up-again.png`, `qa-sideways-05-lined-up.png`, `qa-sideways-01-unlined.png`.
3. **A video that is already playing when YouTube's script arrives is never followed.** Delay `https://www.youtube.com/iframe_api` by 8 s (a slow connection), open a lined-up recording, tap the video. When the script lands the video is at 0:09 and nothing is marked; 8 s later still nothing; Space says "Press Play on the video once…" while it plays. A pause and a play in the video's own controls starts the following. The wrapper only learns "started" from a state change, and none comes for a video that was playing before it attached; reading the player's state at "ready" would cover it. `qa-phone-71-playing-but-not-followed.png`.
4. **"Type a time" asks a phone for the decimal keypad** (`inputmode="decimal"`), which has digits and a decimal point: no colon and no letters. So on a phone the forms the field itself suggests ("0:07.25", "1:23.5", "1m30s") can't be typed, and the saved time it opens on can only be deleted; seconds alone ("83.5") work. Read from the attribute, not seen on a device (headless Chromium has no keyboard): **confirm on the phone**; if the keypad there has a colon this is nothing.

**Minor**

5. **The saved time typed back sends a write when it was saved by a press.** A press saves to the millisecond (2.018) and the field shows the hundredth ("0:02.02"), so Enter on the untouched field sends `{"bar_one_seconds":2.02}`. Seen at 390, 820 and 320. The line-up moves by up to 5 ms; the plan says it sends nothing. Compare what is shown, or save a press to the hundredth.
6. **A nudge from a page that hasn't seen the link change puts the old video's line-up on the new one.** Device A follows Original; device B points Original at another video (its line-up is cleared); A, not reloaded, presses "Tab later": the write lands on the same row, and B now shows "Bar 1 at 0:05.83" for a video nobody lined up. Scope the write by the address the page knows.
7. **After a rotation the marked bar is off screen until the next bar starts.** 390x844 to 844x390 while following: the bar was at 533 to 630 px in a 390 px window until the next bar change; back to portrait, behind the tab bar for the same stretch. Paused, it stays there. The follow acts on a change of bar, not on a change of layout.
8. **320x700.** Bar 1 is half behind the tab bar for its two seconds from a fresh load (577 to 714 px with the tab bar at 643; `qa-small-60-bar-1-off-show-at-start.png`). After "Line up again" the row is 24 px wider than the page: Cancel is cut off and the page scrolls sideways (`qa-small-07-line-up-again.png`). There the page also turns every two bars.
9. **"Bar 1 starts now" is off with nothing saying why.** Before the video is played, and whenever it is paused, the button is drawn off and a tap on it does and says nothing. A first-timer has no cue to play the video first. Pausing on the downbeat and pressing, the most exact way to line up by hand, isn't possible (see Questions).
10. **A failed save's message moves the score:** 4.6 px at 390 px, 20.6 px at 320 px (three and five lines in the words' row), back when the next save lands. The code's comment allows it; it is the one state of the line-up that moves the page.
11. **Not said to a screen reader:** the "Press Play on the video once…" note (Space then does nothing and says nothing) and "its player isn't answering here".
12. **A line-up can't be taken away,** only replaced. A link lined up against the wrong tab keeps marking bars; Follow off stops the scrolling, not the mark.

**Cosmetic**

13. **Fixed here:** a refused typed time made the line-up 4 px taller at every size (three 16 px lines in a 44 px row), moving the score by 4 px. The alert's leading is now 14 px (`LineUp.tsx`); the line-up measured 88 px before and after the refusal at all five sizes.
14. `1h2m3s`, which is how YouTube writes a time over an hour, is refused; `1m90s` is accepted as 2:30.
15. While typing, the field sits directly on the Save button with no gap (`qa-phone-03-type-a-time.png`).

### Judged as the product (docs/product.md)

- **Can a drummer read along on a phone in portrait now? Yes.** The video, "Open in YouTube" and the line-up take 351 px; 436 px of score is left above the tab bar, which is four lines of one bar each, and nobody has to touch the phone after Play. That is job 4 (read along) done where Unit 14 left a flick every few seconds. The weak spot is the page turn: the bar that has just left the view is put at the top, so in the last bar before a turn there is nothing ahead to read, and a drummer reads ahead. See Questions.
- **Is per-bar marking enough?** For "where are we", yes, and it is honest: the mark trails by up to a quarter second (an eighth note at 120 BPM), which is invisible on a bar and would be wrong on a beat. Whether it is enough to read a busy bar from is for the kit.
- **Taps to sound, first time:** Songs, the song, "Original", Play on the video: four from the app open, and a fifth, optional, for "Bar 1 starts now". Every later time, four, none of them for the following. A hard fill: one tap on its bar.
- **Missing a piece:** no link, a Spotify link, no drum track, an unlined link, offline: each is what it was. Nothing nags about lining up.
- **What trips them:**
  - The off button with no reason (issue 9).
  - "Tab earlier / Tab later" still needs a thought: if the mark is behind the music you press "Tab earlier". The time beside it helps.
  - A dropped connection mid-song takes the video away and brings it back at 0:00 needing a tap (Unit 14's rule that no frame is drawn offline). The video would have played on from its buffer. It costs more now that the tab is following it.
  - A phone on its side (issues 1 and 2), which reads as unfinished. Nothing else does.
- **Is the line-up understandable the first time?** The sentence and its button read as one instruction, and after the press the result explains itself (a bar lights up and moves). The gap is the moment before: nothing says the video has to be playing.
- **No chore, no forced order:** the line-up is the one thing the app can't see, asked once per link, never required.

### The plan's open questions

- _Per bar, or a beat line too?_ **Keep per bar.** Measured lag is 0 to 0.25 s before any drift between the tab and the recording; at 120 BPM a beat line would be up to half a beat behind.
- _Should a tap seek, or line up to that bar?_ **Keep seek.** It worked every time, a repeated bar included, and it is the one-tap way to a hard part.
- _Follow on by default?_ **Yes.** Off is one tap and is respected.
- From Build's Carried forward, the script from `www.youtube.com`: **keep the documented API.** YouTube's own frame already asks `www.google.com`, `gstatic.com` and `googleapis.com` once it is open, so driving it by `postMessage` would buy little, and nothing is asked before a recording is opened.
- From Build's Carried forward, a reaction time at the press: the press itself is exact to the clock (above); how late a person is, is for the kit.

### Questions for Shane

1. **When should the page turn?** Now: when the marked bar has left the view, it goes to the top. Option: turn a line early, so the line after the marked one is always on show. Recommendation: turn early. It costs nothing on a tablet and is what makes a phone readable across a turn.
2. **Line up while paused?** Now "Bar 1 starts now" only works while the video plays. Option: also when paused on a started video (scrub to the downbeat, press). Recommendation: allow it, and have the off button say "Press Play on the video first" when tapped.
3. **The keyboard for "Type a time" on a phone:** the decimal keypad (seconds only, quick) or the full keyboard (colon and "1m30s", slower). Recommendation: the full keyboard, since the field shows and suggests "0:07.25". Check issue 4 on the phone first.
4. **A phone on its side under a video:** do you use it? If yes, issues 1 and 2 are a small Build round. If not, the cheap answer is still to fix the scroll (1) and let the line-up's row wrap.
5. **Taking a line-up away** (issue 12): a "Remove" beside "Line up again", or leave it until a wrong line-up happens. Recommendation: leave it.
6. **A connection that drops mid-song** removes a playing video. Keep an already-playing frame and only refuse to draw a new one offline? Recommendation: yes, in Unit 15, where the player is worked on again.

### Human checks (from the plan, for Shane)

- At the kit: line a song up and play along on the tablet and on a phone in portrait.
- Whether per-bar marking is enough to read from.
- How far a real recording drifts from its tab over a song, and whether the nudges are enough.
- Added by this stage: the phone's keyboard on "Type a time" (issue 4); iPhone and iPad Safari (everything here ran on Chromium: the player API in an iOS frame, `playsinline`, Space from a Bluetooth keyboard); a video with an advert in it, if one turns up (does the mark hold still?).

### Not covered

- Sound of any kind, Safari, Firefox, a real touch screen.
- An advert, a video that refuses embedding, a loop left set up on Tab keeping its mark.
- A second device picking a line-up up without a reload (a reload does; a synthetic focus event in a headless page did not refetch, which proves nothing about a real window).
- A tab longer than the 16-bar fixtures; "a long song" was a long video over a short tab.

### Verify

- `npm run check`: green.
- `E2E_PORT=4283 npx playwright test tests/e2e/recordings.spec.ts tests/e2e/design.spec.ts -g "recording|line-up|Unit 19|follows|video|a song’s recordings"`: 57 passed, after the cosmetic fix.
- `src/features/recordings/LineUp.typed.test.tsx`: 8 passed.

## Build (QA fix round 1)

Fixes for QA's issues 1 to 11, 14 and 15 and its questions 1 to 4, each with a test written first. Nothing else was changed. Issue 13 was QA's own fix; issue 12 (taking a line-up away) is not built, see Questions for Shane.

### What changed, by item

| #   | QA                  | What is true now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | issue 1 (and 8)     | The window's scroll is aimed under where the video's bar **will** stick (`stuckTop`: its sticky `top` plus its height), not under where it is. On a fresh load the bar hasn't stuck: in a phone on its side it ended below the window's foot, so the "view" was empty and each bar moved the page 16 px; at 320 px it ended at 565 px and bar 1 sat behind the tab bar. A bar that had no place when it was marked (the score still drawing) is now placed at the next `rendered`.                                                                                 |
| 2   | issue 2 (and 8)     | The line-up is a grid of fixed rows: two rows of three columns under the video, three rows of two beside it in a phone on its side, each control in a cell of its own. A control's words wrap to two lines inside its 44 px (no `whitespace-nowrap`). At 320 px "Line up again" with Cancel is three equal cells. In a phone on its side the note about the video's controls is under the bar, not beside the video: the room beside it is the line-up's, and the bar stays 211 px (it was the tallest thing in the window).                                       |
| 3   | issue 3             | When YouTube's player first answers, and when a frame is wrapped again, the wrapper asks `getPlayerState()`: playing sets `playing` and `started` and starts the clock's poll; paused, buffering and ended set `started`. A player that can't say (throws, answers nonsense, has no such method) is ready and not started, as before.                                                                                                                                                                                                                              |
| 4   | issue 4             | The field has `inputmode="text"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` and `enterkeyhint="done"`.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | issue 5             | Unchanged is judged by what the field shows: the label of what was typed against the label it opened on. So "0:02.02" over a stored 2.018 sends nothing, and neither does the same time written another way ("2.02", "2,02s").                                                                                                                                                                                                                                                                                                                                     |
| 6   | issue 6             | Every save carries the link's stored `url` as the cache has it at the press, and the update is filtered on it. An update that matched nothing is followed by a look-up of the link: there, it is `LinkChangedError` ("Couldn't save the line-up. This recording was changed somewhere else."); gone, it is `PG.NO_ROWS` ("It has been deleted, on this device or another.") as before. No migration. The optimistic value is taken back and the read that follows shows the new video, not lined up.                                                               |
| 7   | issue 7             | A change of the window's width brings the marked bar back on show at once, and again when alphaTab has drawn the score for the new width (`PlayerService`'s new `rendered` event), playing or paused. A change of height alone does nothing (a phone's address bar).                                                                                                                                                                                                                                                                                               |
| 8   | issue 9, question 2 | `canLineUp` is "the player answers and the video has been started": playing or paused. Before that the button is drawn off (`aria-disabled`) and a tap on it puts "Press Play on the video first." in the message's row and the live region, each time. `lineUpSeconds` now rounds down to the millisecond, so a video lined up while paused is in bar 1 on that very clock (rounded up, it was "before bar 1" and nothing was marked until it played).                                                                                                            |
| 9   | issue 10            | The rows are grid tracks of fixed height, and the failed save's words sit at the foot of their cell and overflow upward. The lead is shorter ("Couldn't save the line-up."), so at 320 and 390 px the words fit their row anyway.                                                                                                                                                                                                                                                                                                                                  |
| 10  | issue 11            | The live region also says the "Press Play on the video once…" note, at each Space or tap that asks for it (the screen counts the asks per player), and "its player isn't answering here" when the player gives up.                                                                                                                                                                                                                                                                                                                                                 |
| 11  | issue 14            | `1h2m3s`, `1h`, `2h30m`, `1h5s` are read. A part after a larger one counts in sixties: `1m90s`, `1m60s`, `1h60m`, `1h90s` are refused, like `1:90`.                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12  | issue 15            | Every row of the line-up is 4 px from the next (`gap-1`), the field and Save included. The block is 92 px tall where it was 88.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 13  | question 1          | The page turns a line early. `windowScrollToShow(bar, view, next)`: a bar that is on show, with the bar played after it on a line below that is cut off, goes to the top now. `next` is the bar after it in play order, so a repeat going back turns nothing. A view that holds one line, with the marked line at its top, doesn't move. The score's own box (from 768 px it has a height and its own scroll) follows the same rule through `showBar(bar, nextBar)`, `scrollToBar(barIndex, nextBarIndex)` and `scrollToShow(rect, view, next)` in `barScroll.ts`. |

### Product walk-through (docs/product.md)

- _Day one, a song with a video lined up, phone in portrait:_ Play on the video. The first bar is brought under the video, and from then on the bar being played has the next lines under it; a turn comes every three bars instead of every four, each one bar earlier than before. Nothing new to press.
- _Day one, phone on its side:_ the same, from bar 1. The line-up is beside the video, every control a thumb's size.
- _A piece missing:_ a link that isn't lined up, a Spotify link, a song with no links, a song with no drum track: unchanged. A video nobody has played: "Bar 1 starts now" is off and says why when tapped. A slow connection: the video is followed when the script arrives.
- _Offline:_ unchanged (no video, the line-up off with its note).
- No order is forced and no chore added: lining up while paused is one more way to do the one optional step.

### Files touched

- `src/features/song/followScroll.ts`, `useVideoFollow.ts`: `stuckTop`, the early turn, the play-order place, `rendered` and resize.
- `src/features/player/barScroll.ts`, `playerEngine.ts`, `alphaTabEngine.ts`, `PlayerService.ts`: the box's early turn (`scrollToBar`'s and `showBar`'s second argument), the `rendered` event.
- `src/features/recordings/youTubePlayer.ts`: the player's state asked at ready and at a re-wrap.
- `src/features/recordings/LineUp.tsx`, `lineUpCopy.ts`, `recordingPlayer.ts`, `RecordingBox.tsx`, `src/features/song/SongPage.tsx`: the grid, the field's attributes, the paused line-up, the announcements, `firstTapAsks`, the note's place in a phone on its side.
- `src/features/recordings/songLinksApi.ts`, `useSaveBarOne.ts`: the save filtered on `url`, `LinkChangedError`, `useLinkAtPress` (was `useBarOneAtPress`).
- `src/features/recordings/videoSync.ts`: hours in `parseVideoClock`, `lineUpSeconds` rounding down.
- Tests: `followScroll.test.ts`, `useVideoFollow.test.tsx`, `barScroll.test.ts`, `PlayerService.showBar.test.ts`, `youTubePlayer.test.ts`, `videoSync.test.ts`, `LineUp.typed.test.tsx`, `SongPage.test.tsx`, `src/test/linkTable.ts` (a `url` filter, a look-up by id, `holdNext` holding several calls in turn), `tests/db/song-links.test.ts`, `tests/e2e/recordings.spec.ts`, `tests/e2e/recordingsPage.ts`.
- `AGENTS.md` (the Unit 19 section and Unit 14's line about the bar in a phone on its side), `docs/plan.md` (Unit 19).

### Decisions

- **The box turns early too, not only the window.** The task asked for the rule in `followScroll.ts` and a pass at 390x844. From 768 px the score is in a box 60dvh tall that scrolls by itself, and the window's rule alone would have left a tablet and a laptop turning late: the marked bar on the last line the box shows, the next line clipped by the box. So `scrollToShow` in `barScroll.ts` has the same rule, and the e2e's view is the window's cut down to the box.
- **`next` is the bar played next, not bar + 1.** With `repeats.gp`, bar 4 on its first pass is followed by bar 3, which is above it: turning for bar 5 there would hide the bar about to be played. `useVideoBar` became `useVideoPlace` (an index into the play order) for this.
- **Rounding a press down** changes four rows of the Test stage's table (0.0006 now saves 0, not 0.001). It is what makes a paused line-up mark bar 1; a playing one never showed the difference because the clock moved on.
- **A press while the player hasn't answered yet says "Press Play on the video first." too.** On a fresh page that is the true reason. On a slow connection with the video already playing it is the wrong one, for the seconds until the script arrives (Known gaps).
- **The failed save's lead is shorter**, "Couldn't save the line-up." for "Couldn't save where bar 1 starts.", so the usual failure is three lines at 320 px. The fixed rows are what holds when it isn't.
- **The note moved out of the bar in a phone on its side** (Unit 14 had it beside the video there). With it the column beside the video was taller than the video once the line-up had three rows, and the bar took more of a 390 px window. Unit 14's e2e for that size now checks the way out and the line-up beside the video and the note under the bar.
- **No migration for issue 6.** A filter on `url` in the update is enough: the row's address is what a line-up is a line-up of. The look-up that tells "changed" from "removed" is one more request, on the failure path only.

### Async windows and inputs

- **Between a frame mounting and YouTube's script arriving** (`loading`): a tap on the video starts it (nothing is heard); Space and a tap on a bar do nothing (as before); a tap on "Bar 1 starts now" says to press Play first; when the script arrives the state is read from the player (playing, paused, not started) and everything follows from that; the frame leaving the page meanwhile wraps nothing (as before); a second wrapper of the same frame after the answer reads the state again and starts the poll if it plays.
- **A line-up save in flight** (optimistic, sent one at a time): another nudge reads the link from the cache at its press and carries the same `url`; the link pointed elsewhere on another device meanwhile makes this save, and any queued behind it, match nothing: each fails with "changed", the optimistic value goes back to what the server was known to hold, and the read that follows shows the new video. The look-up after an update that matched nothing can itself fail: that is the failure shown ("couldn't be reached"), never a guess at which it was. A link removed meanwhile: "deleted", as before.
- **Between a width change and alphaTab's drawing for it:** the bar is brought on show at once from the old drawing's places (or not at all while the engine says it is redrawing), then again at `rendered`. The mark moving to another bar in between: the new bar's own look runs, and the awaited drawing still brings it on show (the flag is kept across bars). Follow turned off in between: the listeners go, nothing moves. A `rendered` that no width change and no unplaced bar is waiting for (alphaTab drawing for another reason) moves nothing.
- **A bar marked before the score has bounds:** `showBar` keeps its request (with the next bar) and the follow keeps its own; both are done at `rendered`, once.
- **The typed field open while the saved time changes on another device:** the field keeps what it opened on; saving it unchanged sends nothing; saving another time sends it for the address the cache has then.

### Break checks

Run through a script that copies the file, applies the edit, runs the tests and puts the copy back.

| Edit                                                                                                                                                                   | Tests that failed                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inputMode` back to `decimal`                                                                                                                                          | 1 (the field's attributes)                                                                                                                                                                                     |
| Unchanged judged by the parsed value                                                                                                                                   | 5 (the press-saved time, and the four other ways of writing it)                                                                                                                                                |
| The save not filtered on `url`                                                                                                                                         | 3 (the address carried, the changed link, the failed look-up); "removed" still passes, as it should                                                                                                            |
| `canLineUp` needing a playing video                                                                                                                                    | 4 (component and page)                                                                                                                                                                                         |
| The off button's press saying nothing                                                                                                                                  | 3                                                                                                                                                                                                              |
| The notices not said                                                                                                                                                   | 2                                                                                                                                                                                                              |
| e2e, one build: no `stuckTop`, no early turn (window and box), resize ignored, the state not asked at ready, the grid without its fixed rows, gap and sideways columns | 6 of the 7 new e2e tests at first; "a failed save moves nothing" passed, because at 320 and 390 px the words fit their row. It now also runs at 320 px with the text a quarter larger, and fails on that build |

The pure tables (`followScroll`, `barScroll`, `videoSync`, `youTubePlayer`, `showBar`, the hook's window tests) were each run failing before their code was written.

### The real video

`aqz-KE-bpKQ` on the dev server (port 5283) in headless Chromium, a throwaway user made by "Dev: sign in" (`fix1-…@drumpal.test`, deleted by its id afterwards, files first; five such users over the runs, each deleted at the end of its run, none left). The video's clock was read from the `<video>` element inside YouTube's frame. Screenshots: `docs/units/19-shots/fix1-*.png`.

- **Item 3 (390x844):** `iframe_api` held until the video was at 7.39 s and playing, nothing marked. Released: bar 2 marked with the video at 7.93 s, nothing pressed. Space paused it at 7.98 s with no "press Play once" note. "Line up again": "Bar 1 starts now" was on, on the paused video.
- **Items 1 and 13 (390x844):** a fresh load from the top, Play on the video, 2x from bar 2. Sixteen marks, 1 to 16; at every one the marked bar was on show, and at every one but the last so was the bar after it. The window's scroll at each mark: 390, 390, 634, 634, 634, 925, 925, 925, 1216, 1216, 1216, 1507, 1507, 1507, 1663, 1663: a turn every three bars, made while the bar before the cut-off line is being played.
- **Item 1 (844x390):** a fresh load, the score box starting at 497 px of a 390 px window. Marks 1 to 9: every one on show, its top 12 px under the video's bar (bar 1 at 223 to 360 px in a view of 223 to 390).
- **Item 2 (844x390):** lined up, "Line up again" with Cancel, typing, a refused time and the prompt: in each, every control inside the window, clear of the video's frame, 44 px tall and what a tap at its middle lands on; the bar 211 px in all of them. Cancel took a tap and the nudges came back. Before Play, a tap on "Bar 1 starts now" said "Press Play on the video first."
- One false alarm on the way: after the break checks the dev server was still serving their copy of `recordingPlayer.ts` (the restore was a rename, which its watcher missed), so "Bar 1 starts now" was off on a paused video. The restored files were touched, the server's copy checked with `curl`, and the whole check run again; the numbers above are from that run. **The dev server on 5283 is serving the current files.**

### Known gaps

- A tap on "Bar 1 starts now" between starting the video and YouTube's script arriving (a slow connection) says "Press Play on the video first." though it is playing. The button comes on when the script lands.
- In a phone on its side "Line up again" is drawn after the nudges and reached by Tab before them (`order-last`).
- At the very top of the page in a phone on its side the line-up's lower rows are below the fold, as the video is: the page's header comes first. The bar sticks once the page is scrolled, by hand or by the follow.
- "This recording was changed somewhere else." stays in the line-up's row until the next save from it or until the screen is left, like any failed save's words.
- A phone on its side holds one line of the score under the video (180 px), so there the page can't show the next line; the marked line is at the top and the turn comes when the next bar starts.
- The early turn was measured on Chromium only, with the 16-bar fixtures and one real video.

### Questions for Shane

Built as told, from QA's questions: the page turns a line early (1); "Bar 1 starts now" works on a paused, started video and says why when it is off (2); the whole keyboard for "Type a time" (3); a phone on its side is fixed (4).

Not built, and what is there instead:

1. **Taking a line-up away** (QA question 5, issue 12). Now: a line-up can be replaced ("Line up again", "Type a time") but not removed; Follow off stops the scrolling, not the mark. Option: a "Remove" beside "Line up again". Recommendation: leave it until a wrong line-up happens.
2. **A connection that drops mid-song** (QA question 6). Now: the frame gives way to the offline note and comes back at 0:00 needing a tap. Option: keep a frame that is already playing and only refuse to draw a new one offline. Recommendation: yes, with the loose-ends work, where the player is opened again.
3. **A beat line.** Now: per bar. QA measured the mark up to a quarter of a second behind the video's clock (the poll), half a beat at 120 BPM. Recommendation: keep per bar.
4. **New from this round: should the note about the video's controls come back beside the video in a phone on its side?** Now: under the bar there, so the bar stays as tall as the video. Option: beside the video above the line-up, at the cost of some 40 px of a 390 px window. Recommendation: leave it under the bar.
5. **New from this round: how early should a turn be?** Now: one line (the marked bar is the last one on show). On a phone in portrait that is a turn every three bars with one bar of the old page kept at the top. Option: turn when two lines are left. Recommendation: play along at the kit with it as it is first.

### Manual verify

1. `npm run dev`, sign in, open a song with a YouTube link on its play screen ("Original").
2. Before pressing Play on the video, tap "Bar 1 starts now": "Press Play on the video first."
3. Play the video, pause it on the downbeat, tap "Bar 1 starts now": bar 1 is marked at once.
4. Play on: at each bar the next line is on show under the marked one; the page turns while the bar before the cut-off line plays.
5. Turn the phone on its side (or 844x390 in the browser's device mode): the bar is back on show at once; every line-up control is beside the video and takes a tap; "Line up again" then Cancel.
6. "Type a time": the keyboard has a colon; `1h2m3s` is taken, `1m90s` refused; saving the field as it opened sends nothing (the Network tab).
7. On a second device point Original at another video; on the first, not reloaded, tap "Tab later": "This recording was changed somewhere else.", and the new video is not lined up.
8. Throttle the network to Slow 3G, reload, tap the video at once: the mark appears when the script has loaded, with nothing more pressed.

### Verify

- `npm run check`: green.
- `npm run test:db`: green (292).
- `E2E_PORT=4283 npx playwright test tests/e2e/recordings.spec.ts tests/e2e/journey.spec.ts tests/e2e/shortcuts.spec.ts` at phone, tablet and desktop: 108 passed, 6 skipped (the three phone-only tests on the other two sizes). `tests/e2e/design.spec.ts -g recordings`: 3 passed.

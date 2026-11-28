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

## QA (after QA fix round 1)

Verdict: **PASS.** No blocker and no major issue. Eleven of the thirteen fixed items hold everywhere they were tried; two hold in part (the rotation, issue 1 below; the labels at 320 px, fixed here). Two minor issues are clauses of the acceptance met only in part (1 and 2 below), so a short Build round on them before Readability would be reasonable; neither stops anyone playing along.

### How it was run

- The dev server on port 5283 (left running; it serves the current `LineUp.tsx`) against the 54421 stack, headless Chromium driven by Playwright scripts, at 320x700, 390x844, 820x1180, 1440x900 and 844x390. All but the laptop as touch viewports, every press a tap at the control's middle by coordinates (so a covered control fails).
- Real YouTube videos, reachable throughout: `aqz-KE-bpKQ` and, as the video a link was repointed at, `M7lc1UVf-VE`. The video's clock was read from the `<video>` element inside YouTube's frame, the marked bar from `window.__drumPalPlayer`.
- Tabs: Groove 120 (16 bars), Repeats, Tempo Change, and a 72-bar tab at 160 BPM made for this run from alphaTex (not committed), which is the long tab the first QA lacked.
- Two throwaway users made by "Dev: sign in" (`qa2-19-…@drumpal.test`), both deleted at the end by the ids recorded, files first. `demo@drumpal.test` was never used; nothing was reset or seeded.
- Not possible here: hearing anything, a real phone keyboard, Safari or Firefox, an advert.
- Screenshots: `docs/units/19-shots/qa2-<size>-NN-….png` (`small` is 320x700, `sideways` 844x390, `side667` 667x375).

### The fix round, item by item

| #   | Item                                          | Result                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A phone on its side from a fresh load         | **Pass.** 844x390, the score box starting at 497 px of a 390 px window: bar 1 at 223 to 360 in a view of 223 to 390, and every mark of all four tabs on show (16, 10, 16 and 72 marks). At 320x700 bar 1 is at 367 to 504, above the tab bar at 643                                                                                                                                            |
| 2   | Every line-up state, sideways and at 320 px   | **Pass** after the cosmetic fix below. Unlined, the off button's message, the first-tap note, lined up, "Line up again", typing and a refused time: every control 44 px tall, on screen once the bar has stuck, what a tap at its middle lands on, clear of the video, nothing wider than the page, at all five sizes. Tab order is the drawn order except the known one (sideways, lined up)  |
| 3   | A video playing when YouTube's script arrives | **Pass** (390x844 and 844x390). The script held until the video was at 7.09 s: nothing marked, Space did nothing and said nothing. Released: bar 4 marked 470 ms later with the video at 8.00 s, nothing pressed; Space then paused and played it, with no "press Play once" note                                                                                                              |
| 4   | The typed-time field                          | **Pass.** `type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" autocomplete="off"`, no `pattern`. Entered a key at a time on the touch viewports and saved: `0:07.25`, `1m30s` (Enter), `1h2m3s`, `1:23.5`, `2h30m`, `1h5s`, `1h`. Read from the attributes: the keyboard itself is still for the phone                                 |
| 5   | The saved time typed back after a press       | **Pass** at all five sizes. A press saved 2.571; the field opened on "0:02.57"; Enter sent nothing and the row still held 2.571. "2.57" typed and saved: nothing sent                                                                                                                                                                                                                          |
| 6   | A link repointed elsewhere, then a nudge here | **Pass.** One request (`{"bar_one_seconds":5.25}`) that matched nothing: "Couldn't save the line-up. This recording was changed somewhere else.", the new video's row still `bar_one_seconds` null, and within 2.5 s this page shows the new video with the prompt. See issue 4 for where focus goes                                                                                           |
| 7   | Rotation, playing and paused                  | **Pass in part.** Fails on the first turn of a page that was loaded upright (issue 1). Every other turn tried holds: upright again, the second and later turns to sideways, a page loaded sideways (both ways), a tablet (820x1180 and 1180x820, playing and paused, at most one 25 ms reading off show). The same frame and a playing video throughout, no sideways scroll                    |
| 8   | "Bar 1 starts now" paused, and before Play    | **Pass.** Before Play: `aria-disabled`, a tap shows "Press Play on the video first." and the live region says it, again at a second tap; nothing sent. Paused at 2.5715 s: saved 2.571, bar 1 marked at once and brought on show, "Lined up. Bar 1 at 0:02.57." said, focus on "Line up again"                                                                                                 |
| 9   | A failed save, text at 125%                   | **Pass.** At 320 and 390 px (and the other three) the score's place, the line-up's height and the bar's height were the same before the failure, with it showing and after the next save landed. At 320 px the words grow 18 px upward and their first line touches "Open in YouTube"; still readable (`qa2-small-08-…`)                                                                       |
| 10  | The announcements                             | **Pass.** Said: "Press Play on the video first." (each tap), "Press Play on the video once…" (each Space), "Lined up. Bar 1 at …", "Bar 1 at …" per nudge, "The tab can't follow this video: its player isn't answering here." (the script blocked; the video still plays). A repeat alternates a trailing no-break space, so it is read again                                                 |
| 11  | `1h2m3s`, `1m90s`, `1h60m`                    | **Pass.** `1h2m3s` saves 3723 ("Bar 1 at 1:02:03.00"). `1m90s`, `1h60m`, `1m60s`, `1h90s`, `1:90`, `abc`: refused with the fixed copy and `aria-invalid`, nothing sent                                                                                                                                                                                                                         |
| 12  | The gap between the rows                      | **Pass** (a 92 px block; the field 4 px from Save)                                                                                                                                                                                                                                                                                                                                             |
| 13  | The page turn                                 | **Pass.** See below                                                                                                                                                                                                                                                                                                                                                                            |
| —   | `lineUpSeconds` rounding down: a bar late?    | **No.** Pressed while playing between clock readings of 2.563 and 2.592: saved 2.586. For 62 s after (1356 readings, 41 bars of 1.5 s): the mark never ahead of the clock, behind by at most 0.146 s, never a whole bar; each bar first seen marked 0.155 to 0.195 s after its start. Paused at 65.656437 and pressed: saved 65.656, bar 1 marked                                              |
| —   | Nothing asked of YouTube before a recording   | **Pass.** No request to a YouTube or Google host on the Songs list, an overview with a link saved, the Tab player, a Spotify-only song's play screen (Space plays its tab), a song with no links (with `?source=original` too), Stats or Settings. On opening a recording: `www.youtube-nocookie.com`, `www.youtube.com` and, from inside the frame, the same Google hosts the first QA listed |

### The page turn

Every run was a fresh load from the top, Play on the video, and one reading in the page at each change of the mark: the marked bar, the bar played after it, and the part of the window the score is read in (under the video's bar, above a phone's tab bar, inside the score's own box from 768 px).

| Size     | Groove 120 (16) | Repeats (10 marks) | Tempo Change (16) | 72 bars | Turns                                                                                           |
| -------- | --------------- | ------------------ | ----------------- | ------- | ----------------------------------------------------------------------------------------------- |
| 320x700  | pass            | pass               | pass              | pass    | The window, a line at every bar (two lines fit)                                                 |
| 390x844  | pass            | pass               | pass              | pass    | The window, every three bars: 390, 634, 925, 1216 … 7036                                        |
| 820x1180 | pass            | pass               | pass              | pass    | The window at bar 5 (and 75 px back at bar 11), then the box every twelve bars: 639, 1221, 1803 |
| 1440x900 | pass            | pass               | pass              | pass    | The window once (205 px), then the box every sixteen bars: 542, 930, 1318, 1380                 |
| 844x390  | pass            | pass               | pass              | pass    | One line of two bars fits: at half the marks the bar played next is on the line below           |

- "Pass" is: at every mark the marked bar was all on show, and so was the bar played next whenever it is on a line below, except at the tab's last bar and except at 844x390, where the view holds one line (Build's known gap). 114 marks a size, none failing.
- A repeat going back: at bar 4's first pass (bar 3 next, above) neither the window nor the box moved at 320, 390, 820 and 1440; bar 3 was on show when reached. At 844x390 each of the two is brought to the top as it is marked, which is the bar itself, not a turn for the next.
- The reader's own scroll: in bar 3 the window was moved up 120 px (and the box 60 px where it has one). It stayed there for the rest of the bar at every size (14 to 16 readings); at bar 4 the page moved only where bar 4 or the bar after it was no longer on show.
- No scroll between two marks in any run, and nothing marked after the tab's last bar.
- At 844x390 the window goes 274, 371, 274, 371 … as the box and the window take turns moving a line. On screen the marked line is at 223 px every time; noted, not an issue.

### Still as the first QA recorded

- Following at 0.5x and 1.5x (7 s each, 150 readings): never ahead; behind by at most 0.06 s and 0.32 s of video time. A seek while playing on YouTube's own bar: the right bar at the next reading.
- A tap on a bar: paused, the video went to 25.00 for bar 11; playing, to bar 11 and on. Space: pauses and plays, the window where it was.
- Follow off: the mark went from bar 1 to 8 and neither scroll moved; on again, the bar on show at once.
- The nudges: two "Tab later" from 5.00 sent two writes and ended on 5.50; "Tab earlier" to 5.25; focus kept.
- An unlined link: nothing marked after 5 s of video, a tap on a bar (heard as a tap) seeks nothing, Space pauses and plays the video, nothing written. Tab source: no frame, no line-up.

### Issues

**Minor**

1. **The first turn from upright to sideways shows bar 1, not the bar being played.** 390x844, a lined-up video, a fresh load, playing or paused on any bar after the first; turn to 844x390. The marked bar is on show for about 100 ms (box scroll 542 for bar 8), then the box slides to 104 over the next 300 ms and stays: bar 8 at 661 to 781 in a view of 223 to 390 (`qa2-phone-51-first-turn-paused-turned.png`). Playing, it is put right when the next bar starts (off show for 1.6 s of a 2 s bar); paused, it stays wrong until Play. Turning back upright, and every later turn to sideways on the same page, is right; so is a page that was loaded sideways, and a tablet. The slide starts just after the first `rendered` at the new width and ends on bar 1, where the tab's own cursor is, so it reads as alphaTab scrolling its box to its cursor the first time the box has a scroll of its own, after the follow has placed the bar (a reading of the timings, not of alphaTab's code). The e2e for this loads the page at 844x390 before turning, which is the order that works.
2. **A seek on YouTube's own bar while paused leaves the mark on the old bar.** 1440x900: paused in bar 2 (Space), a click on YouTube's progress bar at 0:24.86 (bar 10): the mark stays on bar 2, 3 s later too. Play: bar 11 at once. A seek while playing is followed, and so is a tap on a bar while paused. Not from the fix round (the first QA only seeked while playing), but it is the acceptance's "through pause, seek", and scrubbing a paused video to find a part is job 2.
3. **A phone on its side that is narrower than 768 px has no room for a line.** 667x375 and 740x360 (an iPhone SE, small Androids; 844x390 gets the sidebar and is fine): the tab bar stays along the foot, so 107 px and 92 px are left between the video's bar and the tab bar. A 97 px line is cut 2 px short at 667 px and 17 px at 740; bar 1's 137 px line loses its kick drum behind the tab bar (`qa2-side667-92-following.png`). The line-up's controls are all on screen and tappable there. Not one of the five sizes; see Questions.
4. **After "This recording was changed somewhere else." focus falls to `<body>`.** The nudge that was pressed leaves with the old line-up (the prompt takes its place) and nothing takes focus. The failure is an alert, so it is read.

**Cosmetic**

5. **Fixed here:** at 320 px, after "Line up again", "Bar 1 starts now" was three lines in a 44 px button and ran out of it top and bottom. `cellButton`'s `px-2 py-0` lost to the button classes' own `px-4 py-2` (both are plain utilities; the wider one comes later in the stylesheet), so the words had 61 px, not 77. The two are now `px-2! py-0!` (`LineUp.tsx`): two lines, inside the button (`qa2-small-05-line-up-again.png`). The audit of every state was run again at all five sizes afterwards, with no change but this one.
6. In a phone on its side with the text at 125% the failed save's words are five lines in a 136 px column and lie over "Open in YouTube", and "Line up again" and "Follow" spill their buttons (`qa2-sideways-08-save-failed-text-125.png`). Nothing moves.

**Known, unchanged** (in Build's Known gaps or the plan's Carried forward): in a phone on its side Tab reaches "Line up again" before the nudges; at the very top of the page there the line-up's lower rows are below the fold until the bar sticks; "changed somewhere else" stays beside the prompt until the next save; the one line of score at 844x390.

### Judged as the product (docs/product.md)

- **Can a drummer read along on a phone in portrait with the earlier page turn? Yes.** At 390x844 the marked bar always has the bars after it under it, the turn comes every three bars with one bar of the old page kept at the top, and a 72-bar song went by with no hand on the phone and no mark off show. At 320 px it is a line a bar, which reads as a steady scroll.
- **Is the phone on its side usable now? Yes at 844x390,** with two limits: one line of music (two bars) under the video, so no reading ahead across a line, and the first turn from upright shows bar 1 until the next bar (issue 1). Every line-up control is beside the video and takes a thumb. A narrower phone on its side is not there yet (issue 3).
- **Does anything read as unfinished?** The jump to bar 1 on the first turn, and the tab not moving when a paused video is scrubbed. Nothing else: the line-up says why it is off, takes the times a person would type, and never moves the score.
- Taps to sound are as before: four from the app open, none for the following; lining up is one optional tap, playing or paused. No link, a Spotify link, an unlined link and no drum track are each what they were. No chore and no forced order was added.

### Questions for Shane

1. **A phone on its side narrower than 768 px** (issue 3). Now: the tab bar stays, and a line of music doesn't fit between it and the video. Options: hide the tab bar under a recording there, make the video smaller there, or leave it. Recommendation: leave it unless you use such a phone; if you do, hide the tab bar while a video is on the page.
2. **One line of music at 844x390.** Now: the video's bar is 211 px of a 390 px window and one line (two bars) fits under it, so the next line can't be shown before it is played. Option: give the score more of the window there (YouTube needs 200 px each way, so the room would have to come from the bar's padding, or from the video sitting beside the score). Recommendation: play along with it sideways first.
3. Still open from before, unchanged by this round: taking a line-up away, keeping a playing frame through a dropped connection, how early a turn should be, and whether the note about the video's controls belongs beside the video in a phone on its side.

### Human checks (from the plan, for Shane)

- At the kit: line a song up and play along on the tablet and on a phone in portrait.
- Whether per-bar marking is enough to read from, and whether a turn a line early is early enough.
- How far a real recording drifts from its tab over a song, and whether the nudges are enough.
- The phone's keyboard on "Type a time": that it has a colon and letters, and no autocorrect bar getting in the way.
- iPhone and iPad Safari (everything here ran on Chromium): the player API in an iOS frame, a turn of the phone mid-song, Space from a Bluetooth keyboard. A video with an advert, if one turns up.

### Not covered

- Sound, Safari, Firefox, a real touch screen and keyboard, an advert, a video that refuses embedding.
- Offline mid-follow and the second device picking a line-up up (the first QA's passes; the fix round didn't touch them).
- Text at 125% was the root font size set to 125%, not the browser's own zoom or a phone's text-size setting.

### Verify

- `npm run check`: green (6044 tests).
- `E2E_PORT=4283 npx playwright test tests/e2e/recordings.spec.ts tests/e2e/design.spec.ts -g "recording|line-up|Unit 19|follows|video|phone on its side|page turns|Bar 1"` on a fresh build, after the cosmetic fix: 69 passed, 6 skipped.

## Readability

No behaviour changed. Checks before and after are at the end.

### What changed

- **The line-up, split by what is drawn** (`LineUp.tsx`, 397 lines, is now 262 with `LineUpParts.tsx` beside it). `LineUp` keeps the state and the presses. What is drawn is small components in `LineUpParts.tsx`: `LineUpRows` (the grid), `LineUpMessage` (drawn from a `LineUpNotice`, in place of a seven-way `if` chain inside the component), `LineUpControls` (the buttons of either state: `promptButtons` for "Bar 1 starts now", "Type a time" and Cancel while lining up again, `linedUpButtons` for the nudges, "Line up again" and Follow), `TypedTimeForm` (the field) and `LineUpLiveRegion`. The two sets of buttons are one component, not two, so that "Bar 1 starts now" and "Line up again" stay the same element across a press, as they were: my first cut had a component per state, which React mounts afresh at each change, and the pressed button would have left the page under the focus it held. Caught on reading the tree again, before any check; `LineUp.typed.test.tsx` now asserts the element is the same. `LineUpSpace` and the grid's class strings moved there too, so `LineUp.tsx` has no class string in it. The markup, classes, test ids and order of every state are as they were.
- **Its focus hand-over is `lineUpFocus.ts`** (`handOverAttributes`, `findHandOver`), as `loopFocus.ts` is for the loop panel; **its sayings are in `lineUpCopy.ts`** (`linedUpSaying`, `nudgedSaying`), where the press and the typed save each built "Lined up. Bar 1 at …." by hand. What the line-up says without a press (the first-tap note, a player that gives up) is `useSayings` in `LineUp.tsx`, the same set-state-while-rendering as before.
- **What saving a typed time comes to is a pure function**, `typedBarOne(text, openedOn, saved)` in `videoSync.ts` (the second, and whether it is a change to save; "unchanged" judged by what the field shows). It was three branches inside the submit handler. It has its own table in `videoSync.test.ts`.
- **A video's time as text is `videoClock.ts`** (pure): `parseVideoClock`, split into `unitParts` / `secondsOfUnits` / `secondsOfColons`, `videoClockLabel`, `clockLabel` and `toMilliseconds`, out of `videoSync.ts`, which is now only where a second of the video is in the tab and the line-up's rules. `videoClockLabel` is `clockLabel` plus the hundredths, and `songLinks.ts`'s `startTimeLabel` is the same `clockLabel`: the hours, minutes and seconds were formatted twice. Their tables moved to `videoClock.test.ts` unchanged.
- **One rule for "on show" and for the early turn.** `isOnShow(span, view)` and `nextLineIsCutOff(bar, next, view)` in `barScroll.ts` are what both `scrollToShow` (the score's box) and `windowScrollToShow` (`followScroll.ts`, the window) ask; each had its own copy of the comparison and its own 1 px tolerance.
- **One store for what is read from a recording player.** `useRecordingValue(player, read, idle, same)` (`useRecordingValue.ts`) is the `useSyncExternalStore` store that `useRecordingStatus` and `useVideoPlace` each built by hand.
- **The play screen** (`SongPage.tsx`, 558 to 433 lines). The recording's page state (the player, Follow, the asks for the video's first tap, the session) is `useRecordingSession` (`useRecordingSession.ts`, which now also has the `RecordingSession` type, out of `useVideoFollow.ts`); `RecordingBar` is its own file and takes that state as one prop (four props where it had nine); `useRecordingSpace(recording)` and `canTapToSeek(recording)` (`useVideoFollow.ts`) name what `SongPlayer` worked out inline for Space and for the score's `tappable`.
- **The save, on the data hook pattern.** `BarOneSave`, `LinkAtPress`, `cachedLineUp` and `withBarOne` are in `songLinkForm.ts` with the link's other pure code; `useSaveBarOne.ts` keeps what needs the query client. `cachedBarOne` (exported, used once in its own file) is gone, and `saveBarOne` takes a `BarOneSave` where it spelled the same shape out.
- **`announcementText` is imported from `src/lib/announcement.ts`** by the three files that use it; `useSongShortcuts.ts` no longer re-exports it.
- **Small things.** `RecordingBox`: a `sideways:min-w-0` beside a plain `min-w-0` (the same value at every width) is gone, and the comment over the note said it sits beside the video "where there is room", which the fix round made untrue for a phone on its side. `useSaveBarOne`'s comment now names the typed time among what it saves. `lineUpCopy.ts` had its header twice.

### Tests

No assertion was changed, weakened or deleted. What moved:

- `videoSync.test.ts`: the tables for `videoClockLabel` and `parseVideoClock` are in `videoClock.test.ts`, as they were. Added, twelve tests: three rows for `clockLabel`, one test for `toMilliseconds`, and eight for `typedBarOne`.
- `LineUp.typed.test.tsx`: its view has `openField()` (by way of "Line up again" once the link is lined up) and `retype(text)`, for steps fifteen places wrote out. Added: one test, that "Line up again" and "Bar 1 starts now" are one element which keeps focus through both presses (true before this stage too; it guards the split above). The offline test's press on a locked "Type a time" is still a plain click, since it is the press that must open nothing.
- `SongPage.test.tsx`, "the tab follows the video": `openVideo`'s view has `tapBar(barNumber)` and `placeBar(barNumber, top, bottom)`, both 1-based like `marked` and the comments beside them (they were `engine.fire('barTapped', { barIndex })` and `engine.barRects.set(barIndex, rect)`, ten and fourteen times); `watchWindowScroll()` is the `scrollBy` stub two describes set up, and `addTabBar(box)` the tab bar two tests built. One test that makes its own engine keeps `engine.fire`.
- e2e: the five steps `recordings.spec.ts` defined inside its describe (`openVideo`, `openLinedVideo`, `followThrough`, `readableView`, `markedBox`) are exported from `recordingsPage.ts` with the other steps. There, `videoStub`'s six casts of the frame's window are one `call(method, ...args)`, and the three shapes `window.__drumPalPlayer` was cast to are one `FollowWindow`.

### Left alone

- `youTubePlayer.ts`, the engine and `PlayerService` changes, the migration, `tests/db/song-links.test.ts` and `youTubePlayer.test.ts`: read, nothing to move.
- `songLinks.ts` reads a link's `t=1h2m3s` (`startSecondsOf`) and `videoClock.ts` reads a typed "1h2m3s". They look alike and differ on purpose (whole seconds with capped digits and no sixties rule in an address; fractions and the sixties rule in the field), so they are still two.
- `SongPlayer` still builds the one-bar `mark` it hands `useLoopPractice` from `followed.bar`: two lines, and `useVideoFollow`'s tests read `bar`.
- `PlayerService.scrollToBarWhenRendered` calls `engine.scrollToBar` with one argument or two rather than passing `undefined`: the service tests assert the one-argument call.
- QA's open issues after fix round 1 (the first turn to sideways, a seek while paused, the 667 px phone on its side, focus after "changed somewhere else") are behaviour, not readability.

### AGENTS.md

The Unit 19 section now names `useRecordingValue`, `videoClock.ts`, `typedBarOne`, `LineUpParts.tsx`, `lineUpFocus.ts`, the sayings in `lineUpCopy.ts`, `useRecordingSession` and `RecordingBar.tsx` (and that `SongPage.tsx` holds nothing else for a recording), `useRecordingSpace` / `canTapToSeek`, `isOnShow` / `nextLineIsCutOff`, where the save's pure helpers are, the test views' new helpers and the e2e steps now in `recordingsPage.ts`. It said `useVideoBar` for a hook that is `useVideoPlace`, and that `parseVideoClock` is in `videoSync.ts`; both are put right. Unit 13's line on `announcementText` says where it is imported from.

### Verify

- Before: `npm run check` green (6044 tests); `npm run test:db` 292 passed; `E2E_PORT=4283 npx playwright test tests/e2e/recordings.spec.ts tests/e2e/journey.spec.ts tests/e2e/shortcuts.spec.ts --project=phone --project=desktop` 73 passed, 3 skipped; `tests/e2e/design.spec.ts -g recordings` at the same two sizes 2 passed.
- After: `npm run check` green (6066 tests: the thirteen added above, and nine from the per-file source checks, which count the seven new files); `npm run test:db` 292 passed; the same e2e run on a fresh build 73 passed, 3 skipped; the design test 2 passed. The dev server on port 5283 was left running and serves the refactored modules.

## Review

Read: AGENTS.md, `docs/review-checklist.md`, the Unit 19 section of the plan, this note, and `git diff origin/main...HEAD` for `src`, `tests`, `scripts` (none changed) and `supabase`. Each finding below was confirmed in the code, and where it turned on a library, in the library (alphaTab 1.9's `alphaTab.core.mjs`, a real YouTube player) before anything was changed. Every fix has a test that failed first.

### Questions for Shane

1. **YouTube's player API script.** Now: one script from `www.youtube.com` (YouTube's cookie host), asked for only when a video's frame is drawn; the frame itself stays on `youtube-nocookie.com`. Option: drive the frame by `postMessage` alone, which asks that host for nothing but is undocumented. Recommendation: keep the documented API (built). YouTube's own frame asks `google.com`, `gstatic.com` and `googleapis.com` once it is open anyway.
2. **Taking a line-up away.** Now: it can be replaced, not removed. Recommendation: leave it until a wrong line-up happens.
3. **A connection that drops mid-song** removes the playing video and brings it back at 0:00 needing a tap. Recommendation: keep an already-playing frame, with the loose-ends work.
4. **A phone on its side narrower than 768 px** (667 x 375, 740 x 360): the tab bar stays and a line of music doesn't fit under the video. Recommendation: leave it unless you use such a phone; then hide the tab bar while a video is on the page.
5. **One line of music at 844 x 390, how early the page turns, and the note's place in a phone on its side:** as built. Recommendation: play along first.
6. **New: a player script that never finishes arriving.** YouTube's script loads a second one; if that is blocked or hangs (a content blocker that lets the first through), nothing ever says so: the video plays, "Bar 1 starts now" stays off and says "Press Play on the video first." at every tap, and a typed time is saved but nothing is marked. Option: give up after some seconds and say "its player isn't answering here". Recommendation: leave it. A limit short enough to be useful would also give up on a slow connection, where today the tab follows as soon as the script lands (19 QA issue 3).
7. **The nudges' names** ("Tab earlier" / "Tab later", Build's change from the plan's "Tab early / Tab late") were never put to you. Recommendation: keep them.

### Inventory

What the unit adds that holds state, and what each does when things go wrong.

| Piece                                                                                                     | Dispose, StrictMode                                                                                                                                                                                          | A source switch, leaving mid-save                                                           | A refetch, another device                                                                                                                                                                  | A lost or failed answer                                                                                                                                 | Offline                                                                  | Hidden page                                         | Rotation                                                              | The script failing or late                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `youTubePlayer.ts`: the script load (`loadYouTubeApi`, once per page)                                     | The promise outlives every frame; a wrapper disposed meanwhile wraps nothing (`frame.isConnected`)                                                                                                           | Same                                                                                        | —                                                                                                                                                                                          | —                                                                                                                                                       | No frame is drawn offline, so nothing is asked for                       | —                                                   | —                                                                     | An error tells every waiting frame "unavailable", forgets the promise and (from this stage) gives `window.onYouTubeIframeAPIReady` back; the next frame asks again. Late: the state is read when it lands. Never arriving with no error: stays "loading" (question 6) |
| `youTubePlayer.ts`: one `YT.Player` per frame element (`WeakMap`), events to the current wrapper (`sink`) | StrictMode's second wrapper takes the sink; the first's late dispose leaves it. `destroy()` is never called (it removes React's frame), so YouTube's own object for a frame that has left is never torn down | A new frame per video (keyed by its address) is a new widget                                | —                                                                                                                                                                                          | —                                                                                                                                                       | —                                                                        | —                                                   | Same frame                                                            | `onError` and a throwing constructor are "unavailable"; later events from that frame are dropped                                                                                                                                                                      |
| The clock's poll                                                                                          | Cleared on dispose; one timer at most                                                                                                                                                                        | Disposed with the frame                                                                     | —                                                                                                                                                                                          | —                                                                                                                                                       | The frame leaves, so it stops                                            | None while hidden; the clock is read once on return | —                                                                     | None until the player answers and the video has been started                                                                                                                                                                                                          |
| ↳ from this stage: the slow poll of a paused, started video                                               | As above                                                                                                                                                                                                     | As above                                                                                    | —                                                                                                                                                                                          | —                                                                                                                                                       | As above                                                                 | None                                                | —                                                                     | As above                                                                                                                                                                                                                                                              |
| `useRecordingPlayer`, `useRecordingValue`                                                                 | The ref's cleanup disposes; a store per player, unsubscribed by React                                                                                                                                        | Player null between frames                                                                  | —                                                                                                                                                                                          | —                                                                                                                                                       | Player null                                                              | —                                                   | —                                                                     | Status only                                                                                                                                                                                                                                                           |
| `useSaveBarOne`: optimistic, online only, one at a time (`scope`), the `confirmed` map                    | The mutation lives in the cache, not the component                                                                                                                                                           | It carries on and corrects the cache; its message is lost with the line (accepted in Build) | The links' own refetches wait while one is pending; a read on its way is cancelled; one read after the last settles. A link pointed elsewhere: the save matches nothing and says "changed" | Rolls back to what the server is known to hold, only while the cache still shows the value it sent; then reads. From this stage "in flight" is per link | `networkMode: 'always'`; the controls off, the handlers ask `isOnline()` | —                                                   | —                                                                     | —                                                                                                                                                                                                                                                                     |
| `LineUp`: `relining`, the typed field, `pressedEarly`, the sayings                                        | Keyed by the link's id                                                                                                                                                                                       | Unmounts; state gone, as meant                                                              | From this stage: a line-up made or taken away elsewhere hands focus to the control that stands in, and Cancel goes when there is nothing left to keep                                      | A failed first line-up brings the prompt back with focus                                                                                                | Off, with its note                                                       | —                                                   | The grid has its own rows sideways                                    | "its player isn't answering here", said once                                                                                                                                                                                                                          |
| Follow (`useRecordingSession`), the first-tap asks                                                        | Page state                                                                                                                                                                                                   | On per player; asks are per player                                                          | —                                                                                                                                                                                          | —                                                                                                                                                       | —                                                                        | —                                                   | —                                                                     | —                                                                                                                                                                                                                                                                     |
| `useVideoFollow`: the mark's place, the window scroll, `resize` and `rendered` listeners                  | Listeners removed in the effect's cleanup; tested under StrictMode                                                                                                                                           | The session goes null, nothing listened to                                                  | A new `barOneSeconds` re-places the video at once                                                                                                                                          | —                                                                                                                                                       | No player, no mark                                                       | No readings arrive                                  | A change of width brings the bar back at once and again at `rendered` | Nothing marked until `ready` and `started`                                                                                                                                                                                                                            |
| The mark, through `useLoopPractice`'s `mark`                                                              | One caller of `setHighlight`                                                                                                                                                                                 | Null on Tab: the loop's mark is back                                                        | —                                                                                                                                                                                          | —                                                                                                                                                       | Cleared                                                                  | —                                                   | Redrawn by the engine                                                 | —                                                                                                                                                                                                                                                                     |
| `PlayerService`'s `rendered` event, `showBar(bar, next)`, `barRectInWindow`                               | No-ops once disposed                                                                                                                                                                                         | —                                                                                           | —                                                                                                                                                                                          | —                                                                                                                                                       | —                                                                        | —                                                   | `scrollToBar` and `barRectInWindow` refuse during a redraw            | —                                                                                                                                                                                                                                                                     |
| ↳ from this stage: `setCursorScroll`                                                                      | No-op once disposed                                                                                                                                                                                          | On again on Tab                                                                             | —                                                                                                                                                                                          | —                                                                                                                                                       | —                                                                        | —                                                   | alphaTab no longer scrolls its box after the redraw                   | —                                                                                                                                                                                                                                                                     |
| `useTapSeeksVideo`, Space (`recordingSpace`)                                                              | `barTapped` unsubscribed; one key listener for the page                                                                                                                                                      | Off on Tab                                                                                  | —                                                                                                                                                                                          | —                                                                                                                                                       | No player: the key is the browser's                                      | —                                                   | —                                                                     | Before `ready` neither acts; before the first tap both say so                                                                                                                                                                                                         |
| `song_links.bar_one_seconds`, `song_links_before_write`                                                   | —                                                                                                                                                                                                            | —                                                                                           | A new `url` without a new value clears it, whichever build sent it                                                                                                                         | A save is "set to a value": safe to send twice                                                                                                          | —                                                                        | —                                                   | —                                                                     | —                                                                                                                                                                                                                                                                     |

### Findings

**The three decided fixes**

1. **A redraw left the score box on the tab's own cursor, not on the bar the video is on** (checklist 1, a new row: "A library's own follow-up, a frame later"). Cause, from alphaTab's source: `_onPostRenderFinished` calls `_cursorUpdateTick(…, shouldScroll = true)`, which through `uiFacade.beginInvoke` (a `requestAnimationFrame`) reaches the scroll handler; `VerticalContinuousScrollHandler` scrolls the box to the cursor's line over `scrollSpeed` (300 ms) whenever that line's `y` isn't the one it last scrolled to. That lands a frame after `postRenderFinished`, so after the follow's own scroll at `rendered`, and over it: QA's "on show for about 100 ms, then the box slides over the next 300 ms". It happens at any redraw that moves the cursor's line, not only the first turn. Fix: `setCursorScroll(on)` on `PlayerEngine` (`alphaTabEngine.ts`: `settings.player.scrollMode` Off or Continuous, then `updateSettings()`, no render), passed through `PlayerService.setCursorScroll` and sent by `usePlayer` as `!readAlong`, in an effect placed before the layout's so the redraw a source switch asks for is already covered. With the mode off alphaTab has no scroll handler; `showBar` is the app's own scroll and is untouched. No timer was added. Tests: `usePlayer.test.tsx` (off before the layout changes, on again on Tab, off from the start when the page opens on a recording), `alphaTabEngine.pointer.test.ts` (the setting, no render, nothing sent twice), `PlayerService.test.ts`, and e2e `recordings.spec.ts` "a turn of the phone keeps the bar the video is on on show, wherever the tab's own cursor was left, paused and playing". My first e2e for it (loaded upright, the tab's cursor on bar 1) **passed without the fix**: bar 1's line has the same `y` at both widths, so alphaTab had nothing to scroll to. The test now leaves the tab's cursor on bar 9 first, and fails without the fix exactly as QA saw ("bar 4 still on show at 844x390": on show, then not, a second later). I could not make the cursor-on-bar-1 slide QA measured happen on the built app; the mechanism is the same one, and with the scroll handler gone it has nothing to run. The first turn on a real phone is a row of Open human checks.
2. **A seek on YouTube's own bar while paused wasn't followed** (`youTubePlayer.ts`). The clock was already read at every state change; a real player fires none for such a seek. Checked on a real video in headless Chromium (`aqz-KE-bpKQ`, paused, moved with YouTube's own keys inside the frame): the `<video>` went to 70 s and 80 s, `getCurrentTime()` gave the new time at the next reading half a second later, and `onStateChange` never fired. Fix: `pollEveryMs()`: every `CLOCK_POLL_MS` while playing, every `PAUSED_CLOCK_POLL_MS` (1 s) while a started video that answers isn't, never while hidden, disposed, unavailable or not yet started; one timer, replaced when the pace changes. A reading of a video that stands still is said only when it moved. Tests: `youTubePlayer.test.ts`, "a paused video scrubbed in YouTube's own bar" (7), and five older tests rewritten for the slow timer. **The e2e could not have caught this:** the stub player posted a state change at every seek, paused or not. Its `seek` now posts one only while it plays, and "lining up once… through pause, seek and speed" fails without the slow poll (expected bar 13, received 3) and passes with it.
3. **Focus fell to `<body>` after "This recording was changed somewhere else"** (checklist 5, "Focus when a control replaces itself", extended). The nudge that was pressed leaves when the links are read again, which no press schedules. Fix: `useFocusKeptInLineUp(shape)` in `LineUp.tsx`, after `useFocusKeptInBar`: the line-up's root hears focus and blur, the last control focused in it is remembered until focus goes to another element, and when a change of shape has taken it off the page and left focus on `<body>`, "Bar 1 starts now", "Line up again" or the field (whichever stands in) is focused in a layout effect. It covers every such case: a line-up taken away or made on another device, with focus on a nudge, Follow, "Type a time" or Cancel. Found with it: "Line up again" half-way, with the line-up then taken away elsewhere, still drew Cancel with nothing to keep, and pressing it sent focus looking for a button that wasn't there; Cancel is now drawn only while a line-up is saved. Tests: `LineUp.typed.test.tsx`, "focus when the line-up changes under it" (6) and the changed-link test's last line. The blur rule was break-checked (removed: the "focus moved elsewhere is not pulled back" test fails).

**Found in review, fixed**

4. **Two links' saves in flight: a failed one kept its guess on show** (checklist 1, "Two writes to one item"; `useSaveBarOne.ts`). A song's Original and Drumless share the mutation key and scope, and "another save is pending" was asked of the key. With a save of the Original out, a save of the Drumless recorded no confirmed value, so its failure had nothing to go back to, and the wrong time stayed in the cache (and the persisted cache) until a read succeeded. Reach: nudge one video, switch source and line the other up before the first has answered, on a connection slow enough to fail. Fix: `othersPendingFor(linkId)`, counted over the pending mutations' variables; the read after the last save is still per song. Test: `useSaveBarOne.test.tsx` (new), failing before with "expected 9.25 to be 9".
5. **The live region was mounted anew, already holding its text, whenever the typed field opened or closed** (checklist 6, "A live region that says the same thing twice", the PR 31 case; `LineUp.tsx`). It was a child of the rows or of the form, which are different elements, so saving a typed time mounted a new region with "Lined up. Bar 1 at…" in it, which a screen reader often doesn't read. Fix: `LineUp` draws it after the rows or the form, as their sibling. Test: "the live region stays on the page across the typed time's form" (the same element before, during and after).
6. **`window.onYouTubeIframeAPIReady` was never given back** (hygiene; `youTubePlayer.ts`). The app's callback stayed on the page after the API arrived, and each failed attempt wrapped the last one's. It is now put back to what it was when the load settles, either way. Tests: two, in "loading YouTube's API".
7. **`seekTo` passed on whatever number it was given** (checklist 5, a validated path). The one caller (`useTapSeeksVideo`, through `videoSecondsOfBar`) gives a finite number or nothing today; the wrapper is the door to the third party, and now sends nothing for `NaN` or an infinity. Tests: three rows.
8. **A database test said only that something was refused** (hygiene, AGENTS.md: "asserts which way it was stopped"). B planting a lined-up link on A's song: `expect(insert.error).not.toBeNull()` is now the foreign key's code (23503).
9. **No test ran a real score with a tempo change inside a bar, a change of meter or a bar played three times** (the plan's last Carried forward line). Three tests in `tests/unit/video-sync-fixtures.test.ts` now build each from alphaTex and run it through alphaTab's MIDI generator: the mid-bar change is in the bar's `tempoChanges` at the tick of its beat, and the times are the ones written.
10. **Nothing said the app never reads the frame's messages itself.** It doesn't (no `message` listener, no `contentWindow` anywhere in `src`); `tests/unit/thirdPartyRequests.test.ts` now pins that.

**Checked, nothing to fix**

- **The third-party surface.** The script is asked for from one module (`youTubePlayer.ts`), by `createElement('script')` with the one address written out whole (`https://www.youtube.com/iframe_api`), only from `widgetFor(frame)`, whose one caller is the ref callback of the frame in `RecordingBox`; nothing at module load, no preconnect, nothing in the precache. Proved three ways (the source test, `youTubePlayer.test.ts`, the e2e recorder). What the frame says reaches the app only through `YT.Player`'s events and getters.
- **What reaches the frame's `src`:** `youTubeEmbedUrl` alone: an 11-character id from the parser, `start` only as a safe integer, `origin` only when `window.location.origin` matches a plain http(s) origin, encoded. **What reaches the column:** `lineUpSeconds` (finite, clamped, to the millisecond), `nudgedBarOne` (clamped) and `typedBarOne` (refused outside the range); the database's check refuses `NaN` and the infinities too (`tests/db`).
- **Round trips.** A press saves to the millisecond and the field shows the hundredth; "unchanged" is judged on what the field shows (`typedBarOne`), and a nudge works on the stored value read from the cache at the press.
- **Gates.** One predicate each, asked by the control and again by the handler with the clock read at the press: `canLineUp`, `canNudge`, `canDriveRecording` (the tap and Space), `isOnline()`.
- **The migration.** RLS is the table's (unchanged, all four policies on `user_id`); the two column grants are to `authenticated` only and `anon` has none; the function keeps `set search_path = ''` and its execute is revoked again; the check can't fail an existing row. Additive: see answer (a).
- **Test teardown.** The page and hook tests restore what they stub (`scrollBy`, the window's size, `visibilityState`, StrictMode, the tab bar element); the e2e's users are the `user` fixture's; `setBarOne` and `barOneOf` throw on an error.

**Open, not fixed**

- A player script that never finishes arriving: question 6.
- YouTube's own object for a frame that has left the page is never torn down (`destroy()` would remove a frame React owns, and under StrictMode the frame is still in use at the first cleanup). One small object per video opened; nothing of the app's listens to it.
- Space held down from before the player has answered: the first press is the browser's (the page scrolls), the repeats are taken. Harmless.
- A save in flight when the source is switched or the screen left fails without a word (Build's known gap): the cache is corrected and the next visit shows the saved value.
- 19 QA (after fix round 1) issue 3 (a phone on its side under 768 px) and 6 (text at 125% in a phone on its side: a failed save's words lie over "Open in YouTube"): questions 4 and 5, and cosmetic.

### Carried forward, settled

Every line under Unit 19 in `docs/plan.md` is gone from the list:

- The script from `www.youtube.com`: a question (1 above), now under "Asked of Shane".
- A reaction time at the press; an advert inside a video: Open human checks.
- The mark needing the tab's sounds for the box's scroll; "Press Play on the video first." while the script is on its way; the Tab order in a phone on its side: accepted in the plan, each with why and what would change that. A refused first line-up going back to the prompt with focus, and a refused nudge keeping focus, are the behaviour meant: deleted.
- Real scores for the three cases: fixed (finding 9).
- Added, accepted: a link removed on another device while focus is in its line-up.

### The two answers

**(a) The migration can be pushed to the hosted project before this build is live.** By reading: `20261201000000_song_link_bar_one.sql` adds a nullable column with a check every existing row passes (all null), adds that one column to the insert and update grants, and replaces `song_links_before_write` with the same function plus one rule. The build on `main` names its columns in every `song_links` select (`id, song_id, kind, provider, url, created_at`), inserts and updates named columns only, and its recordings form's update of `provider` and `url` goes through the new rule to the same result (a null line-up stays null). So nothing the live build does changes. The other order is the one that breaks: this build's select names `bar_one_seconds`, so on the old schema the links of a song fail to load on its overview and play screen (the tab still plays). `docs/release.md` says both, and to push by hand before merging; I added one sentence: push it just before merging, because between the push and the merge the `migrate` job's last step (the hosted schema against the committed types) fails on any other merge to `main`. `npm run db:types` on the local stack gives the committed types with no difference.

**(b) CI's e2e can't fail on the seed or on reaching YouTube.** The recordings specs, the recordings design test, `journey.spec.ts` and `shortcuts.spec.ts` use the `user` fixture's throwaway users and upload their own fixture; none reads a seed row, and `scripts/seed.ts` is untouched by the unit (a new nullable column changes nothing it writes). Every test that opens a recording calls `stubServices(context)` first, which answers every request to a YouTube, ytimg, googlevideo or Spotify host from the test itself and records it, the player API script included; the stub page asks for nothing. The frame's `origin` is built from the same `E2E_PORT` as `baseURL` (4173 in CI). A test that says nothing was asked for first proves the recorder hears a request.

### Files changed

- `src/features/player/`: `playerEngine.ts`, `alphaTabEngine.ts`, `PlayerService.ts`, `usePlayer.ts` (`setCursorScroll`), and their tests.
- `src/features/recordings/`: `youTubePlayer.ts` (the slow poll, the global given back, the seek guard), `recordingPlayer.ts` (a comment), `LineUp.tsx` and `LineUpParts.tsx` (`useFocusKeptInLineUp`, `FocusWatch`, the live region as a sibling, Cancel), `useSaveBarOne.ts` (per link), and their tests; `useSaveBarOne.test.tsx` is new.
- `src/test/fakePlayerEngine.ts`, `src/test/fakeRecordingPlayer.ts`.
- `tests/e2e/recordings.spec.ts`, `tests/e2e/recordingsPage.ts` (the stub's `seek`), `tests/db/song-links.test.ts`, `tests/unit/thirdPartyRequests.test.ts`, `tests/unit/video-sync-fixtures.test.ts`.
- `AGENTS.md` (the Unit 19 section, and Unit 14's line on `readAlong`), `docs/review-checklist.md` (one new row, three extended), `docs/plan.md` (Unit 19 only, and two rows of Open human checks), `docs/release.md` (one sentence).

### Verify

- `npm run check`: green, 6096 tests passed, 2 skipped (6066 before this stage).
- `npm run test:db`: 292 passed.
- e2e on a fresh build, `E2E_PORT=4283`, at phone, tablet and desktop: `tests/e2e/recordings.spec.ts` 67 passed, 8 skipped (the phone-only tests on the other two sizes); `tests/e2e/journey.spec.ts` and `tests/e2e/shortcuts.spec.ts` 42 passed; `tests/e2e/design.spec.ts -g "a song’s recordings"` 3 passed.
- Break checks through e2e, each on a build with one line put back: without `setCursorScroll(!readAlong)` the turn test fails; without the slow poll the following test fails at the paused seek. Both files were restored from copies and touched, and the dev server on port 5283 was checked with `curl` to be serving the fixed modules. It was left running.
- The real player check asked YouTube for one video from a scratch page on `127.0.0.1` (four runs, two of which gave up before the video played; no account, nothing of the app's or the user's sent); no user was created and nothing was reset or seeded.

## Copilot review (PR #39)

Four inline comments, each confirmed with a failing test first and fixed.

1. **A failed save was said only by the line-up that sent it.** `LineUp` read `save.error` from its own `useMutation`; after a source switch the line-up that came back showed the rolled-back value and no message. Now `useLineUpFailure(songId, linkId)` reads the link's latest save from the mutation cache. Until the link's next save, or five minutes after the mutation is last watched.
2. **An answer for a video the link no longer points at** wrote its offset onto the link in the cache (the request was filtered on the address, its handlers were not). Every handler now acts only while the cached link has the save's address, and the confirmed values are kept per link and address.
3. **Later, Later, Earlier, the first failing:** the cache held the third's value, the same number the first sent, so the failure rolled it back over a save still out. A failure now puts nothing back while another save of that video waits.
4. **Follow turned off stayed off for the next recording opened.** Kept per player now, like the first-tap asks.

Tests: `useSaveBarOne.test.tsx`, "one link, several saves" (three), and `SongPage.test.tsx`, Follow, "turned off on one recording…". Checklist: two new rows in section 1 ("An answer for what the row used to be", "A failure only the sender can say") and an example added to "Two writes to one item" and to "Kept per value, on a screen that outlives its item". AGENTS.md: the Unit 19 section says all four.

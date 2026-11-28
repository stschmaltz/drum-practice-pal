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

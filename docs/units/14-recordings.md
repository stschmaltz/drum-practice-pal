# Unit 14: Songs with recordings

## Build

### Summary

- **Links on a song.** One Original, one Drumless, any number of Other, in a new `song_links` table. A pasted link is read by `parseSongLink` (`src/features/recordings/songLinks.ts`): YouTube (watch, `youtu.be`, Shorts, live, embed, YouTube Music, with `t=` / `start=` kept), Spotify (track address with or without `intl-xx`, `spotify:track:`), or any other `https` address. It is saved in one normal form with the share sheets' tracking parameters gone. Anything else is refused with fixed copy and nothing is saved.
- **The song's overview** gains "Play along" above the loops once the song has a link: "Tab" (what "Play whole song" was), then "Original" and "Drumless". A YouTube link opens the play screen on that source; a Spotify or other link opens in a new tab and its button says where ("Drumless on Spotify"). Other links are a quiet list under the buttons. With no link the page is as it was, plus a quiet "Add a recording". "Manage recordings" (the header's new More menu, and what "Add a recording" opens) is a form in the page: a field per link with what it was recognised as, the note about Spotify and speed, Remove, "Add another link", Save, Cancel.
- **The play screen** (`/songs/:id/play`) has a source switch, Tab / Original / Drumless, for the YouTube sources the song has (none drawn when it has none). `?source=original|drumless` opens on one; the source is in the URL with `replace`, so Back leaves the screen. On a recording the video sits in a sticky box (16:9; full width up to a third of the window's height below 1024 px, 356 px wide from there, never under 200 px tall) with "Open in YouTube" beside it and the line "The video has its own controls. Switch to Tab for loops, speed and the metronome." The score stays under it, silent and scrolled by hand.
- **Recently played.** Opening a recording (the play screen on a recording, or a link out) sets `songs.last_played_at` with a queued write. The Songs list's "recently practised" order uses the later of that and the loops' practice.
- **Offline.** The buttons show from the cached links, off, with a note; the form's Save is off with a note; the video box says it needs a connection and draws no frame. The tab and its loops are untouched.

### Product walk-through (docs/product.md)

Walked before writing code, as the three users the stage asks for and the plan's own list. The unit as written fails none of them, forces no order and adds no chore, so it was built.

- _Day one with a song (uploaded today, no loops, no links):_ Songs → the song (1). The overview is as before with one more quiet action. "Add a recording" (2), paste, Save (3): "Tab", "Original" appear. "Original" (4), Play on the video (5). No loop is needed for any of it, and "Play whole song" was never taken away while there was no link.
- _Missing a piece the unit assumes:_
  - _No links_ (every song today): nothing new is asked for, nothing looks missing. The play screen has no switch and loads no frame.
  - _Only a Spotify link:_ the overview has "Original on Spotify"; the play screen has no switch, and `?source=original` falls back to Tab. The form says, where the link is added, that Spotify can't be slowed and a YouTube link can.
  - _No loops:_ recordings sit above the (empty) loops list and depend on nothing in it.
  - _No drum track:_ nothing here reads it.
  - _A song with no tab_ isn't possible yet (Unit 18). The play screen was still built so the video doesn't depend on the file: with the file failing or still loading, the video shows.
  - _A video that refuses embedding:_ YouTube says so inside the frame, where the app can't see it, so "Open in YouTube" is always there, not only after a failure.
- _Offline at the jam space:_ the song opens from the device as before. Recording buttons are drawn off with "You're offline. Recordings need a connection; the tab and its loops play without one." A press does nothing (no navigation, no new tab, no write). On the play screen at `?source=original` the box says "You're offline. The video needs a connection." over the readable score; when the connection is back the frame loads.
- _Taps to sound,_ from Songs: song (1), "Drumless" (2), Play on the video (3), as the plan counts. Spotify: song (1), "Original on Spotify" (2).
- _Chores:_ none added. `last_played_at` is recorded from what the app sees happen (a recording opened); nothing asks the user what they played.

One thing found on the way and settled in the open rather than raised: the plan's 320 px box is 180 px tall, under the 200 px YouTube's terms require (see below). It is 356 px wide, and the plan's line says so now.

### Files touched

New:

- `supabase/migrations/20261130000000_song_links.sql`
- `src/features/recordings/`: `songLinks.ts` (+ test), `songLinkForm.ts` (+ test), `songLinkKeys.ts`, `songLinksApi.ts`, `useSongLinks.ts`, `recordingGate.ts`, `recordingFocus.ts`, `PlayAlong.tsx`, `RecordingsForm.tsx`, `RecordingBox.tsx`
- `src/features/library/songPlayed.ts` (+ test)
- `src/test/linkTable.ts`
- `tests/db/song-links.test.ts`, `tests/e2e/recordings.spec.ts`, `tests/e2e/recordingsPage.ts`
- this note

Changed:

- `src/lib/database.types.ts` (regenerated), `src/lib/schema.ts` (+ test: link kinds and URL length against the SQL), `src/lib/routes.ts` (+ test: `SOURCE_PARAM`, `songSourcePath`)
- `src/features/library/`: `songForm.ts` (`LIBRARY_SELECT` reads `last_played_at`; `LibrarySong.last_played_at`, optional), `songList.ts` (the order), `songsApi.ts` (`markSongPlayed`), `useSongs.ts` (`songKeys.plays`; a deleted song's links cache goes), their tests
- `src/features/offline/`: `offlineDb.ts` (outbox kind `songPlayed`), `useOutboxReplay.ts` (replays it), `unsentWrites.ts` (link saves and played writes hold sign-out; the hook counts by the same list as the press)
- `src/features/song/`: `SongOverviewPage.tsx` (header More menu, `PlayAlong`), `SongPage.tsx` (`useSongSources`, the video bar, `recording` in `SongPlayer`), `useSongShortcuts.ts` (`off`), their tests
- `src/components/icons.tsx` (`video`, `external`), `src/test/fakeSupabase.ts` (`.in()`)
- `tests/e2e/playerPage.ts` (`openSongOverview` waits for "New loop", which every overview has), `tests/e2e/design.spec.ts` (the new screens audited), `tests/e2e/designPage.ts` (focus inside an `<iframe>` is counted, not measured)
- `AGENTS.md` (new section), `docs/plan.md` (the box's size, what was checked, Carried forward), `docs/release.md` (the migration needs no pre-push check)

### Decisions

- **With no link the overview is unchanged; "Tab" replaces "Play whole song" only once there is a link.** The plan says both "Tab (today's Play whole song)" and "a song with no links looks as it does now". Doing both means two layouts; the cost is that on the very first load of a song that has links (nothing cached), "Play whole song" is there for a moment and then "Play along" takes its place. Later visits draw from the persisted cache at once.
- **Every link is parsed again before use.** The stored `provider` is a record; the embed's video id and a link out's `href` are always the parser's output for the stored `url`. A row the parser refuses (written some other way) is not drawn at all.
- **Look-alike hosts are refused, not kept as plain links.** A host that contains "youtube", "youtu.be" or "spotify" and isn't under `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `spotify.com` or `spotify.link` is refused. So is any address with a `user:pass@` part. A third-party site with one of those words in its name can't be saved; that seemed the right side to err on.
- **`http:` is refused for every host**, YouTube included, as the plan's test list has it. A link pasted with no scheme is taken as `https://`.
- **A YouTube address that names no video** (a channel, a playlist) and **a Spotify address that names no track** (an album, a `spotify.link` short link) are plain links to "YouTube" / "Spotify": they open in a new tab and are never a source.
- **YouTube Music links are saved as youtube.com links** (the same video id), so "Open in YouTube" opens YouTube, not YouTube Music.
- **Nothing is removed until Save.** Remove empties the field ("This link is removed when you save."), Cancel leaves everything. That is the inline confirm for a destructive step here; there is no second question.
- **No upsert.** The update grant is `provider, url` only, and PostgREST's upsert sets every column sent. A save is delete (one request), updates, inserts, in that order, stopping at the first refusal. New rows take ids made when the form opens, and an insert that finds its id taken becomes an update, so Save pressed again after a lost answer adds nothing twice. Not one transaction: after a failure the message says some changes may have been saved, and the fields show what is saved once the list has been read again.
- **`last_played_at` is kept honest by the database**: a trigger keeps the later of the old and new time and caps it at `now()`. So the write needs no order (no mutation `scope`), a replay can't move it back, and a phone with a wrong clock can't pin a song to the top. The client shows its own time at once and takes what the database kept when it answers.
- **`last_played_at` is on the list's rows only** (`LibrarySong`), not on `Song`, and optional, so a list persisted by the earlier build reads as "never played" and `PERSISTED_CACHE_BUSTER` didn't need bumping (bumping it would have emptied every device's offline cache).
- **`?source=` is settled on a read made since the page opened** when the cached links lack the source (`chooseSource`); until then the screen shows the recording layout with "Loading the recording…", never the tab's controls. Once settled as Tab the parameter is taken out of the URL, so a link saved later only adds the switch.
- **Shortcuts on a recording: every key is left to the browser** (`useSongShortcuts({ off })`). Space, the speed and loop keys, M, D, S, C and `?` do nothing of the page's, the Shortcuts button isn't drawn, and nothing is cancelled, so Space scrolls or presses the focused control as in any page. YouTube's own keys work while its frame has focus. App-drawn controls for the video are Unit 15.
- **The loop panel is hidden, not unmounted, on a recording**, so a loop save still on its way keeps its form and its answer. An idle loop form is closed. A mouse drag on the score opens no form there.
- **The source switch isn't offered on a visit that came for the loop form** (`?new=1`, `?edit=`): that visit ends with the form.
- **The note is drawn twice in the markup** (beside the video from 1024 px, under the bar below it), one of them hidden by CSS at any width, so the bar stays short on a phone and uses its empty half on a laptop.
- **The video is 356 px wide from 1024 px, not 320**, and never under 200 px tall. See the next section.

### What the services allow, checked

Read on 2026-11-27 from the services' own pages (through the session's page-reading agent; nothing of the project was sent). Not checked by playing a real video: that is the Human check.

| Claim in the plan                                                     | Found                                                                                                                                                                                                      | Source                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `playsinline=1` keeps iOS out of fullscreen                           | Yes: "controls whether videos play inline or fullscreen on iOS"; 0 (fullscreen) is the default                                                                                                             | developers.google.com/youtube/player_parameters                              |
| `start=`                                                              | Whole seconds; the player seeks to the nearest keyframe, up to about two seconds early                                                                                                                     | same                                                                         |
| `rel=0`                                                               | Since 2018 it only keeps related videos to the same channel; they can't be turned off                                                                                                                      | same                                                                         |
| A box 320 px wide                                                     | **Too small.** "Embedded players must have a viewport that is at least 200px by 200px." 320 × 180 fails it; built as 356 × 200, and at least 200 px tall below 1024 px too                                 | same, and developers.google.com/youtube/terms/required-minimum-functionality |
| `referrerpolicy="strict-origin-when-cross-origin"`                    | Required in effect: the embed "must provide identification through the HTTP Referer request header", that policy is the one YouTube recommends, and without a Referer playback is blocked with "error 153" | required-minimum-functionality; support.google.com/youtube/answer/171780     |
| `youtube-nocookie.com`                                                | "Privacy Enhanced Mode": change the embed's domain to `https://www.youtube-nocookie.com`; available for embedded players on websites                                                                       | support.google.com/youtube/answer/171780                                     |
| Some videos refuse embedding; 101 and 150 only through the IFrame API | 101: the owner doesn't allow embedded playback; 150 is the same. (From a summary of the page, not its verbatim text.)                                                                                      | developers.google.com/youtube/iframe_api_reference                           |
| Speed 0.25x to 2x                                                     | The rates are per video ("may include values like 0.25, 0.5, 1, 1.5, and 2"), so the app's copy says the video "can be slowed down with its own controls" and names no figures                             | same                                                                         |
| Spotify can't be slowed                                               | The embed's API has play, pause, seek and load, and nothing that sets a rate                                                                                                                               | developer.spotify.com/documentation/embeds                                   |
| Spotify's embed plays full tracks only when logged in                 | **Not found** on Spotify's embed pages. The app doesn't rely on it: it never embeds Spotify, it links out                                                                                                  | same                                                                         |
| The first Play must be a tap on the video; ads; iOS stops on lock     | Not checked from documents. The app doesn't try to start the video, and promises none of these                                                                                                             |                                                                              |

Not used, so not checked: oEmbed (no title is fetched).

**The service worker and CSP.** The repo sets no Content-Security-Policy: `index.html` has no `<meta http-equiv>` and `wrangler.jsonc` sets no headers, so the frame needs nothing added. If a CSP is added later it needs `frame-src https://www.youtube-nocookie.com`. The service worker (vite-plugin-pwa `generateSW`) precaches this origin's files and has only `navigateFallback`, which answers navigations of the app's own pages; a cross-origin frame's requests aren't the app's to intercept and nothing is cached at run time, so it needs no change either. No `Referrer-Policy` header or meta is set, so the browser's default applies to the page and the frame's own attribute to the embed. Links out carry `rel="noopener noreferrer"`.

### Async windows and inputs

- **The links query loading** (overview): "Add a recording" isn't drawn until it is known there are none; "Play whole song" and "New loop" are there from the first render. A failed first load says so with Try again; a failed background refetch keeps the buttons.
- **The form's save pending** (`useSaveSongLinks`, online only):
  - Typing: refused (fields read-only, `setText` returns). Remove, "Add another link": locked (`aria-disabled`, handlers return).
  - Save again (press or Enter): refused. Cancel: locked. "Manage recordings" in the header menu: sets the same state, nothing changes.
  - Leaving the page by a link (Back, a loop, the nav): the write carries on in the mutation cache and its cache update still runs; a failure then is not shown. Known gap below.
  - A refetch of the links landing: only untouched fields change (the draft is by slot).
  - The connection dropping: the save fails ("The server couldn't be reached"), the form and draft stay.
  - The answer lost after the server did it: the error shows, the list is read again, the field then shows as saved; Save again sends an insert that becomes an update of the same id (or nothing).
  - A step refused part-way: later steps aren't sent; the list is read again.
  - Sign-out: held while it is pending (`unsentFilters`).
- **Another device adds an Original while this form has one typed**: after a refetch the field writes that row (an update). Before a refetch the insert is refused by the unique index (23505, no row of its id): "The server refused it", then the list is read again.
- **`?source=` waiting for the links** (play screen): the tab's Play and controls aren't drawn, so nothing can start; the player loads underneath. The answer: has the video → frame; lacks it, fails, or can't run offline → Tab, parameter removed. The user switching to Tab meanwhile: the URL changes and the wait ends.
- **Links refetched while on a recording**: the link removed → Tab, parameter removed; its address changed → a new frame (keyed by address).
- **Switching source while the tab plays or counts in**: an effect pauses the player (`pause()` calls a count-in off, and latches `haltRequested`, so a late `finished` can't restart it). One frame of sound may pass before the effect runs.
- **Switching source with a loop save pending**: the panel is hidden, mounted; the form closes on its answer. An idle form is closed by the effect.
- **The "played" write** (`markSongPlayedUnobserved`, queued):
  - Offline: paused, in the outbox, the list already moved. Online again: sent once.
  - A dropped request: retried. A refused token: refreshed and sent again. A refusal: dropped, outbox entry removed, nothing said (the list's order is a moment ahead until its next read).
  - The page closed first: replayed at the next start with its own time (`useOutboxReplay`).
  - The song deleted meanwhile: the update matches no row, which is not a failure.
  - Two in flight, or a replay after a newer one: the cache keeps the later time while another is pending; the database keeps the later whatever the order.
  - A Songs-list refetch during a retry wait can put the old time back over the optimistic one until the write's answer sets it again. Not held off, unlike loops: the order of one row flickers at worst.
  - Leaving the screen: the write isn't tied to a component.
  - StrictMode's second effect run: one write per opening (a ref latch); switching to Tab and back is another opening.
  - Sign-out: held while one is pending or in the outbox.
- **Going offline on a recording**: the frame is unmounted (the video stops) and the note shows; back online a new frame loads and that counts as an opening only if none was counted for this source since Tab.

### Tests added

- `songLinks.test.ts`: the parser as a table (19 YouTube shapes, start times, 6 Spotify shapes, 26 refusals including `javascript:`, `data:`, `http:`, look-alikes, a sign-in part, a 3000-character address), the round trip, the embed address, `usableLinks`, `videoSources`, `chooseSource`.
- `songLinkForm.test.ts`: select against fields, the grants against the SQL, `linkFields`, `planLinkSave`, `applyLinkSave`.
- `songPlayed.test.tsx`: the queued write (offline then online, dropped, token refused, refused, song gone, cache never back, sign-out gate, replay under StrictMode).
- `SongOverviewPage.test.tsx` "recordings": no links, add, a second kind, change, remove, Cancel, other links, refused addresses, an unusable saved row, a link out's `href` / `target` / `rel` and its write, a save pending, refused, lost and part-refused, offline (buttons, a press before the re-render, the form).
- `SongPage.test.tsx` "recordings": the switch, the frame's attributes, the tab stopping, a count-in called off, video to video, the keys, taps and drags, the loop form, a failed file, `?source=` (opens, falls back, waits, a link from another device, settled then left alone, unreadable links, a loop-form visit), Back, the write, offline.
- `useSongShortcuts.test.tsx` (`off`), `songList.test.ts`, `songForm.test.ts`, `useSongs.test.tsx`, `routes.test.ts`, `schema.test.ts`.
- `tests/db/song-links.test.ts` (51 tests): what the app writes, the unique index, the https and length checks, column grants (an upsert refused), anon, RLS both ways, timestamps, both cascades, `last_played_at` (never back, never ahead, not clearable, owner only).
- `tests/e2e/recordings.spec.ts` (YouTube and Spotify answered by a stub page): the frame's address and attributes, no request to YouTube on the overview, Songs, Stats, Settings or the tab's player, the frame's size and that it stays on screen, the way out, Space, Back, a Spotify link's `href` and the new tab it opens (with no `window.opener`), refused addresses, the Songs list's order after a recording is opened.
- `tests/e2e/design.spec.ts`: the overview with and without links, the form with an error, a 55-character host and a 1900-character address, and the play screen on a recording, through the audit and the focus-ring pass. It found a real fault during the build: a long Other link drawn with `truncate` made the page 13,000 px wide; it is `line-clamp-1 wrap-anywhere` now.

Run: `npm run check` green (5040 tests); `npm run test:db` green (246); `recordings.spec.ts` at all three sizes, `journey.spec.ts` at phone and desktop, and the new design test at all three, on `E2E_PORT=4283`. The full e2e suite was not run (the stage's instruction).

### WCAG notes

- No new kind of feature with a criterion of its own (no new character-key shortcut, time limit or drag-only gesture). Links that open a new tab say so in their accessible name ("(opens in a new tab)") and carry an icon.
- The frame has a `title` naming the song, the source and what it is. Focus inside it is on YouTube's own controls, which draw their own rings; the audit counts the frame as reached and doesn't measure it (the frame element matches neither `:focus` nor, reached by Tab, its box's `:focus-within` in Chromium).
- The form's error is tied to its field (`aria-describedby`, `aria-invalid`) and focus goes to the first refused field.

### Known gaps

- **Not heard or seen with a real video.** Everything about YouTube's player itself (the first tap, ads, a blocked video's card, speed, iOS inline playback, the lock screen) is the Human check.
- **A phone on its side.** The video keeps 200 px of height in a window 390 px tall; with "Open in YouTube" the sticky bar is about 260 px, and the score shows in what is left only by scrolling. Carried forward in the plan.
- **Leaving the overview while the form's save is pending** loses the failure message (the write and its cache update still finish). Only the form's own exits are locked; the page's other links are not.
- **A press on the source switch in the same tick as a loop form's Save** isn't refused; the form is kept mounted so its answer isn't lost, but the user is on the recording when it closes.
- **The cold first load of a song with links** swaps "Play whole song" for the "Play along" block when the links arrive (Decisions).
- **A refused "played" write says nothing** and leaves the list's order ahead of the server until its next read.
- **The seed has no links** (the database in use couldn't be reseeded). Carried forward.
- **`removeOutboxEntry`** forgets an entry's id before its row is deleted, so a replay reading in between sends that write once more. Older than this unit and harmless (every queued write is safe to send twice); seen in `songPlayed.test.tsx`. Carried forward.
- **StrictMode on the play screen** isn't covered by a component test (the latch is a ref; the replay is tested under StrictMode).
- **Other links have no name**, only their address. The plan gives them none.
- **Twenty Other links** make a long list on the overview above the loops; not capped.

### Manual verify

Needs `npm run db:start` (the migration applied: `npx supabase migration up`) and `npm run dev`.

1. Open a song. The overview is as before, plus "Add a recording". The network panel shows no request to YouTube.
2. "Add a recording": paste `https://youtu.be/<id>?si=…&t=90` into Original. The line under it says "YouTube video, starting at 1:30." Save. "Play along" shows Tab and Original.
3. More → Manage recordings: paste a Spotify track link into Drumless (the line says it can't be slowed), add another link, Save. "Drumless on Spotify" opens Spotify in a new tab.
4. Try `javascript:alert(1)`, `http://…`, `https://youtube.com.evil.test/watch?v=…` and plain words: each is refused with its own sentence and nothing is saved.
5. "Original": the play screen opens on the video with the score under it, no Play, no controls bar, no loop panel. Scroll: the video stays. Space does nothing to the tab. "Open in YouTube" opens the video at 1:30.
6. Switch to Tab while nothing plays, press Play, then switch to Original: the tab stops. Back goes to the song.
7. Songs: the song is first under "Recently practised".
8. Go offline (DevTools): the overview's recording buttons are off with a note; the play screen at `?source=original` says the video needs a connection; the tab plays.
9. Human check, on the hosted preview: a real video on the phone, tablet and laptop (first tap, inline on iOS, slowed with YouTube's speed menu), a video whose owner blocks embedding, a Spotify link opening the app on the phone and coming back.

## Test

Build's tests already walked the acceptance criteria. This stage went after what they left thin in the plan's Test focus and the checklist's rows: odd pastes, what else can happen round the form's save, the source switch with something else going on, a read that fails over what is showing, StrictMode, two tabs, and where a request to YouTube could be made from without a page drawing it.

### Tests added

- **`src/features/recordings/songLinks.test.ts`** (106 to 202 tests). The parser, as tables:
  - More YouTube shapes: a port, capitals, `watch/`, a doubled slash, `youtu.be/<id>/` and more path, another subdomain, two `v`, a full-width host, a backslash for a slash.
  - Start times: `t=1h`, `t=01m05s`, `t=1h30m`, `t` beside `start` (`t` wins), a whole day kept and a second over it dropped, `90S`, `30s1m`, a fragment `#t=90` (dropped). `t=1m30s`, `t=90`, `start=90` and `t=90s` all end as `&t=90s` in the link and `&start=90` in the frame.
  - Trailing junk (a full stop, a bracket, a comma, a twelfth character, `%00`): never played as some other video; a plain link to YouTube that says "Opens in a new tab". Wrapped in `<>`, quotes or brackets: refused.
  - Hosts in other scripts: saved as punycode and named by it; a path in another script encoded and read back the same; length counted on what is saved (400 "é" is too long once encoded); characters that don't show taken out.
  - An address that says one host and opens another (a backslash before `@`, the name in the path, the query or the fragment): named for where the browser really goes. More refusals: `mailto:`, `tel:`, `intent://`, `vnd.youtube:`, `youtube://`, `spotify://`, `javascript:` with a host, a tab or a control character in it, IPv6, a line break or no-break space inside.
  - One invariant over 18 pastes: what is saved is https, has no sign-in part, is within the limit, equals its own `URL.href`, parses back to the same link, and gives a frame address only when it is a YouTube video.
- **`src/features/song/SongOverviewPage.test.tsx`** (53 to 65), "other tabs, other reads and other ways out": Remove and "Add another link" locked while saving; an Original saved in another tab while one is typed here (refused once, then the same field updates that row); a link saved or removed in another tab showing at the next read; a read from before the save answering after it; a read that fails over the links (query state asserted as `error` with data first) keeping the buttons and the form; a removal and a change whose answers were lost, pressed again; a link changed here after another tab removed it (bug 3); a step after a link that has gone isn't sent; the page left by "New loop" while the save is on its way; a cold start offline with the song cached and its links never read.
- **`src/features/song/SongPage.test.tsx`** (146 to 166):
  - `?source=original` when the Original is a Spotify track, another site, a YouTube channel, or a row that says YouTube over an address the parser refuses: Tab, the parameter gone, nothing written.
  - Back and Forward: Forward opens the recording again; Forward after the sources were changed comes back to the one left on, and there is no entry beyond it.
  - A loop on the go: the recording stops it and leaves it set up (same loop, same speed, range never touched, no speed write); its session ends at the switch and ten minutes of video log nothing; a loop save still on its way lands with its form hidden.
  - Late events: a Play the engine reports only after the switch ends paused and its `finished` restarts nothing; the sounds coming in after the switch offer no Play.
  - Links read again while on a recording: removed (Tab, stopped), pointed at another video (a new frame, not another opening), a failed read and an unchanged read (the very same frame element, so the video isn't started over).
  - The connection: going and coming back on a recording is one opening; offline with the links never read, `?source=` is the tab, which plays, and a link read later is only offered.
  - StrictMode (at the root): one opening is one frame and one write.
- **`src/features/library/LibraryPage.test.tsx`** (+2): the list drawn in the order `last_played_at` gives, moving the moment a recording is opened, and not at all by date added.
- **`src/features/library/songPlayed.test.tsx`** (+2): two openings of one song in flight, answers in the order sent, and in the other order (bug 4, `it.fails`).
- **`src/features/auth/SignOutButton.test.tsx`** (+2): Sign out is off while a save of recordings or a "recording opened" time is unanswered.
- **`tests/unit/thirdPartyRequests.test.ts`** (new, 9): `index.html` loads nothing from another origin and has no preconnect, preload or frame; the service worker's configuration has no runtime cache and names no outside host; in `src/` a frame is made in one component, the player's address is built in one module, no script of YouTube's or Spotify's is loaded (IFrame API, oEmbed, thumbnails), and the frame's `allow` has no autoplay, camera, microphone or clipboard.
- **`tests/db/song-links.test.ts`** (51 to 68): the forms the parser saves pass the checks (punycode, encoded paths, `&t=90s`, a port, an IP address) and what it never saves is refused; what each step of a save meets after another device got there first (an update of a removed link is no error and no row; a removal sent twice; a second Original under a new id is a 23505 with no row of that id); a played time sent twice and then an older one leaves one time.
- **`tests/e2e/recordings.spec.ts`** (4 to 9 tests, each at three sizes):
  - The build: the served `index.html` has only this origin's addresses and no preconnect; every file in `sw.js`'s precache list is relative, none of it YouTube's or Spotify's.
  - With the service worker in charge of the page (`serviceWorkers: 'allow'`, after a reload): nothing asked of YouTube on the overview, Songs or the tab's player, then the frame loads the stub, with `start=90` from a pasted `t=1m30s`.
  - Offline: the buttons are off, a forced press goes nowhere (no navigation, no new tab, no request, no write); on a recording the frame gives way to the note with the score still there, and comes back.
  - Two tabs: the second sees the first's link at its next read (a faked clock past the 30 s `staleTime`), its form edits the same row, and the first sees that.
  - Back and Forward between the song and its recording.

### Checked that each fails without its code

Each group was run against the app with the code it covers broken, then the file put back from a copy:

| Break                                                                | Tests that failed                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The form's `if (saving) return` in Remove, Add and typing            | "locks Remove and Add another link too"                                     |
| `insertSongLink` not rethrowing the 23505                            | "an Original saved in another tab…"                                         |
| `cancelQueries` and the `onSettled` invalidation both gone           | the stale read, the lost removal                                            |
| "Add a recording" drawn before the links are read                    | the cold start offline                                                      |
| The effect that pauses the tab on a recording                        | the loop, the session, the late Play (and Build's two)                      |
| The `marked` latch                                                   | StrictMode's one write; one opening across an offline spell                 |
| The effect that drops `?source=`                                     | all five "is no video" rows, the removed link, offline never read           |
| `replace: false` in the switch                                       | Forward after the sources were changed (and Build's Back)                   |
| The loop panel unmounted on a recording                              | the loop save on its way                                                    |
| The frame's `key` gone, and a random one                             | the new frame for another video; the same frame over a failed or equal read |
| The frame drawn offline                                              | the connection going and coming back                                        |
| `videoSources` trusting any row; `chooseSource` waiting while paused | the "is no video" rows; offline never read                                  |
| `unsentFilters` without the two Unit 14 kinds                        | both sign-out rows                                                          |
| `onSuccess` taking the answer whole                                  | two played times, answers in the order sent                                 |
| The order ignoring `last_played_at`                                  | both library rows                                                           |
| A preconnect in `index.html`; a second frame on the overview         | the unit test's four, the e2e build test, the service-worker test           |
| The offline press not cancelled                                      | the e2e offline test                                                        |

Three tests pin behaviour and weren't broken: a link saved or removed in another tab showing at the next read, and the failed read over the overview's links (they hold by `usableLinks` reading `data`, with no branch to break short of deleting the block). The stale-read test holds by either of two lines (`cancelQueries`, or the invalidation that cancels the same read); it fails only with both gone.

The first StrictMode test passed with the latch removed: `<StrictMode>` in a layout route doesn't run a mount's effects twice, and the links weren't cached, so the screen didn't mount on the recording. It is now at the root with the links cached, and fails without the latch.

### Bugs found

1. **A look-alike in another script isn't refused** (low; logged). `https://youtubе.com/watch?v=…` with a Cyrillic "е" (and `https://xn--youtub-8of.com/…`) is saved as a plain link, where `youtube.com.evil.test` is refused as a look-alike. Repro: paste it into Original; the line under the field says "Link to xn--youtub-8of.com. Opens in a new tab." and Save keeps it. It is never played, embedded or named "YouTube", and the overview shows its punycode address, so the user can see it isn't YouTube. Not fixed: refusing it means deciding what to do with real sites in other scripts. Carried forward.
2. **The overview's own links stay live while the form saves** (low; Build's known gap, a checklist row 1 miss). Repro: type a link, hold the request (slow network), press Save, then "New loop" (or Back, or a loop's row). The save lands; had it failed, its message and the text typed would be gone. Not a few lines (five kinds of link to lock). Carried forward; the test pins that the save still lands.
3. **A link changed here after another device removed it was dropped without a word** (medium; fixed, 8 lines in `songLinksApi.ts`). Repro before the fix: open the form on two tabs; remove the Original and save in one; in the other change the Original's address and Save. The form closed as if saved and the song had no Original at the next read: PostgREST answers an update that matched no row as a success. `updateSongLink` now asks for the row back and reports none as gone, so the form stays with "It has been deleted, on this device or another."; the list is read again, the field keeps what was typed, and Save adds it. `tests/db/song-links.test.ts` shows the server's side of it.
4. **Two "recording opened" answers in the other order show the older time** (low; logged, `it.fails` in `songPlayed.test.tsx`). Repro: open Original then Drumless within one round trip, the first answer arriving last. The cached Songs list holds the first time until its next read; the database holds the later. A few seconds' difference in a sort key, so not worth a rushed fix: the obvious one (always keep the later) breaks the case where the device's clock runs ahead. Carried forward.

Not bugs, noted: `example.com:8080/x` pasted without a scheme is refused as "Only links that start with https://" (it parses as the scheme `example.com:`); `SPOTIFY:TRACK:…` in capitals is refused; a start time in the fragment (`#t=90`) is dropped; a loop saved while a recording is up is the active loop on return to Tab.

### Not covered

- A real YouTube player, as in Build: every test stops at the frame's address and attributes.
- Requests made by the service worker itself aren't seen by Playwright's routes; that the worker asks for nothing outside is shown from its precache list and its configuration, not by watching it.
- A count-in past its downbeat when a recording is chosen (the engine told to play, not yet playing): the source's effect calls `pause()`, which `PlayerService.countInEdges.test.ts` covers for that moment, but no test puts the two together.
- Focus when the source switch itself leaves (the last video link removed on another device while a radio has focus): it falls to `<body>`.
- Safari and Firefox: e2e is Chromium.
- The full e2e suite, by the stage's instruction: `recordings.spec.ts`, `journey.spec.ts`, `library.spec.ts` and the design test for the new screens were run at phone, tablet and desktop.

### Run

- `npm run check`: green, 5478 passed, 1 expected fail (bug 4), 2 skipped (was 5336).
- `npm run test:db`: green, 263 passed (was 246).
- e2e on `E2E_PORT=4283`: `recordings.spec.ts`, `journey.spec.ts` and `library.spec.ts`, 60 passed; `design.spec.ts` "a song's recordings", 3 passed; `recordings.spec.ts` twice over at each size, 54 passed.

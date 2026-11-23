# Unit 04: Song library and upload

## Build

**Summary:** The Library page replaces its Unit 03 placeholder. You can upload a Guitar Pro file with a picker or by dropping it on the page. The browser checks the file's signature, then parses it with alphaTab (lazy-loaded) for title, artist, tempo at bar 1, bar count and the percussion track, and hashes it (SHA-256). The file goes to Storage at `{user_id}/{song_id}.gp`, then the `songs` row is inserted; if the insert fails, the file is removed again.

- **Refused files:** MIDI gets a message pointing to Songsterr's Guitar Pro export. A non-GP, empty, over 20 MB or damaged file gets fixed copy and creates nothing.
- **Duplicates:** a duplicate (same bytes, any name) says so and links to the existing song. A duplicate raced in from another device is caught by the unique constraint, and its file is rolled back.
- **No drum track:** a file with no drum track uploads with `drum_track_index` null. A note shows after the upload and on its library entry.
- **The list:** it shows title, artist, bars, BPM, added date and last practiced. Search matches title or artist, ignoring case and accents, with every word required. Sort is by recently practiced (newest `loops.last_practiced_at`, never-practiced last) or recently added; both live in the URL.
- **Edit and delete:** edit title and artist inline (optimistic, only changed fields sent). Delete asks for confirmation inline and removes the file, then the row; loops and sessions cascade.

**Files**

- Library feature, `src/features/library/`:
  - `songFile.ts` + test: signature detection, `checkSongFile`, `SONG_FILE_MESSAGES`, `titleFromFileName`.
  - `songMetadata.ts` + test: pure `extractSongMetadata` over a structural `ScoreLike`, `cleanSongText`, `tempoAtFirstBar`, `drumTrackIndexOf`.
  - `parseScore.ts` + test: the only alphaTab import, Guitar Pro importers only. The test covers every fixture, junk bytes, damaged zip and GP5 headers, and the real exports in `tests/fixtures/real/` when present.
  - `songForm.ts` + test: columns and select literals, `toLibrarySong`, edit validation and diff, `searchSongs`, `sortSongs`, `isLibrarySort`.
  - `songsApi.ts` + test: `fetchSongs` (paged), `findSongByHash`, `uploadSong` (steps, rollback, cancel, duplicate race), `updateSong`, `deleteSong`. The test uses the fake client with `parseScore` mocked.
  - `useSongs.ts`: `songKeys`, `useSongs`, `useUploadSong`, `useUpdateSong` (optimistic), `useDeleteSong`.
  - `LibraryPage.tsx`, `UploadPanel.tsx`, `SongListItem.tsx`.
- Lib:
  - `src/lib/fetchAllPages.ts` + test.
  - `src/lib/sha256.ts` + test (subtle, with a plain fallback).
  - `src/lib/randomUuid.ts` + test.
  - `src/lib/schema.ts` adds `GP_FILE_MAX_BYTES` and `SONG_TEMPO_MAX`, with drift tests in `schema.test.ts`.
- Shared:
  - `src/components/styles.ts` adds `dangerButtonClass`.
  - `src/App.tsx` routes `/library` to `LibraryPage`.
  - `src/features/shell/PlaceholderPages.tsx` drops the Library placeholder.
- Test helpers:
  - `src/test/fakeSupabase.ts`: `insert`, `delete`, `order`, `limit`, `range` and `maybeSingle`; awaitable chains; `storage.from().upload/remove` answered by `storageResult`; `error.code`.
  - `src/test/setup.ts`: a `Blob.prototype.arrayBuffer` polyfill, which jsdom lacks.
- Fixtures: `tests/fixtures/sources.ts` adds `no-drums` (guitar only, 4 bars, 110 BPM), and `tests/fixtures/gp/no-drums.gp` is generated from it.
- e2e: `tests/e2e/library.spec.ts`:
  - upload with metadata checked in the DB and Storage
  - duplicate under another name, plus its Open link
  - no-drums null index and note
  - MIDI, text and truncated files refused, with nothing created
  - a dropped file
  - edit, search (survives reload), sort, cancel delete, delete
- Docs: `AGENTS.md` (new "Lists, files and ids" section; fake client and `dangerButtonClass` notes) and this note.

**Decisions**

- **Signature check before alphaTab, and Guitar Pro importers only.** `ScoreLoader.loadScoreFromBytes` tries GP3-5, GPX, GP7-8, then MusicXML, Capella and alphaTex. alphaTex reads junk as a one-bar, one-track score, so a damaged file would "upload" (Unit 01, issue 1). So:
  - `checkSongFile` first requires a zip (`PK\3\4`), `BCFZ`/`BCFS` or `FICHIER GUITAR PRO` header.
  - `parseScore` then runs only the importers whose name starts with "Guitar Pro", from the public `Environment.buildImporters()`, with the same try-next-on-`UnsupportedFormatError` loop.
  - A test pins the three importer names, so an alphaTab upgrade that renames them fails loudly.
- **Content decides, not the extension.** The picker has no `accept` filter, because iOS greys out extensions it has no type for. A `.mid`/`.midi` name or an `MThd` header gets the MIDI message. Anything else without a GP signature gets "That isn't a Guitar Pro file".
- **Parse before upload.** Nothing reaches the server until the file has passed the check and the parse. The duplicate lookup comes after hashing and before upload.
- **Row id chosen client-side** (`randomUuid`), so the Storage path `{user_id}/{song_id}.gp` exists before the insert, as `songs_file_path_matches_owner` requires. Every format is stored as `.gp`, because alphaTab detects the format from content.
- **Rollback.** A failed insert removes the file. If the removal also fails, the error says both. A `23505` on insert means another device added the same file meanwhile: the file is removed and the existing song is returned as a duplicate.
- **Cancel.** supabase-js Storage uploads take no abort signal. So Cancel is checked between steps, and a cancel that lands during the upload removes the file afterwards. Once the insert starts, the Cancel button goes away. Aborting the insert could leave a committed row whose file we'd then delete. Leaving the page doesn't cancel.
- **Delete order: file, then row.** If the row delete fails, the song is still listed, the error shows, and Delete can be retried (removing a missing file succeeds). Row first would leave an orphan file no UI can reach. Delete isn't optimistic.
- **Secure-context fallbacks.** `crypto.subtle` and `crypto.randomUUID` don't exist on `http://<LAN IP>:5173`, which is how phones reach the dev server. `sha256Hex` falls back to a plain SHA-256, tested against node's crypto for lengths 0 to 200 and a 300 kB buffer. `randomUuid` uses `getRandomValues`.
- **Last practiced** comes from an embedded `loops(last_practiced_at)` with one loop per song (ordered desc, nulls last). It's checked against the local stack with seeded loops. `toLibrarySong` still takes the max, in case the embed's ordering changes.
- **Paging.** `fetchSongs` reads 500 rows a page via `fetchAllPages`, ordered `created_at desc, id`. A test keeps the page size at or below `max_rows`.
- **Metadata clean-up.**
  - Title and artist have their whitespace collapsed and are cut to 300 code points (`char_length` counts code points).
  - A blank title falls back to the file name, then "Untitled".
  - A tempo outside `(0, 1000]` refuses the file rather than failing the insert.
  - A drum track is the first track with any percussion staff.
- **Search and sort in the URL** (`?q=`, `?sort=added`) with `replace`, so Back from a song keeps them. The empty-result message doesn't echo the query, per the URL-text rule.
- **Main bundle:** 165 kB gzip (was 159). `parseScore` is a 1.2 kB lazy chunk that pulls in `alphaTab.core` only on upload.

**Results**

- `npm run check`: green, 29 files, 384 tests (was 21 files, 261).
- `npm run e2e`: 90 passed (was 75), 15 new in `library.spec.ts` across phone, tablet and desktop. Local Supabase was running.
- Real Songsterr export (`tests/fixtures/real/…Little Sister….gp`): `parseScore.test.ts` matches the score helpers, and a one-off upload through the UI showed 119 bars, 155 BPM and the right title and artist. The local `.mid` export is refused as MIDI in the same test.

**Known gaps**

- GPX, GP5, GP4 and GP3 have no committed fixtures. alphaTab only exports GP7, so those paths are covered only by signature tests and by alphaTab's own importers. QA should try any real `.gp5`/`.gpx` on hand.
- One file per upload. Dropping several shows "Drop one file at a time."
- No upload progress percentage, only the step (Reading, Checking, Uploading, Saving). Storage's upload API reports no progress.
- Cancelling during the upload step waits for the request to finish, then removes the file.
- Component tests (Testing Library) for `LibraryPage`, `UploadPanel`, `SongListItem` and the hooks are left to the Test stage. The fake client now supports everything they need. "Recently practiced" ordering is unit tested (`sortSongs`) and was checked against the seeded stack, but not in e2e (that needs loops, Unit 08).
- `/songs/:id` is still the Unit 03 placeholder. The duplicate "Open" link lands there.
- QA issue 3 from Unit 03 (a 401 isn't treated as signed out) still applies to the new queries.
- alphaTab logs "Score import failed due to unexpected error" to the console for damaged files. The user sees the fixed message.

**Manual verify**

1. `npm run db:start`, `npm run db:reset` (seeds `demo@drumpal.test`), `npm run dev`.
2. Sign in as `demo@drumpal.test` (code in Mailpit at http://127.0.0.1:54324) and open Library. Three seeded songs show. "Recently practiced" puts Groove 120 first, then Tempo Change; "Recently added" reorders them.
3. Upload `tests/fixtures/gp/waltz-34.gp` with the button: "Added “Waltz 3-4”" shows with 12 bars and 140 BPM. Upload it again (or a renamed copy): an amber "already uploaded" message with an Open link.
4. Upload `tests/fixtures/gp/no-drums.gp`: the no-drum-track note shows after the upload and on its entry. Studio (http://127.0.0.1:54323) shows `drum_track_index` null.
5. Upload a `.mid`, a text file renamed `.gp`, and the first 300 bytes of a `.gp`. Each shows a red message, and nothing new appears in the list or the `gp-files` bucket.
6. Drag a `.gp` onto the dashed box (desktop). Dropping outside it does nothing.
7. Edit a song's title and artist, then search for the new artist and reload: the search stays. Delete a song with "Delete song": it disappears, and its file is gone from `gp-files/<user id>/`.
8. Phone on the LAN (`http://<laptop IP>:5173`): upload from the file picker. This exercises the non-secure-context hash and id fallbacks.

## Test

**Summary:** Added the component and hook tests the Build stage left open, plus four e2e flows: metadata for every fixture, insert rollback, cancel mid-upload, and the delete cascade with real loops and sessions. No app code changed and no test ids were added; the existing `drop-zone` id was enough.

**Coverage per acceptance criterion**

| Criterion                                                        | Proved by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A GP export uploads with correct metadata                        | e2e "every fixture uploads with the metadata its source declares" checks the list and the DB row against `tests/fixtures/sources.ts` for all five fixtures, and one Storage file per row. `parseScore.test.ts` (Build) covers the same per fixture and the local real exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| A non-GP or corrupt file shows a clear error and creates nothing | `UploadPanel.test.tsx` covers MIDI (with the Songsterr pointer), text, empty and damaged files: each shows fixed copy and makes no query or Storage call. The e2e refusal test (Build) checks the DB and bucket                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| No drum track: null index and a note                             | `UploadPanel.test.tsx` checks the note after the upload and the null in the insert. `SongListItem.test.tsx` checks the note on the entry. e2e covers it per fixture and in the Build test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Dedupe                                                           | `UploadPanel.test.tsx` shows the warning and the Open link to the existing song, with nothing uploaded. `useSongs.test.tsx` checks the list cache is untouched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Rollback when the insert fails                                   | `UploadPanel.test.tsx` shows the error and a Storage `remove` after `upload`. e2e fails the `POST /rest/v1/songs` with `page.route`, asserts one file upload was sent, then checks no row and an empty bucket folder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Cancel                                                           | `UploadPanel.test.tsx` holds the Storage upload, clicks Cancel, and checks the file is removed and nothing is inserted. It also checks there's no Cancel once saving starts. The e2e test holds the real upload request the same way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Delete cascade                                                   | e2e uploads two songs and adds a loop and a session to each via the admin client, then deletes one in the UI. The deleted song's file, loop and session are gone; the other song's stay. The DB-level cascade was already covered in `tests/db/schema.test.ts` and `constraints.test.ts`, so no new `tests/db` test was added                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Search, sort, edit                                               | `LibraryPage.test.tsx` covers loading, empty, a load error with a working retry, practiced and added sort, and search ignoring case and accents with every word required. It checks that search and sort are kept in and restored from the URL, that an unknown `sort` falls back, and that the no-match message doesn't echo the query. It also checks an edit shows at once and a delete drops the song. `SongListItem.test.tsx` covers only changed fields sent (trimmed, scoped by id and user), blank title refused, artist clearable, Cancel, a failed save keeping the form, "Keep it", and file-then-row delete with a failure keeping the row. e2e now also checks "Recently practiced" ordering with real loops (a Build known gap) |

**Files added or changed**

- `src/features/library/useSongs.test.tsx`: 9 tests covering keys, list load and error, upload cache insert and duplicate, optimistic update and rollback, and non-optimistic delete.
- `src/features/library/UploadPanel.test.tsx`: 13 tests.
- `src/features/library/SongListItem.test.tsx`: 10 tests.
- `src/features/library/LibraryPage.test.tsx`: 10 tests.
- `tests/e2e/library.spec.ts`: 4 new tests (12 runs across phone, tablet and desktop).

**Notes for later stages**

- A `useUploadSong` mutation stays pending until its `onSettled` refetch settles, so hook tests that hold the refetch assert on the cache, not on `isSuccess`.
- `renderRoutes`' hidden location readout holds the URL, so "doesn't echo the query" assertions pass `{ ignore: 'output' }`.
- The component tests mock `./parseScore` the same way `songsApi.test.ts` does. Real parsing stays in `parseScore.test.ts` and e2e.

**Bugs found:** none in app code.

**Results**

- `npm run check`: green, 33 files, 426 tests (was 29 and 384).
- `npm run e2e`: 102 passed (was 90). Local Supabase was running.
- `npm run test:db`: not re-run; no DB tests were added.

## QA

**Setup:** I ran local Supabase from `npm run db:start`. The app was the production build (`--mode development`) on `vite preview` at :4173. A throwaway Playwright suite (removed afterwards) drove it at phone 390x844, tablet 820x1180 and desktop 1440x900, with a fresh user per test. Screenshots are in `docs/units/04-shots/`, named `<size>-NN-<what>.png`. The edge-case files were generated outside the repo:

- empty, plain text renamed `.gp`, the first half of a `.gp`, a zip with no score
- fake GP5 and GPX headers followed by random bytes
- the real Songsterr `.mid` renamed `.gp`
- valid GP7 files padded to 300 KB, 1 MB, 15 MB, 19.8 MB and 21 MB
- scores with a 500-character title and 350-character artist, an HTML/accented title, and an empty title

I also used the real Songsterr export in `tests/fixtures/real/` (not committed).

**Acceptance criteria**

| Criterion                                                        | Result | Evidence                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Songsterr GP export uploads with correct metadata              | Pass   | The real export ("Little Sister", Queens of the Stone Age) uploads at every size with 155 BPM, 119 bars and `drum_track_index` 5, plus one file at `{user}/{song}.gp` (`*-02`). All five fixtures match their sources (`*-03`).      |
| A non-GP or corrupt file shows a clear error and creates nothing | Pass   | Each bad file gets its fixed message within about 100 ms, and the DB and bucket stay empty (`*-05-bad-*`). A good file still uploads after them. The real `.mid` and a `.mid` renamed `.gp` both get the Songsterr pointer (`*-04`). |
| No drum track: null index and a note in the UI                   | Pass   | `no-drums.gp` shows the amber note after upload and on its entry (`phone-03`).                                                                                                                                                       |

**QA focus**

- **Big files: pass.** The 15 MB and 19.8 MB files upload in about 1.3 s and 1.5 s locally (`*-06`). The 21 MB file is refused before anything is sent. A 500-character title and 350-character artist are cut to 300 and wrap without sideways scroll (`*-07`). No title falls back to the file name.
- **Slow network: pass.** With CDP throttling at 400 kbps and 400 ms latency, a 300 KB file finishes in about 15 s, including the lazy alphaTab chunk. The step label moves Reading, then Uploading (`*-10`, `*-11`). If the server can't be reached while the browser thinks it's online, the upload says "Couldn't upload x: Failed to fetch" (`*-17`). A delete in the same state says "Couldn't delete the song: Failed to fetch" and keeps the row (`*-18`).
- **Cancel mid-upload: pass.** Cancelling during a throttled 1 MB upload takes about 22 s, because it waits for the request (a known gap). It ends with "Upload cancelled. Nothing was saved." with no row and no file (`*-12`, `*-13`). An early cancel during Reading also ends cancelled.
- **Phone file picker: pass in Chromium; a real device is a Human check.**
  - Tapping the button opens a single-file chooser with no `accept` filter, and the button is 44 px tall.
  - A dropped file uploads. Dropping two shows "Drop one file at a time." (`*-27`).
  - Leaving the page mid-upload still adds the song (`*-29`).
- **Duplicates: pass.** The same bytes show the amber warning and an Open link (`*-19`). Two devices uploading the same new file at once end with one "Added" and one "already uploaded", one row and one file (`*-20`). Re-uploading a deleted song's file adds it again.
- **Search, sort, edit, delete: pass.**
  - Search matches title or artist, ignoring case and accents ("beyonce motley"; `*-08`). A `<script>` query shows the fixed no-match copy, and no dialog fires (`*-09`). An HTML title renders as text.
  - Search and sort survive a reload and a round trip to the song page (`*-23`, `*-24`).
  - A blank title and over-300 title and artist get inline errors (`*-22`). An emoji title with padding is saved trimmed.
  - Delete confirm, Keep it, and Delete song work, and the file is removed (`*-25`, `*-26`).

**Issues**

1. **Minor: an upload started offline sits at "Reading <file>…" with no feedback, and Cancel doesn't clear it.** TanStack Query's default `networkMode: 'online'` pauses the mutation before `uploadSong` runs.
   - The status claims it's reading. This happens even for a MIDI or empty file, which needs no network to refuse.
   - The picker stays disabled, and Cancel changes nothing until the connection returns. Then the upload either runs and adds the song, or, if cancelled, ends "Upload cancelled".
   - Edit and delete pause the same way, showing "Saving…" or "Deleting…" until reconnect, then completing.
   - Nothing is lost or duplicated, but it reads as a hang.
   - Repro: open Library, go offline (DevTools > Network > Offline), pick any file, wait, then press Cancel (`*-14`, `*-31`).
   - Suggestion for Unit 11, which owns the offline banner and disabling uploads: disable the picker offline, or give `useUploadSong` `networkMode: 'always'` so local refusals and network errors show at once.
2. **Minor: network failures show raw text.** For example "Couldn't upload pad-300kb.gp: Failed to fetch". The message is clear enough, but it isn't fixed copy. Unit 12's error-state polish could map fetch failures to "Check your connection and try again".
3. **Minor (known gap): cancelling during Uploading waits for the request to finish.** That was about 22 s for 1 MB on a slow link. Nothing is left behind.
4. **Cosmetic (fixed): the upload button wrapped to two lines at tablet width.** It was 64 px tall beside the hint text. I added `shrink-0` to the label in `UploadPanel.tsx`.
5. **Cosmetic (fixed): keyboard focus on the upload button was invisible.** The focused element is the visually hidden input. The label now shows the shared sky focus ring with `has-[:focus-visible]` (`desktop-30`).
6. **Cosmetic (not fixed, a11y):** the edit form's inline errors aren't linked to their inputs with `aria-describedby`; only `aria-invalid` is set. Left for Readability or Unit 12.

**Not covered:** expired or revoked sessions during upload (Unit 03 QA issue 3 still applies: a 401 isn't treated as signed out). There's also no real `.gp5`, `.gpx`, `.gp4` or `.gp3` file on hand, so those importers were only checked against their headers. Random bytes after a valid GP5 or GPX header are refused as damaged.

**Human check (Shane)**

- On an iPhone and an Android phone on the LAN (`http://<laptop IP>:5173`), upload a Songsterr `.gp` from Files or Downloads with the picker. Check that `.gp` isn't greyed out, and the non-secure-context hash and id fallbacks work.
- Try a real `.gp5` or `.gpx` export if you have one.

**Results**

- `npm run check`: green, 33 files, 426 tests.
- `npm run e2e`: 102 passed.
- App change: `src/features/library/UploadPanel.tsx`, upload label classes only.

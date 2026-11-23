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

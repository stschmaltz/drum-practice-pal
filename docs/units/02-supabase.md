# Unit 02: Supabase schema, auth, storage

## Build

**Summary:** Local Supabase project (CLI 3.2 as a dev dependency) with two migrations: the four tables from the Data model, their enums, checks, cascades, triggers and owner-only RLS; and a private `gp-files` Storage bucket with per-user path policies. Magic-link email auth is configured for the dev and preview servers, and a trigger creates `user_settings` on signup. Generated types are in `src/lib/database.types.ts`. `scripts/seed.ts` seeds two users with real fixture files in Storage, loops and sessions. `tests/db/` holds 52 RLS and constraint tests that run against the local stack.

Run on Windows 11 with Docker 28.1. Everything below actually ran: `supabase start`, `npm run db:reset` (migrations and seed), re-seeding, `npm run test:db` (52/52), `npm run db:types` (stable on regenerate), and a real magic-link email to Mailpit.

**Files**

- Supabase: `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20261122000000_schema.sql`, `supabase/migrations/20261122000100_storage.sql` (removed `supabase/.gitkeep`)
- App lib: `src/lib/database.types.ts` (generated), `src/lib/schema.ts`, `src/lib/schema.test.ts`
- Scripts: `scripts/seed.ts`, `scripts/local-supabase.ts`, `tests/unit/local-supabase.test.ts`
- DB tests: `vitest.db.config.ts`, `tests/db/helpers.ts`, `tests/db/rls.test.ts`, `tests/db/schema.test.ts`
- Config: `package.json` (db scripts, `supabase` dev dep, `@supabase/supabase-js`), `package-lock.json`, `tsconfig.node.json` (includes `vitest.db.config.ts`), `.env.example`, `.github/workflows/ci.yml` (new `db` job)
- Docs: `AGENTS.md` (commands, folder structure, new Supabase section), this note

**Schema decisions**

- **Cross-user references are impossible, not just hidden.** FK checks bypass RLS, so with a plain `song_id` FK a user could attach a loop to someone else's song by guessing its id. `loops` references `songs (id, user_id)` and `practice_sessions` references `loops (id, user_id)`, so the parent must have the same owner. Tested.
- **`songs.file_path` is pinned to `{user_id}/{id}.gp`** by a check constraint, so a row can only name its owner's file. The plan always uses `.gp`, whatever the upload format (.gpx, .gp5), because alphaTab loads from bytes. Unit 04 must upload under that name. `file_hash` must be 64 lowercase hex chars and is unique per user, not globally, so two users can upload the same file.
- **Song metadata is fixed after insert.** `authenticated` has column-level `update (title, artist)` on songs only. Tempo, bar count, path and hash come from the file. `user_id` can't be changed either.
- **`artist` is `not null default ''`**, not nullable, so search and sort don't need null handling. Title must be 1 to 300 chars.
- **`end_bar <= songs.bar_count`** is cross-table, so `loops_before_write` enforces it with a `check_violation` error (code 23514, the same as the other checks). Start and end are also checked: `1 <= start_bar <= end_bar`. Single-bar loops are allowed.
- **`finished_at` follows `status`.** The same trigger sets it on finish and clears it on reopen, and a check keeps the two consistent. Clients only flip `status`.
- **`last_practiced_at` is maintained by a trigger** on `practice_sessions` insert. It becomes the session's end time (`started_at + duration_seconds`) and never moves backwards, so an old session flushed late from the offline queue doesn't reorder "On the go". Unit 09 doesn't have to write it. This is slightly ahead of Unit 09's scope, but it's part of keeping the denormalized column correct, and doing it in the DB means the offline queue replays one write.
- **`practice_sessions` is append-only:** grants are select and insert, with no update or delete policy. Rows go when their loop does. The id has a default but clients should send their own; a retry with `upsert(row, { onConflict: 'id', ignoreDuplicates: true })` is a no-op (tested).
- **`user_settings`** has select and update only. The row comes from the `on_auth_user_created` trigger (security definer, execute revoked from API roles). Defaults: metronome on at 0.8 volume, count-in off, mode `start`, drums not muted. `metronome_volume` is 0 to 1.
- **`updated_at`** is bumped by triggers on songs, loops and user_settings, for last-write-wins in Unit 11.
- **Explicit grants.** Every table's privileges are revoked from `anon` and `authenticated` and re-granted per table, so nothing depends on Supabase's default privileges. Signed-out requests get nothing.
- **Indexes** match the expected reads: loops by song; loops by `(user_id, status, last_practiced_at desc)` for On the go; sessions by `(loop_id, started_at desc)` for history.

**Storage decisions**

- The bucket is created in a migration, not `config.toml`, so the hosted project gets it from the same migrations. It's private, with a 20 MiB limit. Real Songsterr exports are about 40 KB. No MIME restriction, because browsers report .gp files inconsistently. Unit 04 validates by parsing.
- Select and delete need the first path segment to be the caller's uid. Insert and update also need the whole name to match `{uid}/{uuid}.gp`, so nested folders or other extensions can't end up in the bucket.
- Deleting a song row doesn't delete its file. Unit 04's delete must remove both. Deleting an auth user doesn't remove Storage objects either; the seed script and test helpers remove them first.

**Auth decisions**

- Email provider with magic links. `site_url` is `http://localhost:5173`. Redirects allow the dev server on localhost, 127.0.0.1 and any LAN host on port 5173 (`http://*:5173/**`), plus the Playwright preview server on 4173.
- `auth.rate_limit.email_sent` was raised from 2 to 100 per hour so local and e2e sign-ins don't hit the limit.
- The hosted project (Unit 12) needs its own Site URL and redirect allow-list for the Workers production and preview hosts (`https://*-drum-practice-pal.stschmaltz.workers.dev/**`). That's dashboard config, not part of this unit.

**Tooling decisions**

- **Seed is a TS script, not `seed.sql`.** Seeded songs need real files in Storage, or Unit 05 has nothing to play. `[db.seed]` is disabled in `config.toml`, and `npm run db:reset` runs `supabase db reset && npm run db:seed`. The seed parses the fixture .gp files with the shared score helpers, so seeded metadata is what Unit 04's parser should produce. It deletes the seed users first, which cascades, so it can be re-run.
- **Seed data:** `demo@drumpal.test` has Groove 120 (loops "Main groove" 1-4 at 80% with a 100% target and two sessions; "Whole song" 1-16, finished), Tempo Change ("Across the tempo drop" 7-10 at 75%, target 110%; "Single bar" 9-9 at 50%, no target) and Multi Track (no loops). `other@drumpal.test` has Waltz 3-4 with one loop, so there's a second user's data to not see.
- **Keys:** the CLI's new-style publishable and secret keys (`sb_publishable_...`, `sb_secret_...`), not the legacy JWT anon and service-role keys. Env names: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (browser, for Unit 03), and `SUPABASE_SECRET_KEY` (node only). `scripts/local-supabase.ts` reads env first, then falls back to `supabase status -o json`, so local scripts and tests need no `.env.local`.
- **DB tests sign in through the real magic-link flow.** The admin API generates the link and the user's client calls `verifyOtp({ token_hash, type: 'email' })`. `'magiclink'` fails for first-time addresses because they get a signup link. No passwords are involved.
- **DB tests are outside `npm run check`**, since they need Docker. A new CI `db` job starts a trimmed stack, runs `npm run test:db`, checks that regenerated types match the committed file, and runs the seed. I ran the exact same start command locally and it passed. It hasn't run on GitHub yet.
- **Types** are generated for the `public` schema only and run through Prettier, so `npm run check` passes and regenerating gives an identical file.
- **`src/lib/schema.ts`** holds the bucket name, `songFilePath()`, speed and count-in bounds, text lengths, and `isValidSpeedRatio`/`isValidBarRange` for client-side validation in later units. Its test reads the migration SQL and fails if a constant drifts from the matching check.
- `tests/db` imports `src/` relatively (`../../src/lib/schema.ts`), because the node tsconfig has no `@/` alias. That's the same as `scripts/`.

**Results**

- `npm run check`: typecheck, lint and format clean. 9 files, 96 tests passed (24 new: `schema.test.ts` and `local-supabase.test.ts`).
- `npm run test:db`: 2 files, 52 tests passed, on both the full stack and the trimmed CI stack.
- `npm run db:reset`: both migrations apply cleanly and the seed reports 3 songs for demo and 1 for other. Spot-checked in psql: 4 songs, 5 loops, 2 settings rows, 4 Storage objects, `last_practiced_at` set from sessions, `finished_at` set only on the finished loop. Re-running `db:seed` replaces the data and leaves no orphaned files.
- A magic link sent to `demo@drumpal.test` through `/auth/v1/otp` arrived in Mailpit ("Your sign-in link").

**Known gaps**

- CI `db` job not yet run on GitHub (first PR run will tell).
- No hosted Supabase project yet. Linking it and applying migrations is Unit 12, or whenever Shane creates the project. The auth redirect URLs for Workers hosts need setting in the dashboard then.
- No Supabase client in `src/` and no UI. Both are Unit 03.
- `npm audit` still shows only the 3 Vitest 3 dev advisories from Unit 00. The new packages added none.
- `supabase db reset` doesn't wipe files already in the Storage container's volume, only their rows. Files left over from before a reset are orphaned on disk but unreachable. This only affects local disk.

**Manual verify**

1. `npm run db:start` (first run pulls Docker images; several minutes).
2. `npm run db:reset`: both migrations apply, then "seeded demo@drumpal.test: Groove 120, Tempo Change, Multi Track" and "seeded other@drumpal.test: Waltz 3-4".
3. `npm run test:db`: 52 passed.
4. Studio at http://127.0.0.1:54323: Table Editor shows the four tables with RLS enabled; Storage shows `gp-files` with a folder per seed user; Authentication > Policies lists the owner policies.
5. Magic link: `curl -X POST http://127.0.0.1:54321/auth/v1/otp -H "apikey: <PUBLISHABLE_KEY from npm run db:status>" -H "Content-Type: application/json" -d '{"email":"demo@drumpal.test"}'`, then open Mailpit at http://127.0.0.1:54324 and find "Your sign-in link".
6. `npm run db:types` leaves `git status` clean.

## Test

**Summary:** Reviewed Build's 52 DB tests against the Data model rules and the unit's acceptance criteria, then added 71 more: boundary and edge cases for every constraint, the cross-user writes Build's suite didn't try, signed-out writes, more Storage policy cases, and a test that runs the real seed script twice. No app code changed. `npm run test:db` is now 4 files, 123 tests.

**Added**

- `tests/db/constraints.test.ts` (new, 50 tests)
  - songs: single-bar song and 300-char title/artist accepted; 301 chars, tempo above 1000 or negative, short or uppercase `file_hash` rejected; `artist` defaults to `''`; a `file_path` in another user's folder rejected; `file_hash`, `file_path`, `original_tempo` and `drum_track_index` can't be changed after insert; `updated_at` bumps on rename.
  - loops: `speed_ratio` and `target_ratio` accepted at exactly 0.25 and 2.0, `target_ratio` null accepted; updates outside the bounds rejected; last bar as a single-bar loop accepted, a loop starting past the last bar rejected; an update making `start_bar > end_bar` rejected and the row left unchanged; 100-char name accepted, 101 rejected; a status outside the enum rejected (22P02); a loop inserted as finished gets `finished_at`; a `finished_at` sent with an active loop is cleared; editing a finished loop keeps its original `finished_at`; finish then reopen keeps the session history; a loop on a song that doesn't exist fails the FK.
  - practice_sessions: speed bounds 0.25 and 2.0 accepted, 0.2 rejected; can't be deleted directly; a retry with the same id and different values keeps the first write.
  - user_settings: `count_in_bars` 0, 1, 2 accepted, -1 rejected; `metronome_volume` 0 and 1 accepted, -0.1 rejected; an unknown `count_in_mode` rejected (22P02); `updated_at` bumps; users can't insert a second row or delete theirs.
  - cascades: deleting a loop removes only its own sessions and leaves the song and sibling loops; deleting a song leaves other songs' loops alone.
- `tests/db/rls.test.ts` (15 tests appended)
  - B can't insert a loop or session with `user_id` set to A (42501); B can't move their own loop onto A's song (23503) or reassign it to A; B can't hand their settings row to A; B gets nothing when selecting A's rows by id; two users can upload the same file (hash unique per user); A's rows are checked unchanged via the admin client after all of B's attempts.
  - Signed-out: anon can't insert, update or delete in any table, or list or upload files.
  - Storage: public URLs don't serve files (bucket is private); B can't create a signed URL for, move or copy A's file; B can't move their own file into A's folder; nested folders are rejected; the owner can replace (upsert) and delete their own file; uploads over 20 MiB are rejected.
- `tests/db/seed.test.ts` (new, 6 tests): runs `scripts/seed.ts` twice through tsx, then checks that each seed user exists exactly once with a new id and the first run's rows and files are gone; each user has one default settings row; demo has the expected songs, loop counts and the one finished loop; `finished_at` matches status and `last_practiced_at` is set when a loop has sessions; each user's Storage folder holds exactly their songs' `file_path`s, and each file's SHA-256 matches `file_hash`.

**Acceptance**

- `supabase start` + migrations + seed run clean: `npm run db:reset` applied both migrations and seeded both users on a fresh database; `seed.test.ts` covers re-running the seed.
- User A can't read or write user B's rows or files: covered for every table and for the bucket (select, insert, update, delete, reassigning ownership, attaching to another user's parent, storage download, list, upload, overwrite, move, copy, signed URL, delete), plus signed-out access.

**Notes**

- `seed.test.ts` replaces the seed users' data each run (new user ids). This matches `npm run db:seed`, but anything signed in as `demo@drumpal.test` needs to sign in again after `npm run test:db`.
- The DB tests share one database and rely on `fileParallelism: false`; each file creates its own throwaway users.

**Results**

- `npm run check`: typecheck, lint and format clean; 9 files, 96 tests passed (unchanged; DB tests stay outside check).
- `npm run test:db`: 4 files, 123 tests passed (52 from Build, 71 new), right after a fresh `npm run db:reset`.
- `npm run e2e` not run: Unit 02 has no UI flows, and e2e covers real flows from Unit 03 on.

**Bugs found**

- None. Every constraint, trigger and policy behaved as the Build section describes.

## QA

**Summary:** Ran the stack from a full stop, reset and reseeded, read every policy, grant, trigger and function in the migrations and in the live catalog, and attacked the REST, Storage and Auth APIs with the publishable key and two real magic-link users (raw `fetch`, script kept outside the repo). Cross-user isolation held everywhere. No blockers or majors. Seven minor issues: mostly columns clients can write that later units will depend on, plus two auth config items to settle before Unit 03 device testing and before the hosted project exists. Unit 02 has no UI, so the three-size browser walk doesn't apply. No app code or migrations changed.

Evidence in `docs/units/02-shots/`: `stop-start.log`, `fresh-start-reset-seed.log`, `policies.txt` (catalog queries), `adversarial-rest-storage.txt` (every probe and its response), `magic-link.txt`.

**Acceptance**

| Criterion                                         | Result | Evidence                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase start` + migrations + seed run clean    | Pass   | `npm run db:stop` then `db:start` (restores from backup): clean. Then `supabase stop --no-backup`, `db:start` (both migrations applied to an empty volume), `db:reset`, `db:seed`, `db:seed`: all exit 0, each seed run prints both users. Afterwards 2 users, 4 songs, 5 loops, 4 sessions, 2 settings rows, 4 Storage objects, no orphans. |
| User A can't read or write user B's rows or files | Pass   | Every cross-user probe below was denied or returned no rows. A's loop, song and file were checked unchanged afterwards.                                                                                                                                                                                                                      |
| `npm run db:types` produces no diff               | Pass   | `git status` clean after regenerating.                                                                                                                                                                                                                                                                                                       |
| `npm run check`                                   | Pass   | 9 files, 96 tests.                                                                                                                                                                                                                                                                                                                           |
| `npm run test:db`                                 | Pass   | 4 files, 123 tests.                                                                                                                                                                                                                                                                                                                          |

**Policy and privilege inspection (live catalog, not just the SQL)**

- RLS is enabled on all four tables. All 16 policies (12 public, 4 storage) are `to authenticated`. None target `anon` or `public`. Every insert and update policy has a `WITH CHECK`. There are no policies on `storage.buckets`, so users can't create or change buckets.
- Table grants: `anon` has none. `authenticated` has select, insert and delete on songs, plus update on `(title, artist)` only. It has full CRUD on loops, select and insert on practice_sessions, and select and update on user_settings.
- Functions: only `handle_new_user` is `SECURITY DEFINER`. It has `search_path = ''`, and execute is revoked from anon and authenticated. The three trigger functions run with invoker rights and also have `search_path = ''`. Anon still has execute on them through default privileges, but functions that return `trigger` aren't exposed: `/rest/v1/rpc/<name>` returns 404 PGRST202 for all four, both as anon and as a signed-in user.
- GraphQL: `pg_graphql` is not enabled, so `/graphql/v1` replies "extension is not enabled" to anon and to users.
- Bucket `gp-files`: private, 20 MiB limit, no MIME allow-list (by design, see Build).

**Adversarial probes (all behaved as expected unless listed under Issues)**

- Anon: select or insert on any table gives 401 `permission denied`. Download, public URL and list return nothing. A forged `alg: none` JWT is rejected (PGRST301).
- B against A's rows: selecting by id (with `count=exact`) returns `[]`. Patching A's loop or settings, or deleting A's song, affects 0 rows. Inserting a loop or session that points at A's song or loop fails the FK (23503). The same insert with `user_id = A` fails RLS (42501). An upsert onto A's loop id with `on_conflict=id` fails RLS (42501, USING expression).
- B trying to escalate through its own rows: updating a song's `user_id` or `file_path` gives 42501 (column not granted). A song row naming A's file fails `songs_file_path_matches_owner`. Moving a loop's `user_id` to A fails RLS, moving its `song_id` to A's song fails the FK, and moving the settings row's `user_id` to A fails RLS. Inserting a second settings row gives 42501.
- Bad input: NaN and Infinity speeds, a NaN tempo and a NaN volume all fail their checks. Postgres sorts NaN above every number, so the `between` checks catch it. A non-numeric speed gives 22P02 and an out-of-range int gives 22003. An `end_bar` past the song gives 23514 with a readable message. `start_bar` 0, an empty name and an unknown status are all rejected.
- Storage, B against A's file: download (direct, and with `../`, `%2e%2e` or `%2F` in the key), signed URL, and copy into B's folder all return 404. Upload, upsert, PUT, move into A's folder and a TUS resumable create in A's folder all return 403 (RLS). A single delete returns 403. A bulk delete returns `[]`, and the file survives.
- Storage path shapes, as B in B's own folder: uppercase uuid, uppercase uid folder, `.GP`, `.gpx`, `.gp.exe`, a nested folder, and `../` or `%2e%2e` traversal all return 403. A trailing `%0A` is rejected by Storage as InvalidKey. Storage normalises `uid//uuid.gp` to `uid/uuid.gp` and accepts it, which is correct. Other bucket names return 404.
- Auth: logout revokes the refresh token (400 `refresh_token_not_found`). The access token keeps working until it expires (up to `jwt_expiry`, 1 h), which is normal for Supabase JWTs.
- Magic link, end to end through Mailpit: the "Your sign-in link" email arrives. Its link returns 303 to `redirect_to` with the session in the URL fragment, and using it a second time gives `otp_expired`. Redirects to hosts that aren't allowed fall back to `site_url`.

**Issues**

1. **Minor: `http://*:5173/**` doesn't match LAN IP addresses.** Build says this allows "any LAN host on port 5173", but in GoTrue's glob a `*` doesn't match across dots. Repro: `POST /auth/v1/otp?redirect_to=http%3A%2F%2F192.168.1.20%3A5173%2F` with `{"email": "x@drumpal.test"}`, then open the email in Mailpit: its link has `redirect_to=http://localhost:5173`. `http://mylaptop:5173/x` (no dots) does match. This breaks nothing yet. But the email link also points at `http://127.0.0.1:54321/auth/v1/verify`, so a phone on the LAN can't open it either way. Unit 03 needs a plan for signing in locally on real devices. Options: `http://**:5173/**` plus `api_url` and `site_url` set to the LAN IP, or typing a 6-digit code from the email. The default email template doesn't include the code today.
2. **Minor here, must fix before the hosted project: password sign-up is open and auto-confirmed.** With `enable_signup = true` and `[auth.email] enable_confirmations = false`, `POST /auth/v1/signup` with any email and a password returns a session right away, even though the app is meant to be magic-link only. With the same settings in production, someone could register a victim's address with a password first and keep access after the victim later signs in by link. Locally it's harmless. For Unit 12: turn on email confirmations in the hosted project, and consider turning off sign-up once Shane's account exists. Repro: `curl -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: <publishable>" -H "Content-Type: application/json" -d '{"email":"qa-pw@drumpal.test","password":"qa-test-pw-123"}'` returns an `access_token`.
3. **Minor: a bad session timestamp pins `last_practiced_at` forever.** `practice_sessions` has no upper bound on `duration_seconds` and no sanity check on `started_at`, and the trigger never moves `last_practiced_at` backwards. Repro, as a signed-in user: insert a session on your own loop with `started_at = '9999-12-31T00:00:00Z'` and `duration_seconds = 34560000`. The loop's `last_practiced_at` becomes `10001-02-03`, and only a direct write to the column can fix it. `duration_seconds = 2147483647` starting now does the same (year 2094). A phone with a wrong clock would put a loop at the top of On the go for good. Suggestion for Unit 09: cap `duration_seconds` (say at 24 h) and require `started_at <= now() + interval '1 day'`, or clamp in the trigger.
4. **Minor: clients can write columns the DB is supposed to own.** Insert and update are granted on every column of loops, so a client can set:
   - `finished_at`: finishing with `finished_at = '2000-01-01'` keeps that value.
   - `last_practiced_at`: this bypasses the never-backwards rule.
   - `created_at`.
   - `id`: allowed when no sessions reference the loop.

   Inserts on songs and loops also accept any `created_at` and `updated_at`, because the trigger only overrides `updated_at` on update. Repro: insert a loop with `updated_at = '2999-01-01'`. It's stored as given. This matters for Unit 11's last-write-wins on `updated_at`. Suggestion: column-level grants on loops, as songs already has, and set `created_at` and `updated_at` in the before-insert triggers.

5. **Minor: logging a session bumps the loop's `updated_at`.** The after-insert trigger updates `last_practiced_at`, which fires `loops_before_write`, which sets `updated_at = now()`. Repro: note a loop's `updated_at`, insert a session on it, and read it again: it has moved. Under Unit 11's last-write-wins, a session synced from one device can make the loop look newer than an earlier offline speed edit on another device. Unit 11 should decide whether `updated_at` means "edited" or "touched". One option is to skip the bump when only `last_practiced_at` changed.
6. **Minor: whitespace-only names are accepted.** `songs.title = '   '` and `loops.name = '   '` pass the `char_length` checks. Repro: PATCH a loop with `{"name": "   "}`: 200. Units 04 and 08 should trim input. A `btrim(name) <> ''` check would also close it at the DB.
7. **Minor: Supabase's default privileges still give `anon` and `authenticated` full access to new public tables and functions** (see `pg_default_acl` in `policies.txt`). This unit revokes and re-grants per table, which is right. But a later migration that forgets the revoke-and-grant block would expose its table to signed-out users if RLS is off or too permissive. Suggestion: add "every new table: enable RLS, revoke all from anon and authenticated, grant explicitly" to the Supabase section of AGENTS.md, or add `alter default privileges ... revoke` in a migration.

These aren't issues, but later units should know them. Storage accepts any `{uid}/{uuid}.gp` object without a matching song row, so orphaned files are possible. Unit 04 should upload, then insert, and roll back the file if the insert fails, as planned. Storage also doesn't check the content type: a `text/html` upload is stored as given. The bucket is private and the app reads raw bytes, so the file is never served as HTML to anyone else.

**Human check (Shane)**

- The plan has none for Unit 02. When the hosted project is created (Unit 12): set the Site URL and the redirect allow-list for the Workers hosts (see Build), and turn on email confirmations (issue 2).

**Cleanup:** QA's throwaway users and files were deleted through the admin API, so the DB holds only the two seed users and their 4 files. Running `npm run test:db` re-creates the seed users with new ids.

**Verdict: PASS.** No blocker or major issues. Unit 03 should pick up issue 1, and Units 09 and 11, which own those flows, should pick up issues 3 to 5.

## Readability

**Summary:** Refactored the seed script and DB tests for clarity with no change to schema, policies, grants or app behavior. Duplicated node-side Supabase code moved into one shared module, the DB tests share their row builders and error codes, and the seed script is split into small steps. The SQL changed in comments only. AGENTS.md now states the revoke-and-grant rule from QA issue 7.

**Changes**

- New `scripts/supabase-admin.ts`: `createNodeClient` (no stored session), `createAdminClient`, `findUserIdsByEmail` and `removeUserFiles`. Before this, the seed script and `tests/db/helpers.ts` each built their own clients and each had a copy of "remove the user's Storage folder", and `seed.test.ts` had its own user lookup by email.
- `scripts/seed.ts`: split `seedSong` into `seedSong` (file plus songs row) and `seedLoop` (loop plus its sessions), and added `createSeedUser`. Session fixtures are now named objects (`{ daysAgo, minutes, speedRatio, repeats }`) instead of four-number tuples with a comment explaining the order. The fixture folder path is built with one `new URL(...)`. The output and seeded data are the same.
- `tests/db/helpers.ts`:
  - `PG` holds the Postgres error codes the tests assert on. It replaces the `CHECK_VIOLATION`/`INVALID_ENUM`/`INSUFFICIENT_PRIVILEGE` constants each file declared and the raw `'23503'`/`'42501'`/`'23505'` strings.
  - `sessionRow(userId, loopId, overrides)` replaces the two local `session()` builders and the three inline session literals in `rls.test.ts`.
  - `waitForClockTick()` replaces the three inline `setTimeout(20)` waits before `updated_at` checks, and says why the wait is there.
  - `songRow` now returns an `id: string` type, so `insertSong` no longer needs `as string`.
- `tests/db/*.test.ts` use those helpers. `seed.test.ts` names the seed emails once (`DEMO_EMAIL`, `OTHER_EMAIL`). No assertions were added, removed or loosened. The `last_practiced_at` test passes `duration_seconds: 90` explicitly, because its expected end time depends on it. That value used to be hidden in the local builder's defaults.
- `scripts/local-supabase.ts`: documented that `envFromProcess` needs all three variables, and that a partial env falls back to `supabase status`.
- Migrations, comments only:
  - The grants comment in the schema migration now explains why the revoke is needed: Supabase's default privileges.
  - The storage migration notes that files aren't tied to song rows, and that the path regex is repeated in the insert and update policies.
- `AGENTS.md` (Supabase section):
  - New rule from QA issue 7: every migration that creates a public table or function enables RLS, revokes `anon`/`authenticated` (and `public` execute for functions), and grants only what's needed, column-level where only some columns are client-editable.
  - Documented `scripts/supabase-admin.ts`, and the `tests/db/helpers.ts` row builders and `PG` codes for later DB tests to copy.

**Left alone**

- `src/lib/schema.ts`, `src/lib/schema.test.ts` and `vitest.db.config.ts` were already clear. `schema.test.ts` matches exact SQL strings, so the checks in the migrations weren't reformatted.
- `src/lib/database.types.ts` is generated. `npm run db:types` still gives no diff.
- QA issues 1 to 6 are logged for Units 03, 09, 11 and 12, and weren't fixed here.

**Results (before → after)**

- `npm run check`: 9 files, 96 tests → 9 files, 96 tests.
- `npm run test:db`: 4 files, 123 tests → 4 files, 123 tests.
- `npm run e2e`: 39 passed → 39 passed.
- `npm run db:reset`: both migrations apply, and the seed prints both users.
- `npm run db:types`: no diff.

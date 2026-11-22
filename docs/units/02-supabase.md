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

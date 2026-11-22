# AGENTS.md

Read this first. It's the contract every agent working on this repo follows.

## Project

Drum Practice Pal: a tab-first drum practice PWA. Users upload Guitar Pro files, save bar-range loops, and track practice speed over time across phone, tablet and laptop. No original audio; playback is alphaTab's synth plus a metronome.

- Plan and unit list: `docs/plan.md`
- Handoff notes, one per unit: `docs/units/NN-name.md`

## Stack

- Vite + React 19 + TypeScript (strict, `noUncheckedIndexedAccess`)
- React Router 7 (library mode, `react-router` package)
- Tailwind CSS 4 via `@tailwindcss/vite`
- TanStack Query 5 for all server state
- alphaTab (`@coderline/alphatab` 1.9) for parsing, rendering and playback, with its Vite plugin from the separate `@coderline/alphatab-vite` package (the old `@coderline/alphatab/vite` entry is deprecated). The plugin copies fonts and the soundfont into `public/font` and `public/soundfont` on every dev and build run; those folders are gitignored
- Supabase (Postgres, auth, storage) from Unit 02
- Vitest + Testing Library; Playwright for e2e
- Hosting: Cloudflare Workers static assets via Workers Builds (`wrangler.jsonc`). Every branch and PR gets a preview URL. SPA routing is handled by `not_found_handling`, so don't add `_redirects`

## Commands

| Command            | Use                                                                            |
| ------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`      | Dev server, exposed on the LAN for device testing                              |
| `npm run check`    | Typecheck, lint, format check, unit tests. Must pass at the end of every stage |
| `npm run e2e`      | Playwright against a build at phone, tablet, desktop; needs `npm run db:start` |
| `npm run fixtures` | Regenerate `tests/fixtures/gp/*.gp` from `tests/fixtures/sources.ts`           |
| `npm run format`   | Prettier write                                                                 |
| `npm run db:start` | Start local Supabase in Docker (`db:stop`, `db:status` likewise)               |
| `npm run db:reset` | Recreate the local database from migrations, then seed                         |
| `npm run db:seed`  | Re-seed demo users, songs (files in Storage), loops, sessions                  |
| `npm run db:types` | Regenerate `src/lib/database.types.ts`; run after every migration              |
| `npm run test:db`  | RLS and constraint tests in `tests/db/` against the running local stack        |

## Folder structure

```
src/
  features/<feature>/   # one folder per feature: components, hooks, logic, tests together
  components/           # shared UI used by 2+ features
  lib/                  # framework glue: query client, supabase client, shared helpers
  test/                 # test setup and shared test helpers (fake Supabase, render)
supabase/               # config.toml and migrations/ (seed lives in scripts/seed.ts)
tests/
  e2e/                  # Playwright specs
  unit/                 # node-environment tests not tied to one feature
  db/                   # tests against local Supabase (npm run test:db, not in check)
  fixtures/
    sources.ts          # alphaTex fixture definitions + expected metadata
    gp/                 # generated .gp files (committed)
    real/               # real Songsterr exports (gitignored, local only)
scripts/                # node scripts run with tsx
docs/
```

## Conventions

- Named exports only, except where a tool requires a default export.
- Import from `src` with the `@/` alias across features; relative imports inside a feature.
- Colocate tests as `*.test.ts(x)` next to the code they cover.
- Pure logic (tempo math, count-in scheduling, speed conversion) lives in plain `.ts` modules with no React or alphaTab imports, so it is unit-testable without mocks.
- Components stay thin: data via hooks, logic via pure modules.
- Every query and mutation goes through TanStack Query hooks; no ad hoc fetches in components.
- Speeds are stored as a ratio (`speed_ratio`, 1.0 = original). BPM is always derived from the tempo at the relevant bar; never store BPM.
- Bar numbers in the data model and UI are 1-based. alphaTab indexes are 0-based; convert at the boundary and name variables `barIndex` vs `barNumber` accordingly.
- Comments explain why, not what.
- Check every `error` that supabase-js (and any `{ data, error }` API) returns, and throw or handle it; never destructure only `data`. This holds in scripts and test helpers too, where a swallowed error leaves users, rows or files behind.
- List APIs return one page (`auth.admin.listUsers`, `storage.list` default 100, unranged `.select()`). Loop until exhausted wherever the code needs every item. In multi-step cleanup, stop at the first failed step.
- Never commit files from `tests/fixtures/real/`.
- alphaTex: wrap metadata arguments in parentheses (`\tuning (E4 B3 G3 D3 A2 E2)`, `\ts (3 4)`). Unwrapped arguments can swallow a following `( ... )` chord. `npm run fixtures` fails on any alphaTex warning.
- alphaTab settings: always pass `core.fontDirectory: '/font/'`. Without it, production builds look for the music font next to the lazy JS chunk (`/assets/font/`) and nothing renders; dev works, so it's easy to miss. `player.soundFont` has no default, so pass an absolute path such as `/soundfont/sonivox.sf2` (or load bytes with `api.loadSoundFont`). Load alphaTab only from lazily imported routes so it stays out of the main bundle.
- Tests that read .gp files use the helpers in `tests/unit/score-helpers.ts` (`loadScoreFile`, `tempoAtBar`, `drumTrackIndex`). Tests over `tests/fixtures/real/` must skip cleanly when the folder is empty (see `tests/unit/real-fixtures.test.ts`).
- Playwright specs that use DOM types inside `evaluate` start with `/// <reference lib="dom" />` (the node tsconfig has no DOM lib). alphaTab lazy-renders the score as it scrolls into view, so scroll the score container into view before asserting on notation (see `tests/e2e/spike.spec.ts`).

## Supabase

- Schema changes are new files in `supabase/migrations/` (`npx supabase migration new <name>`), never edits to applied ones. Then `npm run db:reset`, `npm run db:types`, and commit the regenerated types. CI fails if they drift.
- Every table has `user_id` and owner-only RLS (`user_id = (select auth.uid())`). Child tables reference their parent by `(id, user_id)` so a row can't point at another user's parent.
- Supabase's default privileges give `anon` and `authenticated` full access to every new public table and function. So every migration that creates one must, in the same file: enable RLS on the table, `revoke all ... from anon, authenticated`, then grant only what's needed (column-level `grant update (col, ...)` where only some columns are client-editable). For functions, `revoke execute ... from public, anon, authenticated` unless clients must call it. `anon` gets nothing. See the end of `20261122000000_schema.sql`.
- Storage: private bucket `gp-files`, objects at `{user_id}/{song_id}.gp`. Build paths with `songFilePath()` from `src/lib/schema.ts`; policies reject any other shape.
- `src/lib/schema.ts` mirrors DB limits (speed ratio 0.25 to 2.0, count-in bars, text lengths) for client-side validation; its test fails if they drift from the SQL.
- Keys: the browser gets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only. `SUPABASE_SECRET_KEY` bypasses RLS and is for node scripts and tests; never prefix it with `VITE_`. `.env.local` is gitignored; `.env.example` lists the names. Scripts and `tests/db` fall back to `supabase status`, so they need no env locally.
- Node-side clients and admin chores (`createAdminClient`, `createNodeClient`, `findUserIdsByEmail`, `removeUserFiles`) live in `scripts/supabase-admin.ts`, shared by the seed script and `tests/db`. Connection details come from `scripts/local-supabase.ts`.
- Database tests sign users in with the real magic-link flow (`createTestUser` in `tests/db/helpers.ts`) and clean up after themselves. Build rows with `songRow`, `sessionRow`, `insertSong` and `insertLoop`, and assert error codes with `PG.*` from the same file rather than raw strings. Local magic-link emails land in Mailpit at http://127.0.0.1:54324. Seed users: `demo@drumpal.test` and `other@drumpal.test`.

## App shell, auth and data hooks

- Routes live in `src/App.tsx`. Signed-in screens are children of the `<RequireAuth><AppShell /></RequireAuth>` layout route; `/login` and the dev-only `/spike` sit outside it. Player routes are `lazy()` so alphaTab stays out of the main bundle.
- Auth state comes from `useAuth()` (`src/lib/auth.ts`), fed by `AuthProvider` from `supabase.auth.onAuthStateChange`. Screens behind the guard call `useSignedInUser()` for the user. supabase-js refreshes tokens itself; a failed refresh arrives as `SIGNED_OUT`, which clears the query cache and the guard sends the user to `/login?next=...`. The redirect helpers (`loginPathFor`, `safeNextPath`, which rejects off-site targets, and `linkErrorFromHash`) live in `src/features/auth/loginRedirect.ts`.
- Sign-in is passwordless: one email with a magic link and a 6-digit code (`supabase/templates/sign_in.html`). The code is for phones on the LAN and installed PWAs, where the link can't open the app.
- One browser client: `supabase` from `src/lib/supabase.ts`, typed with `Database`. Env comes from the committed `.env.development` (local stack defaults) in dev and the e2e build; production builds need `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set, or the app shows a config message. A loopback API URL is rewritten to the page's host so LAN devices reach the local stack.
- **Data hook pattern** (copy `src/features/settings/`):
  - `<feature>Form.ts` (or another pure module): the selected columns as a `const` list plus a matching select string literal (a test keeps them equal), the row type picked from `Database`, and pure validation and diff helpers. It imports no client, so the API module, components and node tests share it.
  - `<feature>Api.ts`: plain async functions over `supabase` that return typed rows and throw on error via `unwrap(result, 'what')` or `throwIfError(result)` from `src/lib/supabaseResult.ts`. Select columns with a string literal (not a joined array) so supabase-js can type the row. Always scope by `user_id` as well as relying on RLS.
  - `use<Feature>.ts`: a key factory (`settingsKeys.forUser(userId)`; every key includes the user id) plus `useQuery`/`useMutation` hooks that call the API functions. Mutations that the user sees immediately are optimistic: `cancelQueries`, `setQueryData`, roll back in `onError`, set the server row in `onSuccess`, `invalidateQueries` in `onSettled`.
  - Components call only the hooks. Forms keep a local draft of only the fields the user touched (`Partial<Row> | null`), render `{ ...saved, ...draft }` so refetched values show through for every other field, and send only changed fields (`changedSettings`). A full-row draft would send stale values for fields another device changed.
- Component and hook tests mock the client with `vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule)`, call `resetFakeSupabase()` in `beforeEach`, and script answers on `fakeSupabase.auth.*` or `queryResult` (inspect sent payloads with `opArgs`). Render with `renderRoutes` / `wrapperFor` from `src/test/render.tsx`, which supply a retry-free QueryClient, a fixed auth state (`signedInAs`, `signedOut`, `loadingAuth`) and a `location` test id for asserting redirects. TanStack Query notifies on a timer, so wait (`findBy`, `waitFor`) after `setQueryData` instead of asserting synchronously.
- Shared UI: `src/components/` (`PageHeader`, `FullPageMessage`, `ErrorAlert` for inline `role="alert"` errors such as a failed mutation, class strings in `styles.ts`). Long pages split into one small component per step or fieldset in the same file (`LoginPage`'s `EmailStep` / `CodeStep`, `SettingsPage`'s fieldsets taking `{ values, errors, edit }`). Bottom tabs below 768 px (`md`), sidebar from 768 px; touch targets `min-h-11` (44 px) or more.
- Signed-in e2e specs use `tests/e2e/auth.ts`: `createE2eUser` / `deleteE2eUser` in `beforeEach` / `afterEach`, and `signIn(page, user, path)` through the real magic-link redirect. A second `browser.newContext()` is a second device; close extra contexts in a `finally`. Specs that don't sign in (smoke, spike) need no Supabase.

## Stage workflow

Each unit runs Build, Test, QA, Readability (see `docs/plan.md`). Each stage:

1. Reads this file, its unit section in `docs/plan.md`, and earlier notes in `docs/units/`.
2. Stays inside its unit's scope.
3. Ends with `npm run check` green (and `npm run e2e` from Unit 03 on).
4. Appends its section to `docs/units/NN-name.md`.
5. Updates this file when it sets a pattern later units should copy.

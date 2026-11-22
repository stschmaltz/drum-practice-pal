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
| `npm run e2e`      | Playwright against a production build at phone, tablet, desktop                |
| `npm run fixtures` | Regenerate `tests/fixtures/gp/*.gp` from `tests/fixtures/sources.ts`           |
| `npm run format`   | Prettier write                                                                 |

## Folder structure

```
src/
  features/<feature>/   # one folder per feature: components, hooks, logic, tests together
  components/           # shared UI used by 2+ features
  lib/                  # framework glue: query client, supabase client, shared helpers
  test/                 # test setup only
supabase/               # migrations, seed, config (Unit 02)
tests/
  e2e/                  # Playwright specs
  unit/                 # node-environment tests not tied to one feature
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
- Never commit files from `tests/fixtures/real/`.
- alphaTex: wrap metadata arguments in parentheses (`\tuning (E4 B3 G3 D3 A2 E2)`, `\ts (3 4)`). Unwrapped arguments can swallow a following `( ... )` chord. `npm run fixtures` fails on any alphaTex warning.
- Tests that read .gp files use the helpers in `tests/unit/score-helpers.ts` (`loadScoreFile`, `tempoAtBar`, `drumTrackIndex`). Tests over `tests/fixtures/real/` must skip cleanly when the folder is empty (see `tests/unit/real-fixtures.test.ts`).

## Stage workflow

Each unit runs Build, Test, QA, Readability (see `docs/plan.md`). Each stage:

1. Reads this file, its unit section in `docs/plan.md`, and earlier notes in `docs/units/`.
2. Stays inside its unit's scope.
3. Ends with `npm run check` green (and `npm run e2e` from Unit 03 on).
4. Appends its section to `docs/units/NN-name.md`.
5. Updates this file when it sets a pattern later units should copy.

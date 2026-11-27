# Drum Practice Pal

A tab-first drum practice app. Upload a Guitar Pro export once, save the bars you're working on as loops, and jump straight back in at your saved speed on a phone, a tablet or a laptop.

- **Jam mode**: the whole song with a follow cursor. Tap a bar to go there.
- **Loops**: a named bar range with its current speed and a target speed. Speed shows as a percent and as BPM (at the tempo of the loop's first bar), and you can type either.
- **Practice log**: each stretch of loop practice over 30 seconds is logged with its time, speed and passes. Reaching the target asks whether the loop is finished. Finished loops can be reopened, and their history is kept.
- **Playback**: alphaTab's synth plays the file's tracks, with a metronome, Mute drums, Drums only, and a count-in (off, 1 or 2 bars, at the start or before every repeat). There's no original audio.
- **Keyboard and pedals**: Space plays and pauses, the arrows and Page Up / Page Down switch loops, and `?` lists the rest. Single-letter keys can be turned off per device in Settings.
- **Installable and offline**: songs you've opened play without a connection. Practice and speed changes are saved on the device and sent once you're back online.

Sign-in is passwordless: one email with a link and a 6-digit code. Use the code on a phone or in the installed app, where the link opens in the browser instead.

## Getting started

You need Node 22 and Docker (for the local Supabase stack).

```bash
nvm use            # Node 22 (.nvmrc)
npm install
npm run db:start   # local Supabase in Docker
npm run db:reset   # apply the migrations and seed the demo users
npm run dev        # http://localhost:5173, also reachable from devices on your Wi-Fi
```

Sign in as `demo@drumpal.test`. The email, with its link and code, lands in Mailpit at http://127.0.0.1:54324. On a phone on the same Wi-Fi, use the code, because the link points at the laptop.

The demo user has songs, loops and a practice history. `other@drumpal.test` is a second user, for checking that neither can see the other's data.

### Files to try

Upload any Guitar Pro file (`.gp`, `.gpx`, `.gp5`, `.gp4`, `.gp3`, up to 20 MB). From Songsterr, use its Guitar Pro export, not MIDI. The synthetic fixtures in `tests/fixtures/gp/` work too: a 16-bar groove, a tempo change, three tracks, a waltz in 3/4, a song with a repeat, and one with no drum track.

## Scripts

| Script             | What it does                                                              |
| ------------------ | ------------------------------------------------------------------------- |
| `npm run dev`      | Vite dev server, exposed on the LAN                                       |
| `npm run build`    | Typecheck and production build                                            |
| `npm run check`    | Typecheck, lint, format check, unit tests (must pass before every commit) |
| `npm test`         | Vitest once                                                               |
| `npm run e2e`      | Playwright at phone, tablet and desktop sizes; needs the local stack      |
| `npm run test:db`  | RLS and constraint tests against the local stack                          |
| `npm run db:start` | Start local Supabase (`db:stop`, `db:status`)                             |
| `npm run db:reset` | Recreate the local database from the migrations, then seed it             |
| `npm run db:seed`  | Seed the demo users, songs, loops and sessions again                      |
| `npm run db:types` | Regenerate `src/lib/database.types.ts` after a migration                  |
| `npm run fixtures` | Regenerate the synthetic `.gp` fixtures from `tests/fixtures/sources.ts`  |
| `npm run icons`    | Redraw the app icons in `public/` from the design tokens                  |
| `npm run format`   | Prettier write                                                            |

`E2E_PORT=4180 npm run e2e` runs e2e on another port when 4173 is taken. Playwright reuses a preview server that is already running, so rebuild first (`npm run build -- --mode development`) if one from an earlier run is still up.

## How it's built

- Vite, React 19, TypeScript (strict), React Router 7, Tailwind CSS 4, TanStack Query 5.
- [alphaTab](https://alphatab.net) parses, renders and plays the Guitar Pro files. It is loaded only on the song page, so it stays out of the main bundle.
- Supabase for Postgres, auth and Storage. Every table is owner-only under row-level security. The files are in a private bucket under the user's id.
- vite-plugin-pwa (Workbox) caches the app, alphaTab's worker, the music font and the soundfont. Dexie (IndexedDB) keeps opened songs and the outbox of unsent writes.
- Vitest and Testing Library for units and components, and Playwright for e2e at 390 x 844, 820 x 1180 and 1440 x 900.
- Hosted on Cloudflare Workers (static assets), with a preview URL for every branch.

Speeds are stored as a ratio of the file's own tempo. BPM is always worked out from the tempo at the bar in question, because a song can change tempo part way through.

## Production

A production build reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the committed `.env.production` (the hosted project; both values are public). Without them it shows a "not connected" message. The steps to release, including the hosted auth settings that `supabase/config.toml` doesn't carry, are in [`docs/release.md`](docs/release.md).

## Working on it

Read [`AGENTS.md`](AGENTS.md) first for the conventions and patterns, then [`docs/plan.md`](docs/plan.md) for the plan, the units and what's carried forward. Each unit's handoff notes are in `docs/units/`, and `docs/review-checklist.md` lists the defect classes reviews keep finding.

Real Songsterr exports for local testing go in `tests/fixtures/real/`, which git ignores. Never commit them.

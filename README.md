# Drum Practice Pal

A tab-first drum practice tool. Upload a Guitar Pro export once, save loops, and jump straight back in at your saved speed on phone, tablet or laptop.

## Setup

Needs Node 22 and Docker (for the local Supabase stack).

```bash
nvm use            # Node 22
npm install
npm run db:start   # local Supabase in Docker
npm run db:reset   # apply migrations and seed demo@drumpal.test
npm run dev        # http://localhost:5173, also reachable from devices on your Wi-Fi
```

Sign in as `demo@drumpal.test`. The sign-in email, with its link and 6-digit code, lands in Mailpit at http://127.0.0.1:54324. On a phone on your Wi-Fi, use the code: the link points at the laptop.

## Scripts

| Script             | What it does                                    |
| ------------------ | ----------------------------------------------- |
| `npm run dev`      | Vite dev server                                 |
| `npm run build`    | Typecheck and production build                  |
| `npm run check`    | Typecheck, lint, format check, unit tests       |
| `npm test`         | Vitest once                                     |
| `npm run e2e`      | Playwright at phone, tablet and desktop sizes   |
| `npm run test:db`  | RLS and constraint tests against local Supabase |
| `npm run db:start` | Start local Supabase (`db:stop`, `db:status`)   |
| `npm run db:reset` | Recreate the local database and seed it         |
| `npm run db:types` | Regenerate types after a migration              |
| `npm run fixtures` | Regenerate synthetic .gp fixtures               |

## Working on it

`npm run e2e` and `npm run test:db` need the local stack running. The production build needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`); without them the app shows a "not connected" message.

Read `AGENTS.md` for conventions and `docs/plan.md` for the plan and unit list. Each unit's handoff notes live in `docs/units/`.

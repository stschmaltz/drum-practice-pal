# Drum Practice Pal

A tab-first drum practice tool. Upload a Guitar Pro export once, save loops, and jump straight back in at your saved speed on phone, tablet or laptop.

## Setup

```bash
nvm use            # Node 22
npm install
npm run fixtures   # builds tests/fixtures/gp/*.gp
npm run dev        # http://localhost:5173, also reachable from devices on your Wi-Fi
```

## Scripts

| Script             | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Vite dev server                               |
| `npm run build`    | Typecheck and production build                |
| `npm run check`    | Typecheck, lint, format check, unit tests     |
| `npm test`         | Vitest once                                   |
| `npm run e2e`      | Playwright at phone, tablet and desktop sizes |
| `npm run fixtures` | Regenerate synthetic .gp fixtures             |

## Working on it

Read `AGENTS.md` for conventions and `docs/plan.md` for the plan and unit list. Each unit's handoff notes live in `docs/units/`.

# Unit 00: Scaffold, conventions, CI, preview deploys

## Build

**Summary:** Vite + React + TS app with Tailwind, React Router, TanStack Query, ESLint, Prettier, Vitest, Playwright (phone, tablet, desktop projects), alphaTab and its Vite plugin, a synthetic fixture pipeline, a CI workflow, `AGENTS.md` and this note.

**Files**

- Config: `package.json`, `tsconfig*.json`, `vite.config.ts` (includes Vitest config), `playwright.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `.nvmrc`, `.gitignore`
- App: `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/queryClient.ts`
- Tests: `src/App.test.tsx`, `tests/e2e/smoke.spec.ts`, `tests/unit/fixtures.test.ts`
- Fixtures: `tests/fixtures/sources.ts`, `scripts/generate-fixtures.ts`
- CI: `.github/workflows/ci.yml`
- Docs: `AGENTS.md`, `README.md`, `docs/plan.md` (copy of the plan doc)

**Decisions**

- Fixtures are defined as alphaTex strings in TypeScript (`tests/fixtures/sources.ts`) with their expected metadata beside them, so the generator and the tests share one source of truth.
- Playwright runs against `build` + `preview`, not the dev server, so e2e covers what ships.
- Dev server binds to the LAN (`host: true`) for real-device checks without deploying.
- Preview deploys use Cloudflare Pages' Git integration (dashboard setup), not a workflow step, so no API token lives in the repo.

**Known gaps: NOT VERIFIED.** This stage was written without network access, so nothing has been installed or run. The next agent (or Shane) must:

1. `npm install`, commit `package-lock.json`.
2. `npm run fixtures`, then `npm run check`, then `npx playwright install chromium && npm run e2e`.
3. Fix whatever fails. Most likely spots:
   - alphaTex syntax in `tests/fixtures/sources.ts`: drum articulation names (`KickHit`, `SnareHit`, `HiHatClosed`), mid-song `\tempo 90`, `\ts 3 4`, multi-track `\tuning` lines.
   - alphaTab API names in the generator and test: `AlphaTexImporter.initFromString`, `Gp7Exporter.export`, `ScoreLoader.loadScoreFromBytes`, `masterBar.tempoAutomations`.
   - `@coderline/alphatab/vite` plugin import path and its interaction with Vitest.
   - `eslint-plugin-react-hooks` flat config usage if the installed major differs.
4. Commit the generated `tests/fixtures/gp/*.gp` files.

**Manual setup (Shane)**

1. Create a GitHub repo and push.
2. Cloudflare Pages: connect the repo; build command `npm run build`, output `dist`, Node 22. PRs then get preview URLs automatically.
3. Add an SPA fallback when routes arrive in Unit 03 (`public/_redirects` with `/* /index.html 200`).

**Manual verify**

- `npm run dev`, open the LAN URL on a phone: the home heading shows.

**Note on the real export in `tests/fixtures/real/`:** it's a `.mid` file. alphaTab imports Guitar Pro, MusicXML and alphaTex, not MIDI, so the app needs the Guitar Pro export from Songsterr. Keep a `.gp` export of the same song there for Unit 01 and Unit 04 testing.

## Real fixtures (local only, `tests/fixtures/real/`)

**Queens of the Stone Age - Little Sister** (Songsterr export)

- `.gp` (GP7/8 zip, 41 KB): use this one. 119 bars, all 4/4, no repeat markers.
- Tempo: 155 BPM at bar 1, changes to 163 at bar 11. Good real-world check of the tempo-at-bar BPM logic (Units 06 and 08).
- 6 tracks, drums last (index 5, `drumKit`). Drum detection must not assume track 0. Vocal lines come through as sax and flute instruments.
- `.mid` (93 KB): kept for reference only; the app doesn't import MIDI.

Tests that use real fixtures must skip cleanly when the file is missing (CI won't have it).

## Build (verified)

Run on Windows 11, Node 22.15.0, npm 10.9.2, with network access. Everything above is now installed, run and green.

**What changed and why**

- **Dependencies.** `npm install` resolved every pinned major with no conflicts. Notable versions: alphaTab 1.9.0, React 19.3, React Router 7.18, Vite 7.3, Vitest 3.2, Playwright 1.65, TypeScript 5.8, ESLint 9.39, `eslint-plugin-react-hooks` 5.2. `package-lock.json` is committed.
- **alphaTab Vite plugin.** In 1.9, `@coderline/alphatab/vite` is a deprecated re-export of a new optional peer package, `@coderline/alphatab-vite`. Without that package, Vite and Vitest fail to load the config. Added `@coderline/alphatab-vite@^1.9.0` as a dev dependency, imported it directly in `vite.config.ts`, and raised `@coderline/alphatab` to `^1.9.0` to match its peer range.
- **Plugin output in `public/`.** On every dev and build run, the plugin copies Bravura fonts and the Sonivox soundfont (5.8 MB) into `public/font` and `public/soundfont`. These are generated from `node_modules`, so they're added to `.gitignore` and `.prettierignore`. Unit 01 may pick a different soundfont; if it's a file we keep, put it somewhere other than those two folders.
- **alphaTex fixtures.** The articulation names (`KickHit`, `SnareHit`, `HiHatClosed`), `\tempo 90` mid-song and `\articulation defaults` were all correct. The multi-track fixture crashed: unwrapped `\tuning E4 ... E2` swallowed the next bar's `(0.6 2.5 2.4)` chord as its arguments. Fixed by wrapping metadata arguments in parentheses (`\tuning (...)`, `\ts (3 4)`), as alphaTab 1.9 recommends.
- **Fixture generator.** `readScore()` only throws on errors, so the generator now also fails on any alphaTex lexer, parser or semantic warning. A fixture that's read differently from how it's written can't slip through.
- **API names.** `AlphaTexImporter.initFromString` / `readScore`, `exporter.Gp7Exporter().export(score, settings)`, `importer.ScoreLoader.loadScoreFromBytes` and `masterBar.tempoAutomations[].value` all exist in 1.9 and work as written.
- **ESLint.** The react-hooks flat config (`reactHooks.configs.recommended.rules` spread into a config) works with 5.2. No change needed.
- **Prettier.** Ran `npm run format` once. It padded the Markdown tables in `AGENTS.md`, `docs/plan.md` and `README.md`, added a blank line after the agent frontmatter, and rewrapped a few lines. No content changes.
- **Line endings.** Added `.gitattributes` (`* text=auto eol=lf`, plus `binary` for .gp/.gpx/.gp3-5/.mid/images/soundfonts). Initialized git on `main`.
- **Real-export test.** New `tests/unit/real-fixtures.test.ts` loads every Guitar Pro file in `tests/fixtures/real/`. Each must parse with a title, bars and a percussion track. Little Sister must also match the values recorded above: 119 bars, 6 tracks, drums at index 5, 155 BPM at bars 1 and 10, 163 at bar 11. When the folder has no Guitar Pro files, it registers one skipped placeholder test, because Vitest fails a file with zero tests. Verified both ways: passes with the file present, and shows "1 skipped" with the folder empty.
- **Shared test helpers.** `tests/unit/score-helpers.ts` (`loadScoreFile`, `tempoAtBar`, `drumTrackIndex`) is now used by both fixture tests. Documented in `AGENTS.md`.
- **`.claude/launch.json`.** Adds a `dev` config so the desktop app's preview pane can start the dev server.

**Results**

- `npm run fixtures`: writes 4 files (groove-120: 16 bars; tempo-change: 16 bars; multi-track: 8 bars, 3 tracks; waltz-34: 12 bars), no warnings.
- `npm run check`: typecheck, lint and format all clean. Vitest: 3 files, 19 tests passed (16 synthetic fixture tests, 2 real-export tests with Little Sister present, 1 App test).
- `npm run build`: clean, 286 kB JS (90 kB gzip), no warnings.
- `npm run e2e`: 3 passed (phone, tablet, desktop).
- `npm run dev`: serves the home page at localhost:5173 and on the LAN. Page shows "Drum Practice Pal". No console errors.
- `.claude/agents` (builder, tester, qa, readability) and `.claude/commands/unit.md` are picked up by Claude Code.

**Still open**

- `npm audit` reports 3 dev-only advisories: `tinypool` (critical) and `@vitest/mocker` (moderate), both via Vitest 3. The fix is Vitest 5, a breaking major, so it's left for a deliberate upgrade. Nothing shipped to users is affected.
- Untested until CI runs: the CI workflow, the preview deploy, and a fresh-clone `npm ci`. All need the GitHub repo first.
- The SPA fallback (`public/_redirects`) is still due in Unit 03.

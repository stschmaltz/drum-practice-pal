# Unit 03: App shell and auth UI

## Build

**Summary:** A signed-in app shell on the Unit 02 backend. Routes `/login`, `/` (On the go), `/library`, `/songs/:id`, `/settings` and a not-found page; `/spike` stays lazy and outside the guard. Passwordless sign-in sends one email with a magic link and a 6-digit code, and either signs you in. An auth guard sends signed-out visitors to `/login?next=<where they were>`, and they come back there after signing in. Sign-out is on Settings (every size) and in the sidebar. supabase-js refreshes the session on its own. Navigation is bottom tabs below 768 px and a sidebar from 768 px. There's one typed browser Supabase client, and the TanStack Query hook pattern (API module, key factory, query hook, optimistic mutation hook) is documented in AGENTS.md. The Settings page reads and writes `user_settings`, validated against `src/lib/schema.ts`. On the go, Library and Song are placeholders for Units 09, 04 and 05/06.

**Files**

- App: `src/App.tsx` (routes, config error screen), `src/main.tsx` (adds `AuthProvider`), `src/env.d.ts` (typed `import.meta.env`)
- Lib: `src/lib/supabase.ts` (client), `src/lib/supabaseConfig.ts` + test (env reading, LAN URL rewrite), `src/lib/supabaseResult.ts` + test (`unwrap`, `throwIfError`), `src/lib/auth.ts` (context, `useAuth`, `useSignedInUser`), `src/lib/AuthProvider.tsx`, `src/lib/schema.ts` + test (metronome volume bounds, count-in modes, `isCountInBars`, `isCountInMode`, `isValidMetronomeVolume`, drift tests)
- Auth feature: `src/features/auth/LoginPage.tsx`, `RequireAuth.tsx`, `SignOutButton.tsx`, `useAuthActions.ts` (send email, verify code, sign out mutations), `nextPath.ts` + test (`safeNextPath`, `loginPathFor`, `linkErrorFromHash`), `signInInput.ts` + test (email and code normalising, `otp_length` drift test)
- Settings feature: `src/features/settings/SettingsPage.tsx`, `useSettings.ts`, `settingsApi.ts`, `settingsForm.ts` + test
- Shell feature: `src/features/shell/AppShell.tsx`, `navItems.ts`, `PlaceholderPages.tsx`
- Shared components: `src/components/FullPageMessage.tsx`, `PageHeader.tsx`, `styles.ts`
- Tests: `src/App.test.tsx` (rewritten: guard redirects), `tests/e2e/auth.ts` (sign-in helpers), `tests/e2e/auth.spec.ts`, `tests/e2e/settings.spec.ts`, `tests/e2e/smoke.spec.ts` (now asserts the login redirect)
- Supabase: `supabase/config.toml` (sign-in email templates, `http://**:5173/**` redirect), `supabase/templates/sign_in.html`
- Config: `.env.development` (new, committed), `.env.example`, `.gitignore` (`.env.*.local`), `playwright.config.ts` (builds with `--mode development`), `.github/workflows/ci.yml` (e2e job starts Supabase)
- Docs: `AGENTS.md` (new "App shell, auth and data hooks" section, e2e command note), this note
- Removed: `src/components/.gitkeep`, `src/features/.gitkeep` (folders have files now)

**Decisions**

- **Code as well as link (QA issue 1 from Unit 02).** On a phone testing the LAN dev server, the email link points at `127.0.0.1:54321`, which is the phone itself. An installed iOS PWA also opens links in Safari, not the app. So the email carries `{{ .Token }}` too, and the login page has a code field after sending (`verifyOtp` with `type: 'email'`, which covers first-time and returning users). The template is set for both `magic_link` and `confirmation`. Hosted projects don't read `config.toml` templates unless pushed, so Unit 12 must set the same template in the dashboard or with `supabase config push`.
- **LAN API rewrite.** When the configured URL is loopback and the page host isn't, the client uses the page's host with the same port (`resolveSupabaseUrl`). The local gateway listens on `0.0.0.0:54321`; I checked it answers on the LAN IP. Hosted URLs are never rewritten.
- **Redirect allow-list `http://**:5173/**`.** This now matches dotted host names (`mylaptop.local`), but GoTrue still falls back to `site_url` for raw IP hosts like `192.168.0.133`. That's why the code path exists. It's checked with real `/otp` calls and the links in Mailpit.
- **Env.** `.env.development` is committed with the CLI's fixed local URL and publishable key. These are the same on every install, and the key is browser-safe. Vite ranks `.env.[mode]` above `.env.local`, so overrides go in `.env.development.local`, now gitignored. Playwright builds with `--mode development`, which keeps the React production build (`NODE_ENV` is still production) but reads those env values. A build with no env (Workers Builds today, since there's no hosted project yet) renders "This build isn't connected to Supabase" instead of a blank page. A dummy client keeps the module importable.
- **Sign-out uses `scope: 'local'`.** supabase-js defaults to global, which would sign every device out. The `SIGNED_OUT` event clears the whole query cache, and every query key includes the user id, so one account's cache never shows for another.
- **Session refresh.** This uses supabase-js's `autoRefreshToken`, which pauses while the tab is hidden and refreshes on return. A refresh that fails, such as a revoked token, emits `SIGNED_OUT`, and the guard redirects. Nothing custom was needed.
- **Implicit flow (default), not PKCE.** PKCE needs the link opened in the same browser that requested it. Implicit puts the tokens in the URL fragment, and supabase-js strips them. An expired or reused link comes back as `#error_description=...`. The guard passes that to `/login` as router state, and the page shows "Email link is invalid or has expired. Send yourself a new one."
- **`?next=` is sanitised.** Only same-origin paths are allowed. `//host`, `/\host`, control characters and `/login` loops fall back to `/`.
- **Settings save is explicit, not autosave.** A draft stays `null` until you edit, so values refetched from another device show through untouched. Save sends only the changed fields, so it doesn't overwrite fields another device changed. The mutation is optimistic with rollback and a refetch. Count-in mode is disabled while count-in is Off. Volume is a 0 to 100% slider in 5% steps, stored as 0 to 1.
- **`/spike` stays public.** It reads no user data, and keeping it unguarded means its e2e spec needs no Supabase.
- **Main bundle grew** from about 91 kB to 159 kB gzip (supabase-js is about 68 kB gzip). alphaTab is still lazy.

**Results**

- `npm run check`: typecheck, lint and format clean. 14 files, 197 tests (was 9 files, 96 tests); new pure-logic tests for config, result unwrapping, next-path, sign-in input, settings form and schema limits.
- `npm run e2e`: 60 passed (phone, tablet, desktop). New: signed-out redirect, deep link back after magic link, code sign-in, wrong code, nav position per size and active state, sign-out then guard, settings round trip across two browser contexts, discard edits. The spike specs are unchanged and pass.
- `npm run test:db`: 4 files, 123 passed after the config change and stack restart.
- Checked by hand: screenshots of login and settings at all three sizes; the email template in Mailpit shows the link and the code.

**Known gaps**

- CI's e2e job now runs `supabase start`. That hasn't run on GitHub yet.
- Workers preview and production builds have no Supabase env, so they show the config message until Unit 12 creates the hosted project and sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build variables. Unit 12 also needs the sign-in email template and the redirect URLs for the Workers hosts in the dashboard.
- Signing out while offline fails with an error and leaves you signed in, because the `local` scope still calls the server. That's for Unit 11 to revisit.
- Session expiry was not tested by waiting out the 1 h JWT. It relies on supabase-js; QA should try a revoked refresh token, for example signing out globally from another client.
- Component-level tests (Testing Library) for LoginPage, RequireAuth and SettingsPage are left to the Test stage. The e2e specs cover the flows.
- The e2e settings test opens extra browser contexts without try/finally. A failed assertion leaves them for Playwright to close at worker teardown.

**Manual verify**

1. `npm run db:start` (restart it if it was running before this branch, so the new email template loads), then `npm run dev`.
2. Open http://localhost:5173/settings. You land on `/login?next=%2Fsettings`.
3. Enter `demo@drumpal.test` and send. In Mailpit (http://127.0.0.1:54324), the "Your Drum Practice Pal sign-in code" email has a link and a 6-digit code. Click the link: you land on Settings, signed in. Or type the code.
4. Change count-in to 2 bars and save. In a private window, sign in again and open Settings: it shows 2 bars. Back in the first window, refresh after changing something in the second.
5. Resize below 768 px: the sidebar becomes bottom tabs. Sign out: you return to `/login`, and `/library` redirects there again.
6. Phone on the same Wi-Fi: open `http://<laptop LAN IP>:5173`, send the email, and type the code from Mailpit on the laptop. Windows Firewall must allow ports 5173 and 54321.

## Test

**Summary:** Component and hook tests for every Unit 03 screen and the settings hook pattern, against a fake Supabase client, plus more e2e flows across phone, tablet and desktop. Fixed the e2e context teardown and one settings bug the new tests found.

**Files**

- Helpers: `src/test/fakeSupabase.ts` (fake `supabase` module: scripted auth calls, chainable `from().select/update/eq/single` recorded as `QueryCall`s, `emitAuthEvent`, `fakeSession`, `opArgs`), `src/test/render.tsx` (`renderRoutes`, `wrapperFor`, `testQueryClient`, `signedInAs` / `signedOut` / `loadingAuth`, `RouteMarker`, a `location` test id)
- Component tests: `src/features/auth/LoginPage.test.tsx` (13), `RequireAuth.test.tsx` (5), `SignOutButton.test.tsx` (2), `src/features/settings/SettingsPage.test.tsx` (10), `src/features/shell/AppShell.test.tsx` (8), `src/lib/AuthProvider.test.tsx` (8, includes `useAuth` / `useSignedInUser`)
- Hook tests: `src/features/settings/useSettings.test.tsx` (6)
- `src/App.test.tsx`: now on the shared fake; signed-out redirects (including an unknown path), signed-in routes and not found inside the shell, `/login` forwarding to `?next=`, and `SIGNED_OUT` sending you back to login (12)
- e2e: `tests/e2e/auth.spec.ts` adds session survives reload and `/login` forwards a signed-in user, a used magic link shows the expired-link message on a second device, signing out on one device leaves the other signed in, and not found inside the shell. `tests/e2e/settings.spec.ts` closes its extra contexts in `finally` and adds settings surviving sign-out and sign-in.
- App code: `src/features/settings/SettingsPage.tsx` (bug fix below). `AGENTS.md`: the draft pattern, the fake-Supabase test pattern, `finally` for extra contexts, and the `src/test/` description.

**Acceptance and focus coverage**

- Signed-out users land on `/login`: `App.test.tsx`, `RequireAuth.test.tsx` (`?next=` keeps path and query, `/` gives plain `/login`, loading shows neither the page nor a redirect), `smoke.spec.ts`, `auth.spec.ts`.
- Change a setting on one device, see it on another after refresh: `settings.spec.ts` with two contexts, plus sign-out and sign-in round trip. `SettingsPage.test.tsx` covers only changed fields being sent, Saved status, save errors keeping your edits, discard, count-in mode disabled while Off, load error with retry, and values from another device showing through.
- Hook pattern: `useSettings.test.tsx` checks the key includes the user id, the read is scoped by `user_id`, errors become query errors, the optimistic value shows while the write is in flight, only the changed fields are sent, the server row ends up in the cache, it refetches afterwards, it rolls back on error (the test holds the refetch so the rollback itself is checked), and a refetch already in flight doesn't overwrite the optimistic value. I checked the rollback and cancel tests fail with `onError` and `cancelQueries` removed.
- Auth guard and session: `AuthProvider.test.tsx` covers loading until `INITIAL_SESSION`, sign-in, refresh, `SIGNED_OUT` clearing the whole query cache (other events keep it), and unsubscribing on unmount. LoginPage covers the normalised email, `emailRedirectTo` = origin + `next`, unsafe `next` going home, code normalisation, wrong-length codes not sent, send and verify errors, send again, use a different email, and the expired-link message. Sign-out uses `scope: 'local'` (unit) and leaves the other device signed in (e2e).

**Bugs found**

1. **Fixed: a save overwrote fields another device had changed.** The settings draft held a full copy of the row taken at the first edit. If a refetch then brought in another device's change to a field you hadn't touched, `changedSettings(saved, draft)` saw your stale copy as a change and wrote the old value back. That breaks the Build note's claim that Save "doesn't overwrite fields another device changed". The fix is 8 lines in `SettingsPage.tsx`: the draft is now `Partial<Settings>` of the touched fields only, rendered as `{ ...saved, ...draft }`. Covered by "doesn't overwrite your edits with values refetched from another device", which fails on the Build version.

**Results**

- `npm run check`: green. 21 files, 256 tests (was 14 files, 197).
- `npm run e2e`: 75 passed (was 60), 25 per project.

**Notes for QA**

- jsdom has no CSS, so which nav shows at which width is only checked in e2e (`auth.spec.ts`, bounding boxes).
- Not covered by automation: a revoked refresh token (the guard's reaction to `SIGNED_OUT` is unit tested, but the server side isn't), offline sign-out (known gap), and the refetch-on-focus path between two real devices. Building the session-expiry case needs a short `jwt_expiry` stack, so it's left to QA.

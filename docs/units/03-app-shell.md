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

## QA

**Setup:** local Supabase from `npm run db:start`, production build (`--mode development`) on `vite preview` at :4173, driven by a throwaway Playwright suite (removed afterwards) at phone 390x844, tablet 820x1180 and desktop 1440x900, plus phone landscape 844x390. Screenshots are in `docs/units/03-shots/`, named `<size>-NN-<what>.png`. I checked one real sign-in email in Mailpit: it has the subject, link and code.

**Acceptance criteria**

| Criterion                                                              | Result | Evidence                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change a setting on one device, see it on another after refresh        | Pass   | Two browser contexts: B saves 2 bars and every repeat, A shows both after a reload (`*-16`). Concurrent edits to different fields on A and B both survive in the row. A focus refetch also picks up B's change, but only once the 30 s `staleTime` has passed                                                      |
| Signed-out users land on `/login`                                      | Pass   | Every guarded route and an unknown path redirect with `?next=` (`*-01`). The case also holds after sign-out, a revoked session, and a corrupt or tampered stored session (below)                                                                                                                                   |
| Routes `/login`, `/`, `/library`, `/songs/:id`, `/settings`, not found | Pass   | `*-01` to `*-07`                                                                                                                                                                                                                                                                                                   |
| Magic-link login, sign-out, auth guard, session refresh                | Pass   | Link and code both sign in, `?next=` survives the round trip including a query string (`/songs/abc?bar=5`), and sign-out returns to `/login`. Sign-out in one tab also signs out a second tab of the same browser. Refresh: see expired sessions                                                                   |
| Responsive nav                                                         | Pass   | Bottom tabs on phone (56 px tall, full width, content clears the bar at the bottom of Settings, `phone-08`). Sidebar on tablet and desktop (44 px links). Landscape phone gets the sidebar and still fits (`phone-40`). A long email truncates in the sidebar (`*-41`). There's no horizontal overflow at any size |
| Settings page reads and writes `user_settings`                         | Pass   | `*-05`, `*-30` to `*-35`                                                                                                                                                                                                                                                                                           |

**QA focus**

- **Nav at all sizes:** pass, as above.
- **Expired sessions:** pass.
  - Revoked refresh token (admin `signOut(jwt, 'global')`) with an expired access token in storage: a reload lands on `/login?next=%2Fsettings` and storage is cleared (`*-11`).
  - The same with the tab left open: with the clock fast-forwarded past the 1 h expiry, the auto-refresh fails and the open tab goes to `/login?next=%2Flibrary` with no reload (`*-12`).
  - A garbage refresh token, or corrupt JSON in the storage key, lands on `/login`.
  - See issues 3 and 4 for the two cases that don't.

**Other checks**

- **`?next=`:** `https://evil.example`, `//evil.example`, `/\evil.example`, `%2F%2Fevil.example`, `javascript:alert(1)`, `/\t/evil.example`, `/login`, `/login?next=...` and an empty value all go to `/`. `/%2F/evil.example`, `/ /evil.example`, `/library/../../settings` and a broken percent escape stay same-origin (not found or settings). Nothing ever left the origin.
- **Login input:**
  - Browser validation blocks an empty email, `foo`, `foo@`, `@bar.com` and `a b@c.com`.
  - `a@b` and `x@localhost` are accepted, and GoTrue sends to them. That's harmless.
  - A 300-character address shows "An email address is too long".
  - Mixed case with surrounding spaces is normalised.
  - Codes `12345`, `abcdef` and `1234567` are blocked by the input pattern. `000000` and a valid-shape wrong code show "That code didn't work". `12 34 56` is normalised before it's sent.
- **Reused or invalid magic link:** a second device lands on `/login?next=%2Fsettings` with the expired-link message (`*-23`, and `desktop-23b` after the fix below). A tampered token does the same.
- **Slow network, settings save (4 s PATCH delay):** shows "Saving…" with Save and Discard disabled (`*-30`). Editing during the save keeps the edit as a fresh draft, and Save is enabled again after (`*-31`). An aborted PATCH shows "Couldn't save your settings: TypeError: Failed to fetch" and keeps the draft (`*-32`). A slow load shows "Loading settings…" (`*-34`). A 500 on load shows the error and "Try again" (`*-35`).

**Fixed (cosmetic)**

- The expired-link alert read "Email link is invalid or has expired Send yourself a new one.", because GoTrue's description has no closing full stop. `LoginPage.tsx` now adds one when it's missing, and the `LoginPage.test.tsx` expectation is updated to match.

**Issues**

1. **Minor: offline sign-out hangs on "Signing out…" with no message.** This differs from the Build note, which expected an error. TanStack mutations default to `networkMode: 'online'`, so the mutation pauses while offline instead of failing. The button stays disabled on "Signing out…" until the connection is back, then the sign-out completes.
   - Repro: sign in, open Settings, go offline (DevTools), click Sign out. It stays on "Signing out…" (`*-15`). Go online and it signs out.
   - Suggest for Unit 11: sign out locally without the server call when offline (`signOut({ scope: 'local' })` still calls `/logout`), or set `networkMode: 'always'` and show the error.
2. **Minor: an offline settings save also hangs on "Saving…" with no message,** for the same reason (`desktop-33`). The save goes through on reconnect. Belongs with Unit 11's offline queue, but some hint that it's waiting for the network would help.
   - Repro: open Settings, change a field, go offline, click Save.
3. **Minor: a stored access token with a bad signature but a future expiry leaves you in the shell with a raw error.** Settings shows "Couldn't load your settings: No suitable key or wrong key type", and "Try again" can't recover. supabase-js won't refresh a token that hasn't expired, and the app doesn't treat a 401 as signed out. It needs tampering, or a JWT signing-key rotation on the server, and it recovers after the hour is up or after signing out. Worth handling once more data hooks exist: sign out on a PostgREST 401 / `PGRST301`.
   - Repro: sign in, edit the third segment of `access_token` in the `sb-127-auth-token` localStorage key, reload `/settings` (`*-14`).
4. **Minor, informational: a session revoked server-side keeps working until its access token expires (up to 1 h).** After an admin global sign-out, a reload with the unexpired JWT still loads Settings (`*-10`). This is standard Supabase behaviour, since PostgREST checks only the JWT. Note it for "sign out everywhere" expectations.
5. **Minor: "Send again" leaves the previous "That code didn't work" error showing,** next to the new send result.
   - Repro: enter a wrong code, then click "Send again" (`phone-22`).
   - Clicking "Send again" twice within a second shows GoTrue's rate-limit text, "you can only request this after 0 seconds" (same shot). The message is accurate but reads oddly.
6. **Minor: a `next` containing `#` breaks the magic link.** `/login?next=%2Fsettings%23frag` sends `redirect_to=.../settings#frag`. The link then returns to `/settings#frag#access_token=...`, which supabase-js can't parse, so you land back on `/login` with no message (`*-26`). The app never builds such a `next` itself (`loginPathFor` drops the hash), so only a hand-made URL hits this. The fix is for `safeNextPath` to strip `#...`. The code path is unaffected.
7. **Minor: the `error_description` from the URL fragment is shown verbatim on `/login`.** React escapes it, so there's no XSS: `<img onerror>` renders as text (`*-24`). But a crafted link can put any sentence in the red alert, and it survives a refresh through history state. Consider mapping known `error_code` values to fixed copy and using a generic message otherwise.
8. **Minor, by design: a focus refetch within 30 s of the last fetch doesn't pick up another device's change** (the `staleTime` is 30 s). The acceptance criterion says "after refresh", which works. Just noting that switching devices quickly won't show the change on focus.

No blocker or major issues.

**Human check (from the plan):** Unit 03 lists none. Worth a quick look for Shane:

- On a real phone over the LAN, type the 6-digit code from Mailpit and confirm the bottom tabs clear the iOS home indicator.
- In an installed iOS PWA later (Unit 11), confirm the code path works when links open in Safari.

**Results:** `npm run check` green (21 files, 256 tests). `npm run e2e` 75 passed. Not committed.

## Readability

**Summary:** Clarity-only refactor of the Unit 03 code, with no behaviour change. The query-hook pattern in `src/features/settings/` and `src/lib/` was already clean, so its hooks and API module are unchanged. The work went into the two long pages, a repeated error paragraph, the duplicated nav markup, and a misnamed auth module.

**Changes**

- **`src/features/auth/nextPath.ts` is now `loginRedirect.ts`** (test renamed too). It held `linkErrorFromHash` as well as the `?next=` helpers, so the old name didn't fit. `LoginRedirectState` moved there from `RequireAuth.tsx`, so `LoginPage` no longer imports a type from a sibling component. `LOGIN_PATH` is no longer exported, because nothing outside the module used it.
- **`src/components/ErrorAlert.tsx` (new):** the `<p role="alert" className="text-sm text-red-300">` that was repeated in `LoginPage` (3 times), `SignOutButton` and `SettingsPage`. The markup it renders is identical.
- **`LoginPage.tsx`** is split into `EmailStep` and `CodeStep` in the same file. The code and the verify mutation now live in `CodeStep`, so "Use a different email" clears them by unmounting the step instead of resetting them by hand. The email field stays in `LoginPage`, so the address is still filled in when you go back, as before. The full-stop fix for GoTrue's messages is now a named helper, `withFullStop`.
- **`SettingsPage.tsx`:** `SettingsForm` now renders `MetronomeFieldset`, `CountInFieldset` and `DrumsFieldset`. They share one `FieldsetProps` (`{ values, errors, edit }`). Changed fields are worked out once per render (`changes`), and `dirty` and submit both use that result instead of calling `changedSettings` twice. The draft check was redundant and is gone. Other changes: a `discard` handler, `countInOff` and `volumePercent` locals, and `COUNT_IN_LABELS` typed as `Record<CountInBars, string>`.
- **`AppShell.tsx`:** one `NavLinks` component renders `NAV_ITEMS` for both the sidebar and the bottom tabs, and each nav passes its own `linkClass(isActive)`.
- **`supabaseConfig.ts`:** the list of missing env names is only built when something is actually missing.
- **`settingsForm.ts`:** the header comment now says why the module is pure: the API module, the page and node tests all import it.
- **`AGENTS.md`:**
  - The data-hook pattern now lists the pure `<feature>Form.ts` module (column list, select literal, row type, validation and diff), next to the Api and hook files.
  - It names `loginRedirect.ts` for the redirect helpers.
  - It adds `ErrorAlert` to the shared components.
  - It notes that long pages split into one component per step or fieldset.

**Left alone on purpose**

- `useSettings.ts` and `settingsApi.ts` are short and read well, and each part maps to one step in AGENTS.md. A generic optimistic-mutation helper would be premature: loops and sessions in Units 08 and 09 cache lists, so their merge step will differ.
- Field-level validation messages keep their plain `<p>` / `<span>` without `role="alert"`. Changing that would change what screen readers announce.
- The earlier sections of this note still name `nextPath.ts`. They record what each stage did at the time.
- QA issues 1 to 8 are unchanged, as none were in scope for a behaviour-neutral pass.

**Results**

- Before: `npm run check` green (21 files, 256 tests), `npm run e2e` 75 passed.
- After: `npm run check` green (21 files, 256 tests), `npm run e2e` 75 passed. Local Supabase was running for e2e.
- Not committed.

## Review

**Scope:** every line of `git diff unit-02...HEAD` (app code, tests, helpers, CI, config, env). I checked every supabase-js call in the diff for `error` handling (`throwIfError` / `unwrap` in the app; `if (error) throw` in `tests/e2e/auth.ts`). There's no unpaginated list API in the diff; `removeUserFiles` (from Unit 02) already loops. Listeners are covered: `AuthProvider` unsubscribes on unmount, and its test proves it.

**Findings, fixed**

1. **`?next=` with a fragment broke the magic link** (QA issue 6), `src/features/auth/loginRedirect.ts` `safeNextPath`. `/settings#frag` became `redirect_to=.../settings#frag`, and GoTrue's `#access_token=...` was then appended after it. `safeNextPath` now drops everything from the first `#`, and the `/login` loop check runs on what's left (`/login#x` goes home). Tests: `loginRedirect.test.ts` (fragment cases; the old test that expected `/library#top` to be kept now expects `/library`) and `LoginPage.test.tsx` ("builds the magic link from ?next= without its fragment").
2. **A crafted link could put any text in the login alert** (QA issue 7, unvalidated input across a trust boundary), `loginRedirect.ts` `linkErrorFromHash`. The URL's `error_description` was rendered verbatim, so anyone could send a link that shows a phishing sentence in a red alert on our origin. It now returns fixed copy: `EXPIRED_LINK_MESSAGE` for `error_code=otp_expired` (what GoTrue sends for expired and reused links) and `FAILED_LINK_MESSAGE` otherwise. `withFullStop` in `LoginPage.tsx` was then dead code and is removed. Tests: `loginRedirect.test.ts`, `RequireAuth.test.tsx` and `LoginPage.test.tsx` use the constants. The e2e "used magic link" spec still passes.
3. **"Send again" left the last code's error on screen** (QA issue 5), `src/features/auth/LoginPage.tsx` `CodeStep`. The button now calls `verifyCode.reset()` before sending. Test: "clears a rejected code's error when the email is sent again".
4. **e2e teardown could tear down the wrong user and hide the real failure**, `tests/e2e/auth.spec.ts` and `settings.spec.ts`. `user` was a module-level `let` set in `beforeEach`. If `createE2eUser` threw, `afterEach` deleted the previous test's (already deleted) user, and that "User not found" error replaced the real one. `tests/e2e/auth.ts` now exports `test` with a `user` fixture: it creates the user, runs the test, then deletes files and then the user. Teardown only runs for a user that was actually created, and a failed cleanup still fails the test. After the run, `auth.users` holds 0 `e2e-%` rows.
5. **Leaked `console.error` spies**, `src/lib/AuthProvider.test.tsx`. Two `vi.spyOn(console, 'error')` calls were never restored, so console errors stayed silenced for the rest of the file. Added `afterEach(vi.restoreAllMocks)` in that `describe`. In Vitest 3 this only restores spies, not the `vi.fn`s in the fake client.

**Checked, no change**

- `.env.development` commits `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`. It matches `supabase status` here: it's the CLI's fixed local key, browser-safe, and no signing keys are configured. No secret key is committed, and `.env.*.local` is ignored.
- CI e2e job: `supabase start` keeps Mailpit, Storage and Auth (needed for `removeUserFiles` and sign-in). The e2e build reads `.env.development`, whose key matches a fresh CLI stack. `tests/e2e/auth.ts` gets the secret key from `supabase status`. I can't run it on GitHub from here.
- Sign-out cache: `SIGNED_OUT` calls `queryClient.clear()` (queries and mutations), and every key includes the user id.
- Settings edit during a save: `edit()` calls `update.reset()`, which detaches the per-call `onSuccess`, so a mid-save edit isn't wiped. The hook-level `onError` / `onSuccess` / `onSettled` still run, and the draft keeps any field whose save failed. A second, overlapping save is possible. Rollback and the refetch in `onSettled` make the cache converge, so I left it.
- `safeNextPath` and case: `/LOGIN` isn't caught by the loop check, but `/LOGIN` renders `LoginPage`, which sends a signed-in user to `/`. So it can't loop or leave the origin.

**Open issues (not fixed in scope)**

- QA issues 1 and 2 (offline sign-out and offline save stay on "Signing out…" / "Saving…"): Unit 11.
- QA issue 3 (a bad-signature JWT with a future expiry leaves the shell showing a raw error): needs a global "sign out on 401 / PGRST301" policy in the query client. Better done once Unit 04 adds more data hooks.
- QA issue 4 (a revoked session works until its JWT expires): Supabase's behaviour, informational.
- Possible CI flake: `[auth.rate_limit] token_verifications = 30` and `sign_in_sign_ups = 30` per 5 minutes per IP. One e2e run does about 45 verifications across three projects, and CI retries add more. It passes locally, but if CI shows 429s on `/verify` or `/otp`, raise those local limits in `config.toml`.

**AGENTS.md:** e2e specs take `{ user }` from the `tests/e2e/auth.ts` fixture rather than a module-level `let`. A new convention: never render URL-supplied text as a message, and strip fragments from return paths.

**Results:** `npm run check` green (21 files, 261 tests, was 256). `npm run e2e` 75 passed. `npm run test:db` 123 passed. Not committed.

# Release checklist

How Drum Practice Pal goes from `main` to the hosted Supabase project and the production Cloudflare Worker. Everything here needs Shane's Supabase and Cloudflare accounts; no agent runs it. Work top to bottom, and tick each box in the release PR or a copy of this file.

`supabase/config.toml` configures only the local stack. None of its auth settings reach the hosted project, so section 3 sets each one again by hand.

## 1. Before anything is pushed

- [ ] `main` is green in CI: `check`, `e2e` (the first-run journey in `tests/e2e/journey.spec.ts` at phone, tablet and desktop) and `db` (RLS tests, generated types match the migrations, seed runs).
- [ ] Locally: `npm run check`, `npm run e2e`, `npm run test:db` against a fresh `npm run db:reset`.
- [ ] The Open human checks in `docs/plan.md` that block a release are done (at least the Unit 01, 05 and 11 iPhone rows: sound on the first tap, the ringer switch, an installed PWA offline).

## 2. Hosted database

Migrations live in `supabase/migrations/` and reach the hosted project with `supabase db push` (by hand; nothing in CI pushes). Link once:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

### Checks to run first

Two migrations add checks that existing rows can fail, and one failing row stops the whole push. Run these in the hosted SQL editor; each must return no rows. Fix (or delete) any row they find before pushing.

- [ ] Before `20261123000000_loops_grants.sql` (blank names are refused from here on):

  ```sql
  select id from songs where title !~ '\S';
  select id from loops where name !~ '\S';
  ```

- [ ] Before `20261123010000_session_sanity.sql` (a session longer than a day is refused):

  ```sql
  select id from practice_sessions where duration_seconds > 86400;
  ```

### Push

- [ ] `npx supabase db push --dry-run` lists only the migrations you expect.
- [ ] `npx supabase db push`.
- [ ] The types the app was built with match the hosted schema: `npx supabase gen types typescript --project-id <project-ref> --schema public | npx prettier --stdin-filepath x.ts | diff - src/lib/database.types.ts` prints nothing.
- [ ] Storage: the private bucket `gp-files` exists with a 20 MB file size limit (made by `20261122000100_storage.sql`). The project-wide upload limit (Storage settings) is at least 20 MB.
- [ ] Data API: the exposed schemas are `public` and `graphql_public`, and "Max rows" is at least 500 (`fetchAllPages` reads pages of 500; the local stack has 1000).
- [ ] Spot check RLS: in the SQL editor, `select tablename, rowsecurity from pg_tables where schemaname = 'public';` shows `true` for `songs`, `loops`, `practice_sessions`, `user_settings`.

## 3. Hosted auth, against `supabase/config.toml`

Authentication settings in the Supabase dashboard. The middle column is what the local stack uses, so e2e and dev behave this way; the right column is what production should be.

| Setting (dashboard)                       | Local (`config.toml`)                         | Production                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL Configuration: Site URL               | `http://localhost:5173`                       | The production Worker's URL (`https://drum-practice-pal.<account>.workers.dev` or the custom domain)                                                                             |
| URL Configuration: Redirect URLs          | localhost and LAN ports 5173 and 4173         | The production URL with `/**`, and the preview URLs (`https://*-drum-practice-pal.<account>.workers.dev/**`) if previews share this project. No `localhost` entries              |
| Providers: Email enabled                  | on                                            | on (the magic link and the 6-digit code)                                                                                                                                         |
| Sign In / Providers: Allow new users      | `enable_signup = true`                        | On until Shane's account exists, then off. With it off, `signInWithOtp` (`shouldCreateUser: true`) refuses an unknown address with a fixed "New accounts are closed." in the app |
| Confirm email                             | `enable_confirmations = false`                | On, so the password sign-up the API still accepts can't make a confirmed account without the email                                                                               |
| Anonymous sign-ins                        | off                                           | off                                                                                                                                                                              |
| Email OTP length                          | `otp_length = 6`                              | 6 (the login page's code field takes six digits)                                                                                                                                 |
| Email OTP expiry                          | `otp_expiry = 3600`                           | 3600 s                                                                                                                                                                           |
| Email rate limit / minimum interval       | 100 an hour, `max_frequency = "1s"`           | The hosted defaults are fine once a custom SMTP sender is set (the built-in sender allows a few emails an hour and is for testing only)                                          |
| SMTP                                      | Mailpit (local only)                          | A real sender (Resend, Postmark, SES...), from an address on a domain with SPF and DKIM                                                                                          |
| Email templates: Magic link               | subject "Your Drum Practice Pal sign-in code" | Same subject; body pasted from `supabase/templates/sign_in.html`, which carries both `{{ .ConfirmationURL }}` and `{{ .Token }}`                                                 |
| Email templates: Confirm signup           | the same subject and template                 | The same, so a first sign-in also gets the code                                                                                                                                  |
| JWT expiry                                | `jwt_expiry = 3600`                           | 3600 s                                                                                                                                                                           |
| Refresh token rotation / reuse interval   | on, 10 s                                      | on, 10 s                                                                                                                                                                         |
| Secure email change                       | `double_confirm_changes = true`               | on                                                                                                                                                                               |
| Minimum password length                   | 6                                             | Not used by the app (no password sign-in). Raise it (12 or more) so a password account made through the API is at least strong                                                   |
| MFA, phone, SMS, external providers, web3 | all off                                       | all off                                                                                                                                                                          |

- [ ] Each row above checked in the dashboard.
- [ ] CORS: the keepalive session log (`keepaliveInsert`) is a cross-origin `fetch` with an `Authorization` header from the Worker's origin; hosted PostgREST answers its preflight for any origin, so nothing to set. If a custom API domain or a proxy is ever put in front, it must answer `OPTIONS` too.

## 4. Cloudflare Workers

Workers Builds runs `npm run build`, then `npx wrangler deploy` on `main` (`wrangler.jsonc`); other branches get preview URLs.

- [ ] Workers Builds, Settings, Build variables (build time, not runtime secrets: Vite inlines them):
  - `VITE_SUPABASE_URL`: the project's API URL (`https://<project-ref>.supabase.co`).
  - `VITE_SUPABASE_PUBLISHABLE_KEY`: the project's publishable key (`sb_publishable_...`). Never the secret key.
- [ ] Decide whether preview builds get the same variables (they then sign in against production data) or none (they show "This build isn't connected to Supabase").
- [ ] Node version for the build is 22 (`.nvmrc`).
- [ ] After the deploy: the production URL opens, `/library` deep-links (SPA fallback from `not_found_handling`), and `/sw.js` and `/manifest.webmanifest` are served.

## 5. Verify the release

- [ ] On an iPhone: open the production URL, sign in with the emailed 6-digit code, upload a `.gp` file, play it (sound on the first tap, ringer switch on silent), save a loop, practise it for a minute and see "Practice logged".
- [ ] Add to Home Screen, open from the icon, sign in again with the code, airplane mode: a song opened before plays offline and its session reaches the server after reconnecting, once.
- [ ] On the laptop: the same loop is there with its speed and history.
- [ ] A second deploy while the installed app is open shows "Reload to update" and reloads only when pressed.
- [ ] Sign out on one device leaves the other signed in.

## 6. If something goes wrong

- A bad deploy: Workers, Deployments, roll back to the previous version. The service worker of the bad build stays until the next build is offered; users see "Reload to update" once the rollback is live.
- A bad migration: migrations are not reversible by the CLI. Write a new migration that undoes it, check it locally with `npm run db:reset` and `npm run test:db`, then push that.
- Storage files with no songs row (failed rollbacks, deleted users) are harmless; see the Carried forward list in `docs/plan.md` before cleaning them by hand.

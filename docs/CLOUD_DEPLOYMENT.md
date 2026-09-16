# Vercel + Supabase deployment

This deployment serves the Vite frontend and `api/index.js` on Vercel. The API uses
Supabase PostgreSQL for library records and Supabase Auth for password verification.
Local `npm run dev` and `npm start` continue using SQLite.

The deployment is prepared but has not been published. The owner is creating the
Vercel and Supabase accounts. No production URL exists yet.

## 1. Create the accounts and fill the local configuration

Create a dedicated project in [Supabase](https://supabase.com/dashboard) and a
[Vercel account](https://vercel.com/signup) connected to your GitHub account.
Keep the keys below in the existing local `.env` file; do not paste them in chat
or commit them. Empty fields have already been added to that file.

| Local `.env` field | Where to obtain it |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL, in the Connect dialog |
| `SUPABASE_ANON_KEY` | Supabase Settings → API Keys: publishable key, or legacy `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page: secret key, or legacy `service_role` key |
| `SUPABASE_DB_URL` | Connect → Transaction pooler → PostgreSQL connection URI; replace the password placeholder with the URL-encoded database password |
| `SUPABASE_DB_CA` | Optional: database SSL certificate from Supabase, PEM with literal `\n` between lines, if required to verify its certificate |
| `VERCEL_TOKEN` | [Vercel access tokens](https://vercel.com/account/settings/tokens), scoped to the account/team used for deployment |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Optional initially; populated when the Vercel project is linked |
| `SUPABASE_ACCESS_TOKEN` | Optional [Supabase account token](https://supabase.com/dashboard/account/tokens), for configuring Auth URLs through the management API |
| `ADMIN_PASSWORD` | Your chosen owner password, at least 12 characters |

`config/owner.json` stores the current owner ID, email and display name in Git.
It contains no password. Update this file if those details change again. The
bootstrap command reads the password from `.env` and stores it through Supabase
Auth. The owner password is not needed in Vercel's runtime environment.

Run `npm run cloud:check` to report missing field names without displaying values.
This checks presence, not whether credentials connect successfully.

## 2. Import all current local records

Keep `DATABASE_PATH` pointed at the current local database (`./data/library.sqlite`).
Stop making local edits during the final import, because subsequent local changes
are not automatically synchronized to Supabase.

```sh
npm ci
npm run cloud:setup
```

The command applies `supabase/migrations/202609160001_library.sql` and copies the
library's students, plans, payments, attendance, settings, audit history,
notification records and drafts inside a PostgreSQL transaction. It reads SQLite
without changing it. Seats are generated from the saved layout, currently A–F
with nine seats each. Existing IDs and record ordering are retained.

If the cloud library is already initialized, rerunning setup leaves its records
alone and updates the owner login. It does not merge later local changes. Use a
fresh dedicated Supabase project for a different complete import.

Sample records are included as requested. The sample-data flag is preserved, so
notification sends remain simulated. The public cloud API always disables the
anonymous demo login, even when the imported records are samples. Enabling live
messaging requires replacing the sample workspace with verified real records;
changing only a messaging environment flag does not bypass this restriction.

Local registered account names, roles and membership links are copied into the
restricted `legacy_accounts` table for reference. Their local scrypt password
hashes are not imported into Supabase Auth. Those users must register with an
email in the cloud app; the owner verifies and links their memberships again.
The original SQLite database retains their local logins. The bootstrap creates
or updates the cloud owner directly from `config/owner.json` and `ADMIN_PASSWORD`.

## 3. Deploy the repository on Vercel

Import `automationhubmanish/MSDigitalLibrary` in Vercel with the Vite preset,
repository root, Node.js 24, build command `npm run build`, and output `dist`.
`vercel.json` routes `/api/*` to the Express serverless function. Page navigation
uses URL fragments, so the static frontend needs no page-path rewrite.

Add these **Production** environment variables from the local file:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
SUPABASE_DB_CA                 (only when needed)
NOTIFICATIONS_ENABLED=false
```

Never prefix secrets with `VITE_`. Do not upload `ADMIN_PASSWORD`, local database
files, deployment access tokens or `.env`. `.vercelignore` excludes local data,
credentials and tooling from source uploads.

Deploy, then set `PUBLIC_ORIGIN` to the exact production HTTPS URL with no trailing
slash and redeploy. Until explicitly set, the API uses Vercel's production URL
environment variable. Use the production URL for login; previews should use a
separate Supabase project and their own origin if enabled later.

Alternatively, after linking and configuring the same project with Vercel CLI,
`vercel deploy --prod` deploys it and prints the deployment URL. The CLI and live
deployment require account access; they have not been exercised for this project.

## 4. Configure Supabase Auth

In Authentication → URL Configuration, set Site URL and the allowed redirect URL
to the production HTTPS origin. Enable email/password registration with email
confirmation. Configure custom SMTP before inviting students: Supabase's default
email sender only sends to authorized team addresses and is intended for testing.
See [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Students register with a user ID, name, email and password, confirm the email,
and sign in using their user ID or email. The owner activates access in Settings.
Signup always creates a pending profile, regardless of submitted metadata.

The API validates passwords with Supabase Auth, then issues an opaque, HttpOnly,
Secure cookie lasting 12 hours. Session token hashes and role assignments are in
PostgreSQL. Disabling an account or changing its access in Settings revokes its
sessions. Password changes made directly in the Supabase dashboard do not
automatically revoke these application sessions: delete that user's rows from
`public.cloud_sessions` as well. Rerunning owner setup does this for the owner.

All application tables use RLS with browser roles denied direct access. Authorized
requests go through the API; student responses contain only their own records.
The database connection verifies SSL certificates and uses the Supabase pooler.

## 5. Notifications

The existing adapter supports Twilio WhatsApp or SMS, selected by
`NOTIFICATION_CHANNEL`. Configure the server variables and WhatsApp templates in
[NOTIFICATIONS.md](NOTIFICATIONS.md). It does not currently implement automatic
SMS fallback or delivery callbacks. Accepted messages are shown as accepted,
not delivered. No messages are sent during deployment or testing.

Cloud requests persist a batch before sending. Workers claim queued records in
small groups, using PostgreSQL locks to prevent concurrent duplicate sends.
Vercel `waitUntil` allows processing after the response. Remaining queued work
resumes when the Notifications page loads or another send request arrives.
Interrupted, uncertain sends are marked `unknown` and are not retried automatically.

For unattended queue draining, set a strong `CRON_SECRET` in Vercel and configure
a scheduler to request `GET /api/cron/notifications` with
`Authorization: Bearer <CRON_SECRET>`. No scheduler is created automatically.
This endpoint drains existing batches; it does not create scheduled fee reminders.

## 6. Verify and back up

After deployment, verify `/api/health`, sign in as the owner, compare record counts,
open all pages, check that changes appear on another device after refresh, and
confirm that a student cannot access another student's data. Test registration
and email confirmation with an address you control before inviting students.

Settings exports a JSON library snapshot, including notification history but
excluding login credentials. Full recovery also needs a Supabase database backup
including the Auth schema; configure backups separately in Supabase. SQLite
backup instructions apply only to the preserved local database.

Local checks:

```sh
npm run lint
npm run build
npm test
npm run test:e2e
```

Cloud SQL tests use an isolated PostgreSQL engine via PGlite. Supabase identity
responses are stubbed there; live Auth, SMTP, SSL, Vercel routing and provider
delivery still require verification against the configured deployment.

References: [Vercel Node functions](https://vercel.com/docs/functions/runtimes/node-js),
[Supabase connection pooling](https://supabase.com/docs/guides/database/connecting-to-postgres),
[Supabase Auth profiles](https://supabase.com/docs/guides/auth/managing-user-data).

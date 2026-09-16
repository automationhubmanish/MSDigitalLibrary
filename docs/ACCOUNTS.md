# Logo, sign-up and login

The supplied logo is stored unchanged at `public/ms-library-logo.png`. `src/components/LibraryLogo.tsx` displays it on login, the sidebar, loading and the student portal; the same asset is used as the browser icon.

## Create an account

The cloud deployment additionally requires an email address and Supabase email confirmation. See [Cloud deployment](CLOUD_DEPLOYMENT.md). The local SQLite flow below does not require email verification.

On the login screen, select **New user? Create an account**. Enter your name, a unique user ID and matching passwords. User IDs are case-insensitive and allow 3–40 letters, numbers, dots, underscores or hyphens, starting with a letter or number. Passwords require 12–128 characters.

Sign in using the user ID and password. New accounts can log in immediately to see their activation status. They cannot access management records until the owner assigns access.

## Activate library access

Sign in as the owner and open **Settings → User Accounts**. Refresh the account list if needed, verify the registrant, and select an access level:

- **Student:** link the correct existing student membership. The student can view only their own membership, fees and attendance. A membership can have only one linked account. Add a membership from Students first if necessary.
- **Staff:** access the existing staff management workflow. Staff cannot activate other accounts or change owner-only settings.
- **Awaiting activation:** retain access only to account status.
- **Disabled:** block login and revoke existing sessions.

Save access. That user must sign in again after an access change. Public sign-up never creates owner accounts, and membership links cannot be selected or changed by the registrant.

## Existing owner and staff logins

For Supabase, `config/owner.json` holds the non-secret owner details and `npm run cloud:setup` applies them with `ADMIN_PASSWORD` from local `.env`. Staff signs up and is activated by the owner. Local account passwords cannot be carried across directly; imported account metadata is retained for owner reference.

The current owner password remains in the local `.env` file as `ADMIN_PASSWORD`. Sign in with user ID **owner**, or continue using `ADMIN_EMAIL`. Set `ADMIN_USER_ID` to configure another ID. Optional staff credentials similarly accept **staff** (or `STAFF_USER_ID`) and `STAFF_EMAIL`.

## Local storage and backups

Registered accounts are stored inside the library's SQLite database, normally `data/library.sqlite` in this local repository folder. Each password is stored as a salted scrypt hash, never as readable text. Login sessions use hashed tokens and HTTP-only cookies. The `.env` credentials and database remain excluded from Git commits; neither is uploaded to GitHub.

The full SQLite backup preserves account hashes and membership links. The Settings JSON snapshot contains library records and notifications, but excludes login accounts and password hashes. Use the full SQLite backup when moving or restoring accounts. There is no email verification or self-service password reset in this version.

The existing demo entry remains available in demo mode and opens the sample owner workspace. Use the real-workspace deployment instructions before storing live student records on a public server.

## Files for review

- `server/auth.js`: registration, login, sessions, account roles and student record filtering.
- `src/pages/LoginPage.tsx`: user ID/email and password sign-in.
- `src/pages/SignUpPage.tsx`: registration form.
- `src/pages/StudentPortalPage.tsx`: account status and personal membership view.
- `src/components/AccountManagement.tsx`: owner activation controls.

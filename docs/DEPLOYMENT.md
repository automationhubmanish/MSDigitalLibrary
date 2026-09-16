# Deploying MS Digital Library

The app needs a Node server and persistent storage. Static-only hosting such as GitHub Pages cannot run the API/database. A single Linux VM or container host with a persistent volume is sufficient. You will also need a domain or a hosting-provided HTTPS URL.

## Local login details

The local repository folder keeps owner credentials in `.env`: `ADMIN_EMAIL` and
`ADMIN_PASSWORD`. Both `npm run dev:server` and `npm start` load this file. Edit
these values to change the login, then restart the API. The password must have at
least 12 characters. Optional staff access uses `STAFF_EMAIL` and `STAFF_PASSWORD`.

`.env` is excluded from Git commits and Docker images; it stays on this computer
and will not accompany a GitHub clone. `.env.example` documents the configuration
without containing passwords. The current local setup keeps `DEMO_MODE=true` to
preserve the existing sample workspace, so the demo entry button remains available.

## Docker deployment

1. Clone the repository on the hosting machine.
2. Copy `.env.example` to `.env` and set `ADMIN_EMAIL`, a unique `ADMIN_PASSWORD` of at least 12 characters, `DEMO_MODE=false`, and `PUBLIC_ORIGIN=https://your-real-domain.example` (no trailing slash). Configure optional staff credentials with a different email. Never commit `.env`.
3. Run `docker compose up -d --build`. The app listens on loopback port 3001; SQLite is stored in the `library-data` named volume. The container runs as the non-root `node` user.
4. Put an HTTPS reverse proxy in front of `http://127.0.0.1:3001`. Forward the original host and protocol headers. Set `TRUST_PROXY=1` only if there is exactly one trusted reverse proxy. `PUBLIC_ORIGIN` must exactly match the browser's HTTPS origin.
5. Open the HTTPS URL and sign in with the configured owner credentials. Add real students and assign seats. Staff uses the same URL with its separate credentials.

For a managed container platform, build using the Dockerfile, route traffic to container port 3001, and mount durable writable storage at `/app/data` owned by UID 1000. Set the same environment variables in the provider dashboard. Use a single app instance. Do not use ephemeral filesystem storage or a static-site deployment.

## Native Node deployment

```sh
npm ci
npm run build
npm prune --omit=dev
```

Set `NODE_ENV=production`, `DEMO_MODE=false`, credentials, `PUBLIC_ORIGIN`, and a persistent `DATABASE_PATH` in the environment. Run `npm start` under the host's process supervisor. Expose it only through HTTPS. Production cookies are Secure and will not work over plain HTTP.

The server refuses production startup without an HTTPS `PUBLIC_ORIGIN`, or real-workspace startup without an adequate owner password. Demo login is unavailable when `DEMO_MODE=false`.

## Backups

Registered users and salted password hashes live in the SQLite database. Full SQLite backups preserve their logins; the Settings JSON snapshot excludes login accounts. See [Accounts and login](ACCOUNTS.md).

The owner can download a JSON data snapshot from Settings. This includes student information, payments, attendance, plans, and settings, but no authentication sessions. Store backups somewhere separate from the hosting disk.

For a full consistent SQLite backup while the server is running:

```sh
node --env-file-if-exists=.env server/backup.js backups/library-2026-09-13.sqlite
```

Use a fresh filename each time. For Docker:

```sh
docker compose exec library node server/backup.js /app/data/library-backup-2026-09-13.sqlite
docker compose cp library:/app/data/library-backup-2026-09-13.sqlite ./library-backup-2026-09-13.sqlite
```

Schedule this command using your hosting provider's scheduler and retain off-host copies. Do not copy a live SQLite database file directly without also accounting for its write-ahead log; the supplied helper uses SQLite's backup API.

To recover, stop the app, preserve the current database and its associated files, place the backup at a **new** database path, and point `DATABASE_PATH` to it before restarting. Do not overwrite an open database. Full SQLite backups contain session records: after a recovery, invalidate them with `DELETE FROM sessions` using a SQLite administrator tool before restarting. The UI JSON snapshot is for archival/data inspection; an automated JSON restore interface is not included.

## Before public use

Verify login over HTTPS, a staff check-in appearing on the owner's device after refresh, a recorded payment surviving a server restart, and a successful backup/recovery rehearsal. Docker files are provided; validate the container and reverse proxy on the selected hosting service before going live.

One-click WhatsApp/SMS sending uses the Twilio adapter described in [Notifications setup](NOTIFICATIONS.md). Demo mode simulates sends. Live sending requires provider credentials and approved WhatsApp templates. Scheduled automation and delivery callbacks are not included. Online payments still require a payment provider and server-verified payment webhooks.

## References

- [Node SQLite documentation](https://nodejs.org/api/sqlite.html)
- [Express production security guidance](https://expressjs.com/en/advanced/best-practice-security/)
- [Vite development proxy configuration](https://vite.dev/config/server-options.html#server-proxy)

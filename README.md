# MS Digital Library

A library owner workspace built with React, TypeScript, Vite, Express, and SQLite. The interface follows the seven supplied dashboard references. This is a study-seat library management app, with students and monthly memberships rather than a book catalogue.

## Run locally

Requires Node.js 22.18 or newer (Node 24 LTS is used in the deployment image).

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** and choose **Open demo workspace**. One command starts Vite on port 5173 and the API on port 3001. Without an `.env` file, local development creates a clearly labeled demo with 84 sample students, 54 seats, attendance, and six months of sample payments. Data is stored in `data/library.sqlite`, not in the browser. The app refreshes shared records every 15 seconds.

Do not enter real student information into a publicly accessible demo workspace. For real use, configure owner credentials and disable demo mode as described below. The production server defaults to demo mode off.

## Implemented screens

The supplied MS Digital Library logo appears throughout the app. New users can sign up with a user ID and password. Owners activate student or staff access from Settings. See [Accounts and login](docs/ACCOUNTS.md) for the registration flow, local credential storage and access rules.

- **Dashboard:** active students, occupied/reserved/available seats, current-month fee totals, plans, recent attendance.
- **Students:** search by name, phone, or ID; filter plans, fees, seats, and active/archived membership; add/edit/archive students; profile details; check-in/out; collect fees.
- **Seats & attendance:** 54 configurable seats in rows A–F, seat status filters, attendance events, manual check-in/out, overtime alerts.
- **Fees:** payments by billing month, pending fees, six-month collection chart, unique receipts, print / Save as PDF, CSV export.
- **Timings & plans:** 6 hours at ₹400/month, 8 hours at ₹500/month, 12 hours at ₹600/month; owner can add/edit plans and opening hours.
- **Reports:** billing-period collection, current membership distribution and occupancy, attendance visits, CSV reports, printable analytics.
- **Notifications:** one-click fee reminders, announcements and alerts to all active students, saved drafts, per-student history, duplicate protection, and a Twilio WhatsApp/SMS adapter. Demo sends are simulated.
- **Settings:** library name/hours, reminder-time preference, server data backup download.

## Rules and scope

Monthly fees are charged in full by calendar billing month, with one receipt per student/month. There is no partial payment or proration. “Paid through” is the latest paid billing month; it does not imply every earlier month was paid. Use the fee report's month selector to review older unpaid periods. Current-month pending fees are identified separately.

One active student may hold one seat. The student keeps that seat while checked out (reserved). Archiving releases the seat and closes an open attendance session, while preserving history. Seat sharing by non-overlapping shifts is not implemented. Unassigned students cannot check in. Study hours follow the plan unless a shorter daily duration is configured. Timings & Plans shows editable start/end windows, opening hours, closed-day options and schedule estimates. Opening hours are staff guidance. Staff records attendance manually: there is no biometric, camera, or automatic attendance integration.

Existing students keep their agreed monthly price when a plan's advertised price changes, unless the owner explicitly selects “Apply this fee to all active students”. Each student's agreed fee can also be edited independently. Changing their membership plan applies the selected plan's current price. Past receipts retain their amounts when plan prices change. The owner can separately correct a receipt with a recorded reason. Historical pending fees use the student's current agreed price; this app does not maintain a separate historical invoice ledger.

Payments record money already received by cash, UPI, or bank transfer. The app does not initiate charges or integrate with a payment gateway. CSV exports open in Excel; native XLSX files are not generated. PDF output uses the browser's print dialog.

**Live WhatsApp/SMS sending requires configuration.** The Twilio adapter supports owner-triggered fee reminders, announcements and alerts. Demo mode simulates sends even when credentials exist. See [Notifications setup](docs/NOTIFICATIONS.md) for provider setup and availability controls. Scheduling and delivery callbacks are not included. Provider acceptance is not labeled as delivery.

## Editable records and configuration

The initial layout is **54 seats: rows A–F with 9 seats per row**. Seat lists, availability, occupancy percentages, report denominators, and exports use the saved configuration.

- **Settings:** edit the library/floor name, row labels, seats per row, opening hours, suggested time slots, overtime grace period, accepted payment methods, reminder time, and reminder message template.
- **Students:** edit contact details, membership, seat, start time, joining date, notes, and the agreed monthly fee. Owners can restore archived memberships with an unassigned seat.
- **Plans:** edit names, descriptions, daily hours, and prices; optionally apply prices to current members; archive unused plans or restore them. Schedule validation prevents a plan extending a member's day past midnight.
- **Fees:** open a receipt to edit the student, amount, billing month, method, timestamp, or reference. Void an incorrect receipt or restore a voided one. Voided receipts are retained and excluded from totals. Duplicate active receipts for the same student/month are rejected.
- **Attendance:** use the searchable Attendance Register to add missed visits or correct times, students, seats, and notes. Open visits require a currently assigned seat. Overlapping student/seat visits are rejected.
- **Recent Changes:** Settings shows the audit history. Correction actions require an explanation and retain before/after records in the database and data backup. Identifiers and derived totals remain system-generated.

Owner-only controls cover configuration, agreed fees, plan changes, receipt/attendance corrections, and restoration. Staff still handles normal student registration, check-in/out, and fee collection. Account credentials and hosting/provider secrets remain in the server environment. Reminder sending is not enabled by editing the template.

### Existing 72-seat databases

At startup, the version-2 migration updates the old fixed layout to 54 seats. Students assigned to seats 10–12 become unassigned; affected open visits are closed with a layout-change note, not deleted. All student/payment/attendance history is preserved. The previous complete library document is saved in the SQLite table `library_migrations` before the migrated state is committed, and the migration runs once. Settings lists the affected students for reassignment.

Future layout reductions show affected assignments and require the owner to explicitly choose to release them. Review attendance notes for automatically closed visits.

## Real workspace and deployment

Copy `.env.example` to `.env`, set an owner email and a unique password of at least 12 characters, set `DEMO_MODE=false`, and choose a **new** database path such as `./data/production.sqlite`. Restart the app. A new real workspace starts empty. A sample database cannot be opened as a real workspace by simply changing the demo flag.

Optional `STAFF_EMAIL` and `STAFF_PASSWORD` enable a separate staff account. Staff can manage student records, attendance, and fees. Only the owner can change plans/settings or export the complete database snapshot. Both roles can read operational records and download operational reports. Sessions last 12 hours.

See [deployment instructions](docs/DEPLOYMENT.md) for Docker, HTTPS, persistent storage, and backups. The repository includes the deployment files, but the website has **not been published** and no paid hosting account has been created.

## Verification

```sh
npm run lint
npm run build
npm test
npm run test:e2e
```

Browser tests require Google Chrome locally. In CI, install Chromium with `npx playwright install --with-deps chromium` and set `CI=true`. Tests launch a separate in-memory API/database on port 3002 and use the built `dist` directory. They do not modify the development database. Browser screenshots are written to the ignored `artifacts/` directory.

`npm run build` runs TypeScript and creates the production frontend. `npm start` serves the API and built frontend together on port 3001. The frontend-only `npm run preview` command is not a substitute for running the API.

## Project structure

Each screen has its own component in `src/pages/`. Start with the matching page below when reviewing or changing a screen:

| Page / route | Source file |
| --- | --- |
| Dashboard — `#dashboard` | [DashboardPage.tsx](src/pages/DashboardPage.tsx) |
| Students — `#students` | [StudentsPage.tsx](src/pages/StudentsPage.tsx) |
| Seats & Attendance — `#seats` | [SeatsAttendancePage.tsx](src/pages/SeatsAttendancePage.tsx) |
| Fees & Payments — `#fees` | [FeesPaymentsPage.tsx](src/pages/FeesPaymentsPage.tsx) |
| Timings & Plans — `#plans` | [TimingPlansPage.tsx](src/pages/TimingPlansPage.tsx) |
| Reports — `#reports` | [ReportsPage.tsx](src/pages/ReportsPage.tsx) |
| Notifications — `#notifications` | [NotificationsPage.tsx](src/pages/NotificationsPage.tsx) |
| Settings — `#settings` | [SettingsPage.tsx](src/pages/SettingsPage.tsx) |
| Sign-in | [LoginPage.tsx](src/pages/LoginPage.tsx) |

`src/App.tsx` coordinates navigation, loading/saving shared records, and opening forms. `src/pages/pageTypes.ts` defines the props shared by pages. Reused fee and attendance components live in `src/components/`; shared metrics are in `src/utils/libraryMetrics.ts`. `src/components.tsx` contains common cards, tables' empty states, dialogs, and charts. `src/forms.tsx` contains the record-editing forms. Shared styling remains in `src/App.css` and `src/index.css` so all pages stay visually consistent.

The frontend is formatted for code review. Run `npm run format` after editing, or `npm run format:check` to check formatting without changing files.

```text
src/pages/           One React component file per screen
src/components/      Reused fee and attendance components
src/utils/           Shared library metric calculations
src/App.tsx          Navigation, shared state, and page composition
src/components.tsx   Common UI components and charts
src/forms.tsx        Student, payment, and plan forms
src/App.css          Shared layout and page styles
src/index.css        Global typography and base styles
server/domain.js     Validated membership, seat, attendance, and payment rules
server/index.js      Authentication, SQLite persistence, API, production static hosting
server/backup.js     Consistent SQLite backup command
tests/              Domain/API tests and browser workflow tests
docs/DEPLOYMENT.md   Hosting and operating instructions
```

SQLite is provided by Node's built-in `node:sqlite` module; Node may display an experimental-feature warning. The database stores one transactional library document with optimistic revision checks, which is suitable for a small, single-library installation. Use one server instance with persistent local storage; horizontal/serverless scaling needs a different database deployment architecture.

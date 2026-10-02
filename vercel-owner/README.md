# MS Digital Library owner portal

Deploy this directory to Vercel as a Vite project. Owner login, 54 seats A1–A9 through F1–F9, students, attendance, payments, and reports.

Use `npm ci` and `npm run build`. Provision free Neon Postgres through Vercel Marketplace. Required server-only environment variables: `DATABASE_URL` and `LIBRARY_OWNER_PASSWORD`. The owner username is fixed to `msl_manish`. Never prefix secrets with VITE_. Sessions expire after 12 hours and use HttpOnly cookies. A database unique index prevents duplicate active seat assignments.

The Vercel deployment has its own database. The Sites workspace is retained separately; backend-reference contains its login/API source for reference. Existing root application is preserved.

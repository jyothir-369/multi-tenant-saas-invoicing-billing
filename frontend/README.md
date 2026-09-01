# Frontend

Next.js dashboard for authenticated tenant users. It provides sign-in/sign-out, dashboard balances, customer balances, recent invoices, loading/error handling, and bearer-token API requests.

## Setup

From the root run `npm install`, then copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to the backend origin (normally `http://localhost:3001`). This is public configuration; never put JWT, database, Redis, SMTP, or Stripe secrets in `NEXT_PUBLIC_*` variables.

## Commands

```powershell
npm run dev
npm run build
npm run start
npm run lint
```

The production server requires `next build` first and serves `.next`. Root Turbo commands are `npm run dev`, `npm run build`, `npm test -- --runInBand`, `npm run lint`, and `npm run start:frontend`. Start the backend API and worker separately with the root `start:api` and `start:worker` commands.

## Integration

The browser talks only to the configured backend URL. Authentication, validation, tenant isolation, RBAC, payments, notifications, and health checks remain backend responsibilities. Backend errors are surfaced to the dashboard without exposing provider secrets.

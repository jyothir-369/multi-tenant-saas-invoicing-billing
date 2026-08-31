# Multi-Tenant SaaS Billing Platform

## Setup

```bash
npm ci
copy .env.example .env
npx prisma generate
npx prisma migrate deploy
```

`DATABASE_URL` must point to PostgreSQL. The schema uses tenant-scoped tables and indexes on invoice status/due date, payments, and outbox failures. This repository currently contains the Prisma schema but no committed migration history; initialize a migration in a PostgreSQL environment with `npx prisma migrate dev --name init`, review it, and use `prisma migrate deploy` in production.

## Environment

See `.env.example`. `DATABASE_URL`, `JWT_SECRET`, `REDIS_HOST`, and `REDIS_PORT` are required. Production additionally requires Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`). Production rejects missing values and JWT secrets shorter than 32 characters. Never commit `.env` or provider secrets.

## Run

```bash
npm run start:dev
npm run start:prod
```

The API listens on `PORT` (3001 in the example). Redis is required for BullMQ workers; run the API and workers from the same built application deployment. Workers start with the notifications module and process PDF, email, outbox, and recurring-invoice queues.

The Next.js dashboard is in `../frontend`:

```bash
cd ../frontend
npm ci
npm run dev
```

Set `NEXT_PUBLIC_API_URL` to the API origin when it differs from `http://localhost:3000`.

## Tests and verification

```bash
npm test -- --runInBand
npm run test:e2e
npm run test:phase9
npm run build
```

`test:phase9` is a live PostgreSQL integration and performance suite. It requires `DATABASE_URL`, a migrated database, and compatible Redis configuration. Without PostgreSQL it skips and makes no performance claim. When enabled it creates 10,000 invoices and reports the measured PostgreSQL dashboard-query p95 against the PRD target of 300ms.

## Production notes

Use TLS PostgreSQL/Redis connections, managed secrets, Stripe webhook signature verification, a persistent Redis instance, SMTP delivery monitoring, and external health/alerting. Card data is handled by Stripe and is not stored by this service. Multi-currency tax logic and a full general ledger are intentionally outside the PRD scope.

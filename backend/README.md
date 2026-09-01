# Backend

NestJS API with Prisma/PostgreSQL, JWT authentication, tenant isolation, OWNER/STAFF RBAC, customers, invoices, recurring billing, payments, Stripe webhooks, PDF/email notifications, health checks, Redis rate limiting, and BullMQ workers.

## Setup

From the root: `npm install`, copy `../example.env` to `.env`, set local values, then run `npm run prisma:generate` and `npm run prisma:migrate`. Production uses `prisma migrate deploy`. Required values are `DATABASE_URL`, a 32+ character `JWT_SECRET`, `REDIS_HOST`, and `REDIS_PORT`; see `.env.example` for all database, Redis/TLS, SMTP, Stripe, CORS, proxy, logging, and rate-limit settings. Never commit `.env` or secrets.

## Commands

```powershell
npm run start:dev
npm run build
npm run start:prod
npm run start:worker
npm test -- --runInBand
npm run test:e2e
npm run test:phase9
npm run lint
```

The API is compiled to `dist/main.js`; the independent worker is `dist/worker.js`. Both use the same Redis configuration, including password and TLS. Development falls back to mock Stripe and test SMTP when credentials are absent; production requires real providers. Card data is never stored. Protected routes derive tenant context from JWT authentication, and webhook signatures are verified.

## Operations

Run API and worker separately against the same PostgreSQL and persistent Redis services. Use TLS, managed secrets, HTTPS reverse proxy/trusted proxy configuration, restricted `FRONTEND_URL` CORS, SMTP monitoring, and `/health` monitoring in production. Phase 9 live integration/performance tests require reachable migrated PostgreSQL/Redis and make no benchmark claim when unavailable.

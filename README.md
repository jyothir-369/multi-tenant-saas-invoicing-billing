# Multi-Tenant SaaS Invoicing and Billing Platform

Production-oriented SaaS invoicing platform with strict tenant isolation, JWT authentication, OWNER/STAFF authorization, customer and invoice lifecycle management, recurring invoices, Stripe-compatible payments, PDF invoices, email/outbox processing, dashboard balances, health checks, and Redis/BullMQ workers.

## Layout

- `backend/` — NestJS API, Prisma schema/migrations, integrations, and independent worker.
- `frontend/` — Next.js authenticated dashboard.
- `turbo.json` — TurboRepo task pipeline.
- `example.env` — complete non-secret backend environment template.
- `prd.md`, `problem statement.md` — specification.

## Quick start

```powershell
npm install
Copy-Item example.env backend/.env
Copy-Item frontend/.env.example frontend/.env.local
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:migrate
npm run dev
```

Set local PostgreSQL, Redis, and JWT values in `backend/.env`; set `NEXT_PUBLIC_API_URL` in `frontend/.env.local`. Stripe and SMTP have development fallbacks when credentials are absent. Production requires real provider configuration.

## Turbo and production commands

```powershell
npm run dev
npm run build
npm test -- --runInBand
npm run lint
npm run start:api
npm run start:worker
npm run start:frontend
```

The build emits `backend/dist/main.js`, `backend/dist/worker.js`, and frontend `.next` output. Run API, worker, and frontend as separate production processes. Apply production migrations with `npm --workspace backend exec prisma migrate deploy`.

## Architecture and operations

PostgreSQL stores tenant-scoped data. Redis supports BullMQ, retries, failed jobs, idempotency, and distributed rate limiting. The API handles authentication, tenant context, RBAC, validation, customers, invoices, payments, webhooks, dashboard metrics, notifications, and `/health`. Workers process PDFs, emails, outbox events, and recurring invoices. Stripe handles payment-card data; cards are never stored. Use managed secrets, TLS PostgreSQL/Redis, HTTPS reverse proxy, restricted CORS, monitored health checks, and verified Stripe webhook signing secrets. Never commit `.env` files or secrets.

See `backend/README.md` and `frontend/README.md` for detailed component instructions and testing.

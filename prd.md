
# PRD 1 — Multi-Tenant SaaS Invoicing & Billing Platform

## 1. Overview
A billing platform for small businesses to manage customers, issue recurring invoices, accept payments, and track balances in real time — with hard tenant isolation, since this is a multi-tenant SaaS product from day one.

## 2. Problem Statement
Small businesses currently juggle spreadsheets, generic invoicing tools, and manual payment tracking. They need one system where creating a customer, sending a recurring invoice, collecting payment, and seeing an up-to-date balance is fast and reliable — and where their data can never leak across tenant boundaries.

## 3. Goals
- Prove correct multi-tenant data isolation under test, not just by convention.
- Handle payment-provider webhooks safely under retries and duplicate delivery.
- Generate and deliver invoices/receipts asynchronously without blocking user-facing requests.
- Provide a real-time, accurate balance view per customer and per tenant.

## 4. Non-Goals
- Multi-currency accounting or tax-jurisdiction logic (flag as a documented limitation).
- Full double-entry bookkeeping / general ledger.
- Custom invoice template designer (use one fixed, clean template).

## 5. Users & Personas
| Persona | Needs |
|---|---|
| Business owner (tenant admin) | Create customers, send invoices, see balances, manage team access |
| Staff user (tenant member) | Create/view invoices and customers within permission scope |
| End customer (payer) | View and pay an invoice via a hosted payment link, no login required |

## 6. Functional Requirements

### 6.1 Tenancy & Access
- FR1: Every account belongs to exactly one tenant (business). Users belong to a tenant with a role (`owner`, `staff`).
- FR2: All domain queries are scoped by `tenant_id`; no query path may return cross-tenant data.
- FR3: Role-based authorization: `owner` can manage billing/team; `staff` can create/view invoices only.

### 6.2 Customers
- FR4: Create, edit, list, and archive customers within a tenant.
- FR5: Each customer has a running balance derived from invoice and payment history (not a manually edited field).

### 6.3 Invoicing
- FR6: Create one-off and recurring invoices (weekly/monthly/custom interval) for a customer.
- FR7: Recurring invoices auto-generate on schedule via a background job, not a request-triggered action.
- FR8: Each invoice has a lifecycle: `draft → sent → paid | overdue | void`.
- FR9: Invoice PDF is generated asynchronously and attached to the sent email.

### 6.4 Payments
- FR10: Customers pay via a hosted, tokenized payment link — no card data touches our servers directly.
- FR11: Payment-provider webhooks update invoice status; duplicate webhook deliveries must not double-apply a payment.
- FR12: On successful payment, a receipt is generated and emailed asynchronously (outbox → worker).

### 6.5 Balance & Reporting
- FR13: Tenant dashboard shows real-time aggregate balance (outstanding, overdue, paid this month).
- FR14: Customer detail page shows full invoice/payment history.

## 7. Non-Functional Requirements
| Category | Requirement |
|---|---|
| Isolation | Automated tests proving cross-tenant read/write denial (§14.2 of blueprint) |
| Idempotency | Payment webhook processing is idempotent under at-least-once delivery |
| Latency | Dashboard balance query p95 < 300ms at 10K invoices/tenant |
| Reliability | Receipt/PDF generation retried on failure with bounded backoff; failures visible in a dashboard |
| Security | Payment provider secrets centralized; no card data logged or stored |
| Rate limiting | Payment endpoint rate-limited per tenant to prevent abuse |

## 8. Data Model (core entities)
- `tenants` (id, name, plan)
- `users` (id, tenant_id, email, role)
- `customers` (id, tenant_id, name, email)
- `invoices` (id, tenant_id, customer_id, status, amount, due_date, recurrence_rule)
- `payments` (id, tenant_id, invoice_id, provider_payment_id UNIQUE, amount, status)
- `outbox_events` (id, tenant_id, type, payload, processed_at)

Unique constraint on `payments.provider_payment_id` is the idempotency guard against duplicate webhook processing.

## 9. Architecture Notes (per blueprint)
- NestJS modules: `tenants`, `customers`, `billing` (invoices), `payments` (provider adapter), `notifications`.
- Payments module wraps the provider SDK behind a typed adapter interface (timeout, retry, idempotency key, structured telemetry — §7.5).
- Invoice-paid event written to `outbox_events` in the same transaction as the payment status update (§8.5.1), then published to a BullMQ worker that sends the receipt.
- Redis used only for rate-limiting the payment endpoint — not as a source of truth (§9.2 caching decision framework: concrete use case required).

## 10. API Surface (representative)
```
POST   /customers
GET    /customers/:id
POST   /invoices
POST   /invoices/:id/send
POST   /webhooks/payments          (provider-authenticated, idempotent)
GET    /dashboard/balance
```

## 11. Milestones
1. Walking skeleton: one tenant, one customer, one manual invoice, one manual "mark paid" action, deployed.
2. Recurring invoice generation + async PDF/email pipeline.
3. Real payment-provider integration (sandbox) + idempotent webhook handling.
4. Multi-tenant isolation test suite + cross-tenant denial tests.
5. Dashboard balance view + load test at 10K invoices/tenant.

## 12. Success Metrics (for resume/portfolio)
- Cross-tenant isolation: 100% of isolation test suite passing, documented in README.
- Webhook idempotency: 0 duplicate-payment incidents across N simulated duplicate deliveries.
- Async pipeline: receipt delivered within X seconds p95 of payment confirmation.

## 13. Open Risks
- Payment-provider sandbox limitations may not fully replicate production webhook retry behavior — mitigate with a manual duplicate-delivery test harness.

---
---
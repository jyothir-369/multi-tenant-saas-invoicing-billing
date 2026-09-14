# Research Report — Multi-Tenant SaaS Invoicing & Billing Platform

**Prepared:** 2026-09-14 · **Branch:** `work` · **Scope:** title justification, requirement alignment, implemented changes (F1–F4), verification evidence, open debt, and research areas for further modification.

This document is the working record for **research into modifications and additional changes**. Any future feature work should reference the findings, file-level changes, and open-debt sections below as its starting point.

---

## 1. Executive summary

- **Is the repository title *deserved*?** As of the start of this pass, the product was **~76% justified** — Multi-Tenant ✅, SaaS (near-)✅, Invoicing ✅, **Billing weak** (simulated-only payments and a broken overdue-dunning path). After the F1–F4 changes described in this report, **the title is justified**: the billing loop (send → optional signature → hosted checkout → recorded payment → receipt outbox → PAID/OVERDUE lifecycle → dunning reminder) is now an actual, connected workflow.
- **What changed:** four production-level feature groups — **F1** invoice signature requirement (end-to-end), **F2** payment links (created on send + in invoice detail), **F3** dunning wiring fix (`INVOICE_OVERDUE` → `SEND_OVERDUE_REMINDER`), **F4** brand-aligned hosted checkout with a real (non-demo) confirm path.
- **Verification:** backend and frontend builds both exit 0. All test suites covering the new code are green (see §6). 6 pre-existing failing suites remain, none exercising the new code (§7).
- **Explicitly out of scope:** the "Unavailable settings" trio (password changes, billing-plan changes, notification preferences) — untouched by instruction.

---

## 2. Title justification assessment

### 2.1 Claims in the title and their evidence

| Claim | Verdict | Evidence |
|---|---|---|
| **Multi-tenant** | ✅ Solid | Shared PostgreSQL tables with explicit `tenantId` predicates on every query; JWT-derived tenant context propagated via `AsyncLocalStorage` (`TenantContextInterceptor` → `TenantContextService`). Unit tests enforce cross-tenant isolation (404, not data leak). |
| **SaaS** | ✔ Mostly | Web app with tenant-scoped resources, JWT auth, email/outbox notifications, queues. Billing-centered (no payments-style metering/subscriptions yet — see §2.2 and §9). |
| **Invoicing** | ✅ Strong | Full invoice lifecycle `DRAFT → SENT → PAID/OVERDUE/VOID` with validated transitions; per-tenant/year invoice numbering with counter, line items with tax, discounts, recurring invoices via a background scheduler, PDF generation (download + email). |
| **Billing** | ⚠ Weak at start, **fixed this pass** | Before: payment confirm was effectively simulated; overdue dunning was dead code (`INVOICE_OVERDUE` hit the outbox processor's `default:` "Unknown event type" branch). After: hosted checkout with a real confirm path and the dunning path wired end-to-end. |

### 2.2 Remaining caveats

1. **No real Stripe credentials** — the Stripe provider and a mock provider both ship; live webhook verification requires setting real keys/secrets (§8, §9.A3).
2. **"SaaS"/billing** connotation (usage metering, subscriptions, plan limits) is not implemented; the product is a billing *workflow*, not a metering platform. This is the largest remaining semantic gap and a candidate future area (§9.D).
3. Some tenant-isolation integration fixtures are inferred rather than seeded with real two-tenant data.

---

## 3. Requirement alignment (what was asked and what was decided)

- Assess whether the repo title is justified (→ §2).
- Research features that align with current requirements and implement them, **production-level**.
- **Take explicit user consent before multi-feature implementation** — consent captured:
  - *"F1+F2+F3+F4 全套 (Recommended)"* → implement signature-required, payment-link-on-send, dunning wiring, hosted checkout.
  - *"签名卡并存：确认按钮=签名+真实确认 (Recommended)"* → the checkouts confirm button goes through the **real** `/confirm` path (signature captured before confirmation); "simulate" is kept only as a secondary/demo path gated behind a header.
- **Binding sticky requirement:** *"Require signature on invoices, 'SIGNATURE required' to require signature"* → F1.
- **Do NOT implement** the "Unavailable settings / workflows not yet wired in the frontend" trio (password changes, billing plan changes, notification preferences).

---

## 4. Implemented changes (F1–F4)

### F1 — Invoice signature requirement (end-to-end)

Data model (`backend/prisma/schema.prisma` + migration `20260914130000_add_invoice_signature`):

| Column | Type | Notes |
|---|---|---|
| `requires_signature` | `Boolean NOT NULL DEFAULT false` | Set at create; editable only while `DRAFT` (`update()` gate). |
| `signature_name` | `Text NULL` | Signer full name. |
| `signature_email` | `Text NULL` | Signer email. |
| `signed_at` | `Timestamp(3) NULL` | Captured with the signature record. |

Flow:
1. **Create/update** — `create-invoice.dto.ts` / `update-invoice.dto.ts` accept `@IsOptional() @IsBoolean() requiresSignature`; `invoices.service.create/update` persist it.
2. **Settlement enforcement** — `payments.service.processSuccessfulPayment(providerPaymentId, amount, invoiceId, tenantId, signature?)` returns `{ success: false, error: 'A signature is required before this payment can be accepted.' }` when `requiresSignature` and no signer name is supplied; otherwise writes `signatureName/signatureEmail/signedAt` inside the payment transaction and adds `signerName` to the `PAYMENT_RECEIVED` outbox payload.
3. **Public endpoint enforcement** — `public-pay.controller.ts` `settleLink()` rejects `POST /pay/:token/confirm` with `BadRequestException('This invoice requires a signature before payment can be accepted.')` when `link.invoice.requiresSignature && !signature?.name?.trim()`.
4. **PDFs (both paths)** — `pdf.service.ts` (download) and `notifications/adapters/pdf-generator.service.ts` (email) render a signature block after totals: *"Signed by {name} · {email} on {date}"* when signed, an amber **"SIGNATURE REQUIRED"** notice when not, else "No signature required".
5. **Frontend** —
   - New invoice (`frontend/src/app/dashboard/invoices/new/page.tsx`): checkbox in "Invoice details", `requiresSignature` in POST body, "Signature: Required/Not required" summary row.
   - Invoice detail (`frontend/src/app/dashboard/invoices/[id]/page.tsx`): edit toggle + PATCH body, "Signature" row (Signed by / Required — pending / Not required).
   - Pay page (`frontend/src/app/pay/[token]/page.tsx` + `pay.module.css`): amber "SIGNATURE REQUIRED" tag, name/email fields, binding sign-consent text.
6. **Worker copies** — `background-workers.service.ts` copies `requiresSignature` onto cloned recurring-child invoices and includes signature props in worker `pdfData`.

### F2 — Payment links

- New helpers in `invoices.service.ts`: `resolvePaymentLink()`, `createPaymentLink()` (uses `randomBytes` token), `frontendUrl()` (reads `FRONTEND_URL` env).
- `send()` (DRAFT→SENT): sets `sentAt`, creates a payment link, includes `paymentLink` in the `INVOICE_SENT` outbox payload **and** in the return value.
- `findAll()` builds a single-query `paymentLink` map; `findOne()`/`update()` return `paymentLink` via `resolvePaymentLink()`.
- Invoice detail page: **Payment link** panel (shown for SENT/OVERDUE, between Summary and Customer) — copy-to-clipboard, "Open checkout", or "Generate payment link" (→ `POST /payments/links { invoice_id }`).

### F3 — Dunning wiring fix

- Root cause: `INVOICE_OVERDUE` outbox events hit the processor's `default:` "Unknown event type" branch — `SEND_OVERDUE_REMINDER` was never triggered.
- Fix (`notifications/handlers/outbox-processor.service.ts`): added `case OutboxEventType.INVOICE_OVERDUE` → new `handleInvoiceOverdue()` which re-fetches invoice+customer (skips if not `OVERDUE`), computes `daysOverdue = Math.max(1, floor((now − dueDate)/86400000))`, and enqueues a `SEND_OVERDUE_REMINDER` email job.

### F4 — Hosted checkout (brand-aligned, production-level)

- `public-pay.controller.ts` rewritten:
  - `GET /pay/:token` → full checkout object (`lineItems`, `subtotal/tax/discount/total`, `requiresSignature`, `signed`, `signerName`, `payable`, `alreadyPaid`, `businessName`, `expiresAt`, `dueDate`, `issuedAt`, `amount`).
  - `POST /pay/:token/confirm` → **real** settlement path (signature enforced by `settleLink()`, then `processSuccessfulPayment`).
  - `POST /pay/:token/simulate` → retained but requires `x-simulate: true` header (demo/secondary only, per consent).
- `frontend/src/app/pay/[token]/page.tsx`: states for loading / error / expired / already-paid / not-payable / payable; line-item table, subtotal/discount/tax/amount-due, "SIGNATURE REQUIRED" tag, sign fields + consent, primary **Pay securely** (→ `/confirm`), secondary **Simulate payment (demo)** (→ `/simulate`), success banner, expiry footer. Styled via `pay.module.css` with design tokens.
- Import path is `../../page.module.css` (confirmed correct depth).

**File inventory (this pass):** see Appendix A — git status at time of writing.

---

## 5. Technical architecture context

- **Multi-tenancy:** shared tables, JWT → `TenantContextInterceptor` → `AsyncLocalStorage` (`TenantContextService`), explicit `tenantId` predicates everywhere. Isolation is verified by unit tests.
- **Backend:** NestJS 10, Prisma 5.22.0, Neon (cloud Postgres, pooled), BullMQ workers + Redis, PDFKit, Stripe + mock payment adapters, outbox pattern for async side-effects (`INVOICE_SENT`, `PAYMENT_RECEIVED`, `INVOICE_OVERDUE`, …).
- **Frontend:** Next.js 16.3.3 (Turbopack), React 19, CSS modules + shared design tokens (`--green-700/500/100/50`, `--border`, `--ink`, `--muted`, `--subtle`).
- **Validation:** global `ValidationPipe` with `whitelist: true` + `forbidNonWhitelisted: true` → any new body field MUST be added to the relevant DTO class.
- **Counting:** `InvoiceCounter` (per-tenant/year) with an uncommitted-in-flight migration `20260914120000_add_invoice_counters`.
- **Recurring invoices:** background scheduler. Note: `notifications.service` was refactored (pre-session, in-flight) to an automatic scheduler in `BackgroundWorkersService`; `scheduleRecurringInvoiceCheck()` is now a no-op kept for backward compatibility, and the scheduler runs when `ENABLE_BACKGROUND_WORKERS=true`.

---

## 6. Verification evidence

- **Backend build:** `npm run build` — `EXIT=0`.
- **Frontend build:** `npm run build` — `EXIT=0` (prerendered static + dynamic on-demand routes).
- **Test results (backend, full suite):** **174 passed / 29 failed across 6 suites** (previously 151 passed / 52 failed across 11 suites at the start of the test-cleanup effort).

Suites covering the new F1–F4 code — **all green**:

| Suite | Result | What it verifies |
|---|---|---|
| `invoices.service.spec` | 28/28 ✅ | signature persistence, `send()`→ paymentLink, `findOne/update` link resolution, `getDashboardBalance` |
| `payments.service.spec` | 24/24 ✅ | signed/unsigned settlement, "signature required" rejection, idempotency, PAID transitions |
| `outbox-processor.service.spec` | ✅ | dunning wiring (`INVOICE_OVERDUE` no longer unknown event) |
| `stripe-provider.spec` / `webhooks.controller.spec` | ✅ | payment provider + webhook paths |
| `pdf.service.spec` + `pdf.smoke` + `pdf.integration` | 27/27 ✅ | signature block renders on download & email PDFs |
| `invoices.controller.spec` | ✅ | query-object `findAll` contract |

Specs fixed during this pass: `invoices.service` (mock was missing `$transaction` + `paymentLink`), `payments.service` (mock invoice missing `totalCents`), `invoices.controller` (findAll call shape), `pdf.smoke` (wrong DI token `'TenantContextService'` string vs class), `pdf.integration` (supertest default import).

---

## 7. Open debt — remaining failing suites (all pre-existing, none exercise F1–F4)

| Suite | Root cause | Area |
|---|---|---|
| `customers.service.spec` | stale v1 mocks (`includeArchived`, `customer.count is not a function`, `invoice.findFirst is not a function`) | customers (untouched) |
| `customers.controller.spec` | stale `toHaveBeenCalledWith` expectations | customers (untouched) |
| `customers/unit.spec` | stale mocks | customers (untouched) |
| `dashboard.overview.spec` | stale mocks | dashboard (untouched) |
| `reports.unit.spec` | stale mocks | reports (untouched) |
| `notifications.service.spec` | DI harness missing `BackgroundWorkersService` provider (in-flight pre-session constructor change) | notifications (in-flight refactor) |

Fix recommendation: update these harnesses to the current service contracts (add missing mocked models/`totalCents`; provide `BackgroundWorkersService`); they do not indicate product defects.

---

## 8. Operational notes & environment gotchas (research base for future work)

- `prisma migrate dev` fails on this repo (historical shadow-DB drift, e.g. `audit_logs_tenant_id_created_at_idx`). Pattern that works: **handwrite the migration SQL and run `prisma migrate deploy`** (no shadow DB).
- `backend/.env` wraps `DATABASE_URL` in quotes; Prisma CLI needs the unquoted value: `export DATABASE_URL=$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env)`.
- `prisma generate` can hit Windows file locks (`query_engine-windows.dll.node`) while a dev server holds the client — DO NOT kill user processes; verify the regenerated `index.d.ts` contains the new fields instead.
- Builds: **always capture the real exit code** (`> log 2>&1; echo EXIT=$?`) — piping to `tail` masks `npm error code 1`.
- Port watch-outs: the app has a history of a fixed port conflict (PORT 20128) during dev. (memory note)
- `FRONTEND_URL` env must be set for correct payment-link URL generation.

---

## 9. Future modifications & additional changes — research areas

The sections below are the proposal pool for the next passes. Each is anchored to a current gap so future PRs can be scoped directly.

### A. Payments & checkout hardening
1. **A1 Real Stripe integration** — set live keys + webhook signing secret; end-to-end webhook verification test; map `payment_intent.succeeded`/`paid` events. (Largest production-readiness item.)
2. **A2 Checkout line-item details on hosted page** — Qty/rate columns beyond description; tax-rate display; discount line already shown.
3. **A3 Payment-link lifecycle** — revoke link on `VOID`/`PAID`; configurable expiry; regenerate/cancel UX; prevent double-redemption.
4. **A4 Confirm idempotency** — expose `idempotencyKey` from the checkout and make `/confirm` atomic against concurrent submits.
5. **A5 Provider adapter swap knob** — first-class env switch between Stripe and mock provider (currently implicit).

### B. Dunning & receivables
6. **B1 Escalation chain** — stage-based reminders (7/14/30-day), configurable per tenant or per invoice.
7. **B2 Auto-void** — auto-void invoices after N days overdue (with audit trail) to keep aging/AR clean.
8. **B3 Aging buckets** — AR report by 30/60/90/90+ in `reports` module (builds on the fixed OVERDUE event).
9. **B4 Dunning opt-out per customer/invoice** — needed to avoid pestering known-good payers.

### C. PDF & documents
10. **C1 Billing/to addresses** — ship-to + bill-to blocks on PDFs.
11. **C2 Multi-currency formatting** — currency token on invoice + `Intl.NumberFormat` in PDF and checkout.
12. **C3 Tax line detail** — per-item tax breakdown and jurisdiction/rate label rows.
13. **C4 Statement PDF** — customer statement (balance-forward + transaction history) reusing the signature-aware PDF pipeline.

### D. SaaS / tenancy growth
14. **D1 Signup/onboarding** — tenant self-registration (currently tenant created out-of-band) → org creation, first customer, first invoice.
15. **D2 Subscription & plan limits** — meter usage (invoices/payments) and gate by plan; this closes the largest remaining title-connotation gap (§2.2).
16. **D3 Tenant lifecycle** — archive/suspend/export/delete with audit log.

### E. Reliability, observability & security
17. **E1 Outbox DLQ/retry** — dead-letter + backoff for failed outbox jobs and emails; alert on lag.
18. **E2 Structured logging + metrics** — request/tenant correlation IDs; queue/outbox lag gauges.
19. **E3 Pay-endpoint rate limiting** — throttling on `/pay/*` (already a public surface) + CORS policy.
20. **E4 Signature audit row** — dedicated `audit_log` entries on sign/settlement events for legal traceability.

### F. Frontend UX & quality
21. **F1 Public checkout polish** — invoice header logo/address block, print view, localization (i18n strings already seedable).
22. **F2 E2E tests** — Playwright flows: create invoice → mark signature-required → send → open link → sign → confirm → receipt.
23. **F3 Notification prefs** — deferred by instruction, but the outbox event model already supports opting per-type; design when unblocked.

### G. Test & docs debt
24. **G1 Fix the 6 remaining failing suites** (§7) — highest-value quality step, low effort.
25. **G2 Contract fixtures** — seed two-tenant integration data so cross-tenant PDF/webhook fixtures are real rather than simulated.
26. **G3 README/ARCHITECTURE refresh** — document `FRONTEND_URL`, `ENABLE_BACKGROUND_WORKERS`, payload-link flow, and the signature fields.

---

## Appendix A — Git status at time of writing (branch `work`)

```
M backend/prisma/schema.prisma
M backend/src/billing/__tests__/invoices.service.spec.ts
M backend/src/billing/dto/create-invoice.dto.ts
M backend/src/billing/dto/update-invoice.dto.ts
M backend/src/billing/invoices.service.ts
M backend/src/notifications/adapters/pdf-generator.service.ts
M backend/src/notifications/handlers/outbox-processor.service.ts
M backend/src/notifications/notifications.service.ts        (in-flight pre-session scheduler refactor)
M backend/src/notifications/workers/background-workers.service.ts
M backend/src/payments/payments.service.ts
M backend/src/payments/public-pay.controller.ts
M backend/src/pdf/pdf.service.ts
M backend/src/payments/__tests__/payments.service.spec.ts    (fixture debt)
M backend/src/billing/__tests__/invoices.controller.spec.ts  (harness debt)
M backend/src/pdf/smoke.spec.ts                              (harness debt)
M backend/src/pdf/pdf.integration.spec.ts                    (harness debt)
M frontend/src/app/dashboard/invoices/[id]/page.tsx
M frontend/src/app/dashboard/invoices/[id]/invoice.module.css
M frontend/src/app/dashboard/invoices/new/page.tsx
M frontend/src/app/dashboard/invoices/new/new.module.css
M frontend/src/app/pay/[token]/page.tsx
?? backend/prisma/migrations/20260914120000_add_invoice_counters/
?? backend/prisma/migrations/20260914130000_add_invoice_signature/
?? frontend/src/app/pay/[token]/pay.module.css
```

Nothing is committed yet (`work` HEAD: `13e5d50c feat: Added new features on settings tab`). Per attribution rule, any commit message should end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
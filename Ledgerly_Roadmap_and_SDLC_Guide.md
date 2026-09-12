# Ledgerly — Product Roadmap & Complete SDLC Guide
**Multi-Tenant SaaS Invoicing & Billing Platform**

> Prepared: September 2026
> Current state: Live on Vercel (`multi-tenant-saas-invoicing-billing-*.vercel.app`), core modules shipped — Overview, Invoices, Customers, Payments, Reports, Settings.

---

## 1. Where You Are Today (Baseline Audit)

From the current build, you already have a working v1 skeleton:

| Module | What exists | What's missing |
|---|---|---|
| **Overview** | Outstanding / Overdue / Paid-this-month cards, recent invoices list | Real-time charts, trend lines, date-range filters |
| **Invoices** | Invoice list, search, status filter, "New invoice" CTA | Invoice detail/edit view, line items, PDF export, recurring invoices, send-via-email |
| **Customers** | Add/list/edit/archive customer, search | Customer detail page (history, lifetime value), CSV import/export, custom fields |
| **Payments** | Payment stats (Collected/Pending/Refunded), Stripe-based "Collect payment" | Multiple gateways, payment methods on file, dunning/retry logic |
| **Reports** | Outstanding/Overdue/Paid summary | Exportable reports, revenue analytics, aging report, tax report |
| **Settings** | Present in nav | Tenant/org settings, branding, team & roles, billing preferences not yet visible |
| **Navigation** | Left sidebar, single workspace ("My workspace") | BreadcrumV drill-down, multi-workspace switcher, global search, command palette |

This is a solid MVP — the right next move isn't a rebuild, it's **layering depth onto each module** and **hardening multi-tenancy**, which is exactly what this document maps out.

---

## 2. Product Vision

> Ledgerly should evolve from "a place to create invoices" into **the financial control center for a small business or agency** — subscriptions, one-off billing, customer self-service, and investor-grade reporting, without needing Stripe dashboards or spreadsheets on the side.

Guiding principles for every feature decision:
1. **Multi-tenant-first** — every feature must be scoped correctly per workspace/tenant; never leak data across tenants.
2. **Automation over manual work** — anything done twice by a human should become a workflow (recurring invoices, dunning, reminders).
3. **Progressive disclosure** — powerful features (tax rules, revenue recognition) stay hidden until a tenant needs them, so the UI stays simple for small users.
4. **API-first** — build every feature behind an internal API so a public API/webhooks later is trivial, not a rewrite.

---

## 3. Feature Roadmap

Organized in four horizons. Each item is tagged with rough effort (**S**mall / **M**edium / **L**arge) so you can slot it into sprints.

### Phase 0 — Stabilize the Foundation (2–3 weeks)
*Make the current MVP production-grade before adding surface area.*

- [ ] **Invoice detail/edit page** with line items, quantity, tax, discount, subtotal, total (M)
- [ ] **PDF invoice generation** + download/email (M)
- [ ] **Tenant-scoped RBAC**: Owner / Admin / Billing Manager / Viewer roles (L)
- [ ] **Audit logging** for invoice/customer/payment changes (M)
- [ ] **Error & empty states** across all pages (currently minimal) (S)
- [ ] **Environment separation**: staging vs. production Vercel deployments + preview URLs per PR (S)
- [ ] **Basic test suite**: unit tests for invoice totals/tax math, e2e smoke test for invoice creation flow (M)

### Phase 1 — Core Billing Depth (Weeks 3–8)
*This is where you go from "invoice generator" to "billing platform."*

- [ ] **Recurring / subscription invoices** — daily, weekly, monthly, yearly billing cycles with proration (L)
- [ ] **Multiple payment gateways** — Stripe (existing) + PayPal / Razorpay (important if targeting India/APAC customers) (M)
- [ ] **Automated dunning** — retry failed payments + reminder emails at configurable intervals (M) — *involuntary churn from failed payments is typically 20–40% of all churn, so this has outsized ROI.*
- [ ] **Customer self-service portal** — customers log in to view/pay invoices, update payment method, download receipts (L)
- [ ] **Credit notes & refunds workflow** (M)
- [ ] **Estimates/Quotes → convert to invoice** (M)
- [ ] **Multi-currency support** with FX display (M)
- [ ] **Tax automation** — per-region tax rates, tax-inclusive/exclusive toggle (M)
- [ ] **Email notification system** — invoice sent, payment received, payment overdue, receipt (M)
- [ ] **Invoice templates & branding** — logo, color, custom invoice numbering (S)

### Phase 2 — Multi-Tenant & Team Features (Weeks 8–14)
*Features that make this a real B2B SaaS product rather than a single-user tool.*

- [ ] **Multi-workspace switcher** — one login, multiple tenant orgs (agencies managing several clients) (L)
- [ ] **Team invitations & member management** inside Settings (M)
- [ ] **SSO (Google/Microsoft OAuth)** for login, optionally SAML for enterprise tier later (M)
- [ ] **Per-tenant custom domains / white-labeling** (M)
- [ ] **Usage-based / metered billing** for tenants who charge their own customers by usage (L)
- [ ] **Plan & subscription tiers for Ledgerly itself** (if you intend to monetize Ledgerly as a product) — Free / Pro / Business with Stripe Billing (L)
- [ ] **Webhooks** — invoice.paid, invoice.overdue, customer.created, etc. so tenants can integrate (M)
- [ ] **Public REST API + API keys per tenant** (L)

### Phase 3 — Analytics, Integrations & Scale (Weeks 14–22+)
- [ ] **Revenue analytics dashboard** — MRR/ARR, churn, aging report, cash flow forecast (L)
- [ ] **Exportable reports** — CSV/PDF/Excel, scheduled email reports (M)
- [ ] **Accounting integrations** — QuickBooks, Xero, Zapier (L)
- [ ] **CRM sync** — HubSpot/Salesforce contact sync (M)
- [ ] **Mobile-responsive / PWA** experience (M)
- [ ] **AI-assisted features** — auto-categorize expenses, smart payment-reminder timing, natural-language "show me overdue invoices from last month" search (M–L)
- [ ] **SOC 2 readiness** if targeting business customers who will ask for it (L, ongoing)

### Navigation & UX Improvements (cross-cutting, do incrementally)
- [ ] Breadcrumbs already exist (Workspace / Page) — extend to 3 levels for detail pages (e.g., Workspace / Invoices / INV-0004)
- [ ] Global search (⌘K / Ctrl+K command palette) across invoices, customers, payments
- [ ] Sidebar collapse + keyboard shortcuts
- [ ] Notification bell (payment received, invoice overdue)
- [ ] Dark mode toggle
- [ ] Loading skeletons instead of blank states
- [ ] Contextual empty states with clear CTAs (you already do this well on Payments — replicate everywhere)

---

## 4. Prioritization Matrix (MoSCoW)

| Must Have (do now) | Should Have (next) | Could Have (later) | Won't Have (yet) |
|---|---|---|---|
| Invoice detail + PDF | Multi-gateway payments | AI features | Full ERP replacement |
| RBAC / tenant isolation hardening | Self-service portal | Marketplace integrations | Native mobile apps |
| Recurring invoices | Multi-workspace switcher | White-labeling | Blockchain/crypto payments |
| Dunning automation | Public API/webhooks | SSO/SAML enterprise | |

---

## 5. Suggested Technical Architecture Additions

Since you're already on Vercel (implies Next.js), here's how to extend the architecture cleanly:

```
┌─────────────────────────────────────────────┐
│  Next.js App (Vercel) — App Router           │
│  /dashboard/*  — tenant-scoped UI            │
│  /portal/*     — customer self-service        │
│  /api/*        — internal API (tenant-scoped) │
│  /api/v1/*     — public API (API key auth)    │
└───────────────┬───────────────────────────────┘
                │
      ┌─────────┴──────────┐
      │  Auth (Clerk/Auth0/  │  — SSO, session, org/tenant context
      │  NextAuth + orgs)    │
      └─────────┬──────────┘
                │
      ┌─────────┴──────────┐
      │  Postgres (Neon/    │  — tenant_id on every table (pooled model)
      │  Supabase) + RLS     │  — Row-Level Security enforcing tenant scoping
      └─────────┬──────────┘
                │
   ┌────────────┼────────────┬───────────────┐
   │            │            │               │
Stripe      Email (Resend/  PDF gen      Background jobs
Billing     Postmark)      (react-pdf/   (Inngest/Trigger.dev)
+ webhooks                 Puppeteer)    — dunning, recurring invoices
```

**Key multi-tenant principles to enforce as you scale (this is where most SaaS billing apps get hacked or leak data):**
1. Every DB query must be scoped by `tenant_id` — never trust the client, always derive tenant from the authenticated session/JWT.
2. Use **Postgres Row-Level Security (RLS)** as a second layer of defense beyond application code — belt and suspenders.
3. Authorization = two questions answered in order: *which tenant is this request scoped to* → *what role does this user hold in that tenant*. Never skip step one.
4. File storage (invoice PDFs, logos) should use tenant-prefixed storage keys/buckets.
5. Add automated tests that specifically attempt cross-tenant access and assert they fail — catch this in CI, not in a customer's support ticket.
6. Log every privileged action (who did what, in which tenant, when) for audit and future SOC 2 needs.

---

## 6. Complete Software Development Life Cycle (SDLC) for Ledgerly's Next Phase

This is a practical, right-sized SDLC for a solo/small-team SaaS project — not enterprise waterfall theatre.

### 6.1 Planning & Discovery
- Define **why** each feature exists — tie it to a user story ("As an agency owner managing 5 clients, I need a workspace switcher so I don't log in/out repeatedly").
- Maintain a single backlog (Linear, GitHub Projects, or Notion) — import the roadmap above as epics → issues.
- Decide monetization model early if Ledgerly itself will be sold (affects Phase 2 priorities).
- Set success metrics per phase (see §7).

### 6.2 Requirements & Specification
- For each feature: write a 1-page spec — problem, user story, acceptance criteria, out-of-scope.
- For anything touching money (invoices, payments, tax) — explicitly write out the math/edge cases before coding (proration, partial refunds, currency rounding).
- Flag any feature with compliance implications (tax, revenue recognition, PII) for extra review.

### 6.3 Design
- **UX**: wireframe new pages (invoice detail, customer detail, portal) before building — Figma or even a Claude/AI-generated mockup artifact is fine for a small team.
- **Data model**: design/update your ER diagram whenever you add an entity (subscriptions, credit notes, payment methods). Keep `tenant_id` on every table from day one.
- **API contract**: define request/response shapes for internal APIs before wiring UI to them — prevents rework.
- **Design system**: since you're already using a clean, consistent look (teal accent, card-based layout) — formalize it into reusable components (Button, Card, StatusBadge, EmptyState) so every new page matches instantly.

### 6.4 Development
- **Branching model**: trunk-based with short-lived feature branches + PR review, or GitFlow if you bring on more contributors.
- **Environments**: local → preview (Vercel PR deploys) → staging → production. Never develop directly against production data.
- **Feature flags** for anything risky (new billing engine, recurring invoices) so you can roll out to a subset of tenants first.
- **Code review checklist** (small but non-negotiable):
  - Is every new query tenant-scoped?
  - Are money values handled as integers/cents, not floats?
  - Is user input validated and sanitized (invoice amounts, tax rates)?
  - Are secrets/API keys in environment variables, never hardcoded?

### 6.5 Testing
| Layer | Tool suggestions | What to cover |
|---|---|---|
| Unit | Vitest/Jest | Invoice totals, tax math, proration logic |
| Integration | Vitest + test DB | API routes, tenant isolation |
| E2E | Playwright | Create invoice → send → pay → mark paid flow |
| Security | manual + automated | Cross-tenant access attempts, auth bypass attempts |
| Load (before big launches) | k6 / Artillery | Concurrent invoice generation, webhook throughput |

- Add CI (GitHub Actions) to run lint + unit + e2e on every PR before merge.
- Before each release, run a **regression checklist** covering the 5 core flows: create invoice → send → collect payment → refund → generate report.

### 6.6 Deployment
- Vercel preview deployments per PR (you likely already get this for free).
- Promote preview → production only after CI passes + manual smoke test.
- Use **database migrations** (Prisma Migrate/Drizzle Kit) — never hand-edit schema in production.
- Roll out risky changes behind feature flags to 5–10% of tenants first.
- Maintain a CHANGELOG.md and a lightweight release notes page — SaaS customers value visible progress.

### 6.7 Monitoring & Operations
- **Error tracking**: Sentry (catches uncaught exceptions in both client and API routes).
- **Uptime & performance**: Vercel Analytics + a simple external uptime check (Better Uptime/UptimeRobot).
- **Logging**: structured logs for payment webhook events (Stripe webhooks failing silently is one of the most common SaaS billing bugs).
- **Alerting**: Slack/email alert on payment webhook failures, failed dunning jobs, and 5xx spikes.

### 6.8 Maintenance & Iteration
- Weekly triage of bug reports vs. feature requests.
- Monthly review of the roadmap against actual usage data — cut features nobody uses, double down on what's sticky.
- Quarterly security review (dependency updates, RLS policy audit, expired API keys).
- Keep a public or internal roadmap so users/stakeholders see what's next (Trello/Notion "Now / Next / Later" board works well).

---

## 7. Success Metrics to Track Once Features Ship

- **Activation**: % of new tenants who send their first invoice within 24 hours
- **Time-to-first-payment**: median days from invoice sent → paid
- **Involuntary churn rate**: failed payments not recovered by dunning (target: reduce, since this is typically 20–40% of total churn industry-wide)
- **MRR/ARR** (if Ledgerly itself is monetized)
- **Feature adoption**: % of tenants using recurring invoices, self-service portal, etc.
- **Support ticket volume per feature** — signals confusing UX

---

## 8. Suggested 90-Day Execution Plan

| Weeks | Focus | Key deliverables |
|---|---|---|
| 1–2 | Stabilize | Invoice detail page, PDF export, RBAC, tests, CI |
| 3–5 | Core billing | Recurring invoices, dunning, email notifications |
| 6–8 | Customer experience | Self-service portal, credit notes, estimates |
| 9–11 | Multi-tenant depth | Multi-workspace switcher, team roles, SSO |
| 12–13 | Platform | Public API + webhooks, integrations (QuickBooks/Zapier) |

---

## 9. Immediate Next Steps (This Week)

1. Turn each Phase 0 checklist item into a GitHub/Linear issue.
2. Write the 1-page spec for **Invoice Detail + PDF export** — the highest-leverage missing feature right now.
3. Add `tenant_id` audit to every existing table/query as a security pass before adding new surface area.
4. Set up Sentry + basic CI so you catch regressions as you move fast on Phase 1.

---

*This guide is meant to be a living document — update the checkboxes as you ship, and revisit the phase boundaries every few weeks based on real usage data rather than treating it as fixed.*

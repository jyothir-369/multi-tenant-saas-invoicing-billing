/*
 * Shared response types for the dashboard overview endpoint. Mirrors the
 * `OverviewResponse` shape returned by `backend/src/dashboard`.
 */
export interface OverviewStats {
  outstanding_cents: number;
  overdue_cents: number;
  paid_this_month_cents: number;
  total_customers: number;
  paid_this_month_delta_pct: number | null;
}

export interface RevenueByMonth {
  month: string; // "YYYY-MM"
  amount_cents: number;
}

export interface InvoiceBucket {
  month: string; // "YYYY-MM"
  outstanding_cents: number;
  overdue_cents: number;
}

export interface RecentInvoice {
  id: string;
  invoiceNumber?: string;
  customerName?: string;
  status: string;
  amountCents: number;
  dueDate: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  text: string;
  createdAt: string;
}

export interface OverviewResponse {
  range: string;
  stats: OverviewStats;
  revenue_by_month: RevenueByMonth[];
  invoice_buckets: InvoiceBucket[];
  recent_invoices: RecentInvoice[];
  recent_activity: ActivityEvent[];
}

export const DEFAULT_OVERVIEW: OverviewResponse = {
  range: "this_month",
  stats: {
    outstanding_cents: 0,
    overdue_cents: 0,
    paid_this_month_cents: 0,
    total_customers: 0,
    paid_this_month_delta_pct: null,
  },
  revenue_by_month: [],
  invoice_buckets: [],
  recent_invoices: [],
  recent_activity: [],
};

export const OVERVIEW_RANGES = [
  { value: "this_month", label: "This month" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "this_quarter", label: "This quarter" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
] as const;

export type OverviewRange = (typeof OVERVIEW_RANGES)[number]["value"];
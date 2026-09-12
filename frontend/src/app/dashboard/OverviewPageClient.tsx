"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api, formatMoney } from "../../lib/api";
import EmptyState from "../../components/EmptyState";
import ErrorState from "../../components/ErrorState";
import LoadingSkeleton from "../../components/LoadingSkeleton";

type OverviewData = {
  range: string;
  stats: {
    outstanding_cents: number;
    overdue_cents: number;
    paid_this_month_cents: number;
    total_customers: number;
    paid_this_month_delta_pct: number | null;
  };
  revenue_by_month: { month: string; amount_cents: number }[];
  invoice_buckets: { month: string; outstanding_cents: number; overdue_cents: number }[];
  recent_invoices: {
    id: string;
    invoiceNumber?: string;
    customerName?: string;
    status: string;
    amountCents: number;
    dueDate: string;
  }[];
  recent_activity: { id: string; type: string; text: string; createdAt: string }[];
};

const ranges = [
  { key: "this_month", label: "This month" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
];

export default function OverviewPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = searchParams.get("range") || "this_month";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<OverviewData>(`/dashboard/overview?range=${range}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load overview.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRange = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    router.push(`/dashboard?${params.toString()}`);
  };

  if (loading) {
    return (
      <div>
        <LoadingSkeleton height="card" />
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm">
            <LoadingSkeleton height="table" rows={6} />
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm">
            <LoadingSkeleton height="table" rows={6} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  const stats = data?.stats;

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <span className="text-[11px] font-bold tracking-[1.2px] text-[#94a29b]">LEDGERLY WORKSPACE</span>
          <h1 className="text-[32px] font-extrabold tracking-[-1.4px] text-[#18221f] font-[Manrope,sans-serif] mt-1">Overview<span className="text-[#4eaa7f]">.</span></h1>
          <p className="text-sm text-[#78817e] mt-1">Your billing workspace at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => handleRange(e.target.value)}
            className="border border-[#e7ece9] rounded-lg bg-white px-3 py-2 text-sm text-[#627068]"
          >
            {ranges.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Outstanding", value: stats?.outstanding_cents ?? 0, sub: "From your tenant workspace" },
          { label: "Overdue", value: stats?.overdue_cents ?? 0, sub: "From your tenant workspace" },
          {
            label: "Paid this month",
            value: stats?.paid_this_month_cents ?? 0,
            sub: "From your tenant workspace",
            delta: stats?.paid_this_month_delta_pct ?? null,
          },
          { label: "Total customers", value: stats?.total_customers ?? 0, sub: "Active in workspace" },
        ].map((s) => (
          <article key={s.label} className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-[0_3px_10px_#20352b04]">
            <div className="flex justify-between items-center text-xs text-[#77847e] font-medium mb-2">
              <span>{s.label}</span>
              {s.delta !== undefined && s.delta !== null && (
                <span className="text-[#55a27d] font-bold">{s.delta > 0 ? "+" : ""}{s.delta}%</span>
              )}
            </div>
            <strong className="block text-[24px] font-extrabold text-[#18221f] font-[Manrope,sans-serif] tracking-[-.7px] leading-none mb-2">
              {typeof s.value === "number" && s.label === "Total customers" ? s.value : formatMoney(Number(s.value ?? 0))}
            </strong>
            <small className="text-xs text-[#78817e]">{s.sub}</small>
          </article>
        ))}
      </div>

      {/* Charts + tables grid */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        {/* Revenue chart */}
        <section className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-[0_3px_10px_#20352b04]">
          <h2 className="font-[Manrope,sans-serif] text-[17px] font-bold tracking-[-.5px] mb-1">Revenue</h2>
          <p className="text-xs text-[#78817e] mb-4">Last 6 months — paid totals</p>
          {data?.revenue_by_month && data.revenue_by_month.length > 0 ? (
            <div className="flex items-end gap-2 h-48 pt-8 border-b border-[#e7ece9] px-1">
              {data.revenue_by_month.map((m) => {
                const max = Math.max(...data.revenue_by_month.map((r) => r.amount_cents), 1);
                const h = Math.round((m.amount_cents / max) * 100);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="w-full bg-[#23745a] rounded-t-md transition-all group-hover:bg-[#1b6049]" style={{ height: `${h}%`, minHeight: 4 }} />
                    <span className="text-[10px] text-[#78817e] transform -rotate-45 origin-top-left whitespace-nowrap">{m.amount_cents > 0 ? formatMoney(m.amount_cents) : ""}</span>
                    <span className="text-[11px] text-[#78817e]">{m.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-[#78817e]">No revenue data</div>
          )}
        </section>

        {/* Outstanding vs Overdue stacked bars */}
        <section className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-[0_3px_10px_#20352b04]">
          <h2 className="font-[Manrope,sans-serif] text-[17px] font-bold tracking-[-.5px] mb-1">Outstanding vs Overdue</h2>
          <p className="text-xs text-[#78817e] mb-4">Last 6 months — by due date</p>
          {data?.invoice_buckets && data.invoice_buckets.length > 0 ? (
            <div className="flex items-end gap-2 h-48 pt-8 border-b border-[#e7ece9] px-1">
              {data.invoice_buckets.map((b) => {
                const max = Math.max(...data.invoice_buckets.map((r) => r.outstanding_cents + r.overdue_cents), 1);
                const h = Math.round(((b.outstanding_cents + b.overdue_cents) / max) * 100);
                const outH = h > 0 ? Math.round((b.outstanding_cents / (b.outstanding_cents + b.overdue_cents || 1)) * h) : 0;
                return (
                  <div key={b.month} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: `${h}%`, minHeight: 4 }}>
                      <div className="w-full bg-[#23745a] rounded-t-md" style={{ height: `${outH}px` }} />
                      <div className="w-full bg-[#b94d4d] rounded-t-md" style={{ height: `${h - outH}px` }} />
                    </div>
                    <span className="text-[11px] text-[#78817e]">{b.month.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-[#78817e]">No bucket data</div>
          )}
        </section>
      </div>

      {/* Recent invoices + Activity */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4 mt-4">
        <section className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-[0_3px_10px_#20352b04]">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-[Manrope,sans-serif] text-[17px] font-bold tracking-[-.5px]">Recent invoices</h2>
              <p className="text-xs text-[#78817e]">Latest billing activity</p>
            </div>
            <Link href="/dashboard/invoices" className="text-xs font-bold text-[#23745a]">View all →</Link>
          </div>
          {data?.recent_invoices && data.recent_invoices.length > 0 ? (
            <div className="divide-y divide-[#f0f3f1]">
              {data.recent_invoices.map((inv) => (
                <Link href={`/dashboard/invoices/${inv.id}`} key={inv.id} className="flex items-center gap-3 py-3 hover:bg-[#f7faf8] rounded-md px-1 -mx-1 transition-colors">
                  <span className="w-8 h-8 rounded-md bg-[#edf5f0] text-[#23745a] flex items-center justify-center text-xs font-bold shrink-0">{inv.invoiceNumber?.slice(0, 2) ?? "IN"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <b className="text-[12px] truncate">{inv.invoiceNumber ?? `INV-${inv.id.slice(0, 6).toUpperCase()}`}</b>
                      <span className="text-[10px] text-[#78817e] truncate">{inv.customerName ?? "Customer"}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${inv.status === "PAID" ? "bg-[#e6f4eb] text-[#33805b]" : inv.status === "OVERDUE" ? "bg-[#fff1e2] text-[#a16b29]" : "bg-[#eff4f1] text-[#5f796b]"}`}>{inv.status}</span>
                      <small className="text-[11px] text-[#78817e]">{new Date(inv.dueDate).toLocaleDateString()}</small>
                    </div>
                  </div>
                  <b className="text-[13px] font-extrabold text-[#18221f] whitespace-nowrap">{formatMoney(inv.amountCents)}</b>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No invoices yet" description="Invoices will appear here when your workspace has billing activity." />
          )}
        </section>

        <section className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-[0_3px_10px_#20352b04]">
          <h2 className="font-[Manrope,sans-serif] text-[17px] font-bold tracking-[-.5px] mb-4">Recent activity</h2>
          {data?.recent_activity && data.recent_activity.length > 0 ? (
            <div className="divide-y divide-[#f0f3f1]">
              {data.recent_activity.map((evt) => (
                <div key={evt.id} className="py-3 flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#edf5f0] text-[#23745a] flex items-center justify-center text-sm shrink-0">●</span>
                  <div>
                    <p className="text-[12px] text-[#18221f] leading-snug">{evt.text}</p>
                    <p className="text-[11px] text-[#78817e] mt-0.5">{new Date(evt.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No activity yet" description="Activity will appear when events occur in your workspace." />
          )}
        </section>
      </div>
    </div>
  );
}

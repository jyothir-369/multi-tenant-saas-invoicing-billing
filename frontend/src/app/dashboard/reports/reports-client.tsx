"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api, formatMoney } from "../../../lib/api";
import EmptyState from "../../../components/EmptyState";
import ErrorState from "../../../components/ErrorState";
import LoadingSkeleton from "../../../components/LoadingSkeleton";
import Link from "next/link";

type RevenueData = {
  total_cents: number;
  by_month: { month: string; amount_cents: number }[];
  by_customer: { customer_id: string; name: string; amount_cents: number }[];
};

const ranges = [
  { key: "this_month", label: "This month" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "this_quarter", label: "This quarter" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "All time" },
];

export default function ReportsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "revenue";
  const range = searchParams.get("range") || "this_month";

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "revenue") {
        setData(await api<RevenueData>(`/reports/revenue?range=${range}`));
      } else if (tab === "outstanding") {
        setData(await api<any>(`/reports/outstanding?range=${range}`));
      } else if (tab === "aging") {
        setData(await api<any>(`/reports/aging`));
      } else if (tab === "customers") {
        setData(await api<any>(`/reports/customers?range=${range}`));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [tab, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (t: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", t);
    router.push(`/dashboard/reports?${params.toString()}`);
  };

  const setRange = (r: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", r);
    router.push(`/dashboard/reports?${params.toString()}`);
  };

  const tabs = [
    { key: "revenue", label: "Revenue" },
    { key: "outstanding", label: "Outstanding" },
    { key: "aging", label: "Aging" },
    { key: "customers", label: "Customers" },
  ];

  if (loading && !data) {
    return (
      <div>
        <div className="flex gap-3 mb-6">
          {tabs.map((t) => (
            <button key={t.key} disabled className="px-4 py-2 rounded-lg bg-[#e7ece9] text-[#78817e] text-sm font-semibold">{t.label}</button>
          ))}
        </div>
        <LoadingSkeleton height="card" />
        <div className="mt-4"><LoadingSkeleton height="table" rows={5} /></div>
      </div>
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={load} />;
  }

  const exportUrl = () => {
    if (tab === "revenue") return `/reports/revenue/export.csv?range=${range}`;
    if (tab === "outstanding") return `/reports/outstanding/export.csv?range=${range}`;
    if (tab === "aging") return `/reports/aging/export.csv`;
    if (tab === "customers") return `/reports/customers/export.csv?range=${range}`;
    return "";
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-[32px] font-extrabold tracking-[-1.4px] text-[#18221f] font-[Manrope,sans-serif]">Reports<span className="text-[#4eaa7f]">.</span></h1>
          <p className="text-sm text-[#78817e] mt-1">Analytics for your workspace.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-[#23745a] text-white shadow-sm" : "bg-[#e7ece9] text-[#78817e] hover:bg-[#dce3dc]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "revenue" && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              {ranges.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${range === r.key ? "bg-[#23745a] text-white" : "bg-white border border-[#e7ece9] text-[#627068]"}`}>{r.label}</button>
              ))}
            </div>
            <a href={exportUrl()} className="text-xs font-bold text-[#23745a] hover:underline">Export CSV</a>
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm mb-4">
            <p className="text-xs text-[#78817e] mb-1">Total revenue</p>
            <h2 className="text-[28px] font-extrabold text-[#18221f] font-[Manrope,sans-serif] tracking-[-.7px]">{formatMoney(data?.total_cents ?? 0)}</h2>
          </div>

          {data?.by_month && data.by_month.length > 0 ? (
            <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm mb-4">
              <h3 className="font-semibold text-[#18221f] mb-3">Revenue by month</h3>
              <div className="flex items-end gap-2 h-48 pt-8 border-b border-[#e7ece9] px-1">
                {data.by_month.map((m: any) => {
                  const max = Math.max(...data.by_month.map((r: any) => r.amount_cents), 1);
                  const h = Math.round((m.amount_cents / max) * 100);
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[#23745a] rounded-t-md" style={{ height: `${h}%`, minHeight: 4 }} />
                      <span className="text-[10px] text-[#78817e]">{m.month.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm mb-4"><EmptyState title="No revenue yet" description="Paid invoices will appear here." /></div>
          )}

          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-[#18221f] mb-3">By customer</h3>
            <table className="w-full text-sm">
              <thead className="bg-[#f7faf8] text-xs text-[#78817e] uppercase tracking-wider">
                <tr><th className="text-left px-3 py-2 font-medium">Customer</th><th className="text-right px-3 py-2 font-medium">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f1]">
                {(data?.by_customer ?? []).map((c: any) => (
                  <tr key={c.customer_id} className="hover:bg-[#f7faf8]"><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2 text-right font-medium">{formatMoney(c.amount_cents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "outstanding" && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              {ranges.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${range === r.key ? "bg-[#23745a] text-white" : "bg-white border border-[#e7ece9] text-[#627068]"}`}>{r.label}</button>
              ))}
            </div>
            <a href={exportUrl()} className="text-xs font-bold text-[#23745a] hover:underline">Export CSV</a>
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm mb-4">
            <p className="text-xs text-[#78817e] mb-1">Outstanding total</p>
            <h2 className="text-[28px] font-extrabold text-[#18221f] font-[Manrope,sans-serif] tracking-[-.7px]">{formatMoney(data?.total_cents ?? 0)}</h2>
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f7faf8] text-xs text-[#78817e] uppercase tracking-wider"><tr><th className="text-left px-3 py-2">Number</th><th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Due</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
              <tbody className="divide-y divide-[#f0f3f1]">
                {(data?.invoices ?? []).map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-[#f7faf8]">
                    <td className="px-3 py-2"><Link href={`/dashboard/invoices/${inv.id}`} className="text-[#23745a] hover:underline font-medium">{inv.number}</Link></td>
                    <td className="px-3 py-2">{inv.customer_name}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${inv.status === "OVERDUE" ? "bg-[#fff1e2] text-[#a16b29]" : "bg-[#eff4f1] text-[#5f796b]"}`}>{inv.status}</span></td>
                    <td className="px-3 py-2">{new Date(inv.due_date).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(inv.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data?.invoices ?? []).length === 0 && <div className="mt-4"><EmptyState title="No outstanding invoices" description="All invoices are paid or no sent/overdue invoices found." /></div>}
        </section>
      )}

      {tab === "aging" && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <a href={exportUrl()} className="text-xs font-bold text-[#23745a] hover:underline">Export CSV</a>
          </div>
          <div className="grid grid-cols-5 gap-3 mb-4">
            {[
              { key: "current", label: "Current" },
              { key: "1_30", label: "1–30" },
              { key: "31_60", label: "31–60" },
              { key: "61_90", label: "61–90" },
              { key: "90_plus", label: "90+" },
            ].map((b) => {
              const val = data?.buckets?.[b.key] ?? { count: 0, total_cents: 0 };
              return (
                <div key={b.key} className="bg-white border border-[#e7ece9] rounded-xl p-4 shadow-sm text-center">
                  <div className="text-xs text-[#78817e] mb-1">{b.label}</div>
                  <div className="text-[22px] font-extrabold text-[#18221f]">{val.count}</div>
                  <div className="text-xs text-[#78817e]">{formatMoney(val.total_cents)}</div>
                </div>
              );
            })}
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm overflow-x-auto">
            <h3 className="font-semibold text-[#18221f] mb-3">Overdue invoices</h3>
            <table className="w-full text-sm">
              <thead className="bg-[#f7faf8] text-xs text-[#78817e] uppercase tracking-wider"><tr><th className="text-left px-3 py-2">Number</th><th className="text-left px-3 py-2">Customer</th><th className="text-left px-3 py-2">Due</th><th className="text-left px-3 py-2">Days overdue</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
              <tbody className="divide-y divide-[#f0f3f1]">
                {(data?.overdue_invoices ?? []).map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-[#f7faf8]">
                    <td className="px-3 py-2"><Link href={`/dashboard/invoices/${inv.id}`} className="text-[#23745a] hover:underline font-medium">{inv.number}</Link></td>
                    <td className="px-3 py-2">{inv.customer_name}</td>
                    <td className="px-3 py-2">{inv.due_date}</td>
                    <td className="px-3 py-2">{inv.days_overdue}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(inv.total_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data?.overdue_invoices ?? []).length === 0 && <div className="mt-4"><EmptyState title="No overdue invoices" description="All invoices are current." /></div>}
        </section>
      )}

      {tab === "customers" && (
        <section>
          <div className="flex justify-between items-center mb-4">
            <div className="flex gap-2">
              {ranges.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)} className={`px-3 py-1.5 rounded-md text-xs font-medium ${range === r.key ? "bg-[#23745a] text-white" : "bg-white border border-[#e7ece9] text-[#627068]"}`}>{r.label}</button>
              ))}
            </div>
            <a href={exportUrl()} className="text-xs font-bold text-[#23745a] hover:underline">Export CSV</a>
          </div>
          <div className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f7faf8] text-xs text-[#78817e] uppercase tracking-wider">
                <tr><th className="text-left px-3 py-2 font-medium">Customer</th><th className="text-right px-3 py-2 font-medium">Billed</th><th className="text-right px-3 py-2 font-medium">Paid</th><th className="text-right px-3 py-2 font-medium">Outstanding</th><th className="text-right px-3 py-2 font-medium">Invoices</th></tr>
              </thead>
              <tbody className="divide-y divide-[#f0f3f1]">
                {(data ?? []).map((c: any) => (
                  <tr key={c.customer_id} className="hover:bg-[#f7faf8]">
                    <td className="px-3 py-2"><Link href={`/dashboard/customers/${c.customer_id}`} className="text-[#23745a] hover:underline font-medium">{c.name}</Link></td>
                    <td className="px-3 py-2 text-right font-medium">{formatMoney(c.total_billed_cents)}</td>
                    <td className="px-3 py-2 text-right text-[#33805b]">{formatMoney(c.total_paid_cents)}</td>
                    <td className="px-3 py-2 text-right text-[#a16b29]">{formatMoney(c.outstanding_cents)}</td>
                    <td className="px-3 py-2 text-right">{c.invoice_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(data ?? []).length === 0 && <div className="mt-4"><EmptyState title="No customers yet" description="Customers with invoices will appear here." /></div>}
        </section>
      )}
    </div>
  );
}

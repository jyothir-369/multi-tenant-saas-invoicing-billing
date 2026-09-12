"use client";
import { formatMoney } from "../../../lib/api";

export default function CustomerBalanceCard({
  balance,
  invoiceCount,
  lastActivity,
}: {
  balance: number;
  invoiceCount: number;
  lastActivity?: string | null;
}) {
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">Balance</h3>
      <div className="text-3xl font-extrabold text-teal-700 mb-2">{formatMoney(balance)}</div>
      <div className="flex gap-4 text-sm text-gray-600">
        <span><b>{invoiceCount}</b> invoices</span>
        <span>Last activity: {lastActivity ? new Date(lastActivity).toLocaleDateString() : "—"}</span>
      </div>
    </div>
  );
}

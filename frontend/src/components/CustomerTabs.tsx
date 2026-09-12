"use client";
import { useState } from "react";
import CustomerBalanceCard from "../../../../components/CustomerBalanceCard";
import NotesPanel from "../../../../components/NotesPanel";
import ActivityTimeline from "../../../../components/ActivityTimeline";
import { formatMoney } from "../../../../lib/api";

export default function CustomerTabs({
  customer,
  notes,
  activities,
  invoices,
  payments,
  activeTab,
}: {
  customer: any;
  notes: any[];
  activities: any[];
  invoices: any[];
  payments: any[];
  activeTab: string;
}) {
  return (
    <div>
      <div className="flex gap-6 mb-6 border-b border-gray-200">
        {["invoices", "payments", "notes", "activity"].map((t) => (
          <a
            key={t}
            href={`?tab=${t}`}
            className={`pb-2 text-sm font-semibold capitalize border-b-2 ${
              activeTab === t ? "text-teal-700 border-teal-700" : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {t}
          </a>
        ))}
      </div>
      {activeTab === "invoices" && (
        <div>
          {invoices.length === 0 ? (
            <div className="text-sm text-gray-500">
              No invoices yet. <a href={`/dashboard/invoices/new?customer=${customer.id}`} className="text-teal-700 underline">Create one →</a>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400">
                <tr className="border-b">
                  <th className="text-left py-2">Number</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-left py-2">Amount</th>
                  <th className="text-left py-2">Due</th>
                  <th className="text-left py-2"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => (
                  <tr key={inv.id} className="border-b">
                    <td className="py-2">{inv.invoiceNumber || inv.id.slice(0, 6)}</td>
                    <td className="py-2"><span className={`badge ${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                    <td className="py-2">{formatMoney(inv.totalCents || 0)}</td>
                    <td className="py-2">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="py-2"><a href={`/dashboard/invoices/${inv.id}`} className="text-teal-700 text-xs">View</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {activeTab === "payments" && (
        <div>
          {payments.length === 0 ? (
            <div className="text-sm text-gray-500">
              No payments yet — Stripe integration coming soon.
              <div className="mt-3">
                <button disabled className="primaryButton opacity-50 cursor-not-allowed" title="Coming soon">+ Record payment</button>
              </div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-400"><tr className="border-b"><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>{payments.map((p: any) => (
                <tr key={p.id} className="border-b"><td>{formatMoney(p.amount || 0)}</td><td>{p.status}</td><td>{new Date(p.createdAt).toLocaleDateString()}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
      {activeTab === "notes" && (
        <NotesPanel customerId={customer.id} notes={notes} onRefresh={() => {}} />
      )}
      {activeTab === "activity" && (
        <ActivityTimeline items={activities} />
      )}
    </div>
  );
}

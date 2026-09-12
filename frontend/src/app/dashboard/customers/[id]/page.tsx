"use client";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import CustomerTabs from "../../../../components/CustomerTabs";
import CustomerBalanceCard from "../../../../components/CustomerBalanceCard";
import { api } from "../../../../lib/api";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "invoices";
  const [customer, setCustomer] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const [c, n, a, inv, p] = await Promise.all([
        api(`/customers/${params.id}`),
        api(`/customers/${params.id}/notes`),
        api(`/customers/${params.id}/activity`),
        api(`/customers/${params.id}/invoices`),
        api(`/customers/${params.id}/payments`),
      ]);
      setCustomer(c);
      setNotes(n);
      setActivities(a);
      setInvoices(inv.data || inv);
      setPayments(p.data || p);
    }
    load();
  }, [params.id]);

  if (!customer) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">{customer.name}</h1>
          <p className="text-gray-500 text-sm">{customer.email}</p>
        </div>
        <div className="flex gap-2">
          <a href={`/dashboard/customers`} className="text-xs px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">Back</a>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <CustomerTabs
            customer={customer}
            notes={notes}
            activities={activities}
            invoices={invoices}
            payments={payments}
            activeTab={tab}
          />
        </div>
        <div>
          <CustomerBalanceCard
            balance={customer.balance || 0}
            invoiceCount={customer.invoiceCount || 0}
            lastActivity={customer.lastInvoiceDate}
          />
        </div>
      </div>
    </div>
  );
}

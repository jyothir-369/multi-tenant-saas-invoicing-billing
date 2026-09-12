"use client";
import { useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../lib/api";

type Customer = { id: string; name: string; isArchived: boolean };

export default function NewInvoicePage() {
  const searchParams = useSearchParams();
  const customerParam = searchParams.get("customer");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>(customerParam || "");

  useEffect(() => {
    async function load() {
      try {
        const c = await api<{ data: Customer[] }>("/customers");
        setCustomers(c.data || []);
      } catch {}
    }
    load();
  }, []);

  useEffect(() => {
    if (customerParam) setSelectedCustomer(customerParam);
  }, [customerParam]);

  return (
    <div>
      <h1>New Invoice</h1>
      <label htmlFor="customer">Customer</label>
      <select
        id="customer"
        value={selectedCustomer}
        onChange={(e) => setSelectedCustomer(e.target.value)}
      >
        <option value="">Select customer</option>
        {customers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

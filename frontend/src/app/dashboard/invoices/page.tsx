"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../page.module.css";
import { api, formatMoney } from "../../../lib/api";
type Invoice = {
  id: string;
  number?: string;
  customerId: string;
  customerName?: string;
  totalCents: number;
  amount?: number;
  balance?: number;
  status: string;
  createdAt: string;
  dueDate: string;
};
type Customer = { id: string; name: string; isArchived: boolean };
const statuses = ["ALL", "DRAFT", "SENT", "PAID", "OVERDUE", "VOID"];
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
  OVERDUE: "Overdue",
  VOID: "Void",
};
function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "PAID") return `${styles.badge} ${styles.paid}`;
  if (s === "OVERDUE") return `${styles.badge} ${styles.overdue}`;
  if (s === "VOID") return `${styles.badge} ${styles.pending}`;
  if (s === "SENT") return `${styles.badge} ${styles.pending}`;
  return styles.badge;
}
function invoiceLabel(i: Invoice) {
  return i.number || `INV-${i.id.slice(0, 6).toUpperCase()}`;
}
export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]),
    [customers, setCustomers] = useState<Customer[]>([]),
    [status, setStatus] = useState("ALL"),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [showForm, setShowForm] = useState(false),
    [editing, setEditing] = useState<Invoice | null>(null),
    [saving, setSaving] = useState(false),
    [customerId, setCustomerId] = useState(""),
    [amount, setAmount] = useState(""),
    [dueDate, setDueDate] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [i, c] = await Promise.all([
        api<{ data: Invoice[]; total: number }>(
          `/invoices${status === "ALL" ? "" : `?status=${status}`}`,
        ),
        api<{ data: Customer[]; total: number }>("/customers"),
      ]);
      setInvoices(i.data ?? []);
      const customerList = (c as unknown as { data?: Customer[] }).data;
      setCustomers(Array.isArray(customerList) ? customerList : (c as unknown as Customer[]));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => {
    void load();
  }, [load]);
  function openEdit(i: Invoice) {
    setEditing(i);
    setCustomerId(i.customerId);
    setAmount(String(i.totalCents ?? i.amount ?? 0));
    setDueDate(i.dueDate.slice(0, 10));
    setShowForm(true);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = JSON.stringify({
        ...(editing ? {} : { customerId }),
        amount: Number(amount),
        dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
      });
      await api(editing ? `/invoices/${editing.id}` : "/invoices", {
        method: editing ? "PATCH" : "POST",
        body,
      });
      setShowForm(false);
      setMessage(editing ? "Invoice updated." : "Invoice created.");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save invoice.");
    } finally {
      setSaving(false);
    }
  }
  const shown = invoices.filter((i) =>
    `${invoiceLabel(i)} ${i.customerName || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Invoices<span className={styles.dot}>.</span>
          </h1>
          <p>Create, send, and track invoices for your workspace.</p>
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => router.push("/dashboard/invoices/new")}
        >
          New invoice
        </button>
      </div>
      {message && (
        <div className={styles.alert}>
          <span>✓</span>
          <p>{message}</p>
        </div>
      )}
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <p>{error}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        </div>
      )}
      {showForm && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>{editing ? "Edit invoice" : "Create invoice"}</h2>
              <p>
                {editing
                  ? "Only draft invoice fields can be edited."
                  : "New invoices are created as drafts. Add line items from the invoice page."}
              </p>
            </div>
          </div>
          <form onSubmit={save} className={styles.customerForm}>
            {!editing && (
              <select
                aria-label="Customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
              >
                <option value="">Select customer</option>
                {customers
                  .filter((c) => !c.isArchived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            )}
            <input
              aria-label="Amount in cents"
              type="number"
              min="1"
              step="1"
              placeholder="Amount in cents"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <input
              aria-label="Due date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
            <button className={styles.primaryButton} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create invoice"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </form>
        </section>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Invoice list</h2>
            <p>
              {shown.length} invoice{shown.length === 1 ? "" : "s"}
            </p>
          </div>
          <input
            aria-label="Search invoices"
            placeholder="Search invoices"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="Filter invoice status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading invoices…</div>
        ) : shown.length ? (
          <div className={styles.table}>
            {shown.map((i) => (
              <div
                className={styles.tableRow}
                key={i.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/dashboard/invoices/${i.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(`/dashboard/invoices/${i.id}`);
                }}
              >
                <span>
                  <b>{invoiceLabel(i)}</b>
                  <small>{i.customerName || "Customer"}</small>
                </span>
                <span className={statusTone(i.status)}>
                  {STATUS_LABEL[i.status.toUpperCase()] || i.status}
                </span>
                <b>{formatMoney(i.balance ?? i.totalCents ?? 0)}</b>
                <small>{new Date(i.dueDate).toLocaleDateString()}</small>
                <button
                  aria-label={`Open ${invoiceLabel(i)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/dashboard/invoices/${i.id}`);
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <b>No invoices found</b>
            <p>Create an invoice or adjust your filters.</p>
          </div>
        )}
      </section>
    </div>
  );
}
"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../../../page.module.css";
import local from "./new.module.css";
import { api, formatMoney } from "../../../../lib/api";

type Customer = { id: string; name: string; isArchived: boolean };
type LineRow = {
  key: number;
  description: string;
  quantity: string;
  unitPriceCents: string;
  taxRateBps: string;
};

const RECURRENCE_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "1 week", label: "Every week" },
  { value: "2 weeks", label: "Every 2 weeks" },
  { value: "1 month", label: "Every month" },
  { value: "3 months", label: "Every 3 months" },
  { value: "12 months", label: "Every year" },
];

function rowTotals(r: LineRow) {
  const qty = Number(r.quantity) || 0;
  const price = Number(r.unitPriceCents) || 0;
  const bps = Number(r.taxRateBps) || 0;
  const subtotal = qty * price;
  const tax = Math.round((subtotal * bps) / 10000);
  return { subtotal, tax };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(
    searchParams.get("customer") || "",
  );
  const [dueDate, setDueDate] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState("");
  const [rows, setRows] = useState<LineRow[]>([
    {
      key: 1,
      description: "",
      quantity: "1",
      unitPriceCents: "",
      taxRateBps: "0",
    },
  ]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nextKey = useRef(2);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    setError("");
    try {
      const res = await api<{ data: Customer[] } | Customer[]>("/customers");
      setCustomers(
        (Array.isArray(res) ? res : res.data).filter((c) => !c.isArchived),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load customers.");
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  function addRow() {
    setRows((r) => [
      ...r,
      {
        key: nextKey.current++,
        description: "",
        quantity: "1",
        unitPriceCents: "",
        taxRateBps: "0",
      },
    ]);
  }
  function updateRow(key: number, patch: Partial<LineRow>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((row) => row.key !== key));
  }

  const filledRows = rows.filter(
    (r) =>
      r.description.trim() &&
      Number(r.quantity) > 0 &&
      Number(r.unitPriceCents) > 0,
  );
  const subtotal = filledRows.reduce((sum, r) => sum + rowTotals(r).subtotal, 0);
  const tax = filledRows.reduce((sum, r) => sum + rowTotals(r).tax, 0);
  const total = subtotal + tax;
  const selectedCustomer =
    customers.find((c) => c.id === customerId)?.name || "Select a customer";
  const recurrenceLabel =
    RECURRENCE_OPTIONS.find((o) => o.value === recurrenceRule)?.label ||
    "Does not repeat";

  async function createInvoice(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!customerId) {
      setError("Select a customer for this invoice.");
      return;
    }
    if (!dueDate) {
      setError("Set a due date for this invoice.");
      return;
    }
    if (filledRows.length === 0) {
      setError("Add at least one line item with a description, quantity and price.");
      return;
    }
    setSaving(true);
    try {
      const created = await api<{ id: string }>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          amount: total,
          dueDate: new Date(`${dueDate}T00:00:00.000Z`).toISOString(),
          recurrenceRule: recurrenceRule || undefined,
        }),
      });
      try {
        for (const r of filledRows) {
          await api(`/invoices/${created.id}/line-items`, {
            method: "POST",
            body: JSON.stringify({
              description: r.description.trim(),
              quantity: Number(r.quantity),
              unitPriceCents: Number(r.unitPriceCents),
              taxRateBps: Number(r.taxRateBps) || 0,
            }),
          });
        }
      } catch {
        // The draft invoice was created; go to it so the user can finish
        // adding line items there rather than losing their work.
        router.push(`/dashboard/invoices/${created.id}`);
        return;
      }
      router.push(`/dashboard/invoices/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create invoice.");
      setSaving(false);
    }
  }

  return (
    <div className={styles.main}>
      <div className={local.backRow}>
        <button
          className={local.backLink}
          onClick={() => router.push("/dashboard/invoices")}
        >
          ← All invoices
        </button>
      </div>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            New invoice<span className={styles.dot}>.</span>
          </h1>
          <p>
            Describe what the customer pays for, add tax, and choose when it
            repeats.
          </p>
        </div>
      </div>
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <p>{error}</p>
            {!saving && <button onClick={() => void loadCustomers()}>Try again</button>}
          </div>
        </div>
      )}
      <form onSubmit={createInvoice}>
        <div className={styles.grid}>
          <div>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Invoice details</h2>
                  <p>Created as a draft; send it next from the invoice page.</p>
                </div>
              </div>
              <div className={styles.customerForm}>
                <label htmlFor="invoice-customer">Customer</label>
                {customersLoading ? (
                  <div className={styles.empty}>Loading customers…</div>
                ) : (
                  <select
                    id="invoice-customer"
                    aria-label="Customer"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    required
                  >
                    <option value="">Select customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <label htmlFor="invoice-due">Due date</label>
                <input
                  id="invoice-due"
                  aria-label="Due date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                />
                <label htmlFor="invoice-recurrence">Repeats</label>
                <select
                  id="invoice-recurrence"
                  aria-label="Repeats"
                  value={recurrenceRule}
                  onChange={(e) => setRecurrenceRule(e.target.value)}
                >
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Line items</h2>
                  <p>Quantities, unit prices and tax recalculate the total.</p>
                </div>
              </div>
              {rows.length === 0 ? (
                <div className={styles.empty}>
                  <b>No line items</b>
                  <p>Add the first line to describe the charge.</p>
                </div>
              ) : (
                <div>
                  {rows.map((r) => (
                    <div className={local.lineRow} key={r.key}>
                      <input
                        aria-label="Item description"
                        placeholder="Item description"
                        value={r.description}
                        onChange={(e) =>
                          updateRow(r.key, { description: e.target.value })
                        }
                      />
                      <input
                        aria-label="Quantity"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Qty"
                        value={r.quantity}
                        onChange={(e) =>
                          updateRow(r.key, { quantity: e.target.value })
                        }
                      />
                      <input
                        aria-label="Unit price"
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Price (cents)"
                        value={r.unitPriceCents}
                        onChange={(e) =>
                          updateRow(r.key, { unitPriceCents: e.target.value })
                        }
                      />
                      <input
                        aria-label="Tax rate"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Tax (bps)"
                        value={r.taxRateBps}
                        onChange={(e) =>
                          updateRow(r.key, { taxRateBps: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        className={local.removeRow}
                        aria-label="Remove line item"
                        title="Remove line item"
                        onClick={() => removeRow(r.key)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                className={styles.textButton}
                onClick={addRow}
                style={{ marginTop: 14 }}
              >
                + Add line item
              </button>
            </section>
          </div>

          <div>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Summary</h2>
                </div>
              </div>
              <div className={local.summaryLine}>
                <small>Customer</small>
                <b>{selectedCustomer}</b>
              </div>
              <div className={local.summaryLine}>
                <small>Due</small>
                <b>
                  {dueDate
                    ? new Date(`${dueDate}T00:00:00.000Z`).toLocaleDateString()
                    : "Not set"}
                </b>
              </div>
              <div className={local.summaryLine}>
                <small>Repeats</small>
                <b>{recurrenceLabel}</b>
              </div>
              <div className={local.totals}>
                <div className={local.summaryLine}>
                  <small>Subtotal</small>
                  <b>{formatMoney(subtotal)}</b>
                </div>
                <div className={local.summaryLine}>
                  <small>Tax</small>
                  <b>{formatMoney(tax)}</b>
                </div>
                <div className={`${local.summaryLine} ${local.grand}`}>
                  <small>Total</small>
                  <b>{formatMoney(total)}</b>
                </div>
              </div>
              <button
                type="submit"
                className={styles.primaryButton}
                disabled={saving}
                style={{ width: "100%", marginTop: 14 }}
              >
                {saving ? "Creating…" : "Create invoice"}
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => router.push("/dashboard/invoices")}
                style={{ marginTop: 10 }}
              >
                Cancel
              </button>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}
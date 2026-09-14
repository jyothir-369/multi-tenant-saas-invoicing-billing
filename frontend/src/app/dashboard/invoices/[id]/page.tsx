"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../../page.module.css";
import local from "./invoice.module.css";
import { api, formatMoney, downloadInvoicePdf } from "../../../../lib/api";

type LineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
  subtotalCents: number;
};
type Payment = {
  id: string;
  providerPaymentId: string;
  amount: number;
  status: string;
  createdAt: string;
};
type InvoiceDetail = {
  id: string;
  number?: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customer?: { name: string; email?: string };
  status: string;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  amount?: number;
  balance?: number;
  issuedAt?: string;
  createdAt: string;
  dueDate: string;
  sentAt?: string;
  paidAt?: string;
  recurrenceRule?: string;
  invoiceNumber?: string;
  requiresSignature?: boolean;
  signatureName?: string | null;
  signatureEmail?: string | null;
  signedAt?: string | null;
  paymentLink?: string;
  lineItems: LineItem[];
  payments: Payment[];
};

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
const fmtPercent = (bps: number) => `${(bps / 100).toFixed(1)}%`;

export default function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const [invoiceEdit, setInvoiceEdit] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editRequiresSignature, setEditRequiresSignature] = useState(false);

  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState({
    description: "",
    quantity: "",
    unitPriceCents: "",
    taxRateBps: "0",
  });
  const [newLine, setNewLine] = useState({
    description: "",
    quantity: "1",
    unitPriceCents: "",
    taxRateBps: "0",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setInvoice(
        await api<InvoiceDetail>(`/invoices/${params.id}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load invoice.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function lifecycle(
    action: "mark-sent" | "mark-paid" | "mark-overdue" | "void",
  ) {
    setBusy(action);
    setError("");
    try {
      const updated = await api<InvoiceDetail>(
        `/invoices/${params.id}/${action}`,
        { method: "POST" },
      );
      setInvoice(updated);
      setMessage("Invoice updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update invoice.");
    } finally {
      setBusy("");
    }
  }

  async function removeInvoice() {
    if (!window.confirm("Delete this invoice?")) return;
    setBusy("delete");
    setError("");
    try {
      await api(`/invoices/${params.id}`, { method: "DELETE" });
      router.replace("/dashboard/invoices");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete invoice.");
      setBusy("");
    }
  }

  async function saveInvoice(e: FormEvent) {
    e.preventDefault();
    setBusy("edit");
    setError("");
    try {
      const updated = await api<InvoiceDetail>(`/invoices/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          amount: Number(editAmount),
          dueDate: new Date(`${editDueDate}T00:00:00.000Z`).toISOString(),
          requiresSignature: editRequiresSignature,
        }),
      });
      setInvoice(updated);
      setInvoiceEdit(false);
      setMessage("Invoice updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update invoice.");
    } finally {
      setBusy("");
    }
  }

  async function addLineItem(e: FormEvent) {
    e.preventDefault();
    setBusy("add-line");
    setError("");
    try {
      const updated = await api<InvoiceDetail>(
        `/invoices/${params.id}/line-items`,
        {
          method: "POST",
          body: JSON.stringify({
            description: newLine.description,
            quantity: Number(newLine.quantity),
            unitPriceCents: Number(newLine.unitPriceCents),
            taxRateBps: Number(newLine.taxRateBps) || 0,
          }),
        },
      );
      setInvoice(updated);
      setNewLine({
        description: "",
        quantity: "1",
        unitPriceCents: "",
        taxRateBps: "0",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add line item.");
    } finally {
      setBusy("");
    }
  }

  function startEditLine(item: LineItem) {
    setEditingLineId(item.id);
    setEditingLine({
      description: item.description,
      quantity: String(item.quantity),
      unitPriceCents: String(item.unitPriceCents),
      taxRateBps: String(item.taxRateBps),
    });
  }

  async function updateLineItem(e: FormEvent) {
    e.preventDefault();
    if (!editingLineId) return;
    setBusy(`line-${editingLineId}`);
    setError("");
    try {
      const updated = await api<InvoiceDetail>(
        `/invoices/${params.id}/line-items/${editingLineId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description: editingLine.description,
            quantity: Number(editingLine.quantity),
            unitPriceCents: Number(editingLine.unitPriceCents),
            taxRateBps: Number(editingLine.taxRateBps) || 0,
          }),
        },
      );
      setInvoice(updated);
      setEditingLineId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update line item.");
    } finally {
      setBusy("");
    }
  }

  async function deleteLineItem(item: LineItem) {
    setBusy(`line-${item.id}`);
    setError("");
    try {
      const updated = await api<InvoiceDetail>(
        `/invoices/${params.id}/line-items/${item.id}`,
        { method: "DELETE" },
      );
      setInvoice(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete line item.");
    } finally {
      setBusy("");
    }
  }

  async function downloadPdf() {
    setError("");
    try {
      await downloadInvoicePdf(params.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to download PDF.");
    }
  }

  async function copyPaymentLink() {
    if (!invoice?.paymentLink) return;
    try {
      await navigator.clipboard.writeText(invoice.paymentLink);
      setMessage("Payment link copied to clipboard.");
    } catch (e) {
      setError("Unable to copy the payment link.");
    }
  }

  async function generatePaymentLink() {
    setBusy("payment-link");
    setError("");
    try {
      const res = await api<{ url: string }>("/payments/links", {
        method: "POST",
        body: JSON.stringify({ invoice_id: params.id }),
      });
      setInvoice((prev) => (prev ? { ...prev, paymentLink: res.url } : prev));
      setMessage("Payment link created.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create payment link.");
    } finally {
      setBusy("");
    }
  }

  const paidCents =
    invoice?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const balanceCents =
    invoice?.balance ?? (invoice ? invoice.totalCents - paidCents : 0);

  return (
    <div className={styles.main}>
      <div className={local.backRow}>
        <button className={local.backLink} onClick={() => router.push("/dashboard/invoices")}>
          ← All invoices
        </button>
      </div>
      {loading && (
        <div className={styles.panel}>
          <div className={styles.empty}>Loading invoice…</div>
        </div>
      )}
      {!loading && error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <p>{error}</p>
            <button onClick={() => (invoice ? void load() : router.push("/dashboard/invoices"))}>
              {invoice ? "Retry" : "Back to invoices"}
            </button>
          </div>
        </div>
      )}
      {!loading && !error && invoice && (
        <>
          <div className={styles.heading}>
            <div>
              <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
              <h1>
                {invoice.invoiceNumber ||
                  invoice.number ||
                  `INV-${invoice.id.slice(0, 6).toUpperCase()}`}
                <span className={styles.dot}>.</span>
              </h1>
              <p>
                {invoice.customerName ||
                  invoice.customer?.name ||
                  "Customer"}{" "}
                · <span className={statusTone(invoice.status)}>{STATUS_LABEL[invoice.status.toUpperCase()] || invoice.status}</span>
              </p>
            </div>
            <div className={styles.topActions}>
              <button
                className={styles.primaryButton}
                onClick={() => void downloadPdf()}
              >
                Download PDF
              </button>
              {invoice.status === "DRAFT" && (
                <>
                  <button
                    className={styles.primaryButton}
                    onClick={() => void lifecycle("mark-sent")}
                    disabled={busy === "mark-sent"}
                  >
                    {busy === "mark-sent" ? "Sending…" : "Mark sent"}
                  </button>
                  <button
                    onClick={() => {
                      setInvoiceEdit(true);
                      setEditAmount(String(invoice.totalCents));
                      setEditDueDate(invoice.dueDate.slice(0, 10));
                      setEditRequiresSignature(invoice.requiresSignature ?? false);
                    }}
                  >
                    Edit
                  </button>
                  <button className={styles.dangerButton} onClick={() => void removeInvoice()}>
                    Delete
                  </button>
                </>
              )}
              {(invoice.status === "SENT" || invoice.status === "OVERDUE") && (
                <>
                  <button
                    className={styles.primaryButton}
                    onClick={() => void lifecycle("mark-paid")}
                    disabled={busy === "mark-paid"}
                  >
                    {busy === "mark-paid" ? "Marking…" : "Mark paid"}
                  </button>
                  {invoice.status === "SENT" && (
                    <button
                      onClick={() => void lifecycle("mark-overdue")}
                      disabled={busy === "mark-overdue"}
                    >
                      Mark overdue
                    </button>
                  )}
                  <button onClick={() => void lifecycle("void")}>Void invoice</button>
                </>
              )}
            </div>
          </div>
          {message && (
            <div className={styles.alert}>
              <span>✓</span>
              <p>{message}</p>
            </div>
          )}

          {invoiceEdit && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Edit invoice</h2>
                  <p>Amount and due date can only be changed while the invoice is a draft.</p>
                </div>
              </div>
              <form onSubmit={saveInvoice} className={styles.customerForm}>
                <input
                  aria-label="Amount in cents"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Amount in cents"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  required
                />
                <input
                  aria-label="Due date"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  required
                />
                <label
                  className={styles.inlineCheck}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={editRequiresSignature}
                    onChange={(e) => setEditRequiresSignature(e.target.checked)}
                  />
                  Require customer signature (SIGNATURE required)
                </label>
                <button className={styles.primaryButton} disabled={busy === "edit"}>
                  {busy === "edit" ? "Saving…" : "Save changes"}
                </button>
                <button type="button" onClick={() => setInvoiceEdit(false)}>
                  Cancel
                </button>
              </form>
            </section>
          )}

          <div className={styles.grid}>
            <div>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Line items</h2>
                    <p>
                      {invoice.lineItems.length} item
                      {invoice.lineItems.length === 1 ? "" : "s"} · totals
                      recalculate automatically
                    </p>
                  </div>
                </div>
                {invoice.lineItems.length === 0 ? (
                  <div className={styles.empty}>
                    <b>No line items yet</b>
                    <p>Add the first item below to describe what this invoice charges for.</p>
                  </div>
                ) : (
                  <div>
                    {invoice.lineItems.map((item) => (
                      <div key={item.id}>
                        {editingLineId === item.id ? (
                          <form
                            className={local.lineEditRow}
                            onSubmit={updateLineItem}
                          >
                            <input
                              aria-label="Description"
                              value={editingLine.description}
                              onChange={(e) =>
                                setEditingLine((f) => ({ ...f, description: e.target.value }))
                              }
                              required
                            />
                            <input
                              aria-label="Quantity"
                              type="number"
                              min="1"
                              step="1"
                              value={editingLine.quantity}
                              onChange={(e) =>
                                setEditingLine((f) => ({ ...f, quantity: e.target.value }))
                              }
                              required
                            />
                            <input
                              aria-label="Unit price"
                              type="number"
                              min="1"
                              step="1"
                              value={editingLine.unitPriceCents}
                              onChange={(e) =>
                                setEditingLine((f) => ({ ...f, unitPriceCents: e.target.value }))
                              }
                              required
                            />
                            <input
                              aria-label="Tax rate"
                              type="number"
                              min="0"
                              step="1"
                              value={editingLine.taxRateBps}
                              onChange={(e) =>
                                setEditingLine((f) => ({ ...f, taxRateBps: e.target.value }))
                              }
                            />
                            <button
                              className={styles.primaryButton}
                              disabled={busy === `line-${item.id}`}
                            >
                              Save
                            </button>
                          </form>
                        ) : (
                          <div className={local.lineItemRow}>
                            <span>
                              <b>{item.description}</b>
                            </span>
                            <small>×{item.quantity}</small>
                            <small>{formatMoney(item.unitPriceCents)}</small>
                            <small>{fmtPercent(item.taxRateBps)}</small>
                            <b>{formatMoney(item.subtotalCents)}</b>
                            <span className={local.rowActions}>
                              <button
                                className={local.rowButton}
                                onClick={() => startEditLine(item)}
                              >
                                Edit
                              </button>
                              <button
                                className={`${local.rowButton} ${local.danger}`}
                                onClick={() => void deleteLineItem(item)}
                                disabled={busy === `line-${item.id}`}
                              >
                                Remove
                              </button>
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <form className={local.lineForm} onSubmit={addLineItem}>
                  <input
                    aria-label="Description"
                    placeholder="Item description"
                    value={newLine.description}
                    onChange={(e) => setNewLine((f) => ({ ...f, description: e.target.value }))}
                    required
                  />
                  <input
                    aria-label="Quantity"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Qty"
                    value={newLine.quantity}
                    onChange={(e) => setNewLine((f) => ({ ...f, quantity: e.target.value }))}
                    required
                  />
                  <input
                    aria-label="Unit price"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Price (cents)"
                    value={newLine.unitPriceCents}
                    onChange={(e) => setNewLine((f) => ({ ...f, unitPriceCents: e.target.value }))}
                    required
                  />
                  <input
                    aria-label="Tax rate"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Tax (bps)"
                    value={newLine.taxRateBps}
                    onChange={(e) => setNewLine((f) => ({ ...f, taxRateBps: e.target.value }))}
                  />
                  <button className={styles.primaryButton} disabled={busy === "add-line"}>
                    {busy === "add-line" ? "Adding…" : "Add item"}
                  </button>
                </form>
                <div className={local.totals}>
                  <div className={local.summaryLine}>
                    <small>Subtotal</small>
                    <b>{formatMoney(invoice.subtotalCents)}</b>
                  </div>
                  {invoice.taxCents > 0 && (
                    <div className={local.summaryLine}>
                      <small>Tax</small>
                      <b>{formatMoney(invoice.taxCents)}</b>
                    </div>
                  )}
                  {invoice.discountCents > 0 && (
                    <div className={local.summaryLine}>
                      <small>Discount</small>
                      <b>−{formatMoney(invoice.discountCents)}</b>
                    </div>
                  )}
                  <div className={local.summaryLine}>
                    <small className={local.grand}>Total</small>
                    <b>{formatMoney(invoice.totalCents)}</b>
                  </div>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Payments</h2>
                    <p>
                      {invoice.payments.length} payment
                      {invoice.payments.length === 1 ? "" : "s"} on this invoice
                    </p>
                  </div>
                </div>
                {invoice.payments.length === 0 ? (
                  <div className={styles.empty}>
                    <b>No payments received</b>
                    <p>Balance shown in the summary reflects what is still owed.</p>
                  </div>
                ) : (
                  <div className={styles.table}>
                    {invoice.payments.map((p) => (
                      <div className={styles.tableRow} key={p.id}>
                        <span>
                          <b>{p.providerPaymentId}</b>
                          <small>{p.status}</small>
                        </span>
                        <b>{formatMoney(p.amount)}</b>
                        <small>{new Date(p.createdAt).toLocaleDateString()}</small>
                        <small>{new Date(p.createdAt).toLocaleTimeString()}</small>
                      </div>
                    ))}
                  </div>
                )}
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
                  <small>Billed to</small>
                  <b>
                    {invoice.customerName || invoice.customer?.name || "Customer"}
                    {invoice.customerEmail || invoice.customer?.email ? (
                      <small> {invoice.customerEmail || invoice.customer?.email}</small>
                    ) : null}
                  </b>
                </div>
                <div className={local.summaryLine}>
                  <small>Status</small>
                  <b>{STATUS_LABEL[invoice.status.toUpperCase()] || invoice.status}</b>
                </div>
                <div className={local.summaryLine}>
                  <small>Issued</small>
                  <b>{new Date(invoice.issuedAt || invoice.createdAt).toLocaleDateString()}</b>
                </div>
                <div className={local.summaryLine}>
                  <small>Due</small>
                  <b>{new Date(invoice.dueDate).toLocaleDateString()}</b>
                </div>
                {invoice.sentAt && (
                  <div className={local.summaryLine}>
                    <small>Sent</small>
                    <b>{new Date(invoice.sentAt).toLocaleDateString()}</b>
                  </div>
                )}
                {invoice.paidAt && (
                  <div className={local.summaryLine}>
                    <small>Paid</small>
                    <b>{new Date(invoice.paidAt).toLocaleDateString()}</b>
                  </div>
                )}
                {invoice.recurrenceRule && (
                  <div className={local.summaryLine}>
                    <small>Recurs</small>
                    <b>{invoice.recurrenceRule}</b>
                  </div>
                )}
                <div className={local.summaryLine}>
                  <small>Signature</small>
                  <b>
                    {invoice.requiresSignature
                      ? invoice.signedAt
                        ? `Signed by ${invoice.signatureName || "customer"} on ${new Date(invoice.signedAt).toLocaleDateString()}`
                        : "Required — pending"
                      : "Not required"}
                  </b>
                </div>
                <div className={local.totals}>
                  <div className={local.summaryLine}>
                    <small>Total</small>
                    <b>{formatMoney(invoice.totalCents)}</b>
                  </div>
                  <div className={local.summaryLine}>
                    <small>Paid</small>
                    <b>{formatMoney(paidCents)}</b>
                  </div>
                  <div className={`${local.summaryLine} ${local.grand}`}>
                    <small>Balance due</small>
                    <b>{formatMoney(balanceCents)}</b>
                  </div>
                </div>
              </section>

              {(invoice.status === "SENT" || invoice.status === "OVERDUE") && (
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2>Payment link</h2>
                      <p>Share this link with the customer to collect payment.</p>
                    </div>
                  </div>
                  {invoice.paymentLink ? (
                    <>
                      <div className={local.linkBox}>
                        <span>{invoice.paymentLink}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          className={styles.primaryButton}
                          onClick={() => void copyPaymentLink()}
                        >
                          Copy link
                        </button>
                        <a href={invoice.paymentLink} target="_blank" rel="noreferrer">
                          Open checkout
                        </a>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className={local.hint}>
                        No payment link yet. Generate one to let your customer
                        pay online.
                      </p>
                      <button
                        className={styles.primaryButton}
                        disabled={busy === "payment-link"}
                        onClick={() => void generatePaymentLink()}
                      >
                        {busy === "payment-link" ? "Generating…" : "Generate payment link"}
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Customer</h2>
                  </div>
                </div>
                <div className={local.summaryLine}>
                  <small>Workspace record</small>
                  <button
                    className={local.backLink}
                    onClick={() => router.push(`/dashboard/customers/${invoice.customerId}`)}
                  >
                    View customer →
                  </button>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
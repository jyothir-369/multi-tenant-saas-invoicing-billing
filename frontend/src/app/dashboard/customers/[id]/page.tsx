"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../../../page.module.css";
import local from "./customer.module.css";
import { api, formatMoney } from "../../../../lib/api";
import { formatRelativeTime } from "../../../../components/formatRelativeTime";

type Customer = {
  id: string;
  name: string;
  email: string;
  isArchived: boolean;
  balance: number;
  invoiceCount: number;
  notesCount: number;
  lastInvoiceDate?: string | null;
};
type Note = { id: string; content: string; createdAt: string; user?: { email: string } };
type Activity = { type: string; text: string; timestamp: string; icon?: string };
type InvRow = {
  id: string;
  totalCents: number;
  status: string;
  number?: string;
  invoiceNumber?: string;
  dueDate: string;
};
type PayRow = {
  id: string;
  amount: number;
  status: string;
  providerPaymentId?: string;
  createdAt: string;
};

const TABS = ["invoices", "payments", "notes", "activity"] as const;
type Tab = (typeof TABS)[number];

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
function invoiceLabel(inv: Pick<InvRow, "id" | "number" | "invoiceNumber">) {
  return inv.invoiceNumber || inv.number || `INV-${inv.id.slice(0, 6).toUpperCase()}`;
}

export default function CustomerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(rawTab || "")
    ? (rawTab as Tab)
    : "invoices";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<InvRow[]>([]);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [noteText, setNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const refreshNotes = useCallback(async () => {
    setNotes(await api<Note[]>(`/customers/${params.id}/notes`));
  }, [params.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [c, inv, p, n, a] = await Promise.all([
        api<Customer>(`/customers/${params.id}`),
        api<{ data: InvRow[] } | InvRow[]>(`/customers/${params.id}/invoices`),
        api<{ data: PayRow[] } | PayRow[]>(`/customers/${params.id}/payments`),
        api<Note[]>(`/customers/${params.id}/notes`),
        api<Activity[]>(`/customers/${params.id}/activity`),
      ]);
      setCustomer(c);
      setInvoices(Array.isArray(inv) ? inv : (inv.data ?? []));
      setPayments(Array.isArray(p) ? p : (p.data ?? []));
      setNotes(n);
      setActivity(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load customer.");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function addNote() {
    const content = noteText.trim();
    if (!content) return;
    setNoteBusy(true);
    setError("");
    try {
      await api(`/customers/${params.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setNoteText("");
      await refreshNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add note.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function updateNote(n: Note) {
    const content = editText.trim();
    if (!content) return;
    setNoteBusy(true);
    setError("");
    try {
      await api(`/customers/${params.id}/notes/${n.id}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      setEditingId(null);
      await refreshNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update note.");
    } finally {
      setNoteBusy(false);
    }
  }

  async function deleteNote(n: Note) {
    if (!window.confirm("Delete this note?")) return;
    setError("");
    try {
      await api(`/customers/${params.id}/notes/${n.id}`, { method: "DELETE" });
      await refreshNotes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete note.");
    }
  }

  if (loading)
    return (
      <div className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.empty}>Loading customer…</div>
        </div>
      </div>
    );

  if (!customer)
    return (
      <div className={styles.main}>
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <p>{error || "Customer not found."}</p>
            <button
              onClick={() =>
                error ? void load() : router.push("/dashboard/customers")
              }
            >
              {error ? "Try again" : "Back to customers"}
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className={styles.main}>
      <div className={local.backRow}>
        <button
          className={local.backLink}
          onClick={() => router.push("/dashboard/customers")}
        >
          ← All customers
        </button>
      </div>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            {customer.name}
            <span className={styles.dot}>.</span>
            {customer.isArchived && (
              <span className={`${styles.tag} ${styles.archived}`}>Archived</span>
            )}
          </h1>
          <p>
            {customer.email} · balance {formatMoney(customer.balance)}
          </p>
        </div>
        <div className={styles.topActions}>
          <Link
            className={styles.primaryButton}
            href={`/dashboard/invoices/new?customer=${customer.id}`}
          >
            New invoice
          </Link>
        </div>
      </div>
      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <span>!</span>
          <div>
            <p>{error}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        </div>
      )}
      <div className={styles.grid}>
        <div>
          <div className={local.tabs}>
            {TABS.map((t) => (
              <Link
                key={t}
                href={`?tab=${t}`}
                className={`${local.tab}${tab === t ? ` ${local.tabActive}` : ""}`}
                aria-current={tab === t ? "page" : undefined}
              >
                {t}
              </Link>
            ))}
          </div>

          {tab === "invoices" &&
            (invoices.length === 0 ? (
              <section className={styles.panel}>
                <div className={styles.empty}>
                  <b>No invoices yet</b>
                  <p>Create this customer's first invoice to get started.</p>
                  <Link
                    className={styles.primaryButton}
                    href={`/dashboard/invoices/new?customer=${customer.id}`}
                    style={{ marginTop: 12 }}
                  >
                    Create an invoice →
                  </Link>
                </div>
              </section>
            ) : (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Invoices</h2>
                    <p>{invoices.length} invoices for this customer.</p>
                  </div>
                </div>
                <div className={styles.table}>
                  {invoices.map((inv) => (
                    <div className={styles.tableRow} key={inv.id}>
                      <span>
                        <b>{invoiceLabel(inv)}</b>
                        <small className={statusTone(inv.status)}>
                          {STATUS_LABEL[inv.status.toUpperCase()] || inv.status}
                        </small>
                      </span>
                      <b>{formatMoney(inv.totalCents ?? 0)}</b>
                      <small>{new Date(inv.dueDate).toLocaleDateString()}</small>
                      <button
                        className={local.rowLink}
                        onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}

          {tab === "payments" &&
            (payments.length === 0 ? (
              <section className={styles.panel}>
                <div className={styles.empty}>
                  <b>No payments recorded</b>
                  <p>
                    Payments made against this customer's invoices will appear
                    here.
                  </p>
                </div>
              </section>
            ) : (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Payments</h2>
                    <p>{payments.length} payments against this customer.</p>
                  </div>
                </div>
                <div className={styles.table}>
                  {payments.map((p) => (
                    <div className={styles.tableRow} key={p.id}>
                      <span>
                        <b>{formatMoney(p.amount ?? 0)}</b>
                        <small>{p.status}</small>
                      </span>
                      <small>
                        {p.providerPaymentId
                          ? p.providerPaymentId.slice(0, 8)
                          : "—"}
                      </small>
                      <small>{new Date(p.createdAt).toLocaleDateString()}</small>
                    </div>
                  ))}
                </div>
              </section>
            ))}

          {tab === "notes" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Notes</h2>
                  <p>Internal context attached to this customer record.</p>
                </div>
              </div>
              <div className={local.noteCompose}>
                <textarea
                  className={local.textarea}
                  rows={3}
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <button
                  className={styles.primaryButton}
                  disabled={noteBusy || !noteText.trim()}
                  onClick={() => void addNote()}
                >
                  {noteBusy ? "Saving…" : "Add note"}
                </button>
              </div>
              {notes.length === 0 ? (
                <div className={styles.empty}>
                  <b>No notes yet</b>
                  <p>Write the first note above to capture context.</p>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  {notes.map((n) => (
                    <div className={local.noteCard} key={n.id}>
                      {editingId === n.id ? (
                        <>
                          <textarea
                            className={local.textarea}
                            rows={3}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                          <div className={local.noteActions}>
                            <button
                              className={local.noteAction}
                              disabled={noteBusy}
                              onClick={() => void updateNote(n)}
                            >
                              Save
                            </button>
                            <button
                              className={local.noteAction}
                              onClick={() => {
                                setEditingId(null);
                                setEditText("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className={local.noteContent}>{n.content}</p>
                          <div className={local.noteMeta}>
                            {new Date(n.createdAt).toLocaleString()} ·{" "}
                            {n.user?.email || "Workspace user"}
                          </div>
                          <div className={local.noteActions}>
                            <button
                              className={local.noteAction}
                              onClick={() => {
                                setEditingId(n.id);
                                setEditText(n.content);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${local.noteAction} ${local.danger}`}
                              onClick={() => void deleteNote(n)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "activity" &&
            (activity.length === 0 ? (
              <section className={styles.panel}>
                <div className={styles.empty}>
                  <b>No activity yet</b>
                  <p>Changes related to this customer will appear here.</p>
                </div>
              </section>
            ) : (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2>Activity</h2>
                    <p>The most recent events around this customer.</p>
                  </div>
                </div>
                <div className={styles.activityFeed}>
                  {activity.map((a, i) => (
                    <div className={styles.activityItem} key={i}>
                      <span className={styles.activityIcon}>
                        {a.icon || "•"}
                      </span>
                      <span>{a.text}</span>
                      <small className={styles.activityTime}>
                        {formatRelativeTime(a.timestamp)}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        <div>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Summary</h2>
              </div>
            </div>
            <div className={local.summaryLine}>
              <small>Balance</small>
              <b>{formatMoney(customer.balance)}</b>
            </div>
            <div className={local.summaryLine}>
              <small>Invoices</small>
              <b>{customer.invoiceCount}</b>
            </div>
            <div className={local.summaryLine}>
              <small>Notes</small>
              <b>{customer.notesCount}</b>
            </div>
            <div className={local.summaryLine}>
              <small>Last activity</small>
              <b>
                {customer.lastInvoiceDate
                  ? new Date(customer.lastInvoiceDate).toLocaleDateString()
                  : "—"}
              </b>
            </div>
            <div className={local.totals}>
              <Link
                className={styles.primaryButton}
                href={`/dashboard/invoices/new?customer=${customer.id}`}
                style={{ width: "100%", marginTop: 4 }}
              >
                New invoice
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
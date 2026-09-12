"use client";
import { FormEvent, useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "../../page.module.css";
import { api, formatMoney } from "../../../lib/api";
import EmptyState from "../../../components/EmptyState";

type Customer = {
  id: string;
  name: string;
  email: string;
  balance_cents: number;
  lastInvoiceDate?: string | null;
  isArchived: boolean;
};

export default function CustomersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Customer[]>([]),
    [archived, setArchived] = useState(false),
    [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [editing, setEditing] = useState<Customer | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [sortKey, setSortKey] = useState<"name" | "email" | "balance_cents" | "lastInvoiceDate">("name"),
    [sortDir, setSortDir] = useState<"asc" | "desc">("asc"),
    [page, setPage] = useState(1);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api<{ data: Customer[]; total: number }>(
        `/customers${archived ? "?includeArchived=true" : ""}`,
      );
      setItems(res.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [archived]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(editing ? `/customers/${editing.id}` : "/customers", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ name, email }),
      });
      setName("");
      setEmail("");
      setEditing(null);
      setMessage(editing ? "Customer updated." : "Customer created.");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  }

  async function mutate(
    c: Customer,
    action: "archive" | "unarchive" | "delete",
  ) {
    try {
      await api(
        `/customers/${c.id}${action === "delete" ? "" : `/${action}`}`,
        { method: action === "delete" ? "DELETE" : "POST" },
      );
      setMessage(
        action === "delete"
          ? "Customer deleted."
          : `Customer ${action === "archive" ? "archived" : "restored"}.`,
      );
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update customer.");
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((c) =>
      q ? `${c.name} ${c.email}`.toLowerCase().includes(q) : true,
    );
  }, [items, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "balance_cents") {
        av = a.balance_cents ?? 0;
        bv = b.balance_cents ?? 0;
      }
      if (sortKey === "lastInvoiceDate") {
        av = a.lastInvoiceDate || "";
        bv = b.lastInvoiceDate || "";
      }
      if (av === bv) return 0;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc" ? 1 : -1;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const formatCurrency = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      (cents ?? 0) / 100,
    );

  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Customers<span className={styles.dot}>.</span>
          </h1>
          <p>Manage customers belonging to your workspace.</p>
        </div>
      </div>
      {message && (
        <div className={styles.alert}>
          <span>✓</span>
          <p>{message}</p>
        </div>
      )}
      {error && (
        <div className={styles.alert}>
          <span>!</span>
          <div>
            <p>{error}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        </div>
      )}
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{editing ? "Edit customer" : "Add customer"}</h2>
            <p>Records are scoped to your authenticated tenant.</p>
          </div>
        </div>
        <form onSubmit={save} className={styles.customerForm}>
          <input
            aria-label="Customer name"
            placeholder="Customer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
          />
          <input
            aria-label="Customer email"
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add customer"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setEmail("");
              }}
            >
              Cancel
            </button>
          )}
        </form>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>{archived ? "Archived customers" : "Customer list"}</h2>
            <p>
              {sorted.length} customer{sorted.length === 1 ? "" : "s"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              aria-label="Search customers"
              placeholder="Search name or email"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            />
            <button onClick={() => { setArchived((v) => !v); setPage(1); }}>
              {archived ? "View active" : "View archived"}
            </button>
            <button
              onClick={() => downloadCSV()}
              className={styles.primaryButton}
              style={{ padding: "6px 12px", fontSize: "0.85rem" }}
            >
              Export CSV
            </button>
          </div>
        </div>
        {loading ? (
          <div className={styles.empty}>Loading customers…</div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add your first customer to get started."
            action={
              <button onClick={() => document.querySelector("input[aria-label='Customer name']")?.scrollIntoView({ behavior: "smooth" })} className={styles.primaryButton}>
                Add your first customer
              </button>
            }
          />
        ) : (
          <>
            <div className={styles.customerList}>
              <div
                className={styles.customerRow}
                style={{ fontWeight: 700, borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}
              >
                <button onClick={() => toggleSort("name")}>Name {sortKey === "name" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                <button onClick={() => toggleSort("email")}>Email {sortKey === "email" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                <button onClick={() => toggleSort("balance_cents")}>Balance {sortKey === "balance_cents" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                <button onClick={() => toggleSort("lastInvoiceDate")}>Last invoice date {sortKey === "lastInvoiceDate" ? (sortDir === "asc" ? "▲" : "▼") : ""}</button>
                <span>Actions</span>
              </div>
              {paginated.map((c) => (
                <div
                  className={styles.customerRow}
                  key={c.id}
                  onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <span>
                    <b>{c.name}</b>
                    <br />
                    <small>{c.email}</small>
                  </span>
                  <strong>{formatCurrency(c.balance_cents ?? 0)}</strong>
                  <span>{c.lastInvoiceDate ? new Date(c.lastInvoiceDate).toLocaleDateString() : "—"}</span>
                  <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => router.push(`/dashboard/customers/${c.id}`)}>View</button>
                    <button onClick={() => { setEditing(c); setName(c.name); setEmail(c.email); }}>Edit</button>
                    <button onClick={() => void mutate(c, c.isArchived ? "unarchive" : "archive")}>
                      {c.isArchived ? "Unarchive" : "Archive"}
                    </button>
                    <button aria-label="More" onClick={(e) => { e.stopPropagation(); alert("Row actions: View | Edit | Archive"); }}>⋯</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: 12 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
      </section>
    </div>
  );

  async function downloadCSV() {
    try {
      const url = `${(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "")}/customers/export.csv`;
      const token = window.localStorage.getItem("ledgerly_token") || "";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "customers.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : "Unknown"));
    }
  }
}

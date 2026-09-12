"use client";
import { useState, useEffect } from "react";
import { api, formatMoney } from "../../../lib/api";

type Link = { id: string; token: string; url: string; status: string; expiresAt: string };
type Invoice = { id: string; number: string; customerName: string; totalCents: number; status: string };

export default function PaymentsClient() {
  const [tab, setTab] = useState("ALL");
  const [links, setLinks] = useState<Link[]>([]);
  const [message, setMessage] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    api<Invoice[]>("/invoices?status=UNPAID").then(setInvoices).catch(() => setInvoices([]));
  }, []);

  const generate = async () => {
    if (!selected) { setMessage("Select an invoice first."); return; }
    try {
      const r = await api<{ id: string; token: string; url: string; expires_at: string }>("/payments/links", { method: "POST", body: JSON.stringify({ invoice_id: selected }) });
      setLinks([{ id: r.id, token: r.token, url: r.url, status: "PENDING", expiresAt: r.expires_at }, ...links]);
      setMessage("Link generated (Stripe deferred).");
    } catch (e) {
      setMessage("Failed.");
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <div style={{ background: "#fef3c7", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <strong>⚠ Stripe integration is paused.</strong> Payments are simulated.
      </div>
      <h1>Payments</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["ALL","Succeeded","Pending","Failed","Refunded"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 12", border: tab === t ? "2px solid #000" : "1px solid #ccc" }}>{t}</button>
        ))}
      </div>
      <section style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
        <h2>Collect payment</h2>
        {invoices.length === 0 ? (
          <div>
            <p>No unpaid invoices.</p>
            <a href="/dashboard/invoices/new">Create an invoice</a>
          </div>
        ) : (
          <>
            <select value={selected} onChange={e => setSelected(e.target.value)} style={{ padding: 6, marginBottom: 8 }}>
              <option value="">Select invoice…</option>
              {invoices.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.number || inv.id}</option>
              ))}
            </select>
            <button onClick={generate}>Generate payment link</button>
          </>
        )}
        {message && <p>{message}</p>}
        {links.map((l) => (
          <div key={l.id} style={{ marginTop: 8, padding: 8, background: "#f9fafb" }}>
            <p>Link: <code>{l.url}</code></p>
            <p>Status: {l.status} · Expires: {new Date(l.expiresAt).toLocaleDateString()}</p>
            <button onClick={() => navigator.clipboard.writeText(l.url)}>Copy</button>
          </div>
        ))}
      </section>
    </main>
  );
}

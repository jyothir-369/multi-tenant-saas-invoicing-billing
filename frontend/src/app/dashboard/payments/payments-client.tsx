"use client";
import { useState } from "react";
import { api, formatMoney } from "../../../lib/api";

type Link = { id: string; token: string; url: string; status: string; expiresAt: string };

export default function PaymentsClient() {
  const [tab, setTab] = useState("ALL");
  const [links, setLinks] = useState<Link[]>([]);
  const [message, setMessage] = useState("");

  const generate = async () => {
    try {
      const r = await api<{ id: string; token: string; url: string; expires_at: string }>("/payments/links", { method: "POST", body: JSON.stringify({ invoice_id: "demo" }) });
      setLinks([{ id: r.id, token: r.token, url: r.url, status: "PENDING", expiresAt: r.expires_at }, ...links]);
      setMessage("Link generated (Stripe deferred).");
    } catch (e) {
      setMessage("Failed.");
    }
  };

  return (
    <main style={{ padding: 24 }}>
      <div style={{ background: "#fef3c7", padding: 12, borderRadius: 8, marginBottom: 16 }}>
        <strong>⚠ Stripe integration is paused.</strong> Payments are simulated for demo purposes.
      </div>
      <h1>Payments</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["ALL","Succeeded","Pending","Failed","Refunded"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: "6px 12", border: tab === t ? "2px solid #000" : "1px solid #ccc" }}>{t}</button>
        ))}
      </div>
      <section style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
        <h2>Collect payment</h2>
        <button onClick={generate}>Generate payment link</button>
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

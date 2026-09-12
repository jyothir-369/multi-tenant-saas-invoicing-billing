"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function PayPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`http://localhost:4000/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message || "Not found"))
      .finally(() => setLoading(false));
  }, [token]);

  const simulate = async () => {
    try {
      const r = await fetch(`http://localhost:4000/pay/${token}/simulate`, {
        method: "POST",
        headers: { "x-simulate": "true" },
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      alert(d.message || "Simulated");
    } catch (e: any) {
      alert("Simulate failed: " + e.message);
    }
  };

  if (loading) return <main style={{ padding: 24 }}><h2>Loading…</h2></main>;
  if (error || !data) return (
    <main style={{ padding: 24 }}>
      <h1>Invalid or expired link</h1>
      <p>Please contact the business.</p>
    </main>
  );

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: "0 auto" }}>
      <h1>Pay Invoice</h1>
      <p><strong>Tenant:</strong> {data.tenantName}</p>
      <p><strong>Customer:</strong> {data.customerName}</p>
      <p><strong>Invoice #:</strong> {data.invoiceNumber || data.invoice_id || token.slice(0, 8)}</p>
      <p><strong>Amount due:</strong> ${(data.amountCents / 100).toFixed(2)}</p>
      <p><strong>Expires:</strong> {new Date(data.expiresAt).toLocaleString()}</p>
      <button onClick={simulate} style={{ padding: "10px 20px", fontSize: 18 }}>
        Pay Now
      </button>
      <p style={{ marginTop: 16, color: "#666", fontSize: 12 }}>
        ⚠ Stripe integration is deferred. This is a simulated payment.
      </p>
    </main>
  );
}

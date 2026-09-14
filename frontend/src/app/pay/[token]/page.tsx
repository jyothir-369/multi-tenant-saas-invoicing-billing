"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../../page.module.css";
import local from "./pay.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type LineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRateBps: number;
  subtotalCents: number;
};
type CheckoutData = {
  invoiceNumber: string;
  customerName: string;
  customerEmail?: string;
  status: string;
  payable: boolean;
  alreadyPaid: boolean;
  amountCents: number;
  subtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  lineItems: LineItem[];
  dueDate: string;
  issuedAt: string;
  expiresAt: string;
  businessName: string;
  requiresSignature: boolean;
  signed: boolean;
  signerName?: string;
  signedAt?: string;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (cents || 0) / 100,
  );
const taxPct = (bps: number) => `${((bps || 0) / 100).toFixed(0)}%`;
const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

export default function PayPage() {
  const params = useParams();
  const token = params?.token as string;

  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState("");
  const [warning, setWarning] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/pay/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      })
      .then((d: CheckoutData) => {
        setData(d);
        setSignerEmail(d.customerEmail || "");
      })
      .catch((e) => setError(e.message || "Not found"))
      .finally(() => setLoading(false));
  }, [token]);

  const requiresSignature = Boolean(data?.requiresSignature);

  async function confirmPayment() {
    if (!data) return;
    setError("");
    setWarning("");
    if (requiresSignature && !signerName.trim()) {
      setError("Enter your signature (full name) before confirming payment.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/pay/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: signerName.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.message || "Unable to record payment");
      setSuccess(body?.message || "Payment recorded. A receipt will be sent shortly.");
    } catch (e: any) {
      setError(e?.message || "Unable to complete payment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function simulatePayment() {
    setError("");
    setWarning("");
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/pay/${token}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-simulate": "true",
        },
        body: JSON.stringify({
          signerName: signerName.trim() || undefined,
          signerEmail: signerEmail.trim() || undefined,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.message || "Unable to simulate payment");
      setSuccess(body?.message || "Simulated payment recorded.");
    } catch (e: any) {
      setError(e?.message || "Unable to simulate payment.");
    } finally {
      setSubmitting(false);
    }
  }

  // Loading / not-found states
  if (loading)
    return (
      <main className={local.page}>
        <div className={local.card}>
          <p className={local.muted}>Loading checkout…</p>
        </div>
      </main>
    );
  if (error || !data) {
    const expired = error?.toLowerCase().includes("expir");
    return (
      <main className={local.page}>
        <div className={local.card}>
          <span className={local.brand}>
            <b>LEDGERLY</b>
            <small>Hosted checkout</small>
          </span>
          <h1 className={local.title}>{expired ? "This link has expired" : "Invalid or expired link"}</h1>
          <p className={local.muted}>
            {expired
              ? "Payment links expire for security. Please contact the business to request a fresh link."
              : "Please contact the business for a valid payment link."}
          </p>
        </div>
      </main>
    );
  }

  // Paid / not-payable states
  if (data.alreadyPaid || !data.payable) {
    return (
      <main className={local.page}>
        <div className={local.card}>
          <span className={local.brand}>
            <b>LEDGERLY</b>
            <small>Hosted checkout</small>
          </span>
          <h1 className={local.title}>{data.alreadyPaid ? "Invoice paid" : "Not payable"}</h1>
          <p className={local.muted}>
            {data.alreadyPaid
              ? "This invoice has already been paid. Thank you!"
              : "This invoice is not currently payable. Please contact the business."}
          </p>
        </div>
      </main>
    );
  }

  const alreadySigned = Boolean(data.signed && data.signerName);

  return (
    <main className={local.page}>
      <div className={local.card}>
        <span className={local.brand}>
          <b>LEDGERLY</b>
          <small>Hosted checkout</small>
        </span>

        <header className={local.header}>
          <div>
            <span className={styles.kicker}>{data.businessName.toUpperCase()}</span>
            <h1 className={local.title}>
              Invoice {data.invoiceNumber}
              {requiresSignature && (
                <span className={local.requiredTag}>SIGNATURE REQUIRED</span>
              )}
            </h1>
            <p className={local.muted}>
              Billed to <b>{data.customerName}</b> · Due {fmtDate(data.dueDate)}
            </p>
          </div>
        </header>

        {success && (
          <div className={styles.alert}>
            <span>✓</span>
            <p>{success}</p>
          </div>
        )}
        {error && (
          <div className={`${styles.alert} ${styles.alertError}`}>
            <span>!</span>
            <div>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Line items */}
        {data.lineItems.length > 0 && (
          <section className={local.section}>
            <div className={local.sectionHeader}>
              <h2>Items</h2>
            </div>
            <div className={local.items}>
              {data.lineItems.map((it, i) => (
                <div className={local.itemRow} key={i}>
                  <span className={local.itemDesc}>
                    <b>{it.description}</b>
                    <small>×{it.quantity}</small>
                  </span>
                  <span className={local.itemPrice}>
                    <small>{taxPct(it.taxRateBps)} tax</small>
                    <b>{money(it.subtotalCents)}</b>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Totals */}
        <section className={local.section}>
          {(data.subtotalCents > 0 || data.lineItems.length > 0) && (
            <div className={local.totalsLine}>
              <small>Subtotal</small>
              <b>{money(data.subtotalCents)}</b>
            </div>
          )}
          {data.discountCents > 0 && (
            <div className={local.totalsLine}>
              <small>Discount</small>
              <b>−{money(data.discountCents)}</b>
            </div>
          )}
          {data.taxCents > 0 && (
            <div className={local.totalsLine}>
              <small>Tax</small>
              <b>{money(data.taxCents)}</b>
            </div>
          )}
          <div className={`${local.totalsLine} ${local.due}`}>
            <small>Amount due</small>
            <b>{money(data.amountCents || data.totalCents)}</b>
          </div>
        </section>

        {/* Signature */}
        <section className={local.section}>
          <div className={local.sectionHeader}>
            <h2>{requiresSignature ? "Sign to authorize payment" : "Confirm payment"}</h2>
            {requiresSignature && (
              <p className={local.secureNote}>
                This business requires a signature before payment is accepted.
              </p>
            )}
          </div>
          {alreadySigned || data.signed ? (
            <p className={local.muted}>
              This invoice was already signed by <b>{data.signerName}</b>.
            </p>
          ) : (
            <>
              <label className={local.field}>
                <span>{requiresSignature ? "Signature (type your full name) *" : "Name (optional)"}</span>
                <input
                  type="text"
                  autoComplete="off"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder={requiresSignature ? "e.g. Jane Customer" : "Your name"}
                  required={requiresSignature}
                />
              </label>
              <label className={local.field}>
                <span>Email (for the receipt)</span>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              {requiresSignature && (
                <p className={local.signConsent}>
                  By confirming, <b>{signerName.trim() || "you"}</b> agree that this
                  electronic signature authorizes <b>{data.businessName}</b> to charge{" "}
                  <b>{money(data.amountCents || data.totalCents)}</b> for invoice{" "}
                  <b>{data.invoiceNumber}</b>. This binding sign-off is recorded with
                  date and time.
                </p>
              )}
            </>
          )}
        </section>

        {/* Actions */}
        <div className={local.actions}>
          <button
            className={styles.primaryButton}
            onClick={() => void confirmPayment()}
            disabled={submitting || success !== ""}
            style={{ width: "100%" }}
          >
            {submitting ? "Processing…" : success ? "Payment recorded" : "Pay securely"}
          </button>
          <button
            className={local.simulate}
            onClick={() => void simulatePayment()}
            disabled={submitting || success !== ""}
          >
            Simulate payment (demo)
          </button>
        </div>

        <footer className={local.footer}>
          <small>
            Secure checkout · No card details are stored on our servers.
            Link expires {fmtDate(data.expiresAt)}.
          </small>
        </footer>
      </div>
    </main>
  );
}
"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

const API = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const AUTH_TIMEOUT_MS = 20000;

const FEATURES = [
  {
    title: "Tenant-isolated access",
    sub: "Every workspace is sealed from the next",
    path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  {
    title: "Invoice lifecycle",
    sub: "Drafts, sends, and overdue tracking",
    path: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6",
  },
  {
    title: "Payment tracking",
    sub: "Stripe intents and instant receipts",
    path: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12h8M12 8l4 4-4 4",
  },
];

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [registerMode, setRegisterMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.localStorage.getItem("ledgerly_token")) router.replace("/dashboard");
  }, [router]);

  async function authenticate(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (registerMode && tenantName.trim().length < 2) {
      setError("Workspace name must be at least 2 characters.");
      return;
    }
    setSubmitting(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
    try {
      const r = await fetch(`${API}/auth/${registerMode ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          registerMode
            ? { email, password, tenantName: tenantName.trim() }
            : { email, password },
        ),
        signal: controller.signal,
      });
      const d = await r.json().catch(() => null);
      if (!r.ok)
        throw new Error(
          Array.isArray(d?.message)
            ? d.message.join(" ")
            : d?.message ?? `Unable to ${registerMode ? "create your account" : "sign in"}.`,
        );
      const token = d?.accessToken ?? d?.token;
      if (!token)
        throw new Error("Authentication succeeded but no access token was returned.");
      window.localStorage.setItem("ledgerly_token", token);
      window.localStorage.setItem("ledgerly_email", email);
      router.replace("/dashboard");
    } catch (v) {
      if (v instanceof DOMException && v.name === "AbortError")
        setError("The server took too long to respond. Please try again.");
      else if (v instanceof TypeError)
        setError("Unable to reach the server. Check your connection and try again.");
      else setError(v instanceof Error ? v.message : "Something went wrong. Please try again.");
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <aside className={styles.authHeroPanel}>
        <div className={styles.authBrandLarge}>
          <span className={styles.brandMark}>L</span>
          <span>ledgerly</span>
        </div>

        <div className={styles.authHeroCopy}>
          <p className={styles.authTagline}>
            Billing that feels <strong>calm.</strong>
          </p>
          <p className={styles.authHeroSub}>
            A quiet, powerful home for your invoices, customers, and cash flow —
            isolated by workspace so your data stays yours.
          </p>
          <ul className={styles.featureList}>
            {FEATURES.map((f) => (
              <li className={styles.featureItem} key={f.title}>
                <span className={styles.featureIcon}>
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={f.path} />
                  </svg>
                </span>
                <span>
                  {f.title}
                  <small>{f.sub}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.authHeroFoot}>
          <span className={styles.heroStat}>
            99.9%<b>Uptime target</b>
          </span>
          <span className={styles.heroStat}>
            $0<b>Setup cost</b>
          </span>
          <span className={styles.heroStat}>
            &lt;24h<b>Receipt delivery</b>
          </span>
        </div>
      </aside>

      <section className={styles.authCol}>
        <div className={styles.authGlow} />
        <section className={styles.authCard}>
          <div className={styles.authIntro}>
            <span className={styles.kicker}>THE MODERN BILLING DESK</span>
            <h1>{registerMode ? "Create your workspace." : "Welcome back."}</h1>
            <p>
              {registerMode
                ? "Set up an isolated workspace and bring your finances into focus."
                : "Sign in to your isolated billing workspace."}
            </p>
          </div>
          <form onSubmit={authenticate} className={styles.authForm}>
            {registerMode && (
              <label>
                Workspace name
                <input
                  aria-label="Workspace name"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  minLength={2}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                aria-label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                aria-label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <p className={styles.formError}>{error}</p>}
            <button className={styles.primaryButton} type="submit" disabled={submitting}>
              {submitting ? "Please wait…" : registerMode ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            type="button"
            className={styles.textButton}
            onClick={() => {
              setRegisterMode((v) => !v);
              setError("");
            }}
          >
            {registerMode
              ? "Already have an account? Sign in"
              : "New to Ledgerly? Create an account"}
          </button>
          <p className={styles.secureNote}>
            Your workspace is protected with tenant-isolated access.
          </p>
        </section>
      </section>
    </main>
  );
}
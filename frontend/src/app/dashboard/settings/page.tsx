"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../../page.module.css";
import { api } from "../../../lib/api";
type Profile = {
  email: string;
  role: string;
  tenantId: string;
  tenantName: string;
};
type Tenant = { id: string; name: string; plan: string; createdAt: string };
type Stats = {
  totalUsers: number;
  totalCustomers: number;
  totalInvoices: number;
  totalPayments: number;
};
export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [tenant, setTenant] = useState<Tenant | null>(null),
    [stats, setStats] = useState<Stats | null>(null),
    [name, setName] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, t, s] = await Promise.all([
        api<Profile>("/auth/profile"),
        api<Tenant>("/tenants/me"),
        api<Stats>("/tenants/me/stats"),
      ]);
      setProfile(p);
      setTenant(t);
      setStats(s);
      setName(t.name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load workspace settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const updated = await api<Tenant>("/tenants/me", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setTenant(updated);
      setMessage("Workspace settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className={styles.main}>
        <div className={styles.empty}>Loading workspace settings…</div>
      </div>
    );
  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Settings<span className={styles.dot}>.</span>
          </h1>
          <p>Manage your workspace identity and account details.</p>
        </div>
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
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Workspace</h2>
            <p>Only workspace owners can update these settings.</p>
          </div>
        </div>
        <form onSubmit={save} className={styles.customerForm}>
          <label htmlFor="workspace-name">Workspace name</label>
          <input
            id="workspace-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
          />
          <button
            className={styles.primaryButton}
            disabled={saving || profile?.role !== "OWNER"}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
        <span className={styles.sectionTitle}>Plan</span>
        <p>
          <b>{tenant?.plan || "Unavailable"}</b>
          {profile?.role !== "OWNER" && (
            <small>Billing changes are restricted to workspace owners.</small>
          )}
        </p>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Your account</h2>
            <p>Authenticated identity for this tenant.</p>
          </div>
        </div>
        <span className={styles.sectionTitle}>Signed in as</span>
        <p>
          <b>{profile?.email}</b>
        </p>
        <span className={styles.sectionTitle}>Role</span>
        <p>
          <b>{profile?.role}</b>
        </p>
        <span className={styles.sectionTitle}>Tenant</span>
        <p>{profile?.tenantName || tenant?.name}</p>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Workspace usage</h2>
            <p>Read-only totals from the current tenant.</p>
          </div>
        </div>
        {stats ? (
          <div className={styles.kpis} style={{ marginBottom: 0 }}>
            {[
              ["Users", stats.totalUsers],
              ["Customers", stats.totalCustomers],
              ["Invoices", stats.totalInvoices],
              ["Payments", stats.totalPayments],
            ].map(([l, v]) => (
              <article className={styles.kpi} key={String(l)}>
                <div className={styles.kpiTop}>
                  <span>{l}</span>
                </div>
                <strong>{v.toLocaleString()}</strong>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Usage data unavailable.</div>
        )}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Unavailable settings</h2>
            <p>Workflows that are not yet wired up in the frontend.</p>
          </div>
        </div>
        <p>
          Password changes, team management, billing plan changes, and
          notification preferences do not currently have supported frontend
          settings workflows.
        </p>
      </section>
    </div>
  );
}

"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "../../page.module.css";
import { api } from "../../../lib/api";
import SettingsTabs from "./settings-tabs";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "workspace";
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
      <SettingsTabs
        active={activeTab}
        onChange={(k) => {
          const p = new URLSearchParams(searchParams.toString());
          p.set("tab", k);
          router.push(`/dashboard/settings?${p.toString()}`);
        }}
      />
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
      {activeTab === "workspace" && (
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
          <p>
            Plan: <b>{tenant?.plan || "Unavailable"}</b>
          </p>
        </section>
      )}
      {activeTab === "account" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Your account</h2>
              <p>Authenticated identity for this tenant.</p>
            </div>
          </div>
          <p>
            <b>{profile?.email}</b>
          </p>
          <p>
            Role: <b>{profile?.role}</b>
          </p>
          <p>Tenant: {profile?.tenantName || tenant?.name}</p>
        </section>
      )}
      {activeTab === "usage" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Workspace usage</h2>
              <p>Read-only totals from the current tenant.</p>
            </div>
          </div>
          {stats ? (
            <p>
              {stats.totalUsers} users · {stats.totalCustomers} customers ·{" "}
              {stats.totalInvoices} invoices · {stats.totalPayments} payments
            </p>
          ) : (
            <div className={styles.empty}>Usage data unavailable.</div>
          )}
        </section>
      )}
      {activeTab === "audit" && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Audit</h2>
              <p>Audit log view from <a href="/dashboard/settings/audit" className="text-[#23745a] underline">Audit Log page →</a>.</p>
            </div>
          </div>
        </section>
      )}
      {!("workspace" === activeTab || "account" === activeTab || "usage" === activeTab || "audit" === activeTab) && (
        <section className={styles.panel}>
          <h2>Unavailable settings</h2>
          <p>
            Password changes, team management, billing plan changes, and
            notification preferences do not currently have supported frontend
            settings workflows.
          </p>
        </section>
      )}
    </div>
  );
}

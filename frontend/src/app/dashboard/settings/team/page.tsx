"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "../../../page.module.css";
import local from "./team.module.css";
import { api } from "../../../../lib/api";

type Profile = { email: string; role: string };
type Member = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
};

export default function TeamPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = await api<Profile>("/auth/profile");
      setProfile(p);
      if (p.role !== "OWNER") {
        setMembers([]);
        return;
      }
      setMembers(await api<Member[]>("/users"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setEmail("");
      setPassword("");
      setMessage(`Added ${email}. New members start as Staff.`);
      void load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add team member.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member: Member, role: string) {
    if (member.role === role) return;
    setError("");
    setMessage("");
    try {
      const updated = await api<Member>(`/users/${member.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setMembers((list) => list.map((x) => (x.id === member.id ? updated : x)));
      setMessage(
        `${member.email} is now ${role === "OWNER" ? "an Owner" : "Staff"}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change role.");
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.email} from this workspace?`)) return;
    setError("");
    setMessage("");
    try {
      await api(`/users/${member.id}`, { method: "DELETE" });
      setMembers((list) => list.filter((x) => x.id !== member.id));
      setMessage(`Removed ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove user.");
    }
  }

  const isOwner = profile?.role === "OWNER";
  const selfEmail = profile?.email;

  if (loading)
    return (
      <div className={styles.main}>
        <div className={styles.empty}>Loading team…</div>
      </div>
    );

  return (
    <div className={styles.main}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>LEDGERLY WORKSPACE</span>
          <h1>
            Team<span className={styles.dot}>.</span>
          </h1>
          <p>People with access to this workspace and their roles.</p>
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
      {!isOwner ? (
        <section className={styles.panel}>
          <div className={styles.empty}>
            <b>Owners only</b>
            <p>
              Only workspace owners can manage team members. Ask an owner to
              invite you or change your role.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Add a team member</h2>
                <p>
                  Set an initial password (8+ characters). The invitee signs in
                  with their email and this password.
                </p>
              </div>
            </div>
            <form onSubmit={invite} className={styles.customerForm}>
              <input
                aria-label="Email address"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                aria-label="Temporary password"
                type="password"
                placeholder="Temporary password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button className={styles.primaryButton} disabled={saving}>
                {saving ? "Adding…" : "Add member"}
              </button>
            </form>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>Members</h2>
                <p>
                  {members.length} member{members.length === 1 ? "" : "s"} ·
                  at least one Owner must remain
                </p>
              </div>
            </div>
            {members.length === 0 ? (
              <div className={styles.empty}>
                <b>No members yet</b>
                <p>Add the first member to share this workspace.</p>
              </div>
            ) : (
              <div>
                {members.map((m) => {
                  const isSelf = m.email === selfEmail;
                  return (
                    <div className={local.userRow} key={m.id}>
                      <span className={styles.customerAvatar}>
                        {m.email.charAt(0).toUpperCase()}
                      </span>
                      <span className={local.userIdentity}>
                        <b>
                          {m.email}
                          {isSelf && (
                            <span className={`${styles.tag} ${styles.paid}`}>
                              You
                            </span>
                          )}
                        </b>
                        <small>
                          {ROLE_LABEL[m.role] || m.role} · joined{" "}
                          {new Date(m.createdAt).toLocaleDateString()}
                        </small>
                      </span>
                      <select
                        className={local.roleSelect}
                        aria-label={`Role for ${m.email}`}
                        value={m.role}
                        disabled={isSelf}
                        title={isSelf ? "You cannot change your own role" : undefined}
                        onChange={(e) => void changeRole(m, e.target.value)}
                      >
                        <option value="OWNER">Owner</option>
                        <option value="STAFF">Staff</option>
                      </select>
                      <button
                        className={styles.dangerButton}
                        disabled={isSelf}
                        title={
                          isSelf
                            ? "You cannot remove your own account"
                            : `Remove ${m.email}`
                        }
                        onClick={() => void remove(m)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
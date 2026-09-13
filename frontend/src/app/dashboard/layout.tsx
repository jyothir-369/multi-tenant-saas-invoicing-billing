"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, ReactNode, useEffect, useState } from "react";
import styles from "../page.module.css";
import NotificationBell from "./NotificationBell";

const LINKS = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard/invoices",
    label: "Invoices",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/customers",
    label: "Customers",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/payments",
    label: "Payments",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <path d="M6 15h4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 21h18" />
        <path d="M7 17V9" />
        <path d="M12 17V4" />
        <path d="M17 17v-6" />
      </svg>
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      const token = localStorage.getItem("ledgerly_token");
      if (!token) router.replace("/");
      else {
        setEmail(localStorage.getItem("ledgerly_email") || "");
        setReady(true);
      }
    });
  }, [router]);
  function logout() {
    localStorage.removeItem("ledgerly_token");
    localStorage.removeItem("ledgerly_email");
    router.replace("/");
  }
  if (!ready)
    return (
      <main className={styles.authPage}>
        <div className={styles.empty}>Loading your workspace…</div>
      </main>
    );
  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href + "/"));
  const activeLink = LINKS.find((l) => isActive(l.href));
  const currentLabel = activeLink?.label || "Overview";
  const SEGMENT_LABELS: Record<string, string> = {
    overview: "Overview",
    invoices: "Invoices",
    customers: "Customers",
    payments: "Payments",
    reports: "Reports",
    settings: "Settings",
    audit: "Audit",
    team: "Team",
  };
  const DETAIL_NOUN: Record<string, string> = {
    invoices: "Invoice",
    customers: "Customer",
    payments: "Payment",
    reports: "Report",
    settings: "Workspace",
  };
  const segments = pathname.split("/").filter(Boolean);
  type Crumb = { label: string; href: string };
  const crumbs: Crumb[] = [{ label: "Workspace", href: "/dashboard" }];
  let pathSoFar = "/dashboard";
  for (let i = 1; i < segments.length; i += 1) {
    const s = segments[i];
    pathSoFar += `/${s}`;
    if (SEGMENT_LABELS[s])
      crumbs.push({ label: SEGMENT_LABELS[s], href: pathSoFar });
    else if (i > 1)
      crumbs.push({
        label: DETAIL_NOUN[segments[i - 1]] || "Detail",
        href: pathname,
      });
  }
  return (
    <main className={styles.app}>
      {menuOpen && (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>L</span>
          <span>ledgerly</span>
        </div>
        <nav aria-label="Primary navigation">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              className={isActive(l.href) ? styles.activeNav : ""}
              href={l.href}
              aria-current={isActive(l.href) ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <span>{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.help}>
            <span>?</span>
            <div>
              <b>Need help?</b>
              <small>Support center coming soon</small>
            </div>
          </div>
          <button className={styles.userMenu} onClick={logout} title="Sign out">
            <span className={styles.avatar}>
              {(email || "W").charAt(0).toUpperCase()}
            </span>
            <span>
              <b>{email || "Workspace user"}</b>
              <small className={styles.signOutLabel}>Sign out</small>
            </span>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </aside>
      <section className={styles.content}>
        <header className={styles.topbar}>
          <button
            type="button"
            className={styles.mobileBrand}
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            {crumbs.map((c, idx) => (
              <Fragment key={`${c.href}-${c.label}-${idx}`}>
                {idx > 0 && (
                  <span className={styles.breadcrumbSeparator} aria-hidden="true">
                    /
                  </span>
                )}
                {idx === crumbs.length - 1 ? (
                  <span className={styles.breadcrumbCurrent} aria-current="page">
                    {c.label}
                  </span>
                ) : (
                  <Link
                    href={c.href}
                    className={styles.breadcrumbLink}
                    onClick={() => setMenuOpen(false)}
                  >
                    {c.label}
                  </Link>
                )}
              </Fragment>
            ))}
          </nav>
          <div className={styles.topbarRight}>
            <NotificationBell />
            <div className={styles.workspace}>
              <span className={styles.avatar}>W</span>
              <span>My workspace</span>
            </div>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}
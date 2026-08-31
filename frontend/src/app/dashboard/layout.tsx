"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import styles from "../page.module.css";
const links = [["/dashboard", "⌂", "Overview"], ["/dashboard/invoices", "▤", "Invoices"], ["/dashboard/customers", "♙", "Customers"], ["/dashboard/payments", "$", "Payments"], ["/dashboard/reports", "◒", "Reports"], ["/dashboard/settings", "⚙", "Settings"]];
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [email, setEmail] = useState(""); const [ready, setReady] = useState(false);
  useEffect(() => { const token = localStorage.getItem("ledgerly_token"); if (!token) router.replace("/"); else { setEmail(localStorage.getItem("ledgerly_email") || ""); setReady(true); } }, [router]);
  function logout() { localStorage.removeItem("ledgerly_token"); localStorage.removeItem("ledgerly_email"); router.replace("/"); }
  if (!ready) return <main className={styles.authPage}><div className={styles.empty}>Loading your workspace…</div></main>;
  return <main className={styles.app}><aside className={styles.sidebar}><div className={styles.brand}><span className={styles.brandMark}>L</span><span>ledgerly</span></div><nav aria-label="Primary navigation">{links.map(([href, icon, label]) => <Link key={href} className={pathname === href ? styles.activeNav : ""} href={href}><span>{icon}</span>{label}</Link>)}</nav><div className={styles.sidebarBottom}><div className={styles.help}><span>?</span><div><b>Need help?</b><small>Support center coming soon</small></div></div><button className={styles.userMenu} onClick={logout}><span className={styles.avatar}>{(email || "W").charAt(0).toUpperCase()}</span><span><b>{email || "Workspace user"}</b><small>Sign out</small></span><span>⋮</span></button></div></aside><section className={styles.content}><header className={styles.topbar}><button className={styles.mobileBrand} aria-label="Ledgerly menu">L</button><div className={styles.breadcrumb}>Workspace <span>/</span> {links.find(([href]) => href === pathname)?.[2] || "Overview"}</div><div className={styles.workspace}><span className={styles.avatar}>W</span><span>My workspace</span></div></header>{children}</section></main>;
}

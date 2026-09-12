"use client";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Bell, Search } from "lucide-react";

function getBreadcrumbs(pathname: string) {
  if (!pathname || pathname === "/dashboard") return [{ label: "Workspace", href: "/dashboard" }];
  const parts = pathname.split("/").filter(Boolean);
  const rest = parts.slice(1);
  const crumbs: { label: string; href: string | null }[] = [{ label: "Workspace", href: "/dashboard" }];
  if (rest.length === 0) return crumbs;
  const module = rest[0];
  const moduleLabel = module ? module.charAt(0).toUpperCase() + module.slice(1) : "Overview";
  crumbs.push({ label: moduleLabel, href: "/dashboard/" + module });
  if (rest.length >= 2) {
    const detail = rest[1];
    let detailLabel: string = detail || "";
    if (module === "invoices" && detail) detailLabel = "INV-" + (detail.slice(0, 4)).toUpperCase();
    else if (module === "customers" && detail) detailLabel = detail;
    crumbs.push({ label: detailLabel ?? "", href: null });
  }
  return crumbs;
}

export default function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname || "");
  const [wsOpen, setWsOpen] = useState(false);
  const [wsName, setWsName] = useState("My workspace");
  const [newModal, setNewModal] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const wsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ledgerly.currentWorkspace");
      if (saved) setWsName(saved);
      const e = localStorage.getItem("ledgerly_email") || "";
      setEmail(e ?? "");
    } catch {}
  }, []);

  useEffect(() => {
    function click(e: MouseEvent) {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
    }
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-[72px] flex items-center justify-between px-6 bg-white border-b border-[#e7ece9] shadow-[0_1px_0_rgba(25,53,42,0.02)] shrink-0">
      <div className="flex items-center gap-4">
        <button onClick={onMenuToggle} className="md:hidden grid place-items-center w-10 h-10 bg-[#23745a] text-white rounded-xl font-bold text-lg cursor-pointer hover:bg-[#1b6049] transition-colors" aria-label="Open navigation">☰</button>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px] text-[#8b9691]">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label + i} className="flex items-center gap-2">
              {i > 0 && <span className="text-[#c2cbc6]">/</span>}
              {crumb.href ? <a href={crumb.href} className="hover:text-[#23745a] hover:underline">{crumb.label}</a> : <span className="text-[#18221f] font-medium">{crumb.label}</span>}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative" ref={wsRef}>
          <button onClick={() => setWsOpen(v => !v)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#e7ece9] text-sm font-semibold text-[#18221f] hover:bg-[#f7faf8] transition-colors" aria-expanded={wsOpen} aria-label="Workspace switcher">
            <span className="w-5 h-5 rounded-full bg-[#d8e9df] text-[#23745a] text-xs font-bold grid place-items-center">W</span>
            <span className="max-w-[140px] truncate">{wsName}</span>
          </button>
          {wsOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-[#e7ece9] shadow-xl p-1 z-50" style={{animation:"fadeIn 0.15s ease"}}>
              <button onClick={() => { setWsName("My workspace"); try { localStorage.setItem("ledgerly.currentWorkspace","My workspace"); } catch {} setWsOpen(false); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#23745a] bg-[#f4f8f5] flex items-center gap-2"><span>✓</span> My workspace</button>
              <button onClick={() => { setWsOpen(false); setNewModal(true); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#687570] hover:bg-[#f7faf8] flex items-center gap-2"><span>+</span> Create new workspace</button>
            </div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setNotifOpen(v => !v)} className="relative p-2 rounded-lg hover:bg-[#f7faf8] text-[#738079] transition-colors" aria-label="Notifications"><Bell size={20} /><span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#b94d4d] ring-2 ring-white" /></button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl border border-[#e7ece9] shadow-xl p-3 z-50"><div className="text-xs font-bold text-[#687570] mb-2">Notifications</div><div className="text-sm text-[#78817e] py-2">No notifications yet</div></div>
          )}
        </div>
        <div className="relative">
          <button onClick={() => setUserOpen(v => !v)} className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-[#f7faf8] transition-colors" aria-label="User menu">
            <span className="w-7 h-7 rounded-full bg-[#d8e9df] text-[#23745a] font-bold text-xs grid place-items-center">{(email || "W").charAt(0).toUpperCase()}</span>
            <span className="hidden sm:block text-xs font-bold text-[#18221f]">{email || "Workspace user"}</span>
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-[#e7ece9] shadow-xl p-1 z-50">
              <div className="px-3 py-2 text-xs text-[#78817e]">{email || "workspace@ledgerly.local"}</div>
              <button onClick={() => { localStorage.removeItem("ledgerly_token"); localStorage.removeItem("ledgerly_email"); window.location.href = "/"; }} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-[#b94d4d] hover:bg-[#fff1ed]">Sign out</button>
            </div>
          )}
        </div>
        <button onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))} className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[#e7ece9] text-xs font-medium text-[#78817e] hover:border-[#23745a]/40 hover:text-[#23745a] transition-colors" aria-label="Open command palette"><Search size={14} /><span>⌘K</span></button>
      </div>
      {newModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setNewModal(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-6 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-extrabold text-[#162a22] mb-2">Coming soon</h2>
            <p className="text-sm text-[#78817e] mb-6">Workspace creation is not available yet.</p>
            <button onClick={() => setNewModal(false)} className="inline-block px-6 py-2.5 rounded-lg bg-[#23745a] text-white font-bold text-sm hover:bg-[#1b6049] transition-colors">Close</button>
          </div>
        </div>
      )}
    </header>
  );
}

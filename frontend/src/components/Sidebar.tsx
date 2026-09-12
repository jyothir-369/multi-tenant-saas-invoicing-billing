"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Overview", icon: "⌂" },
  { href: "/dashboard/invoices", label: "Invoices", icon: "▣" },
  { href: "/dashboard/customers", label: "Customers", icon: "♙" },
  { href: "/dashboard/payments", label: "Payments", icon: "$" },
  { href: "/dashboard/reports", label: "Reports", icon: "◒" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙" },
];

export default function Sidebar({
  mobileOpen,
  onMobileToggle,
}: {
  mobileOpen: boolean;
  onMobileToggle: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("ledgerly.sidebarCollapsed");
      if (v === "1" || v === "true") setCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("ledgerly.sidebarCollapsed", collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);
  const widthClass = collapsed ? "w-16" : "w-64";
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onMobileToggle}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 bg-[#f4f8f5] border-r border-[#e7ece9] flex flex-col transition-all duration-200 ${widthClass} ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } shadow-[12px_0_30px_rgba(32,53,43,0.08)] md:shadow-none`}
      >
        <div className={`flex items-center px-4 py-6 ${collapsed ? "justify-center" : "gap-2"}`}>
          <span className="grid place-items-center w-7 h-7 text-white bg-[#23745a] rounded-[9px_9px_9px_2px] font-extrabold text-sm shrink-0">L</span>
          {!collapsed && <span className="font-extrabold text-xl tracking-tight text-[#162a22]">ledgerly</span>}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mx-3 mb-2 p-1.5 rounded-md hover:bg-white text-[#687570] transition-colors self-start hidden md:block"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        <nav aria-label="Primary navigation" className="flex-1 px-2 space-y-1 overflow-y-auto">
          {links.map(({ href, label, icon }) => {
            const active = pathname === href || pathname?.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  active ? "text-[#23745a] bg-white shadow-[0_3px_12px_rgba(32,53,43,0.08)]" : "text-[#687570] hover:text-[#23745a] hover:bg-white/60"
                }`}
                title={collapsed ? label : undefined}
              >
                <span className="w-5 text-center text-lg leading-none shrink-0">{icon}</span>
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-[#e7ece9] space-y-3">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <div className="w-7 h-7 rounded-full bg-[#d8e9df] text-[#23745a] font-bold text-xs grid place-items-center shrink-0">W</div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#18221f] truncate">Workspace user</div>
                <div className="text-[11px] text-[#78817e] truncate">My workspace</div>
              </div>
            )}
          </div>
        </div>
        {/* Mobile hamburger shown inside sidebar when open */}
        <button
          onClick={onMobileToggle}
          className="md:hidden p-2 text-[#687570] self-end"
          aria-label="Close navigation"
        >
          <Menu size={20} />
        </button>
      </aside>
    </>
  );
}

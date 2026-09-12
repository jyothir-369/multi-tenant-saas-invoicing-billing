"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import CommandPalette from "../../components/CommandPalette";
import DashboardErrorBoundary from "../../components/DashboardErrorBoundary";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  if (!ready)
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f7faf8]">
        <div className="text-[#78817e] font-medium">Loading your workspace…</div>
      </main>
    );

  return (
    <div className="min-h-screen flex bg-[#f7faf8] font-sans text-[#18221f]">
      <Sidebar mobileOpen={mobileOpen} onMobileToggle={() => setMobileOpen((v) => !v)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onMenuToggle={() => setMobileOpen((v) => !v)} />
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          <DashboardErrorBoundary>
            {children}
          </DashboardErrorBoundary>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

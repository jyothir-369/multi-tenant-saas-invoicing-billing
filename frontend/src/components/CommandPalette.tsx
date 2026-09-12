"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Search } from "lucide-react";

const commands = [
  { label: "Go to Overview", href: "/dashboard", keywords: "overview dashboard home" },
  { label: "Go to Invoices", href: "/dashboard/invoices", keywords: "invoices bill" },
  { label: "Go to Customers", href: "/dashboard/customers", keywords: "customers clients" },
  { label: "Go to Payments", href: "/dashboard/payments", keywords: "payments" },
  { label: "Go to Reports", href: "/dashboard/reports", keywords: "reports analytics" },
  { label: "Go to Settings", href: "/dashboard/settings", keywords: "settings config" },
  { label: "New Invoice", href: "/dashboard/invoices/new", keywords: "new create invoice" },
  { label: "New Customer", href: "/dashboard/customers/new", keywords: "new create customer" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => {
      const text = (c.label + " " + c.keywords).toLowerCase();
      return text.includes(q);
    });
  }, [query]);

  const navigate = useCallback((item: typeof commands[0]) => {
    setOpen(false);
    setQuery("");
    window.location.href = item.href;
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (results[selected]) navigate(results[selected]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, selected, navigate]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4 bg-black/20 backdrop-blur-sm" onClick={() => { setOpen(false); setQuery(""); }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-[0.98] duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#e7ece9]">
          <Search size={18} className="text-[#78817e]" />
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm text-[#18221f] placeholder:text-[#a1ada8]"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[#f7faf8] border border-[#e7ece9] text-[10px] font-bold text-[#78817e]">ESC</kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto">
          {results.length === 0 && <div className="px-4 py-6 text-sm text-[#78817e] text-center">No results</div>}
          {results.map((c, i) => (
            <button
              key={c.href}
              onClick={() => navigate(c)}
              className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors ${i === selected ? "bg-[#f4f8f5] text-[#23745a] font-medium" : "text-[#18221f] hover:bg-[#f7faf8]"}`}
            >
              <span className="text-xs text-[#a1ada8] font-mono">⌘</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 bg-[#f7faf8] text-[11px] text-[#78817e] flex gap-3 border-t border-[#e7ece9]">
          <span><kbd className="px-1 rounded bg-white border border-[#e7ece9] font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 rounded bg-white border border-[#e7ece9] font-mono">↵</kbd> select</span>
          <span><kbd className="px-1 rounded bg-white border border-[#e7ece9] font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

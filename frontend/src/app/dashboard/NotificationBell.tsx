"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import local from "./NotificationBell.module.css";
import { api, formatMoney } from "../../lib/api";

type Payload = {
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  amount?: number;
  dueDate?: string;
  daysOverdue?: number;
};
type Note = {
  id: string;
  type: string;
  payload: Payload;
  createdAt: string;
  read: boolean;
};

const TITLE: Record<string, string> = {
  INVOICE_PAID: "Invoice paid",
  INVOICE_OVERDUE: "Invoice overdue",
  INVOICE_SENT: "Invoice sent",
  PAYMENT_RECEIVED: "Payment received",
  PAYMENT_FAILED: "Payment failed",
  REFUND_PROCESSED: "Refund processed",
  SEND_INVOICE_EMAIL: "Invoice email queued",
  SEND_RECEIPT_EMAIL: "Receipt email queued",
  SEND_OVERDUE_REMINDER: "Overdue reminder sent",
  GENERATE_INVOICE_PDF: "Invoice PDF generated",
  RECURRING_INVOICE_GENERATE: "Recurring invoice generated",
};

function titleOf(n: Note) {
  if (TITLE[n.type]) return TITLE[n.type];
  if (n.payload.invoiceNumber) return `Invoice ${n.payload.invoiceNumber}`;
  return (
    n.type
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase()) || "Notification"
  );
}

function describe(n: Note) {
  const p = n.payload;
  const parts: string[] = [];
  if (p.customerName) parts.push(p.customerName);
  if (p.invoiceNumber) parts.push(`#${p.invoiceNumber}`);
  if (typeof p.amount === "number") parts.push(formatMoney(p.amount));
  if (p.dueDate) parts.push(`due ${new Date(p.dueDate).toLocaleDateString()}`);
  if (typeof p.daysOverdue === "number" && p.daysOverdue > 0)
    parts.push(`${p.daysOverdue} day${p.daysOverdue === 1 ? "" : "s"} overdue`);
  return parts.join(" · ") || "New notification";
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);

  const load = useCallback(async () => {
    try {
      setNotes(await api<Note[]>("/notifications"));
    } catch {
      /* 401 redirects are handled inside api() */
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onDocument(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocument);
    return () => document.removeEventListener("mousedown", onDocument);
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  const unread = notes.filter((n) => !n.read).length;

  async function openNote(n: Note) {
    setOpen(false);
    if (!n.read) {
      try {
        await api(`/notifications/${n.id}/read`, { method: "POST" });
      } catch {
        /* non-fatal */
      }
    }
    if (n.payload.invoiceId) {
      router.push(`/dashboard/invoices/${n.payload.invoiceId}`);
    }
  }

  async function markAllRead() {
    const unreadIds = notes.filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) {
      setOpen(false);
      return;
    }
    await Promise.allSettled(
      unreadIds.map((id) =>
        api(`/notifications/${id}/read`, { method: "POST" }),
      ),
    );
    setNotes((list) =>
      list.map((n) => (n.read ? n : { ...n, read: true })),
    );
  }

  return (
    <div className={local.wrap} ref={wrapRef}>
      <button
        type="button"
        className={local.bellButton}
        aria-label={
          unread ? `${unread} unread notifications` : "Notifications"
        }
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className={local.badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>
      {open && (
        <div className={local.panel} role="dialog" aria-label="Notifications">
          <div className={local.panelHead}>
            <b>Notifications</b>
            {unread > 0 && (
              <button
                type="button"
                className={local.markAll}
                onClick={() => void markAllRead()}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className={local.list}>
            {notes.length === 0 ? (
              <div className={local.empty}>No notifications yet.</div>
            ) : (
              notes.map((n) => (
                <button
                  type="button"
                  className={`${local.item}${n.read ? "" : ` ${local.unread}`}`}
                  key={n.id}
                  onClick={() => void openNote(n)}
                >
                  {!n.read && <span className={local.dot} aria-hidden="true" />}
                  <b>{titleOf(n)}</b>
                  <small>{describe(n)}</small>
                  <time>{timeAgo(n.createdAt)}</time>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
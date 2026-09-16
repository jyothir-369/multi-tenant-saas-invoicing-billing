"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import styles from "../../page.module.css";

const tabs = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

export default function InvoiceTabs({
  active,
  onChange,
  counts,
}: {
  active: string;
  onChange: (k: string) => void;
  counts: Record<string, number>;
}) {
  const [countsData, setCountsData] = useState<Record<string, number>>({
    all: 0, draft: 0, sent: 0, overdue: 0, paid: 0, void: 0,
  });

  useEffect(() => {
    api<Record<string, number>>("/invoices/tab-counts")
      .then((c) => setCountsData(c))
      .catch(() => {});
  }, []);

  const getCount = (key: string) => {
    if (counts && counts[key] !== undefined) return counts[key];
    return countsData[key] || 0;
  };

  return (
    <div className={styles.tabRow} role="tablist" aria-label="Invoice status tabs">
      {tabs.map((t) => {
        const isActive = active === t.key || (t.key === "all" && !active);
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={isActive ? styles.tabActive : styles.tab}
          >
            {t.label}
            <span className={styles.badge}>{getCount(t.key)}</span>
          </button>
        );
      })}
    </div>
  );
}

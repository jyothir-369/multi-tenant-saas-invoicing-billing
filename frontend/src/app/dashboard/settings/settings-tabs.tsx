"use client";
import { useState } from "react";
import styles from "../../page.module.css";

const tabs = [
  { key: "workspace", label: "Workspace" },
  { key: "account", label: "Account" },
  { key: "usage", label: "Usage" },
  { key: "audit", label: "Audit" },
];

export default function SettingsTabs({
  active,
  onChange,
}: {
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className={styles.tabRow} role="tablist" aria-label="Settings tabs">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={isActive ? styles.tabActive : styles.tab}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

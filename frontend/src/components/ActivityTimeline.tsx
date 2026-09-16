"use client";
import { useState } from "react";
import { formatMoney } from "../lib/api";
import { formatRelativeTime } from "./formatRelativeTime";

export type ActivityItem = { type: string; text: string; timestamp: string; icon?: string };

export default function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">No activity yet.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((a, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs shrink-0">
            {a.icon || "●"}
          </div>
          <div>
            <p className="text-sm">{a.text}</p>
            <p className="text-xs text-gray-400">{formatRelativeTime(new Date(a.timestamp))}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

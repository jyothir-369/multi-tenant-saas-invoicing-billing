import React from "react";

export default function LoadingSkeleton({
  rows = 3,
  height = "row",
}: {
  rows?: number;
  height?: "card" | "row" | "table" | "form";
}) {
  if (height === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e7ece9] rounded-xl p-5 shadow-sm">
            <div className="h-3 w-24 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded mb-3 animate-pulse" />
            <div className="h-8 w-28 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded mb-2 animate-pulse" />
            <div className="h-3 w-36 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (height === "table") {
    return (
      <div className="w-full">
        <div className="h-10 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded mb-2 animate-pulse" />
        {Array.from({ length: Math.min(rows, 8) }).map((_, i) => (
          <div key={i} className="h-12 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded mb-1 animate-pulse" />
        ))}
      </div>
    );
  }
  if (height === "form") {
    return (
      <div className="space-y-3 max-w-lg">
        {Array.from({ length: Math.max(rows, 3) }).map((_, i) => (
          <div key={i} className="h-10 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded animate-pulse" />
        ))}
      </div>
    );
  }
  // row
  return (
    <div className="space-y-2">
      {Array.from({ length: Math.max(rows, 2) }).map((_, i) => (
        <div key={i} className="h-12 bg-gradient-to-r from-[#f0f4f1] to-[#fafcfb] rounded animate-pulse" />
      ))}
    </div>
  );
}

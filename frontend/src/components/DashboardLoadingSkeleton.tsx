"use client";
export default function DashboardLoadingSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="h-8 w-48 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl bg-white border border-[#e7ece9] p-5 shadow-sm space-y-3">
            <div className="h-3 w-24 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
            <div className="h-7 w-32 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
            <div className="h-3 w-full rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-[#e7ece9] p-5 shadow-sm space-y-4">
          <div className="h-4 w-48 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
          {[1,2,3].map(i => (
            <div key={i} className="h-10 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
          ))}
        </div>
        <div className="rounded-xl bg-white border border-[#e7ece9] p-5 shadow-sm space-y-4">
          <div className="h-4 w-36 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
          {[1,2,3].map(i => (
            <div key={i} className="h-10 rounded bg-gradient-to-r from-[#f0f4f1] via-[#fafcfb] to-[#f0f4f1] bg-[length:200%_100%] animate-[shine_1.3s_infinite]" />
          ))}
        </div>
      </div>
    </div>
  );
}

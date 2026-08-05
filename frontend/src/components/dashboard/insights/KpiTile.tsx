// frontend/src/components/dashboard/insights/KpiTile.tsx

import React from "react";
import { useCountUp } from "../../../hooks/useCountUp";

export function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  const animated = useCountUp(value, 300);
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 flex items-center gap-2.5 shadow-sm">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${tone}18`, color: tone }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[15px] font-extrabold text-slate-800 tabular-nums leading-none">
          {animated.toLocaleString("en-IN")}
        </p>
        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

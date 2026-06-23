import { ReactNode } from "react";
import { motion } from "framer-motion";

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  sub?: string;
  variant: "blue" | "red" | "amber" | "teal" | "purple" | "green";
  loading?: boolean;
}

const colors = {
  blue: "bg-blue-50 text-blue-600",
  red: "bg-red-50 text-red-600",
  amber: "bg-amber-50 text-amber-600",
  teal: "bg-teal-50 text-teal-600",
  purple: "bg-purple-50 text-purple-600",
  green: "bg-green-50 text-green-600",
};

export const MetricCard = ({ icon, label, value, sub, variant, loading }: MetricCardProps) => {
  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors[variant]}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-semibold text-[#6B7299]">{label}</p>
          <p className="text-xl font-bold text-[#1A1D2E]">
            {loading ? "..." : value.toLocaleString("en-IN")}
          </p>
        </div>
      </div>
      {sub && <p className="mt-2 text-[10px] font-medium text-[#9BA3C2] truncate">{sub}</p>}
    </motion.div>
  );
};

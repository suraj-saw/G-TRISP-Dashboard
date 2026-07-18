/**
 * @file MonthlyTrend.tsx
 * @description Visualizes the macro trend of accidents over calendar months.
 * @responsibility Renders an AreaChart utilizing a subtle SVG gradient fill to communicate volume trends.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyAccidentCount } from "../../types/dashboard";

interface Props {
  data: MonthlyAccidentCount[];
}

/**
 * MonthlyTrend Component
 * @param {Object} props - Component properties.
 * @param {MonthlyAccidentCount[]} props.data - Pre-aggregated monthly accident counts.
 */
export default function MonthlyTrend({ data }: Props) {
  return (
    <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-[13px] font-bold text-slate-900">Monthly Trend</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Accident volume over calendar months</p>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 8 }}>
            <defs>
              <linearGradient id="monthlyTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14B8A6" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#14B8A6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F8" />
            <XAxis
              dataKey="month_label"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              interval="preserveStartEnd"
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{
                border: "1px solid #E4E8F4",
                borderRadius: 10,
                boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
              }}
            />
            <Area
              type="monotone"
              dataKey="count"
              name="Accidents"
              stroke="#0F766E"
              strokeWidth={2.5}
              fill="url(#monthlyTrendFill)"
              activeDot={{ r: 5, fill: "#0F766E", stroke: "#FFFFFF", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

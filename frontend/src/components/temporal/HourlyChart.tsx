import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyAccidentCount } from "../../types/dashboard";

interface Props {
  data: HourlyAccidentCount[];
}

const formatHour = (hour: number) => {
  const suffix = hour < 12 ? "AM" : "PM";
  const value = hour % 12 || 12;
  return `${value}${suffix}`;
};

export default function HourlyChart({ data }: Props) {
  const chartData = data.map((item) => ({
    ...item,
    label: formatHour(item.hour),
  }));

  return (
    <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-[13px] font-bold text-slate-900">Hourly Distribution</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Accidents across a 24-hour cycle</p>
      </div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F8" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              interval={2}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(44,110,242,0.08)" }}
              contentStyle={{
                border: "1px solid #E4E8F4",
                borderRadius: 10,
                boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
              }}
            />
            <Bar dataKey="count" name="Accidents" fill="#2C6EF2" radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

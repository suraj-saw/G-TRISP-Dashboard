import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TimeSeriesPoint } from "../../types/dashboard";

export const AccidentTrend = ({ data }: { data: TimeSeriesPoint[] }) => {
  if (!data || data.length === 0) return <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">No data available</div>;

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAccidents" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2C6EF2" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#2C6EF2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF0F8" />
          <XAxis dataKey="month_label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9BA3C2" }} minTickGap={30} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#9BA3C2" }} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: '1px solid #E4E8F4', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Area type="monotone" dataKey="accident_count" name="Accidents" stroke="#2C6EF2" strokeWidth={2} fillOpacity={1} fill="url(#colorAccidents)" />
          <Area type="monotone" dataKey="fatalities" name="Fatalities" stroke="#E85D4A" strokeWidth={2} fill="none" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

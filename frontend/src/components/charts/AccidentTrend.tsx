/**
 * @file AccidentTrend.tsx
 * @description Provides a time-series area chart visualizing the trend of accidents and fatalities over time.
 * @responsibility Renders an interactive `recharts` AreaChart mapping time points (months) to accident/fatality counts.
 * @dependencies recharts (charting library).
 */

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { TimeSeriesPoint } from "../../types/dashboard";

/**
 * AccidentTrend Component
 * @responsibility Displays an area chart for accident data trends.
 * @rendering_flow 
 * 1. Checks if `data` is empty or undefined, rendering a fallback UI if so.
 * 2. Uses `ResponsiveContainer` to adapt to parent width/height.
 * 3. Renders two `Area` overlays: one for general accidents (filled with gradient) and one for fatalities (outline only).
 * @param {Object} props - Component properties.
 * @param {TimeSeriesPoint[]} props.data - Array of time-series objects containing monthly accident and fatality metrics.
 * @returns {JSX.Element} The rendered chart or a fallback message.
 */
export const AccidentTrend = ({ data }: { data: TimeSeriesPoint[] }) => {
  // Edge case: Handle empty or missing dataset gracefully
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

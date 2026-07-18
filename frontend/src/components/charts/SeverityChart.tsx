/**
 * @file SeverityChart.tsx
 * @description Provides a donut/pie chart visualizing the distribution of accident severities.
 * @responsibility Renders a `recharts` PieChart showing the proportion of different accident severities.
 * @dependencies recharts (charting library).
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { SeverityCount } from "../../types/dashboard";

/** Defines a fixed color palette for up to 5 severity categories. */
const COLORS = ["#E85D4A", "#F5A623", "#2C6EF2", "#9BA3C2", "#10B981"];

/**
 * SeverityChart Component
 * @responsibility Displays a donut chart for accident severity breakdown.
 * @rendering_flow 
 * 1. Checks if `data` is empty or undefined, rendering a fallback UI if so.
 * 2. Uses `ResponsiveContainer` to adapt to parent width/height.
 * 3. Maps severity items to specific slice colors from the COLORS array.
 * @param {Object} props - Component properties.
 * @param {SeverityCount[]} props.data - Array of objects containing severity labels and their corresponding counts.
 * @returns {JSX.Element} The rendered chart or a fallback message.
 */
export const SeverityChart = ({ data }: { data: SeverityCount[] }) => {
  // Edge case: Handle empty or missing dataset gracefully
  if (!data || data.length === 0) return <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">No data available</div>;

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="count" nameKey="severity" stroke="none">
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', color: '#6B7299' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

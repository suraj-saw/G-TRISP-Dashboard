import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { SeverityCount } from "../../types/dashboard";

const COLORS = ["#E85D4A", "#F5A623", "#2C6EF2", "#9BA3C2", "#10B981"];

export const SeverityChart = ({ data }: { data: SeverityCount[] }) => {
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

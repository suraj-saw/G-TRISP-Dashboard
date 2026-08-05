// frontend/src/components/dashboard/statistical_analysis/common.tsx

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { AlertCircle } from "lucide-react";

// ─── Palette Constants ─────────────────────────────────────────────────────────

export const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#f59e0b",
  "Minor Injury Hospitalized": "#f59e0b",
  "Minor Injury Non Hospitalized": "#fbbf24",
  "Damage Only": "#94a3b8",
  "No Injury": "#64748b",
  Grievous: "#f97316",
  Minor: "#eab308",
};

export const CHART_BLUE = "#3b82f6";
export const CHART_TEAL = "#14b8a6";
export const CHART_INDIGO = "#6366f1";
export const CHART_PURPLE = "#a855f7";
export const MUTED = "#64748b";
export const GRID = "#cbd5e1";

export const INVOLVED_GRADIENT = ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"];

export const HOUR_LABELS = (h: number) => {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
};

// ─── Helper Types & Functions ─────────────────────────────────────────────────

export interface MetricDataPoint {
  label?: string;
  road_type?: string;
  count: number;
}

export interface ProcessedDataPoint {
  name: string;
  count: number;
}

/**
 * Utility to sort, limit, and aggregate categorical data for charts.
 */
export const getTopCategories = (
  data: MetricDataPoint[] | undefined,
  limit: number,
  key: "label" | "road_type" = "label"
): ProcessedDataPoint[] => {
  if (!data || data.length === 0) return [];

  const sorted = [...data].sort((a, b) => b.count - a.count);

  if (sorted.length <= limit) {
    return sorted.map((item) => ({
      name: item[key] || "Unknown",
      count: item.count,
    }));
  }

  const topItems = sorted.slice(0, limit).map((item) => ({
    name: item[key] || "Unknown",
    count: item.count,
  }));

  const othersCount = sorted
    .slice(limit)
    .reduce((sum, item) => sum + item.count, 0);

  if (othersCount > 0) {
    topItems.push({
      name: "Others",
      count: othersCount,
    });
  }

  return topItems;
};

// ─── Shared Sub-components ───────────────────────────────────────────────────

export const KpiCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}> = ({ label, value, sub, accent = "#3b82f6" }) => (
  <div className="kpi-card">
    <div className="kpi-label">{label}</div>
    <div className="kpi-value" style={{ color: accent }}>
      {value}
    </div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>
);

export const ChartCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <div className={`chart-card ${className}`}>
    <div className="chart-card-header">{title}</div>
    <div className="chart-card-body">{children}</div>
  </div>
);

export const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  
  const showTotal = payload.length > 1;
  const total = payload.reduce((sum, p) => sum + (Number(p.value) || 0), 0);

  return (
    <div className="custom-tooltip">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: showTotal ? '6px' : '0', borderBottom: showTotal ? '1px solid #e2e8f0' : 'none' }}>
        {label && <div className="ct-label" style={{ margin: 0, padding: 0 }}>{label}</div>}
        {showTotal && (
          <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#0f172a', marginLeft: '16px' }}>
            Total: {total.toLocaleString()}
          </div>
        )}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="ct-row">
          <span className="ct-dot" style={{ background: p.fill || p.color }} />
          <span className="ct-name">{p.name || p.dataKey}:</span>
          <span className="ct-val">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export const EmptyState: React.FC<{ message?: string }> = ({
  message = "No matching crash data isolated for the configured filters.",
}) => (
  <div className="stat-empty">
    <AlertCircle size={24} className="text-slate-400" />
    <p>{message}</p>
  </div>
);

export const HorizontalCategoryChartCard: React.FC<{
  title: string;
  data: ProcessedDataPoint[];
  fillColor: string;
  className?: string;
  yAxisWidth?: number;
  fullLabels?: boolean;
}> = ({ title, data, fillColor, className = "", yAxisWidth = 110, fullLabels = false }) => {
  if (!data || data.length === 0) {
    return (
      <ChartCard title={title} className={className}>
        <EmptyState />
      </ChartCard>
    );
  }

  return (
    <ChartCard title={title} className={className}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: fullLabels ? 45 : 10, left: 5, bottom: 5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid
            stroke={GRID}
            horizontal={false}
            strokeDasharray="3 3"
            opacity={0.4}
          />
          <XAxis
            type="number"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: MUTED, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={fullLabels ? 140 : yAxisWidth}
            interval={0}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            name="Accidents"
            fill={fillColor}
            radius={[0, 4, 4, 0]}
            barSize={16}
            isAnimationActive={!fullLabels}
          >
            {fullLabels && (
              <LabelList
                dataKey="count"
                position="right"
                style={{
                  fill: "#475569",
                  fontSize: 10,
                  fontWeight: 600,
                }}
                formatter={(val: any) => Number(val).toLocaleString()}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

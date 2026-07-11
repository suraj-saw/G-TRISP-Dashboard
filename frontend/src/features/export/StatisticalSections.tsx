import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";
import { ReportRegistry } from "./ReportRegistry";
import type { DistrictStats } from "../../api/gujaratDashboardApi";

// Colors
const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#f59e0b",
  "Damage Only": "#94a3b8",
  "No Injury": "#64748b",
  Grievous: "#f97316",
  Minor: "#eab308",
};

const CHART_BLUE = "#3b82f6";
const CHART_TEAL = "#14b8a6";
const MUTED = "#64748b";
const GRID = "#cbd5e1";

// Helpers
const getTopCategories = (data: any[] | undefined, limit: number, key: string = "label") => {
  if (!data || data.length === 0) return [];
  const sorted = [...data].sort((a, b) => b.count - a.count);
  if (sorted.length <= limit) {
    return sorted.map((item) => ({ name: item[key] || "Unknown", count: item.count }));
  }
  const topItems = sorted.slice(0, limit).map((item) => ({ name: item[key] || "Unknown", count: item.count }));
  const othersCount = sorted.slice(limit).reduce((sum, item) => sum + item.count, 0);
  if (othersCount > 0) topItems.push({ name: "Others", count: othersCount });
  return topItems;
};

// Generic Components
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent = "#3b82f6" }) => (
  <div style={{ flex: 1, padding: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
    <div style={{ fontSize: "12px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: "24px", fontWeight: "bold", color: accent, marginTop: "8px" }}>{value}</div>
  </div>
);

const HorizontalBarSection: React.FC<{ data: any; nameKey: string; fillColor: string }> = ({ data, nameKey, fillColor }) => {
    const chartData = getTopCategories(data, 10, nameKey);
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 40, left: 100, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 11 }} />
                    <Bar dataKey="count" fill={fillColor} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
                         <LabelList dataKey="count" position="right" style={{ fill: "#475569", fontSize: 10 }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// Sections
export const StatisticalKpiSection: React.FC<{ data: DistrictStats }> = ({ data }) => {
    return (
        <div style={{ display: "flex", gap: "16px", width: "100%" }}>
            <KpiCard label="Total Accidents" value={data?.total_accidents?.toLocaleString() || "0"} accent="#3b82f6" />
            <KpiCard label="Fatalities" value={data?.total_fatalities?.toLocaleString() || "0"} accent="#ef4444" />
            <KpiCard label="Injuries" value={data?.total_injuries?.toLocaleString() || "0"} accent="#f97316" />
        </div>
    );
};

export const SeveritySection: React.FC<{ data: DistrictStats }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
             <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.severity_breakdown || []}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {(data?.severity_breakdown || []).map((entry, i) => (
                        <Cell key={i} fill={SEVERITY_COLORS[entry.label] ?? "#64748b"} />
                      ))}
                    </Pie>
                    <Legend />
                  </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

// Registrations
ReportRegistry.register({
    id: "stat-kpi",
    title: "Executive Overview",
    group: "statistical",
    component: StatisticalKpiSection
});

ReportRegistry.register({
    id: "stat-severity",
    title: "Severity Distribution",
    group: "statistical",
    component: SeveritySection
});

ReportRegistry.register({
    id: "stat-road",
    title: "Road Classification",
    group: "statistical",
    component: ({ data }) => <HorizontalBarSection data={data?.road_type_breakdown} nameKey="road_type" fillColor={CHART_BLUE} />
});

ReportRegistry.register({
    id: "stat-collision",
    title: "Collision Types",
    group: "statistical",
    component: ({ data }) => <HorizontalBarSection data={data?.collision_type_breakdown} nameKey="label" fillColor={CHART_TEAL} />
});

ReportRegistry.register({
    id: "stat-vehicle",
    title: "Vehicle Involvement",
    group: "statistical",
    component: ({ data }) => <HorizontalBarSection data={data?.vehicle_involvement_breakdown} nameKey="label" fillColor="#f59e0b" />
});

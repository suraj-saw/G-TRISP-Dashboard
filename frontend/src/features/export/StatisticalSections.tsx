/**
 * @file StatisticalSections.tsx
 * @description Defines reusable React components and Recharts visualizations for 
 * statistical analysis of road accidents. These components are registered into the
 * ReportRegistry for use in both web dashboard views and PDF generation.
 * 
 * Main Responsibilities:
 * - Provide standalone chart components for KPIs, Severities, Vehicles, etc.
 * - Map accident data to Recharts compatible formats.
 * - Enforce consistent styling and color palettes across statistical charts.
 * 
 * Important Dependencies:
 * - recharts: Used for rendering SVG-based charts.
 * - ReportRegistry: Global registry to expose these sections to the PDF generator.
 */

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

const INVOLVED_GRADIENT = ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"];

const CHART_BLUE = "#3b82f6";
const CHART_TEAL = "#14b8a6";
const CHART_INDIGO = "#6366f1";
const CHART_PURPLE = "#a855f7";
const MUTED = "#64748b";
const GRID = "#cbd5e1";

// Helpers

/**
 * Truncates and sorts categorical data to find the top 'N' categories by count,
 * grouping the remainder into an "Others" category.
 * 
 * Why this logic exists: 
 * Prevents pie and bar charts from becoming unreadable when there is a long tail
 * of categories with very few counts (e.g., rare vehicle types or minor road names).
 * 
 * @param data - The raw array of categorical data items.
 * @param limit - Maximum number of distinct categories to display before grouping.
 * @param key - The object key representing the category label (default: 'label').
 * @returns Array of formatted items ready for Recharts ingestion.
 */
const getTopCategories = (
  data: any[] | undefined,
  limit: number,
  key: string = "label"
) => {
  if (!data || data.length === 0) return [];
  const sorted = [...data].sort((a, b) => b.count - a.count);
  if (sorted.length <= limit) {
    return sorted.map((item) => ({
      name: item[key] || "Unknown",
      count: item.count,
    }));
  }
  const topItems = sorted
    .slice(0, limit)
    .map((item) => ({ name: item[key] || "Unknown", count: item.count }));
  const othersCount = sorted
    .slice(limit)
    .reduce((sum, item) => sum + item.count, 0);
  if (othersCount > 0) topItems.push({ name: "Others", count: othersCount });
  return topItems;
};

// Generic Components

/**
 * A highly reusable Key Performance Indicator (KPI) card component.
 * 
 * @param label - The title of the KPI (e.g., 'Total Accidents').
 * @param value - The numerical or string value to display.
 * @param accent - Optional hex color code for the value text (default: primary blue).
 */
const KpiCard: React.FC<{
  label: string;
  value: string | number;
  accent?: string;
}> = ({ label, value, accent = "#3b82f6" }) => (
  <div
    style={{
      flex: 1,
      padding: "20px",
      borderRadius: "8px",
      background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    }}
  >
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "#475569",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: "28px",
        fontWeight: 800,
        color: accent,
        marginTop: "10px",
      }}
    >
      {value}
    </div>
  </div>
);

/**
 * Standardized wrapper for Recharts components to enforce uniform 
 * padding, borders, shadows, and background colors across the report.
 */
const ChartContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div
    style={{
      width: "100%",
      padding: "20px",
      background: "#ffffff",
      borderRadius: "8px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      border: "1px solid #e2e8f0",
    }}
  >
    {children}
  </div>
);

/**
 * Reusable horizontal bar chart component designed for categorical data.
 * Internally uses `getTopCategories` to cap the number of bars.
 * 
 * @param data - Raw data array from the API.
 * @param nameKey - The object key used for the Y-Axis labels.
 * @param fillColor - Hex color code for the bars.
 */
const HorizontalBarSection: React.FC<{
  data: any;
  nameKey: string;
  fillColor: string;
}> = ({ data, nameKey, fillColor }) => {
  const chartData = getTopCategories(data, 10, nameKey);
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "450px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              horizontal={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis
              dataKey="name"
              type="category"
              width={150}
              tick={{ fill: MUTED, fontSize: 11 }}
            />
            <Bar
              dataKey="count"
              fill={fillColor}
              radius={[0, 4, 4, 0]}
              barSize={14}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="count"
                position="right"
                style={{ fill: "#475569", fontSize: 10, fontWeight: 600 }}
                formatter={(val: any) => Number(val).toLocaleString()}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

// Sections

/**
 * Renders the top-level executive KPIs: Total Accidents, Fatalities, and Injuries.
 * Used as the primary summary section in reports.
 * 
 * Component Responsibility: Display high-level aggregates.
 */
export const StatisticalKpiSection: React.FC<{ data: DistrictStats }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ display: "flex", gap: "16px", width: "100%" }}>
        <KpiCard
          label="Total Accidents"
          value={data?.total_accidents?.toLocaleString() || "0"}
          accent="#3b82f6"
        />
        <KpiCard
          label="Fatalities"
          value={data?.total_fatalities?.toLocaleString() || "0"}
          accent="#ef4444"
        />
        <KpiCard
          label="Injuries"
          value={data?.total_injuries?.toLocaleString() || "0"}
          accent="#f97316"
        />
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a Pie chart illustrating the breakdown of accident severity
 * (e.g., Fatal, Grievous Injury, Minor Injury).
 * 
 * Component Responsibility: Show proportional impact of accident severities.
 * Uses `SEVERITY_COLORS` mapping to maintain visual consistency for severity levels.
 */
export const SeveritySection: React.FC<{ data: DistrictStats }> = ({
  data,
}) => {
  return (
    <ChartContainer>
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
              outerRadius={80}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {(data?.severity_breakdown || []).map((entry, i) => (
                <Cell
                  key={i}
                  fill={SEVERITY_COLORS[entry.label] ?? "#64748b"}
                />
              ))}
            </Pie>
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a vertical Bar chart showing the types of vehicles involved in accidents.
 * 
 * Uses a predefined gradient array (`INVOLVED_GRADIENT`) to cycle bar colors.
 */
export const VehicleInvolvedSection: React.FC<{ data: DistrictStats }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.vehicle_involvement_breakdown || []}
            margin={{ top: 20, right: 15, left: -15, bottom: 5 }}
            barCategoryGap="30%"
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Bar
              dataKey="count"
              name="Accidents"
              radius={[4, 4, 0, 0]}
              barSize={36}
              isAnimationActive={false}
            >
              {(data?.vehicle_involvement_breakdown || []).map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={INVOLVED_GRADIENT[index % INVOLVED_GRADIENT.length]}
                />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                style={{ fill: "#475569", fontSize: 10, fontWeight: 600 }}
                formatter={(val: any) => Number(val).toLocaleString()}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a stacked Bar chart breaking down victim composition by severity.
 * 
 * Data Flow: Expects data structured with categories (e.g., victim type) on the X-axis
 * and stacked sub-bars for 'Killed', 'Grievous Injury', and 'Minor Injury'.
 */
export const VictimCompositionSection: React.FC<{ data: DistrictStats }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "320px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.victim_composition || []}
            margin={{ top: 20, right: 20, left: -10, bottom: 5 }}
            barGap={8}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis
              dataKey="type"
              tick={{ fill: MUTED, fontSize: 12, fontWeight: 600 }}
            />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Legend
              wrapperStyle={{ fontSize: 12, color: MUTED, paddingTop: "12px" }}
              iconType="circle"
              iconSize={10}
            />
            <Bar
              dataKey="Killed"
              name="Fatal (Killed)"
              stackId="a"
              fill={SEVERITY_COLORS["Fatal"]}
              barSize={45}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Grievous Injury"
              name="Grievous Injury"
              stackId="a"
              fill={SEVERITY_COLORS["Grievous Injury"]}
              barSize={45}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Minor Injury"
              name="Minor Injury"
              stackId="a"
              fill={SEVERITY_COLORS["Minor Injury"]}
              radius={[4, 4, 0, 0]}
              barSize={45}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

// Registrations
// The following block registers each statistical component into the global ReportRegistry.
// This allows the PdfReportGenerator to dynamically loop through and render these sections
// without tightly coupling the generator to the specific chart implementations.

ReportRegistry.register({
  id: "stat-kpi",
  title: "Executive Overview",
  group: "statistical",
  component: StatisticalKpiSection,
});

ReportRegistry.register({
  id: "stat-severity",
  title: "Severity Distribution",
  group: "statistical",
  component: SeveritySection,
});

ReportRegistry.register({
  id: "stat-road",
  title: "Road Classification",
  group: "statistical",
  component: ({ data }) => (
    <HorizontalBarSection
      data={data?.road_type_breakdown}
      nameKey="road_type"
      fillColor="rgba(168, 85, 247, 0.75)"
    />
  ),
});

ReportRegistry.register({
  id: "stat-collision",
  title: "Collision Type Distribution",
  group: "statistical",
  component: ({ data }) => (
    <HorizontalBarSection
      data={data?.collision_type_breakdown}
      nameKey="label"
      fillColor={CHART_TEAL}
    />
  ),
});

ReportRegistry.register({
  id: "stat-vehicle",
  title: "Vehicles Involved",
  group: "statistical",
  component: VehicleInvolvedSection,
});

ReportRegistry.register({
  id: "stat-victim",
  title: "Victim Composition",
  group: "statistical",
  component: VictimCompositionSection,
});

ReportRegistry.register({
  id: "stat-weather",
  title: "Weather Condition Breakdown",
  group: "statistical",
  component: ({ data }) => (
    <HorizontalBarSection
      data={data?.weather_breakdown}
      nameKey="label"
      fillColor={CHART_BLUE}
    />
  ),
});

ReportRegistry.register({
  id: "stat-light",
  title: "Light Condition Analysis",
  group: "statistical",
  component: ({ data }) => (
    <HorizontalBarSection
      data={data?.light_breakdown}
      nameKey="label"
      fillColor={CHART_PURPLE}
    />
  ),
});

ReportRegistry.register({
  id: "stat-collision-nature",
  title: "Collision Nature Analysis",
  group: "statistical",
  component: ({ data }) => (
    <HorizontalBarSection
      data={data?.collision_nature_breakdown}
      nameKey="label"
      fillColor={CHART_INDIGO}
    />
  ),
});

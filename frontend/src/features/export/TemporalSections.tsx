/**
 * @file TemporalSections.tsx
 * @description Defines reusable React components and Recharts visualizations for 
 * temporal (time-based) analysis of road accidents. These components are registered 
 * into the ReportRegistry for use in both web dashboard views and PDF generation.
 * 
 * Main Responsibilities:
 * - Provide standalone chart components for Temporal KPIs, Hourly/Monthly trends, etc.
 * - Map accident data to Recharts compatible formats.
 * - Enforce consistent styling, grid layouts, and color palettes across temporal charts.
 * 
 * Important Dependencies:
 * - recharts: Core library for rendering SVG-based charts.
 * - ReportRegistry: Global registry exposing these sections to the PDF generator.
 */

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ReportRegistry } from "./ReportRegistry";
import type { TemporalAnalysisData } from "../../types/dashboard";

const GRID = "#cbd5e1";
const MUTED = "#64748b";
const CHART_BLUE = "#3b82f6";
const CHART_TEAL = "#14b8a6";
const CHART_INDIGO = "#6366f1";
const CHART_PURPLE = "#a855f7";

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#f59e0b",
  "Damage Only": "#94a3b8",
};

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

// Generic Kpi

/**
 * A highly reusable Key Performance Indicator (KPI) card component.
 * Used identically across both statistical and temporal dashboards.
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
        fontSize: "26px",
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
 * Renders the top-level temporal KPIs: Total Accidents, Peak Month, Peak Day, and Peak Hour.
 * 
 * Component Responsibility: Display high-level time-based aggregates.
 */
export const TemporalKpiSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ display: "flex", gap: "16px", width: "100%" }}>
        <KpiCard
          label="Total Accidents"
          value={data?.summary?.total_accidents?.toLocaleString() || "0"}
          accent="#3b82f6"
        />
        <KpiCard
          label="Peak Month"
          value={data?.summary?.peak_month || "N/A"}
          accent="#ef4444"
        />
        <KpiCard
          label="Peak Day"
          value={data?.summary?.peak_day || "N/A"}
          accent="#f97316"
        />
        <KpiCard
          label="Peak Hour"
          value={data?.summary?.peak_hour || "N/A"}
          accent="#a855f7"
        />
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a Bar chart displaying the distribution of accidents by hour of the day.
 * 
 * Component Responsibility: Visualize peak hours and daily patterns.
 */
export const HourlyTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.hourly || []}
            margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="hour" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Bar
              dataKey="count"
              fill={CHART_TEAL}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
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
 * Renders a Line chart illustrating the trend of accidents across different months.
 * 
 * Component Responsibility: Highlight seasonal or monthly variations across the year.
 */
export const MonthlyTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data?.monthly || []}
            margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="month_label" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="count"
              stroke={CHART_INDIGO}
              strokeWidth={3}
              isAnimationActive={false}
              dot={{ r: 4, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a Bar chart breaking down accidents by the day of the week.
 * 
 * Component Responsibility: Show which days (e.g., weekends vs weekdays) have higher accident frequencies.
 */
export const DayOfWeekSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.day_of_week_distribution || []}
            margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Bar
              dataKey="count"
              fill={CHART_BLUE}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
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
 * Renders a horizontal Bar chart grouping accidents by categorical time periods
 * (e.g., Morning, Afternoon, Evening, Night).
 * 
 * Component Responsibility: Provide a broader time-of-day perspective compared to strict hourly trends.
 */
export const TimePeriodSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "450px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.time_period_distribution || []}
            layout="vertical"
            margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              horizontal={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis
              dataKey="period"
              type="category"
              width={150}
              tick={{ fill: MUTED, fontSize: 11 }}
            />
            <Bar
              dataKey="count"
              fill={CHART_INDIGO}
              radius={[0, 4, 4, 0]}
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

/**
 * Renders a Bar chart illustrating the overall seasonality by aggregating all historical data
 * across the 12 calendar months.
 * 
 * Component Responsibility: Identify months that consistently exhibit higher accident rates.
 */
export const MonthlySeasonalitySection: React.FC<{
  data: TemporalAnalysisData;
}> = ({ data }) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.monthly_seasonality || []}
            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Bar
              dataKey="count"
              fill={CHART_TEAL}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
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
 * Renders a Line chart showing the year-over-year trend of total accidents.
 * 
 * Component Responsibility: Track long-term growth or decline in accident rates.
 */
export const AnnualTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({
  data,
}) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data?.annual_trend || []}
            margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="year" tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="count"
              stroke={CHART_PURPLE}
              strokeWidth={3}
              isAnimationActive={false}
              dot={{ r: 4, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

/**
 * Renders a Pie chart comparing the total volume of accidents on Weekends vs Weekdays.
 */
export const WeekendWeekdaySection: React.FC<{
  data: TemporalAnalysisData;
}> = ({ data }) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data?.weekend_vs_weekday || []}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={80}
              isAnimationActive={false}
            >
              {(data?.weekend_vs_weekday || []).map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 0 ? CHART_BLUE : CHART_TEAL}
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
 * Renders a stacked Bar chart analyzing the severity of accidents on an hourly basis.
 * 
 * Data Flow: Expects categorical data on the X-axis (hour label) with stacked
 * metrics for each severity level (Fatal, Grievous, Minor, Damage Only).
 */
export const FatalityByHourSection: React.FC<{
  data: TemporalAnalysisData;
}> = ({ data }) => {
  return (
    <ChartContainer>
      <div style={{ width: "100%", height: "300px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data?.severity_by_hour || []}
            margin={{ top: 20, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid
              stroke={GRID}
              vertical={false}
              strokeDasharray="3 3"
              opacity={0.4}
            />
            <XAxis dataKey="hour_label" tick={{ fill: MUTED, fontSize: 10 }} />
            <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />
            <Bar
              dataKey="Fatal"
              stackId="a"
              fill={SEVERITY_COLORS["Fatal"]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Grievous Injury"
              stackId="a"
              fill={SEVERITY_COLORS["Grievous Injury"]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Minor Injury"
              stackId="a"
              fill={SEVERITY_COLORS["Minor Injury"]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="Damage Only"
              stackId="a"
              fill={SEVERITY_COLORS["Damage Only"]}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
};

// Registrations
// The following block registers each temporal component into the global ReportRegistry.
// This allows the PdfReportGenerator to dynamically loop through and render these sections
// without tightly coupling the generator to the specific chart implementations.

ReportRegistry.register({
  id: "temp-kpi",
  title: "Temporal Overview",
  group: "temporal",
  component: TemporalKpiSection,
});

ReportRegistry.register({
  id: "temp-hourly",
  title: "Hourly Distribution",
  group: "temporal",
  component: HourlyTrendSection,
});

ReportRegistry.register({
  id: "temp-dayofweek",
  title: "Day of Week Distribution",
  group: "temporal",
  component: DayOfWeekSection,
});

ReportRegistry.register({
  id: "temp-monthly",
  title: "Monthly Trend",
  group: "temporal",
  component: MonthlyTrendSection,
});

ReportRegistry.register({
  id: "temp-timeperiod",
  title: "Time Period Distribution",
  group: "temporal",
  component: TimePeriodSection,
});

ReportRegistry.register({
  id: "temp-seasonality",
  title: "Monthly Seasonality",
  group: "temporal",
  component: MonthlySeasonalitySection,
});

ReportRegistry.register({
  id: "temp-annual",
  title: "Annual Trend",
  group: "temporal",
  component: AnnualTrendSection,
});

ReportRegistry.register({
  id: "temp-weekend",
  title: "Weekend vs Weekday",
  group: "temporal",
  component: WeekendWeekdaySection,
});

ReportRegistry.register({
  id: "temp-fatality",
  title: "Fatality by Hour",
  group: "temporal",
  component: FatalityByHourSection,
});

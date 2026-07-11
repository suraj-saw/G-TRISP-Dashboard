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

// Generic Kpi
const KpiCard: React.FC<{ label: string; value: string | number; accent?: string }> = ({ label, value, accent = "#3b82f6" }) => (
  <div style={{ flex: 1, padding: "16px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
    <div style={{ fontSize: "12px", fontWeight: "bold", color: "#64748b", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: "24px", fontWeight: "bold", color: accent, marginTop: "8px" }}>{value}</div>
  </div>
);

export const TemporalKpiSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ display: "flex", gap: "16px", width: "100%" }}>
            <KpiCard label="Total Accidents" value={data?.summary?.total_accidents?.toLocaleString() || "0"} accent="#3b82f6" />
            <KpiCard label="Peak Month" value={data?.summary?.peak_month || "N/A"} accent="#ef4444" />
            <KpiCard label="Peak Day" value={data?.summary?.peak_day || "N/A"} accent="#f97316" />
            <KpiCard label="Peak Hour" value={data?.summary?.peak_hour || "N/A"} accent="#a855f7" />
        </div>
    );
};

export const HourlyTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.hourly || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="hour" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Bar dataKey="count" fill={CHART_TEAL} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="count" position="top" style={{ fill: "#475569", fontSize: 10 }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const MonthlyTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.monthly || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="month_label" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Line type="monotone" dataKey="count" stroke={CHART_INDIGO} strokeWidth={3} isAnimationActive={false} dot={{ r: 4, strokeWidth: 2 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export const DayOfWeekSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.day_of_week_distribution || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Bar dataKey="count" fill={CHART_BLUE} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                        <LabelList dataKey="count" position="top" style={{ fill: "#475569", fontSize: 10 }} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export const AnnualTrendSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.annual_trend || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="year" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Line type="monotone" dataKey="count" stroke={CHART_PURPLE} strokeWidth={3} isAnimationActive={false} dot={{ r: 4, strokeWidth: 2 }} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export const FatalityByHourSection: React.FC<{ data: TemporalAnalysisData }> = ({ data }) => {
    return (
        <div style={{ width: "100%", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.severity_by_hour || []} margin={{ top: 20, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                    <XAxis dataKey="hour_label" tick={{ fill: MUTED, fontSize: 10 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />
                    <Bar dataKey="Fatal" stackId="a" fill={SEVERITY_COLORS["Fatal"]} isAnimationActive={false} />
                    <Bar dataKey="Grievous Injury" stackId="a" fill={SEVERITY_COLORS["Grievous Injury"]} isAnimationActive={false} />
                    <Bar dataKey="Minor Injury" stackId="a" fill={SEVERITY_COLORS["Minor Injury"]} isAnimationActive={false} />
                    <Bar dataKey="Damage Only" stackId="a" fill={SEVERITY_COLORS["Damage Only"]} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

ReportRegistry.register({
    id: "temp-kpi",
    title: "Temporal Overview",
    group: "temporal",
    component: TemporalKpiSection
});

ReportRegistry.register({
    id: "temp-hourly",
    title: "Hourly Distribution",
    group: "temporal",
    component: HourlyTrendSection
});

ReportRegistry.register({
    id: "temp-dayofweek",
    title: "Day of Week Distribution",
    group: "temporal",
    component: DayOfWeekSection
});

ReportRegistry.register({
    id: "temp-monthly",
    title: "Monthly Trend",
    group: "temporal",
    component: MonthlyTrendSection
});

ReportRegistry.register({
    id: "temp-annual",
    title: "Annual Trend",
    group: "temporal",
    component: AnnualTrendSection
});

ReportRegistry.register({
    id: "temp-fatality",
    title: "Fatality by Hour",
    group: "temporal",
    component: FatalityByHourSection
});

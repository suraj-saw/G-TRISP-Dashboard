/**
 * @file TemporalAnalysis.tsx
 * @description The primary dashboard view for analyzing time-based accident patterns (hourly, daily, monthly trends).
 * @responsibility Fetches temporal analytics via `dashboardApi`, manages local loading/error states, orchestrates the export capability, and renders a comprehensive layout of KPI cards and varied Recharts components.
 * @dependencies recharts (charting), lucide-react (icons), ExportContext (CSV/Excel downloads).
 */
import { useEffect, useState, useMemo } from "react";
import { AlertCircle, CalendarDays, Clock3, Loader2, Moon, Timer } from "lucide-react";
import { fetchTemporalAnalysis } from "../../api/dashboardApi";
import type { DashboardFilters, TemporalAnalysisData } from "../../types/dashboard";
import HourDayHeatmap from "./HourDayHeatmap";
import HourlyChart from "./HourlyChart";
import MonthlyTrend from "./MonthlyTrend";
import { useExportContext } from "../../context/ExportContext";
import { downloadGujaratExport } from "../../api/exportApi";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  Area,
} from "recharts";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<TemporalAnalysisData>;
  onDataLoaded?: () => void;
}

const emptyTemporalData: TemporalAnalysisData = {
  hour_day: [],
  hourly: [],
  monthly: [],
  summary: {
    peak_hour: "Unknown",
    peak_hour_count: 0,
    peak_day: "Unknown",
    peak_day_count: 0,
    peak_month: "Unknown",
    peak_month_count: 0,
    peak_time_period: "Unknown",
    peak_time_period_count: 0,
    total_accidents: 0,
  },
};

/**
 * Maps the raw temporal summary data into an array of structured objects for the KPI cards.
 * @param {TemporalAnalysisData} data - The aggregated temporal data payload.
 */
const cards = (data: TemporalAnalysisData) => [
  {
    label: "Total accidents",
    value: data.summary.total_accidents.toLocaleString("en-IN"),
    sub: "Records matching filters",
    icon: Timer,
    tone: "blue",
  },
  {
    label: "Peak hour",
    value: data.summary.peak_hour,
    sub: `${data.summary.peak_hour_count.toLocaleString("en-IN")} accidents`,
    icon: Clock3,
    tone: "amber",
  },
  {
    label: "Peak day",
    value: data.summary.peak_day,
    sub: `${data.summary.peak_day_count.toLocaleString("en-IN")} accidents`,
    icon: CalendarDays,
    tone: "teal",
  },
  {
    label: "Peak period",
    value: data.summary.peak_time_period,
    sub: `${data.summary.peak_time_period_count.toLocaleString("en-IN")} accidents`,
    icon: Moon,
    tone: "red",
  },
];

const toneClass = {
  blue: "from-[#2C6EF2] to-[#1E3A8A]",
  amber: "from-[#F59E0B] to-[#B45309]",
  teal: "from-[#14B8A6] to-[#0F766E]",
  red: "from-[#EF4444] to-[#991B1B]",
};

const CHART_BLUE = "#3b82f6";
const CHART_TEAL = "#14b8a6";
const CHART_INDIGO = "#6366f1";
const CHART_PURPLE = "#a855f7";
const MUTED = "#6b7299";
const GRID = "#e8ecf5";
const SEVERITY_COLORS: Record<string, string> = {
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

/**
 * Custom tooltip renderer for Recharts, ensuring consistent styling across the temporal bar/line/pie charts.
 * @param {Object} props - Standard Recharts tooltip props.
 */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  
  const showTotal = payload.length > 1;
  const total = payload.reduce((sum: number, p: any) => sum + (Number(p.value) || 0), 0);

  return (
    <div className="bg-white border border-slate-200 rounded-md p-2 shadow-lg text-xs">
      <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-slate-100">
        {label && <div className="text-slate-500 font-semibold uppercase tracking-wider">{label}</div>}
        {showTotal && (
          <div className="font-bold text-slate-800 ml-4 text-[11px]">
            Total: {total.toLocaleString()}
          </div>
        )}
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold">{Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * TemporalAnalysis Component
 * @responsibility Fetches data whenever global filters change, registers its state with the top-level Export button, and renders a grid of temporal insights (Heatmap, Bar, Line, Pie).
 * @state_management Maintains `data` (the fetched TemporalAnalysisData), `loading` boolean, and `error` string.
 * @hooks_usage Uses `useEffect` for data fetching (with an `active` flag to prevent state updates if the component unmounts during fetch) and `useExportContext` to register the PDF/CSV export handler.
 * @param {Object} props - Component properties.
 * @param {DashboardFilters} props.filters - Global dashboard filters to apply to the data request.
 * @param {Function} [props.fetchFn] - Optional override for the data fetching function (useful for testing or specialized views).
 */
export default function TemporalAnalysis({ filters, fetchFn, onDataLoaded }: Props) {
  const [data, setData] = useState<TemporalAnalysisData>(emptyTemporalData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Data fetching effect triggered by any change in the `filters` dependency array. */
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loader = fetchFn ?? fetchTemporalAnalysis;

    loader(filters)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        if (active)
          setError(err.message || "Failed to load temporal analysis.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          if (onDataLoaded) onDataLoaded();
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.district,
    filters.year,
    filters.month,
    filters.day,
    filters.time_period,
    filters.severity,
    filters.weather_condition,
    filters.light_condition,
    filters.date_from,
    filters.date_to,
    filters.taluka,
    filters.police_station,
    filters.road_classification,
    filters.collision_type,
  ]);

  // ── Export handler registration ──────────────────────────────────────────
  const { registerExportHandler } = useExportContext();

  useEffect(() => {
    // Extract district name from filters (stored as array, use first element)
    const district = Array.isArray(filters.district)
      ? (filters.district[0] ?? "")
      : (filters.district ?? "");

    if (!district) return;

    registerExportHandler({
      supportedFormats: ["csv", "excel"],
      onExport: async (format) => {
        if (format === "csv" || format === "excel") {
          await downloadGujaratExport(filters, format, district);
        }
      },
    });
    return () => { registerExportHandler(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.district,
    filters.year,
    filters.month,
    filters.day,
    filters.time_period,
    filters.severity,
    filters.weather_condition,
    filters.light_condition,
    filters.date_from,
    filters.date_to,
  ]);

  const severityByWeekendWeekday = useMemo(() => {
    if (!data.severity_by_weekend_weekday) return [];
    return data.severity_by_weekend_weekday.map((item: any) => {
      const fatal = item["Fatal"] || 0;
      const grievous = item["Grievous Injury"] || 0;
      let other = 0;
      Object.keys(item).forEach(key => {
        if (key !== "label" && key !== "Fatal" && key !== "Grievous Injury") {
          other += Number(item[key]) || 0;
        }
      });
      return {
        label: item.label,
        "Fatal": fatal,
        "Grievous Injury": grievous,
        "Other": other
      };
    });
  }, [data.severity_by_weekend_weekday]);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-130px)] items-center justify-center rounded-2xl border border-[#E4E8F4] bg-white shadow-sm">
        <div className="flex flex-col items-center">
          <Loader2 size={34} className="mb-3 animate-spin text-[#2C6EF2]" />
          <p className="text-sm font-semibold text-slate-500">Loading temporal analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-130px)] items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-700">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle size={16} />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-130px)] space-y-4 pb-10 p-4">

      {/* ── Key Insights Panel ── */}
      {/* {data.temporal_insights && data.temporal_insights.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-2 uppercase tracking-wide">Key Temporal Insights</h3>
          <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
            {data.temporal_insights.map((insight, idx) => (
              <li key={idx}>{insight}</li>
            ))}
          </ul>
        </div>
      )} */}

      {/* <div className="rounded-2xl border border-[#E4E8F4] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[18px] font-bold text-slate-900">Temporal Analysis</p>
            <p className="mt-1 text-[12px] text-slate-500">
              Accident timing patterns from date and time records
            </p>
          </div>
          <div className="rounded-lg border border-[#E4E8F4] bg-[#F7F9FD] px-3 py-2 text-[11px] font-semibold text-slate-500">
            Peak month: <span className="text-slate-900">{data.summary.peak_month}</span>
          </div>
        </div>
      </div> */}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards(data).map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
                  <p className="mt-2 text-[20px] font-bold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{card.sub}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${toneClass[card.tone as keyof typeof toneClass]}`}>
                  <Icon size={18} className="text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour vs Day Heatmap */}
      <HourDayHeatmap data={data.hour_day} />

      {/* Hourly & Monthly (Existing) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HourlyChart data={data.hourly} />
        <MonthlyTrend data={data.monthly} />
      </div>

      {/* New Temporal Charts Row 1 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Day of Week Distribution</p>
          {data.day_of_week_distribution && data.day_of_week_distribution.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.day_of_week_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="Accidents" stroke={CHART_BLUE} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>

        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Time Period Distribution</p>
          {data.time_period_distribution && data.time_period_distribution.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.time_period_distribution} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="period" type="category" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Accidents" fill={CHART_INDIGO} radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* New Temporal Charts Row 2 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Monthly Seasonality</p>
          {data.monthly_seasonality && data.monthly_seasonality.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.monthly_seasonality} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="Accidents" stroke={CHART_TEAL} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>

        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Annual Trend</p>
          {data.annual_trend && data.annual_trend.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.annual_trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="count" name="Accidents" stroke={CHART_PURPLE} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* New Temporal Charts Row 3 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Severity on Weekend vs Weekday</p>
          {data.severity_by_weekend_weekday && data.severity_by_weekend_weekday.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityByWeekendWeekday} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0, 0, 0, 0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: MUTED, paddingTop: '10px' }} />
                  <Bar dataKey="Fatal" stackId="a" fill={SEVERITY_COLORS["Fatal"]} />
                  <Bar dataKey="Grievous Injury" stackId="a" fill={SEVERITY_COLORS["Grievous Injury"]} />
                  <Bar dataKey="Other" stackId="a" fill="#cbd5e1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>

        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Fatality by Hour</p>
          {data.severity_by_hour && data.severity_by_hour.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.severity_by_hour} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="hour_label" tick={{ fill: MUTED, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0, 0, 0, 0.04)" }} />
                  <Legend wrapperStyle={{ fontSize: 10, color: MUTED, paddingTop: '10px' }} />
                  <Bar dataKey="Fatal" stackId="a" fill={SEVERITY_COLORS["Fatal"]} />
                  <Bar dataKey="Grievous Injury" stackId="a" fill={SEVERITY_COLORS["Grievous Injury"]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>
      </div>

      {/* New Temporal Charts Row 4 */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Accident Severity by Time Period</p>
          {data.time_severity_matrix && data.time_severity_matrix.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.time_severity_matrix} layout="vertical" margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} vertical={true} strokeDasharray="3 3" opacity={0.4} />
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: MUTED, paddingTop: '10px' }} iconType="circle" iconSize={8} />
                  <Bar dataKey="Fatal" stackId="a" fill={SEVERITY_COLORS["Fatal"]} maxBarSize={24} />
                  <Bar dataKey="Grievous Injury" stackId="a" fill={SEVERITY_COLORS["Grievous Injury"]} maxBarSize={24} />
                  <Bar dataKey="Minor Injury Hospitalized" stackId="a" fill={SEVERITY_COLORS["Minor Injury Hospitalized"]} maxBarSize={24} />
                  <Bar dataKey="Minor Injury Non Hospitalized" stackId="a" fill={SEVERITY_COLORS["Minor Injury Non Hospitalized"]} maxBarSize={24} />
                  <Bar dataKey="No Injury" stackId="a" fill={SEVERITY_COLORS["No Injury"]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>

        <div className="rounded-xl border border-[#E4E8F4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Monthly Fatality Rate</p>
          {data.monthly_fatality_rate && data.monthly_fatality_rate.length > 0 ? (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.monthly_fatality_rate} margin={{ top: 10, right: 30, left: -10, bottom: 20 }}>
                  <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="3 3" opacity={0.4} />
                  <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={20} angle={-45} textAnchor="end" height={40} />
                  <YAxis yAxisId="left" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: MUTED, paddingTop: '10px' }} iconType="circle" iconSize={8} />
                  <Area yAxisId="left" type="monotone" dataKey="total" name="Total Accidents" fill={CHART_BLUE} stroke={CHART_BLUE} fillOpacity={0.15} strokeWidth={2} />
                  <Area yAxisId="left" type="monotone" dataKey="fatalities" name="Fatal Accidents" fill={SEVERITY_COLORS["Fatal"]} stroke={SEVERITY_COLORS["Fatal"]} fillOpacity={0.8} strokeWidth={2} />
                  <Line yAxisId="right" type="monotone" dataKey="fatality_rate" name="Fatality Rate (%)" stroke={CHART_PURPLE} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data</div>
          )}
        </div>
      </div>
    </div>
  );
}

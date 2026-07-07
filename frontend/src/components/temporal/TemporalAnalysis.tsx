import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Loader2, Moon, Timer } from "lucide-react";
import { fetchTemporalAnalysis } from "../../api/dashboardApi";
import type { DashboardFilters, TemporalAnalysisData } from "../../types/dashboard";
import HourDayHeatmap from "./HourDayHeatmap";
import HourlyChart from "./HourlyChart";
import MonthlyTrend from "./MonthlyTrend";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<TemporalAnalysisData>;
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
  "Damage Only": "#94a3b8",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-md p-2 shadow-lg text-xs">
      {label && <div className="text-slate-500 mb-1">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function TemporalAnalysis({ filters, fetchFn }: Props) {
  const [data, setData] = useState<TemporalAnalysisData>(emptyTemporalData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        if (active) setLoading(false);
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
  ]);

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
                <BarChart data={data.day_of_week_distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Accidents" fill={CHART_BLUE} radius={[3, 3, 0, 0]} />
                </BarChart>
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
                <BarChart data={data.monthly_seasonality} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
                  <YAxis tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Accidents" fill={CHART_TEAL} radius={[3, 3, 0, 0]} />
                </BarChart>
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
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Weekend vs Weekday</p>
          {data.weekend_vs_weekday && data.weekend_vs_weekday.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.weekend_vs_weekday}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                  >
                    {data.weekend_vs_weekday.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? CHART_BLUE : CHART_TEAL} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} />
                </PieChart>
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
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: MUTED, paddingTop: '10px' }} />
                  <Bar dataKey="Fatal" stackId="a" fill={SEVERITY_COLORS["Fatal"]} />
                  <Bar dataKey="Grievous Injury" stackId="a" fill={SEVERITY_COLORS["Grievous Injury"]} />
                  <Bar dataKey="Minor Injury" stackId="a" fill={SEVERITY_COLORS["Minor Injury"]} />
                  <Bar dataKey="Damage Only" stackId="a" fill={SEVERITY_COLORS["Damage Only"]} radius={[3, 3, 0, 0]} />
                </BarChart>
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

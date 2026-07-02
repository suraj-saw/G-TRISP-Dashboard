import { useEffect, useState } from "react";
import { AlertCircle, CalendarDays, Clock3, Loader2, Moon, Timer } from "lucide-react";
import { fetchTemporalAnalysis } from "../../api/dashboardApi";
import type { DashboardFilters, TemporalAnalysisData } from "../../types/dashboard";
import HourDayHeatmap from "./HourDayHeatmap";
import HourlyChart from "./HourlyChart";
import MonthlyTrend from "./MonthlyTrend";

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
    <div className="min-h-[calc(100vh-130px)] space-y-4">
      <div className="rounded-2xl border border-[#E4E8F4] bg-white p-5 shadow-sm">
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
      </div>

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

      <HourDayHeatmap data={data.hour_day} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <HourlyChart data={data.hourly} />
        <MonthlyTrend data={data.monthly} />
      </div>
    </div>
  );
}

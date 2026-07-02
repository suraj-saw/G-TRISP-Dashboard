// frontend/src/components/dashboard/GujaratInsightsPanel.tsx
import { useEffect, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Loader2,
  AlertCircle,
  Skull,
  ShieldAlert,
  Activity,
  Car,
  MapPinned,
  Building2,
} from "lucide-react";
import {
  fetchGujaratOverviewInsights,
  type GujaratOverviewInsights,
} from "../../api/gujaratDashboardApi";

const C = {
  primary: "#1e3a8a",
  secondary: "#2C6EF2",
  danger: "#ef4444",
  warning: "#f59e0b",
  success: "#10b981",
  neutral: "#94a3b8",
};

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#f59e0b",
  "Minor Injury Non Hospitalized": "#eab308",
  "Minor Injury Hospitalized": "#f59e0b",
  "Damage Only": "#94a3b8",
  "No Injury": "#94a3b8",
};

const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #E4E8F4",
  fontSize: 11,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

function KpiTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-[#E4E8F4] bg-white p-3 shadow-sm flex items-center gap-2.5 min-w-0">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${tone}1A`, color: tone }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums truncate">
          {value.toLocaleString("en-IN")}
        </p>
        <p className="mt-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 truncate">
          {label}
        </p>
      </div>
    </div>
  );
}

export default function GujaratInsightsPanel() {
  const [data, setData] = useState<GujaratOverviewInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchGujaratOverviewInsights()
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load Gujarat insights.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const severityData = useMemo(
    () => (data?.severity || []).filter((s) => s.count > 0),
    [data]
  );

  const topDangerous = useMemo(
    () =>
      (data?.dangerous || []).map((d) => ({
        name: d.district.replace(/ Police Station$/i, "").trim(),
        fatal: d.fatal_accidents,
      })),
    [data]
  );

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-400">
        <Loader2 size={26} className="animate-spin mb-3 text-[#2C6EF2]" />
        <p className="text-sm font-semibold">Loading Gujarat insights…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-red-500 gap-2">
        <AlertCircle size={22} />
        <p className="text-sm font-semibold">{error || "No data available"}</p>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-slate-800">
          Gujarat Accident Insights
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          State-wide summary across all districts
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 gap-2">
        <KpiTile
          icon={<Car size={14} />}
          label="Accidents"
          value={s.total_accidents}
          tone={C.primary}
        />
        <KpiTile
          icon={<Skull size={14} />}
          label="Fatalities"
          value={s.total_fatalities}
          tone={C.danger}
        />
        <KpiTile
          icon={<ShieldAlert size={14} />}
          label="Grievous"
          value={s.total_grievous}
          tone={C.warning}
        />
        <KpiTile
          icon={<Activity size={14} />}
          label="Minor"
          value={s.total_minor}
          tone={C.secondary}
        />
        <KpiTile
          icon={<MapPinned size={14} />}
          label="Districts"
          value={s.districts_covered}
          tone={C.success}
        />
        <KpiTile
          icon={<Building2 size={14} />}
          label="Stations"
          value={s.police_stations}
          tone={C.neutral}
        />
      </div>

      {/* Severity Distribution */}
      <div className="rounded-2xl border border-[#E4E8F4] bg-white shadow-sm p-3.5 flex-1 min-h-0 flex flex-col">
        <p className="text-[13px] font-bold text-slate-800">
          Severity Distribution
        </p>
        <p className="text-[10.5px] text-slate-400 mt-0.5">
          Share of accident outcomes statewide
        </p>
        {severityData.length > 0 ? (
          <div className="flex-1 min-h-0 flex items-center gap-3 mt-1">
            <div className="w-[55%] h-full min-h-[110px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={severityData}
                    dataKey="count"
                    nameKey="severity"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={3}
                    stroke="none"
                  >
                    {severityData.map((e) => (
                      <Cell
                        key={e.severity}
                        fill={SEVERITY_COLORS[e.severity] || C.neutral}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {severityData.map((d) => (
                <div
                  key={d.severity}
                  className="flex items-center gap-1.5 text-[11px] text-slate-600 min-w-0"
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: SEVERITY_COLORS[d.severity] || C.neutral,
                    }}
                  />
                  <span className="truncate">{d.severity}</span>
                  <span className="ml-auto font-semibold text-slate-800 tabular-nums">
                    {d.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            No data
          </div>
        )}
      </div>

      {/* Most Fatal Districts */}
      <div className="rounded-2xl border border-[#E4E8F4] bg-white shadow-sm p-3.5 flex-1 min-h-0 flex flex-col">
        <p className="text-[13px] font-bold text-slate-800">
          Most Fatal Districts
        </p>
        <p className="text-[10.5px] text-slate-400 mt-0.5">
          Top 6 by fatal accident count
        </p>
        {topDangerous.length > 0 ? (
          <div className="flex-1 min-h-[120px] mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topDangerous}
                layout="vertical"
                margin={{ left: 0, right: 12, top: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#F1F5F9"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 9.5, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={72}
                  tick={{ fontSize: 10.5, fill: "#334155" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "#F1F5F9" }}
                />
                <Bar
                  dataKey="fatal"
                  name="Fatal accidents"
                  fill={C.danger}
                  radius={[0, 4, 4, 0]}
                  barSize={9}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            No data
          </div>
        )}
      </div>
    </div>
  );
}

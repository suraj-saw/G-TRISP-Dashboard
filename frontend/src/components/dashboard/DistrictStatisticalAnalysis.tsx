import React, { useEffect, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { getDistrictStats } from "../../api/gujaratDashboardApi";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DistrictStatsFilters {
  district: string;
  year?: string[];
  startDate?: string;
  endDate?: string;
  severity?: string[];
  taluka?: string[];
  policeStation?: string[];
  roadClassification?: string[];
  weatherCondition?: string[];
  lightCondition?: string[];
  collisionType?: string[];
}

interface SeverityBreakdown {
  label: string;
  count: number;
  percentage: number;
}

interface MonthlyTrend {
  month: string; // "Jan 2023"
  accidents: number;
  fatal: number;
}

interface HourlyDistribution {
  hour: number; // 0–23
  accidents: number;
}

interface RoadTypeBreakdown {
  road_type: string;
  count: number;
}

interface DistrictStats {
  total_accidents: number;
  total_fatalities: number;
  total_injuries: number;
  avg_per_month: number;
  severity_breakdown: SeverityBreakdown[];
  monthly_trend: MonthlyTrend[];
  hourly_distribution: HourlyDistribution[];
  road_type_breakdown: RoadTypeBreakdown[];
  peak_hour: number | null;
  peak_month: string | null;
  yoy_change: number | null;
}

// ─── Palette ─────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  Grievous: "#f97316",
  Minor: "#eab308",
  "Non-Injury": "#22c55e",
};

const CHART_BLUE = "#3b82f6";
const CHART_RED = "#ef4444";
const MUTED = "#6b7299";
const GRID = "#e8ecf5";

const HOUR_LABELS = (h: number) => {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const KpiCard: React.FC<{
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

const ChartCard: React.FC<{
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, children, className = "" }) => (
  <div className={`chart-card ${className}`}>
    <div className="chart-card-header">{title}</div>
    <div className="chart-card-body">{children}</div>
  </div>
);

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      {label && <div className="ct-label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="ct-row">
          <span className="ct-dot" style={{ background: p.color }} />
          <span className="ct-name">{p.name}:</span>
          <span className="ct-val">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

const LoadingState: React.FC = () => (
  <div className="stat-loading">
    <div className="stat-spinner" />
    <p>Loading statistical data…</p>
  </div>
);

const EmptyState: React.FC<{ message?: string }> = ({
  message = "No data available for the selected filters.",
}) => (
  <div className="stat-empty">
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="rgba(255,255,255,0.04)" />
      <path
        d="M12 28v-8M20 28V12M28 28v-5"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
    <p>{message}</p>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface DistrictStatisticalAnalysisProps {
  filters: DistrictStatsFilters;
}

const DistrictStatisticalAnalysis: React.FC<
  DistrictStatisticalAnalysisProps
> = ({ filters }) => {
  const [stats, setStats] = useState<DistrictStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!filters.district) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDistrictStats(filters);
      setStats(data);
    } catch {
      setError("Failed to load statistical data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    filters.district,
    filters.year,
    filters.startDate,
    filters.endDate,
    filters.severity,
    filters.taluka,
    filters.policeStation,
    filters.roadClassification,
    filters.weatherCondition,
    filters.lightCondition,
    filters.collisionType,
  ]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) return <LoadingState />;
  if (error) return <EmptyState message={error} />;
  if (!stats) return <EmptyState />;

  const yoyLabel =
    stats.yoy_change !== null
      ? `${stats.yoy_change >= 0 ? "+" : ""}${stats.yoy_change.toFixed(1)}% vs last year`
      : undefined;

  return (
    <div className="district-statistical-analysis">
      {/* ── KPI Row ── */}
      <div className="kpi-row">
        <KpiCard
          label="Total Accidents"
          value={stats.total_accidents.toLocaleString()}
          sub={yoyLabel}
          accent="#3b82f6"
        />
        <KpiCard
          label="Fatalities"
          value={stats.total_fatalities.toLocaleString()}
          accent="#ef4444"
        />
        <KpiCard
          label="Injuries"
          value={stats.total_injuries.toLocaleString()}
          accent="#f97316"
        />
        <KpiCard
          label="Avg / Month"
          value={stats.avg_per_month.toFixed(1)}
          accent="#a78bfa"
        />
        <KpiCard
          label="Peak Hour"
          value={stats.peak_hour === null ? "—" : HOUR_LABELS(stats.peak_hour)}
          sub="highest frequency"
          accent="#22c55e"
        />
      </div>

      {/* ── Row 1: Monthly Trend + Severity Breakdown ── */}
      <div className="charts-row charts-row--two">
        <ChartCard title="Monthly Accident Trend" className="chart--grow">
          {stats.monthly_trend.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart
                data={stats.monthly_trend}
                margin={{ top: 4, right: 16, left: -10, bottom: 4 }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: MUTED }}
                  iconType="circle"
                  iconSize={8}
                />
                <Line
                  type="monotone"
                  dataKey="accidents"
                  name="Accidents"
                  stroke={CHART_BLUE}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="fatal"
                  name="Fatal"
                  stroke={CHART_RED}
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="4 2"
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Severity Breakdown">
          {stats.severity_breakdown.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={stats.severity_breakdown}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {stats.severity_breakdown.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={SEVERITY_COLORS[entry.label] ?? "#6b7280"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [
                    typeof value === "number"
                      ? `${value.toLocaleString()} accidents`
                      : (value ?? ""),
                  ]}
                  contentStyle={{
                    background: "#ffffff",
                    border: "1px solid #e4e8f4",
                    borderRadius: 6,
                    color: "#1a1d2e",
                    fontSize: 12,
                    boxShadow: "0 8px 24px rgba(30,58,138,0.12)",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: MUTED }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Row 2: Hourly Distribution ── */}
      <div className="charts-row charts-row--one">
        <ChartCard title="Accidents by Hour of Day" className="chart--full">
          {stats.hourly_distribution.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={stats.hourly_distribution.map((d) => ({
                  ...d,
                  label: HOUR_LABELS(d.hour),
                }))}
                margin={{ top: 4, right: 16, left: -10, bottom: 4 }}
                barCategoryGap="20%"
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: MUTED, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="accidents"
                  name="Accidents"
                  fill={CHART_BLUE}
                  radius={[3, 3, 0, 0]}
                >
                  {stats.hourly_distribution.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.hour === stats.peak_hour
                          ? "#60a5fa"
                          : "rgba(59,130,246,0.55)"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* ── Row 3: Road Type Breakdown ── */}
      {stats.road_type_breakdown.length > 0 && (
        <div className="charts-row charts-row--one">
          <ChartCard title="Accidents by Road Type" className="chart--full">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={stats.road_type_breakdown}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 80, bottom: 4 }}
                barCategoryGap="25%"
              >
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="road_type"
                  type="category"
                  tick={{ fill: MUTED, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={76}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  name="Accidents"
                  fill="rgba(167,139,250,0.7)"
                  radius={[0, 3, 3, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      <style>{`
        .district-statistical-analysis {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: #f7f9fd;
          overflow-y: auto;
          height: 100%;
          box-sizing: border-box;
        }

        /* KPI Row */
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        @media (max-width: 1200px) {
          .kpi-row { grid-template-columns: repeat(3, 1fr); }
        }

        .kpi-card {
          background: #ffffff;
          border: 1px solid #e4e8f4;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .kpi-label {
          font-size: 11px;
          font-weight: 500;
          color: #7b84a5;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .kpi-value {
          font-size: 24px;
          font-weight: 700;
          line-height: 1.15;
          font-variant-numeric: tabular-nums;
        }

        .kpi-sub {
          font-size: 11px;
          color: #8b93ad;
        }

        /* Chart layout rows */
        .charts-row {
          display: grid;
          gap: 10px;
        }

        .charts-row--two {
          grid-template-columns: 1fr 320px;
        }

        @media (max-width: 1100px) {
          .charts-row--two { grid-template-columns: 1fr; }
        }

        .charts-row--one {
          grid-template-columns: 1fr;
        }

        .chart--grow { flex: 1; }
        .chart--full { width: 100%; }

        /* Chart card */
        .chart-card {
          background: #ffffff;
          border: 1px solid #e4e8f4;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .chart-card-header {
          font-size: 12px;
          font-weight: 600;
          color: #1e3a8a;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          padding: 12px 16px 8px;
          border-bottom: 1px solid #edf0f7;
        }

        .chart-card-body {
          padding: 12px 8px 8px;
          flex: 1;
        }

        /* Custom tooltip */
        .custom-tooltip {
          background: #ffffff;
          border: 1px solid #e4e8f4;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 12px;
          color: #1a1d2e;
          box-shadow: 0 8px 24px rgba(30, 58, 138, 0.12);
        }

        .ct-label {
          color: #6b7299;
          margin-bottom: 5px;
          font-size: 11px;
        }

        .ct-row {
          display: flex;
          align-items: center;
          gap: 6px;
          line-height: 1.8;
        }

        .ct-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ct-name { color: #6b7299; }
        .ct-val { font-weight: 600; margin-left: 2px; }

        /* Loading / Empty */
        .stat-loading,
        .stat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 100%;
          min-height: 200px;
          color: #6b7299;
          font-size: 13px;
        }

        .stat-spinner {
          width: 28px;
          height: 28px;
          border: 2.5px solid #dfe5f2;
          border-top-color: #1e3a8a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DistrictStatisticalAnalysis;

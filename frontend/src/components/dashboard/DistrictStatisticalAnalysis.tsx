/**
 * @file DistrictStatisticalAnalysis.tsx
 * @description Provides a dense, analytical dashboard view of crash statistics filtered by district and other parameters.
 * @responsibility Fetches aggregated statistical data based on applied filters, orchestrates multiple Recharts components to visualize breakdowns (severity, road type, collision nature), and manages CSV/Excel exports.
 * @dependencies recharts (charting), lucide-react (icons), getDistrictStats (API), useExportContext (global export state).
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  LabelList,
} from "recharts";
import { getDistrictStats } from "../../api/gujaratDashboardApi";
import type {
  DistrictStats,
  DistrictStatsFilters,
} from "../../api/gujaratDashboardApi";
import { AlertCircle } from "lucide-react";
import { useExportContext } from "../../context/ExportContext";
import { downloadGujaratExport } from "../../api/exportApi";

// ─── Palette ─────────────────────────────────────────────────────────────────

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
const CHART_INDIGO = "#6366f1";
const CHART_PURPLE = "#a855f7";
const MUTED = "#64748b";
const GRID = "#cbd5e1";

const INVOLVED_GRADIENT = ["#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"];

const HOUR_LABELS = (h: number) => {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
};

// ─── Helper Functions ────────────────────────────────────────────────────────

interface MetricDataPoint {
  label?: string;
  road_type?: string;
  count: number;
}

interface ProcessedDataPoint {
  name: string;
  count: number;
}

/**
 * Utility to sort, limit, and aggregate categorical data for charts.
 * @business_rule Displays the top N categories explicitly. Any remaining categories are summed into a generic "Others" bucket to prevent long-tail clutter on charts.
 * @param {MetricDataPoint[] | undefined} data - The raw array of data points.
 * @param {number} limit - The maximum number of distinct categories to show before grouping.
 * @param {"label" | "road_type"} [key="label"] - The property key containing the category name.
 * @returns {ProcessedDataPoint[]} An array ready for Recharts ingestion.
 */
const getTopCategories = (
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

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * Renders a standardized Key Performance Indicator tile.
 * @param {Object} props - KPI props.
 * @param {string} props.label - The title of the metric.
 * @param {string | number} props.value - The primary big number.
 * @param {string} [props.sub] - Optional secondary text (e.g., YoY change).
 * @param {string} [props.accent] - Color applied to the value text.
 */
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

/**
 * A standardized layout wrapper for rendering Recharts components with a consistent header and border.
 */
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
  payload?: any[];
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      {label && <div className="ct-label">{label}</div>}
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

const EmptyState: React.FC<{ message?: string }> = ({
  message = "No matching crash data isolated for the configured filters.",
}) => (
  <div className="stat-empty">
    <AlertCircle size={24} className="text-slate-400" />
    <p>{message}</p>
  </div>
);

// ─── Reusable Metric Chart Layout ────────────────────────────────────────────

const HorizontalCategoryChartCard: React.FC<{
  title: string;
  data: ProcessedDataPoint[];
  fillColor: string;
  className?: string;
  yAxisWidth?: number;
}> = ({ title, data, fillColor, className = "", yAxisWidth = 110 }) => {
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
          margin={{ top: 10, right: 40, left: 5, bottom: 5 }}
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
            width={yAxisWidth}
            tickFormatter={(val) =>
              typeof val === "string" && val.length > 20
                ? `${val.substring(0, 18)}...`
                : val
            }
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="count"
            name="Accidents"
            fill={fillColor}
            radius={[0, 4, 4, 0]}
            barSize={14}
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
    </ChartCard>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface DistrictStatisticalAnalysisProps {
  filters: DistrictStatsFilters;
}

/**
 * DistrictStatisticalAnalysis Component
 * @responsibility Renders the secondary statistical dashboard view (usually toggled from the map view).
 * @state_management Maintains `stats` payload from the API, `loading` status, and `error` states.
 * @data_flow Receives `filters` via props -> `fetchStats` calls API -> Results memoized via `getTopCategories` -> Rendered to KPI and Chart sub-components.
 * @hooks_usage Uses `useEffect` to trigger data fetches when filters change, and registers export capabilities via the global `useExportContext`.
 */
const DistrictStatisticalAnalysis: React.FC<
  DistrictStatisticalAnalysisProps
> = ({ filters }) => {
  const [stats, setStats] = useState<DistrictStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 
   * Fetches the dashboard aggregates based on current filter combinations.
   * Defined with `useCallback` to prevent infinite loops in the `useEffect` dependency array.
   */
  const fetchStats = useCallback(async () => {
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

  /**
   * ── Export handler registration ──────────────────────────────────────────
   * Connects this component to the top-level TopBar export button.
   * Translates the local `filters` prop into the format expected by the backend export API.
   */
  const { registerExportHandler } = useExportContext();

  useEffect(() => {
    const dashboardFilters = {
      district: filters.district ? [filters.district] : [],
      year: filters.year ?? [],
      severity: filters.severity ?? [],
      road_classification: filters.roadClassification ?? [],
      weather_condition: filters.weatherCondition ?? [],
      light_condition: filters.lightCondition ?? [],
      collision_type: filters.collisionType ?? [],
      police_station: filters.policeStation ?? [],
      taluka: filters.taluka ?? [],
      date_from: filters.startDate ?? "",
      date_to: filters.endDate ?? "",
      month: [],
      day: [],
      time_period: [],
    };
    
    registerExportHandler({
      supportedFormats: ["csv", "excel"],
      onExport: async (format) => {
        if (format === "csv" || format === "excel") {
          await downloadGujaratExport(
            dashboardFilters,
            format,
            filters.district
          );
        }
      },
    });
    return () => {
      registerExportHandler(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const processedRoadType = useMemo(
    () => getTopCategories(stats?.road_type_breakdown, 8, "road_type"),
    [stats?.road_type_breakdown]
  );

  const processedCollisionType = useMemo(
    () => getTopCategories(stats?.collision_type_breakdown, 8, "label"),
    [stats?.collision_type_breakdown]
  );
  const processedCollisionNature = useMemo(
    () => getTopCategories(stats?.collision_nature_breakdown, 10, "label"),
    [stats?.collision_nature_breakdown]
  );
  const processedWeather = useMemo(
    () => getTopCategories(stats?.weather_breakdown, 8, "label"),
    [stats?.weather_breakdown]
  );
  const processedLight = useMemo(
    () => getTopCategories(stats?.light_breakdown, 8, "label"),
    [stats?.light_breakdown]
  );

  const totalAccidents = stats?.total_accidents ?? 0;
  const yoyLabel =
    stats && stats.yoy_change !== null
      ? `${stats.yoy_change >= 0 ? "+" : ""}${stats.yoy_change.toFixed(1)}% vs last year`
      : undefined;

  return (
    <div className="district-statistical-analysis">
      {loading ? (
        <div className="stat-loading">
          <div className="stat-spinner" />
        </div>
      ) : error ? (
        <EmptyState message={error} />
      ) : !stats ? (
        <EmptyState />
      ) : (
        <>
          {/* ── Key Insights Panel ── */}
          {/* {stats.statistical_insights && stats.statistical_insights.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">Key Statistical Insights</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                {stats.statistical_insights.map((insight, idx) => (
                  <li key={idx}>{insight}</li>
                ))}
              </ul>
            </div>
          )} */}

          {/* ── KPI Row ── */}
          <div className="kpi-row">
            <KpiCard
              label="Total Accidents"
              value={totalAccidents.toLocaleString()}
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
              accent="#a855f7"
            />
            <KpiCard
              label="Peak Hour"
              value={
                stats.peak_hour === null ? "—" : HOUR_LABELS(stats.peak_hour)
              }
              sub="highest frequency"
              accent="#10b981"
            />
          </div>

          {/* ── Dashboard Matrix ── */}

          {/* Row 1: Severity Breakdown + Road Classification */}
          <div className="charts-row charts-row--two">
            <ChartCard title="Severity Distribution">
              {!stats.severity_breakdown ||
              stats.severity_breakdown.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart
                    margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  >
                    <Pie
                      data={stats.severity_breakdown}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {stats.severity_breakdown.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={SEVERITY_COLORS[entry.label] ?? "#64748b"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [
                        typeof value === "number"
                          ? `${value.toLocaleString()} accidents`
                          : value,
                      ]}
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        color: "#1e293b",
                        fontSize: 12,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      align="center"
                      verticalAlign="bottom"
                      content={(props) => {
                        const { payload } = props;
                        return (
                          <div className="custom-legend-grid">
                            {payload?.map((entry: any, index: number) => {
                              const val = entry.payload?.count ?? 0;
                              const pct =
                                totalAccidents > 0
                                  ? ((val / totalAccidents) * 100).toFixed(1)
                                  : "0";
                              const formattedVal =
                                val >= 1000
                                  ? `${(val / 1000).toFixed(1)}k`
                                  : val;
                              return (
                                <div key={index} className="legend-item">
                                  <span
                                    className="legend-dot"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="legend-label">
                                    {entry.value}:{" "}
                                    <span className="legend-value">
                                      {formattedVal} ({pct}%)
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <HorizontalCategoryChartCard
              title="Road Classification"
              data={processedRoadType}
              fillColor="rgba(168, 85, 247, 0.75)"
              yAxisWidth={100}
            />
          </div>

          {/* Row 2: Collision Type + Vehicle Involved */}
          <div className="charts-row charts-row--two">
            <HorizontalCategoryChartCard
              title="Collision Type Distribution"
              data={processedCollisionType}
              fillColor={CHART_TEAL}
              yAxisWidth={110}
            />

            <ChartCard title="Vehicles Involved">
              {!stats.vehicle_involvement_breakdown ||
              stats.vehicle_involvement_breakdown.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={stats.vehicle_involvement_breakdown}
                    margin={{ top: 20, right: 15, left: -15, bottom: 5 }}
                    barCategoryGap="30%"
                  >
                    <CartesianGrid
                      stroke={GRID}
                      vertical={false}
                      strokeDasharray="3 3"
                      opacity={0.4}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: MUTED, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="count"
                      name="Accidents"
                      radius={[4, 4, 0, 0]}
                      barSize={36}
                    >
                      {stats.vehicle_involvement_breakdown.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            INVOLVED_GRADIENT[index % INVOLVED_GRADIENT.length]
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="top"
                        style={{
                          fill: "#475569",
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                        formatter={(val: any) => Number(val).toLocaleString()}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Row 3: Victim Composition */}
          <div className="charts-row charts-row--one">
            <ChartCard
              title="Victim Composition (Drivers, Passengers, Pedestrians)"
              className="chart--full"
            >
              {!stats.victim_composition ||
              stats.victim_composition.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={stats.victim_composition}
                    margin={{ top: 20, right: 40, left: 10, bottom: 5 }}
                    layout="vertical"
                    barGap={8}
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
                      type="category"
                      dataKey="type"
                      tick={{ fill: MUTED, fontSize: 12, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      width={80}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{
                        fontSize: 12,
                        color: MUTED,
                        paddingTop: "12px",
                      }}
                      iconType="circle"
                      iconSize={10}
                    />
                    <Bar
                      dataKey="Killed"
                      name="Fatal (Killed)"
                      stackId="a"
                      fill={SEVERITY_COLORS["Fatal"]}
                      barSize={35}
                    />
                    <Bar
                      dataKey="Grievous Injury"
                      name="Grievous Injury"
                      stackId="a"
                      fill={SEVERITY_COLORS["Grievous Injury"]}
                      barSize={35}
                    />
                    <Bar
                      dataKey="Minor Injury"
                      name="Minor Injury"
                      stackId="a"
                      fill={SEVERITY_COLORS["Minor Injury"]}
                      radius={[0, 4, 4, 0]}
                      barSize={35}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Row 4: Weather Condition + Light Condition */}
          <div className="charts-row charts-row--two">
            <HorizontalCategoryChartCard
              title="Weather Condition Breakdown"
              data={processedWeather}
              fillColor={CHART_BLUE}
              yAxisWidth={110}
            />
            <HorizontalCategoryChartCard
              title="Light Condition Analysis"
              data={processedLight}
              fillColor={CHART_PURPLE}
              yAxisWidth={110}
            />
          </div>

          {/* Row 5: Collision Nature */}
          <div className="charts-row charts-row--one">
            <HorizontalCategoryChartCard
              title="Collision Nature Analysis (Top 10)"
              data={processedCollisionNature}
              fillColor={CHART_INDIGO}
              yAxisWidth={150}
            />
          </div>
        </>
      )}

      <style>{`
        .district-statistical-analysis {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 24px;
          background: #f8fafc;
          overflow-y: auto;
          min-height: 400px;
          box-sizing: border-box;
        }

        /* Executive KPI Layout */
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
        }

        @media (max-width: 1200px) {
          .kpi-row { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 640px) {
          .kpi-row { grid-template-columns: 1fr; }
        }

        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        .kpi-label {
          font-size: 11px;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .kpi-value {
          font-size: 28px;
          font-weight: 800;
          line-height: 1.15;
          font-variant-numeric: tabular-nums;
        }

        .kpi-sub {
          font-size: 11px;
          color: #64748b;
          font-weight: 500;
        }

        /* Clean Matrix Layout Row Formats */
        .charts-row {
          display: grid;
          gap: 16px;
        }

        .charts-row--two {
          grid-template-columns: 1fr 1fr;
        }

        .charts-row--one {
          grid-template-columns: 1fr;
        }

        @media (max-width: 1024px) {
          .charts-row--two { grid-template-columns: 1fr; }
        }

        .chart--grow { flex: 1; }
        .chart--full { width: 100%; }

        /* Unified Card Containers */
        .chart-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }

        .chart-card-header {
          font-size: 12px;
          font-weight: 700;
          color: #1e3a8a;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 14px 20px;
          border-bottom: 1px solid #f1f5f9;
          background-color: #f8fafc;
        }

        .chart-card-body {
          padding: 16px 12px;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        /* Polished Custom Tooltip Component */
        .custom-tooltip {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 12px;
          color: #1e293b;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
        }

        .ct-label {
          color: #64748b;
          font-weight: 700;
          margin-bottom: 6px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .ct-row {
          display: flex;
          align-items: center;
          gap: 8px;
          line-height: 1.8;
        }

        .ct-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .ct-name { color: #475569; font-weight: 500; }
        .ct-val { font-weight: 700; margin-left: auto; color: #0f172a; padding-left: 12px; }

        /* Multi-column High-Fidelity Pie Legend Layout */
        .custom-legend-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px 12px;
          padding-top: 12px;
          margin: 0 auto;
          max-width: 95%;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .legend-label {
          font-size: 11px;
          color: #475569;
          white-space: nowrap;
        }

        .legend-value {
          font-weight: 700;
          color: #0f172a;
        }

        /* Loading / Unpopulated Screen States */
        .stat-loading,
        .stat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          height: 100%;
          min-height: 350px;
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
        }

        .stat-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid #e2e8f0;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default DistrictStatisticalAnalysis;

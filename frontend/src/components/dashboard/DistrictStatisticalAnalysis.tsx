// frontend/src/components/dashboard/DistrictStatisticalAnalysis.tsx

/**
 * @file DistrictStatisticalAnalysis.tsx
 * @description Refactored analytical dashboard view displaying district crash statistics.
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
import { useExportContext } from "../../context/ExportContext";
import { downloadGujaratExport } from "../../api/exportApi";

import {
  SEVERITY_COLORS,
  CHART_BLUE,
  CHART_TEAL,
  CHART_INDIGO,
  CHART_PURPLE,
  MUTED,
  GRID,
  INVOLVED_GRADIENT,
  getTopCategories,
  ChartCard,
  CustomTooltip,
  EmptyState,
  HorizontalCategoryChartCard,
} from "./statistical_analysis/common";
import { StatisticalOverviewKPIs } from "./statistical_analysis/StatisticalOverviewKPIs";
import { StackedBarChartCard } from "./statistical_analysis/StackedBarChartCard";

// ─── Helper Matrix Transformations ─────────────────────────────────────────

const groupTopCategories = (data: Record<string, any>[], keepCount: number = 4) => {
  if (!data || data.length === 0) return { groupedData: [], keys: [] };
  
  const totals: Record<string, number> = {};
  data.forEach((row) => {
    Object.keys(row).forEach((k) => {
      if (k !== "name") {
        totals[k] = (totals[k] || 0) + (row[k] || 0);
      }
    });
  });

  const sortedKeys = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  const topKeys = sortedKeys.slice(0, keepCount);
  const otherKeys = sortedKeys.slice(keepCount);

  if (otherKeys.length === 0) {
    return { groupedData: data, keys: sortedKeys };
  }

  const groupedData = data.map((row) => {
    const newRow: any = { name: row.name };
    let othersSum = 0;
    Object.keys(row).forEach((k) => {
      if (k !== "name") {
        if (topKeys.includes(k)) {
          newRow[k] = row[k];
        } else {
          othersSum += row[k] || 0;
        }
      }
    });
    if (othersSum > 0) newRow["Others"] = othersSum;
    return newRow;
  });

  return { groupedData, keys: [...topKeys, "Others"] };
};

const getTopRows = (data: Record<string, any>[], count: number = 10) => {
  if (!data || data.length === 0) return [];
  const withTotal = data.map((row) => {
    let total = 0;
    Object.keys(row).forEach((k) => {
      if (k !== "name" && typeof row[k] === "number") total += row[k];
    });
    return { ...row, _total: total };
  });
  return withTotal.sort((a, b) => b._total - a._total).slice(0, count);
};

interface DistrictStatisticalAnalysisProps {
  filters: DistrictStatsFilters;
  onDataLoaded?: () => void;
  disableAnimations?: boolean;
  fullLabels?: boolean;
}

const DistrictStatisticalAnalysis: React.FC<DistrictStatisticalAnalysisProps> = ({
  filters,
  onDataLoaded,
  disableAnimations = false,
  fullLabels = false,
}) => {
  const [stats, setStats] = useState<DistrictStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (onDataLoaded) onDataLoaded();
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
          await downloadGujaratExport(dashboardFilters, format, filters.district);
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

  const { groupedData: groupedRoadCollisionData, keys: roadCollisionKeys } = useMemo(
    () => groupTopCategories(stats?.road_collision_matrix || [], 4),
    [stats?.road_collision_matrix]
  );

  const topRoadSeverityMatrix = useMemo(
    () => getTopRows(stats?.road_severity_matrix || [], 15),
    [stats?.road_severity_matrix]
  );

  const topCollisionSeverityMatrix = useMemo(
    () => getTopRows(stats?.collision_severity_matrix || [], 15),
    [stats?.collision_severity_matrix]
  );

  const topWeatherMatrix = useMemo(
    () => getTopRows(stats?.weather_severity_matrix || [], 10),
    [stats?.weather_severity_matrix]
  );

  const topLightMatrix = useMemo(
    () => getTopRows(stats?.light_severity_matrix || [], 10),
    [stats?.light_severity_matrix]
  );

  const processedCollisionType = useMemo(
    () => getTopCategories(stats?.collision_type_breakdown, 6, "label"),
    [stats?.collision_type_breakdown]
  );
  const processedCollisionNature = useMemo(
    () => getTopCategories(stats?.collision_nature_breakdown, 7, "label"),
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
          {/* Executive KPI Row */}
          <StatisticalOverviewKPIs stats={stats} />

          {/* Row 1: Severity Breakdown + Road Classification */}
          <div className="charts-row charts-row--two">
            <ChartCard title="Severity Distribution">
              {!stats.severity_breakdown || stats.severity_breakdown.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <Pie
                      data={stats.severity_breakdown}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      isAnimationActive={!disableAnimations}
                    >
                      {stats.severity_breakdown.map((entry, i) => (
                        <Cell key={i} fill={SEVERITY_COLORS[entry.label] ?? "#64748b"} />
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
                                val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val;
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
              fullLabels={fullLabels}
            />
          </div>

          {/* Row 2: Collision Type + Vehicle Involved */}
          <div className="charts-row charts-row--two">
            <HorizontalCategoryChartCard
              title="Collision Type Distribution"
              data={processedCollisionType}
              fillColor={CHART_TEAL}
              yAxisWidth={110}
              fullLabels={fullLabels}
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
                          fill={INVOLVED_GRADIENT[index % INVOLVED_GRADIENT.length]}
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
              {!stats.victim_composition || stats.victim_composition.length === 0 ? (
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
                    {(!filters.severity?.length || filters.severity.includes("Fatal")) && (
                      <Bar
                        dataKey="Killed"
                        name="Fatal (Killed)"
                        stackId="a"
                        fill={SEVERITY_COLORS["Fatal"]}
                        barSize={35}
                      />
                    )}
                    {(!filters.severity?.length || filters.severity.includes("Grievous Injury")) && (
                      <Bar
                        dataKey="Grievous Injury"
                        name="Grievous Injury"
                        stackId="a"
                        fill={SEVERITY_COLORS["Grievous Injury"]}
                        barSize={35}
                      />
                    )}
                    {(!filters.severity?.length ||
                      filters.severity.includes("Minor Injury Non Hospitalized") ||
                      filters.severity.includes("Minor Injury Hospitalized") ||
                      filters.severity.includes("Minor Injury")) && (
                      <Bar
                        dataKey="Minor Injury"
                        name="Minor Injury"
                        stackId="a"
                        fill={SEVERITY_COLORS["Minor Injury"]}
                        radius={[0, 4, 4, 0]}
                        barSize={35}
                      />
                    )}
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
              fullLabels={fullLabels}
            />
            <HorizontalCategoryChartCard
              title="Light Condition Analysis"
              data={processedLight}
              fillColor={CHART_PURPLE}
              yAxisWidth={130}
              fullLabels={fullLabels}
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

          {/* Row 6: Cross-Distribution Analytics */}
          <div className="charts-row charts-row--one">
            <StackedBarChartCard
              title="Severity by Road Classification"
              data={topRoadSeverityMatrix}
              keys={[
                "Fatal",
                "Grievous Injury",
                "Minor Injury Hospitalized",
                "Minor Injury Non Hospitalized",
                "No Injury",
              ]}
              colors={[
                SEVERITY_COLORS["Fatal"],
                SEVERITY_COLORS["Grievous Injury"],
                SEVERITY_COLORS["Minor Injury Hospitalized"],
                SEVERITY_COLORS["Minor Injury Non Hospitalized"],
                SEVERITY_COLORS["No Injury"],
              ]}
              height={380}
            />
            <StackedBarChartCard
              title="Collision Type vs Severity"
              data={topCollisionSeverityMatrix}
              keys={[
                "Fatal",
                "Grievous Injury",
                "Minor Injury Hospitalized",
                "Minor Injury Non Hospitalized",
                "No Injury",
              ]}
              colors={[
                SEVERITY_COLORS["Fatal"],
                SEVERITY_COLORS["Grievous Injury"],
                SEVERITY_COLORS["Minor Injury Hospitalized"],
                SEVERITY_COLORS["Minor Injury Non Hospitalized"],
                SEVERITY_COLORS["No Injury"],
              ]}
              height={380}
            />
          </div>

          {/* Row 7: Environment & Severity */}
          <div className="charts-row charts-row--one">
            <StackedBarChartCard
              title="Weather vs Severity"
              data={topWeatherMatrix}
              keys={[
                "Fatal",
                "Grievous Injury",
                "Minor Injury Hospitalized",
                "Minor Injury Non Hospitalized",
                "No Injury",
              ]}
              colors={[
                SEVERITY_COLORS["Fatal"],
                SEVERITY_COLORS["Grievous Injury"],
                SEVERITY_COLORS["Minor Injury Hospitalized"],
                SEVERITY_COLORS["Minor Injury Non Hospitalized"],
                SEVERITY_COLORS["No Injury"],
              ]}
              height={380}
            />
            <StackedBarChartCard
              title="Light Condition vs Severity"
              data={topLightMatrix}
              keys={[
                "Fatal",
                "Grievous Injury",
                "Minor Injury Hospitalized",
                "Minor Injury Non Hospitalized",
                "No Injury",
              ]}
              colors={[
                SEVERITY_COLORS["Fatal"],
                SEVERITY_COLORS["Grievous Injury"],
                SEVERITY_COLORS["Minor Injury Hospitalized"],
                SEVERITY_COLORS["Minor Injury Non Hospitalized"],
                SEVERITY_COLORS["No Injury"],
              ]}
              height={380}
            />
          </div>

          {/* Row 8: Road vs Collision */}
          <div className="charts-row charts-row--one">
            <StackedBarChartCard
              title="Road Classification vs Collision Type"
              data={groupedRoadCollisionData}
              keys={roadCollisionKeys}
              colors={[
                "#2563eb",
                "#dc2626",
                "#059669",
                "#d97706",
                "#7c3aed",
                "#db2777",
                "#0891b2",
                "#ea580c",
                "#4f46e5",
                "#65a30d",
                "#14b8a6",
                "#9333ea",
                "#be123c",
                "#0f766e",
                "#b45309",
              ]}
              yAxisWidth={160}
              height={400}
            />
          </div>

          {/* Row 9: Top Police Stations */}
          <div className="charts-row charts-row--one">
            <ChartCard title="Top Police Stations (By Activity)">
              {!stats.police_station_stats || stats.police_station_stats.length === 0 ? (
                <EmptyState />
              ) : (
                <ResponsiveContainer width="100%" height={450}>
                  <BarChart
                    data={stats.police_station_stats.slice(0, 10).map((s) => ({
                      ...s,
                      non_fatal_accidents: s.total - s.fatal_accidents,
                    }))}
                    layout="vertical"
                    margin={{ top: 10, right: 30, left: 5, bottom: 5 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid
                      stroke={GRID}
                      horizontal={true}
                      vertical={true}
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
                      dataKey="police_station"
                      type="category"
                      tick={{ fill: MUTED, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={160}
                      tickFormatter={(val) =>
                        typeof val === "string" && val.length > 25
                          ? `${val.substring(0, 23)}...`
                          : val
                      }
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0, 0, 0, 0.04)" }} />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: MUTED, paddingTop: "10px" }}
                      iconType="circle"
                      iconSize={8}
                    />
                    {!filters.severity?.length || filters.severity.includes("Fatal") ? (
                      <>
                        <Bar
                          dataKey="fatal_accidents"
                          name="Fatal Accidents"
                          stackId="a"
                          fill={SEVERITY_COLORS["Fatal"]}
                          maxBarSize={16}
                        />
                        <Bar
                          dataKey="non_fatal_accidents"
                          name="Non-Fatal Accidents"
                          stackId="a"
                          fill={CHART_BLUE}
                          maxBarSize={16}
                          radius={[0, 4, 4, 0]}
                        />
                      </>
                    ) : (
                      <Bar
                        dataKey="total"
                        name="Total Accidents"
                        fill={CHART_BLUE}
                        maxBarSize={16}
                        radius={[0, 4, 4, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
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

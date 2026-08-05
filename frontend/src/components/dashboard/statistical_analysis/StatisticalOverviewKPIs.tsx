// frontend/src/components/dashboard/statistical_analysis/StatisticalOverviewKPIs.tsx

import React from "react";
import type { DistrictStats } from "../../../api/gujaratDashboardApi";
import { KpiCard, HOUR_LABELS } from "./common";

interface StatisticalOverviewKPIsProps {
  stats: DistrictStats;
}

export const StatisticalOverviewKPIs: React.FC<StatisticalOverviewKPIsProps> = ({ stats }) => {
  const totalAccidents = stats.total_accidents ?? 0;
  const yoyLabel =
    stats.yoy_change !== null
      ? `${stats.yoy_change >= 0 ? "+" : ""}${stats.yoy_change.toFixed(1)}% vs last year`
      : undefined;

  return (
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
        value={stats.peak_hour === null ? "—" : HOUR_LABELS(stats.peak_hour)}
        sub="highest frequency"
        accent="#10b981"
      />
    </div>
  );
};

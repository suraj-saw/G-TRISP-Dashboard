/**
 * @file WeightedKdeHeatmapLayers.tsx
 * @description Renders a Kernel Density Estimation (KDE) surface where accident points are weighted by severity.
 * @responsibility Coordinates the fetching of severity-weighted KDE data and wraps the `VisualizationLayers` component. Handles loading and error UI states.
 * @dependencies lucide-react (status indicators), dashboardApi
 */
import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { fetchWeightedKdeHeatmap, type KdeHeatmapData } from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { VisualizationLayers } from "./VisualizationLayers";

interface Props {
  filters: DashboardFilters;
  accidentPoints?: HeatmapPoint[];
  fetchFn?: (filters: DashboardFilters) => Promise<KdeHeatmapData>;
}

/**
 * WeightedKdeHeatmapLayers Component
 * @state_management Maintains KDE `data`, `loading`, and `error` states.
 * @hooks_usage Uses `useEffect` to trigger a fetch whenever relevant dashboard filters change.
 * @param {Object} props - Component properties.
 * @param {DashboardFilters} props.filters - Global dashboard filters.
 * @param {HeatmapPoint[]} [props.accidentPoints] - Raw accident point data passed down.
 * @param {Function} [props.fetchFn] - Override function for fetching data.
 */
export default function WeightedKdeHeatmapLayers({ filters, accidentPoints, fetchFn }: Props) {
  const [data, setData] = useState<KdeHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPedestrian = filters.visualization_variant === "pedestrian";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    (fetchFn ?? fetchWeightedKdeHeatmap)(filters)
      .then((response) => { if (active) setData(response); })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError?.response?.status
            ? `Request failed (${requestError.response.status}): ${requestError.response.data?.detail || requestError.message}`
            : requestError?.message || "Failed to load severity-weighted KDE heatmap."
        );
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [
    filters.district, filters.year, filters.severity,
    filters.road_classification, filters.weather_condition,
    filters.light_condition, filters.collision_type,
    filters.date_from, filters.date_to, filters.visualization_variant, fetchFn,
  ]);

  const StatusBadge = ({ children }: { children: React.ReactNode }) => (
    <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-[#E4E8F4] bg-white/95 px-4 py-2.5 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur-sm">
        {children}
      </div>
    </div>
  );

  if (loading) return <StatusBadge><Loader2 size={14} className="animate-spin text-[#16A34A]" />Computing {isPedestrian ? "pedestrian " : ""}severity-weighted KDE surface…</StatusBadge>;
  if (error) return <StatusBadge><AlertCircle size={14} className="text-red-500" /><span className="text-red-600">{error}</span></StatusBadge>;
  if (!data?.data.features.length) return <StatusBadge><AlertCircle size={14} className="text-amber-500" />No {isPedestrian ? "pedestrian accident" : "accident"} data available for the current filters.</StatusBadge>;

  return (
    <>
      <VisualizationLayers data={accidentPoints} type="density_heatmap" />
      <StatusBadge>{isPedestrian ? "Pedestrian severity-weighted KDE" : "Severity-weighted KDE"} · {data.total_crashes} crashes · {data.radius_m}m bandwidth</StatusBadge>
    </>
  );
}

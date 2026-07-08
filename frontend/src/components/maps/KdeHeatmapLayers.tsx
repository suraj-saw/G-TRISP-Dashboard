// frontend/src/components/maps/KdeHeatmapLayers.tsx
import { useEffect, useState } from "react";
import { Source, Layer } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchKdeHeatmap, type KdeHeatmapData } from "../../api/dashboardApi";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<KdeHeatmapData>;
}


export default function KdeHeatmapLayers({ filters, fetchFn }: Props) {
  const [data, setData] = useState<KdeHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isPedestrian = filters.visualization_variant === "pedestrian";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);

    const loader = fetchFn ?? fetchKdeHeatmap;
    loader(filters)
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err?.response?.status
            ? `Request failed (${err.response.status}): ${err.response.data?.detail || err.message}`
            : err?.message || "Failed to load KDE density heatmap."
        );
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    // Re-fetch when any filter changes, including the variant (accident vs pedestrian)
    filters.district,
    filters.year,
    filters.severity,
    filters.road_classification,
    filters.weather_condition,
    filters.light_condition,
    filters.collision_type,
    filters.date_from,
    filters.date_to,
    filters.visualization_variant,
    fetchFn,
  ]);

  const StatusBadge = ({ children }: { children: React.ReactNode }) => (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto rounded-xl border border-[#E4E8F4] bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm text-xs font-semibold text-slate-600 flex items-center gap-2">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={14} className="animate-spin text-[#16A34A]" />
        Computing {isPedestrian ? "pedestrian" : "accident"} KDE density surface…
      </StatusBadge>
    );
  }

  if (error) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-red-500" />
        <span className="text-red-600">{error}</span>
      </StatusBadge>
    );
  }

  if (!data || !data.image || !data.coordinates) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-amber-500" />
        No {isPedestrian ? "pedestrian accident" : "accident"} data available for the current filters.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* Georeferenced raster — quartic-kernel KDE, same algorithm as the
          offline notebook's build_kde_raster() / QGIS Heatmap tool.
          Pedestrian variant filters to accidents with pedestrian casualties only. */}
      <Source
        id="kde-heatmap-source"
        type="image"
        url={data.image}
        coordinates={data.coordinates as any}
      >
        <Layer
          id="kde-heatmap-raster"
          type="raster"
          paint={{
            "raster-opacity": 0.8,
            "raster-fade-duration": 0,
          }}
        />
      </Source>

      <StatusBadge>
        {isPedestrian ? "Pedestrian KDE" : "KDE"} density surface ·{" "}
        {data.total_crashes} crashes · {data.radius_m}m bandwidth
      </StatusBadge>
    </>
  );
}

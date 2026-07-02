// frontend/src/components/maps/AccidentDensityHeatmapLayers.tsx
import { useEffect, useState } from "react";
import { Source, Layer } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchKdeHeatmap, type KdeHeatmapData } from "../../api/dashboardApi";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<KdeHeatmapData>;
}

export default function AccidentDensityHeatmapLayers({ filters, fetchFn }: Props) {
  const [data, setData] = useState<KdeHeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

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
            : err?.message || "Failed to load density heatmap."
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
    filters.district,
    filters.year,
    filters.severity,
    filters.road_classification,
    filters.weather_condition,
    filters.light_condition,
    filters.collision_type,
    filters.date_from,
    filters.date_to,
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
        Computing KDE density surface…
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
        No accident data available for the current filters.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* Georeferenced raster — quartic-kernel KDE, same algorithm as the
          offline notebook's build_kde_raster() / QGIS Heatmap tool. */}
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
        KDE density surface · {data.total_crashes} crashes · {data.radius_m}m
        bandwidth
      </StatusBadge>
    </>
  );
}

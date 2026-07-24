import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<unknown>;
  analysisLabel?: string;
}

interface HoveredSegment {
  longitude: number;
  latitude: number;
  road_id: string;
  start_m: number;
  end_m: number;
  score: number;
  accident_count: number;
  priority_label?: string;
  priority_color?: string;
  qualifying_count?: number;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
}

export default function NetworkBlackspotLayers({
  filters,
  fetchFn,
  analysisLabel = "Network-Constrained Blackspots",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFn(filters);
        if (mounted) {
          setData(result as GeoJSON.FeatureCollection);
        }
      } catch (err: unknown) {
        if (mounted) {
          console.error("Failed to load network blackspots:", err);
          const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
          setError(
            error?.response?.status
              ? `Request failed (${error.response.status}): ${error.response.data?.detail || error.message}`
              : error?.message || "Failed to analyze network blackspots."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [filters, fetchFn]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const onMove = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["network-blackspot-line"],
      });
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        const f = features[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          road_id: f.properties?.road_id,
          start_m: f.properties?.start_m,
          end_m: f.properties?.end_m,
          score: f.properties?.score,
          accident_count: f.properties?.accident_count,
          priority_label: f.properties?.priority_label,
          priority_color: f.properties?.priority_color,
          qualifying_count: f.properties?.qualifying_count,
          fatal_count: f.properties?.fatal_count,
          grievous_count: f.properties?.grievous_count,
          minor_hospitalized_count: f.properties?.minor_hospitalized_count,
          minor_non_hospitalized_count: f.properties?.minor_non_hospitalized_count,
        });
      } else {
        map.getCanvas().style.cursor = "";
        setHovered(null);
      }
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef]);

  const StatusBadge = ({ children }: { children: React.ReactNode }) => (
    <div className="pointer-events-none absolute top-4 left-4 z-20">
      <div className="pointer-events-auto rounded-full border border-slate-200/50 bg-white/90 px-3 py-2 shadow-xl backdrop-blur-md text-[11px] font-medium text-slate-700 flex items-center gap-2 transition-all duration-300 hover:bg-white/95">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={14} className="animate-spin text-indigo-500" />
        Running {analysisLabel}…
      </StatusBadge>
    );
  }

  if (error) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-red-500" />
        <span className="text-red-600 font-semibold">{error}</span>
      </StatusBadge>
    );
  }

  if (!data || data.features?.length === 0) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-amber-500" />
        <span>
          No network segments found for the given criteria.
        </span>
      </StatusBadge>
    );
  }

  return (
    <>
      <Source id="network-blackspots-source" type="geojson" data={data}>
        <Layer
          id="network-blackspot-line-bg"
          type="line"
          paint={{
            "line-color": "#000000",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 14],
            "line-opacity": 0.4,
            "line-blur": 2,
          }}
        />
        <Layer
          id="network-blackspot-line"
          type="line"
          paint={{
            "line-color": ["coalesce", ["get", "priority_color"], "#DC2626"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 6],
            "line-opacity": 1.0,
          }}
        />
      </Source>

      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
          className="z-50 accident-popup"
        >
          <div className="w-72 overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div
              className="px-4 py-2 text-[10px] font-bold tracking-widest text-white uppercase"
              style={{
                backgroundColor: hovered.priority_color ?? "#DC2626",
              }}
            >
              {hovered.priority_label?.replace(/Blackspot/gi, "Segment") ?? "Unknown Segment"}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-extrabold text-slate-800">
                    Network Segment
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-red-50 border border-red-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Fatal
                  </span>
                  <span className="text-sm font-bold text-[#4C1D1D]">
                    {hovered.fatal_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-orange-50 border border-orange-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Grievous
                  </span>
                  <span className="text-sm font-bold text-[#DC2626]">
                    {hovered.grievous_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Min Hosp
                  </span>
                  <span className="text-sm font-bold text-[#EA580C]">
                    {hovered.minor_hospitalized_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-yellow-50 border border-yellow-100">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Min Non
                  </span>
                  <span className="text-sm font-bold text-[#F59E0B]">
                    {hovered.minor_non_hospitalized_count ?? "—"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 text-center">
                <span className="font-bold text-slate-700">
                  {hovered.accident_count.toLocaleString()}
                </span>{" "}
                total crashes ({hovered.qualifying_count ?? 0} qualifying) within{" "}
                {(hovered.end_m - hovered.start_m).toFixed(0)}m segment
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

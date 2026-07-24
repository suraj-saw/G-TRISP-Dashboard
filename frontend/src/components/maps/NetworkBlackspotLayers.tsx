import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import type { DashboardFilters, HeatmapPoint, SnappedHeatmapPoint } from "../../types/dashboard";

const SEVERITY_COLORS = {
  Fatal: "#B91C1C",
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#F59E0B",
  "Minor Injury Non Hospitalized": "#FBBF24",
  "No Injury": "#65A30D",
  default: "#64748B",
} as const;

const severityColorExpression = [
  "case",
  ["in", "fatal", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS.Fatal,
  ["in", "grievous", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS["Grievous Injury"],
  [
    "in",
    "minor injury hospitalized",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Hospitalized"],
  [
    "in",
    "minor injury non",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Non Hospitalized"],
  [
    "any",
    ["in", "no injury", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "damage only", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  ],
  SEVERITY_COLORS["No Injury"],
  SEVERITY_COLORS.default,
] as const;

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<unknown>;
  fetchSnappedPointsFn?: (filters: DashboardFilters) => Promise<{ total: number; data: SnappedHeatmapPoint[] }>;
  analysisLabel?: string;
  crashLabel?: string;
}

function buildAccidentGeojson(
  data?: SnappedHeatmapPoint[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      data
        ?.filter(
          (p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
        )
        .map((p) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [p.longitude, p.latitude],
          },
          properties: {
            accident_id: p.accident_id,
            severity: p.severity,
            police_station: p.police_station ?? p.district,
            road_name: p.road_name,
            road_classification: p.road_classification,
            weather_condition: p.weather_condition,
            light_condition: p.light_condition,
            collision_type: p.collision_type,
            accident_date_time: p.accident_date_time,
            pedestrian_killed: p.pedestrian_killed,
            pedestrian_grievous_injury: p.pedestrian_grievous_injury,
            pedestrian_minor_injury: p.pedestrian_minor_injury,
          },
        })) || [],
  };
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
  fetchSnappedPointsFn,
  analysisLabel = "Network-Constrained Blackspots",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);

  const [snappedPointsData, setSnappedPointsData] = useState<GeoJSON.FeatureCollection | null>(null);

  useEffect(() => {
    let mounted = true;

    if (fetchSnappedPointsFn) {
      fetchSnappedPointsFn(filters)
        .then((res) => {
          if (mounted && res?.data) {
            setSnappedPointsData(buildAccidentGeojson(res.data));
          }
        })
        .catch((err) => {
          console.error("Failed to fetch snapped points for network blackspots:", err);
        });
    }

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

      {snappedPointsData && (
        <Source id="network-accident-points-source" type="geojson" data={snappedPointsData}>
          <Layer
            id="network-accident-points-halo"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                13,
                4,
                15,
                7,
                17,
                10,
              ],
              "circle-color": severityColorExpression as any,
              "circle-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                0,
                13,
                0.15,
                15,
                0.25,
              ],
              "circle-blur": 0.8,
            }}
          />
          <Layer
            id="network-accident-points"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                1.5,
                13,
                2.5,
                15,
                4,
                17,
                5.5,
                19,
                7,
              ],
              "circle-color": severityColorExpression as any,
              "circle-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                0,
                13,
                0.65,
                14,
                0.85,
                15,
                0.95,
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                0,
                13,
                0.6,
                15,
                0.9,
              ],
            }}
          />
        </Source>
      )}

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

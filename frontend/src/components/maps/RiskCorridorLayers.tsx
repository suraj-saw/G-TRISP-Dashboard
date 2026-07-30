import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle, Route, X } from "lucide-react";
import type { DashboardFilters, SnappedHeatmapPoint } from "../../types/dashboard";
import {
  CORRIDOR_COLOR_EXPR,
  getCorridorOpacityExpr,
  getCorridorBgOpacityExpr,
  getCorridorWidthExpr,
  CORRIDOR_COLORS,
} from "../../config/riskCorridorConfig";

const SEVERITY_COLORS = {
  Fatal: "#78350F",
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#EAB308",
  "Minor Injury Non Hospitalized": "#0284C7",
  "No Injury": "#16A34A",
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
  corridor_id: string;
  road_id: string;
  road_name: string;
  road_classification: string;
  start_m: number;
  end_m: number;
  accident_density: number;
  weighted_score: number;
  priority_score: number;
  priority_level: string;
  accident_count: number;
  qualifying_count?: number;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
  corridor_rank?: number;
  corridor_length?: number;
}

export default function RiskCorridorLayers({
  filters,
  fetchFn,
  fetchSnappedPointsFn,
  analysisLabel = "Risk Corridors",
}: Props) {
  const { current: mapRef } = useMap();
  
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Interactive state
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
      setSelectedId(null);
      setHovered(null);
      
      try {
        const result = (await fetchFn(filters)) as GeoJSON.FeatureCollection;
        if (mounted) {
          // Sort features so lower priority (lower score) renders first, 
          // allowing Critical/High to render on top.
          if (result && result.features) {
            result.features.sort((a, b) => {
              const scoreA = a.properties?.priority_score || 0;
              const scoreB = b.properties?.priority_score || 0;
              return scoreA - scoreB;
            });
          }
          setData(result);
        }
      } catch (err: unknown) {
        if (mounted) {
          console.error("Failed to load risk corridors:", err);
          const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
          setError(
            error?.response?.status
              ? `Request failed (${error.response.status}): ${error.response.data?.detail || error.message}`
              : error?.message || "Failed to analyze risk corridors."
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

  // Handle map interactions
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const onMove = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["risk-corridor-line"],
      });
      if (features.length > 0) {
        map.getCanvas().style.cursor = "pointer";
        const f = features[0];
        const cid = f.properties?.corridor_id;
        
        // Update hover state if we aren't currently selecting something else
        setHoveredId(cid);
        
        if (!selectedId || selectedId === cid) {
          setHovered({
            longitude: e.lngLat.lng,
            latitude: e.lngLat.lat,
            corridor_id: cid,
            road_id: f.properties?.road_id,
            road_name: f.properties?.road_name,
            road_classification: f.properties?.road_classification,
            start_m: f.properties?.start_m,
            end_m: f.properties?.end_m,
            accident_density: f.properties?.accident_density,
            weighted_score: f.properties?.weighted_score,
            priority_score: f.properties?.priority_score,
            priority_level: f.properties?.priority_level,
            accident_count: f.properties?.accident_count,
            qualifying_count: f.properties?.qualifying_count,
            fatal_count: f.properties?.fatal_count,
            grievous_count: f.properties?.grievous_count,
            minor_hospitalized_count: f.properties?.minor_hospitalized_count,
            minor_non_hospitalized_count: f.properties?.minor_non_hospitalized_count,
            corridor_rank: f.properties?.corridor_rank,
            corridor_length: f.properties?.corridor_length,
          });
        }
      } else {
        map.getCanvas().style.cursor = "";
        setHoveredId(null);
        if (!selectedId) {
          setHovered(null);
        }
      }
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHoveredId(null);
      if (!selectedId) {
        setHovered(null);
      }
    };
    
    const onClick = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["risk-corridor-line"],
      });
      if (features.length > 0) {
        const f = features[0];
        const cid = f.properties?.corridor_id;
        
        // Toggle selection
        if (selectedId === cid) {
          setSelectedId(null);
        } else {
          setSelectedId(cid);
          // Ease map to click location to prevent popup cut-off near screen edges
          map.easeTo({
            center: [e.lngLat.lng, e.lngLat.lat],
            duration: 300,
          });
          // Snap popup to click location
          setHovered({
            longitude: e.lngLat.lng,
            latitude: e.lngLat.lat,
            corridor_id: cid,
            road_id: f.properties?.road_id,
            road_name: f.properties?.road_name,
            road_classification: f.properties?.road_classification,
            start_m: f.properties?.start_m,
            end_m: f.properties?.end_m,
            accident_density: f.properties?.accident_density,
            weighted_score: f.properties?.weighted_score,
            priority_score: f.properties?.priority_score,
            priority_level: f.properties?.priority_level,
            accident_count: f.properties?.accident_count,
            qualifying_count: f.properties?.qualifying_count,
            fatal_count: f.properties?.fatal_count,
            grievous_count: f.properties?.grievous_count,
            minor_hospitalized_count: f.properties?.minor_hospitalized_count,
            minor_non_hospitalized_count: f.properties?.minor_non_hospitalized_count,
            corridor_rank: f.properties?.corridor_rank,
            corridor_length: f.properties?.corridor_length,
          });
        }
      } else {
        setSelectedId(null);
        setHovered(null);
      }
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    map.on("click", onClick);

    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, selectedId]);

  // Derived expressions for interactive styling
  const activeCorridorId = selectedId || hoveredId;

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
        Running {analysisLabel}...
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
        <span>No corridors found for the given criteria.</span>
      </StatusBadge>
    );
  }

  // Format road identifier fallback
  const getRoadIdentifier = (h: HoveredSegment) => {
    if (h.road_name && h.road_name.toLowerCase() !== "unknown" && h.road_name !== "nan") {
      return h.road_name;
    }
    if (h.road_classification && h.road_classification.toLowerCase() !== "unknown") {
      return `${h.road_classification} Segment (ID: ${h.road_id})`;
    }
    return `Unnamed Road (ID: ${h.road_id})`;
  };

  return (
    <>
      <Source id="risk-corridors-source" type="geojson" data={data}>
        <Layer
          id="risk-corridor-line-bg"
          type="line"
          paint={{
            "line-color": "#FFFFFF",
            "line-width": getCorridorWidthExpr(activeCorridorId, true) as any,
            "line-opacity": getCorridorBgOpacityExpr(activeCorridorId) as any,
            "line-blur": 0,
            "line-opacity-transition": { duration: 300 },
          }}
        />
        <Layer
          id="risk-corridor-line"
          type="line"
          paint={{
            "line-color": CORRIDOR_COLOR_EXPR as any,
            "line-width": getCorridorWidthExpr(activeCorridorId, false) as any,
            "line-opacity": getCorridorOpacityExpr(activeCorridorId) as any,
            "line-width-transition": { duration: 300 },
            "line-opacity-transition": { duration: 300 },
          }}
        />
      </Source>

      {snappedPointsData && (
        <Source id="network-accident-points-source" type="geojson" data={snappedPointsData}>
          {/* Snapped Points Layers (Hidden by default unless debugging or overlayed) */}
          <Layer
            id="network-accident-points"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 1.5,
                13, 2.5,
                15, 4,
                17, 5.5,
                19, 7,
              ],
              "circle-color": severityColorExpression as any,
              "circle-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 0,
                13, 0.65,
                14, 0.85,
                15, 0.95,
              ],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12, 0,
                13, 0.6,
                15, 0.9,
              ],
            }}
          />
        </Source>
      )}

      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          closeButton={false}
          closeOnClick={false}
          onClose={() => {
            setSelectedId(null);
            setHovered(null);
          }}
          offset={14}
          className="z-50 accident-popup"
          style={
            {
              "--popup-bg":
                CORRIDOR_COLORS[
                  hovered.priority_level as keyof typeof CORRIDOR_COLORS
                ] ?? CORRIDOR_COLORS["Very High"],
            } as React.CSSProperties
          }
        >
          <div className="w-[185px] sm:w-[195px] overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/90 font-sans tracking-tight text-slate-800 select-none transition-all">
            {/* Top Banner with Priority Level and Close Button */}
            <div
              className="px-2 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase flex items-center justify-between"
              style={{
                backgroundColor:
                  CORRIDOR_COLORS[
                    hovered.priority_level as keyof typeof CORRIDOR_COLORS
                  ] ?? CORRIDOR_COLORS["Very High"],
              }}
            >
              <span className="truncate max-w-[145px]">
                {hovered.priority_level} #{hovered.corridor_rank ?? "-"}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(null);
                  setHovered(null);
                }}
                className="pointer-events-auto p-0.5 rounded hover:bg-white/20 text-white transition-colors shrink-0 cursor-pointer"
                title="Close popup"
                type="button"
              >
                <X size={11} />
              </button>
            </div>

            {/* Main Body */}
            <div className="p-2 space-y-1.5 text-[10px]">
              {/* Road Header & Length */}
              <div>
                <div
                  className="text-[11px] font-extrabold text-slate-800 truncate"
                  title={getRoadIdentifier(hovered)}
                >
                  {getRoadIdentifier(hovered)}
                </div>
                <div className="text-[9px] font-medium text-slate-500 flex items-center gap-1 mt-0.5">
                  <Route size={10} className="shrink-0 text-slate-400" />
                  <span>
                    {(hovered.corridor_length
                      ? hovered.corridor_length / 1000
                      : 0
                    ).toFixed(2)}{" "}
                    km
                  </span>
                  {hovered.road_classification &&
                    hovered.road_classification.toLowerCase() !== "unknown" && (
                      <>
                        <span>•</span>
                        <span className="truncate max-w-[80px]">
                          {hovered.road_classification}
                        </span>
                      </>
                    )}
                </div>
              </div>

              {/* 2x2 Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-slate-50/90 border border-slate-100/80 text-[9.5px]">
                <div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none">
                    Crashes
                  </span>
                  <span className="font-extrabold text-slate-700 leading-tight">
                    {hovered.accident_count.toLocaleString()}{" "}
                    <span className="text-[8px] font-normal text-slate-400">
                      ({hovered.qualifying_count ?? 0} qual)
                    </span>
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none">
                    Density
                  </span>
                  <span className="font-extrabold text-slate-700 leading-tight">
                    {(hovered.accident_density ?? 0).toFixed(1)}/km
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none">
                    Priority
                  </span>
                  <span className="font-extrabold text-indigo-600 leading-tight">
                    {hovered.priority_score ?? 0}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none">
                    Severity Wt
                  </span>
                  <span className="font-extrabold text-orange-600 leading-tight">
                    {hovered.weighted_score ?? 0}
                  </span>
                </div>
              </div>

              {/* 4-Stat Severity Pills */}
              <div className="grid grid-cols-4 gap-0.5 text-center">
                <div className="flex flex-col items-center py-0.5 rounded bg-red-50/90 border border-red-100/80">
                  <span className="text-[7.5px] font-bold text-red-700/80 uppercase">
                    Fatal
                  </span>
                  <span className="text-[10.5px] font-black text-red-700 leading-none">
                    {hovered.fatal_count ?? 0}
                  </span>
                </div>

                <div className="flex flex-col items-center py-0.5 rounded bg-orange-50/90 border border-orange-100/80">
                  <span className="text-[7.5px] font-bold text-orange-700/80 uppercase">
                    Griev
                  </span>
                  <span className="text-[10.5px] font-black text-orange-700 leading-none">
                    {hovered.grievous_count ?? 0}
                  </span>
                </div>

                <div className="flex flex-col items-center py-0.5 rounded bg-amber-50/90 border border-amber-100/80">
                  <span className="text-[7.5px] font-bold text-amber-700/80 uppercase">
                    Hosp
                  </span>
                  <span className="text-[10.5px] font-black text-amber-700 leading-none">
                    {hovered.minor_hospitalized_count ?? 0}
                  </span>
                </div>

                <div className="flex flex-col items-center py-0.5 rounded bg-sky-50/90 border border-sky-100/80">
                  <span className="text-[7.5px] font-bold text-sky-700/80 uppercase">
                    Non-H
                  </span>
                  <span className="text-[10.5px] font-black text-sky-700 leading-none">
                    {hovered.minor_non_hospitalized_count ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

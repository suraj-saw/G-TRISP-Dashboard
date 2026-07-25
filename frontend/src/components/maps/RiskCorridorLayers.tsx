import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle, Activity, Route, TrendingUp, AlertOctagon } from "lucide-react";
import type { DashboardFilters, SnappedHeatmapPoint } from "../../types/dashboard";
import {
  CORRIDOR_COLOR_EXPR,
  getCorridorOpacityExpr,
  getCorridorBgOpacityExpr,
  getCorridorWidthExpr,
  CORRIDOR_COLORS,
} from "../../config/riskCorridorConfig";

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
          anchor="bottom"
          closeButton={true}
          closeOnClick={false}
          onClose={() => {
            setSelectedId(null);
            setHovered(null);
          }}
          offset={16}
          className="z-50 risk-corridor-popup"
          maxWidth="320px"
        >
          <div className="flex flex-col gap-2 min-w-[240px] max-w-[280px] font-sans">
            {/* Header: Title and Priority Pill */}
            <div className="flex justify-between items-start gap-3 border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-800 leading-tight">
                  {getRoadIdentifier(hovered)}
                </h3>
                <div className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                  <Route className="w-3 h-3" />
                  {(hovered.corridor_length ? (hovered.corridor_length / 1000).toFixed(2) : "0")} km 
                  {hovered.road_classification && hovered.road_classification.toLowerCase() !== "unknown" && (
                    <>
                      <span>•</span>
                      <span>{hovered.road_classification}</span>
                    </>
                  )}
                </div>
              </div>
              <div 
                className="px-2 py-1 rounded-md text-[10px] font-bold text-white whitespace-nowrap shadow-sm"
                style={{ backgroundColor: CORRIDOR_COLORS[hovered.priority_level as keyof typeof CORRIDOR_COLORS] ?? CORRIDOR_COLORS["Very High"] }}
              >
                {hovered.priority_level} <span className="opacity-80 ml-0.5">#{hovered.corridor_rank ?? "-"}</span>
              </div>
            </div>

            {/* Stats Grid: Very compact */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 py-1.5">
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <AlertOctagon className="w-2.5 h-2.5" /> Crashes
                </div>
                <div className="text-sm font-extrabold text-slate-700 mt-0.5">
                  {hovered.accident_count.toLocaleString()} <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-1 rounded">({hovered.qualifying_count ?? 0} qual)</span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="w-2.5 h-2.5" /> Density
                </div>
                <div className="text-sm font-extrabold text-slate-700 mt-0.5">
                  {(hovered.accident_density ?? 0).toFixed(1)} <span className="text-[10px] text-slate-400 font-medium">/km</span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5" /> Priority Score
                </div>
                <div className="text-sm font-extrabold text-indigo-600 mt-0.5">{hovered.priority_score ?? 0}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                  Severity Wt.
                </div>
                <div className="text-sm font-extrabold text-orange-600 mt-0.5">{hovered.weighted_score ?? 0}</div>
              </div>
            </div>

            {/* Severity Breakdown: Minimalist */}
            <div className="border-t border-slate-100 pt-2.5 mt-0.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Severity Breakdown</div>
              <div className="flex justify-between items-center text-center gap-1.5">
                <div className="flex-1 bg-red-50/80 border border-red-100 rounded py-1">
                  <div className="text-[13px] font-black text-red-700">{hovered.fatal_count ?? 0}</div>
                  <div className="text-[8px] font-bold text-slate-500 uppercase">Fatal</div>
                </div>
                <div className="flex-1 bg-orange-50/80 border border-orange-100 rounded py-1">
                  <div className="text-[13px] font-black text-orange-700">{hovered.grievous_count ?? 0}</div>
                  <div className="text-[8px] font-bold text-slate-500 uppercase">Griev</div>
                </div>
                <div className="flex-1 bg-amber-50/80 border border-amber-100 rounded py-1">
                  <div className="text-[13px] font-black text-amber-600">{hovered.minor_hospitalized_count ?? 0}</div>
                  <div className="text-[8px] font-bold text-slate-500 uppercase">M.Hosp</div>
                </div>
                <div className="flex-1 bg-yellow-50/80 border border-yellow-100 rounded py-1">
                  <div className="text-[13px] font-black text-yellow-600">{hovered.minor_non_hospitalized_count ?? 0}</div>
                  <div className="text-[8px] font-bold text-slate-500 uppercase">M.Non</div>
                </div>
              </div>
            </div>
            
            {selectedId === hovered.corridor_id && (
              <div className="mt-2 py-1.5 px-3 bg-blue-50 border border-blue-100 text-blue-700 rounded text-center text-[10px] font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                Corridor Selected
              </div>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}

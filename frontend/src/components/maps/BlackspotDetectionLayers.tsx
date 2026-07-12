// frontend/src/components/maps/BlackspotDetectionLayers.tsx

import { useEffect, useRef, useState, useCallback } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle, Download } from "lucide-react";
import {
  fetchBlackspots,
  exportBlackspotCrashes,
  type BlackspotData,
} from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";
import {
  getPriorityColor,
  getPriorityLabel,
  PRIORITY_COLOR_EXPR,
  SEARCH_RADIUS_M,
  MIN_QUALIFYING_CRASHES,
} from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
  exportFn?: (crashIds: string[], filename: string) => Promise<void>;
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
}

interface HoveredBlackspot {
  longitude: number;
  latitude: number;
  bs_id?: number;
  crash_count?: number;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
  no_injury_count?: number;
  qualifying_count?: number;
  priority_score?: number;
  priority_rank?: number;
  total_blackspots?: number;
  priority_label?: string;
  qualifies_by?: string;
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
  accident_date_time?: string | null;
  isPoint?: boolean;
  crash_ids?: string;
}

// const SEVERITY_COLORS: Record<string, string> = {
//   Fatal: "#4C1D1D",
//   "Grievous Injury": "#DC2626",
//   "Minor Injury": "#EA580C",
//   "Damage Only": "#FBBF24",
// };

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

const NULL_TEXT_SENTINEL = "nan";
const UNKNOWN_LABEL = "Unknown";

function safeText(value?: string | null): string {
  if (!value || value === NULL_TEXT_SENTINEL) return UNKNOWN_LABEL;
  return value;
}

function formatDate(value?: string | null): string {
  if (!value) return UNKNOWN_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return UNKNOWN_LABEL;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

const getSeverityBadgeClasses = (severity?: string | null): string => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal"))
    return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  if (s.includes("grievous"))
    return "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20";
  if (s.includes("minor injury hospitalized"))
    return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20";
  if (s.includes("minor injury non"))
    return "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20";
  if (s.includes("no injury") || s.includes("damage only"))
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
  return "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20";
};

type SelectedAccident = {
  longitude: number;
  latitude: number;
  accident_id?: string | null;
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
  road_classification?: string | null;
  weather_condition?: string | null;
  light_condition?: string | null;
  collision_type?: string | null;
  accident_date_time?: string | null;
  pedestrian_killed?: number | null;
  pedestrian_grievous_injury?: number | null;
  pedestrian_minor_injury?: number | null;
};

function pedestrianCasualtyTotal(point: {
  pedestrian_killed?: number | null;
  pedestrian_grievous_injury?: number | null;
  pedestrian_minor_injury?: number | null;
}): number {
  return (
    (Number(point.pedestrian_killed) || 0) +
    (Number(point.pedestrian_grievous_injury) || 0) +
    (Number(point.pedestrian_minor_injury) || 0)
  );
}

function AccidentPopupBody({
  selected,
  showPedestrianCasualties = false,
}: {
  selected: SelectedAccident;
  showPedestrianCasualties?: boolean;
}) {
  const pedestrianTotal = pedestrianCasualtyTotal(selected);
  const severityBadgeClass = getSeverityBadgeClasses(selected.severity);

  return (
    <div className="bg-white rounded-lg shadow-xl p-4 flex flex-col w-full min-w-[250px] max-w-[320px] font-sans">
      {/* --- Header --- */}
      <div className="flex flex-col mb-4">
        <div className="mb-2.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${severityBadgeClass}`}
          >
            {safeText(selected.severity)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
          <span className="shrink-0">
            {formatDate(selected.accident_date_time)}
          </span>
          {selected.accident_id && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></span>
              <span className="break-words">ID: {selected.accident_id}</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-4">
        <div className="flex flex-col col-span-2">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Collision Type
          </span>
          <span className="text-[13px] font-medium text-slate-700 leading-tight break-words">
            {safeText(selected.collision_type)}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Coordinates
          </span>
          <span className="text-[13px] font-medium text-slate-700 break-words">
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Road Class
          </span>
          <span className="text-[13px] font-medium text-slate-700 leading-tight break-words">
            {safeText(selected.road_classification)}
          </span>
        </div>

        {/* --- Pedestrian Casualty Metric --- */}
        {showPedestrianCasualties && pedestrianTotal > 0 && (
          <div className="col-span-2 mt-1 flex items-start bg-red-50/50 rounded-lg p-2.5 ring-1 ring-inset ring-red-100">
            <div className="h-8 w-8 bg-white rounded-full shadow-sm flex items-center justify-center mr-3 shrink-0 mt-0.5">
              <svg
                className="w-4 h-4 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold text-red-800/80 uppercase tracking-wider mb-0.5">
                Pedestrian Casualties
              </span>
              <span className="text-sm font-semibold text-red-700">
                {pedestrianTotal} Recorded
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildAccidentGeojson(
  data?: HeatmapPoint[]
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

export default function BlackspotDetectionLayers({
  filters,
  fetchFn,
  exportFn,
  heatmapData,
  analysisLabel = "Blackspot detection",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);
  const [selected, setSelected] = useState<HoveredBlackspot | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverPopupRef = useRef(false);

  // Cancel any pending dismiss when component unmounts
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const scheduleDismiss = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      if (!isOverPopupRef.current) {
        setHovered(null);
      }
    }, 300);
  }, []);

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const accidentGeojson = buildAccidentGeojson(heatmapData);
  const filterKey = toDataFilterKey(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    setHovered(null);
    setSelected(null);

    const loader = fetchFn ?? fetchBlackspots;

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
            : err?.message || "Failed to load blackspot data."
        );
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filterKey]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clusterLayers = [
      "blackspot-circles-fill",
      "blackspot-centroids-point",
    ];
    const pointLayers = ["blackspot-accident-points"];

    const onMove = (e: any) => {
      const map_ = mapRef?.getMap();
      if (!map_) return;

      let hasPoint = false;
      const presentPointLayers = pointLayers.filter((id) => map_.getLayer(id));
      if (presentPointLayers.length) {
        const pointFeats = map_.queryRenderedFeatures(e.point, {
          layers: presentPointLayers,
        });
        if (pointFeats.length) {
          hasPoint = true;
        }
      }

      const presentClusterLayers = clusterLayers.filter((id) =>
        map_.getLayer(id)
      );
      if (presentClusterLayers.length && !hasPoint) {
        const clusterFeats = map_.queryRenderedFeatures(e.point, {
          layers: presentClusterLayers,
        });
        if (clusterFeats.length) {
          cancelDismiss();
          map_.getCanvas().style.cursor = "pointer";
          const f = clusterFeats[0];
          // Use the feature's actual centroid coordinates instead of mouse position
          // Check if this is the same cluster to avoid unnecessary re-renders
          const newBsId = f.properties?.bs_id;
          if (hovered?.bs_id === newBsId) {
            return;
          }
          // Extract centroid coordinates from the feature
          let lon: number, lat: number;
          if (f.geometry.type === "Point") {
            [lon, lat] = f.geometry.coordinates as [number, number];
          } else {
            // Find corresponding centroid from data using bs_id
            const centroidFeat = data?.centroids?.features?.find(
              (cf: any) => cf.properties?.bs_id === newBsId
            );
            if (centroidFeat && centroidFeat.geometry.type === "Point") {
              [lon, lat] = centroidFeat.geometry.coordinates as [
                number,
                number,
              ];
            } else {
              // Fallback to mouse position if no centroid found
              lon = e.lngLat.lng;
              lat = e.lngLat.lat;
            }
          }
          setHovered({
            longitude: lon,
            latitude: lat,
            bs_id: newBsId,
            crash_count: f.properties?.crash_count,
            fatal_count: f.properties?.fatal_count,
            grievous_count: f.properties?.grievous_count,
            minor_hospitalized_count: f.properties?.minor_hospitalized_count,
            minor_non_hospitalized_count:
              f.properties?.minor_non_hospitalized_count,
            no_injury_count: f.properties?.no_injury_count,
            qualifying_count: f.properties?.qualifying_count,
            priority_score: f.properties?.priority_score,
            priority_rank: f.properties?.priority_rank,
            total_blackspots: f.properties?.total_blackspots,
            priority_label: f.properties?.priority_label,
            qualifies_by: f.properties?.qualifies_by,
            crash_ids:
              f.properties?.crash_ids != null
                ? String(f.properties.crash_ids)
                : undefined,
            isPoint: false,
          });
          return;
        }
      }

      map_.getCanvas().style.cursor = hasPoint ? "pointer" : "";
      scheduleDismiss();
    };

    const onClick = (e: any) => {
      const map_ = mapRef?.getMap();
      if (!map_) return;
      const presentPointLayers = pointLayers.filter((id) => map_.getLayer(id));
      if (presentPointLayers.length) {
        const pointFeats = map_.queryRenderedFeatures(e.point, {
          layers: presentPointLayers,
        });
        if (pointFeats.length) {
          const f = pointFeats[0];
          setSelected({
            longitude: e.lngLat.lng,
            latitude: e.lngLat.lat,
            ...f.properties,
            isPoint: true,
          });
          return;
        }
      }
      setSelected(null);
    };

    map.on("mousemove", onMove);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, data]);

  const handleExportData = async (
    cluster: HoveredBlackspot | null = hovered
  ) => {
    console.log("[BlackspotDetectionLayers] handleExportData called");
    console.log("[BlackspotDetectionLayers] cluster:", cluster);
    if (!cluster || !cluster.crash_ids) return;
    const ids = String(cluster.crash_ids)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    console.log("[BlackspotDetectionLayers] ids to export:", ids);
    if (ids.length === 0) return;

    try {
      const filename = `blackspot_cluster_${cluster.bs_id}_data.csv`;
      console.log(
        "[BlackspotDetectionLayers] Using exportFn?",
        !!exportFn,
        "filename:",
        filename
      );
      if (exportFn) {
        await exportFn(ids, filename);
      } else {
        await exportBlackspotCrashes(ids, filename);
      }
    } catch (err) {
      console.error(
        "[BlackspotDetectionLayers] Failed to export cluster data:",
        err
      );
    }
  };

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
        <Loader2 size={14} className="animate-spin text-blue-600" />
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

  if (!data || data.circles.features.length === 0) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-amber-500" />
        <span>
          No blackspots found — criteria:{" "}
          <span className="font-bold text-amber-600">
            ≥{MIN_QUALIFYING_CRASHES}
          </span>{" "}
          qualifying {crashLabel} within {data?.radius_m ?? SEARCH_RADIUS_M} m.
        </span>
      </StatusBadge>
    );
  }

  return (
    <>
      {accidentGeojson.features.length > 0 && (
        <Source
          id="blackspot-accident-source"
          type="geojson"
          data={accidentGeojson as any}
        >
          <Layer
            id="blackspot-accident-halo"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                13,
                6,
                15,
                10,
                17,
                14,
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
            id="blackspot-accident-points"
            type="circle"
            paint={{
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                2,
                13,
                3.5,
                15,
                5.5,
                17,
                8,
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
              "circle-stroke-width": 1.5,
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

      <Source
        id="blackspot-circles-source"
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id="blackspot-circles-fill"
          type="fill"
          paint={{
            "fill-color": PRIORITY_COLOR_EXPR as any,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.15,
              13,
              0.1,
              15,
              0.05,
            ],
          }}
        />
        <Layer
          id="blackspot-circles-outline"
          type="line"
          paint={{
            "line-color": PRIORITY_COLOR_EXPR as any,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1.5,
              14,
              1,
              16,
              0.5,
            ],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.8,
              15,
              0.5,
              17,
              0.2,
            ],
          }}
        />
      </Source>

      <Source
        id="blackspot-centroids-source"
        type="geojson"
        data={data.centroids as any}
      >
        <Layer
          id="blackspot-centroids-point"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "crash_count"],
              5,
              5,
              15,
              8,
              50,
              12,
              150,
              16,
              350,
              22,
            ],
            "circle-color": PRIORITY_COLOR_EXPR as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.95,
              14,
              0.85,
              15,
              0.65,
              16,
              0.3,
            ],
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              15,
              0.7,
              16,
              0.2,
            ],
          }}
        />
      </Source>

      <StatusBadge>
        <span className="flex items-center gap-1.5">
          <span className="text-blue-600 font-bold">
            {data.total_blackspots}
          </span>{" "}
          Identified Blackspots
        </span>
        <span className="text-slate-300">|</span>
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800">{data.total_crashes}</span>{" "}
          {crashLabel}
        </span>
        {/* <span className="text-slate-300">|</span>
        <span className="text-slate-500 text-xs">
          Search: {SEARCH_RADIUS_M}m
        </span> */}
      </StatusBadge>

      {hovered && !hovered.isPoint && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          closeButton={false}
          closeOnClick={false}
          anchor="top"
          offset={12}
          className="z-50 accident-popup"
        >
          <div
            className="w-72 overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200"
            onMouseEnter={() => {
              isOverPopupRef.current = true;
              cancelDismiss();
            }}
            onMouseLeave={() => {
              isOverPopupRef.current = false;
              scheduleDismiss();
            }}
          >
            <div
              className="px-4 py-2 text-[10px] font-bold tracking-widest text-white uppercase"
              style={{
                backgroundColor: getPriorityColor(hovered.priority_score ?? 0),
              }}
            >
              {hovered.priority_label ??
                getPriorityLabel(hovered.priority_score ?? 0)}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-extrabold text-slate-800">
                    Cluster #{hovered.bs_id}
                  </div>
                  {hovered.crash_ids && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportData(hovered);
                      }}
                      className="p-1 rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      title="Export Accident Data"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
                {/* <div
                  className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100"
                  style={{ color: getPriorityColor(hovered.priority_score ?? 0) }}
                >
                  Score: {hovered.priority_score ?? "—"}
                </div> */}
              </div>

              {/* {hovered.priority_rank && hovered.total_blackspots && (
                <div className="flex items-center justify-between p-2 mb-4 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Priority Rank</span>
                  <span className="text-sm font-bold text-slate-700">
                    #{hovered.priority_rank} / {hovered.total_blackspots} <span className="text-slate-400 font-normal ml-1">(Top {Math.max(1, Math.ceil((hovered.priority_rank / hovered.total_blackspots) * 100))}%)</span>
                  </span>
                </div>
              )} */}

              <div className="grid grid-cols-4 gap-2 mb-4">
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-red-50 border border-red-100">
                  {/* <Skull size={14} className="text-[#4C1D1D] mb-1" /> */}
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Fatal
                  </span>
                  <span className="text-sm font-bold text-[#4C1D1D]">
                    {hovered.fatal_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-orange-50 border border-orange-100">
                  {/* <AlertTriangle size={14} className="text-[#DC2626] mb-1" /> */}
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Grievous
                  </span>
                  <span className="text-sm font-bold text-[#DC2626]">
                    {hovered.grievous_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                  {/* <ShieldAlert size={14} className="text-[#EA580C] mb-1" /> */}
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Min Hosp
                  </span>
                  <span className="text-sm font-bold text-[#EA580C]">
                    {hovered.minor_hospitalized_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-yellow-50 border border-yellow-100">
                  {/* <ShieldAlert size={14} className="text-[#F59E0B] mb-1" /> */}
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider text-center leading-tight">
                    Min Non
                  </span>
                  <span className="text-sm font-bold text-[#F59E0B]">
                    {hovered.minor_non_hospitalized_count ?? "—"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 mb-3 text-center">
                <span className="font-bold text-slate-700">
                  {hovered.crash_count?.toLocaleString()}
                </span>{" "}
                total crashes ({hovered.qualifying_count} qualifying) within{" "}
                {SEARCH_RADIUS_M}m
              </div>

              {/* {hovered.qualifies_by && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Qualifying Criteria
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    {hovered.qualifies_by.split(" | ").map((criterion, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <span className="text-blue-500 mt-0.5">•</span>
                        <span>{criterion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )} */}
            </div>
          </div>
        </Popup>
      )}

      {selected && selected.isPoint && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          closeOnClick={true}
          offset={12}
          closeButton
          onClose={() => setSelected(null)}
          className="accident-popup z-50"
        >
          <AccidentPopupBody
            selected={selected as any}
            showPedestrianCasualties={false}
          />
        </Popup>
      )}
    </>
  );
}

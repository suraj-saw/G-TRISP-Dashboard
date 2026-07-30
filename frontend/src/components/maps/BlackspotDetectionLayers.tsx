/**
 * @file BlackspotDetectionLayers.tsx
 * @description Renders dynamic map layers for Blackspot detection using spatial algorithms (e.g., Greedy/Radius-based).
 * @responsibility Fetches blackspot cluster data, renders Maplibre Source/Layer definitions (clusters and individual points), handles hover/click interactions, and integrates with the CSV export function.
 * @dependencies react-map-gl/maplibre, lucide-react, dashboardApi
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import {
  fetchBlackspots,
  exportBlackspotCrashes,
  type BlackspotData,
} from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";
import {
  PRIORITY_COLOR_EXPR,
  SEARCH_RADIUS_M,
  MIN_QUALIFYING_CRASHES,
} from "../../config/blackspotConfig";
import CompactBlackspotPopup, {
  type BlackspotPopupData,
} from "./CompactBlackspotPopup";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
  exportFn?: (crashIds: string[], filename: string) => Promise<void>;
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
}

/**
 * Represents the structured metadata payload for a hovered blackspot cluster or individual crash point.
 */
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

/**
 * BlackspotDetectionLayers Component
 * @state_management Manages local `data` for clusters, `loading`/`error` states for the fetch operation, and `hovered`/`selected` states for map interactions. Uses `useRef` for debouncing popup dismissals.
 * @hooks_usage Heavy use of `useEffect` for data fetching tied to filter changes and map event binding (`mousemove`, `click`).
 * @param {Object} props - Component properties.
 * @param {DashboardFilters} props.filters - Global dashboard filters applied to the backend query.
 * @param {Function} [props.fetchFn] - Override function for fetching data.
 * @param {Function} [props.exportFn] - Override function for exporting CSV data.
 * @param {HeatmapPoint[]} [props.heatmapData] - Underlying raw crash points to render individually on high zoom.
 */
export default function BlackspotDetectionLayers({
  filters,
  fetchFn,
  exportFn,
  heatmapData,
  analysisLabel = "MoRTH Blackspot (Greedy)",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverPopupRef = useRef(false);
  const hoveredBsIdRef = useRef<string | number | null>(null);

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
        hoveredBsIdRef.current = null;
        setHovered(null);
      }
    }, 200);
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
    hoveredBsIdRef.current = null;
    setHovered(null);

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

    const onMove = (e: any) => {
      if (isOverPopupRef.current) return;
      const map_ = mapRef?.getMap();
      if (!map_) return;

      const presentClusterLayers = clusterLayers.filter((id) =>
        map_.getLayer(id)
      );
      if (presentClusterLayers.length) {
        const clusterFeats = map_.queryRenderedFeatures(e.point, {
          layers: presentClusterLayers,
        });
        if (clusterFeats.length) {
          cancelDismiss();
          map_.getCanvas().style.cursor = "pointer";
          const f = clusterFeats[0];
          const newBsId = f.properties?.bs_id;

          // Compare using ref to avoid stale closure state re-render loop
          if (
            hoveredBsIdRef.current !== null &&
            String(hoveredBsIdRef.current) === String(newBsId)
          ) {
            return;
          }

          // Extract centroid coordinates from feature or centroids GeoJSON
          let lon: number, lat: number;
          if (f.geometry.type === "Point") {
            [lon, lat] = f.geometry.coordinates as [number, number];
          } else {
            const centroidFeat = data?.centroids?.features?.find(
              (cf: any) => String(cf.properties?.bs_id) === String(newBsId)
            );
            if (centroidFeat && centroidFeat.geometry.type === "Point") {
              [lon, lat] = centroidFeat.geometry.coordinates as [
                number,
                number,
              ];
            } else {
              lon = e.lngLat.lng;
              lat = e.lngLat.lat;
            }
          }

          hoveredBsIdRef.current = newBsId;
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

      map_.getCanvas().style.cursor = "";
      scheduleDismiss();
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, data]);

  const handleExportData = async (
    cluster?: BlackspotPopupData | HoveredBlackspot | null
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
            id="blackspot-accident-points"
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
              0.25,
              13,
              0.15,
              15,
              0.08,
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
              2,
              14,
              1.5,
              16,
              1,
            ],
            "line-dasharray": [2, 1],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.9,
              15,
              0.6,
              17,
              0.3,
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
          id="blackspot-centroids-shadow"
          type="circle"
          paint={{
            "circle-radius": [
              "*",
              [
                "interpolate",
                ["linear"],
                ["get", "crash_count"],
                5,
                7,
                15,
                11,
                50,
                16,
                150,
                22,
                350,
                28,
              ],
              [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.3,
                12,
                0.6,
                15,
                1,
              ],
            ],
            "circle-color": "#000000",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0,
              12,
              0.15,
              14,
              0.2,
              17,
              0.05,
            ],
            "circle-blur": 1.5,
          }}
        />
        <Layer
          id="blackspot-centroids-point"
          type="circle"
          paint={{
            "circle-radius": [
              "*",
              [
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
                20,
              ],
              [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                0.3,
                12,
                0.6,
                15,
                1,
              ],
            ],
            "circle-color": PRIORITY_COLOR_EXPR as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.7,
              12,
              0.85,
              15,
              0.95,
            ],
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.5,
              12,
              1.5,
              15,
              2.5,
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.5,
              12,
              0.8,
              15,
              1,
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
          offset={14}
          className="z-50 accident-popup"
        >
          <CompactBlackspotPopup
            data={hovered}
            onExport={handleExportData}
            onMouseEnter={() => {
              isOverPopupRef.current = true;
              cancelDismiss();
            }}
            onMouseLeave={() => {
              isOverPopupRef.current = false;
              scheduleDismiss();
            }}
            radiusM={data?.radius_m ?? SEARCH_RADIUS_M}
          />
        </Popup>
      )}
    </>
  );
}

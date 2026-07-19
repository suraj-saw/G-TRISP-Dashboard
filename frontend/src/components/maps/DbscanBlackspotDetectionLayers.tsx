/**
 * @file DbscanBlackspotDetectionLayers.tsx
 * @description Renders dynamic map layers for Blackspot detection using the DBSCAN clustering algorithm.
 * @responsibility Fetches DBSCAN-specific blackspot cluster data, renders Maplibre Source/Layer definitions (polygon hulls and centroids), manages popup interactions, and exports cluster datasets.
 * @dependencies react-map-gl/maplibre, lucide-react, dashboardApi
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle, Download } from "lucide-react";
import {
  fetchDbscanBlackspots,
  exportBlackspotCrashes,
  type BlackspotData,
} from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";
import {
  SEARCH_RADIUS_M,
  MIN_QUALIFYING_CRASHES,
  PRIORITY_COLOR_EXPR,
  getPriorityColor,
  getPriorityLabel,
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
  bs_id: number;
  crash_count: number;
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
  crash_ids?: string;
}

/**
 * DbscanBlackspotDetectionLayers Component
 * @state_management Manages local `data` for DBSCAN clusters, `loading`/`error` states, and `hovered` state for map interactions. Uses `useRef` to debounce popup dismissal during hover transitions.
 * @hooks_usage Uses `useEffect` for data fetching tied to filter changes and map event binding (`mousemove`).
 * @param {Object} props - Component properties.
 * @param {DashboardFilters} props.filters - Global dashboard filters applied to the backend query.
 * @param {Function} [props.fetchFn] - Override function for fetching data.
 * @param {Function} [props.exportFn] - Override function for exporting CSV data.
 */
export default function DbscanBlackspotDetectionLayers({
  filters,
  fetchFn,
  exportFn,
  analysisLabel = "DBSCAN detection",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);
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

  const filterKey = toDataFilterKey(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loader = fetchFn ?? fetchDbscanBlackspots;
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
            : err?.message || "Failed to load DBSCAN blackspot data."
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
    if (!map || !data) return;

    const layers = ["dbscan-circles-fill", "dbscan-centroids-point"].filter(
      (id) => map.getLayer(id)
    );
    if (!layers.length) return;

    const onMove = (e: any) => {
      const feats = map.queryRenderedFeatures(e.point, { layers });
      if (feats.length) {
        cancelDismiss();
        map.getCanvas().style.cursor = "pointer";
        const f = feats[0];
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
            [lon, lat] = centroidFeat.geometry.coordinates as [number, number];
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
        });
      } else {
        map.getCanvas().style.cursor = "";
        scheduleDismiss();
      }
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, data]);

  const handleExportData = async (
    cluster: HoveredBlackspot | null = hovered
  ) => {
    console.log("[DbscanBlackspotDetectionLayers] handleExportData called");
    console.log("[DbscanBlackspotDetectionLayers] cluster:", cluster);
    if (!cluster || !cluster.crash_ids) return;
    const ids = String(cluster.crash_ids)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    console.log("[DbscanBlackspotDetectionLayers] ids to export:", ids);
    if (ids.length === 0) return;

    try {
      const filename = `blackspot_cluster_${cluster.bs_id}_data.csv`;
      console.log(
        "[DbscanBlackspotDetectionLayers] Using exportFn?",
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
        "[DbscanBlackspotDetectionLayers] Failed to export cluster data:",
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
      <Source
        id="dbscan-circles-source"
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id="dbscan-circles-fill"
          type="fill"
          paint={{
            "fill-color": PRIORITY_COLOR_EXPR as any,
            "fill-opacity": 0.15,
          }}
        />
        <Layer
          id="dbscan-circles-outline"
          type="line"
          paint={{
            "line-color": PRIORITY_COLOR_EXPR as any,
            "line-width": 1.5,
            "line-dasharray": [3, 2],
            "line-opacity": 0.8,
          }}
        />
      </Source>

      <Source
        id="dbscan-centroids-source"
        type="geojson"
        data={data.centroids as any}
      >
        <Layer
          id="dbscan-centroids-point"
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
              20,
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
              0.5,
              17,
              0.1,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              15,
              0.8,
              17,
              0.2,
            ],
          }}
        />
      </Source>

      <StatusBadge>
        <span className="flex items-center gap-1.5">
          <span className="text-indigo-600 font-bold">
            {data.total_blackspots}
          </span>{" "}
          DBSCAN Blackspots
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

      {hovered && (
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
                  {hovered.crash_count.toLocaleString()}
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
                        <span className="text-indigo-500 mt-0.5">•</span>
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
    </>
  );
}

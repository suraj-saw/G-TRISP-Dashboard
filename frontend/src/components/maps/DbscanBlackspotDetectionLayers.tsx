/**
 * @file DbscanBlackspotDetectionLayers.tsx
 * @description Renders dynamic map layers for Blackspot detection using the DBSCAN clustering algorithm.
 * @responsibility Fetches DBSCAN-specific blackspot cluster data, renders Maplibre Source/Layer definitions (polygon hulls and centroids), manages popup interactions, and exports cluster datasets.
 * @dependencies react-map-gl/maplibre, lucide-react, dashboardApi
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
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
  analysisLabel = "MoRTH Blackspot (DBSCAN)",
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

  const filterKey = toDataFilterKey(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    hoveredBsIdRef.current = null;
    setHovered(null);

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
      if (isOverPopupRef.current) return;
      const feats = map.queryRenderedFeatures(e.point, { layers });
      if (feats.length) {
        cancelDismiss();
        map.getCanvas().style.cursor = "pointer";
        const f = feats[0];
        const newBsId = f.properties?.bs_id;

        if (
          hoveredBsIdRef.current !== null &&
          String(hoveredBsIdRef.current) === String(newBsId)
        ) {
          return;
        }

        let lon: number, lat: number;
        if (f.geometry.type === "Point") {
          [lon, lat] = f.geometry.coordinates as [number, number];
        } else {
          const centroidFeat = data?.centroids?.features?.find(
            (cf: any) => String(cf.properties?.bs_id) === String(newBsId)
          );
          if (centroidFeat && centroidFeat.geometry.type === "Point") {
            [lon, lat] = centroidFeat.geometry.coordinates as [number, number];
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
    cluster?: BlackspotPopupData | HoveredBlackspot | null
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
          id="dbscan-circles-outline"
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
            "line-dasharray": [3, 2],
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
        id="dbscan-centroids-source"
        type="geojson"
        data={data.centroids as any}
      >
        <Layer
          id="dbscan-centroids-shadow"
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
          id="dbscan-centroids-point"
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

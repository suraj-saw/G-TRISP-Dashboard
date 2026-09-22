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
  fetchGujaratBlackspots,
  type BlackspotData,
} from "../../api/gujaratDashboardApi";
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
import { BlackspotPdfReport } from "../../features/export/BlackspotPdfReport";
import BlackspotRemarksTimelineModal from "./BlackspotRemarksTimelineModal";
import {
  computeCrashIdsHash,
  fetchRemarksBulk,
  type Remark,
  type RemarkClusterSummary,
  type ClusterLookupItem,
} from "../../api/remarksApi";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
  exportFn?: (crashIds: string[], filename: string) => Promise<void>;
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
  districtName?: string;
  isStandardMorth?: boolean;
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
  vehicle_count?: number;
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
  analysisLabel = "Modified MoRTH Blackspot",
  crashLabel = "crashes",
  districtName,
  isStandardMorth = false,
}: Props) {
  const idPrefix = isStandardMorth ? "morth-bs-" : "blackspot-";
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverPopupRef = useRef(false);
  const hoveredBsIdRef = useRef<string | number | null>(null);

  // PDF report state
  const [pdfExport, setPdfExport] = useState<{
    crashIds: string[];
    bsId: number | string;
    priorityLabel?: string;
  } | null>(null);

  // Remarks state: maps crash_ids_hash → RemarkClusterSummary
  const [remarksMap, setRemarksMap] = useState<Record<string, RemarkClusterSummary>>({});
  // Maps bs_id → crash_ids_hash for lookup when rendering popup
  const [bsIdToHash, setBsIdToHash] = useState<Record<string, string>>({});

  // Timeline modal state
  const [timelineModalData, setTimelineModalData] = useState<{
    crashIds: string;
    bsId?: number | string;
    priorityScore?: number;
    priorityLabel?: string;
    crashCount?: number;
    centroidLat?: number;
    centroidLon?: number;
  } | null>(null);

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

    const loader = fetchFn ?? fetchGujaratBlackspots;

    loader(filters, filters.district?.[0] || "")
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

  // ── Bulk-load remarks for all blackspot clusters ─────────────────────────
  useEffect(() => {
    if (!data || data.centroids.features.length === 0) return;

    let active = true;

    (async () => {
      try {
        const features = data.centroids.features;
        const hashEntries: { bsId: string; hash: string }[] = [];
        const clusterItems: ClusterLookupItem[] = [];

        // Compute hashes and extract centroids for each cluster
        for (const f of features) {
          const crashIdsStr = f.properties?.crash_ids;
          const bsId = f.properties?.bs_id;
          if (!crashIdsStr || bsId === undefined) continue;

          const ids = String(crashIdsStr).split(",").map((id: string) => id.trim()).filter(Boolean);
          if (ids.length === 0) continue;

          const hash = await computeCrashIdsHash(ids);
          hashEntries.push({ bsId: String(bsId), hash });

          const coords = f.geometry && f.geometry.type === "Point" ? f.geometry.coordinates : null;
          if (coords) {
            clusterItems.push({
              bs_id: String(bsId),
              hash,
              centroid_lat: coords[1],
              centroid_lon: coords[0],
              radius_m: data?.radius_m ?? SEARCH_RADIUS_M,
            });
          }
        }

        if (!active || hashEntries.length === 0) return;

        // Build bs_id → hash mapping
        const idToHash: Record<string, string> = {};
        for (const { bsId, hash } of hashEntries) {
          idToHash[bsId] = hash;
        }
        setBsIdToHash(idToHash);

        // Fetch remarks in batch using 2-tier spatial + hash lookup
        const remarks = await fetchRemarksBulk(clusterItems);
        if (active) setRemarksMap(remarks);
      } catch (err) {
        console.warn("[BlackspotDetectionLayers] Failed to load remarks:", err);
      }
    })();

    return () => { active = false; };
  }, [data]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clusterLayers = [
      `${idPrefix}circles-fill`,
      `${idPrefix}centroids-point`,
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
            vehicle_count: f.properties?.vehicle_count,
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
    if (!cluster || !cluster.crash_ids) return;
    const ids = String(cluster.crash_ids)
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    setPdfExport({
      crashIds: ids,
      bsId: cluster.bs_id ?? 0,
      priorityLabel: cluster.priority_label,
    });
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



      <Source
        id={`${idPrefix}circles-source`}
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id={`${idPrefix}circles-fill`}
          type="fill"
          paint={{
            "fill-color": isStandardMorth
              ? (["coalesce", ["get", "priority_color"], "#DC2626"] as any)
              : (PRIORITY_COLOR_EXPR as any),
            "fill-opacity": isStandardMorth
              ? 0.12
              : [
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
          id={`${idPrefix}circles-outline`}
          type="line"
          paint={{
            "line-color": isStandardMorth
              ? (["coalesce", ["get", "priority_color"], "#DC2626"] as any)
              : (PRIORITY_COLOR_EXPR as any),
            "line-width": isStandardMorth
              ? 2.2
              : [
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
            ...(isStandardMorth ? {} : { "line-dasharray": [2, 1] }),
            "line-opacity": isStandardMorth
              ? 0.95
              : [
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
        id={`${idPrefix}centroids-source`}
        type="geojson"
        data={data.centroids as any}
      >
        <Layer
          id={`${idPrefix}centroids-shadow`}
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
          id={`${idPrefix}centroids-point`}
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
            "circle-color": isStandardMorth
              ? (["coalesce", ["get", "priority_color"], "#DC2626"] as any)
              : (PRIORITY_COLOR_EXPR as any),
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
            remarksSummary={
              hovered.bs_id !== undefined && bsIdToHash[String(hovered.bs_id)]
                ? remarksMap[bsIdToHash[String(hovered.bs_id)]] ?? null
                : null
            }
            onOpenTimeline={() => {
              if (hovered.crash_ids) {
                setTimelineModalData({
                  crashIds: String(hovered.crash_ids),
                  bsId: hovered.bs_id,
                  priorityScore: hovered.priority_score,
                  priorityLabel: hovered.priority_label,
                  crashCount: hovered.crash_count,
                  centroidLat: hovered.latitude,
                  centroidLon: hovered.longitude,
                });
              }
            }}
          />
        </Popup>
      )}

      {/* Remarks Timeline Modal */}
      {timelineModalData && (
        <BlackspotRemarksTimelineModal
          isOpen={true}
          onClose={() => setTimelineModalData(null)}
          crashIds={timelineModalData.crashIds}
          clusterId={timelineModalData.bsId}
          priorityScore={timelineModalData.priorityScore}
          priorityLabel={timelineModalData.priorityLabel}
          crashCount={timelineModalData.crashCount}
          district={districtName || filters.district?.[0]}
          centroidLat={timelineModalData.centroidLat}
          centroidLon={timelineModalData.centroidLon}
          visualizationType="blackspot"
          onRemarkAdded={(newRemark) => {
            const bsIdStr = timelineModalData.bsId !== undefined ? String(timelineModalData.bsId) : null;
            const hash = bsIdStr ? bsIdToHash[bsIdStr] : null;
            if (hash) {
              setRemarksMap((prev) => ({
                ...prev,
                [hash]: {
                  count: (prev[hash]?.count || 0) + 1,
                  latest_remark: newRemark,
                },
              }));
            }
          }}
          onRemarkUpdated={(updatedRemark) => {
            const bsIdStr = timelineModalData.bsId !== undefined ? String(timelineModalData.bsId) : null;
            const hash = bsIdStr ? bsIdToHash[bsIdStr] : null;
            if (hash && remarksMap[hash]?.latest_remark?.id === updatedRemark.id) {
              setRemarksMap((prev) => ({
                ...prev,
                [hash]: {
                  ...prev[hash],
                  latest_remark: updatedRemark,
                },
              }));
            }
          }}
          onRemarkDeleted={(_remarkId, remainingCount, latestRemark) => {
            const bsIdStr = timelineModalData.bsId !== undefined ? String(timelineModalData.bsId) : null;
            const hash = bsIdStr ? bsIdToHash[bsIdStr] : null;
            if (hash) {
              setRemarksMap((prev) => ({
                ...prev,
                [hash]: {
                  count: remainingCount,
                  latest_remark: latestRemark,
                },
              }));
            }
          }}
        />
      )}

      {/* PDF Report Generator */}
      {pdfExport && (
        <BlackspotPdfReport
          crashIds={pdfExport.crashIds}
          bsId={pdfExport.bsId}
          priorityLabel={pdfExport.priorityLabel}
          detectionMethod={analysisLabel}
          districtName={districtName || filters.district?.[0]}
          filters={filters}
          onComplete={() => setPdfExport(null)}
          onError={(msg) => {
            console.error("[BlackspotPdfReport] Error:", msg);
            setPdfExport(null);
          }}
        />
      )}
    </>
  );
}

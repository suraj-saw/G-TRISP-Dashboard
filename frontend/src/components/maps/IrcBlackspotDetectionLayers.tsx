/**
 * @file IrcBlackspotDetectionLayers.tsx
 * @description Renders dynamic map layers for IRC Blackspot detection.
 * @responsibility Fetches IRC blackspot cluster data, renders Maplibre Source/Layer definitions (clusters and individual points).
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Source, Layer, useMap, Popup } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import { type BlackspotData } from "../../api/gujaratDashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";
import {
  IRC_CATEGORY_COLOR_EXPR,
} from "../../config/ircBlackspotConfig";
import CompactBlackspotPopup, {
  type BlackspotPopupData,
} from "./CompactBlackspotPopup";
import { BlackspotPdfReport } from "../../features/export/BlackspotPdfReport";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<BlackspotData>;
  exportFn?: (crashIds: string[], filename: string) => Promise<void>;
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
  districtName?: string;
}

/**
 * Data structure representing a hovered feature on the map (either a blackspot cluster or an individual crash point).
 * Contains location data, cluster metadata, and severity counts to populate the interactive map popup.
 */
interface HoveredIrcBlackspot {
  longitude: number;
  latitude: number;
  bs_id?: number;
  crash_count?: number;
  aatc?: number;
  category?: number;
  category_label?: string;
  category_color?: string;
  fatal_count?: number;
  grievous_count?: number;
  minor_hospitalized_count?: number;
  minor_non_hospitalized_count?: number;
  no_injury_count?: number;
  crash_ids?: string;
  vehicle_count?: number;
  isPoint?: boolean;
}




export default function IrcBlackspotDetectionLayers({
  filters,
  fetchFn,
  exportFn,
  analysisLabel = "IRC 131 Blackspot",
  crashLabel = "crashes",
  districtName,
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredIrcBlackspot | null>(null);

  // References to handle the popup dismiss delay, allowing the user to move their mouse from the cluster to the popup
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverPopupRef = useRef(false);
  const hoveredBsIdRef = useRef<string | number | null>(null);

  // PDF report state
  const [pdfExport, setPdfExport] = useState<{
    crashIds: string[];
    bsId: number | string;
    priorityLabel?: string;
  } | null>(null);

  const filterKey = toDataFilterKey(filters);

  /**
   * Schedules the hover popup to be dismissed after a short delay.
   * If the user moves their mouse over the popup itself during this delay, it cancels the dismissal.
   */
  const scheduleDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isOverPopupRef.current) {
        hoveredBsIdRef.current = null;
        setHovered(null);
      }
    }, 200);
  }, []);

  /**
   * Immediately clears any scheduled popup dismissals, keeping the popup visible.
   */
  const cancelDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleExportData = async (info: BlackspotPopupData | HoveredIrcBlackspot) => {
    if (!info.crash_ids) return;
    const ids = info.crash_ids.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) return;

    setPdfExport({
      crashIds: ids,
      bsId: info.bs_id ?? 0,
      priorityLabel: (info as HoveredIrcBlackspot).category_label || 
                     ((info as HoveredIrcBlackspot).category !== undefined ? `Category ${(info as HoveredIrcBlackspot).category}` : undefined),
    });
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    hoveredBsIdRef.current = null;
    setHovered(null);

    fetchFn(filters)
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
  }, [filterKey, fetchFn]);

  // --------------------------------------------------------------------------
  // Map Interactions (Hovering, Pointer changes)
  // --------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    // Define which map layers trigger the hover popup event
    const clusterLayers = [
      "irc-blackspot-circles-fill",
      "irc-blackspot-centroids-point",
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

          if (
            hoveredBsIdRef.current !== null &&
            String(hoveredBsIdRef.current) === String(newBsId)
          ) {
            return;
          }

          let lon = e.lngLat.lng;
          let lat = e.lngLat.lat;
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
            }
          }

          hoveredBsIdRef.current = newBsId;
          setHovered({
            longitude: lon,
            latitude: lat,
            bs_id: f.properties?.bs_id,
            crash_count: f.properties?.crash_count,
            aatc: f.properties?.aatc,
            category: f.properties?.category,
            category_label: f.properties?.category_label,
            category_color: f.properties?.category_color,
            fatal_count: f.properties?.fatal_count,
            grievous_count: f.properties?.grievous_count,
            minor_hospitalized_count: f.properties?.minor_hospitalized_count,
            minor_non_hospitalized_count: f.properties?.minor_non_hospitalized_count,
            no_injury_count: f.properties?.no_injury_count,
            crash_ids: f.properties?.crash_ids != null ? String(f.properties.crash_ids) : undefined,
            vehicle_count: f.properties?.vehicle_count,
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
          No blackspots found for the given criteria.
        </span>
      </StatusBadge>
    );
  }

  return (
    <>
      <Source
        id="irc-blackspot-circles-source"
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id="irc-blackspot-circles-fill"
          type="fill"
          paint={{
            "fill-color": IRC_CATEGORY_COLOR_EXPR as any,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.35,
              10,
              0.30,
              13,
              0.20,
              15,
              0.10,
            ],
          }}
        />
        <Layer
          id="irc-blackspot-circles-outline"
          type="line"
          paint={{
            "line-color": IRC_CATEGORY_COLOR_EXPR as any,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              1.2,
              10,
              2.0,
              14,
              1.5,
              16,
              1.0,
            ],
            "line-dasharray": [2, 1],
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.8,
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
        id="irc-blackspot-centroids-source"
        type="geojson"
        data={data.centroids as any}
      >
        <Layer
          id="irc-blackspot-centroids-shadow"
          type="circle"
          paint={{
            "circle-radius": [
              "*",
              [
                "interpolate",
                ["linear"],
                ["get", "crash_count"],
                2,
                6,
                5,
                8,
                15,
                12,
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
                5,
                0.7,
                8,
                0.9,
                12,
                1.0,
                15,
                1.2,
              ],
            ],
            "circle-color": "#000000",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.1,
              10,
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
          id="irc-blackspot-centroids-point"
          type="circle"
          paint={{
            "circle-radius": [
              "*",
              [
                "interpolate",
                ["linear"],
                ["get", "crash_count"],
                2,
                4.5,
                5,
                6.0,
                15,
                9.0,
                50,
                13.0,
                150,
                17.0,
                350,
                22.0,
              ],
              [
                "interpolate",
                ["linear"],
                ["zoom"],
                5,
                0.75,
                8,
                0.9,
                12,
                1.0,
                15,
                1.2,
              ],
            ],
            "circle-color": IRC_CATEGORY_COLOR_EXPR as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              0.85,
              8,
              0.9,
              12,
              0.95,
              15,
              1.0,
            ],
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5,
              1.0,
              8,
              1.2,
              12,
              1.8,
              15,
              2.5,
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": 1.0,
          }}
        />
      </Source>

      <StatusBadge>
        <span className="flex items-center gap-1.5">
          <span className="text-blue-600 font-bold">
            {data.total_blackspots}
          </span>{" "}
          IRC Blackspots
        </span>
        <span className="text-slate-300">|</span>
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800">{data.total_crashes}</span>{" "}
          {crashLabel}
        </span>
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
            data={{
              ...hovered,
              priority_label:
                hovered.category_label ||
                (hovered.category !== undefined
                  ? `Category ${hovered.category}`
                  : undefined),
            }}
            onExport={handleExportData}
            onMouseEnter={() => {
              isOverPopupRef.current = true;
              cancelDismiss();
            }}
            onMouseLeave={() => {
              isOverPopupRef.current = false;
              scheduleDismiss();
            }}
          />
        </Popup>
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

/**
 * @file IrcBlackspotDetectionLayers.tsx
 * @description Renders dynamic map layers for IRC Blackspot detection.
 * @responsibility Fetches IRC blackspot cluster data, renders Maplibre Source/Layer definitions (clusters and individual points).
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Source, Layer, useMap, Popup } from "react-map-gl/maplibre";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { type BlackspotData } from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";
import {
  IRC_CATEGORY_COLOR_EXPR,
} from "../../config/ircBlackspotConfig";
// import { SEARCH_RADIUS_M } from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<BlackspotData>;
  exportFn?: (crashIds: string[], filename: string) => Promise<void>;
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
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
  isPoint?: boolean;
}

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
          },
        })) || [],
  };
}

export default function IrcBlackspotDetectionLayers({
  filters,
  fetchFn,
  exportFn,
  heatmapData,
  analysisLabel = "IRC 131 Blackspot",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredIrcBlackspot | null>(null);

  // References to handle the popup dismiss delay, allowing the user to move their mouse from the cluster to the popup
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOverPopupRef = useRef(false);

  const filterKey = toDataFilterKey(filters);

  /**
   * Schedules the hover popup to be dismissed after a short delay.
   * If the user moves their mouse over the popup itself during this delay, it cancels the dismissal.
   */
  const scheduleDismiss = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      if (!isOverPopupRef.current) {
        setHovered(null);
      }
    }, 150);
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

  const handleExportData = async (info: HoveredIrcBlackspot) => {
    if (!exportFn || !info.crash_ids) return;
    const ids = info.crash_ids.split(",").map((id) => id.trim());
    await exportFn(ids, `irc-blackspot-${info.bs_id}-crashes.csv`);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
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
          
          let lon = e.lngLat.lng;
          let lat = e.lngLat.lat;
          if (f.geometry.type === "Point") {
            [lon, lat] = f.geometry.coordinates as [number, number];
          } else {
            const centroidFeat = data?.centroids?.features?.find(
              (cf: any) => cf.properties?.bs_id === f.properties?.bs_id
            );
            if (centroidFeat && centroidFeat.geometry.type === "Point") {
              [lon, lat] = centroidFeat.geometry.coordinates as [
                number,
                number,
              ];
            }
          }

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

  const accidentGeojson = buildAccidentGeojson(heatmapData);

  return (
    <>
      {accidentGeojson.features.length > 0 && (
        <Source
          id="irc-blackspot-accident-source"
          type="geojson"
          data={accidentGeojson as any}
        >
          <Layer
            id="irc-blackspot-accident-halo"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 15, 7, 17, 10],
              "circle-color": severityColorExpression as any,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 0.15, 15, 0.25],
              "circle-blur": 0.8,
            }}
          />
          <Layer
            id="irc-blackspot-accident-points"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 13, 2.5, 15, 4, 17, 5.5, 19, 7],
              "circle-color": severityColorExpression as any,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 0.65, 14, 0.85, 15, 0.95],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 0.6, 15, 0.9],
            }}
          />
        </Source>
      )}

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
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.45, 13, 0.3, 15, 0.15],
          }}
        />
        <Layer
          id="irc-blackspot-circles-outline"
          type="line"
          paint={{
            "line-color": IRC_CATEGORY_COLOR_EXPR as any,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 2, 16, 1.5],
            "line-dasharray": [2, 1],
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 0.8, 17, 0.5],
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
              ["interpolate", ["linear"], ["get", "crash_count"], 5, 7, 15, 11, 50, 16, 150, 22, 350, 28],
              ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 0.6, 15, 1]
            ],
            "circle-color": "#000000",
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0, 12, 0.15, 14, 0.2, 17, 0.05],
            "circle-blur": 1.5,
          }}
        />
        <Layer
          id="irc-blackspot-centroids-point"
          type="circle"
          paint={{
            "circle-radius": [
              "*",
              ["interpolate", ["linear"], ["get", "crash_count"], 5, 5, 15, 8, 50, 12, 150, 16, 350, 20],
              ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 0.6, 15, 1]
            ],
            "circle-color": IRC_CATEGORY_COLOR_EXPR as any,
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.7, 12, 0.85, 15, 0.95],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.5, 15, 2.5],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 0.8, 15, 1],
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

      {/* Render popup for hovered blackspot cluster */}
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
                backgroundColor: hovered.category_color,
              }}
            >
              {hovered.category_label || `Category ${hovered.category}`}
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

              <div className="text-xs text-slate-500 mb-3 text-center">
                <span className="font-bold text-slate-700">
                  {hovered.crash_count}
                </span>{" "}
                total crashes
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  AATC Score
                </span>
                <span className="text-sm font-bold text-slate-700">
                  {hovered.aatc?.toFixed(2) ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

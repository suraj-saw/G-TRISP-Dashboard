// frontend/src/components/maps/BlackspotDetectionLayers.tsx

import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import {
  Loader2,
  AlertCircle,
  Skull,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { fetchBlackspots, type BlackspotData } from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import {
  getIrcRiskColor,
  getIrcRiskLabel,
  IRC_COLOR_EXPR,
  IRC_RADIUS_M,
  IRC_MIN_CRASHES,
  IRC_MIN_ASI,
} from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
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
  minor_count?: number;
  asi?: number;
  risk_label?: string;
  qualifies_by?: string;
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
  accident_date_time?: string | null;
  isPoint?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#4C1D1D",
  "Grievous Injury": "#DC2626",
  "Minor Injury": "#EA580C",
  "Damage Only": "#FBBF24",
};

const severityColorExpression = [
  "match",
  ["get", "severity"],
  "Fatal",
  "#4C1D1D",
  "Grievous Injury",
  "#DC2626",
  "Minor Injury",
  "#EA580C",
  "Damage Only",
  "#FBBF24",
  "#64748b",
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

export default function BlackspotDetectionLayers({
  filters,
  fetchFn,
  heatmapData,
  analysisLabel = "IRC SP:88-2019 blackspot detection",
  crashLabel = "crashes",
}: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);
  const [selected, setSelected] = useState<HoveredBlackspot | null>(null);

  const accidentGeojson = buildAccidentGeojson(heatmapData);

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
  }, [
    filters.visualization_type,
    filters.district,
    filters.year,
    filters.severity,
    filters.road_classification,
    filters.weather_condition,
    filters.light_condition,
    filters.collision_type,
    filters.date_from,
    filters.date_to,
  ]);

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
          map_.getCanvas().style.cursor = "pointer";
          const f = clusterFeats[0];
          setHovered({
            longitude: e.lngLat.lng,
            latitude: e.lngLat.lat,
            bs_id: f.properties?.bs_id,
            crash_count: f.properties?.crash_count,
            fatal_count: f.properties?.fatal_count,
            grievous_count: f.properties?.grievous_count,
            minor_count: f.properties?.minor_count,
            asi: f.properties?.asi,
            risk_label: f.properties?.risk_label,
            qualifies_by: f.properties?.qualifies_by,
            isPoint: false,
          });
          return;
        }
      }

      map_.getCanvas().style.cursor = hasPoint ? "pointer" : "";
      setHovered(null);
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
            severity: f.properties?.severity,
            police_station: f.properties?.police_station,
            road_name: f.properties?.road_name,
            accident_date_time: f.properties?.accident_date_time,
            isPoint: true,
          });
          return;
        }
      }
    };

    map.on("mousemove", onMove);
    map.on("click", onClick);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, data]);

  const StatusBadge = ({ children }: { children: React.ReactNode }) => (
    <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20">
      <div className="pointer-events-auto rounded-full border border-slate-200/50 bg-white/90 px-5 py-3 shadow-xl backdrop-blur-md text-sm font-medium text-slate-700 flex items-center gap-3 transition-all duration-300 hover:bg-white/95">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={16} className="animate-spin text-blue-600" />
        Running {analysisLabel}…
      </StatusBadge>
    );
  }

  if (error) {
    return (
      <StatusBadge>
        <AlertCircle size={16} className="text-red-500" />
        <span className="text-red-600 font-semibold">{error}</span>
      </StatusBadge>
    );
  }

  if (!data || data.circles.features.length === 0) {
    return (
      <StatusBadge>
        <AlertCircle size={16} className="text-amber-500" />
        <span>
          No IRC blackspots found — criteria:{" "}
          <span className="font-bold text-amber-600">≥{IRC_MIN_CRASHES}</span>{" "}
          {crashLabel} or ASI{" "}
          <span className="font-bold text-amber-600">≥{IRC_MIN_ASI}</span>{" "}
          within {data?.radius_m ?? IRC_RADIUS_M} m.
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
            "fill-color": IRC_COLOR_EXPR as any,
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
            "line-color": IRC_COLOR_EXPR as any,
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
            "circle-color": IRC_COLOR_EXPR as any,
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
          IRC Blackspots
        </span>
        <span className="text-slate-300">|</span>
        <span className="flex items-center gap-1.5">
          <span className="font-bold text-slate-800">{data.total_crashes}</span>{" "}
          {crashLabel}
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500 text-xs">
          SP:88-2019 ({IRC_RADIUS_M}m)
        </span>
      </StatusBadge>

      {hovered && !hovered.isPoint && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
          className="z-50"
        >
          <div className="w-64 overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div
              className="px-4 py-2 text-[10px] font-bold tracking-widest text-white uppercase"
              style={{ backgroundColor: getIrcRiskColor(hovered.asi ?? 0) }}
            >
              {hovered.risk_label ?? getIrcRiskLabel(hovered.asi ?? 0)}
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-extrabold text-slate-800">
                  Cluster #{hovered.bs_id}
                </div>
                <div
                  className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100"
                  style={{ color: getIrcRiskColor(hovered.asi ?? 0) }}
                >
                  ASI {hovered.asi ?? "—"}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-red-50 border border-red-100">
                  <Skull size={14} className="text-[#4C1D1D] mb-1" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Fatal
                  </span>
                  <span className="text-sm font-bold text-[#4C1D1D]">
                    {hovered.fatal_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-orange-50 border border-orange-100">
                  <AlertTriangle size={14} className="text-[#DC2626] mb-1" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Grievous
                  </span>
                  <span className="text-sm font-bold text-[#DC2626]">
                    {hovered.grievous_count ?? "—"}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                  <ShieldAlert size={14} className="text-[#EA580C] mb-1" />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                    Minor
                  </span>
                  <span className="text-sm font-bold text-[#EA580C]">
                    {hovered.minor_count ?? "—"}
                  </span>
                </div>
              </div>

              <div className="text-xs text-slate-500 mb-3 text-center">
                <span className="font-bold text-slate-700">
                  {hovered.crash_count?.toLocaleString()}
                </span>{" "}
                total crashes within {IRC_RADIUS_M}m
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
          anchor="top"
          closeButton={false}
          closeOnClick={false}
          onClose={() => setSelected(null)}
          offset={12}
          className="z-50"
        >
          <div className="w-56 overflow-hidden rounded-xl bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            <div
              className="px-4 py-2 text-[10px] font-bold tracking-widest text-white uppercase flex justify-between items-center"
              style={{
                backgroundColor:
                  SEVERITY_COLORS[selected.severity ?? ""] ?? "#64748b",
              }}
            >
              <span>{safeText(selected.severity)}</span>
              <button
                onClick={() => setSelected(null)}
                className="opacity-70 hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
            </div>
            <div className="p-4 text-xs text-slate-700 space-y-2">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-slate-400 font-semibold">
                  Police Station
                </span>
                <span className="font-medium text-slate-800">
                  {safeText(selected.police_station)}
                </span>
              </div>
              {selected.road_name &&
                safeText(selected.road_name) !== UNKNOWN_LABEL && (
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-slate-400 font-semibold">
                      Road
                    </span>
                    <span className="font-medium text-slate-800">
                      {safeText(selected.road_name)}
                    </span>
                  </div>
                )}
              <div className="pt-2 mt-2 border-t border-slate-100 text-slate-500 font-medium">
                {formatDate(selected.accident_date_time)}
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

// frontend/src/components/maps/BlackspotDetectionLayers.tsx
import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchBlackspots, type BlackspotData } from "../../api/dashboardApi";
import type { DashboardFilters, HeatmapPoint } from "../../types/dashboard";
import {
  getRiskColor,
  getRiskLabel,
  BS_COLOR_EXPR,
} from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
  /** Raw accident points for individual markers at high zoom */
  heatmapData?: HeatmapPoint[];
  analysisLabel?: string;
  crashLabel?: string;
}

interface HoveredBlackspot {
  longitude: number;
  latitude: number;
  bs_id?: number;
  crash_count?: number;
  // individual point fields
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
  accident_date_time?: string | null;
  isPoint?: boolean;
}

const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#dc2626",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#2563eb",
  "Damage Only": "#22c55e",
};

const severityColorExpression = [
  "match",
  ["get", "severity"],
  "Fatal",
  "#dc2626",
  "Grievous Injury",
  "#f97316",
  "Minor Injury",
  "#2563eb",
  "Damage Only",
  "#22c55e",
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
  analysisLabel = "greedy blackspot detection",
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

      // Fall back to blackspot circles/centroids
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
      <div className="pointer-events-auto rounded-xl border border-[#E4E8F4] bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm text-xs font-semibold text-slate-600 flex items-center gap-2">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={14} className="animate-spin text-[#2C6EF2]" />
        Running {analysisLabel}…
      </StatusBadge>
    );
  }

  if (error) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-red-500" />
        <span className="text-red-600">{error}</span>
      </StatusBadge>
    );
  }

  if (!data || data.circles.features.length === 0) {
    return (
      <StatusBadge>
        <AlertCircle size={14} className="text-amber-500" />
        No blackspots found for the current filters (min{" "}
        {data?.min_crashes ?? 5} {crashLabel} within {data?.radius_m ?? 250}m). Total
        {crashLabel} considered: {data?.total_crashes ?? 0}.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* ── Individual accident points — fade in at zoom 13+ ─────────────── */}
      {accidentGeojson.features.length > 0 && (
        <Source
          id="blackspot-accident-source"
          type="geojson"
          data={accidentGeojson as any}
        >
          {/* Outer glow halo */}
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
          {/* Core point */}
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
                0.55,
                14,
                0.75,
                15,
                0.92,
              ],
              "circle-stroke-width": 1.2,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                12,
                0,
                13,
                0.5,
                15,
                0.9,
              ],
            }}
          />
        </Source>
      )}

      {/* ── Blackspot influence circles ───────────────────────────────────── */}
      <Source
        id="blackspot-circles-source"
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id="blackspot-circles-fill"
          type="fill"
          paint={{
            "fill-color": BS_COLOR_EXPR as any,
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.3,
              13,
              0.2,
              15,
              0.1,
            ],
          }}
        />
        <Layer
          id="blackspot-circles-outline"
          type="line"
          paint={{
            "line-color": BS_COLOR_EXPR as any,
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
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              15,
              0.6,
              17,
              0.3,
            ],
          }}
        />
      </Source>

      {/* ── Blackspot anchor centroids ────────────────────────────────────── */}
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
            "circle-color": BS_COLOR_EXPR as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.95,
              14,
              0.8,
              15,
              0.55,
              16,
              0.2,
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
              0.55,
              16,
              0.15,
            ],
          }}
        />
        <Layer
          id="blackspot-centroids-label"
          type="symbol"
          layout={{
            "text-field": ["get", "crash_count"],
            "text-size": 11,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color": "#FFFFFF",
            "text-halo-color": "rgba(0,0,0,0.4)",
            "text-halo-width": 1,
            "text-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1,
              15,
              0.55,
              16,
              0.1,
            ],
          }}
        />
      </Source>

      <StatusBadge>
        {data.total_blackspots} blackspots · {data.total_crashes} {crashLabel}
        analyzed · {data.isolated_crashes} isolated
      </StatusBadge>

      {hovered && !hovered.isPoint && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
        >
          {/* Blackspot cluster popup */}
          <div style={{ minWidth: 170, fontFamily: "inherit" }}>
            <div
              style={{
                background: getRiskColor(hovered.crash_count ?? 0),
                color: "#fff",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                borderRadius: "6px 6px 0 0",
              }}
            >
              {getRiskLabel(hovered.crash_count ?? 0)}
            </div>
            <div
              style={{
                padding: "8px 10px 6px",
                fontSize: 12,
                color: "#1e293b",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                Blackspot #{hovered.bs_id}
              </div>
              <div style={{ color: "#64748b", marginTop: 2 }}>
                {(hovered.crash_count ?? 0).toLocaleString()} crashes within
                250m
              </div>
            </div>
          </div>
        </Popup>
      )}

      {selected && selected.isPoint && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          anchor="top"
          closeButton={true}
          closeOnClick={false}
          onClose={() => setSelected(null)}
          offset={12}
        >
          {/* Individual accident point popup */}
          <div style={{ minWidth: 200, fontFamily: "inherit" }}>
            <div
              style={{
                background:
                  SEVERITY_COLORS[selected.severity ?? ""] ?? "#64748b",
                color: "#fff",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                borderRadius: "6px 6px 0 0",
              }}
            >
              {safeText(selected.severity)}
            </div>
            <div
              style={{
                padding: "8px 10px 6px",
                fontSize: 12,
                color: "#1e293b",
              }}
            >
              <p style={{ marginBottom: 3 }}>
                <b>Station:</b> {safeText(selected.police_station)}
              </p>
              {selected.road_name &&
                safeText(selected.road_name) !== UNKNOWN_LABEL && (
                  <p style={{ marginBottom: 3 }}>
                    <b>Road:</b> {safeText(selected.road_name)}
                  </p>
                )}
              <p style={{ color: "#64748b", marginTop: 4, fontSize: 11 }}>
                {formatDate(selected.accident_date_time)}
              </p>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

// frontend/src/components/maps/DbscanBlackspotDetectionLayers.tsx
import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import {
  fetchDbscanBlackspots,
  type BlackspotData,
} from "../../api/dashboardApi";
import type { DashboardFilters } from "../../types/dashboard";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
}

interface HoveredBlackspot {
  longitude: number;
  latitude: number;
  bs_id: number;
  crash_count: number;
}

// ── Distinct palette so DBSCAN circles read differently from greedy ones ──
const DC_COLORS = {
  veryLow: "#0EA5E9", // Sky
  low: "#3B82F6", // Blue
  medium: "#6366F1", // Indigo
  high: "#7C3AED", // Violet
  critical: "#4C1D95", // Deep Purple
} as const;

const DC_COLOR_EXPR = [
  "step",
  ["get", "crash_count"],
  DC_COLORS.veryLow,
  15,
  DC_COLORS.low,
  50,
  DC_COLORS.medium,
  150,
  DC_COLORS.high,
  350,
  DC_COLORS.critical,
] as const;

function getDcRiskLabel(count: number): string {
  if (count >= 350) return "Critical Density Zone";
  if (count >= 150) return "High Density Zone";
  if (count >= 50) return "Medium Density Zone";
  if (count >= 15) return "Low Density Zone";
  return "Very Low Density Zone";
}

function getDcRiskColor(count: number): string {
  if (count >= 350) return DC_COLORS.critical;
  if (count >= 150) return DC_COLORS.high;
  if (count >= 50) return DC_COLORS.medium;
  if (count >= 15) return DC_COLORS.low;
  return DC_COLORS.veryLow;
}

export default function DbscanBlackspotDetectionLayers({ filters, fetchFn }: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);

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
  }, [
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
    if (!map || !data) return;

    const layers = ["dbscan-circles-fill", "dbscan-centroids-point"].filter(
      (id) => map.getLayer(id)
    );
    if (!layers.length) return;

    const onMove = (e: any) => {
      const feats = map.queryRenderedFeatures(e.point, { layers });
      if (feats.length) {
        map.getCanvas().style.cursor = "pointer";
        const f = feats[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          bs_id: f.properties?.bs_id,
          crash_count: f.properties?.crash_count,
        });
      } else {
        map.getCanvas().style.cursor = "";
        setHovered(null);
      }
    };

    map.on("mousemove", onMove);
    return () => {
      map.off("mousemove", onMove);
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
        <Loader2 size={14} className="animate-spin text-[#6366F1]" />
        Running DBSCAN blackspot detection…
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
        No DBSCAN blackspots found for the current filters (min{" "}
        {data?.min_crashes ?? 5} crashes within {data?.radius_m ?? 250}m,
        non-overlapping). Total crashes considered: {data?.total_crashes ?? 0}.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* dbscan_circles — fixed-radius, overlap-suppressed influence zones */}
      <Source
        id="dbscan-circles-source"
        type="geojson"
        data={data.circles as any}
      >
        <Layer
          id="dbscan-circles-fill"
          type="fill"
          paint={{
            "fill-color": DC_COLOR_EXPR as any,
            "fill-opacity": 0.25,
          }}
        />
        <Layer
          id="dbscan-circles-outline"
          type="line"
          paint={{
            "line-color": DC_COLOR_EXPR as any,
            "line-width": 2,
            "line-dasharray": [2, 1],
          }}
        />
      </Source>

      {/* dbscan_centroids — densest non-overlapping anchor points */}
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
              22,
            ],
            "circle-color": DC_COLOR_EXPR as any,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FFFFFF",
          }}
        />
        <Layer
          id="dbscan-centroids-label"
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
          }}
        />
      </Source>

      <StatusBadge>
        {data.total_blackspots} non-overlapping blackspots ·{" "}
        {data.total_crashes} crashes analyzed · {data.isolated_crashes} isolated
      </StatusBadge>

      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
        >
          <div style={{ minWidth: 170, fontFamily: "inherit" }}>
            <div
              style={{
                background: getDcRiskColor(hovered.crash_count),
                color: "#fff",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                borderRadius: "6px 6px 0 0",
              }}
            >
              {getDcRiskLabel(hovered.crash_count)}
            </div>
            <div
              style={{
                padding: "8px 10px 6px",
                fontSize: 12,
                color: "#1e293b",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                DBSCAN Blackspot #{hovered.bs_id}
              </div>
              <div style={{ color: "#64748b", marginTop: 2 }}>
                {hovered.crash_count.toLocaleString()} crashes within 250m
                (non-overlapping)
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

// frontend/src/components/maps/BlackspotDetectionLayers.tsx
import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchBlackspots, type BlackspotData } from "../../api/dashboardApi";
import type { DashboardFilters } from "../../types/dashboard";
import { getRiskColor, getRiskLabel, BS_COLOR_EXPR } from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
}

interface HoveredBlackspot {
  longitude: number;
  latitude: number;
  bs_id: number;
  crash_count: number;
}

export default function BlackspotDetectionLayers({ filters }: Props) {
  const { current: mapRef } = useMap();
  const [data, setData] = useState<BlackspotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredBlackspot | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchBlackspots(filters)
      .then((res) => {
        if (!active) return;
        console.log("[blackspots] response:", res);
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        console.error("[blackspots] fetch failed:", err);
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
    filters.district,
    filters.year,
    filters.severity,
    filters.road_classification,
    filters.weather_condition,
    filters.light_condition,
    filters.collision_type,
  ]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !data) return;

    const layers = ["blackspot-circles-fill", "blackspot-centroids-point"].filter((id) =>
      map.getLayer(id)
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

  // ── Visible status overlay (loading / error / empty) ──────────────────
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
        Running greedy blackspot detection…
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
        No blackspots found for the current filters (min {data?.min_crashes ?? 5}{" "}
        crashes within {data?.radius_m ?? 250}m). Total crashes considered:{" "}
        {data?.total_crashes ?? 0}.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* blackspot_circles — 250m greedy-cluster influence zones */}
      <Source id="blackspot-circles-source" type="geojson" data={data.circles as any}>
        <Layer
          id="blackspot-circles-fill"
          type="fill"
          paint={{
            "fill-color": BS_COLOR_EXPR as any,
            "fill-opacity": 0.25,
          }}
        />
        <Layer
          id="blackspot-circles-outline"
          type="line"
          paint={{
            "line-color": BS_COLOR_EXPR as any,
            "line-width": 2,
          }}
        />
      </Source>

      {/* blackspot_centroids — greedy-cluster anchor points */}
      <Source id="blackspot-centroids-source" type="geojson" data={data.centroids as any}>
        <Layer
          id="blackspot-centroids-point"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate", ["linear"], ["get", "crash_count"],
              5, 5, 15, 8, 50, 12, 150, 16, 350, 22,
            ],
            "circle-color": BS_COLOR_EXPR as any,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#FFFFFF",
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
          }}
        />
      </Source>

      <StatusBadge>
        {data.total_blackspots} blackspots · {data.total_crashes} crashes analyzed ·{" "}
        {data.isolated_crashes} isolated
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
                background: getRiskColor(hovered.crash_count),
                color: "#fff",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                borderRadius: "6px 6px 0 0",
              }}
            >
              {getRiskLabel(hovered.crash_count)}
            </div>
            <div style={{ padding: "8px 10px 6px", fontSize: 12, color: "#1e293b" }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Blackspot #{hovered.bs_id}</div>
              <div style={{ color: "#64748b", marginTop: 2 }}>
                {hovered.crash_count.toLocaleString()} crashes within 250m
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}
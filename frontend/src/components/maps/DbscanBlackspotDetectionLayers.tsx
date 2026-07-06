// frontend/src/components/maps/DbscanBlackspotDetectionLayers.tsx
//
// IRC SP:88-2019 / IRC:99-2018 compliant DBSCAN blackspot visualisation.
//
// Key changes from pre-IRC version:
//  • Colour steps driven by `asi` (Accident Severity Index) per IRC §4.2c.
//  • Tooltips show ASI, fatal/grievous/minor breakdown, and qualifying IRC
//    criteria.
//  • IRC radius constant (500 m) used in status badge.
//  • Risk labels reflect IRC tier names, not generic density labels.

import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, AlertCircle } from "lucide-react";
import {
  fetchDbscanBlackspots,
  type BlackspotData,
} from "../../api/dashboardApi";
import type { DashboardFilters } from "../../types/dashboard";
import {
  IRC_RADIUS_M,
  IRC_MIN_CRASHES,
  IRC_MIN_ASI,
} from "../../config/blackspotConfig";

interface Props {
  filters: DashboardFilters;
  fetchFn?: (filters: DashboardFilters) => Promise<BlackspotData>;
}

interface HoveredBlackspot {
  longitude: number;
  latitude: number;
  bs_id: number;
  crash_count: number;
  fatal_count?: number;
  grievous_count?: number;
  minor_count?: number;
  asi?: number;
  risk_label?: string;
  qualifies_by?: string;
}

// ── Distinct palette so DBSCAN circles read differently from greedy ones ──
// Colours still align with IRC ASI tier severity — blue-purple family so
// DBSCAN circles are visually distinct from the greedy red-orange family.
const DC_COLORS = {
  potential: "#0EA5E9", // sky          — sub-threshold / potential
  low: "#3B82F6", // blue         — Low Risk Blackspot   (ASI 15–29)
  medium: "#6366F1", // indigo       — Medium Risk Blackspot (ASI 30–59)
  high: "#7C3AED", // violet       — High Risk Blackspot   (ASI 60–99)
  veryHigh: "#5B21B6", // deep violet  — Very High Risk        (ASI 100–199)
  critical: "#4C1D95", // deep purple  — Critical              (ASI ≥ 200)
} as const;

// IRC ASI-driven colour step expression for DBSCAN layers
const DC_COLOR_EXPR = [
  "step",
  ["get", "asi"],
  DC_COLORS.potential, // default — sub-threshold
  15,
  DC_COLORS.low,
  30,
  DC_COLORS.medium,
  60,
  DC_COLORS.high,
  100,
  DC_COLORS.veryHigh,
  200,
  DC_COLORS.critical,
] as const;

function getDcRiskLabel(asi: number): string {
  if (asi >= 200) return "Critical Blackspot";
  if (asi >= 100) return "Very High Risk Blackspot";
  if (asi >= 60) return "High Risk Blackspot";
  if (asi >= 30) return "Medium Risk Blackspot";
  if (asi >= 15) return "Low Risk Blackspot";
  return "Potential Blackspot";
}

function getDcRiskColor(asi: number): string {
  if (asi >= 200) return DC_COLORS.critical;
  if (asi >= 100) return DC_COLORS.veryHigh;
  if (asi >= 60) return DC_COLORS.high;
  if (asi >= 30) return DC_COLORS.medium;
  if (asi >= 15) return DC_COLORS.low;
  return DC_COLORS.potential;
}

export default function DbscanBlackspotDetectionLayers({
  filters,
  fetchFn,
}: Props) {
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
          fatal_count: f.properties?.fatal_count,
          grievous_count: f.properties?.grievous_count,
          minor_count: f.properties?.minor_count,
          asi: f.properties?.asi,
          risk_label: f.properties?.risk_label,
          qualifies_by: f.properties?.qualifies_by,
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
        Running IRC SP:88-2019 DBSCAN blackspot detection…
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
        No IRC blackspots found — criteria: ≥{IRC_MIN_CRASHES} crashes or ASI ≥
        {IRC_MIN_ASI} within {data?.radius_m ?? IRC_RADIUS_M} m
        (non-overlapping). Total crashes considered: {data?.total_crashes ?? 0}.
      </StatusBadge>
    );
  }

  return (
    <>
      {/* ── DBSCAN influence circles — IRC 500 m radius ───────────────────── */}
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
            "fill-opacity": 0.22,
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

      {/* ── DBSCAN centroids — densest non-overlapping IRC anchor points ───── */}
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
            // Show ASI at low zoom, crash count at high zoom
            "text-field": [
              "step",
              ["zoom"],
              ["concat", "ASI ", ["to-string", ["get", "asi"]]],
              14,
              ["to-string", ["get", "crash_count"]],
            ],
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
        {data.total_blackspots} IRC blackspots (DBSCAN) · {data.total_crashes}{" "}
        crashes analyzed · {data.isolated_crashes} isolated · IRC SP:88-2019 (
        {IRC_RADIUS_M} m, ASI ≥ {IRC_MIN_ASI})
      </StatusBadge>

      {/* ── Hover tooltip — IRC DBSCAN blackspot ─────────────────────────── */}
      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
        >
          <div style={{ minWidth: 210, fontFamily: "inherit" }}>
            {/* IRC risk tier header */}
            <div
              style={{
                background: getDcRiskColor(hovered.asi ?? 0),
                color: "#fff",
                padding: "6px 10px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                borderRadius: "6px 6px 0 0",
              }}
            >
              {hovered.risk_label ?? getDcRiskLabel(hovered.asi ?? 0)}
            </div>

            <div
              style={{
                padding: "8px 10px 6px",
                fontSize: 12,
                color: "#1e293b",
              }}
            >
              {/* Blackspot ID + ASI */}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
                DBSCAN Blackspot #{hovered.bs_id}
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    color: getDcRiskColor(hovered.asi ?? 0),
                  }}
                >
                  ASI {hovered.asi ?? "—"}
                </span>
              </div>

              {/* Severity breakdown */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "2px 8px",
                  fontSize: 11,
                  marginBottom: 5,
                }}
              >
                <span style={{ color: "#4C1D1D", fontWeight: 600 }}>
                  ☠ Fatal: {hovered.fatal_count ?? "—"}
                </span>
                <span style={{ color: "#DC2626", fontWeight: 600 }}>
                  ⚠ Grievous: {hovered.grievous_count ?? "—"}
                </span>
                <span style={{ color: "#EA580C", fontWeight: 600 }}>
                  ▲ Minor: {hovered.minor_count ?? "—"}
                </span>
              </div>

              <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>
                {hovered.crash_count.toLocaleString()} total crashes within{" "}
                {IRC_RADIUS_M} m (non-overlapping)
              </div>

              {/* IRC qualifying criteria */}
              {hovered.qualifies_by && (
                <div
                  style={{
                    borderTop: "1px solid #E2E8F0",
                    paddingTop: 5,
                    marginTop: 4,
                    fontSize: 10,
                    color: "#475569",
                    fontStyle: "italic",
                  }}
                >
                  {hovered.qualifies_by.split(" | ").map((criterion, idx) => (
                    <div key={idx}>✓ {criterion}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

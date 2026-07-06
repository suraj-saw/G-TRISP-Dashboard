// frontend/src/components/maps/DbscanBlackspotDetectionLayers.tsx

import { useEffect, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import {
  Loader2,
  AlertCircle,
  Skull,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
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

const DC_COLORS = {
  potential: "#0EA5E9",
  low: "#3B82F6",
  medium: "#6366F1",
  high: "#7C3AED",
  veryHigh: "#5B21B6",
  critical: "#4C1D95",
} as const;

const DC_COLOR_EXPR = [
  "step",
  ["get", "asi"],
  DC_COLORS.potential,
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
      <div className="pointer-events-auto rounded-full border border-slate-200/50 bg-white/90 px-5 py-3 shadow-xl backdrop-blur-md text-sm font-medium text-slate-700 flex items-center gap-3 transition-all duration-300 hover:bg-white/95">
        {children}
      </div>
    </div>
  );

  if (loading) {
    return (
      <StatusBadge>
        <Loader2 size={16} className="animate-spin text-indigo-500" />
        Running IRC SP:88-2019 DBSCAN detection…
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
          crashes or ASI{" "}
          <span className="font-bold text-amber-600">≥{IRC_MIN_ASI}</span>{" "}
          within {data?.radius_m ?? IRC_RADIUS_M} m.
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
            "fill-color": DC_COLOR_EXPR as any,
            "fill-opacity": 0.15,
          }}
        />
        <Layer
          id="dbscan-circles-outline"
          type="line"
          paint={{
            "line-color": DC_COLOR_EXPR as any,
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
              22,
            ],
            "circle-color": DC_COLOR_EXPR as any,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": 0.9,
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
          Crashes
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500 text-xs">
          SP:88-2019 ({IRC_RADIUS_M}m)
        </span>
      </StatusBadge>

      {hovered && (
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
              style={{ backgroundColor: getDcRiskColor(hovered.asi ?? 0) }}
            >
              {hovered.risk_label ?? getDcRiskLabel(hovered.asi ?? 0)}
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-extrabold text-slate-800">
                  Cluster #{hovered.bs_id}
                </div>
                <div
                  className="px-2 py-0.5 text-xs font-bold rounded-full bg-slate-100"
                  style={{ color: getDcRiskColor(hovered.asi ?? 0) }}
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
                  {hovered.crash_count.toLocaleString()}
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

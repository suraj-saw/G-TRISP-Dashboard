/**
 * @file SnappedAccidentLayers.tsx
 * @description Renders network-snapped accident locations and the snapping path connecting the original to the snapped location.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { Source, Layer, Popup } from "react-map-gl/maplibre";
import { Loader2 } from "lucide-react";
import type { DashboardFilters } from "../../types/dashboard";
import type { SnappedHeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<{ total: number; data: SnappedHeatmapPoint[] }>;
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

const getSeverityBadgeClasses = (severity?: string | null): string => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal"))
    return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  if (s.includes("grievous"))
    return "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20";
  if (s.includes("minor injury hospitalized"))
    return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20";
  if (s.includes("minor injury non"))
    return "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20";
  if (s.includes("no injury") || s.includes("damage only"))
    return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
  return "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20";
};

type HoveredPoint = SnappedHeatmapPoint & {
  longitude: number;
  latitude: number;
};

export default function SnappedAccidentLayers({ filters, fetchFn }: Props) {
  const [data, setData] = useState<{ total: number; data: SnappedHeatmapPoint[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint | null>(null);

  const filterKey = toDataFilterKey(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchFn(filters)
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Failed to fetch snapped accidents");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filterKey, fetchFn]); // eslint-disable-line react-hooks/exhaustive-deps

  const geojson = useMemo(() => {
    if (!data || !data.data) {
      return {
        points: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
        lines: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
      };
    }

    const pointFeatures = data.data.map((pt) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [pt.longitude, pt.latitude],
      },
      properties: { ...pt },
    })) as GeoJSON.Feature[];

    const originalPointFeatures = data.data.map((pt) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [pt.original_longitude, pt.original_latitude],
      },
      properties: { ...pt, is_original: true },
    })) as GeoJSON.Feature[];

    const lineFeatures = data.data.map((pt) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [pt.original_longitude, pt.original_latitude],
          [pt.longitude, pt.latitude],
        ],
      },
      properties: { ...pt },
    })) as GeoJSON.Feature[];

    return {
      points: { type: "FeatureCollection", features: pointFeatures } as GeoJSON.FeatureCollection,
      originalPoints: { type: "FeatureCollection", features: originalPointFeatures } as GeoJSON.FeatureCollection,
      lines: { type: "FeatureCollection", features: lineFeatures } as GeoJSON.FeatureCollection,
    };
  }, [data]);

  const onHover = useCallback((e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      setHoveredPoint({
        ...feature.properties,
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
      } as HoveredPoint);
    } else {
      setHoveredPoint(null);
    }
  }, []);

  if (loading) {
    return (
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg bg-white/90 px-4 py-2 shadow-lg backdrop-blur-sm z-[1000]">
        <Loader2 className="animate-spin text-[#1e3a8a]" size={20} />
        <span className="text-sm font-medium text-[#1e3a8a]">
          Snapping accidents...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 shadow-lg border border-red-200 z-[1000]">
        {error}
      </div>
    );
  }

  return (
    <>
      <Source id="snapped-lines-source" type="geojson" data={geojson.lines}>
        <Layer
          id="snapped-lines-layer"
          type="line"
          paint={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "line-color": severityColorExpression as any,
            "line-width": 2,
            "line-opacity": 0.6,
            "line-dasharray": [2, 2],
          }}
        />
      </Source>

      <Source id="snapped-original-points-source" type="geojson" data={geojson.originalPoints}>
        <Layer
          id="snapped-original-points-layer"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5, 2,
              10, 3,
              15, 4,
              20, 5,
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "circle-color": severityColorExpression as any,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.4, // lower opacity for original points
          }}
        />
      </Source>

      <Source id="snapped-points-source" type="geojson" data={geojson.points}>
        <Layer
          id="snapped-points-layer"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              5, 3,
              10, 4,
              15, 6,
              20, 8,
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "circle-color": severityColorExpression as any,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.9,
          }}
        />
        {/* Invisible larger circle for easier hover targets */}
        <Layer
          id="snapped-hover-targets"
          type="circle"
          paint={{
            "circle-radius": 15,
            "circle-color": "transparent",
          }}
          onMouseMove={onHover}
          onMouseLeave={() => setHoveredPoint(null)}
        />
      </Source>

      {hoveredPoint && (
        <Popup
          longitude={hoveredPoint.longitude}
          latitude={hoveredPoint.latitude}
          anchor="bottom"
          offset={[0, -10]}
          closeButton={false}
          className="z-50"
          maxWidth="300px"
        >
          <div className="flex flex-col gap-2 p-1 max-h-[300px] overflow-y-auto custom-scrollbar">
            <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-2">
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold text-slate-900 leading-tight">
                  Snapped Accident
                </span>
                <span
                  className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getSeverityBadgeClasses(hoveredPoint.severity)}`}
                >
                  {safeText(hoveredPoint.severity)}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {formatDate(hoveredPoint.accident_date_time)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="col-span-2">
                <span className="text-slate-500 block mb-0.5">Location</span>
                <span className="font-medium text-slate-800 break-words">
                  {safeText(hoveredPoint.road_name)}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 block mb-0.5">Snapping Distance</span>
                <span className="font-medium text-slate-800 break-words">
                  {Number(hoveredPoint.distance_meters).toFixed(2)} meters
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Police Station</span>
                <span className="font-medium text-slate-800 break-words">
                  {safeText(hoveredPoint.police_station)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Collision Type</span>
                <span className="font-medium text-slate-800 break-words">
                  {safeText(hoveredPoint.collision_type)}
                </span>
              </div>
            </div>
          </div>
        </Popup>
      )}
    </>
  );
}

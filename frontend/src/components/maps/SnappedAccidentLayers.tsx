/**
 * @file SnappedAccidentLayers.tsx
 * @description Renders network-snapped accident locations and the snapping path connecting the original to the snapped location.
 */

import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { Loader2, Calendar, X } from "lucide-react";
import type { DashboardFilters, SnappedHeatmapPoint } from "../../types/dashboard";
import { toDataFilterKey } from "../../utils/dashboardFilters";

interface Props {
  filters: DashboardFilters;
  fetchFn: (filters: DashboardFilters) => Promise<{ total: number; data: SnappedHeatmapPoint[] }>;
}

const SEVERITY_COLORS = {
  Fatal: "#78350F", // Dark Brown to distinguish from Orange Grievous Injury
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#EAB308",
  "Minor Injury Non Hospitalized": "#0284C7", // Distinct Sky Blue to stand out from red/orange/yellow
  "No Injury": "#16A34A",
  default: "#64748B",
} as const;

const severityColorExpression = [
  "case",
  ["in", "fatal", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS.Fatal,
  ["in", "grievous", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS["Grievous Injury"],
  [
    "any",
    ["in", "non", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "non-hosp", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "non hosp", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  ],
  SEVERITY_COLORS["Minor Injury Non Hospitalized"],
  [
    "any",
    ["in", "hospitalized", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "hosp", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "minor", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  ],
  SEVERITY_COLORS["Minor Injury Hospitalized"],
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

const getSeverityTheme = (severity?: string | null) => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal")) {
    return {
      label: "FATAL",
      color: "#78350F",
      bg: "#FFFBEB", // Warm Amber/Cream 50
      textColor: "text-slate-800",
      subTextColor: "text-slate-500",
      labelColor: "text-[#78350F] font-bold",
      borderColor: "border-[#FDE68A]",
      ringColor: "ring-1 ring-[#78350F]/20",
    };
  }
  if (s.includes("grievous")) {
    return {
      label: "GRIEVOUS INJURY",
      color: "#EA580C",
      bg: "#FFF7ED", // Orange 50
      textColor: "text-slate-800",
      subTextColor: "text-slate-500",
      labelColor: "text-orange-700 font-bold",
      borderColor: "border-orange-200/90",
      ringColor: "ring-1 ring-orange-500/20",
    };
  }
  if (s.includes("non") || s.includes("non-hosp") || s.includes("non hosp")) {
    return {
      label: "MINOR (NON-HOSP)",
      color: "#0284C7",
      bg: "#F0F9FF", // Sky Blue 50
      textColor: "text-slate-800",
      subTextColor: "text-slate-500",
      labelColor: "text-sky-700 font-bold",
      borderColor: "border-sky-200/90",
      ringColor: "ring-1 ring-sky-500/20",
    };
  }
  if (s.includes("hospitalized") || s.includes("hosp") || s.includes("minor")) {
    return {
      label: "MINOR (HOSPITALIZED)",
      color: "#EAB308",
      bg: "#FEFCE8", // Yellow 50
      textColor: "text-slate-800",
      subTextColor: "text-slate-500",
      labelColor: "text-yellow-700 font-bold",
      borderColor: "border-yellow-200/90",
      ringColor: "ring-1 ring-yellow-500/20",
    };
  }
  if (s.includes("no injury") || s.includes("damage")) {
    return {
      label: "NO INJURY / DAMAGE",
      color: "#16A34A",
      bg: "#F0FDF4", // Green 50
      textColor: "text-slate-800",
      subTextColor: "text-slate-500",
      labelColor: "text-emerald-700 font-bold",
      borderColor: "border-emerald-200/90",
      ringColor: "ring-1 ring-emerald-500/20",
    };
  }
  return {
    label: safeText(severity).toUpperCase(),
    color: "#64748B",
    bg: "#F8FAFC", // Slate 50
    textColor: "text-slate-800",
    subTextColor: "text-slate-500",
    labelColor: "text-slate-600 font-bold",
    borderColor: "border-slate-200/90",
    ringColor: "ring-1 ring-slate-400/20",
  };
};

type SelectedPoint = SnappedHeatmapPoint & {
  longitude: number;
  latitude: number;
};

interface SnappedAccidentPopupBodyProps {
  selected: SelectedPoint;
  onClose?: () => void;
}

function SnappedAccidentPopupBody({
  selected,
  onClose,
}: SnappedAccidentPopupBodyProps) {
  const theme = getSeverityTheme(selected.severity);

  return (
    <div
      className={`rounded-xl shadow-lg p-2.5 w-[190px] sm:w-[200px] ${theme.textColor} ${theme.ringColor} border ${theme.borderColor} font-sans tracking-tight leading-tight select-text transition-all`}
      style={{ backgroundColor: theme.bg }}
    >
      {/* ── Top Header: Date, ID & Close Button ── */}
      <div className="flex items-center justify-between gap-1 pb-1.5 border-b border-slate-200/60">
        <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-700">
          <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
          {formatDate(selected.accident_date_time)}
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {selected.accident_id && (
            <span
              className="font-mono text-[9.5px] text-slate-400 truncate max-w-[85px]"
              title={`ID: ${selected.accident_id}`}
            >
              #{selected.accident_id}
            </span>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 rounded-full hover:bg-slate-200/80 text-slate-400 hover:text-slate-700 transition-colors ml-1"
              title="Close popup"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Main Details Grid ── */}
      <div className="mt-1.5 space-y-1 text-[10.5px]">
        {/* Collision Type */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Collision
          </span>
          <span
            className="font-semibold text-slate-700 text-right truncate max-w-[110px]"
            title={safeText(selected.collision_type)}
          >
            {safeText(selected.collision_type)}
          </span>
        </div>

        {/* Coordinates */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Coords
          </span>
          <span className="font-mono text-[10px] font-medium text-slate-600 text-right">
            {Number(selected.latitude).toFixed(4)}, {Number(selected.longitude).toFixed(4)}
          </span>
        </div>

        {/* Road Class */}
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}>
            Road Class
          </span>
          <span
            className="font-medium text-slate-700 text-right truncate max-w-[105px]"
            title={safeText(selected.road_classification)}
          >
            {safeText(selected.road_classification)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SnappedAccidentLayers({ filters, fetchFn }: Props) {
  const [data, setData] = useState<{ total: number; data: SnappedHeatmapPoint[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);

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
      .catch((err: unknown) => {
        if (!active) return;
        const error = err as { message?: string };
        setError(error?.message || "Failed to fetch snapped accidents");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filterKey, fetchFn]);

  const geojson = useMemo(() => {
    if (!data || !data.data) {
      return {
        points: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
        originalPoints: { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection,
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

  const { current: mapRef } = useMap();

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const layers = ["snapped-hover-targets", "snapped-points-layer", "snapped-original-points-layer"];

    const onMove = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    };

    const onClick = (e: import("react-map-gl/maplibre").MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers });
      if (features.length > 0) {
        const feature = features[0];
        setSelectedPoint({
          ...feature.properties,
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
        } as SelectedPoint);
      } else {
        setSelectedPoint(null);
      }
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("mousemove", onMove);
    map.on("click", onClick);
    map.on("mouseout", onLeave);

    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.off("mouseout", onLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef]);

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
            "line-color": severityColorExpression as unknown as import("maplibre-gl").ExpressionSpecification,
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 0.8,
              11, 1.2,
              15, 1.8,
            ],
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
              7, 1.2,
              9, 1.6,
              11, 2.2,
              13, 2.8,
              15, 3.4,
            ],
            "circle-color": severityColorExpression as unknown as import("maplibre-gl").ExpressionSpecification,
            "circle-stroke-width": 0.5,
            "circle-stroke-color": "#FFFFFF",
            "circle-opacity": 0.45,
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
              7, 1.5,
              9, 2.0,
              11, 2.8,
              13, 3.5,
              15, 4.2,
            ],
            "circle-color": severityColorExpression as unknown as import("maplibre-gl").ExpressionSpecification,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 0.7,
              11, 0.8,
              13, 0.9,
            ],
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 0.4,
              10, 0.6,
              13, 0.8,
              15, 1.0,
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 0.7,
              11, 0.85,
              13, 0.95,
            ],
          }}
        />
        {/* Invisible larger circle for easier click targets */}
        <Layer
          id="snapped-hover-targets"
          type="circle"
          paint={{
            "circle-radius": 15,
            "circle-color": "transparent",
          }}
        />
      </Source>

      {selectedPoint && (
        <Popup
          longitude={selectedPoint.longitude}
          latitude={selectedPoint.latitude}
          closeOnClick={true}
          offset={12}
          closeButton={false}
          className="accident-popup"
          style={{ "--popup-bg": getSeverityTheme(selectedPoint.severity).bg } as React.CSSProperties}
          onClose={() => {
            setSelectedPoint(null);
          }}
        >
          <SnappedAccidentPopupBody
            selected={selectedPoint}
            onClose={() => {
              setSelectedPoint(null);
            }}
          />
        </Popup>
      )}
    </>
  );
}

/**
 * @file MarkerOverlayLayer.tsx
 * @description A GIS overlay layer that renders individual accident markers on top of any active visualization.
 * @responsibility Renders severity-colored circle markers as an independent map layer with its own source, so it can coexist alongside Blackspot, Heatmap, or any other primary visualization layer.
 * @dependencies react-map-gl/maplibre
 */
import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { X, Calendar } from "lucide-react";
import type { HeatmapPoint } from "../../types/dashboard";
import {
  NULL_TEXT_SENTINEL,
  UNKNOWN_LABEL,
  SEVERITY_WEIGHTS,
  SEVERITY_DEFAULT_WEIGHT,
} from "../../config/constants";

// ---------------------------------------------------------------------------
// Utility helpers (shared logic with VisualizationLayers)
// ---------------------------------------------------------------------------

const safeText = (value?: string | null): string => {
  if (!value || value === NULL_TEXT_SENTINEL) return UNKNOWN_LABEL;
  return value;
};

const formatDate = (value?: string | null): string => {
  if (!value) return UNKNOWN_LABEL;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return UNKNOWN_LABEL;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

const getSeverityMarkerWeight = (severity?: string | null): number => {
  const v = (severity || "").toLowerCase();
  for (const [key, weight] of Object.entries(SEVERITY_WEIGHTS)) {
    if (v.includes(key)) return weight;
  }
  return SEVERITY_DEFAULT_WEIGHT;
};

// ---------------------------------------------------------------------------
// Severity colour palette (consistent with VisualizationLayers)
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = {
  Fatal: "#78350F",
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#EAB308",
  "Minor Injury Non Hospitalized": "#0284C7",
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

// ---------------------------------------------------------------------------
// Severity theme for popup styling
// ---------------------------------------------------------------------------

const getSeverityTheme = (severity?: string | null) => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal")) {
    return {
      label: "FATAL",
      color: "#78350F",
      bg: "#FFFBEB",
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
      bg: "#FFF7ED",
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
      bg: "#F0F9FF",
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
      bg: "#FEFCE8",
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
      bg: "#F0FDF4",
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
    bg: "#F8FAFC",
    textColor: "text-slate-800",
    subTextColor: "text-slate-500",
    labelColor: "text-slate-600 font-bold",
    borderColor: "border-slate-200/90",
    ringColor: "ring-1 ring-slate-400/20",
  };
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SelectedAccident = {
  longitude: number;
  latitude: number;
  accident_id?: string | null;
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
  road_classification?: string | null;
  weather_condition?: string | null;
  light_condition?: string | null;
  collision_type?: string | null;
  collision_nature?: string | null;
  accident_date_time?: string | null;
};

interface MarkerOverlayLayerProps {
  data?: HeatmapPoint[];
  isPedestrianVariant?: boolean;
}

// ---------------------------------------------------------------------------
// GeoJSON builder
// ---------------------------------------------------------------------------

function buildOverlayGeojson(data?: HeatmapPoint[]): GeoJSON.FeatureCollection {
  if (!data || data.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  const features: GeoJSON.Feature[] = [];
  const len = data.length;
  for (let i = 0; i < len; i++) {
    const p = data[i];
    const lon = p.longitude;
    const lat = p.latitude;
    if (lon !== null && lon !== undefined && lat !== null && lat !== undefined && !Number.isNaN(lon) && !Number.isNaN(lat)) {
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {
          accident_id: p.accident_id,
          severity: p.severity,
          severity_weight: getSeverityMarkerWeight(p.severity),
          police_station: p.police_station ?? p.district,
          road_name: p.road_name,
          road_classification: p.road_classification,
          weather_condition: p.weather_condition,
          light_condition: p.light_condition,
          collision_type: p.collision_type,
          collision_nature: p.collision_nature,
          accident_date_time: p.accident_date_time,
        },
      });
    }
  }
  return {
    type: "FeatureCollection",
    features,
  };
}

const pedestrianCasualtyTotal = (point: HeatmapPoint): number =>
  (Number(point.pedestrian_killed) || 0) +
  (Number(point.pedestrian_grievous_injury) || 0) +
  (Number(point.pedestrian_minor_injury) || 0);

const isPedestrianAccident = (point: HeatmapPoint): boolean =>
  pedestrianCasualtyTotal(point) > 0;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const OVERLAY_LAYER_ID = "marker-overlay-points";

/**
 * MarkerOverlayLayer — renders accident markers as an independent GIS layer overlay.
 * Uses unique source/layer IDs to avoid conflicts with primary visualization layers.
 */
export default function MarkerOverlayLayer({
  data,
  isPedestrianVariant = false,
}: MarkerOverlayLayerProps) {
  const { current: mapRef } = useMap();
  const [selected, setSelected] = useState<SelectedAccident | null>(null);

  const displayData = useMemo(
    () => (isPedestrianVariant ? data?.filter(isPedestrianAccident) : data),
    [data, isPedestrianVariant]
  );

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(
    () => buildOverlayGeojson(displayData),
    [displayData]
  );

  // Click / hover handlers for overlay markers
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const handleClick = (event: any) => {
      if (!map.getLayer(OVERLAY_LAYER_ID)) return;
      const feature = map.queryRenderedFeatures(event.point, {
        layers: [OVERLAY_LAYER_ID],
      })[0];
      if (!feature) return;
      setSelected({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        ...feature.properties,
      });
    };

    const handleMouseMove = (event: any) => {
      if (!map.getLayer(OVERLAY_LAYER_ID)) {
        map.getCanvas().style.cursor = "";
        return;
      }
      const features = map.queryRenderedFeatures(event.point, {
        layers: [OVERLAY_LAYER_ID],
      });
      // Only set pointer cursor if hovering on overlay marker
      if (features.length) {
        map.getCanvas().style.cursor = "pointer";
      }
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef]);

  if (!geojsonData.features.length) return null;

  const markerColor = severityColorExpression as any;

  return (
    <>
      <Source
        id="marker-overlay-source"
        type="geojson"
        data={geojsonData as any}
        cluster={false}
      >
        <Layer
          id={OVERLAY_LAYER_ID}
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 1.0,
              10, 1.5,
              12, 2.2,
              14, 3.5,
              16, 5.0,
            ],
            "circle-color": markerColor as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7, 0.2,
              11, 0.4,
              14, 0.7,
              16, 0.9,
            ],
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12, 0,
              13, 0.5,
              15, 1.0,
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12, 0,
              14, 0.6,
              16, 0.9,
            ],
          }}
        />
      </Source>

      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          closeOnClick={true}
          offset={12}
          closeButton={false}
          className="accident-popup"
          style={
            {
              "--popup-bg": getSeverityTheme(selected.severity).bg,
            } as React.CSSProperties
          }
          onClose={() => setSelected(null)}
        >
          <OverlayAccidentPopup
            selected={selected}
            onClose={() => setSelected(null)}
          />
        </Popup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Popup body (compact version matching VisualizationLayers' style)
// ---------------------------------------------------------------------------

function OverlayAccidentPopup({
  selected,
  onClose,
}: {
  selected: SelectedAccident;
  onClose?: () => void;
}) {
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
        {/* Collision Nature */}
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}
          >
            Nature
          </span>
          <span
            className="font-semibold text-slate-700 text-right truncate max-w-[110px]"
            title={safeText(selected.collision_nature)}
          >
            {safeText(selected.collision_nature)}
          </span>
        </div>

        {/* Collision Type */}
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}
          >
            Type
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
          <span
            className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}
          >
            Coords
          </span>
          <span className="font-mono text-[10px] font-medium text-slate-600 text-right">
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
          </span>
        </div>

        {/* Road Class */}
        <div className="flex items-baseline justify-between gap-1">
          <span
            className={`text-[9.5px] uppercase tracking-wider ${theme.labelColor} shrink-0`}
          >
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

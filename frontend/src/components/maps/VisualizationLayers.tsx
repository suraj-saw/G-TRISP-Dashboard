/**
 * @file VisualizationLayers.tsx
 * @description Central spatial visualization orchestrator for the dashboard.
 * @responsibility Consumes raw accident point data and renders the appropriate Maplibre layer configuration (e.g., density heatmaps, interactive point markers, blackspot clusters). Also handles popup rendering for accident inspections.
 * @dependencies react-map-gl/maplibre
 */
// frontend/src/components/maps/VisualizationLayers.tsx

import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import { X, Calendar } from "lucide-react";
import type { HeatmapPoint } from "../../types/dashboard";
import GeoJsonHeatmapLayers from "./GeoJsonHeatmapLayers";
import CompactBlackspotPopup from "./CompactBlackspotPopup";
import {
  NULL_TEXT_SENTINEL,
  UNKNOWN_LABEL,
  SEVERITY_WEIGHTS,
  SEVERITY_DEFAULT_WEIGHT,
} from "../../config/constants";
import {
  POINT_OPACITY,
  POINT_STROKE_OPACITY,
  SEVERITY_HEATMAP_WEIGHTS,
  SEVERITY_WEIGHT_DEFAULT,
  zoomInterpolate,
  buildPointRadiusExpression,
} from "../../config/Heapmapconfig";
import {
  PRIORITY_COLOR_EXPR,
  PRIORITY_HALO_COLOR_EXPR,
  BS_CORE_RADIUS_EXPR,
  BS_HALO_RADIUS_EXPR,
  PRIORITY_TEXT_SIZE_EXPR,
  PRIORITY_SINGLE_COLOR_EXPR,
} from "../../config/blackspotConfig";

interface Props {
  data?: HeatmapPoint[];
  type: string;
  selectedSeverity?: string[];
}

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
  accident_date_time?: string | null;
  pedestrian_killed?: number | null;
  pedestrian_grievous_injury?: number | null;
  pedestrian_minor_injury?: number | null;
  // cluster fields
  point_count?: number;
  isCluster?: boolean;
};

// ---------------------------------------------------------------------------
// Utility helpers
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

const getSeverityHeatmapWeight = (severity?: string | null): number => {
  const v = (severity || "").toLowerCase();
  for (const [key, weight] of Object.entries(SEVERITY_HEATMAP_WEIGHTS)) {
    if (v.includes(key)) return weight;
  }
  return SEVERITY_WEIGHT_DEFAULT;
};

const getSeverityMarkerWeight = (severity?: string | null): number => {
  const v = (severity || "").toLowerCase();
  for (const [key, weight] of Object.entries(SEVERITY_WEIGHTS)) {
    if (v.includes(key)) return weight;
  }
  return SEVERITY_DEFAULT_WEIGHT;
};

const pedestrianCasualtyTotal = (point: {
  pedestrian_killed?: number | null;
  pedestrian_grievous_injury?: number | null;
  pedestrian_minor_injury?: number | null;
}): number =>
  (Number(point.pedestrian_killed) || 0) +
  (Number(point.pedestrian_grievous_injury) || 0) +
  (Number(point.pedestrian_minor_injury) || 0);

const isPedestrianAccident = (point: HeatmapPoint): boolean =>
  pedestrianCasualtyTotal(point) > 0;

// ---------------------------------------------------------------------------
// Colour palette for severity
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = {
  Fatal: "#78350F", // Dark Brown to distinguish from Orange Grievous Injury
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#EAB308",
  "Minor Injury Non Hospitalized": "#0284C7", // Distinct Sky Blue to stand out from red/orange/yellow
  "No Injury": "#16A34A",
  default: "#64748B",
  all: "#E8603A",
} as const;

const severityColorExpression = [
  "case",
  // Check if the lowercase severity string contains "fatal"
  ["in", "fatal", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS.Fatal,

  // Check for "grievous"
  ["in", "grievous", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  SEVERITY_COLORS["Grievous Injury"],

  // Check for "minor injury hospitalized" (ensure this comes BEFORE non-hospitalized if strings overlap)
  [
    "in",
    "minor injury hospitalized",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Hospitalized"],

  // Check for "minor injury non"
  [
    "in",
    "minor injury non",
    ["downcase", ["coalesce", ["get", "severity"], ""]],
  ],
  SEVERITY_COLORS["Minor Injury Non Hospitalized"],

  // Check for "no injury" or "damage only"
  [
    "any",
    ["in", "no injury", ["downcase", ["coalesce", ["get", "severity"], ""]]],
    ["in", "damage only", ["downcase", ["coalesce", ["get", "severity"], ""]]],
  ],
  SEVERITY_COLORS["No Injury"],

  // Fallback color if none of the above match
  SEVERITY_COLORS.default,
] as const;

// ---------------------------------------------------------------------------
// Shared GeoJSON builder
// ---------------------------------------------------------------------------

/**
 * Transforms an array of HeatmapPoints into a GeoJSON FeatureCollection.
 * @business_rule Injects dynamic weighting and normalized string properties to drive map styling expressions.
 * @param {HeatmapPoint[]} [data] - The array of raw accident points.
 * @returns {GeoJSON.FeatureCollection} A GeoJSON representation of the accidents.
 */
function buildGeojson(data?: HeatmapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      data
        ?.filter(
          (p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude)
        )
        .map((p) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [p.longitude, p.latitude],
          },
          properties: {
            accident_id: p.accident_id,
            severity: p.severity,
            heatmap_weight: getSeverityHeatmapWeight(p.severity),
            severity_weight: getSeverityMarkerWeight(p.severity),
            police_station: p.police_station ?? p.district,
            road_name: p.road_name,
            road_classification: p.road_classification,
            weather_condition: p.weather_condition,
            light_condition: p.light_condition,
            collision_type: p.collision_type,
            accident_date_time: p.accident_date_time,
            pedestrian_killed: p.pedestrian_killed ?? 0,
            pedestrian_grievous_injury: p.pedestrian_grievous_injury ?? 0,
            pedestrian_minor_injury: p.pedestrian_minor_injury ?? 0,
          },
        })) || [],
  };
}

// ---------------------------------------------------------------------------
// Density heatmap sub-component
//
// Two layers, bottom to top:
//   1. density-heatmap  — kernel density field, dominant at low/mid zoom.
//   2. density-points   — crisp, severity-colored graduated points that fade
//                         in from zoom ~12 so street level shows real incidents
//                         (clickable) instead of fading to faint dots.
//
// Both share one GeoJSON source. No glow/core circle layers — those read as a
// demo effect rather than analytics.
// ---------------------------------------------------------------------------

/**
 * Sub-component to render density heatmaps using Maplibre's native heatmap layers.
 * @param {Object} props
 * @param {GeoJSON.FeatureCollection} props.geojsonData - GeoJSON features for the heatmap.
 */
function DensityHeatmapLayers({
  geojsonData,
}: {
  geojsonData: GeoJSON.FeatureCollection;
}) {
  const pointRadiusExpr = buildPointRadiusExpression();
  const pointOpacityExpr = zoomInterpolate(POINT_OPACITY);
  const pointStrokeOpacityExpr = zoomInterpolate(POINT_STROKE_OPACITY);

  return (
    <GeoJsonHeatmapLayers
      data={geojsonData}
      sourceId="density-source"
      layerIdPrefix="density"
      weightProperty="heatmap_weight"
      circlePaint={{
        "circle-color": severityColorExpression as any,
        "circle-radius": pointRadiusExpr as any,
        "circle-opacity": pointOpacityExpr as any,
        "circle-stroke-width": 1.25,
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-opacity": pointStrokeOpacityExpr as any,
      }}
      showPointsOverlay={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Blackspot sub-component — professional GIS risk bubble visualization
// ---------------------------------------------------------------------------

type HoverState = {
  longitude: number;
  latitude: number;
  point_count?: number;
  severity?: string;
  police_station?: string | null;
  road_name?: string | null;
} | null;

/**
 * Sub-component to render legacy risk bubbles / cluster map visualization.
 * @param {Object} props
 * @param {GeoJSON.FeatureCollection} props.geojsonData - Features to be clustered.
 */
function BlackspotLayers({
  geojsonData,
}: {
  geojsonData: GeoJSON.FeatureCollection;
}) {
  const { current: mapRef } = useMap();
  const [hovered, setHovered] = useState<HoverState>(null);
  const [selected, setSelected] = useState<SelectedAccident | null>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clusterLayers = ["blackspot-core", "blackspot-halo"];
    const pointLayers = ["blackspot-single-point"];

    const onMove = (e: any) => {
      if (selected) return;
      const clusters = map.queryRenderedFeatures(e.point, {
        layers: clusterLayers,
      });
      if (clusters.length) {
        map.getCanvas().style.cursor = "pointer";
        const f = clusters[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          point_count: f.properties?.point_count,
        });
        return;
      }
      const points = map.queryRenderedFeatures(e.point, {
        layers: pointLayers,
      });
      if (points.length) {
        map.getCanvas().style.cursor = "pointer";
        const f = points[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          severity: f.properties?.severity,
          police_station: f.properties?.police_station,
          road_name: f.properties?.road_name,
        });
        return;
      }
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    const onClick = (e: any) => {
      const points = map.queryRenderedFeatures(e.point, {
        layers: pointLayers,
      });
      if (points.length) {
        const f = points[0];
        setSelected({
          longitude: e.lngLat.lng,
          latitude: e.lngLat.lat,
          ...f.properties,
        });
        setHovered(null);
        return;
      }
      setSelected(null);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
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
  }, [mapRef, selected]);

  return (
    <>
      <Source
        id="blackspot-source"
        type="geojson"
        data={geojsonData as any}
        cluster
        clusterMaxZoom={15}
        clusterRadius={30}
      >
        {/* ── Outer soft halo ─────────────────────────────────────────── */}
        <Layer
          id="blackspot-halo"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": PRIORITY_HALO_COLOR_EXPR as any,
            "circle-radius": BS_HALO_RADIUS_EXPR as any,
            "circle-blur": 0.7,
            "circle-opacity": 1,
          }}
        />

        {/* ── Core risk bubble ────────────────────────────────────────── */}
        <Layer
          id="blackspot-core"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": PRIORITY_COLOR_EXPR as any,
            "circle-radius": BS_CORE_RADIUS_EXPR as any,
            "circle-opacity": 0.93,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#FFFFFF",
          }}
        />

        {/* ── Count label ─────────────────────────────────────────────── */}
        <Layer
          id="blackspot-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": "{point_count_abbreviated}",
            "text-size": PRIORITY_TEXT_SIZE_EXPR as any,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color": "#FFFFFF",
            "text-halo-color": "rgba(0,0,0,0.40)",
            "text-halo-width": 1.2,
          }}
        />

        {/* ── Unclustered point halo (zoom 15+) ───────────────────────── */}
        <Layer
          id="blackspot-single-halo"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "rgba(220,38,38,0.18)",
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              7,
              17,
              14,
            ],
            "circle-blur": 0.65,
          }}
        />

        {/* ── Unclustered point core (severity-colored) ───────────────── */}
        <Layer
          id="blackspot-single-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": PRIORITY_SINGLE_COLOR_EXPR as any,
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              13,
              4,
              17,
              7,
            ],
            "circle-opacity": 0.9,
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#FFFFFF",
          }}
        />
      </Source>

      {/* ── Hover tooltip ───────────────────────────────────────────────── */}
      {hovered && !selected && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
          className="accident-popup"
        >
          <BlackspotPopup hovered={hovered} />
        </Popup>
      )}

      {/* ── Accident popup ───────────────────────────────────────────────── */}
      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          closeOnClick={true}
          offset={12}
          closeButton={false}
          className="accident-popup"
          style={{ "--popup-bg": getSeverityTheme(selected.severity).bg } as React.CSSProperties}
          onClose={() => setSelected(null)}
        >
          <AccidentPopupBody
            selected={selected}
            showPedestrianCasualties={false}
            onClose={() => setSelected(null)}
          />
        </Popup>
      )}
    </>
  );
}

/**
 * Tooltip UI for Blackspot clusters and points.
 * @param {Object} props
 * @param {NonNullable<HoverState>} props.hovered - The hover metadata.
 */
function BlackspotPopup({ hovered }: { hovered: NonNullable<HoverState> }) {
  if (hovered.point_count !== undefined) {
    const count = hovered.point_count;
    return (
      <CompactBlackspotPopup
        data={{
          priority_score: count,
          crash_count: count,
        }}
      />
    );
  }
  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 p-2.5 w-[190px] font-sans text-xs text-slate-800">
      <div className="font-bold mb-1 text-slate-900">Accident Site</div>
      {hovered.severity && (
        <div>
          <span className="text-slate-500">Severity:</span> {hovered.severity}
        </div>
      )}
      {hovered.police_station && (
        <div>
          <span className="text-slate-500">Station:</span> {safeText(hovered.police_station)}
        </div>
      )}
      {hovered.road_name && (
        <div>
          <span className="text-slate-500">Road:</span> {safeText(hovered.road_name)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

/**
 * Main Exported Component: VisualizationLayers
 * @state_management Manages `selected` accident state for point-and-click popups.
 * @hooks_usage Uses `useMemo` to construct the GeoJSON payload, and `useEffect` to manage map-level mouse interactions (click/hover) on the dynamic Maplibre layers.
 * @param {Props} props - Component properties.
 */
export function VisualizationLayers({
  data,
  type,
  // selectedSeverity = [],
}: Props) {
  const { current: mapRef } = useMap();
  const [selected, setSelected] = useState<SelectedAccident | null>(null);

  const displayData = useMemo(
    () =>
      type === "pedestrian_accidents"
        ? data?.filter(isPedestrianAccident)
        : data,
    [data, type]
  );

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(
    () => buildGeojson(displayData),
    [displayData]
  );

  // Click / hover handler — active for clickable point layers in both
  // location-marker mode and density mode (graduated points).
  useEffect(() => {
    const interactiveLayers =
      type === "location_markers" || type === "pedestrian_accidents"
        ? ["accident-points"]
        : type === "density_heatmap"
          ? ["density-points"]
          : [];

    if (!interactiveLayers.length) {
      setSelected(null);
      return;
    }

    const map = mapRef?.getMap();
    if (!map) return;

    const presentLayers = () =>
      interactiveLayers.filter((id) => map.getLayer(id));

    const handleClick = (event: any) => {
      const layers = presentLayers();
      if (!layers.length) return;
      const feature = map.queryRenderedFeatures(event.point, { layers })[0];
      if (!feature) return;
      setSelected({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        ...feature.properties,
      });
    };

    const handleMouseMove = (event: any) => {
      const layers = presentLayers();
      if (!layers.length) {
        map.getCanvas().style.cursor = "";
        return;
      }
      const features = map.queryRenderedFeatures(event.point, { layers });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };

    map.on("click", handleClick);
    map.on("mousemove", handleMouseMove);

    return () => {
      map.off("click", handleClick);
      map.off("mousemove", handleMouseMove);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef, type]);

  if (!geojsonData.features.length) return null;

  // ── Density heatmap ──────────────────────────────────────────────────────
  if (type === "density_heatmap") {
    return (
      <>
        <DensityHeatmapLayers geojsonData={geojsonData} />
        {selected && (
          <Popup
            longitude={selected.longitude}
            latitude={selected.latitude}
            closeOnClick={true}
            offset={12}
            closeButton={false}
            className="accident-popup"
            style={{ "--popup-bg": getSeverityTheme(selected.severity).bg } as React.CSSProperties}
            onClose={() => setSelected(null)}
          >
            <AccidentPopupBody
              selected={selected}
              showPedestrianCasualties={type === "density_heatmap"}
              onClose={() => setSelected(null)}
            />
          </Popup>
        )}
      </>
    );
  }

  // ── Blackspot cluster ────────────────────────────────────────────────────
  if (type === "blackspot") {
    return <BlackspotLayers geojsonData={geojsonData} />;
  }

  // ── Location markers ─────────────────────────────────────────────────────
  const markerColor = severityColorExpression as any;

  return (
    <>
      <Source
        id="accident-marker-source"
        type="geojson"
        data={geojsonData as any}
        cluster={false}
      >
        <Layer
          id="accident-points"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7,
              1.5,
              9,
              2.0,
              11,
              2.8,
              13,
              3.5,
              15,
              4.2,
            ],
            "circle-color": markerColor as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7,
              0.7,
              11,
              0.8,
              13,
              0.9,
            ],
            "circle-stroke-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7,
              0.4,
              10,
              0.6,
              13,
              0.8,
              15,
              1.0,
            ],
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              7,
              0.7,
              11,
              0.85,
              13,
              0.95,
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
          style={{ "--popup-bg": getSeverityTheme(selected.severity).bg } as React.CSSProperties}
          onClose={() => setSelected(null)}
        >
          <AccidentPopupBody
            selected={selected}
            showPedestrianCasualties={type === "pedestrian_accidents"}
            onClose={() => setSelected(null)}
          />
        </Popup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared popup body (Adaptive GIS Inspection Card)
// ---------------------------------------------------------------------------

const getSeverityTheme = (severity?: string | null) => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal")) {
    return {
      label: "FATAL",
      color: "#78350F", // Dark Brown
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
      color: "#EA580C", // Vivid Orange
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
      color: "#0284C7", // Sky Blue
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
      color: "#EAB308", // Golden Yellow
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
      color: "#16A34A", // Emerald Green
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

interface AccidentPopupBodyProps {
  selected: SelectedAccident;
  showPedestrianCasualties?: boolean;
  onClose?: () => void;
}

function AccidentPopupBody({
  selected,
  onClose,
}: AccidentPopupBodyProps) {
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
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
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

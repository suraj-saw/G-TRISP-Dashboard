// frontend/src/components/maps/VisualizationLayers.tsx

import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import type { HeatmapPoint } from "../../types/dashboard";
import {
  NULL_TEXT_SENTINEL,
  UNKNOWN_LABEL,
  SEVERITY_WEIGHTS,
  SEVERITY_DEFAULT_WEIGHT,
} from "../../config/constants";
import {
  HEATMAP_RADIUS,
  HEATMAP_INTENSITY,
  HEATMAP_OPACITY,
  POINT_OPACITY,
  POINT_STROKE_OPACITY,
  SEVERITY_HEATMAP_WEIGHTS,
  SEVERITY_WEIGHT_DEFAULT,
  zoomInterpolate,
  buildHeatmapColorExpression,
  buildPointRadiusExpression,
} from "../../config/Heapmapconfig";
import {
  BS_COLOR_EXPR,
  BS_HALO_COLOR_EXPR,
  BS_CORE_RADIUS_EXPR,
  BS_HALO_RADIUS_EXPR,
  BS_TEXT_SIZE_EXPR,
  BS_SINGLE_COLOR_EXPR,
  getRiskLabel,
  getRiskColor,
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
  Fatal: "#B91C1C",
  "Grievous Injury": "#EA580C",
  "Minor Injury Hospitalized": "#F59E0B",
  "Minor Injury Non Hospitalized": "#FBBF24", // Lighter amber to distinguish from hospitalized
  "No Injury": "#65A30D",
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

function DensityHeatmapLayers({
  geojsonData,
}: {
  geojsonData: GeoJSON.FeatureCollection;
}) {
  // Per-point severity contribution (fatal accidents weigh more)
  const heatmapWeightExpr: any[] = [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "heatmap_weight"], SEVERITY_WEIGHT_DEFAULT],
    0,
    0,
    1,
    1,
  ];

  const heatmapRadiusExpr = zoomInterpolate(HEATMAP_RADIUS);
  const heatmapIntensityExpr = zoomInterpolate(HEATMAP_INTENSITY);
  const heatmapOpacityExpr = zoomInterpolate(HEATMAP_OPACITY);
  const heatmapColorExpr = buildHeatmapColorExpression();

  const pointRadiusExpr = buildPointRadiusExpression();
  const pointOpacityExpr = zoomInterpolate(POINT_OPACITY);
  const pointStrokeOpacityExpr = zoomInterpolate(POINT_STROKE_OPACITY);

  return (
    <Source id="density-source" type="geojson" data={geojsonData as any}>
      {/*
        Layer 1 — Heatmap kernel density field.
        Cool lead-in + compressed warm band means you read density structure
        (corridors, clusters, hotspots) instead of a single filled shape.
      */}
      <Layer
        id="density-heatmap"
        type="heatmap"
        paint={{
          "heatmap-weight": heatmapWeightExpr as any,
          "heatmap-radius": heatmapRadiusExpr as any,
          "heatmap-intensity": heatmapIntensityExpr as any,
          "heatmap-opacity": heatmapOpacityExpr as any,
          "heatmap-color": heatmapColorExpr as any,
        }}
      />

      {/*
        Layer 2 — Graduated incident points (zoom 12+).
        Severity-colored, radius graduated by severity, white halo for contrast
        on the light Carto Positron basemap. Clickable for details.
      */}
      <Layer
        id="density-points"
        type="circle"
        paint={{
          "circle-color": severityColorExpression as any,
          "circle-radius": pointRadiusExpr as any,
          "circle-opacity": pointOpacityExpr as any,
          "circle-stroke-width": 1.25,
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-opacity": pointStrokeOpacityExpr as any,
        }}
      />
    </Source>
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

function BlackspotLayers({ geojsonData }: { geojsonData: GeoJSON.FeatureCollection }) {
  const { current: mapRef } = useMap();
  const [hovered, setHovered] = useState<HoverState>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clusterLayers  = ["blackspot-core", "blackspot-halo"];
    const pointLayers    = ["blackspot-single-point"];

    const onMove = (e: any) => {
      const clusters = map.queryRenderedFeatures(e.point, { layers: clusterLayers });
      if (clusters.length) {
        map.getCanvas().style.cursor = "pointer";
        const f = clusters[0];
        setHovered({
          longitude: e.lngLat.lng,
          latitude:  e.lngLat.lat,
          point_count: f.properties?.point_count,
        });
        return;
      }
      const points = map.queryRenderedFeatures(e.point, { layers: pointLayers });
      if (points.length) {
        map.getCanvas().style.cursor = "pointer";
        const f = points[0];
        setHovered({
          longitude:     e.lngLat.lng,
          latitude:      e.lngLat.lat,
          severity:      f.properties?.severity,
          police_station: f.properties?.police_station,
          road_name:     f.properties?.road_name,
        });
        return;
      }
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout",  onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout",  onLeave);
      map.getCanvas().style.cursor = "";
    };
  }, [mapRef]);

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
            "circle-color":   BS_HALO_COLOR_EXPR as any,
            "circle-radius":  BS_HALO_RADIUS_EXPR as any,
            "circle-blur":    0.7,
            "circle-opacity": 1,
          }}
        />

        {/* ── Core risk bubble ────────────────────────────────────────── */}
        <Layer
          id="blackspot-core"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color":        BS_COLOR_EXPR as any,
            "circle-radius":       BS_CORE_RADIUS_EXPR as any,
            "circle-opacity":      0.93,
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
            "text-field":         "{point_count_abbreviated}",
            "text-size":          BS_TEXT_SIZE_EXPR as any,
            "text-font":          ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color":      "#FFFFFF",
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
            "circle-color":  "rgba(220,38,38,0.18)",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 7, 17, 14],
            "circle-blur":   0.65,
          }}
        />

        {/* ── Unclustered point core (severity-colored) ───────────────── */}
        <Layer
          id="blackspot-single-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color":        BS_SINGLE_COLOR_EXPR as any,
            "circle-radius":       ["interpolate", ["linear"], ["zoom"], 13, 4, 17, 7],
            "circle-opacity":      0.9,
            "circle-stroke-width": 1.2,
            "circle-stroke-color": "#FFFFFF",
          }}
        />
      </Source>

      {/* ── Hover tooltip ───────────────────────────────────────────────── */}
      {hovered && (
        <Popup
          longitude={hovered.longitude}
          latitude={hovered.latitude}
          anchor="bottom"
          closeButton={false}
          closeOnClick={false}
          offset={12}
        >
          <BlackspotPopup hovered={hovered} />
        </Popup>
      )}
    </>
  );
}

function BlackspotPopup({ hovered }: { hovered: NonNullable<HoverState> }) {
  if (hovered.point_count !== undefined) {
    const count = hovered.point_count;
    const risk  = getRiskLabel(count);
    const color = getRiskColor(count);
    return (
      <div style={{ minWidth: 170, fontFamily: "inherit" }}>
        <div style={{
          background: color, color: "#fff",
          padding: "6px 10px", borderRadius: "6px 6px 0 0",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>
          {risk}
        </div>
        <div style={{ padding: "8px 10px 6px", fontSize: 12, color: "#1e293b" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{count.toLocaleString()}</div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>Accidents in cluster</div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minWidth: 170, padding: "8px 10px", fontSize: 12, color: "#1e293b", fontFamily: "inherit" }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>Accident Site</div>
      {hovered.severity      && <div><b>Severity:</b> {hovered.severity}</div>}
      {hovered.police_station && <div><b>Station:</b> {safeText(hovered.police_station)}</div>}
      {hovered.road_name      && <div><b>Road:</b> {safeText(hovered.road_name)}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function VisualizationLayers({
  data,
  type,
  selectedSeverity = [],
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
            anchor="top"
            closeButton
            closeOnClick={false}
            onClose={() => setSelected(null)}
          >
            <AccidentPopupBody selected={selected} />
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
              9,
              3,
              11,
              4,
              13,
              5.5,
              15,
              7,
            ],
            "circle-color": markerColor as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              0.45,
              11,
              0.6,
              13,
              0.78,
              15,
              0.92,
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              0.25,
              12,
              0.65,
              14,
              0.9,
            ],
          }}
        />
      </Source>

      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          anchor="top"
          closeButton
          closeOnClick={false}
          onClose={() => setSelected(null)}
        >
          <AccidentPopupBody
            selected={selected}
            showPedestrianCasualties={type === "pedestrian_accidents"}
          />
        </Popup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared popup body
// ---------------------------------------------------------------------------

function AccidentPopupBody({
  selected,
  showPedestrianCasualties = false,
}: {
  selected: SelectedAccident;
  showPedestrianCasualties?: boolean;
}) {
  const pedestrianTotal = pedestrianCasualtyTotal(selected);

  return (
    <div className="min-w-[210px] text-[12px] text-slate-700">
      <p className="mb-2 text-[13px] font-bold text-slate-900">
        Accident Details
      </p>
      <div className="space-y-1">
        {showPedestrianCasualties && pedestrianTotal > 0 && (
          <p>
            <b>Pedestrian casualties:</b> {pedestrianTotal}
          </p>
        )}
        <p>
          <b>Severity:</b> {safeText(selected.severity)}
        </p>
        <p>
          <b>Police station:</b> {safeText(selected.police_station)}
        </p>
        <p>
          <b>Road:</b> {safeText(selected.road_name)}
        </p>
        <p>
          <b>Road type:</b> {safeText(selected.road_classification)}
        </p>
        <p>
          <b>Weather:</b> {safeText(selected.weather_condition)}
        </p>
        <p>
          <b>Light:</b> {safeText(selected.light_condition)}
        </p>
        <p>
          <b>Collision:</b> {safeText(selected.collision_type)}
        </p>
        <p>
          <b>Date:</b> {formatDate(selected.accident_date_time)}
        </p>
      </div>
    </div>
  );
}

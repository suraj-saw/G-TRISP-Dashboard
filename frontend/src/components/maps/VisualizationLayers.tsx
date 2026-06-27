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

interface Props {
  data?: HeatmapPoint[];
  type: string;
  selectedSeverity?: string;
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

// ---------------------------------------------------------------------------
// Colour palette for severity
// ---------------------------------------------------------------------------

const SEVERITY_COLORS = {
  Fatal: "#dc2626",
  "Grievous Injury": "#f97316",
  "Minor Injury": "#2563eb",
  "Damage Only": "#22c55e",
  default: "#64748b",
  all: "#E8603A",
} as const;

const severityColorExpression = [
  "match",
  ["get", "severity"],
  ...Object.entries(SEVERITY_COLORS)
    .filter(([k]) => k !== "all" && k !== "default")
    .flatMap(([k, v]) => [k, v]),
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
// Main exported component
// ---------------------------------------------------------------------------

export function VisualizationLayers({
  data,
  type,
  selectedSeverity = "all",
}: Props) {
  const { current: mapRef } = useMap();
  const [selected, setSelected] = useState<SelectedAccident | null>(null);

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(
    () => buildGeojson(data),
    [data]
  );

  // Click / hover handler — active for clickable point layers in both
  // location-marker mode and density mode (graduated points).
  useEffect(() => {
    const interactiveLayers =
      type === "location_markers"
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
    return (
      <Source
        id="blackspot-source"
        type="geojson"
        data={geojsonData as any}
        cluster
        clusterMaxZoom={15}
        clusterRadius={34}
      >
        <Layer
          id="blackspot-halo"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": [
              "step",
              ["get", "point_count"],
              "rgba(245, 158, 11, 0.35)",
              50,
              "rgba(249, 115, 22, 0.38)",
              150,
              "rgba(220, 38, 38, 0.42)",
              300,
              "rgba(127, 29, 29, 0.48)",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              22,
              50,
              30,
              150,
              40,
              300,
              52,
            ],
            "circle-blur": 0.65,
            "circle-opacity": 0.95,
          }}
        />
        <Layer
          id="blackspot-core"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#F59E0B",
              50,
              "#F97316",
              150,
              "#DC2626",
              300,
              "#7F1D1D",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              12,
              50,
              17,
              150,
              23,
              300,
              30,
            ],
            "circle-opacity": 0.92,
            "circle-stroke-width": 2.5,
            "circle-stroke-color": "#FFFFFF",
          }}
        />
        <Layer
          id="blackspot-inner-shine"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": "rgba(255,255,255,0.26)",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              5,
              50,
              7,
              150,
              9,
              300,
              12,
            ],
            "circle-translate": [-3, -3],
          }}
        />
        <Layer
          id="blackspot-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": "{point_count_abbreviated}",
            "text-size": [
              "step",
              ["get", "point_count"],
              11,
              50,
              12,
              150,
              13,
              300,
              14,
            ],
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
          }}
          paint={{
            "text-color": "#FFFFFF",
            "text-halo-color": "rgba(0,0,0,0.28)",
            "text-halo-width": 1,
          }}
        />
        <Layer
          id="blackspot-single-point-halo"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "rgba(239, 68, 68, 0.22)",
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              5,
              15,
              10,
            ],
            "circle-blur": 0.6,
          }}
        />
        <Layer
          id="blackspot-single-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "#EF4444",
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              2.5,
              15,
              4.5,
            ],
            "circle-opacity": 0.75,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#FFFFFF",
          }}
        />
      </Source>
    );
  }

  // ── Location markers ─────────────────────────────────────────────────────
  const markerColor =
    selectedSeverity === "all"
      ? SEVERITY_COLORS.all
      : (severityColorExpression as any);

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
          <AccidentPopupBody selected={selected} />
        </Popup>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared popup body
// ---------------------------------------------------------------------------

function AccidentPopupBody({ selected }: { selected: SelectedAccident }) {
  return (
    <div className="min-w-[210px] text-[12px] text-slate-700">
      <p className="mb-2 text-[13px] font-bold text-slate-900">
        Accident Details
      </p>
      <div className="space-y-1">
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

/**
 * @file GeoJsonHeatmapLayers.tsx
 * @description Renders Kernel Density Estimation (KDE) and grid-based heatmaps using Maplibre.
 * @responsibility Consumes precomputed surface polygons (for KDE) or renders Maplibre native heatmaps based on accident points. Also handles hover/click popups to inspect accident severity and KDE density.
 * @dependencies react-map-gl/maplibre, config/Heapmapconfig
 */
import { useEffect, useMemo, useState } from "react";
import { Layer, Popup, Source, useMap } from "react-map-gl/maplibre";
import type { HeatmapPoint } from "../../types/dashboard";
import {
  buildHeatmapColorExpression,
  zoomInterpolate,
} from "../../config/Heapmapconfig";

interface Props {
  data: GeoJSON.FeatureCollection;
  sourceId: string;
  layerIdPrefix: string;
  weightProperty: string;
  precomputedSurface?: boolean;
  circlePaint?: Record<string, unknown>;
  accidentPoints?: HeatmapPoint[];
  inspectDensity?: boolean;
  showPointsOverlay?: boolean;
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

/**
 * GeoJsonHeatmapLayers Component
 * @state_management Manages local `selected` state for popups (storing density, coordinates, severity).
 * @hooks_usage Uses `useEffect` to attach `click` and `mousemove` events to the map instance for density inspection. Uses `useMemo` to construct complex mapbox-gl style expressions (e.g. interpolations for heatmap rendering).
 * @param {Object} props - Component properties.
 * @param {GeoJSON.FeatureCollection} props.data - GeoJSON data driving the heatmap/surface layer.
 * @param {boolean} [props.precomputedSurface=false] - If true, renders KDE surface circles; otherwise native maplibre heatmap.
 * @param {HeatmapPoint[]} [props.accidentPoints] - Raw accident data for rendering individual point circles at high zooms.
 * @param {boolean} [props.inspectDensity=false] - Toggles the density inspection popup feature on click/hover.
 */
export default function GeoJsonHeatmapLayers({
  data,
  sourceId,
  layerIdPrefix,
  weightProperty,
  precomputedSurface = false,
  circlePaint,
  accidentPoints = [],
  inspectDensity = false,
  showPointsOverlay = true,
}: Props) {
  const { current: mapRef } = useMap();
  const [selected, setSelected] = useState<{
    longitude: number;
    latitude: number;
    density: number;
    severity?: string;
    accidentId?: string | null;
  } | null>(null);
  const heatmapLayerId = `${layerIdPrefix}-heatmap`;
  const surfaceCircleLayerId = `${layerIdPrefix}-surface-circles`;
  const samplePointLayerId = `${layerIdPrefix}-points`;
  const accidentSourceId = `${sourceId}-accidents`;
  const accidentPointLayerId = `${layerIdPrefix}-accident-points`;
  // const densityValue = ["get", weightProperty];
  const normalizedDensityValue = [
    "coalesce",
    ["get", "normalized_density"],
    ["get", weightProperty],
    0,
  ];
  const densityColor = [
    "interpolate", ["linear"], ["heatmap-density"],
    0, "rgba(20, 94, 168, 0)",
    0.01, "rgba(38, 156, 218, 0.28)",
    0.12, "rgba(51, 189, 171, 0.48)",
    0.28, "rgba(75, 195, 105, 0.62)",
    0.5, "rgba(190, 215, 55, 0.74)",
    0.66, "rgba(190, 215, 55, 0.72)",
    0.8, "rgba(250, 205, 45, 0.84)",
    0.91, "rgba(247, 139, 34, 0.93)",
    0.975, "rgba(225, 56, 36, 0.98)",
    1, "rgba(156, 18, 28, 1)",
  ];
  const heatmapWeight = useMemo(
    () => ["get", weightProperty],
    [weightProperty]
  );
  const accidentGeojson = useMemo<GeoJSON.FeatureCollection>(() => ({
    type: "FeatureCollection",
    features:
      accidentPoints
        ?.filter((point) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
        .map((point) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [point.longitude, point.latitude],
          },
          properties: {
            accident_id: point.accident_id,
            severity: point.severity,
          },
        })) ?? [],
  }), [accidentPoints]);
  const hasAccidentPoints = accidentGeojson.features.length > 0;

  useEffect(() => {
    if (!inspectDensity) return;
    const map = mapRef?.getMap();
    if (!map) return;
    const onClick = (event: any) => {
      const layers = hasAccidentPoints ? [accidentPointLayerId] : [samplePointLayerId];
      const feature = map.queryRenderedFeatures(event.point, { layers })[0];
      if (!feature) return;
      setSelected({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        density: Number(feature.properties?.density) || 0,
        severity: feature.properties?.severity,
        accidentId: feature.properties?.accident_id,
      });
    };
    const onMove = (event: any) => {
      const layers = hasAccidentPoints ? [accidentPointLayerId] : [samplePointLayerId];
      const features = map.queryRenderedFeatures(event.point, { layers });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
    };
    map.on("click", onClick);
    map.on("mousemove", onMove);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      map.getCanvas().style.cursor = "";
    };
  }, [inspectDensity, mapRef, samplePointLayerId, accidentPointLayerId, hasAccidentPoints]);

  const radius = precomputedSurface
    ? ["interpolate", ["exponential", 1.2], ["zoom"], 7, 26, 9, 34, 11, 28, 13, 20, 15, 12, 17, 7]
    : zoomInterpolate([[7, 3], [9, 5], [11, 9], [13, 15], [15, 22], [17, 30]]);
  const intensity = precomputedSurface
    ? ["interpolate", ["linear"], ["zoom"], 7, 0.42, 9, 0.58, 11, 0.78, 13, 0.98, 15, 0.82, 17, 0.56]
    : zoomInterpolate([[7, 0.25], [9, 0.4], [11, 0.6], [13, 0.8], [15, 1], [17, 1.2]]);
  const opacity = precomputedSurface
    ? ["interpolate", ["linear"], ["zoom"], 7, 0.74, 10, 0.82, 13, 0.68, 15, 0.32, 17, 0.14]
    : zoomInterpolate([[8, 0.85], [11, 0.8], [13, 0.65], [15, 0.5], [16, 0.4]]);
  const color = precomputedSurface ? densityColor : buildHeatmapColorExpression();
  const kdeSurfaceCirclePaint = {
    "circle-color": [
      "interpolate", ["linear"],
      normalizedDensityValue,
      0, "rgba(38, 156, 218, 0)",
      0.04, "rgba(38, 156, 218, 0.24)",
      0.16, "rgba(51, 189, 171, 0.36)",
      0.34, "rgba(75, 195, 105, 0.48)",
      0.55, "rgba(250, 205, 45, 0.58)",
      0.78, "rgba(247, 139, 34, 0.68)",
      1, "rgba(225, 56, 36, 0.78)",
    ],
    "circle-radius": [
      "interpolate", ["exponential", 1.15], ["zoom"],
      7, 7,
      10, 10,
      13, 8,
      15, 4.5,
      17, 2.5,
    ],
    "circle-opacity": [
      "*",
      ["interpolate", ["linear"], normalizedDensityValue, 0, 0, 0.04, 0.24, 0.2, 0.48, 1, 0.86],
      ["interpolate", ["linear"], ["zoom"], 7, 0.75, 11, 0.65, 14, 0.42, 16, 0.18, 17, 0.08],
    ],
    "circle-blur": ["interpolate", ["linear"], ["zoom"], 7, 1.4, 12, 1.15, 16, 0.6],
    "circle-stroke-width": 0,
  };
  const defaultCirclePaint = {
    "circle-color": [
      "interpolate", ["linear"],
      normalizedDensityValue,
      0, "#3BB6D6",
      0.28, "#4BC369",
      0.55, "#F2CE3F",
      0.78, "#F27C2E",
      1, "#B9121B",
    ],
    "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 0.5, 14, 1.1, 16, 1.8],
    "circle-opacity": [
      "case",
      ["<", normalizedDensityValue, 0.18],
      0,
      ["interpolate", ["linear"], ["zoom"], 12, 0, 14, 0.1, 16, 0.2],
    ],
    "circle-stroke-width": 0.4,
    "circle-stroke-color": "#FFFFFF",
    "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 15, 0.55],
  };

  return (
    <>
      <Source id={sourceId} type="geojson" data={data as any}>
        <Layer
          id={heatmapLayerId}
          type="heatmap"
          paint={{
            "heatmap-weight": heatmapWeight as any,
            "heatmap-radius": radius as any,
            "heatmap-intensity": intensity as any,
            "heatmap-opacity": opacity as any,
            "heatmap-color": color as any,
          }}
        />
        {precomputedSurface && (
          <Layer
            id={surfaceCircleLayerId}
            type="circle"
            paint={kdeSurfaceCirclePaint as any}
          />
        )}
        {(!precomputedSurface || !hasAccidentPoints) && showPointsOverlay && (
          <Layer
            id={samplePointLayerId}
            type="circle"
            minzoom={11}
            paint={(circlePaint ?? defaultCirclePaint) as any}
          />
        )}
      </Source>
      {hasAccidentPoints && (
        <Source id={accidentSourceId} type="geojson" data={accidentGeojson as any}>
          <Layer
            id={accidentPointLayerId}
            type="circle"
            minzoom={12}
            paint={{
              "circle-color": severityColorExpression as any,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 14, 2.5, 16, 3.5, 18, 4] as any,
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13.5, 0.18, 15, 0.7, 17, 0.95] as any,
              "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0.1, 15, 0.8, 17, 1.2] as any,
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 15, 0.72, 17, 0.95] as any,
            }}
          />
        </Source>
      )}
      {selected && (
        <Popup
          longitude={selected.longitude}
          latitude={selected.latitude}
          closeOnClick
          offset={10}
          onClose={() => setSelected(null)}
        >
          <div className="pr-4 text-xs font-medium text-slate-700">
            {selected.severity ? (
              <>
                <div>Severity: {selected.severity}</div>
                {selected.accidentId && <div>Accident ID: {selected.accidentId}</div>}
              </>
            ) : (
              <>KDE density: {selected.density.toFixed(2)} / 100</>
            )}
          </div>
        </Popup>
      )}
    </>
  );
}

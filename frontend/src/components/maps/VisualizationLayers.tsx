// frontend/src/components/maps/VisualizationLayers.tsx

import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import type { HeatmapPoint } from "../../types/dashboard";
import GeoJsonHeatmapLayers from "./GeoJsonHeatmapLayers";
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

function BlackspotLayers({ geojsonData }: { geojsonData: GeoJSON.FeatureCollection }) {
  const { current: mapRef } = useMap();
  const [hovered, setHovered] = useState<HoverState>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;

    const clusterLayers = ["blackspot-core", "blackspot-halo"];
    const pointLayers = ["blackspot-single-point"];

    const onMove = (e: any) => {
      const clusters = map.queryRenderedFeatures(e.point, { layers: clusterLayers });
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
      const points = map.queryRenderedFeatures(e.point, { layers: pointLayers });
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

    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      setHovered(null);
    };

    map.on("mousemove", onMove);
    map.on("mouseout", onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onLeave);
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
            "circle-color": BS_HALO_COLOR_EXPR as any,
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
            "circle-color": BS_COLOR_EXPR as any,
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
            "text-size": BS_TEXT_SIZE_EXPR as any,
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
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 7, 17, 14],
            "circle-blur": 0.65,
          }}
        />

        {/* ── Unclustered point core (severity-colored) ───────────────── */}
        <Layer
          id="blackspot-single-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": BS_SINGLE_COLOR_EXPR as any,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 4, 17, 7],
            "circle-opacity": 0.9,
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
    const risk = getRiskLabel(count);
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
      {hovered.severity && <div><b>Severity:</b> {hovered.severity}</div>}
      {hovered.police_station && <div><b>Station:</b> {safeText(hovered.police_station)}</div>}
      {hovered.road_name && <div><b>Road:</b> {safeText(hovered.road_name)}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

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
            /* 1. Removed anchor="top" to enable Maplibre's smart auto-positioning.
                 It will now automatically flip above/below depending on screen space.
            */

            /* 2. Changed to true so clicking anywhere on the map closes the popup 
            */
            closeOnClick={true}

            /* 3. Added a slight offset so the popup doesn't cover the accident marker 
                 when it auto-positions 
            */
            offset={12}

            closeButton
            onClose={() => setSelected(null)}
          >
            <AccidentPopupBody
              selected={selected}
              showPedestrianCasualties={type === "density_heatmap"}
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
          /* 1. Removed anchor="top" to enable Maplibre's smart auto-positioning.
               It will now automatically flip above/below depending on screen space.
          */

          /* 2. Changed to true so clicking anywhere on the map closes the popup 
          */
          closeOnClick={true}

          /* 3. Added a slight offset so the popup doesn't cover the accident marker 
               when it auto-positions 
          */
          offset={12}

          closeButton
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
// Shared popup body (Adaptive GIS Inspection Card)
// ---------------------------------------------------------------------------

const getSeverityBadgeClasses = (severity?: string | null): string => {
  const s = (severity || "").toLowerCase();
  if (s.includes("fatal")) return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  if (s.includes("grievous")) return "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20";
  if (s.includes("minor injury hospitalized")) return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20";
  if (s.includes("minor injury non")) return "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20";
  if (s.includes("no injury") || s.includes("damage only")) return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
  return "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20";
};

function AccidentPopupBody({
  selected,
  showPedestrianCasualties = false,
}: {
  selected: SelectedAccident;
  showPedestrianCasualties?: boolean;
}) {
  const pedestrianTotal = pedestrianCasualtyTotal(selected);
  const severityBadgeClass = getSeverityBadgeClasses(selected.severity);

  return (
    /* Added pr-5 (padding-right) to ensure content NEVER touches the Maplibre absolute close button.
      Switched to a more flexible min/max width system to allow vertical growth.
    */
    <div className="flex flex-col w-full min-w-[250px] max-w-[320px] font-sans pt-1 pr-5">

      {/* --- Header --- */}
      <div className="flex flex-col mb-4">
        {/* Badge is now isolated so it doesn't compete with the top-right close button */}
        <div className="mb-2.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${severityBadgeClass}`}
          >
            {safeText(selected.severity)}
          </span>
        </div>

        {/* Road Name: Explicit break-words so long Indian road names wrap cleanly */}
        {/* <h3 className="text-[15px] font-semibold text-slate-800 leading-snug break-words mb-2">
          {safeText(selected.road_name)}
        </h3> */}

        {/* Meta Info: Grouped Date and ID dynamically. Uses flex-wrap so it drops to a new line if needed */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-slate-500">
          <span className="shrink-0">{formatDate(selected.accident_date_time)}</span>
          {selected.accident_id && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0"></span>
              <span className="break-words">ID: {selected.accident_id}</span>
            </>
          )}
        </div>
      </div>

      {/* --- Dashboard Metric Tiles --- */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-4">

        {/* Full width to safely hold long collision type strings */}
        <div className="flex flex-col col-span-2">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Collision Type
          </span>
          <span className="text-[13px] font-medium text-slate-700 leading-tight break-words">
            {safeText(selected.collision_type)}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Coordinates
          </span>
          <span className="text-[13px] font-medium text-slate-700 break-words">
            {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
          </span>
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1 shrink-0">
            Road Class
          </span>
          <span className="text-[13px] font-medium text-slate-700 leading-tight break-words">
            {safeText(selected.road_classification)}
          </span>
        </div>

        {/* --- Pedestrian Casualty Metric --- */}
        {showPedestrianCasualties && pedestrianTotal > 0 && (
          /* Changed to items-start so if the text wraps to 3 lines, the icon stays at the top */
          <div className="col-span-2 mt-1 flex items-start bg-red-50/50 rounded-lg p-2.5 ring-1 ring-inset ring-red-100">
            <div className="h-8 w-8 bg-white rounded-full shadow-sm flex items-center justify-center mr-3 shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold text-red-800/80 uppercase tracking-wider mb-0.5">
                Pedestrian Casualties
              </span>
              <span className="text-sm font-semibold text-red-700">
                {pedestrianTotal} Recorded
              </span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

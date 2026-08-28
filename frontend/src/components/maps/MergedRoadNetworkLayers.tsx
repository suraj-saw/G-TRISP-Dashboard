import { Source, Layer } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import { useMemo } from "react";

interface Props {
  geojsonData: FeatureCollection | null;
}

/**
 * Renders the merged road network buffers and their names.
 * Uses a color coding scheme based on the road classification.
 */
export default function MergedRoadNetworkLayers({ geojsonData }: Props) {
  if (!geojsonData || !geojsonData.features || geojsonData.features.length === 0) {
    return null;
  }

  // Define a color expression based on road classification
  const classificationColorExpr = useMemo(() => {
    return [
      "case",
      ["in", ["get", "road_classification"], ["literal", ["Expressway", "EXPRESSWAY", "Expressway / EW", "EW", "motorway", "motorway_link"]]], "#4C1D95", // Deep Purple
      ["in", ["get", "road_classification"], ["literal", ["NH", "National Highway", "NATIONAL HIGHWAY", "National highway", "NH - National Highway", "trunk", "trunk_link"]]], "#DC2626", // Red
      ["in", ["get", "road_classification"], ["literal", ["SH", "State Highway", "STATE HIGHWAY", "State highway", "SH - State Highway", "primary", "primary_link"]]], "#F97316", // Orange
      ["in", ["get", "road_classification"], ["literal", ["MDR", "Major District Road", "MAJOR DISTRICT ROAD", "Major district road", "MDR - Major District Road", "secondary", "secondary_link"]]], "#2563EB", // Blue
      ["in", ["get", "road_classification"], ["literal", ["ODR", "Other District Road", "OTHER DISTRICT ROAD", "Other district road", "ODR - Other District Road", "tertiary", "tertiary_link"]]], "#0891B2", // Cyan
      ["in", ["get", "road_classification"], ["literal", ["VR", "Village Road", "VILLAGE ROAD", "Village road", "VR - Village Road"]]], "#16A34A", // Green
      ["in", ["get", "road_classification"], ["literal", ["Arterial Road", "ARTERIAL ROAD", "Arterial road", "AR"]]], "#DB2777", // Pink
      ["in", ["get", "road_classification"], ["literal", ["Sub-Arterial Road", "SUB-ARTERIAL ROAD", "Sub-arterial road", "SAR"]]], "#F43F5E", // Rose
      ["in", ["get", "road_classification"], ["literal", ["Collector Road", "COLLECTOR Road", "Collector road", "CR"]]], "#D97706", // Amber
      ["in", ["get", "road_classification"], ["literal", ["Local Road", "LOCAL ROAD", "Local road", "LR", "residential", "living_street", "unclassified", "service", "track", "path"]]], "#14B8A6", // Teal
      "#9CA3AF"                      // Default / Unknown (Gray)
    ];
  }, []);

  return (
    <Source id="merged-road-network-source" type="geojson" data={geojsonData}>
      {/* ── Merged Road Buffers (Fill) ────────────────────────────────────── */}
      <Layer
        id="merged-road-network-fill"
        type="fill"
        paint={{
          "fill-color": classificationColorExpr as any,
          "fill-opacity": 1.0
        }}
      />
      
      {/* ── Merged Road Buffers (Outline) ─────────────────────────────────── */}
      <Layer
        id="merged-road-network-outline"
        type="line"
        paint={{
          "line-color": classificationColorExpr as any,
          "line-width": 1.5,
          "line-opacity": 0.8
        }}
      />

      {/* ── Road Names ────────────────────────────────────────────────────── */}
      {/* 
        Hide labels at low zoom levels. They fade in from zoom 12 to 13.
        Note: symbol-placement: "point" is preferred for polygons.
      */}
      <Layer
        id="merged-road-network-labels"
        type="symbol"
        minzoom={12}
        layout={{
          "symbol-placement": "point",
          "text-field": [
            "case",
            ["==", ["get", "road_name"], "Unknown"], "",
            ["get", "road_name"]
          ],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12, 10,
            16, 14
          ],
          "text-max-angle": 45,
          "text-letter-spacing": 0.05
        }}
        paint={{
          "text-color": "#1E293B",
          "text-halo-color": "#FFFFFF",
          "text-halo-width": 1.5,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12, 0,
            13, 1
          ]
        }}
      />
    </Source>
  );
}

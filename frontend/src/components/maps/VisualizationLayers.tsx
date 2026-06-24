import { useEffect, useMemo, useState } from "react";
import { Source, Layer, Popup, useMap } from "react-map-gl/maplibre";
import type { HeatmapPoint } from "../../types/dashboard";

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

const safeText = (value?: string | null) => {
  if (!value || value === "nan") return "Unknown";
  return value;
};

const formatDate = (value?: string | null) => {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
};

// Add near safeText / formatDate helpers
const getSeverityWeight = (severity?: string | null) => {
  const value = (severity || "").toLowerCase();

  if (value.includes("fatal")) return 1;
  if (value.includes("grievous")) return 0.85;
  if (value.includes("minor")) return 0.55;
  if (value.includes("damage")) return 0.3;

  return 0.5;
};

export function VisualizationLayers({
  data,
  type,
  selectedSeverity = "all",
}: Props) {
  const { current: mapRef } = useMap();
  const [selected, setSelected] = useState<SelectedAccident | null>(null);

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(() => {
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
              severity_weight: getSeverityWeight(p.severity),
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
  }, [data]);

  useEffect(() => {
    if (type !== "location_markers") {
      setSelected(null);
      return;
    }

    const map = mapRef?.getMap();
    if (!map) return;

    const handleClick = (event: any) => {
      if (!map.getLayer("accident-points")) return;

      const feature = map.queryRenderedFeatures(event.point, {
        layers: ["accident-points"],
      })[0];

      if (!feature) return;

      setSelected({
        longitude: event.lngLat.lng,
        latitude: event.lngLat.lat,
        ...feature.properties,
      });
    };

    const handleMouseMove = (event: any) => {
      if (!map.getLayer("accident-points")) {
        map.getCanvas().style.cursor = "";
        return;
      }

      const features = map.queryRenderedFeatures(event.point, {
        layers: ["accident-points"],
      });

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

  if (type === "density_heatmap") {
    return (
      <>
        <Source
          id="accident-density-source"
          type="geojson"
          data={geojsonData as any}
        >
          <Layer
            id="accident-density-heatmap"
            type="heatmap"
            paint={{
              "heatmap-weight": [
                "interpolate",
                ["linear"],
                ["coalesce", ["get", "severity_weight"], 0.5],
                0,
                0,
                1,
                1,
              ],
              "heatmap-intensity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                9,
                0.8,
                12,
                1.8,
                15,
                3,
              ],
              "heatmap-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                9,
                14,
                12,
                28,
                15,
                44,
              ],
              "heatmap-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                9,
                0.85,
                14,
                0.75,
              ],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(59,130,246,0)",
                0.2,
                "rgba(96,165,250,0.45)",
                0.4,
                "rgba(34,197,94,0.55)",
                0.6,
                "rgba(250,204,21,0.7)",
                0.8,
                "rgba(249,115,22,0.85)",
                1,
                "rgba(220,38,38,0.95)",
              ],
            }}
          />
        </Source>
      </>
    );
  }

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

  const markerColor =
    selectedSeverity === "all"
      ? "#E85D4A"
      : [
          "match",
          ["get", "severity"],
          "Fatal",
          "#dc2626",
          "Grievous Injury",
          "#f97316",
          "Minor Injury",
          "#2563eb",
          "Damage Only",
          "#22c55e",
          "#64748b",
        ];

  return (
    <>
      <Source
        id="accident-marker-source"
        type="geojson"
        data={geojsonData as any}
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
              12,
              4.5,
              15,
              6,
            ],
            "circle-color": markerColor as any,
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              9,
              0.65,
              13,
              0.9,
            ],
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
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
        </Popup>
      )}
    </>
  );
}

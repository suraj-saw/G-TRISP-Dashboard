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
      <Source
        id="accident-density-source"
        type="geojson"
        data={geojsonData as any}
      >
        <Layer
          id="accident-density-soft-base"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              16,
              11,
              30,
              14,
              54,
            ],
            "circle-color": "#818cf8",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.22,
              11,
              0.28,
              14,
              0.34,
            ],
            "circle-blur": 1,
            "circle-stroke-width": 0,
          }}
        />
        <Layer
          id="accident-density-hot-core"
          type="circle"
          paint={{
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              5,
              11,
              10,
              14,
              18,
            ],
            "circle-color": "#4f46e5",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              0.06,
              11,
              0.1,
              14,
              0.16,
            ],
            "circle-blur": 0.85,
            "circle-stroke-width": 0,
          }}
        />
      </Source>
    );
  }

  if (type === "blackspot") {
    return (
      <Source
        id="blackspot-source"
        type="geojson"
        data={geojsonData as any}
        cluster
        clusterMaxZoom={14}
        clusterRadius={45}
      >
        <Layer
          id="clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#64748b",
              20,
              "#334155",
              75,
              "#020617",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              12,
              20,
              20,
              75,
              30,
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": "{point_count_abbreviated}",
            "text-size": 12,
          }}
          paint={{ "text-color": "#ffffff" }}
        />
        <Layer
          id="unclustered-point"
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": "#111827",
            "circle-radius": 4,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          }}
        />
      </Source>
    );
  }

  if (type === "district_hotspot") {
    return (
      <Source
        id="hotspot-source"
        type="geojson"
        data={geojsonData as any}
        cluster
        clusterMaxZoom={13}
        clusterRadius={42}
      >
        <Layer
          id="hotspot-clusters"
          type="circle"
          filter={["has", "point_count"]}
          paint={{
            "circle-color": [
              "step",
              ["get", "point_count"],
              "#f59e0b",
              25,
              "#ef4444",
              100,
              "#7f1d1d",
            ],
            "circle-radius": [
              "step",
              ["get", "point_count"],
              16,
              25,
              26,
              100,
              38,
            ],
            "circle-opacity": 0.82,
          }}
        />
        <Layer
          id="hotspot-cluster-count"
          type="symbol"
          filter={["has", "point_count"]}
          layout={{
            "text-field": "{point_count_abbreviated}",
            "text-size": 13,
          }}
          paint={{ "text-color": "#ffffff" }}
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

// frontend/src/components/maps/AccidentMarkerMap.tsx
import { useMemo } from "react";
import Map, { Source, Layer } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { useDashboard } from "../../hooks/useDashboard";
import { getMapStyleUrl } from "./mapStyles";
import { GUJARAT_MAP_CENTER } from "../../config/constants";
import { defaultFilters } from "../../features/dashboard/filterConfig";

interface Props {
  baseMap?: string;
}

export default function AccidentMarkerMap({ baseMap }: Props) {
  const { data } = useDashboard(defaultFilters);

  const geojsonData = useMemo(() => {
    return {
      type: "FeatureCollection",
      features:
        data?.heatmap?.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
          properties: { id: p.accident_id },
        })) || [],
    };
  }, [data]);

  return (
    <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-[#E4E8F4] relative">
      <Map
        initialViewState={GUJARAT_MAP_CENTER}
        mapStyle={getMapStyleUrl(baseMap)}
      >
        <Source
          type="geojson"
          data={geojsonData as any}
          cluster={true}
          clusterMaxZoom={14}
          clusterRadius={50}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#51bbd6",
                100,
                "#f1f075",
                750,
                "#f28cb1",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                15,
                100,
                20,
                750,
                25,
              ],
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
            paint={{ "text-color": "#000" }}
          />
          <Layer
            id="unclustered-point"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": "#E85D4A",
              "circle-radius": 5,
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
            }}
          />
        </Source>
      </Map>
    </div>
  );
}

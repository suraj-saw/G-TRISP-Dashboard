// frontend/src/components/maps/BlackspotMap.tsx
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

export default function BlackspotMap({ baseMap }: Props) {
  const { data } = useDashboard(defaultFilters);

  const geojsonData = useMemo(() => {
    return {
      type: "FeatureCollection",
      features:
        data?.heatmap?.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
          properties: { severity: p.severity },
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
          clusterMaxZoom={12}
          clusterRadius={30}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": [
                "step",
                ["get", "point_count"],
                "#666",
                20,
                "#333",
                100,
                "#000",
              ],
              "circle-radius": [
                "step",
                ["get", "point_count"],
                10,
                20,
                20,
                100,
                30,
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#fff",
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
            paint={{ "text-color": "#FFF" }}
          />
          <Layer
            id="unclustered-point"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{ "circle-color": "#000", "circle-radius": 4 }}
          />
        </Source>
      </Map>
    </div>
  );
}

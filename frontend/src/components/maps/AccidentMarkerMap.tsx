import { useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDashboard } from '../../hooks/useDashboard';

export default function AccidentMarkerMap() {
  const { data } = useDashboard({ district: "all", year: "all", severity: "all", road_classification: "all", weather_condition: "all", light_condition: "all", collision_type: "all" });

  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: data?.heatmap?.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: { id: p.accident_id }
      })) || []
    };
  }, [data]);

  return (
    <div className="h-[400px] w-full rounded-xl overflow-hidden shadow-sm border border-[#E4E8F4] relative">
      <Map
        initialViewState={{ longitude: 71.1924, latitude: 22.2587, zoom: 6 }}
        mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
      >
        <Source type="geojson" data={geojsonData as any} cluster={true} clusterMaxZoom={14} clusterRadius={50}>
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
              'circle-radius': ['step', ['get', 'point_count'], 15, 100, 20, 750, 25]
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{ 'text-field': '{point_count_abbreviated}', 'text-size': 12 }}
            paint={{ 'text-color': '#000' }}
          />
          <Layer
            id="unclustered-point"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{ 'circle-color': '#E85D4A', 'circle-radius': 5, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }}
          />
        </Source>
      </Map>
    </div>
  );
}

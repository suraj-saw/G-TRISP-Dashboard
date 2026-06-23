import { useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDashboard } from '../../hooks/useDashboard';

export default function AccidentHeatmap() {
  const { data } = useDashboard({ district: "all", year: "all", severity: "all", road_classification: "all", weather_condition: "all", light_condition: "all", collision_type: "all" });

  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: data?.heatmap?.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: { severity: p.severity }
      })) || []
    };
  }, [data]);

  return (
    <div className="h-[400px] w-full rounded-xl overflow-hidden shadow-sm border border-[#E4E8F4] relative">
      <Map
        initialViewState={{ longitude: 71.1924, latitude: 22.2587, zoom: 6 }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        interactive
      >
        {geojsonData.features.length > 0 && (
          <Source type="geojson" data={geojsonData as any}>
            <Layer
              id="heatmap-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': 1,
                'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0, 'rgba(33,102,172,0)',
                  0.2, 'rgb(103,169,207)',
                  0.4, 'rgb(209,229,240)',
                  0.6, 'rgb(253,219,199)',
                  0.8, 'rgb(239,138,98)',
                  1, 'rgb(178,24,43)'
                ],
                'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 9, 20],
                'heatmap-opacity': 0.8
              }}
            />
          </Source>
        )}
      </Map>
    </div>
  );
}

import { useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useDashboard } from '../../hooks/useDashboard';
import { getMapStyleUrl } from './mapStyles';

interface Props {
  baseMap?: string;
}

export default function AccidentGISMap({ baseMap }: Props) {
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
        mapStyle={getMapStyleUrl(baseMap)}
      >
        <Source type="geojson" data={geojsonData as any}>
          <Layer
            id="gis-points"
            type="circle"
            paint={{
              'circle-color': [
                'match',
                ['get', 'severity'],
                'Fatal', '#E85D4A',
                'Grievous Injury', '#F5A623',
                'Minor Injury', '#2C6EF2',
                '#9BA3C2'
              ],
              'circle-radius': 4,
              'circle-opacity': 0.8,
              'circle-stroke-width': 1,
              'circle-stroke-color': '#FFFFFF'
            }}
          />
        </Source>
      </Map>
    </div>
  );
}

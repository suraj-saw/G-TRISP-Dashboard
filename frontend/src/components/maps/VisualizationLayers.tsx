import { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { HeatmapPoint } from '../../types/dashboard';

interface Props {
  data?: HeatmapPoint[];
  type: string;
}

export function VisualizationLayers({ data, type }: Props) {
  const geojsonData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: data?.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
        properties: { id: p.accident_id, severity: p.severity }
      })) || []
    };
  }, [data]);

  if (!geojsonData.features.length) return null;

  if (type === 'density_heatmap') {
    return (
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
    );
  }

  if (type === 'blackspot') {
    return (
      <Source type="geojson" data={geojsonData as any} cluster={true} clusterMaxZoom={12} clusterRadius={30}>
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': ['step', ['get', 'point_count'], '#666', 20, '#333', 100, '#000'],
            'circle-radius': ['step', ['get', 'point_count'], 10, 20, 20, 100, 30],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff'
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{ 'text-field': '{point_count_abbreviated}', 'text-size': 12 }}
          paint={{ 'text-color': '#FFF' }}
        />
        <Layer
          id="unclustered-point"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{ 'circle-color': '#000', 'circle-radius': 4 }}
        />
      </Source>
    );
  }

  if (type === 'gis') {
    return (
      <Source type="geojson" data={geojsonData as any}>
        <Layer
          id="gis-points"
          type="circle"
          paint={{
            'circle-color': [
              'match', ['get', 'severity'],
              'Fatal', '#E85D4A',
              'Grievous Injury', '#F5A623',
              'Minor Injury', '#2C6EF2',
              '#9BA3C2'
            ],
            'circle-radius': 6,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
            'circle-opacity': 0.8
          }}
        />
      </Source>
    );
  }

  if (type === 'district_hotspot') {
    return (
      <Source type="geojson" data={geojsonData as any} cluster={true} clusterMaxZoom={10} clusterRadius={40}>
        <Layer
          id="hotspot-clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': ['step', ['get', 'point_count'], '#FFA500', 50, '#FF4500', 200, '#8B0000'],
            'circle-radius': ['step', ['get', 'point_count'], 20, 50, 30, 200, 40],
            'circle-opacity': 0.8
          }}
        />
        <Layer
          id="hotspot-cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{ 'text-field': '{point_count_abbreviated}', 'text-size': 14 }}
          paint={{ 'text-color': '#FFFFFF' }}
        />
        <Layer
          id="hotspot-unclustered-point"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{ 'circle-color': '#FFA500', 'circle-radius': 6, 'circle-opacity': 0.7 }}
        />
      </Source>
    );
  }

  // Default to location markers
  return (
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
  );
}

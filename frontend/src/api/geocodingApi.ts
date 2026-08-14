import axios from 'axios';

export interface GeocodingResult {
  place_id: number | string;
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class: string;
}

/**
 * Searches for a location using OpenStreetMap Nominatim API.
 * Constrains results to India and prioritizes the given bounding box.
 * 
 * @param query The search string
 * @param bbox Optional bounding box [minLng, minLat, maxLng, maxLat] to constrain results
 * @returns Array of geocoding results
 */
export const searchLocation = async (
  query: string,
  bbox: [number, number, number, number] | null
): Promise<GeocodingResult[]> => {
  if (!query || query.trim() === '') {
    return [];
  }

  try {
    const params: Record<string, string | number> = {
      q: query,
      limit: 6,
    };

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      // Photon uses minLon,minLat,maxLon,maxLat format
      params.bbox = `${minLng},${minLat},${maxLng},${maxLat}`;
    }

    const response = await axios.get('https://photon.komoot.io/api/', {
      params,
    });

    // Map Photon GeoJSON features to the expected GeocodingResult format
    return response.data.features.map((feature: any) => {
      const { properties, geometry } = feature;
      
      const parts = [];
      if (properties.name) parts.push(properties.name);
      if (properties.street && properties.street !== properties.name) parts.push(properties.street);
      if (properties.district && properties.district !== properties.name) parts.push(properties.district);
      if (properties.city && properties.city !== properties.district && properties.city !== properties.name) parts.push(properties.city);
      if (properties.state) parts.push(properties.state);
      
      // Ensure we don't have duplicates in the display name
      const uniqueParts = Array.from(new Set(parts)).filter(Boolean);

      return {
        place_id: properties.osm_id || Math.random().toString(),
        lat: geometry.coordinates[1].toString(),
        lon: geometry.coordinates[0].toString(),
        display_name: uniqueParts.join(', ') || 'Unknown Location',
        type: properties.type || '',
        class: properties.osm_value || '',
      };
    });
  } catch (error) {
    console.error("Geocoding API error:", error);
    return [];
  }
};

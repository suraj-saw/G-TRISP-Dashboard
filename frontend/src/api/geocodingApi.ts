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
      format: 'json',
      addressdetails: 1,
      countrycodes: 'in', // Constrain to India
      limit: 6,
    };

    if (bbox) {
      const [minLng, minLat, maxLng, maxLat] = bbox;
      // Nominatim viewbox format: <x1>,<y1>,<x2>,<y2> (left, top, right, bottom)
      params.viewbox = `${minLng},${maxLat},${maxLng},${minLat}`;
      params.bounded = 1;
    }

    const response = await axios.get<any[]>('https://nominatim.openstreetmap.org/search', {
      params,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    return response.data.map((item) => ({
      place_id: item.place_id,
      lat: item.lat,
      lon: item.lon,
      display_name: item.display_name,
      type: item.type,
      class: item.class,
    }));
  } catch (error) {
    console.error("Geocoding API error:", error);
    return [];
  }
};

/**
 * Performs reverse geocoding using the Nominatim API.
 * 
 * @param lat The latitude of the location
 * @param lon The longitude of the location
 * @returns The best matching address component or landmark name
 */
export const reverseGeocode = async (
  lat: number,
  lon: number
): Promise<string | null> => {
  try {
    const params = {
      lat,
      lon,
      format: 'json',
      zoom: 18, // Detail level: building/street
      addressdetails: 1,
    };

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (response.data && response.data.address) {
      const address = response.data.address;
      
      // Prioritize specific landmark/street over general area
      const landmark = 
        address.amenity || 
        address.building || 
        address.shop || 
        address.office || 
        address.highway || 
        address.road || 
        address.suburb || 
        address.neighbourhood ||
        address.village;
        
      if (landmark) {
        return landmark;
      }
      
      return response.data.display_name.split(',')[0];
    }

    return null;
  } catch (error) {
    console.error("Reverse geocoding API error:", error);
    return null;
  }
};

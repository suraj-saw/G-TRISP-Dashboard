// frontend/src/api/geoApi.ts
import API from "./axios";

export async function fetchSuratBoundary(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>("/geo/surat-boundary");
  return res.data;
}

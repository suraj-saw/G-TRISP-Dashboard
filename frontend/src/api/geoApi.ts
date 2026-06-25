// frontend/src/api/geoApi.ts
import API from "./axios";
import { GEO_API_BASE } from "../config/constants";

export async function fetchSuratBoundary(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/surat-boundary`
  );
  return res.data;
}

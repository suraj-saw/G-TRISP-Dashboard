// frontend/src/api/geoApi.ts
import API from "./axios";
import { GEO_API_BASE } from "../config/constants";

export async function fetchSuratBoundary(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/surat-boundary`
  );
  return res.data;
}

export async function fetchAllGujaratDistricts(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/all-districts`
  );
  return res.data;
}

export async function fetchDistrictBoundaryBySlug(
  slug: string
): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/district-boundary/${slug}`
  );
  return res.data;
}

export interface DistrictListItem {
  id: number;
  name: string;
  slug: string;
}

export async function fetchDistrictList(): Promise<DistrictListItem[]> {
  const res = await API.get<{ districts: DistrictListItem[]; count: number }>(
    `${GEO_API_BASE}/districts`
  );
  return res.data.districts;
}

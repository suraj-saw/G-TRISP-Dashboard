// frontend/src/api/geoApi.ts
import API from "./axios";
import { GEO_API_BASE, GEO_DATA_VERSION } from "../config/constants";

const GEO_REQUEST_CONFIG = {
  params: { boundary_version: GEO_DATA_VERSION },
} as const;

export async function fetchSuratBoundary(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/surat-boundary`,
    GEO_REQUEST_CONFIG
  );
  return res.data;
}

export async function fetchAllGujaratDistricts(): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/all-districts`,
    GEO_REQUEST_CONFIG
  );
  return res.data;
}

export async function fetchDistrictBoundaryBySlug(
  slug: string
): Promise<GeoJSON.FeatureCollection> {
  const res = await API.get<GeoJSON.FeatureCollection>(
    `${GEO_API_BASE}/district-boundary/${slug}`,
    GEO_REQUEST_CONFIG
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
    `${GEO_API_BASE}/districts`,
    GEO_REQUEST_CONFIG
  );
  return res.data.districts;
}

export interface TalukaListItem {
  id: number;
  name: string;
  slug: string;
  district: string;
}

export async function fetchTalukasForDistrict(
  districtSlug: string
): Promise<TalukaListItem[]> {
  const res = await API.get<{ talukas: TalukaListItem[]; count: number }>(
    `${GEO_API_BASE}/district-boundary/${districtSlug}/talukas`,
    GEO_REQUEST_CONFIG
  );
  return res.data.talukas;
}
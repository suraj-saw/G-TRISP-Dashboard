// frontend/src/api/dashboardApi.ts
import API from "./axios";
import { SURAT_API_BASE } from "../config/constants";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
  TemporalAnalysisData,
} from "../types/dashboard";

// ---------------------------------------------------------------------------
// Parameter builders
// ---------------------------------------------------------------------------

/**
 * Converts dashboard filter state into query-string parameters for the
 * Surat dashboard endpoints.
 *
 * "all" / "Surat" are sentinel values meaning "no filter"; they are omitted
 * from the request so the backend returns the full dataset.
 */
const getParams = (
  filters: DashboardFilters
): Record<string, string | number> => {
  const params: Record<string, string | number> = {};

  // police_station replaces district for Surat-level granularity
  if (
    filters.district &&
    filters.district !== "all" &&
    filters.district !== "Surat"
  ) {
    params.police_station = filters.district;
  }

  if (filters.year !== "all") params.year = filters.year;
  if (filters.severity !== "all") params.severity = filters.severity;
  if (filters.road_classification !== "all")
    params.road_classification = filters.road_classification;
  if (filters.weather_condition !== "all")
    params.weather_condition = filters.weather_condition;
  if (filters.light_condition !== "all")
    params.light_condition = filters.light_condition;
  if (filters.collision_type !== "all")
    params.collision_type = filters.collision_type;

  return params;
};

const hasValue = (value?: string): boolean =>
  value !== undefined && value !== "" && value !== "all";

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const { data } = await API.get(`${SURAT_API_BASE}/filter-options`);
  return data;
};

export const fetchDashboardData = async (
  filters: DashboardFilters
): Promise<DashboardData> => {
  const params = getParams(filters);

  const [
    summary,
    timeSeries,
    severity,
    heatmap,
    casualty,
    weather,
    light,
    dangerous,
    roads,
    violations,
  ] = await Promise.all([
    API.get(`${SURAT_API_BASE}/summary`, { params }),
    API.get(`${SURAT_API_BASE}/time-series`, {
      params: { ...params, granularity: "month" },
    }),
    API.get(`${SURAT_API_BASE}/by-severity`, { params }),
    API.get(`${SURAT_API_BASE}/heatmap`, { params }),
    API.get(`${SURAT_API_BASE}/casualty-breakdown`, { params }),
    API.get(`${SURAT_API_BASE}/by-weather`, { params }),
    API.get(`${SURAT_API_BASE}/by-light`, { params }),
    API.get(`${SURAT_API_BASE}/top-dangerous`, { params }),
    API.get(`${SURAT_API_BASE}/by-road`, { params }),
    // by-collision returns collision_type; by-violation returns traffic_violation
    API.get(`${SURAT_API_BASE}/by-collision`, { params }),
  ]);

  return {
    summary: summary.data,
    timeSeries: timeSeries.data.data,
    severity: severity.data.data,
    districts: [],
    heatmap: heatmap.data.data,
    casualty: casualty.data.data,
    // Normalise weather: add a `name` alias expected by charts
    weather: weather.data.data.map((w: any) => ({
      ...w,
      name: w.weather_condition,
    })),
    // Normalise light: add a `name` alias expected by charts
    light: light.data.data.map((l: any) => ({
      ...l,
      name: l.light_condition,
    })),
    dangerous: dangerous.data.data,
    roads: roads.data.data,
    // by-collision returns collision_type; alias it to `name` for charts
    violations: violations.data.data.map((v: any) => ({
      ...v,
      name: v.collision_type,
    })),
  };
};

export const fetchTemporalAnalysis = async (
  filters: DashboardFilters
): Promise<TemporalAnalysisData> => {
  const params: Record<string, string | number> = {};

  if (hasValue(filters.district) && filters.district !== "Surat") {
    params.police_station = filters.district!;
  }
  if (hasValue(filters.year)) params.year = filters.year;
  if (hasValue(filters.month)) params.month = filters.month!;
  if (hasValue(filters.day)) params.day = filters.day!;
  if (hasValue(filters.time_period)) params.time_period = filters.time_period!;
  if (hasValue(filters.severity)) params.severity = filters.severity;
  if (hasValue(filters.weather_condition))
    params.weather_condition = filters.weather_condition;
  if (hasValue(filters.light_condition))
    params.light_condition = filters.light_condition;

  const { data } = await API.get(`${SURAT_API_BASE}/temporal-analysis`, {
    params,
  });
  return data;
};

export interface BlackspotData {
  total_crashes: number;
  total_blackspots: number;
  isolated_crashes: number;
  radius_m: number;
  min_crashes: number;
  circles: GeoJSON.FeatureCollection;
  centroids: GeoJSON.FeatureCollection;
}

export const fetchBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const { data } = await API.get(`${SURAT_API_BASE}/blackspots`, { params });
  return data;
};

export const fetchDbscanBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const { data } = await API.get(`${SURAT_API_BASE}/dbscan-blackspots`, {
    params,
  });
  return data;
};

export interface KdeHeatmapData {
  total_crashes: number;
  radius_m: number;
  pixel_m?: number;
  image: string | null;
  coordinates: [number, number][] | null;
  width?: number;
  height?: number;
}

export const fetchKdeHeatmap = async (
  filters: DashboardFilters
): Promise<KdeHeatmapData> => {
  const params = getParams(filters);
  const { data } = await API.get(`${SURAT_API_BASE}/kde-heatmap`, { params });
  return data;
};
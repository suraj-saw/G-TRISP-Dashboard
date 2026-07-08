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
const getParams = (filters: DashboardFilters): URLSearchParams => {
  const params = new URLSearchParams();

  // police_station replaces district for Surat-level granularity
  if (
    filters.district &&
    filters.district.length > 0 &&
    !filters.district.includes("Surat")
  ) {
    filters.district.forEach((d) => params.append("police_station", d));
  }

  if (filters.year && filters.year.length > 0) {
    filters.year.forEach((y) => params.append("year", y));
  }
  if (filters.severity && filters.severity.length > 0) {
    filters.severity.forEach((s) => params.append("severity", s));
  }
  if (filters.road_classification && filters.road_classification.length > 0) {
    filters.road_classification.forEach((r) =>
      params.append("road_classification", r)
    );
  }
  if (filters.weather_condition && filters.weather_condition.length > 0) {
    filters.weather_condition.forEach((w) =>
      params.append("weather_condition", w)
    );
  }
  if (filters.light_condition && filters.light_condition.length > 0) {
    filters.light_condition.forEach((l) => params.append("light_condition", l));
  }
  if (filters.collision_type && filters.collision_type.length > 0) {
    filters.collision_type.forEach((c) => params.append("collision_type", c));
  }

  // Date range filters
  if (filters.date_from) {
    params.set("date_from", filters.date_from);
  }
  if (filters.date_to) {
    params.set("date_to", filters.date_to);
  }

  return params;
};

const hasValue = (value?: string[]): boolean =>
  value !== undefined && value.length > 0;

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
      params: new URLSearchParams([
        ...params.entries(),
        ["granularity", "month"],
      ]),
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
  const params = new URLSearchParams();

  if (hasValue(filters.district) && !filters.district!.includes("Surat")) {
    filters.district!.forEach((d) => params.append("police_station", d));
  }
  if (hasValue(filters.year)) {
    filters.year!.forEach((y) => params.append("year", y));
  }
  if (hasValue(filters.month)) {
    filters.month!.forEach((m) => params.append("month", m));
  }
  if (hasValue(filters.day)) {
    filters.day!.forEach((d) => params.append("day", d));
  }
  if (hasValue(filters.time_period)) {
    filters.time_period!.forEach((t) => params.append("time_period", t));
  }
  if (hasValue(filters.severity)) {
    filters.severity!.forEach((s) => params.append("severity", s));
  }
  if (hasValue(filters.weather_condition)) {
    filters.weather_condition!.forEach((w) =>
      params.append("weather_condition", w)
    );
  }
  if (hasValue(filters.light_condition)) {
    filters.light_condition!.forEach((l) =>
      params.append("light_condition", l)
    );
  }
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);

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

export const fetchPedestrianBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const { data } = await API.get(`${SURAT_API_BASE}/pedestrian-blackspots`, {
    params,
  });
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
  pixel_m: number;
  max_density: number;
  sample_stride: number;
  data: GeoJSON.FeatureCollection;
  width: number;
  height: number;
}

export const fetchKdeHeatmap = async (
  filters: DashboardFilters
): Promise<KdeHeatmapData> => {
  const params = getParams(filters);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${SURAT_API_BASE}/kde-heatmap`, { params });
  return data;
};

export const fetchWeightedKdeHeatmap = async (
  filters: DashboardFilters
): Promise<KdeHeatmapData> => {
  const params = getParams(filters);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${SURAT_API_BASE}/weighted-kde-heatmap`, { params });
  return data;
};

/**
 * @file dashboardApi.ts
 * @description API client for fetching road accident data specific to the Surat district.
 * Handles the serialization of dashboard filters into query parameters and manages
 * calls to the Surat-scoped backend endpoints, including advanced GIS features
 * like Blackspot clustering and KDE Heatmaps.
 * 
 * Main Responsibilities:
 * - Map frontend `DashboardFilters` to Surat backend query parameters.
 * - Aggregate responses for the main dashboard views (`fetchDashboardData`).
 * - Expose endpoints for DBSCAN, Greedy Blackspots, and KDE spatial analysis.
 * 
 * Important Dependencies:
 * - API (from ./axios): Configured Axios instance for network requests.
 * - SURAT_API_BASE: Constant defining the base route for Surat endpoints.
 */

import API from "./axios";
import { SURAT_API_BASE, GUJARAT_API_BASE } from "../config/constants";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
  TemporalAnalysisData,
  SnappedHeatmapPoint,
} from "../types/dashboard";

// ---------------------------------------------------------------------------
// Parameter builders
// ---------------------------------------------------------------------------

/**
 * Converts dashboard filter state into query-string parameters for the
 * Surat dashboard endpoints.
 * 
 * Business Rules:
 * - "all" or "Surat" are treated as sentinel values indicating "no filter" (statewide/district-wide).
 * - For Surat-level granularity, the generic `district` filter array is mapped 
 *   to `police_station` query parameters since the root scope is already Surat.
 * 
 * @param filters - The current state of user-selected filters.
 * @returns URLSearchParams populated with the active filters.
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

/**
 * Helper to check if a filter value exists and has elements.
 */
const hasValue = (value?: string[]): boolean =>
  value !== undefined && value.length > 0;

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const requestCache = new Map<string, Promise<any>>();

function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (requestCache.has(key)) {
    return requestCache.get(key) as Promise<T>;
  }
  const promise = fetcher().catch((err) => {
    requestCache.delete(key);
    throw err;
  });
  requestCache.set(key, promise);
  return promise;
}

/**
 * Fetch filter options for the Surat dashboard.
 */
export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const { data } = await API.get(`${SURAT_API_BASE}/filter-options`);
  return data;
};

/**
 * Fetch main dashboard data for the Surat dashboard view.
 * 
 * Performance Considerations:
 * Utilizes `Promise.all` to concurrently fetch data from 10 distinct aggregation endpoints.
 * This parallelization is crucial to minimize loading times. The responses are then
 * normalized (e.g., aliasing properties to `name` for charting libraries) and merged
 * into a single comprehensive `DashboardData` object.
 * 
 * @param filters Dashboard filter state
 * @returns An aggregated object containing summaries, trends, and categorical breakdowns.
 */
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

/**
 * Fetch temporal analysis data for Surat.
 * Converts filters into URL params specifically formatted for temporal trend endpoints.
 * 
 * @param filters Dashboard filter state
 * @returns Temporal aggregation metrics (monthly, daily, hourly, seasonality).
 */
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

/**
 * Fetch snapped accidents data for Surat (Network Validation)
 * Uses the same filtering logic as other dashboard endpoints.
 * 
 * @param filters Dashboard filter state
 * @returns Snapped accidents data
 */
export const fetchSnappedAccidents = async (
  filters: DashboardFilters
): Promise<{ total: number; data: SnappedHeatmapPoint[] }> => {
  const params = getParams(filters);
  const { data } = await API.get(`${SURAT_API_BASE}/snapped-accidents`, { params });
  return data;
};

/**
 * Response shape for blackspot (accident cluster) data.
 * Used for both Greedy and DBSCAN clustering algorithms.
 */
export interface BlackspotData {
  /** Total number of crashes analyzed */
  total_crashes: number;
  /** Number of distinct blackspots (clusters) identified */
  total_blackspots: number;
  /** Number of crashes that did not fall into any cluster */
  isolated_crashes: number;
  /** The spatial search radius used for clustering (in meters) */
  radius_m: number;
  /** Minimum number of crashes required to form a cluster */
  min_crashes: number;
  /** GeoJSON representing the buffer zones of the clusters */
  circles: GeoJSON.FeatureCollection;
  /** GeoJSON representing the central point of each cluster */
  centroids: GeoJSON.FeatureCollection;
}

/**
 * Fetch greedy blackspots for Surat.
 * @param filters Dashboard filter state
 */
export const fetchBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `blackspots_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${SURAT_API_BASE}/blackspots`, { params });
    return data;
  });
};

/**
 * Fetch pedestrian-focused greedy blackspots for Surat.
 * @param filters Dashboard filter state
 */
export const fetchPedestrianBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `pedestrian_blackspots_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${SURAT_API_BASE}/pedestrian-blackspots`, {
      params,
    });
    return data;
  });
};

/**
 * Fetch DBSCAN-based blackspots for Surat.
 * @param filters Dashboard filter state
 */
export const fetchDbscanBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `dbscan_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${SURAT_API_BASE}/dbscan-blackspots`, {
      params,
    });
    return data;
  });
};

/**
 * Fetch pedestrian-focused DBSCAN-based blackspots for Surat.
 * @param filters Dashboard filter state
 */
export const fetchPedestrianDbscanBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `pedestrian_dbscan_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(
      `${SURAT_API_BASE}/pedestrian-dbscan-blackspots`,
      {
        params,
      }
    );
    return data;
  });
};

/**
 * Fetch IRC Greedy Blackspots (Gujarat-wide or filtered).
 * @param filters Dashboard filter state
 */
export const fetchIrcGreedyBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `irc_greedy_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/irc-greedy-blackspots`, { params });
    return data;
  });
};

/**
 * Fetch IRC Grid Blackspots (Gujarat-wide or filtered).
 * @param filters Dashboard filter state
 */
export const fetchIrcGridBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `irc_grid_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/irc-grid-blackspots`, { params });
    return data;
  });
};

/**
 * Fetch Pedestrian IRC Greedy Blackspots
 * @param filters Dashboard filter state
 */
export const fetchPedestrianIrcGreedyBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `pedestrian_irc_greedy_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/pedestrian-irc-greedy-blackspots`, { params });
    return data;
  });
};

/**
 * Fetch Pedestrian IRC Grid Blackspots
 * @param filters Dashboard filter state
 */
export const fetchPedestrianIrcGridBlackspots = async (
  filters: DashboardFilters
): Promise<BlackspotData> => {
  const params = getParams(filters);
  const cacheKey = `pedestrian_irc_grid_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/pedestrian-irc-grid-blackspots`, { params });
    return data;
  });
};

/**
 * Fetch Network-constrained Blackspots
 */
export const fetchNetworkBlackspots = async (
  filters: DashboardFilters
): Promise<any> => {
  const params = getParams(filters);
  const cacheKey = `network_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/network-blackspots`, { params });
    return data;
  });
};

/**
 * Fetch Pedestrian Network-constrained Blackspots
 */
export const fetchPedestrianNetworkBlackspots = async (
  filters: DashboardFilters
): Promise<any> => {
  const params = getParams(filters);
  params.set("is_pedestrian", "true");
  const cacheKey = `pedestrian_network_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/network-blackspots`, { params });
    return data;
  });
};

/**
 * Download CSV file of crashes associated with specific blackspots.
 * @param crashIds List of accident IDs
 * @param filename Desired filename for the download
 */
export const exportBlackspotCrashes = async (
  crashIds: string[],
  filename: string
): Promise<void> => {
  const response = await API.post(
    `${SURAT_API_BASE}/export-crashes`,
    { crash_ids: crashIds, filename },
    { responseType: "blob" }
  );

  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Response shape for Kernel Density Estimation (KDE) heatmap data.
 * Represents spatial density of accidents using continuous color gradients.
 */
export interface KdeHeatmapData {
  /** Total number of crashes analyzed for density */
  total_crashes: number;
  /** The bandwidth/radius used for the KDE calculation (in meters) */
  radius_m: number;
  /** Spatial resolution of the generated grid (in meters) */
  pixel_m: number;
  /** The highest density value found in the heatmap */
  max_density: number;
  /** Sampling stride used during computation (for performance) */
  sample_stride: number;
  /** GeoJSON FeatureCollection containing the density polygons/points */
  data: GeoJSON.FeatureCollection;
  /** Number of grid cells along the X axis */
  width: number;
  /** Number of grid cells along the Y axis */
  height: number;
}

/**
 * Fetch unweighted KDE heatmap data for Surat.
 * @param filters Dashboard filter state
 */
export const fetchKdeHeatmap = async (
  filters: DashboardFilters
): Promise<KdeHeatmapData> => {
  const params = getParams(filters);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const cacheKey = `kde_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${SURAT_API_BASE}/kde-heatmap`, { params });
    return data;
  });
};

/**
 * Fetch severity-weighted KDE heatmap data for Surat.
 * @param filters Dashboard filter state
 */
export const fetchWeightedKdeHeatmap = async (
  filters: DashboardFilters
): Promise<KdeHeatmapData> => {
  const params = getParams(filters);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const cacheKey = `weighted_kde_${params.toString()}`;
  return withCache(cacheKey, async () => {
    const { data } = await API.get(`${SURAT_API_BASE}/weighted-kde-heatmap`, {
      params,
    });
    return data;
  });
};

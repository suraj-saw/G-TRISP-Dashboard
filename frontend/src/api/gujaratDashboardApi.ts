/**
 * @file gujaratDashboardApi.ts
 * @description Provides a comprehensive set of API client functions for fetching 
 * road accident data from the backend. Serves as the primary data layer for the 
 * Gujarat Dashboard and all its sub-views (Overview, Spatial, Temporal, etc.).
 * 
 * Main Responsibilities:
 * - Serialize dashboard filters into URL search parameters.
 * - Make asynchronous HTTP GET/POST requests via the custom Axios instance.
 * - Aggregate complex dashboard queries (e.g., fetchGujaratDashboardData).
 * - Define TypeScript interfaces for API request filters and response structures.
 * 
 * Important Dependencies:
 * - API (from ./axios): Pre-configured Axios instance for HTTP requests.
 * - GUJARAT_API_BASE: Constant defining the base route for these endpoints.
 */

// frontend/src/api/gujaratDashboardApi.ts
import API from "./axios";
import { GUJARAT_API_BASE } from "../config/constants";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
  TemporalAnalysisData,
  SummaryData,
  SeverityCount,
  DangerousDistrict,
} from "../types/dashboard";
import type { BlackspotData, KdeHeatmapData } from "./dashboardApi";

/**
 * Helper utility to serialize standard DashboardFilters and district scoping
 * into URLSearchParams for GET requests.
 * 
 * Complex Logic: 
 * Iterates through array-based filters (e.g., year, severity) and appends multiple
 * keys with the same name, which standardizes how the backend parses 'IN' clauses.
 * 
 * @param filters - Dashboard filter options selected by the user
 * @param district - District name to scope the query (empty string for state-wide)
 * @returns URLSearchParams object ready to be attached to an Axios GET request
 */
function getParams(
  filters: DashboardFilters,
  district: string
): URLSearchParams {
  const params = new URLSearchParams();
  if (district) params.append("district", district);

  if (filters.year?.length)
    filters.year.forEach((y) => params.append("year", y));
  if (filters.severity?.length)
    filters.severity.forEach((s) => params.append("severity", s));
  if (filters.road_classification?.length)
    filters.road_classification.forEach((r) =>
      params.append("road_classification", r)
    );
  if (filters.weather_condition?.length)
    filters.weather_condition.forEach((w) =>
      params.append("weather_condition", w)
    );
  if (filters.light_condition?.length)
    filters.light_condition.forEach((l) => params.append("light_condition", l));
  if (filters.collision_type?.length)
    filters.collision_type.forEach((c) => params.append("collision_type", c));
  // NEW
  if (filters.police_station?.length)
    filters.police_station.forEach((p) => params.append("police_station", p));
  if (filters.taluka?.length)
    filters.taluka.forEach((t) => params.append("taluka", t));

  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);

  return params;
}

/**
 * Fetch available filter options for Gujarat-wide dashboard
 * @param district - Optional district to scope the filter options
 * @returns Filter options object
 */
export const fetchGujaratFilterOptions = async (
  district?: string
): Promise<FilterOptions> => {
  const params = new URLSearchParams();
  if (district) params.append("district", district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/filter-options`, {
    params,
  });
  return data;
};

/**
 * Single district summary row for choropleth map
 */
export interface DistrictSummaryRow {
  /** District name */
  district: string;
  /** Number of accidents in this district */
  accident_count: number;
  /** Number of fatalities in this district */
  fatalities: number;
}

/**
 * Fetch district summary data for Gujarat overview choropleth map
 * @returns Array of district summary rows
 */
export const fetchGujaratDistrictSummary = async (): Promise<
  DistrictSummaryRow[]
> => {
  const { data } = await API.get(`${GUJARAT_API_BASE}/by-district`);
  return data.data;
};

/**
 * Fetch complete dashboard data for the main Gujarat dashboard view.
 * 
 * Performance Considerations:
 * This orchestrates 10 parallel API calls using `Promise.all` to fetch all necessary
 * chart data simultaneously. It then merges the responses into a single `DashboardData`
 * object. This approach minimizes total round-trip time for initial dashboard loads.
 * 
 * @param filters - Active dashboard filters applied globally
 * @param district - District string to restrict data scope
 * @returns Complete dashboard data structure mapping to all sub-components
 */
export const fetchGujaratDashboardData = async (
  filters: DashboardFilters,
  district: string
): Promise<DashboardData> => {
  const params = getParams(filters, district);

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
    API.get(`${GUJARAT_API_BASE}/summary`, { params }),
    API.get(`${GUJARAT_API_BASE}/time-series`, {
      params: new URLSearchParams([
        ...params.entries(),
        ["granularity", "month"],
      ]),
    }),
    API.get(`${GUJARAT_API_BASE}/by-severity`, { params }),
    API.get(`${GUJARAT_API_BASE}/heatmap`, { params }),
    API.get(`${GUJARAT_API_BASE}/casualty-breakdown`, { params }),
    API.get(`${GUJARAT_API_BASE}/by-weather`, { params }),
    API.get(`${GUJARAT_API_BASE}/by-light`, { params }),
    API.get(`${GUJARAT_API_BASE}/top-dangerous`, { params }),
    API.get(`${GUJARAT_API_BASE}/by-road`, { params }),
    API.get(`${GUJARAT_API_BASE}/by-collision`, { params }),
  ]);

  return {
    summary: summary.data,
    timeSeries: timeSeries.data.data,
    severity: severity.data.data,
    districts: [],
    heatmap: heatmap.data.data,
    casualty: casualty.data.data,
    weather: weather.data.data.map((w: any) => ({
      ...w,
      name: w.weather_condition,
    })),
    light: light.data.data.map((l: any) => ({ ...l, name: l.light_condition })),
    dangerous: dangerous.data.data,
    roads: roads.data.data,
    violations: violations.data.data.map((v: any) => ({
      ...v,
      name: v.collision_type,
    })),
  };
};

/**
 * Fetch temporal analysis data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Temporal analysis data structure
 */
export const fetchGujaratTemporalAnalysis = async (
  filters: DashboardFilters,
  district: string
): Promise<TemporalAnalysisData> => {
  const params = getParams(filters, district);
  if (filters.month?.length)
    filters.month.forEach((m) => params.append("month", m));
  if (filters.day?.length) filters.day.forEach((d) => params.append("day", d));
  if (filters.time_period?.length)
    filters.time_period.forEach((t) => params.append("time_period", t));

  const { data } = await API.get(`${GUJARAT_API_BASE}/temporal-analysis`, {
    params,
  });
  return data;
};

/**
 * Fetch greedy blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/blackspots`, { params });
  return data;
};

/**
 * Fetch snapped accidents data for Gujarat (Network Validation)
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Snapped accidents data
 */
export const fetchGujaratSnappedAccidents = async (
  filters: DashboardFilters,
  district: string
) => {
  const params = getParams(filters, district);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${GUJARAT_API_BASE}/snapped-accidents`, { params });
  return data;
};

/**
 * Fetch greedy pedestrian blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratPedestrianBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/pedestrian-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch DBSCAN blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratDbscanBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/dbscan-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch DBSCAN pedestrian blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratPedestrianDbscanBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(
    `${GUJARAT_API_BASE}/pedestrian-dbscan-blackspots`,
    { params }
  );
  return data;
};

/**
 * Fetch IRC Greedy blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratIrcGreedyBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/irc-greedy-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch IRC Grid blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratIrcGridBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/irc-grid-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch Pedestrian IRC Greedy blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratPedestrianIrcGreedyBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/pedestrian-irc-greedy-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch Pedestrian IRC Grid blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns Blackspot data structure
 */
export const fetchGujaratPedestrianIrcGridBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/pedestrian-irc-grid-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch Network-constrained blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns GeoJSON FeatureCollection of segments
 */
export const fetchGujaratNetworkBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<any> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/network-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch Pedestrian Network-constrained blackspot data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns GeoJSON FeatureCollection of segments
 */
export const fetchGujaratPedestrianNetworkBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<any> => {
  const params = getParams(filters, district);
  params.set("is_pedestrian", "true");
  const { data } = await API.get(`${GUJARAT_API_BASE}/network-blackspots`, {
    params,
  });
  return data;
};

/**
 * Fetch KDE heatmap data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns KDE heatmap data structure
 */
export const fetchGujaratKdeHeatmap = async (
  filters: DashboardFilters,
  district: string
): Promise<KdeHeatmapData> => {
  const params = getParams(filters, district);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${GUJARAT_API_BASE}/kde-heatmap`, { params });
  return data;
};

/**
 * Fetch weighted KDE heatmap data for Gujarat
 * @param filters - Dashboard filter options
 * @param district - District to scope the data
 * @returns KDE heatmap data structure
 */
export const fetchGujaratWeightedKdeHeatmap = async (
  filters: DashboardFilters,
  district: string
): Promise<KdeHeatmapData> => {
  const params = getParams(filters, district);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${GUJARAT_API_BASE}/weighted-kde-heatmap`, {
    params,
  });
  return data;
};

/**
 * Export blackspot crash data as CSV
 * @param crashIds - Array of crash IDs to export
 * @param filename - Filename for the downloaded CSV
 */
export const exportGujaratBlackspotCrashes = async (
  crashIds: string[],
  filename: string
): Promise<void> => {
  const response = await API.post(
    `${GUJARAT_API_BASE}/export-crashes`,
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
 * Lightweight Gujarat overview insights data
 */
export interface GujaratOverviewInsights {
  /** Summary statistics */
  summary: SummaryData;
  /** Severity breakdown */
  severity: SeverityCount[];
  /** Dangerous districts ranking */
  dangerous: DangerousDistrict[];
}

/**
 * Lightweight statewide summary for the Gujarat overview landing page.
 * 
 * Performance Optimization / Complex Logic:
 * Unlike `fetchGujaratDashboardData()`, this intentionally SKIPS the heavy endpoints 
 * (heatmap, casualty, road, collision, and time-series). Those endpoints scan and aggregate
 * every accident row statewide which is too slow for the initial landing view. 
 * Instead, only 3 small, highly-aggregated queries are made to populate the top KPIs.
 * 
 * @returns Gujarat overview insights data (summary, severity breakdown, dangerous districts)
 */
export const fetchGujaratOverviewInsights =
  async (): Promise<GujaratOverviewInsights> => {
    const emptyParams = new URLSearchParams();
    const topNParams = new URLSearchParams([["top_n", "6"]]);

    const [summary, severity, dangerous] = await Promise.all([
      API.get(`${GUJARAT_API_BASE}/summary`, { params: emptyParams }),
      API.get(`${GUJARAT_API_BASE}/by-severity`, { params: emptyParams }),
      API.get(`${GUJARAT_API_BASE}/top-dangerous`, { params: topNParams }),
    ]);

    return {
      summary: summary.data,
      severity: severity.data.data,
      dangerous: dangerous.data.data,
    };
  };

/**
 * Generic named count data structure
 */
export interface NamedCount {
  /** Display label */
  label: string;
  /** Count value */
  count: number;
}

/**
 * Detailed district insight data
 */
export interface DistrictInsight {
  /** District name */
  district: string;
  /** Total number of accidents */
  total_accidents: number;
  /** Number of fatal accidents */
  fatal_accidents: number;
  /** Number of fatalities */
  fatalities: number;
  /** Number of grievous injuries */
  grievous_injuries: number;
  /** Number of minor injuries */
  minor_injuries: number;
  /** Fatality rate percentage */
  fatality_rate: number;
  /** Number of police stations covered */
  police_stations: number;
  /** Most affected police station */
  most_affected_police_station: string;
  /** Highest accident month */
  highest_accident_month: string;
  /** Peak accident time */
  peak_accident_time: string;
  /** Number of blackspots */
  blackspots_count: number;
  /** Risk level */
  risk_level: "Low" | "Moderate" | "High" | "Very High";
  /** Severity breakdown */
  severity: NamedCount[];
  /** Monthly trend data */
  monthly_trend: {
    /** Year */
    year: number;
    /** Month (1-12) */
    month: number;
    /** Human-readable month label */
    month_label: string;
    /** Number of accidents */
    count: number;
  }[];
  /** Time of day distribution */
  time_of_day: NamedCount[];
  /** Weekday distribution */
  weekday: NamedCount[];
  /** Road type breakdown */
  road_type: NamedCount[];
  /** Collision type breakdown */
  collision_type: NamedCount[];
}

/**
 * Gujarat-wide summary data
 */
export interface GujaratWideSummary {
  /** Total number of accidents */
  total_accidents: number;
  /** Total number of fatalities */
  total_fatalities: number;
  /** Total number of grievous injuries */
  total_grievous: number;
  /** Total number of minor injuries */
  total_minor: number;
  /** Number of districts covered */
  districts_covered: number;
  /** Number of police stations covered */
  police_stations: number;
  /** Severity breakdown */
  severity: NamedCount[];
  /** Dangerous districts ranking */
  dangerous: {
    /** District name */
    district: string;
    /** Number of fatal accidents */
    fatal_accidents: number;
    /** Total number of people killed */
    total_killed: number;
  }[];
}

/**
 * District insights response structure
 */
export interface DistrictInsightsResponse {
  /** Gujarat-wide summary */
  gujarat: GujaratWideSummary;
  /** District-specific insights keyed by district name */
  districts: Record<string, DistrictInsight>;
}

/**
 * Fetch district insights data
 * @returns District insights response
 */
export const fetchDistrictInsights =
  async (): Promise<DistrictInsightsResponse> => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/district-insights`);
    return data;
  };

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Filter options for district stats API
 */
export interface DistrictStatsFilters {
  /** District name to scope the query */
  district?: string;
  /** Years to include */
  year?: string[];
  /** Start date for the filter */
  startDate?: string;
  /** End date for the filter */
  endDate?: string;
  /** Severity levels to include */
  severity?: string[];
  /** Talukas to include */
  taluka?: string[];
  /** Police stations to include */
  policeStation?: string[];
  /** Road classifications to include */
  roadClassification?: string[];
  /** Weather conditions to include */
  weatherCondition?: string[];
  /** Light conditions to include */
  lightCondition?: string[];
  /** Collision types to include */
  collisionType?: string[];
}

/**
 * Severity breakdown entry
 */
export interface SeverityBreakdown {
  /** Severity label */
  label: string;
  /** Count of accidents with this severity */
  count: number;
  /** Percentage of total accidents */
  percentage: number;
}

/**
 * Monthly trend entry
 */
export interface MonthlyTrend {
  /** Month label */
  month: string;
  /** Number of accidents */
  accidents: number;
  /** Number of fatal accidents */
  fatal: number;
}

/**
 * Hourly distribution entry
 */
export interface HourlyDistribution {
  /** Hour of the day (0-23) */
  hour: number;
  /** Number of accidents */
  accidents: number;
}

/**
 * Road type breakdown entry
 */
export interface RoadTypeBreakdown {
  /** Road type name */
  road_type: string;
  /** Number of accidents */
  count: number;
}

/**
 * District stats data structure for statistical analysis
 */
export interface DistrictStats {
  /** Total number of accidents */
  total_accidents: number;
  /** Total number of fatalities */
  total_fatalities: number;
  /** Total number of injuries */
  total_injuries: number;
  /** Average accidents per month */
  avg_per_month: number;
  /** Peak accident hour (0-23) */
  peak_hour: number | null;
  /** Year-over-year change percentage */
  yoy_change: number | null;
  /** Severity breakdown */
  severity_breakdown: SeverityBreakdown[];
  /** Road type breakdown */
  road_type_breakdown: RoadTypeBreakdown[];
  /** Collision type breakdown (optional) */
  collision_type_breakdown?: { label: string; count: number }[];
  /** Collision nature breakdown (optional) */
  collision_nature_breakdown?: { label: string; count: number }[];
  /** Weather condition breakdown (optional) */
  weather_breakdown?: { label: string; count: number }[];
  /** Light condition breakdown (optional) */
  light_breakdown?: { label: string; count: number }[];
  /** Vehicle involvement breakdown (optional) */
  vehicle_involvement_breakdown?: { label: string; count: number }[];
  /** Victim composition breakdown (optional) */
  victim_composition?: {
    /** Victim type */
    type: string;
    /** Number of fatalities */
    Killed: number;
    /** Number of grievous injuries */
    "Grievous Injury": number;
    /** Number of minor injuries */
    "Minor Injury": number;
  }[];
  /** Visibility breakdown (optional) */
  visibility_breakdown?: { label: string; count: number }[];
  /** Statistical insights (optional) */
  statistical_insights?: string[];
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Fetch pre-aggregated statistical data for the Statistical Analysis tab.
 * Backend endpoint: GET /api/gujarat-dashboard/district-stats
 * Accepts optional district for single district, or none for Gujarat-wide
 * @param filters - Filter options for district stats
 * @returns District stats data
 */
export async function getDistrictStats(
  filters: DistrictStatsFilters
): Promise<DistrictStats> {
  const params = new URLSearchParams();
  if (filters.district) params.set("district", filters.district);
  if (filters.startDate) params.set("date_from", filters.startDate);
  if (filters.endDate) params.set("date_to", filters.endDate);

  const listFilters: [string, string[] | undefined][] = [
    ["year", filters.year],
    ["severity", filters.severity],
    ["taluka", filters.taluka],
    ["police_station", filters.policeStation],
    ["road_classification", filters.roadClassification],
    ["weather_condition", filters.weatherCondition],
    ["light_condition", filters.lightCondition],
    ["collision_type", filters.collisionType],
  ];
  listFilters.forEach(([key, values]) =>
    values?.forEach((value) => params.append(key, value))
  );

  const response = await API.get<DistrictStats>(
    `${GUJARAT_API_BASE}/district-stats`,
    { params }
  );
  return response.data;
}

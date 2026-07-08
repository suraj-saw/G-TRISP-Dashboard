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
 * Query params for the Gujarat-wide endpoints, always scoped to a single
 * district (the one currently being drilled into).
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

// Update to accept a district scope
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

export interface DistrictSummaryRow {
  district: string;
  accident_count: number;
  fatalities: number;
}

/** Powers the choropleth on the Gujarat overview map. */
export const fetchGujaratDistrictSummary = async (): Promise<
  DistrictSummaryRow[]
> => {
  const { data } = await API.get(`${GUJARAT_API_BASE}/by-district`);
  return data.data;
};

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

export const fetchGujaratBlackspots = async (
  filters: DashboardFilters,
  district: string
): Promise<BlackspotData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/blackspots`, { params });
  return data;
};

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

export const fetchGujaratWeightedKdeHeatmap = async (
  filters: DashboardFilters,
  district: string
): Promise<KdeHeatmapData> => {
  const params = getParams(filters, district);
  if (filters.visualization_variant === "pedestrian") {
    params.append("is_pedestrian", "true");
  }
  const { data } = await API.get(`${GUJARAT_API_BASE}/weighted-kde-heatmap`, { params });
  return data;
};

export interface GujaratOverviewInsights {
  summary: SummaryData;
  severity: SeverityCount[];
  dangerous: DangerousDistrict[];
}

/**
 * Lightweight statewide summary for the Gujarat overview landing page.
 * Unlike fetchGujaratDashboardData(), this intentionally SKIPS the heatmap,
 * casualty, road, collision and time-series endpoints — those scan/return
 * every accident row statewide and are far too heavy for a landing view.
 * Only 3 small aggregate queries are made.
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

export interface NamedCount {
  label: string;
  count: number;
}

export interface DistrictInsight {
  district: string;
  total_accidents: number;
  fatal_accidents: number;
  fatalities: number;
  grievous_injuries: number;
  minor_injuries: number;
  fatality_rate: number;
  police_stations: number;
  most_affected_police_station: string;
  highest_accident_month: string;
  peak_accident_time: string;
  blackspots_count: number;
  risk_level: "Low" | "Moderate" | "High" | "Very High";
  severity: NamedCount[];
  monthly_trend: {
    year: number;
    month: number;
    month_label: string;
    count: number;
  }[];
  time_of_day: NamedCount[];
  weekday: NamedCount[];
  road_type: NamedCount[];
  collision_type: NamedCount[];
}

export interface GujaratWideSummary {
  total_accidents: number;
  total_fatalities: number;
  total_grievous: number;
  total_minor: number;
  districts_covered: number;
  police_stations: number;
  severity: NamedCount[];
  dangerous: {
    district: string;
    fatal_accidents: number;
    total_killed: number;
  }[];
}

export interface DistrictInsightsResponse {
  gujarat: GujaratWideSummary;
  districts: Record<string, DistrictInsight>;
}

export const fetchDistrictInsights =
  async (): Promise<DistrictInsightsResponse> => {
    const { data } = await API.get(`${GUJARAT_API_BASE}/district-insights`);
    return data;
  };


// ─── Types ───────────────────────────────────────────────────────────────────
 
export interface DistrictStatsFilters {
  district: string;
  year?: string[];
  startDate?: string;
  endDate?: string;
  severity?: string[];
  taluka?: string[];
  policeStation?: string[];
  roadClassification?: string[];
  weatherCondition?: string[];
  lightCondition?: string[];
  collisionType?: string[];
}
 
export interface SeverityBreakdown {
  label: string;
  count: number;
  percentage: number;
}
 
export interface MonthlyTrend {
  month: string;
  accidents: number;
  fatal: number;
}
 
export interface HourlyDistribution {
  hour: number;
  accidents: number;
}
 
export interface RoadTypeBreakdown {
  road_type: string;
  count: number;
}
 
export interface DistrictStats {
  total_accidents: number;
  total_fatalities: number;
  total_injuries: number;
  avg_per_month: number;
  peak_hour: number | null;
  yoy_change: number | null;
  severity_breakdown: SeverityBreakdown[];
  road_type_breakdown: RoadTypeBreakdown[];
  collision_type_breakdown?: { label: string; count: number }[];
  collision_nature_breakdown?: { label: string; count: number }[];
  weather_breakdown?: { label: string; count: number }[];
  light_breakdown?: { label: string; count: number }[];
  vehicle_involvement_breakdown?: { label: string; count: number }[];
  victim_composition?: {
    type: string;
    Killed: number;
    "Grievous Injury": number;
    "Minor Injury": number;
  }[];
  visibility_breakdown?: { label: string; count: number }[];
  statistical_insights?: string[];
}

// ─── API call ─────────────────────────────────────────────────────────────────

/**
 * Fetch pre-aggregated statistical data for the Statistical Analysis tab.
 * Backend endpoint: GET /api/district-stats/{district_slug}
 */
export async function getDistrictStats(
  filters: DistrictStatsFilters
): Promise<DistrictStats> {
  const params = new URLSearchParams({ district: filters.district });
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

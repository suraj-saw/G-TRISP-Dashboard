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
function getParams(filters: DashboardFilters, district: string): URLSearchParams {
  const params = new URLSearchParams();
  if (district) params.append("district", district);

  if (filters.year?.length) filters.year.forEach((y) => params.append("year", y));
  if (filters.severity?.length) filters.severity.forEach((s) => params.append("severity", s));
  if (filters.road_classification?.length)
    filters.road_classification.forEach((r) => params.append("road_classification", r));
  if (filters.weather_condition?.length)
    filters.weather_condition.forEach((w) => params.append("weather_condition", w));
  if (filters.light_condition?.length)
    filters.light_condition.forEach((l) => params.append("light_condition", l));
  if (filters.collision_type?.length)
    filters.collision_type.forEach((c) => params.append("collision_type", c));
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);

  return params;
}

export const fetchGujaratFilterOptions = async (): Promise<FilterOptions> => {
  const { data } = await API.get(`${GUJARAT_API_BASE}/filter-options`);
  return data;
};

export interface DistrictSummaryRow {
  district: string;
  accident_count: number;
  fatalities: number;
}

/** Powers the choropleth on the Gujarat overview map. */
export const fetchGujaratDistrictSummary = async (): Promise<DistrictSummaryRow[]> => {
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
      params: new URLSearchParams([...params.entries(), ["granularity", "month"]]),
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
    weather: weather.data.data.map((w: any) => ({ ...w, name: w.weather_condition })),
    light: light.data.data.map((l: any) => ({ ...l, name: l.light_condition })),
    dangerous: dangerous.data.data,
    roads: roads.data.data,
    violations: violations.data.data.map((v: any) => ({ ...v, name: v.collision_type })),
  };
};

export const fetchGujaratTemporalAnalysis = async (
  filters: DashboardFilters,
  district: string
): Promise<TemporalAnalysisData> => {
  const params = getParams(filters, district);
  if (filters.month?.length) filters.month.forEach((m) => params.append("month", m));
  if (filters.day?.length) filters.day.forEach((d) => params.append("day", d));
  if (filters.time_period?.length)
    filters.time_period.forEach((t) => params.append("time_period", t));

  const { data } = await API.get(`${GUJARAT_API_BASE}/temporal-analysis`, { params });
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
  const { data } = await API.get(`${GUJARAT_API_BASE}/dbscan-blackspots`, { params });
  return data;
};

export const fetchGujaratKdeHeatmap = async (
  filters: DashboardFilters,
  district: string
): Promise<KdeHeatmapData> => {
  const params = getParams(filters, district);
  const { data } = await API.get(`${GUJARAT_API_BASE}/kde-heatmap`, { params });
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
export const fetchGujaratOverviewInsights = async (): Promise<GujaratOverviewInsights> => {
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

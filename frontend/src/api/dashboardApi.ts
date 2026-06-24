import API from "./axios";
import type {
  DashboardFilters,
  FilterOptions,
  DashboardData,
  TemporalAnalysisData,
} from "../types/dashboard";

const getParams = (filters: DashboardFilters) => {
  const params: Record<string, string | number> = {};
  if (filters.district && filters.district !== "all" && filters.district !== "Surat") {
    // If the district filter is used for police_station in Surat mode
    params.police_station = filters.district;
  }
  if (filters.year !== "all") params.year = filters.year;
  if (filters.severity !== "all") params.severity = filters.severity;
  if (filters.road_classification !== "all") params.road_classification = filters.road_classification;
  if (filters.weather_condition !== "all") params.weather_condition = filters.weather_condition;
  if (filters.light_condition !== "all") params.light_condition = filters.light_condition;
  if (filters.collision_type !== "all") params.collision_type = filters.collision_type;
  return params;
};

export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const { data } = await API.get("/surat/dashboard/filter-options");
  return data;
};

export const fetchDashboardData = async (filters: DashboardFilters): Promise<DashboardData> => {
  const params = getParams(filters);

  const [
    summary, timeSeries, severity, heatmap,
    casualty, weather, light, dangerous, roads, violations
  ] = await Promise.all([
    API.get("/surat/dashboard/summary", { params }),
    API.get("/surat/dashboard/time-series", { params: { ...params, granularity: "month" } }),
    API.get("/surat/dashboard/by-severity", { params }),
    API.get("/surat/dashboard/heatmap", { params }),
    API.get("/surat/dashboard/casualty-breakdown", { params }),
    API.get("/surat/dashboard/by-weather", { params }),
    API.get("/surat/dashboard/by-light", { params }),
    API.get("/surat/dashboard/top-dangerous", { params }),
    API.get("/surat/dashboard/by-road", { params }),
    API.get("/surat/dashboard/by-collision", { params }),
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

export const fetchTemporalAnalysis = async (
  filters: DashboardFilters
): Promise<TemporalAnalysisData> => {
  const params: Record<string, string | number> = {};

  const hasValue = (value?: string) =>
    value !== undefined && value !== "" && value !== "all";

  if (hasValue(filters.district) && filters.district !== "Surat") {
    params.police_station = filters.district;
  }
  if (hasValue(filters.year)) params.year = filters.year;
  if (hasValue(filters.month)) params.month = filters.month!;
  if (hasValue(filters.day)) params.day = filters.day!;
  if (hasValue(filters.time_period)) params.time_period = filters.time_period!;
  if (hasValue(filters.severity)) params.severity = filters.severity;
  if (hasValue(filters.weather_condition)) {
    params.weather_condition = filters.weather_condition;
  }
  if (hasValue(filters.light_condition)) {
    params.light_condition = filters.light_condition;
  }

  const { data } = await API.get("/surat/dashboard/temporal-analysis", {
    params,
  });

  return data;
};

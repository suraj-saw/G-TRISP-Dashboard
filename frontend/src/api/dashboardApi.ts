import API from "./axios";
import type { DashboardFilters, FilterOptions, DashboardData } from "../types/dashboard";

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

import API from "./axios";
import type { DashboardFilters, FilterOptions, DashboardData } from "../types/dashboard";

const getParams = (filters: DashboardFilters) => {
  const params: Record<string, string | number> = {};
  if (filters.district !== "all") params.district = filters.district;
  if (filters.year !== "all") params.year = filters.year;
  if (filters.severity !== "all") params.severity = filters.severity;
  if (filters.road_classification !== "all") params.road_classification = filters.road_classification;
  if (filters.weather_condition !== "all") params.weather_condition = filters.weather_condition;
  if (filters.light_condition !== "all") params.light_condition = filters.light_condition;
  if (filters.collision_type !== "all") params.collision_type = filters.collision_type;
  return params;
};

export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const { data } = await API.get("/dashboard/filter-options");
  return data;
};

export const fetchDashboardData = async (filters: DashboardFilters): Promise<DashboardData> => {
  const params = getParams(filters);

  const [
    summary, timeSeries, severity, districts, heatmap,
    casualty, weather, light, dangerous, roads, violations
  ] = await Promise.all([
    API.get("/dashboard/summary", { params }),
    API.get("/dashboard/time-series", { params: { ...params, granularity: "month" } }),
    API.get("/dashboard/by-severity", { params }),
    API.get("/dashboard/by-district", { params }),
    API.get("/dashboard/heatmap", { params }),
    API.get("/dashboard/casualty-breakdown", { params }),
    API.get("/dashboard/by-weather", { params }),
    API.get("/dashboard/by-light", { params }),
    API.get("/dashboard/top-dangerous", { params }),
    API.get("/dashboard/by-road", { params }),
    API.get("/dashboard/by-violation", { params }),
  ]);

  return {
    summary: summary.data,
    timeSeries: timeSeries.data.data,
    severity: severity.data.data,
    districts: districts.data.data,
    heatmap: heatmap.data.data,
    casualty: casualty.data.data,
    weather: weather.data.data.map((w: any) => ({ ...w, name: w.weather_condition })),
    light: light.data.data.map((l: any) => ({ ...l, name: l.light_condition })),
    dangerous: dangerous.data.data,
    roads: roads.data.data,
    violations: violations.data.data.map((v: any) => ({ ...v, name: v.traffic_violation })),
  };
};

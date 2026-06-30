// frontend/src/features/dashboard/filterConfig.ts
import type { DashboardFilters } from "../../types/dashboard";
import { DEFAULT_BASE_MAP, GEO_FILTER_LABEL } from "../../config/constants";

export type VisualizationType =
  | "location_markers"
  | "density_heatmap"
  | "blackspot"
  | "dbscan_blackspot"
  | "temporal_analysis";

export type FilterId =
  | "baseMap"
  | "visualization_type"
  | "year"
  | "month"
  | "day"
  | "time_period"
  | "district"
  | "severity"
  | "road_classification"
  | "weather_condition"
  | "light_condition"
  | "collision_type";

export interface FilterConfigItem {
  id: FilterId;
  label: string;
  icon?: "layers";
}

export const VISUALIZATION_OPTIONS = [
  { value: "location_markers", label: "Location Markers" },
  { value: "density_heatmap", label: "Density Heatmap" },
  { value: "blackspot", label: "Blackspot Detection" },
  { value: "dbscan_blackspot", label: "DBSCAN Blackspot Detection" },
  { value: "temporal_analysis", label: "Temporal Analysis" },
];

const MAP_FILTERS: FilterConfigItem[] = [
  { id: "baseMap", label: "Base Map", icon: "layers" },
  { id: "visualization_type", label: "Visualization Type" },
  { id: "year", label: "Year" },
  // The label here is driven by config (Police Station vs District)
  { id: "district", label: GEO_FILTER_LABEL },
  { id: "severity", label: "Severity" },
  { id: "road_classification", label: "Road type" },
  { id: "weather_condition", label: "Weather" },
  { id: "light_condition", label: "Light condition" },
  { id: "collision_type", label: "Collision type" },
];

const TEMPORAL_FILTERS: FilterConfigItem[] = [
  { id: "visualization_type", label: "Visualization Type" },
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "day", label: "Day" },
  { id: "time_period", label: "Time Period" },
  { id: "district", label: GEO_FILTER_LABEL },
  { id: "severity", label: "Severity" },
  { id: "weather_condition", label: "Weather Condition" },
  { id: "light_condition", label: "Light Condition" },
];

export const getFilterConfig = (
  visualizationType?: string
): FilterConfigItem[] =>
  visualizationType === "temporal_analysis" ? TEMPORAL_FILTERS : MAP_FILTERS;

export const defaultFilters: DashboardFilters = {
  district: "all",
  year: "all",
  month: "all",
  day: "all",
  time_period: "all",
  severity: "all",
  road_classification: "all",
  weather_condition: "all",
  light_condition: "all",
  collision_type: "all",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: "location_markers",
};

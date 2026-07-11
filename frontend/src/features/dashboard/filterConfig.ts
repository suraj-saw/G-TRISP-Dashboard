// frontend/src/features/dashboard/filterConfig.ts
import type { DashboardFilters } from "../../types/dashboard";
import { DEFAULT_BASE_MAP, GEO_FILTER_LABEL } from "../../config/constants";

export type VisualizationType =
  | "location_markers"
  | "density_heatmap"
  | "kde_heatmap"
  | "weighted_kde_heatmap"
  | "blackspot"
  | "dbscan_blackspot"
  | "temporal_analysis";

export type FilterId =
  | "baseMap"
  | "visualization_type"
  | "visualization_variant"
  | "year"
  | "month"
  | "day"
  | "time_period"
  | "district"
  | "severity"
  | "road_classification"
  | "weather_condition"
  | "light_condition"
  | "collision_type"
  | "date_from"
  | "date_to";  

export interface FilterConfigItem {
  id: FilterId;
  label: string;
  icon?: "layers";
}

export const VISUALIZATION_OPTIONS = [
  { value: "location_markers", label: "Markers" },
  { value: "density_heatmap", label: "Density Heatmap" },
  { value: "kde_heatmap", label: "Kernel Density Heatmap (KDE)" },
  { value: "weighted_kde_heatmap", label: "Severity-Weighted KDE Heatmap" },
  { value: "blackspot", label: "Blackspot Detection" },
  { value: "dbscan_blackspot", label: "DBSCAN Blackspot Detection" },
  { value: "temporal_analysis", label: "Temporal Analysis" },
];

export const VISUALIZATION_VARIANT_OPTIONS = [
  { value: "accident", label: "Accident" },
  { value: "pedestrian", label: "Pedestrian" },
];

export const VISUALIZATION_VARIANT_LABELS: Record<string, string> = {
  location_markers: "Marker Type",
  density_heatmap: "Heatmap Type",
  kde_heatmap: "Heatmap Type",
  weighted_kde_heatmap: "Heatmap Type",
  blackspot: "Blackspot Type",
  dbscan_blackspot: "Blackspot Type",
};

export const hasVisualizationVariants = (visualizationType?: string): boolean =>
  Boolean(visualizationType && VISUALIZATION_VARIANT_LABELS[visualizationType]);

const MAP_FILTERS: FilterConfigItem[] = [
  { id: "baseMap", label: "Base Map", icon: "layers" },
  { id: "visualization_type", label: "Visualization Type" },
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
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
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
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
  district: [],
  year: [],
  month: [],
  day: [],
  time_period: [],
  severity: [],
  road_classification: [],
  weather_condition: [],
  light_condition: [],
  collision_type: [],
  date_from : "",
  date_to : "",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: "location_markers",
  visualization_variant: "accident",
};

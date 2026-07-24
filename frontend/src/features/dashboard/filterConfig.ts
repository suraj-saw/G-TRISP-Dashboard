/**
 * @file filterConfig.ts
 * @description Centralized configuration for dashboard filter options and logic.
 * @responsibility Defines available filters, visualization variants, and utility functions for determining which filters apply to which visualization types.
 */
import type { DashboardFilters } from "../../types/dashboard";
import { DEFAULT_BASE_MAP, GEO_FILTER_LABEL } from "../../config/constants";
import { isBlackspotVisualization } from "../../utils/dashboardFilters";

/** Type representing all possible visualization types */
export type VisualizationType =
  | "location_markers"
  | "density_heatmap"
  | "kde_heatmap"
  | "weighted_kde_heatmap"
  | "blackspot"
  | "dbscan_blackspot"
  | "irc_greedy_blackspot"
  | "irc_grid_blackspot"
  | "temporal_analysis"
  | "snapped_accidents"
  | "network_blackspot"
  | "road_network";

/** Type representing all possible filter IDs */
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

/** Interface representing a single filter configuration item */
export interface FilterConfigItem {
  id: FilterId;
  label: string;
  icon?: "layers";
}

/** Available visualization options for the dashboard */
export const VISUALIZATION_OPTIONS = [
  { value: "location_markers", label: "Markers" },
  { value: "density_heatmap", label: "Density Heatmap" },
  // { value: "kde_heatmap", label: "Kernel Density Heatmap (KDE)" },
  // { value: "weighted_kde_heatmap", label: "Severity-Weighted KDE Heatmap" },
  { value: "blackspot", label: "MoRTH Blackspot (Greedy)" },
  { value: "dbscan_blackspot", label: "MoRTH Blackspot (DBSCAN)" },
  { value: "irc_greedy_blackspot", label: "IRC 131 Blackspot (Greedy)" },
  { value: "irc_grid_blackspot", label: "IRC 131 Blackspot (Grid)" },
  { value: "snapped_accidents", label: "Network Snapped" },
  { value: "network_blackspot", label: "Network Blackspots (Segments)" },
  { value: "road_network", label: "Road Network" },
  { value: "temporal_analysis", label: "Temporal Analysis" },
];

/** Available visualization variant options */
export const VISUALIZATION_VARIANT_OPTIONS = [
  { value: "accident", label: "Overall Crashes" },
  { value: "pedestrian", label: "Pedestrian Crashes" },
];

/** Map of visualization types to their variant labels */
export const VISUALIZATION_VARIANT_LABELS: Record<string, string> = {
  location_markers: "Crash Type",
  density_heatmap: "Crash Type",
  // kde_heatmap: "Crash Type",
  // weighted_kde_heatmap: "Crash Type",
  blackspot: "Crash Type",
  dbscan_blackspot: "Crash Type",
  irc_greedy_blackspot: "Crash Type",
  irc_grid_blackspot: "Crash Type",
  snapped_accidents: "Crash Type",
  network_blackspot: "Crash Type",
  road_network: "Crash Type",
};

/**
 * Checks if a given visualization type supports variants
 * @param visualizationType - The visualization type to check
 * @returns True if the visualization type supports variants
 */
export const hasVisualizationVariants = (visualizationType?: string): boolean =>
  Boolean(visualizationType && VISUALIZATION_VARIANT_LABELS[visualizationType]);

/** Filter configuration for map-based visualizations */
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

/** Filter configuration for temporal analysis visualizations */
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

/** Removes the severity filter from a filter configuration array */
const withoutSeverity = (filters: FilterConfigItem[]): FilterConfigItem[] =>
  filters.filter((filter) => filter.id !== "severity");

/**
 * Gets the appropriate filter configuration based on visualization type
 * @param visualizationType - The current visualization type
 * @returns The filter configuration array for the given visualization
 */
export const getFilterConfig = (
  visualizationType?: string
): FilterConfigItem[] => {
  const base =
    visualizationType === "temporal_analysis" ? TEMPORAL_FILTERS : MAP_FILTERS;
  return isBlackspotVisualization(visualizationType)
    ? withoutSeverity(base)
    : base;
};

/** Default filter values for the dashboard */
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
  date_from: "",
  date_to: "",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: "location_markers",
  visualization_variant: "accident",
};

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
  | "density_heatmap"
  | "kde_heatmap"
  | "weighted_kde_heatmap"
  | "blackspot"
  | "irc_greedy_blackspot"
  | "irc_grid_blackspot"
  | "temporal_analysis"
  | "network_blackspot"
  | "network_blackspot_merged"
  | "risk_corridors"
  | "road_network";

/** Type representing all possible filter IDs */
export type FilterId =
  | "baseMap"
  | "visualization_type"
  | "blackspots"
  | "hotspots"
  | "test_visualization"
  | "visualization_variant"
  | "year"
  | "year_range"
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
  { value: "density_heatmap", label: "Density Heatmap" },
  // { value: "kde_heatmap", label: "Kernel Density Heatmap (KDE)" },
  // { value: "weighted_kde_heatmap", label: "Severity-Weighted KDE Heatmap" },
  { value: "blackspot", label: "MoRTH Blackspot" },
  { value: "irc_greedy_blackspot", label: "IRC 131 Blackspot (Greedy)" },
  { value: "irc_grid_blackspot", label: "IRC 131 Blackspot (Grid)" },
  // { value: "snapped_accidents", label: "Network Snapped" },
  { value: "risk_corridors", label: "Risk Corridors" },
  { value: "temporal_analysis", label: "Temporal Analysis" },
];

/** Blackspot visualization options */
export const BLACKSPOT_OPTIONS = [
  { value: "blackspot", label: "MoRTH Blackspot" },
  { value: "irc_greedy_blackspot", label: "IRC 131 Blackspot (Greedy)" },
  { value: "irc_grid_blackspot", label: "IRC 131 Blackspot (Grid)" },
];

/** Hotspot visualization options */
export const HOTSPOT_OPTIONS = [
  { value: "density_heatmap", label: "Density Heatmap" },
  { value: "risk_corridors", label: "Risk Corridors" },
];

/** Test visualization options */
export const TEST_VISUALIZATION_OPTIONS = [
  { value: "road_network", label: "Road Network" },
  { value: "merged_road_network", label: "Merged Road Network" },
  { value: "network_blackspot", label: "Network Blackspots (Segments)" },
  { value: "network_blackspot_merged", label: "Network Blackspots (Merged Lanes)" },
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
  irc_greedy_blackspot: "Crash Type",
  irc_grid_blackspot: "Crash Type",
  // snapped_accidents: "Crash Type",
  network_blackspot: "Crash Type",
  network_blackspot_merged: "Crash Type",
  risk_corridors: "Crash Type",
  road_network: "Crash Type",
  merged_road_network: "Crash Type",
};

/**
 * Checks if any of the given visualization types support variants
 * @param visualizationTypes - The visualization types to check
 * @returns True if any visualization type supports variants
 */
export const hasVisualizationVariants = (visualizationTypes?: string[]): boolean => {
  if (!visualizationTypes || visualizationTypes.length === 0) return false;
  return visualizationTypes.some((type) => Boolean(VISUALIZATION_VARIANT_LABELS[type]));
};

/** Filter configuration for map-based visualizations */
const MAP_FILTERS: FilterConfigItem[] = [
  { id: "baseMap", label: "Base Map", icon: "layers" },
  { id: "blackspots", label: "Blackspots" },
  { id: "hotspots", label: "Hotspots" },
  { id: "test_visualization", label: "Test Visualization" },
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "year_range", label: "Year Range" },
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
  { id: "blackspots", label: "Blackspots" },
  { id: "hotspots", label: "Hotspots" },
  { id: "test_visualization", label: "Test Visualization" },
  { id: "visualization_variant", label: "Visualization Variant" },
  { id: "date_from", label: "Start Date" },
  { id: "date_to", label: "End Date" },
  { id: "year", label: "Year" },
  { id: "year_range", label: "Year Range" },
  { id: "month", label: "Month" },
  { id: "day", label: "Day" },
  { id: "time_period", label: "Time Period" },
  { id: "district", label: GEO_FILTER_LABEL },
  { id: "severity", label: "Severity" },
  { id: "road_classification", label: "Road type" },
  { id: "weather_condition", label: "Weather Condition" },
  { id: "light_condition", label: "Light Condition" },
  { id: "collision_type", label: "Collision type" },
];

/** Removes the severity filter from a filter configuration array */
const withoutSeverity = (filters: FilterConfigItem[]): FilterConfigItem[] =>
  filters.filter((filter) => filter.id !== "severity");

/** IDs that are replaced by year_range for blackspot visualizations */
const BLACKSPOT_REPLACED_IDS = new Set<FilterId>(["date_from", "date_to", "year"]);

/**
 * For blackspot visualizations, replaces date_from, date_to, and year with year_range.
 * Also removes the severity filter.
 */
const forBlackspot = (filters: FilterConfigItem[]): FilterConfigItem[] =>
  withoutSeverity(
    filters.filter((f) =>
      !BLACKSPOT_REPLACED_IDS.has(f.id)
    )
  );

/**
 * For non-blackspot visualizations, removes the year_range filter (not applicable).
 */
const withoutYearRange = (filters: FilterConfigItem[]): FilterConfigItem[] =>
  filters.filter((f) => f.id !== "year_range");

/**
 * Gets the appropriate filter configuration based on active visualization types
 * @param visualizationTypes - The current active visualization types
 * @returns The filter configuration array for the given visualizations
 */
export const getFilterConfig = (
  visualizationTypes?: string[]
): FilterConfigItem[] => {
  const types = visualizationTypes || [];
  const hasTemporal = types.includes("temporal_analysis");
  const base = hasTemporal ? TEMPORAL_FILTERS : MAP_FILTERS;
  
  // If nothing is selected, default to non-blackspot filters
  if (types.length === 0) {
    return withoutYearRange(base);
  }

  const hasBlackspot = types.some(isBlackspotVisualization);
  const hasNonBlackspot = types.some(t => !isBlackspotVisualization(t));

  if (hasBlackspot && hasNonBlackspot) {
    // Both active: keep all filters (date, year, year_range, severity)
    return base;
  } else if (hasBlackspot) {
    // Only blackspot active
    return forBlackspot(base);
  } else {
    // Only non-blackspot active
    return withoutYearRange(base);
  }
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
  number_of_vehicles: [],
  police_station: [],
  taluka: [],
  date_from: "",
  date_to: "",
  baseMap: DEFAULT_BASE_MAP,
  visualization_type: [],
  blackspots: [],
  hotspots: [],
  test_visualization: [],
  visualization_variant: "accident",
};

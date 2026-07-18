/**
 * @file dashboardFilters.ts
 * @description Utility functions for managing, validating, and hashing dashboard filter configurations.
 * @responsibility Provides shared constants and pure functions used by hooks and components to determine visualization capabilities and generate cache keys.
 */
import type { DashboardFilters } from "../types/dashboard";

/**
 * Set of visualization types that represent blackspot visualizations.
 */
export const BLACKSPOT_VISUALIZATION_TYPES = new Set([
  "blackspot",
  "dbscan_blackspot",
  "irc_greedy_blackspot",
  "irc_grid_blackspot",
]);

/**
 * Checks if a given visualization type is a blackspot visualization.
 * @param visualizationType - The visualization type to check
 * @returns True if the visualization type is a blackspot type
 */
export const isBlackspotVisualization = (visualizationType?: string): boolean =>
  BLACKSPOT_VISUALIZATION_TYPES.has(visualizationType || "");

/**
 * Stable cache key from data-affecting filter fields.
 * Used by dashboard hooks and map layers to refetch when any filter value changes.
 * @param filters - The dashboard filter values
 * @returns JSON string key representing the current filter state
 */
export const toDataFilterKey = (filters: DashboardFilters): string =>
  JSON.stringify({
    district: filters.district,
    year: filters.year,
    month: filters.month,
    day: filters.day,
    time_period: filters.time_period,
    severity: filters.severity,
    road_classification: filters.road_classification,
    weather_condition: filters.weather_condition,
    light_condition: filters.light_condition,
    collision_type: filters.collision_type,
    police_station: filters.police_station,
    taluka: filters.taluka,
    date_from: filters.date_from,
    date_to: filters.date_to,
    visualization_variant: filters.visualization_variant,
  });

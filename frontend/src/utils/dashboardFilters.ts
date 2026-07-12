import type { DashboardFilters } from "../types/dashboard";

export const BLACKSPOT_VISUALIZATION_TYPES = new Set([
  "blackspot",
  "dbscan_blackspot",
]);

export const isBlackspotVisualization = (visualizationType?: string): boolean =>
  BLACKSPOT_VISUALIZATION_TYPES.has(visualizationType || "");

/**
 * Stable cache key from data-affecting filter fields.
 * Used by dashboard hooks and map layers to refetch when any filter value changes.
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

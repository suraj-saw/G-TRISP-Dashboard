import { useState, useEffect, useCallback } from "react";
import { fetchDashboardData } from "../api/dashboardApi";
import type { DashboardFilters, DashboardData } from "../types/dashboard";

const initialData: DashboardData = {
  summary: {
    total_accidents: 0,
    total_fatalities: 0,
    total_grievous: 0,
    total_minor: 0,
    total_damage_only: 0,
    total_vehicles: 0,
    districts_covered: 0,
    police_stations: 0,
  },
  timeSeries: [],
  severity: [],
  districts: [],
  heatmap: [],
  casualty: [],
  weather: [],
  light: [],
  dangerous: [],
  roads: [],
  violations: [],
};

/**
 * Produces a stable cache-key from only the data-affecting filter fields.
 * Visual-only fields (baseMap, visualization_type) are intentionally excluded
 * so switching map styles or view type doesn't trigger a redundant API call.
 */
const toFilterKey = (filters: DashboardFilters): string =>
  JSON.stringify({
    district: filters.district,
    year: filters.year,
    severity: filters.severity,
    road_classification: filters.road_classification,
    weather_condition: filters.weather_condition,
    light_condition: filters.light_condition,
    collision_type: filters.collision_type,
  });

export const useDashboard = (filters: DashboardFilters) => {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Stable key — only changes when data-relevant filters change
  const filterKey = toFilterKey(filters);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDashboardData(filters);
      setData(result);
    } catch (err: any) {
      setError(err.message || "Failed to fetch dashboard data.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]); // filterKey captures all relevant filter values

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, loading, error, refetch: loadData };
};

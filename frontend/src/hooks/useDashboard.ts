/**
 * @file useDashboard.ts
 * @description Custom React hook for fetching and managing state for the primary Surat mapping dashboard.
 * @responsibility Abstracts the data fetching logic, loading state, and error handling away from the presentation components.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchDashboardData } from "../api/dashboardApi";
import type { DashboardFilters, DashboardData } from "../types/dashboard";
import { toDataFilterKey } from "../utils/dashboardFilters";

/**
 * Initial default dashboard data state for useDashboard hook
 */
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
 * Custom React hook to fetch and manage dashboard data.
 * 
 * @hooks_usage Uses `useState` for data/loading/error states. Uses `useCallback` to memoize the fetch function, and `useEffect` to trigger fetches when the derived `filterKey` changes.
 * @business_rule Relies on `toDataFilterKey` to generate a stable cache string from the filters object. This prevents redundant API calls if map-only filters (like baseMap or visualization_type) change, as they do not require new data from the backend.
 * 
 * @param {DashboardFilters} filters - The current active filter selections.
 * @returns {{ data: DashboardData, loading: boolean, error: string | null, refetch: () => Promise<void> }} Object containing the data, loading state, error state, and a manual refetch trigger.
 */
export const useDashboard = (filters: DashboardFilters) => {
  /** Current dashboard data state */
  const [data, setData] = useState<DashboardData>(initialData);
  /** Loading indicator */
  const [loading, setLoading] = useState<boolean>(true);
  /** Error message if data fetch fails */
  const [error, setError] = useState<string | null>(null);

  /** Stable cache key that only changes when data-relevant filter values change */
  const filterKey = toDataFilterKey(filters);

  /**
   * Asynchronously fetches dashboard data based on the current filters.
   * Updates loading and error states accordingly.
   */
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

  /**
   * Load data whenever filterKey changes
   */
  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, loading, error, refetch: loadData };
};

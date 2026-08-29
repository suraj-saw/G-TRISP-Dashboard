/**
 * @file blackspotReportApi.ts
 * @description API client functions for fetching blackspot-scoped statistical and temporal
 * analysis data. These endpoints compute the same data shapes as the district-level stats
 * and temporal analysis, but scoped to a specific set of crash IDs from a blackspot cluster.
 */

import API from "./axios";
import { GUJARAT_API_BASE } from "../config/constants";
import type { DistrictStats } from "./gujaratDashboardApi";
import type { TemporalAnalysisData } from "../types/dashboard";

/**
 * Fetch statistical analysis data (DistrictStats shape) for a specific set of crash IDs.
 * Used by BlackspotPdfReport to render the same charts as DistrictStatisticalAnalysis.
 *
 * @param crashIds - Array of crash IDs (DB primary keys) from a blackspot cluster
 * @returns DistrictStats-compatible data structure
 */
export async function fetchBlackspotCrashStats(
  crashIds: string[]
): Promise<DistrictStats> {
  const response = await API.post<DistrictStats>(
    `${GUJARAT_API_BASE}/blackspots/crash-stats`,
    { crash_ids: crashIds }
  );
  return response.data;
}

/**
 * Fetch temporal analysis data (TemporalAnalysisData shape) for a specific set of crash IDs.
 * Used by BlackspotPdfReport to render the same charts as TemporalAnalysis.
 *
 * @param crashIds - Array of crash IDs (DB primary keys) from a blackspot cluster
 * @returns TemporalAnalysisData-compatible data structure
 */
export async function fetchBlackspotCrashTemporal(
  crashIds: string[]
): Promise<TemporalAnalysisData> {
  const response = await API.post<TemporalAnalysisData>(
    `${GUJARAT_API_BASE}/blackspots/crash-temporal`,
    { crash_ids: crashIds }
  );
  return response.data;
}

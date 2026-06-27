// frontend/src/api/exportApi.ts
import type { DashboardFilters } from "../types/dashboard";
import { SURAT_API_BASE } from "../config/constants";

export type ExportFormat = "csv" | "excel";

/**
 * Builds the query-string parameters from the current dashboard filters,
 * mirroring the logic in dashboardApi.ts getParams().
 */
function buildExportParams(
  filters: DashboardFilters,
  format: ExportFormat
): URLSearchParams {
  const params = new URLSearchParams();

  params.set("format", format);

  if (
    filters.district &&
    filters.district !== "all" &&
    filters.district !== "Surat"
  ) {
    params.set("police_station", filters.district);
  }

  if (filters.year && filters.year !== "all") {
    params.set("year", filters.year);
  }

  if (filters.severity && filters.severity !== "all") {
    params.set("severity", filters.severity);
  }

  if (filters.road_classification && filters.road_classification !== "all") {
    params.set("road_classification", filters.road_classification);
  }

  if (filters.weather_condition && filters.weather_condition !== "all") {
    params.set("weather_condition", filters.weather_condition);
  }

  if (filters.light_condition && filters.light_condition !== "all") {
    params.set("light_condition", filters.light_condition);
  }

  if (filters.collision_type && filters.collision_type !== "all") {
    params.set("collision_type", filters.collision_type);
  }

  return params;
}

/**
 * Triggers a browser file download for the given format and filters.
 * Uses a hidden <a> element so we get the correct filename from the
 * Content-Disposition header (via blob URL), and credentials are sent
 * via fetch (same-site cookies).
 *
 * Returns the record count embedded in the filename, or null on error.
 */
export async function downloadExport(
  filters: DashboardFilters,
  format: ExportFormat
): Promise<void> {
  const params = buildExportParams(filters, format);
  const url = `/api${SURAT_API_BASE}/export?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include", // send session cookies
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Export failed (${response.status}): ${text || response.statusText}`
    );
  }

  // Extract filename from Content-Disposition header if available
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename =
    filenameMatch?.[1] ??
    `surat_accidents_export.${format === "excel" ? "xlsx" : "csv"}`;

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

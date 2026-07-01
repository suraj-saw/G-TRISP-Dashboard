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
    filters.district.length > 0 &&
    !filters.district.includes("Surat")
  ) {
    filters.district.forEach((d) => params.append("police_station", d));
  }

  if (filters.year && filters.year.length > 0) {
    filters.year.forEach((y) => params.append("year", y));
  }

  if (filters.severity && filters.severity.length > 0) {
    filters.severity.forEach((s) => params.append("severity", s));
  }

  if (filters.road_classification && filters.road_classification.length > 0) {
    filters.road_classification.forEach((r) =>
      params.append("road_classification", r)
    );
  }

  if (filters.weather_condition && filters.weather_condition.length > 0) {
    filters.weather_condition.forEach((w) =>
      params.append("weather_condition", w)
    );
  }

  if (filters.light_condition && filters.light_condition.length > 0) {
    filters.light_condition.forEach((l) =>
      params.append("light_condition", l)
    );
  }

  if (filters.collision_type && filters.collision_type.length > 0) {
    filters.collision_type.forEach((c) => params.append("collision_type", c));
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

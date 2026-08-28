// frontend/src/api/exportApi.ts
import type { DashboardFilters } from "../types/dashboard";
import { GUJARAT_API_BASE } from "../config/constants";

export type ExportFormat = "csv" | "excel";

/**
 * Exports district-scoped accident data from the Gujarat API.
 */
export async function downloadGujaratExport(
  filters: DashboardFilters,
  format: ExportFormat,
  districtName?: string,
  isBlackspot?: boolean,
  clusterId?: number
): Promise<void> {
  const params = new URLSearchParams();
  params.set("format", format);
  if (districtName) {
    params.set("district", districtName);
  }

  if (filters.year?.length)
    filters.year.forEach((y) => params.append("year", y));
  if (filters.severity?.length)
    filters.severity.forEach((s) => params.append("severity", s));
  if (filters.road_classification?.length)
    filters.road_classification.forEach((r) =>
      params.append("road_classification", r)
    );
  if (filters.weather_condition?.length)
    filters.weather_condition.forEach((w) =>
      params.append("weather_condition", w)
    );
  if (filters.light_condition?.length)
    filters.light_condition.forEach((l) => params.append("light_condition", l));
  if (filters.collision_type?.length)
    filters.collision_type.forEach((c) => params.append("collision_type", c));
  if (filters.police_station?.length)
    filters.police_station.forEach((p) => params.append("police_station", p));
  if (filters.taluka?.length)
    filters.taluka.forEach((t) => params.append("taluka", t));
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);

  if (isBlackspot && clusterId !== undefined) {
    params.set("bs_id", clusterId.toString());
  }

  const endpoint = isBlackspot ? "/blackspot-export" : "/export";
  const url = `/api${GUJARAT_API_BASE}${endpoint}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Export failed (${response.status}): ${text || response.statusText}`
    );
  }

  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename =
    filenameMatch?.[1] ??
    `${(districtName ?? "gujarat").toLowerCase().replace(/\s+/g, "_")}_accidents_export.${format === "excel" ? "xlsx" : "csv"}`;

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}

// frontend/src/api/blackspotExportApi.ts
import type { DashboardFilters } from "../types/dashboard";
import { SURAT_API_BASE, GUJARAT_API_BASE } from "../config/constants";

export type BlackspotExportFormat = "csv" | "excel";
export type BlackspotAlgorithm = "greedy" | "dbscan";

function buildBlackspotExportParams(
  filters: DashboardFilters,
  format: BlackspotExportFormat,
  algorithm: BlackspotAlgorithm,
  isSurat: boolean,
  districtName?: string,
  bsId?: number
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("format", format);
  params.set("algorithm", algorithm);

  if (bsId !== undefined) {
    params.set("bs_id", String(bsId));
  }

  if (isSurat) {
    if (filters.district?.length && !filters.district.includes("Surat")) {
      filters.district.forEach((d) => params.append("police_station", d));
    }
  } else {
    if (districtName && districtName !== "Gujarat") {
      params.append("district", districtName);
    } else if (filters.district?.length) {
      filters.district.forEach((d) => params.append("district", d));
    }
  }

  filters.year?.forEach((y) => params.append("year", y));
  filters.severity?.forEach((s) => params.append("severity", s));
  filters.road_classification?.forEach((r) =>
    params.append("road_classification", r)
  );
  filters.weather_condition?.forEach((w) =>
    params.append("weather_condition", w)
  );
  filters.light_condition?.forEach((l) => params.append("light_condition", l));
  filters.collision_type?.forEach((c) => params.append("collision_type", c));
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);

  return params;
}

export async function downloadBlackspotExport(
  filters: DashboardFilters,
  format: BlackspotExportFormat,
  algorithm: BlackspotAlgorithm,
  isSurat: boolean = true,
  districtName?: string,
  bsId?: number
): Promise<void> {
  const base = isSurat ? SURAT_API_BASE : GUJARAT_API_BASE;
  const params = buildBlackspotExportParams(
    filters,
    format,
    algorithm,
    isSurat,
    districtName,
    bsId
  );
  const url = `/api${base}/blackspot-export?${params.toString()}`;

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
    `blackspots_export.${format === "excel" ? "xlsx" : "csv"}`;

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

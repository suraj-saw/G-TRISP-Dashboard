// frontend/src/config/blackspotConfig.ts
// ── Professional GIS risk palette ───────────────────────────────────────────
export const BS_COLORS = {
  veryLow:  "#FBBF24", // Amber
  low:      "#F97316", // Orange
  medium:   "#EA580C", // Deep Orange
  high:     "#DC2626", // Red
  critical: "#7F1D1D", // Dark Burgundy
} as const;

export const BS_HALO_COLORS = {
  veryLow:  "rgba(251,191,36,0.25)",
  low:      "rgba(249,115,22,0.28)",
  medium:   "rgba(234,88,12,0.32)",
  high:     "rgba(220,38,38,0.36)",
  critical: "rgba(127,29,29,0.42)",
} as const;

// ── Color step expression (MapLibre GL) ─────────────────────────────────────
// Thresholds: <15 | <50 | <150 | <350 | ≥350
export const BS_COLOR_EXPR = [
  "step", ["get", "point_count"],
  BS_COLORS.veryLow,  15,
  BS_COLORS.low,      50,
  BS_COLORS.medium,  150,
  BS_COLORS.high,    350,
  BS_COLORS.critical,
] as const;

export const BS_HALO_COLOR_EXPR = [
  "step", ["get", "point_count"],
  BS_HALO_COLORS.veryLow,  15,
  BS_HALO_COLORS.low,      50,
  BS_HALO_COLORS.medium,  150,
  BS_HALO_COLORS.high,    350,
  BS_HALO_COLORS.critical,
] as const;

// ── Square-root radius (core circle) ────────────────────────────────────────
// r = clamp(sqrt(count) * k, minR, maxR)
// We approximate sqrt via interpolate+pow in MapLibre.
// Base zoom multiplier shrinks bubbles as you zoom in (clusters break apart).
export const BS_CORE_RADIUS_EXPR = [
  "interpolate", ["linear"], ["zoom"],
  8,  ["*", 0.55, ["sqrt", ["max", ["get", "point_count"], 1]]],
  11, ["*", 0.70, ["sqrt", ["max", ["get", "point_count"], 1]]],
  13, ["*", 0.50, ["sqrt", ["max", ["get", "point_count"], 1]]],
  15, ["*", 0.35, ["sqrt", ["max", ["get", "point_count"], 1]]],
] as const;

export const BS_HALO_RADIUS_EXPR = [
  "interpolate", ["linear"], ["zoom"],
  8,  ["*", 1.0, ["sqrt", ["max", ["get", "point_count"], 1]]],
  11, ["*", 1.2, ["sqrt", ["max", ["get", "point_count"], 1]]],
  13, ["*", 0.85, ["sqrt", ["max", ["get", "point_count"], 1]]],
  15, ["*", 0.60, ["sqrt", ["max", ["get", "point_count"], 1]]],
] as const;

// ── Adaptive label size ──────────────────────────────────────────────────────
export const BS_TEXT_SIZE_EXPR = [
  "step", ["get", "point_count"],
  11, 15, 12, 50, 13, 150, 14, 350, 15,
] as const;

// ── Risk label mapping ───────────────────────────────────────────────────────
export function getRiskLabel(count: number): string {
  if (count >= 350) return "Critical Risk Zone";
  if (count >= 150) return "High Risk Zone";
  if (count >= 50)  return "Medium Risk Zone";
  if (count >= 15)  return "Low Risk Zone";
  return "Very Low Risk Zone";
}

export function getRiskColor(count: number): string {
  if (count >= 350) return BS_COLORS.critical;
  if (count >= 150) return BS_COLORS.high;
  if (count >= 50)  return BS_COLORS.medium;
  if (count >= 15)  return BS_COLORS.low;
  return BS_COLORS.veryLow;
}

// Individual point severity → risk color
export const BS_SINGLE_COLOR_EXPR = [
  "match", ["get", "severity"],
  "Fatal",           "#7F1D1D",
  "Grievous Injury", "#DC2626",
  "Minor Injury",    "#EA580C",
  "Damage Only",     "#FBBF24",
  "#F97316",
] as const;

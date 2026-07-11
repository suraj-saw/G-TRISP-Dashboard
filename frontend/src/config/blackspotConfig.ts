// frontend/src/config/blackspotConfig.ts
//
// Configuration-driven blackspot priority palette.
//
// Risk tiers are driven by the priority_score calculated by the backend:
//   Priority Score = (fatal × 10) + (grievous × 5) + (minor_hosp × 3) + 
//                    (minor_non_hosp × 2) + (no_injury × 1) + (damage_only × 0)
//
// Priority Tier Table (Aligned with Gujarat Distribution):
// ┌───────────────────────────────┬─────────────┬────────────────────────────────┐
// │ Label                         │ Score Band  │ Colour                         │
// ├───────────────────────────────┼─────────────┼────────────────────────────────┤
// │ Critical Blackspot            │ ≥ 200       │ #4C1D1D (near-black maroon)    │
// │ Very High Risk Blackspot      │ 140–199     │ #7F1D1D (dark burgundy)        │
// │ High Risk Blackspot           │  90–139     │ #DC2626 (red)                  │
// │ Medium Risk Blackspot         │  60–89      │ #EA580C (deep orange)          │
// │ Low Risk Blackspot            │  30–59      │ #F97316 (orange)               │
// │ Identified Blackspot          │  < 30       │ #FBBF24 (amber)                │
// └───────────────────────────────┴─────────────┴────────────────────────────────┘

// ── Priority colour palette ───────────────────────────────────────────────────
export const PRIORITY_COLORS = {
  identified: "#FBBF24", // amber        — identified (sub-threshold for low)
  low: "#F97316", // orange       — Low Risk Blackspot
  medium: "#EA580C", // deep orange  — Medium Risk Blackspot
  high: "#DC2626", // red          — High Risk Blackspot
  veryHigh: "#7F1D1D", // dark burgundy— Very High Risk Blackspot
  critical: "#4C1D1D", // near-black   — Critical Blackspot
} as const;

export const PRIORITY_HALO_COLORS = {
  identified: "rgba(251,191,36,0.22)",
  low: "rgba(249,115,22,0.26)",
  medium: "rgba(234,88,12,0.30)",
  high: "rgba(220,38,38,0.34)",
  veryHigh: "rgba(127,29,29,0.40)",
  critical: "rgba(76,29,29,0.46)",
} as const;

// ── Priority-driven colour step expression (MapLibre GL) ──────────────────────
// Breakpoints: Score < 30 | 30–59 | 60–89 | 90–139 | 140–199 | ≥ 200
export const PRIORITY_COLOR_EXPR = [
  "step",
  ["get", "priority_score"],
  PRIORITY_COLORS.identified, // default (Score < 30)
  30,
  PRIORITY_COLORS.low,
  60,
  PRIORITY_COLORS.medium,
  90,
  PRIORITY_COLORS.high,
  140,
  PRIORITY_COLORS.veryHigh,
  200,
  PRIORITY_COLORS.critical,
] as const;

export const PRIORITY_HALO_COLOR_EXPR = [
  "step",
  ["get", "priority_score"],
  PRIORITY_HALO_COLORS.identified,
  30,
  PRIORITY_HALO_COLORS.low,
  60,
  PRIORITY_HALO_COLORS.medium,
  90,
  PRIORITY_HALO_COLORS.high,
  140,
  PRIORITY_HALO_COLORS.veryHigh,
  200,
  PRIORITY_HALO_COLORS.critical,
] as const;

// ── Square-root radius (core circle) — scales on crash count ────────────────
// r = clamp(sqrt(count) × k, minR, maxR)
export const BS_CORE_RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  ["*", 0.55, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  11,
  ["*", 0.7, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  13,
  ["*", 0.5, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  15,
  ["*", 0.35, ["sqrt", ["max", ["get", "crash_count"], 1]]],
] as const;

export const BS_HALO_RADIUS_EXPR = [
  "interpolate",
  ["linear"],
  ["zoom"],
  8,
  ["*", 1.0, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  11,
  ["*", 1.2, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  13,
  ["*", 0.85, ["sqrt", ["max", ["get", "crash_count"], 1]]],
  15,
  ["*", 0.6, ["sqrt", ["max", ["get", "crash_count"], 1]]],
] as const;

// ── Text size — scales on priority score band, not raw count ─────────────────
export const PRIORITY_TEXT_SIZE_EXPR = [
  "step",
  ["get", "priority_score"],
  11, // identified
  30,
  12, // low
  60,
  13, // medium
  90,
  14, // high
  140,
  15, // very high
  200,
  16, // critical
] as const;

// ── Priority risk label from Score ───────────────────────────────────────────
export function getPriorityLabel(score: number): string {
  if (score >= 200) return "Critical Blackspot";
  if (score >= 140) return "Very High Risk Blackspot";
  if (score >= 90) return "High Risk Blackspot";
  if (score >= 60) return "Medium Risk Blackspot";
  if (score >= 30) return "Low Risk Blackspot";
  return "Identified Blackspot";
}

export function getPriorityColor(score: number): string {
  if (score >= 200) return PRIORITY_COLORS.critical;
  if (score >= 140) return PRIORITY_COLORS.veryHigh;
  if (score >= 90) return PRIORITY_COLORS.high;
  if (score >= 60) return PRIORITY_COLORS.medium;
  if (score >= 30) return PRIORITY_COLORS.low;
  return PRIORITY_COLORS.identified;
}

// ── Severity → colour (individual accident markers) ──────────────────────────
export const PRIORITY_SINGLE_COLOR_EXPR = [
  "match",
  ["get", "severity"],
  "Fatal",
  "#4C1D1D", // near-black maroon
  "Grievous Injury",
  "#DC2626", // red
  "Minor Injury Hospitalized",
  "#EA580C", // deep orange
  "Minor Injury Non Hospitalized",
  "#F59E0B", // amber
  "No Injury",
  "#FBBF24", // yellow
  "Damage Only",
  "#94A3B8", // slate grey
  "#64748b", // fallback (unknown)
] as const;

// ── Threshold constants (mirrored from backend for UI display) ─────────────
export const SEARCH_RADIUS_M = 250; 
export const MIN_QUALIFYING_CRASHES = 5; 

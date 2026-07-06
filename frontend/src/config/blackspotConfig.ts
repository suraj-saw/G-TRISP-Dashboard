// frontend/src/config/blackspotConfig.ts
//
// IRC SP:88-2019 / IRC:99-2018 compliant blackspot risk palette.
//
// Risk tiers are driven by the Accident Severity Index (ASI):
//   ASI = (fatal × 3) + (grievous_injury × 2) + (minor_injury × 1)
//
// IRC ASI Tier Table (SP:88-2019 §4.2 & Annex A):
// ┌───────────────────────────────┬──────────┬────────────────────────────────┐
// │ IRC Label                     │ ASI Band │ Colour                         │
// ├───────────────────────────────┼──────────┼────────────────────────────────┤
// │ Critical / Mass-Casualty      │ ≥ 200    │ #4C1D1D (near-black maroon)    │
// │ Very High Risk Blackspot      │ 100–199  │ #7F1D1D (dark burgundy)        │
// │ High Risk Blackspot           │  60–99   │ #DC2626 (red)                  │
// │ Medium Risk Blackspot         │  30–59   │ #EA580C (deep orange)          │
// │ Low Risk Blackspot            │  15–29   │ #F97316 (orange)               │
// │ Potential Blackspot (sub-thr.)│  < 15    │ #FBBF24 (amber)                │
// └───────────────────────────────┴──────────┴────────────────────────────────┘
//
// IMPORTANT: The frontend MapLibre step expressions below use the `asi`
// property (not raw crash count) so colour thresholds match IRC criteria.
// The `point_count` alias remains available on each feature for backward-
// compatible radius / text-size expressions that scale on crash count.

// ── IRC ASI colour palette ───────────────────────────────────────────────────
export const IRC_COLORS = {
  potential: "#FBBF24", // amber        — sub-threshold / potential
  low: "#F97316", // orange       — Low Risk Blackspot       (ASI 15–29)
  medium: "#EA580C", // deep orange  — Medium Risk Blackspot    (ASI 30–59)
  high: "#DC2626", // red          — High Risk Blackspot      (ASI 60–99)
  veryHigh: "#7F1D1D", // dark burgundy— Very High Risk Blackspot (ASI 100–199)
  critical: "#4C1D1D", // near-black   — Critical / Mass-Casualty (ASI ≥ 200)
} as const;

export const IRC_HALO_COLORS = {
  potential: "rgba(251,191,36,0.22)",
  low: "rgba(249,115,22,0.26)",
  medium: "rgba(234,88,12,0.30)",
  high: "rgba(220,38,38,0.34)",
  veryHigh: "rgba(127,29,29,0.40)",
  critical: "rgba(76,29,29,0.46)",
} as const;

// ── IRC ASI-driven colour step expression (MapLibre GL) ──────────────────────
// Breakpoints: ASI < 15 | 15–29 | 30–59 | 60–99 | 100–199 | ≥ 200
export const IRC_COLOR_EXPR = [
  "step",
  ["get", "asi"],
  IRC_COLORS.potential, // default (ASI < 15 — potential blackspot)
  15,
  IRC_COLORS.low,
  30,
  IRC_COLORS.medium,
  60,
  IRC_COLORS.high,
  100,
  IRC_COLORS.veryHigh,
  200,
  IRC_COLORS.critical,
] as const;

export const IRC_HALO_COLOR_EXPR = [
  "step",
  ["get", "asi"],
  IRC_HALO_COLORS.potential,
  15,
  IRC_HALO_COLORS.low,
  30,
  IRC_HALO_COLORS.medium,
  60,
  IRC_HALO_COLORS.high,
  100,
  IRC_HALO_COLORS.veryHigh,
  200,
  IRC_HALO_COLORS.critical,
] as const;

// ── Backward-compatible alias (used by legacy layers that key on point_count) ─
// Thresholds map approximate crash-count bands to IRC risk tiers.
// Prefer IRC_COLOR_EXPR (ASI-based) for any new layers.
export const BS_COLOR_EXPR = IRC_COLOR_EXPR;
export const BS_HALO_COLOR_EXPR = IRC_HALO_COLOR_EXPR;

// ── Square-root radius (core circle) — scales on crash count ────────────────
// r = clamp(sqrt(count) × k, minR, maxR)
export const IRC_CORE_RADIUS_EXPR = [
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

export const IRC_HALO_RADIUS_EXPR = [
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

// Legacy aliases
export const BS_CORE_RADIUS_EXPR = IRC_CORE_RADIUS_EXPR;
export const BS_HALO_RADIUS_EXPR = IRC_HALO_RADIUS_EXPR;

// ── Text size — scales on ASI band, not raw count ────────────────────────────
export const IRC_TEXT_SIZE_EXPR = [
  "step",
  ["get", "asi"],
  11, // sub-threshold
  15,
  12, // low
  30,
  13, // medium
  60,
  14, // high
  100,
  15, // very high
  200,
  16, // critical
] as const;

export const BS_TEXT_SIZE_EXPR = IRC_TEXT_SIZE_EXPR;

// ── IRC risk label from ASI ──────────────────────────────────────────────────
export function getIrcRiskLabel(asi: number): string {
  if (asi >= 200) return "Critical Blackspot";
  if (asi >= 100) return "Very High Risk Blackspot";
  if (asi >= 60) return "High Risk Blackspot";
  if (asi >= 30) return "Medium Risk Blackspot";
  if (asi >= 15) return "Low Risk Blackspot";
  return "Potential Blackspot";
}

export function getIrcRiskColor(asi: number): string {
  if (asi >= 200) return IRC_COLORS.critical;
  if (asi >= 100) return IRC_COLORS.veryHigh;
  if (asi >= 60) return IRC_COLORS.high;
  if (asi >= 30) return IRC_COLORS.medium;
  if (asi >= 15) return IRC_COLORS.low;
  return IRC_COLORS.potential;
}

// Legacy shims — these helpers previously used crash count; they now delegate
// to ASI-based equivalents.  Callers should migrate to getIrcRiskLabel/Color.
/** @deprecated Use getIrcRiskLabel(asi) instead */
export function getRiskLabel(crashCount: number): string {
  // Approximate: assume average severity mix gives ASI ≈ 1.8 × crash count
  return getIrcRiskLabel(Math.round(crashCount * 1.8));
}

/** @deprecated Use getIrcRiskColor(asi) instead */
export function getRiskColor(crashCount: number): string {
  return getIrcRiskColor(Math.round(crashCount * 1.8));
}

// ── Severity → colour (individual accident markers) ──────────────────────────
// Colours align with IRC severity classification used in accident records.
export const IRC_SINGLE_COLOR_EXPR = [
  "match",
  ["get", "severity"],
  "Fatal",
  "#4C1D1D", // near-black maroon — most severe
  "Grievous Injury",
  "#DC2626", // red
  "Minor Injury",
  "#EA580C", // deep orange
  "Damage Only",
  "#FBBF24", // amber — property damage, no casualties
  "#64748b", // fallback (unknown)
] as const;

// Legacy alias
export const BS_SINGLE_COLOR_EXPR = IRC_SINGLE_COLOR_EXPR;

// ── IRC threshold constants (mirrored from backend for UI display) ─────────
export const IRC_RADIUS_M = 500; // §4.2 — 500 m search radius
export const IRC_MIN_CRASHES = 5; // §4.2a — min total accidents
export const IRC_MIN_FATAL = 3; // §4.2b — min fatal accidents
export const IRC_MIN_ASI = 15; // §4.2c — min ASI

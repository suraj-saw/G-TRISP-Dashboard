// frontend/src/config/themeConfig.ts
/**
 * Centralized theme constants, severity colors, and chart palettes.
 * Single source of truth for all frontend data visualization styling.
 */

// ---------------------------------------------------------------------------
// Severity Colors
// ---------------------------------------------------------------------------

export const SEVERITY_COLORS: Record<string, string> = {
  Fatal: "#ef4444",
  "Grievous Injury": "#f97316",
  Grievous: "#f97316",
  "Minor Injury": "#f59e0b",
  "Minor Injury Hospitalized": "#f59e0b",
  "Minor Injury Non Hospitalized": "#0284c7",
  Minor: "#eab308",
  "Damage Only": "#94a3b8",
  "No Injury": "#64748b",
} as const;

export const SEVERITY_LEGEND_PALETTE = [
  { label: "Fatal", color: "#78350F" },
  { label: "Grievous Injury", color: "#EA580C" },
  { label: "Minor Injury Hospitalized", color: "#EAB308" },
  { label: "Minor Injury Non Hospitalized", color: "#0284C7" },
  { label: "No Injury / Damage Only", color: "#16A34A" },
] as const;

// ---------------------------------------------------------------------------
// Chart Color Schemes
// ---------------------------------------------------------------------------

export const CHART_COLORS = {
  BLUE: "#3b82f6",
  TEAL: "#14b8a6",
  INDIGO: "#6366f1",
  PURPLE: "#a855f7",
  MUTED: "#64748b",
  GRID: "#cbd5e1",
  LABEL_TEXT: "#475569",
} as const;

export const INVOLVED_VEHICLE_GRADIENT = [
  "#60a5fa",
  "#3b82f6",
  "#2563eb",
  "#1d4ed8",
] as const;

// ---------------------------------------------------------------------------
// Component UI Tokens
// ---------------------------------------------------------------------------

export const UI_COLORS = {
  CARD_BG: "#ffffff",
  BORDER_LIGHT: "#e2e8f0",
  CARD_GRADIENT_START: "#f8fafc",
  CARD_GRADIENT_END: "#f1f5f9",
} as const;

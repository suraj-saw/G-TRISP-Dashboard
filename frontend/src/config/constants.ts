// frontend/src/config/constants.ts
/**
 * Central configuration constants for the G-TRISP frontend.
 * All previously hardcoded values live here — change once, applies everywhere.
 */

// ---------------------------------------------------------------------------
// API base paths
// ---------------------------------------------------------------------------

/** Base path for the Surat-specific dashboard endpoints */
export const SURAT_API_BASE = "/surat/dashboard";

/** Base path for the Gujarat-wide dashboard endpoints */
export const GUJARAT_API_BASE = "/dashboard";

/** Base path for the GeoJSON / boundary endpoints */
export const GEO_API_BASE = "/geo";

/** Base path for auth endpoints */
export const AUTH_API_BASE = "/auth";

/** Base path for admin endpoints */
export const ADMIN_API_BASE = "/admin";

// ---------------------------------------------------------------------------
// Map defaults — Surat District
// ---------------------------------------------------------------------------

export const SURAT_MAP_CENTER = {
  longitude: 72.83,
  latitude: 21.17,
  zoom: 10,
} as const;

/** Approximate bounding box used as a fallback when PostGIS boundary fails */
export const SURAT_APPROX_BBOX = {
  minLng: 72.6,
  minLat: 20.9,
  maxLng: 73.2,
  maxLat: 21.4,
} as const;

// ---------------------------------------------------------------------------
// Map defaults — Gujarat State
// ---------------------------------------------------------------------------

export const GUJARAT_MAP_CENTER = {
  longitude: 71.1924,
  latitude: 22.2587,
  zoom: 6,
} as const;

// ---------------------------------------------------------------------------
// Map asset paths (served from /public)
// ---------------------------------------------------------------------------

/** GeoJSON file for the Gujarat district choropleth map */
export const GUJARAT_DISTRICTS_GEOJSON_PATH = "/gujarat.json";

// ---------------------------------------------------------------------------
// Map style IDs — must match MAP_STYLES entries in mapStyles.ts
// ---------------------------------------------------------------------------

/** ID of the satellite base map style (used for mask color switching) */
export const MAP_STYLE_ID_SATELLITE = "google-satellite";

/** ID of the hybrid base map style */
export const MAP_STYLE_ID_HYBRID = "google-hybrid";

/** Set of base-map IDs that are satellite/aerial imagery */
export const SATELLITE_BASE_MAP_IDS = new Set([
  MAP_STYLE_ID_SATELLITE,
  MAP_STYLE_ID_HYBRID,
  "esri-satellite",
]);

// ---------------------------------------------------------------------------
// Session / polling
// ---------------------------------------------------------------------------

/** Interval (ms) at which the dashboard polls /auth/me to keep session alive */
export const SESSION_POLL_INTERVAL_MS = 5_000;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  DASHBOARD: "/dashboard",
  ADMIN: "/admin",
  ADMIN_PANEL: "/admin/panel",
} as const;

export const DASHBOARD_MODE = (import.meta.env.VITE_DASHBOARD_MODE ||
  "surat") as "surat" | "gujarat";

export const DEFAULT_BASE_MAP = "google-streets";

export const GEO_FILTER_LABEL =
  DASHBOARD_MODE === "surat" ? "Police Station" : "District";

// ---------------------------------------------------------------------------
// Pagination / data limits
// ---------------------------------------------------------------------------

/** Default number of top-dangerous items to fetch */
export const TOP_DANGEROUS_DEFAULT_N = 10;

/** Maximum number of top-dangerous items available */
export const TOP_DANGEROUS_MAX_N = 50;

// ---------------------------------------------------------------------------
// Seed / batch sizes (mirrored from backend for documentation)
// ---------------------------------------------------------------------------

/** Default batch size used by data seeders */
export const SEED_BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Heatmap / visualization
// ---------------------------------------------------------------------------

/**
 * Ordered weekday names (Monday → Sunday) — mirrors backend WEEKDAY_ORDER.
 * Used by the HourDayHeatmap component.
 */
export const WEEKDAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAY_ORDER)[number];

// ---------------------------------------------------------------------------
// Severity weights for heatmap intensity (mirrors VisualizationLayers logic)
// ---------------------------------------------------------------------------

export const SEVERITY_WEIGHTS: Record<string, number> = {
  fatal: 1,
  grievous: 0.85,
  minor: 0.55,
  damage: 0.3,
} as const;

export const SEVERITY_DEFAULT_WEIGHT = 0.5;

// ---------------------------------------------------------------------------
// Popup / marker sentinel values
// ---------------------------------------------------------------------------

/** Raw DB string indicating a null / missing text value */
export const NULL_TEXT_SENTINEL = "nan";

/** Safe display replacement for null / missing text */
export const UNKNOWN_LABEL = "Unknown";

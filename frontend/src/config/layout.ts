// frontend/src/config/layout.ts
/**
 * Layout constants — single source of truth for all UI sizing magic numbers.
 * Change here; every component that imports these updates automatically.
 */

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

/** Height of the fixed top navigation bar in pixels */
export const TOPBAR_HEIGHT_PX = 60;

/** Tailwind class for the topbar height (h-20 = 80px) */
export const TOPBAR_HEIGHT_CLASS = "h-20";

/** CSS calc string for full-height minus the topbar */
export const BELOW_TOPBAR_HEIGHT = `calc(100vh - ${TOPBAR_HEIGHT_PX}px)`;

/** Top-padding needed on main content to clear the fixed topbar */
export const MAIN_CONTENT_TOP_PADDING_PX = TOPBAR_HEIGHT_PX + 24; // 80 + 24 = 104

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/** Collapsed / expanded width of the filter sidebar in pixels */
export const SIDEBAR_WIDTH_PX = 260;

/** Tailwind z-index class for the sidebar overlay */
export const SIDEBAR_Z_INDEX = "z-40";

/** CSS transition used for sidebar open/close animation */
export const SIDEBAR_TRANSITION =
  "transition-transform duration-300 ease-in-out";

// ---------------------------------------------------------------------------
// TopBar z-index
// ---------------------------------------------------------------------------

export const TOPBAR_Z_INDEX = "z-50";

// ---------------------------------------------------------------------------
// Map layout
// ---------------------------------------------------------------------------

/** Default map height string (full viewport minus topbar) */
export const MAP_DEFAULT_HEIGHT = BELOW_TOPBAR_HEIGHT;

/**
 * Degrees of padding applied around the district bounding box for `maxBounds`.
 * This must be generous: a wide (landscape) viewport forces MapLibre to zoom IN
 * to keep the viewport inside a tight maxBounds box, which crops the taller
 * north–south extent of the district. Extra horizontal room lets the map zoom
 * out far enough to contain the whole district on initial load.
 */
export const MAP_BOUNDS_PAD_DEGREES = 2.0;

/** Minimum zoom level for the Surat district map */
export const MAP_MIN_ZOOM = 8;

/** Maximum zoom level used when fitting bounds after sidebar toggle */
export const MAP_FIT_MAX_ZOOM = 12;

/** Animation duration (ms) for map fitBounds after sidebar toggle */
export const MAP_FIT_DURATION_MS = 400;

/** Padding (px) applied inside fitBounds call */
export const MAP_FIT_PADDING_PX = 24;

/**
 * Duration (ms) to keep calling map.resize() after a sidebar animation ends.
 * Should be slightly longer than the CSS transition duration.
 */
export const MAP_RESIZE_LOOP_MS = 350;

// ---------------------------------------------------------------------------
// Geo / boundary
// ---------------------------------------------------------------------------

/** Cache lifetime for GeoJSON boundary responses (seconds) */
export const GEO_CACHE_MAX_AGE_SECONDS = 86_400; // 1 day

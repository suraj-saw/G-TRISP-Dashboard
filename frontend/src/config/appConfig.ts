// frontend/src/config/appConfig.ts
/**
 * Application-wide timing, animation, and interaction defaults.
 */

// ---------------------------------------------------------------------------
// Idle Session Monitoring
// ---------------------------------------------------------------------------

/** Default user inactivity timeout (30 minutes in milliseconds) */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;

/** Throttle duration (in milliseconds) for tracking user interaction events */
export const IDLE_EVENT_THROTTLE_MS = 1_000;

// ---------------------------------------------------------------------------
// UI Animations & Transitions
// ---------------------------------------------------------------------------

/** Default duration (in milliseconds) for numerical count-up animations */
export const DEFAULT_COUNTUP_DURATION_MS = 250;

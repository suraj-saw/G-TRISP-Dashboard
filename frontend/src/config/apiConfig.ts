// frontend/src/config/apiConfig.ts
/**
 * Centralized API endpoints and request configuration for G-TRISP frontend.
 */

// ---------------------------------------------------------------------------
// Authentication Endpoints
// ---------------------------------------------------------------------------

export const AUTH_ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  REFRESH: "/auth/refresh",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
} as const;

// ---------------------------------------------------------------------------
// Admin Endpoints
// ---------------------------------------------------------------------------

export const ADMIN_ENDPOINTS = {
  ACCIDENTS: "/admin/accidents",
  EXPORT: "/admin/accidents/export",
  IMPORT: "/admin/accidents/import",
} as const;

// ---------------------------------------------------------------------------
// Export Endpoints
// ---------------------------------------------------------------------------

export const EXPORT_ENDPOINTS = {
  CSV: "/dashboard/export/csv",
  EXCEL: "/dashboard/export/excel",
  PDF: "/dashboard/export/pdf",
  BLACKSPOT_PDF: "/dashboard/blackspots/export-pdf",
} as const;

// ---------------------------------------------------------------------------
// Default Query & Pagination Limits
// ---------------------------------------------------------------------------

/** Default max records limit when fetching admin accident entries */
export const ADMIN_ACCIDENTS_LIMIT = 10_000;

/** Default accident point fetch limit */
export const DEFAULT_ACCIDENTS_LIMIT = 5_000;

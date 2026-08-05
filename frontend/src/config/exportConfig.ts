// frontend/src/config/exportConfig.ts
/**
 * Configuration parameters for data export, PDF report generation, and canvas capture.
 */

// ---------------------------------------------------------------------------
// PDF & Image Export Settings
// ---------------------------------------------------------------------------

/** Delay (in ms) to allow charts and maps to finish rendering before DOM capture */
export const PDF_CAPTURE_TIMEOUT_MS = 500;

/** Default image export format */
export const DEFAULT_EXPORT_IMAGE_TYPE = "image/png";

/** Default canvas export quality factor */
export const DEFAULT_EXPORT_QUALITY = 0.95;

/** Scale factor for html2canvas to render high-DPI PDF reports */
export const PDF_CANVAS_SCALE = 2;

/** Prefix for exported PDF report file names */
export const REPORT_FILENAME_PREFIX = "gtrisp_report";

/**
 * Format a standardized export filename with timestamp
 * @param prefix Document type prefix
 * @param extension Target file extension (without dot)
 */
export function buildExportFilename(
  prefix: string = REPORT_FILENAME_PREFIX,
  extension: string = "pdf"
): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${prefix}_${dateStr}.${extension}`;
}

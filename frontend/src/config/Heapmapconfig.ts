// frontend/src/config/Heapmapconfig.ts
/**
 * Professional GIS heatmap visualization constants — v2 redesign.
 *
 * Goal: ArcGIS / CARTO / Mapbox-quality density rendering instead of a
 * saturated "painted blob".
 *
 * Root cause of the old blob look:
 *   - Warm colors started far too early in the ramp (teal at 0.40, yellow at
 *     0.63), so the dense urban core — where accumulated density is high
 *     everywhere — collapsed into one uniform maroon mass.
 *   - Radius shrank with zoom, which did nothing to relieve low-zoom merging.
 *
 * The three real knobs that control saturation:
 *   1. HEATMAP_RADIUS    — grows gently with zoom (Mapbox standard). Smaller
 *                          radius at low zoom keeps corridors/clusters distinct.
 *   2. HEATMAP_INTENSITY — kept low; this is the FIRST thing to lower if the
 *                          core still saturates to red on your data.
 *   3. HEATMAP_COLOR_RAMP — long cool lead-in; warm band compressed to the top
 *                          (>0.72), red reserved for genuine peaks (>0.9).
 */

// ---------------------------------------------------------------------------
// Zoom thresholds (kept for reference / external use)
// ---------------------------------------------------------------------------

export const ZOOM_HEATMAP_ONLY = 11;
export const ZOOM_POINTS_FADE_START = 12;
export const ZOOM_POINTS_FADE_END = 14;

// ---------------------------------------------------------------------------
// Heatmap radius (in screen pixels) — grows with zoom.
//
// At low zoom a small radius keeps separate corridors readable instead of
// merging the whole city. At high zoom a larger radius gives a smooth,
// continuous density field rather than disconnected dots.
// ---------------------------------------------------------------------------

export const HEATMAP_RADIUS: [number, number][] = [
  [8, 7], // district overview — tight, shows structure
  [10, 11], // city overview
  [12, 16], // neighbourhood
  [14, 22], // street
  [16, 30], // intersection — smooth field
];

// ---------------------------------------------------------------------------
// Heatmap intensity — deliberately low.
//
// Intensity multiplies accumulated density. With thousands of points, high
// intensity instantly pushes the urban core to the top color stop (red).
// Keeping it low means only genuinely dense areas climb into the warm band.
// >>> If your data still saturates to red, LOWER these numbers first. <<<
// ---------------------------------------------------------------------------

export const HEATMAP_INTENSITY: [number, number][] = [
  [8, 0.6],
  [10, 0.75],
  [12, 0.9],
  [14, 1.05],
  [16, 1.2],
];

// ---------------------------------------------------------------------------
// Heatmap opacity.
//
// Stays readable at every zoom. Unlike the old config (which faded the
// heatmap to almost nothing at street level and relied on glow circles), we
// keep a meaningful heatmap presence and layer crisp points on top.
// ---------------------------------------------------------------------------

export const HEATMAP_OPACITY: [number, number][] = [
  [8, 0.85],
  [11, 0.8],
  [13, 0.65],
  [15, 0.5],
  [16, 0.4],
];

// ---------------------------------------------------------------------------
// Graduated point layer (street-level detail) — fades in at zoom 12+.
//
// Replaces the old glow/core circle pair. These are crisp, severity-colored,
// graduated-radius points with a white halo — the standard professional way
// to show individual incidents once the user is zoomed in enough to need them.
// ---------------------------------------------------------------------------

export const POINT_OPACITY: [number, number][] = [
  [11.5, 0],
  [13, 0.55],
  [15, 0.85],
  [16, 0.95],
];

export const POINT_STROKE_OPACITY: [number, number][] = [
  [11.5, 0],
  [13, 0.5],
  [15, 0.9],
];

// Base point radius by zoom (further scaled per-point by severity weight)
export const POINT_RADIUS: [number, number][] = [
  [12, 2.5],
  [14, 5],
  [16, 8],
];

// ---------------------------------------------------------------------------
// Color ramp — general accident-density scheme.
//
// Long transparent + cool lead-in keeps low-density edges nearly invisible
// (no hard colored boundary). Warm colors are compressed into the top of the
// scale so the map reads as: blue = some activity, green/yellow = elevated,
// orange/red = true hotspot.
// ---------------------------------------------------------------------------

export const HEATMAP_COLOR_RAMP: readonly [number, string][] = [
  [0.0, "rgba(43, 91, 219, 0)"], // transparent
  [0.12, "rgba(43, 91, 219, 0)"], // feathered transparent edge
  [0.22, "rgba(43, 91, 219, 0.45)"], // royal blue — first sign of density
  [0.36, "rgba(0, 160, 214, 0.62)"], // cyan
  [0.5, "rgba(31, 184, 102, 0.72)"], // green
  [0.62, "rgba(160, 208, 40, 0.8)"], // yellow-green
  [0.72, "rgba(245, 200, 30, 0.86)"], // yellow
  [0.82, "rgba(245, 140, 30, 0.9)"], // orange
  [0.91, "rgba(232, 69, 30, 0.93)"], // red-orange — real hotspot
  [1.0, "rgba(200, 20, 20, 0.96)"], // red — peak density only
];

// Solid-color gradient (CSS) for the on-map legend bar.
export const HEATMAP_LEGEND_GRADIENT =
  "linear-gradient(to right, #2b5bdb 0%, #00a0d6 20%, #1fb866 42%, #a0d028 60%, #f5c81e 74%, #f58c1e 86%, #e8451e 94%, #c81414 100%)";

// ---------------------------------------------------------------------------
// Severity weights for the heatmap-weight expression (fatal counts more)
// ---------------------------------------------------------------------------

export const SEVERITY_HEATMAP_WEIGHTS: Record<string, number> = {
  fatal: 1.0,
  grievous: 0.7,
  minor: 0.45,
  damage: 0.25,
};

export const SEVERITY_WEIGHT_DEFAULT = 0.4;

// ---------------------------------------------------------------------------
// MapLibre expression builders
// ---------------------------------------------------------------------------

export function zoomInterpolate(pairs: [number, number][]): any[] {
  const stops = pairs.flatMap(([z, v]) => [z, v]);
  return ["interpolate", ["linear"], ["zoom"], ...stops];
}

export function buildHeatmapColorExpression(): any[] {
  const stops = HEATMAP_COLOR_RAMP.flatMap(([density, color]) => [
    density,
    color,
  ]);
  return ["interpolate", ["linear"], ["heatmap-density"], ...stops];
}

/**
 * Point radius graduated by BOTH zoom and per-point severity weight.
 * Fatal incidents render slightly larger so they read as more significant.
 */
export function buildPointRadiusExpression(): any[] {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...POINT_RADIUS.flatMap(([z, r]) => [
      z,
      [
        "*",
        r,
        [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "severity_weight"], 1],
          0.25,
          0.8,
          1.0,
          1.35,
        ],
      ],
    ]),
  ];
}

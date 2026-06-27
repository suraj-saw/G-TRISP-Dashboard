// frontend/src/config/Heapmapconfig.ts
/**
 * Heatmap visualization constants — v3
 *
 * Key changes from v2:
 *   - Radius at low zoom (8–10) reduced from 7–11px → 4–7px so the dense
 *     urban core doesn't merge into a single red blob at district overview.
 *   - Intensity lowered further at low zoom (0.35 → 0.5) so accumulated
 *     density doesn't immediately saturate the top of the color ramp.
 *   - Color ramp: transparent lead-in extended to 0.25, warm band stays
 *     compressed (orange > 0.82, red > 0.91) — unchanged from v2.
 *   - Street-level radius (zoom 14–16) kept generous (22–30px) so the
 *     density field reads smoothly at full zoom.
 */

// ---------------------------------------------------------------------------
// Zoom thresholds
// ---------------------------------------------------------------------------

export const ZOOM_HEATMAP_ONLY = 11;
export const ZOOM_POINTS_FADE_START = 12;
export const ZOOM_POINTS_FADE_END = 14;

// ---------------------------------------------------------------------------
// Heatmap radius (screen pixels) — grows with zoom.
//
// Smaller at low zoom = corridors stay distinct, blob effect avoided.
// Larger at high zoom = smooth continuous density field.
// ---------------------------------------------------------------------------

export const HEATMAP_RADIUS: [number, number][] = [
  [7, 3], // very wide view — tiny footprint, keeps hotspots distinct
  [9, 5], // district overview
  [11, 9], // city overview
  [13, 15], // neighbourhood
  [15, 22], // street
  [17, 30], // intersection — smooth field
];

// ---------------------------------------------------------------------------
// Heatmap intensity — low at overview, higher only at street level.
//
// This is the primary knob preventing the maroon-blob effect at low zoom.
// >>> Lower these values first if the core still saturates. <<<
// ---------------------------------------------------------------------------

export const HEATMAP_INTENSITY: [number, number][] = [
  [7, 0.25],
  [9, 0.4],
  [11, 0.6],
  [13, 0.8],
  [15, 1.0],
  [17, 1.2],
];

// ---------------------------------------------------------------------------
// Heatmap opacity
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

export const POINT_RADIUS: [number, number][] = [
  [12, 2.5],
  [14, 5],
  [16, 8],
];

// ---------------------------------------------------------------------------
// Color ramp — professional accident-density scheme.
//
// Long transparent + cool lead-in keeps low-density edges invisible.
// Warm colors are compressed to the very top so only genuine hotspots
// appear orange/red, not the entire urban core.
// ---------------------------------------------------------------------------

export const HEATMAP_COLOR_RAMP: readonly [number, string][] = [
  [0.0, "rgba(43, 91, 219, 0)"], // transparent
  [0.1, "rgba(43, 91, 219, 0)"], // extended feathered edge
  [0.2, "rgba(43, 91, 219, 0.35)"], // blue — first hint of density
  [0.32, "rgba(0, 160, 214, 0.55)"], // cyan
  [0.46, "rgba(31, 184, 102, 0.68)"], // green
  [0.6, "rgba(160, 208, 40, 0.78)"], // yellow-green
  [0.72, "rgba(245, 200, 30, 0.84)"], // yellow
  [0.82, "rgba(245, 140, 30, 0.90)"], // orange   ← hotspot starts here
  [0.91, "rgba(232, 69, 30, 0.94)"], // red-orange
  [1.0, "rgba(200, 20, 20, 0.97)"], // deep red ← peak density only
];

// Gradient for the on-map legend bar
export const HEATMAP_LEGEND_GRADIENT =
  "linear-gradient(to right, #2b5bdb 0%, #00a0d6 20%, #1fb866 42%, #a0d028 60%, #f5c81e 74%, #f58c1e 86%, #e8451e 94%, #c81414 100%)";

// ---------------------------------------------------------------------------
// Severity weights
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

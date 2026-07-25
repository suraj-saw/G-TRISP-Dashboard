/**
 * @file riskCorridorConfig.ts
 * @description Configuration for Risk Corridor visualization symbology, styling, and priority levels.
 */

export const CORRIDOR_PRIORITY_LEVELS = [
  "Critical",
  "Very High",
  "High",
  "Medium",
  "Low",
] as const;

export type CorridorPriorityLevel = (typeof CORRIDOR_PRIORITY_LEVELS)[number];

export const CORRIDOR_COLORS: Record<CorridorPriorityLevel, string> = {
  Critical: "#FF0033",  // Electric Vivid Red / Crimson
  "Very High": "#FF6A00", // Vivid Safety Orange
  High: "#A855F7",      // Vivid Electric Purple
  Medium: "#0099FF",    // Vivid Dodger Blue
  Low: "#00E676",       // Vivid Emerald Green
};

export const CORRIDOR_OPACITIES: Record<CorridorPriorityLevel, number> = {
  Critical: 1.0,
  "Very High": 0.95,
  High: 0.9,
  Medium: 0.85,
  Low: 0.8,
};

// Controls the zoom level at which each priority tier begins to appear (kept at 0 for all since zoom reveal is disabled).
export const CORRIDOR_ZOOM_THRESHOLDS: Record<CorridorPriorityLevel, number> = {
  Critical: 0,
  "Very High": 0,
  High: 0,
  Medium: 0,
  Low: 0,
};

/**
 * Generates a MapLibre expression for corridor line colors based on priority_level.
 */
export const CORRIDOR_COLOR_EXPR = [
  "match",
  ["get", "priority_level"],
  "Critical", CORRIDOR_COLORS.Critical,
  "Very High", CORRIDOR_COLORS["Very High"],
  "High", CORRIDOR_COLORS.High,
  "Medium", CORRIDOR_COLORS.Medium,
  "Low", CORRIDOR_COLORS.Low,
  "#000000", // Fallback
];

/**
 * Generates a MapLibre expression for base line opacity.
 * All corridors are now shown at all zoom levels without zoom-step revealing.
 */
export const getCorridorOpacityExpr = (activeCorridorId: string | null) => {
  if (activeCorridorId) {
    return [
      "case",
      ["==", ["get", "corridor_id"], activeCorridorId],
      1.0, // Highlighted
      0.25 // Faded out
    ];
  }

  return [
    "match",
    ["get", "priority_level"],
    "Critical", CORRIDOR_OPACITIES.Critical,
    "Very High", CORRIDOR_OPACITIES["Very High"],
    "High", CORRIDOR_OPACITIES.High,
    "Medium", CORRIDOR_OPACITIES.Medium,
    "Low", CORRIDOR_OPACITIES.Low,
    0.8, // Fallback
  ];
};

/**
 * Generates MapLibre background casing opacity.
 */
export const getCorridorBgOpacityExpr = (activeCorridorId: string | null) => {
  if (!activeCorridorId) return 0.85; // Strong white halo by default
  return [
    "case",
    ["==", ["get", "corridor_id"], activeCorridorId],
    1.0, // Highlighted
    0.3  // Faded
  ];
};

/**
 * Generates MapLibre line-width interpolation.
 * Thickness scales with zoom and priority.
 */
export const getCorridorWidthExpr = (activeCorridorId: string | null, isBg: boolean = false) => {
  const getWidth = (baseWidth: number) => {
    let width = baseWidth;
    if (isBg) width += 3; // Crisp 1.5px white halo on each side
    if (!activeCorridorId) return width;
    
    return [
      "case",
      ["==", ["get", "corridor_id"], activeCorridorId],
      width + 2,
      width
    ];
  };

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    // At zoom 10 (zoomed out)
    10,
    [
      "match",
      ["get", "priority_level"],
      "Critical", getWidth(6),
      "Very High", getWidth(5),
      "High", getWidth(4),
      "Medium", getWidth(3.5),
      "Low", getWidth(3),
      getWidth(2),
    ],
    // At zoom 15 (zoomed in)
    15,
    [
      "match",
      ["get", "priority_level"],
      "Critical", getWidth(12),
      "Very High", getWidth(10),
      "High", getWidth(8),
      "Medium", getWidth(6.5),
      "Low", getWidth(5),
      getWidth(3),
    ]
  ];
};

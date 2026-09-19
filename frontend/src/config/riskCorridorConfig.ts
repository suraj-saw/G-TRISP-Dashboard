/**
 * @file riskCorridorConfig.ts
 * @description Configuration for Risk Corridor visualization symbology, styling, and 3-tier priority levels.
 */

export const CORRIDOR_PRIORITY_LEVELS = [
  "Critical Blackspot",
  "High-Priority",
  "Moderate-Priority",
] as const;

export type CorridorPriorityLevel = (typeof CORRIDOR_PRIORITY_LEVELS)[number];

export const CORRIDOR_COLORS: Record<CorridorPriorityLevel, string> = {
  "Critical Blackspot": "#78350F", // Deep Brown
  "High-Priority": "#EA580C",      // Vivid Orange
  "Moderate-Priority": "#EAB308",  // Golden Yellow
};

export const CORRIDOR_OPACITIES: Record<CorridorPriorityLevel, number> = {
  "Critical Blackspot": 1.0,
  "High-Priority": 0.95,
  "Moderate-Priority": 0.9,
};

// Controls the zoom level at which each priority tier begins to appear (kept at 0 for all since zoom reveal is disabled).
export const CORRIDOR_ZOOM_THRESHOLDS: Record<CorridorPriorityLevel, number> = {
  "Critical Blackspot": 0,
  "High-Priority": 0,
  "Moderate-Priority": 0,
};

/**
 * Generates a MapLibre expression for corridor line colors based on priority_level.
 */
export const CORRIDOR_COLOR_EXPR = [
  "match",
  ["get", "priority_level"],
  "Critical Blackspot", CORRIDOR_COLORS["Critical Blackspot"],
  "High-Priority", CORRIDOR_COLORS["High-Priority"],
  "High Priority", CORRIDOR_COLORS["High-Priority"],
  "Moderate-Priority", CORRIDOR_COLORS["Moderate-Priority"],
  "Moderate Priority", CORRIDOR_COLORS["Moderate-Priority"],
  "#EAB308", // Fallback (Yellow)
];

/**
 * Generates a MapLibre expression for base line opacity.
 * All corridors are shown at all zoom levels without zoom-step revealing.
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
    "Critical Blackspot", CORRIDOR_OPACITIES["Critical Blackspot"],
    "High-Priority", CORRIDOR_OPACITIES["High-Priority"],
    "High Priority", CORRIDOR_OPACITIES["High-Priority"],
    "Moderate-Priority", CORRIDOR_OPACITIES["Moderate-Priority"],
    "Moderate Priority", CORRIDOR_OPACITIES["Moderate-Priority"],
    0.9, // Fallback
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
    if (isBg) width += 3; // Crisp 1.5px halo on each side
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
      "Critical Blackspot", getWidth(6),
      "High-Priority", getWidth(4.5),
      "High Priority", getWidth(4.5),
      "Moderate-Priority", getWidth(3),
      "Moderate Priority", getWidth(3),
      getWidth(3),
    ],
    // At zoom 15 (zoomed in)
    15,
    [
      "match",
      ["get", "priority_level"],
      "Critical Blackspot", getWidth(12),
      "High-Priority", getWidth(8.5),
      "High Priority", getWidth(8.5),
      "Moderate-Priority", getWidth(5.5),
      "Moderate Priority", getWidth(5.5),
      getWidth(5),
    ]
  ];
};

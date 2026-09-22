/**
 * @file segmentBlackspotConfig.ts
 * @description Configuration for Segment Blackspots visualization symbology, styling, and 3-tier priority levels.
 */

export const SEGMENT_PRIORITY_LEVELS = [
  "Critical Blackspot",
  "High-Priority",
  "Moderate-Priority",
] as const;

export type SegmentPriorityLevel = (typeof SEGMENT_PRIORITY_LEVELS)[number];

export const SEGMENT_BLACKSPOT_COLORS: Record<SegmentPriorityLevel, string> = {
  "Critical Blackspot": "#78350F", // Deep Brown
  "High-Priority": "#EA580C",      // Vivid Orange
  "Moderate-Priority": "#EAB308",  // Golden Yellow
};

export const SEGMENT_BLACKSPOT_OPACITIES: Record<SegmentPriorityLevel, number> = {
  "Critical Blackspot": 1.0,
  "High-Priority": 0.95,
  "Moderate-Priority": 0.9,
};

// Controls the zoom level at which each priority tier begins to appear (kept at 0 for all since zoom reveal is disabled).
export const SEGMENT_BLACKSPOT_ZOOM_THRESHOLDS: Record<SegmentPriorityLevel, number> = {
  "Critical Blackspot": 0,
  "High-Priority": 0,
  "Moderate-Priority": 0,
};

/**
 * Generates a MapLibre expression for segment blackspot line colors based on priority_level.
 */
export const SEGMENT_BLACKSPOT_COLOR_EXPR = [
  "match",
  ["get", "priority_level"],
  "Critical Blackspot", SEGMENT_BLACKSPOT_COLORS["Critical Blackspot"],
  "High-Priority", SEGMENT_BLACKSPOT_COLORS["High-Priority"],
  "High Priority", SEGMENT_BLACKSPOT_COLORS["High-Priority"],
  "Moderate-Priority", SEGMENT_BLACKSPOT_COLORS["Moderate-Priority"],
  "Moderate Priority", SEGMENT_BLACKSPOT_COLORS["Moderate-Priority"],
  "#EAB308", // Fallback (Yellow)
];

/**
 * Generates a MapLibre expression for base line opacity.
 * All segment blackspots are shown at all zoom levels without zoom-step revealing.
 */
export const getSegmentBlackspotOpacityExpr = (activeSegmentId: string | null) => {
  if (activeSegmentId) {
    return [
      "case",
      [
        "any",
        ["==", ["coalesce", ["get", "segment_id"], ""], activeSegmentId],
        ["==", ["coalesce", ["get", "corridor_id"], ""], activeSegmentId],
      ],
      1.0, // Highlighted
      0.25 // Faded out
    ];
  }

  return [
    "match",
    ["get", "priority_level"],
    "Critical Blackspot", SEGMENT_BLACKSPOT_OPACITIES["Critical Blackspot"],
    "High-Priority", SEGMENT_BLACKSPOT_OPACITIES["High-Priority"],
    "High Priority", SEGMENT_BLACKSPOT_OPACITIES["High-Priority"],
    "Moderate-Priority", SEGMENT_BLACKSPOT_OPACITIES["Moderate-Priority"],
    "Moderate Priority", SEGMENT_BLACKSPOT_OPACITIES["Moderate-Priority"],
    0.9, // Fallback
  ];
};

/**
 * Generates MapLibre background casing opacity.
 */
export const getSegmentBlackspotBgOpacityExpr = (activeSegmentId: string | null) => {
  if (!activeSegmentId) return 0.85; // Strong white halo by default
  return [
    "case",
    [
      "any",
      ["==", ["coalesce", ["get", "segment_id"], ""], activeSegmentId],
      ["==", ["coalesce", ["get", "corridor_id"], ""], activeSegmentId],
    ],
    1.0, // Highlighted
    0.3  // Faded
  ];
};

/**
 * Generates MapLibre line-width interpolation.
 * Thickness scales with zoom and priority.
 */
export const getSegmentBlackspotWidthExpr = (activeSegmentId: string | null, isBg: boolean = false) => {
  const getWidth = (baseWidth: number) => {
    let width = baseWidth;
    if (isBg) width += 3; // Crisp 1.5px halo on each side
    if (!activeSegmentId) return width;
    
    return [
      "case",
      [
        "any",
        ["==", ["coalesce", ["get", "segment_id"], ""], activeSegmentId],
        ["==", ["coalesce", ["get", "corridor_id"], ""], activeSegmentId],
      ],
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

// Backward compatibility aliases
export const CORRIDOR_PRIORITY_LEVELS = SEGMENT_PRIORITY_LEVELS;
export type CorridorPriorityLevel = SegmentPriorityLevel;
export const CORRIDOR_COLORS = SEGMENT_BLACKSPOT_COLORS;
export const CORRIDOR_OPACITIES = SEGMENT_BLACKSPOT_OPACITIES;
export const CORRIDOR_ZOOM_THRESHOLDS = SEGMENT_BLACKSPOT_ZOOM_THRESHOLDS;
export const CORRIDOR_COLOR_EXPR = SEGMENT_BLACKSPOT_COLOR_EXPR;
export const getCorridorOpacityExpr = getSegmentBlackspotOpacityExpr;
export const getCorridorBgOpacityExpr = getSegmentBlackspotBgOpacityExpr;
export const getCorridorWidthExpr = getSegmentBlackspotWidthExpr;

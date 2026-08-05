# backend/app/core/gis_config.py
"""
Configuration parameters for spatial analysis, GIS algorithms, blackspot detection,
KDE density maps, and risk corridor evaluations.
"""

# ---------------------------------------------------------------------------
# MoRTH Blackspot Detection (Greedy & DBSCAN)
# ---------------------------------------------------------------------------

# Search radius in meters for grouping adjacent crashes into a blackspot
BLACKSPOT_RADIUS_METERS: float = 250.0

# Minimum qualifying crashes required to form a MoRTH blackspot
BLACKSPOT_MIN_CRASHES: int = 5

# Minimum qualifying pedestrian crashes required to form a pedestrian blackspot
PEDESTRIAN_BLACKSPOT_MIN_CRASHES: int = 5

# Minimum historical years required for statistical blackspot qualification
MIN_ANALYSIS_YEARS: int = 3

# ---------------------------------------------------------------------------
# Priority Score Weights (MoRTH Severity Weighting)
# Priority Score = (fatal * 10) + (grievous * 5) + (minor_hosp * 3) + 
#                  (minor_non_hosp * 2) + (no_injury * 1) + (damage_only * 0)
# ---------------------------------------------------------------------------

PRIORITY_WEIGHT_FATAL: int = 10
PRIORITY_WEIGHT_GRIEVOUS: int = 5
PRIORITY_WEIGHT_MINOR_HOSP: int = 3
PRIORITY_WEIGHT_MINOR_NON_HOSP: int = 2
PRIORITY_WEIGHT_NO_INJURY: int = 1
PRIORITY_WEIGHT_DAMAGE_ONLY: int = 0

SEVERITY_PRIORITY_WEIGHTS = {
    "Fatal": PRIORITY_WEIGHT_FATAL,
    "Grievous Injury": PRIORITY_WEIGHT_GRIEVOUS,
    "Minor Injury Hospitalized": PRIORITY_WEIGHT_MINOR_HOSP,
    "Minor Injury Non Hospitalized": PRIORITY_WEIGHT_MINOR_NON_HOSP,
    "No Injury": PRIORITY_WEIGHT_NO_INJURY,
    "Damage Only": PRIORITY_WEIGHT_DAMAGE_ONLY,
}

# ---------------------------------------------------------------------------
# IRC 131 Blackspot Priority Multipliers (AATC Method)
# ---------------------------------------------------------------------------

IRC_CAT_1_MULTIPLIER: float = 15.0  # Category 1 (Red)
IRC_CAT_2_MULTIPLIER: float = 10.0  # Category 2 (Orange)
IRC_CAT_3_MULTIPLIER: float = 5.0   # Category 3 (Yellow)
IRC_CAT_4_MULTIPLIER: float = 3.0   # Category 4 (Green)

# ---------------------------------------------------------------------------
# Kernel Density Estimation (KDE) Heatmap Parameters
# ---------------------------------------------------------------------------

# Bandwidth search radius (meters) for quartic KDE calculation
KDE_RADIUS_METERS: float = 500.0

# Grid cell size (meters) for spatial density evaluation
KDE_PIXEL_METERS: float = 25.0

# ---------------------------------------------------------------------------
# Risk Corridor Evaluation
# ---------------------------------------------------------------------------

# Default maximum gap distance (meters) to merge adjacent blackspot segments
CORRIDOR_MERGE_THRESHOLD_M: float = 100.0

# Score thresholds for categorizing corridor risk priority tiers
CORRIDOR_PRIORITY_THRESHOLDS = {
    "Critical": 250,
    "Very High": 150,
    "High": 100,
    "Medium": 50,
    "Low": 0,
}

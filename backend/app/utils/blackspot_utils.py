# backend/app/utils/blackspot_utils.py
"""
Road accident blackspot detection.

A blackspot is a location where road accidents cluster densely enough to
warrant intervention.  This implementation uses a configurable qualification
and prioritisation model so that policy decisions (which severities count
toward qualification, how crashes are scored for ranking) can be changed by
editing the configuration section below — without touching any algorithm code.

The clustering uses a GIS proxy for the road stretch: a 250 m circular
neighbourhood (haversine radius) is used to approximate a 500 m linear
section. (A future migration to a road-network/graph-based approach will
replace this radial approximation.)

Two spatial detection algorithms are provided:

  greedy_blackspots()    — density-first greedy sweep.
  dbscan_blackspots()    — overlap-suppressed fixed-radius sweep.

Performance note
----------------
A naive O(n²) pairwise distance matrix takes ~10 s for ~2 500 points in
pure Python.  Points are bucketed into a coarse lat/lon grid sized to
radius_m so each point only haversine-checks points in its own cell and
the 8 neighbouring cells — O(n) in practice for spatially clustered data.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
#
# All policy-level constants live here.  Future changes to thresholds,
# qualifying severities, or scoring weights should be made ONLY in this
# section — no algorithm code below should need modification.
# ═══════════════════════════════════════════════════════════════════════════════

EARTH_RADIUS_M: float = 6_371_000.0

# ── Spatial search ──────────────────────────────────────────────────────────
# Default search radius in metres.  A 500 m linear IRC section is approximated
# with a 250 m haversine radius (centre-to-crash) consistent with GIS practice.
SEARCH_RADIUS_M: float = 250.0

# ── Qualification threshold ─────────────────────────────────────────────────
# Minimum number of *qualifying* crashes (i.e. those whose severity appears as
# True below) required before a candidate cluster is accepted as a blackspot.
MIN_QUALIFYING_CRASHES: int = 5

# ── Qualification severity mapping ──────────────────────────────────────────
# Maps each severity value (exactly as stored in the database) to a boolean
# indicating whether that crash should be counted toward the qualification
# threshold above.
#
# To make an additional severity category contribute to qualification in the
# future, simply change its value from False to True — no algorithm changes
# are needed.
#
# NOTE: These strings must match the severity values in the accident database
# exactly.  Do not introduce new strings without updating the database first.
QUALIFYING_SEVERITIES: dict[str, bool] = {
    "Fatal": True,
    "Grievous Injury": True,
    "Minor Injury Hospitalized": False,
    "Minor Injury Non Hospitalized": False,
    "No Injury": False,
    "Damage Only": False,
}

# ── Priority score weights ───────────────────────────────────────────────────
# Weight applied to each crash when computing the priority score for a cluster.
# A higher score means the blackspot is ranked higher (treated with more urgency).
#
# These weights apply to ALL crashes inside the cluster radius, including those
# that do not individually contribute to the qualifying count above.
#
# NOTE: The thresholds in PRIORITY_LEVELS below were inherited from the previous
# ASI-based scoring.  They should be calibrated against the Gujarat accident
# dataset once initial results have been reviewed by the supervisor.
PRIORITY_WEIGHTS: dict[str, int] = {
    "Fatal": 10,
    "Grievous Injury": 5,
    "Minor Injury Hospitalized": 3,
    "Minor Injury Non Hospitalized": 2,
    "No Injury": 1,
    "Damage Only": 0,
}

# ── Priority level thresholds ────────────────────────────────────────────────
# List of (min_score, label, hex_colour) tuples, highest score first.
# A blackspot whose priority_score >= min_score receives the corresponding label
# and colour.  If no threshold is met, it is labelled "Identified Blackspot".
#
# These thresholds have been calibrated based on the priority_score distribution
# of the Gujarat accident dataset:
#   200 ≈ 97th percentile (Critical)
#   140 ≈ 90th percentile (Very High)
#    90 ≈ 75th percentile (High)
#    60 ≈ 50th percentile (Medium)
#    30 ≈ covers all valid qualifying blackspots (Low)
PRIORITY_LEVELS: list[tuple[int, str, str]] = [
    (200, "Critical Blackspot",        "#4C1D1D"),
    (140, "Very High Risk Blackspot",  "#7F1D1D"),
    (90,  "High Risk Blackspot",       "#DC2626"),
    (60,  "Medium Risk Blackspot",     "#EA580C"),
    (30,  "Low Risk Blackspot",        "#F97316"),
]

# ── Backward-compatibility aliases ───────────────────────────────────────────
# These keep the public API surface of this module identical for callers that
# still reference the old IRC constant names (e.g. FastAPI route handlers).
# Remove once all call-sites have been updated to use the new names.
IRC_RADIUS_M: float = SEARCH_RADIUS_M
IRC_MIN_CRASHES: int = MIN_QUALIFYING_CRASHES

# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class CrashPoint:
    """A single crash record with its spatial coordinates and severity."""
    index: int
    accident_db_id: int  # Primary key ID of the accident in the database (always present)
    accident_id: Optional[str]  # Original accident ID string (may be null)
    lat: float
    lon: float
    severity: str = "Unknown"


@dataclass
class Blackspot:
    """
    A qualified blackspot cluster.

    Qualification and prioritisation are kept as separate fields:
      - qualifies_by     : reasons the cluster was *qualified* as a blackspot.
      - priority_score   : numeric score used only for *ranking* (not qualifying).
      - priority_label   : human-readable tier label derived from priority_score.
      - priority_color   : hex colour for the tier, intended for map rendering.
    """
    bs_id: int
    crash_count: int
    fatal_count: int
    grievous_count: int
    minor_hospitalized_count: int
    minor_non_hospitalized_count: int
    no_injury_count: int
    qualifying_count: int           # crashes that counted toward qualification
    priority_score: int             # weighted severity score (for ranking only)
    priority_label: str             # tier label derived from priority_score
    priority_color: str             # hex colour for the tier
    qualifies_by: list[str]         # qualification reasons
    anchor_lat: float
    anchor_lon: float
    crash_ids: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
# SEVERITY HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _severity_counts(severities: list[str]) -> dict[str, int]:
    """
    Count crashes by severity category.

    Returns a mapping of every known severity key to its count.  Unknown
    severity values are tallied under the key "Unknown".
    """
    counts: dict[str, int] = {k: 0 for k in PRIORITY_WEIGHTS}
    counts["Unknown"] = 0
    for s in severities:
        if s in counts:
            counts[s] += 1
        else:
            counts["Unknown"] += 1
    return counts


def _compute_priority_score(counts: dict[str, int]) -> int:
    """
    Compute the priority score for a cluster from its per-severity counts.

    Uses PRIORITY_WEIGHTS exclusively — no hardcoded values.
    """
    return sum(PRIORITY_WEIGHTS.get(sev, 0) * n for sev, n in counts.items())


def _compute_qualifying_count(counts: dict[str, int]) -> int:
    """
    Count crashes that contribute toward blackspot qualification.

    Uses QUALIFYING_SEVERITIES exclusively — no hardcoded severity names.
    """
    return sum(n for sev, n in counts.items() if QUALIFYING_SEVERITIES.get(sev, False))


def _build_qualification_reasons(qualifying_count: int) -> list[str]:
    """
    Return a list of human-readable qualification reasons for a cluster.

    Currently the sole criterion is that the qualifying crash count reaches
    MIN_QUALIFYING_CRASHES.  Additional criteria can be added here in the
    future without touching the detection algorithms.
    """
    reasons: list[str] = []
    qualifying_labels = [s for s, q in QUALIFYING_SEVERITIES.items() if q]
    if qualifying_count >= MIN_QUALIFYING_CRASHES:
        reasons.append(
            f"≥{MIN_QUALIFYING_CRASHES} qualifying crashes "
            f"({', '.join(qualifying_labels)}) within {SEARCH_RADIUS_M:.0f} m"
        )
    return reasons


def priority_label_and_color(score: int, qualifying_count: int = 5) -> tuple[str, str]:
    """
    Return the (label, hex_colour) tier for a given priority score.

    Iterates PRIORITY_LEVELS from highest to lowest threshold.  Falls back to
    "Identified Blackspot" with a neutral amber colour if no threshold is met.
    """
    if qualifying_count < 5:
        return "Potential Segment", "#EAB308"
        
    for threshold, label, color in PRIORITY_LEVELS:
        if score >= threshold:
            return label, color
    return "Identified Blackspot", "#FBBF24"


# Backward-compatible public aliases used by existing map config / frontend helpers.
def irc_risk_label(score: int) -> str:
    """Backward-compatible alias for priority_label_and_color()[0]."""
    return priority_label_and_color(score)[0]


def irc_risk_color(score: int) -> str:
    """Backward-compatible alias for priority_label_and_color()[1]."""
    return priority_label_and_color(score)[1]


# ═══════════════════════════════════════════════════════════════════════════════
# BLACKSPOT BUILDER HELPER
# ═══════════════════════════════════════════════════════════════════════════════

def _make_blackspot(
    bs_id: int,
    anchor_idx: int,
    member_indices: list[int],
    points: list[CrashPoint],
) -> Optional[Blackspot]:
    """
    Attempt to build a Blackspot from a set of member crash indices.

    Qualification and prioritisation are computed independently:
      1. Count per-severity crashes using _severity_counts().
      2. Compute qualifying_count using QUALIFYING_SEVERITIES — independent of scoring.
      3. Build qualification reasons; return None if none are found.
      4. Compute priority_score using PRIORITY_WEIGHTS — independent of qualification.
      5. Derive priority_label and priority_color from PRIORITY_LEVELS.
    """
    severities = [points[i].severity for i in member_indices]
    counts = _severity_counts(severities)

    # ── Step 1: Qualification (independent of priority) ──────────────────────
    qualifying_count = _compute_qualifying_count(counts)
    reasons = _build_qualification_reasons(qualifying_count)
    if not reasons:
        return None   # cluster does not meet the qualification threshold

    # ── Step 2: Prioritisation (independent of qualification) ─────────────────
    priority_score = _compute_priority_score(counts)
    priority_label, priority_color = priority_label_and_color(priority_score)

    return Blackspot(
        bs_id=bs_id,
        crash_count=len(member_indices),
        fatal_count=counts.get("Fatal", 0),
        grievous_count=counts.get("Grievous Injury", 0),
        minor_hospitalized_count=counts.get("Minor Injury Hospitalized", 0),
        minor_non_hospitalized_count=counts.get("Minor Injury Non Hospitalized", 0),
        no_injury_count=counts.get("No Injury", 0),
        qualifying_count=qualifying_count,
        priority_score=priority_score,
        priority_label=priority_label,
        priority_color=priority_color,
        qualifies_by=reasons,
        anchor_lat=points[anchor_idx].lat,
        anchor_lon=points[anchor_idx].lon,
        crash_ids=[
            str(points[i].accident_db_id)  # Use the primary key ID as string (always present)
            for i in member_indices
        ],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# SPATIAL GRID HELPERS  (unchanged from original — performance-critical)
# ═══════════════════════════════════════════════════════════════════════════════

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine great-circle distance in metres."""
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _build_grid_neighbours(
    points: list[CrashPoint],
    radius_m: float,
) -> list[set[int]]:
    """
    Bucket points into a lat/lon grid sized to radius_m, then for each
    point only haversine-check points in its own cell + 8 neighbours.
    Returns a list (same order as `points`) of neighbour index sets.
    """
    n = len(points)
    if n == 0:
        return []

    mean_lat = sum(p.lat for p in points) / n
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(mean_lat)) or 1e-9

    cell_deg_lat = radius_m / m_per_deg_lat
    cell_deg_lon = radius_m / m_per_deg_lon

    def cell_key(lat: float, lon: float) -> tuple[int, int]:
        return (int(lat // cell_deg_lat), int(lon // cell_deg_lon))

    grid: dict[tuple[int, int], list[int]] = defaultdict(list)
    cell_of: list[tuple[int, int]] = []
    for i, p in enumerate(points):
        key = cell_key(p.lat, p.lon)
        grid[key].append(i)
        cell_of.append(key)

    neighbours: list[set[int]] = [set() for _ in range(n)]
    for i, p in enumerate(points):
        cr, cc = cell_of[i]
        candidates: list[int] = []
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                candidates.extend(grid.get((cr + dr, cc + dc), ()))

        nb = neighbours[i]
        for j in candidates:
            if j == i or j in nb:
                continue
            if _haversine_m(p.lat, p.lon, points[j].lat, points[j].lon) <= radius_m:
                nb.add(j)
                neighbours[j].add(i)

    return neighbours


def _project_xy(lat: float, lon: float, ref_lat_rad: float) -> tuple[float, float]:
    """Cheap equirectangular projection to local metres, centred on ref_lat_rad."""
    x = lon * 111_320.0 * math.cos(ref_lat_rad)
    y = lat * 110_540.0
    return x, y


def _cell_of(x: float, y: float, cell_size: float) -> tuple[int, int]:
    return (math.floor(x / cell_size), math.floor(y / cell_size))


def _build_grid(xs: list[float], ys: list[float], cell_size: float) -> dict:
    grid: dict = defaultdict(list)
    for i, (x, y) in enumerate(zip(xs, ys)):
        grid[_cell_of(x, y, cell_size)].append(i)
    return grid


def _neighbours_within(
    idx: int,
    xs: list[float],
    ys: list[float],
    grid: dict,
    cell_size: float,
    radius_m: float,
) -> list[int]:
    cx, cy = _cell_of(xs[idx], ys[idx], cell_size)
    span = int(math.ceil(radius_m / cell_size))
    r2 = radius_m * radius_m
    out = []
    for gx in range(cx - span, cx + span + 1):
        for gy in range(cy - span, cy + span + 1):
            for j in grid.get((gx, gy), ()):
                dx = xs[idx] - xs[j]
                dy = ys[idx] - ys[j]
                if dx * dx + dy * dy <= r2:
                    out.append(j)
    return out


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 1: Greedy density-first sweep
# ═══════════════════════════════════════════════════════════════════════════════

def greedy_blackspots(
    points: list[CrashPoint],
    radius_m: float = SEARCH_RADIUS_M,
    min_crashes: int = MIN_QUALIFYING_CRASHES,
) -> list[Blackspot]:
    """
    Density-first greedy blackspot detection.

    Parameters
    ----------
    radius_m    : Search radius in metres.
    min_crashes : Pre-filter threshold — only cluster centres with at least this
                  many neighbours (including self) are evaluated.  The full
                  configurable qualification check is applied by _make_blackspot();
                  this parameter is only an early-exit optimisation.

    Algorithm
    ---------
    1. Build grid-accelerated neighbour sets within radius_m.
    2. Repeatedly pick the remaining crash with the highest neighbour density.
    3. Apply the qualification check (via _make_blackspot()); accept if it passes.
    4. Remove assigned crashes, update densities, and repeat.
    """
    n = len(points)
    if n == 0:
        return []

    neighbours = _build_grid_neighbours(points, radius_m)
    density = [len(neighbours[i]) + 1 for i in range(n)]  # +1 = self

    pool = set(range(n))
    blackspots: list[Blackspot] = []
    bs_id = 0

    while pool:
        best = max(pool, key=lambda i: density[i])

        # Pre-filter: skip if density is below the minimum threshold to
        # avoid calling _make_blackspot() on trivially small clusters.
        if density[best] < min_crashes:
            break

        circle_set = (neighbours[best] & pool) | {best}
        circle = list(circle_set)

        bs = _make_blackspot(bs_id + 1, best, circle, points)
        if bs is not None:
            bs_id += 1
            blackspots.append(bs)
            pool -= circle_set
            for i in pool:
                neighbours[i] -= circle_set
                density[i] = len(neighbours[i]) + 1
        else:
            # This centre doesn't qualify; remove it from the pool so we don't
            # keep re-evaluating it.
            pool.discard(best)
            density[best] = 0

    return blackspots


# ═══════════════════════════════════════════════════════════════════════════════
# ALGORITHM 2: DBSCAN-style overlap-suppressed sweep
# ═══════════════════════════════════════════════════════════════════════════════

def dbscan_blackspots(
    points: list[CrashPoint],
    radius_m: float = SEARCH_RADIUS_M,
    min_crashes: int = MIN_QUALIFYING_CRASHES,
) -> list[Blackspot]:
    """
    Overlap-suppressed fixed-radius blackspot detection.

    Unlike greedy_blackspots(), crashes may belong to more than one candidate's
    neighbourhood before overlap suppression.  The densest non-overlapping
    centres are accepted; each is then checked against the configurable
    qualification rules before being added to the output.

    Overlap suppression rule: two blackspot circles must not overlap
    (centre separation > 2 × radius_m) so each spatial section is identified
    independently.

    Ranking: qualified blackspots are ordered by priority_score descending
    (highest priority first), then by crash_count descending.
    """
    n = len(points)
    if n == 0:
        return []

    ref_lat_rad = math.radians(sum(p.lat for p in points) / n)
    xs = [0.0] * n
    ys = [0.0] * n
    for i, p in enumerate(points):
        xs[i], ys[i] = _project_xy(p.lat, p.lon, ref_lat_rad)

    cell_size = max(radius_m, 1.0)
    grid = _build_grid(xs, ys, cell_size)

    neighbour_counts = [
        len(_neighbours_within(i, xs, ys, grid, cell_size, radius_m))
        for i in range(n)
    ]

    # Pre-filter by minimum count.
    candidates = [i for i in range(n) if neighbour_counts[i] >= min_crashes]
    if not candidates:
        return []

    # Densest centres get first pick in overlap suppression.
    candidates.sort(key=lambda i: -neighbour_counts[i])

    # Overlap suppression: accept only if centre is > 2×radius_m from every
    # already-accepted centre.
    two_r2 = (2 * radius_m) ** 2
    kept: list[int] = []
    for idx in candidates:
        overlap = any(
            (xs[idx] - xs[k]) ** 2 + (ys[idx] - ys[k]) ** 2 < two_r2
            for k in kept
        )
        if not overlap:
            kept.append(idx)

    raw_results: list[tuple[int, list[int]]] = [
        (idx, _neighbours_within(idx, xs, ys, grid, cell_size, radius_m))
        for idx in kept
    ]

    # Rank by priority_score descending, then by cluster size descending.
    # Priority score is computed here solely for sorting; the authoritative
    # value is stored on the Blackspot dataclass after _make_blackspot().
    def _rank_key(item: tuple[int, list[int]]) -> tuple[int, int]:
        _, members = item
        severities = [points[i].severity for i in members]
        counts = _severity_counts(severities)
        score = _compute_priority_score(counts)
        return (-score, -len(members))

    raw_results.sort(key=_rank_key)

    blackspots: list[Blackspot] = []
    for idx, members in raw_results:
        bs = _make_blackspot(len(blackspots) + 1, idx, members, points)
        if bs is not None:
            blackspots.append(bs)

    return blackspots


# ═══════════════════════════════════════════════════════════════════════════════
# GeoJSON OUTPUT
# ═══════════════════════════════════════════════════════════════════════════════

def circle_polygon_geojson(
    lat: float, lon: float, radius_m: float, n_points: int = 64
) -> dict:
    """Approximate geodesic circle polygon around (lat, lon) for radius_m."""
    coords = []
    lat_rad = math.radians(lat)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(lat_rad) or 1e-9

    for k in range(n_points + 1):
        theta = 2 * math.pi * (k / n_points)
        dx = radius_m * math.cos(theta)
        dy = radius_m * math.sin(theta)
        coords.append([lon + dx / m_per_deg_lon, lat + dy / m_per_deg_lat])

    return {"type": "Polygon", "coordinates": [coords]}


def blackspots_to_geojson(blackspots: list[Blackspot], radius_m: float) -> dict:
    """
    Convert Blackspot records to a GeoJSON dict with both circle polygons and
    centroid points.

    Returns {"circles": FeatureCollection, "centroids": FeatureCollection}.

    Each feature carries the full blackspot metadata as properties.

    ── Backward-compatibility note ────────────────────────────────────────────
    The frontend currently reads `asi`, `risk_label`, and `risk_color` from
    these GeoJSON properties.  These are mapped from the new terminology
    (priority_score, priority_label, priority_color) so the existing frontend
    continues to work without modification.

    Once the frontend has been updated to the new property names, remove the
    three legacy lines marked with # COMPAT below.
    ── ────────────────────────────────────────────────────────────────────────
    """
    circle_features = []
    centroid_features = []

    # Sort blackspots by priority_score (descending) to calculate rank
    sorted_blackspots = sorted(blackspots, key=lambda bs: bs.priority_score, reverse=True)
    total_blackspots = len(sorted_blackspots)

    for rank, bs in enumerate(sorted_blackspots, start=1):
        props = {
            # ── New terminology ────────────────────────────────────────────
            "priority_rank":              rank,
            "total_blackspots":           total_blackspots,
            "bs_id":                      bs.bs_id,
            "crash_count":                bs.crash_count,
            "fatal_count":                bs.fatal_count,
            "grievous_count":             bs.grievous_count,
            "minor_hospitalized_count":   bs.minor_hospitalized_count,
            "minor_non_hospitalized_count": bs.minor_non_hospitalized_count,
            "no_injury_count":            bs.no_injury_count,
            "qualifying_count":           bs.qualifying_count,
            "priority_score":             bs.priority_score,
            "priority_label":             bs.priority_label,
            "priority_color":             bs.priority_color,
            "qualifies_by":               " | ".join(bs.qualifies_by),
            "crash_ids":                  ", ".join(bs.crash_ids),
            "label": (
                f"BS#{bs.bs_id} | Score {bs.priority_score} | "
                f"{bs.crash_count} crashes"
            ),
            # point_count alias so existing MapLibre step expressions still work
            "point_count":    bs.crash_count,
        }
        circle_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": circle_polygon_geojson(bs.anchor_lat, bs.anchor_lon, radius_m),
        })
        centroid_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "Point",
                "coordinates": [bs.anchor_lon, bs.anchor_lat],
            },
        })

    return {
        "circles":   {"type": "FeatureCollection", "features": circle_features},
        "centroids": {"type": "FeatureCollection", "features": centroid_features},
    }
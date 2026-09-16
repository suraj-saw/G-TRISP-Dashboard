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

Spatial detection algorithm:
 
   greedy_blackspots()    — density-first greedy sweep with Voronoi non-overlapping visual partitioning.

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

from app.core.gis_config import (
    BLACKSPOT_RADIUS_METERS as SEARCH_RADIUS_M,
    BLACKSPOT_MIN_CRASHES as MIN_QUALIFYING_CRASHES,
    SEVERITY_PRIORITY_WEIGHTS as PRIORITY_WEIGHTS,
)

# ── Qualification threshold ─────────────────────────────────────────────────
# Minimum number of *qualifying* crashes required before a candidate cluster is accepted.

# ── Qualification severity mapping ──────────────────────────────────────────
# Maps each severity value (exactly as stored in the database) to a boolean
# indicating whether that crash should be counted toward the qualification threshold.
QUALIFYING_SEVERITIES: dict[str, bool] = {
    "Fatal": True,
    "Grievous Injury": True,
    "Minor Injury Hospitalized": False,
    "Minor Injury Non Hospitalized": False,
    "No Injury": False,
    "Damage Only": False,
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
    (200, "Critical Blackspot",        "#800026"),
    (140, "Very High Risk Blackspot",  "#BD0026"),
    (90,  "High Risk Blackspot",       "#E31A1C"),
    (60,  "Medium Risk Blackspot",     "#FC4E2A"),
    (30,  "Low Risk Blackspot",        "#FD8D3C"),
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
    number_of_vehicles: int = 0
    fatalities: int = 0


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
    vehicle_count: int = 0


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


def _build_qualification_reasons(qualifying_count: int, total_fatalities: int) -> list[str]:
    """
    Return a list of human-readable qualification reasons for a cluster.

    Currently the criteria are:
    1. qualifying crash count reaches MIN_QUALIFYING_CRASHES
    2. total fatalities reaches 10
    """
    reasons: list[str] = []
    qualifying_labels = [s for s, q in QUALIFYING_SEVERITIES.items() if q]
    if qualifying_count >= MIN_QUALIFYING_CRASHES:
        reasons.append(
            f"≥{MIN_QUALIFYING_CRASHES} qualifying crashes "
            f"({', '.join(qualifying_labels)}) within {SEARCH_RADIUS_M:.0f} m"
        )
    if total_fatalities >= 10:
        reasons.append(
            f"≥10 total fatalities within {SEARCH_RADIUS_M:.0f} m"
        )
    return reasons


def priority_label_and_color(score: int, qualifying_count: int = 5) -> tuple[str, str]:
    """
    Return the (label, hex_colour) tier for a given priority score.

    Iterates PRIORITY_LEVELS from highest to lowest threshold.  Falls back to
    "Identified Blackspot" with a neutral amber colour if no threshold is met.
    """
    if qualifying_count < 5:
        return "Potential Segment", "#FEB24C"
        
    for threshold, label, color in PRIORITY_LEVELS:
        if score >= threshold:
            return label, color
    return "Identified Blackspot", "#FEB24C"


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

def _apply_dynamic_priority_levels(blackspots: list[Blackspot]) -> None:
    """
    Applies dynamic Equal Interval binning to calculate priority levels and colors
    based on the actual distribution of priority scores in the generated blackspots.
    """
    if not blackspots:
        return
        
    min_score = min(bs.priority_score for bs in blackspots)
    max_score = max(bs.priority_score for bs in blackspots)
    
    if max_score == min_score:
        for bs in blackspots:
            bs.priority_label = "Medium Risk Blackspot"
            bs.priority_color = "#FC4E2A"
    else:
        interval = (max_score - min_score) / 5.0
        thresholds = {
            "Low": min_score + interval,
            "Medium": min_score + 2 * interval,
            "High": min_score + 3 * interval,
            "Very High": min_score + 4 * interval
        }
        
        for bs in blackspots:
            score = bs.priority_score
            if score < thresholds["Low"]:
                bs.priority_label = "Low Risk Blackspot"
                bs.priority_color = "#FD8D3C"
            elif score < thresholds["Medium"]:
                bs.priority_label = "Medium Risk Blackspot"
                bs.priority_color = "#FC4E2A"
            elif score < thresholds["High"]:
                bs.priority_label = "High Risk Blackspot"
                bs.priority_color = "#E31A1C"
            elif score < thresholds["Very High"]:
                bs.priority_label = "Very High Risk Blackspot"
                bs.priority_color = "#BD0026"
            else:
                bs.priority_label = "Critical Blackspot"
                bs.priority_color = "#800026"


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
      5. Priority label and color are left empty (to be assigned dynamically later).
    """
    severities = [points[i].severity for i in member_indices]
    counts = _severity_counts(severities)

    # ── Step 1: Qualification (independent of priority) ──────────────────────
    total_fatalities = sum(points[i].fatalities for i in member_indices)
    qualifying_count = _compute_qualifying_count(counts)
    reasons = _build_qualification_reasons(qualifying_count, total_fatalities)
    if not reasons:
        return None   # cluster does not meet the qualification threshold

    # ── Step 2: Prioritisation (independent of qualification) ─────────────────
    priority_score = _compute_priority_score(counts)
    priority_label, priority_color = "", ""

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
        vehicle_count=sum(points[i].number_of_vehicles for i in member_indices),
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

    # Bucket queue for O(1) max lookup
    max_d = max(density) if density else 0
    buckets = [set() for _ in range(max_d + 1)]
    for i in range(n):
        buckets[density[i]].add(i)

    current_max_d = max_d
    while current_max_d >= min_crashes:
        if not buckets[current_max_d]:
            current_max_d -= 1
            continue
            
        best = buckets[current_max_d].pop()
        if best not in pool:
            continue

        circle_set = (neighbours[best] & pool) | {best}
        circle = list(circle_set)

        bs = _make_blackspot(bs_id + 1, best, circle, points)
        if bs is not None:
            bs_id += 1
            blackspots.append(bs)
            pool -= circle_set
            
            # Only update points that actually lost a neighbour
            affected = set()
            for c in circle_set:
                affected.update(neighbours[c])
            
            for i in (affected & pool):
                old_d = density[i]
                neighbours[i] -= circle_set
                new_d = len(neighbours[i]) + 1
                if new_d != old_d:
                    buckets[old_d].discard(i)
                    density[i] = new_d
                    buckets[new_d].add(i)
        else:
            # This centre doesn't qualify; remove it from the pool so we don't
            # keep re-evaluating it.
            pool.discard(best)
            density[best] = 0

    _apply_dynamic_priority_levels(blackspots)
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


def resolve_non_overlapping_polygons(
    anchors: list[tuple[float, float]],
    radius_m: float,
    n_points: int = 64,
) -> list[dict]:
    """
    Generate GeoJSON polygon geometries for anchor points (lat, lon).
    If two or more anchor buffers overlap (distance < 2 * radius_m), clip the
    overlapping boundary along the perpendicular bisector between their centers
    so that NO two polygons overlap in the visualization, while maintaining the
    full valid spatial extent and correct identification of each blackspot.
    """
    n = len(anchors)
    if n == 0:
        return []

    try:
        import shapely.geometry as sg
    except ImportError:
        return [circle_polygon_geojson(lat, lon, radius_m, n_points) for lat, lon in anchors]

    raw_polys = []
    for lat, lon in anchors:
        lat_rad = math.radians(lat)
        m_per_deg_lat = 111_320.0
        m_per_deg_lon = 111_320.0 * math.cos(lat_rad) or 1e-9
        coords = []
        for k in range(n_points):
            theta = 2 * math.pi * (k / n_points)
            coords.append((
                lon + (radius_m * math.cos(theta)) / m_per_deg_lon,
                lat + (radius_m * math.sin(theta)) / m_per_deg_lat,
            ))
        coords.append(coords[0])
        raw_polys.append(sg.Polygon(coords))

    two_r = 2.0 * radius_m
    overlaps = defaultdict(list)
    for i in range(n):
        lat_i, lon_i = anchors[i]
        for j in range(i + 1, n):
            lat_j, lon_j = anchors[j]
            if _haversine_m(lat_i, lon_i, lat_j, lon_j) < two_r:
                overlaps[i].append(j)
                overlaps[j].append(i)

    if not overlaps:
        return [sg.mapping(p) for p in raw_polys]

    clipped_polys = list(raw_polys)
    BIG = 0.5  # ~55 km half-plane bounding box

    for i, neighbors in overlaps.items():
        c1_lon, c1_lat = anchors[i][1], anchors[i][0]
        cur_poly = clipped_polys[i]
        for j in neighbors:
            c2_lon, c2_lat = anchors[j][1], anchors[j][0]
            dx = c2_lon - c1_lon
            dy = c2_lat - c1_lat
            dist = math.hypot(dx, dy)
            if dist < 1e-9:
                continue
            mx = (c1_lon + c2_lon) / 2.0
            my = (c1_lat + c2_lat) / 2.0
            ux, uy = -dy / dist, dx / dist
            vx, vy = -dx / dist, -dy / dist

            half_plane = sg.Polygon([
                (mx - BIG * ux, my - BIG * uy),
                (mx + BIG * ux, my + BIG * uy),
                (mx + BIG * ux + BIG * vx, my + BIG * uy + BIG * vy),
                (mx - BIG * ux + BIG * vx, my - BIG * uy + BIG * vy),
            ])
            try:
                clipped = cur_poly.intersection(half_plane)
                if not clipped.is_empty and clipped.is_valid:
                    cur_poly = clipped
            except Exception:
                pass
        clipped_polys[i] = cur_poly

    geoms = []
    for i, p in enumerate(clipped_polys):
        if p.is_empty or not p.is_valid:
            geoms.append(circle_polygon_geojson(anchors[i][0], anchors[i][1], radius_m, n_points))
        else:
            geoms.append(sg.mapping(p))
    return geoms


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

    anchors = [(bs.anchor_lat, bs.anchor_lon) for bs in sorted_blackspots]
    geoms = resolve_non_overlapping_polygons(anchors, radius_m)

    for rank, (bs, geom) in enumerate(zip(sorted_blackspots, geoms), start=1):
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
            "vehicle_count":              bs.vehicle_count,
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
            "geometry": geom,
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
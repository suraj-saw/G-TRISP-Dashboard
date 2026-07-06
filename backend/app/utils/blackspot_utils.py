# backend/app/utils/blackspot_utils.py
"""
IRC SP:88-2019 / IRC:99-2018 compliant blackspot detection.

Indian Road Congress (IRC) defines a road accident blackspot as:

  PRIMARY CRITERION (IRC SP:88-2019 §4.2):
    A stretch of road ≤ 500 m where ANY of the following are met over
    a 3-year study period:
      (a) ≥ 5 road accidents (fatal + injury combined), OR
      (b) ≥ 3 fatal accidents, OR
      (c) Accident Severity Index (ASI) ≥ 15
          where ASI = (fatal × 3) + (grievous_injury × 2) + (minor_injury × 1)

  SECONDARY CRITERION (IRC:99-2018 §3.1):
    A 1-km homogeneous section with accident rate exceeding twice the
    network average (requires AADT exposure data — approximated here when
    not available).

  RADIUS / STRETCH:
    IRC specifies a LINEAR 500 m road section.  Because GPS crash data is
    point-based (no road-axis snapping), we use a 500 m HAVERSINE radius
    (circle) as the standard spatial proxy, consistent with NRSC / MoRTH
    practice for GIS-based blackspot mapping.

  SEVERITY WEIGHTS  (IRC SP:88-2019 Annex A):
    Fatal          → weight 3
    Grievous Injury → weight 2
    Minor Injury   → weight 1
    Damage Only    → weight 0  (not counted for ASI)

Two detection algorithms are provided, both IRC-compliant:

  greedy_blackspots()   — density-first greedy sweep (same geometry as
                          before, IRC thresholds applied).
  dbscan_blackspots()   — overlap-suppressed fixed-radius sweep with IRC
                          thresholds applied.

Both accept an optional list of severity strings per crash point so that
ASI can be computed.  When severity data is absent the count-based
criterion (≥ 5 crashes) is the sole qualifier.

Performance note
-----------------
A naive O(n²) pairwise distance matrix takes ~10 s for ~2 500 points in
pure Python.  We bucket points into a coarse lat/lon grid sized to
radius_m so each point only haversine-checks points in its own cell and
the 8 neighbouring cells — O(n) in practice for spatially clustered data.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

EARTH_RADIUS_M = 6_371_000.0

# ── IRC SP:88-2019 §4.2 constants ───────────────────────────────────────────
IRC_RADIUS_M: float = 500.0          # standard blackspot radius (m)
IRC_MIN_CRASHES: int = 5             # min total (fatal+injury) accidents
IRC_MIN_FATAL: int = 3               # alternate: min fatal accidents
IRC_MIN_ASI: int = 15                # alternate: Accident Severity Index threshold

# IRC severity weights (SP:88-2019 Annex A)
IRC_SEVERITY_WEIGHTS: dict[str, int] = {
    "Fatal": 3,
    "Grievous Injury": 2,
    "Minor Injury": 1,
    "Damage Only": 0,
}

# Risk tier thresholds — based on ASI bands used by MoRTH / state PWDs
# Tier  | ASI range   | IRC label
# ──────┼─────────────┼──────────────────────────────────
#  1    |  15 – 29    | Low Risk Blackspot
#  2    |  30 – 59    | Medium Risk Blackspot
#  3    |  60 – 99    | High Risk Blackspot
#  4    | 100 – 199   | Very High Risk Blackspot
#  5    |  ≥ 200      | Critical / Mass-Casualty Blackspot
IRC_ASI_TIERS: list[tuple[int, str]] = [
    (200, "Critical Blackspot"),
    (100, "Very High Risk Blackspot"),
    (60,  "High Risk Blackspot"),
    (30,  "Medium Risk Blackspot"),
    (15,  "Low Risk Blackspot"),
]


def irc_risk_label(asi: int) -> str:
    """Return the IRC risk-tier label for a given ASI value."""
    for threshold, label in IRC_ASI_TIERS:
        if asi >= threshold:
            return label
    return "Potential Blackspot"


def irc_risk_color(asi: int) -> str:
    """Return a colour hex for the IRC ASI tier (used by frontend labels)."""
    if asi >= 200:
        return "#4C1D1D"   # near-black maroon — mass casualty
    if asi >= 100:
        return "#7F1D1D"   # dark burgundy — very high
    if asi >= 60:
        return "#DC2626"   # red — high
    if asi >= 30:
        return "#EA580C"   # deep orange — medium
    if asi >= 15:
        return "#F97316"   # orange — low
    return "#FBBF24"       # amber — potential / sub-threshold


# ── Data structures ──────────────────────────────────────────────────────────

@dataclass
class CrashPoint:
    index: int
    accident_id: Optional[str]
    lat: float
    lon: float
    severity: str = "Unknown"   # IRC severity label for the crash


@dataclass
class Blackspot:
    bs_id: int
    crash_count: int
    fatal_count: int
    grievous_count: int
    minor_count: int
    asi: int                    # Accident Severity Index (IRC SP:88-2019)
    risk_label: str             # IRC tier label
    risk_color: str             # hex colour for the tier
    qualifies_by: list[str]     # which IRC criteria triggered classification
    anchor_lat: float
    anchor_lon: float
    crash_ids: list[str] = field(default_factory=list)


# ── Severity helpers ─────────────────────────────────────────────────────────

def _compute_asi(severities: list[str]) -> tuple[int, int, int, int, int]:
    """
    Return (asi, fatal_count, grievous_count, minor_count, damage_count)
    from a list of IRC severity strings.
    """
    fatal = grievous = minor = damage = 0
    for s in severities:
        w = IRC_SEVERITY_WEIGHTS.get(s, 0)
        if w == 3:
            fatal += 1
        elif w == 2:
            grievous += 1
        elif w == 1:
            minor += 1
        else:
            damage += 1
    asi = fatal * 3 + grievous * 2 + minor * 1
    return asi, fatal, grievous, minor, damage


def _qualifies(total: int, fatal: int, asi: int) -> list[str]:
    """
    Return the list of IRC criteria that this cluster satisfies.
    Empty list → does NOT qualify as a blackspot.
    """
    reasons: list[str] = []
    if total >= IRC_MIN_CRASHES:
        reasons.append(f"≥{IRC_MIN_CRASHES} crashes (IRC SP:88-2019 §4.2a)")
    if fatal >= IRC_MIN_FATAL:
        reasons.append(f"≥{IRC_MIN_FATAL} fatal accidents (IRC SP:88-2019 §4.2b)")
    if asi >= IRC_MIN_ASI:
        reasons.append(f"ASI={asi}≥{IRC_MIN_ASI} (IRC SP:88-2019 §4.2c)")
    return reasons


# ── Spatial grid helpers ─────────────────────────────────────────────────────

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


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _project_xy(lat: float, lon: float, ref_lat_rad: float) -> tuple[float, float]:
    """Cheap equirectangular projection to local metres, centred on ref_lat_rad."""
    x = lon * 111_320.0 * math.cos(ref_lat_rad)
    y = lat * 110_540.0
    return x, y


def _cell_of(x: float, y: float, cell_size: float) -> tuple[int, int]:
    return (math.floor(x / cell_size), math.floor(y / cell_size))


def _build_grid(xs, ys, cell_size: float) -> dict:
    grid: dict = defaultdict(list)
    for i, (x, y) in enumerate(zip(xs, ys)):
        grid[_cell_of(x, y, cell_size)].append(i)
    return grid


def _neighbours_within(
    idx: int, xs, ys, grid: dict, cell_size: float, radius_m: float
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


# ── IRC-compliant blackspot builder helper ───────────────────────────────────

def _make_blackspot(
    bs_id: int,
    anchor_idx: int,
    member_indices: list[int],
    points: list[CrashPoint],
) -> Optional[Blackspot]:
    """
    Build a Blackspot from a set of member crash indices, applying the full
    IRC SP:88-2019 §4.2 qualification logic.  Returns None if the cluster
    does NOT satisfy any IRC criterion.
    """
    severities = [points[i].severity for i in member_indices]
    total = len(member_indices)
    asi, fatal, grievous, minor, _ = _compute_asi(severities)
    reasons = _qualifies(total, fatal, asi)
    if not reasons:
        return None

    return Blackspot(
        bs_id=bs_id,
        crash_count=total,
        fatal_count=fatal,
        grievous_count=grievous,
        minor_count=minor,
        asi=asi,
        risk_label=irc_risk_label(asi),
        risk_color=irc_risk_color(asi),
        qualifies_by=reasons,
        anchor_lat=points[anchor_idx].lat,
        anchor_lon=points[anchor_idx].lon,
        crash_ids=[
            points[i].accident_id or str(points[i].index)
            for i in member_indices
        ],
    )


# ── Algorithm 1: Greedy density-first sweep (IRC 500 m radius) ───────────────

def greedy_blackspots(
    points: list[CrashPoint],
    radius_m: float = IRC_RADIUS_M,
    min_crashes: int = IRC_MIN_CRASHES,
) -> list[Blackspot]:
    """
    IRC SP:88-2019 §4.2 compliant greedy blackspot detection.

    radius_m   : search radius in metres (IRC default 500 m)
    min_crashes: minimum crash count to even enter the candidate pool;
                 the full IRC triple-criterion check (count, fatal, ASI)
                 is applied before a cluster is accepted as a blackspot.

    Algorithm:
      1. Build grid-accelerated neighbour sets within radius_m.
      2. Repeatedly pick the remaining crash with the highest density.
      3. Apply IRC triple-criterion; if any criterion met → new blackspot.
      4. Remove assigned crashes, update densities, repeat.
    """
    n = len(points)
    if n == 0:
        return []

    neighbours = _build_grid_neighbours(points, radius_m)
    density = [len(neighbours[i]) + 1 for i in range(n)]   # +1 = self

    pool = set(range(n))
    blackspots: list[Blackspot] = []
    bs_id = 0

    while pool:
        best = max(pool, key=lambda i: density[i])

        # Pre-filter: skip if the raw count cannot possibly meet any IRC
        # criterion (even with all crashes being fatal).
        if density[best] < min_crashes and density[best] * 3 < IRC_MIN_ASI:
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
            # This centre doesn't qualify; remove it from the pool so
            # we don't keep re-evaluating it.
            pool.discard(best)
            density[best] = 0

    return blackspots


# ── Algorithm 2: DBSCAN-style overlap-suppressed sweep (IRC 500 m radius) ────

def dbscan_blackspots(
    points: list[CrashPoint],
    radius_m: float = IRC_RADIUS_M,
    min_crashes: int = IRC_MIN_CRASHES,
) -> list[Blackspot]:
    """
    IRC SP:88-2019 §4.2 compliant DBSCAN-style blackspot detection.

    Unlike greedy_blackspots(), crashes may belong to more than one
    candidate's neighbourhood before overlap suppression.  The densest
    non-overlapping centres are accepted; each is then checked against the
    IRC triple criterion before being added to the output.

    Overlap suppression rule: two blackspot circles must not overlap
    (centre separation > 2 × radius_m).  This reflects the IRC principle
    that each 500 m section is identified independently.
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

    # Neighbour counts (including self) for every point.
    neighbour_counts = [
        len(_neighbours_within(i, xs, ys, grid, cell_size, radius_m))
        for i in range(n)
    ]

    # Pre-filter candidates by raw count.  Even if crash count alone is
    # below IRC_MIN_CRASHES, a single-fatal cluster can still qualify via
    # the ASI criterion, so the minimum pre-filter is 1.
    candidates = [i for i in range(n) if neighbour_counts[i] >= 1]
    if not candidates:
        return []

    # Densest centres get first pick in overlap suppression.
    candidates.sort(key=lambda i: -neighbour_counts[i])

    # Overlap suppression: accept only if centre is > 2×radius_m from
    # every already-accepted centre.
    two_r2 = (2 * radius_m) ** 2
    kept: list[int] = []
    for idx in candidates:
        overlap = any(
            (xs[idx] - xs[k]) ** 2 + (ys[idx] - ys[k]) ** 2 < two_r2
            for k in kept
        )
        if not overlap:
            kept.append(idx)

    # Build Blackspot records, applying IRC triple-criterion to each candidate.
    raw_results: list[tuple[int, list[int]]] = []
    for idx in kept:
        members = _neighbours_within(idx, xs, ys, grid, cell_size, radius_m)
        raw_results.append((idx, members))

    # Rank by ASI descending (highest risk first), then by crash count.
    def _rank_key(item: tuple[int, list[int]]) -> tuple[int, int]:
        _, members = item
        severities = [points[i].severity for i in members]
        asi, _, _, _, _ = _compute_asi(severities)
        return (-asi, -len(members))

    raw_results.sort(key=_rank_key)

    blackspots: list[Blackspot] = []
    for idx, members in raw_results:
        bs = _make_blackspot(len(blackspots) + 1, idx, members, points)
        if bs is not None:
            blackspots.append(bs)

    return blackspots


# ── GeoJSON output ───────────────────────────────────────────────────────────

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
    Returns {"circles": FeatureCollection, "centroids": FeatureCollection}.

    Properties now include full IRC metadata:
      asi, fatal_count, grievous_count, minor_count, risk_label, risk_color,
      qualifies_by — so the frontend can render IRC-compliant tooltips.
    """
    circle_features = []
    centroid_features = []

    for bs in blackspots:
        props = {
            "bs_id": bs.bs_id,
            "crash_count": bs.crash_count,
            "fatal_count": bs.fatal_count,
            "grievous_count": bs.grievous_count,
            "minor_count": bs.minor_count,
            "asi": bs.asi,
            "risk_label": bs.risk_label,
            "risk_color": bs.risk_color,
            "qualifies_by": " | ".join(bs.qualifies_by),
            "crash_ids": ", ".join(bs.crash_ids),
            # Legacy label kept for backward-compat with existing map layers
            "label": f"BS#{bs.bs_id} | ASI {bs.asi} | {bs.crash_count} crashes",
            # point_count alias so existing MapLibre step expressions still work
            "point_count": bs.crash_count,
        }
        circle_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": circle_polygon_geojson(
                bs.anchor_lat, bs.anchor_lon, radius_m
            ),
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
        "circles": {"type": "FeatureCollection", "features": circle_features},
        "centroids": {"type": "FeatureCollection", "features": centroid_features},
    }
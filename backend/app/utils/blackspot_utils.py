# backend/app/utils/blackspot_utils.py
"""
Greedy blackspot detection

  1. For every crash, count how many other crashes lie within
     `radius_m` (haversine distance).
  2. Repeatedly pick the remaining crash with the highest density.
     If its density >= min_crashes, every crash within the radius is
     assigned to a new blackspot anchored at that crash's location.
  3. Remove the assigned crashes from the pool, update density for
     everything left, and repeat until no candidate qualifies.

Performance note
-----------------
A naive O(n^2) pairwise distance matrix takes ~10s for ~2,500 points in
pure Python. We instead bucket points into a coarse lat/lon grid sized to
`radius_m`, so each point only needs to haversine-check points in its own
cell and the 8 neighbouring cells — O(n) in practice for spatially
clustered crash data.
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

EARTH_RADIUS_M = 6_371_000.0


@dataclass
class CrashPoint:
    index: int
    accident_id: Optional[str]
    lat: float
    lon: float


@dataclass
class Blackspot:
    bs_id: int
    crash_count: int
    anchor_lat: float
    anchor_lon: float
    crash_ids: list[str] = field(default_factory=list)


def _haversine_m(lat1, lon1, lat2, lon2) -> float:
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

    # Degrees-per-metre conversion (use mean latitude for the lon scale)
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


def greedy_blackspots(
    points: list[CrashPoint],
    radius_m: float,
    min_crashes: int,
) -> list[Blackspot]:
    """Grid-accelerated port of greedy_cluster() from the notebook."""
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

        if density[best] < min_crashes:
            break  # nothing left can qualify

        circle = (neighbours[best] & pool) | {best}

        if len(circle) < min_crashes:
            pool.discard(best)
            density[best] = 0
            continue

        bs_id += 1
        blackspots.append(
            Blackspot(
                bs_id=bs_id,
                crash_count=len(circle),
                anchor_lat=points[best].lat,
                anchor_lon=points[best].lon,
                crash_ids=[points[i].accident_id or str(points[i].index) for i in circle],
            )
        )

        pool -= circle
        for i in pool:
            neighbours[i] -= circle
            density[i] = len(neighbours[i]) + 1

    return blackspots

# ---------------------------------------------------------------------------
# Spatial grid helpers — used only by dbscan_blackspots() to avoid an O(n^2)
# distance matrix. Crashes are projected to a local planar (metres) frame
# and bucketed into cells sized to the search radius, so neighbour lookups
# only need to scan a handful of nearby cells instead of every point.
# ---------------------------------------------------------------------------

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
    """Indices (including idx itself) within radius_m of point idx, via grid lookup."""
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


# ---------------------------------------------------------------------------
# DBSCAN-style blackspot detection (fixed-radius neighbour counting +
# overlap suppression) — mirrors build_dbscan_circles() from the offline
# Blackspot_analysis_heatmap.ipynb notebook.
#
# Unlike greedy_blackspots(), which removes assigned crashes after each
# cluster is formed, this approach:
#   1. Counts neighbours within `radius_m` for EVERY point independently
#      (crashes may belong to more than one candidate's neighbourhood).
#   2. Keeps only points whose neighbour count >= min_crashes as candidates.
#   3. Sorts candidates by density (descending).
#   4. Greedily accepts a candidate as a blackspot centre only if it is
#      NOT within 2*radius_m of any already-accepted centre (circles must
#      not overlap). This favours the densest non-overlapping set.
#
# Performance note: neighbour counting and final member lookup use a
# spatial grid (O(n) ish) instead of an O(n^2) distance matrix, since a
# pure-Python n^2 haversine loop becomes a multi-second bottleneck once
# the crash count gets into the thousands.
# ---------------------------------------------------------------------------

def dbscan_blackspots(
    points: list[CrashPoint],
    radius_m: float,
    min_crashes: int,
) -> list[Blackspot]:
    n = len(points)
    if n == 0:
        return []

    # Project to local planar metres so we can use a uniform grid + squared
    # Euclidean distance instead of repeated haversine trig calls.
    ref_lat_rad = math.radians(sum(p.lat for p in points) / n)
    xs = [0.0] * n
    ys = [0.0] * n
    for i, p in enumerate(points):
        xs[i], ys[i] = _project_xy(p.lat, p.lon, ref_lat_rad)

    cell_size = max(radius_m, 1.0)
    grid = _build_grid(xs, ys, cell_size)

    # 1. Neighbour count (including self) for every point — grid-accelerated.
    neighbour_counts = [
        len(_neighbours_within(i, xs, ys, grid, cell_size, radius_m))
        for i in range(n)
    ]

    # 2. Candidates dense enough to qualify as a blackspot centre.
    candidates = [i for i in range(n) if neighbour_counts[i] >= min_crashes]
    if not candidates:
        return []

    # 3. Sort by density, descending — densest centres get first pick.
    candidates.sort(key=lambda i: -neighbour_counts[i])

    # 4. Overlap suppression: accept a candidate only if its centre is more
    #    than 2*radius_m from every already-accepted centre. `kept` stays
    #    small (tens to a few hundred), so a direct linear scan here is
    #    cheap — no grid needed for this step.
    two_r2 = (2 * radius_m) ** 2
    kept: list[int] = []
    for idx in candidates:
        overlap = any(
            (xs[idx] - xs[k]) ** 2 + (ys[idx] - ys[k]) ** 2 < two_r2
            for k in kept
        )
        if not overlap:
            kept.append(idx)

    # Build Blackspot records — each kept centre absorbs every crash
    # within radius_m of it (grid-accelerated lookup again).
    raw_results: list[tuple[int, list[int]]] = []
    for idx in kept:
        members = _neighbours_within(idx, xs, ys, grid, cell_size, radius_m)
        raw_results.append((idx, members))

    # Rank by final crash_count, descending, then assign sequential ids.
    raw_results.sort(key=lambda item: -len(item[1]))

    blackspots: list[Blackspot] = []
    for rank, (idx, members) in enumerate(raw_results, start=1):
        blackspots.append(
            Blackspot(
                bs_id=rank,
                crash_count=len(members),
                anchor_lat=points[idx].lat,
                anchor_lon=points[idx].lon,
                crash_ids=[points[i].accident_id or str(points[i].index) for i in members],
            )
        )

    return blackspots


def circle_polygon_geojson(lat: float, lon: float, radius_m: float, n_points: int = 48) -> dict:
    """Approximate geodesic circle polygon around (lat, lon) for `radius_m`."""
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
    """Returns {"circles": FeatureCollection, "centroids": FeatureCollection}."""
    circle_features = []
    centroid_features = []

    for bs in blackspots:
        props = {
            "bs_id": bs.bs_id,
            "crash_count": bs.crash_count,
            "crash_ids": ", ".join(bs.crash_ids),
            "label": f"BS#{bs.bs_id} | {bs.crash_count} crashes",
        }
        circle_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": circle_polygon_geojson(bs.anchor_lat, bs.anchor_lon, radius_m),
        })
        centroid_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "Point", "coordinates": [bs.anchor_lon, bs.anchor_lat]},
        })

    return {
        "circles": {"type": "FeatureCollection", "features": circle_features},
        "centroids": {"type": "FeatureCollection", "features": centroid_features},
    }



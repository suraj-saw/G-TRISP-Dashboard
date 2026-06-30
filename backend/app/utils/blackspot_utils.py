# backend/app/utils/blackspot_utils.py
"""
Greedy blackspot detection — same algorithm as the offline
Blackspot_analysis_heatmap.ipynb pipeline (greedy_cluster):

  1. For every crash, count how many other crashes lie within
     `radius_m` (haversine distance).
  2. Repeatedly pick the remaining crash with the highest density.
     If its density >= min_crashes, every crash within the radius is
     assigned to a new blackspot anchored at that crash's location.
  3. Remove the assigned crashes from the pool, update density for
     everything left, and repeat until no candidate qualifies.
"""

from __future__ import annotations

import math
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


def greedy_blackspots(
    points: list[CrashPoint],
    radius_m: float,
    min_crashes: int,
) -> list[Blackspot]:
    """Pure-Python port of greedy_cluster() from the notebook. O(n^2)."""
    n = len(points)
    if n == 0:
        return []

    dist = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = _haversine_m(points[i].lat, points[i].lon, points[j].lat, points[j].lon)
            dist[i][j] = d
            dist[j][i] = d

    neighbours = [
        {j for j in range(n) if j != i and dist[i][j] <= radius_m}
        for i in range(n)
    ]
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
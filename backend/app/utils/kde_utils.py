"""Quartic-kernel KDE analysis with sampled GeoJSON output."""

from __future__ import annotations

import math
from typing import Optional

import numpy as np


def _project_xy(lat: float, lon: float, ref_lat_rad: float) -> tuple[float, float]:
    x = lon * 111_320.0 * math.cos(ref_lat_rad)
    y = lat * 110_540.0
    return x, y


def _unproject_xy(x: float, y: float, ref_lat_rad: float) -> tuple[float, float]:
    lon = x / (111_320.0 * math.cos(ref_lat_rad))
    lat = y / 110_540.0
    return lat, lon


def _grid_to_geojson(
    density_grid: np.ndarray,
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    ref_lat_rad: float,
    max_points: int,
) -> tuple[dict, int]:
    """Convert a normalized KDE grid to a bounded spatial point sample."""
    positive_cells = int(np.count_nonzero(density_grid > 0))
    stride = max(1, int(math.ceil(math.sqrt(positive_cells / max_points))))
    sampled = density_grid[::stride, ::stride]
    rows, cols = np.nonzero(sampled > 0)
    features = []

    for row, col in zip(rows.tolist(), cols.tolist()):
        source_row = row * stride
        source_col = col * stride
        density = float(density_grid[source_row, source_col])
        lat, lon = _unproject_xy(
            float(grid_x[source_col]), float(grid_y[source_row]), ref_lat_rad
        )
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "density": round(density, 4),
                "normalized_density": round(density / 100.0, 6),
            },
        })

    return {"type": "FeatureCollection", "features": features}, stride


def _compute_kde_grid(
    lats: list[float],
    lons: list[float],
    weights: Optional[list[float]],
    radius_m: float,
    pixel_m: float,
    max_points: int,
) -> Optional[dict]:
    """Compute the notebook-equivalent quartic KDE on a local metric grid."""
    n = len(lats)
    if n == 0:
        return None

    if weights is None:
        weight_array = np.ones(n, dtype=np.float64)
    else:
        weight_array = np.asarray(weights, dtype=np.float64)
        weight_array = np.where(
            np.isfinite(weight_array) & (weight_array > 0), weight_array, 0.0
        )

    ref_lat_rad = math.radians(sum(lats) / n)
    xs = np.empty(n)
    ys = np.empty(n)
    for i in range(n):
        xs[i], ys[i] = _project_xy(lats[i], lons[i], ref_lat_rad)

    pad = radius_m
    x0, x1 = float(xs.min() - pad), float(xs.max() + pad)
    y0, y1 = float(ys.min() - pad), float(ys.max() + pad)
    ncols = max(4, int(math.ceil((x1 - x0) / pixel_m)))
    nrows = max(4, int(math.ceil((y1 - y0) / pixel_m)))
    grid_x = x0 + (np.arange(ncols) + 0.5) * pixel_m
    grid_y = y1 - (np.arange(nrows) + 0.5) * pixel_m

    density_grid = np.zeros((nrows, ncols), dtype=np.float64)
    radius_squared = radius_m ** 2
    radius_cells = int(math.ceil(radius_m / pixel_m))

    for i in range(n):
        if weight_array[i] == 0:
            continue
        px, py = xs[i], ys[i]
        col_f = (px - x0) / pixel_m - 0.5
        row_f = (y1 - py) / pixel_m - 0.5
        c0 = max(0, int(math.floor(col_f - radius_cells)))
        c1 = min(ncols, int(math.ceil(col_f + radius_cells)) + 1)
        r0 = max(0, int(math.floor(row_f - radius_cells)))
        r1 = min(nrows, int(math.ceil(row_f + radius_cells)) + 1)
        if c0 >= c1 or r0 >= r1:
            continue

        sub_grid_x, sub_grid_y = np.meshgrid(grid_x[c0:c1], grid_y[r0:r1])
        distance_squared = (sub_grid_x - px) ** 2 + (sub_grid_y - py) ** 2
        mask = distance_squared <= radius_squared
        u_squared = np.where(mask, distance_squared / radius_squared, 0.0)
        kernel = np.where(
            mask, (3.0 / math.pi) * (1.0 - u_squared) ** 2, 0.0
        )
        density_grid[r0:r1, c0:c1] += kernel * weight_array[i]

    max_density = float(density_grid.max())
    if max_density > 0:
        density_grid = (density_grid / max_density) * 100.0
    density_grid = density_grid.astype(np.float32)
    geojson, sample_stride = _grid_to_geojson(
        density_grid, grid_x, grid_y, ref_lat_rad, max_points
    )

    return {
        "data": geojson,
        "width": ncols,
        "height": nrows,
        "max_density": max_density,
        "sample_stride": sample_stride,
    }


def compute_kde_heatmap(
    lats: list[float],
    lons: list[float],
    radius_m: float = 500.0,
    pixel_m: float = 25.0,
    max_points: int = 60_000,
) -> Optional[dict]:
    return _compute_kde_grid(
        lats, lons, None, radius_m, pixel_m, max_points
    )


def compute_weighted_kde_heatmap(
    lats: list[float],
    lons: list[float],
    weights: list[float],
    radius_m: float = 500.0,
    pixel_m: float = 25.0,
    max_points: int = 60_000,
) -> Optional[dict]:
    return _compute_kde_grid(
        lats, lons, weights, radius_m, pixel_m, max_points
    )

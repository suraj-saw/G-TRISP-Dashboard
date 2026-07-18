# backend/app/utils/kde_utils.py

"""
Kernel Density Estimation (KDE) Utility Module

Provides high-performance spatial KDE analysis using a quartic (biweight) kernel.
This module converts geographic coordinates (lat/lon) into a localized metric grid,
calculates density (optionally weighted), normalizes the results, and outputs a 
downsampled GeoJSON FeatureCollection suitable for frontend web-mapping tools 
(like Mapbox or Leaflet).
"""

from __future__ import annotations

import math
from typing import Optional

import numpy as np


def _project_xy(lat: float, lon: float, ref_lat_rad: float) -> tuple[float, float]:
    """
    Project geographic coordinates (lat/lon) into a local metric (x/y) plane.
    
    Uses a fast Equirectangular approximation which is highly accurate for 
    localized spatial analysis (e.g., city or state-level).

    Parameters
    ----------
    lat : float
        Latitude in decimal degrees.
    lon : float
        Longitude in decimal degrees.
    ref_lat_rad : float
        The reference latitude (usually the centroid of the dataset) in radians, 
        used to scale longitude distances correctly based on Earth's curvature.

    Returns
    -------
    tuple[float, float]
        The projected (x, y) coordinates in meters.
    """
    # 111,320 meters is roughly one degree of longitude at the equator.
    # We scale it by the cosine of the reference latitude.
    x = lon * 111_320.0 * math.cos(ref_lat_rad)
    
    # 110,540 meters is roughly one degree of latitude.
    y = lat * 110_540.0
    return x, y


def _unproject_xy(x: float, y: float, ref_lat_rad: float) -> tuple[float, float]:
    """
    Reverse the Equirectangular projection, converting local metric (x/y) 
    coordinates back into geographic coordinates (lat/lon).

    Parameters
    ----------
    x : float
        The projected X coordinate in meters.
    y : float
        The projected Y coordinate in meters.
    ref_lat_rad : float
        The reference latitude in radians used during the initial projection.

    Returns
    -------
    tuple[float, float]
        The geographic (lat, lon) coordinates in decimal degrees.
    """
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
    """
    Convert the calculated 2D density grid into a sampled GeoJSON FeatureCollection.

    To prevent frontend crashes from rendering too many points, this function 
    dynamically calculates a sampling stride to keep the output feature count 
    below the `max_points` threshold.

    Parameters
    ----------
    density_grid : np.ndarray
        A 2D array of normalized KDE density values (0 to 100).
    grid_x : np.ndarray
        1D array of metric X coordinates representing the grid columns.
    grid_y : np.ndarray
        1D array of metric Y coordinates representing the grid rows.
    ref_lat_rad : float
        Reference latitude in radians for unprojecting back to lat/lon.
    max_points : int
        The absolute maximum number of GeoJSON points to generate.

    Returns
    -------
    tuple[dict, int]
        A tuple containing the GeoJSON FeatureCollection dictionary and 
        the calculated downsampling stride used.
    """
    # Count how many grid cells actually have density data
    positive_cells = int(np.count_nonzero(density_grid > 0))
    
    # Calculate step size to ensure we don't exceed max_points.
    # Using math.sqrt because the grid is 2-dimensional.
    stride = max(1, int(math.ceil(math.sqrt(positive_cells / max_points))))
    
    # Slice the arrays based on the calculated stride
    sampled = density_grid[::stride, ::stride]
    rows, cols = np.nonzero(sampled > 0)
    features = []

    # Map the sampled sub-grid back to the original grid coordinates and unproject
    for row, col in zip(rows.tolist(), cols.tolist()):
        source_row = row * stride
        source_col = col * stride
        density = float(density_grid[source_row, source_col])
        lat, lon = _unproject_xy(
            float(grid_x[source_col]), float(grid_y[source_row]), ref_lat_rad
        )
        
        # Build the GeoJSON point feature
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
    """
    Compute a quartic KDE on a local metric grid.

    This function defines a spatial bounding box around the data points, 
    generates a grid matrix, and applies a mathematical kernel to distribute 
    the "weight" of each point smoothly across neighboring cells.

    Parameters
    ----------
    lats : list[float]
        List of target latitudes.
    lons : list[float]
        List of target longitudes.
    weights : list[float], optional
        List of magnitude weights for each point (e.g., accident severity score). 
        If None, all points are equally weighted as 1.0.
    radius_m : float
        The bandwidth or radius of influence for the kernel in meters.
    pixel_m : float
        The spatial resolution of one grid cell (pixel) in meters.
    max_points : int
        Maximum number of points for the resulting GeoJSON output.

    Returns
    -------
    dict | None
        A dictionary containing the GeoJSON data, grid dimensions, peak density, 
        and sampling stride. Returns None if the input list is empty.
    """
    n = len(lats)
    if n == 0:
        return None

    # Standardize weights: initialize uniformly to 1.0 if none are provided, 
    # otherwise clean up the provided array (removing negative or non-finite weights).
    if weights is None:
        weight_array = np.ones(n, dtype=np.float64)
    else:
        weight_array = np.asarray(weights, dtype=np.float64)
        weight_array = np.where(
            np.isfinite(weight_array) & (weight_array > 0), weight_array, 0.0
        )

    # Establish the reference center point for our local map projection
    ref_lat_rad = math.radians(sum(lats) / n)
    xs = np.empty(n)
    ys = np.empty(n)
    
    # Project all lat/lon points onto our flat 2D Cartesian plane
    for i in range(n):
        xs[i], ys[i] = _project_xy(lats[i], lons[i], ref_lat_rad)

    # Define the bounding box of our grid, adding padding equal to the kernel radius 
    # so point influences don't get cut off artificially at the dataset's edges.
    pad = radius_m
    x0, x1 = float(xs.min() - pad), float(xs.max() + pad)
    y0, y1 = float(ys.min() - pad), float(ys.max() + pad)
    
    # Determine the number of columns and rows required to cover the area at the given resolution
    ncols = max(4, int(math.ceil((x1 - x0) / pixel_m)))
    nrows = max(4, int(math.ceil((y1 - y0) / pixel_m)))
    
    # Generate arrays holding the exact geographic center point of every grid cell
    grid_x = x0 + (np.arange(ncols) + 0.5) * pixel_m
    grid_y = y1 - (np.arange(nrows) + 0.5) * pixel_m

    density_grid = np.zeros((nrows, ncols), dtype=np.float64)
    radius_squared = radius_m ** 2
    radius_cells = int(math.ceil(radius_m / pixel_m))

    # Iterate over every data point to distribute its influence across the grid
    for i in range(n):
        if weight_array[i] == 0:
            continue
            
        px, py = xs[i], ys[i]
        
        # Calculate exactly which grid cell center this point falls into
        col_f = (px - x0) / pixel_m - 0.5
        row_f = (y1 - py) / pixel_m - 0.5
        
        # Define the subset boundary (bounding box) of grid cells affected by this specific point's radius
        c0 = max(0, int(math.floor(col_f - radius_cells)))
        c1 = min(ncols, int(math.ceil(col_f + radius_cells)) + 1)
        r0 = max(0, int(math.floor(row_f - radius_cells)))
        r1 = min(nrows, int(math.ceil(row_f + radius_cells)) + 1)
        
        if c0 >= c1 or r0 >= r1:
            continue

        # Extract the specific sub-grid and measure the squared distance from the point to each cell center
        sub_grid_x, sub_grid_y = np.meshgrid(grid_x[c0:c1], grid_y[r0:r1])
        distance_squared = (sub_grid_x - px) ** 2 + (sub_grid_y - py) ** 2
        mask = distance_squared <= radius_squared
        
        # Calculate the Quartic (Biweight) Kernel mathematically: K(u) = (3/pi) * (1 - u^2)^2
        u_squared = np.where(mask, distance_squared / radius_squared, 0.0)
        kernel = np.where(
            mask, (3.0 / math.pi) * (1.0 - u_squared) ** 2, 0.0
        )
        
        # Apply the weighted kernel score to our master density grid
        density_grid[r0:r1, c0:c1] += kernel * weight_array[i]

    # Normalize the entire grid on a 0-100 scale based on the highest density peak
    max_density = float(density_grid.max())
    if max_density > 0:
        density_grid = (density_grid / max_density) * 100.0
    density_grid = density_grid.astype(np.float32)
    
    # Package the grid into optimized GeoJSON
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
    """
    Public API: Generate an unweighted density heatmap.
    
    Useful for identifying strict clustering/frequency of events regardless 
    of the event's severity (e.g., sheer volume of accident locations).

    Parameters
    ----------
    lats : list[float]
        Latitude coordinates.
    lons : list[float]
        Longitude coordinates.
    radius_m : float, optional
        Bandwidth (search radius) in meters. Defaults to 500m.
    pixel_m : float, optional
        Grid resolution in meters. Defaults to 25m.
    max_points : int, optional
        Max points in the GeoJSON output. Defaults to 60,000.

    Returns
    -------
    dict | None
        Heatmap dictionary structure with GeoJSON data and metadata.
    """
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
    """
    Public API: Generate a weighted density heatmap.
    
    Useful for visualizing the intensity or severity of events rather than just 
    raw frequency (e.g., weighting accident locations by number of fatalities).

    Parameters
    ----------
    lats : list[float]
        Latitude coordinates.
    lons : list[float]
        Longitude coordinates.
    weights : list[float]
        Severity/magnitude weights applied to each coordinate.
    radius_m : float, optional
        Bandwidth (search radius) in meters. Defaults to 500m.
    pixel_m : float, optional
        Grid resolution in meters. Defaults to 25m.
    max_points : int, optional
        Max points in the GeoJSON output. Defaults to 60,000.

    Returns
    -------
    dict | None
        Heatmap dictionary structure with GeoJSON data and metadata.
    """
    return _compute_kde_grid(
        lats, lons, weights, radius_m, pixel_m, max_points
    )
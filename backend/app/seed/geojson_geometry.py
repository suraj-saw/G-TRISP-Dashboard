"""GeoJSON geometry normalization shared by the Gujarat boundary seeders."""

from __future__ import annotations

from collections.abc import Iterable

from pyproj import Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform


# Survey of India administrative-boundary exports use the national Lambert
# projection, even when a later GeoJSON conversion incorrectly labels the
# unchanged metre coordinates as CRS84/EPSG:4326.
SOI_SOURCE_SRID = 7755

# A deliberately generous extent around Gujarat.  This catches projected
# metre coordinates and axis/CRS mistakes before they reach a 4326 column.
GUJARAT_WGS84_BOUNDS = (68.0, 19.5, 75.0, 25.0)


def _is_geographic(bounds: Iterable[float]) -> bool:
    min_x, min_y, max_x, max_y = bounds
    return (
        -180 <= min_x <= 180
        and -180 <= max_x <= 180
        and -90 <= min_y <= 90
        and -90 <= max_y <= 90
    )


def _drop_z(x, y, z=None):
    """Return a two-dimensional coordinate, including for vectorized calls."""
    return x, y


def normalize_gujarat_geometry(
    geometry: BaseGeometry,
    *,
    source_srid: int = SOI_SOURCE_SRID,
) -> BaseGeometry:
    """Return a valid 2D EPSG:4326 Gujarat geometry.

    Genuine longitude/latitude input is retained. Projected input is treated
    as ``source_srid`` (EPSG:7755 for the supplied SOI files) and transformed.
    Coordinate ranges, rather than the optional GeoJSON ``crs`` member, drive
    this decision because the supplied converted file has incorrect metadata.
    """
    if geometry.is_empty:
        raise ValueError("Geometry is empty.")

    normalized = geometry
    if not _is_geographic(normalized.bounds):
        transformer = Transformer.from_crs(
            f"EPSG:{source_srid}", "EPSG:4326", always_xy=True
        )
        normalized = transform(transformer.transform, normalized)

    # EPSG:4979 input may retain a height ordinate; PostGIS/MapLibre only need
    # the two horizontal WGS84 ordinates for these boundary layers.
    if normalized.has_z:
        normalized = transform(_drop_z, normalized)

    if not normalized.is_valid:
        raise ValueError("Geometry is invalid after CRS normalization.")

    min_x, min_y, max_x, max_y = normalized.bounds
    gj_min_x, gj_min_y, gj_max_x, gj_max_y = GUJARAT_WGS84_BOUNDS
    if not (
        gj_min_x <= min_x <= gj_max_x
        and gj_min_y <= min_y <= gj_max_y
        and gj_min_x <= max_x <= gj_max_x
        and gj_min_y <= max_y <= gj_max_y
    ):
        raise ValueError(
            "Geometry does not fall within Gujarat after CRS normalization: "
            f"bounds={[min_x, min_y, max_x, max_y]}. "
            f"Check the source SRID (currently EPSG:{source_srid})."
        )

    return normalized

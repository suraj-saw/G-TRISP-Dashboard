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


from shapely.geometry import MultiPolygon, Polygon
from shapely.validation import make_valid


def repair_geometry(geometry: BaseGeometry) -> BaseGeometry | None:
    """
    Attempt to repair an invalid geometry using Shapely, without ever
    touching the source file.

    Strategy (first success wins):
      1. Already valid → return as-is.
      2. shapely.validation.make_valid() — handles self-intersections,
         bowties, duplicate points, bad ring orientation, etc.
      3. Classic buffer(0) fallback.
      4. Unrepairable → return None so the caller can skip the feature.
    """
    if geometry.is_empty:
        return None
    if geometry.is_valid:
        return geometry

    try:
        repaired = make_valid(geometry)
        if repaired.is_valid and not repaired.is_empty:
            return repaired
    except Exception:
        pass

    try:
        repaired = geometry.buffer(0)
        if repaired.is_valid and not repaired.is_empty:
            return repaired
    except Exception:
        pass

    return None


def to_multipolygon(geometry: BaseGeometry) -> MultiPolygon | None:
    """
    Normalise a Polygon / MultiPolygon / GeometryCollection into a single
    MultiPolygon so every row in a boundary table has a consistent type.
    Returns None if the geometry has no polygonal parts.
    """
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, Polygon):
        return MultiPolygon([geometry])

    parts = [g for g in getattr(geometry, "geoms", []) if isinstance(g, (Polygon, MultiPolygon))]
    if not parts:
        return None

    flat: list[Polygon] = []
    for g in parts:
        flat.extend(g.geoms if isinstance(g, MultiPolygon) else [g])

    return MultiPolygon(flat) if flat else None
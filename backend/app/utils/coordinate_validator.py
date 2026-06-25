# backend/app/utils/coordinate_validator.py
"""
Coordinate Validation Pipeline
================================
Validates whether accident coordinates lie within Gujarat state / districts
before allowing them to be stored or processed.

Two levels of validation are provided:

  1. State-level  — uses the Gujarat boundary (MultiPolygon, ADM1).
     Fast: one ST_Within call against a single geometry.

  2. District-level — uses the 33 Gujarat district polygons (ADM2).
     Slightly slower but returns the matched district name, which lets us
     auto-correct or confirm the district field of the accident record.

Design
------
- Both levels use PostGIS ST_Within / ST_Contains for authoritative spatial
  checks (not bounding-box heuristics).
- A tolerance buffer (BOUNDARY_TOLERANCE_DEGREES) is applied for points that
  fall exactly on a boundary edge due to floating-point precision.
- Results are returned as typed dataclasses so callers don't have to parse
  raw dicts.
- All DB queries are parameterised — no string interpolation.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Sequence

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.gujarat_boundary import GujaratBoundary
from app.models.gujarat_district import GujaratDistrict
from app.core.config import POSTGIS_SRID
from app.core.constants import BOUNDARY_TOLERANCE_DEGREES

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

class ValidationStatus(str, Enum):
    VALID           = "valid"
    VALID_BOUNDARY  = "valid_boundary"
    OUTSIDE_STATE   = "outside_state"
    NO_DISTRICT     = "no_district"
    INVALID_COORDS  = "invalid_coords"
    DB_ERROR        = "db_error"


@dataclass
class ValidationResult:
    """Returned by validate_coordinate() for a single (lat, lon) pair."""

    latitude:   Optional[float]
    longitude:  Optional[float]

    status:          ValidationStatus
    is_valid:        bool            = False

    matched_district:  Optional[str] = None
    district_shape_id: Optional[str] = None

    message: str = ""

    candidate_districts: list[str] = field(default_factory=list)


@dataclass
class BatchValidationReport:
    """Summary returned by validate_coordinates_batch()."""

    total:           int = 0
    valid:           int = 0
    outside_state:   int = 0
    no_district:     int = 0
    invalid_coords:  int = 0
    db_errors:       int = 0

    failed_indices:  list[int] = field(default_factory=list)
    results: list[ValidationResult] = field(default_factory=list)

    @property
    def valid_rate(self) -> float:
        return self.valid / self.total if self.total else 0.0


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_plausible_wgs84(lat: Optional[float], lon: Optional[float]) -> bool:
    """Quick range check before hitting the DB."""
    if lat is None or lon is None:
        return False
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return False

    if math.isnan(lat_f) or math.isnan(lon_f):
        return False

    return -90.0 <= lat_f <= 90.0 and -180.0 <= lon_f <= 180.0


# ---------------------------------------------------------------------------
# Core: state-level check
# ---------------------------------------------------------------------------

def is_inside_gujarat(
    lat: float,
    lon: float,
    db: Session,
    use_buffer: bool = True,
) -> bool:
    """Return True if the coordinate lies within (or on the boundary of) Gujarat."""
    if use_buffer:
        sql = text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM   gujarat_boundary
                WHERE  ST_Within(
                           ST_Buffer(
                               ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                               :tol
                           ),
                           geometry
                       )
                    OR ST_Within(
                           ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                           ST_Buffer(geometry, :tol)
                       )
            )
            """
        )
    else:
        sql = text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM   gujarat_boundary
                WHERE  ST_Within(
                           ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                           geometry
                       )
            )
            """
        )

    row = db.execute(
        sql,
        {"lat": lat, "lon": lon, "srid": POSTGIS_SRID, "tol": BOUNDARY_TOLERANCE_DEGREES},
    ).fetchone()

    return bool(row[0]) if row else False


# ---------------------------------------------------------------------------
# Core: district-level check
# ---------------------------------------------------------------------------

def find_district(
    lat: float,
    lon: float,
    db: Session,
    use_buffer: bool = True,
) -> list[dict]:
    """
    Return a list of matching districts for the coordinate.

    Normally returns 0 or 1 items. Returns >1 when a point lies exactly on
    a shared district boundary (extremely rare in practice).

    Each item has keys: shape_name, shape_id.
    """
    if use_buffer:
        sql = text(
            """
            SELECT shape_name, shape_id
            FROM   gujarat_districts
            WHERE  ST_Within(
                       ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                       ST_Buffer(geometry, :tol)
                   )
            ORDER BY shape_name
            """
        )
    else:
        sql = text(
            """
            SELECT shape_name, shape_id
            FROM   gujarat_districts
            WHERE  ST_Within(
                       ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                       geometry
                   )
            ORDER BY shape_name
            """
        )

    rows = db.execute(
        sql,
        {"lat": lat, "lon": lon, "srid": POSTGIS_SRID, "tol": BOUNDARY_TOLERANCE_DEGREES},
    ).fetchall()

    return [{"shape_name": r[0], "shape_id": r[1]} for r in rows]


# ---------------------------------------------------------------------------
# Public: single-record validation
# ---------------------------------------------------------------------------

def validate_coordinate(
    lat: Optional[float],
    lon: Optional[float],
    db: Session,
    check_district: bool = True,
) -> ValidationResult:
    """
    Validate a single (latitude, longitude) pair.

    Parameters
    ----------
    lat, lon        : Coordinate to validate.
    db              : Active SQLAlchemy session.
    check_district  : If True (default), also resolve the matched district.
                      Set to False for a faster state-only check.
    """
    base = ValidationResult(
        latitude=lat,
        longitude=lon,
        status=ValidationStatus.INVALID_COORDS,
    )

    if not _is_plausible_wgs84(lat, lon):
        base.message = (
            f"Coordinate ({lat}, {lon}) is None, NaN, or outside valid WGS-84 range."
        )
        return base

    lat_f = float(lat)  # type: ignore[arg-type]
    lon_f = float(lon)  # type: ignore[arg-type]

    try:
        inside_state = is_inside_gujarat(lat_f, lon_f, db)

        if not inside_state:
            return ValidationResult(
                latitude=lat,
                longitude=lon,
                status=ValidationStatus.OUTSIDE_STATE,
                is_valid=False,
                message=f"Coordinate ({lat_f}, {lon_f}) lies outside the Gujarat state boundary.",
            )

        if not check_district:
            return ValidationResult(
                latitude=lat,
                longitude=lon,
                status=ValidationStatus.VALID,
                is_valid=True,
                message="Coordinate is inside Gujarat (district check skipped).",
            )

        districts = find_district(lat_f, lon_f, db)

        if not districts:
            return ValidationResult(
                latitude=lat,
                longitude=lon,
                status=ValidationStatus.NO_DISTRICT,
                is_valid=True,
                message=(
                    f"Coordinate ({lat_f}, {lon_f}) is inside Gujarat but could "
                    "not be matched to any district polygon. Possible coastal/gap area."
                ),
            )

        primary          = districts[0]
        candidate_names  = [d["shape_name"] for d in districts]
        status           = (
            ValidationStatus.VALID_BOUNDARY if len(districts) > 1 else ValidationStatus.VALID
        )

        msg = f"Coordinate ({lat_f}, {lon_f}) is valid — district: {primary['shape_name']}."
        if len(districts) > 1:
            msg += f" (On boundary with: {', '.join(candidate_names[1:])})"

        return ValidationResult(
            latitude=lat,
            longitude=lon,
            status=status,
            is_valid=True,
            matched_district=primary["shape_name"],
            district_shape_id=primary["shape_id"],
            candidate_districts=candidate_names,
            message=msg,
        )

    except Exception as exc:
        logger.exception(
            "PostGIS error while validating coordinate (%s, %s): %s", lat, lon, exc
        )
        return ValidationResult(
            latitude=lat,
            longitude=lon,
            status=ValidationStatus.DB_ERROR,
            is_valid=False,
            message=f"Database / PostGIS error: {exc}",
        )


# ---------------------------------------------------------------------------
# Public: batch validation
# ---------------------------------------------------------------------------

def validate_coordinates_batch(
    coordinates: Sequence[tuple[Optional[float], Optional[float]]],
    db: Session,
    check_district: bool = True,
    log_progress_every: int = 500,
) -> BatchValidationReport:
    """Validate a sequence of (lat, lon) tuples in one call."""
    report = BatchValidationReport(total=len(coordinates))

    for idx, (lat, lon) in enumerate(coordinates):
        if log_progress_every and idx > 0 and idx % log_progress_every == 0:
            logger.info(
                "validate_coordinates_batch: processed %d / %d …", idx, report.total
            )

        result = validate_coordinate(lat, lon, db, check_district=check_district)
        report.results.append(result)

        if result.is_valid:
            report.valid += 1
        else:
            report.failed_indices.append(idx)
            if result.status == ValidationStatus.OUTSIDE_STATE:
                report.outside_state += 1
            elif result.status == ValidationStatus.INVALID_COORDS:
                report.invalid_coords += 1
            elif result.status == ValidationStatus.DB_ERROR:
                report.db_errors += 1

    logger.info(
        "validate_coordinates_batch complete: %d/%d valid (%.1f%%), "
        "%d outside-state, %d invalid-coords, %d db-errors.",
        report.valid,
        report.total,
        report.valid_rate * 100,
        report.outside_state,
        report.invalid_coords,
        report.db_errors,
    )

    return report


# ---------------------------------------------------------------------------
# Public: pandas DataFrame integration
# ---------------------------------------------------------------------------

def validate_dataframe(
    df,
    lat_col: str = "Latitude",
    lon_col: str = "Longitude",
    db: Session = None,
    check_district: bool = True,
    add_columns: bool = True,
) -> tuple:
    """
    Validate all rows in a pandas DataFrame and return:
        (valid_df, rejected_df, report)
    """
    import pandas as pd

    coords = list(zip(df[lat_col].tolist(), df[lon_col].tolist()))
    report = validate_coordinates_batch(coords, db, check_district=check_district)

    if add_columns:
        df = df.copy()
        df["_validation_status"]  = [r.status.value    for r in report.results]
        df["_matched_district"]   = [r.matched_district for r in report.results]
        df["_validation_message"] = [r.message          for r in report.results]

    valid_mask  = pd.Series([r.is_valid for r in report.results], index=df.index)
    valid_df    = df[valid_mask].copy()
    rejected_df = df[~valid_mask].copy()

    return valid_df, rejected_df, report


# ---------------------------------------------------------------------------
# Convenience: pre-flight check
# ---------------------------------------------------------------------------

def check_validation_tables_ready(db: Session) -> dict:
    """
    Verify that both spatial tables are populated before attempting validation.

    Returns a dict: {"ready": bool, "boundary_rows": int, "district_rows": int}
    """
    boundary_count = db.query(GujaratBoundary).count()
    district_count = db.query(GujaratDistrict).count()
    return {
        "ready":         boundary_count > 0 and district_count > 0,
        "boundary_rows": boundary_count,
        "district_rows": district_count,
    }
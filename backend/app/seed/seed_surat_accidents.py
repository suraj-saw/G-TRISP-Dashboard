# backend/app/seed/seed_surat_accidents.py
"""
Seeder script to parse Surat City 2023-2026 overall data and insert it
into the surat_accidents table, validating that coordinates fall within
the Surat boundary.

Run directly:
    python -m app.seed.seed_surat_accidents
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import pandas as pd
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import text
from sqlalchemy.orm import Session

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.database import Base, engine, SessionLocal
from app.models.surat_accident import SuratAccident
from app.core.config import POSTGIS_SRID
from app.core.constants import (
    BOUNDARY_TOLERANCE_DEGREES,
    DEFAULT_SEED_BATCH_SIZE,
    NULL_TEXT_SENTINEL,
)
from app.utils.datetime_utils import parse_accident_datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_surat_accidents")

# ── file config ───────────────────────────────────────────────────────────────
_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DEFAULT_DATA_FILE = _BACKEND_DIR / "data" / "Surat City 2023-2026 overall data.xlsx"
DATA_FILE  = Path(os.getenv("SURAT_ACCIDENT_DATASET_PATH", str(DEFAULT_DATA_FILE))).resolve()
CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", str(DEFAULT_SEED_BATCH_SIZE)))

# ── Column mapping ────────────────────────────────────────────────────────────
COLUMN_MAP: dict[str, str] = {
    "Accident ID":                  "accident_id",
    "District":                     "district",
    "Police Station":               "police_station",
    "Accident Date Time":           "accident_date_time",
    "Latitude":                     "latitude",
    "Longitude":                    "longitude",
    "Road Name":                    "road_name",
    "Road Classification":          "road_classification",
    "Severity of the Accident":     "severity",
    "No of Vehicles Involved":      "number_of_vehicles",
    "Drivers Killed":               "driver_killed",
    "Drivers Grievous Injury":      "driver_grievous_injury",
    "Drivers Minor Injury":         "driver_minor_injury",
    "Passengers Killed":            "passenger_killed",
    "Passengers Grievous Injury":   "passenger_grievous_injury",
    "Passengers Minor Injury":      "passenger_minor_injury",
    "Pedestrian Killed":            "pedestrian_killed",
    "Pedestrian Grievous Injury":   "pedestrian_grievous_injury",
    "Pedestrian Minor Injury":      "pedestrian_minor_injury",
    "Collision Type":               "type_of_collision",
    "Collision Nature":             "collision_feature",
    "Weather Condition":            "weather_condition",
    "Light Condition":              "light_condition",
    "Visibility":                   "visibility",
    "Traffic Violation":            "traffic_violation",
}


# ── Cleaners ──────────────────────────────────────────────────────────────────

def _clean_text(value) -> str | None:
    if pd.isna(value):
        return None
    s = str(value).strip()
    return None if s == "" or s.lower() == NULL_TEXT_SENTINEL else s


def _clean_int_zero(value) -> int:
    """Validate numerical columns; blank values or errors default to 0."""
    if pd.isna(value):
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _clean_float(value) -> float | None:
    if pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _make_point(lat: float | None, lon: float | None):
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None


# ── Spatial validation ────────────────────────────────────────────────────────

def is_inside_surat(lat: float, lon: float, db: Session) -> bool:
    """
    Returns True if coordinates lie within the Surat Boundary.
    Checks the `surat_boundary` table first, falling back to `gujarat_districts`.

    Tolerance value comes from BOUNDARY_TOLERANCE_DEGREES so there is a single
    place to adjust the buffer if needed.
    """
    params = {
        "lat": lat,
        "lon": lon,
        "srid": POSTGIS_SRID,
        "tol": BOUNDARY_TOLERANCE_DEGREES,
    }

    # Option A: Check surat_boundary table
    try:
        sql = text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM   surat_boundary
                WHERE  ST_Within(
                           ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                           ST_Buffer(geometry, :tol)
                       )
            )
            """
        )
        row = db.execute(sql, params).fetchone()
        if row and row[0]:
            return True
    except Exception:
        pass

    # Option B: Fallback to checking the gujarat_districts table (for "Surat")
    try:
        sql = text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM   gujarat_districts
                WHERE  LOWER(shape_name) LIKE '%surat%'
                  AND  ST_Within(
                           ST_SetSRID(ST_MakePoint(:lon, :lat), :srid),
                           ST_Buffer(geometry, :tol)
                       )
            )
            """
        )
        row = db.execute(sql, params).fetchone()
        return bool(row[0]) if row else False
    except Exception:
        return False


def _validate_coordinates(df: pd.DataFrame, db: Session) -> tuple[pd.DataFrame, int]:
    logger.info("Running coordinate validation against Surat boundaries…")
    valid_mask = []

    for _, row in df.iterrows():
        lat = _clean_float(row["latitude"])
        lon = _clean_float(row["longitude"])

        if lat is None or lon is None:
            valid_mask.append(False)
            continue

        valid_mask.append(is_inside_surat(lat, lon, db))

    valid_df = df[valid_mask].copy()
    rejected = len(df) - len(valid_df)

    logger.info(
        "Validation complete — valid: %d, rejected: %d (%.1f%%)",
        len(valid_df), rejected,
        (rejected / len(df) * 100) if len(df) else 0,
    )
    return valid_df, rejected


# ── Loader & Seeder ───────────────────────────────────────────────────────────

def _load_dataset() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError(f"Dataset not found at:\n  {DATA_FILE}")

    logger.info("Reading dataset: %s", DATA_FILE)
    df = pd.read_excel(DATA_FILE)

    missing = set(COLUMN_MAP.keys()) - set(df.columns)
    if missing:
        raise ValueError(
            f"The following expected columns are missing from the dataset:\n  {sorted(missing)}"
        )

    df = df.rename(columns=COLUMN_MAP)

    # Use the shared datetime parser — no more duplicate format lists
    raw_datetime = df["accident_date_time"].copy()
    df["accident_date_time"] = raw_datetime.apply(parse_accident_datetime)

    parsed_count = int(df["accident_date_time"].notna().sum())
    logger.info(
        "Parsed accident_date_time for %d / %d rows.",
        parsed_count,
        len(df),
    )
    if parsed_count == 0:
        logger.warning(
            "No accident_date_time values parsed. Sample raw values: %s",
            raw_datetime.head(10).tolist(),
        )

    logger.info("Loaded %d rows, %d columns.", len(df), len(df.columns))
    return df


def _build_accident(row) -> SuratAccident:
    lat = _clean_float(row["latitude"])
    lon = _clean_float(row["longitude"])

    return SuratAccident(
        accident_id         = _clean_text(row["accident_id"]),
        district            = _clean_text(row["district"]),
        police_station      = _clean_text(row["police_station"]),
        accident_date_time  = row["accident_date_time"] if not pd.isna(row["accident_date_time"]) else None,
        latitude            = lat,
        longitude           = lon,
        location            = _make_point(lat, lon),
        road_name           = _clean_text(row["road_name"]),
        road_classification = _clean_text(row["road_classification"]),
        severity            = _clean_text(row["severity"]),
        number_of_vehicles  = _clean_int_zero(row["number_of_vehicles"]),

        driver_killed          = _clean_int_zero(row["driver_killed"]),
        driver_grievous_injury = _clean_int_zero(row["driver_grievous_injury"]),
        driver_minor_injury    = _clean_int_zero(row["driver_minor_injury"]),

        passenger_killed          = _clean_int_zero(row["passenger_killed"]),
        passenger_grievous_injury = _clean_int_zero(row["passenger_grievous_injury"]),
        passenger_minor_injury    = _clean_int_zero(row["passenger_minor_injury"]),

        pedestrian_killed          = _clean_int_zero(row["pedestrian_killed"]),
        pedestrian_grievous_injury = _clean_int_zero(row["pedestrian_grievous_injury"]),
        pedestrian_minor_injury    = _clean_int_zero(row["pedestrian_minor_injury"]),

        type_of_collision = _clean_text(row["type_of_collision"]),
        collision_feature = _clean_text(row["collision_feature"]),
        weather_condition = _clean_text(row["weather_condition"]),
        light_condition   = _clean_text(row["light_condition"]),
        visibility        = _clean_text(row["visibility"]),
        traffic_violation = _clean_text(row["traffic_violation"]),
    )


def seed_surat_accidents(force: bool = False, skip_validation: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(SuratAccident).count()

        if existing > 0 and not force:
            logger.info(
                "Table already contains %d rows — skipping. Pass --force to re-seed.",
                existing,
            )
            return

        if force and existing > 0:
            logger.info("force=True — deleting %d existing rows …", existing)
            db.query(SuratAccident).delete()
            db.commit()

        df = _load_dataset()

        if skip_validation:
            valid_df = df
            rejected_count = 0
        else:
            valid_df, rejected_count = _validate_coordinates(df, db)

        total = len(valid_df)
        logger.info("Inserting %d Surat accident records in batches of %d …", total, CHUNK_SIZE)

        inserted = 0
        for start in range(0, total, CHUNK_SIZE):
            chunk   = valid_df.iloc[start : start + CHUNK_SIZE]
            objects = [_build_accident(row) for _, row in chunk.iterrows()]
            db.bulk_save_objects(objects)
            db.commit()
            inserted += len(objects)
            logger.info("  Inserted %d / %d", inserted, total)

        logger.info(
            "✓ Seed complete — %d inserted, %d rejected (outside Surat boundary).",
            inserted, rejected_count,
        )

    except Exception:
        db.rollback()
        logger.exception("Seed failed — transaction rolled back.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed Surat accident data from Excel into the database."
    )
    parser.add_argument("--force", action="store_true", help="Delete existing rows and re-seed.")
    parser.add_argument("--skip-validation", action="store_true", help="Skip coordinate boundary checks.")
    args = parser.parse_args()

    seed_surat_accidents(force=args.force, skip_validation=args.skip_validation)
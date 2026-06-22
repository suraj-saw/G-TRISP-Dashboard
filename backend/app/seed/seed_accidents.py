# backend/app/seed/seed_accidents.py
"""
Accident Data Seeder
====================
Seeds accident records from the Excel dataset into the `accidents` table.

Each row is:
  - Validated against the Gujarat state boundary (PostGIS ST_Within)
  - Enriched with the matched district name from PostGIS if the record's
    own district field needs correction
  - Inserted in configurable batch sizes (default 500) for memory safety

Usage:
    python -m app.seed.seed_accidents            # skip if already seeded
    python -m app.seed.seed_accidents --force    # drop all rows and re-seed
    python -m app.seed.seed_accidents --skip-validation  # skip PostGIS check

Environment variables (all optional – sensible defaults provided):
    ACCIDENT_DATASET_PATH     path to the .xlsx file
                              default: backend/data/accident_dummy_data.xlsx
    SEED_BATCH_SIZE           rows per DB commit   (default: 500)
    ACCIDENT_DATETIME_COLUMN  column name          (default: Accident_DateTime)
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
from sqlalchemy.orm import Session

# ── make sure the backend root is importable when run directly ────────────────
_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.database import Base, engine, SessionLocal
from app.models.accident import Accident
from app.core.config import POSTGIS_SRID
from app.utils.coordinate_validator import (
    validate_coordinates_batch,
    ValidationStatus,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_accidents")

# ── file / env config ─────────────────────────────────────────────────────────

_THIS_DIR    = Path(__file__).resolve().parent       # app/seed/
_APP_DIR     = _THIS_DIR.parent                      # app/
_BACKEND_DIR = _APP_DIR.parent                       # backend/

DEFAULT_DATA_FILE = _BACKEND_DIR / "data" / "accident_dummy_data.xlsx"

DATA_FILE = Path(
    os.getenv("ACCIDENT_DATASET_PATH", str(DEFAULT_DATA_FILE))
).resolve()

CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", "500"))
DATE_COLUMN = os.getenv("ACCIDENT_DATETIME_COLUMN", "Accident_DateTime")

REQUIRED_COLUMNS = {
    "Accident_ID", "District", "Police_Station", "Accident_DateTime",
    "Latitude", "Longitude", "Road_Name", "Road_Classification",
    "Severity", "No_of_Vehicles",
    "Drivers_Killed", "Drivers_Grievous_Injury", "Drivers_Minor_Injury",
    "Passengers_Killed", "Passengers_Grievous_Injury", "Passengers_Minor_Injury",
    "Pedestrians_Killed", "Pedestrians_Grievous_Injury", "Pedestrians_Minor_Injury",
    "Collision_Type", "Collision_Feature",
    "Weather_Condition", "Light_Condition", "Visibility",
    "Traffic_Violation",
}


# ── helpers ───────────────────────────────────────────────────────────────────

def _clean_text(value) -> str | None:
    """Return None for NaN / empty / literal 'nan' strings."""
    if pd.isna(value):
        return None
    s = str(value).strip()
    return None if s == "" or s.lower() == "nan" else s


def _clean_int(value) -> int | None:
    if pd.isna(value):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _clean_float(value) -> float | None:
    if pd.isna(value):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _make_point(lat: float | None, lon: float | None):
    """Return a PostGIS WKBElement or None if coordinates are missing."""
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None


# ── dataset loader ────────────────────────────────────────────────────────────

def _load_dataset() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Dataset not found at:\n  {DATA_FILE}\n"
            "Set ACCIDENT_DATASET_PATH env var or place the file at the default path."
        )

    logger.info("Reading dataset: %s", DATA_FILE)
    df = pd.read_excel(DATA_FILE)

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns in dataset: {sorted(missing)}")

    df[DATE_COLUMN] = pd.to_datetime(df[DATE_COLUMN], errors="coerce", dayfirst=True)

    logger.info("Loaded %d rows, %d columns.", len(df), len(df.columns))
    return df


# ── row → ORM model ──────────────────────────────────────────────────────────

def _build_accident(row) -> Accident:
    lat = _clean_float(row["Latitude"])
    lon = _clean_float(row["Longitude"])
    location = _make_point(lat, lon)

    return Accident(
        accident_id=_clean_text(row["Accident_ID"]),
        district=_clean_text(row["District"]),
        police_station=_clean_text(row["Police_Station"]),
        accident_datetime=row[DATE_COLUMN] if not pd.isna(row[DATE_COLUMN]) else None,
        latitude=lat,
        longitude=lon,
        location=location,
        road_name=_clean_text(row["Road_Name"]),
        road_classification=_clean_text(row["Road_Classification"]),
        severity=_clean_text(row["Severity"]),
        no_of_vehicles=_clean_int(row["No_of_Vehicles"]),
        drivers_killed=_clean_int(row["Drivers_Killed"]),
        drivers_grievous_injury=_clean_int(row["Drivers_Grievous_Injury"]),
        drivers_minor_injury=_clean_int(row["Drivers_Minor_Injury"]),
        passengers_killed=_clean_int(row["Passengers_Killed"]),
        passengers_grievous_injury=_clean_int(row["Passengers_Grievous_Injury"]),
        passengers_minor_injury=_clean_int(row["Passengers_Minor_Injury"]),
        pedestrians_killed=_clean_int(row["Pedestrians_Killed"]),
        pedestrians_grievous_injury=_clean_int(row["Pedestrians_Grievous_Injury"]),
        pedestrians_minor_injury=_clean_int(row["Pedestrians_Minor_Injury"]),
        collision_type=_clean_text(row["Collision_Type"]),
        collision_feature=_clean_text(row["Collision_Feature"]),
        weather_condition=_clean_text(row["Weather_Condition"]),
        light_condition=_clean_text(row["Light_Condition"]),
        visibility=_clean_text(row["Visibility"]),
        traffic_violation=_clean_text(row["Traffic_Violation"]),
    )


# ── PostGIS coordinate validation ────────────────────────────────────────────

def _validate_coordinates(
    df: pd.DataFrame,
    db: Session,
) -> tuple[pd.DataFrame, int]:
    """
    Run PostGIS validation against the gujarat_boundary table.
    Returns (valid_df, rejected_count).
    """
    logger.info("Running PostGIS coordinate validation …")
    coords = list(zip(df["Latitude"].tolist(), df["Longitude"].tolist()))
    report = validate_coordinates_batch(
        coords,
        db,
        check_district=False,   # state-level only — fast enough for 1 500 rows
        log_progress_every=500,
    )

    valid_mask = [r.is_valid for r in report.results]
    valid_df = df[[m for m in valid_mask]].copy()   # boolean index via list
    # rebuild properly
    valid_df = df[valid_mask].copy()

    # Enrich district from PostGIS where the record's own district is blank
    for idx, result in enumerate(report.results):
        if result.is_valid and result.matched_district:
            original_district = _clean_text(df.iloc[idx]["District"])
            if not original_district and result.matched_district:
                valid_df.at[df.index[idx], "District"] = result.matched_district

    rejected = len(df) - len(valid_df)
    logger.info(
        "Validation complete — valid: %d, rejected: %d (%.1f%%)",
        len(valid_df),
        rejected,
        (rejected / len(df) * 100) if len(df) else 0,
    )
    logger.info(
        "  outside-state: %d, invalid-coords: %d, db-errors: %d",
        report.outside_state,
        report.invalid_coords,
        report.db_errors,
    )
    return valid_df, rejected


# ── main seeder ───────────────────────────────────────────────────────────────

def seed_accidents(
    force: bool = False,
    skip_validation: bool = False,
) -> None:
    """
    Seed accident records into the `accidents` table.

    Parameters
    ----------
    force            : Drop existing rows and re-seed from scratch.
    skip_validation  : Skip PostGIS coordinate validation (faster, less safe).
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(Accident).count()

        if existing > 0 and not force:
            logger.info(
                "Table already contains %d rows — skipping. "
                "Pass --force to re-seed.",
                existing,
            )
            return

        if force and existing > 0:
            logger.info("force=True — deleting %d existing rows …", existing)
            db.query(Accident).delete()
            db.commit()

        # ── load ──────────────────────────────────────────────────────────────
        df = _load_dataset()
        total_raw = len(df)

        # ── validate ──────────────────────────────────────────────────────────
        if skip_validation:
            logger.warning(
                "Coordinate validation SKIPPED — all %d rows will be inserted.",
                total_raw,
            )
            valid_df = df
            rejected_count = 0
        else:
            valid_df, rejected_count = _validate_coordinates(df, db)

        total = len(valid_df)
        logger.info("Inserting %d accident records in batches of %d …", total, CHUNK_SIZE)

        # ── insert in batches ─────────────────────────────────────────────────
        inserted = 0
        for start in range(0, total, CHUNK_SIZE):
            chunk = valid_df.iloc[start : start + CHUNK_SIZE]
            objects = [_build_accident(row) for _, row in chunk.iterrows()]
            db.bulk_save_objects(objects)
            db.commit()
            inserted += len(objects)
            logger.info("  Inserted %d / %d", inserted, total)

        logger.info(
            "✓ Seed complete — %d inserted, %d rejected (outside Gujarat / bad coords).",
            inserted,
            rejected_count,
        )

    except Exception:
        db.rollback()
        logger.exception("Seed failed — transaction rolled back.")
        raise
    finally:
        db.close()


# ── CLI ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed accident data from Excel into the accidents table."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and re-seed.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip PostGIS coordinate validation (faster).",
    )
    args = parser.parse_args()

    seed_accidents(force=args.force, skip_validation=args.skip_validation)
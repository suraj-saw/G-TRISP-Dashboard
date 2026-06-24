# backend/app/seed/seed_accidents.py
"""
Accident Data Seeder
====================
Seeds accident records from the Excel dataset into the `accidents` table.

The seeder contains a COLUMN_MAP that translates whatever column headers
exist in the Excel file into the iRAD-aligned internal field names used by
the Accident model.  Only this map needs to change if the spreadsheet is
ever renamed — no logic elsewhere is touched.

Each row is:
  - Validated against the Gujarat state boundary (PostGIS ST_Within)
  - Enriched with the matched district name from PostGIS if the record's
    own district field is blank
  - Inserted in configurable batch sizes (default 500) for memory safety

Usage:
    python -m app.seed.seed_accidents            # skip if already seeded
    python -m app.seed.seed_accidents --force    # drop all rows and re-seed
    python -m app.seed.seed_accidents --skip-validation  # skip PostGIS check

Environment variables (all optional – sensible defaults provided):
    ACCIDENT_DATASET_PATH   path to the .xlsx file
                            default: backend/data/accident_dummy_data.xlsx
    SEED_BATCH_SIZE         rows per DB commit  (default: 500)
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
from app.utils.coordinate_validator import validate_coordinates_batch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_accidents")

# ── file / env config ─────────────────────────────────────────────────────────

_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DEFAULT_DATA_FILE = _BACKEND_DIR / "data" / "accident_dummy_data.xlsx"

DATA_FILE  = Path(os.getenv("ACCIDENT_DATASET_PATH", str(DEFAULT_DATA_FILE))).resolve()
CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", "500"))

# ── Column mapping ────────────────────────────────────────────────────────────
# Maps Excel column headers  →  iRAD internal field names (Accident model attrs).
# Edit only this dict if the spreadsheet is ever re-exported with different headers.
#
# Key   = exact column header as it appears in the Excel file
# Value = Accident model attribute name (iRAD-aligned)
COLUMN_MAP: dict[str, str] = {
    # Identification
    "Accident_ID":    "accident_id",
    "District":       "district",
    "Police_Station": "police_station",

    # Date & Time  (iRAD: "Accident Date & Time")
    "Accident_DateTime": "accident_date_time",

    # Location
    "Latitude":             "latitude",
    "Longitude":            "longitude",
    "Road_Name":            "road_name",
    "Road_Classification":  "road_classification",

    # Severity & vehicles
    "Severity":       "severity",
    "No_of_Vehicles": "number_of_vehicles",  # iRAD: "Number of Vehicle(s)"

    # Driver casualties  (iRAD: "Number of Driver(s) impacted")
    "Drivers_Killed":           "driver_killed",
    "Drivers_Grievous_Injury":  "driver_grievous_injury",
    "Drivers_Minor_Injury":     "driver_minor_injury",

    # Passenger casualties  (iRAD: "Number of Passenger(s) impacted")
    "Passengers_Killed":           "passenger_killed",
    "Passengers_Grievous_Injury":  "passenger_grievous_injury",
    "Passengers_Minor_Injury":     "passenger_minor_injury",

    # Pedestrian casualties  (iRAD: "Number of Pedestrian(s) impacted")
    "Pedestrians_Killed":           "pedestrian_killed",
    "Pedestrians_Grievous_Injury":  "pedestrian_grievous_injury",
    "Pedestrians_Minor_Injury":     "pedestrian_minor_injury",

    # Collision  (iRAD: "Type of Collision")
    "Collision_Type":    "type_of_collision",
    "Collision_Feature": "collision_feature",

    # Conditions
    "Weather_Condition": "weather_condition",
    "Light_Condition":   "light_condition",
    "Visibility":        "visibility",
    "Traffic_Violation": "traffic_violation",
}

# Derive the reverse map (iRAD field → normalised column in the renamed df)
_IRAD_TO_INTERNAL = {v: v for v in COLUMN_MAP.values()}


# ── helpers ───────────────────────────────────────────────────────────────────

def _clean_text(value) -> str | None:
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
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None

def _parse_accident_datetime(value):
    if pd.isna(value):
        return None

    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()

    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None

    formats = [
        "%d-%b-%Y : %I:%M %p",  # 17-Jan-2023 : 11:00 AM
        "%d-%b-%Y: %I:%M %p",
        "%d-%b-%Y %I:%M %p",
        "%d/%m/%Y : %I:%M %p",
        "%d-%m-%Y : %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in formats:
        parsed = pd.to_datetime(text, format=fmt, errors="coerce")
        if not pd.isna(parsed):
            return parsed.to_pydatetime()

    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return None

    return parsed.to_pydatetime()

# ── dataset loader ────────────────────────────────────────────────────────────

def _load_dataset() -> pd.DataFrame:
    """
    Read the Excel file and rename its columns to iRAD internal field names
    via COLUMN_MAP.  Raises clearly if required columns are absent.
    """
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Dataset not found at:\n  {DATA_FILE}\n"
            "Set ACCIDENT_DATASET_PATH env var or place the file at the default path."
        )

    logger.info("Reading dataset: %s", DATA_FILE)
    df = pd.read_excel(DATA_FILE)

    # Check that every mapped source column is present
    missing = set(COLUMN_MAP.keys()) - set(df.columns)
    if missing:
        raise ValueError(
            f"The following expected Excel columns are missing from the dataset:\n"
            f"  {sorted(missing)}\n"
            "Update COLUMN_MAP in seed_accidents.py to match your spreadsheet headers."
        )

    # Rename Excel headers → iRAD internal field names
    df = df.rename(columns=COLUMN_MAP)

    # Parse datetime using the iRAD field name (after rename)
    df["accident_date_time"] = df["accident_date_time"].apply(_parse_accident_datetime)

    parsed_count = df["accident_date_time"].notna().sum()
    logger.info(
        "Parsed accident_date_time for %d / %d rows.",
        parsed_count,
        len(df),
    )
    return df


# ── row → ORM model ──────────────────────────────────────────────────────────

def _build_accident(row) -> Accident:
    """
    Convert a DataFrame row (already renamed to iRAD field names) into an
    Accident ORM object.  All type coercion happens here; no raw column names
    from the Excel are referenced.
    """
    lat = _clean_float(row["latitude"])
    lon = _clean_float(row["longitude"])

    return Accident(
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
        number_of_vehicles  = _clean_int(row["number_of_vehicles"]),

        # Driver casualties
        driver_killed          = _clean_int(row["driver_killed"]),
        driver_grievous_injury = _clean_int(row["driver_grievous_injury"]),
        driver_minor_injury    = _clean_int(row["driver_minor_injury"]),

        # Passenger casualties
        passenger_killed          = _clean_int(row["passenger_killed"]),
        passenger_grievous_injury = _clean_int(row["passenger_grievous_injury"]),
        passenger_minor_injury    = _clean_int(row["passenger_minor_injury"]),

        # Pedestrian casualties
        pedestrian_killed          = _clean_int(row["pedestrian_killed"]),
        pedestrian_grievous_injury = _clean_int(row["pedestrian_grievous_injury"]),
        pedestrian_minor_injury    = _clean_int(row["pedestrian_minor_injury"]),

        type_of_collision = _clean_text(row["type_of_collision"]),
        collision_feature = _clean_text(row["collision_feature"]),
        weather_condition = _clean_text(row["weather_condition"]),
        light_condition   = _clean_text(row["light_condition"]),
        visibility        = _clean_text(row["visibility"]),
        traffic_violation = _clean_text(row["traffic_violation"]),
    )


# ── PostGIS coordinate validation ─────────────────────────────────────────────

def _validate_coordinates(
    df: pd.DataFrame,
    db: Session,
) -> tuple[pd.DataFrame, int]:
    """
    Run PostGIS validation against the gujarat_boundary table.
    df columns are already renamed to iRAD internal names.
    Returns (valid_df, rejected_count).
    """
    logger.info("Running PostGIS coordinate validation …")
    coords = list(zip(df["latitude"].tolist(), df["longitude"].tolist()))
    report = validate_coordinates_batch(
        coords,
        db,
        check_district=False,
        log_progress_every=500,
    )

    valid_mask = [r.is_valid for r in report.results]
    valid_df   = df[valid_mask].copy()

    # Enrich blank district values from PostGIS spatial join
    for idx, result in enumerate(report.results):
        if result.is_valid and result.matched_district:
            if not _clean_text(df.iloc[idx]["district"]):
                valid_df.at[df.index[idx], "district"] = result.matched_district

    rejected = len(df) - len(valid_df)
    logger.info(
        "Validation complete — valid: %d, rejected: %d (%.1f%%)",
        len(valid_df), rejected,
        (rejected / len(df) * 100) if len(df) else 0,
    )
    logger.info(
        "  outside-state: %d, invalid-coords: %d, db-errors: %d",
        report.outside_state, report.invalid_coords, report.db_errors,
    )
    return valid_df, rejected


# ── main seeder ───────────────────────────────────────────────────────────────

def seed_accidents(
    force: bool = False,
    skip_validation: bool = False,
) -> None:
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

        df        = _load_dataset()
        total_raw = len(df)

        if skip_validation:
            logger.warning(
                "Coordinate validation SKIPPED — all %d rows will be inserted.",
                total_raw,
            )
            valid_df      = df
            rejected_count = 0
        else:
            valid_df, rejected_count = _validate_coordinates(df, db)

        total = len(valid_df)
        logger.info("Inserting %d accident records in batches of %d …", total, CHUNK_SIZE)

        inserted = 0
        for start in range(0, total, CHUNK_SIZE):
            chunk   = valid_df.iloc[start : start + CHUNK_SIZE]
            objects = [_build_accident(row) for _, row in chunk.iterrows()]
            db.bulk_save_objects(objects)
            db.commit()
            inserted += len(objects)
            logger.info("  Inserted %d / %d", inserted, total)

        logger.info(
            "✓ Seed complete — %d inserted, %d rejected (outside Gujarat / bad coords).",
            inserted, rejected_count,
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
    parser.add_argument("--force", action="store_true",
                        help="Delete existing rows and re-seed.")
    parser.add_argument("--skip-validation", action="store_true",
                        help="Skip PostGIS coordinate validation (faster).")
    args = parser.parse_args()
    seed_accidents(force=args.force, skip_validation=args.skip_validation)
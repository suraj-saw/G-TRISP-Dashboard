# backend/app/seed/seed_gujarat_accidents.py
"""
Unified multi-district accident seeder.

Loads every district's "<District> 2023-2026 overall data.xlsx" file and
inserts all rows into the single shared `accidents` table (the Accident
model), instead of each district living in its own table.

The column layout in these files is identical to the one used by
seed_surat_accidents.py ("Accident ID", "District", "Police Station", ...),
so we reuse that exact COLUMN_MAP.

Usage:
    python -m app.seed.seed_gujarat_accidents                 # skip if already seeded
    python -m app.seed.seed_gujarat_accidents --force         # wipe accidents table and re-seed everything
    python -m app.seed.seed_gujarat_accidents --skip-validation
    python -m app.seed.seed_gujarat_accidents --only surat,rajkot
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import uuid
from pathlib import Path

import pandas as pd
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.orm import Session

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.database import Base, engine, SessionLocal
from app.models.accident import Accident
from app.core.config import POSTGIS_SRID
from app.core.constants import NULL_TEXT_SENTINEL, DEFAULT_SEED_BATCH_SIZE
from app.utils.datetime_utils import parse_accident_datetime
from app.utils.coordinate_validator import validate_coordinates_batch

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_gujarat_accidents")

# ---------------------------------------------------------------------------
# File config
# ---------------------------------------------------------------------------

_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DATA_DIR = Path(
    os.getenv("GUJARAT_ACCIDENTS_DATA_DIR", str(_BACKEND_DIR / "data"))
).resolve()

CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", str(DEFAULT_SEED_BATCH_SIZE)))

# key -> (filename, fallback district name used only when a row's own
# "District" cell is blank, and short tag used for accident_id de-duplication)
DISTRICT_FILES: dict[str, dict] = {
    "ahmedabad":    {"file": "Ahmedabad City 2023-2026 overall data.xlsx", "default_district": "Ahmedabad", "tag": "AHM"},
    "dang":         {"file": "Ahwa Dang 2023-2026 overall data.xlsx",       "default_district": "The Dangs",  "tag": "DNG"},
    "bhavnagar":    {"file": "Bhavnagar 2023-2026 overall data.xlsx",       "default_district": "Bhavnagar",  "tag": "BHV"},
    "jamnagar":     {"file": "Jamnagar 2023-2026 overall data.xlsx",        "default_district": "Jamnagar",   "tag": "JAM"},
    "rajkot":       {"file": "Rajkot 2023-2026 overall data.xlsx",          "default_district": "Rajkot",     "tag": "RAJ"},
    "surat_city":   {"file": "Surat City 2023-2026 overall data.xlsx",      "default_district": "Surat",      "tag": "SURC"},
    "surat_rural":  {"file": "Surat Rural 2023-2026 overall data.xlsx",     "default_district": "Surat",      "tag": "SURR"},
    "vadodara":     {"file": "Vadodara 2023-2026 overall data.xlsx",        "default_district": "Vadodara",   "tag": "VAD"},
}

# ---------------------------------------------------------------------------
# Column mapping — identical to seed_surat_accidents.py
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Cleaners (same behaviour as the other seeders)
# ---------------------------------------------------------------------------

def _clean_text(value) -> str | None:
    if pd.isna(value):
        return None
    s = str(value).strip()
    return None if s == "" or s.lower() == NULL_TEXT_SENTINEL else s


def _clean_int_zero(value) -> int:
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


# ---------------------------------------------------------------------------
# accident_id de-duplication
#
# Different district exports may reuse the same short accident_id sequence
# (e.g. "0001", "0002", ...). Accident.accident_id has a DB-level unique
# constraint, so we guarantee uniqueness in Python before insert rather than
# trusting the source files.
# ---------------------------------------------------------------------------

def _unique_id(raw_id: str | None, tag: str, seen: set[str]) -> str:
    if not raw_id:
        candidate = f"{tag}-{uuid.uuid4().hex[:8].upper()}"
    else:
        candidate = raw_id
        if candidate in seen:
            candidate = f"{tag}-{raw_id}"
        while candidate in seen:
            candidate = f"{candidate}-{uuid.uuid4().hex[:4].upper()}"
    seen.add(candidate)
    return candidate


# ---------------------------------------------------------------------------
# Load + build
# ---------------------------------------------------------------------------

def _load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found at:\n  {path}")

    logger.info("Reading dataset: %s", path)
    df = pd.read_excel(path)

    missing = set(COLUMN_MAP.keys()) - set(df.columns)
    if missing:
        raise ValueError(
            f"'{path.name}' is missing expected columns: {sorted(missing)}"
        )

    df = df.rename(columns=COLUMN_MAP)
    df["accident_date_time"] = df["accident_date_time"].apply(parse_accident_datetime)

    parsed_count = int(df["accident_date_time"].notna().sum())
    logger.info("  parsed accident_date_time for %d / %d rows", parsed_count, len(df))
    return df


def _build_accident(row, tag: str, default_district: str, seen_ids: set[str]) -> Accident:
    lat = _clean_float(row["latitude"])
    lon = _clean_float(row["longitude"])

    district = _clean_text(row["district"]) or default_district
    accident_id = _unique_id(_clean_text(row["accident_id"]), tag, seen_ids)

    return Accident(
        accident_id         = accident_id,
        district            = district,
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


# ---------------------------------------------------------------------------
# Coordinate validation (state-level, fast path — no per-row district lookup)
# ---------------------------------------------------------------------------

def _normalize_district_name(name: str) -> str:
    if not name:
        return ""
    s = name.strip().lower()
    
    # Strip common suffixes/prefixes used in the dataset
    s = s.replace(" city", "").replace(" rural", "").replace(" district", "")
    
    if s == "ahmedabad":
        return "ahmadabad"
    if "dang" in s or "ahwa" in s:
        return "the dangs"
    
    return s.strip()

def _validate_coordinates(df: pd.DataFrame, db: Session, default_district: str) -> tuple[pd.DataFrame, int]:
    logger.info("  validating coordinates against Gujarat district boundaries…")
    coords = list(zip(df["latitude"].tolist(), df["longitude"].tolist()))
    report = validate_coordinates_batch(
        coords, db, check_district=True, log_progress_every=1000
    )
    
    valid_mask = [r.is_valid for r in report.results]
    mismatches = 0
    
    for idx, result in enumerate(report.results):
        if result.is_valid and result.matched_district:
            claimed_district = _clean_text(df.iloc[idx]["district"]) or default_district
            
            norm_claimed = _normalize_district_name(claimed_district)
            norm_matched = _normalize_district_name(result.matched_district)
            
            if norm_claimed != norm_matched:
                # The point falls physically inside a different district boundary
                # The user requested these rows be dropped/ignored.
                valid_mask[idx] = False
                mismatches += 1
            else:
                # We use the exact PostGIS matched district string for database consistency
                df.at[df.index[idx], "district"] = result.matched_district

    valid_df = df[valid_mask].copy()

    if mismatches > 0:
        logger.warning("  dropped %d rows where claimed district differs from physical PostGIS boundary.", mismatches)

    rejected = len(df) - len(valid_df)
    logger.info("  valid: %d, rejected: %d", len(valid_df), rejected)
    return valid_df, rejected


# ---------------------------------------------------------------------------
# Main seeder
# ---------------------------------------------------------------------------

def seed_gujarat_accidents(
    force: bool = False,
    skip_validation: bool = False,
    only: list[str] | None = None,
) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(Accident).count()
        if existing > 0 and not force:
            logger.info(
                "accidents table already has %d rows — skipping. Pass --force to re-seed.",
                existing,
            )
            return

        if force and existing > 0:
            logger.info("force=True — deleting %d existing rows …", existing)
            db.query(Accident).delete()
            db.commit()

        seen_ids: set[str] = set(
            row[0] for row in db.query(Accident.accident_id).filter(Accident.accident_id.isnot(None)).all()
        )

        keys = only or list(DISTRICT_FILES.keys())
        total_inserted = 0
        total_rejected = 0

        for key in keys:
            cfg = DISTRICT_FILES.get(key)
            if not cfg:
                logger.warning("Unknown district key '%s' — skipping.", key)
                continue

            path = DATA_DIR / cfg["file"]
            logger.info("=== %s (%s) ===", key, cfg["file"])

            try:
                df = _load_dataset(path)
            except FileNotFoundError as exc:
                logger.warning(str(exc))
                continue

            if skip_validation:
                valid_df, rejected = df, 0
            else:
                valid_df, rejected = _validate_coordinates(df, db, cfg["default_district"])
            total_rejected += rejected

            objects = [
                _build_accident(row, cfg["tag"], cfg["default_district"], seen_ids)
                for _, row in valid_df.iterrows()
            ]

            for start in range(0, len(objects), CHUNK_SIZE):
                chunk = objects[start:start + CHUNK_SIZE]
                db.bulk_save_objects(chunk)
                db.commit()

            logger.info("  inserted %d rows for %s", len(objects), key)
            total_inserted += len(objects)

        logger.info(
            "=== Seed complete — %d inserted across %d file(s), %d rejected (outside Gujarat / bad coords) ===",
            total_inserted, len(keys), total_rejected,
        )

    except Exception:
        db.rollback()
        logger.exception("Seed failed — transaction rolled back.")
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Seed multi-district accident data into the shared accidents table."
    )
    parser.add_argument("--force", action="store_true", help="Delete existing rows and re-seed.")
    parser.add_argument("--skip-validation", action="store_true", help="Skip PostGIS boundary validation (faster).")
    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help=f"Comma-separated subset of keys to seed: {', '.join(DISTRICT_FILES.keys())}",
    )
    args = parser.parse_args()

    only_list = [k.strip() for k in args.only.split(",")] if args.only else None

    seed_gujarat_accidents(
        force=args.force,
        skip_validation=args.skip_validation,
        only=only_list,
    )
# backend/app/seed/seed_gujarat_accidents.py
"""
Unified multi-district accident seeder.

Dynamically scans for .xlsx files in the data directory and matches them to official districts using fuzzy matching.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import difflib
import re
from pathlib import Path

# pyrefly: ignore
import pandas as pd
# pyrefly: ignore [missing-import]
from geoalchemy2.shape import from_shape
# pyrefly: ignore
from shapely.geometry import Point
# pyrefly: ignore [missing-import]
from sqlalchemy import text
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.database import Base, engine, SessionLocal
from app.models.accident import Accident
from app.models.gujarat_district import GujaratDistrict
from app.core.config import POSTGIS_SRID
from app.core.constants import NULL_TEXT_SENTINEL, DEFAULT_SEED_BATCH_SIZE
from app.utils.datetime_utils import parse_accident_datetime
from app.utils.coordinate_validator import validate_coordinates_batch
from app.utils.accident_utils import split_and_clean_categories
from app.utils.district_utils import (
    get_canonical_district,
    is_same_district,
    is_railway_police,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_gujarat_accidents")

_THIS_DIR    = Path(__file__).resolve().parent
_BACKEND_DIR = _THIS_DIR.parent.parent

DATA_DIR = Path(
    os.getenv("GUJARAT_ACCIDENTS_DATA_DIR", str(_BACKEND_DIR / "data"))
).resolve()

CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", str(DEFAULT_SEED_BATCH_SIZE)))

COLUMN_MAP: dict[str, str] = {
    "Accident ID":                  "accident_id",
    "District":                     "district",
    "Police Station":               "police_station",
    "Accident Date Time":           "accident_date_time",
    "Latitude":                     "latitude",
    "Longitude":                    "longitude",
    "Accident Location":            "accident_location",
    "Land Mark Name":               "landmark_name",
    "Road Name":                    "road_name",
    "Road Classification":          "road_classification",
    "Severity of the Accident":     "severity",
    "No of Vehicles Involved":      "number_of_vehicles",
    "Drivers Killed":               "driver_killed",
    "Drivers Grievous Injury":      "driver_grievous_injury",
    "Drivers Minor Injury":         "driver_minor_injury",
    "Drivers No Injury":            "driver_no_injury",
    "Passengers Killed":            "passenger_killed",
    "Passengers Grievous Injury":   "passenger_grievous_injury",
    "Passengers Minor Injury":      "passenger_minor_injury",
    "Passengers No Injury":         "passenger_no_injury",
    "Pedestrian Killed":            "pedestrian_killed",
    "Pedestrian Grievous Injury":   "pedestrian_grievous_injury",
    "Pedestrian Minor Injury":      "pedestrian_minor_injury",
    "Pedestrian No Injury":         "pedestrian_no_injury",
    "Collision Type":               "type_of_collision",
    "Collision Nature":             "collision_feature",
    "Weather Condition":            "weather_condition",
    "Light Condition":              "light_condition",
    "Visibility":                   "visibility",
    "Traffic Violation":            "traffic_violation",
    "Accident Description":         "accident_description",
}

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

def _get_raw_id(raw_id: str | None, district: str, seen_records: set[tuple[str, str]]) -> str | None:
    """Return the raw accident ID as-is. Register it in seen_records for duplicate detection."""
    if raw_id:
        seen_records.add((raw_id, district))
    return raw_id

def _load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found at:\n  {path}")
    logger.info("Reading dataset: %s", path.name)
    df = pd.read_excel(path)
    missing = set(COLUMN_MAP.keys()) - set(df.columns)
    if missing:
        raise ValueError(f"'{path.name}' is missing expected columns: {sorted(missing)}")
    df = df.rename(columns=COLUMN_MAP)
    
    # Drop rows missing accident_id (handles empty rows at the end of sheets)
    initial_len = len(df)
    # Convert empty strings/whitespace to NaN so dropna works
    df["accident_id"] = df["accident_id"].apply(lambda x: None if pd.isna(x) or str(x).strip() == "" else x)
    df = df.dropna(subset=["accident_id"])
    if len(df) < initial_len:
        logger.info("  dropped %d empty rows missing accident_id", initial_len - len(df))

    df["accident_date_time"] = df["accident_date_time"].apply(parse_accident_datetime)
    parsed_count = df["accident_date_time"].notna().sum()
    logger.info("  parsed accident_date_time for %d / %d rows", parsed_count, len(df))
    return df

def _get_official_district(raw_name: str | None, official_districts: list[str]) -> str | None:
    if not raw_name:
        return None

    # 1. High-accuracy canonical resolution
    canon = get_canonical_district(raw_name)
    if canon and canon in official_districts:
        return canon

    clean = str(raw_name).strip().replace("-", " ")
    clean = clean.replace(" City", "").replace(" Rural", "").replace(" District", "")

    canon_clean = get_canonical_district(clean)
    if canon_clean and canon_clean in official_districts:
        return canon_clean

    # 2. Case-insensitive fuzzy matching fallback
    clean_lower = clean.lower()
    official_lower = [d.lower() for d in official_districts]

    matches = difflib.get_close_matches(clean_lower, official_lower, n=1, cutoff=0.3)
    if matches:
        idx = official_lower.index(matches[0])
        return official_districts[idx]
    return None

def _build_accident(row, official_district: str, seen_records: set[tuple[str, str]], is_duplicate: bool = False, requires_attention: bool = False, is_valid_coordinates: bool = True, invalidation_reasons: str | None = None) -> Accident:
    lat = _clean_float(row["latitude"])
    lon = _clean_float(row["longitude"])

    return Accident(
        accident_id         = _clean_text(row["accident_id"]),
        district            = official_district,
        police_station      = _clean_text(row["police_station"]),
        accident_date_time  = row["accident_date_time"] if not pd.isna(row["accident_date_time"]) else None,
        latitude            = lat,
        longitude           = lon,
        location            = _make_point(lat, lon),
        accident_location   = _clean_text(row.get("accident_location")),
        landmark_name       = _clean_text(row.get("landmark_name")),
        road_name           = _clean_text(row["road_name"]),
        road_classification = _clean_text(row["road_classification"]),
        severity            = _clean_text(row["severity"]),
        number_of_vehicles  = _clean_int_zero(row["number_of_vehicles"]),

        driver_killed          = _clean_int_zero(row.get("driver_killed")),
        driver_grievous_injury = _clean_int_zero(row.get("driver_grievous_injury")),
        driver_minor_injury    = _clean_int_zero(row.get("driver_minor_injury")),
        driver_no_injury       = _clean_int_zero(row.get("driver_no_injury")),

        passenger_killed          = _clean_int_zero(row.get("passenger_killed")),
        passenger_grievous_injury = _clean_int_zero(row.get("passenger_grievous_injury")),
        passenger_minor_injury    = _clean_int_zero(row.get("passenger_minor_injury")),
        passenger_no_injury       = _clean_int_zero(row.get("passenger_no_injury")),

        pedestrian_killed          = _clean_int_zero(row.get("pedestrian_killed")),
        pedestrian_grievous_injury = _clean_int_zero(row.get("pedestrian_grievous_injury")),
        pedestrian_minor_injury    = _clean_int_zero(row.get("pedestrian_minor_injury")),
        pedestrian_no_injury       = _clean_int_zero(row.get("pedestrian_no_injury")),

        type_of_collision = split_and_clean_categories(row.get("type_of_collision")) or None,
        collision_feature = split_and_clean_categories(row.get("collision_feature")) or None,
        weather_condition = split_and_clean_categories(row.get("weather_condition")) or None,
        light_condition   = _clean_text(row.get("light_condition")),
        visibility        = _clean_text(row.get("visibility")),
        traffic_violation = split_and_clean_categories(row.get("traffic_violation")) or None,
        accident_description = _clean_text(row.get("accident_description")),
        
        is_duplicate = is_duplicate,
        requires_attention = requires_attention,
        is_valid_coordinates = is_valid_coordinates,
        invalidation_reasons = invalidation_reasons,
    )

def _validate_coordinates(df: pd.DataFrame, db: Session, default_district: str) -> tuple[pd.DataFrame, int]:
    logger.info("  validating coordinates against Gujarat district boundaries…")
    # Reset index so list indices align with DataFrame rows
    df = df.reset_index(drop=True)
    coords = list(zip(df["latitude"].tolist(), df["longitude"].tolist()))
    report = validate_coordinates_batch(
        coords, db, check_district=True, log_progress_every=1000
    )

    results = report.results if hasattr(report, 'results') else []
    is_valid_list = [res.is_valid for res in results] if results else [True] * len(df)
    # Per-row invalidation reason from coordinate validation
    coord_reasons: list[str | None] = [None] * len(df)

    for idx, res in enumerate(results):
        if not res.is_valid:
            status_val = res.status.value if hasattr(res.status, 'value') else str(res.status)
            if status_val == "outside_state" or status_val == "no_district":
                coord_reasons[idx] = "Outside Gujarat State"
            elif status_val == "invalid_coords":
                coord_reasons[idx] = "Invalid Coordinates"
            elif status_val == "db_error":
                coord_reasons[idx] = "Validation Error"
            else:
                coord_reasons[idx] = "Invalid Coordinates"

    is_valid_series = pd.Series(is_valid_list, index=df.index)
    df["is_valid_coordinates"] = is_valid_series
    df["coord_reason"] = coord_reasons

    reported_districts = [res.matched_district for res in results] if results else []
    candidates_list = [res.candidate_districts for res in results] if results else []
    mismatches = 0
    if reported_districts:
        for idx, reported_dist in enumerate(reported_districts):
            if is_valid_list[idx] and reported_dist:
                # Row-level claimed district takes precedence if present, else default_district
                row_dist = df.at[idx, "district"] if "district" in df.columns else None
                dist = str(row_dist).strip() if pd.notna(row_dist) and str(row_dist).strip() else default_district

                # Railway police jurisdictions traverse across multiple districts - not a geographic mismatch
                if is_railway_police(dist) or is_railway_police(default_district):
                    continue

                # Check if reported district matches claimed district canonically
                if is_same_district(dist, reported_dist) or is_same_district(default_district, reported_dist):
                    continue

                # Check if point lies on border tolerance and matches any candidate district
                candidates = candidates_list[idx] if idx < len(candidates_list) else []
                if any(is_same_district(dist, cand) or is_same_district(default_district, cand) for cand in candidates):
                    continue

                # Definite geographic mismatch
                is_valid_series.iloc[idx] = False
                coord_reasons[idx] = f"District Mismatch (coordinate falls in {reported_dist}, claimed {dist})"
                mismatches += 1

    # Re-sync after district mismatch updates
    df["is_valid_coordinates"] = is_valid_series
    df["coord_reason"] = coord_reasons

    invalid_count = len(df) - int(sum(is_valid_series))
    logger.info("  valid: %d, flagged invalid: %d (district mismatches: %d)", int(sum(is_valid_series)), invalid_count, mismatches)
    return df, invalid_count

def seed_gujarat_accidents(
    force: bool = False,
    append: bool = False,
    skip_validation: bool = False,
    only: list[str] | None = None,
) -> None:
    if force:
        logger.info("force=True — recreating accidents table to ensure schema is fully up-to-date...")
        Accident.__table__.drop(bind=engine, checkfirst=True)
        Accident.__table__.create(bind=engine, checkfirst=True)
    else:
        Base.metadata.create_all(bind=engine)
        # Self-healing migration for existing tables created on older schemas
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE accidents ADD COLUMN IF NOT EXISTS is_valid_coordinates BOOLEAN DEFAULT TRUE NOT NULL;"))
            conn.execute(text("ALTER TABLE accidents ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE NOT NULL;"))
            conn.execute(text("ALTER TABLE accidents ADD COLUMN IF NOT EXISTS requires_attention BOOLEAN DEFAULT FALSE NOT NULL;"))
            conn.execute(text("ALTER TABLE accidents ADD COLUMN IF NOT EXISTS invalidation_reasons VARCHAR;"))
            conn.commit()

    db = SessionLocal()

    try:
        existing = db.query(Accident).count() if not force else 0
        if existing > 0 and not append:
            logger.info("accidents table already has %d rows — skipping. Pass --force to re-seed or --append to append.", existing)
            return

        seen_records: set[tuple[str, str]] = set(
            (row.accident_id, row.district)
            for row in db.query(Accident.accident_id, Accident.district).filter(Accident.accident_id.isnot(None)).all()
        )
        
        # Get official districts from database
        official_districts = [r[0] for r in db.query(GujaratDistrict.shape_name).all()]
        if not official_districts:
            logger.error("No official districts found in the database. Please seed districts first.")
            return

        total_inserted = 0
        total_rejected = 0
        
        # Scan data directory for Excel files
        all_files = [f for f in DATA_DIR.glob("*.xlsx") if f.name != "accident_dummy_data.xlsx" and not f.name.startswith("~")]
        
        if only:
            only_lower = [k.lower() for k in only]
            files_to_process = [f for f in all_files if any(k in f.name.lower() for k in only_lower)]
            if not files_to_process:
                logger.warning(f"No files matched the keywords: {only}")
                return
        else:
            files_to_process = all_files

        for path in files_to_process:
            logger.info("=== Processing %s ===", path.name)
            
            # Infer official district from filename
            base_name = re.sub(r"(?i)\s*\d{4}-\d{4}.*$", "", path.stem).strip()
            official_district = _get_official_district(base_name, official_districts)
            if not official_district:
                logger.warning(f"Could not map filename '{path.name}' to an official district. Skipping.")
                continue
                
            logger.info(f"Mapped filename '{path.name}' to official district: '{official_district}'")
            
            try:
                df = _load_dataset(path)
            except Exception as exc:
                logger.warning(str(exc))
                continue

            if skip_validation:
                valid_df, rejected = df, 0
                valid_df["is_valid_coordinates"] = True
            else:
                valid_df, rejected = _validate_coordinates(df, db, official_district)
            total_rejected += rejected

            objects = []
            duplicate_skips = 0
            for _, row in valid_df.iterrows():
                raw_id = _clean_text(row["accident_id"])
                
                # Respect Excel's district column if it specifies Vav-Tharad
                row_district = _clean_text(row.get("district"))
                base_name_lower = base_name.lower()
                if row_district and "vav tharad" in row_district.lower():
                    actual_district = row_district
                elif any(word in base_name_lower for word in ["city", "rural", "wrly"]):
                    actual_district = base_name.title() if base_name.islower() else base_name
                else:
                    actual_district = official_district

                is_valid = bool(row.get("is_valid_coordinates", True))
                is_duplicate = False
                requires_attention = False
                reasons = []

                if not is_valid:
                    requires_attention = True
                    # Use the specific reason determined during validation
                    coord_reason = row.get("coord_reason") or "Invalid Coordinates"
                    reasons.append(coord_reason)

                # Check for duplicates: same accident_id already seen for this district
                if raw_id and (raw_id, actual_district) in seen_records:
                    duplicate_skips += 1
                    is_duplicate = True
                    requires_attention = True
                    reasons.append("Duplicate Record")

                invalidation_reasons = ", ".join(reasons) if reasons else None

                # Register this ID so subsequent rows can detect duplicates
                if raw_id:
                    seen_records.add((raw_id, actual_district))

                objects.append(_build_accident(
                    row, actual_district, seen_records,
                    is_duplicate=is_duplicate,
                    requires_attention=requires_attention,
                    is_valid_coordinates=is_valid,
                    invalidation_reasons=invalidation_reasons
                ))

            for start in range(0, len(objects), CHUNK_SIZE):
                chunk = objects[start:start + CHUNK_SIZE]
                db.bulk_save_objects(chunk)
                db.commit()

            logger.info(
                "  [%s] Summary: parsed valid=%d, duplicate skips=%d, inserted=%d",
                path.name, len(valid_df), duplicate_skips, len(objects)
            )
            total_inserted += len(objects)

        logger.info(
            "Overall seeding complete. total inserted=%d, total flagged invalid=%d",
            total_inserted, total_rejected
        )

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Multi-district Accident Seeder")
    parser.add_argument("--force", action="store_true", help="Delete existing rows and re-seed.")
    parser.add_argument("--append", action="store_true", help="Append to existing data instead of skipping if table is not empty.")
    parser.add_argument("--skip-validation", action="store_true", help="Skip PostGIS boundary validation (faster).")
    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help="Comma-separated subset of filename keywords to seed (e.g., 'surat,ahmedabad')",
    )
    args = parser.parse_args()

    only_list = [k.strip() for k in args.only.split(",")] if args.only else None

    seed_gujarat_accidents(
        force=args.force,
        append=args.append,
        skip_validation=args.skip_validation,
        only=only_list,
    )
"""
Admin-only endpoints for managing accident records.

Routes live under /api/admin/surat/accidents and support manual CRUD,
advanced filtering, and the two-step bulk import workflow:
upload/validate first, confirm/import valid rows second.
"""

import io
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
# pyrefly: ignore [missing-import]
from geoalchemy2.shape import from_shape
# pyrefly: ignore [missing-import]
from shapely.geometry import Point
# pyrefly: ignore [missing-import]
from sqlalchemy import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.config import POSTGIS_SRID
from app.core.constants import ADMIN_SURAT_PREFIX, ALLOWED_FILE_UPLOAD_EXTENSIONS
from app.core.dependencies import get_db, get_current_admin_user
# pyrefly: ignore [missing-import]
from app.models.accident import Accident
from app.models.user import User
from app.utils.accident_utils import (
    get_distinct_categories,
    split_and_clean_categories,
    apply_multi_category_filter,
)
from app.utils.district_utils import (
    is_same_district,
    is_railway_police,
    get_canonical_district,
)


router = APIRouter(
    prefix=ADMIN_SURAT_PREFIX,
    tags=["Admin - Accidents"],
)

EXPECTED_COLUMNS: List[str] = [
    "accident_id",
    "district",
    "police_station",
    "accident_date_time",
    "latitude",
    "longitude",
    "road_name",
    "road_classification",
    "severity",
    "number_of_vehicles",
    "driver_killed",
    "driver_grievous_injury",
    "driver_minor_injury",
    "driver_no_injury",
    "passenger_killed",
    "passenger_grievous_injury",
    "passenger_minor_injury",
    "passenger_no_injury",
    "pedestrian_killed",
    "pedestrian_grievous_injury",
    "pedestrian_minor_injury",
    "pedestrian_no_injury",
    "type_of_collision",
    "collision_feature",
    "weather_condition",
    "light_condition",
    "visibility",
    "traffic_violation",
    "accident_location",
    "landmark_name",
    "accident_description",
]

INTEGER_COLUMNS = {
    "number_of_vehicles",
    "driver_killed",
    "driver_grievous_injury",
    "driver_minor_injury",
    "driver_no_injury",
    "passenger_killed",
    "passenger_grievous_injury",
    "passenger_minor_injury",
    "passenger_no_injury",
    "pedestrian_killed",
    "pedestrian_grievous_injury",
    "pedestrian_minor_injury",
    "pedestrian_no_injury",
}

FLOAT_COLUMNS = {"latitude", "longitude"}


def _make_point(lat: Optional[float], lon: Optional[float]):
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None


from app.utils.datetime_utils import parse_accident_datetime

def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, float) and pd.isna(value)) or str(value).strip() == ""


def _clean_text(value: Any) -> Optional[str]:
    if _is_blank(value):
        return None
    return str(value).strip()


def _validate_import_row(row: Dict[str, Any]) -> List[str]:
    errors: List[str] = []

    for col in INTEGER_COLUMNS:
        val = _clean_text(row.get(col))
        if val is not None:
            try:
                parsed = int(float(val))
                if parsed < 0:
                    errors.append(f"Column '{col}': expected a non-negative integer")
            except (ValueError, TypeError):
                errors.append(f"Column '{col}': expected integer, got '{val}'")

    for col in FLOAT_COLUMNS:
        val = _clean_text(row.get(col))
        if val is not None:
            try:
                float(val)
            except (ValueError, TypeError):
                errors.append(f"Column '{col}': expected number, got '{val}'")

    dt_val = _clean_text(row.get("accident_date_time"))
    if dt_val is not None and parse_accident_datetime(dt_val) is None:
        errors.append(
            f"Column 'accident_date_time': could not parse '{dt_val}' as a date/time"
        )

    return errors


def _normalize_district_for_match(district_name: str) -> str:
    canon = get_canonical_district(district_name)
    return canon.lower() if canon else str(district_name).strip().lower()


def _coerce_import_record(row: Dict[str, Any]) -> Dict[str, Any]:
    def _float(value: Any) -> Optional[float]:
        if _is_blank(value):
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    def _int(value: Any) -> int:
        if _is_blank(value):
            return 0
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return 0

    coerced = {col: _clean_text(row.get(col)) for col in EXPECTED_COLUMNS}
    coerced["latitude"] = _float(row.get("latitude"))
    coerced["longitude"] = _float(row.get("longitude"))
    coerced["accident_date_time"] = parse_accident_datetime(row.get("accident_date_time"))
    for col in INTEGER_COLUMNS:
        coerced[col] = _int(row.get(col))
    coerced["district"] = coerced.get("district") or "Surat"
    return coerced


def _row_to_response(row: Dict[str, Any]) -> Dict[str, Any]:
    response = dict(row)
    dt = response.get("accident_date_time")
    if isinstance(dt, datetime):
        response["accident_date_time"] = dt.isoformat()
    return response


def _record_to_dict(record: Accident) -> Dict[str, Any]:
    row = {c.name: getattr(record, c.name) for c in record.__table__.columns}
    row.pop("location", None)

    # Detect columns with multiple categories
    field_labels = {
        "type_of_collision": "Collision Type",
        "collision_feature": "Collision Feature",
        "weather_condition": "Weather Condition",
        "traffic_violation": "Traffic Violation",
    }
    multi_category_columns = []
    for col_key, label in field_labels.items():
        val = row.get(col_key)
        if isinstance(val, (list, tuple, set)) and len(val) > 1:
            multi_category_columns.append(label)

    row["has_multiple_categories"] = len(multi_category_columns) > 0
    row["multi_category_columns"] = multi_category_columns

    # Detect blank columns among the specified 11 columns
    blank_field_labels = {
        "police_station": "Police Station",
        "accident_date_time": "Date & Time",
        "road_name": "Road Name",
        "road_classification": "Road Classification",
        "landmark_name": "Landmark Name",
        "type_of_collision": "Collision Type",
        "collision_feature": "Collision Nature",
        "weather_condition": "Weather",
        "light_condition": "Light Condition",
        "visibility": "Visibility",
        "traffic_violation": "Traffic Violation",
    }
    blank_columns = []
    for col_key, label in blank_field_labels.items():
        val = row.get(col_key)
        if val is None:
            blank_columns.append(label)
        elif isinstance(val, (list, tuple, set)):
            cleaned = [x for x in val if x is not None and str(x).strip() not in ("", "-", "nan", "null", "none", "None")]
            if len(cleaned) == 0:
                blank_columns.append(label)
        else:
            if str(val).strip() in ("", "-", "nan", "null", "none", "None", "NaN"):
                blank_columns.append(label)

    row["has_blank_fields"] = len(blank_columns) > 0
    row["blank_columns"] = blank_columns

    for col in ("type_of_collision", "collision_feature", "weather_condition", "traffic_violation"):
        val = row.get(col)
        if isinstance(val, (list, tuple, set)):
            row[col] = ", ".join(str(x) for x in val if x)
    return row


def _distinct_values(db: Session, column) -> List[str]:
    return [
        value
        for (value,) in db.query(column)
        .filter(column.isnot(None), column != "")
        .distinct()
        .order_by(column)
        .all()
    ]


@router.get("/accidents/columns")
def get_accident_columns(
    current_user: User = Depends(get_current_admin_user),
):
    return {"columns": EXPECTED_COLUMNS}


@router.get("/accidents/filter-options")
def get_accident_filter_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return {
        "severities": _distinct_values(db, Accident.severity),
        "police_stations": _distinct_values(db, Accident.police_station),
        "districts": _distinct_values(db, Accident.district),
        "road_names": _distinct_values(db, Accident.road_name),
        "collision_types": get_distinct_categories(db, Accident.type_of_collision),
        "collision_features": get_distinct_categories(db, Accident.collision_feature),
        "weather_conditions": get_distinct_categories(db, Accident.weather_condition),
        "light_conditions": _distinct_values(db, Accident.light_condition),
        "visibilities": _distinct_values(db, Accident.visibility),
    }


@router.post("/accidents", status_code=201)
def add_accident(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    accident_id = payload.get("accident_id")
    if not accident_id:
        raise HTTPException(status_code=400, detail="Accident ID is required.")

    district = payload.get("district") or "Surat"

    requires_attention = False
    invalidation_reasons = []
    is_duplicate = False

    existing = (
        db.query(Accident)
        .filter(Accident.accident_id == accident_id, Accident.district == district)
        .first()
    )
    if existing:
        is_duplicate = True
        requires_attention = True
        invalidation_reasons.append("Duplicate Record")

    lat = payload.get("latitude")
    lon = payload.get("longitude")
    is_valid_coordinates = True

    if lat is not None and lon is not None:
        from app.utils.coordinate_validator import validate_coordinate, ValidationStatus
        coord_res = validate_coordinate(float(lat), float(lon), db)
        if not coord_res.is_valid:
            is_valid_coordinates = False
            requires_attention = True
            if coord_res.status in (ValidationStatus.OUTSIDE_STATE, ValidationStatus.NO_DISTRICT):
                invalidation_reasons.append("Outside State")
            elif coord_res.status == ValidationStatus.INVALID_COORDS:
                invalidation_reasons.append("Invalid Coordinates")
            else:
                invalidation_reasons.append("Validation Error")
        else:
            reported_dist = coord_res.matched_district
            if reported_dist and not is_railway_police(district):
                candidates = getattr(coord_res, "candidate_districts", []) or []
                is_match = is_same_district(district, reported_dist) or any(
                    is_same_district(district, cand) for cand in candidates
                )
                if not is_match:
                    is_valid_coordinates = False
                    requires_attention = True
                    invalidation_reasons.append("District Mismatch")

    row = _coerce_import_record({**payload, "accident_id": accident_id, "district": district})
    record = Accident(
        accident_id=row["accident_id"],
        district=row["district"],
        police_station=row.get("police_station"),
        accident_date_time=row.get("accident_date_time"),
        latitude=row.get("latitude"),
        longitude=row.get("longitude"),
        location=_make_point(row.get("latitude"), row.get("longitude")),
        road_name=row.get("road_name"),
        road_classification=row.get("road_classification"),
        severity=row.get("severity"),
        number_of_vehicles=row.get("number_of_vehicles"),
        driver_killed=row.get("driver_killed"),
        driver_grievous_injury=row.get("driver_grievous_injury"),
        driver_minor_injury=row.get("driver_minor_injury"),
        driver_no_injury=row.get("driver_no_injury"),
        passenger_killed=row.get("passenger_killed"),
        passenger_grievous_injury=row.get("passenger_grievous_injury"),
        passenger_minor_injury=row.get("passenger_minor_injury"),
        passenger_no_injury=row.get("passenger_no_injury"),
        pedestrian_killed=row.get("pedestrian_killed"),
        pedestrian_grievous_injury=row.get("pedestrian_grievous_injury"),
        pedestrian_minor_injury=row.get("pedestrian_minor_injury"),
        pedestrian_no_injury=row.get("pedestrian_no_injury"),
        type_of_collision=split_and_clean_categories(row.get("type_of_collision")) or None,
        collision_feature=split_and_clean_categories(row.get("collision_feature")) or None,
        weather_condition=split_and_clean_categories(row.get("weather_condition")) or None,
        light_condition=row.get("light_condition"),
        visibility=row.get("visibility"),
        traffic_violation=split_and_clean_categories(row.get("traffic_violation")) or None,
        is_valid_coordinates=is_valid_coordinates,
        requires_attention=requires_attention,
        is_duplicate=is_duplicate,
        invalidation_reasons=", ".join(invalidation_reasons) if invalidation_reasons else None,
    )

    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "message": "Accident record added successfully.",
        "id": record.id,
        "accident_id": record.accident_id,
    }


def _build_accidents_query(
    db: Session,
    search: Optional[str] = None,
    district: Optional[str] = None,
    police_station: Optional[str] = None,
    severity: Optional[str] = None,
    road_name: Optional[str] = None,
    road_classification: Optional[str] = None,
    type_of_collision: Optional[str] = None,
    weather_condition: Optional[str] = None,
    light_condition: Optional[str] = None,
    visibility: Optional[str] = None,
    traffic_violation: Optional[str] = None,
    collision_feature: Optional[str] = None,
    record_status: Optional[str] = None,
):
    query = db.query(Accident)

    if search:
        pattern = f"%{search}%"
        query = query.filter(
            (Accident.accident_id.ilike(pattern))
            | (Accident.police_station.ilike(pattern))
            | (Accident.road_name.ilike(pattern))
            | (Accident.district.ilike(pattern))
            | (Accident.severity.ilike(pattern))
            | (func.array_to_string(Accident.type_of_collision, ", ").ilike(pattern))
            | (func.array_to_string(Accident.collision_feature, ", ").ilike(pattern))
            | (func.array_to_string(Accident.weather_condition, ", ").ilike(pattern))
            | (func.array_to_string(Accident.traffic_violation, ", ").ilike(pattern))
        )

    if record_status:
        if record_status == "valid":
            query = query.filter(Accident.requires_attention == False)
        elif record_status == "duplicate":
            query = query.filter((Accident.is_duplicate == True) | (Accident.invalidation_reasons.ilike("%Duplicate%")))
        elif record_status == "district_mismatch":
            query = query.filter(Accident.invalidation_reasons.ilike("%District Mismatch%"))
        elif record_status == "outside_state":
            query = query.filter(Accident.invalidation_reasons.ilike("%Outside Gujarat State%"))
        elif record_status == "multiple_categories":
            query = query.filter(
                (Accident.requires_attention == False)
                & (
                    (func.coalesce(func.array_length(Accident.type_of_collision, 1), 0) > 1)
                    | (func.coalesce(func.array_length(Accident.collision_feature, 1), 0) > 1)
                    | (func.coalesce(func.array_length(Accident.weather_condition, 1), 0) > 1)
                    | (func.coalesce(func.array_length(Accident.traffic_violation, 1), 0) > 1)
                )
            )
        elif record_status == "blank_fields":
            query = query.filter(
                (Accident.requires_attention == False)
                & (
                    (Accident.police_station == None) | (Accident.police_station == "")
                    | (Accident.accident_date_time == None)
                    | (Accident.road_name == None) | (Accident.road_name == "") | (Accident.road_name == "-")
                    | (Accident.road_classification == None) | (Accident.road_classification == "") | (Accident.road_classification == "-")
                    | (Accident.landmark_name == None) | (Accident.landmark_name == "") | (Accident.landmark_name == "-")
                    | (Accident.light_condition == None) | (Accident.light_condition == "") | (Accident.light_condition == "-")
                    | (Accident.visibility == None) | (Accident.visibility == "") | (Accident.visibility == "-")
                    | (Accident.type_of_collision == None) | (func.coalesce(func.cardinality(Accident.type_of_collision), 0) == 0)
                    | (Accident.collision_feature == None) | (func.coalesce(func.cardinality(Accident.collision_feature), 0) == 0)
                    | (Accident.weather_condition == None) | (func.coalesce(func.cardinality(Accident.weather_condition), 0) == 0)
                    | (Accident.traffic_violation == None) | (func.coalesce(func.cardinality(Accident.traffic_violation), 0) == 0)
                )
            )
        elif record_status == "multi_status":
            multi_cat_cond = (
                (func.coalesce(func.array_length(Accident.type_of_collision, 1), 0) > 1)
                | (func.coalesce(func.array_length(Accident.collision_feature, 1), 0) > 1)
                | (func.coalesce(func.array_length(Accident.weather_condition, 1), 0) > 1)
                | (func.coalesce(func.array_length(Accident.traffic_violation, 1), 0) > 1)
            )
            blank_cond = (
                (Accident.police_station == None) | (Accident.police_station == "")
                | (Accident.accident_date_time == None)
                | (Accident.road_name == None) | (Accident.road_name == "") | (Accident.road_name == "-")
                | (Accident.road_classification == None) | (Accident.road_classification == "") | (Accident.road_classification == "-")
                | (Accident.landmark_name == None) | (Accident.landmark_name == "") | (Accident.landmark_name == "-")
                | (Accident.light_condition == None) | (Accident.light_condition == "") | (Accident.light_condition == "-")
                | (Accident.visibility == None) | (Accident.visibility == "") | (Accident.visibility == "-")
                | (Accident.type_of_collision == None) | (func.coalesce(func.cardinality(Accident.type_of_collision), 0) == 0)
                | (Accident.collision_feature == None) | (func.coalesce(func.cardinality(Accident.collision_feature), 0) == 0)
                | (Accident.weather_condition == None) | (func.coalesce(func.cardinality(Accident.weather_condition), 0) == 0)
                | (Accident.traffic_violation == None) | (func.coalesce(func.cardinality(Accident.traffic_violation), 0) == 0)
            )
            query = query.filter(
                (multi_cat_cond & blank_cond)
                | ((Accident.requires_attention == True) & (blank_cond | multi_cat_cond))
            )

    filter_map = {
        "district": district,
        "police_station": police_station,
        "severity": severity,
        "road_name": road_name,
        "road_classification": road_classification,
        "type_of_collision": type_of_collision,
        "weather_condition": weather_condition,
        "light_condition": light_condition,
        "visibility": visibility,
        "traffic_violation": traffic_violation,
        "collision_feature": collision_feature,
    }
    ARRAY_COLUMNS = {"type_of_collision", "collision_feature", "weather_condition", "traffic_violation"}
    for col_name, col_value in filter_map.items():
        if col_value:
            if col_name in ARRAY_COLUMNS:
                query = apply_multi_category_filter(query, getattr(Accident, col_name), col_value)
            else:
                query = query.filter(getattr(Accident, col_name).ilike(f"%{col_value}%"))

    return query


@router.get("/accidents")
def get_accidents(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    district: Optional[str] = None,
    police_station: Optional[str] = None,
    severity: Optional[str] = None,
    road_name: Optional[str] = None,
    road_classification: Optional[str] = None,
    type_of_collision: Optional[str] = None,
    weather_condition: Optional[str] = None,
    light_condition: Optional[str] = None,
    visibility: Optional[str] = None,
    traffic_violation: Optional[str] = None,
    collision_feature: Optional[str] = None,
    record_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    query = _build_accidents_query(
        db=db,
        search=search,
        district=district,
        police_station=police_station,
        severity=severity,
        road_name=road_name,
        road_classification=road_classification,
        type_of_collision=type_of_collision,
        weather_condition=weather_condition,
        light_condition=light_condition,
        visibility=visibility,
        traffic_violation=traffic_violation,
        collision_feature=collision_feature,
        record_status=record_status,
    )

    total = query.count()
    records = (
        query.order_by(Accident.accident_date_time.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "data": [_record_to_dict(record) for record in records],
    }


@router.get("/accidents/ids")
def get_accident_ids(
    search: Optional[str] = None,
    district: Optional[str] = None,
    police_station: Optional[str] = None,
    severity: Optional[str] = None,
    road_name: Optional[str] = None,
    road_classification: Optional[str] = None,
    type_of_collision: Optional[str] = None,
    weather_condition: Optional[str] = None,
    light_condition: Optional[str] = None,
    visibility: Optional[str] = None,
    traffic_violation: Optional[str] = None,
    collision_feature: Optional[str] = None,
    record_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    query = _build_accidents_query(
        db=db,
        search=search,
        district=district,
        police_station=police_station,
        severity=severity,
        road_name=road_name,
        road_classification=road_classification,
        type_of_collision=type_of_collision,
        weather_condition=weather_condition,
        light_condition=light_condition,
        visibility=visibility,
        traffic_violation=traffic_violation,
        collision_feature=collision_feature,
        record_status=record_status,
    )

    rows = query.with_entities(Accident.id).all()
    ids = [r[0] for r in rows]
    return {
        "total": len(ids),
        "ids": ids,
    }


@router.put("/accidents/{accident_id}")
def update_accident(
    accident_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    record = db.query(Accident).filter(Accident.id == accident_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Accident not found")

    row = _coerce_import_record({**_record_to_dict(record), **payload})
    record.district = row.get("district") or "Surat"
    record.police_station = row.get("police_station")
    record.accident_date_time = row.get("accident_date_time")
    record.latitude = row.get("latitude")
    record.longitude = row.get("longitude")
    record.location = _make_point(row.get("latitude"), row.get("longitude"))
    record.road_name = row.get("road_name")
    record.road_classification = row.get("road_classification")
    record.severity = row.get("severity")
    record.number_of_vehicles = row.get("number_of_vehicles")
    record.driver_killed = row.get("driver_killed")
    record.driver_grievous_injury = row.get("driver_grievous_injury")
    record.driver_minor_injury = row.get("driver_minor_injury")
    record.driver_no_injury = row.get("driver_no_injury")
    record.passenger_killed = row.get("passenger_killed")
    record.passenger_grievous_injury = row.get("passenger_grievous_injury")
    record.passenger_minor_injury = row.get("passenger_minor_injury")
    record.passenger_no_injury = row.get("passenger_no_injury")
    record.pedestrian_killed = row.get("pedestrian_killed")
    record.pedestrian_grievous_injury = row.get("pedestrian_grievous_injury")
    record.pedestrian_minor_injury = row.get("pedestrian_minor_injury")
    record.pedestrian_no_injury = row.get("pedestrian_no_injury")
    if "type_of_collision" in row:
        record.type_of_collision = split_and_clean_categories(row.get("type_of_collision")) or None
    if "collision_feature" in row:
        record.collision_feature = split_and_clean_categories(row.get("collision_feature")) or None
    if "weather_condition" in row:
        record.weather_condition = split_and_clean_categories(row.get("weather_condition")) or None
    record.light_condition = row.get("light_condition")
    record.visibility = row.get("visibility")
    if "traffic_violation" in row:
        record.traffic_violation = split_and_clean_categories(row.get("traffic_violation")) or None
    if "is_valid_coordinates" in payload:
        record.is_valid_coordinates = payload["is_valid_coordinates"]

    db.commit()
    db.refresh(record)
    return {"message": "Accident record updated successfully.", "id": record.id}


@router.delete("/accidents/{accident_id}")
def delete_accident(
    accident_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    record = db.query(Accident).filter(Accident.id == accident_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Accident not found")

    db.delete(record)
    db.commit()
    return {"message": "Accident record deleted successfully.", "id": accident_id}


@router.post("/accidents/bulk-delete")
def bulk_delete_accidents(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    raw_ids = payload.get("ids", [])
    if not raw_ids:
        raise HTTPException(status_code=400, detail="No IDs provided")

    try:
        ids = [int(record_id) for record_id in raw_ids]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid ID list") from exc

    deleted = 0
    chunk_size = 1000
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        count = (
            db.query(Accident)
            .filter(Accident.id.in_(chunk))
            .delete(synchronize_session=False)
        )
        deleted += count
    db.commit()
    return {
        "message": f"{deleted} accident record(s) deleted successfully.",
        "deleted": deleted,
    }


@router.post("/accidents/upload")
async def upload_accidents_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_FILE_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload an Excel (.xlsx) or CSV (.csv) file.",
        )

    contents = await file.read()
    try:
        if ext == "csv":
            df = pd.read_csv(io.BytesIO(contents), dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str, keep_default_na=False)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}")

    if df.empty:
        raise HTTPException(status_code=400, detail="The uploaded file contains no data rows.")

    import re
    import difflib

    def normalize_column(col_name: str) -> str:
        col_name = str(col_name).strip().lower()
        col_name = re.sub(r'[^a-z0-9]+', '_', col_name)
        return col_name.strip('_')

    ALIASES = {
        # Seed script exact mappings (normalized)
        "land_mark_name": "landmark_name",
        "severity_of_the_accident": "severity",
        "no_of_vehicles_involved": "number_of_vehicles",
        "drivers_killed": "driver_killed",
        "drivers_grievous_injury": "driver_grievous_injury",
        "drivers_minor_injury": "driver_minor_injury",
        "drivers_no_injury": "driver_no_injury",
        "passengers_killed": "passenger_killed",
        "passengers_grievous_injury": "passenger_grievous_injury",
        "passengers_minor_injury": "passenger_minor_injury",
        "passengers_no_injury": "passenger_no_injury",
        "collision_type": "type_of_collision",
        "collision_nature": "collision_feature",
        
        # General aliases
        "accident_severity": "severity",
        "no_of_vehicles": "number_of_vehicles",
        "vehicles_involved": "number_of_vehicles",
        "total_vehicles": "number_of_vehicles",
        "landmark": "landmark_name",
        "location": "accident_location",
        "date_time": "accident_date_time",
        "lat": "latitude",
        "lon": "longitude",
        "lng": "longitude",
        "ps": "police_station",
        "station": "police_station",
        "dist": "district",
        "road": "road_name",
        "weather": "weather_condition",
        "light": "light_condition",
        "vis": "visibility",
    }

    original_columns = df.columns.tolist()
    column_mapping = {}
    unmapped_expected = set(EXPECTED_COLUMNS)

    for col in original_columns:
        norm = normalize_column(col)
        if norm in unmapped_expected:
            column_mapping[col] = norm
            unmapped_expected.remove(norm)
        elif norm in ALIASES and ALIASES[norm] in unmapped_expected:
            column_mapping[col] = ALIASES[norm]
            unmapped_expected.remove(ALIASES[norm])
            
    for col in original_columns:
        if col not in column_mapping:
            norm = normalize_column(col)
            matches = difflib.get_close_matches(norm, unmapped_expected, n=1, cutoff=0.7)
            if matches:
                column_mapping[col] = matches[0]
                unmapped_expected.remove(matches[0])

    df.rename(columns=column_mapping, inplace=True)
    
    missing_columns = [c for c in EXPECTED_COLUMNS if c not in df.columns]
    for missing_col in missing_columns:
        df[missing_col] = None
    raw_rows = df.to_dict(orient="records")
    candidate_ids = [
        str(row.get("accident_id") or "").strip()
        for row in raw_rows
        if str(row.get("accident_id") or "").strip()
    ]

    existing_ids = set()
    if candidate_ids:
        existing = (
            db.query(Accident.accident_id, Accident.district)
            .filter(Accident.accident_id.in_(candidate_ids))
            .all()
        )
        existing_ids = {(r[0], _normalize_district_for_match(r[1])) for r in existing}

    seen_ids = set()
    valid_rows = []
    invalid_rows = []
    duplicate_rows = []

    for idx, raw_row in enumerate(raw_rows):
        row_num = idx + 2
        row_data = {col: _clean_text(raw_row.get(col)) for col in EXPECTED_COLUMNS}
        row_accident_id = row_data.get("accident_id")
        row_district = row_data.get("district") or "Surat"
        errors = _validate_import_row(raw_row)

        is_dup = False
        if row_accident_id and (row_accident_id, _normalize_district_for_match(row_district)) in existing_ids:
            duplicate_rows.append({
                "row": row_num,
                "accident_id": row_accident_id,
                "errors": ["Accident ID already exists in the database for this district."],
                "data": row_data,
            })
            is_dup = True
        elif row_accident_id and (row_accident_id, _normalize_district_for_match(row_district)) in seen_ids:
            duplicate_rows.append({
                "row": row_num,
                "accident_id": row_accident_id,
                "errors": ["Accident ID is duplicated within this file for this district."],
                "data": row_data,
            })
            is_dup = True

        if row_accident_id:
            seen_ids.add((row_accident_id, _normalize_district_for_match(row_district)))

        if errors:
            invalid_rows.append({"row": row_num, "errors": errors, "data": row_data})

        valid_rows.append(_row_to_response(_coerce_import_record(raw_row)))

    return {
        "valid": len(invalid_rows) == 0 and len(duplicate_rows) == 0,
        "total_rows": len(raw_rows),
        "valid_count": len(valid_rows),
        "invalid_count": len(invalid_rows),
        "duplicate_count": len(duplicate_rows),
        "preview": valid_rows[:10],
        "columns": EXPECTED_COLUMNS,
        "data": valid_rows,
        "invalid_rows": invalid_rows[:100],
        "duplicate_rows": duplicate_rows[:100],
        "total_invalid_rows": len(invalid_rows),
        "total_duplicate_rows": len(duplicate_rows),
    }


@router.post("/accidents/import")
def import_accidents(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    records_data = payload.get("records", [])
    if not records_data:
        raise HTTPException(status_code=400, detail="No records provided.")

    normalized_records = []
    accident_ids = []
    
    for row in records_data:
        normalized = _coerce_import_record(row)
        if not normalized.get("accident_id"):
            normalized["accident_id"] = f"IMPORT-{uuid.uuid4().hex[:10].upper()}"
        normalized_records.append(normalized)
        accident_ids.append(normalized["accident_id"])

    # Check existing for duplicates
    existing_ids = set()
    if accident_ids:
        existing = (
            db.query(Accident.accident_id, Accident.district)
            .filter(Accident.accident_id.in_(accident_ids))
            .all()
        )
        existing_ids = {(r[0], _normalize_district_for_match(r[1])) for r in existing}

    # Perform coordinate validation in batch
    coords = []
    for row in normalized_records:
        coords.append((row.get("latitude"), row.get("longitude")))
        
    from app.utils.coordinate_validator import validate_coordinates_batch
    coord_report = validate_coordinates_batch(coords, db, check_district=True)
    coord_results = coord_report.results if hasattr(coord_report, 'results') else []

    inserted = 0
    for idx, row in enumerate(normalized_records):
        reasons = []
        is_valid_coords = True
        is_dup = False
        requires_attn = False
        
        # Check structural errors from payload
        str_errors = _validate_import_row(records_data[idx])
        if str_errors:
            requires_attn = True
            reasons.append("Structural Parsing Errors")

        # Check duplicates
        acc_id = row.get("accident_id")
        dist = row.get("district") or "Surat"
        if acc_id and (acc_id, _normalize_district_for_match(dist)) in existing_ids:
            is_dup = True
            requires_attn = True
            reasons.append("Duplicate Record")
        else:
            existing_ids.add((acc_id, _normalize_district_for_match(dist)))
            
        # Check coordinates
        if idx < len(coord_results):
            res = coord_results[idx]
            if not res.is_valid:
                is_valid_coords = False
                requires_attn = True
                status_val = res.status.value if hasattr(res.status, 'value') else str(res.status)
                if status_val in ("outside_state", "no_district"):
                    reasons.append("Outside Gujarat State")
                elif status_val == "invalid_coords":
                    reasons.append("Invalid Coordinates")
                else:
                    reasons.append("Validation Error")
            elif res.matched_district and not is_railway_police(dist):
                candidates = getattr(res, "candidate_districts", []) or []
                is_match = is_same_district(dist, res.matched_district) or any(
                    is_same_district(dist, cand) for cand in candidates
                )
                if not is_match:
                    is_valid_coords = False
                    requires_attn = True
                    reasons.append("District Mismatch")

        invalidation_str = ", ".join(reasons) if reasons else None
        record = Accident(
            accident_id=row.get("accident_id"),
            district=row.get("district") or "Surat",
            police_station=row.get("police_station"),
            accident_date_time=row.get("accident_date_time"),
            latitude=row.get("latitude"),
            longitude=row.get("longitude"),
            location=_make_point(row.get("latitude"), row.get("longitude")),
            road_name=row.get("road_name"),
            road_classification=row.get("road_classification"),
            severity=row.get("severity"),
            number_of_vehicles=row.get("number_of_vehicles") or 0,
            driver_killed=row.get("driver_killed") or 0,
            driver_grievous_injury=row.get("driver_grievous_injury") or 0,
            driver_minor_injury=row.get("driver_minor_injury") or 0,
            driver_no_injury=row.get("driver_no_injury") or 0,
            passenger_killed=row.get("passenger_killed") or 0,
            passenger_grievous_injury=row.get("passenger_grievous_injury") or 0,
            passenger_minor_injury=row.get("passenger_minor_injury") or 0,
            passenger_no_injury=row.get("passenger_no_injury") or 0,
            pedestrian_killed=row.get("pedestrian_killed") or 0,
            pedestrian_grievous_injury=row.get("pedestrian_grievous_injury") or 0,
            pedestrian_minor_injury=row.get("pedestrian_minor_injury") or 0,
            pedestrian_no_injury=row.get("pedestrian_no_injury") or 0,
            type_of_collision=split_and_clean_categories(row.get("type_of_collision")) or None,
            collision_feature=split_and_clean_categories(row.get("collision_feature")) or None,
            weather_condition=split_and_clean_categories(row.get("weather_condition")) or None,
            light_condition=row.get("light_condition"),
            visibility=row.get("visibility"),
            traffic_violation=split_and_clean_categories(row.get("traffic_violation")) or None,
            is_valid_coordinates=is_valid_coords,
            is_duplicate=is_dup,
            requires_attention=requires_attn,
            invalidation_reasons=invalidation_str,
        )
        db.add(record)
        inserted += 1

    db.commit()
    return {"message": f"Successfully imported {inserted} record(s).", "inserted": inserted}

"""
Admin-only endpoints for managing Surat accident records.

Routes live under /api/admin/surat/accidents and support manual CRUD,
advanced filtering, and the two-step bulk import workflow:
upload/validate first, confirm/import valid rows second.
"""

import io
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.orm import Session

from app.core.config import POSTGIS_SRID
from app.core.constants import ADMIN_SURAT_PREFIX
from app.database import get_db
from app.models.accident import Accident
from app.models.user import User
from app.routes.auth import get_current_admin_user

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
    "passenger_killed",
    "passenger_grievous_injury",
    "passenger_minor_injury",
    "pedestrian_killed",
    "pedestrian_grievous_injury",
    "pedestrian_minor_injury",
    "type_of_collision",
    "collision_feature",
    "weather_condition",
    "light_condition",
    "visibility",
    "traffic_violation",
]

INTEGER_COLUMNS = {
    "number_of_vehicles",
    "driver_killed",
    "driver_grievous_injury",
    "driver_minor_injury",
    "passenger_killed",
    "passenger_grievous_injury",
    "passenger_minor_injury",
    "pedestrian_killed",
    "pedestrian_grievous_injury",
    "pedestrian_minor_injury",
}

FLOAT_COLUMNS = {"latitude", "longitude"}


def _make_point(lat: Optional[float], lon: Optional[float]):
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None


def _parse_datetime(value: Any):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
        for fmt in (
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d",
            "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M",
            "%d-%m-%Y",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d/%m/%Y",
        ):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return "INVALID"
    return None


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
    if dt_val is not None and _parse_datetime(dt_val) == "INVALID":
        errors.append(
            f"Column 'accident_date_time': could not parse '{dt_val}' as a date/time"
        )

    return errors


def _coerce_import_record(row: Dict[str, Any]) -> Dict[str, Any]:
    def _float(value: Any) -> Optional[float]:
        if _is_blank(value):
            return None
        return float(value)

    def _int(value: Any) -> int:
        if _is_blank(value):
            return 0
        return int(float(value))

    coerced = {col: _clean_text(row.get(col)) for col in EXPECTED_COLUMNS}
    coerced["latitude"] = _float(row.get("latitude"))
    coerced["longitude"] = _float(row.get("longitude"))
    coerced["accident_date_time"] = _parse_datetime(row.get("accident_date_time"))
    if coerced["accident_date_time"] == "INVALID":
        coerced["accident_date_time"] = None
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
    return row


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
    severities = [
        value
        for (value,) in db.query(Accident.severity)
        .filter(Accident.severity.isnot(None), Accident.severity != "")
        .distinct()
        .order_by(Accident.severity)
        .all()
    ]
    police_stations = [
        value
        for (value,) in db.query(Accident.police_station)
        .filter(Accident.police_station.isnot(None), Accident.police_station != "")
        .distinct()
        .order_by(Accident.police_station)
        .all()
    ]
    return {"severities": severities, "police_stations": police_stations}


@router.post("/accidents", status_code=201)
def add_accident(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    accident_id = payload.get("accident_id") or f"MANUAL-{uuid.uuid4().hex[:10].upper()}"
    district = payload.get("district") or "Surat"

    existing = (
        db.query(Accident)
        .filter(Accident.accident_id == accident_id, Accident.district == district)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An accident with ID '{accident_id}' already exists.",
        )

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
        passenger_killed=row.get("passenger_killed"),
        passenger_grievous_injury=row.get("passenger_grievous_injury"),
        passenger_minor_injury=row.get("passenger_minor_injury"),
        pedestrian_killed=row.get("pedestrian_killed"),
        pedestrian_grievous_injury=row.get("pedestrian_grievous_injury"),
        pedestrian_minor_injury=row.get("pedestrian_minor_injury"),
        type_of_collision=row.get("type_of_collision"),
        collision_feature=row.get("collision_feature"),
        weather_condition=row.get("weather_condition"),
        light_condition=row.get("light_condition"),
        visibility=row.get("visibility"),
        traffic_violation=row.get("traffic_violation"),
    )

    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "message": "Accident record added successfully.",
        "id": record.id,
        "accident_id": record.accident_id,
    }


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
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
            | (Accident.type_of_collision.ilike(pattern))
            | (Accident.traffic_violation.ilike(pattern))
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
    for col_name, col_value in filter_map.items():
        if col_value:
            query = query.filter(getattr(Accident, col_name).ilike(f"%{col_value}%"))

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
    record.passenger_killed = row.get("passenger_killed")
    record.passenger_grievous_injury = row.get("passenger_grievous_injury")
    record.passenger_minor_injury = row.get("passenger_minor_injury")
    record.pedestrian_killed = row.get("pedestrian_killed")
    record.pedestrian_grievous_injury = row.get("pedestrian_grievous_injury")
    record.pedestrian_minor_injury = row.get("pedestrian_minor_injury")
    record.type_of_collision = row.get("type_of_collision")
    record.collision_feature = row.get("collision_feature")
    record.weather_condition = row.get("weather_condition")
    record.light_condition = row.get("light_condition")
    record.visibility = row.get("visibility")
    record.traffic_violation = row.get("traffic_violation")

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


@router.post("/accidents/upload")
async def upload_accidents_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "csv"):
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

    file_columns = [str(c).strip() for c in df.columns.tolist()]
    df.columns = file_columns
    missing_columns = [c for c in EXPECTED_COLUMNS if c not in file_columns]
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "missing_columns",
                "message": f"The uploaded file is missing {len(missing_columns)} required column(s).",
                "missing": missing_columns,
                "expected": EXPECTED_COLUMNS,
            },
        )

    df = df[EXPECTED_COLUMNS]
    raw_rows = df.to_dict(orient="records")
    candidate_ids = [
        str(row.get("accident_id") or "").strip()
        for row in raw_rows
        if str(row.get("accident_id") or "").strip()
    ]

    existing_ids = set()
    if candidate_ids:
        existing = (
            db.query(Accident.accident_id)
            .filter(Accident.accident_id.in_(candidate_ids))
            .all()
        )
        existing_ids = {r[0] for r in existing}

    seen_ids = set()
    valid_rows = []
    invalid_rows = []
    duplicate_rows = []

    for idx, raw_row in enumerate(raw_rows):
        row_num = idx + 2
        row_data = {col: _clean_text(raw_row.get(col)) for col in EXPECTED_COLUMNS}
        row_accident_id = row_data.get("accident_id")
        errors = _validate_import_row(raw_row)

        if row_accident_id and row_accident_id in existing_ids:
            duplicate_rows.append({
                "row": row_num,
                "accident_id": row_accident_id,
                "errors": ["Accident ID already exists in the database."],
                "data": row_data,
            })
            continue

        if row_accident_id and row_accident_id in seen_ids:
            duplicate_rows.append({
                "row": row_num,
                "accident_id": row_accident_id,
                "errors": ["Accident ID is duplicated within this file."],
                "data": row_data,
            })
            continue

        if row_accident_id:
            seen_ids.add(row_accident_id)

        if errors:
            invalid_rows.append({"row": row_num, "errors": errors, "data": row_data})
            continue

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

    row_errors = []
    normalized_records = []
    accident_ids = []
    for idx, row in enumerate(records_data):
        errors = _validate_import_row(row)
        if errors:
            row_errors.append({"row": idx + 1, "errors": errors})
            continue

        normalized = _coerce_import_record(row)
        if not normalized.get("accident_id"):
            normalized["accident_id"] = f"IMPORT-{uuid.uuid4().hex[:10].upper()}"
        normalized_records.append(normalized)
        accident_ids.append(normalized["accident_id"])

    if row_errors:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "validation_errors",
                "message": f"Found validation errors in {len(row_errors)} row(s).",
                "row_errors": row_errors[:50],
                "total_error_rows": len(row_errors),
            },
        )

    duplicate_payload_ids = sorted(
        {accident_id for accident_id in accident_ids if accident_ids.count(accident_id) > 1}
    )
    if duplicate_payload_ids:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "duplicate_records",
                "message": "The confirmed records contain duplicate accident IDs.",
                "duplicates": duplicate_payload_ids[:50],
            },
        )

    existing_ids = set()
    if accident_ids:
        existing = (
            db.query(Accident.accident_id)
            .filter(Accident.accident_id.in_(accident_ids))
            .all()
        )
        existing_ids = {r[0] for r in existing}

    if existing_ids:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "duplicate_records",
                "message": "Some confirmed records already exist in the database.",
                "duplicates": sorted(existing_ids)[:50],
            },
        )

    inserted = 0
    for row in normalized_records:
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
            passenger_killed=row.get("passenger_killed") or 0,
            passenger_grievous_injury=row.get("passenger_grievous_injury") or 0,
            passenger_minor_injury=row.get("passenger_minor_injury") or 0,
            pedestrian_killed=row.get("pedestrian_killed") or 0,
            pedestrian_grievous_injury=row.get("pedestrian_grievous_injury") or 0,
            pedestrian_minor_injury=row.get("pedestrian_minor_injury") or 0,
            type_of_collision=row.get("type_of_collision"),
            collision_feature=row.get("collision_feature"),
            weather_condition=row.get("weather_condition"),
            light_condition=row.get("light_condition"),
            visibility=row.get("visibility"),
            traffic_violation=row.get("traffic_violation"),
        )
        db.add(record)
        inserted += 1

    db.commit()
    return {"message": f"Successfully imported {inserted} record(s).", "inserted": inserted}

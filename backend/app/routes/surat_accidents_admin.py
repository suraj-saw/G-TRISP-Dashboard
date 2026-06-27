# backend/app/routes/surat_accidents_admin.py
"""
Admin-only endpoint for manually adding Surat accident records.
Lives under /api/admin/surat/accidents to keep admin routes grouped.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from geoalchemy2.shape import from_shape
from shapely.geometry import Point

from app.database import get_db
from app.models.surat_accident import SuratAccident
from app.routes.auth import get_current_admin_user
from app.models.user import User
from app.core.config import POSTGIS_SRID
from app.core.constants import ADMIN_SURAT_PREFIX

router = APIRouter(
    prefix=ADMIN_SURAT_PREFIX,
    tags=["Admin - Surat Accidents"],
)


def _make_point(lat: Optional[float], lon: Optional[float]):
    if lat is None or lon is None:
        return None
    try:
        return from_shape(Point(lon, lat), srid=POSTGIS_SRID)
    except Exception:
        return None


@router.post("/accidents", status_code=201)
def add_surat_accident(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Admin endpoint: manually insert a single Surat accident record.
    Accepts the same fields as the SuratAccident model.
    Auto-generates a unique accident_id if none is supplied.
    """
    from datetime import datetime

    # Auto-generate accident_id if not provided
    accident_id = payload.get("accident_id") or f"MANUAL-{uuid.uuid4().hex[:10].upper()}"

    # Duplicate check
    existing = db.query(SuratAccident).filter(
        SuratAccident.accident_id == accident_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An accident with ID '{accident_id}' already exists.",
        )

    lat = payload.get("latitude")
    lon = payload.get("longitude")

    # Parse datetime string if it comes as a string
    accident_date_time = payload.get("accident_date_time")
    if isinstance(accident_date_time, str) and accident_date_time:
        try:
            accident_date_time = datetime.fromisoformat(accident_date_time)
        except ValueError:
            accident_date_time = None

    record = SuratAccident(
        accident_id=accident_id,
        district=payload.get("district") or "Surat",
        police_station=payload.get("police_station"),
        accident_date_time=accident_date_time,
        latitude=lat,
        longitude=lon,
        location=_make_point(lat, lon),
        road_name=payload.get("road_name"),
        road_classification=payload.get("road_classification"),
        severity=payload.get("severity"),
        number_of_vehicles=int(payload.get("number_of_vehicles") or 0),
        driver_killed=int(payload.get("driver_killed") or 0),
        driver_grievous_injury=int(payload.get("driver_grievous_injury") or 0),
        driver_minor_injury=int(payload.get("driver_minor_injury") or 0),
        passenger_killed=int(payload.get("passenger_killed") or 0),
        passenger_grievous_injury=int(payload.get("passenger_grievous_injury") or 0),
        passenger_minor_injury=int(payload.get("passenger_minor_injury") or 0),
        pedestrian_killed=int(payload.get("pedestrian_killed") or 0),
        pedestrian_grievous_injury=int(payload.get("pedestrian_grievous_injury") or 0),
        pedestrian_minor_injury=int(payload.get("pedestrian_minor_injury") or 0),
        type_of_collision=payload.get("type_of_collision"),
        collision_feature=payload.get("collision_feature"),
        weather_condition=payload.get("weather_condition"),
        light_condition=payload.get("light_condition"),
        visibility=payload.get("visibility"),
        traffic_violation=payload.get("traffic_violation"),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "message": "Accident record added successfully.",
        "id": record.id,
        "accident_id": record.accident_id,
    }
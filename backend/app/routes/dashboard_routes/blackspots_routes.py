# backend/app/routes/dashboard_routes/blackspots_routes.py

"""
Blackspot Detection & Export Endpoints (Greedy, DBSCAN, IRC, Pedestrian, Network Blackspots).
"""

import calendar
import csv
import io
import json
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query, Body
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse, StreamingResponse
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
from sqlalchemy import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from shapely.geometry import shape, LineString
import shapely

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.models.snapped_accident import SnappedAccident
from app.models.gujarat_road import GujaratRoad
from app.utils.accident_utils import apply_filters, validate_observation_period, total_fatalities, total_grievous, total_minor
from app.utils.blackspot_utils import (
    CrashPoint,
    greedy_blackspots,
    dbscan_blackspots,
    blackspots_to_geojson,
)
from app.utils.irc_blackspot_utils import (
    irc_greedy_blackspots,
    irc_grid_blackspots,
    irc_blackspots_to_geojson,
    DISTRICT_ROAD_NETWORK_KM,
    DEFAULT_ROAD_NETWORK_KM,
)
from app.utils.network_blackspot_utils import network_sliding_window
from app.utils.export_utils import (
    build_accident_csv,
    build_accident_excel,
)
from app.utils.text_utils import safe_text
from app.core.constants import (
    BLACKSPOT_RADIUS_METERS,
    BLACKSPOT_MIN_CRASHES,
    PEDESTRIAN_BLACKSPOT_MIN_CRASHES,
    WEEKDAY_ORDER,
    HOURS_IN_DAY,
    UNKNOWN_LABEL,
)
from app.routes.dashboard_routes.common import (
    time_period_for_hour,
    format_hour_label,
    peak_item,
)

router = APIRouter()


@router.get("/blackspots")
def get_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(
            status_code=400,
            content={"detail": validation_error},
        )

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]

    blackspots = greedy_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    geojson = blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": min_crashes,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/pedestrian-blackspots")
def get_pedestrian_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(PEDESTRIAN_BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.filter(
        (
            func.coalesce(Accident.pedestrian_killed, 0) +
            func.coalesce(Accident.pedestrian_grievous_injury, 0) +
            func.coalesce(Accident.pedestrian_minor_injury, 0)
        ) > 0
    ).all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(
            status_code=400,
            content={"detail": validation_error},
        )

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]

    blackspots = greedy_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    geojson = blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": min_crashes,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/dbscan-blackspots")
def get_dbscan_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(
            status_code=400,
            content={"detail": validation_error},
        )

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]

    blackspots = dbscan_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    geojson = blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": min_crashes,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/pedestrian-dbscan-blackspots")
def get_pedestrian_dbscan_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(PEDESTRIAN_BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.filter(
        (
            func.coalesce(Accident.pedestrian_killed, 0) +
            func.coalesce(Accident.pedestrian_grievous_injury, 0) +
            func.coalesce(Accident.pedestrian_minor_injury, 0)
        ) > 0
    ).all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(
            status_code=400,
            content={"detail": validation_error},
        )

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]

    blackspots = dbscan_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    geojson = blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": min_crashes,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/irc-greedy-blackspots")
def get_irc_greedy_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    road_network_km: Optional[float] = Query(None, ge=1.0),
    db: Session = Depends(get_db),
):
    if road_network_km is None:
        if district and len(district) == 1:
            road_network_km = DISTRICT_ROAD_NETWORK_KM.get(district[0], DEFAULT_ROAD_NETWORK_KM)
        else:
            road_network_km = DEFAULT_ROAD_NETWORK_KM
    
    base_query = apply_filters(
        db.query(Accident),
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db,
        number_of_vehicles=number_of_vehicles, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(status_code=400, content={"detail": validation_error})

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]
    
    years_of_data = 3.0
    if year and len(year) > 0:
        years_of_data = float(len(set(year)))
    elif accidents:
        unique_years = set(a.accident_date_time.year for a in accidents if a.accident_date_time)
        years_of_data = float(len(unique_years)) if unique_years else 3.0
        
    if years_of_data < 1.0:
        years_of_data = 1.0

    blackspots = irc_greedy_blackspots(points, radius_m=radius_m, road_network_km=road_network_km, years_of_data=years_of_data, total_network_crashes=total_network_crashes)
    geojson = irc_blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": 0,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/irc-grid-blackspots")
def get_irc_grid_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    road_network_km: Optional[float] = Query(None, ge=1.0),
    spacing_m: float = Query(50.0, ge=10.0),
    db: Session = Depends(get_db),
):
    if road_network_km is None:
        if district and len(district) == 1:
            road_network_km = DISTRICT_ROAD_NETWORK_KM.get(district[0], DEFAULT_ROAD_NETWORK_KM)
        else:
            road_network_km = DEFAULT_ROAD_NETWORK_KM
    
    base_query = apply_filters(
        db.query(Accident),
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db,
        number_of_vehicles=number_of_vehicles, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(status_code=400, content={"detail": validation_error})

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]
    
    years_of_data = 3.0
    if year and len(year) > 0:
        years_of_data = float(len(set(year)))
    elif accidents:
        unique_years = set(a.accident_date_time.year for a in accidents if a.accident_date_time)
        years_of_data = float(len(unique_years)) if unique_years else 3.0
        
    if years_of_data < 1.0:
        years_of_data = 1.0

    blackspots = irc_grid_blackspots(points, radius_m=radius_m, spacing_m=spacing_m, road_network_km=road_network_km, years_of_data=years_of_data, total_network_crashes=total_network_crashes)
    geojson = irc_blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": 0,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/pedestrian-irc-greedy-blackspots")
def get_pedestrian_irc_greedy_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    road_network_km: Optional[float] = Query(None, ge=1.0),
    db: Session = Depends(get_db),
):
    if road_network_km is None:
        if district and len(district) == 1:
            road_network_km = DISTRICT_ROAD_NETWORK_KM.get(district[0], DEFAULT_ROAD_NETWORK_KM)
        else:
            road_network_km = DEFAULT_ROAD_NETWORK_KM
    
    base_query = apply_filters(
        db.query(Accident),
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db,
        number_of_vehicles=number_of_vehicles, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)
            
    query = query.filter(
        (
            func.coalesce(Accident.pedestrian_killed, 0) +
            func.coalesce(Accident.pedestrian_grievous_injury, 0) +
            func.coalesce(Accident.pedestrian_minor_injury, 0)
        ) > 0
    )

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(status_code=400, content={"detail": validation_error})

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]
    
    years_of_data = 3.0
    if year and len(year) > 0:
        years_of_data = float(len(set(year)))
    elif accidents:
        unique_years = set(a.accident_date_time.year for a in accidents if a.accident_date_time)
        years_of_data = float(len(unique_years)) if unique_years else 3.0
        
    if years_of_data < 1.0:
        years_of_data = 1.0

    blackspots = irc_greedy_blackspots(points, radius_m=radius_m, road_network_km=road_network_km, years_of_data=years_of_data, total_network_crashes=total_network_crashes)
    geojson = irc_blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": 0,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/pedestrian-irc-grid-blackspots")
def get_pedestrian_irc_grid_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    road_network_km: Optional[float] = Query(None, ge=1.0),
    spacing_m: float = Query(50.0, ge=10.0),
    db: Session = Depends(get_db),
):
    if road_network_km is None:
        if district and len(district) == 1:
            road_network_km = DISTRICT_ROAD_NETWORK_KM.get(district[0], DEFAULT_ROAD_NETWORK_KM)
        else:
            road_network_km = DEFAULT_ROAD_NETWORK_KM
    
    base_query = apply_filters(
        db.query(Accident),
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db,
        number_of_vehicles=number_of_vehicles, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)
            
    query = query.filter(
        (
            func.coalesce(Accident.pedestrian_killed, 0) +
            func.coalesce(Accident.pedestrian_grievous_injury, 0) +
            func.coalesce(Accident.pedestrian_minor_injury, 0)
        ) > 0
    )

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(status_code=400, content={"detail": validation_error})

    points = [
        CrashPoint(
            index=idx,
            accident_db_id=a.id,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
            number_of_vehicles=a.number_of_vehicles or 0,
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]
    
    years_of_data = 3.0
    if year and len(year) > 0:
        years_of_data = float(len(set(year)))
    elif accidents:
        unique_years = set(a.accident_date_time.year for a in accidents if a.accident_date_time)
        years_of_data = float(len(unique_years)) if unique_years else 3.0
        
    if years_of_data < 1.0:
        years_of_data = 1.0

    blackspots = irc_grid_blackspots(points, radius_m=radius_m, spacing_m=spacing_m, road_network_km=road_network_km, years_of_data=years_of_data, total_network_crashes=total_network_crashes)
    geojson = irc_blackspots_to_geojson(blackspots, radius_m=radius_m)

    return {
        "total_crashes": len(points),
        "total_blackspots": len(blackspots),
        "isolated_crashes": len(points) - sum(b.crash_count for b in blackspots),
        "radius_m": radius_m,
        "min_crashes": 0,
        "circles": geojson["circles"],
        "centroids": geojson["centroids"],
    }


@router.get("/network-blackspots", summary="Get network-constrained blackspot segments")
def get_network_blackspots(
    db: Session = Depends(get_db),
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    is_pedestrian: bool = Query(False),
    window_size_m: float = Query(500.0, description="Sliding window size in meters"),
    min_qualifying_crashes: int = Query(3, description="Minimum qualifying crashes"),
    merge_lanes: bool = Query(False, description="Merge parallel lane segments using spatial clustering")
):
    """
    Computes network-constrained blackspot road segments based on snapped accidents.
    Uses sliding window analysis along Gujarat road geometries.
    """
    query = db.query(
        Accident.id.label("accident_id"),
        Accident.severity,
        Accident.number_of_vehicles,
        Accident.accident_date_time,
        SnappedAccident.road_id,
        func.ST_LineLocatePoint(GujaratRoad.geometry, SnappedAccident.snapped_location).label("fraction"),
        func.ST_Length(func.ST_Transform(GujaratRoad.geometry, 3857)).label("road_length_m")
    ).join(
        SnappedAccident, Accident.id == SnappedAccident.accident_id
    ).join(
        GujaratRoad, SnappedAccident.road_id == GujaratRoad.id
    )

    if is_pedestrian:
        query = query.filter(
            (
                func.coalesce(Accident.pedestrian_killed, 0) +
                func.coalesce(Accident.pedestrian_grievous_injury, 0) +
                func.coalesce(Accident.pedestrian_minor_injury, 0)
            ) > 0
        )

    query = apply_filters(
        query, district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to, taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    
    if severity:
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)

    rows = query.all()
    
    validation_error = validate_observation_period(rows, selected_years=year)
    if validation_error:
        return JSONResponse(status_code=400, content={"detail": validation_error})
    
    accidents_data = [
        {
            "accident_id": r.accident_id,
            "road_id": r.road_id,
            "severity": r.severity,
            "fraction": r.fraction,
            "road_length_m": r.road_length_m,
            "number_of_vehicles": r.number_of_vehicles or 0,
        }
        for r in rows
    ]
    
    candidate_segments = network_sliding_window(
        accidents_data,
        window_size_m=window_size_m,
        min_qualifying_crashes=min_qualifying_crashes
    )
    
    if not candidate_segments:
        return {"type": "FeatureCollection", "features": []}
        
    features = []
    for seg in candidate_segments:
        geom_query = db.query(
            func.ST_AsGeoJSON(
                func.ST_LineSubstring(
                    GujaratRoad.geometry,
                    seg["start_fraction"],
                    seg["end_fraction"]
                )
            )
        ).filter(GujaratRoad.id == seg["road_id"]).scalar()
        
        if geom_query:
            features.append({
                "type": "Feature",
                "geometry": json.loads(geom_query),
                "properties": {
                    "road_id": seg["road_id"],
                    "start_m": round(seg["start_m"], 2),
                    "end_m": round(seg["end_m"], 2),
                    "score": seg["score"],
                    "priority_label": seg.get("priority_label", "Unknown"),
                    "priority_color": seg.get("priority_color", "#DC2626"),
                    "qualifying_count": seg.get("qualifying_count", 0),
                    "fatal_count": seg.get("fatal_count", 0),
                    "grievous_count": seg.get("grievous_count", 0),
                    "minor_hospitalized_count": seg.get("minor_hospitalized_count", 0),
                    "minor_non_hospitalized_count": seg.get("minor_non_hospitalized_count", 0),
                    "vehicle_count": seg.get("vehicle_count", 0),
                    "accident_count": seg["accident_count"],
                    "accident_ids": seg.get("accident_ids", [])
                }
            })
            
    if merge_lanes and features:
        from app.utils.blackspot_utils import priority_label_and_color
        # Convert to shapely geometries and cluster them
        import math
        def get_bearing(g):
            coords = list(g.coords)
            if len(coords) < 2: return 0
            dx = coords[-1][0] - coords[0][0]
            dy = coords[-1][1] - coords[0][1]
            return math.degrees(math.atan2(dy, dx)) % 360

        def are_parallel(b1, b2, tol=30):
            diff = abs(b1 - b2) % 360
            return (diff <= tol) or (diff >= 360 - tol) or (abs(diff - 180) <= tol)

        shapely_features = []
        for f in features:
            geom = shape(f["geometry"])
            shapely_features.append({
                "feature": f,
                "geom": geom,
                "buffer": geom.buffer(0.0003), # roughly 30m in degrees for EPSG:4326
                "bearing": get_bearing(geom)
            })
            
        merged_features = []
        used = set()
        
        for i, s1 in enumerate(shapely_features):
            if i in used:
                continue
            
            cluster = [s1]
            used.add(i)
            
            # Find intersecting buffers (parallel lanes)
            for j, s2 in enumerate(shapely_features):
                if j not in used and s1["buffer"].intersects(s2["buffer"]):
                    if are_parallel(s1["bearing"], s2["bearing"]):
                        cluster.append(s2)
                        used.add(j)
                    
            if len(cluster) == 1:
                merged_features.append(s1["feature"])
            else:
                # Aggregate properties
                acc_ids = set()
                total_fatal = 0
                total_grievous = 0
                total_minor_hosp = 0
                total_minor_non = 0
                total_vehicles = 0
                total_qualifying = 0
                new_score = 0
                
                for item in cluster:
                    p = item["feature"]["properties"]
                    acc_ids.update(p.get("accident_ids", []))
                    total_fatal += p.get("fatal_count", 0)
                    total_grievous += p.get("grievous_count", 0)
                    total_minor_hosp += p.get("minor_hospitalized_count", 0)
                    total_minor_non += p.get("minor_non_hospitalized_count", 0)
                    total_vehicles += p.get("vehicle_count", 0)
                    total_qualifying += p.get("qualifying_count", 0)
                    new_score += p.get("score", 0)
                    
                new_label, new_color = priority_label_and_color(new_score, total_qualifying)
                
                # Pick the longest geometry as representative
                longest_item = max(cluster, key=lambda x: x["geom"].length)
                new_feature = {
                    "type": "Feature",
                    "geometry": longest_item["feature"]["geometry"],
                    "properties": {
                        "road_id": longest_item["feature"]["properties"]["road_id"],
                        "start_m": longest_item["feature"]["properties"]["start_m"],
                        "end_m": longest_item["feature"]["properties"]["end_m"],
                        "score": new_score,
                        "priority_label": new_label,
                        "priority_color": new_color,
                        "qualifying_count": total_qualifying,
                        "fatal_count": total_fatal,
                        "grievous_count": total_grievous,
                        "minor_hospitalized_count": total_minor_hosp,
                        "minor_non_hospitalized_count": total_minor_non,
                        "vehicle_count": total_vehicles,
                        "accident_count": len(acc_ids),
                        "accident_ids": list(acc_ids)
                    }
                }
                merged_features.append(new_feature)
                
        features = merged_features

    return {
        "type": "FeatureCollection",
        "features": features
    }


@router.get("/blackspot-export")
def export_blackspots(
    format: str = Query("csv", enum=["csv", "excel"]),
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    algorithm: str = Query("greedy", enum=["greedy", "dbscan"]),
    bs_ids: Optional[str] = Query(None, description="Blackspot number(s) to export: single (e.g. 3), range (e.g. 1-5), or comma-separated (e.g. 1,3,5)"),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    dt = datetime

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity and "all" not in severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()

    validation_error = validate_observation_period(accidents, selected_years=year)
    if validation_error:
        return JSONResponse(
            status_code=400,
            content={"detail": validation_error},
        )

    filtered_accidents = []
    points = []
    for idx, a in enumerate(accidents):
        if a.latitude is not None and a.longitude is not None:
            filtered_accidents.append(a)
            points.append(CrashPoint(
                index=len(points),
                accident_db_id=a.id,
                accident_id=a.accident_id,
                lat=a.latitude,
                lon=a.longitude,
                severity=a.severity or "Unknown",
                number_of_vehicles=a.number_of_vehicles or 0,
            ))

    if algorithm == "dbscan":
        blackspots = dbscan_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    else:
        blackspots = greedy_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)

    acc_by_db_id = {a.id: a for a in filtered_accidents}

    target_bs_ids = []
    if bs_ids is not None:
        bs_ids = bs_ids.strip()
        if bs_ids:
            parts = [p.strip() for p in bs_ids.split(',') if p.strip()]
            for part in parts:
                if '-' in part:
                    range_parts = part.split('-')
                    if len(range_parts) == 2:
                        try:
                            start = int(range_parts[0].strip())
                            end = int(range_parts[1].strip())
                            if start <= end:
                                target_bs_ids.extend(range(start, end + 1))
                        except ValueError:
                            pass
                else:
                    try:
                        target_bs_ids.append(int(part.strip()))
                    except ValueError:
                        pass

    if target_bs_ids:
        target_bs = [bs for bs in blackspots if bs.bs_id in target_bs_ids]
    else:
        target_bs = blackspots

    accidents_with_bs = []
    for bs in target_bs:
        for cid in bs.crash_ids:
            try:
                db_id = int(cid)
                acc = acc_by_db_id.get(db_id)
                if acc:
                    accidents_with_bs.append((bs.bs_id, acc))
            except ValueError:
                pass

    timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
    if bs_ids is not None and bs_ids.strip():
        safe_bs_ids = bs_ids.replace(' ', '_').replace(',', '_').replace('-', '_to_')
        filename = f"blackspots_{safe_bs_ids}_accidents_{algorithm}_{timestamp}"
    else:
        filename = f"all_blackspot_accidents_{algorithm}_{timestamp}"

    if format == "csv":
        csv_data = build_accident_csv(accidents_with_bs)
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}.csv"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    meta_rows = [
        ("Export Date", dt.now().strftime("%d %b %Y %H:%M")),
        ("Algorithm", algorithm.upper()),
        ("Blackspot #", bs_ids if bs_ids is not None and bs_ids.strip() else "All"),
        ("Total Blackspots", len(target_bs)),
        ("Total Accident Records", len(accidents_with_bs)),
        ("Total Crashes Analyzed", len(points)),
        ("Radius (m)", radius_m),
        ("Min Crashes Threshold", min_crashes),
        ("Source", "G-TRISP Dashboard"),
    ]
    buf = build_accident_excel(accidents_with_bs, meta_rows)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}.xlsx"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )

@router.get("/blackspots/crash-ids-by-bs-ids")
def get_crash_ids_by_bs_ids(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    algorithm: str = Query("greedy", enum=["greedy", "dbscan"]),
    bs_ids: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    if severity and "all" not in severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()
    points = []
    for a in accidents:
        if a.latitude is not None and a.longitude is not None:
            points.append(CrashPoint(
                index=len(points),
                accident_db_id=a.id,
                accident_id=a.accident_id,
                lat=a.latitude,
                lon=a.longitude,
                severity=a.severity or "Unknown",
                number_of_vehicles=a.number_of_vehicles or 0,
            ))

    if algorithm == "dbscan":
        blackspots = dbscan_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    else:
        blackspots = greedy_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)

    target_bs_ids = []
    if bs_ids is not None:
        bs_ids = bs_ids.strip()
        if bs_ids:
            parts = [p.strip() for p in bs_ids.split(',') if p.strip()]
            for part in parts:
                if '-' in part:
                    range_parts = part.split('-')
                    if len(range_parts) == 2:
                        try:
                            start = int(range_parts[0].strip())
                            end = int(range_parts[1].strip())
                            if start <= end:
                                target_bs_ids.extend(range(start, end + 1))
                        except ValueError:
                            pass
                else:
                    try:
                        target_bs_ids.append(int(part.strip()))
                    except ValueError:
                        pass

    if target_bs_ids:
        target_bs = [bs for bs in blackspots if bs.bs_id in target_bs_ids]
    else:
        target_bs = blackspots

    crash_ids = []
    for bs in target_bs:
        crash_ids.extend(bs.crash_ids)

    return {"crash_ids": list(set(crash_ids))}


# ═══════════════════════════════════════════════════════════════════════════════
# Blackspot PDF Report Data Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

class CrashIdsRequest(BaseModel):
    crash_ids: List[str]


def _fetch_accidents_by_ids(crash_ids: List[str], db: Session) -> list:
    """Fetch Accident rows by a list of crash IDs (DB primary keys or accident_id strings)."""
    if not crash_ids:
        return []
    db_ids = [int(cid) for cid in crash_ids if cid.isdigit()]
    if db_ids:
        accidents = (
            db.query(Accident)
            .filter(Accident.id.in_(db_ids))
            .order_by(Accident.accident_date_time)
            .all()
        )
        if accidents:
            return accidents
    return (
        db.query(Accident)
        .filter(Accident.accident_id.in_(crash_ids))
        .order_by(Accident.accident_date_time)
        .all()
    )


@router.post("/blackspots/crash-stats")
def get_blackspot_crash_stats(
    req: CrashIdsRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    Compute the same statistical aggregations as /district-stats,
    but scoped to a specific set of crash IDs from a blackspot cluster.
    Returns DistrictStats-compatible JSON for the frontend DistrictStatisticalAnalysis component.
    """
    accidents = _fetch_accidents_by_ids(req.crash_ids, db)
    total = len(accidents)

    severity_counts = defaultdict(int)
    road_counts = defaultdict(int)
    collision_type_counts = defaultdict(int)
    collision_nature_counts = defaultdict(int)
    weather_counts = defaultdict(int)
    light_counts = defaultdict(int)
    visibility_counts = defaultdict(int)

    road_severity_counts = defaultdict(lambda: defaultdict(int))
    collision_severity_counts = defaultdict(lambda: defaultdict(int))
    weather_severity_counts = defaultdict(lambda: defaultdict(int))
    light_severity_counts = defaultdict(lambda: defaultdict(int))
    road_collision_counts = defaultdict(lambda: defaultdict(int))
    time_severity_counts = defaultdict(lambda: defaultdict(int))
    monthly_stats = defaultdict(lambda: {"total": 0, "fatalities": 0})
    police_station_stats = defaultdict(lambda: {"total": 0, "fatal_accidents": 0})

    vehicle_involvement_counts = {"1 Vehicle": 0, "2 Vehicles": 0, "3 Vehicles": 0, "4+ Vehicles": 0}
    victim_counts = {
        "Drivers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Passengers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Pedestrians": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
    }

    hourly = defaultdict(int)
    monthly = defaultdict(int)

    for accident in accidents:
        severity_name = safe_text(accident.severity)
        mapped_severity = "Fatal" if severity_name == "Fatal" else ("Grievous Injury" if severity_name == "Grievous Injury" else "Other")
        severity_counts[mapped_severity] += 1
        road_counts[safe_text(accident.road_classification)] += 1
        collision_type_counts[safe_text(accident.type_of_collision)] += 1
        collision_nature_counts[safe_text(accident.collision_feature)] += 1
        weather_counts[safe_text(accident.weather_condition)] += 1
        light_counts[safe_text(accident.light_condition)] += 1
        visibility_counts[safe_text(accident.visibility)] += 1

        road_severity_counts[safe_text(accident.road_classification)][severity_name] += 1
        collision_severity_counts[safe_text(accident.type_of_collision)][severity_name] += 1
        weather_severity_counts[safe_text(accident.weather_condition)][severity_name] += 1
        light_severity_counts[safe_text(accident.light_condition)][severity_name] += 1
        road_collision_counts[safe_text(accident.road_classification)][safe_text(accident.type_of_collision)] += 1

        ps = safe_text(accident.police_station)
        if ps != "Unknown":
            police_station_stats[ps]["total"] += 1
            if severity_name == "Fatal":
                police_station_stats[ps]["fatal_accidents"] += 1

        v_count = accident.number_of_vehicles or 0
        if v_count == 1:
            vehicle_involvement_counts["1 Vehicle"] += 1
        elif v_count == 2:
            vehicle_involvement_counts["2 Vehicles"] += 1
        elif v_count == 3:
            vehicle_involvement_counts["3 Vehicles"] += 1
        elif v_count >= 4:
            vehicle_involvement_counts["4+ Vehicles"] += 1

        victim_counts["Drivers"]["Killed"] += accident.driver_killed or 0
        victim_counts["Drivers"]["Grievous Injury"] += accident.driver_grievous_injury or 0
        victim_counts["Drivers"]["Minor Injury"] += accident.driver_minor_injury or 0

        victim_counts["Passengers"]["Killed"] += accident.passenger_killed or 0
        victim_counts["Passengers"]["Grievous Injury"] += accident.passenger_grievous_injury or 0
        victim_counts["Passengers"]["Minor Injury"] += accident.passenger_minor_injury or 0

        victim_counts["Pedestrians"]["Killed"] += accident.pedestrian_killed or 0
        victim_counts["Pedestrians"]["Grievous Injury"] += accident.pedestrian_grievous_injury or 0
        victim_counts["Pedestrians"]["Minor Injury"] += accident.pedestrian_minor_injury or 0

        occurred_at = accident.accident_date_time
        if occurred_at:
            month_key = occurred_at.strftime("%Y-%m")
            monthly[month_key] += 1
            hourly[occurred_at.hour] += 1
            monthly_stats[month_key]["total"] += 1
            monthly_stats[month_key]["fatalities"] += total_fatalities(accident)

            hour = occurred_at.hour
            if 5 <= hour < 12:
                time_period = "Morning"
            elif 12 <= hour < 17:
                time_period = "Afternoon"
            elif 17 <= hour < 21:
                time_period = "Evening"
            else:
                time_period = "Night"
            time_severity_counts[time_period][severity_name] += 1

    peak_hour = max(hourly, key=lambda k: hourly[k]) if hourly else None

    insights = []
    if severity_counts:
        top_severity = max(severity_counts, key=lambda k: severity_counts[k])
        if top_severity and top_severity != "Unknown":
            insights.append(f"{top_severity} accidents account for the largest share of crashes.")
    if road_counts:
        top_road = max(road_counts, key=lambda k: road_counts[k])
        if top_road and top_road != "Unknown":
            insights.append(f"{top_road}s record the highest accident count.")
    if collision_type_counts:
        top_collision = max(collision_type_counts, key=lambda k: collision_type_counts[k])
        if top_collision and top_collision != "Unknown":
            insights.append(f"{top_collision} collisions are the dominant collision type.")
    if weather_counts:
        top_weather = max(weather_counts, key=lambda k: weather_counts[k])
        if top_weather and top_weather != "Unknown":
            insights.append(f"Most crashes occurred under {top_weather.lower()} weather.")
    fatality_by_victim = {k: v["Killed"] for k, v in victim_counts.items()}
    if any(fatality_by_victim.values()):
        top_victim_fatal = max(fatality_by_victim, key=lambda k: fatality_by_victim[k])
        insights.append(f"{top_victim_fatal} represent the largest share of fatalities.")
    if not insights:
        insights.append("Not enough data to generate statistical insights.")

    return {
        "total_accidents": total,
        "total_fatalities": sum(total_fatalities(a) for a in accidents),
        "total_injuries": sum(total_grievous(a) + total_minor(a) for a in accidents),
        "avg_per_month": round(total / len(monthly), 1) if monthly else 0,
        "peak_hour": peak_hour,
        "yoy_change": None,
        "severity_breakdown": [{"label": k, "count": v, "percentage": round(v * 100 / total, 1) if total else 0} for k, v in sorted(severity_counts.items(), key=lambda item: item[1], reverse=True)],
        "road_type_breakdown": [{"road_type": k, "count": v} for k, v in sorted(road_counts.items(), key=lambda item: item[1], reverse=True)[:8]],
        "collision_type_breakdown": [{"label": k, "count": v} for k, v in sorted(collision_type_counts.items(), key=lambda item: item[1], reverse=True) if k != "Unknown"],
        "collision_nature_breakdown": [{"label": k, "count": v} for k, v in sorted(collision_nature_counts.items(), key=lambda item: item[1], reverse=True) if k != "Unknown"],
        "weather_breakdown": [{"label": k, "count": v} for k, v in sorted(weather_counts.items(), key=lambda item: item[1], reverse=True) if k != "Unknown"],
        "light_breakdown": [{"label": k, "count": v} for k, v in sorted(light_counts.items(), key=lambda item: item[1], reverse=True) if k != "Unknown"],
        "vehicle_involvement_breakdown": [{"label": k, "count": v} for k, v in vehicle_involvement_counts.items()],
        "victim_composition": [{"type": k, **v} for k, v in victim_counts.items()],
        "visibility_breakdown": [{"label": k, "count": v} for k, v in sorted(visibility_counts.items(), key=lambda item: item[1], reverse=True) if k != "Unknown"],
        "statistical_insights": insights,
        "road_severity_matrix": [{"name": k, **v} for k, v in road_severity_counts.items() if k != "Unknown"],
        "collision_severity_matrix": [{"name": k, **v} for k, v in collision_severity_counts.items() if k != "Unknown"],
        "weather_severity_matrix": [{"name": k, **v} for k, v in weather_severity_counts.items() if k != "Unknown"],
        "light_severity_matrix": [{"name": k, **v} for k, v in light_severity_counts.items() if k != "Unknown"],
        "road_collision_matrix": [{"name": k, **v} for k, v in road_collision_counts.items() if k != "Unknown"],
        "time_severity_matrix": [{"name": k, **v} for k, v in time_severity_counts.items()],
        "monthly_fatality_rate": [
            {"month": k, "total": v["total"], "fatalities": v["fatalities"], "fatality_rate": round(v["fatalities"] / v["total"] * 100, 1) if v["total"] > 0 else 0}
            for k, v in sorted(monthly_stats.items())
        ],
        "police_station_stats": [
            {"police_station": k, "total": v["total"], "fatal_accidents": v["fatal_accidents"], "fatality_rate": round(v["fatal_accidents"] / v["total"] * 100, 1) if v["total"] > 0 else 0}
            for k, v in sorted(police_station_stats.items(), key=lambda item: item[1]["total"], reverse=True)[:15]
        ],
    }


@router.post("/blackspots/crash-temporal")
def get_blackspot_crash_temporal(
    req: CrashIdsRequest = Body(...),
    db: Session = Depends(get_db),
):
    """
    Compute the same temporal analysis as /temporal-analysis,
    but scoped to a specific set of crash IDs from a blackspot cluster.
    Returns TemporalAnalysisData-compatible JSON for the frontend TemporalAnalysis component.
    """
    accidents = _fetch_accidents_by_ids(req.crash_ids, db)

    accidents_with_dt = []
    for accident in accidents:
        dt = accident.accident_date_time
        if dt:
            accidents_with_dt.append((accident, dt))

    hour_day_counts = defaultdict(int)
    hourly_counts = {h: 0 for h in range(HOURS_IN_DAY)}
    monthly_counts = defaultdict(int)
    day_counts = defaultdict(int)
    period_counts = defaultdict(int)
    time_severity_counts = defaultdict(lambda: defaultdict(int))
    monthly_stats = defaultdict(lambda: {"total": 0, "fatalities": 0})

    month_only_counts = defaultdict(int)
    year_only_counts = defaultdict(int)
    weekend_counts = {"Weekday": 0, "Weekend": 0}
    severity_by_hour = {h: {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0} for h in range(HOURS_IN_DAY)}
    severity_by_weekend_weekday = {
        "Weekday": {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0},
        "Weekend": {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0},
    }

    for accident, dt in accidents_with_dt:
        hour = dt.hour
        day_name = dt.strftime("%A")
        period = time_period_for_hour(hour)

        hour_day_counts[(hour, day_name)] += 1
        hourly_counts[hour] += 1
        monthly_counts[(dt.year, dt.month)] += 1
        day_counts[day_name] += 1
        period_counts[period] += 1

        month_key = dt.strftime("%Y-%m")
        monthly_stats[month_key]["total"] += 1
        if safe_text(accident.severity) == "Fatal":
            monthly_stats[month_key]["fatalities"] += 1

        month_only_counts[dt.month] += 1
        year_only_counts[dt.year] += 1

        is_weekend = day_name in ["Saturday", "Sunday"]
        ww_label = "Weekend" if is_weekend else "Weekday"
        weekend_counts[ww_label] += 1

        sev = safe_text(accident.severity)

        if sev not in severity_by_hour[hour]:
            severity_by_hour[hour][sev] = 0
        if sev not in severity_by_weekend_weekday[ww_label]:
            severity_by_weekend_weekday[ww_label][sev] = 0

        severity_by_hour[hour][sev] += 1
        severity_by_weekend_weekday[ww_label][sev] += 1
        time_severity_counts[period][sev] += 1

    peak_hour_key, peak_hour_count = peak_item(hourly_counts, 0)
    peak_day, peak_day_count = peak_item(day_counts, UNKNOWN_LABEL)
    peak_month_key, peak_month_count = peak_item(monthly_counts, (0, 0))
    peak_period, peak_period_count = peak_item(period_counts, UNKNOWN_LABEL)

    peak_hour_label = format_hour_label(peak_hour_key) if hourly_counts else UNKNOWN_LABEL
    peak_month_label = (
        f"{calendar.month_abbr[peak_month_key[1]]} {peak_month_key[0]}"
        if peak_month_key != (0, 0)
        else UNKNOWN_LABEL
    )

    insights = []
    if hourly_counts and peak_hour_count > 0:
        insights.append(f"Peak accident hour is {peak_hour_label}.")
    if day_counts:
        top_day = max(day_counts, key=lambda k: day_counts[k])
        insights.append(f"{top_day} records the highest accident frequency.")
    if period_counts:
        top_period = max(period_counts, key=lambda k: period_counts[k])
        insights.append(f"{top_period} is the highest-risk time period.")
    if month_only_counts:
        top_month_num = max(month_only_counts, key=lambda k: month_only_counts[k])
        top_month_name = calendar.month_name[top_month_num]
        insights.append(f"{top_month_name} has the highest accident count.")
    if not insights:
        insights.append("Not enough data to generate temporal insights.")

    return {
        "hour_day": [
            {"hour": hour, "day": day_name, "count": hour_day_counts[(hour, day_name)]}
            for day_name in WEEKDAY_ORDER
            for hour in range(HOURS_IN_DAY)
        ],
        "hourly": [
            {"hour": h, "count": hourly_counts[h]}
            for h in range(HOURS_IN_DAY)
        ],
        "monthly": [
            {"year": yr, "month": mo, "month_label": f"{calendar.month_abbr[mo]} {yr}", "count": count}
            for (yr, mo), count in sorted(monthly_counts.items())
        ],
        "summary": {
            "peak_hour": peak_hour_label,
            "peak_hour_count": peak_hour_count,
            "peak_day": peak_day,
            "peak_day_count": peak_day_count,
            "peak_month": peak_month_label,
            "peak_month_count": peak_month_count,
            "peak_time_period": peak_period,
            "peak_time_period_count": peak_period_count,
            "total_accidents": len(accidents_with_dt),
        },
        "day_of_week_distribution": [
            {"day": day_name, "count": day_counts.get(day_name, 0)}
            for day_name in WEEKDAY_ORDER
        ],
        "time_period_distribution": [
            {"period": period, "count": count}
            for period, count in sorted(period_counts.items(), key=lambda item: item[1], reverse=True)
        ],
        "monthly_seasonality": [
            {"month": calendar.month_name[mo], "count": count}
            for mo, count in sorted(month_only_counts.items())
        ],
        "annual_trend": [
            {"year": yr, "count": count}
            for yr, count in sorted(year_only_counts.items())
        ],
        "weekend_vs_weekday": [
            {"label": "Weekday", "count": weekend_counts["Weekday"]},
            {"label": "Weekend", "count": weekend_counts["Weekend"]},
        ],
        "severity_by_weekend_weekday": [
            {"label": "Weekday", **severity_by_weekend_weekday["Weekday"]},
            {"label": "Weekend", **severity_by_weekend_weekday["Weekend"]},
        ],
        "severity_by_hour": [
            {"hour": h, "hour_label": format_hour_label(h), **severity_by_hour[h]}
            for h in range(HOURS_IN_DAY)
        ],
        "temporal_insights": insights,
        "time_severity_matrix": [{"name": k, **v} for k, v in time_severity_counts.items()],
        "monthly_fatality_rate": [
            {"month": k, "total": v["total"], "fatalities": v["fatalities"], "fatality_rate": round(v["fatalities"] / v["total"] * 100, 1) if v["total"] > 0 else 0}
            for k, v in sorted(monthly_stats.items())
        ],
    }

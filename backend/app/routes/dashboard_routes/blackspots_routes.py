# backend/app/routes/dashboard_routes/blackspots_routes.py

"""
Blackspot Detection & Export Endpoints (Greedy, DBSCAN, IRC, Pedestrian, Network Blackspots).
"""

import csv
import io
import json
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
from app.utils.accident_utils import apply_filters, validate_observation_period
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
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
        district, year, None, None, None, None, date_from, date_to, taluka=None, db=db, police_station=None
    )
    total_network_crashes = base_query.count()

    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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

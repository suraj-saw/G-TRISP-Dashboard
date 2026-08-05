# backend/app/routes/dashboard_routes/spatial_routes.py

"""
Spatial & Heatmap Endpoints (Heatmap, KDE, Weighted KDE, Snapped Accidents, Road Network).
"""

import json
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.models.snapped_accident import SnappedAccident
from app.models.gujarat_road import GujaratRoad
from app.models.gujarat_district import GujaratDistrict
from app.schemas.dashboard_schema import (
    HeatmapPoint,
    HeatmapResponse,
    SnappedAccidentResponse,
)
from app.utils.accident_utils import apply_filters
from app.utils.kde_utils import compute_kde_heatmap, compute_weighted_kde_heatmap
from app.utils.text_utils import safe_text
from app.core.constants import (
    KDE_RADIUS_METERS,
    KDE_PIXEL_METERS,
)
from app.routes.dashboard_routes.common import (
    SEVERITY_WEIGHTS_MAP,
    DEFAULT_WEIGHT,
)

router = APIRouter()


@router.get("/heatmap", response_model=HeatmapResponse)
def get_heatmap(
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
        if isinstance(severity, list):
            query = query.filter(Accident.severity.in_(severity))
        else:
            query = query.filter(Accident.severity == severity)

    accidents = query.all()

    return HeatmapResponse(
        total=len(accidents),
        data=[
            HeatmapPoint(
                accident_id=a.accident_id,
                latitude=a.latitude,
                longitude=a.longitude,
                severity=safe_text(a.severity),
                district=safe_text(a.district),
                police_station=safe_text(a.police_station),
                road_name=safe_text(a.road_name),
                road_classification=safe_text(a.road_classification),
                weather_condition=safe_text(a.weather_condition),
                light_condition=safe_text(a.light_condition),
                collision_type=safe_text(a.type_of_collision),
                accident_date_time=a.accident_date_time,
                pedestrian_killed=a.pedestrian_killed or 0,
                pedestrian_grievous_injury=a.pedestrian_grievous_injury or 0,
                pedestrian_minor_injury=a.pedestrian_minor_injury or 0,
            )
            for a in accidents
            if a.latitude is not None and a.longitude is not None
        ],
    )


@router.get("/kde-heatmap")
def get_kde_heatmap(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(KDE_RADIUS_METERS, ge=100, le=2000),
    pixel_m: float = Query(KDE_PIXEL_METERS, ge=10, le=200),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
    is_pedestrian: bool = Query(False),
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

    if is_pedestrian:
        query = query.filter(
            (
                func.coalesce(Accident.pedestrian_killed, 0) +
                func.coalesce(Accident.pedestrian_grievous_injury, 0) +
                func.coalesce(Accident.pedestrian_minor_injury, 0)
            ) > 0
        )

    accidents = query.all()
    lats = [a.latitude for a in accidents if a.latitude is not None and a.longitude is not None]
    lons = [a.longitude for a in accidents if a.latitude is not None and a.longitude is not None]

    result = compute_kde_heatmap(lats, lons, radius_m=radius_m, pixel_m=pixel_m)

    if result is None:
        return {
            "total_crashes": 0,
            "radius_m": radius_m,
            "pixel_m": pixel_m,
            "max_density": 0.0,
            "sample_stride": 1,
            "data": {"type": "FeatureCollection", "features": []},
        }

    return {
        "total_crashes": len(lats),
        "radius_m": radius_m,
        "pixel_m": pixel_m,
        "max_density": result["max_density"],
        "sample_stride": result["sample_stride"],
        "data": result["data"],
        "width": result["width"],
        "height": result["height"],
    }


@router.get("/weighted-kde-heatmap")
def get_weighted_kde_heatmap(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(KDE_RADIUS_METERS, ge=100, le=2000),
    pixel_m: float = Query(KDE_PIXEL_METERS, ge=10, le=200),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
    is_pedestrian: bool = Query(False),
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

    if is_pedestrian:
        query = query.filter(
            (
                func.coalesce(Accident.pedestrian_killed, 0) +
                func.coalesce(Accident.pedestrian_grievous_injury, 0) +
                func.coalesce(Accident.pedestrian_minor_injury, 0)
            ) > 0
        )

    points = [
        accident for accident in query.all()
        if accident.latitude is not None and accident.longitude is not None
    ]
    lats = [accident.latitude for accident in points]
    lons = [accident.longitude for accident in points]
    weights = []
    for accident in points:
        severity_str = (accident.severity or "").lower()
        weight = DEFAULT_WEIGHT
        for keyword, severity_weight in SEVERITY_WEIGHTS_MAP.items():
            if keyword in severity_str:
                weight = severity_weight
                break
        weights.append(weight)

    result = compute_weighted_kde_heatmap(
        lats, lons, weights, radius_m=radius_m, pixel_m=pixel_m
    )

    if result is None:
        return {
            "total_crashes": 0,
            "radius_m": radius_m,
            "pixel_m": pixel_m,
            "max_density": 0.0,
            "sample_stride": 1,
            "data": {"type": "FeatureCollection", "features": []},
        }

    return {
        "total_crashes": len(lats),
        "radius_m": radius_m,
        "pixel_m": pixel_m,
        "max_density": result["max_density"],
        "sample_stride": result["sample_stride"],
        "data": result["data"],
        "width": result["width"],
        "height": result["height"],
    }


@router.get("/snapped-accidents", response_model=SnappedAccidentResponse, summary="Get pre-snapped accident locations")
def get_snapped_accidents(
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
):
    """
    Returns accident locations that have been snapped to the nearest road network segment.
    Maintains both original and snapped coordinates for visualization.
    """
    query = db.query(
        Accident.accident_id,
        Accident.severity,
        Accident.district,
        Accident.police_station,
        Accident.road_name,
        Accident.road_classification,
        Accident.weather_condition,
        Accident.light_condition,
        Accident.type_of_collision.label("collision_type"),
        Accident.accident_date_time,
        Accident.pedestrian_killed,
        Accident.pedestrian_grievous_injury,
        Accident.pedestrian_minor_injury,
        func.ST_Y(SnappedAccident.snapped_location).label("snapped_lat"),
        func.ST_X(SnappedAccident.snapped_location).label("snapped_lon"),
        func.ST_Y(SnappedAccident.original_location).label("orig_lat"),
        func.ST_X(SnappedAccident.original_location).label("orig_lon"),
        SnappedAccident.distance_meters
    ).join(
        SnappedAccident, Accident.id == SnappedAccident.accident_id
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

    points = [
        {
            "accident_id": r.accident_id,
            "severity": r.severity or "Unknown",
            "district": r.district or "Unknown",
            "police_station": r.police_station,
            "road_name": r.road_name,
            "road_classification": r.road_classification,
            "weather_condition": r.weather_condition,
            "light_condition": r.light_condition,
            "collision_type": r.collision_type,
            "accident_date_time": r.accident_date_time,
            "pedestrian_killed": r.pedestrian_killed,
            "pedestrian_grievous_injury": r.pedestrian_grievous_injury,
            "pedestrian_minor_injury": r.pedestrian_minor_injury,
            "latitude": r.snapped_lat,
            "longitude": r.snapped_lon,
            "original_latitude": r.orig_lat,
            "original_longitude": r.orig_lon,
            "distance_meters": r.distance_meters,
        }
        for r in rows
    ]

    return {"total": len(points), "data": points}


@router.get("/road-network")
def get_road_network(
    district: List[str] = Query(None, description="Districts to fetch road network for"),
    db: Session = Depends(get_db)
):
    """
    Returns the road network linestrings for the specified district(s) as a GeoJSON FeatureCollection.
    """
    if not district:
        return {"type": "FeatureCollection", "features": []}
    
    query = db.query(
        GujaratRoad.id,
        GujaratRoad.road_name,
        GujaratRoad.road_classification,
        GujaratRoad.road_type,
        GujaratRoad.properties,
        func.ST_AsGeoJSON(func.ST_Simplify(GujaratRoad.geometry, 0.0005)).label("geom_json")
    ).join(
        GujaratDistrict,
        func.ST_Intersects(GujaratRoad.geometry, GujaratDistrict.geometry)
    ).filter(
        GujaratDistrict.shape_name.in_(district)
    )
    
    rows = query.distinct().all()
    
    features = []
    for r in rows:
        if r.geom_json:
            props = r.properties or {}
            
            r_name = r.road_name or props.get("road_name") or props.get("ROAD_NAME") or props.get("name") or props.get("Name") or props.get("ROUTE_NAME") or props.get("RoadName")
            r_class = r.road_classification or props.get("road_classification") or props.get("ROAD_CLASSIFICATION") or props.get("classification") or props.get("Classification") or props.get("highway") or props.get("HIGHWAY") or props.get("fclass") or props.get("type") or props.get("TYPE")
            
            features.append({
                "type": "Feature",
                "geometry": json.loads(r.geom_json),
                "properties": {
                    "id": r.id,
                    "road_name": safe_text(r_name),
                    "road_classification": safe_text(r_class),
                    "road_type": safe_text(r.road_type)
                }
            })
            
    return {
        "type": "FeatureCollection",
        "features": features
    }

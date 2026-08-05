# backend/app/routes/dashboard_routes/corridors_routes.py

"""
Risk Corridors Endpoints.
"""

import json
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from sqlalchemy import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.models.snapped_accident import SnappedAccident
from app.models.gujarat_road import GujaratRoad
from app.utils.accident_utils import apply_filters, validate_observation_period
from app.utils.network_blackspot_utils import network_sliding_window
from app.utils.corridor_utils import generate_risk_corridors, rank_corridors
from app.utils.text_utils import safe_text

router = APIRouter()


@router.get("/risk-corridors", summary="Get risk corridors")
def get_risk_corridors(
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
    merge_threshold_m: float = Query(100.0, description="Merge threshold in meters")
):
    """
    Computes continuous risk corridors based on blackspot segments.
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

    corridors = generate_risk_corridors(candidate_segments, merge_distance_threshold_m=merge_threshold_m)

    road_ids = list({c["road_id"] for c in corridors})
    road_meta_query = db.query(
        GujaratRoad.id,
        GujaratRoad.road_name,
        GujaratRoad.road_classification,
        GujaratRoad.properties,
        func.ST_Length(func.ST_Transform(GujaratRoad.geometry, 3857)).label("road_length_m")
    ).filter(GujaratRoad.id.in_(road_ids)).all()

    road_lengths_map = {}
    road_names_map = {}
    road_class_map = {}

    for rm in road_meta_query:
        road_lengths_map[rm.id] = rm.road_length_m or 0.0
        props = rm.properties or {}
        r_name = rm.road_name or props.get("road_name") or props.get("ROAD_NAME") or props.get("name") or props.get("Name")
        r_class = rm.road_classification or props.get("road_classification") or props.get("ROAD_CLASSIFICATION") or props.get("highway")
        road_names_map[rm.id] = safe_text(r_name)
        road_class_map[rm.id] = safe_text(r_class)

    corridors = rank_corridors(corridors, road_lengths_map)
    
    features = []
    for c in corridors:
        geom_query = db.query(
            func.ST_AsGeoJSON(
                func.ST_LineSubstring(
                    GujaratRoad.geometry,
                    c["start_fraction"],
                    c["end_fraction"]
                )
            ).label("geom_json"),
            func.ST_Y(func.ST_StartPoint(func.ST_LineSubstring(GujaratRoad.geometry, c["start_fraction"], c["end_fraction"]))).label("start_lat"),
            func.ST_X(func.ST_StartPoint(func.ST_LineSubstring(GujaratRoad.geometry, c["start_fraction"], c["end_fraction"]))).label("start_lon"),
            func.ST_Y(func.ST_EndPoint(func.ST_LineSubstring(GujaratRoad.geometry, c["start_fraction"], c["end_fraction"]))).label("end_lat"),
            func.ST_X(func.ST_EndPoint(func.ST_LineSubstring(GujaratRoad.geometry, c["start_fraction"], c["end_fraction"]))).label("end_lon")
        ).filter(GujaratRoad.id == c["road_id"]).first()
        
        if geom_query and geom_query.geom_json:
            features.append({
                "type": "Feature",
                "geometry": json.loads(geom_query.geom_json),
                "properties": {
                    "corridor_id": c["corridor_id"],
                    "road_id": c["road_id"],
                    "road_name": road_names_map.get(c["road_id"], "Unknown"),
                    "road_classification": road_class_map.get(c["road_id"], "Unknown"),
                    "road_length": c["road_length"],
                    "corridor_length": round(c["corridor_length_m"], 2),
                    "start_m": round(c["start_m"], 2),
                    "end_m": round(c["end_m"], 2),
                    "accident_count": c["accident_count"],
                    "fatal_count": c["fatal_count"],
                    "grievous_count": c["grievous_count"],
                    "minor_hospitalized_count": c["minor_hospitalized_count"],
                    "minor_non_hospitalized_count": c["minor_non_hospitalized_count"],
                    "qualifying_count": c["qualifying_count"],
                    "weighted_score": c["weighted_score"],
                    "accident_density": round(c["accident_density"], 2),
                    "priority_score": c["priority_score"],
                    "priority_level": c["priority_level"],
                    "corridor_rank": c["corridor_rank"],
                    "start_coordinate": [geom_query.start_lon, geom_query.start_lat],
                    "end_coordinate": [geom_query.end_lon, geom_query.end_lat],
                }
            })
            
    return {
        "type": "FeatureCollection",
        "features": features
    }

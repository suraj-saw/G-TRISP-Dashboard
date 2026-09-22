# backend/app/routes/dashboard_routes/segment_blackspots_routes.py

"""
Segment Blackspots Endpoints using NH-48 and NE-1 Centerline Road Datasets.
"""

from typing import List, Optional
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.utils.accident_utils import validate_observation_period
from app.services.segment_blackspot_service import compute_segment_blackspots

router = APIRouter()


@router.get("/segment-blackspots", summary="Get segment blackspots")
@router.get("/risk-corridors", summary="Get segment blackspots (legacy route alias)")
def get_segment_blackspots(
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
    visibility: Optional[List[str]] = Query(None),
    is_pedestrian: bool = Query(False),
    window_size_m: float = Query(500.0, description="Sliding window size in meters"),
    min_qualifying_crashes: int = Query(3, description="Minimum qualifying crashes"),
    merge_threshold_m: float = Query(100.0, description="Merge threshold in meters")
):
    """
    Computes continuous road segment blackspots based on NH-48 and NE-1 centerline road datasets.
    """
    validation_error = validate_observation_period(None, selected_years=year)
    if validation_error and year:
        return JSONResponse(status_code=400, content={"detail": validation_error})

    result = compute_segment_blackspots(
        db=db,
        district=district,
        year=year,
        road_classification=road_classification,
        weather_condition=weather_condition,
        light_condition=light_condition,
        collision_type=collision_type,
        date_from=date_from,
        date_to=date_to,
        taluka=taluka,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station,
        visibility=visibility,
        severity=severity,
        is_pedestrian=is_pedestrian,
        window_size_m=window_size_m,
        merge_threshold_m=merge_threshold_m,
        min_qualifying_crashes=min_qualifying_crashes,
        buffer_distance_m=100.0
    )
    return result

# Backward compatibility function alias
get_risk_corridors = get_segment_blackspots

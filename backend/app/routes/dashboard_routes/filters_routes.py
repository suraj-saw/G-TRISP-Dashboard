# backend/app/routes/dashboard_routes/filters_routes.py

"""
Filter Options & Dashboard Summary endpoints.
"""

from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy import func, distinct, case
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.schemas.dashboard_schema import FilterOptions, SummaryResponse
from app.utils.accident_utils import apply_filters
from app.core.constants import (
    SEVERITY_DAMAGE_ONLY,
    UNKNOWN_LABEL,
)

router = APIRouter()


@router.get("/filter-options", response_model=FilterOptions)
def get_filter_options(
    district: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    def distinct(col):
        q = db.query(col).filter(col.isnot(None), col != "", col != "nan")
        if district:
            q = q.filter(Accident.district.in_(district))
        return [r[0] for r in q.distinct().order_by(col).all()]

    date_q = db.query(
        func.min(Accident.accident_date_time),
        func.max(Accident.accident_date_time)
    )
    if district:
        date_q = date_q.filter(Accident.district.in_(district))
    min_dt, max_dt = date_q.first()
    
    # Get distinct years
    year_q = db.query(func.extract("year", Accident.accident_date_time)).filter(
        Accident.accident_date_time.isnot(None)
    )
    if district:
        year_q = year_q.filter(Accident.district.in_(district))
    years = sorted([int(r[0]) for r in year_q.distinct().all()])

    return FilterOptions(
        road_classifications=distinct(Accident.road_classification),
        weather_conditions=distinct(Accident.weather_condition),
        light_conditions=distinct(Accident.light_condition),
        collision_types=distinct(Accident.type_of_collision),
        police_stations=distinct(Accident.police_station),
        severities=distinct(Accident.severity),
        years=years,
        min_date=min_dt.date().isoformat() if min_dt else None,
        max_date=max_dt.date().isoformat() if max_dt else None,
    )


@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    district: Optional[List[str]] = Query(None),
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
    severity: Optional[List[str]] = Query(None),
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

    res = query.with_entities(
        func.count(Accident.id).label("total_accidents"),
        func.sum(
            func.coalesce(Accident.driver_killed, 0) +
            func.coalesce(Accident.passenger_killed, 0) +
            func.coalesce(Accident.pedestrian_killed, 0)
        ).label("total_fatalities"),
        func.sum(
            func.coalesce(Accident.driver_grievous_injury, 0) +
            func.coalesce(Accident.passenger_grievous_injury, 0) +
            func.coalesce(Accident.pedestrian_grievous_injury, 0)
        ).label("total_grievous"),
        func.sum(
            func.coalesce(Accident.driver_minor_injury, 0) +
            func.coalesce(Accident.passenger_minor_injury, 0) +
            func.coalesce(Accident.pedestrian_minor_injury, 0)
        ).label("total_minor"),
        func.sum(
            case((Accident.severity == SEVERITY_DAMAGE_ONLY, 1), else_=0)
        ).label("total_damage_only"),
        func.sum(func.coalesce(Accident.number_of_vehicles, 0)).label("total_vehicles"),
        func.count(distinct(case((Accident.district != UNKNOWN_LABEL, Accident.district), else_=None))).label("districts_covered"),
        func.count(distinct(case((Accident.police_station != UNKNOWN_LABEL, Accident.police_station), else_=None))).label("police_stations"),
    ).first()

    return SummaryResponse(
        total_accidents=res.total_accidents or 0,
        total_fatalities=res.total_fatalities or 0,
        total_grievous=res.total_grievous or 0,
        total_minor=res.total_minor or 0,
        total_damage_only=res.total_damage_only or 0,
        total_vehicles=res.total_vehicles or 0,
        districts_covered=res.districts_covered or 0,
        police_stations=res.police_stations or 0,
    )

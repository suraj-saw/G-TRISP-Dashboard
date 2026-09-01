# backend/app/routes/dashboard_routes/breakdowns_routes.py

"""
Categorical & Breakdown Endpoints (Weather, Light, Road, Violation, Police Station, Casualty).
"""

from collections import defaultdict
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.schemas.dashboard_schema import (
    CasualtyBreakdown,
    CasualtyResponse,
    LightCount,
    LightResponse,
    PoliceStationCount,
    PoliceStationResponse,
    RoadClassCount,
    RoadClassResponse,
    ViolationCount,
    ViolationResponse,
    WeatherCount,
    WeatherResponse,
)
from app.utils.accident_utils import apply_filters, total_fatalities
from app.utils.text_utils import safe_text
from app.core.constants import CASUALTY_TYPES

router = APIRouter()


@router.get("/by-violation", response_model=ViolationResponse)
def get_by_violation(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(
            Accident.traffic_violation,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    rows = (
        query
        .filter(
            Accident.traffic_violation.isnot(None),
            Accident.traffic_violation != "",
            Accident.traffic_violation != "nan",
        )
        .group_by(Accident.traffic_violation)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return ViolationResponse(
        data=[
            ViolationCount(traffic_violation=r.traffic_violation, count=r.count)
            for r in rows
        ]
    )


@router.get("/by-road", response_model=RoadClassResponse)
def get_by_road(
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )

    fatality_expr = func.sum(
        func.coalesce(Accident.driver_killed, 0) +
        func.coalesce(Accident.passenger_killed, 0) +
        func.coalesce(Accident.pedestrian_killed, 0)
    )
    rows = (
        query.with_entities(
            Accident.road_classification,
            func.count(Accident.id).label("accident_count"),
            fatality_expr.label("fatalities"),
        )
        .group_by(Accident.road_classification)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return RoadClassResponse(
        data=[
            RoadClassCount(
                road_classification=safe_text(r.road_classification),
                accident_count=r.accident_count or 0,
                fatalities=r.fatalities or 0,
            )
            for r in rows
        ]
    )


@router.get("/by-weather", response_model=WeatherResponse)
def get_by_weather(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(
            Accident.weather_condition,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    rows = (
        query
        .group_by(Accident.weather_condition)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return WeatherResponse(
        data=[
            WeatherCount(
                weather_condition=safe_text(r.weather_condition),
                count=r.count,
            )
            for r in rows
        ]
    )


@router.get("/by-light", response_model=LightResponse)
def get_by_light(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(
            Accident.light_condition,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )
    rows = (
        query
        .group_by(Accident.light_condition)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return LightResponse(
        data=[
            LightCount(
                light_condition=safe_text(r.light_condition),
                count=r.count,
            )
            for r in rows
        ]
    )


@router.get("/by-police-station", response_model=PoliceStationResponse)
def get_by_police_station(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        number_of_vehicles=number_of_vehicles,
    )

    fatality_expr = func.sum(
        func.coalesce(Accident.driver_killed, 0) +
        func.coalesce(Accident.passenger_killed, 0) +
        func.coalesce(Accident.pedestrian_killed, 0)
    )
    rows = (
        query.with_entities(
            Accident.police_station,
            Accident.district,
            func.count(Accident.id).label("accident_count"),
            fatality_expr.label("fatalities"),
        )
        .group_by(Accident.police_station, Accident.district)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return PoliceStationResponse(
        data=[
            PoliceStationCount(
                police_station=safe_text(r.police_station),
                district=safe_text(r.district),
                accident_count=r.accident_count or 0,
                fatalities=r.fatalities or 0,
            )
            for r in rows
        ]
    )


@router.get("/casualty-breakdown", response_model=CasualtyResponse)
def get_casualty_breakdown(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    number_of_vehicles: Optional[List[str]] = Query(None),
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
        number_of_vehicles=number_of_vehicles,
        police_station=police_station
    )

    row = query.with_entities(
        func.sum(func.coalesce(Accident.driver_killed, 0)).label("dk"),
        func.sum(func.coalesce(Accident.driver_grievous_injury, 0)).label("dg"),
        func.sum(func.coalesce(Accident.driver_minor_injury, 0)).label("dm"),
        func.sum(func.coalesce(Accident.passenger_killed, 0)).label("pk"),
        func.sum(func.coalesce(Accident.passenger_grievous_injury, 0)).label("pg"),
        func.sum(func.coalesce(Accident.passenger_minor_injury, 0)).label("pm"),
        func.sum(func.coalesce(Accident.pedestrian_killed, 0)).label("pdk"),
        func.sum(func.coalesce(Accident.pedestrian_grievous_injury, 0)).label("pdg"),
        func.sum(func.coalesce(Accident.pedestrian_minor_injury, 0)).label("pdm"),
    ).first()

    return CasualtyResponse(
        data=[
            CasualtyBreakdown(
                category="Drivers",
                killed=int(row.dk or 0) if row else 0,
                grievous=int(row.dg or 0) if row else 0,
                minor=int(row.dm or 0) if row else 0,
            ),
            CasualtyBreakdown(
                category="Passengers",
                killed=int(row.pk or 0) if row else 0,
                grievous=int(row.pg or 0) if row else 0,
                minor=int(row.pm or 0) if row else 0,
            ),
            CasualtyBreakdown(
                category="Pedestrians",
                killed=int(row.pdk or 0) if row else 0,
                grievous=int(row.pdg or 0) if row else 0,
                minor=int(row.pdm or 0) if row else 0,
            ),
        ]
    )

# backend/app/routes/dashboard.py
"""
Dashboard API router.

All field references use the iRAD-aligned names from the main project:
  accident_date_time        (was: accident_datetime)
  number_of_vehicles        (was: no_of_vehicles)
  driver_killed/grievous/minor
  passenger_killed/grievous/minor
  pedestrian_killed/grievous/minor
  type_of_collision         (was: collision_type)
"""

import calendar
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.accident import Accident

from app.schemas.dashboard_schema import (
    CasualtyBreakdown,
    CasualtyResponse,
    CollisionCount,
    CollisionResponse,
    DangerousDistrict,
    DistrictCount,
    DistrictResponse,
    FilterOptions,
    HeatmapPoint,
    HeatmapResponse,
    LightCount,
    LightResponse,
    PoliceStationCount,
    PoliceStationResponse,
    RoadClassCount,
    RoadClassResponse,
    SeverityCount,
    SeverityResponse,
    SummaryResponse,
    TimeSeriesPoint,
    TimeSeriesResponse,
    TopDangerousResponse,
    ViolationCount,
    ViolationResponse,
    WeatherCount,
    WeatherResponse,
    YearlyResponse,
    YearlyStats,
)

from app.utils.accident_utils import (
    apply_filters,
    total_fatalities,
    total_grievous,
    total_minor,
)

from app.core.constants import (
    SEVERITY_FATAL,
    SEVERITY_DAMAGE_ONLY,
    CASUALTY_TYPES,
)

router = APIRouter(
    prefix="/api/dashboard",
    tags=["Dashboard"],
)


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def safe_text(value, default: str = "Unknown") -> str:
    """
    Converts NULL, empty strings, and legacy 'nan' strings to a safe default.
    """
    if value is None:
        return default
    if isinstance(value, str):
        v = value.strip()
        if v == "" or v.lower() == "nan":
            return default
        return v
    return str(value)


# ---------------------------------------------------------------------------
# Filter Options  (dynamic — never hard-coded)
# ---------------------------------------------------------------------------

@router.get("/filter-options", response_model=FilterOptions)
def get_filter_options(db: Session = Depends(get_db)):
    """Return all unique, non-null values for each filterable dimension."""

    def distinct(col):
        rows = (
            db.query(col)
            .filter(col.isnot(None), col != "", col != "nan")
            .distinct()
            .order_by(col)
            .all()
        )
        return [r[0] for r in rows]

    return FilterOptions(
        road_classifications=distinct(Accident.road_classification),
        weather_conditions=distinct(Accident.weather_condition),
        light_conditions=distinct(Accident.light_condition),
        # iRAD field: type_of_collision — exposed to frontend as collision_type
        collision_types=distinct(Accident.type_of_collision),
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    accidents = query.all()

    return SummaryResponse(
        total_accidents=len(accidents),
        total_fatalities=sum(total_fatalities(a) for a in accidents),
        total_grievous=sum(total_grievous(a) for a in accidents),
        total_minor=sum(total_minor(a) for a in accidents),
        total_damage_only=sum(
            1 for a in accidents if a.severity == SEVERITY_DAMAGE_ONLY
        ),
        total_vehicles=sum(a.number_of_vehicles or 0 for a in accidents),
        districts_covered=len({
            safe_text(a.district)
            for a in accidents
            if safe_text(a.district) != "Unknown"
        }),
        police_stations=len({
            safe_text(a.police_station)
            for a in accidents
            if safe_text(a.police_station) != "Unknown"
        }),
    )


# ---------------------------------------------------------------------------
# By District   (no district filter — used for district-level charts/maps)
# ---------------------------------------------------------------------------

@router.get("/by-district", response_model=DistrictResponse)
def get_by_district(
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    district_map: dict = defaultdict(lambda: {"accident_count": 0, "fatalities": 0})
    for a in query.all():
        key = safe_text(a.district)
        district_map[key]["accident_count"] += 1
        district_map[key]["fatalities"] += total_fatalities(a)

    return DistrictResponse(
        data=[
            DistrictCount(
                district=safe_text(name),
                accident_count=v["accident_count"],
                fatalities=v["fatalities"],
            )
            for name, v in sorted(
                district_map.items(),
                key=lambda x: x[1]["accident_count"],
                reverse=True,
            )
        ]
    )


# ---------------------------------------------------------------------------
# By Severity
# ---------------------------------------------------------------------------

@router.get("/by-severity", response_model=SeverityResponse)
def get_by_severity(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident.severity, func.count(Accident.id).label("count")),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    rows = query.group_by(Accident.severity).all()

    return SeverityResponse(
        data=[
            SeverityCount(severity=safe_text(r.severity), count=r.count)
            for r in rows
        ]
    )


# ---------------------------------------------------------------------------
# Time Series  (no year filter — always show full timeline)
# ---------------------------------------------------------------------------

@router.get("/time-series", response_model=TimeSeriesResponse)
def get_time_series(
    district: Optional[str] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    granularity: str = Query("month", enum=["month", "year"]),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, None, road_classification,
        weather_condition, light_condition, collision_type,
    )

    buckets: dict = defaultdict(lambda: {"count": 0, "fatalities": 0})
    for a in query.all():
        dt = a.accident_date_time
        if not dt:
            continue
        key = (dt.year, dt.month if granularity == "month" else 1)
        buckets[key]["count"] += 1
        buckets[key]["fatalities"] += total_fatalities(a)

    return TimeSeriesResponse(
        data=[
            TimeSeriesPoint(
                year=y,
                month=m,
                month_label=(
                    f"{calendar.month_abbr[m]} {y}"
                    if granularity == "month"
                    else str(y)
                ),
                accident_count=v["count"],
                fatalities=v["fatalities"],
            )
            for (y, m), v in sorted(buckets.items())
        ]
    )


# ---------------------------------------------------------------------------
# By Collision Type
# ---------------------------------------------------------------------------

@router.get("/by-collision", response_model=CollisionResponse)
def get_by_collision(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    # Query on iRAD field type_of_collision
    query = apply_filters(
        db.query(
            Accident.type_of_collision,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    rows = (
        query
        .group_by(Accident.type_of_collision)
        .order_by(func.count(Accident.id).desc())
        .all()
    )

    return CollisionResponse(
        data=[
            CollisionCount(
                collision_type=safe_text(r.type_of_collision),
                count=r.count,
            )
            for r in rows
        ]
    )


# ---------------------------------------------------------------------------
# Heatmap  (supports severity filter on top of standard filters)
# ---------------------------------------------------------------------------

@router.get("/heatmap", response_model=HeatmapResponse)
def get_heatmap(
    district: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    if severity and severity != "all":
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
            )
            for a in accidents
            if a.latitude is not None and a.longitude is not None
        ],
    )


# ---------------------------------------------------------------------------
# Traffic Violations
# ---------------------------------------------------------------------------

@router.get("/by-violation", response_model=ViolationResponse)
def get_by_violation(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(
            Accident.traffic_violation,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
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


# ---------------------------------------------------------------------------
# Road Classification  (no district filter)
# ---------------------------------------------------------------------------

@router.get("/by-road", response_model=RoadClassResponse)
def get_by_road(
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    road_map: dict = defaultdict(lambda: {"accident_count": 0, "fatalities": 0})
    for a in query.all():
        key = safe_text(a.road_classification)
        road_map[key]["accident_count"] += 1
        road_map[key]["fatalities"] += total_fatalities(a)

    return RoadClassResponse(
        data=[
            RoadClassCount(
                road_classification=safe_text(name),
                accident_count=v["accident_count"],
                fatalities=v["fatalities"],
            )
            for name, v in sorted(
                road_map.items(),
                key=lambda x: x[1]["accident_count"],
                reverse=True,
            )
        ]
    )


# ---------------------------------------------------------------------------
# Weather Condition
# ---------------------------------------------------------------------------

@router.get("/by-weather", response_model=WeatherResponse)
def get_by_weather(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(
            Accident.weather_condition,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
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


# ---------------------------------------------------------------------------
# Light Condition
# ---------------------------------------------------------------------------

@router.get("/by-light", response_model=LightResponse)
def get_by_light(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(
            Accident.light_condition,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
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


# ---------------------------------------------------------------------------
# Police Station
# ---------------------------------------------------------------------------

@router.get("/by-police-station", response_model=PoliceStationResponse)
def get_by_police_station(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    stations: dict = defaultdict(
        lambda: {"district": "", "accident_count": 0, "fatalities": 0}
    )
    for a in query.all():
        key = safe_text(a.police_station)
        stations[key]["district"] = safe_text(a.district)
        stations[key]["accident_count"] += 1
        stations[key]["fatalities"] += total_fatalities(a)

    return PoliceStationResponse(
        data=[
            PoliceStationCount(
                police_station=safe_text(name),
                district=safe_text(v["district"]),
                accident_count=v["accident_count"],
                fatalities=v["fatalities"],
            )
            for name, v in stations.items()
        ]
    )


# ---------------------------------------------------------------------------
# Casualty Breakdown
# ---------------------------------------------------------------------------

@router.get("/casualty-breakdown", response_model=CasualtyResponse)
def get_casualty_breakdown(
    district: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    accidents = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    ).all()

    totals = {
        name: {"killed": 0, "grievous": 0, "minor": 0}
        for name in CASUALTY_TYPES
    }

    for a in accidents:
        for category, fields in CASUALTY_TYPES.items():
            for key, col_name in fields.items():
                totals[category][key] += getattr(a, col_name) or 0

    return CasualtyResponse(
        data=[
            CasualtyBreakdown(category=name, **vals)
            for name, vals in totals.items()
        ]
    )


# ---------------------------------------------------------------------------
# Top Dangerous Districts  (no district filter)
# ---------------------------------------------------------------------------

@router.get("/top-dangerous", response_model=TopDangerousResponse)
def get_top_dangerous(
    top_n: int = Query(10, ge=1, le=50),
    year: Optional[int] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident).filter(Accident.severity == SEVERITY_FATAL),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    ranking: dict = defaultdict(lambda: {"fatal_accidents": 0, "total_killed": 0})
    for a in query.all():
        key = safe_text(a.district)
        ranking[key]["fatal_accidents"] += 1
        ranking[key]["total_killed"] += total_fatalities(a)

    rows = sorted(
        ranking.items(),
        key=lambda x: x[1]["fatal_accidents"],
        reverse=True,
    )[:top_n]

    return TopDangerousResponse(
        data=[
            DangerousDistrict(
                rank=idx + 1,
                district=safe_text(name),
                fatal_accidents=v["fatal_accidents"],
                total_killed=v["total_killed"],
            )
            for idx, (name, v) in enumerate(rows)
        ]
    )


# ---------------------------------------------------------------------------
# Yearly Comparison  (no year filter)
# ---------------------------------------------------------------------------

@router.get("/yearly-comparison", response_model=YearlyResponse)
def get_yearly_comparison(
    district: Optional[str] = Query(None),
    road_classification: Optional[str] = Query(None),
    weather_condition: Optional[str] = Query(None),
    light_condition: Optional[str] = Query(None),
    collision_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, None, road_classification,
        weather_condition, light_condition, collision_type,
    )

    years: dict = defaultdict(
        lambda: {"total_accidents": 0, "fatalities": 0, "grievous": 0}
    )
    for a in query.all():
        if not a.accident_date_time:
            continue
        yr = a.accident_date_time.year
        years[yr]["total_accidents"] += 1
        years[yr]["fatalities"] += total_fatalities(a)
        years[yr]["grievous"] += total_grievous(a)

    return YearlyResponse(
        data=[
            YearlyStats(
                year=yr,
                total_accidents=v["total_accidents"],
                fatalities=v["fatalities"],
                grievous=v["grievous"],
            )
            for yr, v in sorted(years.items())
        ]
    )
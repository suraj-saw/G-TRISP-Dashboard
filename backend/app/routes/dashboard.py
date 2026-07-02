# backend/app/routes/dashboard.py
"""
Dashboard API router — Gujarat-wide endpoints.

All field references use the iRAD-aligned names from the main project.
"""

import base64
import calendar
from collections import defaultdict
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, distinct, case
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

# Reused from the Surat schema module — the shape (hour/day/month/peak
# summary) is model-agnostic, so there's no need to duplicate it.
from app.schemas.surat_dashboard_schema import (
    HourDayCount,
    HourlyAccidentCount,
    MonthlyAccidentCount,
    PeakSummary,
    TemporalAnalysisResponse,
)

from app.utils.accident_utils import (
    apply_filters,
    total_fatalities,
    total_grievous,
    total_minor,
)
from app.utils.text_utils import safe_text
from app.utils.blackspot_utils import (
    CrashPoint,
    greedy_blackspots,
    dbscan_blackspots,
    blackspots_to_geojson,
)
from app.utils.kde_utils import compute_kde_heatmap

from app.core.constants import (
    SEVERITY_FATAL,
    SEVERITY_DAMAGE_ONLY,
    CASUALTY_TYPES,
    UNKNOWN_LABEL,
    DASHBOARD_PREFIX,
    TOP_DANGEROUS_DEFAULT_N,
    TOP_DANGEROUS_MAX_N,
    BLACKSPOT_RADIUS_METERS,
    BLACKSPOT_MIN_CRASHES,
    KDE_RADIUS_METERS,
    KDE_PIXEL_METERS,
    WEEKDAY_ORDER,
    TIME_PERIOD_RANGES,
    NIGHT_MORNING_CUTOFF,
    HOURS_IN_DAY,
)

router = APIRouter(
    prefix=DASHBOARD_PREFIX,
    tags=["Dashboard"],
)


# ---------------------------------------------------------------------------
# Temporal helpers (kept local/duplicated from surat_dashboard.py on purpose
# — small, model-agnostic, and keeps the two routers independently editable)
# ---------------------------------------------------------------------------

def _time_period_for_hour(hour: int) -> str:
    for period, (start, end) in TIME_PERIOD_RANGES.items():
        if period == "Night":
            if hour >= start or hour < NIGHT_MORNING_CUTOFF:
                return period
        elif start <= hour < end:
            return period
    return "Night"


def _format_hour_label(hour: int) -> str:
    suffix = "AM" if hour < 12 else "PM"
    value = hour % 12 or 12
    return f"{value}:00 {suffix}"


def _peak_item(counts: dict, fallback_key):
    if not counts:
        return fallback_key, 0
    return max(counts.items(), key=lambda item: item[1])


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
        collision_types=distinct(Accident.type_of_collision),
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query     = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
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


# ---------------------------------------------------------------------------
# By District
# ---------------------------------------------------------------------------

@router.get("/by-district", response_model=DistrictResponse)
def get_by_district(
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    rows = query.with_entities(
        Accident.district,
        func.count(Accident.id).label("accident_count"),
        func.sum(
            func.coalesce(Accident.driver_killed, 0) +
            func.coalesce(Accident.passenger_killed, 0) +
            func.coalesce(Accident.pedestrian_killed, 0)
        ).label("fatalities")
    ).group_by(Accident.district).all()

    district_map: dict = defaultdict(lambda: {"accident_count": 0, "fatalities": 0})
    for r in rows:
        key = safe_text(r.district)
        district_map[key]["accident_count"] += (r.accident_count or 0)
        district_map[key]["fatalities"]     += (r.fatalities or 0)

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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
# Time Series
# ---------------------------------------------------------------------------

@router.get("/time-series", response_model=TimeSeriesResponse)
def get_time_series(
    district: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
        buckets[key]["count"]      += 1
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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
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
# Heatmap
# ---------------------------------------------------------------------------

@router.get("/heatmap", response_model=HeatmapResponse)
def get_heatmap(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
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
            )
            for a in accidents
            if a.latitude is not None and a.longitude is not None
        ],
    )


# ---------------------------------------------------------------------------
# Temporal Analysis (generalized — mirrors surat_dashboard.py, but
# accident_date_time is already a real DateTime column here so parsing is
# simpler than the Surat string-based version)
# ---------------------------------------------------------------------------

@router.get("/temporal-analysis", response_model=TemporalAnalysisResponse)
def get_temporal_analysis(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    month: Optional[List[int]] = Query(None),
    day: Optional[List[str]] = Query(None),
    time_period: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Accident)

    if district:
        query = query.filter(Accident.district.in_(district))
    if severity:
        query = query.filter(Accident.severity.in_(severity))
    if weather_condition:
        query = query.filter(Accident.weather_condition.in_(weather_condition))
    if light_condition:
        query = query.filter(Accident.light_condition.in_(light_condition))

    accidents_with_dt = []
    for accident in query.all():
        dt = accident.accident_date_time
        if not dt:
            continue
        if year and dt.year not in [int(y) for y in year]:
            continue
        if month and dt.month not in [int(m) for m in month]:
            continue
        if day and dt.strftime("%A") not in day:
            continue
        if time_period and _time_period_for_hour(dt.hour) not in time_period:
            continue
        accidents_with_dt.append((accident, dt))

    hour_day_counts: dict = defaultdict(int)
    hourly_counts   = {h: 0 for h in range(HOURS_IN_DAY)}
    monthly_counts: dict  = defaultdict(int)
    day_counts: dict      = defaultdict(int)
    period_counts: dict   = defaultdict(int)

    for _accident, dt in accidents_with_dt:
        hour     = dt.hour
        day_name = dt.strftime("%A")
        period   = _time_period_for_hour(hour)

        hour_day_counts[(hour, day_name)] += 1
        hourly_counts[hour]               += 1
        monthly_counts[(dt.year, dt.month)] += 1
        day_counts[day_name]              += 1
        period_counts[period]             += 1

    peak_hour,      peak_hour_count   = _peak_item(hourly_counts, 0)
    peak_day,       peak_day_count    = _peak_item(day_counts, UNKNOWN_LABEL)
    peak_month_key, peak_month_count  = _peak_item(monthly_counts, (0, 0))
    peak_period,    peak_period_count = _peak_item(period_counts, UNKNOWN_LABEL)

    peak_month_label = (
        f"{calendar.month_abbr[peak_month_key[1]]} {peak_month_key[0]}"
        if peak_month_key != (0, 0)
        else UNKNOWN_LABEL
    )

    return TemporalAnalysisResponse(
        hour_day=[
            HourDayCount(hour=hour, day=day_name, count=hour_day_counts[(hour, day_name)])
            for day_name in WEEKDAY_ORDER
            for hour in range(HOURS_IN_DAY)
        ],
        hourly=[
            HourlyAccidentCount(hour=h, count=hourly_counts[h])
            for h in range(HOURS_IN_DAY)
        ],
        monthly=[
            MonthlyAccidentCount(
                year=yr, month=mo,
                month_label=f"{calendar.month_abbr[mo]} {yr}",
                count=count,
            )
            for (yr, mo), count in sorted(monthly_counts.items())
        ],
        summary=PeakSummary(
            peak_hour=_format_hour_label(int(peak_hour)),
            peak_hour_count=peak_hour_count,
            peak_day=peak_day,
            peak_day_count=peak_day_count,
            peak_month=peak_month_label,
            peak_month_count=peak_month_count,
            peak_time_period=peak_period,
            peak_time_period_count=peak_period_count,
            total_accidents=len(accidents_with_dt),
        ),
    )


# ---------------------------------------------------------------------------
# Blackspot detection (greedy) — generalized for any district
# ---------------------------------------------------------------------------

@router.get("/blackspots")
def get_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()

    points = [
        CrashPoint(index=idx, accident_id=a.accident_id, lat=a.latitude, lon=a.longitude)
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


# ---------------------------------------------------------------------------
# Blackspot detection (DBSCAN-style) — generalized for any district
# ---------------------------------------------------------------------------

@router.get("/dbscan-blackspots")
def get_dbscan_blackspots(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    radius_m: float = Query(BLACKSPOT_RADIUS_METERS, ge=50, le=2000),
    min_crashes: int = Query(BLACKSPOT_MIN_CRASHES, ge=2, le=100),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()

    points = [
        CrashPoint(index=idx, accident_id=a.accident_id, lat=a.latitude, lon=a.longitude)
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


# ---------------------------------------------------------------------------
# KDE density heatmap — generalized for any district
# ---------------------------------------------------------------------------

@router.get("/kde-heatmap")
def get_kde_heatmap(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    radius_m: float = Query(KDE_RADIUS_METERS, ge=100, le=2000),
    pixel_m: float = Query(KDE_PIXEL_METERS, ge=10, le=200),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()
    lats = [a.latitude for a in accidents if a.latitude is not None and a.longitude is not None]
    lons = [a.longitude for a in accidents if a.latitude is not None and a.longitude is not None]

    result = compute_kde_heatmap(lats, lons, radius_m=radius_m, pixel_m=pixel_m)

    if result is None:
        return {
            "total_crashes": 0,
            "radius_m": radius_m,
            "pixel_m": pixel_m,
            "image": None,
            "coordinates": None,
        }

    image_data_url = (
        "data:image/png;base64," + base64.b64encode(result["png_bytes"]).decode("ascii")
    )

    return {
        "total_crashes": len(lats),
        "radius_m": radius_m,
        "pixel_m": pixel_m,
        "image": image_data_url,
        "coordinates": result["coordinates"],
        "width": result["width"],
        "height": result["height"],
    }


# ---------------------------------------------------------------------------
# Traffic Violations
# ---------------------------------------------------------------------------

@router.get("/by-violation", response_model=ViolationResponse)
def get_by_violation(
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
# Road Classification
# ---------------------------------------------------------------------------

@router.get("/by-road", response_model=RoadClassResponse)
def get_by_road(
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
        road_map[key]["fatalities"]     += total_fatalities(a)

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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
        stations[key]["district"]       = safe_text(a.district)
        stations[key]["accident_count"] += 1
        stations[key]["fatalities"]     += total_fatalities(a)

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
    district: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
# Top Dangerous Districts
# ---------------------------------------------------------------------------

@router.get("/top-dangerous", response_model=TopDangerousResponse)
def get_top_dangerous(
    top_n: int = Query(TOP_DANGEROUS_DEFAULT_N, ge=1, le=TOP_DANGEROUS_MAX_N),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident).filter(Accident.severity == SEVERITY_FATAL),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
    )

    rows = query.with_entities(
        Accident.district,
        func.count(Accident.id).label("fatal_accidents"),
        func.sum(
            func.coalesce(Accident.driver_killed, 0) +
            func.coalesce(Accident.passenger_killed, 0) +
            func.coalesce(Accident.pedestrian_killed, 0)
        ).label("total_killed")
    ).group_by(Accident.district).order_by(func.count(Accident.id).desc()).limit(top_n).all()

    return TopDangerousResponse(
        data=[
            DangerousDistrict(
                rank=idx + 1,
                district=safe_text(r.district),
                fatal_accidents=r.fatal_accidents or 0,
                total_killed=r.total_killed or 0,
            )
            for idx, r in enumerate(rows)
        ]
    )


# ---------------------------------------------------------------------------
# Yearly Comparison
# ---------------------------------------------------------------------------

@router.get("/yearly-comparison", response_model=YearlyResponse)
def get_yearly_comparison(
    district: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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
        years[yr]["fatalities"]      += total_fatalities(a)
        years[yr]["grievous"]        += total_grievous(a)

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
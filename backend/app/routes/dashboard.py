# backend/app/routes/dashboard.py
"""
Dashboard API router — Gujarat-wide endpoints.

All field references use the iRAD-aligned names from the main project.
"""

import base64
import calendar
from collections import defaultdict
from datetime import datetime
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
from app.schemas.gujarat_insights_schema import DistrictInsightsResponse

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
    PEDESTRIAN_BLACKSPOT_MIN_CRASHES,
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


def _parse_iso_date(value: Optional[str]):
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Filter Options  (dynamic — never hard-coded)
# ---------------------------------------------------------------------------

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

    return FilterOptions(
        road_classifications=distinct(Accident.road_classification),
        weather_conditions=distinct(Accident.weather_condition),
        light_conditions=distinct(Accident.light_condition),
        collision_types=distinct(Accident.type_of_collision),
        police_stations=distinct(Accident.police_station),
        min_date=min_dt.date().isoformat() if min_dt else None,
        max_date=max_dt.date().isoformat() if max_dt else None,
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query     = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident.severity, func.count(Accident.id).label("count")),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    granularity: str = Query("month", enum=["month", "year"]),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, None, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(
            Accident.type_of_collision,
            func.count(Accident.id).label("count"),
        ),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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


# ---------------------------------------------------------------------------
# Temporal Analysis (generalized — mirrors surat_dashboard.py, but
# accident_date_time is already a real DateTime column here so parsing is
# simpler than the Surat string-based version)
# ---------------------------------------------------------------------------

@router.get("/temporal-analysis")
def get_temporal_analysis(
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    month: Optional[List[int]] = Query(None),
    day: Optional[List[str]] = Query(None),
    time_period: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = db.query(Accident)
    start_date = _parse_iso_date(date_from)
    end_date = _parse_iso_date(date_to)

    if district:
        query = query.filter(Accident.district.in_(district))
    if severity:
        query = query.filter(Accident.severity.in_(severity))
    if weather_condition:
        query = query.filter(Accident.weather_condition.in_(weather_condition))
    if light_condition:
        query = query.filter(Accident.light_condition.in_(light_condition))
    if police_station:
        query = query.filter(Accident.police_station.in_(police_station))

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
        if start_date and dt.date() < start_date:
            continue
        if end_date and dt.date() > end_date:
            continue
        accidents_with_dt.append((accident, dt))

    hour_day_counts: dict = defaultdict(int)
    hourly_counts   = {h: 0 for h in range(HOURS_IN_DAY)}
    monthly_counts: dict  = defaultdict(int)
    day_counts: dict      = defaultdict(int)
    period_counts: dict   = defaultdict(int)

    month_only_counts = defaultdict(int)
    year_only_counts = defaultdict(int)
    weekend_counts = {"Weekday": 0, "Weekend": 0}
    severity_by_hour = {h: {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0} for h in range(HOURS_IN_DAY)}

    for accident, dt in accidents_with_dt:
        hour     = dt.hour
        day_name = dt.strftime("%A")
        period   = _time_period_for_hour(hour)

        hour_day_counts[(hour, day_name)] += 1
        hourly_counts[hour]               += 1
        monthly_counts[(dt.year, dt.month)] += 1
        day_counts[day_name]              += 1
        period_counts[period]             += 1

        month_only_counts[dt.month] += 1
        year_only_counts[dt.year] += 1
        
        if day_name in ["Saturday", "Sunday"]:
            weekend_counts["Weekend"] += 1
        else:
            weekend_counts["Weekday"] += 1
            
        sev = safe_text(accident.severity)
        if sev in severity_by_hour[hour]:
            severity_by_hour[hour][sev] += 1
        elif sev == "Grievous":
            severity_by_hour[hour]["Grievous Injury"] += 1
        elif sev == "Minor":
            severity_by_hour[hour]["Minor Injury"] += 1

    peak_hour,      peak_hour_count   = _peak_item(hourly_counts, 0)
    peak_day,       peak_day_count    = _peak_item(day_counts, UNKNOWN_LABEL)
    peak_month_key, peak_month_count  = _peak_item(monthly_counts, (0, 0))
    peak_period,    peak_period_count = _peak_item(period_counts, UNKNOWN_LABEL)

    peak_month_label = (
        f"{calendar.month_abbr[peak_month_key[1]]} {peak_month_key[0]}"
        if peak_month_key != (0, 0)
        else UNKNOWN_LABEL
    )
    
    insights = []
    if hourly_counts and max(hourly_counts.values()) > 0:
        insights.append(f"Peak accident hour is {_format_hour_label(int(peak_hour))}.")
    if day_counts:
        top_day = max(day_counts, key=day_counts.get)
        insights.append(f"{top_day} records the highest accident frequency.")
    if period_counts:
        top_period = max(period_counts, key=period_counts.get)
        insights.append(f"{top_period} is the highest-risk time period.")
    if month_only_counts:
        top_month_num = max(month_only_counts, key=month_only_counts.get)
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
            "peak_hour": _format_hour_label(int(peak_hour)),
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
            {"label": "Weekend", "count": weekend_counts["Weekend"]}
        ],
        "severity_by_hour": [
            {
                "hour": h,
                "hour_label": _format_hour_label(h),
                **severity_by_hour[h]
            }
            for h in range(HOURS_IN_DAY)
        ],
        "temporal_insights": insights
    }


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

    points = [
        CrashPoint(
            index=idx,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
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


# ---------------------------------------------------------------------------
# Pedestrian blackspot detection (greedy algorithm)
# ---------------------------------------------------------------------------

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

    points = [
        CrashPoint(
            index=idx,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
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

    points = [
        CrashPoint(
            index=idx,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    radius_m: float = Query(KDE_RADIUS_METERS, ge=100, le=2000),
    pixel_m: float = Query(KDE_PIXEL_METERS, ge=10, le=200),
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
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    accidents = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident).filter(Accident.severity == SEVERITY_FATAL),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    query = apply_filters(
        db.query(Accident),
        district, None, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
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
    bs_id: Optional[int] = Query(None, description="Blackspot number to export accident details for"),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    police_station: Optional[List[str]] = Query(None),
):
    from fastapi.responses import StreamingResponse
    from datetime import datetime as dt
    from app.utils.export_utils import (
        build_accident_csv,
        build_accident_excel,
    )

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
    points = [
        CrashPoint(
            index=idx,
            accident_id=a.accident_id,
            lat=a.latitude,
            lon=a.longitude,
            severity=a.severity or "Unknown",
        )
        for idx, a in enumerate(accidents)
        if a.latitude is not None and a.longitude is not None
    ]

    if algorithm == "dbscan":
        blackspots = dbscan_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)
    else:
        blackspots = greedy_blackspots(points, radius_m=radius_m, min_crashes=min_crashes)

    # Build a lookup: accident_id -> Accident ORM object
    acc_by_id = {a.accident_id: a for a in accidents if a.accident_id}

    # Determine which blackspots to export
    if bs_id is not None:
        target_bs = [bs for bs in blackspots if bs.bs_id == bs_id]
        if not target_bs:
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=404,
                content={"detail": f"Blackspot #{bs_id} not found."},
            )
    else:
        target_bs = blackspots

    # Collect (bs_id, Accident) pairs
    accidents_with_bs = []
    for bs in target_bs:
        for cid in bs.crash_ids:
            acc = acc_by_id.get(cid)
            if acc:
                accidents_with_bs.append((bs.bs_id, acc))

    timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
    if bs_id is not None:
        filename = f"blackspot_{bs_id}_accidents_{algorithm}_{timestamp}"
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

    # Excel
    meta_rows = [
        ("Export Date", dt.now().strftime("%d %b %Y %H:%M")),
        ("Algorithm", algorithm.upper()),
        ("Blackspot #", bs_id if bs_id is not None else "All"),
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


# ---------------------------------------------------------------------------
# Risk level thresholding (quartile-based, relative to this dataset)
# ---------------------------------------------------------------------------

def _risk_level(total_accidents: int, sorted_totals: list[int]) -> str:
    if not sorted_totals:
        return "Low"
    n = len(sorted_totals)

    def pct(p: float) -> float:
        idx = min(n - 1, int(p * (n - 1)))
        return sorted_totals[idx]

    p50, p75, p90 = pct(0.5), pct(0.75), pct(0.9)

    if total_accidents >= p90:
        return "Very High"
    if total_accidents >= p75:
        return "High"
    if total_accidents >= p50:
        return "Moderate"
    return "Low"


# ---------------------------------------------------------------------------
# District Insights — computed ONCE per request, cheap to poll infrequently.
# The frontend calls this a single time on load and caches it in memory;
# hover interactions never hit the network again.
# ---------------------------------------------------------------------------

import logging
from sqlalchemy import case, distinct, extract, text

logger = logging.getLogger(__name__)


@router.get("/district-insights", response_model=DistrictInsightsResponse)
def get_district_insights(db: Session = Depends(get_db)):
    try:
        base_filter = (
            Accident.district.isnot(None),
            Accident.district != "",
            Accident.district != "nan",
        )

        # ---- 1. Core numeric KPIs ----
        core_rows = (
            db.query(
                Accident.district,
                func.count(Accident.id).label("total"),
                func.sum(case((Accident.severity == SEVERITY_FATAL, 1), else_=0)).label("fatal"),
                func.sum(
                    func.coalesce(Accident.driver_killed, 0)
                    + func.coalesce(Accident.passenger_killed, 0)
                    + func.coalesce(Accident.pedestrian_killed, 0)
                ).label("fatalities"),
                func.sum(
                    func.coalesce(Accident.driver_grievous_injury, 0)
                    + func.coalesce(Accident.passenger_grievous_injury, 0)
                    + func.coalesce(Accident.pedestrian_grievous_injury, 0)
                ).label("grievous"),
                func.sum(
                    func.coalesce(Accident.driver_minor_injury, 0)
                    + func.coalesce(Accident.passenger_minor_injury, 0)
                    + func.coalesce(Accident.pedestrian_minor_injury, 0)
                ).label("minor"),
                func.count(
                    distinct(case((Accident.police_station != UNKNOWN_LABEL, Accident.police_station), else_=None))
                ).label("stations"),
            )
            .filter(*base_filter)
            .group_by(Accident.district)
            .all()
        )

        # ---- 2. Severity breakdown per district ----
        severity_rows = (
            db.query(Accident.district, Accident.severity, func.count(Accident.id))
            .filter(*base_filter)
            .group_by(Accident.district, Accident.severity)
            .all()
        )
        severity_by_district: dict = defaultdict(list)
        for district, severity, count in severity_rows:
            severity_by_district[district].append({"label": safe_text(severity), "count": count})

        # ---- 3. Monthly trend — group by the extract() EXPRESSIONS, not string aliases ----
        year_expr = extract("year", Accident.accident_date_time)
        month_expr = extract("month", Accident.accident_date_time)
        monthly_rows = (
            db.query(Accident.district, year_expr, month_expr, func.count(Accident.id))
            .filter(*base_filter, Accident.accident_date_time.isnot(None))
            .group_by(Accident.district, year_expr, month_expr)
            .all()
        )
        monthly_by_district: dict = defaultdict(list)
        for district, year, month, count in monthly_rows:
            year, month = int(year), int(month)
            monthly_by_district[district].append({
                "year": year, "month": month,
                "month_label": f"{calendar.month_abbr[month]} {year}",
                "count": count,
            })
        for v in monthly_by_district.values():
            v.sort(key=lambda x: (x["year"], x["month"]))

        # ---- 4. Weekday ----
        weekday_expr = func.to_char(Accident.accident_date_time, "Day")
        weekday_rows = (
            db.query(Accident.district, weekday_expr, func.count(Accident.id))
            .filter(*base_filter, Accident.accident_date_time.isnot(None))
            .group_by(Accident.district, weekday_expr)
            .all()
        )
        weekday_by_district: dict = defaultdict(dict)
        for district, day, count in weekday_rows:
            weekday_by_district[district][day.strip()] = count

        # ---- 5. Time-of-day period ----
        hour_expr = extract("hour", Accident.accident_date_time)
        period_case = case(
            (hour_expr.between(5, 11), "Morning"),
            (hour_expr.between(12, 16), "Afternoon"),
            (hour_expr.between(17, 20), "Evening"),
            else_="Night",
        )
        period_rows = (
            db.query(Accident.district, period_case, func.count(Accident.id))
            .filter(*base_filter, Accident.accident_date_time.isnot(None))
            .group_by(Accident.district, period_case)
            .all()
        )
        period_by_district: dict = defaultdict(dict)
        for district, period, count in period_rows:
            period_by_district[district][period] = count

        # ---- 6. Road / collision breakdown ----
        road_rows = (
            db.query(Accident.district, Accident.road_classification, func.count(Accident.id))
            .filter(*base_filter)
            .group_by(Accident.district, Accident.road_classification)
            .all()
        )
        road_by_district: dict = defaultdict(list)
        for district, road, count in road_rows:
            road_by_district[district].append({"label": safe_text(road), "count": count})

        collision_rows = (
            db.query(Accident.district, Accident.type_of_collision, func.count(Accident.id))
            .filter(*base_filter)
            .group_by(Accident.district, Accident.type_of_collision)
            .all()
        )
        collision_by_district: dict = defaultdict(list)
        for district, collision, count in collision_rows:
            collision_by_district[district].append({"label": safe_text(collision), "count": count})

        # ---- 7. Most affected station ----
        station_rows = (
            db.query(Accident.district, Accident.police_station, func.count(Accident.id))
            .filter(*base_filter)
            .group_by(Accident.district, Accident.police_station)
            .all()
        )
        station_counts: dict = defaultdict(dict)
        for district, station, count in station_rows:
            station_counts[district][safe_text(station)] = count

        # ---- 8. Blackspots — ISOLATED so a PostGIS/version issue here can't
        #          take down the whole endpoint. Falls back to 0 per district.
        blackspots_by_district: dict = {}
        try:
            eps_degrees = BLACKSPOT_RADIUS_METERS / 111_320.0
            blackspot_sql = text(
                """
                SELECT district, COUNT(DISTINCT cluster_id) AS blackspots
                FROM (
                    SELECT
                        district,
                        ST_ClusterDBSCAN(location, eps := :eps, minpoints := :minpts)
                            OVER (PARTITION BY district) AS cluster_id
                    FROM accidents
                    WHERE location IS NOT NULL
                      AND district IS NOT NULL AND district != '' AND district != 'nan'
                ) clustered
                WHERE cluster_id IS NOT NULL
                GROUP BY district
                """
            )
            blackspot_rows = db.execute(
                blackspot_sql, {"eps": eps_degrees, "minpts": BLACKSPOT_MIN_CRASHES}
            ).fetchall()
            blackspots_by_district = {row.district: row.blackspots for row in blackspot_rows}
        except Exception:
            logger.exception("Blackspot clustering query failed — continuing with 0 for all districts.")
            db.rollback()  # clear the failed-transaction state so later queries in this request still work

        # ---- Assemble per-district payload ----
        raw: dict = {}
        for row in core_rows:
            district = row.district
            total = row.total or 0
            fatal = row.fatal or 0
            stations = station_counts.get(district, {})
            most_affected = max(stations.items(), key=lambda x: x[1])[0] if stations else UNKNOWN_LABEL

            months = monthly_by_district.get(district, [])
            highest_month = max(months, key=lambda m: m["count"])["month_label"] if months else UNKNOWN_LABEL

            periods = period_by_district.get(district, {})
            peak_period = max(periods.items(), key=lambda x: x[1])[0] if periods else UNKNOWN_LABEL

            weekdays = weekday_by_district.get(district, {})
            weekday_out = [{"label": d, "count": weekdays.get(d, 0)} for d in WEEKDAY_ORDER]

            raw[district] = {
                "district": district,
                "total_accidents": total,
                "fatal_accidents": fatal,
                "fatalities": row.fatalities or 0,
                "grievous_injuries": row.grievous or 0,
                "minor_injuries": row.minor or 0,
                "fatality_rate": round((fatal / total * 100), 2) if total else 0.0,
                "police_stations": row.stations or 0,
                "most_affected_police_station": most_affected,
                "highest_accident_month": highest_month,
                "peak_accident_time": peak_period,
                "blackspots_count": blackspots_by_district.get(district, 0),
                "severity": severity_by_district.get(district, []),
                "monthly_trend": months,
                "time_of_day": [{"label": k, "count": v} for k, v in periods.items()],
                "weekday": weekday_out,
                "road_type": road_by_district.get(district, []),
                "collision_type": collision_by_district.get(district, []),
            }

        sorted_totals = sorted(v["total_accidents"] for v in raw.values())

        def _risk_level(total: int) -> str:
            if not sorted_totals:
                return "Low"
            n = len(sorted_totals)
            def pct(p): return sorted_totals[min(n - 1, int(p * (n - 1)))]
            if total >= pct(0.9): return "Very High"
            if total >= pct(0.75): return "High"
            if total >= pct(0.5): return "Moderate"
            return "Low"

        for v in raw.values():
            v["risk_level"] = _risk_level(v["total_accidents"])

        total_accidents = sum(v["total_accidents"] for v in raw.values())
        total_fatalities = sum(v["fatalities"] for v in raw.values())
        total_grievous = sum(v["grievous_injuries"] for v in raw.values())
        total_minor = sum(v["minor_injuries"] for v in raw.values())

        gujarat_severity: dict = defaultdict(int)
        for entries in severity_by_district.values():
            for e in entries:
                gujarat_severity[e["label"]] += e["count"]

        fatal_by_district = sorted(
            (
                {"district": name, "fatal_accidents": v["fatal_accidents"], "total_killed": v["fatalities"]}
                for name, v in raw.items()
            ),
            key=lambda x: x["fatal_accidents"],
            reverse=True,
        )[:6]

        all_stations = {s for stations in station_counts.values() for s in stations if s != UNKNOWN_LABEL}

        gujarat = {
            "total_accidents": total_accidents,
            "total_fatalities": total_fatalities,
            "total_grievous": total_grievous,
            "total_minor": total_minor,
            "districts_covered": len(raw),
            "police_stations": len(all_stations),
            "severity": [{"label": k, "count": v} for k, v in gujarat_severity.items()],
            "dangerous": fatal_by_district,
        }

        return {"gujarat": gujarat, "districts": raw}

    except Exception:
        logger.exception("get_district_insights failed")
        db.rollback()
        raise
    base_filter = (
        Accident.district.isnot(None),
        Accident.district != "",
        Accident.district != "nan",
    )

    # ---- 1. Core numeric KPIs — ONE grouped query, no Python row loop ----
    core_rows = (
        db.query(
            Accident.district,
            func.count(Accident.id).label("total"),
            func.sum(case((Accident.severity == SEVERITY_FATAL, 1), else_=0)).label("fatal"),
            func.sum(
                func.coalesce(Accident.driver_killed, 0)
                + func.coalesce(Accident.passenger_killed, 0)
                + func.coalesce(Accident.pedestrian_killed, 0)
            ).label("fatalities"),
            func.sum(
                func.coalesce(Accident.driver_grievous_injury, 0)
                + func.coalesce(Accident.passenger_grievous_injury, 0)
                + func.coalesce(Accident.pedestrian_grievous_injury, 0)
            ).label("grievous"),
            func.sum(
                func.coalesce(Accident.driver_minor_injury, 0)
                + func.coalesce(Accident.passenger_minor_injury, 0)
                + func.coalesce(Accident.pedestrian_minor_injury, 0)
            ).label("minor"),
            func.count(
                distinct(case((Accident.police_station != UNKNOWN_LABEL, Accident.police_station), else_=None))
            ).label("stations"),
        )
        .filter(*base_filter)
        .group_by(Accident.district)
        .all()
    )

    # ---- 2. Severity breakdown per district — grouped query ----
    severity_rows = (
        db.query(Accident.district, Accident.severity, func.count(Accident.id))
        .filter(*base_filter)
        .group_by(Accident.district, Accident.severity)
        .all()
    )
    severity_by_district: dict = defaultdict(list)
    for district, severity, count in severity_rows:
        severity_by_district[district].append({"label": safe_text(severity), "count": count})

    # ---- 3. Monthly trend — grouped by district/year/month ----
    monthly_rows = (
        db.query(
            Accident.district,
            extract("year", Accident.accident_date_time).label("year"),
            extract("month", Accident.accident_date_time).label("month"),
            func.count(Accident.id),
        )
        .filter(*base_filter, Accident.accident_date_time.isnot(None))
        .group_by(Accident.district, "year", "month")
        .all()
    )
    monthly_by_district: dict = defaultdict(list)
    for district, year, month, count in monthly_rows:
        year, month = int(year), int(month)
        monthly_by_district[district].append({
            "year": year, "month": month,
            "month_label": f"{calendar.month_abbr[month]} {year}",
            "count": count,
        })
    for v in monthly_by_district.values():
        v.sort(key=lambda x: (x["year"], x["month"]))

    # ---- 4. Weekday / hour-of-day / road / collision — grouped queries ----
    weekday_expr = func.to_char(Accident.accident_date_time, "Day")
    weekday_rows = (
        db.query(Accident.district, weekday_expr, func.count(Accident.id))
        .filter(*base_filter, Accident.accident_date_time.isnot(None))
        .group_by(Accident.district, weekday_expr)
        .all()
    )
    weekday_by_district: dict = defaultdict(dict)
    for district, day, count in weekday_rows:
        weekday_by_district[district][day.strip()] = count

    hour_expr = extract("hour", Accident.accident_date_time)
    period_case = case(
        (hour_expr.between(5, 11), "Morning"),
        (hour_expr.between(12, 16), "Afternoon"),
        (hour_expr.between(17, 20), "Evening"),
        else_="Night",
    )
    period_rows = (
        db.query(Accident.district, period_case, func.count(Accident.id))
        .filter(*base_filter, Accident.accident_date_time.isnot(None))
        .group_by(Accident.district, period_case)
        .all()
    )
    period_by_district: dict = defaultdict(dict)
    for district, period, count in period_rows:
        period_by_district[district][period] = count

    road_rows = (
        db.query(Accident.district, Accident.road_classification, func.count(Accident.id))
        .filter(*base_filter)
        .group_by(Accident.district, Accident.road_classification)
        .all()
    )
    road_by_district: dict = defaultdict(list)
    for district, road, count in road_rows:
        road_by_district[district].append({"label": safe_text(road), "count": count})

    collision_rows = (
        db.query(Accident.district, Accident.type_of_collision, func.count(Accident.id))
        .filter(*base_filter)
        .group_by(Accident.district, Accident.type_of_collision)
        .all()
    )
    collision_by_district: dict = defaultdict(list)
    for district, collision, count in collision_rows:
        collision_by_district[district].append({"label": safe_text(collision), "count": count})

    # ---- 5. Most affected police station per district — grouped, reduced in Python (tiny) ----
    station_rows = (
        db.query(Accident.district, Accident.police_station, func.count(Accident.id))
        .filter(*base_filter)
        .group_by(Accident.district, Accident.police_station)
        .all()
    )
    station_counts: dict = defaultdict(dict)
    for district, station, count in station_rows:
        station_counts[district][safe_text(station)] = count

    # ---- 6. Blackspots — ONE PostGIS query using ST_ClusterDBSCAN, not Python loops ----
    blackspot_sql = text(
        """
        SELECT district, COUNT(DISTINCT cluster_id) AS blackspots
        FROM (
            SELECT
                district,
                ST_ClusterDBSCAN(location, eps := :eps, minpoints := :minpts)
                    OVER (PARTITION BY district) AS cluster_id
            FROM accidents
            WHERE location IS NOT NULL
              AND district IS NOT NULL AND district != '' AND district != 'nan'
        ) clustered
        WHERE cluster_id IS NOT NULL
        GROUP BY district
        """
    )
    # eps in degrees ≈ BLACKSPOT_RADIUS_METERS at Gujarat's latitude
    eps_degrees = BLACKSPOT_RADIUS_METERS / 111_320.0
    blackspot_rows = db.execute(
        blackspot_sql, {"eps": eps_degrees, "minpts": BLACKSPOT_MIN_CRASHES}
    ).fetchall()
    blackspots_by_district = {row.district: row.blackspots for row in blackspot_rows}

    # ---- Assemble per-district payload (cheap — just dict merging, no DB hits) ----
    raw: dict = {}
    for row in core_rows:
        district = row.district
        total = row.total or 0
        fatal = row.fatal or 0
        stations = station_counts.get(district, {})
        most_affected = max(stations.items(), key=lambda x: x[1])[0] if stations else UNKNOWN_LABEL

        months = monthly_by_district.get(district, [])
        highest_month = max(months, key=lambda m: m["count"])["month_label"] if months else UNKNOWN_LABEL

        periods = period_by_district.get(district, {})
        peak_period = max(periods.items(), key=lambda x: x[1])[0] if periods else UNKNOWN_LABEL

        weekdays = weekday_by_district.get(district, {})
        weekday_out = [
            {"label": d, "count": weekdays.get(d, 0)} for d in WEEKDAY_ORDER
        ]

        raw[district] = {
            "district": district,
            "total_accidents": total,
            "fatal_accidents": fatal,
            "fatalities": row.fatalities or 0,
            "grievous_injuries": row.grievous or 0,
            "minor_injuries": row.minor or 0,
            "fatality_rate": round((fatal / total * 100), 2) if total else 0.0,
            "police_stations": row.stations or 0,
            "most_affected_police_station": most_affected,
            "highest_accident_month": highest_month,
            "peak_accident_time": peak_period,
            "blackspots_count": blackspots_by_district.get(district, 0),
            "severity": severity_by_district.get(district, []),
            "monthly_trend": months,
            "time_of_day": [{"label": k, "count": v} for k, v in periods.items()],
            "weekday": weekday_out,
            "road_type": road_by_district.get(district, []),
            "collision_type": collision_by_district.get(district, []),
        }

    # Relative risk level via quartiles of total_accidents across districts
    sorted_totals = sorted(v["total_accidents"] for v in raw.values())

    def _risk_level(total: int) -> str:
        if not sorted_totals:
            return "Low"
        n = len(sorted_totals)
        def pct(p): return sorted_totals[min(n - 1, int(p * (n - 1)))]
        if total >= pct(0.9): return "Very High"
        if total >= pct(0.75): return "High"
        if total >= pct(0.5): return "Moderate"
        return "Low"

    for v in raw.values():
        v["risk_level"] = _risk_level(v["total_accidents"])

    # ---- Gujarat-wide summary — reuse the grouped rows, no extra full-table scan ----
    total_accidents = sum(v["total_accidents"] for v in raw.values())
    total_fatalities = sum(v["fatalities"] for v in raw.values())
    total_grievous = sum(v["grievous_injuries"] for v in raw.values())
    total_minor = sum(v["minor_injuries"] for v in raw.values())

    gujarat_severity: dict = defaultdict(int)
    for entries in severity_by_district.values():
        for e in entries:
            gujarat_severity[e["label"]] += e["count"]

    fatal_by_district = sorted(
        (
            {"district": name, "fatal_accidents": v["fatal_accidents"], "total_killed": v["fatalities"]}
            for name, v in raw.items()
        ),
        key=lambda x: x["fatal_accidents"],
        reverse=True,
    )[:6]

    all_stations = {s for stations in station_counts.values() for s in stations if s != UNKNOWN_LABEL}

    gujarat = {
        "total_accidents": total_accidents,
        "total_fatalities": total_fatalities,
        "total_grievous": total_grievous,
        "total_minor": total_minor,
        "districts_covered": len(raw),
        "police_stations": len(all_stations),
        "severity": [{"label": k, "count": v} for k, v in gujarat_severity.items()],
        "dangerous": fatal_by_district,
    }

    return {"gujarat": gujarat, "districts": raw}
    accidents = db.query(Accident).all()

    groups: dict = defaultdict(list)
    for a in accidents:
        name = safe_text(a.district)
        if name != UNKNOWN_LABEL:
            groups[name].append(a)

    def _compute(district_name: str, group: list) -> dict:
        total = len(group)
        fatal = sum(1 for a in group if a.severity == SEVERITY_FATAL)
        fatalities = sum(total_fatalities(a) for a in group)
        grievous = sum(total_grievous(a) for a in group)
        minor = sum(total_minor(a) for a in group)
        fatality_rate = round((fatal / total * 100), 2) if total else 0.0

        station_counts: dict = defaultdict(int)
        for a in group:
            station_counts[safe_text(a.police_station)] += 1
        police_stations = len(
            [k for k in station_counts if k != UNKNOWN_LABEL]
        )
        most_affected = (
            max(station_counts.items(), key=lambda x: x[1])[0]
            if station_counts else UNKNOWN_LABEL
        )

        sev_counts: dict = defaultdict(int)
        for a in group:
            sev_counts[safe_text(a.severity)] += 1
        severity = [{"label": k, "count": v} for k, v in sev_counts.items()]

        month_counts: dict = defaultdict(int)
        weekday_counts: dict = defaultdict(int)
        period_counts: dict = defaultdict(int)
        for a in group:
            dt = a.accident_date_time
            if not dt:
                continue
            month_counts[(dt.year, dt.month)] += 1
            weekday_counts[dt.strftime("%A")] += 1
            period_counts[_time_period_for_hour(dt.hour)] += 1

        monthly_trend = [
            {"year": y, "month": m, "month_label": f"{calendar.month_abbr[m]} {y}", "count": c}
            for (y, m), c in sorted(month_counts.items())
        ]
        highest_month = (
            max(month_counts.items(), key=lambda x: x[1]) if month_counts else None
        )
        highest_accident_month = (
            f"{calendar.month_abbr[highest_month[0][1]]} {highest_month[0][0]}"
            if highest_month else UNKNOWN_LABEL
        )
        peak_period = (
            max(period_counts.items(), key=lambda x: x[1])[0]
            if period_counts else UNKNOWN_LABEL
        )
        weekday = [
            {"label": d, "count": weekday_counts.get(d, 0)} for d in WEEKDAY_ORDER
        ]
        time_of_day = [{"label": p, "count": c} for p, c in period_counts.items()]

        road_counts: dict = defaultdict(int)
        for a in group:
            road_counts[safe_text(a.road_classification)] += 1
        road_type = [{"label": k, "count": v} for k, v in road_counts.items()]

        collision_counts: dict = defaultdict(int)
        for a in group:
            collision_counts[safe_text(a.type_of_collision)] += 1
        collision_type = [{"label": k, "count": v} for k, v in collision_counts.items()]

        points = [
            CrashPoint(index=i, accident_id=a.accident_id, lat=a.latitude, lon=a.longitude)
            for i, a in enumerate(group)
            if a.latitude is not None and a.longitude is not None
        ]
        blackspots = greedy_blackspots(
            points, radius_m=BLACKSPOT_RADIUS_METERS, min_crashes=BLACKSPOT_MIN_CRASHES
        )

        return {
            "district": district_name,
            "total_accidents": total,
            "fatal_accidents": fatal,
            "fatalities": fatalities,
            "grievous_injuries": grievous,
            "minor_injuries": minor,
            "fatality_rate": fatality_rate,
            "police_stations": police_stations,
            "most_affected_police_station": most_affected,
            "highest_accident_month": highest_accident_month,
            "peak_accident_time": peak_period,
            "blackspots_count": len(blackspots),
            "severity": severity,
            "monthly_trend": monthly_trend,
            "time_of_day": time_of_day,
            "weekday": weekday,
            "road_type": road_type,
            "collision_type": collision_type,
        }

    raw = {name: _compute(name, group) for name, group in groups.items()}

    # Second pass: assign relative risk levels once we know the full distribution
    sorted_totals = sorted(v["total_accidents"] for v in raw.values())
    for v in raw.values():
        v["risk_level"] = _risk_level(v["total_accidents"], sorted_totals)

    # Gujarat-wide summary (reuses the same in-memory accident list — no extra query)
    gujarat_sev: dict = defaultdict(int)
    for a in accidents:
        gujarat_sev[safe_text(a.severity)] += 1

    fatal_by_district = sorted(
        (
            {
                "district": name,
                "fatal_accidents": v["fatal_accidents"],
                "total_killed": v["fatalities"],
            }
            for name, v in raw.items()
        ),
        key=lambda x: x["fatal_accidents"],
        reverse=True,
    )[:6]

    gujarat = {
        "total_accidents": len(accidents),
        "total_fatalities": sum(total_fatalities(a) for a in accidents),
        "total_grievous": sum(total_grievous(a) for a in accidents),
        "total_minor": sum(total_minor(a) for a in accidents),
        "districts_covered": len(raw),
        "police_stations": len({
            safe_text(a.police_station) for a in accidents
            if safe_text(a.police_station) != UNKNOWN_LABEL
        }),
        "severity": [{"label": k, "count": v} for k, v in gujarat_sev.items()],
        "dangerous": fatal_by_district,
    }

    return {"gujarat": gujarat, "districts": raw}

@router.get("/district-stats")
def get_district_stats(
    district: str,
    year: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return district statistics using the same filters as the spatial view."""
    query = apply_filters(
        db.query(Accident),
        district=district,
        year=year,
        road_classification=road_classification,
        weather_condition=weather_condition,
        light_condition=light_condition,
        collision_type=collision_type,
        police_station=police_station,
        taluka=taluka,
        date_from=date_from,
        date_to=date_to,
        db=db,
    )
    if severity:
        query = query.filter(Accident.severity.in_(severity))

    accidents = query.all()
    total = len(accidents)
    severity_counts = defaultdict(int)
    road_counts = defaultdict(int)
    collision_type_counts = defaultdict(int)
    collision_nature_counts = defaultdict(int)
    weather_counts = defaultdict(int)
    light_counts = defaultdict(int)
    visibility_counts = defaultdict(int)
    
    vehicle_involvement_counts = {"1 Vehicle": 0, "2 Vehicles": 0, "3 Vehicles": 0, "4+ Vehicles": 0}
    victim_counts = {
        "Drivers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Passengers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Pedestrians": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
    }

    # For keeping peak hour backward compatibility in KPIs
    hourly = defaultdict(int)
    # To compute avg per month
    monthly = defaultdict(int)

    for accident in accidents:
        severity_name = safe_text(accident.severity)
        severity_counts[severity_name] += 1
        road_counts[safe_text(accident.road_classification)] += 1
        collision_type_counts[safe_text(accident.type_of_collision)] += 1
        collision_nature_counts[safe_text(accident.collision_feature)] += 1
        weather_counts[safe_text(accident.weather_condition)] += 1
        light_counts[safe_text(accident.light_condition)] += 1
        visibility_counts[safe_text(accident.visibility)] += 1

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

    peak_hour = max(hourly, key=hourly.get) if hourly else None

    # Generate Statistical Insights
    insights = []
    if severity_counts:
        top_severity = max(severity_counts, key=severity_counts.get)
        if top_severity and top_severity != "Unknown":
            insights.append(f"{top_severity} accidents account for the largest share of crashes.")
            
    if road_counts:
        top_road = max(road_counts, key=road_counts.get)
        if top_road and top_road != "Unknown":
            insights.append(f"{top_road}s record the highest accident count.")
            
    if collision_type_counts:
        top_collision = max(collision_type_counts, key=collision_type_counts.get)
        if top_collision and top_collision != "Unknown":
            insights.append(f"{top_collision} collisions are the dominant collision type.")
            
    if weather_counts:
        top_weather = max(weather_counts, key=weather_counts.get)
        if top_weather and top_weather != "Unknown":
            insights.append(f"Most crashes occurred under {top_weather.lower()} weather.")
            
    # Calculate top victim type for fatalities
    fatality_by_victim = {k: v["Killed"] for k, v in victim_counts.items()}
    if any(fatality_by_victim.values()):
        top_victim_fatal = max(fatality_by_victim, key=fatality_by_victim.get)
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
    }

@router.get("/export")
def export_dashboard_data(
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
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    from fastapi.responses import StreamingResponse
    from app.utils.export_utils import build_accident_csv, build_accident_excel
    
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
    
    # Determine district string for filename
    dist_str = district[0] if district else "gujarat"
    dist_str = dist_str.lower().replace(" ", "_")
    
    if format == "csv":
        # Pass 0 for Blackspot #
        csv_buffer = build_accident_csv([(0, acc) for acc in accidents])
        filename = f"{dist_str}_accidents_export.csv"
        return StreamingResponse(
            iter([csv_buffer]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        # Pass 0 for Blackspot # and basic meta rows
        excel_buffer = build_accident_excel(
            [(0, acc) for acc in accidents],
            meta_rows=[("Export Source", "District Dashboard General Export"), ("Total Records", len(accidents))]
        )
        filename = f"{dist_str}_accidents_export.xlsx"
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

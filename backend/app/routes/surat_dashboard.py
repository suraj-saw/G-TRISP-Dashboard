# backend/app/routes/surat_dashboard.py
"""
Surat Dashboard API router.

Mirrors the main dashboard.py routes but queries the `surat_accidents` table.
All endpoints live under /api/surat/dashboard/* to avoid conflicts with the
existing Gujarat-wide dashboard at /api/dashboard/*.

Since all records belong to Surat district, the 'district' filter is replaced
with 'police_station' for more granular filtering within Surat.
"""

import calendar
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.surat_accident import SuratAccident
import base64
from app.utils.kde_utils import compute_kde_heatmap, compute_weighted_kde_heatmap
from app.core.constants import KDE_RADIUS_METERS, KDE_PIXEL_METERS

from app.schemas.dashboard_schema import (
    CasualtyBreakdown,
    CasualtyResponse,
    CollisionCount,
    CollisionResponse,
    DangerousDistrict,
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

from app.schemas.surat_dashboard_schema import (
    SuratFilterOptions,
    PoliceStationSummaryCount,
    PoliceStationSummaryResponse,
    HourDayCount,
    HourlyAccidentCount,
    MonthlyAccidentCount,
    PeakSummary,
    TemporalAnalysisResponse,
)

from app.utils.surat_accident_utils import (
    apply_surat_filters,
    total_fatalities,
    total_grievous,
    total_minor,
)
from app.utils.text_utils import safe_text
from app.utils.datetime_utils import parse_accident_datetime_from_str
from app.utils.blackspot_utils import CrashPoint, greedy_blackspots, blackspots_to_geojson, dbscan_blackspots
from app.core.constants import (
    BLACKSPOT_RADIUS_METERS,
    BLACKSPOT_MIN_CRASHES,
    PEDESTRIAN_BLACKSPOT_MIN_CRASHES,
)

from app.core.constants import (
    SEVERITY_FATAL,
    SEVERITY_DAMAGE_ONLY,
    CASUALTY_TYPES,
    WEEKDAY_ORDER,
    UNKNOWN_LABEL,
    SURAT_DASH_PREFIX,
    TIME_PERIOD_RANGES,
    NIGHT_MORNING_CUTOFF,
    HOURS_IN_DAY,
)

SEVERITY_WEIGHTS_MAP = {
    "fatal": 10.0,
    "grievous injury": 5.0,
    "minor injury hospitalized": 3.0,
    "minor injury not hospitalized": 2.0,
    "non-injury": 1.0,
    "non injury": 1.0,
}
DEFAULT_WEIGHT = 0.0

router = APIRouter(
    prefix=SURAT_DASH_PREFIX,
    tags=["Surat Dashboard"],
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _time_period_for_hour(hour: int) -> str:
    """
    Map a 0-23 hour integer to a named time period.
    Boundaries are defined centrally in TIME_PERIOD_RANGES so the same
    bucketing is used everywhere (routes, seeders, tests).
    """
    for period, (start, end) in TIME_PERIOD_RANGES.items():
        if period == "Night":
            # Night wraps: 21-23 and 0-4
            if hour >= start or hour < NIGHT_MORNING_CUTOFF:
                return period
        elif start <= hour < end:
            return period
    return "Night"  # fallback (should never be reached)


def _format_hour_label(hour: int) -> str:
    suffix = "AM" if hour < 12 else "PM"
    value  = hour % 12 or 12
    return f"{value}:00 {suffix}"


def _peak_item(counts: dict, fallback_key):
    """Return (key, count) of the item with the highest count."""
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
# Filter Options
# ---------------------------------------------------------------------------

@router.get("/filter-options", response_model=SuratFilterOptions)
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

    return SuratFilterOptions(
        police_stations=distinct(SuratAccident.police_station),
        road_classifications=distinct(SuratAccident.road_classification),
        weather_conditions=distinct(SuratAccident.weather_condition),
        light_conditions=distinct(SuratAccident.light_condition),
        collision_types=distinct(SuratAccident.type_of_collision),
    )


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

@router.get("/summary", response_model=SummaryResponse)
def get_summary(
    police_station: Optional[List[str]] = Query(None),
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
    query     = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
        # districts_covered is always 1 (Surat) — kept for schema compatibility
        districts_covered=1,
        police_stations=len({
            safe_text(a.police_station)
            for a in accidents
            if safe_text(a.police_station) != UNKNOWN_LABEL
        }),
    )


# ---------------------------------------------------------------------------
# By Police Station  (replaces "by-district" for Surat-level granularity)
# ---------------------------------------------------------------------------

@router.get("/by-police-station", response_model=PoliceStationSummaryResponse)
def get_by_police_station(
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
    """Breakdown of accidents by police station — main geo-grouping for Surat."""
    query = apply_surat_filters(
        db.query(SuratAccident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )

    station_map: dict = defaultdict(
        lambda: {"accident_count": 0, "fatalities": 0, "grievous": 0, "minor": 0}
    )
    for a in query.all():
        key = safe_text(a.police_station)
        station_map[key]["accident_count"] += 1
        station_map[key]["fatalities"]     += total_fatalities(a)
        station_map[key]["grievous"]       += total_grievous(a)
        station_map[key]["minor"]          += total_minor(a)

    return PoliceStationSummaryResponse(
        data=[
            PoliceStationSummaryCount(
                police_station=name,
                accident_count=v["accident_count"],
                fatalities=v["fatalities"],
                grievous=v["grievous"],
                minor=v["minor"],
            )
            for name, v in sorted(
                station_map.items(),
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
    police_station: Optional[List[str]] = Query(None),
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
    query = apply_surat_filters(
        db.query(SuratAccident.severity, func.count(SuratAccident.id).label("count")),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    rows = query.group_by(SuratAccident.severity).all()

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
    police_station: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    granularity: str = Query("month", enum=["month", "year"]),
    taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, None, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
    police_station: Optional[List[str]] = Query(None),
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
    query = apply_surat_filters(
        db.query(
            SuratAccident.type_of_collision,
            func.count(SuratAccident.id).label("count"),
        ),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    rows = (
        query
        .group_by(SuratAccident.type_of_collision)
        .order_by(func.count(SuratAccident.id).desc())
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
    police_station: Optional[List[str]] = Query(None),
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
):
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

    accidents = query.all()

    return HeatmapResponse(
        total=len(accidents),
        data=[
            HeatmapPoint(
                accident_id=a.accident_id,
                latitude=a.latitude,
                longitude=a.longitude,
                severity=safe_text(a.severity),
                district=safe_text(a.police_station),
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
# Temporal Analysis
# ---------------------------------------------------------------------------

@router.get("/temporal-analysis", response_model=TemporalAnalysisResponse)
def get_temporal_analysis(
    police_station: Optional[List[str]] = Query(None),
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
):
    query = db.query(SuratAccident)
    start_date = _parse_iso_date(date_from)
    end_date = _parse_iso_date(date_to)

    if police_station:
        query = query.filter(SuratAccident.police_station.in_(police_station))
    if severity:
        query = query.filter(SuratAccident.severity.in_(severity))
    if weather_condition:
        query = query.filter(SuratAccident.weather_condition.in_(weather_condition))
    if light_condition:
        query = query.filter(SuratAccident.light_condition.in_(light_condition))

    # Parse datetimes and apply temporal filters in Python
    accidents_with_dt = []
    for accident in query.all():
        dt = parse_accident_datetime_from_str(accident.accident_date_time)
        if not dt:
            continue
        if year        and dt.year              not in [int(y) for y in year]:
            continue
        if month       and dt.month             not in [int(m) for m in month]:
            continue
        if day         and dt.strftime("%A")    not in day:
            continue
        if time_period and _time_period_for_hour(dt.hour) not in time_period:
            continue
        if start_date and dt.date() < start_date:
            continue
        if end_date and dt.date() > end_date:
            continue
        accidents_with_dt.append((accident, dt))

    # Aggregation buckets
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

    peak_hour,       peak_hour_count   = _peak_item(hourly_counts, 0)
    peak_day,        peak_day_count    = _peak_item(day_counts, UNKNOWN_LABEL)
    peak_month_key,  peak_month_count  = _peak_item(monthly_counts, (0, 0))
    peak_period,     peak_period_count = _peak_item(period_counts, UNKNOWN_LABEL)

    peak_month_label = (
        f"{calendar.month_abbr[peak_month_key[1]]} {peak_month_key[0]}"
        if peak_month_key != (0, 0)
        else UNKNOWN_LABEL
    )

    return TemporalAnalysisResponse(
        hour_day=[
            HourDayCount(
                hour=hour,
                day=day_name,
                count=hour_day_counts[(hour, day_name)],
            )
            for day_name in WEEKDAY_ORDER
            for hour in range(HOURS_IN_DAY)
        ],
        hourly=[
            HourlyAccidentCount(hour=h, count=hourly_counts[h])
            for h in range(HOURS_IN_DAY)
        ],
        monthly=[
            MonthlyAccidentCount(
                year=yr,
                month=mo,
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
# Traffic Violations
# ---------------------------------------------------------------------------

@router.get("/by-violation", response_model=ViolationResponse)
def get_by_violation(
    police_station: Optional[List[str]] = Query(None),
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
    query = apply_surat_filters(
        db.query(
            SuratAccident.traffic_violation,
            func.count(SuratAccident.id).label("count"),
        ),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    rows = (
        query
        .filter(
            SuratAccident.traffic_violation.isnot(None),
            SuratAccident.traffic_violation != "",
            SuratAccident.traffic_violation != "nan",
        )
        .group_by(SuratAccident.traffic_violation)
        .order_by(func.count(SuratAccident.id).desc())
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
):
    query = apply_surat_filters(
        db.query(SuratAccident),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
    police_station: Optional[List[str]] = Query(None),
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
    query = apply_surat_filters(
        db.query(
            SuratAccident.weather_condition,
            func.count(SuratAccident.id).label("count"),
        ),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    rows = (
        query
        .group_by(SuratAccident.weather_condition)
        .order_by(func.count(SuratAccident.id).desc())
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
    police_station: Optional[List[str]] = Query(None),
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
    query = apply_surat_filters(
        db.query(
            SuratAccident.light_condition,
            func.count(SuratAccident.id).label("count"),
        ),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    rows = (
        query
        .group_by(SuratAccident.light_condition)
        .order_by(func.count(SuratAccident.id).desc())
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
# Casualty Breakdown
# ---------------------------------------------------------------------------

@router.get("/casualty-breakdown", response_model=CasualtyResponse)
def get_casualty_breakdown(
    police_station: Optional[List[str]] = Query(None),
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
    accidents = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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
# Top Dangerous Police Stations  (replaces top-dangerous districts for Surat)
# ---------------------------------------------------------------------------

@router.get("/top-dangerous", response_model=TopDangerousResponse)
def get_top_dangerous(
    top_n: int = Query(10, ge=1, le=50),
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
    """Top N police stations ranked by fatal accidents."""
    query = apply_surat_filters(
        db.query(SuratAccident).filter(SuratAccident.severity == SEVERITY_FATAL),
        None, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )

    ranking: dict = defaultdict(lambda: {"fatal_accidents": 0, "total_killed": 0})
    for a in query.all():
        key = safe_text(a.police_station)
        ranking[key]["fatal_accidents"] += 1
        ranking[key]["total_killed"]    += total_fatalities(a)

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
    police_station: Optional[List[str]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
        taluka: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, None, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
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


@router.get("/blackspots")
def get_blackspots(
    police_station: Optional[List[str]] = Query(None),
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
):
    """
    Greedy blackspot detection (same algorithm as the offline notebook
    pipeline). Returns 250 m blackspot circles + their anchor centroids
    as GeoJSON, respecting the active dashboard filters.
    """
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

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


@router.get("/pedestrian-blackspots")
def get_pedestrian_blackspots(
    police_station: Optional[List[str]] = Query(None),
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
):
    """
    Greedy pedestrian blackspot detection using only crashes with pedestrian
    casualties. Mirrors the notebook's pedestrian layer defaults: 250 m radius
    and a minimum of 3 pedestrian crashes.
    """
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

    accidents = query.filter(
        (
            func.coalesce(SuratAccident.pedestrian_killed, 0) +
            func.coalesce(SuratAccident.pedestrian_grievous_injury, 0) +
            func.coalesce(SuratAccident.pedestrian_minor_injury, 0)
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

@router.get("/dbscan-blackspots")
def get_dbscan_blackspots(
    police_station: Optional[List[str]] = Query(None),
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
):
    """
    DBSCAN-style blackspot detection: fixed-radius neighbour counting
    followed by overlap suppression, keeping only the densest
    non-overlapping circles. Mirrors build_dbscan_circles() from the
    offline notebook pipeline. Respects the active dashboard filters.
    """
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

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


@router.get("/kde-heatmap")
def get_kde_heatmap(
    police_station: Optional[List[str]] = Query(None),
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
    is_pedestrian: bool = Query(False),
):
    """
    Continuous accident-density surface using a quartic kernel — identical
    formula to QGIS's built-in Heatmap tool and the offline notebook's
    build_kde_raster(). Returns a georeferenced PNG (base64 data URL) plus
    the four corner coordinates needed for a MapLibre ImageSource overlay.
    """
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

    if is_pedestrian:
        query = query.filter(
            (
                func.coalesce(SuratAccident.pedestrian_killed, 0) +
                func.coalesce(SuratAccident.pedestrian_grievous_injury, 0) +
                func.coalesce(SuratAccident.pedestrian_minor_injury, 0)
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


@router.get("/weighted-kde-heatmap")
def get_weighted_kde_heatmap(
    police_station: Optional[List[str]] = Query(None),
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
    is_pedestrian: bool = Query(False),
):
    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity:
        if isinstance(severity, list):
            query = query.filter(SuratAccident.severity.in_(severity))
        else:
            query = query.filter(SuratAccident.severity == severity)

    if is_pedestrian:
        query = query.filter(
            (
                func.coalesce(SuratAccident.pedestrian_killed, 0) +
                func.coalesce(SuratAccident.pedestrian_grievous_injury, 0) +
                func.coalesce(SuratAccident.pedestrian_minor_injury, 0)
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

@router.get("/blackspot-export")
def export_blackspots(
    format: str = Query("csv", enum=["csv", "excel"]),
    police_station: Optional[List[str]] = Query(None),
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
):
    from fastapi.responses import StreamingResponse
    from datetime import datetime as dt
    from app.utils.export_utils import (
        build_accident_csv,
        build_accident_excel,
    )

    query = apply_surat_filters(
        db.query(SuratAccident),
        police_station, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
    )
    if severity and "all" not in severity:
        query = query.filter(SuratAccident.severity.in_(severity))

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

    # Build a lookup: accident_id -> SuratAccident ORM object
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

    # Collect (bs_id, SuratAccident) pairs
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
        ("Source", "G-TRISP Dashboard — Surat"),
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

# backend/app/routes/dashboard_routes/analytics_routes.py

"""
Dashboard Analytics & Aggregations Endpoints.
"""

import calendar
import logging
from collections import defaultdict
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy import func, case, extract, text
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.schemas.dashboard_schema import (
    CollisionCount,
    CollisionResponse,
    DangerousDistrict,
    DistrictCount,
    DistrictResponse,
    SeverityCount,
    SeverityResponse,
    TimeSeriesPoint,
    TimeSeriesResponse,
    TopDangerousResponse,
    YearlyResponse,
    YearlyStats,
)
from app.schemas.gujarat_insights_schema import DistrictInsightsResponse
from app.utils.accident_utils import (
    apply_filters,
    total_fatalities,
    total_grievous,
    total_minor,
)
from app.utils.text_utils import safe_text
from app.core.constants import (
    SEVERITY_FATAL,
    UNKNOWN_LABEL,
    TOP_DANGEROUS_DEFAULT_N,
    TOP_DANGEROUS_MAX_N,
    BLACKSPOT_RADIUS_METERS,
    BLACKSPOT_MIN_CRASHES,
    WEEKDAY_ORDER,
)

logger = logging.getLogger(__name__)
router = APIRouter()


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
                    func.distinct(case((Accident.police_station != UNKNOWN_LABEL, Accident.police_station), else_=None))
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

        # ---- 3. Monthly trend ----
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

        # ---- 8. Blackspots ----
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
            db.rollback()

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


@router.get("/district-stats")
def get_district_stats(
    district: Optional[List[str]] = Query(None),
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
    """Return statistics using the same filters as the spatial view (for single district or all Gujarat)."""
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
    
    road_severity_counts = defaultdict(lambda: defaultdict(int))
    collision_severity_counts = defaultdict(lambda: defaultdict(int))
    weather_severity_counts = defaultdict(lambda: defaultdict(int))
    light_severity_counts = defaultdict(lambda: defaultdict(int))
    road_collision_counts = defaultdict(lambda: defaultdict(int))
    time_severity_counts = defaultdict(lambda: defaultdict(int))
    monthly_stats = defaultdict(lambda: {"total": 0, "fatalities": 0})
    police_station_stats = defaultdict(lambda: {"total": 0, "fatal_accidents": 0})

    vehicle_involvement_counts = {"1 Vehicle": 0, "2 Vehicles": 0, "3 Vehicles": 0, "4+ Vehicles": 0}
    victim_counts = {
        "Drivers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Passengers": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
        "Pedestrians": {"Killed": 0, "Grievous Injury": 0, "Minor Injury": 0},
    }

    hourly = defaultdict(int)
    monthly = defaultdict(int)

    for accident in accidents:
        severity_name = safe_text(accident.severity)
        mapped_severity = "Fatal" if severity_name == "Fatal" else ("Grievous Injury" if severity_name == "Grievous Injury" else "Other")
        severity_counts[mapped_severity] += 1
        road_counts[safe_text(accident.road_classification)] += 1
        collision_type_counts[safe_text(accident.type_of_collision)] += 1
        collision_nature_counts[safe_text(accident.collision_feature)] += 1
        weather_counts[safe_text(accident.weather_condition)] += 1
        light_counts[safe_text(accident.light_condition)] += 1
        visibility_counts[safe_text(accident.visibility)] += 1
        
        road_severity_counts[safe_text(accident.road_classification)][severity_name] += 1
        collision_severity_counts[safe_text(accident.type_of_collision)][severity_name] += 1
        weather_severity_counts[safe_text(accident.weather_condition)][severity_name] += 1
        light_severity_counts[safe_text(accident.light_condition)][severity_name] += 1
        road_collision_counts[safe_text(accident.road_classification)][safe_text(accident.type_of_collision)] += 1
        
        ps = safe_text(accident.police_station)
        if ps != "Unknown":
            police_station_stats[ps]["total"] += 1
            if severity_name == "Fatal":
                police_station_stats[ps]["fatal_accidents"] += 1

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
            monthly_stats[month_key]["total"] += 1
            monthly_stats[month_key]["fatalities"] += total_fatalities(accident)
            
            hour = occurred_at.hour
            if 5 <= hour < 12:
                time_period = "Morning"
            elif 12 <= hour < 17:
                time_period = "Afternoon"
            elif 17 <= hour < 21:
                time_period = "Evening"
            else:
                time_period = "Night"
            time_severity_counts[time_period][severity_name] += 1

    peak_hour = max(hourly, key=lambda k: hourly[k]) if hourly else None

    insights = []
    if severity_counts:
        top_severity = max(severity_counts, key=lambda k: severity_counts[k])
        if top_severity and top_severity != "Unknown":
            insights.append(f"{top_severity} accidents account for the largest share of crashes.")
            
    if road_counts:
        top_road = max(road_counts, key=lambda k: road_counts[k])
        if top_road and top_road != "Unknown":
            insights.append(f"{top_road}s record the highest accident count.")
            
    if collision_type_counts:
        top_collision = max(collision_type_counts, key=lambda k: collision_type_counts[k])
        if top_collision and top_collision != "Unknown":
            insights.append(f"{top_collision} collisions are the dominant collision type.")
            
    if weather_counts:
        top_weather = max(weather_counts, key=lambda k: weather_counts[k])
        if top_weather and top_weather != "Unknown":
            insights.append(f"Most crashes occurred under {top_weather.lower()} weather.")
            
    fatality_by_victim = {k: v["Killed"] for k, v in victim_counts.items()}
    if any(fatality_by_victim.values()):
        top_victim_fatal = max(fatality_by_victim, key=lambda k: fatality_by_victim[k])
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
        "road_severity_matrix": [{"name": k, **v} for k, v in road_severity_counts.items() if k != "Unknown"],
        "collision_severity_matrix": [{"name": k, **v} for k, v in collision_severity_counts.items() if k != "Unknown"],
        "weather_severity_matrix": [{"name": k, **v} for k, v in weather_severity_counts.items() if k != "Unknown"],
        "light_severity_matrix": [{"name": k, **v} for k, v in light_severity_counts.items() if k != "Unknown"],
        "road_collision_matrix": [{"name": k, **v} for k, v in road_collision_counts.items() if k != "Unknown"],
        "time_severity_matrix": [{"name": k, **v} for k, v in time_severity_counts.items()],
        "monthly_fatality_rate": [
            {"month": k, "total": v["total"], "fatalities": v["fatalities"], "fatality_rate": round(v["fatalities"] / v["total"] * 100, 1) if v["total"] > 0 else 0} 
            for k, v in sorted(monthly_stats.items())
        ],
        "police_station_stats": [
            {"police_station": k, "total": v["total"], "fatal_accidents": v["fatal_accidents"], "fatality_rate": round(v["fatal_accidents"] / v["total"] * 100, 1) if v["total"] > 0 else 0}
            for k, v in sorted(police_station_stats.items(), key=lambda item: item[1]["total"], reverse=True)[:15]
        ],
    }

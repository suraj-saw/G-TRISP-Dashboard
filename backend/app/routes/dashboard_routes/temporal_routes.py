# backend/app/routes/dashboard_routes/temporal_routes.py

"""
Temporal Analysis Endpoints (Hourly, Day-of-Week, Seasonal, Time Period Distributions).
"""

import calendar
from collections import defaultdict
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.utils.accident_utils import apply_filters
from app.utils.text_utils import safe_text
from app.core.constants import (
    UNKNOWN_LABEL,
    WEEKDAY_ORDER,
    HOURS_IN_DAY,
)
from app.routes.dashboard_routes.common import (
    time_period_for_hour,
    format_hour_label,
    peak_item,
)

router = APIRouter()


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
    road_classification: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
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

    accidents_with_dt = []
    for accident in query.all():
        dt = accident.accident_date_time
        if not dt:
            continue
        if month and dt.month not in [int(m) for m in month]:
            continue
        if day and dt.strftime("%A") not in day:
            continue
        if time_period and time_period_for_hour(dt.hour) not in time_period:
            continue
        accidents_with_dt.append((accident, dt))

    hour_day_counts: dict = defaultdict(int)
    hourly_counts   = {h: 0 for h in range(HOURS_IN_DAY)}
    monthly_counts: dict  = defaultdict(int)
    day_counts: dict      = defaultdict(int)
    period_counts: dict   = defaultdict(int)
    time_severity_counts = defaultdict(lambda: defaultdict(int))
    monthly_stats = defaultdict(lambda: {"total": 0, "fatalities": 0})

    month_only_counts = defaultdict(int)
    year_only_counts = defaultdict(int)
    weekend_counts = {"Weekday": 0, "Weekend": 0}
    severity_by_hour = {h: {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0} for h in range(HOURS_IN_DAY)}
    severity_by_weekend_weekday = {
        "Weekday": {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0},
        "Weekend": {"Fatal": 0, "Grievous Injury": 0, "Minor Injury": 0, "Damage Only": 0}
    }

    for accident, dt in accidents_with_dt:
        hour     = dt.hour
        day_name = dt.strftime("%A")
        period   = time_period_for_hour(hour)

        hour_day_counts[(hour, day_name)] += 1
        hourly_counts[hour]               += 1
        monthly_counts[(dt.year, dt.month)] += 1
        day_counts[day_name]              += 1
        period_counts[period]             += 1
        
        month_key = dt.strftime("%Y-%m")
        monthly_stats[month_key]["total"] += 1
        if safe_text(accident.severity) == "Fatal":
            monthly_stats[month_key]["fatalities"] += 1

        month_only_counts[dt.month] += 1
        year_only_counts[dt.year] += 1
        
        is_weekend = day_name in ["Saturday", "Sunday"]
        ww_label = "Weekend" if is_weekend else "Weekday"
        weekend_counts[ww_label] += 1
            
        sev = safe_text(accident.severity)
        
        if sev not in severity_by_hour[hour]:
            severity_by_hour[hour][sev] = 0
        if sev not in severity_by_weekend_weekday[ww_label]:
            severity_by_weekend_weekday[ww_label][sev] = 0
            
        severity_by_hour[hour][sev] += 1
        severity_by_weekend_weekday[ww_label][sev] += 1
            
        time_severity_counts[period][sev] += 1

    peak_hour_key,  peak_hour_count   = peak_item(hourly_counts, 0)
    peak_day,       peak_day_count    = peak_item(day_counts, UNKNOWN_LABEL)
    peak_month_key, peak_month_count  = peak_item(monthly_counts, (0, 0))
    peak_period,    peak_period_count = peak_item(period_counts, UNKNOWN_LABEL)

    peak_hour_label = format_hour_label(peak_hour_key) if hourly_counts else UNKNOWN_LABEL
    peak_month_label = (
        f"{calendar.month_abbr[peak_month_key[1]]} {peak_month_key[0]}"
        if peak_month_key != (0, 0)
        else UNKNOWN_LABEL
    )
    
    insights = []
    if hourly_counts and peak_hour_count > 0:
        insights.append(f"Peak accident hour is {peak_hour_label}.")
    if day_counts:
        top_day = max(day_counts, key=lambda k: day_counts[k])
        insights.append(f"{top_day} records the highest accident frequency.")
    if period_counts:
        top_period = max(period_counts, key=lambda k: period_counts[k])
        insights.append(f"{top_period} is the highest-risk time period.")
    if month_only_counts:
        top_month_num = max(month_only_counts, key=lambda k: month_only_counts[k])
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
            "peak_hour": peak_hour_label,
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
        "severity_by_weekend_weekday": [
            {"label": "Weekday", **severity_by_weekend_weekday["Weekday"]},
            {"label": "Weekend", **severity_by_weekend_weekday["Weekend"]}
        ],
        "severity_by_hour": [
            {"hour": h, "hour_label": format_hour_label(h), **severity_by_hour[h]}
            for h in range(HOURS_IN_DAY)
        ],
        "temporal_insights": insights,
        "time_severity_matrix": [{"name": k, **v} for k, v in time_severity_counts.items()],
        "monthly_fatality_rate": [
            {"month": k, "total": v["total"], "fatalities": v["fatalities"], "fatality_rate": round(v["fatalities"] / v["total"] * 100, 1) if v["total"] > 0 else 0} 
            for k, v in sorted(monthly_stats.items())
        ],
    }

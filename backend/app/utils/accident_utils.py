# backend/app/utils/accident_utils.py
"""
Shared query helpers and casualty calculators for the dashboard.
All field names use the iRAD-aligned names from the main project's Accident model.
"""

from datetime import datetime
from typing import Optional, List
from dateutil.relativedelta import relativedelta

from sqlalchemy import extract
from app.models.accident import Accident
from app.utils.taluka_utils import apply_taluka_spatial_filter
from app.utils.datetime_utils import parse_accident_datetime_from_str


def apply_filters(
    query,
    district=None,
    year=None,
    road_classification=None,
    weather_condition=None,
    light_condition=None,
    collision_type=None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    taluka=None,
    police_station=None, 
    db=None,
):
    """
    Apply common dashboard filters to a SQLAlchemy query.

    date_from / date_to accept ISO date strings "YYYY-MM-DD" and filter
    accident_date_time to the inclusive range [date_from 00:00, date_to 23:59:59].
    """
    if district:
        if isinstance(district, list):
            query = query.filter(Accident.district.in_(district))
        else:
            query = query.filter(Accident.district == district)
    if year:
        if isinstance(year, list):
            years_int = [int(y) for y in year]
            query = query.filter(extract("year", Accident.accident_date_time).in_(years_int))
        else:
            query = query.filter(extract("year", Accident.accident_date_time) == int(year))
    if road_classification:
        if isinstance(road_classification, list):
            query = query.filter(Accident.road_classification.in_(road_classification))
        else:
            query = query.filter(Accident.road_classification == road_classification)
    if weather_condition:
        if isinstance(weather_condition, list):
            query = query.filter(Accident.weather_condition.in_(weather_condition))
        else:
            query = query.filter(Accident.weather_condition == weather_condition)
    if light_condition:
        if isinstance(light_condition, list):
            query = query.filter(Accident.light_condition.in_(light_condition))
        else:
            query = query.filter(Accident.light_condition == light_condition)
    if collision_type:
        # iRAD field is type_of_collision
        if isinstance(collision_type, list):
            query = query.filter(Accident.type_of_collision.in_(collision_type))
        else:
            query = query.filter(Accident.type_of_collision == collision_type)

    # Date range — applied on accident_date_time column
    if date_from:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(Accident.accident_date_time >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
            query = query.filter(Accident.accident_date_time <= dt_to)
        except ValueError:
            pass

    if police_station:
        if isinstance(police_station, list):
            query = query.filter(Accident.police_station.in_(police_station))
        else:
            query = query.filter(Accident.police_station == police_station)

    if taluka and db is not None:
        query = apply_taluka_spatial_filter(query, Accident, Accident.location, taluka, db)

    return query


# ---------------------------------------------------------------------------
# Casualty helpers — use iRAD field names
# ---------------------------------------------------------------------------

def total_fatalities(accident) -> int:
    return (
        (accident.driver_killed or 0)
        + (accident.passenger_killed or 0)
        + (accident.pedestrian_killed or 0)
    )


def total_grievous(accident) -> int:
    return (
        (accident.driver_grievous_injury or 0)
        + (accident.passenger_grievous_injury or 0)
        + (accident.pedestrian_grievous_injury or 0)
    )


def total_minor(accident) -> int:
    return (
        (accident.driver_minor_injury or 0)
        + (accident.passenger_minor_injury or 0)
        + (accident.pedestrian_minor_injury or 0)
    )


def validate_observation_period(accidents: List, selected_years: Optional[List[int]] = None) -> Optional[str]:
    """
    Validate that the analysis period has at least MIN_ANALYSIS_YEARS distinct calendar years.
    
    If selected_years is provided, counts the number of selected years.
    If selected_years is None, counts distinct years from the accident data.
    
    Returns None if valid, or an error message if invalid.
    """
    from app.core.constants import MIN_ANALYSIS_YEARS
    
    if selected_years:
        # User selected specific years - count how many distinct years they selected
        num_years = len(set(selected_years))
    else:
        # No years selected - count distinct years from accident data
        distinct_years = set()
        for a in accidents:
            dt = parse_accident_datetime_from_str(a.accident_date_time)
            if dt:
                distinct_years.add(dt.year)
        num_years = len(distinct_years)
    
    if num_years < MIN_ANALYSIS_YEARS:
        return (
            "Blackspot analysis requires selecting accident data from at least "
            f"{MIN_ANALYSIS_YEARS} calendar years. Please select additional years to continue."
        )
    
    return None


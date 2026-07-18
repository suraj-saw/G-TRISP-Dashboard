# backend/app/utils/accident_utils.py
"""
Accident Query Utility Module

Shared query helpers and casualty calculators for the dashboard.
All field names map precisely to the iRAD-aligned names utilized in 
the main project's SQLAlchemy `Accident` model.
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
    Apply standard dashboard UI filters to an active SQLAlchemy query object.

    Handles single values and lists natively (translating lists to SQL 'IN' clauses).
    Dates provided are applied to the `accident_date_time` column.

    Parameters
    ----------
    query : sqlalchemy.orm.Query
        The base query to be filtered.
    district : str or list, optional
    year : str or list, optional
    road_classification : str or list, optional
    weather_condition : str or list, optional
    light_condition : str or list, optional
    collision_type : str or list, optional
    date_from : str, optional
        ISO date string (YYYY-MM-DD). Applied as >= (00:00:00).
    date_to : str, optional
        ISO date string (YYYY-MM-DD). Applied as <= (23:59:59).
    taluka : str, optional
        Triggers a spatial intersection query if provided alongside `db`.
    police_station : str or list, optional
    db : sqlalchemy.orm.Session, optional
        Required only if `taluka` spatial filtering is needed.

    Returns
    -------
    sqlalchemy.orm.Query
        The modified query with applied filters.
    """
    if district:
        if isinstance(district, list):
            query = query.filter(Accident.district.in_(district))
        else:
            query = query.filter(Accident.district == district)
            
    if year:
        if isinstance(year, list):
            years_int = [int(y) for y in year]
            # Use SQL extract() to pull year from datetime column efficiently
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
        # Note: Internal DB field is 'type_of_collision' based on iRAD standards
        if isinstance(collision_type, list):
            query = query.filter(Accident.type_of_collision.in_(collision_type))
        else:
            query = query.filter(Accident.type_of_collision == collision_type)

    # Date range — enforced specifically on the accident_date_time column
    if date_from:
        try:
            # Assumes ISO string start of day (00:00:00)
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(Accident.accident_date_time >= dt_from)
        except ValueError:
            pass # Silently ignore malformed dates
            
    if date_to:
        try:
            # Push bounds to the final second of the requested day
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

    # Apply PostGIS spatial filtering using the separate geometry table
    if taluka and db is not None:
        query = apply_taluka_spatial_filter(query, Accident, Accident.location, taluka, db)

    return query


# ---------------------------------------------------------------------------
# Casualty helpers — Aggregating entity-specific counts mapped to iRAD names
# ---------------------------------------------------------------------------

def total_fatalities(accident) -> int:
    """Calculate the sum of all fatalities (driver, passenger, pedestrian)."""
    return (
        (accident.driver_killed or 0)
        + (accident.passenger_killed or 0)
        + (accident.pedestrian_killed or 0)
    )


def total_grievous(accident) -> int:
    """Calculate the sum of all grievous injuries."""
    return (
        (accident.driver_grievous_injury or 0)
        + (accident.passenger_grievous_injury or 0)
        + (accident.pedestrian_grievous_injury or 0)
    )


def total_minor(accident) -> int:
    """Calculate the sum of all minor injuries."""
    return (
        (accident.driver_minor_injury or 0)
        + (accident.passenger_minor_injury or 0)
        + (accident.pedestrian_minor_injury or 0)
    )


def validate_observation_period(accidents: List, selected_years: Optional[List[int]] = None) -> Optional[str]:
    """
    Validate that the analysis period spans the required minimum number of calendar years.
    
    Statistical reliability for blackspot/hotspot calculations requires multiple 
    years of contiguous observation. This helper validates user selections against 
    `MIN_ANALYSIS_YEARS`.
    
    Parameters
    ----------
    accidents : List
        The list of queried accident objects. Used as a fallback if `selected_years` is None.
    selected_years : List[int], optional
        The explicit list of years selected by the user in the UI filter.

    Returns
    -------
    str | None
        None if the validation passes; otherwise, returns an error message string.
    """
    from app.core.constants import MIN_ANALYSIS_YEARS
    
    if selected_years:
        # Directly evaluate based on user input parameters
        num_years = len(set(selected_years))
    else:
        # Fallback: Extract years from the dataset itself if no explicit filter was provided
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
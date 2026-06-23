# backend/app/utils/accident_utils.py
"""
Shared query helpers and casualty calculators for the dashboard.
All field names use the iRAD-aligned names from the main project's Accident model.
"""

from sqlalchemy import extract
from app.models.accident import Accident


def apply_filters(
    query,
    district=None,
    year=None,
    road_classification=None,
    weather_condition=None,
    light_condition=None,
    collision_type=None,
):
    """
    Apply common dashboard filters to a SQLAlchemy query.
    Returns the (possibly modified) query.
    """
    if district:
        query = query.filter(Accident.district == district)
    if year:
        query = query.filter(
            extract("year", Accident.accident_date_time) == int(year)
        )
    if road_classification:
        query = query.filter(Accident.road_classification == road_classification)
    if weather_condition:
        query = query.filter(Accident.weather_condition == weather_condition)
    if light_condition:
        query = query.filter(Accident.light_condition == light_condition)
    if collision_type:
        # iRAD field is type_of_collision
        query = query.filter(Accident.type_of_collision == collision_type)
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
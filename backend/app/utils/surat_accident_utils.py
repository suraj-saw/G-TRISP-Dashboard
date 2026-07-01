# backend/app/utils/surat_accident_utils.py
"""
Shared query helpers and casualty calculators for the Surat dashboard.
Mirrors accident_utils.py but operates on the SuratAccident model.
"""

from sqlalchemy import extract
from app.models.surat_accident import SuratAccident


def apply_surat_filters(
    query,
    police_station=None,
    year=None,
    road_classification=None,
    weather_condition=None,
    light_condition=None,
    collision_type=None,
):
    """
    Apply common dashboard filters to a SuratAccident query.
    Uses police_station instead of district (all records belong to Surat district).
    Returns the (possibly modified) query.
    """
    if police_station:
        if isinstance(police_station, list):
            query = query.filter(SuratAccident.police_station.in_(police_station))
        else:
            query = query.filter(SuratAccident.police_station == police_station)
    if year:
        if isinstance(year, list):
            years_int = [int(y) for y in year]
            query = query.filter(extract("year", SuratAccident.accident_date_time).in_(years_int))
        else:
            query = query.filter(extract("year", SuratAccident.accident_date_time) == int(year))
    if road_classification:
        if isinstance(road_classification, list):
            query = query.filter(SuratAccident.road_classification.in_(road_classification))
        else:
            query = query.filter(SuratAccident.road_classification == road_classification)
    if weather_condition:
        if isinstance(weather_condition, list):
            query = query.filter(SuratAccident.weather_condition.in_(weather_condition))
        else:
            query = query.filter(SuratAccident.weather_condition == weather_condition)
    if light_condition:
        if isinstance(light_condition, list):
            query = query.filter(SuratAccident.light_condition.in_(light_condition))
        else:
            query = query.filter(SuratAccident.light_condition == light_condition)
    if collision_type:
        if isinstance(collision_type, list):
            query = query.filter(SuratAccident.type_of_collision.in_(collision_type))
        else:
            query = query.filter(SuratAccident.type_of_collision == collision_type)
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

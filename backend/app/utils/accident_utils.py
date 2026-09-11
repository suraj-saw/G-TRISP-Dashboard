# backend/app/utils/accident_utils.py
"""
Accident Query Utility Module

Shared query helpers and casualty calculators for the dashboard.
All field names map precisely to the iRAD-aligned names utilized in 
the main project's SQLAlchemy `Accident` model.
"""

from datetime import datetime
import re
from typing import Optional, List, Union

# pyrefly: ignore [missing-import]
from sqlalchemy import extract, func, String, Text, cast, or_
# pyrefly: ignore [missing-import]
from sqlalchemy.dialects.postgresql import ARRAY
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from app.models.accident import Accident
from app.utils.taluka_utils import apply_taluka_spatial_filter
from app.utils.datetime_utils import parse_accident_datetime_from_str
from app.utils.district_utils import get_district_expansion_list

def normalize_category_name(name: str) -> str:
    """
    Dynamically normalizes whitespace, slashes, and capitalization of category tokens
    without relying on hardcoded category lists.
    """
    cleaned = re.sub(r"\s+", " ", name.strip().rstrip("."))
    cleaned = re.sub(r"\s*/\s*", " / ", cleaned)
    words = cleaned.split(" ")
    out = []
    for i, w in enumerate(words):
        if i > 0 and w.lower() in ("to", "of", "in", "from", "while", "off", "down", "on", "and", "or"):
            out.append(w.lower())
        elif w != "/":
            out.append(w.capitalize())
        else:
            out.append("/")
    return " ".join(out)


def split_and_clean_categories(val: Optional[Union[str, List[str]]]) -> List[str]:
    """
    Dynamically splits comma-separated category strings (or processes existing lists),
    normalizes whitespace and formatting, and returns a deduplicated list of tokens derived directly from data.
    """
    if not val:
        return []
    if isinstance(val, (list, tuple, set)):
        items_to_process = list(val)
    else:
        items_to_process = str(val).split(",")

    results: List[str] = []
    seen = set()
    for part in items_to_process:
        cleaned = str(part).strip().rstrip(".")
        if not cleaned or cleaned.lower() in ("unknown", "nan", "none", "null", ""):
            continue
        normalized = normalize_category_name(cleaned)
        norm_key = normalized.lower()
        if norm_key not in seen:
            seen.add(norm_key)
            results.append(normalized)
    return results


# Dynamic aliases for backwards compatibility
parse_collision_types = split_and_clean_categories
parse_collision_natures = split_and_clean_categories
parse_weather_conditions = split_and_clean_categories


def get_distinct_categories(db: Session, column) -> List[str]:
    """
    Dynamically queries distinct values for a multi-category column from the database.
    Leverages PostgreSQL unnest() when operating on array columns for optimal performance,
    falling back to Python-level splitting if called on a text column.
    """
    try:
        raw_rows = db.query(func.unnest(column)).filter(column.isnot(None)).distinct().all()
        categories = set()
        for (val,) in raw_rows:
            if val:
                for cat in split_and_clean_categories(val):
                    categories.add(cat)
        return sorted(categories)
    except Exception:
        db.rollback()
        raw_rows = db.query(column).filter(column.isnot(None)).distinct().all()
        categories = set()
        for (val,) in raw_rows:
            for cat in split_and_clean_categories(val):
                categories.add(cat)
        return sorted(categories)


def apply_multi_category_filter(query, column, values: Optional[Union[str, List[str]]]):
    """
    Filters a multi-category column to match any of the selected categories.
    Uses PostgreSQL array overlap (.overlap) when the column is an ARRAY,
    falling back to comma boundary matching if the column is text.
    """
    if not values:
        return query
    types = values if isinstance(values, list) else [values]
    normalized_types = []
    for item in types:
        item_clean = item.strip()
        normalized_types.append(item_clean)
        if "/" in item_clean:
            normalized_types.append(re.sub(r"\s*/\s*", "/", item_clean))
            normalized_types.append(re.sub(r"\s*/\s*", " / ", item_clean))
            normalized_types.append(re.sub(r"\s*/\s*", "/ ", item_clean))

    unique_tokens = list(set(normalized_types))

    try:
        # PostgreSQL native array overlap (column && ARRAY[...]::text[])
        return query.filter(column.op("&&")(cast(unique_tokens, ARRAY(Text))))
    except Exception:
        # Fallback for text columns
        conds = []
        for v in unique_tokens:
            conds.append(
                or_(
                    column == v,
                    column.ilike(f"{v},%"),
                    column.ilike(f"%, {v},%"),
                    column.ilike(f"%,{v},%"),
                    column.ilike(f"%, {v}"),
                    column.ilike(f"%,{v}"),
                )
            )
        if conds:
            query = query.filter(or_(*conds))
        return query


def expand_districts(districts: list[str]) -> list[str]:
    """
    Expands a list of district names using the canonical Gujarat district registry,
    ensuring all spelling variants, commissionerates, subdivisions, and railway police
    jurisdictions are matched.
    """
    return get_district_expansion_list(districts)

def apply_filters(
    query,
    district=None,
    year=None,
    road_classification=None,
    weather_condition=None,
    light_condition=None,
    collision_type: Optional[Union[str, List[str]]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    taluka: Optional[Union[str, List[str]]] = None,
    db: Optional[Session] = None,
    police_station: Optional[Union[str, List[str]]] = None,
    number_of_vehicles: Optional[Union[str, List[str]]] = None,
    visibility=None,
    traffic_violation: Optional[Union[str, List[str]]] = None,
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
    visibility : str or list, optional
    db : sqlalchemy.orm.Session, optional
        Required only if `taluka` spatial filtering is needed.

    Returns
    -------
    sqlalchemy.orm.Query
        The modified query with applied filters.
    """
    # Always filter out records that require attention (duplicates, invalid coordinates, etc.)
    query = query.filter(Accident.requires_attention == False)

    if district:
        dist_list = district if isinstance(district, list) else [district]
        expanded_districts = expand_districts(dist_list)
        query = query.filter(Accident.district.in_(expanded_districts))
            
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
        query = apply_multi_category_filter(query, Accident.weather_condition, weather_condition)
            
    if light_condition:
        if isinstance(light_condition, list):
            query = query.filter(Accident.light_condition.in_(light_condition))
        else:
            query = query.filter(Accident.light_condition == light_condition)
            
    if visibility:
        if isinstance(visibility, list):
            query = query.filter(Accident.visibility.in_(visibility))
        else:
            query = query.filter(Accident.visibility == visibility)
            
    if collision_type:
        query = apply_multi_category_filter(query, Accident.type_of_collision, collision_type)

    if traffic_violation:
        query = apply_multi_category_filter(query, Accident.traffic_violation, traffic_violation)


    if number_of_vehicles:
        if isinstance(number_of_vehicles, list):
            query = query.filter(func.cast(Accident.number_of_vehicles, String).in_(number_of_vehicles))
        else:
            query = query.filter(func.cast(Accident.number_of_vehicles, String) == number_of_vehicles)

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
    
    try:
        if selected_years:
            # Directly evaluate based on user input parameters
            num_years = len(set(selected_years))
        else:
            if not accidents:
                return None
            # Fallback: Extract years from the dataset itself if no explicit filter was provided
            distinct_years = set()
            for a in accidents:
                if not hasattr(a, "accident_date_time"):
                    continue
                    
                val = a.accident_date_time
                if isinstance(val, datetime):
                    distinct_years.add(val.year)
                elif isinstance(val, str):
                    dt = parse_accident_datetime_from_str(val)
                    if dt:
                        distinct_years.add(dt.year)
            num_years = len(distinct_years)
    except Exception as e:
        return f"Error in validate_observation_period: {str(e)}"
    
    if num_years < MIN_ANALYSIS_YEARS:
        return (
            "Blackspot analysis requires selecting accident data from at least "
            f"{MIN_ANALYSIS_YEARS} calendar years. Please select additional years to continue."
        )
    
    return None
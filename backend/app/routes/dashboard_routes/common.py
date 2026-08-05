# backend/app/routes/dashboard_routes/common.py

"""
Common helpers and constants shared across dashboard sub-routers.
"""

from datetime import datetime
from typing import Optional

from app.core.constants import (
    TIME_PERIOD_RANGES,
    NIGHT_MORNING_CUTOFF,
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


def time_period_for_hour(hour: int) -> str:
    """Classify an hour (0-23) into its corresponding time period bucket."""
    for period, (start, end) in TIME_PERIOD_RANGES.items():
        if period == "Night":
            if hour >= start or hour < NIGHT_MORNING_CUTOFF:
                return period
        elif start <= hour < end:
            return period
    return "Night"


def format_hour_label(hour: int) -> str:
    """Format integer hour (0-23) into 12-hour string (e.g. 14 -> '2:00 PM')."""
    suffix = "AM" if hour < 12 else "PM"
    value = hour % 12 or 12
    return f"{value}:00 {suffix}"


def peak_item(counts: dict, fallback_key):
    """Return key and max value from counts dictionary or fallback if empty."""
    if not counts:
        return fallback_key, 0
    return max(counts.items(), key=lambda item: item[1])


def parse_iso_date(value: Optional[str]):
    """Parse string 'YYYY-MM-DD' into date object or None on error."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None

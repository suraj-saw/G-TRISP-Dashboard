# backend/app/utils/datetime_utils.py
"""
Datetime Utility Module

Provides shared, highly resilient datetime parsing utilities for accident data ingestion 
and API queries. 

Real-world accident datasets (often originating from Excel or CSV files) contain highly 
inconsistent date formats, non-breaking spaces, and legacy Excel serial numbers. This 
module centralizes the parsing logic to ensure every database seeder and API endpoint 
processes dates consistently, avoiding duplicated logic across files.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd

from app.core.constants import ACCIDENT_DATETIME_FORMATS


def parse_accident_datetime(value) -> Optional[datetime]:
    """
    Parse a heterogeneous datetime value from raw accident datasets into a native 
    Python datetime object.

    This function is primarily used during database seeding/ingestion where data 
    types are highly unpredictable. It handles:
    - Pandas Timestamp objects (often returned by `pd.read_excel` or `pd.read_csv`).
    - Raw integer/float values representing legacy Excel serial date numbers.
    - String representations matching known formats.
    - A generic Pandas parser fallback for unknown formats.

    Parameters
    ----------
    value : Any
        The raw date/time value extracted from the dataset.

    Returns
    -------
    datetime | None
        A valid native Python datetime object, or None if the value is missing 
        or completely unparseable.
    """
    # Fast exit for explicit nulls
    if value is None:
        return None

    # Handle native pandas Timestamps generated during data frame loading
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()

    # Handle native Python datetime objects (rare in pandas ingestion, but possible)
    if isinstance(value, datetime):
        return value

    # Handle Excel serial date numbers (e.g., 44197.5).
    # Excel calculates dates as the number of days since Dec 30, 1899.
    if isinstance(value, (int, float)):
        parsed = pd.to_datetime(value, unit="D", origin="1899-12-30", errors="coerce")
        # pd.isna checks for pandas NaT (Not a Time) which results from coerced errors
        return None if pd.isna(parsed) else parsed.to_pydatetime()

    # Fallback to string processing for everything else
    text = str(value).strip()

    # Normalize weird whitespace:
    # 1. Replace non-breaking spaces (\u00a0), which are notorious in copied Excel data.
    # 2. Split and rejoin to collapse multiple consecutive spaces into a single space.
    text = " ".join(text.replace("\u00a0", " ").split())

    # Catch empty strings or our specific null sentinel keyword
    if not text or text.lower() == "nan":
        return None

    # Attempt strict parsing against our curated list of known datetime formats
    for fmt in ACCIDENT_DATETIME_FORMATS:
        parsed = pd.to_datetime(text, format=fmt, errors="coerce")
        if not pd.isna(parsed):
            return parsed.to_pydatetime()

    # Generic fallback: allow pandas to try and infer the date format heuristically.
    # dayfirst=True ensures ambiguous dates like '10/11/2023' are read as Nov 10, not Oct 11.
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return None

    return parsed.to_pydatetime()


def parse_accident_datetime_from_str(value) -> Optional[datetime]:
    """
    Lightweight datetime parser used at query-time (e.g., in FastAPI route handlers).

    Unlike the seeder version (`parse_accident_datetime`), this function is optimized 
    for speed and avoids the heavy `pandas` dependency. It assumes data is either 
    already a Python datetime object or a string originating from an API request/ORM layer.

    Parameters
    ----------
    value : str | datetime | None
        The raw string or datetime object to be parsed.

    Returns
    -------
    datetime | None
        A valid native Python datetime object, or None if parsing fails.
    """
    if value is None:
        return None

    # If the ORM or framework already converted it, return it directly
    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None

    # Iterate through the curated formats using the standard library `strptime`
    # which is significantly faster than pandas string parsing.
    for fmt in ACCIDENT_DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            # If the format doesn't match, ValueError is thrown. 
            # We swallow the error and try the next format in the list.
            continue

    # Return None if all known formats fail to match
    return None
# backend/app/utils/datetime_utils.py
"""
Shared datetime parsing utilities for accident data ingestion.

Both seed_accidents.py and seed_surat_accidents.py previously duplicated
the same list of format strings and parsing logic.  This module centralises
that logic so every seeder stays consistent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import pandas as pd

from app.core.constants import ACCIDENT_DATETIME_FORMATS


def parse_accident_datetime(value) -> Optional[datetime]:
    """
    Parse a single datetime value from the accident dataset.

    Handles:
    - pandas Timestamp objects (returned directly)
    - Excel serial date numbers (int / float)
    - String representations in any format listed in ACCIDENT_DATETIME_FORMATS
    - A final fallback using pandas' generic parser (dayfirst=True)

    Returns None if the value cannot be parsed.
    """
    if value is None:
        return None

    # Already a Timestamp from pandas read_excel
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()

    # Native Python datetime (rare but possible)
    if isinstance(value, datetime):
        return value

    # Excel serial date number
    if isinstance(value, (int, float)):
        parsed = pd.to_datetime(value, unit="D", origin="1899-12-30", errors="coerce")
        return None if pd.isna(parsed) else parsed.to_pydatetime()

    # String handling
    text = str(value).strip()

    # Normalise non-breaking spaces and collapse runs of whitespace
    text = " ".join(text.replace("\u00a0", " ").split())

    if not text or text.lower() == "nan":
        return None

    # Try each known format
    for fmt in ACCIDENT_DATETIME_FORMATS:
        parsed = pd.to_datetime(text, format=fmt, errors="coerce")
        if not pd.isna(parsed):
            return parsed.to_pydatetime()

    # Generic fallback
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return None

    return parsed.to_pydatetime()


def parse_accident_datetime_from_str(value) -> Optional[datetime]:
    """
    Variant used at query-time (e.g. in FastAPI route handlers) when the
    value stored in the DB may still be a raw string rather than a proper
    datetime column value.

    Unlike the seeder version, this skips the Excel-serial-number path
    because values arriving from the ORM layer are already Python objects.
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None

    for fmt in ACCIDENT_DATETIME_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue

    return None
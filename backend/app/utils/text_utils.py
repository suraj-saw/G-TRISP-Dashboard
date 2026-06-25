# backend/app/utils/text_utils.py
"""
Shared text-cleaning helpers used across dashboard routes and seeders.
"""

from app.core.constants import NULL_TEXT_SENTINEL, UNKNOWN_LABEL


def safe_text(value, default: str = UNKNOWN_LABEL) -> str:
    """
    Convert NULL, empty strings, and legacy 'nan' strings to *default*.

    Parameters
    ----------
    value   : Raw value from DB or DataFrame.
    default : Replacement string (defaults to the project-wide UNKNOWN_LABEL).
    """
    if value is None:
        return default
    if isinstance(value, str):
        v = value.strip()
        if v == "" or v.lower() == NULL_TEXT_SENTINEL:
            return default
        return v
    return str(value)


def clean_text(value) -> str | None:
    """
    Return None for blank / NaN values; otherwise strip and return the string.
    Used during data ingestion / seeding.
    """
    if value is None:
        return None
    try:
        import pandas as pd  # local import — not always available
        if pd.isna(value):
            return None
    except (ImportError, TypeError, ValueError):
        pass
    s = str(value).strip()
    return None if s == "" or s.lower() == NULL_TEXT_SENTINEL else s
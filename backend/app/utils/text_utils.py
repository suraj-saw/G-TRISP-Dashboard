# backend/app/utils/text_utils.py
"""
Text Utility Module

Provides shared text-cleaning and normalization helpers used across 
dashboard routes, data ingestion pipelines, and database seeders. 
These functions ensure consistent handling of missing, empty, or 
malformed text data (like 'nan' strings) throughout the application.
"""

from app.core.constants import NULL_TEXT_SENTINEL, UNKNOWN_LABEL


def safe_text(value, default: str = UNKNOWN_LABEL) -> str:
    """
    Safely process text values by converting NULLs, empty strings, and 
    legacy string sentinels (e.g., 'nan') into a standardized default string.

    This function is primarily used when displaying data on the frontend or 
    returning API responses where a guaranteed valid string is required.

    Parameters
    ----------
    value : Any
        The raw value retrieved from the database, DataFrame, or user input.
    default : str, optional
        The fallback string to return if the input is deemed missing or invalid. 
        Defaults to the project-wide UNKNOWN_LABEL.

    Returns
    -------
    str
        The cleaned string, or the default value if the original was empty/null.
    """
    # Immediately catch Python None types
    if value is None:
        return default
        
    # Handle string inputs specifically to account for whitespace and sentinels
    if isinstance(value, str):
        v = value.strip()
        # Fall back to default if the string is empty after stripping 
        # or matches our designated null sentinel (e.g., "nan")
        if v == "" or v.lower() == NULL_TEXT_SENTINEL:
            return default
        return v
        
    # For numeric or other non-string types, cast to string safely
    return str(value)


def clean_text(value) -> str | None:
    """
    Sanitize text input during data ingestion and seeding processes.
    
    Unlike `safe_text` which returns a default string, this function returns 
    `None` for missing data, making it ideal for inserting clean NULL values 
    into a database.

    Parameters
    ----------
    value : Any
        The raw value to be cleaned.

    Returns
    -------
    str | None
        The stripped string if valid; otherwise, None if the input was 
        blank, NaN, or matched the NULL_TEXT_SENTINEL.
    """
    # Return early for strict None types
    if value is None:
        return None
        
    # Attempt to catch mathematical NaNs (e.g., numpy.nan) common in DataFrames.
    # We use a localized try-except block to gracefully handle environments 
    # where pandas might not be installed, avoiding a hard dependency crash.
    try:
        import pandas as pd  # local import — not always available
        if pd.isna(value):
            return None
    except (ImportError, TypeError, ValueError):
        # Ignore errors if pandas is missing or if the value type 
        # isn't supported by pd.isna (like certain custom objects)
        pass
        
    # Convert whatever remains to a string and strip outer whitespace
    s = str(value).strip()
    
    # Return None for empty strings or our specific null sentinel keyword
    return None if s == "" or s.lower() == NULL_TEXT_SENTINEL else s
# backend/app/schemas/surat_dashboard_schema.py
"""
Pydantic response schemas specific to the Surat dashboard API.
Extends dashboard_schema.py with Surat-specific schemas.
"""

from typing import List
from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    """Base Pydantic schema for Surat dashboard responses. Enables ORM attribute extraction."""
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Filter Options (Surat-specific: adds police_stations)
# ---------------------------------------------------------------------------

class SuratFilterOptions(ResponseModel):
    """
    Schema providing available unique values across various data dimensions for Surat-specific filters.
    Includes police station options specific to Surat district.
    """
    police_stations: List[str]
    road_classifications: List[str]
    weather_conditions: List[str]
    light_conditions: List[str]
    collision_types: List[str]


# ---------------------------------------------------------------------------
# By Police Station Summary (richer than existing PoliceStationResponse)
# ---------------------------------------------------------------------------

class PoliceStationSummaryCount(ResponseModel):
    """Schema representing aggregated metrics for a specific police station jurisdiction."""
    police_station: str
    accident_count: int
    fatalities: int
    grievous: int
    minor: int


class PoliceStationSummaryResponse(ResponseModel):
    """Schema for a collection of police station-level aggregated metrics."""
    data: List[PoliceStationSummaryCount]


# ---------------------------------------------------------------------------
# Temporal Analysis
# ---------------------------------------------------------------------------

class HourDayCount(ResponseModel):
    """Schema representing a single data point in an hour-of-day vs day-of-week heatmap."""
    hour: int
    day: str
    count: int


class HourlyAccidentCount(ResponseModel):
    """Schema representing the number of accidents per hour of the day."""
    hour: int
    count: int


class MonthlyAccidentCount(ResponseModel):
    """Schema representing the number of accidents per month, with year and human-readable label."""
    year: int
    month: int
    month_label: str
    count: int


class PeakSummary(ResponseModel):
    """Schema summarizing the peak accident time periods (hour, day, month, time-of-day bucket)."""
    peak_hour: str
    peak_hour_count: int
    peak_day: str
    peak_day_count: int
    peak_month: str
    peak_month_count: int
    peak_time_period: str
    peak_time_period_count: int
    total_accidents: int


class TemporalAnalysisResponse(ResponseModel):
    """Top-level schema for the complete temporal analysis payload."""
    hour_day: List[HourDayCount]
    hourly: List[HourlyAccidentCount]
    monthly: List[MonthlyAccidentCount]
    summary: PeakSummary

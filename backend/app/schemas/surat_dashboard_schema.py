# backend/app/schemas/surat_dashboard_schema.py
"""
Pydantic response schemas specific to the Surat dashboard API.
Extends dashboard_schema.py with Surat-specific schemas.
"""

from typing import List
from pydantic import BaseModel, ConfigDict


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Filter Options (Surat-specific: adds police_stations)
# ---------------------------------------------------------------------------

class SuratFilterOptions(ResponseModel):
    police_stations: List[str]
    road_classifications: List[str]
    weather_conditions: List[str]
    light_conditions: List[str]
    collision_types: List[str]


# ---------------------------------------------------------------------------
# By Police Station Summary (richer than existing PoliceStationResponse)
# ---------------------------------------------------------------------------

class PoliceStationSummaryCount(ResponseModel):
    police_station: str
    accident_count: int
    fatalities: int
    grievous: int
    minor: int


class PoliceStationSummaryResponse(ResponseModel):
    data: List[PoliceStationSummaryCount]


# ---------------------------------------------------------------------------
# Temporal Analysis
# ---------------------------------------------------------------------------

class HourDayCount(ResponseModel):
    hour: int
    day: str
    count: int


class HourlyAccidentCount(ResponseModel):
    hour: int
    count: int


class MonthlyAccidentCount(ResponseModel):
    year: int
    month: int
    month_label: str
    count: int


class PeakSummary(ResponseModel):
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
    hour_day: List[HourDayCount]
    hourly: List[HourlyAccidentCount]
    monthly: List[MonthlyAccidentCount]
    summary: PeakSummary

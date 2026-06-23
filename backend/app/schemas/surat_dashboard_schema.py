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

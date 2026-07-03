# backend/app/schemas/dashboard_schema.py
"""
Pydantic response schemas for the dashboard API.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

class SummaryResponse(ResponseModel):
    total_accidents: int
    total_fatalities: int
    total_grievous: int
    total_minor: int
    total_damage_only: int
    total_vehicles: int
    districts_covered: int
    police_stations: int


# ---------------------------------------------------------------------------
# By District
# ---------------------------------------------------------------------------

class DistrictCount(ResponseModel):
    district: str
    accident_count: int
    fatalities: int


class DistrictResponse(ResponseModel):
    data: List[DistrictCount]


# ---------------------------------------------------------------------------
# By Severity
# ---------------------------------------------------------------------------

class SeverityCount(ResponseModel):
    severity: str
    count: int


class SeverityResponse(ResponseModel):
    data: List[SeverityCount]


# ---------------------------------------------------------------------------
# Time Series
# ---------------------------------------------------------------------------

class TimeSeriesPoint(ResponseModel):
    year: int
    month: int
    month_label: str
    accident_count: int
    fatalities: int


class TimeSeriesResponse(ResponseModel):
    data: List[TimeSeriesPoint]


# ---------------------------------------------------------------------------
# Collision Type
# ---------------------------------------------------------------------------

class CollisionCount(ResponseModel):
    collision_type: str
    count: int


class CollisionResponse(ResponseModel):
    data: List[CollisionCount]


# ---------------------------------------------------------------------------
# Heatmap
# ---------------------------------------------------------------------------

class HeatmapPoint(ResponseModel):
    accident_id: Optional[str]
    latitude: float
    longitude: float
    severity: str
    district: str
    police_station: Optional[str] = None
    road_name: Optional[str] = None
    road_classification: Optional[str] = None
    weather_condition: Optional[str] = None
    light_condition: Optional[str] = None
    collision_type: Optional[str] = None
    accident_date_time: Optional[datetime] = None
    pedestrian_killed: Optional[int] = None
    pedestrian_grievous_injury: Optional[int] = None
    pedestrian_minor_injury: Optional[int] = None

class HeatmapResponse(ResponseModel):
    total: int
    data: List[HeatmapPoint]


# ---------------------------------------------------------------------------
# Traffic Violations
# ---------------------------------------------------------------------------

class ViolationCount(ResponseModel):
    traffic_violation: str
    count: int


class ViolationResponse(ResponseModel):
    data: List[ViolationCount]


# ---------------------------------------------------------------------------
# Road Classification
# ---------------------------------------------------------------------------

class RoadClassCount(ResponseModel):
    road_classification: str
    accident_count: int
    fatalities: int


class RoadClassResponse(ResponseModel):
    data: List[RoadClassCount]


# ---------------------------------------------------------------------------
# Weather Condition
# ---------------------------------------------------------------------------

class WeatherCount(ResponseModel):
    weather_condition: str
    count: int


class WeatherResponse(ResponseModel):
    data: List[WeatherCount]


# ---------------------------------------------------------------------------
# Light Condition
# ---------------------------------------------------------------------------

class LightCount(ResponseModel):
    light_condition: str
    count: int


class LightResponse(ResponseModel):
    data: List[LightCount]


# ---------------------------------------------------------------------------
# Police Station
# ---------------------------------------------------------------------------

class PoliceStationCount(ResponseModel):
    police_station: str
    district: str
    accident_count: int
    fatalities: int


class PoliceStationResponse(ResponseModel):
    data: List[PoliceStationCount]


# ---------------------------------------------------------------------------
# Casualty Breakdown
# ---------------------------------------------------------------------------

class CasualtyBreakdown(ResponseModel):
    category: str
    killed: int
    grievous: int
    minor: int


class CasualtyResponse(ResponseModel):
    data: List[CasualtyBreakdown]


# ---------------------------------------------------------------------------
# Top Dangerous Districts
# ---------------------------------------------------------------------------

class DangerousDistrict(ResponseModel):
    rank: int
    district: str
    fatal_accidents: int
    total_killed: int


class TopDangerousResponse(ResponseModel):
    data: List[DangerousDistrict]


# ---------------------------------------------------------------------------
# Yearly Comparison
# ---------------------------------------------------------------------------

class YearlyStats(ResponseModel):
    year: int
    total_accidents: int
    fatalities: int
    grievous: int


class YearlyResponse(ResponseModel):
    data: List[YearlyStats]


# ---------------------------------------------------------------------------
# Filter Options
# ---------------------------------------------------------------------------

class FilterOptions(ResponseModel):
    road_classifications: List[str]
    weather_conditions: List[str]
    light_conditions: List[str]
    collision_types: List[str]

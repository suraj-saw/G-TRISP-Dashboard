# backend/app/schemas/dashboard_schema.py

"""
Pydantic response schemas for the dashboard API.

These schemas define the structured JSON payloads returned to the frontend for 
rendering analytics, charts, tables, and geospatial maps based on road accident data.
"""

from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class ResponseModel(BaseModel):
    """
    Base Pydantic model for dashboard responses.
    
    Automatically configures child models to parse data directly from 
    SQLAlchemy ORM objects or dictionaries.
    """
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

class SummaryResponse(ResponseModel):
    """
    Schema for high-level aggregate dashboard metrics (e.g., KPI cards).
    
    Attributes:
        total_accidents (int): Total number of recorded accidents.
        total_fatalities (int): Total number of deaths resulting from the accidents.
        total_grievous (int): Total number of severe injuries.
        total_minor (int): Total number of minor injuries.
        total_damage_only (int): Total accidents resulting only in property damage (no casualties).
        total_vehicles (int): Total count of distinct vehicles involved.
        districts_covered (int): Number of unique districts represented in the dataset.
        police_stations (int): Number of unique police station jurisdictions involved.
    """
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
    """Schema representing aggregated metrics for a single district."""
    district: str
    accident_count: int
    fatalities: int


class DistrictResponse(ResponseModel):
    """Schema for a collection of district-level metrics (e.g., for bar charts)."""
    data: List[DistrictCount]


# ---------------------------------------------------------------------------
# By Severity
# ---------------------------------------------------------------------------

class SeverityCount(ResponseModel):
    """Schema representing the frequency of a specific accident severity level."""
    severity: str
    count: int


class SeverityResponse(ResponseModel):
    """Schema for a collection of severity metrics (e.g., for pie or donut charts)."""
    data: List[SeverityCount]


# ---------------------------------------------------------------------------
# Time Series
# ---------------------------------------------------------------------------

class TimeSeriesPoint(ResponseModel):
    """
    Schema representing a single data point in a temporal trend analysis.
    
    Attributes:
        year (int): The calendar year.
        month (int): The numeric month (1-12).
        month_label (str): Human-readable month abbreviation (e.g., 'Jan').
        accident_count (int): Number of accidents in this period.
        fatalities (int): Number of fatalities in this period.
    """
    year: int
    month: int
    month_label: str
    accident_count: int
    fatalities: int


class TimeSeriesResponse(ResponseModel):
    """Schema for chronological time-series data (e.g., for line/area charts)."""
    data: List[TimeSeriesPoint]


# ---------------------------------------------------------------------------
# Collision Type
# ---------------------------------------------------------------------------

class CollisionCount(ResponseModel):
    """Schema representing the frequency of a specific collision structural type."""
    collision_type: str
    count: int


class CollisionResponse(ResponseModel):
    """Schema for a collection of collision type metrics."""
    data: List[CollisionCount]


# ---------------------------------------------------------------------------
# Heatmap
# ---------------------------------------------------------------------------

class HeatmapPoint(ResponseModel):
    """
    Schema for individual geographical points intended for map rendering.
    
    Provides precise GPS coordinates alongside rich contextual metadata 
    for interactive map pop-ups and client-side filtering.
    """
    accident_id: Optional[str]
    latitude: float
    longitude: float
    severity: str
    district: str   
    
    # Optional metadata used for detailed map tooltips
    police_station: Optional[str] = None
    road_name: Optional[str] = None
    road_classification: Optional[str] = None
    weather_condition: Optional[str] = None
    light_condition: Optional[str] = None
    collision_type: Optional[str] = None
    accident_date_time: Optional[datetime] = None
    
    # Specific casualty metrics for point-level analysis
    pedestrian_killed: Optional[int] = None
    pedestrian_grievous_injury: Optional[int] = None
    pedestrian_minor_injury: Optional[int] = None


class HeatmapResponse(ResponseModel):
    """
    Schema for bulk geospatial point payload.
    
    Attributes:
        total (int): Total number of valid geo-points in this response.
        data (List[HeatmapPoint]): The array of geospatial points.
    """
    total: int
    data: List[HeatmapPoint]


# ---------------------------------------------------------------------------
# Traffic Violations
# ---------------------------------------------------------------------------

class ViolationCount(ResponseModel):
    """Schema representing the frequency of a specific recorded traffic violation."""
    traffic_violation: str
    count: int


class ViolationResponse(ResponseModel):
    """Schema for a collection of traffic violation metrics."""
    data: List[ViolationCount]


# ---------------------------------------------------------------------------
# Road Classification
# ---------------------------------------------------------------------------

class RoadClassCount(ResponseModel):
    """
    Schema representing aggregate metrics based on road hierarchy 
    (e.g., National Highway, State Highway).
    """
    road_classification: str
    accident_count: int
    fatalities: int


class RoadClassResponse(ResponseModel):
    """Schema for a collection of road classification metrics."""
    data: List[RoadClassCount]


# ---------------------------------------------------------------------------
# Weather Condition
# ---------------------------------------------------------------------------

class WeatherCount(ResponseModel):
    """Schema representing the frequency of accidents under specific weather conditions."""
    weather_condition: str
    count: int


class WeatherResponse(ResponseModel):
    """Schema for a collection of weather-related metrics."""
    data: List[WeatherCount]


# ---------------------------------------------------------------------------
# Light Condition
# ---------------------------------------------------------------------------

class LightCount(ResponseModel):
    """Schema representing the frequency of accidents under specific ambient lighting."""
    light_condition: str
    count: int


class LightResponse(ResponseModel):
    """Schema for a collection of light condition metrics."""
    data: List[LightCount]


# ---------------------------------------------------------------------------
# Police Station
# ---------------------------------------------------------------------------

class PoliceStationCount(ResponseModel):
    """Schema representing aggregate metrics grouped by responding police jurisdiction."""
    police_station: str
    district: str
    accident_count: int
    fatalities: int


class PoliceStationResponse(ResponseModel):
    """Schema for a collection of police station metrics (e.g., jurisdiction leaderboards)."""
    data: List[PoliceStationCount]


# ---------------------------------------------------------------------------
# Casualty Breakdown
# ---------------------------------------------------------------------------

class CasualtyBreakdown(ResponseModel):
    """
    Schema representing the injury severity distribution for a specific 
    demographic category (e.g., 'Driver', 'Passenger', 'Pedestrian').
    """
    category: str
    killed: int
    grievous: int
    minor: int


class CasualtyResponse(ResponseModel):
    """Schema for a collection of casualty demographic breakdowns."""
    data: List[CasualtyBreakdown]


# ---------------------------------------------------------------------------
# Top Dangerous Districts
# ---------------------------------------------------------------------------

class DangerousDistrict(ResponseModel):
    """
    Schema representing a district ranked by its hazard level.
    
    Attributes:
        rank (int): Calculated position based on severity volume.
        district (str): District name.
        fatal_accidents (int): Count of accidents resulting in at least one death.
        total_killed (int): Absolute count of fatalities.
    """
    rank: int
    district: str
    fatal_accidents: int
    total_killed: int


class TopDangerousResponse(ResponseModel):
    """Schema for a ranked leaderboard of the most dangerous districts."""
    data: List[DangerousDistrict]


# ---------------------------------------------------------------------------
# Yearly Comparison
# ---------------------------------------------------------------------------

class YearlyStats(ResponseModel):
    """Schema summarizing aggregate metrics across an entire calendar year."""
    year: int
    total_accidents: int
    fatalities: int
    grievous: int


class YearlyResponse(ResponseModel):
    """Schema for year-over-year comparative datasets."""
    data: List[YearlyStats]


# ---------------------------------------------------------------------------
# Filter Options
# ---------------------------------------------------------------------------

class FilterOptions(ResponseModel):
    """
    Schema providing available unique values across various data dimensions.
    Used by the frontend to dynamically populate dropdown filters for dashboard queries.
    
    Attributes:
        road_classifications (List[str]): Unique road types.
        weather_conditions (List[str]): Unique weather conditions.
        light_conditions (List[str]): Unique lighting conditions.
        collision_types (List[str]): Unique types of collisions.
        police_stations (List[str]): Unique police station names. Defaults to empty list.
        severities (List[str]): Unique severity classifications. Defaults to empty list.
        years (List[int]): Array of years present in the dataset. Defaults to empty list.
        min_date (str, optional): Earliest recorded accident date.
        max_date (str, optional): Most recent recorded accident date.
    """
    road_classifications: List[str]
    weather_conditions: List[str]
    light_conditions: List[str]
    collision_types: List[str]
    
    # Initialized as empty lists to avoid null pointer exceptions on the frontend
    police_stations: List[str] = []
    severities: List[str] = []
    years: List[int] = []
    
    min_date: Optional[str] = None
    max_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Snapped Accidents (Network Validation)
# ---------------------------------------------------------------------------

class SnappedPoint(HeatmapPoint):
    """
    Schema for a snapped accident point which includes its snapped coordinates 
    (latitude, longitude) as well as the original coordinates and snapping distance.
    """
    original_latitude: float = 0.0
    original_longitude: float = 0.0
    distance_meters: float = 0.0


class SnappedAccidentResponse(ResponseModel):
    """Schema for a collection of snapped accident points."""
    total: int
    data: List[SnappedPoint]
# backend/app/schemas/gujarat_insights_schema.py

from typing import List, Dict, Optional
from pydantic import BaseModel


class NamedCount(BaseModel):
    """
    Generic key-value schema for aggregated categorical metrics 
    (e.g., {"label": "Fatal", "count": 150}).
    """
    label: str
    count: int


class MonthlyPoint(BaseModel):
    """
    Schema representing a specific data point in a time-series line chart or trend analysis.
    """
    year: int
    month: int
    month_label: str
    count: int


class DistrictInsight(BaseModel):
    """
    Comprehensive schema detailing aggregated accident statistics for a specific geographic district.
    Used to populate analytical dashboards and district-level reports.
    """
    district: str
    total_accidents: int
    fatal_accidents: int
    fatalities: int
    grievous_injuries: int
    minor_injuries: int
    fatality_rate: float
    police_stations: int
    most_affected_police_station: str
    highest_accident_month: str
    peak_accident_time: str
    blackspots_count: int
    risk_level: str
    
    # Categorical breakdowns for visualization
    severity: List[NamedCount]
    monthly_trend: List[MonthlyPoint]
    time_of_day: List[NamedCount]
    weekday: List[NamedCount]
    road_type: List[NamedCount]
    collision_type: List[NamedCount]


class GujaratWideSummary(BaseModel):
    """
    Schema for high-level, state-wide aggregated accident statistics.
    Provides macro-level metrics across all covered districts.
    """
    total_accidents: int
    total_fatalities: int
    total_grievous: int
    total_minor: int
    districts_covered: int
    police_stations: int
    severity: List[NamedCount]
    dangerous: List[Dict]


class DistrictInsightsResponse(BaseModel):
    """
    Top-level API response schema serving the complete analytics dashboard payload.
    Contains both the macro state-summary and granular district-level mappings.
    """
    gujarat: GujaratWideSummary
    districts: Dict[str, DistrictInsight]
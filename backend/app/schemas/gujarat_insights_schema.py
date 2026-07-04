# backend/app/schemas/gujarat_insights_schema.py
from typing import List, Dict, Optional
from pydantic import BaseModel


class NamedCount(BaseModel):
    label: str
    count: int


class MonthlyPoint(BaseModel):
    year: int
    month: int
    month_label: str
    count: int


class DistrictInsight(BaseModel):
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
    severity: List[NamedCount]
    monthly_trend: List[MonthlyPoint]
    time_of_day: List[NamedCount]
    weekday: List[NamedCount]
    road_type: List[NamedCount]
    collision_type: List[NamedCount]


class GujaratWideSummary(BaseModel):
    total_accidents: int
    total_fatalities: int
    total_grievous: int
    total_minor: int
    districts_covered: int
    police_stations: int
    severity: List[NamedCount]
    dangerous: List[Dict]


class DistrictInsightsResponse(BaseModel):
    gujarat: GujaratWideSummary
    districts: Dict[str, DistrictInsight]
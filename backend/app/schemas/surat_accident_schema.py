# backend/app/schemas/surat_accident_schema.py
"""
Pydantic schema for creating a new Surat accident record via the admin API.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SuratAccidentCreate(BaseModel):
    # Identification
    accident_id: Optional[str] = None
    district: Optional[str] = "Surat"
    police_station: Optional[str] = None

    # Date & Time
    accident_date_time: Optional[datetime] = None

    # Location
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    road_name: Optional[str] = None
    road_classification: Optional[str] = None

    # Severity & vehicles
    severity: Optional[str] = None
    number_of_vehicles: Optional[int] = 0

    # Driver casualties
    driver_killed: Optional[int] = 0
    driver_grievous_injury: Optional[int] = 0
    driver_minor_injury: Optional[int] = 0

    # Passenger casualties
    passenger_killed: Optional[int] = 0
    passenger_grievous_injury: Optional[int] = 0
    passenger_minor_injury: Optional[int] = 0

    # Pedestrian casualties
    pedestrian_killed: Optional[int] = 0
    pedestrian_grievous_injury: Optional[int] = 0
    pedestrian_minor_injury: Optional[int] = 0

    # Collision
    type_of_collision: Optional[str] = None
    collision_feature: Optional[str] = None

    # Environmental
    weather_condition: Optional[str] = None
    light_condition: Optional[str] = None
    visibility: Optional[str] = None

    # Violation
    traffic_violation: Optional[str] = None


class SuratAccidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    accident_id: Optional[str] = None
    district: Optional[str] = None
    police_station: Optional[str] = None
    accident_date_time: Optional[datetime] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    road_name: Optional[str] = None
    road_classification: Optional[str] = None
    severity: Optional[str] = None
    number_of_vehicles: Optional[int] = None
    driver_killed: Optional[int] = None
    driver_grievous_injury: Optional[int] = None
    driver_minor_injury: Optional[int] = None
    passenger_killed: Optional[int] = None
    passenger_grievous_injury: Optional[int] = None
    passenger_minor_injury: Optional[int] = None
    pedestrian_killed: Optional[int] = None
    pedestrian_grievous_injury: Optional[int] = None
    pedestrian_minor_injury: Optional[int] = None
    type_of_collision: Optional[str] = None
    collision_feature: Optional[str] = None
    weather_condition: Optional[str] = None
    light_condition: Optional[str] = None
    visibility: Optional[str] = None
    traffic_violation: Optional[str] = None
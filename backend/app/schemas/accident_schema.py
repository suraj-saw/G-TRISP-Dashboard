# backend/app/schemas/accident_schema.py
"""
Pydantic schemas for the Accident model.
Field names are aligned with iRAD terminology.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class AccidentBase(BaseModel):
    accident_id:    Optional[str] = None
    district:       Optional[str] = None
    police_station: Optional[str] = None

    # iRAD: Accident Date & Time
    accident_date_time: Optional[datetime] = None

    latitude:  Optional[float] = None
    longitude: Optional[float] = None

    road_name:           Optional[str] = None
    road_classification: Optional[str] = None
    severity:            Optional[str] = None

    # iRAD: Number of Vehicle(s) associated with the accident
    number_of_vehicles: Optional[int] = None

    # iRAD: Driver casualties
    driver_killed:          Optional[int] = None
    driver_grievous_injury: Optional[int] = None
    driver_minor_injury:    Optional[int] = None

    # iRAD: Passenger casualties
    passenger_killed:          Optional[int] = None
    passenger_grievous_injury: Optional[int] = None
    passenger_minor_injury:    Optional[int] = None

    # iRAD: Pedestrian casualties
    pedestrian_killed:          Optional[int] = None
    pedestrian_grievous_injury: Optional[int] = None
    pedestrian_minor_injury:    Optional[int] = None

    # iRAD: Type of Collision
    type_of_collision: Optional[str] = None
    collision_feature: Optional[str] = None

    weather_condition: Optional[str] = None
    light_condition:   Optional[str] = None
    visibility:        Optional[str] = None
    traffic_violation: Optional[str] = None


class AccidentResponse(AccidentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class AccidentListResponse(BaseModel):
    """Paginated accident list."""
    total: int
    items: list[AccidentResponse]
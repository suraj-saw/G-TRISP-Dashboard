# backend/app/schemas/gujarat_accident_schema.py

"""
Pydantic schemas for the Accident model.
Field names are aligned with iRAD terminology.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class GujaratAccidentBase(BaseModel):
    """
    Base schema for road accident records.

    Mirrors the SQLAlchemy Accident model and adheres to iRAD (Integrated Road 
    Accident Database) standard terminology. All fields are optional to support 
    partial updates and flexible data ingestion pipelines.
    """
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

    # ── Casualties Breakdown ──────────────────────────────────────────────────
    
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

    # ── Environmental & Contextual Data ───────────────────────────────────────
    
    # iRAD: Type of Collision
    type_of_collision: Optional[str] = None
    collision_feature: Optional[str] = None

    weather_condition: Optional[str] = None
    light_condition:   Optional[str] = None
    visibility:        Optional[str] = None
    traffic_violation: Optional[str] = None


class GujaratAccidentCreate(GujaratAccidentBase):
    """
    Schema for validating new accident record creation payloads.
    Inherits all fields from GujaratAccidentBase.
    """
    pass


class GujaratAccidentResponse(GujaratAccidentBase):
    """
    Schema for serializing SQLAlchemy Accident model instances into JSON responses.
    Appends the database-generated primary key ID to the base schema.
    """
    # Enables Pydantic to read data directly from SQLAlchemy ORM object attributes
    model_config = ConfigDict(from_attributes=True)

    id: int


class GujaratAccidentListResponse(BaseModel):
    """
    Paginated response schema for accident record collections.
    
    Attributes:
        total (int): The total number of records matching the query (ignoring pagination limits).
        items (list[GujaratAccidentResponse]): The specific slice of records for the current page.
    """
    total: int
    items: list[GujaratAccidentResponse]
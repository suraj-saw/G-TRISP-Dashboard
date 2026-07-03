# backend/app/models/accident.py
"""
Accident record model — field names aligned with iRAD
(Integrated Road Accident Database) terminology.

Key renames from previous version:
  accident_datetime          → accident_date_time
  no_of_vehicles             → number_of_vehicles
  drivers_killed             → driver_killed
  drivers_grievous_injury    → driver_grievous_injury
  drivers_minor_injury       → driver_minor_injury
  passengers_killed          → passenger_killed
  passengers_grievous_injury → passenger_grievous_injury
  passengers_minor_injury    → passenger_minor_injury
  pedestrians_killed         → pedestrian_killed
  pedestrians_grievous_injury→ pedestrian_grievous_injury
  pedestrians_minor_injury   → pedestrian_minor_injury
  collision_type             → type_of_collision
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Index, UniqueConstraint
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class Accident(Base):
    __tablename__ = "accidents"
    __table_args__ = (
        UniqueConstraint('accident_id', 'district', name='uq_accident_district'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # ── Identification ────────────────────────────────────────────────────────
    accident_id    = Column(String, nullable=True, index=True)
    district       = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)

    # ── Date & Time (iRAD: "Accident Date & Time") ────────────────────────────
    accident_date_time = Column(DateTime, nullable=True, index=True)

    # ── Location ──────────────────────────────────────────────────────────────
    latitude  = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location  = Column(
        Geometry(geometry_type="POINT", srid=POSTGIS_SRID, spatial_index=True),
        nullable=True,
    )
    road_name           = Column(String, nullable=True)
    road_classification = Column(String, nullable=True)

    # ── Accident Characteristics ──────────────────────────────────────────────
    severity           = Column(String, nullable=True)

    # iRAD: "Number of Vehicle(s) associated with the accident"
    number_of_vehicles = Column(Integer, nullable=True)

    # ── Driver casualties (iRAD: "Number of Driver(s) impacted") ─────────────
    driver_killed          = Column(Integer, nullable=True)
    driver_grievous_injury = Column(Integer, nullable=True)
    driver_minor_injury    = Column(Integer, nullable=True)

    # ── Passenger casualties (iRAD: "Number of Passenger(s) impacted") ───────
    passenger_killed          = Column(Integer, nullable=True)
    passenger_grievous_injury = Column(Integer, nullable=True)
    passenger_minor_injury    = Column(Integer, nullable=True)

    # ── Pedestrian casualties (iRAD: "Number of Pedestrian(s) impacted") ─────
    pedestrian_killed          = Column(Integer, nullable=True)
    pedestrian_grievous_injury = Column(Integer, nullable=True)
    pedestrian_minor_injury    = Column(Integer, nullable=True)

    # ── Collision details ─────────────────────────────────────────────────────
    # iRAD: "Type of Collision"
    type_of_collision = Column(String, nullable=True)
    collision_feature = Column(String, nullable=True)

    # ── Environmental conditions ──────────────────────────────────────────────
    weather_condition = Column(String, nullable=True)
    light_condition   = Column(String, nullable=True)
    visibility        = Column(String, nullable=True)

    # ── Violation ─────────────────────────────────────────────────────────────
    traffic_violation = Column(String, nullable=True)


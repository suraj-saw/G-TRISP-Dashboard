# backend/app/models/surat_accident.py
"""
Accident record model specifically for the Surat City dataset.
Field names align with the standard database structure.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class SuratAccident(Base):
    __tablename__ = "surat_city"

    id = Column(Integer, primary_key=True, index=True)

    # ── Identification ────────────────────────────────────────────────────────
    accident_id    = Column(String, unique=True, nullable=True, index=True)
    district       = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)

    # ── Date & Time ───────────────────────────────────────────────────────────
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
    number_of_vehicles = Column(Integer, nullable=True, default=0)

    # ── Driver casualties ─────────────────────────────────────────────────────
    driver_killed          = Column(Integer, nullable=True, default=0)
    driver_grievous_injury = Column(Integer, nullable=True, default=0)
    driver_minor_injury    = Column(Integer, nullable=True, default=0)

    # ── Passenger casualties ──────────────────────────────────────────────────
    passenger_killed          = Column(Integer, nullable=True, default=0)
    passenger_grievous_injury = Column(Integer, nullable=True, default=0)
    passenger_minor_injury    = Column(Integer, nullable=True, default=0)

    # ── Pedestrian casualties ─────────────────────────────────────────────────
    pedestrian_killed          = Column(Integer, nullable=True, default=0)
    pedestrian_grievous_injury = Column(Integer, nullable=True, default=0)
    pedestrian_minor_injury    = Column(Integer, nullable=True, default=0)

    # ── Collision details ─────────────────────────────────────────────────────
    type_of_collision = Column(String, nullable=True)
    collision_feature = Column(String, nullable=True)

    # ── Environmental conditions ──────────────────────────────────────────────
    weather_condition = Column(String, nullable=True)
    light_condition   = Column(String, nullable=True)
    visibility        = Column(String, nullable=True)

    # ── Violation ─────────────────────────────────────────────────────────────
    traffic_violation = Column(String, nullable=True)
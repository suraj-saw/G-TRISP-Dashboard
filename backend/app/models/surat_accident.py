# backend/app/models/surat_accident.py
"""
Accident record model specifically for the Surat City dataset.
Field names align with the standard database structure.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, UniqueConstraint
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class SuratAccident(Base):
    """
    SQLAlchemy model representing an individual road accident record specific to Surat City.

    This model maintains structural parity with the Accident model but operates on a
    separate table (`surat_city`) to isolate Surat-specific datasets from statewide records.
    It includes default values for casualty and vehicle counts to simplify partial updates
    and incremental data ingestion.

    Attributes:
        id (int): Primary key identifier for the internal database record.
        accident_id (str, optional): The unique identifier issued by the reporting authority.
        district (str, optional): The administrative district name (typically "Surat").
        police_station (str, optional): Jurisdiction name of the responding police station.
        accident_date_time (datetime, optional): The timestamp when the accident took place.
        latitude (float, optional): The WGS84 latitude coordinate.
        longitude (float, optional): The WGS84 longitude coordinate.
        location (geoalchemy2.elements.WKBElement, optional): PostGIS spatial Point representation 
            derived from coordinates, used for spatial cross-referencing and validation.
        road_name (str, optional): The name of the road or street.
        road_classification (str, optional): Category of the road (e.g., NH, SH, Major District Road).
        severity (str, optional): Qualitative classification of the accident impact (e.g., Fatal, Grievous).
        number_of_vehicles (int, optional): Total count of distinct vehicles involved in the collision (default: 0).
        driver_killed (int, optional): Count of fatalities among drivers (default: 0).
        driver_grievous_injury (int, optional): Count of drivers who sustained severe/critical injuries (default: 0).
        driver_minor_injury (int, optional): Count of drivers who sustained minor/superficial injuries (default: 0).
        passenger_killed (int, optional): Count of fatalities among passengers (default: 0).
        passenger_grievous_injury (int, optional): Count of passengers who sustained severe/critical injuries (default: 0).
        passenger_minor_injury (int, optional): Count of passengers who sustained minor/superficial injuries (default: 0).
        pedestrian_killed (int, optional): Count of fatalities among pedestrians (default: 0).
        pedestrian_grievous_injury (int, optional): Count of pedestrians who sustained severe/critical injuries (default: 0).
        pedestrian_minor_injury (int, optional): Count of pedestrians who sustained minor/superficial injuries (default: 0).
        type_of_collision (str, optional): Structural description of how the impact occurred (e.g., Head-on).
        collision_feature (str, optional): Infrastructure features impacting the collision (e.g., Junction, Bridge).
        weather_condition (str, optional): Atmospheric condition at the time of the incident (e.g., Rainy, Clear).
        light_condition (str, optional): Ambient lighting state during the incident (e.g., Daylight, Poorly Lit).
        visibility (str, optional): Status of driving line-of-sight visual distance.
        traffic_violation (str, optional): The primary category of law infringement observed (e.g., Speeding).
    """
    __tablename__ = "surat_city"
    __table_args__ = (
        UniqueConstraint('accident_id', 'district', name='uq_surat_accident_district'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # ── Identification ────────────────────────────────────────────────────────
    # Core reference indexing fields for rapid query operations
    accident_id    = Column(String, nullable=True, index=True)
    district       = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)

    # ── Date & Time ───────────────────────────────────────────────────────────
    accident_date_time = Column(DateTime, nullable=True, index=True)

    # ── Location ──────────────────────────────────────────────────────────────
    latitude  = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # PostGIS Point geometry using the system-configured Spatial Reference System Identifier (SRID)
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
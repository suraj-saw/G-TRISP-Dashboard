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
    """
    SQLAlchemy model representing an individual road accident record.

    This model is structurally aligned with the Integrated Road Accident Database 
    (iRAD) schema terminology to ensure regulatory compliance and standard data 
    interoperability. It captures core incident identifiers, temporal data, 
    multilayered casualty metrics, geospatial positioning, and environmental conditions.

    Attributes:
        id (int): Primary key identifier for the internal database record.
        accident_id (str, optional): The unique identifier issued by the reporting authority / iRAD.
        district (str, optional): The administrative district name where the incident occurred.
        police_station (str, optional): Jurisdiction name of the responding police station.
        accident_date_time (datetime, optional): The timestamp when the accident took place.
        latitude (float, optional): The WGS84 latitude coordinate.
        longitude (float, optional): The WGS84 longitude coordinate.
        location (geoalchemy2.elements.WKBElement, optional): PostGIS spatial Point representation 
            derived from coordinates, used for spatial cross-referencing and validation.
        road_name (str, optional): The name of the road or street.
        road_classification (str, optional): Category of the road (e.g., NH, SH, Major District Road).
        severity (str, optional): Qualitative classification of the accident impact (e.g., Fatal, Grievous).
        number_of_vehicles (int, optional): Total count of distinct vehicles involved in the collision.
        driver_killed (int, optional): Count of fatalities among drivers.
        driver_grievous_injury (int, optional): Count of drivers who sustained severe/critical injuries.
        driver_minor_injury (int, optional): Count of drivers who sustained minor/superficial injuries.
        passenger_killed (int, optional): Count of fatalities among passengers.
        passenger_grievous_injury (int, optional): Count of passengers who sustained severe/critical injuries.
        passenger_minor_injury (int, optional): Count of passengers who sustained minor/superficial injuries.
        pedestrian_killed (int, optional): Count of fatalities among pedestrians.
        pedestrian_grievous_injury (int, optional): Count of pedestrians who sustained severe/critical injuries.
        pedestrian_minor_injury (int, optional): Count of pedestrians who sustained minor/superficial injuries.
        type_of_collision (str, optional): Structural description of how the impact occurred (e.g., Head-on).
        collision_feature (str, optional): Infrastructure features impacting the collision (e.g., Junction, Bridge).
        weather_condition (str, optional): Atmospheric condition at the time of the incident (e.g., Rainy, Clear).
        light_condition (str, optional): Ambient lighting state during the incident (e.g., Daylight, Poorly Lit).
        visibility (str, optional): Status of driving line-of-sight visual distance.
        traffic_violation (str, optional): The primary category of law infringement observed (e.g., Speeding).
    """
    __tablename__ = "accidents"
    
    # Composite unique constraint enforcing that an accident identifier is unique within a specific district boundary
    __table_args__ = (
        UniqueConstraint('accident_id', 'district', name='uq_accident_district'),
    )

    id = Column(Integer, primary_key=True, index=True)

    # ── Identification ────────────────────────────────────────────────────────
    # Core reference indexing fields for rapid query operations
    accident_id    = Column(String, nullable=True, index=True)
    district       = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)

    # ── Date & Time (iRAD: "Accident Date & Time") ────────────────────────────
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
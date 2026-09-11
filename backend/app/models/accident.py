# backend/app/models/accident.py
"""
Accident record model — field names aligned with iRAD
(Integrated Road Accident Database) terminology.
"""

# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, UniqueConstraint, Index
# pyrefly: ignore [missing-import]
from sqlalchemy.dialects.postgresql import ARRAY
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import declarative_mixin
# pyrefly: ignore [missing-import]
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID

@declarative_mixin
class AccidentMixin:
    """
    Shared columns for Accident and AccidentBackup tables.
    """
    # ── Identification ────────────────────────────────────────────────────────
    accident_id    = Column(String, nullable=True, index=True)
    district       = Column(String, nullable=True, index=True)
    police_station = Column(String, nullable=True)

    # ── Validation ────────────────────────────────────────────────────────────
    # Flag to mark records with invalid or missing geometries (e.g. outside Gujarat)
    is_valid_coordinates = Column(Boolean, default=True, nullable=False, index=True)
    # Flag for duplicate accident_id
    is_duplicate = Column(Boolean, default=False, nullable=False, index=True)
    # Master flag: if True, hide from visualizations and flag in admin panel
    requires_attention = Column(Boolean, default=False, nullable=False, index=True)
    # Comma-separated list of reasons for requiring attention
    invalidation_reasons = Column(String, nullable=True)

    # ── Date & Time (iRAD: "Accident Date & Time") ────────────────────────────
    accident_date_time = Column(DateTime, nullable=True, index=True)

    # ── Location ──────────────────────────────────────────────────────────────
    latitude  = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    location  = Column(
        Geometry(geometry_type="POINT", srid=POSTGIS_SRID, spatial_index=True),
        nullable=True,
    )
    accident_location   = Column(String, nullable=True)
    landmark_name       = Column(String, nullable=True)
    road_name           = Column(String, nullable=True)
    road_classification = Column(String, nullable=True)

    # ── Accident Characteristics ──────────────────────────────────────────────
    severity           = Column(String, nullable=True)
    number_of_vehicles = Column(Integer, nullable=True)

    # ── Driver casualties ─────────────────────────────────────────────────────
    driver_killed          = Column(Integer, nullable=True)
    driver_grievous_injury = Column(Integer, nullable=True)
    driver_minor_injury    = Column(Integer, nullable=True)
    driver_no_injury       = Column(Integer, nullable=True)

    # ── Passenger casualties ──────────────────────────────────────────────────
    passenger_killed          = Column(Integer, nullable=True)
    passenger_grievous_injury = Column(Integer, nullable=True)
    passenger_minor_injury    = Column(Integer, nullable=True)
    passenger_no_injury       = Column(Integer, nullable=True)

    # ── Pedestrian casualties ─────────────────────────────────────────────────
    pedestrian_killed          = Column(Integer, nullable=True)
    pedestrian_grievous_injury = Column(Integer, nullable=True)
    pedestrian_minor_injury    = Column(Integer, nullable=True)
    pedestrian_no_injury       = Column(Integer, nullable=True)

    # ── Miscellaneous ─────────────────────────────────────────────────────────
    type_of_collision = Column(ARRAY(Text), nullable=True)
    collision_feature = Column(ARRAY(Text), nullable=True)
    weather_condition = Column(ARRAY(Text), nullable=True)
    light_condition   = Column(String, nullable=True)
    visibility        = Column(String, nullable=True)
    traffic_violation = Column(ARRAY(Text), nullable=True)
    accident_description = Column(String, nullable=True)


class Accident(AccidentMixin, Base):
    """
    SQLAlchemy model representing an individual road accident record.
    """
    __tablename__ = "accidents"
    __table_args__ = (
        Index("idx_accidents_type_of_collision_gin", "type_of_collision", postgresql_using="gin"),
        Index("idx_accidents_collision_feature_gin", "collision_feature", postgresql_using="gin"),
        Index("idx_accidents_weather_condition_gin", "weather_condition", postgresql_using="gin"),
        Index("idx_accidents_traffic_violation_gin", "traffic_violation", postgresql_using="gin"),
    )
    
    id = Column(Integer, primary_key=True, index=True)


class AccidentBackup(AccidentMixin, Base):
    """
    Backup table structure for accident records.
    """
    __tablename__ = "accidents_backup"
    __table_args__ = (
        Index("idx_accidents_backup_type_of_collision_gin", "type_of_collision", postgresql_using="gin"),
        Index("idx_accidents_backup_collision_feature_gin", "collision_feature", postgresql_using="gin"),
        Index("idx_accidents_backup_weather_condition_gin", "weather_condition", postgresql_using="gin"),
        Index("idx_accidents_backup_traffic_violation_gin", "traffic_violation", postgresql_using="gin"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
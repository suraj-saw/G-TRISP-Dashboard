"""
Model for preprocessed snapped accident locations.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID

class SnappedAccident(Base):
    """
    SQLAlchemy model representing an accident snapped to the nearest road network.
    
    This is a preprocessed table mapping original accidents to their nearest valid road
    segments to facilitate network-based spatial analysis and visualization,
    without slowing down on-the-fly dashboard queries.
    """
    __tablename__ = "snapped_accidents"

    id = Column(Integer, primary_key=True, index=True)
    
    # Foreign key references
    accident_id = Column(Integer, ForeignKey("accidents.id", ondelete="CASCADE"), nullable=False, index=True)
    road_id = Column(Integer, ForeignKey("gujarat_roads.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Precomputed geometries and metrics
    original_location = Column(
        Geometry(geometry_type="POINT", srid=POSTGIS_SRID),
        nullable=False
    )
    snapped_location = Column(
        Geometry(geometry_type="POINT", srid=POSTGIS_SRID, spatial_index=True),
        nullable=False
    )
    distance_meters = Column(Float, nullable=False)

    __table_args__ = (
        Index("ix_snapped_accidents_locations", "original_location", "snapped_location"),
    )

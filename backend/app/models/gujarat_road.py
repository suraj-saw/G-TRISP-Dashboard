"""Gujarat road linework stored for future spatial/network analysis."""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Index
from sqlalchemy.dialects.postgresql import JSONB
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratRoad(Base):
    __tablename__ = "gujarat_roads"

    id = Column(Integer, primary_key=True, index=True)

    # Stable identifier derived from source GeoJSON properties (or a fallback).
    road_source_id = Column(String, nullable=False, index=True)

    # Common/tolerant attributes (best-effort extraction from properties)
    road_name = Column(String, nullable=True, index=True)
    road_classification = Column(String, nullable=True, index=True)
    road_type = Column(String, nullable=True, index=True)

    # Extra/un-modeled properties from the feature.
    properties = Column(JSONB, nullable=True, default=None)




    # Geometry: stored as LINESTRING per the requirement.
    geometry = Column(
        Geometry(
            geometry_type="LINESTRING",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_gujarat_roads_name_class",
            "road_name",
            "road_classification",
        ),
    )


# backend/app/models/gujarat_boundary.py
"""
Stores the official Gujarat state boundary (ADM1) as a single row.
Used for point-in-state validation before accepting accident records.
"""

from sqlalchemy import Column, Integer, String, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratBoundary(Base):
    __tablename__ = "gujarat_boundary"

    id = Column(Integer, primary_key=True, index=True)

    # Human-readable label from the GeoJSON properties
    shape_name = Column(String, nullable=False, default="Gujarāt")
    shape_iso  = Column(String, nullable=True)   # "IN-GJ"
    shape_id   = Column(String, nullable=True)   # GADM / GEOBOUNDARIES id
    shape_group = Column(String, nullable=True)  # "IND"
    shape_type  = Column(String, nullable=True)  # "ADM1"

    # The full MultiPolygon for Gujarat (may contain island polygons)
    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )


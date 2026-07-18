# backend/app/models/gujarat_boundary.py
"""
Stores the official Gujarat state boundary (SOI) as a single row.
Used for point-in-state validation before accepting accident records.
"""

from sqlalchemy import Column, Integer, String, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratBoundary(Base):
    """
    SQLAlchemy model representing the geographic boundary of Gujarat state (SOI).

    This model stores the highest-level administrative boundary for spatial 
    validation, ensuring that any coordinate data submitted to the system 
    falls within the state limits.

    Attributes:
        id (int): Primary key and indexed identifier for the boundary record.
        shape_name (str): Human-readable label from the GeoJSON properties. Defaults to "Gujarāt".
        shape_iso (str, optional): ISO 3166-2 code for the state (e.g., "IN-GJ").
        shape_id (str, optional): Unique identifier from source systems (e.g., GADM / GEOBOUNDARIES).
        shape_group (str, optional): Country group code (e.g., "IND").
        shape_type (str, optional): Administrative level designation .
        geometry (geoalchemy2.elements.WKBElement): PostGIS MultiPolygon geometry data 
            with a defined SRID and spatial indexing enabled.
    """
    __tablename__ = "gujarat_boundary"

    id = Column(Integer, primary_key=True, index=True)

    # ── Source Metadata & Identification ──────────────────────────────────────
    # Human-readable label from the GeoJSON properties
    shape_name = Column(String, nullable=False, default="Gujarāt")
    shape_iso  = Column(String, nullable=True)   # "IN-GJ"
    shape_id   = Column(String, nullable=True)   # GADM / GEOBOUNDARIES id
    shape_group = Column(String, nullable=True)  # "IND"
    shape_type  = Column(String, nullable=True)  

    # ── Spatial Data ──────────────────────────────────────────────────────────
    # The full MultiPolygon for Gujarat (may contain island polygons and complex borders)
    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )
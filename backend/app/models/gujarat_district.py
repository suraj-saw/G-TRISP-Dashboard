# backend/app/models/gujarat_district.py

"""
Stores the 33 official Gujarat districts (SOI) with their polygon geometry.
Used for:
  - PostGIS-based spatial joins (which district does an accident belong to?)
  - Front-end district choropleth maps
  - Validation pipeline (point must lie inside one of these districts)
"""

from sqlalchemy import Column, Integer, String, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratDistrict(Base):
    """
    SQLAlchemy model representing the 33 districts of Gujarat (SOI).

    This model is crucial for spatial aggregation and validation. It allows 
    the system to accurately map a given GPS coordinate to its respective 
    district and serves as the data layer for frontend mapping components.

    Attributes:
        id (int): Primary key and indexed identifier for the district record.
        shape_name (str): Official district name. Indexed for quick lookups.
        shape_iso (str, optional): ISO identifier for the district.
        shape_id (str, optional): Unique identifier from source systems (e.g., GADM).
        shape_group (str, optional): Country group code (e.g., "IND").
        shape_type (str, optional): Administrative level designation.
        geometry (geoalchemy2.elements.WKBElement): PostGIS Geometry data supporting 
            both Polygon and MultiPolygon types, with spatial indexing enabled.
    """
    __tablename__ = "gujarat_districts"

    id = Column(Integer, primary_key=True, index=True)

    # ── Source Metadata & Identification ──────────────────────────────────────
    # Official district name from GeoBoundaries / GADM (e.g., "Ahmadabad")
    shape_name  = Column(String, nullable=False, index=True)
    shape_iso   = Column(String, nullable=True)
    shape_id    = Column(String, nullable=True)   # unique GADM id
    shape_group = Column(String, nullable=True)   # "IND"
    shape_type  = Column(String, nullable=True)   

    # ── Spatial Data ──────────────────────────────────────────────────────────
    # The geometry for this district. Uses "GEOMETRY" instead of a specific 
    # polygon type to safely accommodate both Polygon and MultiPolygon inputs.
    geometry = Column(
        Geometry(
            geometry_type="GEOMETRY",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )
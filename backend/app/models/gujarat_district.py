# backend/app/models/gujarat_district.py
"""
Stores the 33 official Gujarat districts (ADM2) with their polygon geometry.
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
    __tablename__ = "gujarat_districts"

    id = Column(Integer, primary_key=True, index=True)

    # Official district name from GeoBoundaries / GADM (e.g. "Ahmadabad")
    shape_name  = Column(String, nullable=False, index=True)
    shape_iso   = Column(String, nullable=True)
    shape_id    = Column(String, nullable=True)   # unique GADM id
    shape_group = Column(String, nullable=True)   # "IND"
    shape_type  = Column(String, nullable=True)   # "ADM2"

    # The Polygon geometry for this district
    geometry = Column(
        Geometry(
            geometry_type="GEOMETRY",   # Polygon or MultiPolygon depending on source
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )


# Explicit GIST spatial index
Index(
    "idx_gujarat_districts_geometry",
    GujaratDistrict.geometry,
    postgresql_using="gist",
)
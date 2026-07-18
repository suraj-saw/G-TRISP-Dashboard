# backend/app/models/surat_boundary.py
"""
Stores the official Surat district boundary as a single row.
Used for Surat-specific spatial queries and maps.
"""

from sqlalchemy import Column, Integer, String
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class SuratBoundary(Base):
    """
    SQLAlchemy model representing the geographic boundary of Surat district.

    This model stores the second-level administrative boundary for Surat-specific
    spatial validation and mapping components, mirroring the structure of
    GujaratDistrict and GujaratBoundary for consistent patterns.

    Attributes:
        id (int): Primary key and indexed identifier for the boundary record.
        shape_name (str): Human-readable label for the boundary, defaults to "Surat".
        shape_iso (str, optional): ISO 3166-2 code for the district (e.g., "IN-GJ-Surat").
        shape_id (str, optional): Unique identifier from source systems (e.g., GADM / GEOBOUNDARIES).
        shape_group (str, optional): Country group code (e.g., "IND").
        shape_type (str, optional): Administrative level designation (e.g., "ADM2").
        geometry (geoalchemy2.elements.WKBElement): PostGIS Geometry data supporting both
            Polygon and MultiPolygon types, with spatial indexing enabled.
    """
    __tablename__ = "surat_boundary"

    id = Column(Integer, primary_key=True, index=True)

    # ── Source Metadata & Identification ──────────────────────────────────────
    shape_name  = Column(String, nullable=False, default="Surat")
    shape_iso   = Column(String, nullable=True)
    shape_id    = Column(String, nullable=True)   # unique identifier from source data
    shape_group = Column(String, nullable=True)   # "IND" (country group)
    shape_type  = Column(String, nullable=True)   # "ADM2" (administrative level 2)

    # ── Spatial Data ──────────────────────────────────────────────────────────
    # Uses "GEOMETRY" type to safely accommodate both Polygon and MultiPolygon inputs
    geometry = Column(
        Geometry(
            geometry_type="GEOMETRY",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )
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
    __tablename__ = "surat_boundary"

    id = Column(Integer, primary_key=True, index=True)

    shape_name  = Column(String, nullable=False, default="Surat")
    shape_iso   = Column(String, nullable=True)
    shape_id    = Column(String, nullable=True)   # unique identifier
    shape_group = Column(String, nullable=True)   # "IND"
    shape_type  = Column(String, nullable=True)   # "ADM2"

    # The boundary polygon geometry
    geometry = Column(
        Geometry(
            geometry_type="GEOMETRY",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )
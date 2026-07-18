# backend/app/models/gujarat_taluka.py

"""
Stores Gujarat Taluka (Subdistrict) boundaries — the administrative level
directly beneath District:

    State (Gujarat) → District → Taluka

Mirrors GujaratDistrict's structure so the same spatial-query, seeding and
API patterns extend cleanly to this (and any future) admin level.
"""

from sqlalchemy import Column, Integer, String, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratTaluka(Base):
    """
    SQLAlchemy model representing Gujarat Talukas (Subdistricts).

    Maintains the hierarchical geographic relationship by denormalizing 
    district and state data directly into the table. This allows for rapid 
    filtering, lookups, and hierarchical spatial queries without requiring 
    expensive relational joins.

    Attributes:
        id (int): Primary key and indexed identifier for the taluka record.
        taluka_name (str): Name of the taluka. Indexed for queries.
        taluka_lgd_code (str, optional): Local Government Directory (LGD) code for the taluka.
        district_name (str): Name of the parent district. Indexed for filtering.
        district_lgd_code (str, optional): LGD code for the parent district.
        state_name (str): Name of the parent state. Defaults to "Gujarat".
        state_lgd_code (str, optional): LGD code for the parent state.
        shape_iso (str, optional): ISO code representing the shape context (e.g., "IN-GJ").
        shape_group (str, optional): Country group code (e.g., "IND").
        shape_type (str, optional): Administrative level designation.
        geometry (geoalchemy2.elements.WKBElement): PostGIS MultiPolygon geometry 
            data for the taluka boundary, with spatial indexing enabled.
    """
    __tablename__ = "gujarat_talukas"

    id = Column(Integer, primary_key=True, index=True)

    # ── Taluka identification ─────────────────────────────────────────────────
    taluka_name     = Column(String, nullable=False, index=True)
    taluka_lgd_code = Column(String, nullable=True, index=True)

    # ── Parent district (denormalised for fast lookups/joins/filters) ─────────
    district_name     = Column(String, nullable=False, index=True)
    district_lgd_code = Column(String, nullable=True, index=True)

    # ── State info ────────────────────────────────────────────────────────────
    state_name     = Column(String, nullable=False, default="Gujarat")
    state_lgd_code = Column(String, nullable=True)

    # ── Source metadata (mirrors GujaratDistrict/GujaratBoundary shape) ───────
    shape_iso   = Column(String, nullable=True)   # e.g., "IN-GJ"
    shape_group = Column(String, nullable=True)   # "IND"
    shape_type  = Column(String, nullable=True)  

    # ── Geometry ──────────────────────────────────────────────────────────────
    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    # ── Table Arguments & Composite Indexes ───────────────────────────────────
    __table_args__ = (
        # Composite index to optimize queries filtering by both district and taluka
        Index("ix_gujarat_talukas_district_taluka", "district_name", "taluka_name"),
    )
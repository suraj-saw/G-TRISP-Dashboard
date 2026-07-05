# backend/app/models/gujarat_taluka.py
"""
Stores Gujarat Taluka (Subdistrict) boundaries — the administrative level
directly beneath District:

    State (Gujarat) → District → Taluka → (future: Village/Ward)

Mirrors GujaratDistrict's structure so the same spatial-query, seeding and
API patterns extend cleanly to this (and any future) admin level.
"""

from sqlalchemy import Column, Integer, String, Index
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratTaluka(Base):
    __tablename__ = "gujarat_talukas"

    id = Column(Integer, primary_key=True, index=True)

    # ── Taluka identification ────────────────────────────────────────────
    taluka_name     = Column(String, nullable=False, index=True)
    taluka_lgd_code = Column(String, nullable=True, index=True)

    # ── Parent district (denormalised for fast lookups/joins/filters) ────
    district_name     = Column(String, nullable=False, index=True)
    district_lgd_code = Column(String, nullable=True, index=True)

    # ── State info ────────────────────────────────────────────────────────
    state_name     = Column(String, nullable=False, default="Gujarat")
    state_lgd_code = Column(String, nullable=True)

    # ── Source metadata (mirrors GujaratDistrict/GujaratBoundary shape) ──
    shape_iso   = Column(String, nullable=True)   # e.g. "IN-GJ"
    shape_group = Column(String, nullable=True)   # "IND"
    shape_type  = Column(String, nullable=True)   # "ADM3"

    # ── Geometry ──────────────────────────────────────────────────────────
    geometry = Column(
        Geometry(
            geometry_type="MULTIPOLYGON",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_gujarat_talukas_district_taluka", "district_name", "taluka_name"),
    )
"""Gujarat road linework stored for future spatial/network analysis."""

from __future__ import annotations

from sqlalchemy import Column, Integer, String, Index
from sqlalchemy.dialects.postgresql import JSONB
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class GujaratRoad(Base):
    """
    SQLAlchemy model representing road linework for Gujarat state.

    Stores linear spatial geometry (LINESTRING) for road segments along with
    metadata and unstructured properties extracted from source GeoJSON. Intended
    for future spatial analysis and network-based accident correlation queries.

    Attributes:
        id (int): Primary key and indexed identifier for the road segment record.
        road_source_id (str): Stable identifier derived from the source GeoJSON properties.
        road_name (str, optional): Human-readable name for the road (if available in source data).
        road_classification (str, optional): Functional classification of the road (e.g., NH, SH, MDR).
        road_type (str, optional): Type of road surface or infrastructure (e.g., Paved, Unpaved).
        properties (dict, optional): Unstructured JSONB storage for extra/un-modeled properties
            from the source GeoJSON feature.
        geometry (geoalchemy2.elements.WKBElement): PostGIS LINESTRING geometry for the road segment,
            with spatial indexing enabled.
    """
    __tablename__ = "gujarat_roads"

    id = Column(Integer, primary_key=True, index=True)

    # Stable identifier derived from source GeoJSON properties (or a fallback)
    road_source_id = Column(String, nullable=False, index=True)

    # Common/tolerant attributes (best-effort extraction from properties)
    road_name = Column(String, nullable=True, index=True)
    road_classification = Column(String, nullable=True, index=True)
    road_type = Column(String, nullable=True, index=True)

    # Extra/un-modeled properties from the feature (JSONB for flexible schema)
    properties = Column(JSONB, nullable=True, default=None)

    # ── Geometry ──────────────────────────────────────────────────────────────
    # Stored as LINESTRING per source data requirements, enabling spatial queries
    # like "find accidents within X meters of road Y"
    geometry = Column(
        Geometry(
            geometry_type="LINESTRING",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    # ── Composite Indexes ─────────────────────────────────────────────────────
    # Optimizes combined queries filtering by both road name and classification
    __table_args__ = (
        Index(
            "ix_gujarat_roads_name_class",
            "road_name",
            "road_classification",
        ),
    )


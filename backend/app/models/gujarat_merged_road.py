# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Index
# pyrefly: ignore [missing-import]
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID

class GujaratMergedRoad(Base):
    """
    SQLAlchemy model representing merged road linework for Gujarat state.

    Stores polygonal spatial geometry (MULTIPOLYGON) representing merged buffers
    of parallel lanes for roads with the same name and classification.
    """
    __tablename__ = "gujarat_merged_roads"

    id = Column(Integer, primary_key=True, index=True)
    
    # Tolerant attributes for grouping
    road_name = Column(String, nullable=True, index=True)
    road_classification = Column(String, nullable=True, index=True)
    road_type = Column(String, nullable=True)

    # ── Geometry ──────────────────────────────────────────────────────────────
    # Stored as MULTILINESTRING (the merged linework acting as clean OSM lines)
    geometry = Column(
        Geometry(
            geometry_type="MULTILINESTRING",
            srid=POSTGIS_SRID,
            spatial_index=True,
        ),
        nullable=False,
    )

    # ── Composite Indexes ─────────────────────────────────────────────────────
    __table_args__ = (
        Index(
            "ix_gujarat_merged_roads_name_class",
            "road_name",
            "road_classification",
        ),
    )

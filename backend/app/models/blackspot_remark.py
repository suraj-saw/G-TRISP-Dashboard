# backend/app/models/blackspot_remark.py

"""
SQLAlchemy model for blackspot remarks/annotations.

Allows users to attach textual remarks to blackspot clusters, anchored by
the deterministic SHA-256 hash of their constituent crash IDs. This design
ensures remarks persist even when blackspot `bs_id` numbering changes due
to filter or parameter modifications.
"""

# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Float, Text, DateTime, ForeignKey
# pyrefly: ignore [missing-import]
from sqlalchemy.sql import func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship
# pyrefly: ignore [missing-import]
from geoalchemy2 import Geometry

from app.database import Base
from app.core.config import POSTGIS_SRID


class BlackspotRemark(Base):
    """
    Persists user-authored remarks on blackspot clusters.

    Attributes:
        id (int): Auto-incrementing primary key.
        crash_ids_hash (str): SHA-256 hex digest of sorted, comma-joined crash
            DB IDs — serves as the stable lookup key for the cluster.
        crash_ids (str): Full sorted, comma-joined list of accident DB IDs for
            reference and fuzzy matching.
        visualization_type (str): The blackspot algorithm type that produced
            the cluster (e.g., "blackspot", "irc_greedy_blackspot").
        district (str): District name at the time the remark was created.
        centroid_lat (float): Latitude of the cluster centroid.
        centroid_lon (float): Longitude of the cluster centroid.
        remark (str): The user-authored remark text.
        created_by (int): FK to the user who created the remark.
        updated_by (int): FK to the user who last updated the remark.
        created_at (datetime): Timestamp of creation.
        updated_at (datetime): Timestamp of last update.
    """
    __tablename__ = "blackspot_remarks"

    # Core identification
    id = Column(Integer, primary_key=True, index=True)

    # Cluster fingerprint — deterministic hash of sorted crash IDs (non-unique to support timeline)
    crash_ids_hash = Column(String(64), index=True, nullable=False)
    crash_ids = Column(Text, nullable=False)

    # Context at creation time
    visualization_type = Column(String(50), nullable=False)
    district = Column(String(100), nullable=True)
    centroid_lat = Column(Float, nullable=False)
    centroid_lon = Column(Float, nullable=False)
    geom = Column(
        Geometry(geometry_type="POINT", srid=POSTGIS_SRID, spatial_index=True),
        nullable=True,
    )

    # The remark content
    remark = Column(Text, nullable=False)

    # Authorship tracking
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Audit timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships (for convenience in queries)
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])

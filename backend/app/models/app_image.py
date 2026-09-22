# backend/app/models/app_image.py

"""
SQLAlchemy model for storing application images and branding assets.

Allows storing binary image assets (e.g. logos, emblems, banners) directly
in the database with metadata such as key identifier, MIME type, dimensions,
and categorization.
"""

# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, Text, LargeBinary, Boolean, DateTime
# pyrefly: ignore [missing-import]
from sqlalchemy.sql import func

from app.database import Base


class AppImage(Base):
    """
    Persists branding and application images directly in PostgreSQL.

    Attributes:
        id (int): Primary key.
        key (str): Unique identifier/slug for programmatic retrieval (e.g., 'logo_primary').
        name (str): Human-readable name/title for the asset.
        description (str): Optional context or usage notes.
        category (str): Classification (e.g., 'logo', 'emblem', 'banner', 'icon').
        mime_type (str): Media MIME type (e.g., 'image/png', 'image/jpeg', 'image/svg+xml').
        width (int): Image width in pixels.
        height (int): Image height in pixels.
        file_size (int): Size of the image payload in bytes.
        image_data (bytes): Raw binary data of the image (PostgreSQL BYTEA).
        is_active (bool): Flag indicating if the image is active.
        created_at (datetime): Creation timestamp.
        updated_at (datetime): Last modification timestamp.
    """
    __tablename__ = "app_images"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=False, default="logo", index=True)
    mime_type = Column(String(50), nullable=False, default="image/png")
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    file_size = Column(Integer, nullable=True)
    image_data = Column(LargeBinary, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

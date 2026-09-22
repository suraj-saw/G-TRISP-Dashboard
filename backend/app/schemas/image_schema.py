# backend/app/schemas/image_schema.py

"""
Pydantic schemas for Application Image / Branding assets.
"""

from datetime import datetime
from typing import Optional
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, ConfigDict


class ImageMetadataResponse(BaseModel):
    """
    Metadata representation of an image asset stored in the database.
    """
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    description: Optional[str] = None
    category: str
    mime_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    url: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

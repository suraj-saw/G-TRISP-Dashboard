# backend/app/routes/images.py

"""
Images & Branding Assets API Router.

Serves application images (logos, emblems, banners) directly from the
PostgreSQL database (`app_images` table) with high-performance caching headers.
Also provides metadata discovery and administration capabilities.
"""

import logging
from typing import List, Optional
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Response, UploadFile, File, Form
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
import io

from app.database import get_db
from app.models.app_image import AppImage
from app.schemas.image_schema import ImageMetadataResponse

logger = logging.getLogger("app.routes.images")

router = APIRouter(
    prefix="/api/images",
    tags=["Images & Branding Assets"],
)


@router.api_route(
    "/{key}",
    methods=["GET", "HEAD"],
    summary="Retrieve an image by unique key",
    description="Streams the binary image data directly from the database with caching headers.",
    responses={
        200: {
            "content": {
                "image/png": {},
                "image/jpeg": {},
                "image/svg+xml": {},
                "image/webp": {},
            },
            "description": "Returns raw image binary stream.",
        },
        404: {"description": "Image key not found or inactive."},
    },
)
def get_image_by_key(key: str, db: Session = Depends(get_db)):
    """Fetch binary image bytes by its unique slug/key."""
    image_record = (
        db.query(AppImage)
        .filter(AppImage.key == key, AppImage.is_active == True)
        .first()
    )

    if not image_record or not image_record.image_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image with key '{key}' not found or is inactive.",
        )

    # Cache for 24 hours (86400s) with revalidation tag
    headers = {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "Content-Disposition": f'inline; filename="{image_record.key}.png"',
    }
    if image_record.updated_at:
        headers["ETag"] = f'"{int(image_record.updated_at.timestamp())}"'

    return Response(
        content=bytes(image_record.image_data),
        media_type=image_record.mime_type or "image/png",
        headers=headers,
    )


@router.get(
    "/id/{image_id}",
    summary="Retrieve an image by database ID",
    description="Streams the binary image data directly from the database by numerical ID.",
)
def get_image_by_id(image_id: int, db: Session = Depends(get_db)):
    """Fetch binary image bytes by numerical ID."""
    image_record = (
        db.query(AppImage)
        .filter(AppImage.id == image_id, AppImage.is_active == True)
        .first()
    )

    if not image_record or not image_record.image_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image ID '{image_id}' not found.",
        )

    headers = {
        "Cache-Control": "public, max-age=86400",
        "Content-Disposition": f'inline; filename="{image_record.key}.png"',
    }

    return Response(
        content=bytes(image_record.image_data),
        media_type=image_record.mime_type or "image/png",
        headers=headers,
    )


@router.get(
    "",
    response_model=List[ImageMetadataResponse],
    summary="List available images and logos",
    description="Returns metadata for all registered branding images stored in the database.",
)
def list_images(category: Optional[str] = None, db: Session = Depends(get_db)):
    """List metadata for stored images."""
    query = db.query(AppImage).filter(AppImage.is_active == True)
    if category:
        query = query.filter(AppImage.category == category)

    images = query.order_by(AppImage.id.asc()).all()

    return [
        ImageMetadataResponse(
            id=img.id,
            key=img.key,
            name=img.name,
            description=img.description,
            category=img.category,
            mime_type=img.mime_type,
            width=img.width,
            height=img.height,
            file_size=img.file_size,
            url=f"/api/images/{img.key}",
            is_active=img.is_active,
            created_at=img.created_at,
            updated_at=img.updated_at,
        )
        for img in images
    ]

# backend/app/seed/seed_logos.py

"""
Script to seed custom logos into the app_images database table.

Reads image files from backend/data/logos/ (or /app/data/logos/), inspects
their dimensions using PIL, and inserts/updates them in the PostgreSQL database.
"""

import os
import sys
import logging
# pyrefly: ignore [missing-import]
from PIL import Image
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.database import engine, SessionLocal, Base
from app.models.app_image import AppImage

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("seed_logos")

# Search candidate directories for logos
CANDIDATE_DIRS = [
    "/app/data/logos",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "logos"),
    os.path.join(os.getcwd(), "backend", "data", "logos"),
    os.path.join(os.getcwd(), "data", "logos"),
]

LOGO_DEFINITIONS = [
    {
        "filename": "astra_topbar_brand.png",
        "key": "astra_topbar_brand",
        "name": "ASTRA TopBar Brand Logo",
        "description": "Unified navbar brand logo lockup with stylized ASTRA roadway, bar chart, and bridge graphics.",
        "category": "logo",
        "mime_type": "image/png",
    },
    {
        "filename": "astra_logo_transparent.png",
        "key": "astra_logo_transparent",
        "name": "ASTRA Transparent Logo",
        "description": "Horizontal ASTRA brand logo with clean transparent background for the dashboard landing and home page.",
        "category": "logo",
        "mime_type": "image/png",
    },
    {
        "filename": "astra_logo_emblem.png",
        "key": "astra_logo_emblem",
        "name": "ASTRA Circular Emblem Logo",
        "description": "Circular badge emblem featuring Gujarat map boundary outline, highway curve with map pins, speedometer gauge arcs, and Hindi script.",
        "category": "logo",
        "mime_type": "image/png",
    },
    {
        "filename": "gujarat_police_logo.png",
        "key": "gujarat_police_logo",
        "name": "Gujarat Police Logo",
        "description": "Gujarat Police Western Railway emblem.",
        "category": "logo",
        "mime_type": "image/png",
    },
]


def resolve_logo_dir() -> str:
    for d in CANDIDATE_DIRS:
        if os.path.isdir(d):
            return d
    raise FileNotFoundError(f"Could not find logos directory in candidates: {CANDIDATE_DIRS}")


def seed_logos():
    logger.info("Ensuring app_images table exists...")
    Base.metadata.create_all(bind=engine)

    logo_dir = resolve_logo_dir()
    logger.info("Loading logos from: %s", logo_dir)

    db: Session = SessionLocal()
    try:
        inserted_count = 0
        updated_count = 0

        for item in LOGO_DEFINITIONS:
            file_path = os.path.join(logo_dir, item["filename"])
            if not os.path.isfile(file_path):
                logger.warning("File not found: %s, skipping.", file_path)
                continue

            # Read binary content
            with open(file_path, "rb") as f:
                image_bytes = f.read()

            file_size = len(image_bytes)

            # Inspect dimensions
            width, height = None, None
            try:
                with Image.open(file_path) as img:
                    width, height = img.size
            except Exception as e:
                logger.warning("Could not read dimensions for %s: %s", item["filename"], e)

            # Check if key already exists
            existing = db.query(AppImage).filter(AppImage.key == item["key"]).first()

            if existing:
                existing.name = item["name"]
                existing.description = item["description"]
                existing.category = item["category"]
                existing.mime_type = item["mime_type"]
                existing.width = width
                existing.height = height
                existing.file_size = file_size
                existing.image_data = image_bytes
                existing.is_active = True
                updated_count += 1
                logger.info("Updated existing image: key='%s' (%d bytes, %sx%s)", item["key"], file_size, width, height)
            else:
                new_image = AppImage(
                    key=item["key"],
                    name=item["name"],
                    description=item["description"],
                    category=item["category"],
                    mime_type=item["mime_type"],
                    width=width,
                    height=height,
                    file_size=file_size,
                    image_data=image_bytes,
                    is_active=True,
                )
                db.add(new_image)
                inserted_count += 1
                logger.info("Inserted new image: key='%s' (%d bytes, %sx%s)", item["key"], file_size, width, height)

        db.commit()
        logger.info("Seeding complete. Inserted: %d, Updated: %d", inserted_count, updated_count)

    except Exception as e:
        db.rollback()
        logger.error("Failed to seed logos: %s", e)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_logos()

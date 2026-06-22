# backend/app/seed/seed_geo.py
"""
Master GeoSeeder
================
Runs all geospatial seed operations in the correct dependency order:

  1. Gujarat state boundary  (gujarat_boundary table)
  2. Gujarat district polygons (gujarat_districts table)

Usage:
  python -m app.seed.seed_geo           # skip if already seeded
  python -m app.seed.seed_geo --force   # drop and re-seed everything

Called from app startup (lifespan) or CI pipelines.
"""

import argparse
import logging
import sys
from pathlib import Path

# Make sure the backend root is on the Python path when running directly
_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.seed.seed_gujarat_boundary  import seed_gujarat_boundary
from app.seed.seed_gujarat_districts import seed_gujarat_districts
from app.utils.coordinate_validator   import check_validation_tables_ready
from app.database import SessionLocal

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_geo")


def run_geo_seeds(force: bool = False) -> None:
    """Seed boundary then districts, then verify readiness."""

    logger.info("=== GeoSeed pipeline started (force=%s) ===", force)

    # 1. State boundary
    logger.info("Step 1/2 — seeding Gujarat state boundary …")
    seed_gujarat_boundary(force=force)

    # 2. District polygons
    logger.info("Step 2/2 — seeding Gujarat district polygons …")
    seed_gujarat_districts(force=force)

    # 3. Quick readiness check
    db = SessionLocal()
    try:
        status = check_validation_tables_ready(db)
        if status["ready"]:
            logger.info(
                "✓ Validation tables ready — boundary rows: %d, district rows: %d",
                status["boundary_rows"],
                status["district_rows"],
            )
        else:
            logger.warning(
                "⚠ Validation tables NOT fully populated — "
                "boundary rows: %d, district rows: %d",
                status["boundary_rows"],
                status["district_rows"],
            )
    finally:
        db.close()

    logger.info("=== GeoSeed pipeline complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed all geospatial reference data.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Drop existing geo rows and re-seed from GeoJSON files.",
    )
    args = parser.parse_args()
    run_geo_seeds(force=args.force)
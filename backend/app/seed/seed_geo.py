# backend/app/seed/seed_geo.py
"""
Master Seed Pipeline
====================
Runs all seed operations in the correct dependency order:

  1. Gujarat state boundary   (gujarat_boundary table)
  2. Gujarat district polygons (gujarat_districts table)
  3. Accident records          (accidents table)

Usage:
    python -m app.seed.seed_geo                     # skip if already seeded
    python -m app.seed.seed_geo --force             # re-seed everything
    python -m app.seed.seed_geo --accidents-only    # only seed accidents
    python -m app.seed.seed_geo --skip-validation   # skip PostGIS coord check

Called from app startup (lifespan) or directly from CLI / CI.
"""

import argparse
import logging
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.seed.seed_gujarat_boundary  import seed_gujarat_boundary
from app.seed.seed_gujarat_districts import seed_gujarat_districts
from app.seed.seed_accidents         import seed_accidents
from app.utils.coordinate_validator  import check_validation_tables_ready
from app.database import SessionLocal
from app.seed.seed_surat_boundary import seed_surat_boundary
from app.seed.seed_gujarat_talukas import seed_gujarat_talukas

# Roads seeding is optional: the roads file may not exist in all deployments.
try:
    from app.seed.seed_gujarat_roads import seed_gujarat_roads
except Exception:  # pragma: no cover
    seed_gujarat_roads = None


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_geo")


def run_geo_seeds(
    force: bool = False,
    accidents_only: bool = False,
    skip_validation: bool = False,
) -> None:
    """
    Run the full seed pipeline.

    Parameters
    ----------
    force            : Drop existing rows and re-seed all tables.
    accidents_only   : Skip geo seeds; only seed accident records.
                       Useful after geo seeds are already populated.
    skip_validation  : Skip PostGIS coordinate validation for accidents.
    """
    logger.info("=== Seed pipeline started (force=%s, accidents_only=%s) ===", force, accidents_only)

    if not accidents_only:
        # 1. State boundary
        logger.info("Step 1/3 — seeding Gujarat state boundary …")
        seed_gujarat_boundary(force=force)

        # 2. District polygons
        logger.info("Step 2/3 — seeding Gujarat district polygons …")
        seed_gujarat_districts(force=force)

        # 2.5 Surat district boundary
        logger.info("Step 2.5/3 — seeding Surat district boundary …")
        seed_surat_boundary(force=force)

        logger.info("Step 2.6/3 — seeding Gujarat taluka (subdistrict) boundaries …")
        seed_gujarat_talukas(force=force)

        # Quick readiness check before accident seeding
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
                    "boundary: %d rows, districts: %d rows. "
                    "Accident seeding will skip PostGIS validation.",
                    status["boundary_rows"],
                    status["district_rows"],
                )
                # Force skip-validation if geo tables are empty
                skip_validation = True
        finally:
            db.close()
    else:
        logger.info("accidents_only=True — skipping geo boundary/district seeds.")

    # 3. Accident records
    logger.info("Step %s — seeding accident records …", "3/3" if not accidents_only else "1/1")
    seed_accidents(force=force, skip_validation=skip_validation)

    # 4. Roads (optional)
    if seed_gujarat_roads is not None:
        try:
            logger.info("Step 4/4 — seeding Gujarat roads …")
            seed_gujarat_roads(force=force)
        except FileNotFoundError:
            logger.warning("⚠ Gujarat roads GeoJSONL not found — skipping roads seeding.")

    logger.info("=== Seed pipeline complete ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the full G-TRISP data seed pipeline."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Drop existing rows and re-seed all tables.",
    )
    parser.add_argument(
        "--accidents-only",
        action="store_true",
        help="Skip geo boundary/district seeds; only seed accident records.",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip PostGIS coordinate validation for accident records.",
    )
    args = parser.parse_args()

    run_geo_seeds(
        force=args.force,
        accidents_only=args.accidents_only,
        skip_validation=args.skip_validation,
    )